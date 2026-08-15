import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Sentry wraps the build to upload source maps and instrument the server.
 *
 * The wrapper is unconditional but the SDK itself is inert without
 * `NEXT_PUBLIC_SENTRY_DSN` (see src/lib/sentry-options.ts), so a build with no
 * Sentry configuration — CI, a fork, a fresh clone — behaves exactly as before.
 * Source map upload additionally needs `SENTRY_AUTH_TOKEN`, and is skipped with
 * a warning rather than a failure when it is absent.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Build logs are for build problems; a missing optional integration is not one.
  silent: !process.env.CI,

  // Source maps are uploaded, then deleted from the deployment, so a stack
  // trace is readable in Sentry without shipping our source to the browser.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Routes Sentry's own browser requests through our origin so ad blockers,
  // which block sentry.io outright, don't silently drop every client error.
  tunnelRoute: "/monitoring",
});
