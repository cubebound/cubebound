# Checks

## The scripts

| Script | Guards | Needs | Runs |
| --- | --- | --- | --- |
| `check:primer-safety` | hostile markdown renders inert through the real component | nothing | **CI** |
| `check:printings` | the TS and SQL `base_id` rules agree on every row; and separately that the browser's collapse rule agrees between `nameWithoutTreatment` and the `regexp_replace` in `collapseKey`, that every treatment printing folds onto the card it varies, that a mid-name parenthetical never folds; that `isTokenCard` agrees on every row with the SQL form of the token rule (a restated copy of `tokenCard`'s expression, not the export), including synthetic production-only token ids with a null supertype; that no `base_id` group mixes tokens and cards; that cards named after a token are kept; that each card's page URL is unique across the pool and identical across all of its printings; and that no stored rules text holds HTML character codes or tags, while more than a quarter of cards keep a line break | DB (read-only) | manual gate |
| `check:browse-grid` | a grouped tile is a card, an all-printings tile is itself | Supabase + dev server | manual gate |
| `check:card-filters` | multi-select ORs within a filter and ANDs across; energy buckets partition the pool; sorting uses the game's order; that "Most played" orders by a key that is not on the card at all — the same total as the default sort, since a sort orders and never filters; descending by the snapshot's own cube counts; ties alphabetical; surviving URL parsing; and every `CARD_SORTS` entry carrying a label, since one without renders as a blank row in the filter bar; independent counts exclude tokens; browse and type-ahead return no token for any token word yet every real card whose name contains it; and no filter option is carried only by tokens | DB (read-only) | manual gate |
| `check:copies-and-log` | quantity 2 lists as two entries; per-copy edits move one copy; edits reach the log | Supabase + dev server | manual gate |
| `check:public-cube` | visibility gating, cloning (the copy takes the name chosen for it, and a repeat gets `-2`), that Clone links to the clone page, which renders for a public cube and does not reveal a private cube's name to a stranger, that a token written into the source cube does not reach the clone, quantity-aware counts, that Clone is the prominent action (it imports `btn.primarySm` from `src/lib/ui.ts` rather than matching a palette string, so styling changes cannot break it), and that the owner gets a real **307** to `/edit` rather than the page — a 200 there means the redirect degraded to a client-side hop | Supabase + dev server | manual gate |
| `check:auth-flow` | claiming a username refreshes the nav (`revalidatePath`) | Supabase + dev server + Chrome :9222 | manual gate |
| `check:cube-ownership` | replays an Add under another session and with no cookie, and the owner's own Add with a token id swapped in, which must be refused | Supabase + dev server + Chrome :9222 | manual gate |
| `check:magic-link` | the `redirect_to` actually sent to Supabase, and `/?code=` self-heal | `dev:probe` server + Chrome :9222 | manual gate |
| `check:import` | import parsing, matching, the line cap and the committed result, written through `addCubeCards` as the action does; that both previews go through `previewPastedList`; that `createCube` with cards is atomic, so a bad card leaves no cube; that the import catalog holds no token, so a pasted token name never resolves to one while namesakes still match; and that every offered set's starter list clears the floor and holds no token, basic rune, special-slot reprint, cross-set Showcase row or duplicate card | DB | manual gate |
| `check:draft` | a full seeded 8-seat draft: quantities, pack template, passing, bots, determinism | nothing | **CI** |
| `check:discovery` | explore is public-only, keywords AND, the card filter, sorting, follow state, both `/cubes` tabs; and that a card page answers a real 404 **status** rather than the soft 404 a loading boundary otherwise produces — for an unknown slug, for a non-canonical path, and for a real card the sitemap does not list. The eligible page it then asserts on (200, bare canonical, the share line, the footnote) is read out of the running server's own `/sitemap.xml`, so the one-hour popularity memo cannot make the script and the server disagree about which pages exist; a failure straight after seeding cubes means restarting `npm run dev`, not a bug | Supabase + dev server | manual gate |
| `check:analytics` | copies not rows, costless cards off the curve, Multi bucketing, keyword normalisation | nothing | **CI** |
| `check:markdown-edit` | the primer toolbar's transforms: every button toggles, headings replace rather than stack, `diffRange` is minimal | nothing | **CI** |
| `check:primer-toolbar` | the toolbar is *wired*: a click reaches React state, Ctrl+B matches the button, and the result saves byte-for-byte | Supabase + dev server + Chrome :9222 | manual gate |
| `check:deck-export` | drafted decks export as names other builders accept: legends rebuilt as `Champion, Title`, promo variant suffixes stripped, copies aggregated, and the result re-imports here | DB (read-only) | manual gate |
| `check:draftmancer` | the cube file Draftmancer reads: unique custom-card names, every sheet line resolving to an entry, no slot naming an unemitted sheet and no empty sheet across four configs, the either-slot weighted 50/50, `draftmancerSheetNeeded` matching every hand-run Draftmancer session, rarity in the accepted set with treatments resolved through `base_id` and a non-zero fallback, costless as `""`, and only the drafted sections | nothing | **CI** |
| `check:pack-image` | the pack image's layout: the six worked shapes from the build spec, battlefields pairing into the majority's tile, an all-battlefield pack flipping to landscape, a short last row centred, every card placed exactly once inside the canvas, and the vendored wordmark font rasterising rather than silently falling back | nothing | **CI** |
| `check:staged-edit` | the edit panel's batching: collapse yields one row per (card, section) so a save cannot violate `ON CONFLICT`, netting cancels a staged-then-unstaged pair while two *different* printings stay two changes, quantities clamp, and `sectionForBoard` files a Legend to `legends` | nothing | **CI** |
| `check:popularity` | the arithmetic behind every percentage the site publishes about a card: one cube counts once however many copies or printings it holds, a present card never rounds to "0%" and a card missing from one cube never rounds up to "100%", the pairing list keeps only lift above 1 and is sorted by the strength it displays and never rises down the list, and the page floor counts **distinct owners** rather than cubes, so one person's private clones cannot unlock a page. Also that a card's URL is stable and legible: apostrophes drop rather than split, and a legend carries its champion. And that a request resolves **forwards** — an exact path finds its card, a lossy slug still does, a differently-cased one must not, and every path the sitemap would publish both clears the owner floor and resolves back to a card | nothing | **CI** |
| `check:oauth` | the backup rule, `providersOf` order, the provider allowlist, and that both sign-in actions still validate their input and build `redirectTo` through `authCallbackUrl` | nothing | **CI** |
| `check:docs` | the doc split holds: the root stays under its line ceiling, every `docs/*.md` is reachable from the routing table or a stub, every relative link resolves, no `@` import reinstates the startup cost, and a stub stays a pointer | nothing | **CI** |
| `check:oauth-buttons` | `/login` offers both providers as form fields, links to no provider directly, and still carries the same-address warning | dev server | manual gate |
| `check:moderation` | hide/suspend take effect and drop out of every listing — the owner's own `/cubes`, and `/sitemap.xml`, whose separate query is the one that drifted; it asserts presence while clean before each absence, so a cube that fell under the sitemap's card floor cannot pass the absences vacuously; that they also drop out of the card statistics, where a miss would be invisible — a private cube at the floor counts, hiding it or suspending its owner stops it, and the floor itself holds against a cube one card short and against a maybeboard trying to make up the difference; `canUseCube` refuses even the owner; deleting an account cascades and leaves a surviving log entry | DB | manual gate |
| `check:account-deletion` | self-serve deletion, which is the one check here that guards a mistake that must not happen *once* rather than one that already has: structurally, that `confirm` is the only form key the action reads and that the typed name is still *compared*; then that a wrong confirmation deletes nothing, that a forged body naming a bystander deletes the caller and not the bystander, that the cascade takes the cubes, cards, drafts and follows, that the log row outlives its author with a null actor, that a suspended account can still delete itself, and that the dead cookie no longer reaches `/settings`. The draft and follow it deletes are real rows it created first, because asserting `drafts = 0` for an account that never drafted passes whatever the schema does and only reads like coverage | Supabase + dev server | manual gate |
| `check:pool` | the pool is bounded and releases (`max` / `idle_timeout` / `connect_timeout`), the filter options and default card page are memoised, filtered searches are **not**, and the popularity snapshot is both memoised and *shared while in flight* — six concurrent cold callers must get back the same object, asserted by identity rather than by timing | DB (6 reads) | manual gate |
| `check:share-previews` | all three OG routes return real PNGs; cover set and cover falling back; a private cube stays generic; `og:image` is absolute | Supabase + dev server | manual gate |

`check:magic-link` needs the dev server started as `SIGNIN_PROBE=1 npm run
dev:probe`, which preloads `scripts/otp-probe.mjs` to intercept the outgoing
`/auth/v1/otp` call — so it reads the real wire value without sending mail or
creating a user. It asserts on the URL Supabase receives rather than on the
helper in isolation, because the production bug was invisible everywhere else:
localhost worked and the code read fine.

**`document.readyState === 'complete'` does not mean "the page is usable"** on
a route with a `loading.tsx`. Next flushes the loading shell early, so
readyState goes complete while the skeleton is still up and React has not
hydrated — a click then lands on a button with no handler and silently does
nothing. That is how `check:cube-ownership` started failing two runs in three
the moment the loading boundaries landed. It now waits for the skeleton to
clear *and* for the button to carry React's internal props key, then polls for
the write instead of sleeping a fixed budget. `check:auth-flow` and
`check:magic-link` still use readyState, which is fine only because `/welcome`
and `/login` have no loading boundary — **adding one to either route means
fixing those checks the same way.**

`check:cube-ownership` is also structural: it fails if a new action in
`src/app/cube/actions.ts` skips `requireOwnedCube` without a documented
exemption naming the gate it uses instead. **The gate has to be called, not
mentioned**: the scan strips comments and looks for `gate(`. A plain substring
match passed `cloneCubeAction` for months on a comment reading "canUseCube, not
canViewCube" while the exemption named the wrong gate, so deleting the real
call and keeping the comment would still have passed. It scans the **draft** and **follow**
actions the same way, against their own gates — a mutation living in a file the
check does not read would escape the guarantee entirely, which is worse than an
exemption.

### What CI runs

`.github/workflows/ci.yml`, on every push and pull request: typecheck, lint,
the ten pure checks — `check:primer-safety`, `check:draft`,
`check:analytics`, `check:markdown-edit`, `check:draftmancer`,
`check:pack-image`, `check:staged-edit`, `check:popularity`, `check:oauth` and
`check:docs` — and a production build. It uses **placeholder** Supabase
values, never real ones — every route is dynamic, so the build renders no page
and opens no connection, but `src/lib/supabase/config.ts` throws when the vars
are absent. **No production credentials belong in CI under any arrangement.**

`npm run typecheck` runs `next typegen` first, because Next generates the global
route helpers (`LayoutProps<"/">`, `PageProps<…>`) into `.next/types` and
tsconfig includes them — plain `tsc` fails on a tree that has never been built.

**Never run `npm run build` while `npm run dev` is up — use
`npm run build:isolated`.** They share `.next`, and a build overwrites the dev
server's client chunks: the browser then asks for
`/_next/static/development/...` files that no longer exist and pages stop
loading, while `curl` keeps getting 200 because server-rendered HTML is
unaffected. That combination — working fetches, broken browser — is very hard
to read as a build problem, and it has cost real debugging time twice. The
isolated build targets `.next-build` via `NEXT_DIST_DIR` and leaves the dev
server alone. If it has already happened: restart `npm run dev` and hard-reload
the browser.

**In the gate, that collision surfaces as `check:magic-link` and nothing else.** It fails
with "no /auth/v1/otp request was captured within 15s", which reads as a broken sign-in
path. The real cause is that the check waits for React to hydrate before clicking submit,
and a poisoned `.next` never hydrates, so the click degrades to a native POST that Next
rejects and no OTP request is ever made. The other sixteen pass, which makes it look
specific to sign-in. There is no browser to hard-reload in a headless run, so the fix is
to stop the dev server, delete `.next`, and restart it. Confirmed 19 September 2026: it
failed identically on a comment-only branch and on `master`, and passed on both once
`.next` was removed.

**Verify CI changes from a fresh clone, not the working tree.** A local run
reuses a populated `.next` and an existing `.env.local`, so it passes on state
CI does not have; that exact gap shipped a red build. `git clone` to a temp dir,
`npm ci`, set placeholder env, then run the steps.

## What CI covers today

- **CI covers typecheck, lint, build and the ten pure checks** on push and PR:
  `check:primer-safety`, `check:draft`, `check:analytics`, `check:markdown-edit`,
  `check:draftmancer`, `check:pack-image`, `check:staged-edit`, `check:popularity`,
  `check:oauth` and `check:docs`. The other seventeen need a live Supabase or the
  card pool and are a documented pre-deploy manual gate — see
  [gate-runbook.md](gate-runbook.md). Run that gate before deploying.
  (Twenty-seven scripts in total; if that number moves, this line and the count
  above it move with it.)
