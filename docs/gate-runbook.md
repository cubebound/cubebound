# The manual gate

## Why the other sixteen are a manual gate, not CI

Five of them `INSERT` directly into `auth.users` and then exchange a password
grant against a live GoTrue endpoint to mint a session cookie. That needs a
real Supabase project, not a Postgres service container — and migration `0002`
adds a foreign key into `auth.users`, so migrations don't even apply to bare
Postgres. Standing up a dedicated test project was the alternative, and it
loses on three counts: it is shared mutable state, so concurrent runs collide
(we have already had seed data collide with browse page 1); GitHub does not
expose secrets to pull requests from forks, so the job would fail on exactly
the contributions most worth checking; and it means maintaining a second live
project whose auth schema has to track production's.

`check:printings` and `check:card-filters` are excluded for a different reason —
they validate the *card pool*, which changes only when `sync-cards` runs, not
when app code changes.
Running it per-push against a freshly synced throwaway database would test less
than running it by hand against the real pool. **Run it after every sync.**

The gate, before deploying and after any card sync:

```bash
SIGNIN_PROBE=1 npm run dev:probe    # terminal 1 (probe armed; plain `npm run dev` also works
                                    #  for everything except check:magic-link)
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/cbchrome about:blank
npm run check:printings && npm run check:browse-grid && npm run check:card-filters && \
npm run check:copies-and-log && npm run check:public-cube && \
npm run check:auth-flow && npm run check:cube-ownership && \
npm run check:magic-link && npm run check:import && npm run check:discovery && \
npm run check:primer-toolbar && npm run check:pool && \
npm run check:moderation && npm run check:deck-export && \
npm run check:oauth-buttons && \
npm run check:share-previews
```

**That block is bash, and this is a Windows machine.** PowerShell 5.1 has no
`&&`, `chrome` is not on the path and `/tmp` does not exist, so it has to be
driven as a loop with the real Chrome path and `$env:TEMP`:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList '--headless=new','--remote-debugging-port=9222',"--user-data-dir=$env:TEMP\cbchrome",'about:blank'
foreach ($c in @("printings","browse-grid","card-filters","copies-and-log","public-cube",
                 "auth-flow","cube-ownership","magic-link","import","discovery",
                 "primer-toolbar","pool","moderation","deck-export",
                 "oauth-buttons","share-previews")) {
  npm run "check:$c"; if (-not $?) { "FAILED at check:$c"; break }
}
```

**Both long-lived processes must outlive the shell that starts them.** Launch the probe
server the way Chrome is launched above — `Start-Process`, with the working directory set
— rather than as a background job of the calling shell. A backgrounded job is reaped when
its wrapper exits: on 19 September 2026 that killed the dev server mid-gate, taking
`check:card-filters` onward with it, and later killed headless Chrome, which left
`check:auth-flow` hanging on a debugger that was no longer there. Neither failure named
its real cause. Give each check a timeout as well, so one hang cannot stall the run.

**Two of these fail transiently and pass on a re-run** — `check:browse-grid` and
`check:deck-export` both did so in one sitting, aborting with an undici
`TypeError: terminated` rather than an assertion. Both drive the shared free-tier
dev Supabase. Before believing such a failure, check the page it fetches answers
at all (`/cards` in ~600ms is healthy); a socket abort against a responsive
server is the environment, not the code.

**A long gate session poisons two things, and both look like code failures.**
Between them these cost an hour of misdiagnosis once, so check them before
believing any gate result late in a sitting.

- **Restart the debug Chrome before trusting a Chrome-driven failure.** After
  hours of runs it had 36 `chrome.exe` processes on a reused profile, and
  `check:cube-ownership` failed four times in a row with "editor never became
  clickable: skeleton". Same code, same server, fresh headless Chrome with a new
  `--user-data-dir`: passed first try. `check:auth-flow` and
  `check:primer-toolbar` share that instance, so they are exposed to the same
  thing.
- **Restart the dev server when a card route hangs.** One slow query exhausts
  the app's Drizzle pool (`max: 6` — see `check:pool`), and every card request
  after it queues forever: `/cards` sat at 200s while the database answered the
  same query in 250ms. `check:pool` keeps passing throughout because it opens
  its own pool, which is exactly what makes this confusing. **That difference is
  the diagnostic** — a fast `check:pool` beside a hanging `/cards` means the
  server's pool, not the database. A fresh server takes `/cards` back to ~150ms
  warm.

Two hypotheses that felt obvious and were both wrong, recorded so they are not
re-run: GoTrue was **not** rate-limiting `getUser()` (40 sequential calls, 40
× 200), and cold-route compilation was **not** the cause (the routes measured
389ms when the check still failed). Comparing against `master` correctly proved
the change was innocent, but said nothing about the cause — an environmental
failure reproduces there too.

**`draftmancer.txt` is covered by no check script.** It was verified by hand
against `npm run build && npx next start` — 200 with the right headers and
filename, a custom pack template, 400 on an incoherent config, and 404 for
hidden, suspended and unknown cubes. Anything that touches it needs the same
treatment until a check exists, which is the rule below applied to the one route
that currently needs it.

**The checks run against `npm run dev`, which is not what ships.** A cube's
share preview 500'd in production while every page and every check passed
locally, because the failure was a SQL error only that one route triggered and
nothing looked at it. When a change touches a route no check covers, hit it
against `npm run build && npx next start` before deploying — dev and production
resolve and bundle differently enough to hide things.

Each creates throwaway accounts and deletes them again, including on failure.

If these ever need to be automated, the path is the Supabase CLI (`supabase
start`) in CI, which brings up Postgres and GoTrue per run with no secrets and
no shared state — not a hosted test project.
