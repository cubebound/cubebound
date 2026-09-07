/**
 * How many card tiles a cube's visual view puts on a row.
 *
 * A density preference, not a layout one. The visual view's own breakpoints
 * pick a sensible count for the viewport; this overrides that for people who
 * would rather see the whole cube at once, or rather see the art.
 *
 * **Unlike `?view=`, this is a cookie and never a URL param.** The view toggle
 * selects what the *server* renders, so it belongs in the URL and in a shared
 * link. The column count is a CSS class on a list the server has already
 * rendered, so putting it in the URL would cost a round trip on a dynamic route
 * to change a class. The server reads the cookie and passes the class down,
 * which is also what stops the layout flashing at the reader on first paint.
 */

export const CARDS_PER_ROW = [4, 6, 8, 10] as const;
export type CardsPerRow = (typeof CARDS_PER_ROW)[number];

/**
 * The cookie name carries a version, and **changing the default means bumping
 * it** — the same lesson `cubebound.cube-view2` had to learn the hard way.
 *
 * The cookie is pinned for a year and wins over the default by design, so
 * changing the default alone is invisible to everyone who has ever touched the
 * control, which is everyone who uses it. A new name retires those pins once.
 */
export const CARDS_PER_ROW_COOKIE = "cubebound.cards-per-row";
export const CARDS_PER_ROW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Six is the default because it is what the responsive grid already reaches at
 * its widest tier, so nobody's first load changes.
 */
export const DEFAULT_CARDS_PER_ROW: CardsPerRow = 6;

export function isCardsPerRow(value: string | number | undefined | null): value is CardsPerRow {
  return CARDS_PER_ROW.some((count) => String(count) === String(value));
}

export function resolveCardsPerRow(cookie: string | undefined): CardsPerRow {
  if (isCardsPerRow(cookie)) return Number(cookie) as CardsPerRow;
  return DEFAULT_CARDS_PER_ROW;
}
