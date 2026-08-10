import type { CardFilters } from "@/db/queries/cards";
import Pagination from "@/components/pagination";
import { cardFilterParams } from "@/lib/card-search-params";

interface Props {
  filters: CardFilters;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  basePath: string;
  extraParams?: Record<string, string>;
}

/**
 * The card browser's pagination: generic controls plus the filter-carrying
 * link. Losing the active filters when you turn the page would be the bug
 * worth guarding, so building the href is the only thing that lives here.
 */
export default function CardPagination({
  filters,
  page,
  pageCount,
  total,
  pageSize,
  basePath,
  extraParams = {},
}: Props) {
  const href = (target: number) => {
    const params = cardFilterParams(filters, extraParams);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
      href={href}
    />
  );
}
