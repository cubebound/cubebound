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
 * Access and the pack template come from `../export-request`, which both export
 * routes share — including the reason the check is `canUseCube` rather than
 * `canViewCube`.
 */

import { getCubeCardsForExport } from "@/db/queries/cubes";
import { toDraftmancerCubeFile } from "@/lib/draftmancer-export";

import { readExportRequest } from "../export-request";

// Reads the session cookie, so it could never be static anyway; stated rather
// than inferred, matching every other route on the site.
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string; slug: string }> },
) {
  const resolved = await readExportRequest(request, params);
  if (resolved instanceof Response) return resolved;
  const { cube, config } = resolved;

  const cards = await getCubeCardsForExport(cube.id);
  const file = toDraftmancerCubeFile(cards, { config, cubeName: cube.name });

  return new Response(file.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // The slug is already URL- and filename-safe by construction (`slugify`).
      "Content-Disposition": `attachment; filename="${cube.slug}-draftmancer.txt"`,
      // Never cached by a CDN or a shared proxy: an unlisted cube's contents
      // are only as private as its URL, and a private one is not public at all.
      "Cache-Control": "private, no-store",
    },
  });
}
