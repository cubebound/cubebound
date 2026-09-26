# Working with agents

The repo carries its own Claude Code configuration in `.claude/`, committed so the setup
is reproducible rather than living in one machine's head. Four agents, one settings file,
one MCP config.

### The agents (`.claude/agents/`)

| Agent | Use it for | Notes |
| --- | --- | --- |
| `gate` | Running the seventeen-script manual gate before a deploy or after a card sync | Carries the PowerShell runbook, the Chrome-on-:9222 launch, and the two transient failures. **Dev only.** |
| `data` | Any question about real usage — how many cubes, how many empty, how many drafts finish | Read-only by rule and by credential. Starts from `npm run stats`, falls back to `npm run prod-read`. |
| `planner` | Turning a roadmap item into an implementation plan before writing code | Must cite the conventions here that constrain the change, and name the checks that cover it. |
| `docs` | Keeping the docs true after a change | Enforces the same-commit rule below. Counts and tables are where it goes stale. |

Four is deliberate. Review is already covered by the `/code-review`, `/simplify` and
`/security-review` skills, and an agent nobody invokes is worse than none.

**Start Claude Code from the repo root.** On 19 September 2026 a session opened in
`C:\Users\Carl` that then `cd`'d here had **none** of these four registered: spawning one
returned `Agent type 'gate' not found`, offering only the built-in types, and the whole
gate ran in the main thread instead. The four files were valid and there is no user-level
`~/.claude/agents/` shadowing them, so the working directory at startup is the remaining
explanation — `.claude/agents/` is read from where the session begins, not where it later
moves to. **Confirmed from the other direction the same day**: a session started in this
directory lists all four — `gate`, `data`, `docs` and `planner` — beside the built-in
types, so the rule holds both ways and the startup directory is the whole of it.
The failure is silent either way, which is the part worth
remembering — nothing announces that an agent is missing until you try to spawn it.

### `npm run stats`

[scripts/stats.mts](../scripts/stats.mts) prints what the site holds: cubes by visibility,
the size distribution including empty ones, accounts, active accounts (edited a cube or
drafted in the last 7 and 30 days — there is no login timestamp, so browsing is invisible),
drafts started and completed, drafts on the drafter's own cube versus someone else's,
primer and maybeboard adoption, follows, clones, import sizes, and recent activity.
**Read-only `select` and nothing else.**

It exists because every product question before it was answered by scraping the public
site — dozens of requests, and still blind to private cubes, empty cubes and drafts.

- `npm run stats` reads `.env.local` (dev). This is the default and the safe one.
- `npm run stats -- --prod` reads `.env.production.readonly`, which holds a Postgres
  role granted `select` and nothing else. **That file is how production data is reached
  and the only sanctioned way**: the rule that local work cannot write to production
  survives because the credential cannot write, not because the script promises not to.
  Never put a service key in it. Two scripts read it, this one and `prod-read`; nothing
  else should.

Dev and production hold completely different things — dev is full of artefacts from
check scripts that create and delete accounts — so a dev figure is not a small version
of production. Always say which one a number came from.

### `npm run prod-read`

[scripts/prod-read.mts](../scripts/prod-read.mts) runs a single ad-hoc `select` against
production and prints it as a table:

```
npm run prod-read -- "select supertype, count(*) from cards group by 1"
```

**It exists because `stats` answers the standing questions and only those.** A one-off —
a supertype breakdown, a join the report does not do — had no sanctioned path at all, so
an agent reached for a throwaway `npx tsx` script, which nothing allowlists and which was
refused, while the `data` agent's own brief was telling it to write ad-hoc SQL when the
question was not in the report. The promise and the setup disagreed; this closes the gap.
A query written twice is a figure that belongs in `stats.mts` instead.

- **The read-only role is the guarantee. The script is not.** Its checks — one statement,
  starting `select` or `with`, no forbidden word as a whole word — refuse a mistake one
  error message earlier than the server would, and nothing more. Never conclude that
  something is safe to run from the fact that the script would let it through.
- **Production only**, and it reads `.env.production.readonly` directly rather than
  through `scripts/lib/env.ts`, which falls back to `.env` — a production run must never
  silently land on a different database. Dev needs no script and no ceremony: point
  whatever you like at `.env.local`.
- **Output is capped at 200 rows and cells over 60 characters are elided**, so one
  careless query cannot bury a transcript and one long `rules_text` cannot destroy every
  column's alignment. Aggregate in SQL rather than reading past the cap.

### The allow list

`.claude/settings.json` allowlists a handful of commands, `npm run stats *` and
`npm run prod-read *` among them. **A rule matches the bare command only.** Wrapping it
in `cd … && …`, or piping it into `head`, does not match, and the command then falls
through to the permission classifier, which refuses it as a production read — which cost
two production reads in one session before anyone noticed that the shape was the problem.
Nothing in the refusal says the command itself was allowlisted, so it reads as a missing
permission and sends you off to add a rule that is already there. Run these bare and let
the output be long.

**Spawning `data` is a separate permission from the commands it runs.** On 25 September
2026 the auto mode classifier refused the `Agent` call itself, before any command ran, even
though both commands were allowlisted. `Agent(data)` in the allow list and a matching
`autoMode.allow` entry now cover the spawn; the read-only role is still what makes it safe.

### The Stop hook

`.claude/settings.json` runs `node_modules/.bin/tsc --noEmit` when a turn ends and
reports failures without blocking. Measured on the dev machine: bare `tsc` is **3s**,
`npm run typecheck` is 17s (it runs `next typegen` first) and `npm run lint` is 35s.
Only the first is cheap enough to run every turn, and it catches the failure that
matters most — handing back code that does not compile. Lint stays with CI and the gate.

### MCP servers

`.mcp.json` declares Sentry (`https://mcp.sentry.dev/mcp`) and Vercel
(`https://mcp.vercel.com`), both HTTP transports with OAuth. Vercel's includes Web
Analytics queries, which is the other half of the usage picture `stats` cannot see:
which pages people actually open. **Both need `/mcp` run once interactively to
authenticate** — that cannot be done from a non-interactive session.
