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
in behind it and broke `check:printings` on import. `scripts/lib/chrome.ts`,
the CDP driver, imports nothing for the same reason.

### Migrations

Migrations run manually and separately per environment. `npm run db:migrate`
against dev is part of normal development; production is migrated deliberately
by the owner at merge time. Card data reaches production the same way, by
running the sync against it rather than by deploying; when a sync or a card
data script has to run relative to a deploy is in [card-data.md](card-data.md).

Prefer `db:migrate` (versioned files) over `db:push` (diffs the schema and can
drop columns). `db:generate` writes a migration from a schema diff — useful as a
starting point, but most migrations here are hand-written so the RLS statement
and the comment explaining *why* travel with the DDL.

- **What production has applied is read from production's schema, not from
  this doc or from its migration ledger.** Look for the object the migration
  creates: for an index, `select indexname from pg_indexes where tablename =
  'cube_cards'`; for a table, `information_schema.tables`. The ledger is not
  enough because a hand-applied migration writes no row to production's
  `drizzle.__drizzle_migrations`, and `0012` (moderation) and `0013`
  (`cube_cards_cube_id_section_idx`) were both applied by hand, on 16 and
  17 August 2026, so that ledger and this repo's journal are out of step —
  which is survivable only because `0013` is `CREATE INDEX IF NOT EXISTS` and
  re-running it is a no-op. The rule stands: a
  deploy does not run migrations, so a feature adding tables fails at request
  time however green the build looks. **Check `git log origin/master..master`
  before assuming what is live** — this doc describes the code, not the
  deployment.

### How the split happened

The dev project was created partway through development, after the Share button
went live. Everything up to and including migration `0007` and the champion
re-sync was applied **directly to production** before that; dev was then created
empty and brought to the same point with `db:migrate` and `sync-cards`. So the
two start aligned, except that dev never held the six riftscribe token rows
(`UNL-T0n`) production did. Riot's gallery serves those same ids, so the first
production sync from it overwrites them.

That history is worth knowing because git does not record it: a migration file
present in the repo says nothing about which project has run it. Confirm
production's state before assuming a migration still needs applying there.

### Keeping dev awake

**`cubebound-dev` is a free Supabase project, and free projects pause after
about seven days with no activity.** Dev goes that long whenever nobody is
building, and once paused, local work cannot reach it until someone restores it
from the Supabase dashboard. A scheduled workflow
queries it every three days so that a missed or late run still lands inside the
week; what it sends and which secrets it may hold are in
[checks.md](checks.md#the-dev-keep-alive).

### Branching

`master` is production: pushing to it deploys the live site. Feature work
happens on branches of `github.com/cubebound/cubebound`; pushing a branch produces a Vercel preview deployment and
does not touch production *code*. `master` holds everything that is live.

**Delete a branch when it merges.** `master` is then the only long-lived one,
which is what makes "is this live?" answerable without checking. **What is in
flight is a question for `git branch -a`, and this file deliberately does not
keep a copy** — a sentence naming today's branches is false the next time
anyone starts work, and it rotted twice before it was written as a rule
instead. What does belong here is the part git cannot tell you: why a branch
that is *gone* is not coming back.

On 19 September 2026: `draft-screen-rollout` and `staged-cube-editor` were
merged and held nothing `master` did not, and `main` was the retired original
— a static landing page
plus `riot.txt`, four commits that were never part of this app. **`main` lives
on as the tag `retired-landing-page`**, because those four commits exist nowhere
else; GitHub Pages served them at `cubebound.github.io/cubebound` until it was
unpublished the same day, and that URL now 404s by intent.
`draftmancer-presets` — named Draftmancer formats
and rarity-slot presets — was abandoned unmerged on 18 September 2026 and its
branch deleted; it is not coming back, so treat that ground as unbuilt.

**What merged, in order, is `git log`'s business rather than this doc's**, and
so is whether a merge leaves production needing a migration applied by hand:
`git log --oneline <range> -- drizzle/` lists every migration a range added,
and an empty answer means there is nothing to apply.
