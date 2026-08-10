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

/** Widths in CSS pixels; the CDN returns 2× for crispness on dense screens. */
export const THUMB_WIDTH = 320;
export const FULL_WIDTH = 744;

function sized(url: string | null | undefined, width: number): string | null {
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
  parsed.searchParams.set("fm", "webp");
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
