/**
 * Light or dark, chosen explicitly rather than inherited from the OS.
 *
 * **Dark is the default.** The card art is dark-bordered and sits on a dark
 * frame, so a light page puts a bright margin around every image; the site
 * reads better dark, and that is what a first-time visitor should get.
 *
 * The choice lives in a cookie rather than `localStorage` so the *server* can
 * read it and put the class on `<html>` in the first response. A client-side
 * theme has to guess, paint, then correct itself — the flash of the wrong
 * theme on every navigation. Same pattern as `cube-view.ts`.
 */

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "cubebound.theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: string | undefined | null): value is Theme {
  return value === "dark" || value === "light";
}

/** The stored choice, or dark when there isn't one. */
export function resolveTheme(cookie: string | undefined): Theme {
  return isTheme(cookie) ? cookie : "dark";
}
