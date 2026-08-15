import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

/**
 * Response headers, applied to everything.
 *
 * The site shipped with none of these — measured, not assumed — which left the
 * defences below to browser defaults.
 *
 * No full Content-Security-Policy yet: Next inlines bootstrap scripts, so a
 * `script-src` policy needs per-request nonces threaded through the app, which
 * is a real change and easy to get subtly wrong. `frame-ancestors` is the part
 * that actually protects someone, and it needs no nonce — so it ships now and
 * the rest is a deliberate later job.
 *
 * `Strict-Transport-Security` is deliberately absent: Vercel sets it on custom
 * domains itself, and a wrong `max-age` here is the one header that can make a
 * domain unreachable rather than merely less safe.
 */
const securityHeaders = [
  // Clickjacking. Nothing here is one click from destruction — deleting a cube
  // makes you type its name — but Follow, Log out and the section moves are all
  // single clicks worth stealing, and there is no reason to be framed at all.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Stops a browser second-guessing a Content-Type. Matters most for anything
  // user-supplied that we serve back.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Card art is fetched from Riot's CDN on every page, and the Referer goes
  // with it. Chrome already truncates to the origin, but that is a default
  // rather than a promise — and the full path of an *unlisted* cube is exactly
  // the secret that setting is supposed to keep. Say it explicitly.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // We ask for none of these. Denying them means an injected script can't
  // either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Sentry wraps the build to upload source maps and instrument the server.
 *
 * The wrapper is unconditional but the SDK itself is inert without
 * `NEXT_PUBLIC_SENTRY_DSN` (see src/lib/sentry-options.ts), so a build with no
 * Sentry configuration — CI, a fork, a fresh clone — behaves exactly as before.
 * Source map upload additionally needs `SENTRY_AUTH_TOKEN`, and is skipped with
 * a warning rather than a failure when it is absent.
 *
 * **`tunnelRoute` is deliberately not set.** It would add a rewrite that
 * forwards unauthenticated POST bodies from our domain to
 * `o<orgid>.ingest.sentry.io` — the org and project ids are constrained to
 * digits, so it is not an open proxy to arbitrary hosts, but it is still an
 * egress path anyone can drive and we pay the invocations for. What it buys is
 * client-side error reports that ad blockers would otherwise drop; server-side
 * errors, which are the ones that matter here, never go through it. Not a trade
 * worth making before there is traffic to lose reports from.
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
});
