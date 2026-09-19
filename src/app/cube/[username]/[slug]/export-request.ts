/**
 * The front half of both export routes.
 *
 * `draftmancer.txt` and `pack.png` sit next to each other and ask the same two
 * questions before they do any work of their own: may this viewer use this
 * cube, and is the pack template in the query string one that could work? Both
 * carried their own copy — twenty lines each, the visibility rule included,
 * which is the one thing on this pair that must never drift between them.
 *
 * **A route handler does not run the layout above it**, so the check that
 * `cube/[username]/[slug]/layout.tsx` performs for the pages is repeated here.
 * It is `canUseCube` rather than `canViewCube`: taking a cube's contents away
 * to draft elsewhere is *using* it, like cloning or drafting, so a hidden cube
 * or a suspended owner's must not export even for its own owner — the point of
 * the stricter rule is that moderation cannot be worked around by copying the
 * cube out.
 *
 * It answers with either the resolved request or the `Response` to send
 * instead. A caller that forgets the failure branch cannot quietly carry on:
 * there is no cube on it to read.
 */

import type { CubeWithOwner } from "@/db/queries/cubes";
import { canUseCube } from "@/lib/cube-access";
import { loadCube, loadViewer } from "@/lib/cube-request";
import { readDraftConfig, validateDraftConfig, type DraftConfig } from "@/lib/draft/config";

export interface ExportRequest {
  cube: CubeWithOwner;
  /** The signed-in viewer, or null. Present so a route can apply a rule of its
   *  own after the shared ones — `pack.png` logs who paid for the render. */
  viewer: Awaited<ReturnType<typeof loadViewer>>;
  config: DraftConfig;
  query: URLSearchParams;
}

export interface ExportRequestOptions {
  /**
   * Refuse a signed-out visitor, after the visibility check and before the
   * config is read.
   *
   * The order is the whole point. Access is decided first so a signed-out
   * visitor still cannot tell a private cube from one that never existed —
   * answering 401 before the 404 gives that away. And the config is read after,
   * so a bad template cannot turn a request that should have been refused into
   * a 400 that says the cube is there.
   */
  needsAccount?: boolean;
}

export async function readExportRequest(
  request: Request,
  params: Promise<{ username: string; slug: string }>,
  { needsAccount = false }: ExportRequestOptions = {},
): Promise<ExportRequest | Response> {
  const { username, slug } = await params;

  // Independent of each other, and Supabase is a round trip each.
  const [cube, viewer] = await Promise.all([loadCube(username, slug), loadViewer()]);

  // A plain 404 with no body, exactly like the pages: a private cube and a cube
  // that never existed must be indistinguishable, or these routes become a way
  // to test whether a cube id is real.
  if (!canUseCube(cube, viewer?.profile?.id)) {
    return new Response("Not found", { status: 404 });
  }

  if (needsAccount && !viewer?.profile?.id) {
    return new Response("You need to be signed in.", { status: 401 });
  }

  // The pack template arrives in the query string, through the same reader and
  // the same validator the solo draft uses — so a config that could never work
  // is refused here rather than producing a file that errors on upload or an
  // image of a pack the engine cannot deal. A bare URL with no parameters is
  // the default pack template.
  const query = new URL(request.url).searchParams;
  const config = readDraftConfig(Object.fromEntries(query));
  const problems = validateDraftConfig(config);
  if (problems.length > 0) {
    return new Response(problems[0].message, { status: 400 });
  }

  return { cube, viewer, config, query };
}
