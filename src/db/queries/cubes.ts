import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "..";
import {
  cards,
  cubeCards,
  cubeChanges,
  cubes,
  users,
  type Cube,
  type CubeChange,
  type NewCubeChange,
} from "../schema";
import { browseColumns, type BrowseCard } from "./cards";
import type { CubeSection } from "@/lib/riftbound";
import { slugify, uniqueSlug } from "@/lib/slug";

export type CubeVisibility = Cube["visibility"];

export interface CubeWithOwner extends Cube {
  ownerUsername: string;
}

export type CubeCardRow = BrowseCard & {
  section: CubeSection;
  quantity: number;
};

export async function getCubeById(id: string): Promise<Cube | null> {
  const [cube] = await db.select().from(cubes).where(eq(cubes.id, id)).limit(1);
  return cube ?? null;
}

export async function getCubeByOwnerAndSlug(
  username: string,
  slug: string,
): Promise<CubeWithOwner | null> {
  const [row] = await db
    .select({ cube: cubes, ownerUsername: users.username })
    .from(cubes)
    .innerJoin(users, eq(users.id, cubes.ownerId))
    .where(and(eq(users.username, username.toLowerCase()), eq(cubes.slug, slug.toLowerCase())))
    .limit(1);
  return row ? { ...row.cube, ownerUsername: row.ownerUsername } : null;
}

// Listing a user's own cubes is `searchCubes({ ownerId, includeNonPublic })` in
// `queries/discovery.ts` — one query behind every cube list on the site, so
// "how many cards is that" cannot mean two different things. The listing this
// file used to own counted the maybeboard, which the rest of the app does not.

export async function createCube(input: {
  ownerId: string;
  name: string;
  description: string | null;
  visibility: CubeVisibility;
}): Promise<Cube> {
  const existing = await db
    .select({ slug: cubes.slug })
    .from(cubes)
    .where(eq(cubes.ownerId, input.ownerId));

  const slug = uniqueSlug(slugify(input.name), new Set(existing.map((r) => r.slug)));

  const [cube] = await db
    .insert(cubes)
    .values({ ...input, slug })
    .returning();
  return cube;
}

export async function updateCube(
  cubeId: string,
  patch: { name: string; description: string | null; visibility: CubeVisibility },
): Promise<Cube> {
  const [cube] = await db
    .update(cubes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(cubes.id, cubeId))
    .returning();
  return cube;
}

export async function updateCubePrimer(cubeId: string, primer: string | null): Promise<void> {
  await db
    .update(cubes)
    .set({ primer, updatedAt: new Date() })
    .where(eq(cubes.id, cubeId));
}

export async function deleteCube(cubeId: string): Promise<void> {
  await db.delete(cubes).where(eq(cubes.id, cubeId));
}

/** Bumps updated_at so the cube list orders by real activity. */
async function touchCube(cubeId: string): Promise<void> {
  await db.update(cubes).set({ updatedAt: new Date() }).where(eq(cubes.id, cubeId));
}

export async function getCubeCards(cubeId: string): Promise<CubeCardRow[]> {
  const rows = await db
    .select({
      ...browseColumns,
      // Real printing count so the editor can show that alternates exist.
      printingCount: sql<number>`(
        select count(*)::int from ${cards} alt where alt.base_id = ${cards.baseId}
      )`,
      section: cubeCards.section,
      quantity: cubeCards.quantity,
    })
    .from(cubeCards)
    .innerJoin(cards, eq(cards.id, cubeCards.cardId))
    .where(eq(cubeCards.cubeId, cubeId))
    .orderBy(asc(cards.setCode), sql`length(${cards.collectorNo})`, asc(cards.collectorNo));
  return rows as CubeCardRow[];
}

/**
 * Copies of each printing already in the cube, keyed by card id and summed
 * across sections, so an add panel can show "×2 in cube" without another read.
 */
export async function getCubeCardQuantities(
  cubeId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      cardId: cubeCards.cardId,
      quantity: sql<number>`sum(${cubeCards.quantity})::int`,
    })
    .from(cubeCards)
    .where(eq(cubeCards.cubeId, cubeId))
    .groupBy(cubeCards.cardId);
  return Object.fromEntries(rows.map((r) => [r.cardId, r.quantity]));
}

/** Total copies, not distinct rows — a cube running four of a card holds four. */
export async function countCubeCards(cubeId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: sql<number>`coalesce(sum(${cubeCards.quantity}), 0)::int` })
    .from(cubeCards)
    .where(eq(cubeCards.cubeId, cubeId));
  return value;
}

/**
 * Appends to a cube's change log. Never throws into the caller's path: a
 * failure to record history must not undo or block the edit itself.
 */
export async function recordCubeChange(entry: NewCubeChange): Promise<void> {
  try {
    await db.insert(cubeChanges).values(entry);
  } catch (error) {
    console.error("failed to record cube change", entry.kind, error);
  }
}

export async function listCubeChanges(
  cubeId: string,
  limit = 200,
): Promise<CubeChange[]> {
  return db
    .select()
    .from(cubeChanges)
    .where(eq(cubeChanges.cubeId, cubeId))
    .orderBy(desc(cubeChanges.createdAt), desc(cubeChanges.id))
    .limit(limit);
}

export interface CubeHolding {
  /** Copies of any printing of this card, across every section. */
  total: number;
  /** Copies keyed by the exact printing. */
  byPrinting: Record<string, number>;
  /** The printing the cube actually holds — most copies, canonical to break ties. */
  held: BrowseCard;
}

/**
 * What the cube holds for each of the given base cards.
 *
 * The browse grid shows one tile per card, so it needs to know that a cube
 * holding only the alt art still holds that card — and which printing to show.
 */
export async function getCubeHoldingsForBases(
  cubeId: string,
  baseIds: string[],
): Promise<Record<string, CubeHolding>> {
  if (baseIds.length === 0) return {};

  const rows = await db
    .select({ ...browseColumns, printingCount: sql<number>`1::int`, quantity: cubeCards.quantity })
    .from(cubeCards)
    .innerJoin(cards, eq(cards.id, cubeCards.cardId))
    .where(and(eq(cubeCards.cubeId, cubeId), inArray(cards.baseId, baseIds)));

  const holdings: Record<string, CubeHolding> = {};
  for (const row of rows) {
    const { quantity, ...card } = row;
    const holding = (holdings[card.baseId] ??= { total: 0, byPrinting: {}, held: card });
    holding.total += quantity;
    holding.byPrinting[card.id] = (holding.byPrinting[card.id] ?? 0) + quantity;

    // Prefer the printing with the most copies; canonical breaks a tie.
    const bestSoFar = holding.byPrinting[holding.held.id] ?? 0;
    const thisOne = holding.byPrinting[card.id];
    const isCanonical = card.id === card.baseId;
    if (thisOne > bestSoFar || (thisOne === bestSoFar && isCanonical)) {
      holding.held = card;
    }
  }
  return holdings;
}

/** Every printing of a card, base printing first, for the printing picker. */
export async function getPrintings(baseId: string): Promise<BrowseCard[]> {
  return db
    .select({ ...browseColumns, printingCount: sql<number>`count(*) over ()::int` })
    .from(cards)
    .where(eq(cards.baseId, baseId))
    .orderBy(sql`(${cards.id} = ${cards.baseId}) desc`, asc(cards.id));
}

/**
 * Adds a printing to a cube. Cubes commonly run multiples of a card, so adding
 * one that is already there increments its quantity rather than doing nothing.
 */
export async function addCubeCard(
  cubeId: string,
  cardId: string,
  section: CubeSection,
  quantity = 1,
): Promise<void> {
  await db
    .insert(cubeCards)
    .values({ cubeId, cardId, section, quantity })
    .onConflictDoUpdate({
      target: [cubeCards.cubeId, cubeCards.cardId, cubeCards.section],
      set: { quantity: sql`${cubeCards.quantity} + ${quantity}` },
    });
  await touchCube(cubeId);
}

/** Hard cap so a stuck key can't write an absurd number into the column. */
export const MAX_CARD_QUANTITY = 99;

/**
 * Moves a card's quantity by `delta`, deleting the row when it reaches zero.
 * Returns the resulting quantity (0 when the row was removed).
 */
export async function adjustCubeCardQuantity(
  cubeId: string,
  cardId: string,
  section: CubeSection,
  delta: number,
): Promise<number> {
  const where = and(
    eq(cubeCards.cubeId, cubeId),
    eq(cubeCards.cardId, cardId),
    eq(cubeCards.section, section),
  );

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ quantity: cubeCards.quantity })
      .from(cubeCards)
      .where(where)
      .limit(1);
    if (!existing) return 0;

    const next = Math.min(MAX_CARD_QUANTITY, existing.quantity + delta);
    if (next <= 0) {
      await tx.delete(cubeCards).where(where);
      return 0;
    }
    await tx.update(cubeCards).set({ quantity: next }).where(where);
    return next;
  });

  await touchCube(cubeId);
  return result;
}

/** Removes every copy of a printing from a section; returns how many went. */
export async function removeCubeCard(
  cubeId: string,
  cardId: string,
  section: CubeSection,
): Promise<number> {
  const removed = await db
    .delete(cubeCards)
    .where(
      and(
        eq(cubeCards.cubeId, cubeId),
        eq(cubeCards.cardId, cardId),
        eq(cubeCards.section, section),
      ),
    )
    .returning({ quantity: cubeCards.quantity });
  await touchCube(cubeId);
  return removed.reduce((sum, row) => sum + row.quantity, 0);
}

/**
 * Moves a single copy from one (printing, section) slot to another.
 *
 * Both "put this copy in the sideboard" and "make this copy the alt art" are
 * the same operation: take one copy off the source slot and add it to the
 * target. Copies are listed individually in the UI, so these always act on one
 * copy — never on every copy of a card.
 */
async function moveOneCopy(
  cubeId: string,
  from: { cardId: string; section: CubeSection },
  to: { cardId: string; section: CubeSection },
): Promise<boolean> {
  if (from.cardId === to.cardId && from.section === to.section) return false;

  const moved = await db.transaction(async (tx) => {
    const source = and(
      eq(cubeCards.cubeId, cubeId),
      eq(cubeCards.cardId, from.cardId),
      eq(cubeCards.section, from.section),
    );
    const [existing] = await tx
      .select({ quantity: cubeCards.quantity })
      .from(cubeCards)
      .where(source)
      .limit(1);
    if (!existing) return false;

    if (existing.quantity <= 1) {
      await tx.delete(cubeCards).where(source);
    } else {
      await tx.update(cubeCards).set({ quantity: existing.quantity - 1 }).where(source);
    }

    // Merge into whatever is already in the target slot rather than losing
    // the copy being moved.
    await tx
      .insert(cubeCards)
      .values({ cubeId, cardId: to.cardId, section: to.section, quantity: 1 })
      .onConflictDoUpdate({
        target: [cubeCards.cubeId, cubeCards.cardId, cubeCards.section],
        set: { quantity: sql`least(${MAX_CARD_QUANTITY}, ${cubeCards.quantity} + 1)` },
      });
    return true;
  });

  if (moved) await touchCube(cubeId);
  return moved;
}

/** Moves one copy to a different section, keeping its printing. */
export async function moveCopyToSection(
  cubeId: string,
  cardId: string,
  from: CubeSection,
  to: CubeSection,
): Promise<boolean> {
  return moveOneCopy(cubeId, { cardId, section: from }, { cardId, section: to });
}

/** Switches one copy to a different printing, keeping its section. */
export async function switchCopyPrinting(
  cubeId: string,
  fromCardId: string,
  toCardId: string,
  section: CubeSection,
): Promise<boolean> {
  return moveOneCopy(cubeId, { cardId: fromCardId, section }, { cardId: toCardId, section });
}

/**
 * Copies a cube's card list into a new private cube owned by `ownerId`.
 *
 * Sections, chosen printings and quantities all carry over. The description
 * and primer deliberately do not: they are the original author's writing, and
 * the clone is a starting point for the new owner's own list.
 */
export async function cloneCube(
  sourceCubeId: string,
  ownerId: string,
  name: string,
): Promise<Cube> {
  const existing = await db
    .select({ slug: cubes.slug })
    .from(cubes)
    .where(eq(cubes.ownerId, ownerId));
  const slug = uniqueSlug(slugify(name), new Set(existing.map((r) => r.slug)));

  return db.transaction(async (tx) => {
    const source = await tx
      .select({
        cardId: cubeCards.cardId,
        section: cubeCards.section,
        quantity: cubeCards.quantity,
      })
      .from(cubeCards)
      .where(eq(cubeCards.cubeId, sourceCubeId));

    const [clone] = await tx
      .insert(cubes)
      .values({ ownerId, name, description: null, visibility: "private", slug })
      .returning();

    if (source.length > 0) {
      await tx
        .insert(cubeCards)
        .values(source.map((row) => ({ ...row, cubeId: clone.id })));
    }

    return clone;
  });
}
