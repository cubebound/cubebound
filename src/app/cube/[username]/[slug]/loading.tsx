import { SkeletonCube } from "@/components/skeleton";

/** Shown while a cube page renders. See src/components/skeleton.tsx for why
 *  this file has to exist at all on a dynamic route. */
export default function Loading() {
  return <SkeletonCube />;
}
