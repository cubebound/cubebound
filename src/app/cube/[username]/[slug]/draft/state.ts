import { getDraftCards, getDraftPicks } from "@/db/queries/drafts";
import type { Draft } from "@/db/schema";
import { DEFAULT_DRAFT_CONFIG, type DraftConfig } from "@/lib/draft/config";
import { createDraft, type DraftState } from "@/lib/draft/engine";
import type { DraftCard, PackGrid } from "@/lib/draft/packs";
import { applyPick } from "@/lib/draft/engine";

/**
 * Rebuilding live draft state from the stored row.
 *
 * Not a `"use server"` module: these are helpers the page and the actions both
 * call, and a server-action file may only export async actions. Same rule as
 * `src/lib/` helpers, applied to route-local code.
 */

export type DetailedCard = DraftCard & {
  imageThumb: string | null;
  imageFull: string | null;
  energyCost: number | null;
  powerCost: Record<string, number> | null;
};

/** Turns the stored id grid back into cards the engine can work with. */
export function hydratePacks(
  packs: string[][][],
  byId: Map<string, DetailedCard>,
): PackGrid {
  return packs.map((round) =>
    round.map((pack) =>
      pack.flatMap((id) => {
        const card = byId.get(id);
        return card ? [card] : [];
      }),
    ),
  );
}

/** Config as stored, falling back to the current defaults for older rows. */
export function configFrom(draft: Draft): DraftConfig {
  const stored = draft.config as Partial<DraftConfig> | null;
  return {
    ...DEFAULT_DRAFT_CONFIG,
    ...(stored ?? {}),
    passDirections: stored?.passDirections ?? DEFAULT_DRAFT_CONFIG.passDirections,
  };
}

export interface RestoredDraft {
  state: DraftState;
  cardsById: Map<string, DetailedCard>;
}

/**
 * Replays the stored human picks through the engine.
 *
 * Only the human's picks are replayed: the bots' are a deterministic function
 * of the seed and the state, so feeding the stored bot rows back in would be
 * asserting them twice and would diverge loudly if they ever disagreed. They
 * are stored for readability, not as input.
 */
export async function restoreDraftState(
  draft: Draft,
): Promise<RestoredDraft | { error: string }> {
  const ids = draft.packs.flat().flat();
  const cardsById = await getDraftCards(ids);

  const missing = ids.filter((id) => !cardsById.has(id));
  if (missing.length > 0) {
    return {
      error:
        `${missing.length} card(s) this draft was dealt no longer exist in the ` +
        `database, so it can't be resumed.`,
    };
  }

  const config = configFrom(draft);
  let state = createDraft({
    config,
    packs: hydratePacks(draft.packs, cardsById),
    seed: draft.seed,
    humanSeat: draft.humanSeat,
  });

  const picks = await getDraftPicks(draft.id);
  const humanPicks = picks
    .filter((pick) => pick.seat === draft.humanSeat)
    .sort((a, b) => a.round - b.round || a.pickNumber - b.pickNumber);

  for (const pick of humanPicks) {
    if (state.status === "complete") break;
    state = applyPick(state, pick.cardId).state;
  }

  return { state, cardsById };
}
