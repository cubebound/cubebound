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
 * Whether a suspended account is trying to write.
 *
 * **Suspension has to stop the account acting, not only being seen.** Without
 * this a suspended owner could go on creating and editing cubes — invisible to
 * everyone, but still accumulating rows against the 25-cube ceiling, and still
 * a person who was told to stop carrying on. Read paths deliberately do not use
 * it: the moderator still needs to look at what they made.
 *
 * The message is honest rather than a generic "not found", for the same reason
 * a hidden cube tells its owner: someone who thinks the site is broken emails
 * about it, and there is one of you.
 */
export function suspensionError(
  profile: { suspendedAt: Date | null } | null | undefined,
): { error: string } | null {
  return profile?.suspendedAt ? { error: "This account is suspended." } : null;
}

/**
 * Everything the read rule needs.
 *
 * Declared as a type rather than read loosely so **adding a moderation state
 * breaks every call site that has not been updated**. Both `hiddenAt` and
 * `ownerSuspendedAt` come from queries that already select the whole row or
 * join the owner, so satisfying it costs nothing at runtime.
 */
export interface ViewableCube {
  ownerId: string;
  visibility: string;
  /** Set by a moderator on this cube specifically. */
  hiddenAt: Date | null;
  /** Set on the owner's account; suspends everything they own at once. */
  ownerSuspendedAt: Date | null;
}

/**
 * Who may read a cube.
 *
 * Public and unlisted both render for anyone, signed out included — unlisted
 * means "not advertised", not "protected", exactly as the visibility copy tells
 * the owner. Private is owner-only, and callers 404 rather than 403 so a
 * private cube's existence isn't confirmed to a stranger.
 *
 * **Moderation overrides ownership, with one deliberate exception.** A hidden
 * cube and a suspended owner's cubes stop rendering for everyone — including,
 * for suspension, the owner, since the point is that the account is switched
 * off. A *hidden* cube stays visible to its own owner, so they are told it was
 * hidden rather than left thinking the site is broken and emailing about it;
 * the page says so. Admins see everything, because reviewing what you hid is
 * the whole job.
 */
export function canViewCube<T extends ViewableCube>(
  cube: T | null | undefined,
  profileId: string | null | undefined,
  isAdmin = false,
): cube is T {
  if (!cube) return false;
  if (isAdmin) return true;

  const isOwner = canEditCube(cube, profileId);
  if (cube.ownerSuspendedAt) return false;
  if (cube.hiddenAt) return isOwner;

  if (cube.visibility === "public" || cube.visibility === "unlisted") return true;
  return isOwner;
}

/**
 * Whether a cube may be *acted on* by a non-owner — cloned, drafted, followed.
 *
 * Distinct from reading it: a moderated cube stays readable by its owner so
 * they can see why, but nobody should be able to copy or draft it, least of
 * all the owner working around the moderation by cloning.
 */
export function canUseCube<T extends ViewableCube>(
  cube: T | null | undefined,
  profileId: string | null | undefined,
): cube is T {
  if (!cube) return false;
  if (cube.hiddenAt || cube.ownerSuspendedAt) return false;
  return canViewCube(cube, profileId);
}
