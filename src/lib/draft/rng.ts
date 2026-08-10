/**
 * Seeded pseudo-random numbers.
 *
 * Every random decision in a draft — pack contents, the legend/battlefield coin
 * flip, each bot pick — goes through here, so a seed reproduces a draft exactly.
 * That is what lets a draft survive a refresh by replay, and what lets the
 * checks assert determinism rather than merely plausibility.
 *
 * Streams are derived from `(seed, ...parts)` rather than drawn from one shared
 * generator on purpose: a bot's pick then depends on its seat and the pick
 * number, not on how many times anything else happened to call `next()` first.
 * Replay therefore cannot drift if call order ever changes.
 */

/** FNV-1a over a string, to 32 bits. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  /** A uniformly chosen element, or undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined;
}

/** mulberry32 — small, fast, and good enough for shuffling a card pool. */
export function createRng(...parts: (string | number)[]): Rng {
  let state = hashString(parts.join("|"));

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (max: number) => (max <= 0 ? 0 : Math.floor(next() * max));

  return {
    next,
    int,
    pick: <T,>(items: readonly T[]) =>
      items.length === 0 ? undefined : items[int(items.length)],
  };
}

/**
 * Fisher-Yates against a copy. Returns a new array so callers can keep the
 * input — the draft snapshots its pools and must not mutate them.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
