# cubebound.gg

Cube construction and drafting platform for Riftbound (Riot's League of Legends TCG). Think Cube Cobra, but Riftbound-native. Unofficial fan project under Riot's Legal Jibber Jabber policy — every page footer must include: "cubebound.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties."

## Current status

**Live at https://cubebound.gg.** Phase 1 is complete — all seven milestones,
deploy included — and **the MVP loop is closed**: sign in → create a cube →
search and add cards → view it by domain/cost/type → share a public URL that
anyone can browse and clone.

Working: card ingestion (**production** 1,294 printings / 966 distinct cards
across 8 sets; **dev** 1,288 / 960 — the difference is production's six
riftscribe token rows, see "How the split happened"),
`/cards` browser, magic-link auth with username claim, cube CRUD, the quick-add
editor, visual and text views, primer, change log, the public cube view with
Share and Clone, and CI.

**Bulk import has shipped** — paste a card list on the editor's Import tab,
preview exactly what matched, then commit.

**Cube analytics has shipped** — the Analytics tab on any cube page.

**Solo bot drafting has shipped, and its settings are configurable** — choose
seats, packs, pack size and reserved legend/battlefield slots, then draft
against bots. Milestone B makes the bots smart; milestone C adds the post-draft
deck builder. See "Draft".

Then the rest of phase 2 in the order under "Product vision".

Open items:
- **The production origin is derived from the request**, not from config —
  `resolveSiteUrl` reads the forwarded host, so cubebound.gg, preview
  deployments and localhost each build their own correct magic-link and share
  URLs. The live domain must stay on the Supabase redirect allowlist; see
  "Auth and data access" for what breaks when it isn't.
- **CI covers typecheck, lint, build, `check:primer-safety`, `check:draft` and
  `check:analytics`, `check:markdown-edit`** on push and PR. The other thirteen need
  a live Supabase or the
  card pool and are
  a documented pre-deploy manual gate — see "Checks". Run that gate before
  deploying.
- Feature work lands on a branch and pushes to
  `github.com/cubebound/cubebound`; `master` is production — see
  "Environments".
- **Migrations are current: production is migrated through `0011` and nothing
  newer exists.** Work since then has been code-only, so a deploy needs no
  database step. The rule still stands for the next one: a deploy does not run
  migrations, so a feature adding tables fails at request time however green the
  build looks. **Check `git log origin/master..master` before assuming what is
  live** — this file describes the code, not the deployment.
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
  version of this file said it was, repeatedly, and it was wrong. Exceeding
  Hobby limits degrades or pauses the project rather than charging anything, so
  the goal is staying inside them: keep per-request query counts low (see "Page
  speed"), keep card images on Riot's CDN, and check Vercel → Usage and
  Supabase → Usage for actual headroom rather than guessing. Usage was
  comfortably low as of 16 August 2026.
- **Migration `0012` is not yet applied to production.** It is the moderation
  one, and the tools fail at request time without it — a deploy does not run
  migrations.
- Still open before a wide launch: a **Supabase auth rate limit** (not code —
  see "Security posture"). Moderation now covers hiding and account removal; a
  user-facing *report* path is still absent, so problems have to be noticed
  rather than reported.
- The Riot adapter stays dormant until our API application is approved.
- Six UNL token rows still come from the retired riftscribe source.

## Product vision

The core loop (MVP): create a cube → search/add cards → view it organized by domain/cost/type → share a public URL others can browse and clone.

Later phases, in priority order:
1. Search syntax (`domain:fury cost:2 type:unit`)
2. ✅ Cube analytics — energy curve, domains, types, rarity, rules-text length, keywords. See "Analytics".
3. Solo bot drafting — **milestone A is done, ahead of 1 and 2 by request**
4. Multiplayer draft lobbies (websockets)
5. Community features (clone, changelogs, card pick data)
6. Exports (proxy sheets, deck lists compatible with other Riftbound tools)

The MVP loop is shipped and live. Do NOT build ahead of the current phase.

## Stack

- Next.js (App Router) + TypeScript, strict mode
- Postgres via Supabase (also provides auth)
- Drizzle ORM
- Tailwind CSS
- Deployed on Vercel
- Card data ingested into our own DB via a sync script with pluggable sources (see "Card data sources" below); card images served from source CDN URLs stored per-card (do not proxy/cache images yet)

## Environments

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

**Throwaway accounts come from `scripts/lib/test-account.ts`.** The
`insert into auth.users` it wraps was byte-identical in six checks with two
near-identical variants — and that column list is brittle, since GoTrue needs
several non-null with no defaults, so one upstream change broke every copy at
once. `scripts/lib/env.ts` holds the env-file reader **and imports nothing**:
some checks run without `--env-file-if-exists`, so anything they import must
not reach `src/db/index.ts`, which reads `DATABASE_URL` at load time and
throws. Keeping the reader beside the account helpers pulled the database layer
in behind it and broke `check:printings` on import.

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

### Migrations

Migrations run manually and separately per environment. `npm run db:migrate`
against dev is part of normal development; production is migrated deliberately
by the owner at merge time.

**A Vercel build does not run migrations**, so a feature that adds tables ships
broken until production is migrated. Any report on work that includes a
migration must say so explicitly — the deploy will look successful and the
feature will fail at request time.

Prefer `db:migrate` (versioned files) over `db:push` (diffs the schema and can
drop columns). `db:generate` writes a migration from a schema diff — useful as a
starting point, but most migrations here are hand-written so the RLS statement
and the comment explaining *why* travel with the DDL.

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

### Card data

Cards come from riftcodex via `npm run sync-cards` (~1,451 records before
duplicate collapsing). No Riot API key is needed. **Dev's card table is
populated by re-running the sync, not copied from production** — so a data
correction that lands through the sync (a fixed adapter mapping, a
`--force` re-map) has to be run again against production, and is not carried
across by deploying.

### Seed data

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

### Branching

`master` is production: pushing to it deploys the live site. Feature work
happens on branches; pushing a branch produces a Vercel preview deployment and
does not touch production *code*. No feature branch is currently in flight;
`master` holds everything that is live.

**A preview deployment is not automatically a dev environment.** Vercel injects
whichever environment variables are configured for Preview, and unless those
point at `cubebound-dev`, a preview build talks to the **production** database
— so drafting on a preview URL would write production rows. Local
`npm run dev` is the safe place to test; check Vercel's Preview environment
variables before relying on a preview URL.

Commit per logical piece of work with a descriptive message. **Do not merge to
`master`, and do not suggest merging** — the owner decides when work goes live.

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

## Database schema

`src/db/schema.ts` is the source of truth; this is orientation. Card *types* are
`text`, not a pg enum, because new sets ship every ~3 months and the sync must
ingest an unknown type without a migration. Sections and visibility *are* enums —
they're ours, not the game's.

```
cards         id pk ("OGN-001"), base_id (indexed), name, set_code, collector_no,
              rarity, type, supertype, domains text[], energy_cost, power_cost jsonb,
              might, rules_text, keywords[], tags[], champion, artist,
              image_full, image_thumb, data jsonb, updated_at
users         id uuid pk (mirrors auth.users.id), username unique, created_at
cubes         id, owner_id → users, name, slug, description, primer,
              visibility ('public'|'unlisted'|'private'), created_at, updated_at
              unique (owner_id, slug)
cube_cards    pk (cube_id, card_id, section), quantity, added_at
              section ('main'|'legends'|'runes'|'battlefields'|'sideboard'|'maybeboard')
moderation_log id, actor_id (set null), actor_username, action, target_type,
              target_id (NOT a FK), target_label, reason, snapshot jsonb, created_at
cube_changes  id, cube_id, actor_id (set null on delete), actor_username, kind,
              card_id, card_name, quantity, from_section, to_section,
              from_value, to_value, created_at    -- indexed (cube_id, created_at)
drafts        id, cube_id, drafter_id, seed, config jsonb, packs jsonb, seats,
              human_seat, status ('active'|'complete'), created_at, updated_at
draft_picks   pk (draft_id, round, pick_number, seat), card_id, board, created_at
cube_follows  pk (user_id, cube_id), created_at    -- both FKs cascade
```

`cubes.cover_card_id → cards.id` (nullable, `ON DELETE SET NULL`) is the card
whose art represents the cube. A card leaving the pool clears the cover; it must
never delete the cube.

Migrations, in order — `0000` initial · `0001` add + backfill `base_id` ·
`0002` enable RLS · `0003` recompute `base_id` as data-derived print groups ·
`0004` `cubes.primer` · `0005` `cube_changes` (+ RLS) ·
`0006` the `cards_imported` change kind · `0007` `drafts` + `draft_picks` (+ RLS) ·
`0008` `draft_picks.board` · `0009` the `maybeboard` section ·
`0010` `cube_follows` (+ RLS) · `0011` `cubes.cover_card_id` ·
`0012` moderation: `users.is_admin` / `users.suspended_at`, `cubes.hidden_at` /
`hidden_reason`, `moderation_log` (+ RLS).

Migrations are applied **per environment and by hand** — see "Environments".
A migration in a merged branch is not live until production is migrated.

`0001`'s suffix-stripping rule is superseded by `0003`; only `0003` must stay in
step with `src/lib/card-ids.ts`. Adding a column to a populated table means
add-nullable → backfill → set-not-null, never `ADD COLUMN NOT NULL`.

## Routes

```
/                                     landing
/cards                                card browser (milestone 3)
/guides/riftbound-cube-drafting       the format explained — static, no data
/privacy                              privacy policy — static, must match the code
/explore                              public cube search — ?q= &card= &sort= &page=
/u/{username}                         public profile — their public cubes; ?q= &page=
/profile                              redirect to your own /u/{username}
/login  /welcome  /auth/callback      magic link, username claim, PKCE exchange
/cubes  /cubes/new                    the signed-in user's cubes; ?tab=followed &q= &page=
/cube/{username}/{slug}               public view — visibility-gated
/cube/{username}/{slug}/edit          owner editor; ?mode=browse|primer|log
/cube/{username}/{slug}/settings      rename, visibility, delete
/cube/{username}/{slug}/draft         solo draft against bots — any viewer, not just the owner
                                      ?draft={id} opens a specific one, else the latest
/drafts                               every draft the signed-in user has sat in
/robots.txt  /sitemap.xml             crawl rules; static pages + public cubes and profiles
/opengraph-image                      share previews — also under /cube/… and /u/…
```

Server Actions live in `src/app/cube/actions.ts`, `src/app/auth/actions.ts`,
`src/app/cube/[username]/[slug]/draft/actions.ts` and `src/app/explore/actions.ts`.

## Card data sources

The sync is a source-adapter design: `scripts/sync-cards.ts` owns idempotent
diffing, chunked upserts, and per-set reporting; adapters in
`scripts/card-sources/` implement the `CardSource` interface and return cards
already normalized to our `cards` row shape. Every row's `data` jsonb stores
`{ source: "<adapter>", card: <raw payload> }` so we always know which API a
row came from. Select with `CARD_SOURCE` env (default `riftcodex`).

- **riftcodex (active)** — Riftcodex open API (`https://api.riftcodex.com`),
  no auth. `GET /cards?page=N&size=100` (`size` caps at 100; 422 above),
  envelope `{ items, total, page, size, pages }`. It is the only source that
  reports **every** domain of a multi-domain card, and the only one carrying
  the whole pool. `riftbound_id` (`ogn-299*-298`) maps to our canonical ids:
  `*` signature, `a`/`b` alt art, `tNN`/`rNN`/`spN` tokens and specials; the
  trailing segment is the set size, not part of the identity. Their feed
  contains stale duplicate records under the same `riftbound_id` — keep the one
  with the newer `metadata.updated_on`.

  **Card names arrive three different ways and `splitCardName` normalizes all
  three.** `OGN` writes `Ahri - Inquisitive`; champion units become
  `Ahri, Inquisitive` and legends keep only the title with the champion stored
  separately. `VEN` breaks both halves of that: its units print
  `Akali, Silent` with no separator (champion lost), and its legends print the
  whole trait line first — `Yordle, Kennen - Heart of the Tempest` — which made
  `champion` the traits. So the champion is the **last** segment before the
  separator, and when there is no separator it is the leading comma segment
  only if the card's own `tags` confirm it (which leaves ordinary titles like
  `Heisho, Shell of the World` alone).
- **riftscribe (retired but selectable)** — RiftScribe open API
  (`https://riftscribe.gg`). Dropped as the default because its `faction` is a
  single string, so every multi-domain card lost a domain: all legends came
  through with one domain and Chaos/Order legends could not be found at all.
  It also served only 950 cards (no VEN, OPP, PR or JDG) and left artist, tags
  and supertype empty. Six UNL token rows still come from it, because
  Riftcodex does not carry them and the sync never deletes.
- **riot (dormant)** — `riftbound-content-v1`. Kept because it's the official
  source, but the endpoint requires app-specific approval and returns 403 on
  dev keys; our application is pending. When approved, set `CARD_SOURCE=riot`
  + `RIOT_API_KEY`, and re-verify the response against the adapter first:
  the docs' `art` object has been observed arriving as a `media` array instead
  (RiotGames/developer-relations#1093, unresolved).

**A card can have more than one domain** — 202 do, including nearly every
legend, which determines two. Never assume a single domain anywhere: filters
use array containment, and the text view gives each domain pair its own
column.

The sync never deletes, so a card the active source stops serving lingers with
its old `data.source`. That is deliberate — losing cards is worse than keeping
a stale row — but it means a source switch leaves residue worth checking for.

## Conventions

- **Keep this file true in the same commit.** Any change to behavior, schema or
  conventions updates CLAUDE.md alongside the code, not in a follow-up — a doc
  that lags by even one commit starts costing more than it saves.
- Server components by default; client components only where interactivity requires.
- All DB access through Drizzle in `src/db/`; no raw SQL in route handlers.
- **In a raw `sql` fragment, qualify outer column references yourself.** Drizzle
  renders `${table.column}` *unqualified* when the surrounding query has no
  join, so a correlated subquery that mentions another table with the same
  column name silently binds to the wrong one. `cubeCoverImageSql` referencing
  `${cubes.id}` bound to `cards.id` and every share preview 500'd with
  `operator does not exist: uuid = text` — while the cube lists, which use the
  same fragment through a query that joins `users`, worked fine. Write
  `"cubes"."id"`.
- Card sync entry point lives in `scripts/sync-cards.ts`, idempotent, diffs by card id against the stored raw payload, safe to re-run. New sets ship every ~3 months — the sync must handle unknown fields gracefully (hence the `data` jsonb column).
- **After changing an adapter's mapping, run `npm run sync-cards -- --force`.** The diff compares stored raw payloads, so a mapping fix leaves every row looking unchanged and silently never lands — a corrected `champion` field once reported "1288 unchanged". `--force` rewrites every row from the current mapping. Dry-run first by re-mapping the stored payloads and diffing: a change to *names* would reshuffle `base_id` grouping and needs review, a change to other fields does not. **Run it against each environment separately** — card data is synced per project, not copied, so a fix applied to dev is not carried to production by deploying.
- Never hand-edit card data; fix the sync instead.
- Keep components small; colocate route-specific components under their route folder.
- Riftbound term casing in UI: domains and card types are proper nouns (Fury, Battlefield). Sources store them lowercase; title-case at the boundary via `titleCase` in `src/lib/riftbound.ts`.
- Filter dropdowns are built from the **distinct values actually in the DB**, then sorted by the canonical lists in `src/lib/riftbound.ts` with unrecognized values kept at the end (`sortByCanonical`). A new set's new rarity therefore appears without a code change — `Promo` already does, and is not in `RARITIES`. That is also why sorting asserts on a **rank**, not a value: "sort by rarity ends at Showcase" is wrong, because `Promo` sorts after it.
- **Set, domain, rarity and energy are multi-select; they OR within a filter and
  AND across filters.** Ticking Fury and Calm means either — an AND would return
  only dual-domain cards, a much rarer question. The URL keys stay **singular and
  repeat** (`?domain=Fury&domain=Calm`) rather than becoming `domains`, so links
  shared before multi-select still work, and because that is exactly what a plain
  HTML checkbox group submits: the no-JS path and the router produce the same URL.
  Type and trait stay single-select — they are long lists where narrowing is the
  point.
- **The energy filter buckets 0–8, `9+` and `none`.** The pool thins sharply at
  the top (9, 10 and 12 together are 23 cards against 220 at cost 2), so a chip
  per value up there would be three that rarely match and a gap at 11; `9+` is a
  `>=` so a future 13-cost card needs no code change. **`none` is not 0** —
  legends, runes and battlefields have no energy cost at all, 243 of 1,288
  printings, and without a bucket of their own they would be the fifth of the
  pool no cost filter could reach. `check:card-filters` asserts the buckets
  partition the pool exactly, which is what catches both mistakes.
- **`getFilterOptions` is memoised in-process for five minutes**
  (`CARD_POOL_TTL_MS`). Its six queries ran on every card-browser load and
  exhausted the connection pool in production — see "Page speed". The values
  describe the card pool, so they only change when `sync-cards` runs and a new
  set appears within five minutes of a sync with nobody doing anything. It is a
  plain module-level memo rather than a framework cache deliberately: no
  revalidation story to get wrong, and a cold instance simply reads once.
- **The unfiltered first page of `/cards` is memoised the same way and for the
  same reason** — it is the identical 60 rows for every visitor, on the page
  people land on, and it counts across all 1,288 rows before returning any of
  them. **Only the default view is cached**: no filter, sort or page number, so
  at most two entries (grouped and all printings) and no way for a crafted
  querystring to grow the map. Anything else reads through. The cached object is
  shared between requests, so nothing may mutate it — callers render it and
  nothing more; if that changes, copy on read.
- **A set's printed name comes from the stored raw payload**
  (`data->'card'->'set'->>'label'`), not a lookup table, so a newly synced set
  names itself like every other filter value. The six retired-source token rows
  have a different payload shape and yield null, so the code stands in. Ordered
  by **name**, not code: the codes interleave promos through the real sets
  (JDG, OGN, OGS, OPP, PR…), which reads as no order at all.
- **Sorting is `?sort=` over set (default), name, energy, type, rarity.** Rarity
  and type rank against the canonical lists rather than sorting alphabetically,
  and **`CARD_TYPE_ORDER` is not `CARD_TYPES`** — the latter is display
  vocabulary including "Champion Unit" and "Signature Spell", which are a `type`
  plus a `supertype` and match no row's `type` column, so ranking against it
  would drop every card into the fallback bucket. Every ordering ends with the
  printed order as its tie-break, since 220 cards share cost 2.
- **A `"use client"` module must import only *types* from `src/db/queries/`.**
  Importing a value pulls `src/db/index.ts` in behind it and bundles the postgres
  driver for the browser — which fails with a `node:crypto` resolution error
  naming nothing relevant. That is why `CARD_SORTS` and `CARD_SORT_LABELS` live
  in `src/lib/riftbound.ts` rather than beside `searchCards`. This is the mirror
  of the rule below about client modules' exports not being callable from the
  server: shared *values* belong in `src/lib/`, whichever direction they travel.
- **`cards.tags` is the type line's trait half**, and it mixes three unrelated
  things: where a card is from (Ionia), what it is (Pirate, Dragon) and which
  champion it belongs to (Ahri). 127 distinct values, 95 of them champion names.
  The trait dropdown groups them — a flat list is one nobody finds "Pirate" in —
  and the grouping is *derived*: `REGIONS` is the only enumerable set, a tag
  that also appears in `cards.champion` is a champion tag, and the rest are
  ordinary traits. A new set's new creature type therefore needs no code change.
  Free-text search matches tags too (`array_to_string(tags, ' ') ilike`), since
  people type them the way they read them — "PILTOVER", not "Piltover" — while
  the dropdown filter uses exact array containment so "Zaun" can't also match a
  future "Zaunite". `keywords` is empty on every row and is not searched.
- Card rendering rules live in `src/lib/riftbound.ts` (domain colors, canonical orderings, orientation). Battlefields are printed landscape (7:5), every other type portrait (5:7) — the printed image already reads upside-down on its top half, that is correct.
- **We store image *URLs*, never image bytes.** `cards.image_full` and
  `image_thumb` are `text`; the whole `cards` table is ~3MB for 1,288 rows, of
  which ~170KB is URL text. Every card image is served browser-to-Riot from
  `cmsassets.rgpub.io` — measured, not assumed: loading `/cards` pulls ~2.5MB
  of art across 60 requests, **all of it** from Riot's CDN and none from our
  origin. Card art therefore costs us no bandwidth and no storage. The one
  exception is the share-preview images, which fetch the cover art server-side
  to embed it in the PNG; they're CDN-cached for a day for exactly that reason.
- Card images render with a plain `<img>`, never `next/image`: optimizing through Vercel would proxy and cache them, which we are deliberately not doing yet — and would turn the line above from true into false.
- **`image_thumb` and `image_full` are the same URL on every row** — the source has no thumbnail rendition, so a grid of tiles was pulling a ~875KB PNG per card and a twelve-card draft pack came to roughly 10MB. Riot's CDN is Sanity and resizes on request, so `cardThumb`/`cardFull` in `src/lib/card-images.ts` append `?w=…&fm=webp`. This is still the source CDN serving its own asset, so it stays inside the no-proxy rule. It happens at render time rather than in the sync so it applies to rows already stored, and an unrecognised host passes through untouched.
- **`THUMB_WIDTH` is a source width, and must stay near 2× the rendered one.** Tiles render at 246 CSS px everywhere they appear, so it is 512: ~48KB, still roughly 18× lighter than the PNG. 320 was tried first and looked blurry — an undersized image on a 2× display reads as *unreadable card text*, not merely as a small picture, so trading further down the size is a false economy.
- **A card tile shows its name until the art covers it, and retries before giving up.** Art arrives over the network and a blank tile is indistinguishable from a bug — that confusion has been reported twice. `src/components/card-art.tsx` is the one implementation: the name underneath, the art painting over it, **two retries** with a short backoff, then the name for good. The first version failed permanently on the first `onError`, which assumed a failure meant a bad URL; in practice the URLs are fine and the failures are transient — one card came back blank in a draft pack while its image served a normal 200 throughout, and appeared once the pack came round and the tile re-rendered. Two details make it work and are easy to leave out. The attempt number rides in the `src` as a cache-buster, because re-assigning an identical `src` does not make a browser fetch again. And a `ref` checks `complete && !naturalWidth` on mount, because **an image that fails before hydration never fires `onError`** — the browser requested it from the server-rendered HTML and the event was over before React attached a listener. Without that check the retry never ran on the card browser's sixty-tile grid, which is where it matters most; with it, 20 forced failures all recovered.
- Rules text contains symbol tokens (`:rb_energy_1:`, `:rb_rune_fury:`). Never render `rules_text` raw — go through `parseRulesText` in `src/lib/rules-text.ts`, which resolves the tokens to badges and degrades unknown ones to readable words. Note the source names domain symbols `rune_*` but they are **Power** costs; runes are the resource cards you exhaust or recycle to produce Energy and Power.
- Printings: `cards.base_id` is the id of the **canonical printing** of a card, resolved from card data — not from the id string. Sets reprint cards in their high-numbered showcase slots, within a set (`SFD-049` → `SFD-224`) and across sets (`OGN-013` "Pouty Poro" → `UNL-220`), so no amount of suffix-stripping can group them. Identity is `(lower(name), type)`; see `assignBaseIds` in `src/lib/card-ids.ts` and the matching SQL in `drizzle/0003_base_id_print_groups.sql`, which must stay in step. Because identity is name-based, different cards sharing a collector number (`UNL-T01` "Baron Pit" vs `UNL-001` "Arena Kingpin") never group. `npm run check:printings` asserts all of this.
- Do **not** use rules text as card identity: showcase reprints drop the parenthetical reminder text and sometimes reword the ability outright.
- **The filter bar's controls are fixed-width, and the page always reserves a
  scrollbar.** Both exist because adjusting a filter made the whole page
  twitch, and the causes were three separate things — measured, not guessed:
  a menu button grew with its selection (`Sets` 65px, `Riftbound Organized Play
  Promotional Cards` 321px), pushing every control right and tipping the bar
  onto another row; the Clear button appeared the moment a first filter was
  ticked, reflowing the row; and filtering to a short result removed the
  scrollbar, widening the viewport by 15px so every centred container slid
  sideways (`clientWidth` 1425 → 1440). So: `MENU_BUTTON_W` on every menu with
  the label truncating, Clear always occupying its slot (`invisible`, not
  unmounted), a fixed-width result count, and `overflow-y: scroll` on `html`.
  `scrollbar-gutter: stable` **alone did nothing** — it computes to `stable`
  but reserves no space while both `html` and `body` are `overflow: visible`,
  because then the viewport is the scroller and there is no gutter to reserve.
- **The bar is two deliberate rows, not one that wraps.** Its eleven controls
  want ~1489px against 1377 available, so a single row wrapped — and *where* it
  wrapped moved as labels changed width. Splitting it (text search above,
  filters below) makes the height a constant. Because every control is now a
  fixed width regardless of selection, the second row's wrap points at narrower
  viewports no longer depend on the filters either, which is the property that
  matters: a filter change must never change the layout.
- Filter navigation must not throw away the reader's scroll position. `scroll: false` alone is not enough — the router still pulls the viewport to the top of the refreshed segment — so `CardFilterBar` captures `window.scrollY` before navigating and reapplies it when the transition settles.

## Chrome and theme

- **Dark is the default, and the theme is a cookie, not a media query.** The
  card art is dark-bordered on a dark frame, so a light page puts a bright
  margin around every image. `resolveTheme` in `src/lib/theme.ts` falls back to
  dark when `cubebound.theme` is absent, the root layout reads that cookie and
  puts `dark` on `<html>`, and `globals.css` redefines `dark:` with
  `@custom-variant` so utilities follow the class rather than the OS. Deciding
  it on the server is what avoids the flash of the wrong theme; a client-side
  choice has to paint and then correct itself. The footer toggle flips the
  class directly and writes the cookie — presentation should change on the same
  frame as the click, and the cookie only has to be right for the *next*
  request.
- **The nav shows an avatar, not the username.** A spelled-out name has no
  upper bound: a 30-character one pushed Sign out past the right edge of a
  phone, which is the bug that prompted this. The avatar is a fixed 32px, the
  full name is in its `aria-label` and at the top of the menu it opens
  (Profile / Settings / Log out). Below `sm` the nav also drops "Your " from
  the cube and draft links, shrinks the logo and **hides the wordmark**,
  without which a 320px screen still overflowed. The nav is at its width
  budget: adding a sixth item means taking one away or collapsing them behind
  a menu, and the check is a 320px screenshot, not an opinion.
- **The brand mark lives in `src/components/logo.tsx`** and every surface that
  shows it — nav, landing page, coming-soon pages, 404 — renders that, so the
  artwork changes in one place. The mark is `public/logo.svg` on a 320×300
  viewBox, carrying enough fine detail (dashed rear edges, sparkles, 1px card
  strokes) that it needs ~26px even in the nav rather than the 16px an icon-only
  mark could take. It is served as an `<img>` rather than inlined: the file has
  fixed `id`s, and a page showing the logo twice would duplicate them. Width and
  height are both set so the header does not jump while it loads.
- **A username is a link.** `/u/{username}` lists that account's public cubes
  with a search box, and `/profile` redirects to your own — one page, one
  address, and the account-menu item works without knowing your name. It shows
  public cubes only even to their owner, because a profile is what other people
  see; your private and unlisted ones live on `/cubes`, which says so. It exists
  because Explore puts a username on every row and the cube URL carries one, so
  both were link-shaped dead ends. `/settings` is still "not built yet".
- `not-found.tsx` covers unknown URLs *and* every `notFound()` call, so a
  private cube and a cube that never existed look identical — the 404 must not
  become a way to test whether a cube id is real. `error.tsx` leads with "Try
  again", since most failures are a dropped request, and shows the digest
  because it is the only handle tying what someone saw to a line in the logs.

## Cubes

- The editor has four tabs, all on `/edit` behind `?mode=`. Default (no param):
  the cube is the page, and **quick add opens on demand** — a button, then a
  right-hand drawer on desktop and a bottom sheet below `lg`. It used to hold a
  permanent 20rem column, which taxed every visit for a panel you only want
  while adding. Type-ahead, per-row section and printing selects, add without
  navigating; Escape closes it. `?mode=browse` swaps in
  the full filter/grid browser **in place of** the cube list, so the add
  controls are never below it; `?mode=primer` and `?mode=log` are the Primer
  and Change log tabs. Browse mode is only rendered when active, so the
  unfiltered card query isn't paid for on every editor load.
- The cube list renders in two views: `visual` (image tiles) and `text`
  (`src/components/cube-table.tsx`). The text view reads domain → type → cost:
  a column per domain, split into Units / Gear / Spells inside the main section
  only, then cost groups with counts. Champion Units are `type = 'Unit'` and
  Signature Spells are `type = 'Spell'`, so they land in the right subgroup for
  free; an unrecognized type gets its own subgroup at the end rather than being
  dropped. **Columns wrap; they never shrink to fit and never scroll
  sideways.** The count per row steps at breakpoints — 8 at ≥1280px, 4 at
  ≥768px, 3 below, never fewer — and columns flex within a tier, which is how
  Cube Cobra keeps names readable at every width. Squeezing all of them onto
  one row was tried and fails on real data: a cube spanning 18 domain
  combinations left each column ~63px, truncating names to about six
  characters. The tier is read through `useSyncExternalStore` so the value
  stays out of render-time state and the server still gets a defined snapshot.
  The grid is also capped at `columns × 11rem` so a section with fewer columns
  than the tier allows (Battlefields has one) doesn't stretch across the page.
  Cost cells
  are tinted with their domain colour mixed against `--tint-base`, which flips
  between white and near-black so one mix percentage stays legible in both
  themes.
- **Multi-domain cards get a column per pair** (Fury/Chaos, Fury/Order, ...),
  not one shared "Multi" bucket — nearly every legend has two domains, so a
  single bucket would swallow most of them and say nothing. Columns sort as:
  single domains in the game's order, then Colorless, then the pairs ordered by
  their own domains. A pair's tint is a diagonal blend of its two colours and
  its header dot is a hard split; a blend would be mud at 10px, and a
  "multicolour gold" would collide with Order.
- **Hovering a row in the text view shows the card.** The list trades pictures
  for density, which is its whole point, but "which card is that" then costs a
  click into the modal. `CardHoverPreview` gives the picture back without
  giving up the density, and keyboard focus shows it too, anchored to the row
  since there is no cursor. It is positioned `fixed`, not absolute: the columns
  and cost cells it floats over have their own overflow and stacking contexts
  and would clip it. Near the right edge it flips to the other side of the
  cursor and it is clamped vertically, so a row at the bottom of a long cube
  still previews in full.
- The visual view sorts by domain, then by cost, with the cards that have
  **neither** an energy nor a power cost kept together at the end rather than
  scattered as if they were zero-cost — legends, runes and battlefields are off
  that scale entirely. Both views order domains through `compareColumns` in
  `src/lib/domain-columns.ts`, which is shared precisely so "sorted by colour"
  cannot come to mean two different things.
- The visual view carries a floating **Back to top** button, since image tiles
  make for a very long page. It appears only past 600px of scroll and sits
  above the editor's Quick add button; both are bottom-right, and stacking
  keeps either from shifting depending on whether the other is rendered.
- View resolution is `?view=` first, then the
  `cubebound.cube-view2` cookie, then **text**; the toggle writes both, so a shared
  link shows what the sender saw while a personal preference follows you between
  cubes. See `src/lib/cube-view.ts`. Text is the default because the first
  question about a cube is what's *in* it, and the list answers that on one
  screen — 360 image tiles is several screens of scrolling and a few megabytes
  before you can tell.
- **The cookie name is versioned, and changing the default means bumping it.**
  The cookie is pinned for a year and beats the default by design, so switching
  the default from visual to text changed nothing for anyone who had ever
  touched the toggle — which is everyone who uses the site. `…-view2` retires
  those pins once; the next explicit choice re-pins under the new name.
- `cubes.primer` is a long-form markdown write-up, separate from the one-line
  `description`, edited on the editor's Primer tab and rendered by
  `src/components/primer.tsx`. **Never render it as HTML.** `rehype-raw` is
  deliberately absent so embedded HTML is never parsed; `rehype-sanitize` runs
  as a second layer with a narrowed tag list, and `urlTransform` allows only
  http/https/mailto. `npm run check:primer-safety` renders hostile markdown
  through the real component and fails if anything executable survives — run it
  after touching that component. The public cube view renders the primer with
  the same component.
- **The primer editor has a formatting toolbar, and it is a toolbar rather than
  a WYSIWYG editor.** The primer is stored as markdown and rendered with
  `rehype-sanitize` and no `rehype-raw`, so a rich-text surface would have to
  round-trip HTML back into markdown to be storable, and anything it could
  express that markdown cannot would be silently stripped on the way out.
  Buttons that write markdown keep one representation and leave the source
  readable. "Font size" maps to **headings**, because markdown has no font sizes
  and offering them would mean raw HTML.
- **Every toolbar operation toggles**, and the transforms live in
  `src/lib/markdown-edit.ts` — pure, so `check:markdown-edit` covers all of them
  without a browser. The cases worth knowing: unwrapping looks *outside* the
  selection as well as inside, because double-clicking a word in `**bold**`
  selects the word and not the asterisks (without that, Bold yields
  `****bold****`); a heading strips whatever prefix is already there rather than
  stacking `## # Title`; and a selection ending at the very start of the next
  line formats one line, not two.
- **Edits go through `document.execCommand("insertText")`.** It is deprecated,
  and it is still the only way to change a textarea while keeping the browser's
  native undo stack — Ctrl+Z after clicking Bold has to work, and assigning
  `value` clears the undo history outright. `diffRange` narrows each edit to the
  changed run so one click is one undo step rather than a whole-document swap.
  The buttons and the Ctrl/Cmd shortcuts share `applyEdit`, so they cannot drift.
- **A `<textarea>` submits CRLF whatever was typed into it**, per the HTML spec,
  so `updatePrimerAction` normalises to LF before storing. Without that the
  saved primer never equalled the editor's own `draft`, and its dirty check
  (`draft !== primer`) reported "Unsaved changes" the instant a save succeeded.
  Markdown renders either way, which is exactly why it went unnoticed for so
  long. Any other textarea-backed field has the same trap.
- **Every copy is its own entry in the UI.** `cube_cards` stores a quantity per
  (card, section) because two copies of one printing are genuinely identical,
  but nothing renders "×3" — a cube running three of a card shows three
  entries, each with its own section and printing control. `expandCopies` in
  `src/lib/cube-cards.ts` does the expansion; counts everywhere are copies, not
  rows, via `countCopies`.
- Per-copy edits move exactly one copy. "Put this copy in the sideboard" and
  "make this copy the alt art" are the same operation — take one off the source
  slot, add one to the target — and both merge into whatever is already there
  rather than dropping the copy being moved. Never write an action that moves a
  whole row when the UI is showing individual copies.
- The text view labels rows with their printing id only when a card sits in one
  section under more than one printing (`ambiguousBaseIds`); otherwise the
  names alone are unambiguous and the ids are noise.
- **Bulk import never guesses.** The Import tab parses a pasted list
  (`src/lib/import-list.ts`, pure and catalog-driven): optional leading
  quantity (`2 Fury Rune` / `2x Fury Rune`), `#` and `//` comments, and
  `Legends:`-style headers that set the section for the lines beneath, falling
  back to `defaultSectionForType`. Matching is case-insensitive and exact on
  the name; a miss becomes an **unmatched** line with suggestions to pick from,
  and a name resolving to two distinct cards becomes an **ambiguity** — neither
  is ever auto-resolved. Normalization folds case, whitespace and smart quotes
  but deliberately **not** punctuation, because "Daisy!" is a real card name and
  collapsing it would be exactly the silent guess this avoids. Capped at
  `MAX_IMPORT_LINES`. Cards also answer to their **"Champion - Title"**
  spelling, which is how vendor and buylist exports print them
  (`aliasesFor`): a stored `Akali, Silent` aliases to `Akali - Silent` by
  punctuation alone, and a legend stored as `Rogue Assassin` aliases through
  its champion to `Akali - Rogue Assassin`. Aliases are consulted only after
  real names, never shadow one, and two cards sharing an alias is an ambiguity.
  Without this a real 426-line buylist missed on all 111 of its champion lines.
  The preview writes nothing; commit takes resolved rows
  rather than re-parsing, so the user's picks survive, and re-validates every
  one server-side through `mergeImportRows`. Imports append and increment, and
  log as a single `cards_imported` batch. No name in the pool maps to two cards
  today, so `check:import` covers ambiguity with a synthetic catalog.
- **The maybeboard is not part of the cube.** It holds cards you are
  *considering*; the sideboard holds cards deliberately taken out. Neither is
  drafted, and the maybeboard is excluded from the cube's card count and from
  the stacked cube list — counting it would make a 300-card cube read as 340.
  That is what `CUBE_LIST_SECTIONS` is for: `CUBE_SECTIONS` stays complete so
  every section dropdown offers the maybeboard as a move target, while the list
  and the counts use the shorter one. It gets its own tab, `?tab=maybeboard`
  publicly and `?mode=maybeboard` in the editor, and the public tab appears only
  when it holds something — an empty shortlist on someone else's cube is noise.
  Moving in and out is the ordinary section move, so nothing new had to be
  written for it, and `Maybeboard:` works as an import header.
- **Runes are optional content.** A cube with no runes is a legitimate cube, so
  never warn about their absence or treat any section as required.
- **An account holds at most `MAX_CUBES_PER_USER` (25) cubes.** Not a product
  decision so much as an abuse ceiling: field lengths were capped but nothing
  bounded the row count. Enforced at write time on **both** creation paths —
  creating and cloning — because a cap on one of them is not a cap, and cloning
  is the easier one to automate.
- Public cube view is `/cube/{username}/{slug}`. Public and unlisted render for
  anyone including signed-out visitors; private 404s for non-owners, the same
  convention the mutations use. `canViewCube` in `src/lib/cube-access.ts` is the
  single definition, next to `canEditCube`.
- The public page's actions are ordered by who is looking: a visitor's primary
  action is **Clone** (filled), the owner's is **Edit**, and Clone steps down to
  a quiet button on your own cube. **Share** sits on both the public page and
  the editor header — the owner works in the editor, so that is where they
  reach for a link. It copies the absolute cube URL, built server-side with
  `resolveSiteUrl` so it doesn't depend on where the client is, and the link
  works for signed-out visitors because public and unlisted cubes render
  without a session. It is visibility-aware — unlisted says the link works for anyone who has it,
  private says only you can open it and links to Settings. Private still copies
  rather than refusing: handing someone a link that 404s is the failure worth
  naming, not the copy itself. `navigator.clipboard` needs a secure context, so
  the button falls back to a selectable input when it's unavailable.
- **Public reads go through the server connection, not RLS policies.** RLS
  stays deny-all: it exists to shut the PostgREST API that Supabase exposes
  automatically, not to authorize the app. Every read already happens in a
  Server Component through Drizzle as the table owner, so visibility is
  enforced in one place in application code. Opening `SELECT` policies to
  `anon` would mean granting the browser key direct read access to `cubes`,
  `cube_cards` and `cards` in order to serve pages we render server-side
  anyway — a second data path with its own rules, for no gain. If a future
  feature genuinely needs browser-side reads, add the policies then, and keep
  `canViewCube` and the policy in step.
- Every cube edit is appended to `cube_changes` and shown on the editor's
  Change log tab. Card name and printing id are denormalized into the row so
  the history still reads correctly after a card leaves the cube. Recording is
  best-effort: `recordCubeChange` swallows its own failures, because losing a
  log line must never undo or block the edit that just happened. New mutations
  should log themselves.
- **Every cube mutation goes through `requireOwnedCube` in
  `src/app/cube/actions.ts`.** Pages decide only what to render; the server
  re-checks ownership on each write. Non-owners get "not found" rather than
  "forbidden" so private cube ids can't be probed. `npm run check:cube-ownership`
  replays a captured Add request under a different session to prove it, and
  fails the build if a new action skips the gate.
- Slugs come from the name once and never change on rename — they are shared
  URLs. Uniqueness is per owner (`slugify` + `uniqueSlug` in `src/lib/slug.ts`).
- Adding a card infers its section from the card type via
  `defaultSectionForType` (Legend → legends, Rune → runes, Battlefield →
  battlefields, else main); cards can be moved afterwards. **Re-adding a card
  already in the cube increments its quantity** rather than being a no-op —
  cubes commonly run multiples. Nothing about a cube is singleton.
- Card search inside the editor reuses the browser's machinery — `searchCards`,
  `CardFilterBar`, `CardPagination` and the shared tiles in
  `src/components/card-visuals.tsx`. Route-specific wrappers stay under their
  route; anything used by both lives in `src/components/`.
- **A `"use client"` module's exports cannot be called from the server** — only
  rendered as components or passed as props. Pure helpers that both sides need
  therefore live in `src/lib/`, never beside the component that happens to use
  them most: `cardFilterParams` in `card-search-params.ts` (the pagination
  server component calls it) and `countCopies` in `cube-cards.ts` (the cube
  pages call it). This fails at request time, not at build time, so it is easy
  to ship — if a helper is shared, put it in `src/lib/` first.

## Share previews, crawling and monitoring

- **Every shared link renders a preview image**, drawn by Next's `ImageResponse`
  at `opengraph-image.tsx` — site-wide, per cube and per profile, with the
  shared pieces in `src/lib/og.tsx`. The whole product is "share this URL", so
  the share itself was the one surface with no design on it.
- **`ImageResponse` is Satori, not a browser.** Flexbox only; a `div` with more
  than one child *must* declare `display: flex` or it throws at request time.
  No CSS variables (a token renders as an empty string), no
  `text-overflow: ellipsis` — hence `clamp()` — and **no WebP**. Handing Satori
  a WebP kills the render worker rather than failing softly, which is why
  `cardShareImage` asks the CDN for `fm=jpg` while everything else asks for
  `fm=webp`. That one took a 500 with an empty response body to find.
- **A private cube's preview is the generic card.** The route is public and
  unauthenticated — a scraper has no session — so rendering its name would leak
  it to anyone who guessed the URL, which is exactly what the page's 404
  prevents. Unlisted cubes *do* get their real preview: they are meant to be
  shared by link, and a link that previews as nothing defeats the point.
- Previews carry `s-maxage=86400, stale-while-revalidate=604800`. Rendering one
  costs a DB read plus a fetch of the cover art, and chat clients re-scrape.
- **`metadataBase` is resolved per request** from `resolveSiteUrl`, the same
  helper the magic links use. Scrapers only fetch absolute `og:image` URLs, so a
  wrong base means no preview at all — and production, previews and localhost
  each need their own.
- The root layout sets a title template (`%s · cubebound.gg`), so page titles
  must **not** repeat the suffix.
- `robots.ts` disallows the per-account routes, which would otherwise be
  indexed as a dozen copies of the login page. Individual cubes are not listed
  there: unlisted ones carry their own `noindex` from `generateMetadata`, which
  is where a per-cube decision belongs. `sitemap.ts` lists public cubes and
  their owners via `searchCubes`, so the public-only rule is the same single one
  Explore uses, and it degrades to the static pages rather than 500ing.
- **The sitemap has a thin-content floor: `SITEMAP_MIN_CARDS` (20).** A
  near-empty cube's page is a name, a byline and nothing to read, and on a site
  this size a handful of them is a large share of everything indexable — two
  abandoned test cubes were a sixth of the sitemap. Submitting a URL is a claim
  that it is worth reading, so the sitemap makes that claim only where it is
  true. The cubes stay public and reachable either way; this is about what is
  *advertised*, not what exists.
- **Page titles carry the words people search, not just the brand.** The
  homepage default was `cubebound.gg`, which ranked for nothing because nobody
  searches a brand they have not heard of; it is now
  "Riftbound Cube Builder & Draft Simulator · cubebound.gg". The title template
  still appends the suffix to every other page, so page titles must not repeat
  it. `/guides/riftbound-cube-drafting` exists as the one page that explains the
  format rather than serving the tool — a crawler meeting only a login wall and
  a list of other people's cubes has nothing to understand the site by.
- **`/privacy` describes what the code actually does, so it changes with the
  code.** Its cookie list is `THEME_COOKIE` and `CUBE_VIEW_COOKIE`; "analytics"
  is the Vercel Analytics component in the root layout; and it says plainly that
  account deletion is not yet self-serve, because promising a button that does
  not exist is the one genuinely dishonest thing that page could do. **When
  account deletion ships, that section is part of the same change.**
- **A cube's cover art is a card in that cube** (`cubes.cover_card_id`), picked
  on the settings page. Restricted to cards the cube holds, because a cover is
  meant to say what the cube *is* rather than be an arbitrary image slot.
  Unset falls back — a legend first, since that's what a cube is usually about,
  then the first main card — so a cube shows art whether or not anyone chose
  one. That resolution is **one SQL fragment**, `cubeCoverImageSql`, shared by
  the share previews and by every cube list: as a correlated subquery a list of
  twenty selects its covers in the same round trip, and one definition means a
  cube's thumbnail and its link preview can't come out as different cards.
- Cube lists show the cover cropped to a **4:3 window**, not the card's own
  shape — a list mixing portrait units with landscape battlefields has a ragged
  left edge, and on a 5:7 card a 4:3 window is about 54% of the height, which
  is almost exactly the illustration. A square was tried first and caught the
  name bar and rules box, which reads as a cropped card rather than a cover.
- **The favicon is a simplification of the logo, not the logo.**
  `src/app/icon.svg` draws only the cube silhouette and its spokes; the mark's
  dashed edges, floating cards and sparkles turn to mush below ~24px.
  `src/app/favicon.ico` packs 16/32/48px renders of it. If you regenerate it,
  **the PNGs inside must be RGBA** — Next's icon processing fails the build on
  RGB with "The PNG is not in RGBA format!", and a headless-Chrome screenshot is
  RGB unless you override the default background to transparent.
- **Error monitoring is Sentry. It is on in production and off everywhere
  else**, because it keys off `NEXT_PUBLIC_SENTRY_DSN`
  (`src/lib/sentry-options.ts`) and only Vercel sets it — so dev, CI and forks
  never report and need no account. A DSN is public by design and grants
  nothing: it identifies a project to send *to*, which is the one legitimate
  exception to the `NEXT_PUBLIC_` rule under "Auth and data access". An auth
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

## Discovery and following

One query backs every cube list on the site — `searchCubes` in
`src/db/queries/discovery.ts`, rendered by `src/components/cube-results.tsx`.
Explore, Your cubes and Followed cubes are the same call with a different
restriction, so a row cannot come to mean two different things depending on
where you meet it. The listing `queries/cubes.ts` used to own is gone; it
counted the maybeboard, which nothing else does.

- **Explore goes 60 deep in an ordering, 20 to a page, and never reports a
  total.** How many cubes exist is not a visitor's business — and a page count
  reports it: with pages of twenty, "of 2" says there are 21–40. So the pager is
  Previous / Next plus the current page number, with no "of N" and no count
  anywhere. Whether there is a next page is the only thing it discloses.
  The whole capped set comes back in one query and is sliced in memory: sixty
  rows is trivial to fetch and it keeps the cap in one place, where an offset
  query per page would need its own bound and could walk past sixty. Searching
  is how you reach deeper than the cap.
- **Explore lists public cubes only, and that rule lives in the query.**
  Unlisted means "reachable by link but not advertised", so a search result
  would defeat the setting — including a search for its exact name by its own
  owner. Private is never visible to anyone but its owner. Putting the rule in
  the page instead would leave the next caller free to forget it.
- **Keyword terms AND across name, description and primer.** Typing a second
  word to narrow a list and getting *more* results is the wrong surprise. Each
  term is a substring match with `%` and `_` escaped, which is enough at this
  scale and avoids committing to a full-text configuration before we know what
  people actually search for.
- The card filter is an `EXISTS`, so a cube running three copies or two
  printings appears once, and it **skips the maybeboard**: "which cubes run
  this card" must not answer with cubes that are only thinking about it. Card
  counts skip it for the same reason.
- Sorting by follows falls back to recency as the tie-break — among cubes
  nobody follows yet, the freshest is the more useful answer.
- **The search lives in the URL**, as a plain GET form rather than client
  state, so a result set can be linked, paged and reloaded. `/cubes` defaults
  to **your own** cubes; `?tab=followed` is the other tab, ordered by last
  update, because knowing when a cube changes is the reason to follow it.
- **Following is gated on viewing, like drafting** — `requireFollowableCube` in
  `src/app/explore/actions.ts`, scanned by `check:cube-ownership` alongside the
  draft actions. Sign-in is required because a follow belongs to an account;
  signed-out visitors see the control and get routed to `/login` rather than
  having the feature hidden from exactly the people who need an account for it.
  A followed cube that later turns private drops out of the followed list.
- **Neither follow state is a filled button.** Following is a state, not a call
  to action, and on a cube page a filled one out-shouts Clone, which is the
  visitor's actual primary action. The owner gets no follow control at all —
  just a follower count in the byline.
- The toggle is optimistic: it flips on click and reverts if the server
  disagrees. It is a low-stakes control people click while scanning a list, and
  waiting on the network makes the list feel broken.

## Analytics

The cube page's Analytics tab. Everything comes from one `analyzeCube` call in
`src/lib/cube-analytics.ts` over the cards the page already loaded — pure,
synchronous, no extra queries — and renders through hand-drawn SVG in
`src/components/charts.tsx`.

- **No charting library.** Every panel is a static picture of server-computed
  numbers with no interaction, so a library would ship a client bundle and force
  these into client components to draw what a few `<circle>`s already do. The
  whole tab works with JavaScript off. A donut is one circle per slice using
  `stroke-dasharray`, which cannot produce a malformed arc path the way hand-built
  `d` attributes can.
- **Counts are copies, not rows**, like everywhere else — a cube running three
  of a card contributes three to its curve.
- **Costless cards are excluded from the energy curve, not bucketed at zero.**
  Legends, runes and battlefields have no energy cost at all — 243 of 1,288
  printings — and a "0" column full of them invents a spike that says nothing
  about how the cube ramps. The count is reported in the panel's subtitle so the
  number is visible rather than silently missing. A genuine 0-cost spell still
  lands in 0, and a card with a *power* cost but no energy cost is on the curve.
- **Two-domain cards count once, in a Multi bucket**, so the slices sum to the
  cube's size and the donut reads as a share. The curve stacks by single domain
  plus Multi rather than giving every pair its own segment the way the text view
  gives every pair its own column: eighteen stacks per bar is mud, and a curve
  answers "how does this ramp", not "what exact pair is this".
- Multi is drawn as a **gradient**, never a flat colour — nothing flat means
  "more than one domain" without colliding with a real one, and gold reads as
  Order. Same reason the text view blends a pair's tint.
- **Types are `type` + `supertype`.** A breakdown by raw `type` folds 323
  champion units in with ordinary ones. `Champion` and `Signature` are promoted
  into the display name; `Token` and `Basic` are **not**, because they describe
  the printing rather than what the card does.
- **Keywords are read from the rules text, not from `cards.keywords`.** That
  column is empty on every row and no source has ever populated it, so a
  breakdown from it would render an empty panel. Riftbound prints keywords in
  brackets — `[Deflect]`, `[Shield 2]`, `[Accelerate]` — and `parseRulesText`
  already extracts them. Normalisation folds a trailing value (`[Shield 2]` and
  `[Shield 3]` are one keyword), folds case (the source has both `[ADD]` and
  `[Add]`), and drops the markers that are not keywords: `&gt;` / `&gt;&gt;`,
  which separate cost from effect, and the `NO TEXT` placeholder. Done at render
  time, so it works on rows already stored and needs no re-sync.
  `cards.keywords` is consequently **not selected by `browseColumns`** — it was
  fetched on every card query and read by nothing. The column and the sync's
  writes stay, so a source that starts filling it loses nothing; select it again
  when something reads it.
- Word counts run on `rulesTextToPlain`, so a card isn't scored as verbose for
  carrying symbols.

## Draft

Solo drafting against bots lives at `/cube/{username}/{slug}/draft`. **Milestone
A is done**: fixed configuration, dumb bots, pool-only result. B makes the bots
smart; C adds the deck builder.

- **The engine is pure and deterministic** — `src/lib/draft/`, no database, no
  React, no clock. Given a seed, config and packs, a sequence of human picks
  always yields the same draft. That is why the persisted draft is a *log*
  rather than a snapshot: state is rebuilt by replaying picks through the
  engine, so the row and the engine cannot disagree about whose turn it is.
  Every random decision goes through `createRng(seed, ...parts)`, whose streams
  are derived per seat and pick rather than drawn from one shared generator —
  replay then cannot drift if call order ever changes.
- **Configuration is chosen per draft on the start screen** and snapshotted
  into `drafts.config`, so a cube edited mid-draft — or different settings next
  time — cannot change what was already dealt. Seats, packs, cards per pack, and
  three kinds of reserved slot: legend, battlefield, and either-at-random.
  Defaults are the Legacy booster: 8 seats, 3 packs, 12 cards, 1 either-slot.
  Bounds live in `DRAFT_LIMITS` and are enforced by `validateDraftConfig` **on
  the server** — the config arrives from a browser, so `readDraftConfig` rebuilds
  it field by field rather than spreading it, which also stops a caller
  smuggling in `passDirections` and pinning the passing order.
- **Passing direction is derived, not stored.** It used to be a fixed
  `["left","right","left"]` array that `directionForRound` threw on past round
  three — so more than three packs was impossible, and the failure landed
  mid-draft rather than at creation. `passDirectionForRound` alternates from
  left for any round, which reproduces the old default exactly. A draft that
  *stored* a list still wins, so nothing in flight can drift.
- **Reserved slots come out of the pack, not on top of it**: 12 cards with 1
  legend and 2 battlefield slots is 9 main cards. The start screen shows the
  arithmetic live, because an 8-seat 3-pack draft with one legend slot needs 24
  legends and most cubes hold far fewer — finding that out after pressing start
  is a bad way to learn a number was too big.
- **A dedicated slot never substitutes the other type.** Short on legends, a
  legend slot fills from **main**, not from battlefields — you asked for a
  legend. Only the either-slot swaps, which is what it is for. A shortfall in
  any reserved section warns and falls back; only a main pool too small to cover
  its own slots *plus* the whole fallback actually blocks.
- **Each of legends and battlefields is either reserved or shuffled — one
  choice, not two settings.** Reserved means N guaranteed slots a pack; shuffled
  means the whole section joins the main pile and turns up wherever the shuffle
  puts it, for cubes that mix everything together and deal off the top. Both at
  once is incoherent — the guaranteed count would be a lie — so
  `validateDraftConfig` rejects it and the form offers a radio rather than a
  number plus a checkbox, which makes the exclusivity structural instead of a
  rule the UI has to police.
  **The either-slot needs both types reserved**, because it draws from each:
  shuffling one in empties the deck it would have taken from and would silently
  turn it into a one-type slot. `canUseEitherSlot` is that rule.
- **`buildMainPool` is both halves of the same rule.** When a type is
  *reserved*, its type beats its section: a legend filed in `main` is dropped,
  because the reserved slots exist so that type turns up a known number of times
  and a stray makes the number a lie. When a type is *shuffled*, there is no
  count to protect, so its section folds in and strays stay put. It reports both
  what it removed and what it folded in, so the start screen can say so rather
  than silently changing what a cube drafts.
  A shuffled type's reserved deck is emptied at the same time, and **that** is
  what stops a card being dealt from both piles — validation normally makes the
  combination unreachable, so `check:draft` builds the contradictory config on
  purpose to exercise the guard, since `generatePacks` does not validate.
- **The pack template follows Riftbound's Legacy booster**: eleven cards from
  the cube's main section plus one Legend-or-Battlefield, chosen 50/50 per
  pack. Legends and battlefields are a deck's *identity* rather than its body —
  you play one legend and a handful of battlefields — so dealing them from the
  main pool would both flood packs with cards nobody can use twice and starve
  drafters of the one card that fixes their domains. A guaranteed slot gives
  every seat three shots at each.
- **Rarity plays no part in pack construction.** A cube is already a curated
  pool; re-imposing the printed rarity distribution would double-filter it and
  put Riot's choices above the cube owner's.
- **Dealing is without replacement across the whole draft, respecting
  quantity**: a card the cube holds twice appears in at most two packs, total.
  Copies are expanded into individual entries before shuffling, so the limit
  holds by construction rather than by a counter someone must remember to
  decrement. Only the **main** section is drafted — never sideboard (a holding
  area for cards the owner deliberately removed) or runes (resources, not
  draftable cards).
- **Fallbacks.** Too few legends and battlefields to fill their slots: fill from
  main and warn before the draft starts. Too few main cards for
  `seats × packs × 11`: **block** with the actual numbers, because a draft that
  silently ran short packs reads as an engine bug to whoever hits it, and the
  cube owner can fix it by adding cards.
- **Bots are deliberately dumb.** Each commits to the domains of its first pick
  (at most two) and thereafter takes a random in-domain card, falling back to
  random when the pack offers none. That drains packs in a plausible *shape*
  without pretending to a skill the engine does not have — and it keeps a bot
  bug distinguishable from a bot opinion. A one-domain first pick commits to
  one domain; there is nothing principled to invent for the second.
- **Drafting is gated on viewing, not owning** — the point of sharing a cube.
  Sign-in is still required because the draft is persisted to survive a
  refresh and a row has to belong to someone; signed-out visitors get a prompt.
  `requireDraftableCube` gates starting, `requireOwnDraft` gates picking and
  saving: a public cube does not make someone else's draft yours to pick in.
- **Config and the dealt cards are snapshotted at draft start**, so editing the
  cube mid-draft cannot change packs already dealt. `drafts.packs` stores card
  *ids*; details come from `cards`, which cube edits don't touch. A card
  deleted from the database outright makes the draft unresumable, and it says so
  rather than dealing a hole.
- **The pool sits beneath the packs as a curve**, not beside them: piles by
  energy cost with legends and battlefields kept separate, because those are
  off the cost scale rather than at the cheap end of it. Cards **stack** within
  a pile and hovering raises one to full view. The overlap is a negative
  percentage margin, which resolves against the container's *width* — and so
  does card height via its aspect ratio, so the stack stays correct at any
  column width, with the covered card deciding the offset so a landscape
  battlefield overlaps differently to a unit. `REVEAL` controls how much of a
  covered card shows: Cube Cobra can stack to a sliver because Magic prints the
  name along the top edge, whereas Riftbound puts it around 60% down, so a
  sliver shows cost and art but not the name. That is what makes the hover
  necessary rather than a nicety. Raising is React state, not a `hover:z-…`
  class, because the stacking order is an inline style and inline styles win. One click is the whole
  interaction — a card in the pack goes to the mainboard, a mainboard card goes
  to the sideboard, a sideboard card comes back. The board is stored per pick
  (`draft_picks.board`) and keyed by `(round, pickNumber)` rather than card id,
  so two copies of one card move independently. Saving as a cube keeps the
  split: sidelined cards land in the new cube's sideboard section.
- **Card art degrades to the card name.** Images come straight from the source
  CDN and one occasionally fails; a blank tile in a pack you are choosing from
  is the worst place for that, so both the pack tiles and the pool piles fall
  back to the name on `onError`.
- **A finished draft exports as a text decklist**, from the end screen, for
  pasting into Piltover Archive and the other Riftbound builders. The format is
  one `<quantity> <card name>` per line with no headers — what Piltover itself
  exports and what the others parse. The binary deck code
  (`Piltover-Archive/RiftboundDeckCodes`) is deliberately not used: it is a
  dependency and an encoding to get wrong, where a text list is a paste a human
  can read and fix.
  **The names have to be rebuilt, and that is the whole feature.** `cards.name`
  is normalised per type by the sync: champion units are stored `Darius,
  Trifarian`, which is already right, but **a legend stores only its title**
  (`Daughter of the Void`, champion `Kai'Sa`) — exported raw, every legend fails
  to match. And 35 cards carry a promo suffix (`(Metal)` on 24, plus
  `(Starter)`, `(Launch Exclusive)`, `(Ultimate)`, `(GG EZ)`), each of which has
  a same-named plain card in the pool, so the suffix is stripped. `deckListName`
  does both, in that order, so a variant legend still gets its champion.
  Mainboard and sideboard are separate lists, never concatenated: the flat
  format has no notion of a sideboard, so appending one would present cards the
  drafter cut as part of the deck. Runes are absent because they are not
  drafted, and the panel says so.
- **Drafts are kept as drafts.** `/drafts` lists every draft the user has sat
  in, and `?draft={id}` on the draft route reopens one — a draft holds the
  packs it was dealt, every pick in order and the main/side split, none of
  which survives being flattened into a cube. **"Save as cube" is gone**: it
  predated `/drafts`, when a finished draft became unreachable the moment a
  newer one started and flattening it into a cube was the only way to keep it.
  Now that drafts keep, it copied a pool into a second place for no gain and
  left people with cubes they had not meant to make. Cloning is still how you
  get an editable copy of a *cube*. Without the id parameter the route shows the
  latest draft of that cube, which is why a finished draft used to become
  unreachable the moment a new one started. A draft id belonging to someone
  else, or to another cube, falls back to the latest rather than opening.
- **Deleting a draft takes its picks with it** (`draft_picks` cascades) and is
  gated on being the drafter, in the action and again in the query's `WHERE`.
  It confirms first: it is the only irreversible thing on the list and sits
  next to the link that opens a draft. `/drafts` pages at
  `DRAFTS_PAGE_SIZE`, and an out-of-range `?page=` clamps rather than 404s so
  deleting the last draft on a page still lands somewhere real.
- Generic page controls live in `src/components/pagination.tsx`; the card
  browser's `CardPagination` wraps them to carry its filters through the link,
  which is the only part that differs between the two.
- **"Draft" on a cube means "set one up", so both Draft buttons link to
  `?new=1`.** Resuming the latest draft made the settings unreachable from a
  cube for anyone who had drafted it before, which is everyone after the first
  time. Picking up where you left off is what `/drafts`, the draft switcher and
  the "Back to it" link on the settings screen are for. The **bare
  `/cube/…/draft` still resumes**, so a bookmark keeps working.
- **"New draft" is a link to `?new=1`, not an action.** It used to deal on
  click, which made the settings screen reachable only on a cube you had never
  drafted — that is, never, after the first time. Routing to the settings makes
  that screen the commit point, and it also replaces the old confirm: nothing is
  dealt by *looking* at settings, and the screen says plainly that the current
  draft survives, which is what the confirm existed to promise.
- **Milestone A adds migration `0007`**, which was applied to production before
  the environment split (see "Environments"). The general rule still holds for
  the next one: a deploy does not migrate, so a feature adding tables fails at
  request time however green the build looks.
- Bot picks are stored as well as the human's, though only the human's are
  replayed — the bots' are a deterministic function of the seed, so feeding
  them back would assert them twice. They are kept for readability and to give
  milestone B's smarter bots something to be compared against.

### Format rules (for milestone C's deck builder)

Not enforced anywhere yet — the draft produces a pool, and nothing validates a
deck. Written down now so the builder does not have to re-derive them:

- A deck may use cards from **up to three domains**.
- **Any signature spell is usable regardless of which champions the deck runs.**
  Signature spells are tied to a champion by flavour, not by a deckbuilding
  restriction.
- **No legend or champion is required.** A legal deck need contain neither.

## Checks

Each check guards a regression that already happened once. Run the ones
touching what you changed; run the manual gate in full before a deploy. The
ones needing a database hit **dev**, never production — see "Environments" —
which is why they can create and delete accounts freely.

| Script | Guards | Needs | Runs |
| --- | --- | --- | --- |
| `check:primer-safety` | hostile markdown renders inert through the real component | nothing | **CI** |
| `check:printings` | the TS and SQL `base_id` rules agree on every row | DB (read-only) | manual gate |
| `check:browse-grid` | a grouped tile is a card, an all-printings tile is itself | Supabase + dev server | manual gate |
| `check:card-filters` | multi-select ORs within a filter and ANDs across; energy buckets partition the pool; sorting uses the game's order | DB (read-only) | manual gate |
| `check:copies-and-log` | quantity 2 lists as two entries; per-copy edits move one copy; edits reach the log | Supabase + dev server | manual gate |
| `check:public-cube` | visibility gating, cloning, quantity-aware counts | Supabase + dev server | manual gate |
| `check:auth-flow` | claiming a username refreshes the nav (`revalidatePath`) | Supabase + dev server + Chrome :9222 | manual gate |
| `check:cube-ownership` | replays an Add under another session and with no cookie | Supabase + dev server + Chrome :9222 | manual gate |
| `check:magic-link` | the `redirect_to` actually sent to Supabase, and `/?code=` self-heal | `dev:probe` server + Chrome :9222 | manual gate |
| `check:import` | import parsing, matching, the line cap and the committed result | DB | manual gate |
| `check:draft` | a full seeded 8-seat draft: quantities, pack template, passing, bots, determinism | nothing | **CI** |
| `check:discovery` | explore is public-only, keywords AND, the card filter, sorting, follow state, both `/cubes` tabs | Supabase + dev server | manual gate |
| `check:analytics` | copies not rows, costless cards off the curve, Multi bucketing, keyword normalisation | nothing | **CI** |
| `check:markdown-edit` | the primer toolbar's transforms: every button toggles, headings replace rather than stack, `diffRange` is minimal | nothing | **CI** |
| `check:primer-toolbar` | the toolbar is *wired*: a click reaches React state, Ctrl+B matches the button, and the result saves byte-for-byte | Supabase + dev server + Chrome :9222 | manual gate |
| `check:deck-export` | drafted decks export as names other builders accept: legends rebuilt as `Champion, Title`, promo variant suffixes stripped, copies aggregated, and the result re-imports here | DB (read-only) | manual gate |
| `check:moderation` | hide/suspend take effect and drop out of every listing including the owner's own; `canUseCube` refuses even the owner; deleting an account cascades and leaves a surviving log entry | DB | manual gate |
| `check:pool` | the pool is bounded and releases (`max` / `idle_timeout` / `connect_timeout`), the filter options and default card page are memoised, and filtered searches are **not** | DB (3 queries) | manual gate |
| `check:share-previews` | all three OG routes return real PNGs; cover set and cover falling back; a private cube stays generic; `og:image` is absolute | Supabase + dev server | manual gate |

`check:magic-link` needs the dev server started as `SIGNIN_PROBE=1 npm run
dev:probe`, which preloads `scripts/otp-probe.mjs` to intercept the outgoing
`/auth/v1/otp` call — so it reads the real wire value without sending mail or
creating a user. It asserts on the URL Supabase receives rather than on the
helper in isolation, because the production bug was invisible everywhere else:
localhost worked and the code read fine.

**`document.readyState === 'complete'` does not mean "the page is usable"** on
a route with a `loading.tsx`. Next flushes the loading shell early, so
readyState goes complete while the skeleton is still up and React has not
hydrated — a click then lands on a button with no handler and silently does
nothing. That is how `check:cube-ownership` started failing two runs in three
the moment the loading boundaries landed. It now waits for the skeleton to
clear *and* for the button to carry React's internal props key, then polls for
the write instead of sleeping a fixed budget. `check:auth-flow` and
`check:magic-link` still use readyState, which is fine only because `/welcome`
and `/login` have no loading boundary — **adding one to either route means
fixing those checks the same way.**

`check:cube-ownership` is also structural: it fails if a new action in
`src/app/cube/actions.ts` skips `requireOwnedCube` without a documented
exemption naming the gate it uses instead. It scans the **draft** and **follow**
actions the same way, against their own gates — a mutation living in a file the
check does not read would escape the guarantee entirely, which is worse than an
exemption.

### What CI runs

`.github/workflows/ci.yml`, on every push and pull request: typecheck, lint,
`check:primer-safety`, `check:draft`, `check:analytics`, `check:markdown-edit`,
and a production build. It uses **placeholder** Supabase
values, never real ones — every route is dynamic, so the build renders no page
and opens no connection, but `src/lib/supabase/config.ts` throws when the vars
are absent. **No production credentials belong in CI under any arrangement.**

`npm run typecheck` runs `next typegen` first, because Next generates the global
route helpers (`LayoutProps<"/">`, `PageProps<…>`) into `.next/types` and
tsconfig includes them — plain `tsc` fails on a tree that has never been built.

**Never run `npm run build` while `npm run dev` is up — use
`npm run build:isolated`.** They share `.next`, and a build overwrites the dev
server's client chunks: the browser then asks for
`/_next/static/development/...` files that no longer exist and pages stop
loading, while `curl` keeps getting 200 because server-rendered HTML is
unaffected. That combination — working fetches, broken browser — is very hard
to read as a build problem, and it has cost real debugging time twice. The
isolated build targets `.next-build` via `NEXT_DIST_DIR` and leaves the dev
server alone. If it has already happened: restart `npm run dev` and hard-reload
the browser.

**Verify CI changes from a fresh clone, not the working tree.** A local run
reuses a populated `.next` and an existing `.env.local`, so it passes on state
CI does not have; that exact gap shipped a red build. `git clone` to a temp dir,
`npm ci`, set placeholder env, then run the steps.

### Why the other thirteen are a manual gate, not CI

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
npm run check:share-previews
```

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

## Moderation

Owner-only, and deliberately small. `users.is_admin` is the flag; there is no
moderator role beyond it yet.

- **Suspend and hide are the primary verbs; delete is the last resort.** There
  is no point-in-time recovery on this plan, so a wrong delete cannot be undone
  from anywhere. Both delete actions require the cube name or username typed
  exactly, and `check:cube-ownership` fails the build if either stops
  *comparing* that confirmation — checking only that the word `confirm` appears
  let a mutation through that deleted the guard and left the variable behind.
- **`canViewCube` is still the one read rule**, now taking `hiddenAt` and
  `ownerSuspendedAt`. Those live on `ViewableCube` as a required type rather
  than being read loosely, so adding a moderation state breaks every call site
  that has not considered it — which is how the check scripts caught up.
- **A hidden cube stays visible to its owner; a suspended account's cubes do
  not, even to the owner.** Hiding tells the owner why, on the page, because
  otherwise they conclude the site is broken and email about it. Suspension is
  the account being switched off, so it applies to them too. Admins see
  everything, since reviewing what you hid is the job.
- **Suspension stops the account acting, not only being seen.** `suspensionError`
  is checked in `requireOwnedCube`, `createCubeAction`, the clone path, the draft
  gate and the follow gate. It was missing at first: a suspended account could go
  on creating and editing cubes — invisible to everyone, but still accumulating
  against the 25-cube ceiling, and a suspension that lets you keep working is not
  one. Read paths deliberately do **not** use it, because the moderator still has
  to look at what the account made. `check:moderation` asserts every write gate
  calls it.
- **`is_admin` is not writable from the web at all.** No form field, no action,
  no input reaches it — the only ways to set it are SQL and the dev-only
  `dev:login --admin`. A moderator therefore cannot be created by a bug in a
  form, only by someone with database access.
- **`canUseCube` is separate from `canViewCube`**: readable is not usable.
  Cloning, drafting and following all go through the stricter one, so a hidden
  cube cannot be copied out from under the moderation by its own owner.
- **The exclusion lives in `conditions()` in `discovery.ts`, above the
  `includeNonPublic` branch**, so it applies to *every* listing — Explore, a
  profile, the followed tab, the sitemap, and the owner's own `/cubes`. That
  last one is the point: the owner's list is where a hidden cube would
  otherwise still be advertised.
- **`moderation_log` is outside every cascade.** `actor_id` sets null and
  `target_id` is deliberately not a foreign key, because the record has to
  outlive both the moderator and the thing acted on; `snapshot` is the only
  trace a deleted cube or account leaves. Unlike `recordCubeChange`, logging
  here does **not** swallow failures, and it is written *before* the action, so
  an action with no audit trail cannot happen.
- Deleting an account deletes the **`auth.users`** row, not just the profile.
  Deleting the public row alone would leave an auth account that can still sign
  in and claim a fresh username on `/welcome` — the same person, a clean slate,
  no record.
- **A hand-written migration needs a `drizzle/meta/_journal.json` entry.**
  Without one `db:migrate` prints "migrations applied successfully" and applies
  nothing; `0012` was silently skipped that way, and the failure only surfaced
  as a missing relation at request time.

## Security posture

Audited before the first wide share. What was checked, and what it turned up.

**Verified sound, don't undo it:**
- **RLS deny-all holds.** The publishable key was fired directly at PostgREST:
  `cubes`, `users`, `cube_cards`, `drafts`, `cube_follows` and `cards` all
  return zero rows, and `INSERT` returns 401. That is the backstop working —
  see "Auth and data access" for why it exists rather than SELECT policies.
- **No secret has ever been committed.** `.env*` is gitignored bar the example,
  and a scan of full history turns up only placeholders.
- **Every mutation is gated.** All 21 server actions call one of
  `requireOwnedCube` / `requireDraftableCube` / `requireOwnDraft` /
  `requireFollowableCube` / `getCurrentUser`; `check:cube-ownership` fails the
  build if a new one doesn't. CSRF is covered by Next's Server Action origin
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
  the dashboard** rather than inheriting a default.
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

## Page speed

Two things dominate, and neither is the amount of data.

- **The connection pool is the scarcest resource, not query time.** The site
  hung in production while cards were being added quickly from the editor's
  browse tab. The database was healthy throughout — `/explore` answered in
  240ms — but requests queued for a connection with no deadline, so *different*
  routes timed out on different attempts and it read as the whole site being
  down rather than as one slow page. **Intermittent hangs across unrelated
  routes, while the database is demonstrably fine, means the pool.**
  Two causes, both since fixed and both worth not reintroducing:
  - `getFilterOptions` fired **six queries in one `Promise.all` on every card
    browser load**, including every re-render of the tab you sit in while
    adding cards. A single request could take the entire pool. It is now
    memoised in-process for five minutes, which is right because those values
    describe the *card pool* and change only when `sync-cards` runs. **Any new
    fan-out on a hot path needs the same scrutiny**: the number that matters is
    queries × concurrent requests, not the cost of one query.
  - The pool was unbounded and never released. postgres-js defaults to `max`
    10 with no idle timeout, and **every Vercel instance builds its own pool**,
    so a burst spun up instances that each took ten connections and were then
    frozen still holding them. `src/db/index.ts` now sets `max: 6` (the widest
    `Promise.all` fan-out, so parallel queries are not serialised),
    `idle_timeout: 20` so a frozen instance hands its connections back, and
    `connect_timeout: 10` so exhaustion fails fast with a digest instead of
    hanging — a page that errors is far easier to diagnose than one that stalls.
  - Reproduce with `npm run check:load` — 40 concurrent requests to `/cards`
    plus a probe at `/explore`. Before: the slowest took 45s. After: 5s.
    **The symptom appeared twice in local testing first and was written off as
    "I hammered the dev server"** — it was the same bug both times, and a hang
    under self-inflicted load is a finding, not an artefact.
  - **`check:pool` guards this, and it is deliberately not a load test.** The
    first attempt fired 40 concurrent requests at `/cards`. It worked, until it
    drove the shared dev Supabase project into statement timeouts — a standalone
    `select 1`, one connection with no app involved, failed in 191ms with
    `canceling statement due to statement timeout`, and `check:browse-grid`
    failed immediately afterwards. A gate step that breaks the next gate step is
    worse than none, and it was measuring the free tier's capacity as much as
    the code. What actually needs guarding is that nobody removes the pool
    bounds or the memos, and both are checkable in three queries. **If you do
    want to load-test by hand, check `select 1` before believing a failure**:
    slow means the environment, fast means the code.

- **Supabase is remote: a query costs ~60ms whatever it asks for.** Returning
  427 cube_cards rows measured 72ms against 59ms for a one-row lookup, so a
  page's cost is *how many round trips it makes in a row*, not how much any of
  them returns. Anything independent goes in a `Promise.all` — including
  `params`, `searchParams`, `cookies()` and `headers()`, which are all
  awaitable in Next 16 and were each adding a hop. `getCurrentUser()` is
  another network call (GoTrue), and it does not depend on looking up the cube.
  `searchCubesPage` and `getFollowState` exist to collapse pairs of queries
  that always travel together.
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

Measured on the 206-card cube, warm, after both changes: cube page 297ms in
production (486ms under `npm run dev`), editor 351ms (589ms), `/cubes` 299ms.
**Roughly half of what you feel locally is Turbopack**, so measure against
`npm run build && npx next start` before concluding something is slow.

## Auth and data access

- Supabase email magic links. Session cookies are refreshed in `src/middleware.ts`;
  always verify the user with `supabase.auth.getUser()`, never `getSession()`,
  which trusts the cookie without checking it.
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
- **Row Level Security is on for every table with no policies.** Supabase
  auto-exposes `public` over PostgREST and grants `anon`/`authenticated` full DML
  by default, so without RLS the browser key could read and write everything.
  The app reaches Postgres through Drizzle as the table owner, which bypasses
  RLS. If you add a table, enable RLS on it in the same migration.
- The nav renders the signed-in user from the **root layout**, and a Server
  Action that redirects does not re-render a layout the client Router Cache
  already holds. Any action that changes auth or profile state must call
  `revalidatePath("/", "layout")` (see `revalidateAuthUi` in
  `src/app/auth/actions.ts`) or the nav goes stale until a hard reload and Back
  can re-expose the claim form. `npm run check:auth-flow` guards this.
- **Never put a secret key in a `NEXT_PUBLIC_*` variable.** Next inlines those
  into the browser bundle, and `sb_secret_…` / `service_role` keys bypass RLS.
  `src/lib/supabase/config.ts` refuses to start if it detects one.

## Phase 1 milestones

1. ✅ Scaffold — Next.js + Tailwind + Drizzle + Supabase, env setup, CI.
2. ✅ Card ingestion — sync script, all sets, per-set counts verified.
3. ✅ Card browser — `/cards`, filters for set/domain/type/rarity, name search.
4. ✅ Auth + profiles — magic links, username claim.
5. ✅ Cube CRUD — create/edit/delete, add/remove cards, sections.
6. ✅ Cube view — public page, domain/cost grouping, view toggle, clone.
7. ✅ Deploy to Vercel with the production domain — live at cubebound.gg.

Phase 1 is done. Bulk import is in flight; then phase 2 in the order under
"Product vision", starting with search syntax. Do NOT build ahead of it.
