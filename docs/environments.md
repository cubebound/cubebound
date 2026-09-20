# Environments, migrations and branches

## Throwaway accounts

**Throwaway accounts come from `scripts/lib/test-account.ts`.** The
`insert into auth.users` it wraps was byte-identical in six checks with two
near-identical variants — and that column list is brittle, since GoTrue needs
several non-null with no defaults, so one upstream change broke every copy at
once. `scripts/lib/env.ts` holds the env-file reader **and imports nothing**:
some checks run without `--env-file-if-exists`, so anything they import must
not reach `src/db/index.ts`, which reads `DATABASE_URL` at load time and
throws. Keeping the reader beside the account helpers pulled the database layer
in behind it and broke `check:printings` on import.

### Migrations

Migrations run manually and separately per environment. `npm run db:migrate`
against dev is part of normal development; production is migrated deliberately
by the owner at merge time.

Prefer `db:migrate` (versioned files) over `db:push` (diffs the schema and can
drop columns). `db:generate` writes a migration from a schema diff — useful as a
starting point, but most migrations here are hand-written so the RLS statement
and the comment explaining *why* travel with the DDL.

- **The schema is current: production is migrated through `0013`, and `drizzle/`
  holds nothing newer.** `0013` (`cube_cards_cube_id_section_idx`) was applied
  by hand at the Draftmancer export deploy on 17 August 2026; `0012`
  (moderation) the same way on 16 August. Confirm either with
  `select indexname from pg_indexes where tablename = 'cube_cards'` rather than
  by reading this doc. Note that a hand-applied migration writes no row to
  production's `drizzle.__drizzle_migrations`, so that ledger and this repo's
  journal are already out of step — which is survivable only because `0013` is
  `CREATE INDEX IF NOT EXISTS` and re-running it is a no-op. The rule stands: a
  deploy does not run migrations, so a feature adding tables fails at request
  time however green the build looks. **Check `git log origin/master..master`
  before assuming what is live** — this doc describes the code, not the
  deployment.

### How the split happened

The dev project was created partway through development, after the Share button
went live. Everything up to and including migration `0007` and the champion
re-sync was applied **directly to production** before that; dev was then created
empty and brought to the same point with `db:migrate` and `sync-cards`. So the
two start aligned, and dev's card table has no riftscribe residue where
production has six rows.

That history is worth knowing because git does not record it: a migration file
present in the repo says nothing about which project has run it. Confirm
production's state before assuming a migration still needs applying there.

### Branching

`master` is production: pushing to it deploys the live site. Feature work
happens on branches; pushing a branch produces a Vercel preview deployment and
does not touch production *code*. `master` holds everything that is live.

**Nothing is in flight.** `master` is the only branch, local and remote, and it
is what cubebound.gg serves. Three others were deleted on 19 September 2026:
`draft-screen-rollout` and `staged-cube-editor` were merged and held nothing
`master` did not, and `main` was the retired original — a static landing page
plus `riot.txt`, four commits that were never part of this app. **`main` lives
on as the tag `retired-landing-page`**, because those four commits exist nowhere
else; GitHub Pages served them at `cubebound.github.io/cubebound` until it was
unpublished the same day, and that URL now 404s by intent.
`draftmancer-presets` — named Draftmancer formats
and rarity-slot presets — was abandoned unmerged on 18 September 2026 and its
branch deleted; it is not coming back, so treat that ground as unbuilt.

**What merged, in order, is `git log`'s business rather than this doc's.** The
last several are the draft settings rework and Crack-A-Pack
(`draft-screen-rollout`), the printing-collapse work (`printing-treatments`),
the owner's redirect off the visitor view, real 404s on `/edit` and
`/settings`, and the Printing dropdown's two-column query. None of them added
a migration, so production needs nothing applied by hand. A gate run is seventeen
scripts, `check:account-deletion` being the seventeenth; the other nine are pure
and run in CI instead.
