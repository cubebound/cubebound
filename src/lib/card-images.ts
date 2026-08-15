/**
 * Sizing card art at the source CDN.
 *
 * `image_thumb` and `image_full` are the **same URL** on every row — the source
 * has no thumbnail rendition — so a grid of tiles was pulling a ~900KB PNG per
 * card. A twelve-card draft pack came to roughly 10MB, which is why art
 * regularly appeared blank for a second or two before arriving.
 *
 * Riot's CDN is Sanity, which resizes and converts on request:
 * `?w=300&fm=webp` turns that 896KB PNG into 25KB of WebP — about 36× smaller.
 * This is still the source CDN serving the image, so it stays within the "do
 * not proxy or cache card images" rule; we are only asking for a smaller
 * rendition of the same asset.
 *
 * Done at render time rather than in the sync deliberately: it applies to every
 * row already stored without a re-sync, and the stored value stays exactly what
 * the source gave us. Any host we don't recognise is passed through untouched,
 * so a future source that doesn't understand these parameters still works.
 */

const RESIZABLE_HOSTS = new Set(["cmsassets.rgpub.io"]);

/**
 * Source widths in pixels, not CSS pixels.
 *
 * Tiles render at 246 CSS px across the card browser, the cube views and the
 * draft, so 512 is a shade over 2× — enough to stay sharp on a 2× display,
 * which is where an undersized image reads as blurry rather than merely small.
 * 320 was tried first and card text was hard to read for exactly that reason.
 * The cost is modest: 512 is ~48KB against ~27KB, still roughly 18× smaller
 * than the 875KB PNG the source serves natively.
 *
 * `FULL_WIDTH` matches the source's own resolution, so the detail view loses
 * nothing but the PNG encoding.
 */
export const THUMB_WIDTH = 512;
export const FULL_WIDTH = 744;

/**
 * For grids where the card is a *choice*, not something to read.
 *
 * The cover picker shows every card in the cube at once — 300 tiles at
 * `THUMB_WIDTH` would be ~14MB. At 200 the art is still recognisable, which is
 * all picking needs, at roughly 8KB a card.
 */
export const PICKER_WIDTH = 200;

function sized(
  url: string | null | undefined,
  width: number,
  format: "webp" | "jpg" = "webp",
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // not absolute; leave it alone
  }
  if (!RESIZABLE_HOSTS.has(parsed.hostname)) return url;

  // Keep whatever query the source set (accountingTag matters to Riot) and add
  // ours on top.
  parsed.searchParams.set("w", String(width));
  parsed.searchParams.set("fm", format);
  return parsed.toString();
}

/** A grid- or pile-sized rendition. */
export function cardThumb(url: string | null | undefined): string | null {
  return sized(url, THUMB_WIDTH);
}

/** Full-card rendition, for the detail view. */
export function cardFull(url: string | null | undefined): string | null {
  return sized(url, FULL_WIDTH);
}

/** Small rendition for dense pick-one grids. */
export function cardPicker(url: string | null | undefined): string | null {
  return sized(url, PICKER_WIDTH);
}

/**
 * Rendition for the share-preview images — **JPEG, not WebP**.
 *
 * The OG images are drawn by Satori, whose image decoder handles PNG, JPEG and
 * SVG only. Handing it a WebP kills the render worker outright rather than
 * failing softly, so the preview 500s and the scraper caches the absence. This
 * is the one place the site must not ask for WebP.
 */
export function cardShareImage(url: string | null | undefined): string | null {
  return sized(url, THUMB_WIDTH, "jpg");
}
