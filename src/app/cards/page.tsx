import type { Metadata } from "next";

import CardFilterBar from "@/components/card-filter-bar";
import CardPagination from "@/components/card-pagination";
import { PAGE_SIZE, searchCards, getFilterOptions } from "@/db/queries/cards";
import { cardFiltersFromParams, type SearchParams } from "@/lib/card-search-params";

import CardGrid from "./card-grid";

export const metadata: Metadata = {
  title: "Cards · cubebound.gg",
  description: "Browse every Riftbound card by set, domain, type and rarity.",
};

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = cardFiltersFromParams(await searchParams);

  const [options, result] = await Promise.all([
    getFilterOptions(),
    searchCards(filters),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Cards</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Every Riftbound card. Click a card for full art and rules text. One
          entry per card by default — tick “All printings” for alt art and
          signature versions.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
        <CardFilterBar
          options={options}
          active={filters}
          total={result.total}
          basePath="/cards"
        />
      </div>

      {result.cards.length === 0 ? (
        <p className="py-24 text-center text-zinc-600 dark:text-zinc-400">
          No cards match those filters.
        </p>
      ) : (
        <div className="space-y-6">
          <CardGrid cards={result.cards} />
          <CardPagination
            filters={filters}
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={PAGE_SIZE}
            basePath="/cards"
          />
        </div>
      )}
    </div>
  );
}
