import { redirect } from "next/navigation";

import { canEditCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";

/**
 * Sends a cube's owner to the editor instead of the visitor's view.
 *
 * **An owner is never shown the public page.** The editor is the same five
 * tabs plus the ability to change something, so arriving here signed in as the
 * owner only ever meant a trip through an Edit button. Worse, the entry points
 * disagreed about it: `/cubes` linked to `/edit` while Explore, profiles and
 * search linked here, so the same cube opened two different ways depending on
 * where you clicked it. One redirect settles it for every entry point at once —
 * shared links and bookmarks included — rather than teaching each link who owns
 * what.
 *
 * The cost is that an owner has no preview of how the cube looks to a visitor;
 * signing out or opening a private window is the answer. What an owner actually
 * needed from this page — the follower count, the section breakdown and the
 * hidden-by-a-moderator notice — moved to the editor rather than being dropped.
 *
 * **Why this is a layout, and why it is in a route group.** `redirect()` has to
 * resolve above a `loading.tsx` boundary for the same reason `notFound()` does
 * in the layout above: Next flushes the loading shell as soon as it can, which
 * commits HTTP 200, and after that a redirect degrades into a client-side
 * navigation — the visitor's skeleton flashes on screen and a crawler is told
 * the page is fine. Putting it in the page reproduced exactly that, measured as
 * a 200 with no `Location`. The `(public)` group exists so this layout wraps
 * *only* the public page: the `[slug]` layout also wraps `/edit`, and
 * redirecting there would loop. `check:public-cube` asserts the real 307.
 *
 * The consequence of resolving up here is that **the tab does not carry over**:
 * layouts are not given `searchParams`, so an owner opening a shared
 * `?tab=analytics` link lands on the editor's Mainboard. Reading the query
 * string would mean threading it through middleware, which is a lot of
 * machinery for a link an owner rarely follows to their own cube.
 *
 * `loadCube` and `loadViewer` are request-cached, so this costs no query the
 * page below was not already making.
 */
export default async function PublicCubeLayout({
  children,
  params,
}: LayoutProps<"/cube/[username]/[slug]">) {
  const { username, slug } = await params;
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);

  // Visibility is already settled by the layout above; this only asks who is
  // looking. A missing cube falls through to the page's own `notFound()`.
  if (!canEditCube(cube, viewer?.profile?.id)) return children;

  redirect(`/cube/${cube.ownerUsername}/${cube.slug}/edit`);
}
