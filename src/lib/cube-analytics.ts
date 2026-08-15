import { parseRulesText, rulesTextToPlain } from "@/lib/rules-text";
import { COLORLESS, DOMAIN_COLORS, DOMAINS, RARITIES, titleCase } from "@/lib/riftbound";

/**
 * What a cube is made of, computed from its cards.
 *
 * Pure and synchronous — no database, no React, no clock — so every rule here
 * is testable in isolation and `check:analytics` can assert on hand-built
 * inputs. The page just renders what this returns.
 *
 * Counts are **copies, not rows**, like everything else on the site: a cube
 * running three of a card is three cards in its curve. Callers pass the
 * sections they want counted; the maybeboard is not part of the cube and the
 * page excludes it before calling.
 */

export interface AnalyticsCard {
  name: string;
  type: string;
  supertype: string | null;
  rarity: string;
  domains: string[];
  energyCost: number | null;
  powerCost: Record<string, number> | null;
  rulesText: string | null;
  quantity: number;
}

export interface Slice {
  key: string;
  label: string;
  count: number;
  /** A CSS colour, or `null` for the multi-domain slice, which is drawn as a
   *  gradient because no flat colour can mean "more than one domain" without
   *  colliding with a real one — gold would read as Order. */
  color: string | null;
}

/** Cards with two domains are counted once here rather than once per domain,
 *  so the slices sum to the cube's size and the chart reads as a share. */
export const MULTI_DOMAIN = "Multi";

// --- shared helpers ----------------------------------------------------------

function tally<T>(
  cards: readonly AnalyticsCard[],
  key: (card: AnalyticsCard) => T | null,
): Map<T, number> {
  const counts = new Map<T, number>();
  for (const card of cards) {
    const k = key(card);
    if (k === null) continue;
    counts.set(k, (counts.get(k) ?? 0) + card.quantity);
  }
  return counts;
}

/** The domain bucket a card falls in: its domain, Multi, or Colorless. */
export function domainBucket(card: Pick<AnalyticsCard, "domains">): string {
  if (card.domains.length === 0) return COLORLESS;
  if (card.domains.length > 1) return MULTI_DOMAIN;
  return card.domains[0];
}

/**
 * The type as a reader thinks of it.
 *
 * `type` and `supertype` are separate columns — a Champion Unit is
 * `Unit` + `Champion` — so a breakdown by raw `type` would fold 323 champion
 * units in with ordinary ones and hide the thing a cube builder most wants to
 * see. Token and Basic supertypes are *not* promoted: those describe the
 * printing, not what the card does in a deck.
 */
export function displayType(card: Pick<AnalyticsCard, "type" | "supertype">): string {
  if (card.supertype === "Champion" || card.supertype === "Signature") {
    return `${card.supertype} ${card.type}`;
  }
  return card.type;
}

const DOMAIN_ORDER = [...DOMAINS, MULTI_DOMAIN, COLORLESS];

export function domainDistribution(cards: readonly AnalyticsCard[]): Slice[] {
  const counts = tally(cards, domainBucket);
  return [...counts]
    .sort((a, b) => {
      const ia = DOMAIN_ORDER.indexOf(a[0]);
      const ib = DOMAIN_ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      color: key === MULTI_DOMAIN ? null : (DOMAIN_COLORS[key] ?? "#9aa0a6"),
    }));
}

/** Distinct from the game's canonical list because that one has no colours and
 *  a new set's new type must still appear. Unrecognised types fall to the end
 *  with a neutral fill, matching `sortByCanonical` elsewhere. */
const TYPE_ORDER = [
  "Champion Unit",
  "Unit",
  "Signature Spell",
  "Spell",
  "Signature Gear",
  "Gear",
  "Rune",
  "Battlefield",
  "Champion Legend",
  "Legend",
];
const TYPE_COLORS: Record<string, string> = {
  "Champion Unit": "#e0574a",
  Unit: "#c9705f",
  "Signature Spell": "#4f8fd4",
  Spell: "#6aa6dd",
  "Signature Gear": "#8a7fd4",
  Gear: "#9b93cc",
  Rune: "#5aa46f",
  Battlefield: "#c9a23c",
  "Champion Legend": "#b45fa8",
  Legend: "#c47fb8",
};

function ordered(counts: Map<string, number>, order: readonly string[]): [string, number][] {
  return [...counts].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    if (ia === -1 && ib === -1) return b[1] - a[1];
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function typeDistribution(cards: readonly AnalyticsCard[]): Slice[] {
  return ordered(tally(cards, displayType), TYPE_ORDER).map(([key, count]) => ({
    key,
    label: key,
    count,
    color: TYPE_COLORS[key] ?? "#8a8a94",
  }));
}

const RARITY_COLORS: Record<string, string> = {
  Common: "#5f6470",
  Uncommon: "#7f8794",
  Rare: "#d9b93c",
  Epic: "#9a5bd4",
  Showcase: "#3b82d6",
  Promo: "#dc4a3d",
};

export function rarityDistribution(cards: readonly AnalyticsCard[]): Slice[] {
  return ordered(tally(cards, (c) => c.rarity || "Unknown"), RARITIES).map(
    ([key, count]) => ({
      key,
      label: key,
      count,
      color: RARITY_COLORS[key] ?? "#8a8a94",
    }),
  );
}

// --- the energy curve --------------------------------------------------------

/** Anything at or above this shares the top bucket, as every curve chart does —
 *  a tail of single cards out to 12 is noise. */
export const CURVE_TOP = 7;

export interface CurveBucket {
  label: string;
  total: number;
  segments: Slice[];
}

export interface EnergyCurve {
  buckets: CurveBucket[];
  /** Cards with neither an energy nor a power cost, which are off the scale
   *  rather than at the cheap end of it. */
  costless: number;
  /** Tallest bucket, so a caller can scale bars without re-scanning. */
  max: number;
}

/**
 * Cards by energy cost, stacked by domain.
 *
 * **Costless cards are excluded, not bucketed at zero.** Legends, runes and
 * battlefields have no energy cost at all — 243 of the 1,288 printings — and
 * putting them in a "0" column would invent a spike that says nothing about how
 * the deck curves out. They are reported separately so the number is visible
 * rather than silently missing. A genuine 0-cost spell still lands in "0".
 *
 * Stacked by single domain with one Multi bucket, unlike the text view which
 * gives every domain *pair* its own column: a curve with eighteen stacks per
 * bar is mud, and the question a curve answers is "how does this cube ramp",
 * not "what exact pair is this card".
 */
export function energyCurve(cards: readonly AnalyticsCard[]): EnergyCurve {
  const buckets = new Map<number, Map<string, number>>();
  let costless = 0;

  for (const card of cards) {
    if (card.energyCost === null && card.powerCost === null) {
      costless += card.quantity;
      continue;
    }
    const cost = Math.max(0, card.energyCost ?? 0);
    const bucket = Math.min(cost, CURVE_TOP);
    const domain = domainBucket(card);
    const inner = buckets.get(bucket) ?? new Map<string, number>();
    inner.set(domain, (inner.get(domain) ?? 0) + card.quantity);
    buckets.set(bucket, inner);
  }

  const highest = Math.max(0, ...buckets.keys());
  const out: CurveBucket[] = [];
  for (let cost = 0; cost <= Math.max(highest, CURVE_TOP); cost++) {
    const inner = buckets.get(cost) ?? new Map<string, number>();
    const segments = DOMAIN_ORDER.filter((d) => inner.has(d)).map((key) => ({
      key,
      label: key,
      count: inner.get(key)!,
      color: key === MULTI_DOMAIN ? null : (DOMAIN_COLORS[key] ?? "#9aa0a6"),
    }));
    out.push({
      label: cost >= CURVE_TOP ? `${CURVE_TOP}+` : String(cost),
      total: [...inner.values()].reduce((a, b) => a + b, 0),
      segments,
    });
  }

  return { buckets: out, costless, max: Math.max(0, ...out.map((b) => b.total)) };
}

// --- rules text --------------------------------------------------------------

/** Width of each word-count bar. Seven matches the source chart's banding and
 *  keeps a 0–97 range to fourteen bars. */
export const WORD_BUCKET = 7;

export interface WordCountBucket {
  label: string;
  count: number;
}

/**
 * How wordy the cube's cards are.
 *
 * Counted on the *plain* text: `rulesTextToPlain` resolves `:rb_energy_1:` to
 * "1 Energy" and drops the bracket markup, so a card isn't scored as verbose
 * for carrying symbols. A card with no rules text counts as zero and is
 * included — "how much of this cube is vanilla" is part of the answer.
 */
export function wordCountDistribution(cards: readonly AnalyticsCard[]): WordCountBucket[] {
  const counts = new Map<number, number>();
  let highest = 0;

  for (const card of cards) {
    const plain = card.rulesText ? rulesTextToPlain(card.rulesText) : "";
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    const bucket = Math.floor(words / WORD_BUCKET);
    highest = Math.max(highest, bucket);
    counts.set(bucket, (counts.get(bucket) ?? 0) + card.quantity);
  }

  const out: WordCountBucket[] = [];
  for (let b = 0; b <= highest; b++) {
    out.push({
      label: `${b * WORD_BUCKET}-${(b + 1) * WORD_BUCKET - 1}`,
      count: counts.get(b) ?? 0,
    });
  }
  return out;
}

// --- keywords ----------------------------------------------------------------

/**
 * Bracket contents that are not keywords.
 *
 * The source wraps a few non-keyword markers in the same brackets: `>` and `>>`
 * arrive HTML-escaped as `&gt;` and separate an ability's cost from its effect,
 * and `NO TEXT` is a placeholder on cards with none. Listing them beats a
 * general "must look like a word" rule, which would also drop a future keyword
 * that happens to be punctuated.
 */
const NON_KEYWORDS = new Set(["", ">", ">>", "no text"]);

/**
 * Normalises one bracket marker to a keyword name.
 *
 * `[Shield 2]` and `[Shield 3]` are the same keyword at different values, and
 * the source is inconsistent about case (`[ADD]` alongside `[Add]`), so both
 * are folded. Returns null for the markers that aren't keywords at all.
 */
export function normalizeKeyword(literal: string): string | null {
  const decoded = literal
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .trim();
  // Trailing value: [Shield 2], [Burn 3], [Predict X].
  const base = decoded.replace(/\s+[0-9X]+$/i, "").trim();
  if (NON_KEYWORDS.has(base.toLowerCase())) return null;
  if (!/[a-z]/i.test(base)) return null;
  return titleCase(base);
}

/** Every keyword on one card, deduplicated — a card repeating `[Deflect]` in
 *  its reminder text carries the keyword once. */
export function keywordsOf(rulesText: string | null): string[] {
  if (!rulesText) return [];
  const found = new Set<string>();
  for (const node of parseRulesText(rulesText)) {
    if (node.type !== "keyword") continue;
    const name = normalizeKeyword(node.value);
    if (name) found.add(name);
  }
  return [...found];
}

export interface KeywordRow {
  keyword: string;
  /** Copies carrying it. */
  count: number;
  /** Share of the cube, 0–1. */
  share: number;
  /** Which domain buckets carry it, most common first. */
  domains: { key: string; count: number; color: string | null }[];
}

export interface KeywordSummary {
  unique: number;
  /** keyword ↔ card pairings, so a card with two keywords counts twice. */
  instances: number;
  cardsWithKeywords: number;
  shareWithKeywords: number;
  mostCommon: KeywordRow | null;
  rows: KeywordRow[];
}

/**
 * Keyword usage, read from the rules text rather than `cards.keywords`.
 *
 * **`cards.keywords` is empty on every row** — no source has ever populated it
 * — so a breakdown from that column would render an empty panel. The keywords
 * are in the printed text, bracketed: `[Deflect]`, `[Shield 2]`, `[Accelerate]`.
 * Parsed at render time through the same `parseRulesText` the card detail uses,
 * so this works on rows already stored and needs no re-sync.
 */
export function keywordBreakdown(cards: readonly AnalyticsCard[]): KeywordSummary {
  const total = cards.reduce((n, c) => n + c.quantity, 0);
  const counts = new Map<string, number>();
  const byDomain = new Map<string, Map<string, number>>();
  let instances = 0;
  let cardsWithKeywords = 0;

  for (const card of cards) {
    const keywords = keywordsOf(card.rulesText);
    if (keywords.length === 0) continue;
    cardsWithKeywords += card.quantity;
    const domain = domainBucket(card);
    for (const keyword of keywords) {
      instances += card.quantity;
      counts.set(keyword, (counts.get(keyword) ?? 0) + card.quantity);
      const inner = byDomain.get(keyword) ?? new Map<string, number>();
      inner.set(domain, (inner.get(domain) ?? 0) + card.quantity);
      byDomain.set(keyword, inner);
    }
  }

  const rows: KeywordRow[] = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([keyword, count]) => ({
      keyword,
      count,
      share: total > 0 ? count / total : 0,
      domains: [...(byDomain.get(keyword) ?? new Map())]
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => ({
          key,
          count: n as number,
          color: key === MULTI_DOMAIN ? null : (DOMAIN_COLORS[key] ?? "#9aa0a6"),
        })),
    }));

  return {
    unique: rows.length,
    instances,
    cardsWithKeywords,
    shareWithKeywords: total > 0 ? cardsWithKeywords / total : 0,
    mostCommon: rows[0] ?? null,
    rows,
  };
}

// --- everything at once ------------------------------------------------------

export interface CubeAnalytics {
  total: number;
  domains: Slice[];
  types: Slice[];
  rarities: Slice[];
  curve: EnergyCurve;
  wordCounts: WordCountBucket[];
  keywords: KeywordSummary;
}

export function analyzeCube(cards: readonly AnalyticsCard[]): CubeAnalytics {
  return {
    total: cards.reduce((n, c) => n + c.quantity, 0),
    domains: domainDistribution(cards),
    types: typeDistribution(cards),
    rarities: rarityDistribution(cards),
    curve: energyCurve(cards),
    wordCounts: wordCountDistribution(cards),
    keywords: keywordBreakdown(cards),
  };
}
