"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { startDraftAction } from "./actions";

/**
 * Starts a fresh draft of the same cube.
 *
 * Confirms first when the current one is unfinished. The old draft is not
 * destroyed — it stays in the drafts list and can be reopened — but nothing on
 * screen says so at the moment of clicking, and "did I just lose 20 picks?" is
 * a bad thing to wonder.
 */
export default function RestartDraft({
  cubeId,
  draftPath,
  unfinished,
}: {
  cubeId: string;
  draftPath: string;
  unfinished: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const start = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await startDraftAction(cubeId, draftPath);
        if (result.error) {
          setError(result.error);
          return;
        }
        setConfirming(false);
        // Open the new draft explicitly rather than trusting "latest".
        router.push(result.draftId ? `${draftPath}?draft=${result.draftId}` : draftPath);
        router.refresh();
      } catch {
        setError("Couldn't reach the server. Nothing was started — try again.");
      }
    });

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-700 dark:text-zinc-300">
          Start a new draft? This one stays in your drafts.
        </span>
        <button
          type="button"
          onClick={start}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Dealing…" : "Yes, start one"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-3 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => (unfinished ? setConfirming(true) : start())}
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "Dealing…" : "New draft"}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
