"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCardById,
  getCardsByIds,
  getImportCatalog,
  getSetStarterCards,
  getStarterSets,
  quickSearchCards,
  type BrowseCard,
} from "@/db/queries/cards";
import {
  addCubeCard,
  addCubeCards,
  adjustCubeCardQuantity,
  cloneCube,
  createCube,
  deleteCube,
  getCubeById,
  getCubeByOwnerAndSlug,
  getPrintings,
  MAX_CARD_QUANTITY,
  moveCopyToSection,
  recordCubeChange,
  recordCubeChanges,
  removeCubeCard,
  removeCubeCardCopies,
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
import { isTokenCard } from "@/lib/card-ids";
import { canEditCube, canUseCube, suspensionError } from "@/lib/cube-access";
import {
  mergeImportRows,
  previewImport,
  type ImportPreview,
} from "@/lib/import-list";
import {
  cardIdsInPlan,
  planStagedEdits,
  type StagedEditRow,
} from "@/lib/staged-edit";
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

/**
 * The refusal for any write that would put a token into a cube.
 *
 * Tokens are not cards (see `isTokenCard`), and the searches and the import
 * catalog already leave them out, so a person never reaches this. It exists for
 * a forged request, checked against rows each action has already read. Taking
 * one *out* is never refused: a cube may hold one from before this rule.
 */
function tokenError(card: { name: string }): ActionState {
  return { error: `${card.name} is a token, and tokens can't go in a cube.` };
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

type CubeMetadata = { name: string; description: string | null; visibility: CubeVisibility };

function readMetadata(
  formData: FormData,
): ({ ok: true } & CubeMetadata) | { ok: false; error: string } {
  return validateMetadata({
    name: formData.get("name"),
    description: formData.get("description"),
    visibility: formData.get("visibility"),
  });
}

/**
 * The one set of rules for a cube's name, description and visibility, whether
 * they arrive as a form or as an action argument. Everything is coerced from
 * `unknown`: an action's arguments are whatever the client chose to send.
 */
function validateMetadata(raw: {
  name: unknown;
  description: unknown;
  visibility: unknown;
}): ({ ok: true } & CubeMetadata) | { ok: false; error: string } {
  const name = String(raw.name ?? "").trim();
  const description = String(raw.description ?? "").trim();
  const visibility = String(raw.visibility ?? "public");

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

  // "One of each card from a set" is this same form with a set picked. The
  // list is built here from the code alone, never from anything the client
  // sends about which cards that means.
  const setCode = String(formData.get("set") ?? "").trim();
  let entries: { cardId: string; section: CubeSection; quantity: number }[] = [];
  if (setCode) {
    // Only the sets the screen offers: a promo set's handful of cards is not a
    // cube, and the floor that says so should not be skippable by URL.
    const offered = await getStarterSets();
    if (!offered.some((set) => set.code === setCode)) return { error: "Pick a set from the list." };
    const starter = await getSetStarterCards(setCode);
    if (starter.length === 0) return { error: "Pick a set from the list." };
    entries = starter.map((card) => ({
      cardId: card.id,
      section: defaultSectionForType(card.type),
      quantity: 1,
    }));
  }

  const cube = await createCubeWithLog(
    { id: current.profile.id, username: current.profile.username },
    parsed,
    entries,
  );

  revalidatePath("/cubes");
  redirect(editorPath(current.profile.username, cube.slug));
}

/**
 * Creates a cube with its first cards and logs both, the way every starting
 * point on the new-cube screen does it: one `cube_created` entry and, when
 * cards came with it, one `cards_imported` batch rather than a line per card.
 */
async function createCubeWithLog(
  owner: { id: string; username: string },
  metadata: CubeMetadata,
  entries: { cardId: string; section: CubeSection; quantity: number }[],
): Promise<Cube> {
  const cube = await createCube(
    {
      ownerId: owner.id,
      name: metadata.name,
      description: metadata.description,
      visibility: metadata.visibility,
    },
    entries,
  );
  const actor = { cubeId: cube.id, actorId: owner.id, actorUsername: owner.username };
  await recordCubeChanges([
    { ...actor, kind: "cube_created", toValue: cube.name },
    ...(entries.length > 0
      ? [
          {
            ...actor,
            kind: "cards_imported" as const,
            quantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
            toValue: String(entries.length),
          },
        ]
      : []),
  ]);
  return cube;
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
  if (isTokenCard(card)) return tokenError(card);

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
  // One fewer is always allowed; one more of a token is adding one.
  if (delta > 0 && card && isTokenCard(card)) return tokenError(card);
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
  // Unreachable while a token only groups with tokens, which `check:printings`
  // asserts; kept so that invariant is not the only thing standing here.
  if (isTokenCard(to) && !isTokenCard(from)) return tokenError(to);

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

/**
 * Copies a cube into a new private one owned by the caller, under the name
 * they chose.
 *
 * Read access is re-checked here, not assumed from the page that rendered the
 * button: a private cube can only be cloned by its owner.
 *
 * **The name is asked for up front** because the slug comes from it once and
 * never changes on rename. Naming the copy "Copy of …" before its owner saw it
 * is how the most active cube on the site ended up at `copy-of-the-blevins-cube`
 * for good.
 */
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

  // Same rules as naming any other cube. Visibility is not asked: a clone is
  // private until its owner decides otherwise.
  const named = validateMetadata({ name: formData.get("name"), description: null, visibility: "private" });
  if (!named.ok) return { error: named.error };

  const clone = await cloneCube(source.id, current.profile.id, named.name);

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

export interface CardSuggestion {
  card: BrowseCard;
  defaultSection: CubeSection;
}

/**
 * Type-ahead for the edit panel.
 *
 * Two round trips, and both are load-bearing. It used to make four: it also
 * prefetched every printing of all twelve matches and re-read the whole cube's
 * quantities, on every debounced keystroke. Neither is needed now.
 *
 * The printings are gone because each row already carries `printingCount`, so
 * the panel knows whether an alternates control is worth offering and loads the
 * list from `listPrintingsAction` when one is actually opened — a trip paid
 * once, when someone looks, rather than on every keystroke for rows they never
 * touch.
 *
 * The quantities are gone because the panel stages its edits: nothing writes
 * between page load and Save, so the counts it was handed as props cannot go
 * stale underneath it. That is only true of the staged panel, and re-reading
 * them here would be correct again the moment anything writes per click.
 */
export async function quickSearchAction(
  cubeId: string,
  query: string,
  allPrintings = false,
): Promise<{ error?: string; results: CardSuggestion[] }> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error, results: [] };

  const matches = await quickSearchCards(query, { allPrintings: Boolean(allPrintings) });
  return {
    results: matches.map((card) => ({
      card,
      defaultSection: defaultSectionForType(card.type),
    })),
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
  return previewPastedList(text);
}

/**
 * The same preview for a cube that does not exist yet — the new-cube screen's
 * "paste a list" starting point. Gated on being a signed-in, unsuspended
 * account rather than on a cube, because there is no cube to own; it writes
 * nothing and reveals nothing but the public card pool.
 */
export async function previewImportListAction(text: string): Promise<ImportPreviewState> {
  const creator = await requireCreator();
  if ("error" in creator) return { error: creator.error };
  return previewPastedList(text);
}

/** Both previews, so the size caps and the catalog are the same for each. */
async function previewPastedList(text: unknown): Promise<ImportPreviewState> {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { error: "Paste a list of card names first." };
  }
  if (text.length > MAX_IMPORT_CHARS) {
    return { error: "That list is too large to import in one go." };
  }

  const catalog = await getImportCatalog();
  return { preview: previewImport(text, catalog) };
}

/**
 * Who may make a new cube: signed in, with a username, not suspended, and
 * under the per-account cap. The one gate for every creation path that does
 * not come through a form.
 */
async function requireCreator(): Promise<{ profile: User } | { error: string }> {
  const current = await getCurrentUser();
  if (!current?.profile) return { error: "You need to be signed in." };
  const suspended = suspensionError(current.profile);
  if (suspended) return suspended;
  return { profile: current.profile };
}

/**
 * Creates a cube from a confirmed paste: the cube and its cards in one go.
 *
 * Nothing is written until here, so someone who pastes a list and walks away
 * leaves no empty cube behind. The rows are re-validated exactly as
 * `commitImportAction` does it. Returns the editor path rather than calling
 * `redirect()`, so the caller's dropped-request guard has no `NEXT_REDIRECT`
 * to tell apart from a real failure.
 */
export async function createCubeFromListAction(
  metadata: { name: unknown; description: unknown; visibility: unknown },
  rows: ImportCommitRow[],
): Promise<ActionState & { added?: number; path?: string }> {
  const creator = await requireCreator();
  if ("error" in creator) return { error: creator.error };

  const atLimit = await underCubeLimit(creator.profile.id);
  if (atLimit) return atLimit;

  const parsed = validateMetadata({
    name: metadata?.name,
    description: metadata?.description,
    visibility: metadata?.visibility,
  });
  if (!parsed.ok) return { error: parsed.error };

  const merge = mergeImportRows(rows, MAX_CARD_QUANTITY);
  if (!merge.ok) return { error: merge.error };

  const known = await getCardsByIds(merge.rows.map((entry) => entry.cardId));
  const knownIds = new Set(known.map((card) => card.id));
  const unknown = merge.rows.find((entry) => !knownIds.has(entry.cardId));
  if (unknown) return { error: `That card no longer exists: ${unknown.cardId}` };
  const token = known.find(isTokenCard);
  if (token) return tokenError(token);

  const cube = await createCubeWithLog(
    { id: creator.profile.id, username: creator.profile.username },
    parsed,
    merge.rows,
  );

  revalidatePath("/cubes");
  return {
    added: merge.totalCopies,
    path: editorPath(creator.profile.username, cube.slug),
  };
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
  const token = known.find(isTokenCard);
  if (token) return tokenError(token);

  // One statement, not one per line: `mergeImportRows` has already collapsed
  // duplicates, so the whole import is a single upsert and a single
  // `updated_at` bump. See `addCubeCards`.
  await addCubeCards(owned.cube.id, entries);
  const copies = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  // One batch entry, not one per card — see the enum comment in the schema.
  await logChange(owned, {
    kind: "cards_imported",
    quantity: copies,
    toValue: String(entries.length),
  });

  revalidateCube(owned.profile.username, owned.cube.slug);
  return { added: copies };
}


/**
 * Saves a whole editing session in one go.
 *
 * The edit panel stages changes and sends them here on Save. That is a product
 * decision — it is how people actually edit a cube, and it is what makes
 * "Discard All" possible — but it is also the fix for a real fault: the panel
 * this replaces called `addCardAction` once per click, so a run of edits was a
 * run of round trips against a pool of six. See docs/page-speed.md.
 *
 * Everything the client sends is re-derived here rather than trusted, the same
 * way `commitImportAction` re-reads every card id: the rows arrive from a
 * browser, and the client is choosing among options, not dictating them.
 */
export async function saveCubeEditsAction(
  cubeId: string,
  rows: StagedEditRow[],
): Promise<ActionState & { applied?: number }> {
  const owned = await requireOwnedCube(cubeId);
  if ("error" in owned) return { error: owned.error };

  const planned = planStagedEdits(rows, MAX_CARD_QUANTITY);
  if (!planned.ok) return { error: planned.error };
  const { plan } = planned;

  // One read for every id the batch mentions. An unknown one would otherwise
  // fail on the foreign key partway through, leaving the cube half-edited.
  const known = await getCardsByIds(cardIdsInPlan(plan));
  const byId = new Map(known.map((card) => [card.id, card]));
  const missing = cardIdsInPlan(plan).find((id) => !byId.has(id));
  if (missing) return { error: `That card no longer exists: ${missing}` };

  // Refused before anything is written, so a batch is all or nothing. Removes
  // are not checked: taking a token out is always allowed. A replace is, on
  // its "to" side, unless it only switches between printings of one token.
  const tokenAdd =
    plan.adds.map((row) => byId.get(row.cardId)!).find(isTokenCard) ??
    plan.replaces
      .filter(
        (swap) => isTokenCard(byId.get(swap.toCardId)!) && !isTokenCard(byId.get(swap.fromCardId)!),
      )
      .map((swap) => byId.get(swap.toCardId)!)[0];
  if (tokenAdd) return tokenError(tokenAdd);

  const log: Omit<NewCubeChange, "cubeId" | "actorId" | "actorUsername">[] = [];

  // Removes first: a remove must not consume a copy this same batch just added,
  // or the log describes something that did not happen.
  if (plan.removes.length > 0) {
    const removed = await removeCubeCardCopies(owned.cube.id, plan.removes);
    for (const row of removed) {
      if (row.removed <= 0) continue;
      log.push({
        kind: "cards_removed",
        cardId: row.cardId,
        cardName: byId.get(row.cardId)?.name ?? row.cardId,
        // What actually went, not what was asked for — a slot may hold fewer
        // copies than the batch was built against.
        quantity: row.removed,
        fromSection: row.section,
      });
    }
  }

  // Replaces before adds. `moveOneCopy` decrements the source before merging
  // with `least(99, …)`, so at the cap it silently loses a copy; running these
  // first means an over-cap batch loses an *added* copy rather than an existing
  // one. A knowing exception to the fan-out rule: this is a loop over a tested
  // primitive because each replace is a distinct (from, to, section) triple and
  // a set-based version is materially harder, while a real batch carries a
  // handful at most.
  for (const swap of plan.replaces) {
    const from = byId.get(swap.fromCardId)!;
    const to = byId.get(swap.toCardId)!;
    // The same rule `swapPrintingAction` applies one edit at a time: a swap
    // between printings of one card is a printing switch, anything else is a
    // removal and an addition, and the log has to say which.
    const samePrinting = from.baseId === to.baseId;
    let moved = 0;
    for (let copy = 0; copy < swap.quantity; copy += 1) {
      const ok = await switchCopyPrinting(
        owned.cube.id,
        swap.fromCardId,
        swap.toCardId,
        swap.section,
      );
      if (!ok) break;
      moved += 1;
    }
    if (moved === 0) continue;

    if (samePrinting) {
      log.push({
        kind: "printing_switched",
        cardId: swap.toCardId,
        cardName: to.name,
        quantity: moved,
        toSection: swap.section,
        fromValue: swap.fromCardId,
        toValue: swap.toCardId,
      });
    } else {
      log.push({
        kind: "cards_removed",
        cardId: swap.fromCardId,
        cardName: from.name,
        quantity: moved,
        fromSection: swap.section,
      });
      log.push({
        kind: "cards_added",
        cardId: swap.toCardId,
        cardName: to.name,
        quantity: moved,
        toSection: swap.section,
      });
    }
  }

  // Adds last, and in one statement: `planStagedEdits` has already collapsed to
  // one row per (card, section), which is what lets a single `ON CONFLICT DO
  // UPDATE` carry the lot. See `addCubeCards`.
  if (plan.adds.length > 0) {
    await addCubeCards(owned.cube.id, plan.adds);
    for (const row of plan.adds) {
      log.push({
        kind: "cards_added",
        cardId: row.cardId,
        cardName: byId.get(row.cardId)?.name ?? row.cardId,
        quantity: row.quantity,
        toSection: row.section,
      });
    }
  }

  // One entry per card change, not one per batch: the log stays as granular as
  // it is for single edits, and the batching is only how they were written.
  await recordCubeChanges(
    log.map((entry) => ({
      ...entry,
      cubeId: owned.cube.id,
      actorId: owned.profile.id,
      actorUsername: owned.profile.username,
    })),
  );

  revalidateCube(owned.profile.username, owned.cube.slug);
  return { applied: log.reduce((sum, entry) => sum + (entry.quantity ?? 0), 0) };
}
