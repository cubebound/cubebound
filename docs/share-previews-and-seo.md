# Share previews, crawling and SEO

- **Every shared link renders a preview image**, drawn by Next's `ImageResponse`
  at `opengraph-image.tsx` — site-wide, per cube and per profile, with the
  shared pieces in `src/lib/og.tsx`. The whole product is "share this URL", so
  the share itself was the one surface with no design on it.
- **`ImageResponse` is Satori, not a browser.** Flexbox only; a `div` with more
  than one child *must* declare `display: flex` or it throws at request time.
  No CSS variables (a token renders as an empty string), no
  `text-overflow: ellipsis` — hence `clamp()` — and **no WebP**. Handing Satori
  a WebP kills the render worker rather than failing softly, which is why
  `cardShareImage` asks the CDN for `fm=jpg` while everything else asks for
  `fm=webp`. That one took a 500 with an empty response body to find.
- **A private cube's preview is the generic card.** The route is public and
  unauthenticated — a scraper has no session — so rendering its name would leak
  it to anyone who guessed the URL, which is exactly what the page's 404
  prevents. Unlisted cubes *do* get their real preview: they are meant to be
  shared by link, and a link that previews as nothing defeats the point.
- Previews carry `s-maxage=86400, stale-while-revalidate=604800`. Rendering one
  costs a DB read plus a fetch of the cover art, and chat clients re-scrape.
- **`metadataBase` is resolved per request** from `resolveSiteUrl`, the same
  helper the magic links use. Scrapers only fetch absolute `og:image` URLs, so a
  wrong base means no preview at all — and production, previews and localhost
  each need their own.
- The root layout sets a title template (`%s · cubebound.gg`), so page titles
  must **not** repeat the suffix.
- `robots.ts` disallows the per-account routes, which would otherwise be
  indexed as a dozen copies of the login page. Individual cubes are not listed
  there: unlisted ones carry their own `noindex` from `generateMetadata`, which
  is where a per-cube decision belongs. `sitemap.ts` lists public cubes and
  their owners via `searchCubes`, so the public-only rule is the same single one
  Explore uses, and it degrades to the static pages rather than 500ing.
- **Every indexable route declares a canonical, and it is always the bare
  path.** Each one has query-string variants serving the same content — `?view=`
  and `?tab=` on a cube, the whole filter surface on `/cards`, `?q=`/`?sort=`/
  `?page=` on `/explore`, and the `?code=…` auth near-miss on `/`. Without a
  canonical each variant is a separate URL competing with the others, and on a
  site this size the signal is thin enough already. Nothing is lost by
  consolidating: every page worth crawling is in the sitemap. Canonicals resolve
  against the per-request `metadataBase`, so a preview deployment self-references
  rather than claiming to be production. **A private cube returns before this**,
  from the same early exit that keeps its name out of a link preview, so the
  canonical cannot confirm a guessed slug either.
- **A cube's `<title>` names the game, not just the cube** — `"<name> —
  Riftbound cube by <owner>"`. A cube's own name carries none of the words
  anyone searches, which is the same reason the homepage stopped being the bare
  brand. Its `<meta name="description">` is the owner's own description passed
  through `metaDescription`: free text written for the page, so whitespace is
  collapsed and it is clipped at the last whole word inside 155 characters
  rather than cut mid-word by the search engine.
- **The sitemap has a thin-content floor: `SITEMAP_MIN_CARDS` (20).** A
  near-empty cube's page is a name, a byline and nothing to read, and on a site
  this size a handful of them is a large share of everything indexable — two
  abandoned test cubes were a sixth of the sitemap. Submitting a URL is a claim
  that it is worth reading, so the sitemap makes that claim only where it is
  true. The cubes stay public and reachable either way; this is about what is
  *advertised*, not what exists.
- **Page titles carry the words people search, not just the brand.** The
  homepage default was `cubebound.gg`, which ranked for nothing because nobody
  searches a brand they have not heard of; it is now
  "Riftbound Cube Builder & Draft Simulator · cubebound.gg". The title template
  still appends the suffix to every other page, so page titles must not repeat
  it. `/guides/riftbound-cube-drafting` exists as the one page that explains the
  format rather than serving the tool — a crawler meeting only a login wall and
  a list of other people's cubes has nothing to understand the site by.
- **`/privacy` describes what the code actually does, so it changes with the
  code.** Its cookie list is the sign-in cookies plus `THEME_COOKIE`,
  `CUBE_VIEW_COOKIE`, `CARDS_PER_ROW_COOKIE` and `BACKUP_NOTICE_COOKIE`, and the
  page states the count in prose ("we set five
  kinds of cookie"), so **adding one is a two-line edit there, in the same
  commit**; "analytics"
  is the Vercel Analytics component in the root layout; and it says plainly that
  account deletion is not yet self-serve, because promising a button that does
  not exist is the one genuinely dishonest thing that page could do — though it
  then says deletion "is being built", which is a promise with a clock on it.
  **When account deletion ships, that section and the "Your data" paragraph on
  `/settings`, which repeats the claim, are part of the same change.**
- **A cube's cover art is a card in that cube** (`cubes.cover_card_id`), picked
  on the settings page. Restricted to cards the cube holds, because a cover is
  meant to say what the cube *is* rather than be an arbitrary image slot.
  Unset falls back — a legend first, since that's what a cube is usually about,
  then the first main card — so a cube shows art whether or not anyone chose
  one. That resolution is **one SQL fragment**, `cubeCoverImageSql`, shared by
  the share previews and by every cube list: as a correlated subquery a list of
  twenty selects its covers in the same round trip, and one definition means a
  cube's thumbnail and its link preview can't come out as different cards.
- Cube lists show the cover cropped to a **4:3 window**, not the card's own
  shape — a list mixing portrait units with landscape battlefields has a ragged
  left edge, and on a 5:7 card a 4:3 window is about 54% of the height, which
  is almost exactly the illustration. A square was tried first and caught the
  name bar and rules box, which reads as a cropped card rather than a cover.

## Where the route lives

- **`opengraph-image.tsx` stays at the `[slug]` segment, outside the group**, and
  the page therefore names it in `openGraph.images` by hand rather than relying
  on Next pairing a co-located file. Inside the group Next appends a
  group-derived suffix to the generated route (`/opengraph-image-7gn1ej`), which
  changes a URL scrapers have already cached *and* stops `middleware.ts`
  recognising a preview route by its `/opengraph-image` ending — that is the
  query-stripping redirect keeping the most expensive unauthenticated route on
  one CDN entry. `check:share-previews` asserts the advertised `og:image` and the
  directly-fetched one are the same bytes, which is what caught this.
