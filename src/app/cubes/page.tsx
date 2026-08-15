import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import CubeResults from "@/components/cube-results";
import Pagination from "@/components/pagination";
import { countCubesForOwner, MAX_CUBES_PER_USER } from "@/db/queries/cubes";
import {
  countCubes,
  CUBES_PAGE_SIZE,
  searchCubes,
  type CubeSearchOptions,
} from "@/db/queries/discovery";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Your cubes",
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * The signed-in user's cubes, and the ones they follow.
 *
 * Both tabs are the same query with a different restriction, so the row, the
 * card count and the search behave identically across them. Followed cubes are
 * ordered by last update — the reason to follow a cube is to know when it
 * changes — and the owned tab keeps that order too, which is what it always had.
 */
export default async function CubesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; q?: string | string[]; page?: string | string[] }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");
  const profile = current.profile;

  const params = await searchParams;
  const followed = one(params.tab) === "followed";
  const keywords = one(params.q).slice(0, 100);

  // Own cubes include private and unlisted ones — they're yours. The followed
  // tab does not set `includeNonPublic`, so a cube that went private after you
  // followed it drops out of the list rather than leaking its name.
  const filters: CubeSearchOptions = followed
    ? { followedBy: profile.id, viewerId: profile.id, keywords }
    : { ownerId: profile.id, includeNonPublic: true, viewerId: profile.id, keywords };

  const total = await countCubes(filters);
  const pageCount = Math.max(1, Math.ceil(total / CUBES_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(one(params.page)) || 1), pageCount);

  const cubes = await searchCubes({
    ...filters,
    limit: CUBES_PAGE_SIZE,
    offset: (page - 1) * CUBES_PAGE_SIZE,
  });

  // Unfiltered, unlike `total` — the cap counts every cube you own, not the
  // ones matching a search. Only worth showing as you approach it.
  const owned = followed ? 0 : await countCubesForOwner(profile.id);
  const atLimit = owned >= MAX_CUBES_PER_USER;

  const href = (next: { tab?: "own" | "followed"; q?: string; page?: number }) => {
    const query = new URLSearchParams();
    const tab = next.tab ?? (followed ? "followed" : "own");
    const q = next.q ?? keywords;
    if (tab === "followed") query.set("tab", "followed");
    if (q) query.set("q", q);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const string = query.toString();
    return string ? `/cubes?${string}` : "/cubes";
  };

  const tab = (label: string, value: "own" | "followed", active: boolean) => (
    <Link
      href={href({ tab: value, page: 1 })}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
        active
          ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {followed ? "Followed cubes" : "Your cubes"}
        </h1>
        <div className="flex shrink-0 items-center gap-3">
          {!followed && owned >= MAX_CUBES_PER_USER - 5 && (
            <span
              className={`text-sm tabular-nums ${atLimit ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}
            >
              {owned} / {MAX_CUBES_PER_USER}
            </span>
          )}
          {atLimit ? (
            <span
              title={`You can hold ${MAX_CUBES_PER_USER} cubes. Delete one to make room.`}
              className="h-9 cursor-not-allowed rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              New cube
            </span>
          ) : (
            <Link
              href="/cubes/new"
              className="h-9 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              New cube
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-5 border-b border-zinc-200 dark:border-zinc-800">
        {tab("Your cubes", "own", !followed)}
        {tab("Followed", "followed", followed)}
      </div>

      {/* The search is in the URL so a tab switch, a page turn and a reload all
          agree about what is being shown. */}
      <form method="GET" action="/cubes" className="mt-4 flex gap-2">
        {followed && <input type="hidden" name="tab" value="followed" />}
        <input
          name="q"
          defaultValue={keywords}
          placeholder={followed ? "Search followed cubes…" : "Search your cubes…"}
          aria-label="Search cube names, descriptions and primers"
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Search
        </button>
      </form>

      <div className="mt-4">
        <CubeResults
          cubes={cubes}
          returnPath={href({})}
          signedIn
          variant={followed ? "public" : "owned"}
          empty={
            keywords ? (
              <>
                Nothing matches <span className="font-medium">{keywords}</span>.{" "}
                <Link href={href({ q: "", page: 1 })} className="underline underline-offset-4">
                  Clear the search
                </Link>
              </>
            ) : followed ? (
              <>
                You don&rsquo;t follow any cubes yet.{" "}
                <Link href="/explore" className="underline underline-offset-4">
                  Explore cubes
                </Link>
              </>
            ) : (
              <>
                You haven&rsquo;t made a cube yet.{" "}
                <Link href="/cubes/new" className="underline underline-offset-4">
                  Create your first cube
                </Link>
              </>
            )
          }
        />
      </div>

      {pageCount > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={CUBES_PAGE_SIZE}
            href={(target) => href({ page: target })}
            label="cubes"
          />
        </div>
      )}
    </div>
  );
}
