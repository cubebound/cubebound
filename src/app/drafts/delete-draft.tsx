"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteDraftAction } from "@/app/cube/[username]/[slug]/draft/actions";

/**
 * Deletes a draft, after asking.
 *
 * Two steps rather than one, because this is the only irreversible thing on
 * the page and it sits next to a link you click to *open* a draft. The button
 * also names what goes — the picks are the draft; there is no copy of them
 * anywhere else unless the pool was saved as a cube.
 */
export default function DeleteDraft({
  draftId,
  label,
}: {
  draftId: string;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${label}`}
        title="Delete this draft"
        className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-zinc-700 dark:text-zinc-300">Delete this draft and its picks?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const result = await deleteDraftAction(draftId);
              if (result?.error) {
                setError(result.error);
                return;
              }
              router.refresh();
            } catch {
              setError("Couldn't reach the server — nothing was deleted.");
            }
          })
        }
        className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(false)}
        className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Cancel
      </button>
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
