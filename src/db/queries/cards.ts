import {
  and,
  arrayContains,
  count,
  countDistinct,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "..";
import { cards } from "../schema";
import { CARD_TYPES, DOMAINS, COLORLESS, RARITIES, sortByCanonical } from "@/lib/riftbound";

export const PAGE_SIZE = 60;

export interface CardFilters {
  q?: string;
  set?: string;
  domain?: string;
  type?: string;
  rarity?: string;
  page?: number;
  /** Show every printing instead of one row per base printing. */
  allPrintings?: boolean;
}

/** Columns the browser needs; the raw `data` payload stays out of the page. */
export const browseColumns = {
  id: cards.id,
  baseId: cards.baseId,
  name: cards.name,
  setCode: cards.setCode,
  collectorNo: cards.collectorNo,
  rarity: cards.rarity,
  type: cards.type,
  domains: cards.domains,
  energyCost: cards.energyCost,
  powerCost: cards.powerCost,
  might: cards.might,
  rulesText: cards.rulesText,
  keywords: cards.keywords,
  artist: cards.artist,
  imageFull: cards.imageFull,
  imageThumb: cards.imageThumb,
};

export type BrowseCard = {
  [K in keyof typeof browseColumns]: (typeof cards.$inferSelect)[K];
} & {
  /** How many printings of this card matched the current filters. */
  printingCount: number;
};

export interface FilterOptions {
  sets: string[];
  domains: string[];
  types: string[];
  rarities: string[];
}

/** Escapes LIKE wildcards so a name search for "50%" isn't a wildcard. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Rules text with symbol tokens expanded so searching "might", "fury power" or
 * "2 energy" hits cards whose text only contains `:rb_might:` etc.
 *
 * This is a structural transform rather than a lookup table, so a token from a
 * future set becomes searchable by its own name with no code change. Keep it
 * roughly in step with `rulesTextToPlain` in src/lib/rules-text.ts, which does
 * the same job for display.
 */
const rulesSearchText = sql`
  regexp_replace(
    regexp_replace(
      regexp_replace(
        replace(coalesce(${cards.rulesText}, ''), ':rb_rune_rainbow:', ' wild power '),
        ':rb_energy_([0-9]+):', ' \\1 energy ', 'g'),
      ':rb_rune_([a-z]+):', ' \\1 power ', 'g'),
    ':rb_([a-z0-9_]+):', ' \\1 ', 'g')`;

function buildWhere(filters: CardFilters): SQL | undefined {
  const clauses: SQL[] = [];
  const term = filters.q?.trim();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    const nameOrRules = or(
      ilike(cards.name, pattern),
      sql`${rulesSearchText} ilike ${pattern}`,
    );
    if (nameOrRules) clauses.push(nameOrRules);
  }
  if (filters.set) clauses.push(eq(cards.setCode, filters.set));
  if (filters.type) clauses.push(eq(cards.type, filters.type));
  if (filters.rarity) clauses.push(eq(cards.rarity, filters.rarity));
  if (filters.domain) clauses.push(arrayContains(cards.domains, [filters.domain]));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function searchCards(
  filters: CardFilters,
): Promise<{ cards: BrowseCard[]; total: number; page: number; pageCount: number }> {
  const where = buildWhere(filters);
  const grouped = !filters.allPrintings;

  const [{ value: total }] = await db
    .select({ value: grouped ? countDistinct(cards.baseId) : count() })
    .from(cards)
    .where(where);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const offset = (page - 1) * PAGE_SIZE;

  // Printings matching the current filters, so a tile can say "2 printings".
  // Needs an explicit alias to be referenced back out of the subquery below.
  const printingCount = sql<number>`count(*) over (partition by ${cards.baseId})::int`.as(
    "printing_count",
  );

  // Set, then collector number. length() before the value sorts numeric strings
  // numerically without a cast, which would throw on token ids like UNL-T01.
  const displayOrder = (col: {
    setCode: unknown;
    collectorNo: unknown;
    id: unknown;
  }) => [
    col.setCode as never,
    sql`length(${col.collectorNo})`,
    col.collectorNo as never,
    col.id as never,
  ];

  if (!grouped) {
    const rows = await db
      .select({ ...browseColumns, printingCount })
      .from(cards)
      .where(where)
      .orderBy(...displayOrder(cards))
      .limit(PAGE_SIZE)
      .offset(offset);
    return { cards: rows, total, page, pageCount };
  }

  // One row per base printing. DISTINCT ON requires its own leading ORDER BY,
  // so the display ordering happens in the outer query. Preferring the row
  // where id = base_id keeps the base printing as the representative, and
  // still yields a row if a set ever ships a variant without its base.
  const representative = db
    .selectDistinctOn([cards.baseId], { ...browseColumns, printingCount })
    .from(cards)
    .where(where)
    .orderBy(cards.baseId, sql`(${cards.id} = ${cards.baseId}) desc`, cards.id)
    .as("representative");

  const rows = await db
    .select()
    .from(representative)
    .orderBy(...displayOrder(representative))
    .limit(PAGE_SIZE)
    .offset(offset);

  return { cards: rows as BrowseCard[], total, page, pageCount };
}

/**
 * Small, fast name search for the cube editor's type-ahead. Collapsed to one
 * row per card, with prefix matches ahead of substring matches so typing
 * "poro" surfaces "Poro Herder" before "Plundering Poro".
 */
export async function quickSearchCards(query: string, limit = 12): Promise<BrowseCard[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const pattern = `%${escapeLike(term)}%`;
  const prefix = `${escapeLike(term)}%`;

  const printingCount = sql<number>`count(*) over (partition by ${cards.baseId})::int`.as(
    "printing_count",
  );

  const grouped = db
    .selectDistinctOn([cards.baseId], { ...browseColumns, printingCount })
    .from(cards)
    .where(ilike(cards.name, pattern))
    .orderBy(cards.baseId, sql`(${cards.id} = ${cards.baseId}) desc`, cards.id)
    .as("grouped");

  return db
    .select()
    .from(grouped)
    .orderBy(sql`(${grouped.name} ilike ${prefix}) desc`, grouped.name, grouped.id)
    .limit(limit);
}

/** Every printing of each of the given cards, base printing first. */
export async function getPrintingsForBases(baseIds: string[]): Promise<BrowseCard[]> {
  if (baseIds.length === 0) return [];
  return db
    .select({
      ...browseColumns,
      printingCount: sql<number>`count(*) over (partition by ${cards.baseId})::int`,
    })
    .from(cards)
    .where(inArray(cards.baseId, baseIds))
    .orderBy(cards.baseId, sql`(${cards.id} = ${cards.baseId}) desc`, cards.id);
}

export async function getCardById(id: string): Promise<BrowseCard | null> {
  const [card] = await db
    .select({ ...browseColumns, printingCount: sql<number>`1::int` })
    .from(cards)
    .where(eq(cards.id, id))
    .limit(1);
  return card ?? null;
}

/**
 * Distinct filter values straight from the card pool, so a newly synced set
 * shows up without a code change. Ordered by the game's canonical sequences
 * rather than alphabetically.
 */
export async function getFilterOptions(): Promise<FilterOptions> {
  const [sets, domains, types, rarities] = await Promise.all([
    db.selectDistinct({ value: cards.setCode }).from(cards),
    db.execute<{ value: string }>(
      sql`select distinct unnest(${cards.domains}) as value from ${cards}`,
    ),
    db.selectDistinct({ value: cards.type }).from(cards),
    db.selectDistinct({ value: cards.rarity }).from(cards),
  ]);

  const values = (rows: Iterable<{ value: string }>) =>
    [...rows].map((r) => r.value).filter(Boolean);

  return {
    sets: values(sets).sort(),
    domains: sortByCanonical(values(domains), [...DOMAINS, COLORLESS]),
    types: sortByCanonical(values(types), CARD_TYPES),
    rarities: sortByCanonical(values(rarities), RARITIES),
  };
}

/**
 * Every canonical printing, for the bulk importer to match names against.
 *
 * Only base printings (`id = base_id`), because an import resolves a name to a
 * card and the base printing is what "the card" means here — alt arts are
 * chosen per copy afterwards. ~966 rows, small enough to match in memory,
 * which keeps the matching rules pure and testable in src/lib/import-list.ts.
 */
export async function getImportCatalog(): Promise<
  { id: string; name: string; type: string }[]
> {
  return db
    .select({ id: cards.id, name: cards.name, type: cards.type })
    .from(cards)
    .where(eq(cards.id, cards.baseId))
    .orderBy(cards.name);
}

/** Looks up several cards by id, for validating a confirmed import. */
export async function getCardsByIds(
  ids: string[],
): Promise<{ id: string; name: string; type: string }[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: cards.id, name: cards.name, type: cards.type })
    .from(cards)
    .where(inArray(cards.id, ids));
}
