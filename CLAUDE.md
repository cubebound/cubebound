# cubebound.gg

Cube construction and drafting platform for Riftbound (Riot's League of Legends TCG). Think Cube Cobra, but Riftbound-native. Unofficial fan project under Riot's Legal Jibber Jabber policy — every page footer must include: "cubebound.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties."

## Current status

**Live at https://cubebound.gg.** Phase 1 is complete — all seven milestones,
deploy included — and **the MVP loop is closed**: sign in → create a cube →
search and add cards → view it by domain/cost/type → share a public URL that
anyone can browse and clone.

Working: card ingestion (**production** 1,294 printings / 966 `base_id` groups
across 8 sets; **dev** 1,288 / 960 — the difference is production's six
riftscribe token rows, see "How the split happened"). **The card browser
collapses to fewer than that** — 935 production / 929 dev — because 31 of those
groups are promo treatments the source spells in the name; see the `collapseKey`
bullet under "Conventions". Also working:
`/cards` browser, magic-link auth with username claim, cube CRUD, the staged
edit panel, visual and text views, primer, change log, the public cube view with
Share and Clone, and CI.

**Bulk import has shipped** — paste a card list on the editor's Import tab,
preview exactly what matched, then commit.

**Cube analytics has shipped** — the Analytics tab on any cube page.

**Solo bot drafting has shipped, and its settings are configurable** — choose
seats, packs, pack size and reserved legend/battlefield slots, then draft
against bots. Milestone B makes the bots smart; milestone C adds the post-draft
deck builder. See "Draft".

**Export to Draftmancer has shipped** — any cube downloads as a Draftmancer
Custom Card List, so eight people can draft it in a browser today rather than
waiting on multiplayer lobbies. See "Exports".

**Crack-A-Pack has shipped** — the third tab on the draft settings screen draws
one pack as a single high-resolution image to post, replacing the screenshots
creators were taking of the pack view. It renders server-side because Riot's card
CDN sends no CORS headers, which makes it the first feature where card art costs
us bandwidth, and the reason it is the one export that needs an account. See
"Crack-A-Pack".

Then the rest of phase 2 in the order under "Product vision".

Open items:
- **The production origin is derived from the request**, not from config —
  `resolveSiteUrl` reads the forwarded host, so cubebound.gg, preview
  deployments and localhost each build their own correct magic-link and share
  URLs. The live domain must stay on the Supabase redirect allowlist; see
  "Auth and data access" for what breaks when it isn't.
- **CI covers typecheck, lint, build and the eight pure checks** on push and PR:
  `check:primer-safety`, `check:draft`, `check:analytics`, `check:markdown-edit`,
  `check:draftmancer`, `check:pack-image`, `check:staged-edit` and `check:oauth`.
  The other sixteen need a live Supabase or the card pool and are a documented
  pre-deploy manual gate — see "Checks". Run that gate before deploying. (Twenty-four
  scripts in total; if that number moves, this line and the two counts under
  "Checks" move with it.)
- Feature work lands on a branch and pushes to
  `github.com/cubebound/cubebound`; `master` is production — see
  "Environments".
- **The schema is current: production is migrated through `0013`, and `drizzle/`
  holds nothing newer.** `0013` (`cube_cards_cube_id_section_idx`) was applied
  by hand at the Draftmancer export deploy on 17 August 2026; `0012`
  (moderation) the same way on 16 August. Confirm either with
  `select indexname from pg_indexes where tablename = 'cube_cards'` rather than
  by reading this file. Note that a hand-applied migration writes no row to
  production's `drizzle.__drizzle_migrations`, so that ledger and this repo's
  journal are already out of step — which is survivable only because `0013` is
  `CREATE INDEX IF NOT EXISTS` and re-running it is a no-op. The rule stands: a
  deploy does not run migrations, so a feature adding tables fails at request
  time however green the build looks. **Check `git log origin/master..master`
  before assuming what is live** — this file describes the code, not the
  deployment.
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
6. Exports (proxy sheets, deck lists compatible with other Riftbound tools) —
   **the Draftmancer cube export landed early, by request**, like solo drafting
   did before it. The reasoning was that it substitutes for item 4 at a fraction
   of the cost: Draftmancer already runs multiplayer drafts in a browser, so a
   cube file gets people drafting together without us writing a websocket
   server. Proxy sheets and the rest of item 6 are still unbuilt.

The MVP loop is shipped and live. Do NOT build ahead of the current phase —
reordering is the owner's call, made explicitly, not a judgement to make while
implementing something else.

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

**What merged, in order, is `git log`'s business rather than this file's.** The
last several are the draft settings rework and Crack-A-Pack
(`draft-screen-rollout`), the printing-collapse work (`printing-treatments`),
the owner's redirect off the visitor view, real 404s on `/edit` and
`/settings`, and the Printing dropdown's two-column query. None of them added
a migration, so production needs nothing applied by hand. A gate run is sixteen
scripts, `check:oauth-buttons` being the sixteenth; the other eight are pure
and run in CI instead.

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
`hidden_reason`, `moderation_log` (+ RLS) · `0013` `cube_cards_cube_id_section_idx`
(**applied to both environments by hand — see "Current status"**).

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
/settings                             account settings — sign-in methods
/login  /welcome  /auth/callback      magic link, username claim, PKCE exchange
/cubes  /cubes/new                    the signed-in user's cubes; ?tab=followed &q= &page=
/cube/{username}/{slug}               public view — visibility-gated;
                                      307s the cube's own owner to /edit
/cube/{username}/{slug}/edit          owner editor;
                                      ?mode=maybeboard|primer|analytics|log|browse|import
/cube/{username}/{slug}/settings      rename, visibility, delete
/cube/{username}/{slug}/draft         solo draft against bots — any viewer, not just the owner
                                      ?draft={id} opens a specific one, else the latest
                                      ?new=1 is the settings screen:
                                      Draftmancer export | bots | Crack-A-Pack
/cube/{username}/{slug}/draftmancer.txt  the cube as a Draftmancer Custom Card List
                                      ?packSize= &legendSlots= &… is the pack template;
                                      a route handler, so it gates itself — see "Exports"
/cube/{username}/{slug}/pack.png      one pack drawn as an image — see "Crack-A-Pack"
                                      ?seed= &packSize= &… regenerates it deterministically;
                                      ?tier=preview is the on-page size, ?dl=1 downloads;
                                      needs an account, unlike the export beside it
/drafts                               every draft the signed-in user has sat in
/robots.txt  /sitemap.xml             crawl rules; static pages + public cubes and profiles
/opengraph-image                      share previews — also under /cube/… and /u/…
```

Server Actions live in `src/app/cube/actions.ts`, `src/app/auth/actions.ts`,
`src/app/cube/[username]/[slug]/draft/actions.ts` and `src/app/explore/actions.ts`.

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
  **`public/riot.txt` is the domain verification for that application and has
  to stay reachable.** It is a bare UUID served at `/riot.txt`, and Riot reads
  it when they review the application — which has not happened yet, so a 404
  there fails the review at a step that has nothing to do with the code. It
  lived only on the retired `main` branch (see "Branching") and so was **not
  served at all** until it was added to `public/` on 7 September 2026; the live
  site had answered `/riot.txt` with the 404 page for as long as the app has
  been deployed. Do not delete it because it looks like a stray file.

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
- **Presentation classes are shared through `src/lib/ui.ts`, not retyped.** A
  new button, field, panel, tab or badge takes an export from there; a fresh
  Tailwind string is how the site got to 74 copies of the same button across 36
  files. Colours come from the tokens in `globals.css` — see "Chrome and
  theme" — so a raw `zinc-`, `bg-white` or `text-white` in `src/` is a bug
  outside of red destructive buttons and overlays on card art.
- Riftbound term casing in UI: domains and card types are proper nouns (Fury, Battlefield). Sources store them lowercase; title-case at the boundary via `titleCase` in `src/lib/riftbound.ts`.
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
- **The rest of the voice**, derived from the copy that was already there and
  worth keeping to: plain and declarative, no exclamation marks and no
  marketing verbs; say the consequence rather than only the rule ("so shared
  links keep working"); name a tradeoff instead of hiding it; contractions
  throughout; second person and active. **One verb per concept** — it is *sign
  in* and *sign out* everywhere, never "log out"; a generic "you must be
  authenticated" error is always "You need to be signed in.", and where the
  action can be named, name it ("Sign in to clone this cube.").
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
- **No two concurrent queries may share a result shape.** Production once
  rendered a rarity filter whose only option was **"966"** — the card count.
  `searchCards` aliased its count `value`, which is exactly what the rarity,
  type and domain queries select, and the page fires all of them together; a
  crossed result was therefore indistinguishable from a correct one and nothing
  threw. The count is now `total`. That does not prevent crossing — it makes the
  next one **fail loudly instead of silently**, which is the difference between
  a Sentry trace and squinting at a screenshot. The mechanism was never
  reproduced; what is certain is that it was invisible.
- **An implausible read is served but never cached, and is reported.**
  `looksLikeFilterOptions` rejects an all-digits entry where a name belongs. The
  five-minute memo is what turned that momentary fault into five minutes of
  wrong data on one instance, so a suspect read now skips the cache and calls
  `Sentry.captureMessage`. Serving it beats a 500 on the card browser; caching
  it does not.
- **`getFilterOptions` is memoised in-process for five minutes**
  (`CARD_POOL_TTL_MS`). It used to fire six concurrent queries on every
  card-browser load and exhausted the connection pool in production — see
  "Page speed". It is **one statement** now, a `union all` over a `kind`
  discriminator, so a memo miss costs one connection rather than six; the memo
  still earns its place, because a burst spins up cold instances that each pay
  it. Fold new filter lists into that statement rather than adding a query
  beside it. The values
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
  origin. Card art therefore costs us no bandwidth and no storage **on the
  pages**, which is the claim that matters for the browser and the cube views.
  There are now **two exceptions, and the second one is not small.** The
  share-preview images fetch the cover art server-side to embed it in the PNG;
  they're CDN-cached for a day for exactly that reason. The pack image
  (`pack.png`, see "Crack-A-Pack") fetches **every card in the pack** and
  composites them: roughly 290KB inbound for a preview and 920KB for a download,
  measured. It cannot be done in the browser — see that section for why — so it
  is the first feature where card art is genuinely our bandwidth, and the reason
  it requires an account.
- Card images render with a plain `<img>`, never `next/image`: optimizing through Vercel would proxy and cache them, which we are deliberately not doing yet — and would turn the line above from true into false.
- **`image_thumb` and `image_full` are the same URL on every row** — the source has no thumbnail rendition, so a grid of tiles was pulling a ~875KB PNG per card and a twelve-card draft pack came to roughly 10MB. Riot's CDN is Sanity and resizes on request, so `cardThumb`/`cardFull` in `src/lib/card-images.ts` append `?w=…&fm=webp`. This is still the source CDN serving its own asset, so it stays inside the no-proxy rule. It happens at render time rather than in the sync so it applies to rows already stored, and an unrecognised host passes through untouched.
- **`THUMB_WIDTH` is a source width, and must stay near 2× the rendered one.** Tiles render at 246 CSS px everywhere they appear, so it is 512: ~48KB, still roughly 18× lighter than the PNG. 320 was tried first and looked blurry — an undersized image on a 2× display reads as *unreadable card text*, not merely as a small picture, so trading further down the size is a false economy.
- **A card tile shows its name until the art covers it, and retries before giving up.** Art arrives over the network and a blank tile is indistinguishable from a bug — that confusion has been reported twice. `src/components/card-art.tsx` is the one implementation: the name underneath, the art painting over it, **two retries** with a short backoff, then the name for good. The first version failed permanently on the first `onError`, which assumed a failure meant a bad URL; in practice the URLs are fine and the failures are transient — one card came back blank in a draft pack while its image served a normal 200 throughout, and appeared once the pack came round and the tile re-rendered. Two details make it work and are easy to leave out. The attempt number rides in the `src` as a cache-buster, because re-assigning an identical `src` does not make a browser fetch again. And a `ref` checks `complete && !naturalWidth` on mount, because **an image that fails before hydration never fires `onError`** — the browser requested it from the server-rendered HTML and the event was over before React attached a listener. Without that check the retry never ran on the card browser's sixty-tile grid, which is where it matters most; with it, 20 forced failures all recovered.
- Rules text contains symbol tokens (`:rb_energy_1:`, `:rb_rune_fury:`). Never render `rules_text` raw — go through `parseRulesText` in `src/lib/rules-text.ts`, which resolves the tokens to badges and degrades unknown ones to readable words. Note the source names domain symbols `rune_*` but they are **Power** costs; runes are the resource cards you exhaust or recycle to produce Energy and Power.
- Printings: `cards.base_id` is the id of the **canonical printing** of a card, resolved from card data — not from the id string. Sets reprint cards in their high-numbered showcase slots, within a set (`SFD-049` → `SFD-224`) and across sets (`OGN-013` "Pouty Poro" → `UNL-220`), so no amount of suffix-stripping can group them. Identity is `(lower(name), type)`; see `assignBaseIds` in `src/lib/card-ids.ts` and the matching SQL in `drizzle/0003_base_id_print_groups.sql`, which must stay in step. Because identity is name-based, different cards sharing a collector number (`UNL-T01` "Baron Pit" vs `UNL-001` "Arena Kingpin") never group. `npm run check:printings` asserts all of this.
- **`base_id` is not what the card browser collapses on, because the source
  puts some treatments in the *name*.** 34 rows are spelled
  "Nine-Tailed Fox (Metal)", "Ahri, Alluring (Launch Exclusive)",
  "Dark Child (Starter)", "Teemo, Scout (GG EZ)", "Baron Nashor (Ultimate)".
  Identity being name-based, each became its own canonical printing and so
  survived the collapse — 31 phantom entries in a browser promising one row per
  card, which is how a search for "ahri" returned six cards for four. All 31
  groups were checked against the pool and agree on domains, energy, might,
  power cost and rules text: they are treatments, not cards.
  `collapseKey` in `src/db/queries/cards.ts` strips a **trailing** parenthetical
  and groups on that instead, mirrored by `nameWithoutTreatment` /
  `collapseIdentityKey` in `src/lib/card-ids.ts` so `check:printings` can assert
  Postgres and TypeScript agree on every row — the same two-definitions
  arrangement `assignBaseIds` has with `0003`. The mirror lives in `card-ids.ts`
  rather than beside the query because that module imports nothing, and
  `check:printings` runs without `--env-file-if-exists`. Trailing is the whole rule — `Recruit (271) //
  Buff` and `Sprite (274) // Buff` are four genuinely distinct cards carrying a
  parenthetical mid-name, and a looser match would merge cards the game keeps
  apart. `canonicalFirst` picks the representative: a plainly-named printing
  beats a treatment-named one, then the sequence `comparePrintings` uses. That
  first rule is load-bearing rather than cosmetic — Dark Child, Wuju Bladesman,
  Might of Demacia and Lady of Luminosity exist only as an OGS "(Starter)"
  printing and an OPP plain one, and OGS sorts first, so without it the
  collapsed row would be titled "Dark Child (Starter)".
- **The fix is in the two queries that collapse printings, and nowhere else.**
  Deliberately: `base_id` is stored and read by the printing picker, the
  contents switcher, the swap guard, the import catalog and the Draftmancer
  rarity resolution, so rewriting it is a migration plus a re-sync per
  environment. The cost of not doing that is recorded where it bites — the tile's
  printing badge stays partitioned by `base_id` so it agrees with what the
  picker will offer, which means those 31 cards undercount by one and their
  treatment printing is reachable only through "All printings". If the deeper
  unification is ever wanted, it is `cardIdentityKey` in `src/lib/card-ids.ts`,
  the recompute SQL in `scripts/sync-cards.ts` and a migration mirroring `0003`,
  all three in step, with `check:printings` asserting they agree.
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

- **Colour is a semantic token layer in `globals.css`, not Tailwind's zinc
  scale.** `--surface` / `--surface-raised` / `--surface-sunken`, `--line` /
  `--line-strong`, `--ink` / `--ink-muted` / `--ink-subtle` / `--ink-hover`,
  `--hover`, and the two accents below. `@theme inline` exposes them as
  `bg-surface`, `border-line`, `text-muted` and so on. **The whole set is
  redefined under `.dark`, so a component that uses tokens needs no `dark:`
  variant at all** — `bg-white text-zinc-900 dark:bg-zinc-950
  dark:text-zinc-100` is `bg-surface text-ink`. That is the point of it: the
  same button style had been copied into 36 files as 74 raw class strings, so
  every palette change was 74 edits and the variants had already drifted. A
  literal `zinc-`, `bg-white` or `text-white` in `src/` is now a bug unless it
  is a red destructive button or an overlay sitting on card art.
- **Ground is deliberately not pure black.** `#09090b` with flat hairline
  borders gave every panel the page's own colour, which reads as harsh and
  unfinished. Dark is `--surface: #101013` with `--surface-raised: #17171b` one
  step above it, and the chrome, panels, menus and empty states sit on the
  raised value. Fields sit on `--surface-sunken` so they read as wells.
- **`--tint-base` must track `--surface-raised`.** It is what the cube table's
  domain tints are mixed against, and that table sits on a raised panel — if
  the two drift, one mix percentage stops reading the same in both themes,
  which is the whole reason the variable exists.
- **There are two accents, because one value cannot do both jobs at AA.**
  `--accent` carries text (links, active labels) and is toned down on light,
  where the brand `#ff6a2b` is only 2.75:1; `--accent-strong` is the brand
  orange itself, for shapes needing 3:1 — the focus ring, the nav's
  current-page bar, the mark. On dark the brand orange is 6.65:1 and both can
  be near it.
- **The accent marks state, never decoration.** It is the "you are here" signal
  — active tab, active nav item, selected segment, focus ring, links — and
  primary buttons stay high-contrast neutral (`bg-ink text-surface`). A page
  with three orange buttons reads as three warnings. Warnings are amber and
  deliberately a different hue; do not reach for the accent for them.
- **Fields are floored at 16px below `sm`, in one rule in `globals.css`.** iOS
  Safari zooms the whole page in when you focus a control whose text is under
  16px, and every field here is `text-sm` (14px) or smaller — so tapping the
  edit panel's Add field jumped the viewport and tapping away left it zoomed.
  **The fix is the font size, never `maximum-scale=1` on the viewport**: that
  stops the zoom by disabling pinch-zoom, which takes the page below the 200%
  WCAG asks for and breaks it for anyone who needs to magnify. It is one global
  rule for the same reason `:focus-visible` is — `card-filter-bar.tsx` and
  `cube-contents.tsx` both hand-roll their own control classes, and the next
  field someone adds cannot forget it. `!important` is deliberate: a bare
  element selector loses to a Tailwind utility. Checkboxes and radios are
  excluded, and above `sm` the designed sizes apply again. Verified that the
  larger text does not overflow 320px on the editor, browse, a cube page,
  `/cards` or `/login` — the filter bar's controls are fixed-width, so bigger
  text there could push the page sideways rather than reflow.
- **One `:focus-visible` rule in `globals.css` covers the whole site.** Before
  it there were two `focus-visible` rules in total and eight fields setting
  `focus:outline-none` with only a border tint to replace it, so keyboard users
  had no reliable indicator. Defining it globally means it also reaches
  controls no component file touches. **Never add `focus:outline-none`
  again** without providing a replacement indicator in the same change.
- **One cursor rule in `globals.css` gives every button a pointer**, next to
  that focus rule and there for the same reason. **Tailwind v4's Preflight
  leaves `<button>` on the browser default of `cursor: default`; v3 set
  `pointer`**, so the upgrade changed it silently and nothing failed — half the
  site simply looked unclickable. Share, Clone, Follow, the view toggle, the
  account menu, the theme switch and **every card name in the list view**, 47
  controls on that page alone, sat on the arrow while the tab row beside them
  did not, because an `<a href>` gets `pointer` from the UA stylesheet and a
  `<button>` never does. Two controls that look and behave alike disagreeing
  about the cursor is the tell. The rule covers `button`, `[role="button"]`,
  `summary` and `select`, each `:not(:disabled)` so a dead control does not
  invite the click — verified: a disabled button still reads `default`, which is
  why the card browser's Clear button correctly does. **Do not add
  `cursor-pointer` to a button again**; before this there were seven of them
  across six files, each added when someone noticed one control, and every new
  button needed noticing again. The three left are on `<label>`, which is not in
  the selector and gets no pointer from the browser either.
- **Shared class strings live in `src/lib/ui.ts`** — `btn`, `input`, `panel`,
  `tab`, `segment`, `cardTab`, `underlineTab`, `badge`, `menu`, `link`. Strings
  rather than components, in a plain `.ts` with no `"use client"`, so both
  server and client components can import them (the same rule under
  Conventions about shared *values* living in `src/lib/`) and so call sites
  stay free to add a layout class. **A new button or field takes one of these
  rather than a fresh class string** — that is the entire reason the file
  exists. `scripts/check-public-cube.mts` imports `btn.primarySm` to assert
  which action is prominent, so the check can never drift from the styling.
- **Type is Inter for body, Space Grotesk for headings and the wordmark**, both
  self-hosted through `next/font/google` — no external request, no layout
  shift, no dependency. `globals.css` applies the display face to `h1, h2, h3`
  in one rule, so the site's ~40 headings cannot drift apart and no heading
  needs its own `tracking-tight`. Inter carries the dense card tables on
  purpose: character at 12–14px is noise. Geist Mono stays for the error
  digest, the cube URL on Settings and `.primer code`.
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
  **Chrome clamps `--window-size` to 512px, so that screenshot cannot be taken
  with the flag alone**, and framing the site to get a narrow viewport is
  blocked by our own `frame-ancestors 'none'`. Drive
  `Emulation.setDeviceMetricsOverride` over CDP against a headless Chrome on
  :9222 — the same WebSocket approach `check-auth-flow.mts` uses — and assert
  `scrollWidth === clientWidth` rather than eyeballing it.
- **The nav's section links carry a current-page indicator**, which is why
  `src/app/nav-links.tsx` is a client component in an otherwise server-rendered
  layout: the active section is a function of the URL and only `usePathname`
  reports it without threading a pathname through middleware into a header.
  The indicator is an `::after` bar rather than a border so it adds nothing to
  the link's box and the nav's height cannot shift between pages.
- **The brand mark lives in `src/components/logo.tsx`, and there are two of
  them.** Every surface that shows the logo — nav, landing page, 404 —
  renders that component, so the artwork changes in one place;
  the *size* picks the file. `lg` (64px) gets `public/logo.svg`, the detailed
  mark with dashed rear edges, five floating cards and sparkles. `sm`/`md`
  (26–30px, the nav) get `public/logo-mark.svg`: the cube silhouette and its
  spokes, nothing else.
  **The reason is arithmetic, and it is worth not rediscovering.** Stroke width
  on an SVG scales with the viewBox. `logo.svg` is 320×300, so its original
  1.2–2px strokes rendered at 26px came to about **0.15 CSS pixels** — under
  what a display can paint, which is why the cube's edges greyed out and
  shimmered rather than reading as lines. That was reported as the icon
  "losing definition". `logo-mark.svg` is 64×64 with 3.75–5px strokes, and
  `logo.svg` was itself redrawn at roughly 3.5× its old weights so it holds at
  64px too — it had the same fault there, just less visibly. **If either mark
  is ever rendered at a new size, check the stroke arithmetic before assuming
  it reads.** `src/app/icon.svg` is a third simplification for the favicon and
  is kept in step by colour and shape, not by sharing a file.
  All of them are served as `<img>` rather than inlined: the files carry fixed
  `id`s, and a page showing the logo twice would duplicate them. Width and
  height are both set so the header does not jump while they load.
- **A username is a link.** `/u/{username}` lists that account's public cubes
  with a search box, and `/profile` redirects to your own — one page, one
  address, and the account-menu item works without knowing your name. It shows
  public cubes only even to their owner, because a profile is what other people
  see; your private and unlisted ones live on `/cubes`, which says so. It exists
  because Explore puts a username on every row and the cube URL carries one, so
  both were link-shaped dead ends. `/settings` is the account page beside it —
sign-in methods, and nothing else yet; see "Sign-in methods".
- `not-found.tsx` covers unknown URLs *and* every `notFound()` call, so a
  private cube and a cube that never existed look identical — the 404 must not
  become a way to test whether a cube id is real. `error.tsx` leads with "Try
  again", since most failures are a dropped request, and shows the digest
  because it is the only handle tying what someone saw to a line in the logs.

## Cubes

- **Both cube pages have the same five tabs, always all of them**, defined once
  in `src/lib/cube-tabs.ts`: **Mainboard · Maybeboard · Primer · Analytics ·
  Change log**. Nothing is hidden and nothing depends on who is looking, so the
  row is a constant — it used to change shape from cube to cube, with Primer
  third on one and absent on the next, because the public page hid empty tabs
  and the editor did not. Each tab carries its own empty state instead, which
  every one of them needed anyway. Editing is not a tab: it lives in the action
  bar above the list, which is what keeps the row identical for owners and
  visitors. The two pages keep their own query parameter — the editor is on
  `?mode=` because `browse` and `import` share it — so that module owns *which
  tabs exist and in what order*, and the pages own their URLs.
- **`browse` and `import` are modes, not tabs.** Nothing points at them from the
  tab row; they are reached from links inside the edit panel and by URL.
  **Both routes must keep working**: `check:cube-ownership` and
  `check:browse-grid` navigate straight to `?mode=browse`.
- **Tab links are built from `CUBE_TABS.map`, so `modeLink`/`tabLink` set `key`
  on the element they return.** Missing it is a React warning rather than a
  crash, and the way that surfaced is worth knowing: in dev it makes Next POST
  to `/__nextjs_original-stack-frames`, which `check:cube-ownership` then
  captures instead of the Add server action, and the check fails with
  "replay is not exercising the action". A key warning presenting as a
  replay failure is not a connection anyone makes twice.
- The editor has the same five tabs, all on `/edit` behind `?mode=`. Default
  (no param): the cube is the page, and **the edit panel opens on demand** — a
  prominent Edit button, then a right-hand drawer on desktop and a bottom sheet
  below `lg`. It used to hold a permanent 20rem column, which taxed every visit
  for a panel you only want while editing. `?mode=browse` swaps in the full
  filter/grid browser **in place of** the cube list; `?mode=maybeboard`,
  `?mode=primer`, `?mode=analytics` and `?mode=log` are the other four tabs, and
  `?mode=import` is the bulk importer. Browse mode is only rendered when active,
  so the unfiltered card query isn't paid for on every editor load.
- **There is no "Browse cards" tab, deliberately.** Browse is the heaviest read
  on the site, and leading with it is what turned a run of edits into a run of
  round trips. Its slot in the tab row is the Edit trigger; browse is still
  reachable from a link inside the panel and by URL, and **the route must keep
  working** — `check:cube-ownership` and `check:browse-grid` both navigate
  straight to `?mode=browse`, so removing the route (rather than the tab) fails
  the build.
- **Two Edit triggers, never both on screen.** One sits in the action bar above
  the list; a floating one takes over past 400px of scroll, which a 400-card
  cube passes immediately. Showing both at once would read as a bug, so the
  floating one is conditional rather than always present.
  **It opens on the board whose tab you are on** — editing from Maybeboard and
  defaulting to Mainboard would file cards into a section you are not looking at.
- **No pending count on the button and no count in the tab labels.** The staged
  list inside the panel already says what is pending. `check:copies-and-log`
  separately forbids `×N` anywhere in the editor's HTML.
- **Density is a native `<select>` reading "6 Cards Per Row"** (`CardsPerRowSelect`),
  not four visible chips and no longer a `<details>` menu labelled `Display`.
  Chips beside a two-way view toggle are most of a phone's width; the menu fixed
  that but hid the current value behind a click, and named a category rather
  than the setting. A select wears its answer on its face and hands keyboard,
  type-ahead, touch and the platform's own picker to the browser, in place of an
  effect listening for outside clicks and Escape. The option text is the whole
  sentence for the same reason a bare `6` was not enough. It is always plural
  because `CARDS_PER_ROW` starts at four — a one-card option would need the
  singular, and the union type flags the dead branch if you write it. **It is
  hidden below `sm`, where it does nothing**: every entry in `cardGrid` is
  `grid-cols-2` at that width, so it would offer four choices with one outcome.
  If a `cardGrid` entry ever differs below `sm`, that breakpoint moves with it.
  **Nothing collapses into a JS-only menu**, because `check:public-cube`
  requires `>Share<` and `>Clone<` in the served HTML — a select is in the
  served HTML, which the popover it replaced only barely was.
- **`selectSm` in `src/lib/ui.ts` is the token for a toolbar select**, added with
  that control because there was none and the codebase has seven selects. Not
  `inputSm`: that is `w-full`, and a toolbar select sizes to its widest option.
  `card-filter-bar.tsx` still carries an identical local `controlClass` because
  it styles `<summary>` elements with it too; adopting the token there is a
  tidy-up nobody has needed yet.
- **The trigger renders only on tabs that show cards.** The panel edits the card list,
  so on Primer or Change log it is a button that does nothing you came to that
  tab to do, and its remove picker reads the cube, which the maybeboard tab is
  not showing.
- **Nothing scrolls sideways.** An earlier pass put the tabs on a horizontally
  scrolling strip, which traded four stacked rows for a hidden-content gesture
  and was worse. The row is twelve controls fighting for one header, so the fix
  was subtraction — View, the Import tab, the Browse tab and every count — not
  layout. Five tabs wrap to two rows at 320px and one row from `sm` up.
- **The panel stages changes and writes them on Save**, which is both how people
  actually edit a cube and the fix for a real fault — the panel it replaces
  wrote once per click, so a run of edits was a run of round trips against a
  pool of six. **Escape hides the panel and keeps the batch**; only Discard All
  throws it away, and a `beforeunload` warns if you leave with one pending,
  because staged work lives only in that tab.
- **It has two type-aheads and only one of them touches the database.** Add
  searches the whole card pool through `quickSearchAction` (two round trips per
  debounced keystroke). Remove/Replace searches **the cube's own contents**,
  which the page has already loaded to render the list, so it is passed down as
  a prop and filtered client-side for **no query at all**. The remove picker
  lists **one entry per copy** — two copies of a printing are two entries, and
  staging one leaves the other — so the reader picks the exact copy and there is
  no "which one did it mean" heuristic to get wrong.
- **Both lists are dropdowns: empty until you type, floating over the panel, and
  closed by picking.** Absolute positioning is load-bearing — growing the
  document as you type moved the Remove field down the panel while you were
  reaching for it. And **visibility is a *dismissal* flag, not a focus one.**
  Gating on "is this field focused" fails closed: any path where React does not
  see the focus event leaves a filled box with no list under it and the control
  looks broken. That happened. Starting visible and closing on an explicit
  dismissal — blur, Escape, or picking — fails open instead, which at worst
  shows a list a moment longer than it needs to.
- **The type-ahead searches the name a person types, not only the one we
  store.** A legend keeps just its title (`Eye of Twilight`, champion `Shen`),
  so "Shen, Eye of Twilight" matched nothing while the card sat there — no
  legend could be found by its full spelling, with or without Specify versions.
  `quickSearchCards` now also matches the rebuilt `champion, name`, guarded the
  way `withChampionPrefix` is so a champion *unit* does not become
  "Shen, Shen, Kinkou". This is the rule `aliasesFor` already applied to
  imports, so the two add paths finally agree; **`champion` is in
  `browseColumns` for it**, unlike `keywords`, because two things now read it.
- **A printing is labelled by its card id, not set + collector number.** An alt
  art shares a collector number with the printing it varies — `VEN-138` and
  `VEN-138a` are both 138 — so the obvious label renders them as two identical
  rows, which is precisely what Specify versions exists to tell apart. The id
  already *is* set-collector plus the variant suffix, so it reads the same and
  is unique.
  **The card detail modal follows the same rule**, and did not used to: it
  rendered `SET · #number · rarity`, which is identical for 170 rows across 85
  pairs — every alt art, every signature print, and the base printing each one
  varies. Opening `SFD-227` and then `SFD-227-star`, whose art differs only by a
  signature, showed the same picture under the same words and read as a bug.
  It now shows the id, the rarity and `printingTreatment` from
  `src/lib/card-ids.ts`, which puts the variant in words — "Signature",
  "Alt art", or the name's own parenthetical ("Metal", "Launch Exclusive").
  That helper is **descriptive only**; no grouping decision reads it.
- **Hovering a suggestion floats the card art**, through the same
  `useCardPreview` / `CardHoverPreview` pair the text view uses. It is `fixed`,
  so the drawer's own overflow cannot clip it, and it is why `HeldCard` carries
  `type`, `imageThumb` and `imageFull` — `type` decides portrait against
  landscape. Note React synthesises `onMouseEnter` from `mouseover`, so a test
  that dispatches a native `mouseenter` will never reach it; dispatch
  `mousemove`.
- **Picking a suggestion fills the box; the button commits it.** Nothing is
  staged by clicking a row. **Add takes only the card above it** and leaves
  whatever sits in Remove alone; **Remove/Replace is a swap when both are
  filled** and a plain removal when only it is. That asymmetry is the point:
  queueing a replacement should not force you to go through with it.
- **The Board control is Mainboard or Maybeboard, and Mainboard is not a
  section.** It means "file this the way the cube files things", so
  `sectionForBoard` sends a Legend to `legends` and a Rune to `runes` via the
  existing `defaultSectionForType`. That is what lets a two-board control sit
  over six sections; the staged row shows the section it resolved to, so it
  never says one thing and does another.
- **"Specify versions" is the printing picker.** Off, suggestions are one entry
  per card (the `base_id` grouping); on, every printing is its own suggestion.
  That is why the type-ahead no longer prefetches printings — the checkbox
  *is* the mechanism, so there is nothing to lazy-load.
- **The Edit trigger must never render `×N`.** `check:copies-and-log` asserts the
  editor's HTML carries no ×N notation and the trigger renders server-side, so
  the staged count reads `Edit (3)`.
- The cube list renders in two views: `visual` (image tiles) and `text`
  (`src/components/cube-table.tsx`). The text view reads domain → type → cost:
  a column per domain, split into Units / Gear / Spells inside the main section
  only, then cost groups with counts. Champion Units are `type = 'Unit'` and
  Signature Spells are `type = 'Spell'`, so they land in the right subgroup for
  free; an unrecognized type gets its own subgroup at the end rather than being
  dropped.
- **The type subgroup header is a filled band, and it has to outrank the cost
  header under it.** At `text-subtle`/`font-medium` the two were the same size
  and near the same weight, so "Units (4)" read as a peer of the "2 (1)" inside
  each cost cell rather than as the thing containing it — the hierarchy was
  inverted, and the view is meant to be scanned. It is now uppercase, semibold,
  `text-ink`, on `bg-ink/12`. One class covers both themes because `--ink` flips
  with the theme: a pale grey wash on white, a faint lift on black. **The band
  is neutral, never the column's domain colour** — the domain is already what
  tints every cost cell beneath it, and repeating it in the header is a dozen
  coloured bands down one page. Cube Cobra's list scans for the same reason, but
  it also boxes each group; that was tried and rejected here, because the cost
  cells are already bordered and it nests a border inside a border for about
  four extra pixels of height per group on a page that can run to 500 cards.
- **Columns wrap; they never shrink to fit and never scroll
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
- **A cube's visual view is image only** — no caption strip, no controls under
  the tile. The art carries the name, cost and domain in a form people read
  faster than a caption, and dropping it is what lets ten fit on a row and stay
  legible. Per-copy controls live in the card detail modal one click away, which
  is why `CubeSections` no longer takes a `copyAction`. `CardTile`'s `bare` prop
  does this; the card browser and browse grid keep their captions, because there
  you are scanning for a name you have not found yet.
- **The list view's power indicator sits hard against the right edge** and is
  the last thing in the row (`gap-0.5 pl-1.5 pr-0.5`, measured at 2px of
  clearance, with the name taking ~81% of the row). A hover-revealed `×` used
  to follow it, and **an `opacity-0` control still holds its width** — so it
  cost about sixteen pixels of name on every row to show something that was
  invisible most of the time, in the view whose entire job is showing names.
  Removing a copy is a click on the card and **"Remove this copy"** in the panel
  that opens, which is where the section and printing controls already live.
  That is why `CubeSections` and `CubeTable` no longer take `onRemoveOne` or
  `busyKey`.
- **A text-view row shows its power cost as a count plus one domain dot**
  (`PowerCost` in `src/components/card-visuals.tsx`), right-aligned after the
  name. Power was invisible in both cube views before — it rendered only in the
  card detail modal — so judging a cube's colour commitment cost a hover per
  card, on the view whose whole point is scanning the cube at once. It is a
  *count*, not `PowerPips`' dot-per-pip: a row has about 19px to spare beside a
  name that already truncates, and a run of pips grows with the cost and would
  need an arbitrary cap, where a digit is constant width at any cost. The cell
  header above already states the energy, so the row does not repeat it.
  **The indicator carries no `title`** — a tooltip there lands on top of the
  hover preview the same gesture opens, which is why the card name lost its own
  `title`; an `aria-label` says the same words without drawing anything. Grouping
  and sorting are untouched: cells still bucket on `energyCost`, so a
  power-cost-only card still sits under `—` and shows its pips there.
- **A multi-domain card's power dot takes the card's own domains**, the same
  hard-banded split `domainDot` draws in the column header above it. Every
  source reports power as one integer and cannot say which domain the pips
  belong to, so `buildPowerCost` stores that case as `{"any": n}` rather than
  inventing a split. Showing the card's domains claims no more than the header
  already does — the pips certainly belong to those domains — and it beat the
  first version, a hollow ring, which read as an empty gap at 10px. A *named*
  domain in `power_cost` still wins over the fallback, so a source that ever
  provides per-domain pips needs no change here. Fixing the underlying
  imprecision needs that source, not a schema or display change; the raw stats
  are kept in `cards.data` for exactly that. `totalPips` in
  `src/lib/riftbound.ts` is the one definition of "how much power", shared by
  this indicator and by `displayCost`.
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
  above the editor's Edit button; both are bottom-right, and stacking
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
- **The visual view's density is a cookie and never a URL param**, which is the
  opposite of `?view=` and for a reason worth keeping straight. The view toggle
  selects what the *server* renders, so it belongs in a link. The column count
  is only a CSS class on a list the server has already sent, so a param would
  spend a round trip on a dynamic route to change a class. `cubebound.cards-per-row`
  holds 4, 6, 8 or 10 — the select offers exactly those, so its option list and
  this cookie's valid values are the same array; the server reads it into the props and
  `CardsPerRowProvider` holds it as client state so a click re-lays-out on its
  own frame. Same versioning rule as `…-view2` applies if the default ever moves.
- **The grid classes live in `cardGrid` in `src/lib/ui.ts`, and every one is a
  source literal.** Tailwind scans source text, so a computed
  `grid-cols-${n}` emits no CSS at all and the grid silently collapses to one
  column — hence a map rather than a function. `CARD_GRID_CLASS` is just
  `cardGrid.auto`, so the card browser and the editor's browse grid keep the
  responsive default and are untouched by the density control, which reads
  context and is `undefined` outside a provider.
- **Below five columns a tile asks for the 744px source, not the 512px one.**
  `THUMB_WIDTH` is 512 because tiles normally render near 246 CSS px and the
  rule is that the source stays near 2x the rendered size; a four-column grid in
  the 1600px container puts them at roughly 380px, where 512 is 1.35x and reads
  as blurred card text on a 2x display. That is the same failure that made 320
  unusable. It is the source the card detail modal already uses, so it is
  usually cached rather than newly fetched.
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
- **A cube edit made in the panel is staged, and `saveCubeEditsAction` writes a
  whole session at once.** One entry per card change still lands in the log,
  using the existing kinds — the batching is how the writes happen, not how they
  are recorded, so history stays as granular as it is for single edits and
  `change-log.tsx` needed no change. Order is **removes, then replaces, then
  adds**: a remove must not consume a copy the same batch just added, and
  replaces go before adds because `moveOneCopy` decrements the source before
  merging with `least(99, …)`, so at the cap it silently drops a copy — better
  an added one than an existing one. Removes are one statement
  (`removeCubeCardCopies`) and adds are one upsert; the replace loop is a
  knowing exception to the fan-out rule, because each is a distinct
  (from, to, section) triple and a batch carries a handful at most.
  **A replace is only a `printing_switched` when both sides share a `base_id`** —
  the same rule `swapPrintingAction` applies one edit at a time — and otherwise
  logs as a removal plus an addition, because that is what it is.
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
- **Every owner-only route puts its ownership check in a `layout.tsx`, never
  only in the page.** `/edit` and `/settings` each have one beside the page, and
  they exist for the status, not the body. A `notFound()` in a page under a
  `loading.tsx` lands after Next has flushed the shell and committed HTTP 200, so
  it swaps in the 404 UI and leaves a **soft 404** — a page crawlers index as
  real. The page keeps its own identical check, which is what narrows `cube` for
  the rest of the file; deleting that breaks the types, not the status.
  **This showed only on a *public* cube**, which is how it survived: on a private
  one the `[slug]` layout refuses first, above every boundary, so the status was
  right for the wrong reason, and `check:public-cube` asserted exactly that case.
  It now asserts `/edit` and `/settings` 404 for a stranger and a signed-out
  visitor **while the cube is still public**. Three routes have been bitten by
  this now — the cube layout, the profile layout, and these two — so the rule is
  the check goes in the layout.
- **`settings/page.tsx` reads through `loadCube`/`loadViewer`**, not
  `getCubeByOwnerAndSlug`/`getCurrentUser` directly. It was the one cube route
  still on the raw queries, which was invisible until it gained a layout that
  asks the same two questions — `cache()` makes those one query each instead of
  two.
- **The owner never sees the public page — it redirects them to `/edit`.** The
  editor is the same five tabs plus the ability to change something, so landing
  there signed in as the owner only ever meant a trip through an Edit button.
  The entry points also disagreed about it: `/cubes` linked to `/edit` while
  Explore, profiles and search linked to the public path, so the same cube
  opened two different ways depending on where you clicked it. One redirect
  settles every entry point at once — shared links and bookmarks included —
  instead of teaching each link who owns what.
- **That redirect lives in `(public)/layout.tsx`, and both halves of that are
  load-bearing.** It has to be a *layout* for the same reason `notFound()` is
  one segment up: Next flushes the `loading.tsx` shell as soon as it can, which
  commits HTTP 200, so a `redirect()` in the page degrades into a client-side
  hop — the visitor's skeleton flashes and a crawler is told the page is fine.
  Putting it in the page reproduced exactly that, measured as a 200 with no
  `Location`. It has to be in a **route group** because the `[slug]` layout also
  wraps `/edit`, and redirecting there would loop. `check:public-cube` asserts a
  real 307 rather than just a redirect, so the degraded form cannot come back.
  `loading.tsx` moved into the group with the page, so `settings/` and `draft/`
  got their own copies — every dynamic route needs one, see `skeleton.tsx`.
- **The tab does not survive that redirect.** Layouts are not given
  `searchParams`, so an owner opening a shared `?tab=analytics` link arrives on
  the editor's Mainboard. Reading the query string would mean threading it
  through middleware, which is a lot of machinery for a link an owner rarely
  follows to their own cube.
- **`opengraph-image.tsx` stays at the `[slug]` segment, outside the group**, and
  the page therefore names it in `openGraph.images` by hand rather than relying
  on Next pairing a co-located file. Inside the group Next appends a
  group-derived suffix to the generated route (`/opengraph-image-7gn1ej`), which
  changes a URL scrapers have already cached *and* stops `middleware.ts`
  recognising a preview route by its `/opengraph-image` ending — that is the
  query-stripping redirect keeping the most expensive unauthenticated route on
  one CDN entry. `check:share-previews` asserts the advertised `og:image` and the
  directly-fetched one are the same bytes, which is what caught this.
- **What the owner used to get only on the public page now lives in the editor**:
  the follower count in the header byline, the per-section breakdown under it,
  and the hidden-by-a-moderator notice. Without the move the redirect would have
  silently taken all three away — the follower count has no other home on the
  site, and a hidden cube would look like a broken one. The admin moderation
  panel is on both, so an admin who owns a cube can still reach it.
- **There is no "View" button on the editor.** It went to the public page to
  show the same list read-only, and now that Analytics and the change log are on
  the editor too there is nothing over there an owner needs. The consequence to
  know: an owner has no preview of how the cube looks to a visitor, and with the
  redirect above there is no route to one at all — signing out or opening a
  private window is the answer. Share already states who can open the link,
  which is the question that was actually being asked.
- **The change log is public.** It records card names, dates and actor usernames
  on a cube that is already public, so nothing new is disclosed, and seeing how
  a cube has evolved is a reason to follow it.
- The public page has one audience, so **Clone is unconditionally its primary
  action** (filled) and Follow is unconditional beside it. Both used to be
  owner-aware, which the redirect made dead code there.
- **Clone is on the editor too, as the quiet button.** Forking your own cube —
  a variant to try without touching the original — is a real thing to want, and
  with the public page redirecting its owner away the editor is the only place
  left to ask for it. It is never the main action on a cube you already own, so
  it takes `prominent={false}`; `check:public-cube` asserts both that it is
  there and that it is *not* wearing `btn.primarySm`. The action lands on the
  copy's editor, which is also what makes a double-click harmless.
- **The editor's header controls are all `btn.secondarySm`.** Draft and Settings
  were hand-written `py-1.5` strings that came out 34px against Share's 36, so
  the row was already a little ragged before Clone arrived and made it obvious.
  Measured over CDP: Share, Draft, Clone and Settings are 36px each.
- **Share** sits on both the public page and
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
- **Every indexable route declares a canonical, and it is always the bare
  path.** Each one has query-string variants serving the same content — `?view=`
  and `?tab=` on a cube, the whole filter surface on `/cards`, `?q=`/`?sort=`/
  `?page=` on `/explore`, and the `?code=…` auth near-miss on `/`. Without a
  canonical each variant is a separate URL competing with the others, and on a
  site this size the signal is thin enough already. Nothing is lost by
  consolidating: every page worth crawling is in the sitemap. Canonicals resolve
  against the per-request `metadataBase`, so a preview deployment self-references
  rather than claiming to be production. **A private cube returns before this**,
  from the same early exit that keeps its name out of a link preview, so the
  canonical cannot confirm a guessed slug either.
- **A cube's `<title>` names the game, not just the cube** — `"<name> —
  Riftbound cube by <owner>"`. A cube's own name carries none of the words
  anyone searches, which is the same reason the homepage stopped being the bare
  brand. Its `<meta name="description">` is the owner's own description passed
  through `metaDescription`: free text written for the page, so whitespace is
  collapsed and it is clipped at the last whole word inside 155 characters
  rather than cut mid-word by the search engine.
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
  code.** Its cookie list is the sign-in cookies plus `THEME_COOKIE`,
  `CUBE_VIEW_COOKIE`, `CARDS_PER_ROW_COOKIE` and `BACKUP_NOTICE_COOKIE`, and the
  page states the count in prose ("we set five
  kinds of cookie"), so **adding one is a two-line edit there, in the same
  commit**; "analytics"
  is the Vercel Analytics component in the root layout; and it says plainly that
  account deletion is not yet self-serve, because promising a button that does
  not exist is the one genuinely dishonest thing that page could do — though it
  then says deletion "is being built", which is a promise with a clock on it.
  **When account deletion ships, that section and the "Your data" paragraph on
  `/settings`, which repeats the claim, are part of the same change.**
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
A is done**: configuration chosen per draft, dumb bots, pool-only result. B makes
the bots smart; C adds the deck builder.

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
  Defaults are 8 seats, 3 packs, 12 cards, 1 either-slot — the either-slot
  matching the Legend-or-Battlefield slot Riot's boosters guarantee from Legacy
  (Set 6, January 2027) onward. **Pack size deliberately does not track a retail
  pack's card count**: rarity, rune and insert slots have no cube equivalent, so
  only the Legend-or-Battlefield structure is matched. Do not "correct" 12 to a
  printed pack size.
  Bounds live in `DRAFT_LIMITS` and are enforced by `validateDraftConfig` **on
  the server** — the config arrives from a browser, so `readDraftConfig` rebuilds
  it field by field rather than spreading it, which also stops a caller
  smuggling in `passDirections` and pinning the passing order.
  **Seats run 2 to 16, and the ceiling is a sanity bound rather than a product
  opinion.** It was 8, which was the standard draft pod size mistaken for a
  limit: nothing in the engine cares how many seats there are, and for an export
  `seats` never reaches the file at all, so the old cap meant a twelve-person pod
  could not even be checked for. A cube too small for the seats asked for still
  blocks, with the real numbers. `check:draft` asserts both ends of the range, so
  moving it again is a two-file change.
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
- **The pack template reserves one Legend-or-Battlefield**, chosen 50/50 per
  pack, with the other eleven cards from the cube's main section — the same
  guaranteed slot Riot's boosters carry from Legacy (Set 6) onward. Legends and
  battlefields are a deck's *identity* rather than its body — you play one
  legend and a handful of battlefields — so dealing them from the main pool
  would both flood packs with cards nobody can use twice and starve drafters of
  the one card that fixes their domains. A guaranteed slot gives every seat
  three shots at each.
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
  Sign-in is still required *for the bots*, because that draft is persisted to
  survive a refresh and a row has to belong to someone.
  `requireDraftableCube` gates starting, `requireOwnDraft` gates picking and
  saving: a public cube does not make someone else's draft yours to pick in.
- **The draft screen renders signed out, and the Draftmancer tab works there.**
  Only the bots tab asks for an account, and it says so in place of the button
  rather than replacing the screen — so the export beside it stays usable. The
  whole screen used to be a single sign-in prompt, which hid the tab that
  *leads* behind an account and put a magic-link email in front of anyone sent
  a cube to go draft. That reaches past the UI: sign-in email is metered and
  capped upstream of us (see "Security posture"), so the cheapest way to
  protect it is not to need it. Nothing about the download itself changed —
  `draftmancer.txt` never read a session, only `canUseCube` with a
  possibly-absent viewer — the page simply stopped hiding it. The header's
  "Your drafts" link is hidden signed out, being a link to a sign-in prompt.
  `StartDraft` takes `signedIn` and decides what to *offer*; the server action
  refuses a signed-out caller either way, as always.
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
- **The settings screen is three tabs over one form, and the Draftmancer export
  is the one that opens.** Drafting against bots, exporting to Draftmancer and
  drawing a pack as an image all start from the same question — what goes in a
  pack — so `DraftSettings` renders once above all three and only the action
  differs. See "Exports" and "Crack-A-Pack". `mode` changes what the fields
  *say*, except on the pack tab, where Players and Packs each are hidden
  outright: a single pack has no seats and no rounds, so they are not merely
  worded differently there, they are meaningless.
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

## Exports

Two different things are called "export" and they are not interchangeable.
`src/lib/deck-export.ts` turns a **finished draft's deck** into a text decklist
for Piltover Archive (see "Draft"). `src/lib/draftmancer-export.ts` turns a
**whole cube** into a Draftmancer Custom Card List so other people can draft it.

- **Why Draftmancer at all.** Our own drafting is one person against
  deliberately dumb bots, and multiplayer lobbies are item 4 of phase 2 —
  a websocket server we have not written. Draftmancer already runs multiplayer
  drafts in a browser, and its **custom card** support lets it run a game it has
  never heard of: `[CustomCards]` defines cards by name, type and image URL, and
  the sheets below reference them. Cubecana runs Lorcana cubes through it the
  same way. So the export substitutes for the expensive feature.
- **Exporting needs no account.** The route has always been `canUseCube` with
  whatever viewer there was, signed out included; the draft screen now renders
  signed out too, so the tab is actually reachable — see "Draft". A cube you
  send someone should not cost them a sign-in email before they can draft it.
- **The file is four parts in a fixed order** — `[CustomCards]`, `[Settings]`,
  then one bare-headed sheet per section (`[Main]`, `[Legends]`,
  `[Battlefields]`). Counts live in the layout rather than in `[Name(N)]`
  headers, which is how Draftmancer's own multi-layout example writes them.
  **Runes, sideboard and maybeboard are not exported**, for the same reasons the
  engine does not deal them.
- **The pack template is ours; the session is Draftmancer's.** Composition comes
  from the cube's own `DraftConfig` — the same object the solo draft screen
  produces and `validateDraftConfig` polices — so the two ways of drafting a
  cube cannot drift into meaning different things. What we deliberately do not
  own is the session: `boostersPerPlayer` is written as a **default** the host
  may override, and `seats` is used only to size the "is this cube big enough"
  warnings and is never written to the file. Baking in eight seats becomes a lie
  the moment six people turn up. The route reads the config from its **query
  string** through `readDraftConfig` and rejects an incoherent one with a 400
  carrying the validator's own message, so a config that could never work cannot
  produce a file that fails on upload instead.
- **The either-slot is a weighted slot, not a mixed sheet.** A slot may name
  several sheets with weights, picking a sheet before it picks a card:
  `{ "name": "LegendOrBattlefield", "count": 1, "sheets": [{"name":"Legends","weight":1},
  {"name":"Battlefields","weight":1}] }`. One combined sheet was the first
  version and it was subtly wrong — it draws in proportion to what the cube
  holds, which on the dev cube is 26 legends against 56 battlefields, about 68%
  battlefield, where the engine chooses the type 50/50 per slot. Reserved
  legend and battlefield slots are ordinary slots against their own sheets, and
  a shuffled type has no slot and no sheet because it is part of the main pile.
- **A weighted sheet has no fallback, so each one has to cover its own share
  with headroom.** Picking the sheet first is what makes this bite: a slot that
  has chosen Legends cannot spend a battlefield, and if that sheet is empty
  Draftmancer fails the whole booster generation with "Make sure there are
  enough cards in the list", naming no sheet. **Our engine does the opposite** —
  `generatePacks` takes the other type, then main, and only warns — so the same
  cube genuinely drafts here and refuses to start there. The panel and
  `draftmancerPlan` both used to check legends *plus* battlefields against the
  slot total, which is the wrong quantity and reads healthy on cubes Draftmancer
  rejects outright.
  **And the share is a mean, not a bound.** Draws across a draft are binomial,
  so a sheet holding exactly half the slot count generates about half the time,
  and because Draftmancer retries, that surfaces as "it errored twice and then
  worked" rather than as a clean refusal. Measured against draftmancer.com by
  hand: 96 either-slots against 48 legends generated on roughly one attempt in
  two, 24 against 12 did the same, 24 legends against 96 slots never generated
  in many attempts, and 60 against 96 worked first try. `draftmancerSheetNeeded`
  in `src/lib/draft/config.ts` is the one definition — dedicated slots, which are
  deterministic, plus `mean + 2.33 sd` of the weighted draw, which is about 99%
  per attempt and is what puts 96 slots at 60 rather than 48. It lives beside the
  pool math rather than in the exporter because the settings panel shows it and
  the file's own warnings use it, and those two must not disagree. `check:draftmancer`
  asserts it against every one of those hand-run sessions, since nothing in CI
  can talk to Draftmancer.
  **This is reachable from the defaults.** One either-slot at 8 players and 3
  packs is 24 draws, so each section wants about 18; a cube with 14 legends is
  intermittent, and before this it reported "needs 24, 70 spare" and looked fine.
- **A slot may never name a sheet that was not emitted, and no sheet may be
  empty** — either one is a file that errors. A reserved type the cube has none
  of gives its slots back to main and says so, which is the same "fall back and
  warn" the engine does for a short reserved section; an either-slot with only
  one type available narrows to that type and says so too. `check:draftmancer`
  asserts the slots and sheets agree across four different configs.
- **Grouping is by section, not by card type**, matching `getDraftPools` and so
  matching the counts `DraftSettings` shows as "(26 in this cube)". The engine
  layers a type-beats-section rule on top of those pools inside `buildMainPool`;
  reimplementing half of it here would let the panel and the file disagree about
  how big a section is, which is worse than the rare stray legend filed under
  main that it would catch.
- **Everything that affects how the cube drafts is written explicitly**, so a
  change to Draftmancer's defaults cannot quietly alter what a cube plays like.
  `colorBalance` **off** — it defaults on and would balance the largest slot
  against a `colors` field we deliberately never emit; `withReplacement` **off**,
  matching our own rule that a card held twice appears in at most two packs;
  `refillWhenEmpty` **off**, so a cube too small fails loudly rather than
  silently dealing the same cards again; `duplicateProtection` **on**.
- **Sheet lines reference cards by name, so names must be unique — and a
  duplicate does not error.** Draftmancer binds both lines to whichever entry it
  read last, and the cube drafts with one card missing and another doubled,
  invisibly. `uniqueNames` appends the printing id when two collide and the
  panel says it did. This is why the export **keeps** promo variant suffixes
  where `deckListName` strips them: stripping `(Metal)` is right for a text
  decklist another builder has to match, and here it would manufacture exactly
  that collision. The champion-rebuilding half of the rule *is* shared —
  `withChampionPrefix` — because a legend stores only its title either way.
- **Domains are deliberately not mapped to MTG colors.** Draftmancer's `colors`
  takes W/U/B/R/G and Riftbound has six domains; five slots do not hold six, and
  choosing one to drop would be the silent guess `import-list.ts` refuses to
  make about names. They ride in `subtypes`, where they show on the type line.
  The cost is that Draftmancer's bots have no colour signal, which is what
  `rating` is for.
- **`rarity` is a closed set, and Draftmancer rejects the entire file over
  it.** `Invalid mandatory property 'rarity' in custom card, must be one of
  [common, uncommon, rare, mythic, special]`. **Its published format
  documentation says the field is optional and lists no allowed values, and is
  wrong on both counts** — write against the validator, not the docs, and
  confirm by actually uploading. Riftbound's vocabulary is not accepted, so
  Common/Uncommon/Rare map across and **Epic becomes `mythic`**, the top of our
  scale onto the top of theirs. `DraftmancerRarity` is a union type so an
  unmapped value is a compile error rather than an upload failure, and
  `check:draftmancer` asserts every emitted value is in the set.
- **`rating` is derived from that same resolution, and it is a deliberate
  exception.** "Rarity plays no part in pack construction" still holds for
  *dealing packs*. This is bot pick order: Draftmancer's bots have never seen a
  Riftbound card and have no colour to read either, so an unrated pool makes
  them pick at random. Printed rarity is a weak proxy, but it is the only signal
  we have until pick data exists. One function resolves the tier and both the
  rarity and the rating come from it, so the two cannot disagree.
  **Showcase and Promo are printing treatments, not power tiers**, so the
  resolution looks through `base_id` to the canonical printing — all 120
  showcase rows resolve that way (70 Rare, 42 Epic). Promo mostly does not (73
  of 117 are their own base) and lands on `special`, rated a neutral **2, never
  0**: zero is the bottom of the scale rather than an absence, and 339 Promo
  rows sit in real cubes, so bots would take every one of them last. A real
  export of the 426-card dev cube comes out 123 rare, 119 uncommon, 82 common,
  80 mythic, 22 special.
- **Costless is an empty `mana_cost`, not `{0}`** — legends, runes and
  battlefields have no energy cost at all, the same distinction that keeps them
  off the analytics curve instead of bucketing them at zero. Power cost and
  might have no MTG equivalent and go in `oracle_text`, which is also where the
  source's HTML-escaped `&gt;` separator has to be decoded: on our own pages
  that text goes into JSX, but here it lands in a plain-text field Draftmancer
  shows verbatim.
- **It is a route handler, and route handlers do not run the layout above
  them.** `cube/[username]/[slug]/layout.tsx` gates the pages; the export
  repeats the check itself or it has none. It uses **`canUseCube`, not
  `canViewCube`** — taking a cube away to draft elsewhere is *using* it, like
  cloning and drafting, so a hidden cube or a suspended owner's cube must not
  export even for its own owner. Verified: suspended and hidden both 404,
  unlisted works, and a cube that does not exist is indistinguishable from one
  that is private.
- **Both export routes read that gate from one place**,
  `cube/[username]/[slug]/export-request.ts`: the access check and the pack
  template it validates were duplicated in `draftmancer.txt` and `pack.png`,
  and a visibility rule kept in two copies is one that eventually disagrees
  with itself. The helper answers with either the resolved request or the
  `Response` to send instead, so a caller that skips the failure branch has no
  cube to read.
- **The export lives on the draft screen, as one of three tabs over one settings
  form, and it is the one that opens.** `/cube/{username}/{slug}/draft?new=1`
  leads with **Export to Draftmancer**, then **Draft against bots**, then
  **Crack-A-Pack**; `DraftSettings` renders once above them and each tab carries
  only its own action. The row wraps below `sm` rather than scrolling sideways,
  which is the rule the cube page's tabs already follow. Drafting a cube with other people is the thing people want, and
  our own bots are deliberately dumb — whichever tab leads should also be the
  default, or the highlighted tab is the second one. They differ in *where* the
  draft happens, not in what a legend slot is, so configuring the pack template
  twice would have meant two copies of that form and eventually two answers. It
  is deliberately not on the cube page: "Draft" is already the verb that leads
  here.
- **`seats` is not written to the file, and `packsPerPlayer` is.** Players sizes
  the "is this cube big enough" arithmetic and nothing else; packs becomes
  `boostersPerPlayer`, the default the Draftmancer host sees and may override.
  Because one form serves both tabs, **the qualification rides on the field it
  qualifies**: `DraftSettings` takes a `mode`, and exporting, the Players hint
  says it only sizes the check below while Packs each says it is the file's
  default. That started as a paragraph above the form, on the reasoning that
  explaining a field after it has been read is too late — which was right and did
  not go far enough. The paragraph is read once and then forgotten while the eye
  is on the fields, so by the time you are typing in Players there is nothing
  beside it saying the number is only a check. `mode` changes hint text and one
  sentence of the summary and nothing else: the config, the arithmetic and the
  validation stay identical, which is what keeps one form safe to share.
  The summary is tab-aware for the same reason. Exporting, the seat count is an
  assumption about a session the host will size themselves, so it reads "Sized
  for 8 players" and "Each player finishes with 36 cards" rather than stating
  either as fact.
  **The tab is client state, not a URL parameter**, unlike the cube page's tabs
  — those select what to read and are worth linking to, while this one sits over
  a form you have just filled in, and a round trip to a dynamic route would
  throw the settings away to change a heading.
- **The screen costs no extra query.** `DraftSettings` takes **three counts**,
  not the cards, so nothing extra crosses to the client, and only pressing
  Download runs a query. That is also why the route selects its own columns:
  `champion` and the base printing's rarity are not in `browseColumns` and no
  page wants them.
- **`readDraftConfig` lives in `src/lib/draft/config.ts`, not beside the draft
  action**, because the export route needs the same field-by-field rebuild from
  a query string that the start action needs from a form. Its booleans accept
  `"true"` and `"1"` for exactly that reason — a URL has no booleans, and the
  alternative is a second parser that could disagree with this one about what a
  config is.

## Crack-A-Pack

One pack from a cube, drawn as a single high-resolution image to post. The third
tab on `/cube/{username}/{slug}/draft?new=1`, served by the `pack.png` route.

It exists because creators were already screenshotting the pack view for videos
and Discord, and a screenshot is unreadable once a video has re-encoded it. The
on-site grid also leaves a battlefield as a lone landscape tile among portrait
cards, which reads as a glitch rather than a design choice.

- **The browser cannot draw this, and that is not a preference.**
  `cmsassets.rgpub.io` sends **no `Access-Control-Allow-Origin` on any request
  shape** — verified against a bare GET, an `Origin`-bearing GET and an OPTIONS
  preflight. So `crossOrigin="anonymous"` fails to load outright, and a plain
  load taints the canvas so `toBlob` throws at the very last step, *after*
  everything appears to have worked. It is Riot's CDN, not ours, and the one
  workaround — proxying the art through our origin — is exactly what "we store
  image URLs, never image bytes" exists to prevent, and would cost more
  bandwidth than server rendering does (per viewer rather than per pack).
  **Re-check the header before anyone tries this again**; it is one `curl`.
- **The preview is not a second renderer.** It is the same route at a smaller
  tier in an ordinary `<img>`. *Displaying* a cross-origin image was never the
  problem — only reading its pixels back is — so nothing on the client touches a
  canvas.
- **It requires an account; the Draftmancer export beside it does not.** That
  export assembles a text file from rows we already hold. This fetches seventeen
  images and composites them, which makes it by a wide margin the most expensive
  endpoint on the site, and it was reachable signed out. A session is also the
  only rate limit here that costs nothing to run: an account needs a magic link,
  and that endpoint is already metered upstream. **`canUseCube` is still checked
  *before* the session**, so a signed-out visitor cannot tell a private cube from
  one that never existed — answering 401 first would give that away. That order
  is `needsAccount` in `export-request.ts`: 404, then 401, then the config's
  400, so a bad template cannot turn a request that should have been refused
  into an answer that admits the cube is there.
- **Nothing is stored, and the URL is the state.** No pack row, no table, no
  migration, no retention policy: the engine is deterministic, so a seed plus a
  config regenerates the identical pack. `readDraftConfig` already knew how to
  read a config out of a query string, because the Draftmancer export needed
  exactly that. Same seed twice is byte-identical output, asserted by hand.
- **The route deals the engine's *minimum* grid, not the configured draft.**
  `generatePacks` with the form's seats and packs blocks on a cube too small for
  24 packs, which has nothing to do with whether it can fill one. Two seats by
  one pack is the floor, and the first pack is the one used.
- **Only Shuffle deals.** Opening the tab renders nothing, and the template is
  snapshotted alongside the seed rather than read live — building the image URL
  from the live config re-rendered on every keystroke, so typing "15" into Cards
  per pack dealt a 1-card pack and then a 15-card one. Seed plus template is one
  description of one pack, which is what the download needs and what a permalink
  would need.
- **Two tiers, and they are card measurements rather than canvas ones.**
  `preview` is 300px per card (~1930px canvas, ~290KB in) and `full` is 745
  (~3200px, ~920KB in). The build spec named both "480 per card" and "around
  1200px wide" and those were never in conflict — one is a card measurement, the
  other a canvas. The preview is deliberately a *reading* size: the complaint
  this feature answers is that shared pack images are too low-resolution to read,
  so a preview you cannot read fails the same way.
- **The layout solver is pure and lives in `src/lib/pack-image/layout.ts`.** A
  pack mixes portrait cards (63×88) with landscape battlefields (88×63), so the
  minority orientation pairs two-per-slot into one tile of the majority's shape
  and the grid stays regular. Ties go to portrait; an all-battlefield pack flips
  the base tile, without which you get one row of tiny half-height battlefields.
  Dead cells are pure holes now that branding is the footer alone, so
  `DEAD_PENALTY` is 0.15 and a short last row is centred. `check:pack-image`
  asserts the six worked shapes and runs in CI, with no browser and no network.
- **The wordmark font is vendored and named explicitly.** Space Grotesk, the
  site's display face, as a TTF under `src/lib/pack-image/fonts/`. `font: "sans"`
  resolves on a developer machine and in CI and renders as **nothing** on a
  Vercel function, which carries almost no fonts — a bug no local test finds.
  `fontfile` removes the dependency on the host having any fonts, and
  `outputFileTracingIncludes` in `next.config.ts` puts the file in the bundle,
  because nothing imports it and the tracer cannot see a path built at runtime.
  Verified in a real build: the font is in the route's `.nft.json` and the
  wordmark rasterises.
- **The wordmark is rasterised at 8x and scaled down.** Pango hints every glyph
  advance onto a whole device pixel, and the preview tier's em is only 23px, so
  the leftover fractions pile up into gaps you can read — `cubebo und.gg` in the
  corner of every preview. Nothing in sharp's text API turns hinting off, so
  `SUPERSAMPLE` in `render.ts` puts the pixel grid out of reach and lanczos
  averages the error away on the way down. The download tier had the same flaw
  and only hid it better, a 56px em spreading the rounding thinner. One extra
  in-memory raster against seventeen CDN fetches, so the cost does not register.
- **`sharp` is the project's first native dependency.** It cannot run on Edge, so
  the route declares `runtime = "nodejs"`. The lockfile carries the linux-x64
  binaries Vercel installs, checked rather than assumed.
- **The response is `private, max-age=3600`.** `private` because this image *is*
  cube contents and an unlisted cube is only as private as its URL — and because
  a shared cache would serve the bytes to anyone with the link, walking straight
  around the sign-in check. **That rules out edge-caching even public cubes while
  this route needs an account**, which is the tradeoff to reopen if it ever
  stops. `max-age` rather than `no-store` is the part that matters: `no-store`
  forbade the browser's cache too, so a double-click rendered the identical pack
  twice.
- **Every render logs what it cost** (`[pack.png] … in=…KB out=…KB …ms`), so
  Vercel's logs answer "is this too expensive" with numbers. Inbound is the
  figure to watch; it is bandwidth we never used to spend.
- **Not built, deliberately:** a pack permalink and an `og:image`. That is where
  the cost changes character, because unfurlers refetch repeatedly and carry no
  cookies, and it would need a visibility-aware cache policy that the sign-in
  requirement currently forecloses. Gate it on real usage data.

## Working with agents

The repo carries its own Claude Code configuration in `.claude/`, committed so the setup
is reproducible rather than living in one machine's head. Four agents, one settings file,
one MCP config.

### The agents (`.claude/agents/`)

| Agent | Use it for | Notes |
| --- | --- | --- |
| `gate` | Running the sixteen-script manual gate before a deploy or after a card sync | Carries the PowerShell runbook, the Chrome-on-:9222 launch, and the two transient failures. **Dev only.** |
| `data` | Any question about real usage — how many cubes, how many empty, how many drafts finish | Read-only by rule and by credential. Starts from `npm run stats`. |
| `planner` | Turning a roadmap item into an implementation plan before writing code | Must cite the conventions here that constrain the change, and name the checks that cover it. |
| `docs` | Keeping this file true after a change | Enforces the same-commit rule below. Counts and tables are where it goes stale. |

Four is deliberate. Review is already covered by the `/code-review`, `/simplify` and
`/security-review` skills, and an agent nobody invokes is worse than none.

### `npm run stats`

[scripts/stats.mts](scripts/stats.mts) prints what the site holds: cubes by visibility,
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

## Checks

Each check guards a regression that already happened once. Run the ones
touching what you changed; run the manual gate in full before a deploy. The
ones needing a database hit **dev**, never production — see "Environments" —
which is why they can create and delete accounts freely.

| Script | Guards | Needs | Runs |
| --- | --- | --- | --- |
| `check:primer-safety` | hostile markdown renders inert through the real component | nothing | **CI** |
| `check:printings` | the TS and SQL `base_id` rules agree on every row; and separately that the browser's collapse rule agrees between `nameWithoutTreatment` and the `regexp_replace` in `collapseKey`, that every treatment printing folds onto the card it varies, and that a mid-name parenthetical never folds | DB (read-only) | manual gate |
| `check:browse-grid` | a grouped tile is a card, an all-printings tile is itself | Supabase + dev server | manual gate |
| `check:card-filters` | multi-select ORs within a filter and ANDs across; energy buckets partition the pool; sorting uses the game's order | DB (read-only) | manual gate |
| `check:copies-and-log` | quantity 2 lists as two entries; per-copy edits move one copy; edits reach the log | Supabase + dev server | manual gate |
| `check:public-cube` | visibility gating, cloning, quantity-aware counts, that Clone is the prominent action (it imports `btn.primarySm` from `src/lib/ui.ts` rather than matching a palette string, so styling changes cannot break it), and that the owner gets a real **307** to `/edit` rather than the page — a 200 there means the redirect degraded to a client-side hop | Supabase + dev server | manual gate |
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
| `check:draftmancer` | the cube file Draftmancer reads: unique custom-card names, every sheet line resolving to an entry, no slot naming an unemitted sheet and no empty sheet across four configs, the either-slot weighted 50/50, `draftmancerSheetNeeded` matching every hand-run Draftmancer session, rarity in the accepted set with treatments resolved through `base_id` and a non-zero fallback, costless as `""`, and only the drafted sections | nothing | **CI** |
| `check:pack-image` | the pack image's layout: the six worked shapes from the build spec, battlefields pairing into the majority's tile, an all-battlefield pack flipping to landscape, a short last row centred, every card placed exactly once inside the canvas, and the vendored wordmark font rasterising rather than silently falling back | nothing | **CI** |
| `check:staged-edit` | the edit panel's batching: collapse yields one row per (card, section) so a save cannot violate `ON CONFLICT`, netting cancels a staged-then-unstaged pair while two *different* printings stay two changes, quantities clamp, and `sectionForBoard` files a Legend to `legends` | nothing | **CI** |
| `check:oauth` | the backup rule, `providersOf` order, the provider allowlist, and that both sign-in actions still validate their input and build `redirectTo` through `authCallbackUrl` | nothing | **CI** |
| `check:oauth-buttons` | `/login` offers both providers as form fields, links to no provider directly, and still carries the same-address warning | dev server | manual gate |
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

**Three checks constrain user-facing copy, which is easy to forget when the
change in hand looks like a wording tweak.** `check:oauth-buttons` requires
`/login` to keep the two-sided same-address warning — reword it freely, remove
it and the build fails, which is the point, since dropping half that guidance
is what pushes people into making the duplicate account it exists to prevent.
`check:cube-ownership` requires the two delete confirmations to keep
*comparing* the typed name; the prose around them is free, the comparison is
not. `check:public-cube` asserts a cube page still offers Share and Clone by
those exact labels. Run all three after a copy pass.

`check:cube-ownership` is also structural: it fails if a new action in
`src/app/cube/actions.ts` skips `requireOwnedCube` without a documented
exemption naming the gate it uses instead. It scans the **draft** and **follow**
actions the same way, against their own gates — a mutation living in a file the
check does not read would escape the guarantee entirely, which is worse than an
exemption.

### What CI runs

`.github/workflows/ci.yml`, on every push and pull request: typecheck, lint,
the eight pure checks — `check:primer-safety`, `check:draft`,
`check:analytics`, `check:markdown-edit`, `check:draftmancer`,
`check:pack-image`, `check:staged-edit` and `check:oauth` — and a production
build. It uses **placeholder** Supabase
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

### Why the other sixteen are a manual gate, not CI

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

## Sign-in methods

Magic link, plus **Discord and Google**. `/settings` is where an account sees
what it has and adds what it lacks.

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
    adding cards. A single request could take the entire pool — `max` was 6,
    sized to exactly that fan-out. Two fixes, both needed: it is memoised
    in-process for five minutes (right because those values describe the *card
    pool* and change only when `sync-cards` runs), and it is now **one
    statement** instead of six, so a memo miss on a cold instance costs one
    connection. Measured identical output and the same latency — 223ms against
    231ms — for a sixth of the pool pressure. "It's memoised so only cold
    instances pay it" is backwards: a burst spins up *many* cold instances, and
    cold is the case that hung the site. **Any new fan-out on a hot path needs
    the same scrutiny**: the number that matters is queries × concurrent
    requests, not the cost of one query, and sizing the pool to the fan-out
    means the next `Promise.all` someone adds silently reintroduces this.
  - The pool was unbounded and never released. postgres-js defaults to `max`
    10 with no idle timeout, and **every Vercel instance builds its own pool**,
    so a burst spun up instances that each took ten connections and were then
    frozen still holding them. `src/db/index.ts` now sets `max: 6` (the widest
    `Promise.all` fan-out, so parallel queries are not serialised),
    `idle_timeout: 20` so a frozen instance hands its connections back, and
    `connect_timeout: 10` so exhaustion fails fast with a digest instead of
    hanging — a page that errors is far easier to diagnose than one that stalls.
  - Reproduced at the time with a throwaway load script — 40 concurrent
    requests to `/cards` plus a probe at `/explore`. Before: the slowest took
    45s. After: 5s. **That script is deliberately not in the repo**: see the
    `check:pool` bullet below for why firing it at the shared dev project is
    worse than not having it.
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
- **The same rule applies to writes, and a loop of them is the easy way to
  forget it.** `commitImportAction` called `addCubeCard` once per line, and each
  call was an insert *plus* a `touchCube` — so a 426-line buylist paid 852
  sequential round trips, and 426 of those updated the **same** `cubes` row,
  leaving that many dead tuples behind a cube that changed once. Production bore
  it out: `update cubes set updated_at` was 5,001 calls against 144 cube
  creations and 42 edits, by far the most-executed statement on the table, and
  `cubes` was 104kB of bloat for 15 rows. `addCubeCards` now does the whole
  import as one multi-row upsert and one bump. **A per-row helper called in a
  loop is a fan-out**, and the number that matters is round trips in sequence.
  Callers must pass rows already collapsed to one per (card, section) —
  `mergeImportRows` does that — because Postgres refuses to let a single
  `ON CONFLICT DO UPDATE` touch one row twice.
- **A page must not fetch what its current mode does not render.** The editor
  reads six different modes off `?mode=`, and it used to load the whole cube's
  card quantities *and* every printing of every card in it on all six — a
  500-card cube is a thousand-odd wide rows, paid for while showing the change
  log, which uses neither. Both reads are now conditional on the mode that
  consumes them, and the printings read is further bounded to bases where
  `printingCount > 1`: `cube-contents.tsx` renders a plain label rather than a
  select when a card has one printing, so those rows never changed anything on
  screen. `printingCount` already rides along on `getCubeCards`, so knowing
  which qualify costs nothing, and `getPrintingsForBases([])` returns without a
  query — which is what lets the mode decide by passing an empty list. Browse
  mode went from ten queries in its first wave to five, and primer/log/import
  from four to two. **The number that matters is queries × concurrent
  requests**, so a read that is merely unused is not free; it is a connection
  someone else's request is waiting on.
- **Bounding the *rows* is only half of it; bound the *columns* too.**
  `getPrintingsForBases` returns `CardPrinting` — `id` and `baseId`, nothing
  else — because that is all the Printing dropdown reads: it renders the id and
  compares it to `baseId` to mark the base printing. It used to spread
  `browseColumns`, so every load carried rules text, both image URLs, the artist,
  the domains and the rest, to render a list of ids. Measured on a 360-card
  cube: **209KB down to 11KB**, and the editor's HTML from 931KB to 715KB in
  list view and 1021KB to 805KB in visual, on every load of both. `browseColumns`
  is for the card browser, where a card is *shown*; reaching for it because it
  is nearby is how a screen that needs two fields ends up shipping eighteen.
  `CardPrinting` is its own interface rather than `Pick<BrowseCard, …>` so that
  spreading the wide list back in has to be a decision rather than an autocomplete.
- **None of that data is ever server-rendered.** The detail modal lives behind
  `useState(null)` in `cube-sections.tsx`, so `detailFooter` — the only consumer
  of `printingsByBase` — never runs during SSR. Verified with 40 cards that all
  have alternates: the served HTML contains no `>Printing<`, no
  `aria-label="Printing for` and no `Remove this copy` in either view. So these
  rows were pure payload, and changing them cannot move a byte of served markup
  — which is also why no gate script that reads HTML can catch a regression here.
- **The cube listings are where the remaining time goes.** Measured in
  production, the three variants of `searchCubes` were 3,082ms of 3,790ms across
  every query touching `cubes` — 81% of the time from 1.7% of the calls, at
  10–29ms each against ~0.05ms for everything else. The cost is the shape of
  `cubeCoverImageSql`: it sorts a cube's whole card list to pick one image, once
  per cube shown, so it grows as cubes × cards-per-cube. `0013` indexes
  `(cube_id, section)`, which helps the filter but not the shape. **The actual
  fix is to resolve the cover at write time into a column on `cubes` and keep
  `card_count` / `follow_count` as counters** — deliberately not done yet,
  because at 15 cubes and 3,985 `cube_cards` rows it would be premature. Revisit
  when either number grows an order of magnitude.
- **Seq scans on `cubes` are not a bug and no index will remove them.** The
  table is 15 rows in one page, so the planner correctly ignores the primary key
  even for `where id = $1`; that is why 11,500 queries produced 18,000 scans.
  Supabase's advisor flags every unindexed foreign key regardless of table size,
  and at this scale those warnings are noise — `cubes_owner_slug_idx` and
  `cube_follows_cube_id_idx` already cover the lookups that matter.
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

Phase 1 is done, and so is bulk import. Then phase 2 in the order under
"Product vision", starting with search syntax. Do NOT build ahead of it.
