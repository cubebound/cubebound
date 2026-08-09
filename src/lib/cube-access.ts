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
