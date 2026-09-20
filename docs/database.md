# Database schema and query rules

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
(**applied to both environments by hand — see [environments.md](environments.md)**).

Migrations are applied **per environment and by hand** — see [environments.md](environments.md).
A migration in a merged branch is not live until production is migrated.

`0001`'s suffix-stripping rule is superseded by `0003`; only `0003` must stay in
step with `src/lib/card-ids.ts`. Adding a column to a populated table means
add-nullable → backfill → set-not-null, never `ADD COLUMN NOT NULL`.

## Writing queries

- **In a raw `sql` fragment, qualify outer column references yourself.** Drizzle
  renders `${table.column}` *unqualified* when the surrounding query has no
  join, so a correlated subquery that mentions another table with the same
  column name silently binds to the wrong one. `cubeCoverImageSql` referencing
  `${cubes.id}` bound to `cards.id` and every share preview 500'd with
  `operator does not exist: uuid = text` — while the cube lists, which use the
  same fragment through a query that joins `users`, worked fine. Write
  `"cubes"."id"`.

- **No two concurrent queries may share a result shape.** Production once
  rendered a rarity filter whose only option was **"966"** — the card count.
  `searchCards` aliased its count `value`, which is exactly what the rarity,
  type and domain queries select, and the page fires all of them together; a
  crossed result was therefore indistinguishable from a correct one and nothing
  threw. The count is now `total`. That does not prevent crossing — it makes the
  next one **fail loudly instead of silently**, which is the difference between
  a Sentry trace and squinting at a screenshot. The mechanism was never
  reproduced; what is certain is that it was invisible.

- **A hand-written migration needs a `drizzle/meta/_journal.json` entry.**
  Without one `db:migrate` prints "migrations applied successfully" and applies
  nothing; `0012` was silently skipped that way, and the failure only surfaced
  as a missing relation at request time.
