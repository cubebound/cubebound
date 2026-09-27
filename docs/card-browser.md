# The card browser

## Filters, sorting and caching

- Filter dropdowns are built from the **distinct values actually in the DB**, then sorted by the canonical lists in `src/lib/riftbound.ts` with unrecognized values kept at the end (`sortByCanonical`). A new set's new rarity therefore appears without a code change — `Promo` already does, and is not in `RARITIES`. That is also why sorting asserts on a **rank**, not a value: "sort by rarity ends at Showcase" is wrong, because `Promo` sorts after it.
- **Tokens are not cards, so no view of the pool shows one.** Recruit, Sprite,
  Gold and the rest are rows in `cards` because the source serves them, but
  nobody builds a cube out of them. `searchCards` (through `buildWhere`),
  `quickSearchCards`, every branch of `readFilterOptions` and
  `getImportCatalog` leave them out, so no filter offers a value only a token
  carries; a new filter branch needs the same `where`. The predicate is
  `isTokenCard` in `src/lib/card-ids.ts`, mirrored in SQL by
  `tokenCard`/`realCard` in `src/db/queries/cards.ts`, which binds the same
  `TOKEN_ID_PATTERN` so there is one source for both. **A token is supertype
  `Token` *or* a `SET-Tnn` id, and both halves are needed**: production holds
  retired-riftscribe token rows (`UNL-T0n`, see [card-data.md](card-data.md))
  with a null supertype that dev does not, so a supertype-only rule passes
  every check on dev and still leaks tokens in production. **The SQL compares
  with `is not distinct from`, never `=`**: an ordinary card's supertype is
  null, so `=` turns the whole negation null and every ordinary card silently
  drops out of the browser. A card merely *named* after a token ("Recruit the
  Vanguard") is a card and stays. **The by-id reads are deliberately
  unfiltered** (`getCardById`, `getCardsByIds`, `getPrintings*`), so a token
  already sitting in a cube can still be shown, removed and logged. What the
  add paths do about tokens is in [cube-editor.md](cube-editor.md).
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
  names itself like every other filter value. Ordered
  by **name**, not code: the codes interleave promos through the real sets
  (JDG, OGN, OGS, OPP, PR…), which reads as no order at all.
- **Sorting is `?sort=` over set (default), played ("Most played", see below),
  name, energy, type and rarity.** `CARD_SORTS` order is the dropdown's order,
  and "Most played" sits second because at the bottom of the list nobody found
  it. Rarity
  and type rank against the canonical lists rather than sorting alphabetically,
  and **`CARD_TYPE_ORDER` is not `CARD_TYPES`** — the latter is display
  vocabulary including "Champion Unit" and "Signature Spell", which are a `type`
  plus a `supertype` and match no row's `type` column, so ranking against it
  would drop every card into the fallback bucket. Every ordering ends with the
  printed order as its tie-break, since 220 cards share cost 2.

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

## How often a card is cubed, on screen

The snapshot and its arithmetic belong elsewhere: the read is
[discovery.md](discovery.md)'s, and the rounding and floor rules are
`src/lib/card-popularity.ts`'s, asserted by `check:popularity`. What follows is
only how those numbers reach a page.

- **A client component receives a label, never a number.** `CardDetail` takes an
  optional `CardPopularityView` — one formatted string ("In 34% of cubes") and a
  href — and renders it as a bordered block at the very bottom, **below** the
  caller's `footer`: in the editor the Section picker and the remove buttons are
  why the box was opened, and outside it the Add control below is, and the
  statistics are context. Nothing on
  the browser side divides, rounds or decides a threshold, so the
  never-a-false-0% and never-a-false-100% rules cannot be reimplemented
  differently on each surface that shows the modal. A card nobody has
  cubed is **absent from the map** rather than present at 0%, so the block does
  not render at all and the prop stays optional: a surface that has not built a
  map is unchanged.
- **"Cards commonly cubed with {card}" is a plain text link, gated on the href
  being non-null**, which is
  how the distinct-owner floor reaches the UI: below it `popularityForCards`
  hands over a label and no link, so a pairing list that would really be a
  description of one or two people's cubes has no link to reach it. The
  destination is `cardPagePath`, and that page exists: a table, ranked by
  pairing strength, of the cards showing up alongside this one more often than they do in cubes
  overall, under a line saying how often the card itself is cubed and above a
  footnote saying private cubes were counted and that no cube or owner is ever
  named. The floor is the same one the link checks, applied again in the route;
  what 404s there and why is [routes.md](routes.md)'s.
- **Each row of that table opens the same detail box the browser does.** The
  image and the name both open `CardDetail`, with its own popularity line, so a
  reader can judge a card without leaving the page; the arrow in the last column
  goes to that card's own page and is drawn only when it clears the owner floor.
  That is why `getRepresentativeCardsByKeys` returns full `BrowseCard`s rather
  than a narrow row: the box shows rules text and full art, and fetching them on
  click would put a spinner where the reader is already waiting.
- **The "With {card}" and "Overall" dials are filled from the rounded label,
  never from a ratio.** `pairing-table.tsx` parses the fill back out of "46%",
  because an exact share of a small denominator (6/13) is a cube count by
  another name, and the browser must receive nothing more precise than what is
  printed. "under 1%" draws as a sliver and prints "<1%", making the same
  promise the label does: present means not zero.
- **The Pairing column ("3.1×") is what the table is sorted by, and it is the
  two printed percentages divided, not the exact lift.** `pairingStrength`
  divides the *rounded* labels to one decimal, reading "under 1%" as 1, and
  `commonlyCubedWith` sorts on that first, then exact lift, shared cubes and
  key. Two reasons. Sorting by exact lift while showing a rounded ratio put
  "3.1×" under "2.8×", which reads as a broken order; and an exact ratio of
  small counts would disclose them, which is what the percentages exist to
  prevent. Which cards make the list is unchanged: lift above 1, with
  `MIN_SHARED_CUBES` support.
- **That page's URL is resolved forwards, never parsed.** Slugifying is lossy —
  Kai'Sa becomes `kaisa`, and a legend's slug carries the champion its `name`
  column does not — so `findCardByPath` builds the path for every card and
  compares, rather than trying to turn a slug back into a name. The consequence
  is the one worth having: the canonical spelling is the *only* one that
  resolves, so `/cards/Unit/Kaisa` 404s instead of becoming a second URL for one
  page. It costs a whole-pool read, `getCardIdentities`, memoised on
  `CARD_POOL_TTL_MS` like the filter options and wrapped in `cache()` as
  `loadCardIdentities` because the layout, the metadata and the page each ask
  for it. `check:printings` asserts those paths are unique across the pool and
  identical across a card's printings: a collision would make one of the pair
  unreachable and let pool order decide which.
- **The map is built for the cards a page actually renders, and never for the
  pool.** Keyed by printing id, because the modal opens a *printing* while
  popularity is a property of the card. `/cards` folds it into the existing
  `Promise.all` over the page's results; the cube page builds it over the
  maybeboard rows or the cube rows depending on the tab, and only when the tab
  shows cards at all; the editor builds it over the browse results in browse mode
  and over `rendered` otherwise, and only in the three modes with a modal to put
  a line in; a card page builds it over its pairing rows. Two reasons it is not built wider: at most sixty cards are on screen
  against a snapshot covering every qualifying cube, and — the part that is not
  an optimisation — **`PopularitySnapshot` must never cross to the browser**,
  because it carries per-cube card lists for cubes their owners marked private.
  `popularityForCards` is the reduction that makes the value safe to serialise,
  so a new surface calls it rather than passing the snapshot down.
- **`sort=played` ships the counts as one bound `jsonb` parameter.** It is the
  only ordering whose key is not a column: `orderFor` reads
  `$1::jsonb ->> collapseKeyOf(name, type)`, coalesced to 0 for everything the
  snapshot does not mention. One parameter whatever the pool size, and — the part
  that matters — the values stay **bound**. The obvious alternative, a
  `CASE WHEN name = '…'` ladder built by concatenation, would put names that come
  from a synced source straight into SQL text. Ties break on **name** and then the
  printed order, because past the staples most of the pool shares a count and
  alphabetical beats whatever the plan happens to return.
- **The snapshot is imported lazily, inside `runSearchCards`.** A static
  `import` of `queries/discovery.ts` here closes the cycle
  `cards → discovery → cubes → cards`, which ESM resolves by handing one module a
  half-initialised import and failing at some unrelated line. It is awaited in
  `runSearchCards` rather than in `orderFor`, which has to stay synchronous.
- `check:card-filters` asserts the ordering against the snapshot itself, because
  both halves of that lookup fail *quietly*: a key that never matches coalesces
  to zero for every row, which is a page in plain alphabetical order and reads as
  a choice rather than a fault.

## Adding to a cube from the detail box

Outside the editor, the detail box on `/cards` and on a card page carries
`AddToCube` (`src/components/add-to-cube.tsx`) as its `footer`: "Add to {cube}
· Change" and an Add button, for a signed-in owner. Signed out, it renders
nothing.

- **The target is resolved when the box opens, in one request, not when the
  page renders.** `addTargetAction` answers `signedOut`, or the target cube and
  how many copies of the card it holds, counted across printings by `base_id`.
  The root layout already verifies the viewer for the nav, so deciding at render
  time would be a second auth call on every `/cards` load for a control most
  visitors never touch. With no session cookie the signed-out answer costs no
  network call.
- **The default is the cube the reader last had open, and the server decides
  whether that still counts.** The editor page renders `RememberCube`, which
  writes the cube id to `localStorage` (`cubebound:last-cube`); choosing or
  adding writes it too. That value is a per-device convenience and nothing
  more: `addTargetAction` re-checks it with `canEditCube` like any id from a
  client, and falls back to the owner's most recently edited cube,
  `listCubeChoices(ownerId, 1)`. Storage access is wrapped in `try`, because it
  throws in some private windows.
- **The full list loads only when the reader presses Change.** Most people are
  adding to one cube, and it is already on screen, so `listCubeChoicesAction`
  waits to be asked; `cubeCopiesAction` re-reads the count after a switch.
  `listCubeChoices` is deliberately not `searchCubes`: a picker shows no card
  count and no cover, and those are what that query costs.
- **The add itself is the editor's `addCardAction`**, so this is one more add
  path under the guards [cube-editor.md](cube-editor.md) describes rather than a
  new one: ownership, suspension, the token refusal, the default section and the
  change log all apply unchanged. Every call in the component catches a rejected
  promise, per the root rule.
