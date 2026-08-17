"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCardById,
  getCardsByIds,
  getImportCatalog,
  getPrintingsForBases,
  quickSearchCards,
  type BrowseCard,
} from "@/db/queries/cards";
import {
  addCubeCard,
  adjustCubeCardQuantity,
  cloneCube,
  createCube,
  deleteCube,
  getCubeById,
  getCubeByOwnerAndSlug,
  getCubeCardQuantities,
  getPrintings,
  MAX_CARD_QUANTITY,
  moveCopyToSection,
  recordCubeChange,
  removeCubeCard,
  countCubesForOwner,
  cubeHasCard,
  MAX_CUBES_PER_USER,
  setCubeCover,
  switchCopyPrinting,
  updateCube,
  updateCubePrimer,
  type CubeVisibility,
} from "@/db/queries/cubes";
import type { Cube, NewCubeChange, User } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canEditCube, canUseCube, suspensionError } from "@/lib/cube-access";
import {
  mergeImportRows,
  previewImport,
  type ImportPreview,
} from "@/lib/import-list";
import { defaultSectionForType, isCubeSection, type CubeSection } from "@/lib/riftbound";

export interface ActionState {
  error?: string;
}

const VISIBILITIES: CubeVisibility[] = ["public", "unlisted", "private"];
const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;
/** Generous for 500 lines of card names, small enough to reject a pasted file. */
const MAX_IMPORT_CHARS = 100_000;

/**
 * Both ways to make a cube go through here — creating and cloning.
 *
 * A cap enforced on only one of them is not a cap: cloning is the easier one to
 * automate, since it needs no form. Checked at write time rather than by
 * hiding the button, like every other rule on this file.
 */
async function underCubeLimit(ownerId: string): Promise<ActionState | null> {
  if ((await countCubesForOwner(ownerId)) < MAX_CUBES_PER_USER) return null;
  return {
    error:
      `You've reached the limit of ${MAX_CUBES_PER_USER} cubes. ` +
      `Delete one you're finished with to make room.`,
  };
}

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
  // Every cube mutation funnels through here, so the account-level stop goes
  // here too rather than being repeated per action.
  const suspended = suspensionError(current.profile);
  if (suspended) return suspended;
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

/** Shorthand for logging an edit against the cube being edited. */
function logChange(
  owned: { cube: Cube; profile: User },
  entry: Omit<NewCubeChange, "cubeId" | "actorId" | "actorUsername">,
): Promise<void> {
  return recordCubeChange({
    ...entry,
    cubeId: owned.cube.id,
    actorId: owned.profile.id,
    actorUsername: owned.profile.username,
  });
}

/** One-line summary of the editable details, for before/after comparison. */
function describeDetails(cube: {
  name: string;
  description: string | null;
  visibility: string;
}): string {
  return [cube.name, cube.visibility, cube.description ?? ""].join(" · ");
}

export async function createCubeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "You need to be signed in." };
  if (!current.profile) return { error: "Claim a username before creating a cube." };
  const suspended = suspensionError(current.profile);
  if (suspended) return suspended;

  const atLimit = await underCubeLimit(current.profile.id);
  if (atLimit) return atLimit;

  const parsed = readMetadata(formData);
  if (!parsed.ok) return { error: parsed.error };

  const cube = await createCube({
    ownerId: current.profile.id,
    name: parsed.name,
    description: parsed.description,
    visibility: parsed.visibility,
  });

  await recordCubeChange({
    cubeId: cube.id,
    actorId: current.profile.id,
    actorUsername: current.profile.username,
    kind: "cube_created",
    toValue: cube.name,
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

  // Only log what actually changed, so the log isn't padded with no-op saves.
  const before = describeDetails(owned.cube);
  const after = describeDetails({ ...owned.cube, ...parsed });
  if (before !== after) {
    await logChange(owned, { kind: "details_edited", fromValue: before, toValue: after });
  }

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

  // **Normalise line endings.** A `<textarea>` submits CRLF, per the HTML
  // spec, whatever was typed into it — so the stored primer never matched the
  // editor's own `draft` state, and its dirty check (`draft !== primer`)
  // reported "Unsaved changes" the instant a save succeeded. Markdown renders
  // either way, which is why this went unnoticed; storing LF makes what comes
  // back equal what was sent.
  const primer = String(formData.get("primer") ?? "").replace(/\r\n/g, "\n");
  if (primer.length > PRIMER_MAX) {
    return { error: `Primers must be at most ${PRIMER_MAX.toLocaleString()} characters.` };
  }

  // Stored verbatim: it is markdown, and escaping happens at render time.
  // Never store HTML here and never render it as HTML — see components/primer.
  const next = primer.trim() || null;
  const wasEmpty = !owned.cube.primer?.trim();
  await updateCubePrimer(owned.cube.id, next);

  if ((owned.cube.primer ?? "") !== (next ?? "")) {
    await logChange(owned, {
      kind: "primer_edited",
      toValue: next ? (wasEmpty ? "written" : "updated") : "cleared",
    });
  }

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
  await logChange(owned, {
    kind: "cards_added",
    cardId: card.id,
    cardName: card.name,
    quantity: 1,
    toSection: target,
  });
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

  const card = await getCardById(cardId);
  const removed = await removeCubeCard(owned.cube.id, cardId, section);
  if (removed > 0) {
    await logChange(owned, {
      kind: "cards_removed",
      cardId,
      cardName: card?.name ?? cardId,
      quantity: removed,
      fromSection: section,
    });
  }
  revalidateCube(owned.profile.username, owned.cube.slug);
  return {};
}

/**
 * Nudges a card's quantity. `delta` of -1 on the last copy removes the row, so
 * the same control handles "one fewer" and "gone" without a separate case.
 */
export async function adjustQuantityAction(
  cubeId: string,
  cardId: string,
  section: string,
  delta: number,
): Promise<ActionState & { quantity?: number }> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };
  if (!isCubeSection(section)) return { error: "Unknown section." };
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_CARD_QUANTITY) {
    return { error: "Invalid quantity change." };
  }

  const card = await getCardById(cardId);
  const quantity = await adjustCubeCardQuantity(owned.cube.id, cardId, section, delta);
  await logChange(owned, {
    kind: delta > 0 ? "cards_added" : "cards_removed",
    cardId,
    cardName: card?.name ?? cardId,
    quantity: Math.abs(delta),
    ...(delta > 0 ? { toSection: section } : { fromSection: section }),
  });
  revalidateCube(owned.profile.username, owned.cube.slug);
  return { quantity };
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

  const card = await getCardById(cardId);
  const moved = await moveCopyToSection(owned.cube.id, cardId, from, to);
  if (moved) {
    await logChange(owned, {
      kind: "copy_moved",
      cardId,
      cardName: card?.name ?? cardId,
      quantity: 1,
      fromSection: from,
      toSection: to,
    });
  }
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

  const switched = await switchCopyPrinting(owned.cube.id, fromCardId, toCardId, section);
  if (switched) {
    await logChange(owned, {
      kind: "printing_switched",
      cardId: toCardId,
      cardName: to.name,
      quantity: 1,
      toSection: section,
      fromValue: fromCardId,
      toValue: toCardId,
    });
  }
  revalidateCube(owned.profile.username, owned.cube.slug);
  return {};
}

/** Printings for the alt-art picker. Owner-gated like every other cube call. */
export async function listPrintingsAction(cubeId: string, baseId: string) {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error, printings: [] };
  return { printings: await getPrintings(baseId) };
}

/**
 * Copies a cube into a new private one owned by the caller.
 *
 * Read access is re-checked here, not assumed from the page that rendered the
 * button: a private cube can only be cloned by its owner.
 */
/**
 * Chooses the card whose art represents the cube.
 *
 * Restricted to cards already in the cube — a cover is meant to say what this
 * cube is, and letting it be any card in the pool would make it an arbitrary
 * image slot instead. Passing no card clears it, which falls back to a card
 * from the cube at render time rather than to nothing.
 */
export async function setCubeCoverAction(
  cubeId: string,
  cardId: string | null,
): Promise<ActionState> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };

  if (cardId !== null) {
    if (typeof cardId !== "string" || !(await cubeHasCard(owned.cube.id, cardId))) {
      return { error: "Pick a card that's in this cube." };
    }
  }

  await setCubeCover(owned.cube.id, cardId);
  revalidateCube(owned.profile.username, owned.cube.slug);
  revalidatePath(`/cube/${owned.profile.username}/${owned.cube.slug}`);
  return {};
}

export async function cloneCubeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "Sign in to clone this cube." };
  if (!current.profile) return { error: "Claim a username before cloning a cube." };

  const atLimit = await underCubeLimit(current.profile.id);
  if (atLimit) return atLimit;

  const suspendedCloner = suspensionError(current.profile);
  if (suspendedCloner) return suspendedCloner;

  const username = String(formData.get("username") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const source = await getCubeByOwnerAndSlug(username, slug);
  // canUseCube, not canViewCube: a hidden cube stays readable by its owner so
  // they can see it was moderated, but cloning it would be a way straight
  // around the moderation.
  if (!canUseCube(source, current.profile.id)) return { error: "Cube not found." };

  const clone = await cloneCube(
    source.id,
    current.profile.id,
    `Copy of ${source.name}`.slice(0, 100),
  );

  await recordCubeChange({
    cubeId: clone.id,
    actorId: current.profile.id,
    actorUsername: current.profile.username,
    kind: "cube_cloned",
    fromValue: `${source.ownerUsername}/${source.slug}`,
    toValue: clone.name,
  });

  revalidatePath("/cubes");
  redirect(editorPath(current.profile.username, clone.slug));
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
): Promise<{ error?: string; results: QuickAddResult[]; inCube: Record<string, number> }> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error, results: [], inCube: {} };

  const matches = await quickSearchCards(query);
  if (matches.length === 0) return { results: [], inCube: {} };

  const [printings, inCube] = await Promise.all([
    getPrintingsForBases(matches.map((m) => m.baseId)),
    getCubeCardQuantities(owned.cube.id),
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
    inCube,
  };
}

// --- Bulk import -------------------------------------------------------------

export interface ImportPreviewState {
  preview?: ImportPreview;
  error?: string;
}

/**
 * Resolves a pasted list against the card pool. Writes nothing.
 *
 * Gated on ownership like every other cube action even though it only reads:
 * the preview reveals whether a cube id exists, and non-owners have no reason
 * to probe that.
 */
export async function previewImportAction(
  cubeId: string,
  text: string,
): Promise<ImportPreviewState> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };

  if (typeof text !== "string" || text.trim().length === 0) {
    return { error: "Paste a list of card names first." };
  }
  if (text.length > MAX_IMPORT_CHARS) {
    return { error: "That list is too large to import in one go." };
  }

  const catalog = await getImportCatalog();
  return { preview: previewImport(text, catalog) };
}

/** One resolved row the user confirmed. */
export interface ImportCommitRow {
  cardId: string;
  section: string;
  quantity: number;
}

/**
 * Applies a confirmed import.
 *
 * Takes resolved rows rather than the original text: the user may have picked
 * a suggestion or changed a section in the preview, and re-parsing would throw
 * those choices away. Everything is re-validated here — the client is choosing
 * from options, not dictating them.
 */
export async function commitImportAction(
  cubeId: string,
  rows: ImportCommitRow[],
): Promise<ActionState & { added?: number }> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };

  const merge = mergeImportRows(rows, MAX_CARD_QUANTITY);
  if (!merge.ok) return { error: merge.error };
  const entries = merge.rows;

  // Every id has to be a real card, checked here rather than trusted from the
  // client; an unknown one would otherwise fail on the foreign key mid-import.
  const known = await getCardsByIds(entries.map((e) => e.cardId));
  const namesById = new Map(known.map((c) => [c.id, c.name]));
  const unknown = entries.find((e) => !namesById.has(e.cardId));
  if (unknown) return { error: `That card no longer exists: ${unknown.cardId}` };

  let copies = 0;
  for (const entry of entries) {
    await addCubeCard(owned.cube.id, entry.cardId, entry.section, entry.quantity);
    copies += entry.quantity;
  }

  // One batch entry, not one per card — see the enum comment in the schema.
  await logChange(owned, {
    kind: "cards_imported",
    quantity: copies,
    toValue: String(entries.length),
  });

  revalidateCube(owned.profile.username, owned.cube.slug);
  return { added: copies };
}
