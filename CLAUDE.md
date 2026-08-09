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
- Card data ingested from the Riot API (`riftbound-content-v1`) into our own DB via a sync script; card images served from Riot CDN URLs stored per-card (do not proxy/cache images yet)

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

## Conventions

- Server components by default; client components only where interactivity requires.
- All DB access through Drizzle in `src/db/`; no raw SQL in route handlers.
- Card sync script lives in `scripts/sync-cards.ts`, idempotent, diffs by card id, safe to re-run. New sets ship every ~3 months — the sync must handle unknown fields gracefully (hence the `data` jsonb column).
- Never hand-edit card data; fix the sync instead.
- Keep components small; colocate route-specific components under their route folder.
- Riftbound term casing in UI: domains and card types are proper nouns (Fury, Champion Unit).

## Phase 1 milestones (work in this order)

1. Scaffold: Next.js + Tailwind + Drizzle + Supabase wiring, env setup, CI (typecheck + lint).
2. Card ingestion: sync script pulling all sets from the Riot API into `cards`; verify counts per set.
3. Card browser: `/cards` with basic filters (set, domain, type, rarity) and name search.
4. Auth + profiles: Supabase auth, username claim flow.
5. Cube CRUD: create/edit/delete cube, add/remove cards from the card browser, sections.
6. Cube view: public page grouped by domain then energy cost, with type/cost toggles; clone button.
7. Deploy to Vercel with the production domain.
