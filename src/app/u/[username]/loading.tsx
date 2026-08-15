import { SkeletonLine, SkeletonRows } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-4">
        <SkeletonLine className="size-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonLine className="h-6 w-48" />
          <SkeletonLine className="h-4 w-32" />
        </div>
      </div>
      <SkeletonLine className="mt-6 h-10 w-full" />
      <div className="mt-4">
        <SkeletonRows />
      </div>
    </div>
  );
}
