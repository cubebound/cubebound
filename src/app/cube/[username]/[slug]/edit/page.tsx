import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CardFilterBar from "@/components/card-filter-bar";
import CardPagination from "@/components/card-pagination";
import { getFilterOptions, PAGE_SIZE, searchCards } from "@/db/queries/cards";
import { getCubeByOwnerAndSlug, getCubeCardIds, getCubeCards } from "@/db/queries/cubes";
import { getCurrentUser } from "@/lib/auth";
import { cardFiltersFromParams, type SearchParams } from "@/lib/card-search-params";
import { canEditCube } from "@/lib/cube-access";

import AddCards from "./add-cards";
import CubeContents from "./cube-contents";

interface RouteParams {
  username: string;
  slug: string;
}

export const metadata: Metadata = {
  title: "Edit cube · cubebound.gg",
  // The editor is owner-only; keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function EditCubePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  const { username, slug } = await params;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  // Non-owners get a 404 rather than a 403, so the existence of someone else's
  // private cube isn't leaked. The mutations re-check ownership independently.
  const current = await getCurrentUser();
  if (!canEditCube(cube, current?.profile?.id)) notFound();

  const filters = cardFiltersFromParams(await searchParams);
  const basePath = `/cube/${cube.ownerUsername}/${cube.slug}/edit`;

  const [contents, presentIds, options, results] = await Promise.all([
    getCubeCards(cube.id),
    getCubeCardIds(cube.id),
    getFilterOptions(),
    searchCards(filters),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <header className="mb-6">
        <Link href="/cubes" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
          ← Your cubes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{cube.name}</h1>
          <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {cube.visibility}
          </span>
          <Link
            href={`/cube/${cube.ownerUsername}/${cube.slug}/settings`}
            className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Settings
          </Link>
        </div>
        {cube.description && (
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            {cube.description}
          </p>
        )}
        <p className="mt-1 text-sm text-zinc-500 tabular-nums">
          {contents.length} {contents.length === 1 ? "card" : "cards"} · /cube/
          {cube.ownerUsername}/{cube.slug}
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Cube contents</h2>
        <CubeContents cubeId={cube.id} cards={contents} />
      </section>

      <section className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="mb-1 text-lg font-semibold">Add cards</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Adding puts a card in the section its type implies — Legends, Runes and
          Battlefields get their own; everything else starts in Main. You can move
          cards afterwards. Alt-art and signature versions are collapsed into the
          base printing; use “Choose printing” to add a specific one.
        </p>

        <div className="mb-6">
          <CardFilterBar
            options={options}
            active={filters}
            total={results.total}
            basePath={basePath}
            unit="matches"
          />
        </div>

        {results.cards.length === 0 ? (
          <p className="py-16 text-center text-zinc-600 dark:text-zinc-400">
            No cards match those filters.
          </p>
        ) : (
          <div className="space-y-6">
            <AddCards
              cubeId={cube.id}
              cards={results.cards}
              presentCardIds={[...presentIds]}
            />
            <CardPagination
              filters={filters}
              page={results.page}
              pageCount={results.pageCount}
              total={results.total}
              pageSize={PAGE_SIZE}
              basePath={basePath}
            />
          </div>
        )}
      </section>
    </div>
  );
}
