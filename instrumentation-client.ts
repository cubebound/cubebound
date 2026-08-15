import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "@/lib/sentry-options";

/**
 * Browser error reporting.
 *
 * The DSN is public by design — it identifies a project to send *to*, and grants
 * nothing — which is why it lives in a `NEXT_PUBLIC_` variable. That is the one
 * legitimate exception to the rule in CLAUDE.md about never putting keys there;
 * it is not a key.
 */
Sentry.init(sharedSentryOptions);

/** Ties client-side navigations to their traces. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
