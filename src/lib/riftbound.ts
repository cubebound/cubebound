/**
 * Riftbound game vocabulary and display rules.
 *
 * Riftbound is not Magic: there are no mana pips, "power" is a domain-specific
 * pip cost (not a combat stat), and "might" is the combat stat. Keep those
 * distinctions intact anywhere card data is rendered.
 */

/** "fury" / "FURY" -> "Fury". Domains, types and keywords are proper nouns. */
export function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

/** The six domains, in the game's canonical order. */
export const DOMAINS = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"] as const;

/** Cards with no domain are reported as this pseudo-domain by our sources. */
export const COLORLESS = "Colorless";

export const DOMAIN_COLORS: Record<string, string> = {
  Fury: "#dc4a3d",
  Calm: "#3f9e5f",
  Mind: "#3b82d6",
  Body: "#e08b34",
  Chaos: "#9a5bd4",
  Order: "#d9b93c",
  [COLORLESS]: "#9aa0a6",
};

/**
 * How many power pips a card costs in total.
 *
 * `power_cost` is a per-domain map (`{"fury": 2}`), so "how much power" is a sum
 * rather than a field. Sources report power as a single integer and cannot say
 * which domain it belongs to on a multi-domain card, so that case is stored as
 * `{"any": n}` — the total is right, only the split is unknown.
 *
 * Returns 0 for no cost at all. **Callers that render must treat 0 as "show
 * nothing", never as a zero cost** — costless is not zero, the same rule the
 * energy curve and the `none` filter bucket exist for.
 */
export function totalPips(powerCost: Record<string, number> | null): number {
  if (!powerCost) return 0;
  return Object.values(powerCost).reduce((sum, pips) => sum + (pips ?? 0), 0);
}

export const CARD_TYPES = [
  "Unit",
  "Champion Unit",
  "Spell",
  "Signature Spell",
  "Gear",
  "Rune",
  "Battlefield",
  "Legend",
] as const;

export const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Showcase"] as const;

/**
 * The energy costs a filter offers: 0–8 individually, then everything above.
 *
 * The pool thins out sharply at the top — 9, 10 and 12 together are 23 cards
 * against 220 at cost 2 — so a chip per value up there would be three chips
 * that almost never match and a gap at 11. `ENERGY_HIGH` is the open-ended
 * bucket, and it is a `>=` so a future 13-cost card lands in it without a code
 * change.
 */
export const ENERGY_MAX_BUCKET = 8;
export const ENERGY_HIGH = "9+";

/**
 * Costless cards, which are not the same thing as cost 0.
 *
 * Legends, runes and battlefields have no energy cost at all — 243 of 1,288
 * printings — and lumping them into 0 would be wrong in the same way it is
 * wrong on the energy curve. Without a bucket of their own they would be the
 * one fifth of the pool no cost filter could select.
 */
export const ENERGY_NONE = "none";

export const ENERGY_BUCKETS = [
  ...Array.from({ length: ENERGY_MAX_BUCKET + 1 }, (_, i) => String(i)),
  ENERGY_HIGH,
  ENERGY_NONE,
] as const;

export const ENERGY_BUCKET_LABELS: Record<string, string> = {
  [ENERGY_NONE]: "None",
};

/**
 * Raw `cards.type` values in the game's order, for sorting.
 *
 * Distinct from `CARD_TYPES`, which is the *display* vocabulary and includes
 * "Champion Unit" and "Signature Spell" — those are a `type` plus a
 * `supertype`, and no row's `type` column ever equals them, so ranking against
 * that list would drop every card into the fallback bucket.
 */
export const CARD_TYPE_ORDER = [
  "Unit",
  "Spell",
  "Gear",
  "Rune",
  "Battlefield",
  "Legend",
] as const;

/**
 * Orderings the card browser offers. `set` is the default and means the printed
 * order — set, then collector number — which is what a card list looks like
 * everywhere else in the game.
 *
 * **This lives here rather than beside `searchCards` because the filter bar is
 * a client component.** Importing a *value* from `src/db/queries/cards.ts`
 * pulls `src/db/index.ts` behind it and bundles the postgres driver for the
 * browser, which fails the build with a `node:crypto` resolution error rather
 * than anything that names the real cause. Types are erased and so are safe to
 * import from there; constants are not.
 */
export const CARD_SORTS = ["set", "name", "energy", "type", "rarity"] as const;
export type CardSort = (typeof CARD_SORTS)[number];

export const CARD_SORT_LABELS: Record<CardSort, string> = {
  set: "Set order",
  name: "Name",
  energy: "Energy cost",
  type: "Card type",
  rarity: "Rarity",
};

/**
 * Runeterra's regions, which appear in `cards.tags` alongside everything else.
 *
 * A card's tags are its type line's trait half, and they mix three unrelated
 * things: where a card is from (Ionia), what it is (Pirate, Dragon), and which
 * champion it belongs to (Ahri). Only the first is enumerable from the game's
 * fiction, so it is listed here; the other two are derived from the data — a
 * tag that also appears in `cards.champion` is a champion tag, and whatever is
 * left is an ordinary trait. That keeps a new set's new creature type working
 * without a code change, which is the same rule the other filter dropdowns
 * follow.
 */
export const REGIONS = [
  "Bandle City",
  "Bilgewater",
  "Demacia",
  "Freljord",
  "Icathia",
  "Ionia",
  "Ixtal",
  "Kathkan",
  "Mount Targon",
  "Noxus",
  "Piltover",
  "Shadow Isles",
  "Shurima",
  "The Void",
  "Zaun",
] as const;

/**
 * Sorts values by a canonical list, keeping anything unrecognized (a new set's
 * new domain, type or rarity) at the end rather than dropping it.
 */
export function sortByCanonical(values: string[], canonical: readonly string[]): string[] {
  return [...values].sort((a, b) => {
    const ia = canonical.indexOf(a);
    const ib = canonical.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export const CUBE_SECTIONS = [
  "main",
  "legends",
  "runes",
  "battlefields",
  "sideboard",
  "maybeboard",
] as const;

export type CubeSection = (typeof CUBE_SECTIONS)[number];

/**
 * The sections that make up the cube itself.
 *
 * The maybeboard is deliberately absent: it holds cards you are *considering*,
 * so listing it with the cube — or counting it in the cube's size — would make
 * a 300-card cube read as 340. It is a move target like any other section
 * (so `CUBE_SECTIONS` keeps it) but it gets its own tab and its own count.
 */
export const CUBE_LIST_SECTIONS = CUBE_SECTIONS.filter(
  (section) => section !== "maybeboard",
) as readonly CubeSection[];

export const CUBE_SECTION_LABELS: Record<CubeSection, string> = {
  main: "Main",
  legends: "Legends",
  runes: "Runes",
  battlefields: "Battlefields",
  sideboard: "Sideboard",
  maybeboard: "Maybeboard",
};

/**
 * Where a card lands when added to a cube. Constructed decks keep legends,
 * runes and battlefields outside the main deck, so they get their own sections;
 * everything else starts in main and can be moved afterwards.
 */
export function defaultSectionForType(type: string): CubeSection {
  switch (type) {
    case "Legend":
      return "legends";
    case "Rune":
      return "runes";
    case "Battlefield":
      return "battlefields";
    default:
      return "main";
  }
}

export function isCubeSection(value: string): value is CubeSection {
  return (CUBE_SECTIONS as readonly string[]).includes(value);
}

/**
 * Battlefields are printed landscape; every other type is portrait. Derived
 * from type because our schema has no orientation column — verified against
 * the full card pool (all 56 Battlefields landscape, all other types portrait).
 */
export function isLandscape(type: string): boolean {
  return type === "Battlefield";
}

export function aspectRatio(type: string): string {
  return isLandscape(type) ? "7 / 5" : "5 / 7";
}
