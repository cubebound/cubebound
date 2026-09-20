# Cube visibility, ownership and sharing

## Who can see a cube

- Public cube view is `/cube/{username}/{slug}`. Public and unlisted render for
  anyone including signed-out visitors; private 404s for non-owners, the same
  convention the mutations use. `canViewCube` in `src/lib/cube-access.ts` is the
  single definition, next to `canEditCube`.
- **Every owner-only route puts its ownership check in a `layout.tsx`, never
  only in the page.** `/edit` and `/settings` each have one beside the page, and
  they exist for the status, not the body. A `notFound()` in a page under a
  `loading.tsx` lands after Next has flushed the shell and committed HTTP 200, so
  it swaps in the 404 UI and leaves a **soft 404** — a page crawlers index as
  real. The page keeps its own identical check, which is what narrows `cube` for
  the rest of the file; deleting that breaks the types, not the status.
  **This showed only on a *public* cube**, which is how it survived: on a private
  one the `[slug]` layout refuses first, above every boundary, so the status was
  right for the wrong reason, and `check:public-cube` asserted exactly that case.
  It now asserts `/edit` and `/settings` 404 for a stranger and a signed-out
  visitor **while the cube is still public**. Three routes have been bitten by
  this now — the cube layout, the profile layout, and these two — so the rule is
  the check goes in the layout.
- **`settings/page.tsx` reads through `loadCube`/`loadViewer`**, not
  `getCubeByOwnerAndSlug`/`getCurrentUser` directly. It was the one cube route
  still on the raw queries, which was invisible until it gained a layout that
  asks the same two questions — `cache()` makes those one query each instead of
  two.
- **The owner never sees the public page — it redirects them to `/edit`.** The
  editor is the same five tabs plus the ability to change something, so landing
  there signed in as the owner only ever meant a trip through an Edit button.
  The entry points also disagreed about it: `/cubes` linked to `/edit` while
  Explore, profiles and search linked to the public path, so the same cube
  opened two different ways depending on where you clicked it. One redirect
  settles every entry point at once — shared links and bookmarks included —
  instead of teaching each link who owns what.
- **That redirect lives in `(public)/layout.tsx`, and both halves of that are
  load-bearing.** It has to be a *layout* for the same reason `notFound()` is
  one segment up: Next flushes the `loading.tsx` shell as soon as it can, which
  commits HTTP 200, so a `redirect()` in the page degrades into a client-side
  hop — the visitor's skeleton flashes and a crawler is told the page is fine.
  Putting it in the page reproduced exactly that, measured as a 200 with no
  `Location`. It has to be in a **route group** because the `[slug]` layout also
  wraps `/edit`, and redirecting there would loop. `check:public-cube` asserts a
  real 307 rather than just a redirect, so the degraded form cannot come back.
  `loading.tsx` moved into the group with the page, so `settings/` and `draft/`
  got their own copies — every dynamic route needs one, see `skeleton.tsx`.
- **The tab does not survive that redirect.** Layouts are not given
  `searchParams`, so an owner opening a shared `?tab=analytics` link arrives on
  the editor's Mainboard. Reading the query string would mean threading it
  through middleware, which is a lot of machinery for a link an owner rarely
  follows to their own cube.

- **What the owner used to get only on the public page now lives in the editor**:
  the follower count in the header byline, the per-section breakdown under it,
  and the hidden-by-a-moderator notice. Without the move the redirect would have
  silently taken all three away — the follower count has no other home on the
  site, and a hidden cube would look like a broken one. The admin moderation
  panel is on both, so an admin who owns a cube can still reach it.
- **There is no "View" button on the editor.** It went to the public page to
  show the same list read-only, and now that Analytics and the change log are on
  the editor too there is nothing over there an owner needs. The consequence to
  know: an owner has no preview of how the cube looks to a visitor, and with the
  redirect above there is no route to one at all — signing out or opening a
  private window is the answer. Share already states who can open the link,
  which is the question that was actually being asked.
- **The change log is public.** It records card names, dates and actor usernames
  on a cube that is already public, so nothing new is disclosed, and seeing how
  a cube has evolved is a reason to follow it.
- The public page has one audience, so **Clone is unconditionally its primary
  action** (filled) and Follow is unconditional beside it. Both used to be
  owner-aware, which the redirect made dead code there.
- **Clone is on the editor too, as the quiet button.** Forking your own cube —
  a variant to try without touching the original — is a real thing to want, and
  with the public page redirecting its owner away the editor is the only place
  left to ask for it. It is never the main action on a cube you already own, so
  it takes `prominent={false}`; `check:public-cube` asserts both that it is
  there and that it is *not* wearing `btn.primarySm`. The action lands on the
  copy's editor, which is also what makes a double-click harmless.
- **The editor's header controls are all `btn.secondarySm`.** Draft and Settings
  were hand-written `py-1.5` strings that came out 34px against Share's 36, so
  the row was already a little ragged before Clone arrived and made it obvious.
  Measured over CDP: Share, Draft, Clone and Settings are 36px each.
- **Share** sits on both the public page and
  the editor header — the owner works in the editor, so that is where they
  reach for a link. It copies the absolute cube URL, built server-side with
  `resolveSiteUrl` so it doesn't depend on where the client is, and the link
  works for signed-out visitors because public and unlisted cubes render
  without a session. It is visibility-aware — unlisted says the link works for anyone who has it,
  private says only you can open it and links to Settings. Private still copies
  rather than refusing: handing someone a link that 404s is the failure worth
  naming, not the copy itself. `navigator.clipboard` needs a secure context, so
  the button falls back to a selectable input when it's unavailable.
- **Public reads go through the server connection, not RLS policies.** RLS
  stays deny-all: it exists to shut the PostgREST API that Supabase exposes
  automatically, not to authorize the app. Every read already happens in a
  Server Component through Drizzle as the table owner, so visibility is
  enforced in one place in application code. Opening `SELECT` policies to
  `anon` would mean granting the browser key direct read access to `cubes`,
  `cube_cards` and `cards` in order to serve pages we render server-side
  anyway — a second data path with its own rules, for no gain. If a future
  feature genuinely needs browser-side reads, add the policies then, and keep
  `canViewCube` and the policy in step.
- Every cube edit is appended to `cube_changes` and shown on the editor's
  Change log tab. Card name and printing id are denormalized into the row so
  the history still reads correctly after a card leaves the cube. Recording is
  best-effort: `recordCubeChange` swallows its own failures, because losing a
  log line must never undo or block the edit that just happened. New mutations
  should log themselves.
- **Every cube mutation goes through `requireOwnedCube` in
  `src/app/cube/actions.ts`.** Pages decide only what to render; the server
  re-checks ownership on each write. Non-owners get "not found" rather than
  "forbidden" so private cube ids can't be probed. `npm run check:cube-ownership`
  replays a captured Add request under a different session to prove it, and
  fails the build if a new action skips the gate.
- Slugs come from the name once and never change on rename — they are shared
  URLs. Uniqueness is per owner (`slugify` + `uniqueSlug` in `src/lib/slug.ts`).
- Adding a card infers its section from the card type via
  `defaultSectionForType` (Legend → legends, Rune → runes, Battlefield →
  battlefields, else main); cards can be moved afterwards. **Re-adding a card
  already in the cube increments its quantity** rather than being a no-op —
  cubes commonly run multiples. Nothing about a cube is singleton.
- Card search inside the editor reuses the browser's machinery — `searchCards`,
  `CardFilterBar`, `CardPagination` and the shared tiles in
  `src/components/card-visuals.tsx`. Route-specific wrappers stay under their
  route; anything used by both lives in `src/components/`.
