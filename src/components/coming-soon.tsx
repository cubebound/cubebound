import Link from "next/link";

import Logo from "@/components/logo";

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
      <Logo size="lg" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">{description}</p>
      <p className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/cubes"
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Your cubes
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
