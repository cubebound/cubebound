"use client";

import Link from "next/link";
import { useEffect } from "react";

import Logo from "@/components/logo";

/**
 * Shown when a page throws.
 *
 * Offers "Try again" before anything else because most failures here are a
 * dropped request rather than broken data, and a retry costs nothing. The
 * digest is surfaced on purpose: it is the only handle that ties what a tester
 * saw to a line in the server logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nothing is watching for errors yet, so at least put it in the console
    // the person who hit it can open.
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
      <Logo size="lg" className="inline-block" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something broke</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        That page didn&rsquo;t load. Trying again usually works; if it doesn&rsquo;t,
        the reference below identifies what went wrong.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-zinc-500">{error.digest}</p>
      )}
      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Home
        </Link>
      </p>
    </div>
  );
}
