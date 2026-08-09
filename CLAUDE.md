# cubebound.gg

Cube construction and drafting platform for Riftbound (Riot's League of Legends TCG). Think Cube Cobra, but Riftbound-native. Unofficial fan project under Riot's Legal Jibber Jabber policy — every page footer must include: "cubebound.gg is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties."

## Product vision

The core loop (MVP): create a cube → search/add cards → view it organized by domain/cost/type → share a public URL others can browse and clone.

Later phases, in priority order:
1. Search syntax (`domain:fury cost:2 type:unit`)
2. Cube analytics (curve, domain balance, legend/champion coverage, rune/battlefield counts)
3. Solo bot drafting
4. Multiplayer draft lobbies (websockets)
5. Community features (clone, changelogs, card pick data)
6. Exports (proxy sheets, deck lists compatible with other Riftbound tools)

Do NOT build ahead of the current phase. Ship the MVP loop first.

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
- **Card types**: Unit, Champion Unit, Spell, Signature Spell, Gear, Rune, Battlefield, Legend.
- **Costs**: cards have an **energy** cost (generic) and may have a **power** cost (domain-specific pips). Units have **might** (combat stat).
- **Legends**: a player's identity card; determines 2 accessible domains. Champions and Signature Spells are tied to specific champions.
- **Constructed decks**: main deck + separate rune deck + legend + battlefields. Cube drafting conventions are still community-defined; common house rules draft legends in a separate first phase, then the main cube.

## Database schema (initial)

```
cards
  id            text pk           -- e.g. "OGN-001"
  name          text not null
  set_code      text not null     -- e.g. "OGN"
  collector_no  text not null
  rarity        text not null
  type          text not null     -- enum above
  supertype     text              -- e.g. champion linkage
  domains       text[] not null default '{}'
  energy_cost   int
  power_cost    jsonb             -- per-domain pips, e.g. {"fury": 2}
  might         int
  rules_text    text
  keywords      text[] not null default '{}'
  tags          text[] not null default '{}'   -- e.g. "Ionia"
  champion      text              -- linked champion name, if any
  artist        text
  image_full    text
  image_thumb   text
  data          jsonb             -- raw API payload for forward-compat
  updated_at    timestamptz

users            -- from Supabase auth; profile table with username (unique, url-safe)

cubes
  id, owner_id fk users, name, slug (unique per owner), description,
  visibility ('public'|'unlisted'|'private'), created_at, updated_at

cube_cards
  cube_id fk, card_id fk, section ('main'|'legends'|'runes'|'battlefields'|'sideboard'),
  quantity int default 1, added_at
```

Cubes are referenced by URL as `/cube/{owner_username}/{slug}`.

## Card data sources

The sync is a source-adapter design: `scripts/sync-cards.ts` owns idempotent
diffing, chunked upserts, and per-set reporting; adapters in
`scripts/card-sources/` implement the `CardSource` interface and return cards
already normalized to our `cards` row shape. Every row's `data` jsonb stores
`{ source: "<adapter>", card: <raw payload> }` so we always know which API a
row came from. Select with `CARD_SOURCE` env (default `riftscribe`).

- **riftscribe (active)** — RiftScribe open API (`https://riftscribe.gg`), no
  auth. `GET /api/cards?limit=200&offset=N` (bare array, total in
  `x-total-count` header) for the list, then `GET /api/cards/{id}` per card —
  the list summaries lack rules text/keywords/tags/artist. Its ids embed a
  RiftScribe-internal suffix (`ogn-001-298`); the adapter normalizes to
  Riot-style ids (`OGN-001`, alt-art `OGN-100a`, signature `OGN-301-star`,
  token `UNL-T03`) so a later source switch doesn't duplicate rows. Lowercase
  `faction`/`rarity` values are title-cased; `image` (full PNG) and
  `image_thumb.medium` (webp) map to `image_full`/`image_thumb`.
- **riot (dormant)** — `riftbound-content-v1`. Kept because it's the official
  source, but the endpoint requires app-specific approval and returns 403 on
  dev keys; our application is pending. When approved, set `CARD_SOURCE=riot`
  + `RIOT_API_KEY`, and re-verify the response against the adapter first:
  the docs' `art` object has been observed arriving as a `media` array instead
  (RiotGames/developer-relations#1093, unresolved).

Neither source provides `supertype` or `champion`; those columns stay null
until a source supplies them or we add a derivation step.

## Conventions

- Server components by default; client components only where interactivity requires.
- All DB access through Drizzle in `src/db/`; no raw SQL in route handlers.
- Card sync entry point lives in `scripts/sync-cards.ts`, idempotent, diffs by card id against the stored raw payload, safe to re-run. New sets ship every ~3 months — the sync must handle unknown fields gracefully (hence the `data` jsonb column).
- Never hand-edit card data; fix the sync instead.
- Keep components small; colocate route-specific components under their route folder.
- Riftbound term casing in UI: domains and card types are proper nouns (Fury, Champion Unit). Sources store them lowercase; title-case at the boundary via `titleCase` in `src/lib/riftbound.ts`.
- Card rendering rules live in `src/lib/riftbound.ts` (domain colors, canonical orderings, orientation). Battlefields are printed landscape (7:5), every other type portrait (5:7) — the printed image already reads upside-down on its top half, that is correct.
- Card images render with a plain `<img>`, never `next/image`: optimizing through Vercel would proxy and cache them, which we are deliberately not doing yet.
- Rules text contains symbol tokens (`:rb_energy_1:`, `:rb_rune_fury:`). Never render `rules_text` raw — go through `parseRulesText` in `src/lib/rules-text.ts`, which resolves the tokens to badges and degrades unknown ones to readable words. Note the source names domain symbols `rune_*` but they are **Power** costs; runes are the resource cards you exhaust or recycle to produce Energy and Power.
- Printings: `cards.base_id` is the id of the **canonical printing** of a card, resolved from card data — not from the id string. Sets reprint cards in their high-numbered showcase slots, within a set (`SFD-049` → `SFD-224`) and across sets (`OGN-013` "Pouty Poro" → `UNL-220`), so no amount of suffix-stripping can group them. Identity is `(lower(name), type)`; see `assignBaseIds` in `src/lib/card-ids.ts` and the matching SQL in `drizzle/0003_base_id_print_groups.sql`, which must stay in step. Because identity is name-based, different cards sharing a collector number (`UNL-T01` "Baron Pit" vs `UNL-001` "Arena Kingpin") never group. `npm run check:printings` asserts all of this.
- Do **not** use rules text as card identity: showcase reprints drop the parenthetical reminder text and sometimes reword the ability outright.
- Filter navigation must not throw away the reader's scroll position. `scroll: false` alone is not enough — the router still pulls the viewport to the top of the refreshed segment — so `CardFilterBar` captures `window.scrollY` before navigating and reapplies it when the transition settles.

## Cubes

- Owner editor lives at `/cube/{username}/{slug}/edit`, settings at
  `.../settings`. The bare `/cube/{username}/{slug}` is reserved for the public
  view (milestone 6) and does not exist yet.
- The editor has two modes. Default: the cube is the page, with a **quick-add**
  panel (sticky sidebar on desktop, bottom sheet below `lg`) for rapid
  consecutive adds — type-ahead, per-row section and printing selects, add
  without navigating. `?mode=browse` swaps in the full filter/grid browser
  **in place of** the cube list, so the add controls are never below it.
- **Every cube mutation goes through `requireOwnedCube` in
  `src/app/cube/actions.ts`.** Pages decide only what to render; the server
  re-checks ownership on each write. Non-owners get "not found" rather than
  "forbidden" so private cube ids can't be probed. `npm run check:cube-ownership`
  replays a captured Add request under a different session to prove it, and
  fails the build if a new action skips the gate.
- Slugs come from the name once and never change on rename — they are shared
  URLs. Uniqueness is per owner (`slugify` + `uniqueSlug` in `src/lib/slug.ts`).
- Adding a card infers its section from the card type via
  `defaultSectionForType`; cards can be moved afterwards. Cubes are singleton
  pools, so adding a card already present is a no-op rather than a quantity
  bump (the `quantity` column stays 1 for now).
- Card search inside the editor reuses the browser's machinery — `searchCards`,
  `CardFilterBar`, `CardPagination` and the shared tiles in
  `src/components/card-visuals.tsx`. Route-specific wrappers stay under their
  route; anything used by both lives in `src/components/`. The filter
  serializer lives in `src/lib/card-search-params.ts`, not beside the filter
  bar, because the pagination server component needs it and a `"use client"`
  module's exports cannot be called from the server.

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

## Phase 1 milestones (work in this order)

1. Scaffold: Next.js + Tailwind + Drizzle + Supabase wiring, env setup, CI (typecheck + lint).
2. Card ingestion: sync script pulling all sets from the Riot API into `cards`; verify counts per set.
3. Card browser: `/cards` with basic filters (set, domain, type, rarity) and name search.
4. Auth + profiles: Supabase auth, username claim flow.
5. Cube CRUD: create/edit/delete cube, add/remove cards from the card browser, sections.
6. Cube view: public page grouped by domain then energy cost, with type/cost toggles; clone button.
7. Deploy to Vercel with the production domain.
