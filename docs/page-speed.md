# Page speed

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

Measured on the 206-card cube, warm, after both changes: cube page 297ms in
production (486ms under `npm run dev`), editor 351ms (589ms), `/cubes` 299ms.
**Roughly half of what you feel locally is Turbopack**, so measure against
`npm run build && npx next start` before concluding something is slow.
