# Card data and the sync

The sync is a source-adapter design: `scripts/sync-cards.ts` owns idempotent
diffing, chunked upserts, and per-set reporting; adapters in
`scripts/card-sources/` implement the `CardSource` interface and return cards
already normalized to our `cards` row shape. Every row's `data` jsonb stores
`{ source: "<adapter>", card: <raw payload> }` so we always know which API a
row came from.

**Every set has at most one owning source, and a row from any other source is
discarded.** `ownerOf` in `sync-cards.ts` gives every set to riot-gallery, so a
new set lands with no code change, except the retired promo sets (OPP, PR, JDG,
`RETIRED_SETS`; see [printings.md](printings.md)), which **no source owns**. A
promo row arriving from any source is therefore discarded and logged, not
refused, so a promo appearing in Riot's feed one day cannot block a sync. The
discard applies however the run is started, so no source can overwrite another's
rows. `CARD_SOURCE` is no longer
read (the sync warns if it is set): choosing a source per run is what let the
pool be half-switched, and ownership per set replaces it.

- **riot-gallery (active, the only source)** — the public feed behind
  Riot's own card gallery (`content.publishing.riotgames.com/…/riftbound_gallery_cards`),
  no key. It is the upstream Riftcodex and RiftScribe both copied, and was the
  only source carrying Radiance once Riftcodex stopped updating in July 2026.
  **It is fetched in one request and never paged.** Its offset paging was
  measured unstable on 17 October 2026: three paged runs each dropped or
  duplicated up to two cards, a different two each time, while one large
  request returned the identical pool four times in four. If the feed reaches
  the request's limit the fetch fails rather than quietly paging; raise the
  limit. It also **fails loudly** on a duplicate id, an id shape the mapper
  cannot place, or a set prefix disagreeing with the card's set, because each
  of those means our rules are wrong, not that a card is missing. A card with
  **no type, or no domain unless it is a token, is skipped and logged** instead:
  that is Riot's data being incomplete, and the card lands on a later sync once
  Riot fills it in. The mapping rules (ids, champion-unit names, champions of
  legends and signatures, gear `might`, rules text) are in the adapter's
  comments, and `check:printings` asserts them against literal feed shapes.

  **`CORRECTIONS` in the adapter overrides Riot where the feed is wrong or
  blank, and each entry applies only while the feed still says its `from`
  value.** Once Riot fixes a card the entry stops matching and the sync logs
  that it can be deleted; if the feed says something else entirely, the feed
  wins and the sync warns, because a correction guessing over a new value would
  be inventing data. Every row still comes from a sync run, so this does not
  break the hand-edit rule below. The table exists because of Radiance: six
  days before release Riot's domain was wrong on 19 of its base cards and
  missing on 11 more, which also had no type. Each was settled against the card
  art, whose name-banner colour agrees with Riot's domain on 155 of 160
  single-domain Vendetta cards and, on Radiance, with the set's collector-number
  domain blocks on all 136 cards it could be read from. **A wrong domain is not
  cosmetic**: drafts replay against live card data and the bots pick by domain
  ([draft.md](draft.md)), so storing the right value from the first sync means
  Riot's eventual fix changes nothing under an active draft.
- **riftcodex and riftscribe (retired; adapters deleted)** — both adapters were
  deleted on 23 October 2026 and live in git history, but **the rows they wrote
  are still in the table and still shape it.** Riftcodex
  (`api.riftcodex.com`) was the whole pool until it stopped updating in July
  2026, then the promo sets' source until those were retired, because Riot's
  feed carries no promos, so **the frozen promo rows are Riftcodex payloads**
  (`data.source` is `riftcodex`). RiftScribe was dropped earlier because its
  `faction` is a single string, so every multi-domain card lost a domain: a
  lossy copy of Riot's gallery feed with no supertype, tags or artist. What
  that left in the table is below.

  Riftcodex collapsed 28 OPP `riftbound_id`s onto 12 canonical ids, so 32
  promo printings never arrived. That stopped mattering when the promos were
  retired, but **a stored id is never renamed**, whatever the source: `drafts.packs` is jsonb holding card ids, so a
  renamed id leaves every draft that dealt it unable to resume.
- **Rules text comes from the rich HTML, not the `plain` field.** Riftcodex
  copied Riot's HTML, and both `plain` alternatives
  are the tags deleted with nothing in their place: measured 27 September
  2026, 625 of 1,288 cards ran one ability into the next
  (`resolve.)Give a unit`), 30 flattened a "Choose one" list, and 105 still
  carried HTML codes (`&gt;`, `&quot;`). `richToRulesText` in
  `scripts/card-sources/types.ts` turns breaks and paragraphs into `\n` and a
  `<li>` into a `• ` line, drops other tags and decodes character references,
  falling back to decoded `plain` for the cards with no rich text. It also
  drops the upstream's literal `[NO TEXT]`, written on textless runes and some
  promos, which readers were shown as rules text. `check:printings` fails if
  stored text regresses or holds the placeholder.
- **riot (dormant, owns no sets)** — `riftbound-content-v1`, Riot's developer
  API, not to be confused with the gallery feed. Kept because it's the official
  source, but the endpoint requires app-specific approval and returns 403 on
  dev keys; our application is pending. When approved, give it sets in
  `ownerOf` and set `RIOT_API_KEY`, and re-verify the response against the adapter first:
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

The sync never deletes, so a row keeps what the last source to write it said
until another source overwrites the same id. That is deliberate — losing cards
is worse than keeping a stale row — but a row a retired source wrote can carry
that source's gaps: the riftscribe token rows (`UNL-T0n`) had a null
supertype, which is why the token rule also matches on id
([card-browser.md](card-browser.md)). A set no source owns is the extreme
case: its rows are never written again, which is exactly what the retired
promos need.

**The sync refuses to write if a stored card is missing from the source that
owns its set** (`checkFloor`). Never deleting means a card that silently stops
arriving would just stop updating, which is exactly what unstable paging
produced; the floor turns that into a refusal. A set with no owner is skipped,
since nothing is expected to deliver it. If a source really has dropped
a card, `--allow-missing=<ids>` lets the run through.

## Syncing, per environment

### Card data

Cards come from Riot's gallery feed via `npm run sync-cards`. No Riot API key
is needed. **It prints the project it is writing to**, through
`scripts/lib/database-label.ts`: dev and production share one Supabase pooler
host, so only the project ref in the connection's user name tells them apart,
and a host alone would read the same for both. **Dev's card table is
populated by re-running the sync, not copied from production** — so a data
correction that lands through the sync (a fixed adapter mapping, a
`--force` re-map) has to be run again against production, and is not carried
across by deploying.

- Card sync entry point lives in `scripts/sync-cards.ts`, idempotent, diffs by card id against the stored raw payload, safe to re-run. New sets ship every ~3 months — the sync must handle unknown fields gracefully (hence the `data` jsonb column).
- **After changing an adapter's mapping, run `npm run sync-cards -- --force`.** The diff compares stored raw payloads, so a mapping fix leaves every row looking unchanged and silently never lands — a corrected `champion` field once reported "1288 unchanged". `--force` rewrites every row from the current mapping. **Run `--dry-run` first**: a change to *names* would reshuffle `base_id` grouping and needs review, a change to other fields does not. **Run it against each environment separately** — card data is synced per project, not copied, so a fix applied to dev is not carried to production by deploying.
- **`--dry-run` fetches, maps and reports, and writes nothing.** It compares
  against the stored *columns*, not the stored payload, because after a source
  switch every payload differs and only the columns say what a visitor would
  see change. It lists identity-field changes, `base_id` re-points, card-page
  URLs that move or would be claimed by two cards, and the cubes, picks and
  covers referencing each changed card, and it **flags a domain change on any
  card in an active draft**, which is the change that can break a replay
  ([draft.md](draft.md)). `--only=<source>` runs one source, still restricted
  to the sets it owns. A real run prints any set whose rows changed source, so
  a hand-over shows up once rather than as a wall of unexplained updates.
- Never hand-edit card data; fix the sync instead.
- **A change to which printing is canonical is synced into production before
  the code relying on it deploys.** `base_id` is stored, and only the sync
  recomputes it, so deploying first serves the new code against the old
  canonical choices. The promo retirement is the case that made this a rule:
  the code hides every promo assuming none is canonical any more, and against
  the old `base_id` 43 cards would vanish from import and the printing picker.
- **`npm run retire-promos` (`scripts/retire-promo-printings.ts`) moves every
  cube off the retired promo printings**, onto `retiredPrintingTargets`' choice
  ([printings.md](printings.md)). It is **report-only unless `--apply`** — the
  reverse of the sync's `--dry-run`, because this writes into people's cubes —
  and refuses unless the sync has already made no promo canonical. `--apply`
  is one transaction that locks `cube_cards`, moves every promo row in every
  section and every promo cover, merges into an existing row up to 99 copies,
  logs one `printing_switched` per cube, section and promo with no actor and
  one shared timestamp, and rolls back unless no promo is left and every cube's
  copy count is unchanged. **It does not bump `cubes.updated_at`**: that would
  push every touched cube to the top of the recency lists for a change its
  owner did not make. It writes a gitignored `retire-promos-*.json` journal so
  a run can be reversed exactly, and a second run finds nothing to do.
  **Production's order is sync, `retire-promos` (report), `retire-promos --apply`,
  then deploy, then one more `retire-promos`** expecting nothing, to catch a
  promo added in the window between the apply and the deploy.

## Still open

- The Riot adapter stays dormant until our API application is approved.
