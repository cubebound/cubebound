/**
 * How a cube's card list is displayed.
 *
 * Resolution order: an explicit `?view=` param wins, then the cookie holding
 * the viewer's last choice, then **text**. The param winning means a shared link
 * shows what the sender saw; the cookie means your own preference survives
 * navigating to a cube without the param.
 *
 * Text is the default because the first question about a cube is what's *in*
 * it, and the list answers that on one screen — 360 image tiles is several
 * screens of scrolling and a few megabytes before you can tell. The visual view
 * is one click away and the choice sticks.
 */

export const CUBE_VIEWS = ["visual", "text"] as const;
export type CubeView = (typeof CUBE_VIEWS)[number];

/**
 * The cookie name carries a version, and **changing the default means bumping
 * it**.
 *
 * The cookie is pinned for a year, and it wins over the default by design — so
 * anyone who had ever touched the toggle kept seeing the old default and the
 * change was invisible to exactly the people using the site. A new name retires
 * those pins once; the next explicit choice writes under the new one and sticks
 * as before.
 */
export const CUBE_VIEW_COOKIE = "cubebound.cube-view2";
export const CUBE_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isCubeView(value: string | undefined | null): value is CubeView {
  return value === "visual" || value === "text";
}

export function resolveCubeView(
  param: string | string[] | undefined,
  cookie: string | undefined,
): CubeView {
  const fromParam = Array.isArray(param) ? param[0] : param;
  if (isCubeView(fromParam)) return fromParam;
  if (isCubeView(cookie)) return cookie;
  return "text";
}
