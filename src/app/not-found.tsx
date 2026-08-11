import Link from "next/link";

import Logo from "@/components/logo";

/**
 * Shown for an unknown URL, and for anything that calls `notFound()` — a
 * private cube seen by a stranger, a cube slug that no longer exists.
 *
 * Deliberately says nothing about *why*. A private cube and a cube that never
 * existed have to be indistinguishable, or the 404 becomes a way to test
 * whether a given cube id is real.
 */
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
      <Logo size="lg" className="inline-block" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        That link is wrong, or the cube behind it is private or gone.
      </p>
      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Home
        </Link>
        <Link
          href="/cards"
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Browse cards
        </Link>
      </p>
    </div>
  );
}
