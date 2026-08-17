"use client";

import Link from "next/link";
import { useState } from "react";

/** How long a dismissal lasts. Long enough not to nag, short enough to matter. */
const DISMISS_DAYS = 30;
const COOKIE = "cubebound.backup-notice";

/**
 * Tells someone whose only way in is email that they should add another.
 *
 * **A banner rather than an interstitial.** The account still works; this is a
 * risk they should know about, not a task blocking them from their cubes, and
 * a modal on the way to your own cube list would be resented. It sits on
 * `/cubes` only — the page a signed-in person actually lands on — rather than
 * following them around the site.
 *
 * Dismissal is a cookie, not a database column: it is a UI preference, it does
 * not need to survive a device change, and adding a column for it would mean a
 * migration for something that costs nothing to get wrong.
 */
export default function BackupSignInNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mb-6 flex flex-wrap items-start gap-3 rounded-md border border-amber-400/60 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Email is your only way into this account</p>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          If you lose access to your mailbox there is no password to fall back
          on. Connecting Discord or Google takes a few seconds.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/settings"
          className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Add a backup
        </Link>
        <button
          type="button"
          onClick={() => {
            document.cookie = `${COOKIE}=1; path=/; max-age=${DISMISS_DAYS * 86400}; samesite=lax`;
            setDismissed(true);
          }}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export const BACKUP_NOTICE_COOKIE = COOKIE;
