"use server";

import { revalidatePath } from "next/cache";

import {
  getCubeById,
} from "@/db/queries/cubes";
import {
  createDraftRow,
  deleteDraft,
  getDraft,
  getDraftPools,
  markDraftComplete,
  recordPicks,
  setPickBoard,
} from "@/db/queries/drafts";
import type { Cube, Draft, User } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canViewCube } from "@/lib/cube-access";
import {
  DEFAULT_DRAFT_CONFIG,
  validateDraftConfig,
  type DraftConfig,
} from "@/lib/draft/config";
import { applyPick } from "@/lib/draft/engine";
import { generatePacks } from "@/lib/draft/packs";

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

/**
 * Deals a fresh draft of a cube.
 *
 * The config arrives from a browser, so it is **re-validated and rebuilt here**
 * rather than trusted: only the known fields are read, each is coerced to a
 * whole number, and `validateDraftConfig` decides. The form is a convenience;
 * this is the rule.
 */
export async function startDraftAction(
  cubeId: string,
  returnPath: string,
  requested?: unknown,
): Promise<DraftActionState & { draftId?: string }> {
  const allowed = await requireDraftableCube(cubeId);
  if ("error" in allowed) return { error: allowed.error };

  const config = readDraftConfig(requested);
  const problems = validateDraftConfig(config);
  if (problems.length > 0) return { error: problems[0].message };

  const pools = await getDraftPools(allowed.cube.id);
  const seed = crypto.randomUUID();
  const generated = generatePacks(config, pools, seed);
  if (!generated.ok) return { error: generated.error };

  const draft = await createDraftRow({
    cubeId: allowed.cube.id,
    drafterId: allowed.profile.id,
    seed,
    // Snapshotted so a cube edited mid-draft — or different settings next
    // time — cannot change what was dealt.
    config: { ...config },
    packs: generated.packs.map((round) => round.map((pack) => pack.map((c) => c.id))),
    seats: config.seats,
    humanSeat: 0,
  });

  revalidatePath(returnPath.startsWith("/") ? returnPath : "/");
  return { draftId: draft.id };
}

/**
 * Rebuilds a config from untrusted input.
 *
 * Field by field rather than a spread, so a client cannot smuggle in extra keys
 * that would be snapshotted into `drafts.config` and read back later — most
 * pointedly `passDirections`, which would let a caller pin the passing order
 * for a draft the engine derives it for.
 */
function readDraftConfig(input: unknown): DraftConfig {
  const source = (input ?? {}) as Record<string, unknown>;
  const num = (key: keyof DraftConfig, fallback: number) => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? Math.floor(value) : fallback;
  };
  return {
    seats: num("seats", DEFAULT_DRAFT_CONFIG.seats),
    packsPerPlayer: num("packsPerPlayer", DEFAULT_DRAFT_CONFIG.packsPerPlayer),
    packSize: num("packSize", DEFAULT_DRAFT_CONFIG.packSize),
    legendSlots: num("legendSlots", DEFAULT_DRAFT_CONFIG.legendSlots),
    battlefieldSlots: num("battlefieldSlots", DEFAULT_DRAFT_CONFIG.battlefieldSlots),
    legendOrBattlefieldSlots: num(
      "legendOrBattlefieldSlots",
      DEFAULT_DRAFT_CONFIG.legendOrBattlefieldSlots,
    ),
  };
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

/** Deletes one of the caller's own drafts, and its picks with it. */
export async function deleteDraftAction(draftId: string): Promise<DraftActionState> {
  const owned = await requireOwnDraft(draftId);
  if ("error" in owned) return { error: owned.error };

  await deleteDraft(owned.draft.id, owned.profile.id);
  revalidatePath("/drafts");
  return {};
}

