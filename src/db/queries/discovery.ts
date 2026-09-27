import { and, desc, eq, exists, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "..";
import { cards, cubeCards, cubeFollows, cubes, users } from "../schema";
import { collapseKeyOf, realCard } from "./cards";
import { cubeCoverImageSql, type CubeVisibility } from "./cubes";
import {
  type CubeCardSet,
  type PopularitySnapshot,
  STATS_MIN_CARDS,
  summarise,
} from "@/lib/card-popularity";

/**
 * Finding cubes, and following them.
 *
 * **Explore lists public cubes only.** Unlisted means "reachable by link but
 * not advertised", so putting one in a search result would defeat the setting;
 * private is never visible to anyone but its owner. That rule lives here rather
 * than in the page so a second caller cannot forget it.
 */

export const CUBES_PAGE_SIZE = 20;

export type CubeSort = "follows" | "updated";

export interface CubeSearchResult {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: CubeVisibility;
  ownerUsername: string;
  updatedAt: Date;
  cardCount: number;
  followers: number;
  /** The cube's cover art, falling back to a card from it. Null when empty. */
  coverImage: string | null;
  /** Whether the *viewer* follows it; false when signed out. */
  following: boolean;
}

export interface CubeSearchOptions {
  /** Matched against name, description and primer. */
  keywords?: string;
  /** Only cubes holding a card whose name matches this. */
  cardName?: string;
  sort?: CubeSort;
  limit?: number;
  offset?: number;
  /** Whose follow state to report. */
  viewerId?: string | null;
  /** Restrict to one owner, for the "your cubes" listings. */
  ownerId?: string;
  /** Restrict to cubes this user follows. */
  followedBy?: string;
  /** Explore passes false; the owner's own listings pass true. */
  includeNonPublic?: boolean;
  /** Only cubes holding at least this many cards, maybeboard excluded. */
  minCards?: number;
  /**
   * Skip the cover art and return `coverImage: null`. The cover subquery is
   * most of what this query costs (see page-speed.md), so a list that shows
   * no art should not pay for it.
   */
  omitCover?: boolean;
}

/**
 * Every keyword must appear somewhere in the name, description or primer.
 *
 * AND across terms rather than OR: typing two words to narrow a list and
 * getting *more* results is the wrong surprise. Each term is matched as a
 * substring, which is enough at this scale and avoids committing to a
 * full-text configuration before we know what people search for.
 */
function keywordFilter(keywords: string | undefined) {
  const terms = (keywords ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return undefined;

  return and(
    ...terms.map((term) => {
      const pattern = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      return or(
        ilike(cubes.name, pattern),
        ilike(cubes.description, pattern),
        ilike(cubes.primer, pattern),
      );
    }),
  );
}

/**
 * Cubes holding a card whose name matches.
 *
 * An EXISTS rather than a join, so a cube running three copies or two
 * printings still appears once. The maybeboard is excluded: it is a shortlist
 * of cards someone is *considering*, and "which cubes run this card" should
 * not answer with cubes that don't.
 */
function cardFilter(cardName: string | undefined) {
  const term = (cardName ?? "").trim();
  if (!term) return undefined;
  const pattern = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;

  return exists(
    db
      .select({ one: sql`1` })
      .from(cubeCards)
      .innerJoin(cards, eq(cards.id, cubeCards.cardId))
      .where(
        and(
          eq(cubeCards.cubeId, cubes.id),
          ne(cubeCards.section, "maybeboard"),
          ilike(cards.name, pattern),
        ),
      ),
  );
}

function conditions(options: CubeSearchOptions) {
  const parts = [
    // **Moderation applies to every list, unconditionally.** Not behind
    // `includeNonPublic`: that flag is what lets an owner see their own private
    // cubes on /cubes, and a hidden cube must drop out of that list too, or the
    // one place the owner looks still advertises it. Every listing on the site
    // — Explore, /cubes, a profile, the followed tab and the sitemap — goes
    // through here, which is exactly why the rule lives here and not in a page.
    isNull(cubes.hiddenAt),
    isNull(users.suspendedAt),
    options.includeNonPublic ? undefined : eq(cubes.visibility, "public"),
    options.ownerId ? eq(cubes.ownerId, options.ownerId) : undefined,
    keywordFilter(options.keywords),
    cardFilter(options.cardName),
    options.minCards ? sql`${cardCount} >= ${options.minCards}` : undefined,
    options.followedBy
      ? exists(
          db
            .select({ one: sql`1` })
            .from(cubeFollows)
            .where(
              and(
                eq(cubeFollows.cubeId, cubes.id),
                eq(cubeFollows.userId, options.followedBy),
              ),
            ),
        )
      : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? and(...parts) : undefined;
}

const followerCount = sql<number>`(
  select count(*)::int from ${cubeFollows} where ${cubeFollows.cubeId} = ${cubes.id}
)`;

const cardCount = sql<number>`(
  select coalesce(sum(${cubeCards.quantity}), 0)::int from ${cubeCards}
  where ${cubeCards.cubeId} = ${cubes.id} and ${cubeCards.section} <> 'maybeboard'
)`;

export async function searchCubes(
  options: CubeSearchOptions = {},
): Promise<CubeSearchResult[]> {
  const where = conditions(options);
  const viewerId = options.viewerId ?? null;

  const rows = await db
    .select({
      id: cubes.id,
      name: cubes.name,
      slug: cubes.slug,
      description: cubes.description,
      visibility: cubes.visibility,
      ownerUsername: users.username,
      updatedAt: cubes.updatedAt,
      cardCount,
      followers: followerCount,
      coverImage: options.omitCover ? sql<string | null>`null` : cubeCoverImageSql,
    })
    .from(cubes)
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .where(where)
    // Follows first when asked, then recency as the tie-break: among cubes
    // nobody follows yet, the freshest is the more useful answer.
    .orderBy(
      ...(options.sort === "follows"
        ? [desc(followerCount), desc(cubes.updatedAt)]
        : [desc(cubes.updatedAt)]),
    )
    .limit(options.limit ?? CUBES_PAGE_SIZE)
    .offset(options.offset ?? 0);

  if (rows.length === 0) return [];

  const followed = viewerId
    ? new Set(
        (
          await db
            .select({ cubeId: cubeFollows.cubeId })
            .from(cubeFollows)
            .where(
              and(
                eq(cubeFollows.userId, viewerId),
                inArray(cubeFollows.cubeId, rows.map((row) => row.id)),
              ),
            )
        ).map((row) => row.cubeId),
      )
    : new Set<string>();

  return rows.map((row) => ({ ...row, following: followed.has(row.id) }));
}

/**
 * A page of cubes and the total, together.
 *
 * The two queries are independent, and running them in sequence cost a whole
 * extra Supabase round trip on every cube list on the site. The page clamp has
 * to happen *after* the count, so the caller passes the requested page and gets
 * the resolved one back rather than awaiting the count first.
 */
export async function searchCubesPage(
  options: CubeSearchOptions & { page?: number } = {},
): Promise<{ cubes: CubeSearchResult[]; total: number; page: number; pageCount: number }> {
  const limit = options.limit ?? CUBES_PAGE_SIZE;
  const requested = Math.max(1, options.page ?? 1);

  const [firstGuess, total] = await Promise.all([
    searchCubes({ ...options, limit, offset: (requested - 1) * limit }),
    countCubes(options),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requested, pageCount);

  // An out-of-range ?page= clamps rather than 404s — deleting the last cube on
  // a page still lands somewhere real. Only that case pays for a second query.
  const cubes =
    page === requested
      ? firstGuess
      : await searchCubes({ ...options, limit, offset: (page - 1) * limit });

  return { cubes, total, page, pageCount };
}

/**
 * Just enough to build a sitemap entry, for as many cubes as it asks for.
 *
 * Deliberately not `searchCubes`: that selects a cover image and a follower
 * count as correlated subqueries per row, which is right for a page of twenty
 * and wasteful for two thousand. A crawler needs a URL and a date. Public only,
 * by the same `visibility` rule as everything else here.
 */
/**
 * Cubes worth crawling: public, and holding at least `SITEMAP_MIN_CARDS`.
 *
 * The floor is the point. A near-empty cube is thin content — the page is a
 * name, a byline and nothing to read — and on a site this size a handful of
 * them is a large share of everything indexable, which drags the whole domain.
 * Two abandoned test cubes were a sixth of the sitemap. Submitting a page is a
 * claim that it is worth reading, so the sitemap makes that claim only where
 * it is true; the cubes themselves stay reachable and public either way.
 */
export const SITEMAP_MIN_CARDS = 20;

export async function listPublicCubesForSitemap(
  limit: number,
): Promise<{ slug: string; ownerUsername: string; updatedAt: Date }[]> {
  return db
    .select({
      slug: cubes.slug,
      ownerUsername: users.username,
      updatedAt: cubes.updatedAt,
    })
    .from(cubes)
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .where(
      and(
        eq(cubes.visibility, "public"),
        sql`${cardCount} >= ${SITEMAP_MIN_CARDS}`,
      ),
    )
    .orderBy(desc(cubes.updatedAt))
    .limit(limit);
}

/**
 * A basic rune, which nobody chose to cube.
 *
 * Every rune deck is basics, so counting them would put six cards at the top of
 * every pairing list on the site saying nothing. Kept local rather than beside
 * `realCard`: this is the popularity reader's idea of "a card someone picked",
 * not the site's idea of what a card is, and the browser is right to show them.
 *
 * `is distinct from`, not `<>`, for the same reason `tokenCard` needs it — an
 * ordinary card's supertype is null, and `null <> 'Basic'` is null, which would
 * drop the entire pool. Outer column qualified by hand, so `cards` must be in
 * scope unaliased.
 */
const notBasicRune = sql`("cards"."supertype" is distinct from 'Basic')`;

/**
 * Every cube in the statistics denominator, reduced to the set of cards it
 * holds — one row per cube, one statement.
 *
 * **Through `conditions()`, deliberately, and never through `searchCubes`.**
 * The percentages are computed over cubes their owners marked private, so the
 * one thing that must not slip is the moderation exclusion: a hidden cube or a
 * suspended owner's cube counting toward a published number would be
 * moderation that did not take. `conditions()` is where that rule lives for
 * every listing on the site, and reusing it means the popularity numbers cannot
 * drift from it. `searchCubes` would also drag the cover-image subquery in per
 * row, which is most of what that query costs and all of it wasted here.
 *
 * What the joins decide, each one a rule from the brief:
 *  - `includeNonPublic` puts private and unlisted cubes in. They are the bulk
 *    of the pool, and leaving them out would make the numbers describe the
 *    handful of people who publish rather than the format.
 *  - `minCards` is the `STATS_MIN_CARDS` floor, over the same quantity-aware,
 *    maybeboard-excluding count every cube list on the site shows.
 *  - the maybeboard is out again at the join, because it is a shortlist of
 *    cards someone is *considering*; `array_agg(distinct …)` then collapses
 *    quantity and printings, so a cube running three foil copies counts once.
 *  - tokens and basic runes are nobody's pick.
 *
 * The correlated `cardCount` inside `conditions()` stays correct even though
 * the outer query now joins `cube_cards` itself: the subquery's own `from
 * cube_cards` shadows the outer range variable, while `cubes` still correlates
 * outward. Worth knowing before adding a second join here.
 */
export async function readCubeCardSets(): Promise<CubeCardSet[]> {
  return db
    .select({
      cubeId: cubes.id,
      ownerId: cubes.ownerId,
      keys: sql<string[]>`array_agg(distinct ${collapseKeyOf(cards.name, cards.type)})`,
    })
    .from(cubes)
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .innerJoin(cubeCards, eq(cubeCards.cubeId, cubes.id))
    .innerJoin(cards, eq(cards.id, cubeCards.cardId))
    .where(
      and(
        conditions({ includeNonPublic: true, minCards: STATS_MIN_CARDS }),
        ne(cubeCards.section, "maybeboard"),
        realCard,
        notBasicRune,
      ),
    )
    .groupBy(cubes.id, cubes.ownerId);
}

/**
 * An hour, against five minutes for the card pool.
 *
 * This describes what people have *built*, which moves as they edit, so it
 * cannot be pinned to the sync the way the filter options are. But it is a
 * whole-table read, and nothing on screen is wrong for being an hour behind:
 * a percentage over hundreds of cubes does not visibly move when one card is
 * added. A new card's first appearance shows up within the hour.
 */
const POPULARITY_TTL_MS = 60 * 60_000;

let popularityMemo: { at: number; value: PopularitySnapshot } | null = null;
let popularityInFlight: Promise<PopularitySnapshot> | null = null;

/**
 * How often every card is cubed, memoised, with concurrent callers sharing one
 * read.
 *
 * **The in-flight promise is not an optimisation, it is the whole point.** A
 * TTL alone only deduplicates calls that arrive after the first has *finished*.
 * The path that matters is the editor's browse tab, where a reader adds cards
 * one after another and each render asks again — the same burst of concurrent
 * reads against a pool of six that took the site down in August, and this one
 * scans every cube in the database rather than a page of sixty. Without the
 * coalescing, a cold instance under that burst fires the whole-table read once
 * per request in flight.
 *
 * It **throws** rather than returning an empty snapshot, matching
 * `getFilterOptions`: a silent zero here would render "In 0% of cubes" under
 * every card, which is a wrong statement rather than a missing one. Callers
 * that would rather degrade than fail — `sitemap.ts` — catch it themselves.
 *
 * The snapshot is shared between requests, so **nothing may mutate it**.
 */
export async function getCardPopularity(): Promise<PopularitySnapshot> {
  if (popularityMemo && Date.now() - popularityMemo.at < POPULARITY_TTL_MS) {
    return popularityMemo.value;
  }
  if (popularityInFlight) return popularityInFlight;

  popularityInFlight = (async () => {
    try {
      const value = summarise(await readCubeCardSets());
      popularityMemo = { at: Date.now(), value };
      return value;
    } finally {
      // Cleared on failure too, so one bad read does not wedge every later
      // caller onto a rejected promise for the rest of the instance's life.
      popularityInFlight = null;
    }
  })();
  return popularityInFlight;
}

/**
 * Forget the snapshot. **For checks only.**
 *
 * `check:moderation` hides a cube and asserts it stops counting, which an hour
 * of memo would otherwise hide for the whole run. Nothing in `src/` calls this:
 * the app has no event that should invalidate a statistic early, and giving it
 * one would mean deciding what does.
 */
export function resetCardPopularityMemo(): void {
  popularityMemo = null;
  popularityInFlight = null;
}

export async function countCubes(options: CubeSearchOptions = {}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cubes)
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .where(conditions(options));
  return row?.n ?? 0;
}

/**
 * The follower count and whether the viewer is one of them, in one round trip.
 *
 * Supabase is remote, so a query costs about 60ms whatever it asks for and the
 * page's cost is the number of trips it makes in a row. These two always want
 * the same row set, so asking twice was 60ms of pure latency for nothing.
 *
 * `viewerId` null — signed out, or the owner, who gets no follow control —
 * still returns the count, because the byline shows it.
 */
export async function getFollowState(
  cubeId: string,
  viewerId: string | null,
): Promise<{ followers: number; following: boolean }> {
  const [row] = await db
    .select({
      followers: sql<number>`count(*)::int`,
      following: viewerId
        ? sql<boolean>`bool_or(${cubeFollows.userId} = ${viewerId})`
        : sql<boolean>`false`,
    })
    .from(cubeFollows)
    .where(eq(cubeFollows.cubeId, cubeId));
  // `bool_or` over no rows is null, not false.
  return { followers: row?.followers ?? 0, following: row?.following ?? false };
}

/** Idempotent: following twice leaves one row. */
export async function followCube(cubeId: string, userId: string): Promise<void> {
  await db.insert(cubeFollows).values({ cubeId, userId }).onConflictDoNothing();
}

export async function unfollowCube(cubeId: string, userId: string): Promise<void> {
  await db
    .delete(cubeFollows)
    .where(and(eq(cubeFollows.cubeId, cubeId), eq(cubeFollows.userId, userId)));
}
