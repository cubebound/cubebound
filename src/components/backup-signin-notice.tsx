"use client";

import Link from "next/link";
import { useState } from "react";

import { BACKUP_NOTICE_COOKIE, BACKUP_NOTICE_COOKIE_MAX_AGE } from "@/lib/backup-notice";
import { btn } from "@/lib/ui";

/**
 * Tells someone whose only way in is email that they should add another.
 *
 * **A banner rather than an interstitial.** The account still works; this is a
 * risk they should know about, not a task blocking them from their cubes, and
 * a modal on the way to your own cube list would be resented. It sits on
 * `/cubes` only — the page a signed-in person actually lands on — rather than
 * following them around the site.
 *
 * Dismissal is a cookie, not a database column — see `src/lib/backup-notice.ts`
 * for the name, the lifetime and why they live there rather than here.
 */
export default function BackupSignInNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mb-6 flex flex-wrap items-start gap-3 rounded-md border border-amber-400/60 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Email is your only way into this account</p>
        <p className="mt-1 text-sm text-muted">
          If you lose access to your mailbox there is no password to fall back
          on. Connecting Discord or Google takes a few seconds.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/settings"
          className={btn.primarySm}
        >
          Add a backup
        </Link>
        <button
          type="button"
          onClick={() => {
            document.cookie = `${BACKUP_NOTICE_COOKIE}=1; path=/; max-age=${BACKUP_NOTICE_COOKIE_MAX_AGE}; samesite=lax`;
            setDismissed(true);
          }}
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
