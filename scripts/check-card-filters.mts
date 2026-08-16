/**
 * Guards the card browser's filter semantics against the card pool itself.
 *
 * Multi-select filters are the easy thing to get quietly wrong: an OR written
 * as an AND still returns rows, still renders a grid, and is only detectable by
 * counting. So every assertion here computes the expected answer with an
 * independent SQL query and compares it against `searchCards` — not against a
 * hardcoded number, which would go stale the next time a set is synced.
 *
 * What it covers, and why each one is here rather than assumed:
 *  - within a filter, values OR. Ticking Fury and Calm asks for either.
 *  - across filters, they AND. Fury plus Common is Fury commons.
 *  - the energy buckets partition the pool exactly: 0-8, 9+ and none must sum
 *    to the total with no card counted twice and none left unreachable. That
 *    is what catches "9+" written as `> 9`, and costless cards falling into 0.
 *  - sorting actually orders, including the canonical orders for rarity and
 *    type, which are not alphabetical.
 *  - the pre-multi-select URLs (`?domain=Fury`) still mean what they did.
 *
 * Reads only. Creates nothing, deletes nothing.
 *
 *   npm run check:card-filters
 */
import postgres from "postgres";

import { fromEnvFile } from "./lib/env";

import { searchCards, type CardFilters } from "../src/db/queries/cards";
import { cardFiltersFromParams } from "../src/lib/card-search-params";
import { CARD_TYPE_ORDER, ENERGY_BUCKETS, RARITIES } from "../src/lib/riftbound";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

/** Every printing, since the filters run before any grouping. */
const countRows = async (where: postgres.PendingQuery<postgres.Row[]>) => {
  const [row] = await where;
  return Number(row.n);
};

/** `searchCards` total for a filter set, with grouping off so it counts rows. */
const found = async (filters: CardFilters) =>
  (await searchCards({ ...filters, allPrintings: true })).total;

try {
  // ---- within a filter, values OR --------------------------------------
  const fury = await countRows(
    sql`select count(*)::int as n from cards where domains @> array['Fury']`,
  );
  const calm = await countRows(
    sql`select count(*)::int as n from cards where domains @> array['Calm']`,
  );
  const both = await countRows(
    sql`select count(*)::int as n from cards
        where domains @> array['Fury'] and domains @> array['Calm']`,
  );
  const either = await found({ domains: ["Fury", "Calm"] });

  expect(
    either === fury + calm - both,
    `two domains must OR: expected ${fury + calm - both} (${fury} Fury + ${calm} Calm ` +
      `- ${both} both), got ${either}`,
  );
  // The mutation this catches: OR written as AND collapses to the intersection.
  expect(
    either !== both || both === fury,
    `two domains returned the intersection (${both}) — that is an AND, not an OR`,
  );
  expect(either > fury && either > calm, `Fury OR Calm (${either}) must exceed either alone`);

  const sets = await found({ sets: ["OGN", "VEN"] });
  const ogn = await countRows(sql`select count(*)::int as n from cards where set_code = 'OGN'`);
  const ven = await countRows(sql`select count(*)::int as n from cards where set_code = 'VEN'`);
  expect(sets === ogn + ven, `two sets must OR: expected ${ogn + ven}, got ${sets}`);

  // ---- across filters, they AND ----------------------------------------
  const furyCommon = await found({ domains: ["Fury"], rarities: ["Common"] });
  const expectedFuryCommon = await countRows(
    sql`select count(*)::int as n from cards
        where domains @> array['Fury'] and rarity = 'Common'`,
  );
  expect(
    furyCommon === expectedFuryCommon,
    `domain AND rarity: expected ${expectedFuryCommon}, got ${furyCommon}`,
  );
  expect(
    furyCommon < fury,
    `adding a rarity must narrow the result (${fury} -> ${furyCommon})`,
  );

  // ---- the energy buckets partition the pool ---------------------------
  const total = await countRows(sql`select count(*)::int as n from cards`);
  let bucketSum = 0;
  for (const bucket of ENERGY_BUCKETS) {
    bucketSum += await found({ energy: [bucket] });
  }
  expect(
    bucketSum === total,
    `the energy buckets must cover every card exactly once: they sum to ${bucketSum} ` +
      `against ${total} cards (a gap means an unreachable card, an excess means double-counting)`,
  );

  const high = await found({ energy: ["9+"] });
  const expectedHigh = await countRows(
    sql`select count(*)::int as n from cards where energy_cost >= 9`,
  );
  expect(high === expectedHigh, `"9+" must be >= 9: expected ${expectedHigh}, got ${high}`);
  expect(high > 0, `"9+" matched nothing — the bucket is unreachable`);

  const none = await found({ energy: ["none"] });
  const expectedNone = await countRows(
    sql`select count(*)::int as n from cards where energy_cost is null`,
  );
  expect(none === expectedNone, `"none" must be NULL: expected ${expectedNone}, got ${none}`);

  const zero = await found({ energy: ["0"] });
  expect(
    zero !== zero + none || none === 0,
    "cost 0 must not include costless cards",
  );
  const expectedZero = await countRows(
    sql`select count(*)::int as n from cards where energy_cost = 0`,
  );
  expect(zero === expectedZero, `cost 0: expected ${expectedZero}, got ${zero}`);

  // Several buckets OR, like every other filter.
  const cheap = await found({ energy: ["1", "2"] });
  const expectedCheap = await countRows(
    sql`select count(*)::int as n from cards where energy_cost in (1, 2)`,
  );
  expect(cheap === expectedCheap, `two costs must OR: expected ${expectedCheap}, got ${cheap}`);

  // ---- sorting actually orders -----------------------------------------
  const ascending = (values: (number | null)[]) =>
    values.every((v, i) => i === 0 || (v ?? Infinity) >= (values[i - 1] ?? Infinity));

  /**
   * The first and last card of a whole ordering.
   *
   * Page one alone is not enough, and that is not hypothetical: an alphabetical
   * rarity sort passed a first-page check, because both orderings begin with
   * Common and 60 rows never reach the second value. The endpoints of the full
   * ordering are what actually distinguish one order from another.
   */
  const endsOf = async (sort: CardFilters["sort"]) => {
    const first = await searchCards({ sort, allPrintings: true });
    const last = await searchCards({ sort, allPrintings: true, page: first.pageCount });
    return { first: first.cards[0], last: last.cards.at(-1), page1: first.cards };
  };

  const byEnergy = await endsOf("energy");
  const costs = byEnergy.page1.map((c) => c.energyCost);
  expect(ascending(costs), `sort=energy is not ascending: ${costs.slice(0, 12).join(", ")}`);
  expect(
    byEnergy.first?.energyCost === 0,
    `sort=energy should open at cost 0, got ${byEnergy.first?.energyCost}`,
  );
  // Costless cards go last, not first. Nulls-first would still look "ascending"
  // across a first page made entirely of nulls.
  expect(
    byEnergy.last?.energyCost === null,
    `sort=energy should end with the costless cards, got ${byEnergy.last?.energyCost}`,
  );

  const byName = await searchCards({ sort: "name", allPrintings: true });
  const names = byName.cards.map((c) => c.name);
  expect(
    names.every((n, i) => i === 0 || n.localeCompare(names[i - 1]) >= 0),
    `sort=name is not alphabetical: ${names.slice(0, 5).join(", ")}`,
  );

  // Rarity and type sort by the game's order, which is NOT alphabetical —
  // "Common, Epic, Rare" would pass a naive check and be wrong.
  const rankIn = (order: readonly string[], value: string) => {
    const i = order.indexOf(value);
    return i === -1 ? order.length : i;
  };

  /**
   * The highest canonical rank the pool actually contains.
   *
   * Ranks, not values, because a value the canonical list doesn't know sorts
   * *last* by design — `sortByCanonical`'s rule, so a new set's new rarity
   * appears without a code change. The pool already exercises it: `Promo` is a
   * real rarity and is not in `RARITIES`, so "ends at Showcase" is wrong and
   * "ends at the highest rank present" is right.
   */
  const maxRank = async (column: string, order: readonly string[]) => {
    const rows = await sql`select distinct ${sql(column)} as value from cards`;
    return Math.max(...rows.map((r) => rankIn(order, String(r.value))));
  };

  const byRarity = await endsOf("rarity");
  const rarityRanks = byRarity.page1.map((c) => {
    const i = (RARITIES as readonly string[]).indexOf(c.rarity);
    return i === -1 ? RARITIES.length : i;
  });
  expect(ascending(rarityRanks), `sort=rarity is not in the game's order`);
  expect(
    byRarity.first?.rarity === "Common",
    `sort=rarity should lead with Common, got ${byRarity.first?.rarity}`,
  );
  // The endpoint is the assertion that has teeth: alphabetically the pool ends
  // at Uncommon, canonically at the highest rank present, and both start at
  // Common — so a first-page check cannot tell the two apart.
  const lastRarityRank = await maxRank("rarity", RARITIES);
  expect(
    rankIn(RARITIES, byRarity.last?.rarity ?? "") === lastRarityRank,
    `sort=rarity should end at the game's last rarity (rank ${lastRarityRank}), got ` +
      `${byRarity.last?.rarity} (rank ${rankIn(RARITIES, byRarity.last?.rarity ?? "")}) ` +
      `— alphabetical would end at Uncommon`,
  );

  const byType = await endsOf("type");
  const typeRanks = byType.page1.map((c) => {
    const i = (CARD_TYPE_ORDER as readonly string[]).indexOf(c.type);
    return i === -1 ? CARD_TYPE_ORDER.length : i;
  });
  expect(ascending(typeRanks), `sort=type is not in the game's order`);
  expect(
    byType.first?.type === "Unit",
    `sort=type should lead with Unit, got ${byType.first?.type}`,
  );
  const lastTypeRank = await maxRank("type", CARD_TYPE_ORDER);
  expect(
    rankIn(CARD_TYPE_ORDER, byType.last?.type ?? "") === lastTypeRank,
    `sort=type should end at the game's last type (rank ${lastTypeRank}), got ` +
      `${byType.last?.type}`,
  );
  // A type in the data that CARD_TYPE_ORDER doesn't list would sort into the
  // fallback bucket and read as a bug in the ordering rather than a new set.
  const unranked = await sql`
    select distinct type from cards where type <> all(${sql.array([...CARD_TYPE_ORDER])})`;
  expect(
    unranked.length === 0,
    `CARD_TYPE_ORDER is out of step with cards.type: ${unranked.map((r) => r.type).join(", ")}`,
  );

  // Default is the printed order, and must not silently become something else.
  const byDefault = await searchCards({ allPrintings: true });
  expect(
    byDefault.cards[0]?.setCode === (await searchCards({ sort: "set", allPrintings: true })).cards[0]?.setCode,
    "the default sort should be the printed order",
  );

  // ---- the URLs the filters are actually reached by ---------------------
  // Repeated params are how a plain HTML form submits a checkbox group, so the
  // no-JS path and the router must parse to the same thing.
  const parsed = cardFiltersFromParams({
    domain: ["Fury", "Calm"],
    set: "OGN",
    energy: ["2", "9+"],
    sort: "energy",
  });
  expect(
    parsed.domains?.length === 2 && parsed.sets?.length === 1,
    `repeated params should parse as lists, got ${JSON.stringify(parsed)}`,
  );
  expect(parsed.sort === "energy", `sort should survive parsing, got ${parsed.sort}`);

  // A pre-multi-select link still means what it did.
  const legacy = cardFiltersFromParams({ domain: "Fury" });
  expect(
    (await found(legacy)) === fury,
    `the old single-value URL must still work: expected ${fury}`,
  );

  // A junk sort must not reach the ORDER BY builder.
  expect(
    cardFiltersFromParams({ sort: "'; drop table cards --" }).sort === undefined,
    "an unrecognized sort must be dropped, not passed through",
  );

  console.log(
    `card filters: ${total} printings — Fury ${fury}, Calm ${calm}, both ${both}, ` +
      `either ${either}; energy buckets sum ${bucketSum}`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  await sql.end();
}

if (failures.length > 0) {
  console.error(`card filter check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("card filter check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
