"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addCubeCard,
  createCube,
  getCubeById,
  recordCubeChange,
} from "@/db/queries/cubes";
import {
  createDraftRow,
  getDraft,
  getDraftPicks,
  getDraftPools,
  markDraftComplete,
  recordPicks,
  setPickBoard,
} from "@/db/queries/drafts";
import type { Cube, Draft, User } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canViewCube } from "@/lib/cube-access";
import { DEFAULT_DRAFT_CONFIG } from "@/lib/draft/config";
import { applyPick } from "@/lib/draft/engine";
import { generatePacks } from "@/lib/draft/packs";
import { defaultSectionForType } from "@/lib/riftbound";

import { restoreDraftState } from "./state";

export interface DraftActionState {
  error?: string;
}

/**
 * Drafting is gated on **viewing**, not owning.
 *
 * Anyone who can open a cube can draft it — that is the point of sharing one —
 * so this deliberately is not `requireOwnedCube`. Sign-in is still required
 * because a draft is persisted to survive a refresh and the row has to belong
 * to somebody. Non-viewers get "not found" rather than "forbidden", the same
 * convention the cube mutations use, so private cube ids can't be probed.
 */
async function requireDraftableCube(
  cubeId: string,
): Promise<{ cube: Cube; profile: User } | { error: string }> {
  const current = await getCurrentUser();
  if (!current?.profile) return { error: "Sign in to draft this cube." };
  if (typeof cubeId !== "string" || cubeId.length === 0) return { error: "Cube not found." };

  const cube = await getCubeById(cubeId);
  if (!canViewCube(cube, current.profile.id)) return { error: "Cube not found." };
  return { cube, profile: current.profile };
}

/**
 * A draft belongs to whoever is sitting in it.
 *
 * Separate from `requireDraftableCube`: a cube being public does not make
 * someone else's draft yours to pick in.
 */
async function requireOwnDraft(
  draftId: string,
): Promise<{ draft: Draft; profile: User } | { error: string }> {
  const current = await getCurrentUser();
  if (!current?.profile) return { error: "Sign in to continue this draft." };

  const draft = await getDraft(draftId);
  if (!draft || draft.drafterId !== current.profile.id) return { error: "Draft not found." };
  return { draft, profile: current.profile };
}

/** Deals a fresh draft of a cube. */
export async function startDraftAction(
  cubeId: string,
  returnPath: string,
): Promise<DraftActionState & { draftId?: string }> {
  const allowed = await requireDraftableCube(cubeId);
  if ("error" in allowed) return { error: allowed.error };

  const pools = await getDraftPools(allowed.cube.id);
  const seed = crypto.randomUUID();
  const generated = generatePacks(DEFAULT_DRAFT_CONFIG, pools, seed);
  if (!generated.ok) return { error: generated.error };

  const draft = await createDraftRow({
    cubeId: allowed.cube.id,
    drafterId: allowed.profile.id,
    seed,
    // Snapshotted so a cube edited mid-draft cannot change what was dealt.
    config: { ...DEFAULT_DRAFT_CONFIG },
    packs: generated.packs.map((round) => round.map((pack) => pack.map((c) => c.id))),
    seats: DEFAULT_DRAFT_CONFIG.seats,
    humanSeat: 0,
  });

  revalidatePath(returnPath.startsWith("/") ? returnPath : "/");
  return { draftId: draft.id };
}

/** Takes one card for the human seat, then resolves every bot and passes. */
export async function makePickAction(
  draftId: string,
  cardId: string,
  returnPath: string,
): Promise<DraftActionState> {
  const owned = await requireOwnDraft(draftId);
  if ("error" in owned) return { error: owned.error };
  if (owned.draft.status === "complete") return { error: "This draft is already finished." };

  const restored = await restoreDraftState(owned.draft);
  if ("error" in restored) return { error: restored.error };

  let next;
  try {
    next = applyPick(restored.state, cardId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That pick isn't available." };
  }

  await recordPicks(
    owned.draft.id,
    next.picks.map((pick) => ({
      round: pick.round,
      pickNumber: pick.pickNumber,
      seat: pick.seat,
      cardId: pick.card.id,
    })),
  );
  if (next.state.status === "complete") await markDraftComplete(owned.draft.id);

  revalidatePath(returnPath.startsWith("/") ? returnPath : "/");
  return {};
}

/** Moves one drafted card between the main board and the sideboard. */
export async function setCardBoardAction(
  draftId: string,
  round: number,
  pickNumber: number,
  board: "main" | "side",
  returnPath: string,
): Promise<DraftActionState> {
  const owned = await requireOwnDraft(draftId);
  if ("error" in owned) return { error: owned.error };
  if (board !== "main" && board !== "side") return { error: "Unknown board." };

  await setPickBoard(owned.draft.id, owned.draft.humanSeat, round, pickNumber, board);
  revalidatePath(returnPath.startsWith("/") ? returnPath : "/");
  return {};
}

/** Turns a finished pool into a private cube of the drafter's own. */
export async function saveDraftAsCubeAction(
  draftId: string,
  name: string,
): Promise<DraftActionState> {
  const owned = await requireOwnDraft(draftId);
  if ("error" in owned) return { error: owned.error };

  const restored = await restoreDraftState(owned.draft);
  if ("error" in restored) return { error: restored.error };

  const pool = restored.state.pools[restored.state.humanSeat] ?? [];
  if (pool.length === 0) return { error: "There's nothing in your pool yet." };

  // Keep the main/side split the drafter made: their sideboard becomes the
  // cube's sideboard rather than being flattened back into the deck.
  const picks = (await getDraftPicks(owned.draft.id))
    .filter((pick) => pick.seat === owned.draft.humanSeat)
    .sort((a, b) => a.round - b.round || a.pickNumber - b.pickNumber);
  const boards = picks.map((pick) => pick.board);

  const cube = await createCube({
    ownerId: owned.profile.id,
    name: (name.trim() || "Drafted pool").slice(0, 100),
    description: null,
    visibility: "private",
  });

  // One row per card, quantity-merged by addCubeCard when a pool holds two.
  for (const [index, card] of pool.entries()) {
    const section =
      boards[index] === "side" ? "sideboard" : defaultSectionForType(card.type);
    await addCubeCard(cube.id, card.id, section, 1);
  }
  await recordCubeChange({
    cubeId: cube.id,
    actorId: owned.profile.id,
    actorUsername: owned.profile.username,
    kind: "cards_imported",
    quantity: pool.length,
    toValue: String(new Set(pool.map((card) => card.id)).size),
  });

  revalidatePath("/cubes");
  redirect(`/cube/${owned.profile.username}/${cube.slug}/edit`);
}
