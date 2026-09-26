# Auth and sign-in

Magic link, plus **Discord and Google**. `/settings` is where an account sees
what it has, adds what it lacks, and ends: self-serve deletion is the last
section of that page, and the rules governing it are
[moderation.md](moderation.md)'s.

- **The callback needed no change.** `signInWithOAuth` returns to the same
  `/auth/callback`, which already does `exchangeCodeForSession` — the identical
  PKCE exchange a magic link uses — and already sends a user with no profile to
  `/welcome`. `redirectTo` goes through `authCallbackUrl` for the same reason
  the magic links do, and **whatever it produces must be on the Supabase
  redirect allowlist** or Supabase silently falls back to the dashboard Site URL
  and sign-in never completes. That failure shipped once already.
- **The buttons are forms, not links.** The action calls `signInWithOAuth`,
  which sets the PKCE verifier cookie *before* returning the URL to redirect to.
  An anchor straight to the provider skips that and the exchange fails on the
  way back with "code verifier not found in storage". `check:oauth-buttons`
  asserts no such anchor exists — a link looks correct in review and in a
  screenshot, which is exactly why it needs a check.
- **X/Twitter is deliberately not offered.** Its OAuth 2.0 hands over no email
  without elevated access, so an account made that way cannot be linked to an
  existing one, cannot be recovered, and cannot be contacted. That is a
  different kind of account, not a different button.
- **Signing in matches on email; linking does not.** The two paths resolve
  accounts differently and this was documented backwards at first, so it is
  worth stating precisely. `signInWithOAuth` from `/login` resolves to whichever
  account carries the provider's address: the same address attaches to the
  existing account, and a *different* one silently creates a second account
  whose cubes appear to have vanished. `linkIdentity` from `/settings` attaches
  to the account in the current session **whatever address the provider uses** —
  verified in dev by linking a `@gmail.com` Google identity onto an account
  registered as `@cubebound.test`. The only thing it refuses is a provider
  account already linked elsewhere, which comes back as
  `identity_already_exists`.
- **So the guidance on `/login` is two-sided**, and `check:oauth-buttons`
  asserts both halves: a matching address connects automatically, and a
  different address means signing in by email first and connecting from
  Settings. Stating only the first reads as "you cannot use another address",
  which is untrue and pushes people into making the duplicate account the
  warning exists to prevent.
- **A successful link returns to `/settings?linked=<provider>`**, via a `next`
  on `redirectTo`. Without it the callback exchanges the code, finds a profile
  and falls through to `/` — so a link that *worked* looked exactly like one
  that failed. The banner additionally checks the provider really is on the
  account rather than trusting the query parameter, since a URL can be typed.
- **Sign-in returns to where it started, through `?next=` on `/login`.** A
  signed-out Clone button links to `/login?next=/cube/{username}/{slug}`, because
  landing on the home page after signing in turned a one-click Clone into a hunt
  for the cube. The path rides as a hidden field on the email form and both
  provider forms, onto the callback URL, and — for a first-time user — through
  `/welcome?next=` and `UsernameForm`, so `claimUsernameAction` redirects there
  rather than to `/`. A signed-in visitor to `/login?next=` goes straight there.
  **Every hop re-checks it with `safeReturnPath`** in `src/lib/site-url.ts`: only
  a same-site absolute path, refusing `//` and `/\` (a browser reads both as
  another host), control characters, and anything over 512 characters. It
  arrives from a query string at each step, so no step trusts the one before.
- **`authCallbackUrlWithNext` is exactly `authCallbackUrl` when there is no safe
  `next`**, so a plain sign-in sends Supabase the same `redirectTo` it always
  has and the allowlist question only arises for a return path. If Supabase
  ever rejects the query-carrying URL, it falls back to the Site URL, the `/`
  near-miss forwarding below self-heals the code, and the visitor lands home:
  the old behaviour, not a broken sign-in. Linking has relied on a `next` on
  `redirectTo` since it shipped.
- **"Has a backup" is not "has two identities".** Magic link works for any
  address on the account, including one that arrived from Discord — so a
  Discord-only account already has two ways in, while an email-only account has
  one. `hasBackupSignIn` therefore asks whether *any OAuth identity* exists,
  which is the only thing that removes the mailbox as a single point of failure.
  A dismissible notice on `/cubes` tells the people who lack one; the dismissal
  is a cookie, because it is a UI preference and does not warrant a migration.
- **Two dashboard settings are required and are not code**: the Discord and
  Google providers themselves, and **manual linking**, without which
  `linkIdentity` returns an error rather than attaching a second provider.
- **The checks are split by what they need.** `check:oauth` is pure — the backup
  rule, the provider allowlist, and that both actions still validate their input
  and build `redirectTo` through `authCallbackUrl` — so it runs in **CI on every
  push**. `check:oauth-buttons` needs a server for the `/login` markup and stays
  in the manual gate. Auth invariants caught a week later at gate time have
  already been built on.
- **What no check can cover**: a real consent screen, and `linkIdentity`
  end-to-end. Both scripts say so in their own output rather than implying more.
- **Connecting a provider to an existing account must be done from `/settings`,
  not `/login`.** The two paths differ: `linkIdentity` attaches an identity to
  *this* account, while `signInWithOAuth` resolves to whichever account matches
  the provider's address. `public.users` has **no email column** — accounts map
  by `auth.users.id` alone — so a provider address that Supabase does not link
  mints a *new* auth row, a new profile, and `is_admin` back to its `false`
  default. For an ordinary user that reads as "my cubes vanished". **For the
  admin account it is unrecoverable from the web**: nothing in `src/` writes
  `is_admin`, and `dev:login --admin` only reaches dev, so the fix is raw SQL
  against production. Confirm the address on the production `auth.users` row
  before connecting a provider to it.

## Auth and data access

- **The magic-link origin comes from the request, not an env var.**
  `resolveSiteUrl` in `src/lib/site-url.ts` reads `x-forwarded-host` /
  `x-forwarded-proto`, so links are right on production, previews, custom
  domains and localhost with no configuration. `NEXT_PUBLIC_SITE_URL` is an
  optional pin; `VERCEL_URL` is deliberately **not** consulted — it is the
  *per-deployment* hostname (`cubebound-a1b2c3.vercel.app`), never the project
  domain, so it is never on the Supabase allowlist. Using it was the production
  bug: **Supabase silently falls back to the dashboard Site URL when
  `emailRedirectTo` is not allowlisted**, dropping the visitor on `/?code=…`
  where nothing consumes the code, so sign-in just never completed. Whatever
  origin you produce must be on the allowlist, or you get that failure back.
- `/` forwards a stray `?code=` (or `?error_description=`) to `/auth/callback`
  rather than dropping it, so a near-miss redirect self-heals. The PKCE
  verifier is in a cookie, so the exchange survives the hop.
- Signing in creates no profile row. First-time users land on `/welcome` to claim
  a username, which is what creates `public.users`. Anything that needs a
  username must handle `profile === null`.
- Username rules live in `src/lib/username.ts`: 3–30 chars, `[a-z0-9_-]`,
  alphanumeric at both ends, lower-cased, with a reserved list. They appear in
  `/cube/{username}/{slug}`, so they must be URL-safe without escaping.
  Uniqueness is enforced by the DB index, not a check-then-insert.

- The nav renders the signed-in user from the **root layout**, and a Server
  Action that redirects does not re-render a layout the client Router Cache
  already holds. Any action that changes auth or profile state must call
  `revalidatePath("/", "layout")` (see `revalidateAuthUi` in
  `src/app/auth/actions.ts`) or the nav goes stale until a hard reload and Back
  can re-expose the claim form. `npm run check:auth-flow` guards this.
