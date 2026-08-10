import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listDraftsForUser } from "@/db/queries/drafts";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_DRAFT_CONFIG, finalPoolSize } from "@/lib/draft/config";

export const metadata: Metadata = { title: "Your drafts · cubebound.gg" };

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Every draft the signed-in user has sat in.
 *
 * A draft is worth keeping as a draft: it holds the packs it was dealt, every
 * pick in order and the main/side split, none of which survives being flattened
 * into a cube. Saving as a cube stays available for when you want to *edit* the
 * result; this is for going back to the draft itself.
 */
export default async function DraftsPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");

  const drafts = await listDraftsForUser(current.profile.id);
  const target = finalPoolSize(DEFAULT_DRAFT_CONFIG);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your drafts</h1>
        <Link href="/cubes" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
          Your cubes
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            You haven&rsquo;t drafted yet. Open any cube and choose{" "}
            <span className="font-medium">Draft</span> — you don&rsquo;t need to own it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {drafts.map((draft) => {
            const href = `/cube/${draft.ownerUsername}/${draft.cubeSlug}/draft?draft=${draft.id}`;
            return (
              <li key={draft.id}>
                <Link
                  href={href}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium">{draft.cubeName}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      draft.status === "complete"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                    }`}
                  >
                    {draft.status === "complete" ? "Finished" : "In progress"}
                  </span>
                  <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                    {draft.picked} / {target} picked
                  </span>
                  <span className="ml-auto text-sm text-zinc-500">
                    <time dateTime={draft.createdAt.toISOString()}>
                      {dateFormat.format(draft.createdAt)}
                    </time>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
