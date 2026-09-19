# Discovery and following

One query backs every cube list on the site — `searchCubes` in
`src/db/queries/discovery.ts`, rendered by `src/components/cube-results.tsx`.
Explore, Your cubes and Followed cubes are the same call with a different
restriction, so a row cannot come to mean two different things depending on
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
