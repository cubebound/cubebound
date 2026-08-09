import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Cube construction and drafting for Riftbound
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Cube building is still in progress. In the meantime, browse the full
        card pool.
      </p>
      <Link
        href="/cards"
        className="mt-8 inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Browse cards
      </Link>
    </div>
  );
}
