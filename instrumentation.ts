import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/sentry-options";

/**
 * Server and edge error reporting.
 *
 * Next calls this once per runtime at startup. Both branches get the same
 * options; the runtimes differ in what SDK internals they can load, not in what
 * we want reported.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init(sharedSentryOptions);
  }
}

/**
 * Reports errors thrown while rendering a request.
 *
 * Without this hook a Server Component that throws produces a digest in the
 * logs and nothing in Sentry — which is exactly the case we added Sentry for.
 */
export const onRequestError = Sentry.captureRequestError;
