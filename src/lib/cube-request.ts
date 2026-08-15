import { cache } from "react";

import { getCubeByOwnerAndSlug, type CubeWithOwner } from "@/db/queries/cubes";
import { getUserByUsername } from "@/db/queries/users";
import { getCurrentUser } from "@/lib/auth";

/**
 * Request-scoped loaders, so a layout and its page can both ask without
 * paying twice.
 *
 * These exist because access has to be decided in a `layout.tsx` rather than in
 * the page. Adding a `loading.tsx` makes Next flush the loading shell as soon
 * as it can, which **commits HTTP 200** — after that a `notFound()` inside the
 * page can still swap the body for the 404 UI but cannot change the status, so
 * private and missing cubes started answering 200. A layout resolves above that
 * boundary, so its `notFound()` still sets the status.
 *
 * `cache()` is per request, not a shared cache with a lifetime: two callers in
 * one render get one query, and the next request queries again. Nothing stale
 * can be served from here.
 */

export const loadCube = cache(
  async (username: string, slug: string): Promise<CubeWithOwner | null> =>
    getCubeByOwnerAndSlug(username, slug),
);

export const loadViewer = cache(async () => getCurrentUser());

export const loadUserByUsername = cache(async (username: string) =>
  getUserByUsername(username),
);
