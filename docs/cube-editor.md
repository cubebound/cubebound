# The cube editor

- **Both cube pages have the same five tabs, always all of them**, defined once
  in `src/lib/cube-tabs.ts`: **Mainboard · Maybeboard · Primer · Analytics ·
  Change log**. Nothing is hidden and nothing depends on who is looking, so the
  row is a constant — it used to change shape from cube to cube, with Primer
  third on one and absent on the next, because the public page hid empty tabs
  and the editor did not. Each tab carries its own empty state instead, which
  every one of them needed anyway. Editing is not a tab: it lives in the action
  bar above the list, which is what keeps the row identical for owners and
  visitors. The two pages keep their own query parameter — the editor is on
  `?mode=` because `browse` and `import` share it — so that module owns *which
  tabs exist and in what order*, and the pages own their URLs.
- **`browse` and `import` are modes, not tabs.** Nothing points at them from the
  tab row; they are reached from links inside the edit panel and by URL.
  **Both routes must keep working**: `check:cube-ownership` and
  `check:browse-grid` navigate straight to `?mode=browse`.
- **Tab links are built from `CUBE_TABS.map`, so `modeLink`/`tabLink` set `key`
  on the element they return.** Missing it is a React warning rather than a
  crash, and the way that surfaced is worth knowing: in dev it makes Next POST
  to `/__nextjs_original-stack-frames`, which `check:cube-ownership` then
  captures instead of the Add server action, and the check fails with
  "replay is not exercising the action". A key warning presenting as a
  replay failure is not a connection anyone makes twice.
- The editor has the same five tabs, all on `/edit` behind `?mode=`. Default
  (no param): the cube is the page, and **the edit panel opens on demand** — a
  prominent Edit button, then a right-hand drawer on desktop and a bottom sheet
  below `lg`. It used to hold a permanent 20rem column, which taxed every visit
  for a panel you only want while editing. `?mode=browse` swaps in the full
  filter/grid browser **in place of** the cube list; `?mode=maybeboard`,
  `?mode=primer`, `?mode=analytics` and `?mode=log` are the other four tabs, and
  `?mode=import` is the bulk importer. Browse mode is only rendered when active,
  so the unfiltered card query isn't paid for on every editor load.
- **There is no "Browse cards" tab, deliberately.** Browse is the heaviest read
  on the site, and leading with it is what turned a run of edits into a run of
  round trips. Its slot in the tab row is the Edit trigger; browse is still
  reachable from a link inside the panel and by URL, and **the route must keep
  working** — `check:cube-ownership` and `check:browse-grid` both navigate
  straight to `?mode=browse`, so removing the route (rather than the tab) fails
  the build.
- **Two Edit triggers, never both on screen.** One sits in the action bar above
  the list; a floating one takes over past 400px of scroll, which a 400-card
  cube passes immediately. Showing both at once would read as a bug, so the
  floating one is conditional rather than always present.
  **It opens on the board whose tab you are on** — editing from Maybeboard and
  defaulting to Mainboard would file cards into a section you are not looking at.
- **No pending count on the button and no count in the tab labels.** The staged
  list inside the panel already says what is pending. `check:copies-and-log`
  separately forbids `×N` anywhere in the editor's HTML.
- **Density is a native `<select>` reading "6 Cards Per Row"** (`CardsPerRowSelect`),
  not four visible chips and no longer a `<details>` menu labelled `Display`.
  Chips beside a two-way view toggle are most of a phone's width; the menu fixed
  that but hid the current value behind a click, and named a category rather
  than the setting. A select wears its answer on its face and hands keyboard,
  type-ahead, touch and the platform's own picker to the browser, in place of an
  effect listening for outside clicks and Escape. The option text is the whole
  sentence for the same reason a bare `6` was not enough. It is always plural
  because `CARDS_PER_ROW` starts at four — a one-card option would need the
  singular, and the union type flags the dead branch if you write it. **It is
  hidden below `sm`, where it does nothing**: every entry in `cardGrid` is
  `grid-cols-2` at that width, so it would offer four choices with one outcome.
  If a `cardGrid` entry ever differs below `sm`, that breakpoint moves with it.
  **Nothing collapses into a JS-only menu**, because `check:public-cube`
  requires `>Share<` and `>Clone<` in the served HTML — a select is in the
  served HTML, which the popover it replaced only barely was.

- **The trigger renders only on tabs that show cards.** The panel edits the card list,
  so on Primer or Change log it is a button that does nothing you came to that
  tab to do, and its remove picker reads the cube, which the maybeboard tab is
  not showing.
- **Nothing scrolls sideways.** An earlier pass put the tabs on a horizontally
  scrolling strip, which traded four stacked rows for a hidden-content gesture
  and was worse. The row is twelve controls fighting for one header, so the fix
  was subtraction — View, the Import tab, the Browse tab and every count — not
  layout. Five tabs wrap to two rows at 320px and one row from `sm` up.
- **The panel stages changes and writes them on Save**, which is both how people
  actually edit a cube and the fix for a real fault — the panel it replaces
  wrote once per click, so a run of edits was a run of round trips against a
  pool of six. **Escape hides the panel and keeps the batch**; only Discard All
  throws it away, and a `beforeunload` warns if you leave with one pending,
  because staged work lives only in that tab.
- **It has two type-aheads and only one of them touches the database.** Add
  searches the whole card pool through `quickSearchAction` (two round trips per
  debounced keystroke). Remove/Replace searches **the cube's own contents**,
  which the page has already loaded to render the list, so it is passed down as
  a prop and filtered client-side for **no query at all**. The remove picker
  lists **one entry per copy** — two copies of a printing are two entries, and
  staging one leaves the other — so the reader picks the exact copy and there is
  no "which one did it mean" heuristic to get wrong.
- **Both lists are dropdowns: empty until you type, floating over the panel, and
  closed by picking.** Absolute positioning is load-bearing — growing the
  document as you type moved the Remove field down the panel while you were
  reaching for it. And **visibility is a *dismissal* flag, not a focus one.**
  Gating on "is this field focused" fails closed: any path where React does not
  see the focus event leaves a filled box with no list under it and the control
  looks broken. That happened. Starting visible and closing on an explicit
  dismissal — blur, Escape, or picking — fails open instead, which at worst
  shows a list a moment longer than it needs to.
- **The type-ahead searches the name a person types, not only the one we
  store.** A legend keeps just its title (`Eye of Twilight`, champion `Shen`),
  so "Shen, Eye of Twilight" matched nothing while the card sat there — no
  legend could be found by its full spelling, with or without Specify versions.
  `quickSearchCards` now also matches the rebuilt `champion, name`, guarded the
  way `withChampionPrefix` is so a champion *unit* does not become
  "Shen, Shen, Kinkou". This is the rule `aliasesFor` already applied to
  imports, so the two add paths finally agree; **`champion` is in
  `browseColumns` for it**, unlike `keywords`, because two things now read it.
- **A printing is labelled by its card id, not set + collector number.** An alt
  art shares a collector number with the printing it varies — `VEN-138` and
  `VEN-138a` are both 138 — so the obvious label renders them as two identical
  rows, which is precisely what Specify versions exists to tell apart. The id
  already *is* set-collector plus the variant suffix, so it reads the same and
  is unique.
  **The card detail modal follows the same rule**, and did not used to: it
  rendered `SET · #number · rarity`, which is identical for 170 rows across 85
  pairs — every alt art, every signature print, and the base printing each one
  varies. Opening `SFD-227` and then `SFD-227-star`, whose art differs only by a
  signature, showed the same picture under the same words and read as a bug.
  It now shows the id, the rarity and `printingTreatment` from
  `src/lib/card-ids.ts`, which puts the variant in words — "Signature",
  "Alt art", or the name's own parenthetical ("Metal", "Launch Exclusive").
  That helper is **descriptive only**; no grouping decision reads it.
- **Hovering a suggestion floats the card art**, through the same
  `useCardPreview` / `CardHoverPreview` pair the text view uses. It is `fixed`,
  so the drawer's own overflow cannot clip it, and it is why `HeldCard` carries
  `type`, `imageThumb` and `imageFull` — `type` decides portrait against
  landscape. Note React synthesises `onMouseEnter` from `mouseover`, so a test
  that dispatches a native `mouseenter` will never reach it; dispatch
  `mousemove`.
- **Picking a suggestion fills the box; the button commits it.** Nothing is
  staged by clicking a row. **Add takes only the card above it** and leaves
  whatever sits in Remove alone; **Remove/Replace is a swap when both are
  filled** and a plain removal when only it is. That asymmetry is the point:
  queueing a replacement should not force you to go through with it.
- **The Board control is Mainboard or Maybeboard, and Mainboard is not a
  section.** It means "file this the way the cube files things", so
  `sectionForBoard` sends a Legend to `legends` and a Rune to `runes` via the
  existing `defaultSectionForType`. That is what lets a two-board control sit
  over six sections; the staged row shows the section it resolved to, so it
  never says one thing and does another.
- **"Specify versions" is the printing picker.** Off, suggestions are one entry
  per card (the `base_id` grouping); on, every printing is its own suggestion.
  That is why the type-ahead no longer prefetches printings — the checkbox
  *is* the mechanism, so there is nothing to lazy-load.
- **The Edit trigger must never render `×N`.** `check:copies-and-log` asserts the
  editor's HTML carries no ×N notation and the trigger renders server-side, so
  the staged count reads `Edit (3)`.

- `cubes.primer` is a long-form markdown write-up, separate from the one-line
  `description`, edited on the editor's Primer tab and rendered by
  `src/components/primer.tsx`. **Never render it as HTML.** `rehype-raw` is
  deliberately absent so embedded HTML is never parsed; `rehype-sanitize` runs
  as a second layer with a narrowed tag list, and `urlTransform` allows only
  http/https/mailto. `npm run check:primer-safety` renders hostile markdown
  through the real component and fails if anything executable survives — run it
  after touching that component. The public cube view renders the primer with
  the same component.
- **The primer editor has a formatting toolbar, and it is a toolbar rather than
  a WYSIWYG editor.** The primer is stored as markdown and rendered with
  `rehype-sanitize` and no `rehype-raw`, so a rich-text surface would have to
  round-trip HTML back into markdown to be storable, and anything it could
  express that markdown cannot would be silently stripped on the way out.
  Buttons that write markdown keep one representation and leave the source
  readable. "Font size" maps to **headings**, because markdown has no font sizes
  and offering them would mean raw HTML.
- **Every toolbar operation toggles**, and the transforms live in
  `src/lib/markdown-edit.ts` — pure, so `check:markdown-edit` covers all of them
  without a browser. The cases worth knowing: unwrapping looks *outside* the
  selection as well as inside, because double-clicking a word in `**bold**`
  selects the word and not the asterisks (without that, Bold yields
  `****bold****`); a heading strips whatever prefix is already there rather than
  stacking `## # Title`; and a selection ending at the very start of the next
  line formats one line, not two.
- **Edits go through `document.execCommand("insertText")`.** It is deprecated,
  and it is still the only way to change a textarea while keeping the browser's
  native undo stack — Ctrl+Z after clicking Bold has to work, and assigning
  `value` clears the undo history outright. `diffRange` narrows each edit to the
  changed run so one click is one undo step rather than a whole-document swap.
  The buttons and the Ctrl/Cmd shortcuts share `applyEdit`, so they cannot drift.
- **A `<textarea>` submits CRLF whatever was typed into it**, per the HTML spec,
  so `updatePrimerAction` normalises to LF before storing. Without that the
  saved primer never equalled the editor's own `draft`, and its dirty check
  (`draft !== primer`) reported "Unsaved changes" the instant a save succeeded.
  Markdown renders either way, which is exactly why it went unnoticed for so
  long. Any other textarea-backed field has the same trap.
- **Every copy is its own entry in the UI.** `cube_cards` stores a quantity per
  (card, section) because two copies of one printing are genuinely identical,
  but nothing renders "×3" — a cube running three of a card shows three
  entries, each with its own section and printing control. `expandCopies` in
  `src/lib/cube-cards.ts` does the expansion; counts everywhere are copies, not
  rows, via `countCopies`.
- Per-copy edits move exactly one copy. "Put this copy in the sideboard" and
  "make this copy the alt art" are the same operation — take one off the source
  slot, add one to the target — and both merge into whatever is already there
  rather than dropping the copy being moved. Never write an action that moves a
  whole row when the UI is showing individual copies.
- The text view labels rows with their printing id only when a card sits in one
  section under more than one printing (`ambiguousBaseIds`); otherwise the
  names alone are unambiguous and the ids are noise.
- **A cube edit made in the panel is staged, and `saveCubeEditsAction` writes a
  whole session at once.** One entry per card change still lands in the log,
  using the existing kinds — the batching is how the writes happen, not how they
  are recorded, so history stays as granular as it is for single edits and
  `change-log.tsx` needed no change. Order is **removes, then replaces, then
  adds**: a remove must not consume a copy the same batch just added, and
  replaces go before adds because `moveOneCopy` decrements the source before
  merging with `least(99, …)`, so at the cap it silently drops a copy — better
  an added one than an existing one. Removes are one statement
  (`removeCubeCardCopies`) and adds are one upsert; the replace loop is a
  knowing exception to the fan-out rule, because each is a distinct
  (from, to, section) triple and a batch carries a handful at most.
  **A replace is only a `printing_switched` when both sides share a `base_id`** —
  the same rule `swapPrintingAction` applies one edit at a time — and otherwise
  logs as a removal plus an addition, because that is what it is.
- **Bulk import never guesses.** The Import tab parses a pasted list
  (`src/lib/import-list.ts`, pure and catalog-driven): optional leading
  quantity (`2 Fury Rune` / `2x Fury Rune`), `#` and `//` comments, and
  `Legends:`-style headers that set the section for the lines beneath, falling
  back to `defaultSectionForType`. Matching is case-insensitive and exact on
  the name; a miss becomes an **unmatched** line with suggestions to pick from,
  and a name resolving to two distinct cards becomes an **ambiguity** — neither
  is ever auto-resolved. Normalization folds case, whitespace and smart quotes
  but deliberately **not** punctuation, because "Daisy!" is a real card name and
  collapsing it would be exactly the silent guess this avoids. Capped at
  `MAX_IMPORT_LINES`. Cards also answer to their **"Champion - Title"**
  spelling, which is how vendor and buylist exports print them
  (`aliasesFor`): a stored `Akali, Silent` aliases to `Akali - Silent` by
  punctuation alone, and a legend stored as `Rogue Assassin` aliases through
  its champion to `Akali - Rogue Assassin`. Aliases are consulted only after
  real names, never shadow one, and two cards sharing an alias is an ambiguity.
  Without this a real 426-line buylist missed on all 111 of its champion lines.
  The preview writes nothing; commit takes resolved rows
  rather than re-parsing, so the user's picks survive, and re-validates every
  one server-side through `mergeImportRows`. Imports append and increment, and
  log as a single `cards_imported` batch. No name in the pool maps to two cards
  today, so `check:import` covers ambiguity with a synthetic catalog.
- **The maybeboard is not part of the cube.** It holds cards you are
  *considering*; the sideboard holds cards deliberately taken out. Neither is
  drafted, and the maybeboard is excluded from the cube's card count and from
  the stacked cube list — counting it would make a 300-card cube read as 340.
  That is what `CUBE_LIST_SECTIONS` is for: `CUBE_SECTIONS` stays complete so
  every section dropdown offers the maybeboard as a move target, while the list
  and the counts use the shorter one. It gets its own tab, `?tab=maybeboard`
  publicly and `?mode=maybeboard` in the editor, and the public tab appears only
  when it holds something — an empty shortlist on someone else's cube is noise.
  Moving in and out is the ordinary section move, so nothing new had to be
  written for it, and `Maybeboard:` works as an import header.
- **Runes are optional content.** A cube with no runes is a legitimate cube, so
  never warn about their absence or treat any section as required.
- **An account holds at most `MAX_CUBES_PER_USER` (25) cubes.** Not a product
  decision so much as an abuse ceiling: field lengths were capped but nothing
  bounded the row count. Enforced at write time on **both** creation paths —
  creating and cloning — because a cap on one of them is not a cap, and cloning
  is the easier one to automate.
