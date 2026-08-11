import { and, desc, eq, exists, ilike, inArray, ne, or, sql } from "drizzle-orm";

import { db } from "..";
import { cards, cubeCards, cubeFollows, cubes, users } from "../schema";
import type { CubeVisibility } from "./cubes";

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

export async function countCubes(options: CubeSearchOptions = {}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cubes)
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .where(conditions(options));
  return row?.n ?? 0;
}

export async function isFollowing(cubeId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql`1` })
    .from(cubeFollows)
    .where(and(eq(cubeFollows.cubeId, cubeId), eq(cubeFollows.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function countFollowers(cubeId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cubeFollows)
    .where(eq(cubeFollows.cubeId, cubeId));
  return row?.n ?? 0;
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
