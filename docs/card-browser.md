# The card browser

## Filters, sorting and caching

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
