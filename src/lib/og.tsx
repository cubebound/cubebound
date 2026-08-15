/**
 * Shared pieces for the share-preview images.
 *
 * Every one is a `opengraph-image.tsx` route rendered by Next's ImageResponse,
 * which is Satori under the hood: a small, deliberate subset of CSS. Flexbox
 * only — a `div` with more than one child **must** declare `display: flex` or
 * it throws at request time, and there is no grid, no `gap` shorthand
 * shortcuts, no external stylesheet. Keep the styles here literal.
 *
 * The size is fixed at 1200×630, which is what every scraper crops to.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Cache the rendered preview at the CDN edge.
 *
 * Rendering one costs a database read and — for a cube — a fetch of the cover
 * art from Riot's CDN, which is the **only** place card image bytes pass
 * through our server rather than going browser-to-Riot. Without this, every
 * re-scrape by every chat client repeats both.
 *
 * A day of freshness with a week of stale-while-revalidate: a cube's card
 * counts changing an hour late in a link preview is not worth a cache miss on
 * every share, and the first request after an edit still repaints it.
 */
export const OG_HEADERS = {
  "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
};

/** Brand colours, repeated rather than imported: Satori resolves no CSS
 *  variables, so a token would render as an empty string. */
export const OG = {
  background: "#09090b",
  panel: "#18181b",
  text: "#fafafa",
  muted: "#a1a1aa",
  accent: "#ff6a2b",
  border: "#27272a",
} as const;

/**
 * The cube mark, inline, matching src/app/icon.svg.
 *
 * Satori renders SVG elements but not `<img src="/logo.svg">` from the public
 * folder — a relative URL has no origin at render time. Drawing it as JSX
 * avoids an origin round-trip that could fail while a scraper waits.
 */
export function OgMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path
        d="M32 9 L54 21.5 L54 42.5 L32 55 L10 42.5 L10 21.5 Z"
        fill="none"
        stroke={OG.accent}
        strokeWidth={4.5}
        strokeLinejoin="round"
      />
      <path
        d="M32 32 L10 21.5 M32 32 L54 21.5 M32 32 L32 55"
        fill="none"
        stroke={OG.accent}
        strokeWidth={3.5}
        strokeOpacity={0.75}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The wordmark lock-up, used in the corner of every preview. */
export function OgBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <OgMark />
      <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: OG.text }}>
        cubebound
        <span style={{ color: OG.muted }}>.gg</span>
      </div>
    </div>
  );
}

/**
 * Truncates for a fixed-size canvas.
 *
 * Satori has no `text-overflow: ellipsis`, so an over-long cube name would run
 * off the edge rather than clip. Cut it here instead.
 */
export function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Fetches card art as a data URI for embedding.
 *
 * Satori will load a remote `<img src>` itself, but a slow or failed CDN fetch
 * becomes a failed *image response* — and a scraper that gets a 500 caches the
 * absence. Fetching here means a failure degrades to "no art" instead.
 */
export async function fetchImageData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
