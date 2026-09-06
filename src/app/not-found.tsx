import Link from "next/link";

import Logo from "@/components/logo";
import { btn } from "@/lib/ui";

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
      <h1 className="mt-6 text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted">
        That link is wrong, or whatever it pointed at is private or gone.
      </p>
      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={btn.primary}>
          Home
        </Link>
        <Link href="/cards" className={btn.secondary}>
          Browse cards
        </Link>
      </p>
    </div>
  );
}
