/**
 * The one definition of "may this account edit this cube".
 *
 * Pages use it to decide what to render; every mutation in
 * `src/app/cube/actions.ts` re-checks it server-side through
 * `requireOwnedCube`. The UI is never the enforcement point.
 */
export function canEditCube<T extends { ownerId: string }>(
  cube: T | null | undefined,
  profileId: string | null | undefined,
): cube is T {
  return Boolean(cube && profileId && cube.ownerId === profileId);
}

/**
 * Who may read a cube.
 *
 * Public and unlisted both render for anyone, signed out included — unlisted
 * means "not advertised", not "protected", exactly as the visibility copy tells
 * the owner. Private is owner-only, and callers 404 rather than 403 so a
 * private cube's existence isn't confirmed to a stranger.
 */
export function canViewCube<T extends { ownerId: string; visibility: string }>(
  cube: T | null | undefined,
  profileId: string | null | undefined,
): cube is T {
  if (!cube) return false;
  if (cube.visibility === "public" || cube.visibility === "unlisted") return true;
  return canEditCube(cube, profileId);
}
