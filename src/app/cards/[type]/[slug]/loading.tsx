import { SkeletonLine } from "@/components/skeleton";

/**
 * Every route here is dynamic, so `<Link>` prefetch can only fetch this. With
 * no boundary, clicking through from a card modal leaves the modal on screen,
 * frozen, for the whole server render.
 *
 * Shaped like the page that is coming: a title, the intro line, then a column
 * of pairing rows.
 */
export default function Loading() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <SkeletonLine className="h-8 w-80" />
      <SkeletonLine className="mt-4 h-4 w-full" />
      <SkeletonLine className="mt-2 h-4 w-2/3" />
      <ul className="mt-8 divide-y divide-line rounded-lg border border-line">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <SkeletonLine className="size-9 shrink-0 rounded-md" />
            <span className="min-w-0 flex-1 space-y-2">
              <SkeletonLine className="h-4 w-2/5" />
              <SkeletonLine className="h-3 w-3/5" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
