/**
 * The pack image layout: the six shapes from the build spec, plus the two
 * behaviours that are easy to regress and hard to notice.
 *
 * Pure arithmetic, so this runs in CI with no browser, no network and no
 * `sharp` — the renderer is the only part that needs any of those, and it draws
 * exactly the boxes asserted here.
 */
import {
  DEAD_PENALTY,
  RATIO,
  layoutPack,
  solve,
} from "../src/lib/pack-image/layout";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

// --- the spec's worked examples ----------------------------------------------
const cases: [string, number, number, boolean, number, number, number, number][] = [
  // label,                    cards, bf, portrait, slots, cols, rows, dead
  ["15 + 2 BF (cube pack)",       15,  2,  true,      16,    6,    3,    2],
  ["13 + 1 BF (Legacy)",          13,  1,  true,      14,    5,    3,    1],
  ["14, no BF (Legacy)",          14,  0,  true,      14,    5,    3,    1],
  ["12 cards",                    12,  0,  true,      12,    4,    3,    0],
  ["15, no BF",                   15,  0,  true,      15,    5,    3,    0],
  ["5 battlefields only",          0,  5,  false,      5,    2,    3,    1],
];
for (const [label, cards, bf, portrait, slots, cols, rows, dead] of cases) {
  const g = solve(cards, bf);
  if (!g) {
    expect(false, `${label}: solver returned nothing`);
    continue;
  }
  expect(g.portraitMajor === portrait, `${label}: base tile should be ${portrait ? "portrait" : "landscape"}`);
  expect(g.slots === slots, `${label}: ${slots} slots, got ${g.slots}`);
  expect(g.cols === cols && g.rows === rows, `${label}: ${cols}x${rows}, got ${g.cols}x${g.rows}`);
  expect(g.dead === dead, `${label}: ${dead} dead, got ${g.dead}`);
}

// --- the two behaviours the spec calls out ------------------------------------
{
  // Dropping the battlefields narrows the grid rather than leaving holes, so
  // the cards get bigger.
  const withBf = solve(15, 2)!;
  const without = solve(15, 0)!;
  expect(withBf.cols === 6 && without.cols === 5, "dropping battlefields should narrow 6 columns to 5");

  // The all-battlefield case flips the base tile, or you get one row of tiny
  // half-height battlefields.
  expect(solve(0, 5)!.portraitMajor === false, "an all-battlefield pack flips to a landscape base tile");
  expect(solve(1, 5)!.portraitMajor === false, "one stray card does not flip it back");
  expect(solve(5, 5)!.portraitMajor === true, "ties go to portrait");
}

// --- raising DEAD_PENALTY must not disturb the worked examples ----------------
{
  expect(DEAD_PENALTY === 0.15, "the brand tile is gone, so a dead cell buys nothing");
}

// --- placements ---------------------------------------------------------------
{
  const unit = 480;
  const L = layoutPack(15, 2, unit)!;
  expect(L.placements.length === 17, `every card gets a box, got ${L.placements.length}`);
  const seen = new Set(L.placements.map((p) => p.card));
  expect(seen.size === 17, "no card is placed twice and none is dropped");
  expect(
    Math.min(...seen) === 0 && Math.max(...seen) === 16,
    "card indices cover the whole pack",
  );
  // Minority first: the two battlefields are indices 0 and 1, and they are
  // landscape while the cards are portrait.
  const bf = L.placements.filter((p) => p.card < 2);
  expect(bf.every((p) => p.width > p.height), "battlefields draw landscape");
  expect(
    L.placements.filter((p) => p.card >= 2).every((p) => p.height > p.width),
    "cards draw portrait",
  );
  // Nothing may escape the canvas, or sharp throws at composite time.
  expect(
    L.placements.every(
      (p) =>
        p.left >= 0 &&
        p.top >= 0 &&
        p.left + p.width <= L.width &&
        p.top + p.height <= L.height - L.footer,
    ),
    "every box sits inside the grid area",
  );
  // A paired battlefield is about a card's width, not a card's height.
  expect(
    bf.every((p) => Math.abs(p.width - unit) < unit * 0.06),
    "paired battlefields scale to card width",
  );
}

// --- a short last row is centred ----------------------------------------------
{
  const L = layoutPack(13, 1, 480)!;
  const rowTop = Math.max(...L.placements.map((p) => p.top));
  const lastRow = L.placements.filter((p) => p.top === rowTop);
  expect(L.grid.dead === 1, "13 + 1 BF leaves one dead cell");
  const leftGap = Math.min(...lastRow.map((p) => p.left)) - L.padding;
  expect(leftGap > 0, "a short last row is indented rather than left-aligned");
  const rightGap =
    L.width - L.padding - Math.max(...lastRow.map((p) => p.left + p.width));
  expect(
    Math.abs(leftGap - rightGap) <= 2,
    `a short last row is centred (left ${leftGap}, right ${rightGap})`,
  );
  // A full row still reaches the right-hand padding line. Not the left one:
  // slot 0 holds the paired battlefield, which is centred inside its cell.
  expect(
    Math.max(...L.placements.map((p) => p.left + p.width)) === L.width - L.padding,
    "a full row spans to the right padding line",
  );
}

// --- degenerate shapes must not throw -----------------------------------------
{
  expect(solve(0, 0) === null, "an empty pack has no layout");
  expect(layoutPack(0, 0, 480) === null, "and no boxes");
  expect(layoutPack(1, 0, 480)!.placements.length === 1, "a one-card pack still lays out");
  expect(layoutPack(0, 1, 480)!.placements.length === 1, "so does a one-battlefield pack");
  expect(Math.abs(RATIO - 63 / 88) < 1e-9, "the card ratio is the printed one");
}

// --- the wordmark must actually rasterise ------------------------------------
// The one part that cannot be checked by arithmetic. A Vercel function carries
// almost no fonts, so a family that falls back locally renders as nothing in
// production; this asserts the vendored file is present and that pango draws
// real glyphs from it, which is what `outputFileTracingIncludes` exists to keep
// true after a deploy.
{
  const { existsSync } = await import("node:fs");
  const fontPath = "src/lib/pack-image/fonts/SpaceGrotesk-Bold.ttf";
  expect(existsSync(fontPath), `the wordmark font is vendored at ${fontPath}`);

  const { renderWordmark } = await import("../src/lib/pack-image/render");
  const sharp = (await import("sharp")).default;
  const { buffer, width, height } = await renderWordmark("cubebound.gg", 36);
  expect(width > 0 && height > 0, `the wordmark measures to something, got ${width}x${height}`);
  const stats = await sharp(buffer).stats();
  const alpha = stats.channels[3];
  expect(Boolean(alpha) && alpha.max > 0, "the wordmark draws glyphs rather than an empty box");
  // Wider for more characters, or it is drawing a single fallback box.
  const longer = await renderWordmark("cubebound.gg cubebound.gg", 36);
  expect(longer.width > width * 1.5, "the wordmark scales with its text");
}

if (failures.length > 0) {
  console.error(`pack image check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
const g = solve(15, 2)!;
console.log(
  `pack image check passed (cube pack: ${g.cols}x${g.rows}, ${g.dead} dead, aspect ${g.ar.toFixed(2)})`,
);
