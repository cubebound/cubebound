import Link from "next/link";

/**
 * Page-through controls, agnostic about what is being paged.
 *
 * The caller supplies `href` because building the link is the only part that
 * differs: the card browser has to carry its filters through, a plain list has
 * nothing to carry. Everything else — the counts, the disabled ends, the
 * wording — should not drift between two copies.
 */
export interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
  /** What is being counted, for the summary line. */
  label?: string;
}

const linkClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  href,
  label,
}: PaginationProps) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
        Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
        {label ? ` ${label}` : ""}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={`${linkClass} cursor-default opacity-40`}>← Previous</span>
        )}
        <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
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
