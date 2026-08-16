import { and, desc, eq, exists, ilike, inArray, ne, or, sql } from "drizzle-orm";

import { db } from "..";
import { cards, cubeCards, cubeFollows, cubes, users } from "../schema";
import { cubeCoverImageSql, type CubeVisibility } from "./cubes";

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
    options.includeNonPublic ? undefined : eq(cubes.visibility, "public"),
    options.ownerId ? eq(cubes.ownerId, options.ownerId) : undefined,
    keywordFilter(options.keywords),
    cardFilter(options.cardName),
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
      coverImage: cubeCoverImageSql,
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
