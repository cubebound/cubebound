import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoMark } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";

// Title and description come from the layout's defaults; only the canonical is
// this page's own. The near-miss `?code=…` catch below means the landing page
// is reachable under a query string it should never be indexed under.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** First value of a param that may arrive repeated. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The landing page also catches near-miss auth redirects.
 *
 * Supabase falls back to the project's Site URL when `emailRedirectTo` isn't on
 * the allowlist, which drops the visitor here with `?code=…` and nothing to
 * consume it — sign-in silently never completes. Forwarding to the callback
 * makes that self-heal instead of stranding the user. The PKCE verifier lives
 * in a cookie, so the exchange still works after the hop.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const code = one(params.code);
  const errorDescription = one(params.error_description) ?? one(params.error);

  if (code || errorDescription) {
    const forward = new URLSearchParams();
    if (code) forward.set("code", code);
    if (errorDescription) forward.set("error_description", errorDescription);
    const next = one(params.next);
    if (next?.startsWith("/")) forward.set("next", next);
    redirect(`/auth/callback?${forward.toString()}`);
  }

  // Signed in without a profile means the username was never claimed, and
  // cube creation needs one — send them to finish that instead of to a form
  // that would bounce them.
  const current = await getCurrentUser();
  const build = current?.profile
    ? { href: "/cubes/new", label: "Create a cube" }
    : current
      ? { href: "/welcome", label: "Choose a username" }
      : { href: "/login", label: "Sign in to build" };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 sm:px-6">
      {/* Not a link: this is already home. */}
      <p className="mb-4">
        <LogoMark size="lg" />
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Cube construction and drafting for Riftbound
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Welcome to cubebound.gg! Build a cube from the full card pool, organize
        it by domain, cost and type, and write a primer explaining how it
        drafts.
      </p>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Share your cube far and wide with shareable links — anyone can clone one
        into their own account to make it theirs. Do a test draft against bots
        or export your cube to Draftmancer and draft it with friends.
      </p>
      {/* Above the Cube Cobra credit and below the pitch: someone who has never
          drafted a cube needs this before they need a Create button, and it is
          also the page most worth linking to from outside. */}
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        New to cubes?{" "}
        <Link
          href="/guides/riftbound-cube-drafting"
          className="font-medium underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Read how cube drafting works
        </Link>
        : what a cube is, how legends and battlefields change drafting, and how
        many cards to include.
      </p>

      <p className="mt-4 text-sm text-zinc-500">
        Credit for many feature and design decisions goes to{" "}
        <a
          href="https://cubecobra.com"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Cube Cobra
        </a>{" "}
        who do an incredible job serving the MTG community.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href={build.href}
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {build.label}
        </Link>
        <Link
          href="/cards"
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Browse cards
        </Link>
      </div>

      {current?.profile && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Or pick up where you left off in{" "}
          <Link href="/cubes" className="font-medium underline underline-offset-2">
            your cubes
          </Link>
          .
        </p>
      )}
    </div>
  );
}
