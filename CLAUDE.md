# cubebound.gg

Cube construction and drafting platform for Riftbound (Riot's League of Legends TCG). Think Cube Cobra, but Riftbound-native. Unofficial fan project under Riot's Legal Jibber Jabber policy — every page footer must include: "cubebound.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties."

## How this doc set works

This file is a router. It holds what is true for every task, and points at
[docs/](docs/) for everything else. A topic doc is read when it is relevant, not
on every session, which is the whole point: this file used to be 2,815 lines and
was loaded in full before any work started, including into every subagent.

Most directories also carry their own `CLAUDE.md`, three or four lines, naming
the docs that govern the code in them. Both of the following were measured on
19 September 2026, in the first sessions after the split.

**They load on a Read, and not on a shell command.** Reading a file with the Read
tool delivers them; reading the same file with `cat`, `grep` or `sed` inside Bash
delivers nothing, because the harness cannot see which directory a shell command
touched. So in a session that prefers Bash for file access, no stub ever fires and
the routing table below is doing all the work.

**They load upward, every ancestor at once.** A Read of `src/lib/draft/bots.ts`
pulls `src/lib/draft/`, `src/lib/` and any other ancestor holding one. They do
*not* load downward: a stub never covers the subtree beneath it. That asymmetry is
why a stub sitting above other stubs says it governs only the files directly in
its own directory — without that, one Read of a draft file arrived carrying nine
doc pointers, seven of them about auth, printings and card images. `check:docs`
enforces it. **Ignore an ancestor stub when you are working deeper than it.**

A directory that does not exist yet has no stub at all. **The table under "Where
to read next" is the part that always loads**, so treat it as the rule and a stub
as a convenience. **Stubs are pointers and hold no rules of their own.**

- **Keep the docs true in the same commit.** Any change to behavior, schema or
  conventions updates the doc that owns it alongside the code, not in a
  follow-up — a doc that lags by even one commit starts costing more than it
  saves. **Each fact lives in exactly one file**: if a rule is in a topic doc, do
  not restate it here, and vice versa.

## Where we are

**Live at https://cubebound.gg**, with the MVP loop closed: sign in, create a
cube, search and add cards, view it by domain/cost/type, and share a public URL
anyone can browse and clone.

**[docs/roadmap-and-status.md](docs/roadmap-and-status.md) owns the build
order.** What has shipped, what is next and in what sequence live there and
nowhere else, so this file cannot drift from them.

**Do NOT build ahead of that order, and read it before starting anything new.**
The prohibition is useless without the list, and the list moves: solo drafting
and the Draftmancer export were both brought forward by request, ahead of items
above them. Reordering is the owner's call, made explicitly, never a judgement
to make while implementing something else.

## Stack

- Next.js (App Router) + TypeScript, strict mode
- Postgres via Supabase (also provides auth)
- Drizzle ORM
- Tailwind CSS
- Deployed on Vercel
- Card data ingested into our own DB via a sync script with pluggable sources (see [docs/card-data.md](docs/card-data.md)); card images served from source CDN URLs stored per-card (do not proxy/cache images yet)

## Environments at a glance

Two Supabase projects. They share the same schema; they share no data.

| | Local dev | Production |
|---|---|---|
| Supabase project | `cubebound-dev` | the original project |
| Config source | `.env.local` (gitignored) | Vercel env vars |
| URL | localhost:3000 | cubebound.vercel.app / cubebound.gg |
| Email sender | Supabase default | custom, login@cubebound.gg |
| Deployed from | — | `master` |

Anything run from the developer's machine — `npm run dev`, `db:migrate`,
`db:push`, `sync-cards`, any script reading `DATABASE_URL` — hits the **dev**
database only. Local work cannot reach production data. That is what makes the
manual gate safe to run against a live Supabase: the accounts those checks
create and delete are dev accounts.

Migration mechanics, how the two projects diverged and the branch history are in
[docs/environments.md](docs/environments.md). Seeding and signing in locally are in
[docs/local-dev.md](docs/local-dev.md).

## Riftbound domain model (game concepts — get these right)

Riftbound is NOT Magic. Key differences that must be reflected in the schema and UI:

- **Domains** (colors): Fury (red), Calm (green), Mind (blue), Body (orange), Chaos (purple), Order (yellow). Cards can have multiple domains.
- **Card types**: Unit, Spell, Gear, Rune, Battlefield, Legend. "Champion Unit"
  and "Signature Spell" are **not** stored as types — they are a `type` plus a
  `supertype` (`Unit`/`Champion`, `Spell`/`Signature`). Anything grouping or
  filtering by type must read both columns; `type = 'Champion Unit'` matches
  nothing. Observed supertypes: Champion, Signature, Basic, Token.
- **Costs**: cards have an **energy** cost (generic) and may have a **power** cost (domain-specific pips). Units have **might** (combat stat).
- **Legends**: a player's identity card; determines 2 accessible domains. Champions and Signature Spells are tied to specific champions via the `champion` column.
- **Constructed decks**: main deck + separate rune deck + legend + battlefields. Cube drafting conventions are still community-defined; common house rules draft legends in a separate first phase, then the main cube.


Rendering rules, term casing and the deck-format rules the draft builder will
need are in [docs/riftbound.md](docs/riftbound.md).

## Non-negotiables

Rules with no check script and no directory to trigger on. Everything else lives
in a topic doc, because violating it fails a build and the failure names the doc.

### Data safety

**Never mutate an existing account to get a session.** Every check script
creates a throwaway `auth.users` row, claims a username, mints a token against
it, and deletes it in a `finally`. An ad-hoc script that instead `UPDATE`s an
existing row's email and password to borrow a session **locks the real owner
out** — a magic link goes to the address in `auth.users`, and overwriting it
means their own address matches nothing. That happened to the dev admin account
here. It was recoverable only because `auth.identities.identity_data` still held
the original address, which is luck rather than design. Create, use, delete.

**`.env.local` is the single switch between the two. Never edit it, never print
its contents, and never suggest changing it as a fix.** If a task appears to
require production credentials, stop and say so rather than reaching for them.

**A preview deployment is not automatically a dev environment.** Vercel injects
whichever environment variables are configured for Preview, and unless those
point at `cubebound-dev`, a preview build talks to the **production** database
— so drafting on a preview URL would write production rows. Local
`npm run dev` is the safe place to test; check Vercel's Preview environment
variables before relying on a preview URL.

### Shipping

**A Vercel build does not run migrations**, so a feature that adds tables ships
broken until production is migrated. Any report on work that includes a
migration must say so explicitly — the deploy will look successful and the
feature will fail at request time.

Commit per logical piece of work with a descriptive message. **Do not merge to
`master`, and do not suggest merging** — the owner decides when work goes live.

### Secrets, auth and RLS

- **Never put a secret key in a `NEXT_PUBLIC_*` variable.** Next inlines those
  into the browser bundle, and `sb_secret_…` / `service_role` keys bypass RLS.
  `src/lib/supabase/config.ts` refuses to start if it detects one.
- Supabase email magic links. Session cookies are refreshed in `src/middleware.ts`;
  always verify the user with `supabase.auth.getUser()`, never `getSession()`,
  which trusts the cookie without checking it.
- **Row Level Security is on for every table with no policies.** Supabase
  auto-exposes `public` over PostgREST and grants `anon`/`authenticated` full DML
  by default, so without RLS the browser key could read and write everything.
  The app reaches Postgres through Drizzle as the table owner, which bypasses
  RLS. If you add a table, enable RLS on it in the same migration.

### Code structure

- Server components by default; client components only where interactivity requires.
- All DB access through Drizzle in `src/db/`; no raw SQL in route handlers.
- Keep components small; colocate route-specific components under their route folder.

### The client/server boundary

- **A `"use client"` module must import only *types* from `src/db/queries/`.**
  Importing a value pulls `src/db/index.ts` in behind it and bundles the postgres
  driver for the browser — which fails with a `node:crypto` resolution error
  naming nothing relevant. That is why `CARD_SORTS` and `CARD_SORT_LABELS` live
  in `src/lib/riftbound.ts` rather than beside `searchCards`. This is the mirror
  of the rule below about client modules' exports not being callable from the
  server: shared *values* belong in `src/lib/`, whichever direction they travel.
- **A `"use client"` module's exports cannot be called from the server** — only
  rendered as components or passed as props. Pure helpers that both sides need
  therefore live in `src/lib/`, never beside the component that happens to use
  them most: `cardFilterParams` in `card-search-params.ts` (the pagination
  server component calls it) and `countCopies` in `cube-cards.ts` (the cube
  pages call it). This fails at request time, not at build time, so it is easy
  to ship — if a helper is shared, put it in `src/lib/` first.

### Calling a server action

- **A client call of an action must handle the promise rejecting, not just an
  `{ error }` coming back.** A dropped request rejects it, React marks the
  action rejected and rethrows that reason during the next render, and with
  nothing in between it reaches `error.tsx` — so a lost packet replaces the
  whole page with "Something broke". That is what Sentry `JAVASCRIPT-NEXTJS-7`
  (`TypeError: Load failed`, WebKit's wording for a failed `fetch`) is.
  `follow-button.tsx`, `cover-picker.tsx`, `import-cards.tsx` and
  `draft-client.tsx`'s `runAction` each catch it.
- **The two call shapes do not cost the same to guard.** A `startTransition`
  call site is free to wrap. Wrapping a `useActionState` action in a client
  closure is not: React's SSR only emits a form's no-JS submit fields when the
  action carries `$$FORM_ACTION`, which a wrapper drops — so guarding one
  trades a dropped-request failure for a pre-hydration one. `clone-button.tsx`
  and `primer-editor.tsx` are knowingly still bare for that reason; a local
  error boundary, not a wrapper, is the fix if they start firing.
- **An action ending in `redirect()` rejects too**, with a `NEXT_REDIRECT`
  digest, so any guard around one must re-throw it. Next performs the SPA
  navigation itself either way, so swallowing it flashes a wrong error rather
  than stranding the user.

### Adding a route

- **Every route is dynamic, so `<Link>` prefetch can only fetch a loading
  boundary.** With no `loading.tsx`, clicking a cube left the previous page on
  screen, unchanged, for the whole server render — which reads as a hang, and
  was reported as one. Each navigable route now has one, built from
  `src/components/skeleton.tsx`. **A new navigable route needs a `loading.tsx`
  or it inherits that behaviour.**
- **`loading.tsx` breaks `notFound()` in the page it wraps.** Next flushes the
  loading shell as soon as it can, and flushing commits **HTTP 200** — after
  that a `notFound()` swaps the body for the 404 UI but cannot change the
  status. Adding the boundaries made private cubes, unknown slugs and unknown
  usernames all answer 200, which `check:public-cube` caught. So **the
  visibility decision lives in `layout.tsx`**, which resolves above the
  boundary: `cube/[username]/[slug]/layout.tsx` and `u/[username]/layout.tsx`.
  The pages beneath re-read the same values through the `cache()`d loaders in
  `src/lib/cube-request.ts`, so the guard costs no extra query. Any future route
  that both 404s and has a loading boundary needs the same shape.

### Presentation

- **Presentation classes are shared through `src/lib/ui.ts`, not retyped.** A
  new button, field, panel, tab or badge takes an export from there; a fresh
  Tailwind string is how the site got to 74 copies of the same button across 36
  files. Colours come from the tokens in `globals.css` — see [docs/chrome-and-theme.md](docs/chrome-and-theme.md)
  — so a raw `zinc-`, `bg-white` or `text-white` in `src/` is a bug
  outside of red destructive buttons and overlays on card art.

### Copy

- **User-facing copy avoids the em dash.** It had become the site's default
  joint — roughly 35 of them across the interface, several sentences carrying a
  pair — and a dash-heavy register now reads to a lot of people as
  machine-written, which is the wrong thing for a one-person fan project to
  sound like. Use what the sentence actually needs: a full stop where two
  statements are doing separate work, a colon where a term is about to be
  glossed or a list introduced, parentheses for a true aside, or a plain
  conjunction. The remaining ones are deliberate and are not prose: the `—`
  glyph that marks a **costless** card in the cube table, the pool piles and
  the analytics panels, and the em dash inside page `<title>`s, which is
  ordinary title convention and is SEO-load-bearing besides. **Code comments
  are exempt** — they are not read by visitors, and this file is full of them.

## Checks and deploying

Each check guards a regression that already happened once. Run the ones
touching what you changed; run the manual gate in full before a deploy. The
ones needing a database hit **dev**, never production — see above —
which is why they can create and delete accounts freely.

The table of scripts and what each guards is in [docs/checks.md](docs/checks.md);
the runbook for the sixteen manual ones is in [docs/gate-runbook.md](docs/gate-runbook.md).

## Delegating

**The gate runs through the `gate` agent — always, and without judgement.** Not "prefer",
not "when the output looks long". Sixteen scripts produce screens of output and one bit of
signal, and absorbing that in the main thread is the precise cost the agent exists to
avoid. The same holds for the other three: a usage question goes to `data`, a roadmap item
goes to `planner` before any code is written, and a diff's documentation updates go to
`docs`. An agent that is merely available is an agent nobody uses.

The four agents, what each is for and the startup-directory trap are in
[docs/agents.md](docs/agents.md).

## Where to read next

**Read the owning doc in full before changing code in its area.** Grepping it for
the line you came for is how you miss the rules you did not know to search for.
That is not hypothetical: on the first change made after this split, a seat-limit
edit to the draft engine was written against eleven lines of a 215-line doc, found
by grep, so the pack template, the fallback rules and the determinism constraint
were never seen. A doc is a few thousand tokens and is the cheapest part of the
job.

| Touching | Read |
| --- | --- |
| A card query, a filter, sorting, `/cards` | [docs/card-browser.md](docs/card-browser.md) |
| `base_id`, `collapseKey`, the printing picker, `card-ids.ts`, `0003` | [docs/printings.md](docs/printings.md) |
| The sync, an adapter, `scripts/card-sources/` | [docs/card-data.md](docs/card-data.md) |
| Card art, a thumbnail, an `<img>`, `card-art.tsx` | [docs/card-images.md](docs/card-images.md) |
| A colour, a class string, a font, focus, cursor, the logo, the nav | [docs/chrome-and-theme.md](docs/chrome-and-theme.md) |
| Any string a visitor reads | [docs/voice-and-copy.md](docs/voice-and-copy.md) |
| The edit panel, `?mode=`, import, the primer, staged edits | [docs/cube-editor.md](docs/cube-editor.md) |
| The text or visual view, columns, hover preview, density | [docs/cube-views.md](docs/cube-views.md) |
| Visibility, ownership, Clone, Share, the owner redirect | [docs/cube-access.md](docs/cube-access.md) |
| Explore, `/cubes`, a profile, following | [docs/discovery.md](docs/discovery.md) |
| The Analytics tab, `charts.tsx` | [docs/analytics.md](docs/analytics.md) |
| The draft engine, packs, bots, `/drafts` | [docs/draft.md](docs/draft.md) |
| `draftmancer.txt`, `deck-export.ts` | [docs/exports.md](docs/exports.md) |
| `pack.png`, `src/lib/pack-image/` | [docs/crack-a-pack.md](docs/crack-a-pack.md) |
| `opengraph-image`, robots, sitemap, canonicals, titles, `/privacy` | [docs/share-previews-and-seo.md](docs/share-previews-and-seo.md) |
| Sentry, Vercel Analytics, free-tier headroom | [docs/monitoring.md](docs/monitoring.md) |
| Sign-in, OAuth, `/welcome`, sessions, `middleware.ts` | [docs/auth.md](docs/auth.md) |
| Admin, hide, suspend, delete an account | [docs/moderation.md](docs/moderation.md) |
| The schema, a migration, a raw `sql` fragment | [docs/database.md](docs/database.md) |
| Adding or changing a route | [docs/routes.md](docs/routes.md) |
| Anything slow, a new query, a new `Promise.all` | [docs/page-speed.md](docs/page-speed.md) |
| A check script, CI, `.github/workflows/` | [docs/checks.md](docs/checks.md) |
| Running the manual gate | [docs/gate-runbook.md](docs/gate-runbook.md) |
| Dev vs production, migrations, branches | [docs/environments.md](docs/environments.md) |
| Seeding, `dev:login`, signing in locally | [docs/local-dev.md](docs/local-dev.md) |
| A security question or claim | [docs/security.md](docs/security.md) |
| Domains, card types, costs, rules text, deck format | [docs/riftbound.md](docs/riftbound.md) |
| What has shipped, what to build next | [docs/roadmap-and-status.md](docs/roadmap-and-status.md) |
| Spawning an agent, `npm run stats`, `.claude/` | [docs/agents.md](docs/agents.md) |
