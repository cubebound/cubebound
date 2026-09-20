# Card data and the sync

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
  lived only on the retired `main` branch (see [environments.md](environments.md)) and so was **not
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

## Syncing, per environment

### Card data

Cards come from riftcodex via `npm run sync-cards` (~1,451 records before
duplicate collapsing). No Riot API key is needed. **Dev's card table is
populated by re-running the sync, not copied from production** — so a data
correction that lands through the sync (a fixed adapter mapping, a
`--force` re-map) has to be run again against production, and is not carried
across by deploying.

- Card sync entry point lives in `scripts/sync-cards.ts`, idempotent, diffs by card id against the stored raw payload, safe to re-run. New sets ship every ~3 months — the sync must handle unknown fields gracefully (hence the `data` jsonb column).
- **After changing an adapter's mapping, run `npm run sync-cards -- --force`.** The diff compares stored raw payloads, so a mapping fix leaves every row looking unchanged and silently never lands — a corrected `champion` field once reported "1288 unchanged". `--force` rewrites every row from the current mapping. Dry-run first by re-mapping the stored payloads and diffing: a change to *names* would reshuffle `base_id` grouping and needs review, a change to other fields does not. **Run it against each environment separately** — card data is synced per project, not copied, so a fix applied to dev is not carried to production by deploying.
- Never hand-edit card data; fix the sync instead.

## Still open

- The Riot adapter stays dormant until our API application is approved.
- Six UNL token rows still come from the retired riftscribe source.
