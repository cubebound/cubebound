/**
 * Pack image layout.
 *
 * Every rectangle here is arithmetic. There is no layout engine and no flexbox:
 * the solver returns a grid and `placements` turns it into concrete boxes, so
 * the same numbers can be drawn by anything — `sharp` on the server today, a
 * canvas in the browser if the card CDN ever sends CORS headers.
 *
 * **It is pure, and it must stay pure.** No DOM, no Node, no fetch, no clock.
 * That is what lets `check:pack-image` assert the whole thing without a browser
 * or a network, and what would let the download button share it unchanged.
 *
 * The problem it solves: a pack mixes portrait cards (63×88) with landscape
 * battlefields (88×63). Laid out naively the battlefields are lone half-height
 * tiles among full-height ones, which reads as a broken image rather than as
 * two shapes of card. So the minority orientation pairs two-per-slot into one
 * tile of the majority's shape, and the grid stays regular.
 */

/** Portrait card width over height. A battlefield is this rotated. */
export const RATIO = 63 / 88;
/** Aspect the column search aims for: near 3:2, which previews well on Discord
 *  and survives X's timeline crop. */
export const TARGET_AR = 1.4;
/**
 * Score cost per empty cell.
 *
 * 0.15 rather than the 0.1 the solver was prototyped at. A dead cell used to
 * hold a `cubebound.gg` tile and so bought something; branding is the footer
 * label now, which makes a dead cell a pure hole. Verified not to change any of
 * the six worked examples — it only breaks ties that were already close.
 */
export const DEAD_PENALTY = 0.15;
/** Gap between two paired minority tiles. Both pairings need roughly a 4%
 *  shrink to fit, and this is where it goes. */
export const PAIR_GAP = 0.04;

/** Every length below is a fraction of the card's short side, so the whole
 *  image scales from one number. */
export const GUTTER = 0.05;
export const PADDING = 0.09;
export const FOOTER = 0.17;
export const CORNER = 0.035;

export interface PackLayout {
  cols: number;
  rows: number;
  /** Cells the grid has that nothing fills. */
  dead: number;
  /** Width over height of the grid alone, ignoring padding and footer. */
  ar: number;
  slots: number;
  /** Whether portrait cards are the majority and so the base tile. */
  portraitMajor: boolean;
  majN: number;
  minN: number;
}

/**
 * Pick the grid.
 *
 * Ties go to portrait, which is why this is `>=`: an all-battlefield pack flips
 * to a landscape base tile, and without that flip you get one row of tiny
 * half-height battlefields — the worst possible rendering of the most striking
 * art in the game.
 */
export function solve(nCards: number, nBattlefields: number): PackLayout | null {
  const portraitMajor = nCards >= nBattlefields;
  const majN = portraitMajor ? nCards : nBattlefields;
  const minN = portraitMajor ? nBattlefields : nCards;
  const slots = majN + Math.ceil(minN / 2);
  if (slots === 0) return null;

  const tileAr = portraitMajor ? RATIO : 1 / RATIO;
  let best: PackLayout | null = null;
  let bestScore = Infinity;
  // From 1, not 2. The prototype started at 2 and so returned nothing at all
  // for a one-slot pack, because `min(10, slots)` was then below the start of
  // the loop. A single column never wins for a real pack — sixteen slots in one
  // column scores 1.36 against 0.33 for six — so the extra candidate costs
  // nothing and removes the hole.
  for (let cols = 1; cols <= Math.min(10, slots); cols++) {
    const rows = Math.ceil(slots / cols);
    const dead = cols * rows - slots;
    const ar = (cols * tileAr) / rows;
    const score = Math.abs(ar - TARGET_AR) + DEAD_PENALTY * dead;
    if (score < bestScore) {
      bestScore = score;
      best = { cols, rows, dead, ar, slots, portraitMajor, majN, minN };
    }
  }
  return best;
}

export type SlotFill =
  | { slot: number; kind: "pair"; count: number }
  | { slot: number; kind: "base"; index: number };

/**
 * Which slot holds what.
 *
 * Minority slots first, then the majority in pack order, so dead cells fall at
 * the end where the short-row centring can absorb them.
 */
export function build(layout: PackLayout): SlotFill[] {
  const out: SlotFill[] = [];
  const minSlots = Math.ceil(layout.minN / 2);
  let left = layout.minN;
  for (let i = 0; i < minSlots; i++) {
    out.push({ slot: i, kind: "pair", count: Math.min(2, left) });
    left -= 2;
  }
  for (let i = 0; i < layout.majN; i++) {
    out.push({ slot: minSlots + i, kind: "base", index: i });
  }
  return out;
}

/** One card's box in the finished image, in whole pixels. */
export interface Placement {
  /** Index into the ordered card list the caller passed in. */
  card: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PackImageLayout {
  width: number;
  height: number;
  /** Radius for every tile, and for the background's own corners. */
  radius: number;
  padding: number;
  footer: number;
  placements: Placement[];
  grid: PackLayout;
}

/**
 * Turn a solved grid into pixel boxes.
 *
 * `unit` is the card's short side in output pixels, and everything else follows
 * from it. Card order is minority-first to match `build`, so the caller sorts
 * battlefields ahead of cards and the indices line up.
 *
 * **A short last row is centred.** With nothing in the dead cells, a
 * left-aligned gap reads as a card that failed to load rather than as the pack
 * ending.
 */
export function layoutPack(
  nCards: number,
  nBattlefields: number,
  unit: number,
): PackImageLayout | null {
  const grid = solve(nCards, nBattlefields);
  if (!grid) return null;

  const baseW = Math.round(grid.portraitMajor ? unit : unit / RATIO);
  const baseH = Math.round(grid.portraitMajor ? unit / RATIO : unit);
  const gap = Math.round(unit * GUTTER);
  const padding = Math.round(unit * PADDING);
  const footer = Math.round(unit * FOOTER);
  const radius = Math.round(unit * CORNER);

  const gridW = grid.cols * baseW + (grid.cols - 1) * gap;
  const gridH = grid.rows * baseH + (grid.rows - 1) * gap;
  const width = gridW + padding * 2;
  const height = gridH + padding * 2 + footer;

  // Cells in the final row, so it can be centred when the pack does not fill it.
  const lastRowCount = grid.slots - (grid.rows - 1) * grid.cols;
  const lastRowShift =
    grid.dead > 0 ? Math.round(((grid.cols - lastRowCount) * (baseW + gap)) / 2) : 0;

  const slotBox = (slot: number) => {
    const row = Math.floor(slot / grid.cols);
    const col = slot % grid.cols;
    const shift = row === grid.rows - 1 ? lastRowShift : 0;
    return {
      x: padding + col * (baseW + gap) + shift,
      y: padding + row * (baseH + gap),
    };
  };

  const placements: Placement[] = [];
  const pairShrink = unit * PAIR_GAP;
  let minorityDrawn = 0;

  for (const fill of build(grid)) {
    const { x, y } = slotBox(fill.slot);
    if (fill.kind === "base") {
      // The majority sits after every minority card in the ordered list.
      placements.push({
        card: grid.minN + fill.index,
        left: x,
        top: y,
        width: baseW,
        height: baseH,
      });
      continue;
    }
    if (grid.portraitMajor) {
      // Two battlefields scaled to card width stack to about one card's height.
      const h = Math.round((baseH - pairShrink) / 2);
      const w = Math.round(h / RATIO);
      const ox = x + Math.round((baseW - w) / 2);
      for (let k = 0; k < fill.count; k++) {
        const solo = fill.count === 1 ? Math.round((baseH - h) / 2) : 0;
        placements.push({
          card: minorityDrawn++,
          left: ox,
          top: y + k * (h + Math.round(pairShrink)) + solo,
          width: w,
          height: h,
        });
      }
    } else {
      // Two cards scaled to battlefield height sit side by side.
      const w = Math.round((baseW - pairShrink) / 2);
      const h = Math.round(w / RATIO);
      const oy = y + Math.round((baseH - h) / 2);
      for (let k = 0; k < fill.count; k++) {
        const solo = fill.count === 1 ? Math.round((baseW - w) / 2) : 0;
        placements.push({
          card: minorityDrawn++,
          left: x + k * (w + Math.round(pairShrink)) + solo,
          top: oy,
          width: w,
          height: h,
        });
      }
    }
  }

  return { width, height, radius, padding, footer, placements, grid };
}
