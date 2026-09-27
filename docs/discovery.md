# Discovery and following

One query backs every cube list on the site — `searchCubes` in
`src/db/queries/discovery.ts`, rendered by `src/components/cube-results.tsx`.
Explore, Your cubes, Followed cubes and the new-cube screen's clone list are the
same call with a different restriction, so a row cannot come to mean two different things depending on
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
- **`minCards` and `omitCover` exist for lists that are not Explore.**
  `minCards` counts the same way every card count does, maybeboard excluded.
  `omitCover` returns a null cover without running the cover subquery, which is
  most of what this query costs (see [page-speed.md](page-speed.md)), so a list
  that shows no art does not pay for it. The new-cube screen's clone list uses
  both; see [cube-access.md](cube-access.md).
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

## How often a card is cubed

`readCubeCardSets` and `getCardPopularity`, in the same file, are the read
behind every percentage the site publishes about a card. The arithmetic on top
of them is the pure module `src/lib/card-popularity.ts`, which
`check:popularity` owns; what follows is only the read.

- **The denominator is every cube holding at least `STATS_MIN_CARDS` cards,
  private and unlisted included.** Private cubes are most of what people
  build, so a public-only denominator would describe the handful of people who
  publish rather than the format. The floor is the same number the cube's own
  page shows: quantity-aware, maybeboard excluded, and with no opinion about
  tokens. What a cube then *contributes* is narrower than what got it over that
  floor. The maybeboard is excluded again at
  the join — it is a shortlist of cards someone is *considering*, so it neither
  carries a cube over the floor nor puts a card into the numerator. Tokens are
  out through the shared `realCard`, and basic runes through `notBasicRune`,
  which is local to this file because it is this reader's idea of "a card
  someone picked" rather than the site's idea of what a card is: every rune deck
  is basics, so counting them would put six cards at the top of every pairing
  list saying nothing.
- **It goes through the private `conditions()`, and deliberately not through
  `searchCubes`.** The numbers are computed over cubes nobody else can see, so
  this is the one surface where a moderation miss leaves no witness — nobody
  reading a percentage can tell which cubes it counted (see
  [moderation.md](moderation.md)). `conditions()` is where that exclusion
  already lives for every listing, and reusing it means the statistics cannot
  drift from it. `searchCubes` would also drag the cover-image subquery in per
  row, which is most of what that query costs and all of it wasted here.
- **One statement, one row per cube**, with `array_agg(distinct …)` over
  `collapseKeyOf` from `queries/cards.ts`, so copies and printings of the same
  card count as one membership under the same collapse rule the browser uses
  ([printings.md](printings.md)). The correlated card count inside
  `conditions()` survives the outer query joining `cube_cards` itself, because
  the subquery's own `from cube_cards` shadows the outer range variable while
  `cubes` still correlates outward. Worth knowing before adding a second join.
- **An hour of TTL, against the card pool's five minutes.** These numbers
  describe what people have *built*, so they cannot be pinned to the sync the
  way the filter options are — but nothing on screen is wrong for being an hour
  behind, because a percentage over hundreds of cubes does not visibly move when
  one card is added.
- **The shared in-flight promise is the point of the memo, not a refinement of
  it.** A TTL only deduplicates calls that arrive after the first has
  *finished*; concurrent ones each miss and each fire their own read. That is
  the burst against a pool of six that took the site down
  ([page-speed.md](page-speed.md)), and this read scans every qualifying cube
  rather than a page of sixty. The promise is cleared in a `finally` so one bad
  read does not wedge every later caller onto a rejected one. `check:pool`
  asserts both halves, the coalescing by object identity rather than by timing.
- **It throws rather than returning an empty snapshot**, matching
  `getFilterOptions`: a silent zero would publish "0% of cubes" under a card
  people do cube, which is a wrong statement rather than a missing one, so a
  caller that would rather degrade than fail catches it itself. **Everywhere
  the stat is an extra, a caller does:** the card browser and both cube pages
  load it through `loadCardPopularityIfAvailable`, which reports to Sentry and
  returns null so the modal shows no line, and the "Most played" sort falls back
  to printed order. A caught error never reaches `onRequestError`, which is why
  both report explicitly. Only the card page and the sitemap see the throw: the
  card page's layout because there the numbers *are* the page, and a caught
  failure could only become an empty page or a 404 telling a crawler it is
  gone; the sitemap because it drops just its card entries.
  `resetCardPopularityMemo` is for checks only — nothing in `src/` calls it,
  because the app has no event that should invalidate a statistic early and
  giving it one would mean deciding what does.
- `loadCardPopularity` in `src/lib/cube-request.ts` wraps the whole thing in
  `cache()`. The two layers answer different questions: the module memo decides
  how *stale* the numbers may be across requests, and `cache()` decides how many
  times a single render asks while the first await may not have resolved into
  the memo yet.
