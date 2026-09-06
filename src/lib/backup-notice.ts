/**
 * The dismissal of the "add a backup way in" notice on `/cubes`.
 *
 * A cookie rather than a database column: it is a UI preference, it does not
 * need to survive a device change, and a migration for something that costs
 * nothing to get wrong is a bad trade. Same pattern as `theme.ts` and
 * `cube-view.ts`.
 *
 * The name and lifetime live here rather than beside the component because the
 * **server** reads the cookie (`/cubes` decides whether to render the notice at
 * all) while the **client** writes it. A shared value that travels in both
 * directions belongs in `src/lib/`, or the server page ends up importing from a
 * `"use client"` module to get at a string.
 *
 * Thirty days: long enough not to nag, short enough that the risk resurfaces
 * for someone who still has only one way into their account.
 */
export const BACKUP_NOTICE_COOKIE = "cubebound.backup-notice";
export const BACKUP_NOTICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
