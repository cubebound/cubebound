"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCardById,
  getPrintingsForBases,
  quickSearchCards,
  type BrowseCard,
} from "@/db/queries/cards";
import {
  addCubeCard,
  createCube,
  deleteCube,
  getCubeById,
  getCubeCardIds,
  getPrintings,
  moveCubeCard,
  removeCubeCard,
  swapCubeCardPrinting,
  updateCube,
  updateCubePrimer,
  type CubeVisibility,
} from "@/db/queries/cubes";
import type { Cube, User } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canEditCube } from "@/lib/cube-access";
import { defaultSectionForType, isCubeSection, type CubeSection } from "@/lib/riftbound";

export interface ActionState {
  error?: string;
}

const VISIBILITIES: CubeVisibility[] = ["public", "unlisted", "private"];
const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;

/**
 * The single gate every cube mutation goes through.
 *
 * Ownership is checked here on the server for every write, never in the UI
 * alone — the page only decides what to *show*. A non-owner (or a signed-out
 * caller) gets the same "not found" for a cube that exists but isn't theirs, so
 * private cube ids are not discoverable by probing.
 */
async function requireOwnedCube(
  cubeId: string,
): Promise<{ cube: Cube; profile: User } | { error: string }> {
  const current = await getCurrentUser();
  if (!current?.profile) return { error: "You need to be signed in." };
  if (typeof cubeId !== "string" || cubeId.length === 0) return { error: "Cube not found." };

  const cube = await getCubeById(cubeId);
  if (!canEditCube(cube, current.profile.id)) return { error: "Cube not found." };
  return { cube, profile: current.profile };
}

function editorPath(username: string, slug: string): string {
  return `/cube/${username}/${slug}/edit`;
}

/** Refreshes the editor and the owner's cube list after a change. */
function revalidateCube(username: string, slug: string): void {
  revalidatePath(editorPath(username, slug));
  revalidatePath(`/cube/${username}/${slug}/settings`);
  revalidatePath("/cubes");
}

function readMetadata(formData: FormData):
  | { ok: true; name: string; description: string | null; visibility: CubeVisibility }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "public");

  if (name.length === 0) return { ok: false, error: "Give your cube a name." };
  if (name.length > NAME_MAX)
    return { ok: false, error: `Names must be at most ${NAME_MAX} characters.` };
  if (description.length > DESCRIPTION_MAX)
    return { ok: false, error: `Descriptions must be at most ${DESCRIPTION_MAX} characters.` };
  if (!VISIBILITIES.includes(visibility as CubeVisibility))
    return { ok: false, error: "Pick a valid visibility." };

  return {
    ok: true,
    name,
    description: description || null,
    visibility: visibility as CubeVisibility,
  };
}

export async function createCubeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "You need to be signed in." };
  if (!current.profile) return { error: "Claim a username before creating a cube." };

  const parsed = readMetadata(formData);
  if (!parsed.ok) return { error: parsed.error };

  const cube = await createCube({
    ownerId: current.profile.id,
    name: parsed.name,
    description: parsed.description,
    visibility: parsed.visibility,
  });

  revalidatePath("/cubes");
  redirect(editorPath(current.profile.username, cube.slug));
}

export async function updateCubeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owned = await requireOwnedCube(String(formData.get("cubeId") ?? ""));
  if ("error" in owned) return { error: owned.error };

  const parsed = readMetadata(formData);
  if (!parsed.ok) return { error: parsed.error };

  // The slug is deliberately left alone: it is a shared URL, so renaming a
  // cube must not break links people already have.
  await updateCube(owned.cube.id, {
    name: parsed.name,
    description: parsed.description,
    visibility: parsed.visibility,
  });

  revalidateCube(owned.profile.username, owned.cube.slug);
  redirect(editorPath(owned.profile.username, owned.cube.slug));
}

const PRIMER_MAX = 50_000;

/** Saves the cube's long-form markdown write-up. */
export async function updatePrimerAction(
  _prev: ActionState & { saved?: boolean },
  formData: FormData,
): Promise<ActionState & { saved?: boolean }> {
  const owned = await requireOwnedCube(String(formData.get("cubeId") ?? ""));
  if ("error" in owned) return { error: owned.error };

  const primer = String(formData.get("primer") ?? "");
  if (primer.length > PRIMER_MAX) {
    return { error: `Primers must be at most ${PRIMER_MAX.toLocaleString()} characters.` };
  }

  // Stored verbatim: it is markdown, and escaping happens at render time.
  // Never store HTML here and never render it as HTML — see components/primer.
  await updateCubePrimer(owned.cube.id, primer.trim() || null);

  revalidateCube(owned.profile.username, owned.cube.slug);
  return { saved: true };
}

export async function deleteCubeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owned = await requireOwnedCube(String(formData.get("cubeId") ?? ""));
  if ("error" in owned) return { error: owned.error };

  // Typing the name is the confirmation; the UI also asks, but this is the
  // check that actually holds.
  const confirmation = String(formData.get("confirmName") ?? "").trim();
  if (confirmation !== owned.cube.name) {
    return { error: "Type the cube's name exactly to confirm deletion." };
  }

  await deleteCube(owned.cube.id);
  revalidateCube(owned.profile.username, owned.cube.slug);
  redirect("/cubes");
}

export async function addCardAction(
  cubeId: string,
  cardId: string,
  section?: string,
): Promise<ActionState> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };

  const card = await getCardById(cardId);
  if (!card) return { error: "Card not found." };

  const target =
    section && isCubeSection(section)
      ? (section as CubeSection)
      : defaultSectionForType(card.type);

  await addCubeCard(owned.cube.id, card.id, target);
  revalidateCube(owned.profile.username, owned.cube.slug);
  return {};
}

export async function removeCardAction(
  cubeId: string,
  cardId: string,
  section: string,
): Promise<ActionState> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };
  if (!isCubeSection(section)) return { error: "Unknown section." };

  await removeCubeCard(owned.cube.id, cardId, section);
  revalidateCube(owned.profile.username, owned.cube.slug);
  return {};
}

export async function moveCardAction(
  cubeId: string,
  cardId: string,
  from: string,
  to: string,
): Promise<ActionState> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };
  if (!isCubeSection(from) || !isCubeSection(to)) return { error: "Unknown section." };

  await moveCubeCard(owned.cube.id, cardId, from, to);
  revalidateCube(owned.profile.username, owned.cube.slug);
  return {};
}

export async function swapPrintingAction(
  cubeId: string,
  fromCardId: string,
  toCardId: string,
  section: string,
): Promise<ActionState> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };
  if (!isCubeSection(section)) return { error: "Unknown section." };

  const [from, to] = await Promise.all([getCardById(fromCardId), getCardById(toCardId)]);
  if (!from || !to) return { error: "Card not found." };
  if (from.baseId !== to.baseId) return { error: "That is not a printing of the same card." };

  await swapCubeCardPrinting(owned.cube.id, fromCardId, toCardId, section);
  revalidateCube(owned.profile.username, owned.cube.slug);
  return {};
}

/** Printings for the alt-art picker. Owner-gated like every other cube call. */
export async function listPrintingsAction(cubeId: string, baseId: string) {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error, printings: [] };
  return { printings: await getPrintings(baseId) };
}

export interface QuickAddResult {
  card: BrowseCard;
  /** Every printing, base first. Length 1 for most cards. */
  printings: BrowseCard[];
  defaultSection: CubeSection;
}

/**
 * Type-ahead for the quick-add panel. Returns each match's printings inline so
 * choosing an alternate costs no extra round trip, plus which cards are
 * already in the cube so rows can be marked without a page refresh.
 */
export async function quickSearchAction(
  cubeId: string,
  query: string,
): Promise<{ error?: string; results: QuickAddResult[]; presentIds: string[] }> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error, results: [], presentIds: [] };

  const matches = await quickSearchCards(query);
  if (matches.length === 0) return { results: [], presentIds: [] };

  const [printings, present] = await Promise.all([
    getPrintingsForBases(matches.map((m) => m.baseId)),
    getCubeCardIds(owned.cube.id),
  ]);

  const byBase = new Map<string, BrowseCard[]>();
  for (const printing of printings) {
    const group = byBase.get(printing.baseId);
    if (group) group.push(printing);
    else byBase.set(printing.baseId, [printing]);
  }

  return {
    results: matches.map((card) => ({
      card,
      printings: byBase.get(card.baseId) ?? [card],
      defaultSection: defaultSectionForType(card.type),
    })),
    presentIds: [...present],
  };
}
