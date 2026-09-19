# Security posture

Audited before the first wide share. What was checked, and what it turned up.

**Verified sound, don't undo it:**
- **RLS deny-all holds.** The publishable key was fired directly at PostgREST:
  `cubes`, `users`, `cube_cards`, `drafts`, `cube_follows` and `cards` all
  return zero rows, and `INSERT` returns 401. That is the backstop working —
  see [cube-access.md](cube-access.md) for why it exists rather than SELECT policies.
- **No secret has ever been committed.** `.env*` is gitignored bar the example,
  and a scan of full history turns up only placeholders.
- **Every mutation is gated.** All 25 server actions in the four files
  `check:cube-ownership` reads call one of `requireOwnedCube` /
  `requireDraftableCube` / `requireOwnDraft` / `requireFollowableCube` /
  `requireAdmin` / `getCurrentUser`, and the check fails the build if a new one
  doesn't. **The fifth `"use server"` file, `src/app/auth/actions.ts`, is not
  among them** — its five sign-in actions are gated on their own provider
  allowlist and on `getUser()`, but they sit outside that structural guarantee
  rather than inside it. That predates OAuth (`claimUsername` has always lived
  there) and is worth closing separately. CSRF is covered by Next's Server Action origin
  check — a spoofed `x-forwarded-host` without a matching `Origin` is rejected.
- **The auth callback's `next=` cannot leave the origin.** `${origin}${next}`
  was tested against `//evil`, `/\evil`, `///evil` and an absolute URL: the
  authority is already fixed by the time the path is appended.
- **No `dangerouslySetInnerHTML` anywhere**, and the only rendered email
  address is your own on `/welcome`.

**Fixed in this pass:**
- **Response headers were entirely absent.** `next.config.ts` now sets
  `X-Frame-Options`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` and
  a `Permissions-Policy`. The referrer one is load-bearing: every page fetches
  card art from Riot's CDN, and an unlisted cube's *URL is the secret*. Chrome
  already truncates to the origin; this stops that being a browser default.
- **`tunnelRoute` was removed** — see the note in `next.config.ts`.
- **The card browser's filters were uncapped**, so a kilobyte-long `?q=` became
  a kilobyte-long `ILIKE` across 1,288 rows. Now 100 chars, matching the cube
  searches.

**Known and accepted, not fixed in code:**
- **Sign-in has no application-level throttle.** Anyone can ask for a magic
  link to any address, which spends your Supabase quota and sends from your
  domain — a deliverability risk to `cubebound.gg` more than a security one.
  Supabase's own auth rate limit is the only brake; **set it deliberately in
  the dashboard** rather than inheriting a default. **OAuth narrows this
  without closing it**: `signInWithOAuth` sends no mail and spends no quota, so
  every visitor who takes a provider button is one who never touches the limit —
  but the magic-link endpoint is still there and still unthrottled.
- **No report or takedown path** for user-written cube text now that Explore
  indexes it, and no account deletion. Both matter more the wider this goes.

**Also fixed, after measuring rather than assuming:**
- **The OG image routes are the most expensive unauthenticated endpoint** — a
  database read, a fetch of the cover art and a PNG render each. This file used
  to claim the day-long CDN cache was bypassable on all of them via `?v=…`, and
  half of that was wrong. Measured against production: the site-wide
  `/opengraph-image` is prerendered and every random query returned a cache
  **HIT**, while `/cube/…/opengraph-image` returned **MISS** every time at
  1–2.5s each. So only the dynamic per-cube and per-profile previews were
  amplifiable. `src/middleware.ts` now 308s any query string on an
  `/opengraph-image` path to the bare path, collapsing every variant onto one
  cache entry, and skips session refresh there entirely — scrapers carry no
  cookies, so that was a Supabase round trip per scrape for a route that could
  not use the result.
  **It must be a redirect, not a rewrite**: Vercel keys the CDN on the incoming
  URL, so a rewrite would change nothing. And **Next appends its own hash** to
  `og:image` (`?c2531773f482a645`), so legitimate scrapers do go through the
  redirect — `check:share-previews` follows the advertised URL and compares the
  bytes against the cube's own preview. Comparing against a *size* instead let a
  mutation through that sent every cube to the generic site image.

## Still open

- Still open before a wide launch: a **Supabase auth rate limit** (not code —
  see above). Moderation now covers hiding and account removal; a
  user-facing *report* path is still absent, so problems have to be noticed
  rather than reported.
