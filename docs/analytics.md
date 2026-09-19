# Analytics

The cube page's Analytics tab. Everything comes from one `analyzeCube` call in
`src/lib/cube-analytics.ts` over the cards the page already loaded — pure,
synchronous, no extra queries — and renders through hand-drawn SVG in
`src/components/charts.tsx`.

- **No charting library.** Every panel is a static picture of server-computed
  numbers with no interaction, so a library would ship a client bundle and force
  these into client components to draw what a few `<circle>`s already do. The
  whole tab works with JavaScript off. A donut is one circle per slice using
  `stroke-dasharray`, which cannot produce a malformed arc path the way hand-built
  `d` attributes can.
- **Counts are copies, not rows**, like everywhere else — a cube running three
  of a card contributes three to its curve.
- **Costless cards are excluded from the energy curve, not bucketed at zero.**
  Legends, runes and battlefields have no energy cost at all — 243 of 1,288
  printings — and a "0" column full of them invents a spike that says nothing
  about how the cube ramps. The count is reported in the panel's subtitle so the
  number is visible rather than silently missing. A genuine 0-cost spell still
  lands in 0, and a card with a *power* cost but no energy cost is on the curve.
- **Two-domain cards count once, in a Multi bucket**, so the slices sum to the
  cube's size and the donut reads as a share. The curve stacks by single domain
  plus Multi rather than giving every pair its own segment the way the text view
  gives every pair its own column: eighteen stacks per bar is mud, and a curve
  answers "how does this ramp", not "what exact pair is this".
- Multi is drawn as a **gradient**, never a flat colour — nothing flat means
  "more than one domain" without colliding with a real one, and gold reads as
  Order. Same reason the text view blends a pair's tint.
- **Types are `type` + `supertype`.** A breakdown by raw `type` folds 323
  champion units in with ordinary ones. `Champion` and `Signature` are promoted
  into the display name; `Token` and `Basic` are **not**, because they describe
  the printing rather than what the card does.
- **Keywords are read from the rules text, not from `cards.keywords`.** That
  column is empty on every row and no source has ever populated it, so a
  breakdown from it would render an empty panel. Riftbound prints keywords in
  brackets — `[Deflect]`, `[Shield 2]`, `[Accelerate]` — and `parseRulesText`
  already extracts them. Normalisation folds a trailing value (`[Shield 2]` and
  `[Shield 3]` are one keyword), folds case (the source has both `[ADD]` and
  `[Add]`), and drops the markers that are not keywords: `&gt;` / `&gt;&gt;`,
  which separate cost from effect, and the `NO TEXT` placeholder. Done at render
  time, so it works on rows already stored and needs no re-sync.
  `cards.keywords` is consequently **not selected by `browseColumns`** — it was
  fetched on every card query and read by nothing. The column and the sync's
  writes stay, so a source that starts filling it loses nothing; select it again
  when something reads it.
- Word counts run on `rulesTextToPlain`, so a card isn't scored as verbose for
  carrying symbols.
