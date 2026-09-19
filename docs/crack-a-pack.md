# Crack-A-Pack

One pack from a cube, drawn as a single high-resolution image to post. The third
tab on `/cube/{username}/{slug}/draft?new=1`, served by the `pack.png` route.

It exists because creators were already screenshotting the pack view for videos
and Discord, and a screenshot is unreadable once a video has re-encoded it. The
on-site grid also leaves a battlefield as a lone landscape tile among portrait
cards, which reads as a glitch rather than a design choice.

- **The browser cannot draw this, and that is not a preference.**
  `cmsassets.rgpub.io` sends **no `Access-Control-Allow-Origin` on any request
  shape** — verified against a bare GET, an `Origin`-bearing GET and an OPTIONS
  preflight. So `crossOrigin="anonymous"` fails to load outright, and a plain
  load taints the canvas so `toBlob` throws at the very last step, *after*
  everything appears to have worked. It is Riot's CDN, not ours, and the one
  workaround — proxying the art through our origin — is exactly what "we store
  image URLs, never image bytes" exists to prevent, and would cost more
  bandwidth than server rendering does (per viewer rather than per pack).
  **Re-check the header before anyone tries this again**; it is one `curl`.
- **The preview is not a second renderer.** It is the same route at a smaller
  tier in an ordinary `<img>`. *Displaying* a cross-origin image was never the
  problem — only reading its pixels back is — so nothing on the client touches a
  canvas.
- **It requires an account; the Draftmancer export beside it does not.** That
  export assembles a text file from rows we already hold. This fetches seventeen
  images and composites them, which makes it by a wide margin the most expensive
  endpoint on the site, and it was reachable signed out. A session is also the
  only rate limit here that costs nothing to run: an account needs a magic link,
  and that endpoint is already metered upstream. **`canUseCube` is still checked
  *before* the session**, so a signed-out visitor cannot tell a private cube from
  one that never existed — answering 401 first would give that away. That order
  is `needsAccount` in `export-request.ts`: 404, then 401, then the config's
  400, so a bad template cannot turn a request that should have been refused
  into an answer that admits the cube is there.
- **Nothing is stored, and the URL is the state.** No pack row, no table, no
  migration, no retention policy: the engine is deterministic, so a seed plus a
  config regenerates the identical pack. `readDraftConfig` already knew how to
  read a config out of a query string, because the Draftmancer export needed
  exactly that. Same seed twice is byte-identical output, asserted by hand.
- **The route deals the engine's *minimum* grid, not the configured draft.**
  `generatePacks` with the form's seats and packs blocks on a cube too small for
  24 packs, which has nothing to do with whether it can fill one. Two seats by
  one pack is the floor, and the first pack is the one used.
- **Only Shuffle deals.** Opening the tab renders nothing, and the template is
  snapshotted alongside the seed rather than read live — building the image URL
  from the live config re-rendered on every keystroke, so typing "15" into Cards
  per pack dealt a 1-card pack and then a 15-card one. Seed plus template is one
  description of one pack, which is what the download needs and what a permalink
  would need.
- **Two tiers, and they are card measurements rather than canvas ones.**
  `preview` is 300px per card (~1930px canvas, ~290KB in) and `full` is 745
  (~3200px, ~920KB in). The build spec named both "480 per card" and "around
  1200px wide" and those were never in conflict — one is a card measurement, the
  other a canvas. The preview is deliberately a *reading* size: the complaint
  this feature answers is that shared pack images are too low-resolution to read,
  so a preview you cannot read fails the same way.
- **The layout solver is pure and lives in `src/lib/pack-image/layout.ts`.** A
  pack mixes portrait cards (63×88) with landscape battlefields (88×63), so the
  minority orientation pairs two-per-slot into one tile of the majority's shape
  and the grid stays regular. Ties go to portrait; an all-battlefield pack flips
  the base tile, without which you get one row of tiny half-height battlefields.
  Dead cells are pure holes now that branding is the footer alone, so
  `DEAD_PENALTY` is 0.15 and a short last row is centred. `check:pack-image`
  asserts the six worked shapes and runs in CI, with no browser and no network.
- **The wordmark font is vendored and named explicitly.** Space Grotesk, the
  site's display face, as a TTF under `src/lib/pack-image/fonts/`. `font: "sans"`
  resolves on a developer machine and in CI and renders as **nothing** on a
  Vercel function, which carries almost no fonts — a bug no local test finds.
  `fontfile` removes the dependency on the host having any fonts, and
  `outputFileTracingIncludes` in `next.config.ts` puts the file in the bundle,
  because nothing imports it and the tracer cannot see a path built at runtime.
  Verified in a real build: the font is in the route's `.nft.json` and the
  wordmark rasterises.
- **The wordmark is rasterised at 8x and scaled down.** Pango hints every glyph
  advance onto a whole device pixel, and the preview tier's em is only 23px, so
  the leftover fractions pile up into gaps you can read — `cubebo und.gg` in the
  corner of every preview. Nothing in sharp's text API turns hinting off, so
  `SUPERSAMPLE` in `render.ts` puts the pixel grid out of reach and lanczos
  averages the error away on the way down. The download tier had the same flaw
  and only hid it better, a 56px em spreading the rounding thinner. One extra
  in-memory raster against seventeen CDN fetches, so the cost does not register.
- **`sharp` is the project's first native dependency.** It cannot run on Edge, so
  the route declares `runtime = "nodejs"`. The lockfile carries the linux-x64
  binaries Vercel installs, checked rather than assumed.
- **The response is `private, max-age=3600`.** `private` because this image *is*
  cube contents and an unlisted cube is only as private as its URL — and because
  a shared cache would serve the bytes to anyone with the link, walking straight
  around the sign-in check. **That rules out edge-caching even public cubes while
  this route needs an account**, which is the tradeoff to reopen if it ever
  stops. `max-age` rather than `no-store` is the part that matters: `no-store`
  forbade the browser's cache too, so a double-click rendered the identical pack
  twice.
- **Every render logs what it cost** (`[pack.png] … in=…KB out=…KB …ms`), so
  Vercel's logs answer "is this too expensive" with numbers. Inbound is the
  figure to watch; it is bandwidth we never used to spend.
- **Not built, deliberately:** a pack permalink and an `og:image`. That is where
  the cost changes character, because unfurlers refetch repeatedly and carry no
  cookies, and it would need a visibility-aware cache policy that the sign-in
  requirement currently forecloses. Gate it on real usage data.
