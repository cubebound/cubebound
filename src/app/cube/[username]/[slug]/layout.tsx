import { notFound } from "next/navigation";

import { canViewCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";

/**
 * Decides *whether this cube is visible at all*, above the loading boundary.
 *
 * This has to happen here rather than in the page. `loading.tsx` puts the page
 * in a Suspense boundary whose fallback Next flushes as soon as it can, and
 * flushing commits HTTP 200 — so a `notFound()` in the page swaps the body for
 * the 404 UI but leaves the status at 200. Private cubes answering 200 is both
 * wrong for crawlers and a guarantee `check:public-cube` asserts. A layout
 * resolves before its children's boundary exists, so the status is still ours.
 *
 * It gates on *viewing*, the weakest rule of the routes underneath — the
 * editor and settings keep their own owner checks, and every mutation re-checks
 * ownership server-side regardless. Nothing here is the enforcement point for
 * writes.
 *
 * The queries are `cache()`d for the request, so the page beneath reuses these
 * answers rather than repeating them.
 */
export default async function CubeLayout({
  children,
  params,
}: LayoutProps<"/cube/[username]/[slug]">) {
  const { username, slug } = await params;
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);

  // Not found and not permitted look identical on purpose, so a private cube's
  // existence can't be probed.
  if (!canViewCube(cube, viewer?.profile?.id, viewer?.profile?.isAdmin)) notFound();

  return children;
}
