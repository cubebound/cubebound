/**
 * Guards the rules the analytics panels are computed by.
 *
 * Pure — no database, no server — so it runs in CI like `check:draft`. Every
 * assertion is on a hand-built cube where the right answer is obvious by
 * inspection, which is the point: these numbers are the product, and a chart
 * that is quietly wrong looks exactly like a chart that is right.
 *
 *   npm run check:analytics
 */
import {
  analyzeCube,
  displayType,
  domainBucket,
  energyCurve,
  keywordBreakdown,
  keywordsOf,
  normalizeKeyword,
  rarityDistribution,
  typeDistribution,
  wordCountDistribution,
  domainDistribution,
  MULTI_DOMAIN,
  type AnalyticsCard,
} from "../src/lib/cube-analytics";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

function card(over: Partial<AnalyticsCard> = {}): AnalyticsCard {
  return {
    name: "Test Card",
    type: "Unit",
    supertype: null,
    rarity: "Common",
    domains: ["Fury"],
    energyCost: 2,
    powerCost: null,
    rulesText: null,
    quantity: 1,
    ...over,
  };
}

const find = (slices: { key: string; count: number }[], key: string) =>
  slices.find((s) => s.key === key)?.count ?? 0;

// --- copies, not rows --------------------------------------------------------
{
  const cards = [card({ quantity: 3 }), card({ domains: ["Calm"], quantity: 2 })];
  const stats = analyzeCube(cards);
  expect(stats.total === 5, `total should count copies, got ${stats.total}`);
  expect(
    find(stats.domains, "Fury") === 3,
    `a card held three times is three cards in the domain split, got ${find(stats.domains, "Fury")}`,
  );
  expect(
    stats.curve.buckets.find((b) => b.label === "2")?.total === 5,
    "the curve should count copies too",
  );
}

// --- domain buckets ----------------------------------------------------------
{
  expect(domainBucket({ domains: [] }) === "Colorless", "no domains means Colorless");
  expect(domainBucket({ domains: ["Mind"] }) === "Mind", "one domain is itself");
  expect(
    domainBucket({ domains: ["Fury", "Chaos"] }) === MULTI_DOMAIN,
    "two domains is Multi, counted once rather than once per domain",
  );

  const slices = domainDistribution([
    card({ domains: ["Fury", "Chaos"] }),
    card({ domains: [] }),
    card({ domains: ["Order"] }),
  ]);
  expect(
    slices.reduce((n, s) => n + s.count, 0) === 3,
    "domain slices must sum to the cube size, or the donut lies about shares",
  );
  const order = slices.map((s) => s.key);
  expect(
    order.indexOf("Order") < order.indexOf(MULTI_DOMAIN),
    `single domains come before Multi in the game's order, got ${order.join(",")}`,
  );
  expect(
    order.indexOf(MULTI_DOMAIN) < order.indexOf("Colorless"),
    `Colorless sorts last, got ${order.join(",")}`,
  );
}

// --- display types -----------------------------------------------------------
{
  expect(
    displayType({ type: "Unit", supertype: "Champion" }) === "Champion Unit",
    "a Champion Unit is type + supertype, not a type of its own",
  );
  expect(
    displayType({ type: "Spell", supertype: "Signature" }) === "Signature Spell",
    "signature spells are named as such",
  );
  expect(
    displayType({ type: "Rune", supertype: "Basic" }) === "Rune",
    "Basic describes the printing, not the card — it must not become a type",
  );
  expect(
    displayType({ type: "Unit", supertype: "Token" }) === "Unit",
    "Token likewise",
  );

  const types = typeDistribution([
    card({ type: "Unit", supertype: "Champion" }),
    card({ type: "Unit", supertype: null }),
    card({ type: "Unit", supertype: "Token" }),
  ]);
  expect(
    find(types, "Champion Unit") === 1 && find(types, "Unit") === 2,
    `champions must be split out from ordinary units, got ${JSON.stringify(types.map((t) => [t.key, t.count]))}`,
  );
}

// --- rarity ------------------------------------------------------------------
{
  const rarities = rarityDistribution([
    card({ rarity: "Promo" }),
    card({ rarity: "Common" }),
    card({ rarity: "Common" }),
  ]);
  expect(find(rarities, "Common") === 2, "rarity counts copies");
  expect(
    rarities.map((r) => r.key).indexOf("Promo") === rarities.length - 1,
    "a rarity outside the canonical list sorts last rather than being dropped",
  );
  expect(
    rarities.every((r) => r.color !== null),
    "every rarity needs a colour, including one we didn't anticipate",
  );
}

// --- the energy curve --------------------------------------------------------
{
  const curve = energyCurve([
    card({ energyCost: 0 }),
    card({ energyCost: 3 }),
    card({ energyCost: 9 }),
    card({ energyCost: 12 }),
    // Costless: a legend, a rune, a battlefield.
    card({ type: "Legend", energyCost: null, powerCost: null }),
    card({ type: "Rune", energyCost: null, powerCost: null, quantity: 4 }),
  ]);

  expect(curve.costless === 5, `costless cards should be counted aside, got ${curve.costless}`);
  expect(
    curve.buckets.find((b) => b.label === "0")?.total === 1,
    "a genuine 0-cost card belongs in the 0 bucket",
  );
  expect(
    curve.buckets.every((b) => b.label !== "0" || b.total === 1),
    "costless cards must NOT be bucketed at zero — that invents a spike",
  );
  expect(
    curve.buckets.find((b) => b.label === "7+")?.total === 2,
    `costs at or above the cap share the top bucket, got ${curve.buckets.find((b) => b.label === "7+")?.total}`,
  );
  expect(
    curve.buckets.map((b) => b.label).join(",") === "0,1,2,3,4,5,6,7+",
    `the curve should run 0..7+ with no gaps, got ${curve.buckets.map((b) => b.label).join(",")}`,
  );
  expect(curve.max === 2, `max should be the tallest bucket, got ${curve.max}`);

  // A card with a power cost but no energy cost is still on the curve.
  const powerOnly = energyCurve([card({ energyCost: null, powerCost: { fury: 1 } })]);
  expect(
    powerOnly.costless === 0 && powerOnly.buckets[0].total === 1,
    "a card with a power cost is on the curve, not off it",
  );

  // Segments stack in the game's domain order so bars are comparable.
  const stacked = energyCurve([
    card({ energyCost: 1, domains: ["Order"] }),
    card({ energyCost: 1, domains: ["Fury"] }),
    card({ energyCost: 1, domains: ["Fury", "Mind"] }),
  ]);
  const segs = stacked.buckets.find((b) => b.label === "1")!.segments.map((s) => s.key);
  expect(
    segs.join(",") === `Fury,Order,${MULTI_DOMAIN}`,
    `segments should follow the domain order, got ${segs.join(",")}`,
  );
  expect(
    stacked.buckets.find((b) => b.label === "1")!.total === 3,
    "a bucket's total is the sum of its segments",
  );
}

// --- word counts -------------------------------------------------------------
{
  const buckets = wordCountDistribution([
    card({ rulesText: null }),
    card({ rulesText: "" }),
    card({ rulesText: "one two three" }),
  ]);
  expect(
    buckets[0].count === 3,
    `a card with no rules text counts as zero words, got ${buckets[0].count}`,
  );
  expect(buckets[0].label === "0-6", `bucket labels should be ranges, got ${buckets[0].label}`);

  // Symbols resolve to words rather than being counted as raw tokens, so a
  // card is not scored as verbose for carrying pips.
  const symbol = wordCountDistribution([card({ rulesText: ":rb_energy_1::rb_rune_fury:" })]);
  expect(
    symbol.reduce((n, b) => n + b.count, 0) === 1,
    "a symbol-only card still lands in exactly one bucket",
  );
  expect(
    symbol[0].count === 1,
    "two symbols resolve to a handful of words, not a long card",
  );
}

// --- keyword normalisation ---------------------------------------------------
{
  expect(normalizeKeyword("Shield 2") === "Shield", "a keyword's value is not part of its name");
  expect(normalizeKeyword("Burn 3") === "Burn", "same for Burn");
  expect(normalizeKeyword("Predict X") === "Predict", "including an X value");
  expect(
    normalizeKeyword("ADD") === normalizeKeyword("Add"),
    "the source is inconsistent about case; both must fold to one keyword",
  );
  expect(normalizeKeyword("&gt;") === null, "an escaped arrow is not a keyword");
  expect(normalizeKeyword("&gt;&gt;") === null, "nor a double arrow");
  expect(normalizeKeyword("NO TEXT") === null, "nor the empty-text placeholder");
  expect(normalizeKeyword("no text") === null, "case-insensitively");
  expect(normalizeKeyword("Deflect") === "Deflect", "an ordinary keyword survives");

  // One card mentioning a keyword twice carries it once.
  expect(
    keywordsOf("[Deflect] blah [Deflect 2] blah").join(",") === "Deflect",
    "a keyword repeated on one card counts once",
  );
  expect(keywordsOf(null).length === 0, "no rules text means no keywords");
  expect(
    keywordsOf("[Shield 2] and [Accelerate]").sort().join(",") === "Accelerate,Shield",
    "several keywords on a card are all found",
  );
}

// --- keyword breakdown -------------------------------------------------------
{
  const summary = keywordBreakdown([
    card({ rulesText: "[Deflect]", domains: ["Fury"], quantity: 2 }),
    card({ rulesText: "[Deflect] [Shield 2]", domains: ["Calm"] }),
    card({ rulesText: null }),
  ]);

  expect(summary.unique === 2, `two distinct keywords, got ${summary.unique}`);
  expect(
    summary.cardsWithKeywords === 3,
    `three copies carry a keyword, got ${summary.cardsWithKeywords}`,
  );
  expect(
    summary.instances === 4,
    `instances are keyword-card pairings weighted by copies (2+1+1), got ${summary.instances}`,
  );
  expect(summary.mostCommon?.keyword === "Deflect", "the most common keyword leads");
  expect(summary.mostCommon?.count === 3, `Deflect is on three copies, got ${summary.mostCommon?.count}`);
  expect(
    Math.abs((summary.mostCommon?.share ?? 0) - 3 / 4) < 1e-9,
    `share is of the whole cube including keywordless cards, got ${summary.mostCommon?.share}`,
  );
  const deflectDomains = summary.rows.find((r) => r.keyword === "Deflect")!.domains;
  expect(
    deflectDomains[0].key === "Fury" && deflectDomains[0].count === 2,
    "a keyword's domains are ordered by how much of it each carries",
  );
}

// --- an empty cube must not throw -------------------------------------------
{
  const empty = analyzeCube([]);
  expect(empty.total === 0, "an empty cube totals zero");
  expect(empty.keywords.mostCommon === null, "and has no most-common keyword");
  expect(empty.curve.max === 0, "and a flat curve");
  expect(
    empty.keywords.shareWithKeywords === 0,
    "share must not divide by zero",
  );
}

if (failures.length > 0) {
  console.error(`analytics check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`analytics check passed (${17} scenarios)`);
