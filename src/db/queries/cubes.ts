import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "..";
import { cards, cubeCards, cubes, users, type Cube } from "../schema";
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

/** Summary row for the cube list — deliberately without `primer`, which can be
 *  tens of kilobytes and is never shown in a list. */
export type CubeSummary = Omit<Cube, "primer"> & { cardCount: number };

export async function listCubesForOwner(ownerId: string): Promise<CubeSummary[]> {
  return db
    .select({
      id: cubes.id,
      ownerId: cubes.ownerId,
      name: cubes.name,
      slug: cubes.slug,
      description: cubes.description,
      visibility: cubes.visibility,
      createdAt: cubes.createdAt,
      updatedAt: cubes.updatedAt,
      cardCount: sql<number>`(
        select coalesce(sum(${cubeCards.quantity}), 0)::int
        from ${cubeCards} where ${cubeCards.cubeId} = ${cubes.id}
      )`,
    })
    .from(cubes)
    .where(eq(cubes.ownerId, ownerId))
    .orderBy(desc(cubes.updatedAt));
}

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

export async function removeCubeCard(
  cubeId: string,
  cardId: string,
  section: CubeSection,
): Promise<void> {
  await db
    .delete(cubeCards)
    .where(
      and(
        eq(cubeCards.cubeId, cubeId),
        eq(cubeCards.cardId, cardId),
        eq(cubeCards.section, section),
      ),
    );
  await touchCube(cubeId);
}

/**
 * Moves a card between sections. `section` is part of the primary key, so this
 * deletes and re-inserts; doing it in one transaction keeps the card from
 * vanishing if the insert conflicts with a copy already in the target section.
 */
export async function moveCubeCard(
  cubeId: string,
  cardId: string,
  from: CubeSection,
  to: CubeSection,
): Promise<void> {
  if (from === to) return;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ quantity: cubeCards.quantity })
      .from(cubeCards)
      .where(
        and(
          eq(cubeCards.cubeId, cubeId),
          eq(cubeCards.cardId, cardId),
          eq(cubeCards.section, from),
        ),
      )
      .limit(1);
    if (!existing) return;

    await tx
      .delete(cubeCards)
      .where(
        and(
          eq(cubeCards.cubeId, cubeId),
          eq(cubeCards.cardId, cardId),
          eq(cubeCards.section, from),
        ),
      );
    // Merge into whatever is already in the target section rather than
    // discarding the copies being moved.
    await tx
      .insert(cubeCards)
      .values({ cubeId, cardId, section: to, quantity: existing.quantity })
      .onConflictDoUpdate({
        target: [cubeCards.cubeId, cubeCards.cardId, cubeCards.section],
        set: {
          quantity: sql`least(${MAX_CARD_QUANTITY}, ${cubeCards.quantity} + ${existing.quantity})`,
        },
      });
  });
  await touchCube(cubeId);
}

/** Swaps one printing for another, keeping the section. */
export async function swapCubeCardPrinting(
  cubeId: string,
  fromCardId: string,
  toCardId: string,
  section: CubeSection,
): Promise<void> {
  if (fromCardId === toCardId) return;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ quantity: cubeCards.quantity })
      .from(cubeCards)
      .where(
        and(
          eq(cubeCards.cubeId, cubeId),
          eq(cubeCards.cardId, fromCardId),
          eq(cubeCards.section, section),
        ),
      )
      .limit(1);
    if (!existing) return;

    await tx
      .delete(cubeCards)
      .where(
        and(
          eq(cubeCards.cubeId, cubeId),
          eq(cubeCards.cardId, fromCardId),
          eq(cubeCards.section, section),
        ),
      );
    await tx
      .insert(cubeCards)
      .values({ cubeId, cardId: toCardId, section, quantity: existing.quantity })
      .onConflictDoUpdate({
        target: [cubeCards.cubeId, cubeCards.cardId, cubeCards.section],
        set: {
          quantity: sql`least(${MAX_CARD_QUANTITY}, ${cubeCards.quantity} + ${existing.quantity})`,
        },
      });
  });
  await touchCube(cubeId);
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
