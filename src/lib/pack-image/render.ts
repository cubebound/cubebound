import path from "node:path";

import sharp from "sharp";

import { cardAtWidth } from "../card-images";
import { layoutPack, type PackImageLayout } from "./layout";

/**
 * Draws a pack as one image.
 *
 * **Server only.** This was specified as a client-side canvas with a server tier
 * for unfurls, and that is not possible: `cmsassets.rgpub.io` sends no
 * `Access-Control-Allow-Origin` on any request shape, verified against a bare
 * GET, an `Origin`-bearing GET and an OPTIONS preflight. So `crossOrigin`
 * anonymous fails to load and a plain load taints the canvas, which makes
 * `toBlob` throw at the very last step. Riot's CDN is not ours to change, and
 * proxying the art to get around it is the thing "we store image URLs, never
 * image bytes" exists to prevent.
 *
 * The consequence is that card art costs us bandwidth here for the first time:
 * roughly 1.5MB in per uncached render. That is why the response must be cached
 * hard and keyed on something stable, and why the full tier sits behind an
 * explicit download rather than an `og:image`.
 *
 * The layout is `./layout`, which is pure and knows nothing about sharp. This
 * file only fetches, resizes and composites the boxes it is given.
 */

/** A card to draw. `landscape` decides which pile it joins, not its own shape:
 *  the layout pairs whichever orientation is in the minority. */
export interface PackImageCard {
  url: string;
  landscape: boolean;
}

export interface RenderPackOptions {
  cards: PackImageCard[];
  /** The card's short side in output pixels. Everything scales from this. */
  unit: number;
  /** The wordmark. Overridable only so the check can prove a different string
   *  still rasterises; nothing in the app passes it. */
  wordmark?: string;
  background?: string;
  /** Injectable so the check can render without a network. */
  fetchImage?: (url: string) => Promise<Buffer>;
}

/** Dark neutral, matching the card frames and Discord's dark mode. */
export const DEFAULT_BACKGROUND = "#0e0f13";
const BRAND_INK = "#e8eaee";
/** Hairline so dark card art does not bleed into the gutter. */
const TILE_BORDER = "rgba(255,255,255,0.14)";

/**
 * The wordmark.
 *
 * Space Grotesk is the site's display face, so the image signs itself in the
 * same voice as the heading above it rather than in whatever the renderer
 * happened to find.
 *
 * **The file is vendored and named explicitly, and that is not cosmetic.** A
 * Vercel function carries almost no fonts, so `font: "sans"` resolves on a
 * developer machine and in CI and renders as *nothing* in production — a bug
 * that no amount of local testing finds. Passing `fontfile` removes the
 * dependency on the host having any fonts at all. It does mean the file has to
 * reach the function bundle: `outputFileTracingIncludes` in `next.config.ts`
 * puts it there, because nothing imports it and Next's tracer cannot see a path
 * built at runtime.
 */
const TEXT_DPI = 72 * 4;
const FONT_FAMILY = "Space Grotesk";
const FONT_FILE = path.join(process.cwd(), "src/lib/pack-image/fonts/SpaceGrotesk-Bold.ttf");
/**
 * Draw the wordmark this many times over, then scale it back down.
 *
 * Pango hints every glyph advance onto a whole device pixel, and the preview
 * tier asks for a 23px em — so a fraction of a pixel per letter accumulates
 * into gaps you can read, `cubebo und.gg` being the one that gave it away. The
 * text API exposes no hinting switch, so the fix is to put the pixel grid out
 * of reach: rasterise at 8x, where the same rounding is an eighth of a pixel,
 * and let lanczos average it away on the way down. The download tier has the
 * same flaw and only hides it better, a 56px em spreading the error thinner.
 *
 * It costs one extra in-memory text raster against seventeen CDN fetches, so
 * it does not register beside what a render already spends.
 */
const SUPERSAMPLE = 8;

/**
 * Never upscale past this. Card assets top out around 744px wide and pushing
 * beyond about 1.2x buys nothing but bytes.
 */
const MAX_UPSCALE = 1.2;
const SOURCE_CAP = 1024;

async function defaultFetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`card art ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** A rounded-rect mask, composited `dest-in` so the art is clipped rather than
 *  drawn over. Drawing a rounded border on top instead leaves square art
 *  corners poking out behind it. */
function roundedMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/>` +
      `</svg>`,
  );
}

function tileBorder(width: number, height: number, radius: number, stroke: number): Buffer {
  const inset = stroke / 2;
  return Buffer.from(
    `<svg width="${width}" height="${height}">` +
      `<rect x="${inset}" y="${inset}" width="${width - stroke}" height="${height - stroke}" ` +
      `rx="${radius}" ry="${radius}" fill="none" stroke="${TILE_BORDER}" stroke-width="${stroke}"/>` +
      `</svg>`,
  );
}

/**
 * Rasterise the wordmark.
 *
 * Pango markup rather than an SVG `<text>`, because the width it comes out at
 * has to be known to right-align it, and this returns the measured bitmap.
 */
export async function renderWordmark(text: string, pixels: number, colour = BRAND_INK) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Pango sizes in *points*, so the requested pixel height has to be converted
  // against the dpi rather than passed straight through. Handing it the pixel
  // count at 288dpi renders four times too big, which is a mistake that looks
  // like a styling choice: the footer simply comes out as a headline.
  //
  // Supersampling buys back what rounding to whole points costs, as well: 23px
  // asked for 6pt and got a 24px em, where 46pt scaled by 8 lands on 23 exactly.
  const points = Math.max(
    4 * SUPERSAMPLE,
    Math.round((pixels * SUPERSAMPLE * 72) / TEXT_DPI),
  );
  const large = await sharp({
    text: {
      text: `<span foreground="${colour}">${escaped}</span>`,
      font: `${FONT_FAMILY} ${points}`,
      fontfile: FONT_FILE,
      rgba: true,
      dpi: TEXT_DPI,
    },
  })
    .png()
    .toBuffer();
  const { width: largeWidth = 0 } = await sharp(large).metadata();
  // Width alone, so the height follows the aspect rather than being rounded
  // independently and squashing the glyphs by up to half a pixel.
  const buffer = await sharp(large)
    .resize({ width: Math.max(1, Math.round(largeWidth / SUPERSAMPLE)), kernel: "lanczos3" })
    .png()
    .toBuffer();
  const { width = 0, height = 0 } = await sharp(buffer).metadata();
  return { buffer, width, height };
}

export interface RenderedPack {
  buffer: Buffer;
  layout: PackImageLayout;
  /** Inbound bytes of card art, so the caller can log what a render costs. */
  fetchedBytes: number;
}

export async function renderPackImage(
  options: RenderPackOptions,
): Promise<RenderedPack | null> {
  const { cards, unit, wordmark = "cubebound.gg" } = options;
  const fetchImage = options.fetchImage ?? defaultFetchImage;

  // Battlefields first, so the indices line up with the layout's minority-first
  // fill order. This is also the sort the image itself shows.
  const battlefields = cards.filter((card) => card.landscape);
  const portrait = cards.filter((card) => !card.landscape);
  const ordered = [...battlefields, ...portrait];

  const layout = layoutPack(portrait.length, battlefields.length, unit);
  if (!layout) return null;

  let fetchedBytes = 0;
  const tiles = await Promise.all(
    layout.placements.map(async (placement) => {
      const source = ordered[placement.card];
      const width = Math.min(SOURCE_CAP, Math.round(placement.width * MAX_UPSCALE));
      const raw = await fetchImage(cardAtWidth(source.url, width) ?? source.url);
      fetchedBytes += raw.byteLength;
      const stroke = Math.max(1, Math.round(unit * 0.0025));
      const input = await sharp(raw)
        .resize(placement.width, placement.height, { fit: "fill", kernel: "lanczos3" })
        .composite([
          { input: roundedMask(placement.width, placement.height, layout.radius), blend: "dest-in" },
          { input: tileBorder(placement.width, placement.height, layout.radius, stroke) },
        ])
        .png()
        .toBuffer();
      return { input, left: placement.left, top: placement.top };
    }),
  );

  // The footer is the wordmark alone. It carried the cube name and a card count
  // on the left as well, which read as a caption on an image that already shows
  // exactly those cards — the count in particular restated what anyone can see.
  const brand = await renderWordmark(wordmark, Math.round(unit * 0.075));
  const baseline =
    layout.height - layout.padding - Math.round(layout.footer * 0.5) - Math.round(brand.height / 2);

  const buffer = await sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 4,
      background: options.background ?? DEFAULT_BACKGROUND,
    },
  })
    .composite([
      ...tiles,
      {
        input: brand.buffer,
        left: layout.width - layout.padding - brand.width,
        top: baseline,
      },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  return { buffer, layout, fetchedBytes };
}
