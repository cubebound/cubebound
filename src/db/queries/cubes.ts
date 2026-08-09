import { and, asc, count, desc, eq, sql } from "drizzle-orm";

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

/** Card ids already in the cube, so the add panel can mark them. */
export async function getCubeCardIds(cubeId: string): Promise<Set<string>> {
  const rows = await db
    .select({ cardId: cubeCards.cardId })
    .from(cubeCards)
    .where(eq(cubeCards.cubeId, cubeId));
  return new Set(rows.map((r) => r.cardId));
}

export async function countCubeCards(cubeId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(cubeCards)
    .where(eq(cubeCards.cubeId, cubeId));
  return value;
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
 * Adds a printing to a cube. Cubes are singleton pools, so re-adding a card
 * already present is a no-op rather than bumping quantity.
 */
export async function addCubeCard(
  cubeId: string,
  cardId: string,
  section: CubeSection,
): Promise<void> {
  await db
    .insert(cubeCards)
    .values({ cubeId, cardId, section })
    .onConflictDoNothing();
  await touchCube(cubeId);
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
    await tx
      .insert(cubeCards)
      .values({ cubeId, cardId, section: to, quantity: existing.quantity })
      .onConflictDoNothing();
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
      .values({ cubeId, cardId: toCardId, section })
      .onConflictDoNothing();
  });
  await touchCube(cubeId);
}
