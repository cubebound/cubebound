import Link from "next/link";

import Logo from "@/components/logo";
import { btn } from "@/lib/ui";

/**
 * A placeholder for a route that exists but isn't built yet.
 *
 * Given its own route rather than a shared `/coming-soon` so the URL is already
 * the right one when the feature lands — nobody has to update a link, and a
 * bookmark keeps working.
 */
export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6">
      <Logo size="lg" className="inline-block" />
      <h1 className="mt-6 text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted">{description}</p>
      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/cubes" className={btn.primary}>
          Your cubes
        </Link>
        <Link href="/cards" className={btn.secondary}>
          Browse cards
        </Link>
      </p>
    </div>
  );
}
