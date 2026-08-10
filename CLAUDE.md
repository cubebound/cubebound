# cubebound.gg

Cube construction and drafting platform for Riftbound (Riot's League of Legends TCG). Think Cube Cobra, but Riftbound-native. Unofficial fan project under Riot's Legal Jibber Jabber policy — every page footer must include: "cubebound.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties."

## Current status

**Milestones 1–6 are done.** The MVP loop closes: sign in → create a cube →
search and add cards → view it by domain/cost/type → share a public URL that
anyone can browse and clone.

Working: card ingestion (1,294 printings / 966 distinct cards across 8 sets),
`/cards` browser, magic-link auth with username claim, cube CRUD, the quick-add
editor, visual and text views, primer, change log, and the public cube view
with cloning.

**Next: milestone 7 — deploy to Vercel on the production domain.** After that,
phase 2 opens with search syntax (`domain:fury cost:2 type:unit`).

Open items:
- **CI covers typecheck, lint, build and `check:primer-safety`** on push and PR.
  The other six checks need a live Supabase and are a documented pre-deploy
  manual gate — see "Checks". Run that gate before deploying.
- Work lands on `master` and pushes to `github.com/cubebound/cubebound`. The
  merged `cube-editor-redesign` branch can be deleted.
- The Riot adapter stays dormant until our API application is approved.
- Six UNL token rows still come from the retired riftscribe source.

## Product vision

The core loop (MVP): create a cube → search/add cards → view it organized by domain/cost/type → share a public URL others can browse and clone.

Later phases, in priority order:
1. Search syntax (`domain:fury cost:2 type:unit`)
2. Cube analytics (curve, domain balance, legend/champion coverage, rune/battlefield counts)
3. Solo bot drafting
4. Multiplayer draft lobbies (websockets)
5. Community features (clone, changelogs, card pick data)
6. Exports (proxy sheets, deck lists compatible with other Riftbound tools)

The MVP loop is shipped. Do NOT build ahead of the current phase — deploy it
before starting phase 2.

## Stack

- Next.js (App Router) + TypeScript, strict mode
- Postgres via Supabase (also provides auth)
- Drizzle ORM
- Tailwind CSS
- Deployed on Vercel
- Card data ingested into our own DB via a sync script with pluggable sources (see "Card data sources" below); card images served from source CDN URLs stored per-card (do not proxy/cache images yet)

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
              section ('main'|'legends'|'runes'|'battlefields'|'sideboard')
cube_changes  id, cube_id, actor_id (set null on delete), actor_username, kind,
              card_id, card_name, quantity, from_section, to_section,
              from_value, to_value, created_at    -- indexed (cube_id, created_at)
```

Migrations, in order — `0000` initial · `0001` add + backfill `base_id` ·
`0002` enable RLS · `0003` recompute `base_id` as data-derived print groups ·
`0004` `cubes.primer` · `0005` `cube_changes` (+ RLS).

`0001`'s suffix-stripping rule is superseded by `0003`; only `0003` must stay in
step with `src/lib/card-ids.ts`. Adding a column to a populated table means
add-nullable → backfill → set-not-null, never `ADD COLUMN NOT NULL`.

## Routes

```
/                                     landing
/cards                                card browser (milestone 3)
/login  /welcome  /auth/callback      magic link, username claim, PKCE exchange
/cubes  /cubes/new                    the signed-in user's cubes
/cube/{username}/{slug}               public view — visibility-gated
/cube/{username}/{slug}/edit          owner editor; ?mode=browse|primer|log
/cube/{username}/{slug}/settings      rename, visibility, delete
```

Server Actions live in `src/app/cube/actions.ts` and `src/app/auth/actions.ts`.

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
  trailing segment is the set size, not part of the identity. Names arrive as
  "Champion - Title"; champion units print as "Champion, Title" but legends
  print the title alone with the champion on the type line, so the two split
  differently (`splitCardName`). Their feed contains stale duplicate records
  under the same `riftbound_id` — keep the one with the newer
  `metadata.updated_on`.
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
- Card sync entry point lives in `scripts/sync-cards.ts`, idempotent, diffs by card id against the stored raw payload, safe to re-run. New sets ship every ~3 months — the sync must handle unknown fields gracefully (hence the `data` jsonb column).
- Never hand-edit card data; fix the sync instead.
- Keep components small; colocate route-specific components under their route folder.
- Riftbound term casing in UI: domains and card types are proper nouns (Fury, Battlefield). Sources store them lowercase; title-case at the boundary via `titleCase` in `src/lib/riftbound.ts`.
- Filter dropdowns are built from the **distinct values actually in the DB**, then sorted by the canonical lists in `src/lib/riftbound.ts` with unrecognized values kept at the end (`sortByCanonical`). A new set's new rarity therefore appears without a code change — `Promo` already does, and is not in `RARITIES`.
- Card rendering rules live in `src/lib/riftbound.ts` (domain colors, canonical orderings, orientation). Battlefields are printed landscape (7:5), every other type portrait (5:7) — the printed image already reads upside-down on its top half, that is correct.
- Card images render with a plain `<img>`, never `next/image`: optimizing through Vercel would proxy and cache them, which we are deliberately not doing yet.
- Rules text contains symbol tokens (`:rb_energy_1:`, `:rb_rune_fury:`). Never render `rules_text` raw — go through `parseRulesText` in `src/lib/rules-text.ts`, which resolves the tokens to badges and degrades unknown ones to readable words. Note the source names domain symbols `rune_*` but they are **Power** costs; runes are the resource cards you exhaust or recycle to produce Energy and Power.
- Printings: `cards.base_id` is the id of the **canonical printing** of a card, resolved from card data — not from the id string. Sets reprint cards in their high-numbered showcase slots, within a set (`SFD-049` → `SFD-224`) and across sets (`OGN-013` "Pouty Poro" → `UNL-220`), so no amount of suffix-stripping can group them. Identity is `(lower(name), type)`; see `assignBaseIds` in `src/lib/card-ids.ts` and the matching SQL in `drizzle/0003_base_id_print_groups.sql`, which must stay in step. Because identity is name-based, different cards sharing a collector number (`UNL-T01` "Baron Pit" vs `UNL-001` "Arena Kingpin") never group. `npm run check:printings` asserts all of this.
- Do **not** use rules text as card identity: showcase reprints drop the parenthetical reminder text and sometimes reword the ability outright.
- Filter navigation must not throw away the reader's scroll position. `scroll: false` alone is not enough — the router still pulls the viewport to the top of the refreshed segment — so `CardFilterBar` captures `window.scrollY` before navigating and reapplies it when the transition settles.

## Cubes

- The editor has four tabs, all on `/edit` behind `?mode=`. Default (no param):
  the cube is the page, with a **quick-add** panel (sticky sidebar on desktop,
  bottom sheet below `lg`) for rapid consecutive adds — type-ahead, per-row
  section and printing selects, add without navigating. `?mode=browse` swaps in
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
  dropped. Cost cells
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
- View resolution is `?view=` first, then the
  `cubebound.cube-view` cookie, then visual; the toggle writes both, so a shared
  link shows what the sender saw while a personal preference follows you between
  cubes. See `src/lib/cube-view.ts`.
- `cubes.primer` is a long-form markdown write-up, separate from the one-line
  `description`, edited on the editor's Primer tab and rendered by
  `src/components/primer.tsx`. **Never render it as HTML.** `rehype-raw` is
  deliberately absent so embedded HTML is never parsed; `rehype-sanitize` runs
  as a second layer with a narrowed tag list, and `urlTransform` allows only
  http/https/mailto. `npm run check:primer-safety` renders hostile markdown
  through the real component and fails if anything executable survives — run it
  after touching that component. The public cube view renders the primer with
  the same component.
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
- **Runes are optional content.** A cube with no runes is a legitimate cube, so
  never warn about their absence or treat any section as required.
- Public cube view is `/cube/{username}/{slug}`. Public and unlisted render for
  anyone including signed-out visitors; private 404s for non-owners, the same
  convention the mutations use. `canViewCube` in `src/lib/cube-access.ts` is the
  single definition, next to `canEditCube`.
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

## Checks

Each check guards a regression that already happened once. Run the ones
touching what you changed; run the manual gate in full before a deploy.

| Script | Guards | Needs | Runs |
| --- | --- | --- | --- |
| `check:primer-safety` | hostile markdown renders inert through the real component | nothing | **CI** |
| `check:printings` | the TS and SQL `base_id` rules agree on every row | DB (read-only) | manual gate |
| `check:browse-grid` | a grouped tile is a card, an all-printings tile is itself | Supabase + dev server | manual gate |
| `check:copies-and-log` | quantity 2 lists as two entries; per-copy edits move one copy; edits reach the log | Supabase + dev server | manual gate |
| `check:public-cube` | visibility gating, cloning, quantity-aware counts | Supabase + dev server | manual gate |
| `check:auth-flow` | claiming a username refreshes the nav (`revalidatePath`) | Supabase + dev server + Chrome :9222 | manual gate |
| `check:cube-ownership` | replays an Add under another session and with no cookie | Supabase + dev server + Chrome :9222 | manual gate |

`check:cube-ownership` is also structural: it fails if a new action in
`src/app/cube/actions.ts` skips `requireOwnedCube` without a documented
exemption naming the gate it uses instead.

### What CI runs

`.github/workflows/ci.yml`, on every push and pull request: typecheck, lint,
`check:primer-safety`, and a production build. It uses **placeholder** Supabase
values, never real ones — every route is dynamic, so the build renders no page
and opens no connection, but `src/lib/supabase/config.ts` throws when the vars
are absent. **No production credentials belong in CI under any arrangement.**

`npm run typecheck` runs `next typegen` first, because Next generates the global
route helpers (`LayoutProps<"/">`, `PageProps<…>`) into `.next/types` and
tsconfig includes them — plain `tsc` fails on a tree that has never been built.

**Verify CI changes from a fresh clone, not the working tree.** A local run
reuses a populated `.next` and an existing `.env.local`, so it passes on state
CI does not have; that exact gap shipped a red build. `git clone` to a temp dir,
`npm ci`, set placeholder env, then run the steps.

### Why the other six are a manual gate, not CI

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

`check:printings` is excluded for a different reason — it validates the *card
pool*, which changes only when `sync-cards` runs, not when app code changes.
Running it per-push against a freshly synced throwaway database would test less
than running it by hand against the real pool. **Run it after every sync.**

The gate, before deploying and after any card sync:

```bash
npm run dev                 # terminal 1
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/cbchrome about:blank
npm run check:printings && npm run check:browse-grid && \
npm run check:copies-and-log && npm run check:public-cube && \
npm run check:auth-flow && npm run check:cube-ownership
```

Each creates throwaway accounts and deletes them again, including on failure.

If these ever need to be automated, the path is the Supabase CLI (`supabase
start`) in CI, which brings up Postgres and GoTrue per run with no secrets and
no shared state — not a hosted test project.

## Auth and data access

- Supabase email magic links. Session cookies are refreshed in `src/middleware.ts`;
  always verify the user with `supabase.auth.getUser()`, never `getSession()`,
  which trusts the cookie without checking it.
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
7. ⬜ **Deploy to Vercel with the production domain.**

Then phase 2 in the order under "Product vision", starting with search syntax.
Do NOT build ahead of it.
