/**
 * Error monitoring settings, shared by the three Sentry entry points.
 *
 * **Off unless `NEXT_PUBLIC_SENTRY_DSN` is set**, and set to nothing locally,
 * so development never reports and a fork or a fresh clone needs no account.
 * Turning it on is one environment variable in Vercel — no code change.
 *
 * Why it exists at all: `error.tsx` shows a digest, and a digest is only useful
 * if you can look it up. Without this, "it broke" from a tester is unactionable.
 */

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export const sentryEnabled = SENTRY_DSN.length > 0;

export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: sentryEnabled,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Errors are the point; traces are a nice-to-have that costs quota. 10% is
  // enough to spot a route that got slow without paying for every request.
  tracesSampleRate: 0.1,

  // Nothing here is worth a session replay, and replays record the DOM — which
  // on this site includes other people's unlisted cube names.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Never attach cookies, headers or query strings. The session cookie is a
  // bearer token for a Supabase account, and a crash report is the last place
  // it should end up.
  sendDefaultPii: false,
};
