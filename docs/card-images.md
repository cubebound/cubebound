# Card images

## We store URLs, never bytes

- **We store image *URLs*, never image bytes.** `cards.image_full` and
  `image_thumb` are `text`; the whole `cards` table is ~3MB for 1,288 rows, of
  which ~170KB is URL text. Every card image is served browser-to-Riot from
  `cmsassets.rgpub.io` — measured, not assumed: loading `/cards` pulls ~2.5MB
  of art across 60 requests, **all of it** from Riot's CDN and none from our
  origin. Card art therefore costs us no bandwidth and no storage **on the
  pages**, which is the claim that matters for the browser and the cube views.
  There are now **two exceptions, and the second one is not small.** The
  share-preview images fetch the cover art server-side to embed it in the PNG;
  they're CDN-cached for a day for exactly that reason. The pack image
  (`pack.png`, see [crack-a-pack.md](crack-a-pack.md)) fetches **every card in the pack** and
  composites them: roughly 290KB inbound for a preview and 920KB for a download,
  measured. It cannot be done in the browser — see that section for why — so it
  is the first feature where card art is genuinely our bandwidth, and the reason
  it requires an account.
- Card images render with a plain `<img>`, never `next/image`: optimizing through Vercel would proxy and cache them, which we are deliberately not doing yet — and would turn the line above from true into false.
- **`image_thumb` and `image_full` are the same URL on every row** — the source has no thumbnail rendition, so a grid of tiles was pulling a ~875KB PNG per card and a twelve-card draft pack came to roughly 10MB. Riot's CDN is Sanity and resizes on request, so `cardThumb`/`cardFull` in `src/lib/card-images.ts` append `?w=…&fm=webp`. This is still the source CDN serving its own asset, so it stays inside the no-proxy rule. It happens at render time rather than in the sync so it applies to rows already stored, and an unrecognised host passes through untouched.
- **`THUMB_WIDTH` is a source width, and must stay near 2× the rendered one.** Tiles render at 246 CSS px everywhere they appear, so it is 512: ~48KB, still roughly 18× lighter than the PNG. 320 was tried first and looked blurry — an undersized image on a 2× display reads as *unreadable card text*, not merely as a small picture, so trading further down the size is a false economy.
- **A card tile shows its name until the art covers it, and retries before giving up.** Art arrives over the network and a blank tile is indistinguishable from a bug — that confusion has been reported twice. `src/components/card-art.tsx` is the one implementation: the name underneath, the art painting over it, **two retries** with a short backoff, then the name for good. The first version failed permanently on the first `onError`, which assumed a failure meant a bad URL; in practice the URLs are fine and the failures are transient — one card came back blank in a draft pack while its image served a normal 200 throughout, and appeared once the pack came round and the tile re-rendered. Two details make it work and are easy to leave out. The attempt number rides in the `src` as a cache-buster, because re-assigning an identical `src` does not make a browser fetch again. And a `ref` checks `complete && !naturalWidth` on mount, because **an image that fails before hydration never fires `onError`** — the browser requested it from the server-rendered HTML and the event was over before React attached a listener. Without that check the retry never ran on the card browser's sixty-tile grid, which is where it matters most; with it, 20 forced failures all recovered.

- **Below five columns a tile asks for the 744px source, not the 512px one.**
  `THUMB_WIDTH` is 512 because tiles normally render near 246 CSS px and the
  rule is that the source stays near 2x the rendered size; a four-column grid in
  the 1600px container puts them at roughly 380px, where 512 is 1.35x and reads
  as blurred card text on a 2x display. That is the same failure that made 320
  unusable. It is the source the card detail modal already uses, so it is
  usually cached rather than newly fetched.
