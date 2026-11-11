/**
 * Placeholder shapes for `loading.tsx` boundaries.
 *
 * Every route on this site is dynamic, so Next's `<Link>` prefetch can only
 * fetch a loading boundary — with none present, clicking a cube left the old
 * page on screen, frozen, for the whole server render. That reads as "the site
 * hung", not "the site is working", which is what was reported.
 *
 * These are shapes, not spinners: a layout that matches what's coming means the
 * page doesn't jump when it arrives.
 */

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded bg-sunken ${className}`}
    />
  );
}

/** A screen's worth of placeholder rows, for the cube and draft lists. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      aria-hidden
      className="divide-y divide-line rounded-lg border border-line"
    >
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <SkeletonLine className="h-[3.25rem] w-[4.333rem] shrink-0" />
          <span className="min-w-0 flex-1 space-y-2 py-1">
            <SkeletonLine className="h-4 w-2/5" />
            <SkeletonLine className="h-3 w-3/5" />
          </span>
          <SkeletonLine className="h-8 w-20 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Placeholder cube cards, for the home page's most-followed grid. */
export function SkeletonCubeCards({ cards = 6 }: { cards?: number }) {
  return (
    <div aria-hidden className="flex gap-4 overflow-hidden sm:grid sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          className="w-[280px] shrink-0 overflow-hidden rounded-lg border border-line sm:w-auto"
        >
          <SkeletonLine className="h-[110px] rounded-none sm:h-[132px]" />
          <div className="space-y-2 p-4">
            <SkeletonLine className="h-5 w-3/5" />
            <SkeletonLine className="h-3 w-4/5" />
            <SkeletonLine className="mt-4 h-9 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A row of placeholder card tiles, for the home page's most-cubed row. */
export function SkeletonCardRow({ cards = 8 }: { cards?: number }) {
  return (
    <div aria-hidden className="flex gap-3.5 overflow-hidden lg:grid lg:grid-cols-8">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="w-[116px] shrink-0 space-y-2 sm:w-[132px] lg:w-auto">
          <SkeletonLine className="aspect-[5/7] w-full rounded-lg" />
          <SkeletonLine className="h-3 w-4/5" />
          <SkeletonLine className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * The shell of a cube page: title, byline, tabs, then columns.
 *
 * Column-shaped rather than tile-shaped because the list view is the default —
 * see `src/lib/cube-view.ts`.
 */
export function SkeletonCube() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <SkeletonLine className="h-8 w-64" />
      <SkeletonLine className="mt-3 h-4 w-80" />
      <SkeletonLine className="mt-4 h-4 w-96" />
      <div className="mt-5 flex gap-2">
        <SkeletonLine className="h-8 w-20" />
        <SkeletonLine className="h-8 w-24" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, column) => (
          <div key={column} className="space-y-2">
            <SkeletonLine className="h-5 w-full" />
            {Array.from({ length: 6 + ((column * 3) % 5) }, (__, line) => (
              <SkeletonLine key={line} className="h-3.5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
