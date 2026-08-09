import { eq } from "drizzle-orm";

import { db } from "..";
import { users, type User } from "../schema";

export async function getProfileById(id: string): Promise<User | null> {
  const [profile] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return profile ?? null;
}

export async function getProfileByUsername(username: string): Promise<User | null> {
  const [profile] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return profile ?? null;
}

/** Postgres unique_violation, raised when two people race for a username. */
const UNIQUE_VIOLATION = "23505";

interface PgError {
  code?: string;
  constraint_name?: string;
}

/**
 * Drizzle wraps driver errors in a DrizzleQueryError, so the Postgres error
 * code lives on the cause rather than the thrown error itself.
 */
function pgError(error: unknown): PgError {
  let current = error as (PgError & { cause?: unknown }) | undefined;
  while (current && !current.code && current.cause) {
    current = current.cause as PgError & { cause?: unknown };
  }
  return current ?? {};
}

export type ClaimResult =
  | { ok: true; profile: User }
  | { ok: false; error: string };

/**
 * Claims a username for an authenticated user. Relies on the unique index
 * rather than a check-then-insert, so a race ends in a clean error instead of
 * two profiles with the same name.
 */
export async function claimUsername(
  userId: string,
  username: string,
): Promise<ClaimResult> {
  try {
    const [profile] = await db
      .insert(users)
      .values({ id: userId, username })
      .returning();
    return { ok: true, profile };
  } catch (error) {
    const { code, constraint_name } = pgError(error);
    if (code === UNIQUE_VIOLATION) {
      // The primary key is the user id, so a pkey collision means this account
      // already has a profile rather than the name being taken.
      return constraint_name?.includes("pkey")
        ? { ok: false, error: "You have already claimed a username." }
        : { ok: false, error: "That username is taken." };
    }
    throw error;
  }
}
