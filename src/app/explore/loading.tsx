import { SkeletonLine, SkeletonRows } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <SkeletonLine className="h-8 w-48" />
      <SkeletonLine className="mt-4 h-10 w-full" />
      <div className="mt-4">
        <SkeletonRows />
      </div>
    </div>
  );
}
