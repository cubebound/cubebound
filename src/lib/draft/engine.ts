/**
 * The draft engine: state as data, `applyPick` as the only transition.
 *
 * Pure and deterministic. No database, no React, no clock — given the same
 * seed, config and packs, a sequence of human picks always produces the same
 * draft. That is what makes the persisted draft a *log* rather than a
 * snapshot: state is rebuilt by replaying picks through this module, so the
 * engine and the stored draft can never disagree about whose turn it is.
 */

import { chooseBotPick, commitDomains } from "./bots";
import { finalPoolSize, type DraftConfig, type PassDirection } from "./config";
import type { DraftCard, PackGrid } from "./packs";

export interface DraftState {
  seed: string;
  config: DraftConfig;
  /** round -> seat -> the pack as dealt. Never mutated. */
  allPacks: PackGrid;
  humanSeat: number;
  /** 0-based; equals config.packsPerPlayer once the draft is over. */
  round: number;
  /** 0-based pick within the round. */
  pickNumber: number;
  /** The pack currently in front of each seat. */
  packs: DraftCard[][];
  /** Cards taken, per seat, in pick order. */
  pools: DraftCard[][];
  /** Committed domains per seat; null until that seat's first pick. */
  committed: (string[] | null)[];
  status: "active" | "complete";
}

export interface AppliedPick {
  seat: number;
  round: number;
  pickNumber: number;
  card: DraftCard;
}

/** Left passes toward the next seat; right toward the previous one. */
export function directionStep(direction: PassDirection): 1 | -1 {
  return direction === "left" ? 1 : -1;
}

export function directionForRound(config: DraftConfig, round: number): PassDirection {
  const direction = config.passDirections[round];
  if (!direction) {
    throw new Error(
      `No pass direction configured for round ${round} (have ${config.passDirections.length})`,
    );
  }
  return direction;
}

function openRound(allPacks: PackGrid, round: number): DraftCard[][] {
  return (allPacks[round] ?? []).map((pack) => [...pack]);
}

export function createDraft({
  config,
  packs,
  seed,
  humanSeat = 0,
}: {
  config: DraftConfig;
  packs: PackGrid;
  seed: string;
  humanSeat?: number;
}): DraftState {
  if (config.passDirections.length < config.packsPerPlayer) {
    throw new Error(
      `passDirections has ${config.passDirections.length} entries but the draft runs ` +
        `${config.packsPerPlayer} rounds`,
    );
  }
  if (humanSeat < 0 || humanSeat >= config.seats) {
    throw new Error(`humanSeat ${humanSeat} is outside 0..${config.seats - 1}`);
  }

  return {
    seed,
    config,
    allPacks: packs,
    humanSeat,
    round: 0,
    pickNumber: 0,
    packs: openRound(packs, 0),
    pools: Array.from({ length: config.seats }, () => []),
    committed: Array.from({ length: config.seats }, () => null),
    status: "active",
  };
}

/** The pack the human is looking at right now. */
export function currentPack(state: DraftState): DraftCard[] {
  return state.packs[state.humanSeat] ?? [];
}

function takeFromPack(pack: DraftCard[], cardId: string): DraftCard | undefined {
  const index = pack.findIndex((card) => card.id === cardId);
  if (index === -1) return undefined;
  return pack.splice(index, 1)[0];
}

/**
 * Applies the human's pick, then every bot's, then passes the packs.
 *
 * Bots resolve in the same call because they are instant — there is no
 * intermediate state a caller could meaningfully observe, and exposing one
 * would just be a way to persist a half-finished round.
 */
export function applyPick(
  state: DraftState,
  cardId: string,
): { state: DraftState; picks: AppliedPick[] } {
  if (state.status === "complete") {
    throw new Error("This draft is already finished.");
  }

  const packs = state.packs.map((pack) => [...pack]);
  const pools = state.pools.map((pool) => [...pool]);
  const committed = [...state.committed];
  const picks: AppliedPick[] = [];

  const human = takeFromPack(packs[state.humanSeat], cardId);
  if (!human) {
    throw new Error(`Card ${cardId} is not in the pack at seat ${state.humanSeat}.`);
  }
  pools[state.humanSeat].push(human);
  if (committed[state.humanSeat] === null) {
    // The human's "commitment" is recorded for symmetry only; nothing reads it.
    committed[state.humanSeat] = commitDomains(human);
  }
  picks.push({
    seat: state.humanSeat,
    round: state.round,
    pickNumber: state.pickNumber,
    card: human,
  });

  for (let seat = 0; seat < state.config.seats; seat++) {
    if (seat === state.humanSeat) continue;
    const choice = chooseBotPick(
      packs[seat],
      committed[seat],
      state.seed,
      state.round,
      state.pickNumber,
      seat,
    );
    if (!choice) continue;
    takeFromPack(packs[seat], choice.id);
    pools[seat].push(choice);
    if (committed[seat] === null) committed[seat] = commitDomains(choice);
    picks.push({ seat, round: state.round, pickNumber: state.pickNumber, card: choice });
  }

  // Pass: the pack at seat s moves to seat s + step, so seat s receives the one
  // from s - step.
  const step = directionStep(directionForRound(state.config, state.round));
  const seats = state.config.seats;
  const passed: DraftCard[][] = Array.from({ length: seats }, (_, seat) => {
    const from = (((seat - step) % seats) + seats) % seats;
    return packs[from];
  });

  const packsEmpty = passed.every((pack) => pack.length === 0);
  let round = state.round;
  let pickNumber = state.pickNumber + 1;
  let nextPacks = passed;
  let status: DraftState["status"] = "active";

  if (packsEmpty) {
    round += 1;
    pickNumber = 0;
    if (round >= state.config.packsPerPlayer) {
      status = "complete";
      nextPacks = Array.from({ length: seats }, () => []);
    } else {
      nextPacks = openRound(state.allPacks, round);
    }
  }

  return {
    state: { ...state, packs: nextPacks, pools, committed, round, pickNumber, status },
    picks,
  };
}

/** Replays a stored sequence of human picks to rebuild live state. */
export function replay(initial: DraftState, humanPicks: readonly string[]): DraftState {
  let state = initial;
  for (const cardId of humanPicks) {
    if (state.status === "complete") break;
    state = applyPick(state, cardId).state;
  }
  return state;
}

/** True once every seat holds a full pool. */
export function isComplete(state: DraftState): boolean {
  return state.status === "complete";
}

export function expectedPoolSize(config: DraftConfig): number {
  return finalPoolSize(config);
}
