/**
 * Serves a cube as a Draftmancer Custom Card List.
 *
 * A route handler rather than a server action or a client-built blob, for three
 * reasons. The file is a *download*, so the browser should get it with a
 * filename and a content type rather than have JavaScript assemble one. It
 * costs nothing on an ordinary cube view — the query only runs when somebody
 * actually exports, where serialising every card's rules text into the page
 * would tax every visitor. And the URL is stable and shareable, which is the
 * whole idea: paste it into Draftmancer's cube loader.
 *
 * **A route handler does not run the layout above it**, so the visibility check
 * that `cube/[username]/[slug]/layout.tsx` performs for the pages has to be
 * repeated here. It is `canUseCube`, not `canViewCube`: exporting a cube to go
 * draft it elsewhere is *using* it, like cloning or drafting, so a hidden cube
 * or a suspended owner's cube must not export even for its own owner — the
 * point of the stricter rule is that moderation cannot be worked around by
 * copying the cube out.
 */

import { getCubeCardsForExport } from "@/db/queries/cubes";
import { canUseCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";
import { toDraftmancerCubeFile } from "@/lib/draftmancer-export";

// Reads the session cookie, so it could never be static anyway; stated rather
// than inferred, matching every other route on the site.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; slug: string }> },
) {
  const { username, slug } = await params;

  // Independent of each other, and Supabase is a round trip each.
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);

  // A plain 404 with no body, exactly like the pages: a private cube and a
  // cube that never existed must be indistinguishable, or this route becomes a
  // way to test whether a cube id is real.
  if (!canUseCube(cube, viewer?.profile?.id)) {
    return new Response("Not found", { status: 404 });
  }

  const cards = await getCubeCardsForExport(cube.id);
  const file = toDraftmancerCubeFile(cards);

  return new Response(file.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // The slug is already URL- and filename-safe by construction (`slugify`).
      "Content-Disposition": `attachment; filename="${slug}-draftmancer.txt"`,
      // Never cached by a CDN or a shared proxy: an unlisted cube's contents
      // are only as private as its URL, and a private one is not public at all.
      "Cache-Control": "private, no-store",
    },
  });
}
