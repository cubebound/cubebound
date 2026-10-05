import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/sentry-options";

/**
 * Server and edge error reporting.
 *
 * Next calls this once per runtime at startup. Both report errors the same way.
 *
 * **The edge runtime gets no tracing.** Only middleware runs there, on every
 * non-static request, and middleware is half the site's Fluid Active CPU — a
 * per-invocation cost that does not depend on what the function does, so
 * anything initialised for it is paid on most requests. A middleware trace
 * would only ever show one cookie check. `tracesSampleRate` is `undefined`
 * rather than 0, because Sentry treats 0 as tracing switched on with every
 * span sampled out; only a nullish rate switches it off. Errors thrown in
 * middleware still arrive through `onRequestError`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(sharedSentryOptions);
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ ...sharedSentryOptions, tracesSampleRate: undefined });
  }
}

/**
 * Reports errors thrown while rendering a request.
 *
 * Without this hook a Server Component that throws produces a digest in the
 * logs and nothing in Sentry — which is exactly the case we added Sentry for.
 */
export const onRequestError = Sentry.captureRequestError;
