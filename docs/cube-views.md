# Cube list views

## Text and visual

- The cube list renders in two views: `visual` (image tiles) and `text`
  (`src/components/cube-table.tsx`). The text view reads domain → type → cost:
  a column per domain, split into Units / Gear / Spells inside the main section
  only, then cost groups with counts. Champion Units are `type = 'Unit'` and
  Signature Spells are `type = 'Spell'`, so they land in the right subgroup for
  free; an unrecognized type gets its own subgroup at the end rather than being
  dropped.
- **The type subgroup header is a filled band, and it has to outrank the cost
  header under it.** At `text-subtle`/`font-medium` the two were the same size
  and near the same weight, so "Units (4)" read as a peer of the "2 (1)" inside
  each cost cell rather than as the thing containing it — the hierarchy was
  inverted, and the view is meant to be scanned. It is now uppercase, semibold,
  `text-ink`, on `bg-ink/12`. One class covers both themes because `--ink` flips
  with the theme: a pale grey wash on white, a faint lift on black. **The band
  is neutral, never the column's domain colour** — the domain is already what
  tints every cost cell beneath it, and repeating it in the header is a dozen
  coloured bands down one page. Cube Cobra's list scans for the same reason, but
  it also boxes each group; that was tried and rejected here, because the cost
  cells are already bordered and it nests a border inside a border for about
  four extra pixels of height per group on a page that can run to 500 cards.
- **Columns wrap; they never shrink to fit and never scroll
  sideways.** The count per row steps at breakpoints — 8 at ≥1280px, 4 at
  ≥768px, 3 below, never fewer — and columns flex within a tier, which is how
  Cube Cobra keeps names readable at every width. Squeezing all of them onto
  one row was tried and fails on real data: a cube spanning 18 domain
  combinations left each column ~63px, truncating names to about six
  characters. The tier is read through `useSyncExternalStore` so the value
  stays out of render-time state and the server still gets a defined snapshot.
  The grid is also capped at `columns × 11rem` so a section with fewer columns
  than the tier allows (Battlefields has one) doesn't stretch across the page.
  Cost cells
  are tinted with their domain colour mixed against `--tint-base`, which flips
  between white and near-black so one mix percentage stays legible in both
  themes.
- **A cube's visual view is image only** — no caption strip, no controls under
  the tile. The art carries the name, cost and domain in a form people read
  faster than a caption, and dropping it is what lets ten fit on a row and stay
  legible. Per-copy controls live in the card detail modal one click away, which
  is why `CubeSections` no longer takes a `copyAction`. `CardTile`'s `bare` prop
  does this; the card browser and browse grid keep their captions, because there
  you are scanning for a name you have not found yet.
- **The list view's power indicator sits hard against the right edge** and is
  the last thing in the row (`gap-0.5 pl-1.5 pr-0.5`, measured at 2px of
  clearance, with the name taking ~81% of the row). A hover-revealed `×` used
  to follow it, and **an `opacity-0` control still holds its width** — so it
  cost about sixteen pixels of name on every row to show something that was
  invisible most of the time, in the view whose entire job is showing names.
  Removing a copy is a click on the card and **"Remove this copy"** in the panel
  that opens, which is where the section and printing controls already live.
  That is why `CubeSections` and `CubeTable` no longer take `onRemoveOne` or
  `busyKey`.
- **A text-view row shows its power cost as a count plus one domain dot**
  (`PowerCost` in `src/components/card-visuals.tsx`), right-aligned after the
  name. Power was invisible in both cube views before — it rendered only in the
  card detail modal — so judging a cube's colour commitment cost a hover per
  card, on the view whose whole point is scanning the cube at once. It is a
  *count*, not `PowerPips`' dot-per-pip: a row has about 19px to spare beside a
  name that already truncates, and a run of pips grows with the cost and would
  need an arbitrary cap, where a digit is constant width at any cost. The cell
  header above already states the energy, so the row does not repeat it.
  **The indicator carries no `title`** — a tooltip there lands on top of the
  hover preview the same gesture opens, which is why the card name lost its own
  `title`; an `aria-label` says the same words without drawing anything. Grouping
  and sorting are untouched: cells still bucket on `energyCost`, so a
  power-cost-only card still sits under `—` and shows its pips there.
- **A multi-domain card's power dot takes the card's own domains**, the same
  hard-banded split `domainDot` draws in the column header above it. Every
  source reports power as one integer and cannot say which domain the pips
  belong to, so `buildPowerCost` stores that case as `{"any": n}` rather than
  inventing a split. Showing the card's domains claims no more than the header
  already does — the pips certainly belong to those domains — and it beat the
  first version, a hollow ring, which read as an empty gap at 10px. A *named*
  domain in `power_cost` still wins over the fallback, so a source that ever
  provides per-domain pips needs no change here. Fixing the underlying
  imprecision needs that source, not a schema or display change; the raw stats
  are kept in `cards.data` for exactly that. `totalPips` in
  `src/lib/riftbound.ts` is the one definition of "how much power", shared by
  this indicator and by `displayCost`.
- **Multi-domain cards get a column per pair** (Fury/Chaos, Fury/Order, ...),
  not one shared "Multi" bucket — nearly every legend has two domains, so a
  single bucket would swallow most of them and say nothing. Columns sort as:
  single domains in the game's order, then Colorless, then the pairs ordered by
  their own domains. A pair's tint is a diagonal blend of its two colours and
  its header dot is a hard split; a blend would be mud at 10px, and a
  "multicolour gold" would collide with Order.
- **Hovering a row in the text view shows the card.** The list trades pictures
  for density, which is its whole point, but "which card is that" then costs a
  click into the modal. `CardHoverPreview` gives the picture back without
  giving up the density, and keyboard focus shows it too, anchored to the row
  since there is no cursor. It is positioned `fixed`, not absolute: the columns
  and cost cells it floats over have their own overflow and stacking contexts
  and would clip it. Near the right edge it flips to the other side of the
  cursor and it is clamped vertically, so a row at the bottom of a long cube
  still previews in full.
- The visual view sorts by domain, then by cost, with the cards that have
  **neither** an energy nor a power cost kept together at the end rather than
  scattered as if they were zero-cost — legends, runes and battlefields are off
  that scale entirely. Both views order domains through `compareColumns` in
  `src/lib/domain-columns.ts`, which is shared precisely so "sorted by colour"
  cannot come to mean two different things.
- The visual view carries a floating **Back to top** button, since image tiles
  make for a very long page. It appears only past 600px of scroll and sits
  above the editor's Edit button; both are bottom-right, and stacking
  keeps either from shifting depending on whether the other is rendered.
- View resolution is `?view=` first, then the
  `cubebound.cube-view2` cookie, then **text**; the toggle writes both, so a shared
  link shows what the sender saw while a personal preference follows you between
  cubes. See `src/lib/cube-view.ts`. Text is the default because the first
  question about a cube is what's *in* it, and the list answers that on one
  screen — 360 image tiles is several screens of scrolling and a few megabytes
  before you can tell.
- **The cookie name is versioned, and changing the default means bumping it.**
  The cookie is pinned for a year and beats the default by design, so switching
  the default from visual to text changed nothing for anyone who had ever
  touched the toggle — which is everyone who uses the site. `…-view2` retires
  those pins once; the next explicit choice re-pins under the new name.
- **The visual view's density is a cookie and never a URL param**, which is the
  opposite of `?view=` and for a reason worth keeping straight. The view toggle
  selects what the *server* renders, so it belongs in a link. The column count
  is only a CSS class on a list the server has already sent, so a param would
  spend a round trip on a dynamic route to change a class. `cubebound.cards-per-row`
  holds 4, 6, 8 or 10 — the select offers exactly those, so its option list and
  this cookie's valid values are the same array; the server reads it into the props and
  `CardsPerRowProvider` holds it as client state so a click re-lays-out on its
  own frame. Same versioning rule as `…-view2` applies if the default ever moves.
- **The grid classes live in `cardGrid` in `src/lib/ui.ts`, and every one is a
  source literal.** Tailwind scans source text, so a computed
  `grid-cols-${n}` emits no CSS at all and the grid silently collapses to one
  column — hence a map rather than a function. `CARD_GRID_CLASS` is just
  `cardGrid.auto`, so the card browser and the editor's browse grid keep the
  responsive default and are untouched by the density control, which reads
  context and is `undefined` outside a provider.
