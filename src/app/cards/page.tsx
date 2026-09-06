import type { Metadata } from "next";

import CardFilterBar from "@/components/card-filter-bar";
import CardPagination from "@/components/card-pagination";
import { PAGE_SIZE, searchCards, getFilterOptions } from "@/db/queries/cards";
import { cardFiltersFromParams, type SearchParams } from "@/lib/card-search-params";

import CardGrid from "./card-grid";

export const metadata: Metadata = {
  title: "Riftbound Card Database — All Sets",
  description:
    "Browse every Riftbound card by set, domain, energy cost, type, rarity and " +
    "trait. Full art and rules text for all sets.",
  // Every filter and page is a query string over the same page, and the filter
  // surface is combinatorial — a crawler left to itself would index thousands
  // of near-identical URLs and split the signal across all of them. The cards
  // themselves are not lost: the sitemap carries the pages worth crawling.
  alternates: { canonical: "/cards" },
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
        <h1 className="text-2xl font-semibold">Cards</h1>
        <p className="mt-1 text-sm text-muted">
          Every Riftbound card. Click a card for full art and rules text. One
          entry per card by default; tick “All printings” for alt art and
          signature versions.
        </p>
      </header>

      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-line bg-raised/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <CardFilterBar
          options={options}
          active={filters}
          total={result.total}
          basePath="/cards"
        />
      </div>

      {result.cards.length === 0 ? (
        <p className="py-24 text-center text-muted">
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
