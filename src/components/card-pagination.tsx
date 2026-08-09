import Link from "next/link";

import type { CardFilters } from "@/db/queries/cards";
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

const linkClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

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

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <p className="text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
        Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={`${linkClass} cursor-default opacity-40`}>← Previous</span>
        )}
        <span className="text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            Next →
          </Link>
        ) : (
          <span className={`${linkClass} cursor-default opacity-40`}>Next →</span>
        )}
      </div>
    </nav>
  );
}
