import { notFound } from "next/navigation";

import { canEditCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";

/**
 * 404s a non-owner above the loading boundary.
 *
 * Exactly the hole `edit/layout.tsx` describes, and worth reading there: the
 * check lived only in the page, under `settings/loading.tsx`, so Next had
 * already flushed the shell and committed HTTP 200 by the time `notFound()`
 * ran. On a *private* cube the layout two segments up refuses first and the
 * status was right; on a *public* one it passes, and this was the only gate.
 *
 * Settings is the worse of the two to leave soft, because unlike `/edit` it
 * carries no `noindex` — a crawler following a link to someone's settings page
 * was being told the 404 it got back was a real page.
 *
 * `loadCube` and `loadViewer` are request-cached, so this costs no query the
 * page below was not already making — once that page was moved onto the same
 * two loaders, which is the other half of this change.
 */
export default async function CubeSettingsLayout({
  children,
  params,
}: LayoutProps<"/cube/[username]/[slug]/settings">) {
  const { username, slug } = await params;
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);
  if (!canEditCube(cube, viewer?.profile?.id)) notFound();
  return children;
}
