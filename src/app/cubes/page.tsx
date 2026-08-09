import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listCubesForOwner } from "@/db/queries/cubes";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Your cubes · cubebound.gg",
};

const VISIBILITY_STYLE: Record<string, string> = {
  public: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  unlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  private: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

export default async function CubesPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");

  const cubes = await listCubesForOwner(current.profile.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your cubes</h1>
        <Link
          href="/cubes/new"
          className="h-9 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          New cube
        </Link>
      </div>

      {cubes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            You haven&rsquo;t made a cube yet.
          </p>
          <Link
            href="/cubes/new"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            Create your first cube
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {cubes.map((cube) => (
            <li key={cube.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/cube/${current.profile!.username}/${cube.slug}/edit`}
                  className="font-medium hover:underline"
                >
                  {cube.name}
                </Link>
                <p className="mt-0.5 truncate text-sm text-zinc-500">
                  /cube/{current.profile!.username}/{cube.slug}
                  {cube.description ? ` — ${cube.description}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm text-zinc-500 tabular-nums">
                {cube.cardCount} {cube.cardCount === 1 ? "card" : "cards"}
              </span>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${VISIBILITY_STYLE[cube.visibility]}`}
              >
                {cube.visibility}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
