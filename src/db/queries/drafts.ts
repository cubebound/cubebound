import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "..";
import { cards, cubeCards, cubes, draftPicks, drafts, users, type Draft } from "../schema";
import type { DraftCard, DraftPools, PoolEntry } from "@/lib/draft/packs";

/**
 * The cube's cards, split into the pools a draft deals from.
 *
 * Main is the main section only — never sideboard, runes, legends or
 * battlefields. Sideboard is a holding area for cards the owner has taken out,
 * so drafting it would undo their decision; runes are resources rather than
 * draftable cards.
 */
export async function getDraftPools(cubeId: string): Promise<DraftPools> {
  const rows = await db
    .select({
      id: cards.id,
      name: cards.name,
      type: cards.type,
      domains: cards.domains,
      section: cubeCards.section,
      quantity: cubeCards.quantity,
    })
    .from(cubeCards)
    .innerJoin(cards, eq(cards.id, cubeCards.cardId))
    .where(eq(cubeCards.cubeId, cubeId))
    .orderBy(asc(cards.id));

  const pools: DraftPools = { main: [], legends: [], battlefields: [] };
  for (const row of rows) {
    const entry: PoolEntry = {
      card: { id: row.id, name: row.name, type: row.type, domains: row.domains },
      quantity: row.quantity,
    };
    if (row.section === "main") pools.main.push(entry);
    else if (row.section === "legends") pools.legends.push(entry);
    else if (row.section === "battlefields") pools.battlefields.push(entry);
  }
  return pools;
}

/** Card details for every id a draft dealt, so the UI can render them. */
export async function getDraftCards(ids: string[]): Promise<Map<string, DraftCard & {
  imageThumb: string | null;
  imageFull: string | null;
  energyCost: number | null;
  powerCost: Record<string, number> | null;
}>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: cards.id,
      name: cards.name,
      type: cards.type,
      domains: cards.domains,
      imageThumb: cards.imageThumb,
      imageFull: cards.imageFull,
      energyCost: cards.energyCost,
      powerCost: cards.powerCost,
    })
    .from(cards)
    .where(inArray(cards.id, [...new Set(ids)]));

  return new Map(rows.map((row) => [row.id, row]));
}

export async function createDraftRow(input: {
  cubeId: string;
  drafterId: string;
  seed: string;
  config: Record<string, unknown>;
  packs: string[][][];
  seats: number;
  humanSeat: number;
}): Promise<Draft> {
  const [row] = await db.insert(drafts).values(input).returning();
  return row;
}

export async function getDraft(id: string): Promise<Draft | null> {
  const [row] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1);
  return row ?? null;
}

/**
 * The drafter's most recent draft of a cube, finished or not.
 *
 * Not filtered to active: the same page shows the end screen after the last
 * pick, and filtering here would make a completed draft vanish the moment it
 * finished.
 */
export async function getLatestDraft(
  cubeId: string,
  drafterId: string,
): Promise<Draft | null> {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.cubeId, cubeId), eq(drafts.drafterId, drafterId)))
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  return row ?? null;
}

export interface DraftSummary {
  id: string;
  cubeId: string;
  cubeName: string;
  cubeSlug: string;
  ownerUsername: string;
  status: "active" | "complete";
  createdAt: Date;
  updatedAt: Date;
  /** Cards the drafter has taken so far. */
  picked: number;
}

/**
 * Every draft the user has sat in, newest first.
 *
 * Joined to the cube so the list reads as "which cube, when" rather than a
 * column of ids, and counts only the drafter's own picks — the bot rows would
 * multiply the number by the number of seats.
 */
export async function listDraftsForUser(userId: string): Promise<DraftSummary[]> {
  const rows = await db
    .select({
      id: drafts.id,
      cubeId: drafts.cubeId,
      cubeName: cubes.name,
      cubeSlug: cubes.slug,
      ownerUsername: users.username,
      status: drafts.status,
      createdAt: drafts.createdAt,
      updatedAt: drafts.updatedAt,
      humanSeat: drafts.humanSeat,
    })
    .from(drafts)
    .innerJoin(cubes, eq(cubes.id, drafts.cubeId))
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .where(eq(drafts.drafterId, userId))
    .orderBy(desc(drafts.createdAt));

  if (rows.length === 0) return [];

  const counts = await db
    .select({ draftId: draftPicks.draftId, seat: draftPicks.seat, cardId: draftPicks.cardId })
    .from(draftPicks)
    .where(inArray(draftPicks.draftId, rows.map((row) => row.id)));

  const picked = new Map<string, number>();
  for (const row of rows) picked.set(row.id, 0);
  for (const pick of counts) {
    const draft = rows.find((row) => row.id === pick.draftId);
    if (draft && pick.seat === draft.humanSeat) {
      picked.set(pick.draftId, (picked.get(pick.draftId) ?? 0) + 1);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    cubeId: row.cubeId,
    cubeName: row.cubeName,
    cubeSlug: row.cubeSlug,
    ownerUsername: row.ownerUsername,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    picked: picked.get(row.id) ?? 0,
  }));
}

export async function getDraftPicks(draftId: string) {
  return db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId))
    .orderBy(asc(draftPicks.round), asc(draftPicks.pickNumber), asc(draftPicks.seat));
}

export async function recordPicks(
  draftId: string,
  picks: { round: number; pickNumber: number; seat: number; cardId: string }[],
): Promise<void> {
  if (picks.length === 0) return;
  await db
    .insert(draftPicks)
    .values(picks.map((pick) => ({ draftId, ...pick })))
    // Re-submitting the same pick (a double click, a replayed request) must not
    // fork the draft; the first write wins and the rest are no-ops.
    .onConflictDoNothing();
}

/**
 * Moves one drafted card between the main board and the sideboard.
 *
 * Keyed by (round, pickNumber) rather than card id: a pool can hold two copies
 * of a card, and they must be movable independently.
 */
export async function setPickBoard(
  draftId: string,
  seat: number,
  round: number,
  pickNumber: number,
  board: "main" | "side",
): Promise<void> {
  await db
    .update(draftPicks)
    .set({ board })
    .where(
      and(
        eq(draftPicks.draftId, draftId),
        eq(draftPicks.seat, seat),
        eq(draftPicks.round, round),
        eq(draftPicks.pickNumber, pickNumber),
      ),
    );
}

export async function markDraftComplete(draftId: string): Promise<void> {
  await db
    .update(drafts)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(drafts.id, draftId));
}

export async function touchDraft(draftId: string): Promise<void> {
  await db.update(drafts).set({ updatedAt: new Date() }).where(eq(drafts.id, draftId));
}
