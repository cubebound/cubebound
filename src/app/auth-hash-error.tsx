"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Surfaces an OAuth failure that comes back in the URL *fragment*.
 *
 * Supabase reports some auth failures — `identity_already_exists` among them —
 * by redirecting to the project's Site URL with the detail after a `#`. A
 * fragment never leaves the browser, so unlike the `?code=` and
 * `?error_description=` self-heal in `page.tsx`, **the server cannot see this
 * one at all**. Without this the visitor lands on the home page with no
 * message and a button that appears to have done nothing, which is the worst
 * possible outcome in an auth flow: a silent failure generates "the site is
 * broken" reports with nothing to go on.
 *
 * Which flow failed is decided by whether there is a session, because the
 * fragment does not say. Signed in means a *link* attempt from `/settings` —
 * `/login` would only bounce them back. Signed out means a sign-in attempt,
 * and `/login` already renders `?error`.
 *
 * The fragment is stripped before navigating, so a refresh or a Back does not
 * replay an error the person has already dealt with.
 */
export default function AuthHashError({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    // An empty hash yields no params, so the `message` check below covers the
    // "nothing to do" case on its own — no separate guard for it.
    //
    // `error_description` arrives `+`-encoded ("Identity+is+already+linked"),
    // which URLSearchParams decodes to spaces. Falling back to `error` keeps a
    // bare code visible rather than swallowing it for want of a description.
    const params = new URLSearchParams(window.location.hash.slice(1));
    const message = params.get("error_description") ?? params.get("error");
    if (!message) return;

    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    router.replace(
      `${signedIn ? "/settings" : "/login"}?error=${encodeURIComponent(message)}`,
    );
  }, [signedIn, router]);

  return null;
}
