/** The default message for a request that never completed. */
export const COULD_NOT_REACH = "Couldn't reach the server. Try again.";

/**
 * Calls a server action from a client component without letting a rejection
 * escape.
 *
 * An action can fail two ways, and a call site has to handle both. It can come
 * back with `{ error }`, which is the action refusing. Or its promise can
 * reject, which is the request never completing: a dropped connection, a
 * sleeping phone, a dev server that stopped. Awaiting it bare handles only the
 * first. Inside a transition the rejection reaches `error.tsx` and replaces
 * the page; outside one it surfaces as an unhandled rejection and leaves
 * whatever busy flag the caller set stuck on, so the control looks frozen.
 * Both have shipped (Sentry `JAVASCRIPT-NEXTJS-7` and `-9`). See "Calling a
 * server action" in CLAUDE.md.
 *
 * Either failure reaches `onError` as one message and the call returns null,
 * so a caller only reads a result that succeeded.
 *
 * **A `redirect()` inside an action rejects too**, with a `NEXT_REDIRECT`
 * digest. That one is re-thrown: Next performs the navigation itself, and
 * swallowing it would show a wrong error instead.
 *
 * Plain module, no `"use client"`, and it imports nothing, so either side can
 * use it.
 */
export async function callAction<T extends { error?: string }>(
  call: () => Promise<T>,
  onError: (message: string) => void,
  lostMessage: string = COULD_NOT_REACH,
): Promise<T | null> {
  try {
    const result = await call();
    if (result?.error) {
      onError(result.error);
      return null;
    }
    return result;
  } catch (error) {
    const digest = (error as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
    onError(lostMessage);
    return null;
  }
}
