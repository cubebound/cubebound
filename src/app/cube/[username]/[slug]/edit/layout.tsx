import { notFound } from "next/navigation";

import { canEditCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";

/**
 * 404s a non-owner above the loading boundary.
 *
 * The check was only in the page, and that is not enough to set a status:
 * `edit/loading.tsx` lets Next flush the shell, flushing commits HTTP 200, and
 * after that the page's `notFound()` swaps the body for the 404 UI but leaves
 * the status at 200. A soft 404 — the third time this has bitten, after the
 * cube layout and the profile layout.
 *
 * **It only showed on a *public* cube**, which is why it survived so long. On a
 * private one the layout one segment up already refuses, above every boundary,
 * so the status was right; on a public one that layout passes — a stranger may
 * read the cube — and the only thing standing between them and the editor was
 * this check, down inside the boundary. `check:public-cube` asserted the
 * private case and not the public one, so the gate agreed with the bug.
 *
 * Nothing is disclosed either way: the body was always the 404 UI. What was
 * wrong is what a crawler is told, and `/edit` is `noindex` but `/settings`,
 * which had the identical hole, is reachable by link.
 *
 * `loadCube` and `loadViewer` are request-cached, so this costs no query the
 * page below was not already making.
 */
export default async function EditCubeLayout({
  children,
  params,
}: LayoutProps<"/cube/[username]/[slug]/edit">) {
  const { username, slug } = await params;
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);
  // Not found rather than forbidden, the same convention the mutations use, so
  // a private cube's existence is never confirmed to a stranger.
  if (!canEditCube(cube, viewer?.profile?.id)) notFound();
  return children;
}
