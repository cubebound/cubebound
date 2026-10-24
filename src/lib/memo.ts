/**
 * A value read once and reused for a while, in this process.
 *
 * **Concurrent callers share one read.** A TTL alone only deduplicates calls
 * that arrive after the first has *finished*; calls that arrive while it is in
 * flight each miss and each fire their own. That case is the one that matters
 * here: a burst of traffic lands on cold Vercel instances, and the August pool
 * exhaustion was exactly that, many concurrent reads of the same thing against
 * a pool of six (see docs/page-speed.md). So a miss stores its promise, and
 * everyone who asks before it settles gets the same one. It is cleared when
 * the read settles, failed or not, so one bad read never wedges later callers
 * onto a rejected promise.
 *
 * Deliberately an in-process memo rather than a framework cache: it needs no
 * revalidation story, cannot be wrong for longer than its TTL, and a cold
 * instance simply reads once.
 *
 * The value is shared between requests, so **nothing may mutate it**. Callers
 * render it and nothing more.
 *
 * - `cacheIf` decides whether a successful read is kept. A read it rejects is
 *   still returned to the callers that waited on it, just not stored, so the
 *   next request reads again.
 * - `onStaleError` makes a failed *refresh* serve the last good value instead
 *   of throwing, and is told the error so it can be reported (a caught error
 *   never reaches `onRequestError`). With no earlier value, the read throws
 *   either way. The stored value keeps its old time, so the next call retries.
 */
export interface Memo<T> {
  get(): Promise<T>;
  /** Forget the value. For checks that need a fresh read. */
  reset(): void;
}

export function memoize<T>(
  ttlMs: number,
  read: () => Promise<T>,
  options: { cacheIf?: (value: T) => boolean; onStaleError?: (error: unknown) => void } = {},
): Memo<T> {
  let stored: { at: number; value: T } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get() {
      if (stored && Date.now() - stored.at < ttlMs) return Promise.resolve(stored.value);
      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          const value = await read();
          if (!options.cacheIf || options.cacheIf(value)) stored = { at: Date.now(), value };
          return value;
        } catch (error) {
          if (stored && options.onStaleError) {
            options.onStaleError(error);
            return stored.value;
          }
          throw error;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    reset() {
      stored = null;
      inFlight = null;
    },
  };
}
