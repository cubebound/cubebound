"use client";

import { useState } from "react";

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "@/lib/theme";

/**
 * Switches the page between dark and light.
 *
 * Flips the class on `<html>` directly and writes the cookie, rather than
 * calling a server action and waiting for a re-render: the theme is presentation
 * only, so it should change on the same frame as the click. The cookie is what
 * makes the *next* request server-render the right theme with no flash.
 */
export default function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const apply = (next: Theme) => {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  };

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => apply(dark ? "light" : "dark")}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        {dark ? (
          // Moon
          <path d="M16 11.8A6.5 6.5 0 0 1 8.2 4a6.5 6.5 0 1 0 7.8 7.8Z" />
        ) : (
          // Sun
          <>
            <circle cx="10" cy="10" r="3.4" />
            <path d="M10 2.4v1.7M10 15.9v1.7M17.6 10h-1.7M4.1 10H2.4M15.4 4.6l-1.2 1.2M5.8 14.2l-1.2 1.2M15.4 15.4l-1.2-1.2M5.8 5.8 4.6 4.6" />
          </>
        )}
      </svg>
      {dark ? "Dark" : "Light"}
    </button>
  );
}
