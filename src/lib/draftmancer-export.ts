/**
 * Turning a cube into a Draftmancer Custom Card List.
 *
 * Draftmancer runs multiplayer drafts in the browser and accepts an uploaded
 * cube file. Its **custom card** support is what makes it work for a game it
 * has never heard of: a `[CustomCards]` block defines cards by name, type and
 * image URL, and the sheets below reference them by name. Cubecana already
 * runs Lorcana cubes through it this way. Since our own drafting is solo
 * against deliberately dumb bots, this is how a cube gets drafted by eight
 * actual people today.
 *
 * The file has four parts and the order matters — `[CustomCards]` must come
 * first, and `[Settings]` before the sheets:
 *
 * ```
 * [CustomCards]
 * [ { "name": ..., "mana_cost": ..., "type": ..., "rarity": ... }, ... ]
 * [Settings]
 * { "layouts": { "Default": { "weight": 1, "slots": [ ... ] } } }
 * [Main]
 * 1 Card Name
 * [Legends]
 * 1 Legend Name
 * ```
 *
 * **Sheet lines reference cards by name, so names must be unique**, and that
 * is the one thing in here that can produce a file Draftmancer rejects rather
 * than a file that merely reads oddly. See `draftmancerName`.
 *
 * ## The pack template is ours; the session is Draftmancer's
 *
 * Pack composition comes from the cube's own `DraftConfig` — the same object
 * the solo draft screen produces and `validateDraftConfig` polices — so the two
 * ways of drafting a cube cannot drift into meaning different things. What we
 * deliberately do *not* own is the session: how many people turn up, the pick
 * timer, who is hosting. `boostersPerPlayer` is emitted as a **default** the
 * host can override, and `seats` is used only to work out whether the cube is
 * big enough, never written into the file. Baking in eight seats becomes a lie
 * the moment six people show up.
 *
 * ## What is deliberately not mapped
 *
 * **Domains do not become MTG colors.** Draftmancer's `colors` field takes
 * W/U/B/R/G, and Riftbound has six domains — Fury, Calm, Mind, Body, Chaos and
 * Order. Five slots do not hold six domains, and picking which one to drop, or
 * doubling two up, would be exactly the silent guess `import-list.ts` refuses
 * to make about card names. Domains ride in `subtypes` instead, where they show
 * on the card's type line and cost nothing if a reader ignores them. The
 * consequence is that Draftmancer's bots have no colour signal to read, which
 * is what `rating` is for and why it is the field this export cares most about.
 * It is also why `colorBalance` is switched **off**: it defaults on and tries to
 * put one card of each colour in the largest slot, which here would be
 * balancing against a field no card has.
 *
 * **Power cost does not become mana symbols.** `mana_cost` carries the generic
 * energy cost only (`{3}`); the domain pips have no faithful MTG symbol, so
 * they are written into `oracle_text` where they stay readable. A card with no
 * energy cost at all — every legend, rune and battlefield — gets an empty
 * `mana_cost` rather than `{0}`, because costless is not zero: that distinction
 * is why the analytics curve excludes those cards instead of bucketing them.
 */

import { cardFull } from "./card-images";
import { displayType } from "./cube-analytics";
import { withChampionPrefix } from "./deck-export";
import {
  canUseEitherSlot,
  DEFAULT_DRAFT_CONFIG,
  type DraftConfig,
} from "./draft/config";
import { titleCase } from "./riftbound";
import { rulesTextToPlain } from "./rules-text";

import type { CubeSection } from "./riftbound";

export interface DraftmancerSourceCard {
  id: string;
  name: string;
  champion: string | null;
  type: string;
  supertype: string | null;
  rarity: string;
  /**
   * Rarity of this card's *canonical* printing (`cards.base_id`). Showcase and
   * Promo are printing treatments rather than power tiers, so the rating has to
   * look through them — see `draftmancerRarity`.
   */
  baseRarity: string | null;
  domains: string[];
  energyCost: number | null;
  powerCost: Record<string, number> | null;
  might: number | null;
  rulesText: string | null;
  setCode: string;
  collectorNo: string;
  imageFull: string | null;
  section: CubeSection;
  quantity: number;
}

/**
 * **Draftmancer validates `rarity` against a fixed set and rejects the whole
 * file otherwise**, with `Invalid mandatory property 'rarity' in custom card,
 * must be one of [common, uncommon, rare, mythic, special]`. Its own
 * documentation says the field is optional and unconstrained; the running
 * validator disagrees on both counts, so this is written against the validator.
 * Riftbound's own vocabulary — Epic, Showcase, Promo — is not accepted.
 */
export type DraftmancerRarity = "common" | "uncommon" | "rare" | "mythic" | "special";

/** Our four power tiers onto theirs. Epic is the top of our scale, so it maps
 *  to their top, `mythic`. */
const RIFTBOUND_RARITY: Record<string, DraftmancerRarity> = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "mythic",
};

/**
 * Where a card sits on Draftmancer's scale, looking through printing
 * treatments to the printing that actually carries a power tier.
 *
 * `Showcase` and `Promo` are treatments rather than tiers, and `base_id` is the
 * canonical printing: all 120 showcase rows resolve that way (70 Rare, 42
 * Epic), so a showcase bomb is rated as the bomb it is. Promo mostly does not —
 * 73 of 117 are their own base — and those land on `special`, which is exactly
 * what that value is for.
 */
export function draftmancerRarity(
  card: Pick<DraftmancerSourceCard, "rarity" | "baseRarity">,
): DraftmancerRarity {
  return (
    RIFTBOUND_RARITY[card.rarity?.toLowerCase() ?? ""] ??
    RIFTBOUND_RARITY[card.baseRarity?.toLowerCase() ?? ""] ??
    "special"
  );
}

/**
 * Bot rating, derived from the same resolution as the rarity so the two can
 * never disagree about what a card is.
 *
 * **`special` rates 2, not 0.** Zero is the bottom of Draftmancer's scale
 * rather than an absence, so an unresolvable card would be picked dead last —
 * and there are 339 Promo rows sitting in real cubes. 2 is the middle of the
 * 1–4 range actually in use, so it is neither favoured nor buried.
 */
const RARITY_RATING: Record<DraftmancerRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  mythic: 4,
  special: 2,
};

export function draftmancerRating(
  card: Pick<DraftmancerSourceCard, "rarity" | "baseRarity">,
): number {
  return RARITY_RATING[draftmancerRarity(card)];
}

/**
 * The name Draftmancer will know a card by.
 *
 * Legends are rebuilt as `Kai'Sa, Daughter of the Void`, because the sync
 * stores only the title with the champion in its own column — the same fix
 * `deckListName` makes for text decklists, sharing `withChampionPrefix` so the
 * rule has one definition.
 *
 * **Unlike `deckListName`, promo variant suffixes are kept.** That function
 * strips `(Metal)` so a list re-imports into other builders, which is right
 * there and wrong here: a cube running both `Battle Mistress` and
 * `Battle Mistress (Metal)` would produce two `[CustomCards]` entries with one
 * name, and since sheets reference cards by name the file becomes ambiguous.
 * They are also genuinely different pictures, which is most of what a custom
 * card is. Collisions are resolved by `uniqueNames` rather than by hoping.
 */
export function draftmancerName(card: DraftmancerSourceCard): string {
  return withChampionPrefix(card.name, card);
}

/**
 * Guarantees every card a distinct name, appending its printing id when two
 * collide.
 *
 * No name in the pool maps to two cards today, so this normally changes
 * nothing. It exists because the failure it prevents is silent: Draftmancer
 * would bind both sheet lines to whichever entry it saw last, and the cube
 * would draft with one card missing and another doubled.
 */
function uniqueNames(cards: DraftmancerSourceCard[]): Map<string, string> {
  const byName = new Map<string, DraftmancerSourceCard[]>();
  for (const card of cards) {
    const name = draftmancerName(card);
    byName.set(name, [...(byName.get(name) ?? []), card]);
  }

  const resolved = new Map<string, string>();
  for (const [name, group] of byName) {
    for (const card of group) {
      resolved.set(card.id, group.length === 1 ? name : `${name} (${card.id})`);
    }
  }
  return resolved;
}

/** `{"fury": 2}` → `2 Fury`, in the order the source listed them. */
function powerCostText(powerCost: Record<string, number> | null): string {
  if (!powerCost) return "";
  return Object.entries(powerCost)
    .map(([domain, pips]) => `${pips} ${titleCase(domain)}`)
    .join(", ");
}

/**
 * The source stores the cost/effect separator HTML-escaped — `Action&gt; Exhaust`
 * — and nothing downstream of us un-escapes it. On our own pages that text goes
 * into JSX, where React would render the entity as written; here it lands in a
 * plain-text JSON field that Draftmancer shows verbatim, so it has to be real
 * characters. Only the five predefined XML entities, decoded `&amp;` last so a
 * literal `&amp;gt;` does not become `>`.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Everything `mana_cost` cannot carry, in the field Draftmancer searches.
 *
 * Power cost and might have no MTG equivalent, and the rules text has to go
 * through `rulesTextToPlain` or it arrives full of `:rb_energy_1:` tokens.
 */
function oracleText(card: DraftmancerSourceCard): string {
  const parts: string[] = [];
  const power = powerCostText(card.powerCost);
  if (power) parts.push(`Power: ${power}`);
  if (card.might !== null) parts.push(`Might ${card.might}`);
  if (card.rulesText?.trim()) {
    parts.push(decodeEntities(rulesTextToPlain(card.rulesText)));
  }
  return parts.join("\n");
}

interface DraftmancerCustomCard {
  name: string;
  mana_cost: string;
  type: string;
  image?: string;
  set: string;
  collector_number: string;
  /** Typed to the accepted set so an unmapped value is a compile error rather
   *  than a file Draftmancer rejects on upload. */
  rarity: DraftmancerRarity;
  subtypes?: string[];
  rating: number;
  oracle_text?: string;
}

function customCard(
  card: DraftmancerSourceCard,
  name: string,
): DraftmancerCustomCard {
  const image = cardFull(card.imageFull);
  const oracle = oracleText(card);
  return {
    name,
    // Costless is an empty string, not `{0}` — see the note at the top.
    mana_cost: card.energyCost === null ? "" : `{${card.energyCost}}`,
    type: displayType(card),
    ...(image ? { image } : {}),
    set: card.setCode,
    collector_number: card.collectorNo,
    rarity: draftmancerRarity(card),
    ...(card.domains.length > 0 ? { subtypes: card.domains.map(titleCase) } : {}),
    rating: draftmancerRating(card),
    ...(oracle ? { oracle_text: oracle } : {}),
  };
}

/**
 * Sheet names. Single words with no punctuation, because the header syntax is
 * `[Name]` / `[Name(CardsPerBooster)]` and a name containing brackets or parens
 * has no documented escape.
 */
const MAIN_SHEET = "Main";
const LEGEND_SHEET = "Legends";
const BATTLEFIELD_SHEET = "Battlefields";
/** The either-slot names no sheet of its own: it declares its sources inline. */
const EITHER_SLOT = "LegendOrBattlefield";

/**
 * Sections that are drafted at all.
 *
 * The same rule the engine's `buildMainPool` applies: runes, sideboard and
 * maybeboard are never dealt — runes are a resource supplied outside the draft,
 * the sideboard is cards the owner deliberately took out, and the maybeboard is
 * not part of the cube.
 */
const DRAFTED_SECTIONS: CubeSection[] = ["main", "legends", "battlefields"];

/** The minimum a caller needs to describe an export without building one. */
export type PlannableCard = Pick<DraftmancerSourceCard, "section" | "quantity">;

/** One entry in a layout's `slots` array. */
interface LayoutSlot {
  name: string;
  count: number;
  /** Present only on the either-slot, which picks a sheet before it picks a
   *  card — this is what reproduces our 50/50 rather than drawing in
   *  proportion to how many of each type the cube happens to hold. */
  sheets?: { name: string; weight: number }[];
}

export interface DraftmancerPlan {
  /** Copies exported, not rows. */
  cardCount: number;
  mainCount: number;
  legendCount: number;
  battlefieldCount: number;
  /** Cards per booster the file declares. */
  packSize: number;
  mainPerPack: number;
  legendPerPack: number;
  battlefieldPerPack: number;
  eitherPerPack: number;
  /** Emitted as `boostersPerPlayer`, a default the host may override. */
  packsPerPlayer: number;
  /** Used only to size the sufficiency warnings; never written to the file. */
  seats: number;
  /** The layout the file will declare. */
  slots: LayoutSlot[];
  /** Things the user should know before uploading. Never silent. */
  warnings: string[];
}

/**
 * What an export of these cards under this config would contain.
 *
 * Split out from `toDraftmancerCubeFile` so the cube page can describe the
 * export — the counts, the pack arithmetic, the warnings — from the cards it
 * has **already loaded**, without a second round trip to build a file nobody
 * has asked for yet. Supabase is remote and a query costs ~60ms whatever it
 * returns, so a panel that costs a trip on every cube view is a panel that
 * taxes everyone who never clicks it.
 *
 * **Grouping is by section, not by card type**, matching `getDraftPools` and
 * therefore matching the counts the settings form shows as "(26 in this cube)".
 * The engine layers a type-beats-section rule on top of those pools inside
 * `buildMainPool`; reimplementing half of it here would mean the panel and the
 * file disagreed about how big a section is, which is a worse failure than the
 * rare stray legend filed under main that it would catch.
 */
export function draftmancerPlan(
  cards: PlannableCard[],
  config: DraftConfig = DEFAULT_DRAFT_CONFIG,
): DraftmancerPlan {
  const drafted = cards.filter((card) => DRAFTED_SECTIONS.includes(card.section));
  const warnings: string[] = [];

  const legendsReserved = !config.shuffleLegendsIntoPacks;
  const battlefieldsReserved = !config.shuffleBattlefieldsIntoPacks;

  const legends = legendsReserved
    ? drafted.filter((card) => card.section === "legends")
    : [];
  const battlefields = battlefieldsReserved
    ? drafted.filter((card) => card.section === "battlefields")
    : [];
  // A shuffled section is part of the main pile rather than a reserved one, so
  // it grows what main draws from — exactly what the settings form computes.
  const main = drafted.filter(
    (card) =>
      !(legendsReserved && card.section === "legends") &&
      !(battlefieldsReserved && card.section === "battlefields"),
  );

  const copies = (group: PlannableCard[]) =>
    group.reduce((sum, card) => sum + card.quantity, 0);

  // A shuffled type has no slots by definition, and `validateDraftConfig`
  // rejects the combination — this is belt and braces so a hand-built config
  // cannot produce a slot pointing at a sheet that was folded into main.
  let legendPerPack = legendsReserved ? config.legendSlots : 0;
  let battlefieldPerPack = battlefieldsReserved ? config.battlefieldSlots : 0;
  let eitherPerPack = canUseEitherSlot(config) ? config.legendOrBattlefieldSlots : 0;

  // An empty sheet is a file Draftmancer cannot build a booster from, so a slot
  // with nothing behind it gives its cards back to main — the same "fall back
  // and warn" the engine does for a short reserved section.
  if (legendPerPack > 0 && legends.length === 0) {
    warnings.push(
      `This cube has no legends, so ${legendPerPack} reserved ${
        legendPerPack === 1 ? "slot" : "slots"
      } per pack went back to the main section.`,
    );
    legendPerPack = 0;
  }
  if (battlefieldPerPack > 0 && battlefields.length === 0) {
    warnings.push(
      `This cube has no battlefields, so ${battlefieldPerPack} reserved ${
        battlefieldPerPack === 1 ? "slot" : "slots"
      } per pack went back to the main section.`,
    );
    battlefieldPerPack = 0;
  }

  const eitherSources = [
    ...(legends.length > 0 ? [LEGEND_SHEET] : []),
    ...(battlefields.length > 0 ? [BATTLEFIELD_SHEET] : []),
  ];
  if (eitherPerPack > 0 && eitherSources.length === 0) {
    warnings.push(
      "This cube has no legends or battlefields, so the legend-or-battlefield slot went back to the main section.",
    );
    eitherPerPack = 0;
  } else if (eitherPerPack > 0 && eitherSources.length === 1) {
    warnings.push(
      `The legend-or-battlefield slot can only draw ${
        eitherSources[0] === LEGEND_SHEET ? "legends" : "battlefields"
      }, because the cube holds none of the other.`,
    );
  }

  const reserved = legendPerPack + battlefieldPerPack + eitherPerPack;
  const mainPerPack = Math.max(0, config.packSize - reserved);

  const slots: LayoutSlot[] = [];
  if (mainPerPack > 0) slots.push({ name: MAIN_SHEET, count: mainPerPack });
  if (legendPerPack > 0) slots.push({ name: LEGEND_SHEET, count: legendPerPack });
  if (battlefieldPerPack > 0) {
    slots.push({ name: BATTLEFIELD_SHEET, count: battlefieldPerPack });
  }
  if (eitherPerPack > 0) {
    slots.push({
      name: EITHER_SLOT,
      count: eitherPerPack,
      // Equal weights, which is the whole point: a single mixed sheet would
      // draw in proportion to the cube's own split (26 legends against 56
      // battlefields on the dev cube — about 68% battlefield), where our
      // engine chooses the type 50/50 per slot.
      sheets: eitherSources.map((name) => ({ name, weight: 1 })),
    });
  }

  // Draftmancer deals without replacement and errors when a sheet runs dry, so
  // "is this cube big enough" is worth answering before the upload rather than
  // mid-draft. Seats are the host's to change, so this is phrased as the
  // assumption it is.
  const shortfall = (label: string, have: number, perPack: number) => {
    const need = config.seats * config.packsPerPlayer * perPack;
    if (perPack > 0 && have < need) {
      warnings.push(
        `${label}: ${config.seats} players × ${config.packsPerPlayer} packs needs ${need}, and this cube has ${have}. Draftmancer will stop when the sheet runs out. Use fewer players or packs.`,
      );
    }
  };
  shortfall("Main section", copies(main), mainPerPack);
  shortfall("Legends", copies(legends), legendPerPack);
  shortfall("Battlefields", copies(battlefields), battlefieldPerPack);
  shortfall(
    "Legends and battlefields together",
    copies(legends) + copies(battlefields),
    eitherPerPack,
  );

  return {
    cardCount: copies(drafted),
    mainCount: copies(main),
    legendCount: copies(legends),
    battlefieldCount: copies(battlefields),
    packSize: config.packSize,
    mainPerPack,
    legendPerPack,
    battlefieldPerPack,
    eitherPerPack,
    packsPerPlayer: config.packsPerPlayer,
    seats: config.seats,
    slots,
    warnings,
  };
}

export interface DraftmancerCubeFile extends DraftmancerPlan {
  /** The file itself, ready to download. */
  text: string;
}

export interface DraftmancerExportOptions {
  config?: DraftConfig;
  /** Written to `[Settings].name`, so the cube is identifiable in Draftmancer. */
  cubeName?: string;
}

/**
 * Builds the file.
 *
 * Every setting that affects how the cube drafts is written explicitly rather
 * than left to a default, so a change to Draftmancer's defaults cannot quietly
 * alter what a cube plays like:
 *
 * - `colorBalance` **off**, because we emit no `colors` and it would otherwise
 *   try to balance the largest slot against a field no card has.
 * - `withReplacement` **off**, matching our own rule that a card the cube holds
 *   twice appears in at most two packs.
 * - `refillWhenEmpty` **off**, so a cube too small for the session fails loudly
 *   instead of silently dealing the same cards again. `draftmancerPlan` warns
 *   about that case before the upload.
 * - `duplicateProtection` **on**, so one pack cannot show the same card twice.
 */
export function toDraftmancerCubeFile(
  cards: DraftmancerSourceCard[],
  { config = DEFAULT_DRAFT_CONFIG, cubeName }: DraftmancerExportOptions = {},
): DraftmancerCubeFile {
  const plan = draftmancerPlan(cards, config);

  const drafted = cards.filter((card) => DRAFTED_SECTIONS.includes(card.section));
  const legendsReserved = !config.shuffleLegendsIntoPacks;
  const battlefieldsReserved = !config.shuffleBattlefieldsIntoPacks;
  const inLegends = (card: DraftmancerSourceCard) =>
    legendsReserved && card.section === "legends";
  const inBattlefields = (card: DraftmancerSourceCard) =>
    battlefieldsReserved && card.section === "battlefields";

  const names = uniqueNames(drafted);
  const warnings = [...plan.warnings];

  const missingArt = drafted.filter((card) => !card.imageFull).length;
  if (missingArt > 0) {
    warnings.push(
      `${missingArt} ${missingArt === 1 ? "card has" : "cards have"} no art stored, so ${
        missingArt === 1 ? "it" : "they"
      } will show as a blank frame in Draftmancer.`,
    );
  }

  const renamed = drafted.filter((card) => names.get(card.id) !== draftmancerName(card));
  if (renamed.length > 0) {
    warnings.push(
      `${renamed.length} ${
        renamed.length === 1 ? "card shares its name" : "cards share names"
      } with another printing, so the printing id was appended to keep them distinct.`,
    );
  }

  // A slot whose sheet ended up unused must not be declared, and a sheet no
  // slot draws from must not be emitted — either one is a file that errors.
  const declared = new Set(
    plan.slots.flatMap((slot) => slot.sheets?.map((s) => s.name) ?? [slot.name]),
  );

  const sheets: [string, DraftmancerSourceCard[]][] = [];
  if (declared.has(MAIN_SHEET)) {
    sheets.push([
      MAIN_SHEET,
      drafted.filter((card) => !inLegends(card) && !inBattlefields(card)),
    ]);
  }
  if (declared.has(LEGEND_SHEET)) sheets.push([LEGEND_SHEET, drafted.filter(inLegends)]);
  if (declared.has(BATTLEFIELD_SHEET)) {
    sheets.push([BATTLEFIELD_SHEET, drafted.filter(inBattlefields)]);
  }

  const settings = {
    ...(cubeName ? { name: cubeName } : {}),
    boostersPerPlayer: config.packsPerPlayer,
    colorBalance: false,
    withReplacement: false,
    refillWhenEmpty: false,
    duplicateProtection: true,
    layouts: { Default: { weight: 1, slots: plan.slots } },
  };

  const sections = [
    "[CustomCards]",
    JSON.stringify(
      drafted.map((card) => customCard(card, names.get(card.id)!)),
      null,
      2,
    ),
    "[Settings]",
    JSON.stringify(settings, null, 2),
  ];

  for (const [name, group] of sheets) {
    // Bare header: the counts live in the layout, which is how Draftmancer's
    // own multi-layout example writes them.
    sections.push(`[${name}]`);
    sections.push(
      ...group.map((card) => `${card.quantity} ${names.get(card.id)!}`).sort(),
    );
  }

  return { ...plan, warnings, text: `${sections.join("\n")}\n` };
}
