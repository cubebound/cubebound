# Monitoring and quota

## Error monitoring and analytics

- **Error monitoring is Sentry. It is on in production and off everywhere
  else**, because it keys off `NEXT_PUBLIC_SENTRY_DSN`
  (`src/lib/sentry-options.ts`) and only Vercel sets it — so dev, CI and forks
  never report and need no account. A DSN is public by design and grants
  nothing: it identifies a project to send *to*, which is the one legitimate
  exception to the `NEXT_PUBLIC_` rule in the root [CLAUDE.md](../CLAUDE.md). An auth
  token is not, and must never carry that prefix.
  Session replay is off deliberately: replays record the DOM, which here
  includes other people's unlisted cube names. Traces sample at 10% to protect
  the free-tier quota — that rate is the dial to turn down first if quota gets
  tight, since a plain page load already sends session envelopes.
  `error.tsx` shows the digest Sentry indexes the event under, so a tester
  reading it out is enough to find the trace.
- **To verify Sentry from outside, watch the network, not `window.Sentry`.**
  The SDK is bundled as a module and never attached to `window`, so probing for
  a global reports "not installed" on a working deployment — which it did once
  here. The signal is requests to the project's `ingest.*.sentry.io` envelope
  endpoint: some on load, two more when an error is thrown.
- **Traffic measurement is Vercel Analytics**, mounted in the root layout and
  rendered only when `NODE_ENV === "production"` so local navigation doesn't
  fill the dashboard. It is cookieless, needs no consent banner under its
  current design, and is enabled per-project in the Vercel dashboard — the
  component alone collects nothing until it is. It reports the **pathname**,
  which for a cube is its URL, and an unlisted cube's URL is the secret the
  Referrer-Policy exists to protect. That is acceptable here only because
  Vercel already logs every request path as the host, so this adds no party
  that could not already see it. **The same reasoning would not cover a
  third-party analytics script** — moving to one means redacting cube paths
  through `beforeSend` first, the way session replay is off in Sentry.

## Current state

- **Sentry is on in production.** `NEXT_PUBLIC_SENTRY_DSN` is set in Vercel and
  verified sending: a page load produces envelopes to the project's ingest host,
  and a deliberately thrown error produces two more. Client and edge/server
  capture share the same options; only the client path has been proven
  end-to-end, because proving the server path means causing a real production
  error. `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` are still unset,
  so stack traces are minified — those three additionally get readable ones, and
  **`SENTRY_AUTH_TOKEN` is a real secret**, unlike the DSN. See "Share previews,
  crawling and monitoring".
- **The site runs on free tiers with no payment method on Vercel**, so there is
  no bill to cap and **"set a spend cap" is not the control** — an earlier
  version of these docs said it was, repeatedly, and it was wrong. Exceeding
  Hobby limits degrades or pauses the project rather than charging anything, so
  the goal is staying inside them: keep per-request query counts low (see [page-speed.md](page-speed.md)), keep card images on Riot's CDN, and check Vercel → Usage and
  Supabase → Usage for actual headroom rather than guessing. Usage was
  comfortably low as of 16 August 2026.
