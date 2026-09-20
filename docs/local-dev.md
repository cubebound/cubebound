# Local development

## Seed data

`npm run seed:discovery` fills dev with users, randomly generated cubes (real
cards, plausible names, descriptions and primers, spread updated-dates) and a
skewed follow graph, so Explore, search, sorting and the Followed tab have
something to work on by hand. `-- --users N --cubes N` sizes it; `-- --clean`
removes it.

Everything it makes is tagged with a `@seed.cubebound.test` email and `--clean`
deletes exactly those accounts, taking their cubes and follows by cascade — so
it never has to guess what it owns. It refuses to run unless `DATABASE_URL` and
`NEXT_PUBLIC_SUPABASE_URL` name the same project, which stops a stray shell
variable turning a seed run into a production write. The first three cubes are
forced public / unlisted / private: left to chance a run can produce no private
cube, and private is the case with a rule to get wrong.

**Signing in locally does not depend on email.** `npm run dev:login` creates a
throwaway account, mints a session and prints a `document.cookie` line to paste
into the browser; `-- --admin` sets `is_admin` so the moderation tools appear.
`npm run dev:logout -- <username>` or `-- --all` removes them again, refusing
anything whose address is not a `@cubebound.test` throwaway.

That exists because **the dev project sends through Supabase's built-in
sender, which is testing-only** — a few messages an hour, restricted to
addresses in your Supabase organisation. When it drops one, nothing local looks
wrong: `/auth/v1/otp` still returns 200 and GoTrue still stamps
`recovery_sent_at`, so the app, the redirect URL and `check:magic-link` all pass
while no link arrives. **Diagnose it in the Supabase dashboard's auth logs, not
in this codebase.** Production is unaffected — it uses a custom sender on
`login@cubebound.gg`.

Like every other script here, `dev:login` **creates rather than borrows**: it
refuses a username that already exists. Setting a password on a real row to get
a session is what locked the dev admin out once.

**Seeded accounts cannot sign in** — the app is magic-link only and they have no
mailbox. They exist to be found, not used. Follow and search from your own
account; `-- --follow-as <yourname>` has them follow your cubes so follower
counts appear where you will actually look.
