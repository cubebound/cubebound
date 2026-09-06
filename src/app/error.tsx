"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import Logo from "@/components/logo";
import { btn } from "@/lib/ui";

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
    // The digest shown below is the same one Sentry indexes the event under, so
    // a tester reading it out is enough to find the stack trace. Inert when no
    // DSN is configured — see src/lib/sentry-options.ts.
    Sentry.captureException(error);
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
      <Logo size="lg" className="inline-block" />
      <h1 className="mt-6 text-2xl font-semibold">Something broke</h1>
      <p className="mt-3 text-muted">
        That page didn&rsquo;t load. Trying again usually works; if it
        doesn&rsquo;t, quote the reference below and it&rsquo;ll find this in our
        logs.
      </p>
      {error.digest && (
        <p className="mt-3 inline-block rounded border border-line bg-sunken px-2 py-1 font-mono text-xs text-subtle">
          {error.digest}
        </p>
      )}
      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={btn.primary}>
          Try again
        </button>
        <Link href="/" className={btn.secondary}>
          Home
        </Link>
      </p>
    </div>
  );
}
