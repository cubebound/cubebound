# Vendored font

`SpaceGrotesk-Bold.ttf` — Space Grotesk, the site's display face, used for the
`cubebound.gg` wordmark on the pack image. Licensed under the SIL Open Font
License 1.1; the full text is in `OFL.txt` beside it, which the licence requires
travel with the file.

**Why a TTF is in the repo at all.** `sharp` rasterises the wordmark through
pango, and a Vercel function carries almost no system fonts — so `font: "sans"`
resolves on a developer machine and in CI and renders as *nothing* in
production, which no local test catches. Passing `fontfile` removes the
dependency on the host having any fonts. The site's own faces come from
`next/font/google` and land as woff2 in `.next`, which pango cannot read and
which has no stable path, so this is a separate copy on purpose.

**It reaches the function bundle through `outputFileTracingIncludes` in
`next.config.ts`**, because nothing imports it and Next's tracer cannot follow a
path built at runtime. If that entry is removed the wordmark silently disappears
in production. `check:pack-image` asserts the file exists and rasterises.
