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
  totalLegendOrBattlefieldNeeded,
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
  /** The cube's main section. Never includes legends or battlefields. */
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

/**
 * Deals every pack for a draft.
 *
 * Blocks rather than improvises when the main pool is too small: a draft that
 * silently ran short packs would look like a bug in the engine to whoever hit
 * it, and the cube owner can fix it by adding cards. Running short of legends
 * or battlefields is different — those sections are small by nature and a cube
 * with none is still a legitimate cube (see "Runes are optional content"), so
 * that fills from main and says so.
 */
export function generatePacks(
  config: DraftConfig,
  pools: DraftPools,
  seed: string,
): PackGenerationResult {
  const warnings: string[] = [];

  const mainNeeded = totalMainCardsNeeded(config);
  const mainAvailable = expandPool(pools.main);
  if (mainAvailable.length < mainNeeded) {
    return {
      ok: false,
      error:
        `This cube's main section has ${mainAvailable.length} ` +
        `${mainAvailable.length === 1 ? "card" : "cards"}, but a ${config.seats}-seat ` +
        `draft of ${config.packsPerPlayer} packs needs ${mainNeeded} ` +
        `(${config.seats} seats × ${config.packsPerPlayer} packs × ` +
        `${mainSlotsPerPack(config)} cards). Add ${mainNeeded - mainAvailable.length} ` +
        `more to the main section to draft it.`,
    };
  }

  const rng = createRng(seed, "packs");
  const mainDeck = shuffle(mainAvailable, rng);
  const legendDeck = shuffle(expandPool(pools.legends), createRng(seed, "legends"));
  const battlefieldDeck = shuffle(
    expandPool(pools.battlefields),
    createRng(seed, "battlefields"),
  );

  const lbNeeded = totalLegendOrBattlefieldNeeded(config);
  const lbAvailable = legendDeck.length + battlefieldDeck.length;
  if (lbAvailable === 0) {
    warnings.push(
      `This cube has no legends or battlefields, so every pack is ${config.packSize} ` +
        `cards from the main section instead of ${mainSlotsPerPack(config)} plus a ` +
        `Legend-or-Battlefield.`,
    );
  } else if (lbAvailable < lbNeeded) {
    warnings.push(
      `This cube has ${lbAvailable} legend/battlefield ` +
        `${lbAvailable === 1 ? "card" : "cards"} but the draft has ${lbNeeded} such ` +
        `slots, so ${lbNeeded - lbAvailable} of them are filled from the main section.`,
    );
  }

  // A shortfall in the L/B sections is drawn from main, so main has to cover
  // both its own slots and the gap before any pack is dealt.
  const fallbackNeeded = Math.max(0, lbNeeded - lbAvailable);
  if (mainAvailable.length < mainNeeded + fallbackNeeded) {
    return {
      ok: false,
      error:
        `This cube needs ${mainNeeded + fallbackNeeded} main-section cards to fill ` +
        `${config.seats} seats × ${config.packsPerPlayer} packs (including ` +
        `${fallbackNeeded} filling for missing legends/battlefields), but has ` +
        `${mainAvailable.length}.`,
    };
  }

  const packs: PackGrid = [];
  let mainCursor = 0;
  let legendCursor = 0;
  let battlefieldCursor = 0;

  for (let round = 0; round < config.packsPerPlayer; round++) {
    const roundPacks: DraftCard[][] = [];
    for (let seat = 0; seat < config.seats; seat++) {
      const pack: DraftCard[] = [];

      for (let slot = 0; slot < config.legendOrBattlefieldSlots; slot++) {
        const takeLegend = () =>
          legendCursor < legendDeck.length ? legendDeck[legendCursor++] : undefined;
        const takeBattlefield = () =>
          battlefieldCursor < battlefieldDeck.length
            ? battlefieldDeck[battlefieldCursor++]
            : undefined;

        // 50/50 per pack; if that section is exhausted take the other, and if
        // both are, fall back to main (already accounted for above).
        const preferLegend = createRng(seed, "lb", round, seat, slot).next() < 0.5;
        const taken = preferLegend
          ? (takeLegend() ?? takeBattlefield())
          : (takeBattlefield() ?? takeLegend());

        pack.push(taken ?? mainDeck[mainCursor++]);
      }

      for (let slot = 0; slot < mainSlotsPerPack(config); slot++) {
        pack.push(mainDeck[mainCursor++]);
      }

      // Shuffle within the pack so the guaranteed slot isn't always first.
      roundPacks.push(shuffle(pack, createRng(seed, "pack", round, seat)));
    }
    packs.push(roundPacks);
  }

  return { ok: true, packs, warnings };
}
