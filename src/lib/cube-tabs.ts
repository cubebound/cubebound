/**
 * The tabs a cube has, in the order they appear.
 *
 * **One list, and every tab is always shown.** The public page used to hide
 * Primer and Maybeboard when they were empty and the editor always showed them,
 * which meant two hand-rolled tab rows drifting apart — and a row whose shape
 * changed from cube to cube, so Primer was the third tab on one and absent on
 * the next. A constant row is easier to learn and much easier to keep honest;
 * the cost is an empty state per tab, which each of them needed anyway.
 *
 * The same list serves owners and visitors. Editing lives in the action bar
 * above the list, not in the tabs, so nothing here depends on who is looking.
 *
 * Each page keeps its own query-parameter name — the editor is on `?mode=`
 * because `browse` and `import` share that parameter and two check scripts
 * navigate straight to them — so this module owns *which tabs exist and in what
 * order*, and the pages own their own URLs.
 */

export const CUBE_TABS = ["cube", "maybeboard", "primer", "analytics", "log"] as const;
export type CubeTab = (typeof CUBE_TABS)[number];

/**
 * "Mainboard", not "Cube": it pairs with Maybeboard, and it is the same word the
 * edit panel's Board selector uses, so one term means one thing throughout.
 */
export const CUBE_TAB_LABELS: Record<CubeTab, string> = {
  cube: "Mainboard",
  maybeboard: "Maybeboard",
  primer: "Primer",
  analytics: "Analytics",
  log: "Change log",
};

/** The default tab carries no parameter, so a bare cube URL stays clean. */
export const DEFAULT_CUBE_TAB: CubeTab = "cube";

export function isCubeTab(value: string | undefined | null): value is CubeTab {
  return (CUBE_TABS as readonly string[]).includes(value ?? "");
}

/**
 * Which tab a request is on. Anything unrecognised — including the editor's
 * `browse` and `import`, which are modes rather than tabs — falls back to the
 * cube itself, so a stray parameter never renders a blank page.
 */
export function resolveCubeTab(param: string | string[] | undefined): CubeTab {
  const value = Array.isArray(param) ? param[0] : param;
  return isCubeTab(value) ? value : DEFAULT_CUBE_TAB;
}

/** The two tabs that show the cube's cards, and so take the view controls. */
export function tabShowsCards(tab: CubeTab): boolean {
  return tab === "cube" || tab === "maybeboard";
}
