import {
  and,
  arrayContains,
  count,
  countDistinct,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

import { db } from "..";
import { cards } from "../schema";
import {
  CARD_TYPE_ORDER,
  CARD_TYPES,
  type CardSort,
  COLORLESS,
  DOMAINS,
  ENERGY_HIGH,
  ENERGY_MAX_BUCKET,
  ENERGY_NONE,
  RARITIES,
  REGIONS,
  sortByCanonical,
} from "@/lib/riftbound";

export const PAGE_SIZE = 60;

/**
 * The active filters.
 *
 * Set, domain, rarity and energy are **multi-select and OR within themselves**,
 * and AND across each other: picking Fury and Calm asks for cards in either,
 * picking Fury and Common asks for Fury commons. OR is what people mean when
 * they tick two domains — an AND would return only dual-domain Fury/Calm cards,
 * which is a much rarer question and one the trait filter shape already covers.
 *
 * The URL keys stay singular and repeat (`?domain=Fury&domain=Calm`) rather than
 * becoming `domains`, so links shared before multi-select existed still work.
 */
export interface CardFilters {
  q?: string;
  sets?: string[];
  domains?: string[];
  type?: string;
  rarities?: string[];
  /** Bucket keys from `ENERGY_BUCKETS`: "0".."8", "9+", "none". */
  energy?: string[];
  /** A single value from `cards.tags` — a region, creature type or champion. */
  trait?: string;
  sort?: CardSort;
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
  // Needed wherever a card is described as a reader thinks of it: "Champion
  // Unit" is `type` Unit plus `supertype` Champion, and analytics that grouped
  // by `type` alone would fold 323 champions in with ordinary units.
  supertype: cards.supertype,
  domains: cards.domains,
  energyCost: cards.energyCost,
  powerCost: cards.powerCost,
  might: cards.might,
  rulesText: cards.rulesText,
  // `cards.keywords` is deliberately NOT selected: it is empty on every row and
  // no source has ever populated it, so it was a column fetched on every card
  // query and read by nothing. The keywords people actually see come from the
  // bracketed markers in `rulesText` — see "Analytics" in CLAUDE.md. The column
  // and the sync's writes stay, so a future source that fills it loses nothing;
  // add it back here when something reads it.
  tags: cards.tags,
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

/** A set as the filter offers it: the code stays the value, the label is for
 *  reading. "SFD" tells you nothing until you know it means Spiritforged. */
export interface SetOption {
  code: string;
  label: string;
}

export interface FilterOptions {
  sets: SetOption[];
  domains: string[];
  types: string[];
  rarities: string[];
  /** Grouped for the dropdown: 127 flat entries, 95 of them champion names,
   *  is a list nobody can find anything in. */
  traits: { regions: string[]; traits: string[]; champions: string[] };
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

/**
 * One energy bucket as a condition. "9+" is open-ended and "none" is NULL —
 * neither is an equality, which is why this is a switch rather than an
 * `inArray` over the numbers.
 */
function energyCondition(bucket: string): SQL | undefined {
  if (bucket === ENERGY_NONE) return isNull(cards.energyCost);
  if (bucket === ENERGY_HIGH) return gte(cards.energyCost, ENERGY_MAX_BUCKET + 1);
  const value = Number(bucket);
  return Number.isInteger(value) ? eq(cards.energyCost, value) : undefined;
}

function buildWhere(filters: CardFilters): SQL | undefined {
  const clauses: SQL[] = [];
  const term = filters.q?.trim();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    const nameOrRules = or(
      ilike(cards.name, pattern),
      sql`${rulesSearchText} ilike ${pattern}`,
      // Traits are the type line's second half, and people search them the way
      // they read them — "PILTOVER", "Pirate". Matching the array as joined
      // text keeps that one `ilike`, and case-insensitively, since the stored
      // values are title-cased and nobody types them that way.
      sql`array_to_string(${cards.tags}, ' ') ilike ${pattern}`,
    );
    if (nameOrRules) clauses.push(nameOrRules);
  }
  if (filters.sets?.length) clauses.push(inArray(cards.setCode, filters.sets));
  if (filters.type) clauses.push(eq(cards.type, filters.type));
  if (filters.rarities?.length) clauses.push(inArray(cards.rarity, filters.rarities));

  // Any of the ticked domains, not all of them — see the note on CardFilters.
  // Array containment per domain rather than overlap, so the semantics match
  // the single-domain filter this replaced exactly.
  if (filters.domains?.length) {
    const any = or(...filters.domains.map((d) => arrayContains(cards.domains, [d])));
    if (any) clauses.push(any);
  }

  if (filters.energy?.length) {
    const buckets = filters.energy
      .map(energyCondition)
      .filter((c): c is SQL => c !== undefined);
    const any = or(...buckets);
    if (any) clauses.push(any);
  }

  // Exact containment, not a substring: the dropdown offers real values, and
  // "Zaun" must not also match a future "Zaunite".
  if (filters.trait) clauses.push(arrayContains(cards.tags, [filters.trait]));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

/**
 * Ranks a column against a canonical list, so "sort by rarity" means the game's
 * order rather than alphabetical — Common before Uncommon before Rare, not
 * Common, Epic, Rare. Anything unrecognized sorts last instead of failing,
 * which is the same rule `sortByCanonical` follows for the dropdowns.
 */
function canonicalRank(column: SQL | SQLWrapper, order: readonly string[]): SQL {
  const whens = order.map((value, index) => sql`when ${value} then ${index}`);
  return sql`(case ${column} ${sql.join(whens, sql` `)} else ${order.length} end)`;
}

type CardSearchResult = {
  cards: BrowseCard[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * The unfiltered first page, memoised.
 *
 * `/cards` with nothing set is the same 60 rows for every visitor and is the
 * page people land on, so it was the most repeated query on the site — and it
 * counts across all 1,288 rows before returning any of them. The cache is
 * deliberately **only** the default view: two entries at most (grouped and all
 * printings), no key-building, no way for a crafted querystring to grow it.
 * Anything with a filter, a sort or a page number reads through as before.
 *
 * Same TTL and same reasoning as the filter options: this describes the card
 * pool, which changes only when `sync-cards` runs.
 *
 * The cached object is shared between requests, so **nothing may mutate it**.
 * Callers render it and nothing more; if that ever changes, copy on read.
 */
const defaultBrowseMemo = new Map<string, { at: number; value: CardSearchResult }>();

/** True when the filters are the bare `/cards` view — no filter, sort or page. */
function isDefaultBrowse(filters: CardFilters): boolean {
  return (
    !filters.q &&
    !filters.sets?.length &&
    !filters.domains?.length &&
    !filters.rarities?.length &&
    !filters.energy?.length &&
    !filters.type &&
    !filters.trait &&
    !filters.sort &&
    (filters.page ?? 1) === 1
  );
}

export async function searchCards(filters: CardFilters): Promise<CardSearchResult> {
  if (isDefaultBrowse(filters)) {
    const key = filters.allPrintings ? "all" : "grouped";
    const hit = defaultBrowseMemo.get(key);
    if (hit && Date.now() - hit.at < CARD_POOL_TTL_MS) return hit.value;
    const value = await runSearchCards(filters);
    defaultBrowseMemo.set(key, { at: Date.now(), value });
    return value;
  }
  return runSearchCards(filters);
}

async function runSearchCards(filters: CardFilters): Promise<CardSearchResult> {
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

  const sort = filters.sort ?? "set";

  /**
   * The ORDER BY for a sort, over either `cards` or the grouped subquery.
   *
   * Every ordering ends with the printed order as its tie-break, so equal
   * values (and there are many — 220 cards cost 2) come out in a stable,
   * meaningful sequence rather than whatever the plan happens to produce.
   * length() before the value sorts numeric strings numerically without a
   * cast, which would throw on token ids like UNL-T01.
   */
  const orderFor = (col: {
    setCode: unknown;
    collectorNo: unknown;
    id: unknown;
    name: unknown;
    energyCost: unknown;
    type: unknown;
    rarity: unknown;
  }) => {
    const printed = [
      col.setCode as never,
      sql`length(${col.collectorNo})`,
      col.collectorNo as never,
      col.id as never,
    ];
    switch (sort) {
      case "name":
        return [col.name as never, ...printed];
      // Costless cards last rather than first: they have no cost at all, so
      // leading with them would read as a pile of zero-drops.
      case "energy":
        return [sql`${col.energyCost} asc nulls last`, col.name as never, ...printed];
      case "type":
        return [canonicalRank(col.type as SQLWrapper, CARD_TYPE_ORDER), ...printed];
      case "rarity":
        return [canonicalRank(col.rarity as SQLWrapper, RARITIES), ...printed];
      default:
        return printed;
    }
  };

  if (!grouped) {
    const rows = await db
      .select({ ...browseColumns, printingCount })
      .from(cards)
      .where(where)
      .orderBy(...orderFor(cards))
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
    .orderBy(...orderFor(representative))
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
 * How long anything derived from the card pool is reused before being read
 * again — the filter options and the unfiltered first page of the browser.
 *
 * They describe the *card pool*, which changes only when `sync-cards` runs —
 * measured in months, not requests. Six queries were being fired on every
 * `/cards` load and on every re-render of the editor's browse tab, which is
 * the tab you sit in while adding cards one after another. That burst is what
 * exhausted the connection pool in production.
 *
 * Deliberately an in-process memo rather than a framework cache: it needs no
 * revalidation story, cannot be wrong for longer than the TTL, and a cold
 * instance simply reads once. A new set appears within five minutes of the
 * sync without anyone doing anything.
 */
const CARD_POOL_TTL_MS = 5 * 60_000;
let filterOptionsMemo: { at: number; value: FilterOptions } | null = null;

/**
 * Distinct filter values straight from the card pool, so a newly synced set
 * shows up without a code change. Ordered by the game's canonical sequences
 * rather than alphabetically.
 */
export async function getFilterOptions(): Promise<FilterOptions> {
  const now = Date.now();
  if (filterOptionsMemo && now - filterOptionsMemo.at < CARD_POOL_TTL_MS) {
    return filterOptionsMemo.value;
  }
  const value = await readFilterOptions();
  filterOptionsMemo = { at: now, value };
  return value;
}

async function readFilterOptions(): Promise<FilterOptions> {
  const [sets, domains, types, rarities, tags, championTags] = await Promise.all([
    // The set's printed name comes out of the stored raw payload rather than a
    // lookup table here, so a newly synced set names itself — the same rule the
    // other dropdowns follow. `min()` because the grouping needs an aggregate;
    // every set has exactly one label. The six retired-source token rows have a
    // different payload shape and yield null, so the code stands in for them.
    db.execute<{ code: string; label: string | null }>(
      sql`select ${cards.setCode} as code,
                 min(${cards.data}->'card'->'set'->>'label') as label
          from ${cards}
          group by ${cards.setCode}
          order by ${cards.setCode}`,
    ),
    db.execute<{ value: string }>(
      sql`select distinct unnest(${cards.domains}) as value from ${cards}`,
    ),
    db.selectDistinct({ value: cards.type }).from(cards),
    db.selectDistinct({ value: cards.rarity }).from(cards),
    db.execute<{ value: string }>(
      sql`select distinct unnest(${cards.tags}) as value from ${cards}`,
    ),
    // A tag that names a champion is a champion tag. Derived rather than
    // listed, so a new set's champions group themselves.
    db.execute<{ value: string }>(
      sql`select distinct tag as value from ${cards}, unnest(${cards.tags}) as tag
          where tag in (select ${cards.champion} from ${cards} where ${cards.champion} is not null)`,
    ),
  ]);

  const values = (rows: Iterable<{ value: string }>) =>
    [...rows].map((r) => r.value).filter(Boolean);

  const allTags = values(tags);
  const champions = new Set(values(championTags));
  const regions = new Set<string>(REGIONS);

  return {
    // By printed name, not by code. The codes interleave the promo sets through
    // the real ones (JDG, OGN, OGS, OPP, PR…), which reads as no order at all;
    // by name the main sets and the "Riftbound … Promotional" ones fall into
    // their own runs.
    sets: [...sets]
      .filter((row) => row.code)
      .map((row) => ({ code: row.code, label: row.label || row.code }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    domains: sortByCanonical(values(domains), [...DOMAINS, COLORLESS]),
    types: sortByCanonical(values(types), CARD_TYPES),
    rarities: sortByCanonical(values(rarities), RARITIES),
    traits: {
      regions: allTags.filter((t) => regions.has(t)).sort(),
      traits: allTags.filter((t) => !regions.has(t) && !champions.has(t)).sort(),
      champions: allTags.filter((t) => champions.has(t)).sort(),
    },
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
  { id: string; name: string; type: string; champion: string | null }[]
> {
  return db
    .select({
      id: cards.id,
      name: cards.name,
      type: cards.type,
      // Needed to reconstruct "Champion - Title", how vendor lists spell these.
      champion: cards.champion,
    })
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
