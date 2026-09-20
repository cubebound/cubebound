# Chrome and theme

- **Colour is a semantic token layer in `globals.css`, not Tailwind's zinc
  scale.** `--surface` / `--surface-raised` / `--surface-sunken`, `--line` /
  `--line-strong`, `--ink` / `--ink-muted` / `--ink-subtle` / `--ink-hover`,
  `--hover`, and the two accents below. `@theme inline` exposes them as
  `bg-surface`, `border-line`, `text-muted` and so on. **The whole set is
  redefined under `.dark`, so a component that uses tokens needs no `dark:`
  variant at all** — `bg-white text-zinc-900 dark:bg-zinc-950
  dark:text-zinc-100` is `bg-surface text-ink`. That is the point of it: the
  same button style had been copied into 36 files as 74 raw class strings, so
  every palette change was 74 edits and the variants had already drifted. A
  literal `zinc-`, `bg-white` or `text-white` in `src/` is now a bug unless it
  is a red destructive button or an overlay sitting on card art.
- **Ground is deliberately not pure black.** `#09090b` with flat hairline
  borders gave every panel the page's own colour, which reads as harsh and
  unfinished. Dark is `--surface: #101013` with `--surface-raised: #17171b` one
  step above it, and the chrome, panels, menus and empty states sit on the
  raised value. Fields sit on `--surface-sunken` so they read as wells.
- **`--tint-base` must track `--surface-raised`.** It is what the cube table's
  domain tints are mixed against, and that table sits on a raised panel — if
  the two drift, one mix percentage stops reading the same in both themes,
  which is the whole reason the variable exists.
- **There are two accents, because one value cannot do both jobs at AA.**
  `--accent` carries text (links, active labels) and is toned down on light,
  where the brand `#ff6a2b` is only 2.75:1; `--accent-strong` is the brand
  orange itself, for shapes needing 3:1 — the focus ring, the nav's
  current-page bar, the mark. On dark the brand orange is 6.65:1 and both can
  be near it.
- **The accent marks state, never decoration.** It is the "you are here" signal
  — active tab, active nav item, selected segment, focus ring, links — and
  primary buttons stay high-contrast neutral (`bg-ink text-surface`). A page
  with three orange buttons reads as three warnings. Warnings are amber and
  deliberately a different hue; do not reach for the accent for them.
- **Fields are floored at 16px below `sm`, in one rule in `globals.css`.** iOS
  Safari zooms the whole page in when you focus a control whose text is under
  16px, and every field here is `text-sm` (14px) or smaller — so tapping the
  edit panel's Add field jumped the viewport and tapping away left it zoomed.
  **The fix is the font size, never `maximum-scale=1` on the viewport**: that
  stops the zoom by disabling pinch-zoom, which takes the page below the 200%
  WCAG asks for and breaks it for anyone who needs to magnify. It is one global
  rule for the same reason `:focus-visible` is — `card-filter-bar.tsx` and
  `cube-contents.tsx` both hand-roll their own control classes, and the next
  field someone adds cannot forget it. `!important` is deliberate: a bare
  element selector loses to a Tailwind utility. Checkboxes and radios are
  excluded, and above `sm` the designed sizes apply again. Verified that the
  larger text does not overflow 320px on the editor, browse, a cube page,
  `/cards` or `/login` — the filter bar's controls are fixed-width, so bigger
  text there could push the page sideways rather than reflow.
- **One `:focus-visible` rule in `globals.css` covers the whole site.** Before
  it there were two `focus-visible` rules in total and eight fields setting
  `focus:outline-none` with only a border tint to replace it, so keyboard users
  had no reliable indicator. Defining it globally means it also reaches
  controls no component file touches. **Never add `focus:outline-none`
  again** without providing a replacement indicator in the same change.
- **One cursor rule in `globals.css` gives every button a pointer**, next to
  that focus rule and there for the same reason. **Tailwind v4's Preflight
  leaves `<button>` on the browser default of `cursor: default`; v3 set
  `pointer`**, so the upgrade changed it silently and nothing failed — half the
  site simply looked unclickable. Share, Clone, Follow, the view toggle, the
  account menu, the theme switch and **every card name in the list view**, 47
  controls on that page alone, sat on the arrow while the tab row beside them
  did not, because an `<a href>` gets `pointer` from the UA stylesheet and a
  `<button>` never does. Two controls that look and behave alike disagreeing
  about the cursor is the tell. The rule covers `button`, `[role="button"]`,
  `summary` and `select`, each `:not(:disabled)` so a dead control does not
  invite the click — verified: a disabled button still reads `default`, which is
  why the card browser's Clear button correctly does. **Do not add
  `cursor-pointer` to a button again**; before this there were seven of them
  across six files, each added when someone noticed one control, and every new
  button needed noticing again. The three left are on `<label>`, which is not in
  the selector and gets no pointer from the browser either.
- **Shared class strings live in `src/lib/ui.ts`** — `btn`, `input`, `panel`,
  `tab`, `segment`, `cardTab`, `underlineTab`, `badge`, `menu`, `link`. Strings
  rather than components, in a plain `.ts` with no `"use client"`, so both
  server and client components can import them (the same rule under
  Conventions about shared *values* living in `src/lib/`) and so call sites
  stay free to add a layout class. **A new button or field takes one of these
  rather than a fresh class string** — that is the entire reason the file
  exists. `scripts/check-public-cube.mts` imports `btn.primarySm` to assert
  which action is prominent, so the check can never drift from the styling.
- **Type is Inter for body, Space Grotesk for headings and the wordmark**, both
  self-hosted through `next/font/google` — no external request, no layout
  shift, no dependency. `globals.css` applies the display face to `h1, h2, h3`
  in one rule, so the site's ~40 headings cannot drift apart and no heading
  needs its own `tracking-tight`. Inter carries the dense card tables on
  purpose: character at 12–14px is noise. Geist Mono stays for the error
  digest, the cube URL on Settings and `.primer code`.
- **Dark is the default, and the theme is a cookie, not a media query.** The
  card art is dark-bordered on a dark frame, so a light page puts a bright
  margin around every image. `resolveTheme` in `src/lib/theme.ts` falls back to
  dark when `cubebound.theme` is absent, the root layout reads that cookie and
  puts `dark` on `<html>`, and `globals.css` redefines `dark:` with
  `@custom-variant` so utilities follow the class rather than the OS. Deciding
  it on the server is what avoids the flash of the wrong theme; a client-side
  choice has to paint and then correct itself. The footer toggle flips the
  class directly and writes the cookie — presentation should change on the same
  frame as the click, and the cookie only has to be right for the *next*
  request.
- **The nav shows an avatar, not the username.** A spelled-out name has no
  upper bound: a 30-character one pushed Sign out past the right edge of a
  phone, which is the bug that prompted this. The avatar is a fixed 32px, the
  full name is in its `aria-label` and at the top of the menu it opens
  (Profile / Settings / Log out). Below `sm` the nav also drops "Your " from
  the cube and draft links, shrinks the logo and **hides the wordmark**,
  without which a 320px screen still overflowed. The nav is at its width
  budget: adding a sixth item means taking one away or collapsing them behind
  a menu, and the check is a 320px screenshot, not an opinion.
  **Chrome clamps `--window-size` to 512px, so that screenshot cannot be taken
  with the flag alone**, and framing the site to get a narrow viewport is
  blocked by our own `frame-ancestors 'none'`. Drive
  `Emulation.setDeviceMetricsOverride` over CDP against a headless Chrome on
  :9222 — the same WebSocket approach `check-auth-flow.mts` uses — and assert
  `scrollWidth === clientWidth` rather than eyeballing it.
- **The nav's section links carry a current-page indicator**, which is why
  `src/app/nav-links.tsx` is a client component in an otherwise server-rendered
  layout: the active section is a function of the URL and only `usePathname`
  reports it without threading a pathname through middleware into a header.
  The indicator is an `::after` bar rather than a border so it adds nothing to
  the link's box and the nav's height cannot shift between pages.
- **The brand mark lives in `src/components/logo.tsx`, and there are two of
  them.** Every surface that shows the logo — nav, landing page, 404 —
  renders that component, so the artwork changes in one place;
  the *size* picks the file. `lg` (64px) gets `public/logo.svg`, the detailed
  mark with dashed rear edges, five floating cards and sparkles. `sm`/`md`
  (26–30px, the nav) get `public/logo-mark.svg`: the cube silhouette and its
  spokes, nothing else.
  **The reason is arithmetic, and it is worth not rediscovering.** Stroke width
  on an SVG scales with the viewBox. `logo.svg` is 320×300, so its original
  1.2–2px strokes rendered at 26px came to about **0.15 CSS pixels** — under
  what a display can paint, which is why the cube's edges greyed out and
  shimmered rather than reading as lines. That was reported as the icon
  "losing definition". `logo-mark.svg` is 64×64 with 3.75–5px strokes, and
  `logo.svg` was itself redrawn at roughly 3.5× its old weights so it holds at
  64px too — it had the same fault there, just less visibly. **If either mark
  is ever rendered at a new size, check the stroke arithmetic before assuming
  it reads.** `src/app/icon.svg` is a third simplification for the favicon and
  is kept in step by colour and shape, not by sharing a file.
  All of them are served as `<img>` rather than inlined: the files carry fixed
  `id`s, and a page showing the logo twice would duplicate them. Width and
  height are both set so the header does not jump while they load.
- **A username is a link.** `/u/{username}` lists that account's public cubes
  with a search box, and `/profile` redirects to your own — one page, one
  address, and the account-menu item works without knowing your name. It shows
  public cubes only even to their owner, because a profile is what other people
  see; your private and unlisted ones live on `/cubes`, which says so. It exists
  because Explore puts a username on every row and the cube URL carries one, so
  both were link-shaped dead ends. `/settings` is the account page beside it —
sign-in methods, and nothing else yet; see [auth.md](auth.md).
- `not-found.tsx` covers unknown URLs *and* every `notFound()` call, so a
  private cube and a cube that never existed look identical — the 404 must not
  become a way to test whether a cube id is real. `error.tsx` leads with "Try
  again", since most failures are a dropped request, and shows the digest
  because it is the only handle tying what someone saw to a line in the logs.

- **`selectSm` in `src/lib/ui.ts` is the token for a toolbar select**, added with
  that control because there was none and the codebase has seven selects. Not
  `inputSm`: that is `w-full`, and a toolbar select sizes to its widest option.
  `card-filter-bar.tsx` still carries an identical local `controlClass` because
  it styles `<summary>` elements with it too; adopting the token there is a
  tidy-up nobody has needed yet.

- **The favicon is a simplification of the logo, not the logo.**
  `src/app/icon.svg` draws only the cube silhouette and its spokes; the mark's
  dashed edges, floating cards and sparkles turn to mush below ~24px.
  `src/app/favicon.ico` packs 16/32/48px renders of it. If you regenerate it,
  **the PNGs inside must be RGBA** — Next's icon processing fails the build on
  RGB with "The PNG is not in RGBA format!", and a headless-Chrome screenshot is
  RGB unless you override the default background to transparent.
