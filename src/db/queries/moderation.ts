import { desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "..";
import { cubes, moderationLog, users } from "../schema";

/**
 * Moderation writes, and the log that outlives them.
 *
 * **Hide and suspend are reversible; delete is not.** There is no
 * point-in-time recovery on this plan, so a wrong delete cannot be undone from
 * anywhere — which is why the reversible verbs are the ones the UI leads with
 * and why every action writes a `moderation_log` row with a snapshot first. For
 * a delete that snapshot is the only thing left afterwards.
 */

export type ModerationAction =
  | "cube_hidden"
  | "cube_unhidden"
  | "cube_deleted"
  | "user_suspended"
  | "user_unsuspended"
  | "user_deleted";

export interface ModerationEntry {
  actorId: string;
  actorUsername: string;
  action: ModerationAction;
  targetType: "cube" | "user";
  targetId: string;
  targetLabel: string;
  reason?: string | null;
  snapshot?: unknown;
}

/**
 * Records what happened.
 *
 * Unlike `recordCubeChange`, this does **not** swallow its failures. A cube
 * edit losing a log line is a cosmetic loss; a moderation action with no
 * record is the audit trail failing silently, and the caller writes the log
 * before acting so a throw here means the action does not happen.
 */
export async function logModeration(entry: ModerationEntry): Promise<void> {
  await db.insert(moderationLog).values({
    actorId: entry.actorId,
    actorUsername: entry.actorUsername,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    reason: entry.reason ?? null,
    snapshot: entry.snapshot ?? null,
  });
}

export async function setCubeHidden(
  cubeId: string,
  hidden: boolean,
  reason: string | null,
): Promise<void> {
  await db
    .update(cubes)
    .set({
      hiddenAt: hidden ? new Date() : null,
      hiddenReason: hidden ? reason : null,
      updatedAt: new Date(),
    })
    .where(eq(cubes.id, cubeId));
}

export async function setUserSuspended(userId: string, suspended: boolean): Promise<void> {
  await db
    .update(users)
    .set({ suspendedAt: suspended ? new Date() : null })
    .where(eq(users.id, userId));
}

/** Everything an account owns, for the snapshot taken before deleting it. */
export async function summarizeUser(userId: string): Promise<{
  username: string;
  cubeCount: number;
  cubeNames: string[];
  suspendedAt: Date | null;
} | null> {
  const [user] = await db
    .select({ username: users.username, suspendedAt: users.suspendedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const owned = await db
    .select({ name: cubes.name })
    .from(cubes)
    .where(eq(cubes.ownerId, userId))
    .orderBy(cubes.name);

  return {
    username: user.username,
    cubeCount: owned.length,
    // Capped: the snapshot is for reading afterwards, not for restoring, and a
    // 25-cube account should not write a wall of text into the log.
    cubeNames: owned.slice(0, 25).map((row) => row.name),
    suspendedAt: user.suspendedAt,
  };
}

/**
 * Deletes an account and, by cascade, everything it owns.
 *
 * The row deleted is in `auth.users`; `public.users` cascades from it, and the
 * cubes, cards, drafts and follows cascade from that. Deleting the public row
 * alone would leave an orphaned auth account that could sign in and land on
 * `/welcome` to claim a new username — the same person, a clean slate, and no
 * record. So this goes at the auth row deliberately.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
}

export interface AdminUserRow {
  id: string;
  username: string;
  suspendedAt: Date | null;
  isAdmin: boolean;
  createdAt: Date;
  cubeCount: number;
}

/** The moderation view of an account, for the profile page's admin panel. */
export async function getUserForModeration(username: string): Promise<AdminUserRow | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      suspendedAt: users.suspendedAt,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      cubeCount: sql<number>`(
        select count(*)::int from ${cubes} where ${cubes.ownerId} = "users"."id"
      )`,
    })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** Recent moderation actions, newest first. */
export async function listModerationLog(limit = 50) {
  return db
    .select()
    .from(moderationLog)
    .orderBy(desc(moderationLog.createdAt))
    .limit(limit);
}

/** Everything currently hidden or suspended, for a quick review pass. */
export async function listModerated(): Promise<{
  hiddenCubes: { id: string; name: string; slug: string; ownerUsername: string; hiddenAt: Date | null; hiddenReason: string | null }[];
  suspendedUsers: { id: string; username: string; suspendedAt: Date | null }[];
}> {
  const [hiddenCubes, suspendedUsers] = await Promise.all([
    db
      .select({
        id: cubes.id,
        name: cubes.name,
        slug: cubes.slug,
        ownerUsername: users.username,
        hiddenAt: cubes.hiddenAt,
        hiddenReason: cubes.hiddenReason,
      })
      .from(cubes)
      .innerJoin(users, eq(users.id, cubes.ownerId))
      .where(isNotNull(cubes.hiddenAt))
      .orderBy(desc(cubes.hiddenAt)),
    db
      .select({ id: users.id, username: users.username, suspendedAt: users.suspendedAt })
      .from(users)
      .where(isNotNull(users.suspendedAt))
      .orderBy(desc(users.suspendedAt)),
  ]);
  return { hiddenCubes, suspendedUsers };
}
