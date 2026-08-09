/**
 * How a cube's card list is displayed.
 *
 * Resolution order: an explicit `?view=` param wins, then the cookie holding
 * the viewer's last choice, then visual. The param winning means a shared link
 * shows what the sender saw; the cookie means your own preference survives
 * navigating to a cube without the param.
 */

export const CUBE_VIEWS = ["visual", "text"] as const;
export type CubeView = (typeof CUBE_VIEWS)[number];

export const CUBE_VIEW_COOKIE = "cubebound.cube-view";
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
  return "visual";
}
