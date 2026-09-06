import type { Metadata } from "next";
import Link from "next/link";

import CubeResults from "@/components/cube-results";
import { searchCubes, type CubeSort } from "@/db/queries/discovery";
import { getCurrentUser } from "@/lib/auth";
import { btn, pager, tab } from "@/lib/ui";

/** How deep an ordering goes before you have to search instead. */
const EXPLORE_LIMIT = 60;
const EXPLORE_PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: "Riftbound Cubes to Draft & Clone",
  description:
    "Browse Riftbound cubes built by the community. Search by name, description, " +
    "primer or the cards they hold, then draft or clone one into your own account.",
  // `?q=`, `?sort=` and `?page=` are all the same page re-filtered, and indexed
  // internal search results are thin by definition. Every public cube reaches
  // a crawler through the sitemap rather than through a results page.
  alternates: { canonical: "/explore" },
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Finding other people's cubes.
 *
 * Public cubes only — enforced in `searchCubes`, not here, so it can't be
 * forgotten by a second caller. Unlisted cubes stay reachable by link but out
 * of results, which is the whole point of the setting.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    card?: string | string[];
    sort?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const keywords = one(params.q).slice(0, 100);
  const cardName = one(params.card).slice(0, 100);
  const sort: CubeSort = one(params.sort) === "follows" ? "follows" : "updated";

  const current = await getCurrentUser();

  // The whole capped set in one query, paged in memory. Sixty rows is a trivial
  // amount to fetch and it keeps the cap in one place — an offset query per page
  // would need its own bound and could walk past sixty by accident.
  //
  // **No total and no "page N of M".** How many cubes exist is not a visitor's
  // business, and a page count reports it: with pages of twenty, "of 2" says
  // there are 21–40. Previous/Next with the current page number navigates just
  // as well and says only whether there is more.
  const found = await searchCubes({
    keywords,
    cardName,
    sort,
    viewerId: current?.profile?.id ?? null,
    limit: EXPLORE_LIMIT,
  });

  const lastPage = Math.max(1, Math.ceil(found.length / EXPLORE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(one(params.page)) || 1), lastPage);
  const cubes = found.slice((page - 1) * EXPLORE_PAGE_SIZE, page * EXPLORE_PAGE_SIZE);
  const hasMore = page < lastPage;

  const href = (next: Partial<{ q: string; card: string; sort: string; page: number }>) => {
    const query = new URLSearchParams();
    const q = next.q ?? keywords;
    const c = next.card ?? cardName;
    const s = next.sort ?? sort;
    if (q) query.set("q", q);
    if (c) query.set("card", c);
    if (s !== "updated") query.set("sort", s);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const string = query.toString();
    return string ? `/explore?${string}` : "/explore";
  };

  const sortTab = (label: string, value: CubeSort) => (
    <Link
      href={href({ sort: value, page: 1 })}
      aria-current={sort === value ? "page" : undefined}
      className={sort === value ? tab.active : tab.inactive}
    >
      {label}
    </Link>
  );

  const searching = Boolean(keywords || cardName);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Explore cubes</h1>
      <p className="mt-2 text-sm text-muted">
        Public cubes from everyone. Search names, descriptions and primers, or
        find the cubes running a particular card.
      </p>

      {/* A plain GET form: the search belongs in the URL so a result set can be
          shared, linked and paged without re-typing it. */}
      <form method="GET" action="/explore" className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={keywords}
            placeholder="Name, description or primer…"
            aria-label="Search cube names, descriptions and primers"
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 text-sm"
          />
          <input
            name="card"
            defaultValue={cardName}
            placeholder="Contains card…"
            aria-label="Only cubes containing this card"
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 text-sm"
          />
          {sort !== "updated" && <input type="hidden" name="sort" value={sort} />}
          <button
            type="submit"
            className={btn.primary}
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {sortTab("Recently updated", "updated")}
        {sortTab("Most followed", "follows")}
        <span className="ml-auto text-sm text-subtle">
          {found.length === EXPLORE_LIMIT ? `Top ${EXPLORE_LIMIT}` : null}
        </span>
      </div>

      <div className="mt-4">
        <CubeResults
          cubes={cubes}
          returnPath="/explore"
          signedIn={Boolean(current?.profile)}
          empty={
            searching
              ? "No public cubes match that search."
              : "No public cubes yet. Make one public and it'll show up here."
          }
        />
      </div>

      {(page > 1 || hasMore) && (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4"
        >
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} rel="prev" className={pager}>
              ← Previous
            </Link>
          ) : (
            <span className={`${pager} cursor-default opacity-40`}>← Previous</span>
          )}

          {/* The page number, but never "of N" — with pages of twenty that
              would report how many cubes exist. */}
          <span className="text-sm tabular-nums text-muted">
            Page {page}
          </span>

          {hasMore ? (
            <Link href={href({ page: page + 1 })} rel="next" className={pager}>
              Next →
            </Link>
          ) : (
            <span className={`${pager} cursor-default opacity-40`}>Next →</span>
          )}
        </nav>
      )}

      {!hasMore && found.length === EXPLORE_LIMIT && (
        <p className="mt-3 text-center text-xs text-subtle">
          That&rsquo;s as far as this list goes. Search to find more.
        </p>
      )}
    </div>
  );
}
