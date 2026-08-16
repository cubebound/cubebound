/**
 * Building the packs a draft is dealt from.
 *
 * Dealing is **without replacement across the entire draft**, respecting
 * quantity: a cube holding two copies of a card can put it in at most two
 * packs, anywhere in the draft. Copies are expanded into individual entries
 * before shuffling, so quantity is enforced by construction rather than by a
 * counter someone has to remember to decrement.
 */

import {
  mainSlotsPerPack,
  totalBattlefieldsNeeded,
  totalLegendOrBattlefieldNeeded,
  totalLegendsNeeded,
  totalMainCardsNeeded,
  type DraftConfig,
} from "./config";
import { createRng, shuffle } from "./rng";

/** The card identity a draft carries around. */
export interface DraftCard {
  id: string;
  name: string;
  type: string;
  domains: string[];
}

/** One cube row: a card and how many copies the cube holds in that section. */
export interface PoolEntry {
  card: DraftCard;
  quantity: number;
}

export interface DraftPools {
  /** The cube's main section. Legends and battlefields filed here are dropped
   *  before dealing unless the config shuffles them in — see `buildMainPool`. */
  main: PoolEntry[];
  legends: PoolEntry[];
  battlefields: PoolEntry[];
}

export type PackGrid = DraftCard[][][];

export interface GeneratedPacks {
  /** round -> seat -> the pack's cards. */
  packs: PackGrid;
  /** Non-fatal notes to show before the draft starts. */
  warnings: string[];
}

export type PackGenerationResult =
  | ({ ok: true } & GeneratedPacks)
  | { ok: false; error: string };

/** One entry per physical copy, so quantity cannot be exceeded downstream. */
export function expandPool(entries: PoolEntry[]): DraftCard[] {
  const copies: DraftCard[] = [];
  for (const entry of entries) {
    const quantity = Math.max(0, Math.floor(entry.quantity));
    for (let i = 0; i < quantity; i++) copies.push(entry.card);
  }
  return copies;
}

/** Types that reach a pack only through a reserved slot, unless shuffled in. */
const RESERVED_TYPES = new Set(["Legend", "Battlefield"]);

export interface MainPool {
  pool: PoolEntry[];
  /** Strays dropped: the type is reserved, so a copy filed in `main` would make
   *  the guaranteed count wrong. */
  removed: number;
  /** Sections folded in wholesale because the config shuffles that type. */
  shuffledIn: string[];
}

/**
 * What the ordinary main slots deal from.
 *
 * Two opposite jobs, which are the same rule seen from either side. A card's
 * *section* is the owner's filing decision and nothing stops them putting a
 * legend in `main`; a card's *type* is what it is. When a type is **reserved**,
 * type wins and strays are dropped — the reserved slots exist so that type turns
 * up a known number of times per pack, and a stray makes that number a lie. When
 * a type is **shuffled**, there is no number to protect, so its whole section
 * joins the pile and any strays stay where they are.
 *
 * What it removed and what it folded in are both returned, so the caller can say
 * so rather than silently changing what a cube drafts.
 */
export function buildMainPool(pools: DraftPools, config: DraftConfig): MainPool {
  const shuffledTypes = new Set<string>();
  const shuffledIn: string[] = [];
  const extra: PoolEntry[] = [];

  if (config.shuffleLegendsIntoPacks) {
    shuffledTypes.add("Legend");
    if (pools.legends.length > 0) shuffledIn.push("legends");
    extra.push(...pools.legends);
  }
  if (config.shuffleBattlefieldsIntoPacks) {
    shuffledTypes.add("Battlefield");
    if (pools.battlefields.length > 0) shuffledIn.push("battlefields");
    extra.push(...pools.battlefields);
  }

  const kept = pools.main.filter(
    (entry) => !RESERVED_TYPES.has(entry.card.type) || shuffledTypes.has(entry.card.type),
  );
  return { pool: [...kept, ...extra], removed: pools.main.length - kept.length, shuffledIn };
}

/**
 * Deals every pack for a draft.
 *
 * Blocks rather than improvises when the main pool is too small: a draft that
 * silently ran short packs would look like a bug in the engine to whoever hit
 * it, and the cube owner can fix it by adding cards. Running short of legends
 * or battlefields is different — those sections are small by nature and a cube
 * with none is still a legitimate cube (see "Runes are optional content") — so
 * those slots fall back to main and say so.
 *
 * **A dedicated slot never substitutes the other type.** Ask for a legend slot
 * and the cube is out of legends, and it fills from main rather than handing
 * you a battlefield: you asked for a legend. Only the explicit
 * legend-or-battlefield slot swaps between them, which is the whole point of it.
 */
export function generatePacks(
  config: DraftConfig,
  pools: DraftPools,
  seed: string,
): PackGenerationResult {
  const warnings: string[] = [];

  const { pool: mainPool, removed, shuffledIn } = buildMainPool(pools, config);
  if (shuffledIn.length > 0) {
    warnings.push(
      `This cube's ${shuffledIn.join(" and ")} are shuffled into the packs rather than ` +
        `reserved, so they turn up wherever the shuffle puts them.`,
    );
  }
  if (removed > 0) {
    warnings.push(
      `${removed} legend/battlefield ${removed === 1 ? "card is" : "cards are"} filed in ` +
        `this cube's main section. Those types are dealt only through reserved slots, so ` +
        `${removed === 1 ? "it was" : "they were"} left out of the main pool.`,
    );
  }

  const mainAvailable = expandPool(mainPool);
  // A shuffled type has already been folded into main, so its reserved deck is
  // empty by construction — nothing can be dealt from both.
  const legendDeck = config.shuffleLegendsIntoPacks
    ? []
    : shuffle(expandPool(pools.legends), createRng(seed, "legends"));
  const battlefieldDeck = config.shuffleBattlefieldsIntoPacks
    ? []
    : shuffle(expandPool(pools.battlefields), createRng(seed, "battlefields"));

  const mainNeeded = totalMainCardsNeeded(config);
  const legendsNeeded = totalLegendsNeeded(config);
  const battlefieldsNeeded = totalBattlefieldsNeeded(config);
  const lbNeeded = totalLegendOrBattlefieldNeeded(config);

  // Dedicated slots draw first, so a shortage lands on the flexible slot, which
  // has somewhere else to go, rather than on one that named a type.
  const legendShort = Math.max(0, legendsNeeded - legendDeck.length);
  const battlefieldShort = Math.max(0, battlefieldsNeeded - battlefieldDeck.length);
  const spareForFlexible =
    Math.max(0, legendDeck.length - legendsNeeded) +
    Math.max(0, battlefieldDeck.length - battlefieldsNeeded);
  const lbShort = Math.max(0, lbNeeded - spareForFlexible);

  const shortfall = (kind: string, need: number, have: number, short: number) =>
    `This cube has ${have} ${kind} ${have === 1 ? "card" : "cards"} but the draft ` +
    `reserves ${need} ${kind} ${need === 1 ? "slot" : "slots"}, so ${short} of them ` +
    `${short === 1 ? "is" : "are"} filled from the main section instead.`;

  if (legendShort > 0) {
    warnings.push(shortfall("legend", legendsNeeded, legendDeck.length, legendShort));
  }
  if (battlefieldShort > 0) {
    warnings.push(
      shortfall("battlefield", battlefieldsNeeded, battlefieldDeck.length, battlefieldShort),
    );
  }
  if (lbShort > 0) {
    warnings.push(
      `This cube has ${spareForFlexible} legend/battlefield ` +
        `${spareForFlexible === 1 ? "card" : "cards"} left for ${lbNeeded} ` +
        `legend-or-battlefield ${lbNeeded === 1 ? "slot" : "slots"}, so ${lbShort} of ` +
        `${lbShort === 1 ? "them is" : "them are"} filled from the main section instead.`,
    );
  }

  // Every reserved slot that cannot be filled becomes a main card, so main has
  // to cover its own slots and the whole gap before any pack is dealt.
  const fallbackNeeded = legendShort + battlefieldShort + lbShort;
  const mainTotal = mainNeeded + fallbackNeeded;
  if (mainAvailable.length < mainTotal) {
    return {
      ok: false,
      error:
        `This cube's main section has ${mainAvailable.length} ` +
        `${mainAvailable.length === 1 ? "card" : "cards"}, but a ${config.seats}-seat ` +
        `draft of ${config.packsPerPlayer} packs needs ${mainTotal}` +
        (fallbackNeeded > 0
          ? ` (${mainNeeded} main, plus ${fallbackNeeded} filling for missing ` +
            `legends or battlefields)`
          : ` (${config.seats} seats × ${config.packsPerPlayer} packs × ` +
            `${mainSlotsPerPack(config)} cards)`) +
        `. Add ${mainTotal - mainAvailable.length} more cards, or reserve fewer slots.`,
    };
  }

  const mainDeck = shuffle(mainAvailable, createRng(seed, "packs"));

  const packs: PackGrid = [];
  let mainCursor = 0;
  let legendCursor = 0;
  let battlefieldCursor = 0;

  const takeLegend = () =>
    legendCursor < legendDeck.length ? legendDeck[legendCursor++] : undefined;
  const takeBattlefield = () =>
    battlefieldCursor < battlefieldDeck.length
      ? battlefieldDeck[battlefieldCursor++]
      : undefined;
  const takeMain = () => mainDeck[mainCursor++];

  for (let round = 0; round < config.packsPerPlayer; round++) {
    const roundPacks: DraftCard[][] = [];
    for (let seat = 0; seat < config.seats; seat++) {
      const pack: DraftCard[] = [];

      // Dedicated slots: the named type, or main. Never the other type.
      for (let slot = 0; slot < config.legendSlots; slot++) {
        pack.push(takeLegend() ?? takeMain());
      }
      for (let slot = 0; slot < config.battlefieldSlots; slot++) {
        pack.push(takeBattlefield() ?? takeMain());
      }

      // The flexible slot: 50/50, and if that side is spent, take the other.
      for (let slot = 0; slot < config.legendOrBattlefieldSlots; slot++) {
        const preferLegend = createRng(seed, "lb", round, seat, slot).next() < 0.5;
        const taken = preferLegend
          ? (takeLegend() ?? takeBattlefield())
          : (takeBattlefield() ?? takeLegend());
        pack.push(taken ?? takeMain());
      }

      for (let slot = 0; slot < mainSlotsPerPack(config); slot++) {
        pack.push(takeMain());
      }

      // Shuffle within the pack so the reserved slots aren't always first.
      roundPacks.push(shuffle(pack, createRng(seed, "pack", round, seat)));
    }
    packs.push(roundPacks);
  }

  return { ok: true, packs, warnings };
}
