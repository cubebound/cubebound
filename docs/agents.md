# Working with agents

The repo carries its own Claude Code configuration in `.claude/`, committed so the setup
is reproducible rather than living in one machine's head. Four agents, one settings file,
one MCP config.

### The agents (`.claude/agents/`)

| Agent | Use it for | Notes |
| --- | --- | --- |
| `gate` | Running the sixteen-script manual gate before a deploy or after a card sync | Carries the PowerShell runbook, the Chrome-on-:9222 launch, and the two transient failures. **Dev only.** |
| `data` | Any question about real usage — how many cubes, how many empty, how many drafts finish | Read-only by rule and by credential. Starts from `npm run stats`. |
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
the size distribution including empty ones, accounts, drafts started and completed,
primer and maybeboard adoption, follows, clones, import sizes, and recent activity.
**Read-only `select` and nothing else.**

It exists because every product question before it was answered by scraping the public
site — dozens of requests, and still blind to private cubes, empty cubes and drafts.

- `npm run stats` reads `.env.local` (dev). This is the default and the safe one.
- `npm run stats -- --prod` reads `.env.production.readonly`, which holds a Postgres
  role granted `select` and nothing else. **That file is how production data is reached
  and the only sanctioned way**: the rule that local work cannot write to production
  survives because the credential cannot write, not because the script promises not to.
  Never put a service key in it.

Dev and production hold completely different things — dev is full of artefacts from
check scripts that create and delete accounts — so a dev figure is not a small version
of production. Always say which one a number came from.

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
