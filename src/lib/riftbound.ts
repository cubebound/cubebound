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
