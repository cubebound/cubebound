import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import Pagination from "@/components/pagination";
import {
  countDraftsForUser,
  DRAFTS_PAGE_SIZE,
  listDraftsForUser,
} from "@/db/queries/drafts";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_DRAFT_CONFIG, finalPoolSize } from "@/lib/draft/config";

import DeleteDraft from "./delete-draft";

export const metadata: Metadata = { title: "Your drafts" };

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
export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");

  const query = await searchParams;
  const raw = Array.isArray(query.page) ? query.page[0] : query.page;
  const total = await countDraftsForUser(current.profile.id);
  const pageCount = Math.max(1, Math.ceil(total / DRAFTS_PAGE_SIZE));
  // Clamp rather than 404: a page number left over after deleting the last
  // draft on it should land you somewhere real.
  const page = Math.min(Math.max(1, Number(raw) || 1), pageCount);

  const drafts = await listDraftsForUser(current.profile.id, {
    limit: DRAFTS_PAGE_SIZE,
    offset: (page - 1) * DRAFTS_PAGE_SIZE,
  });
  const target = finalPoolSize(DEFAULT_DRAFT_CONFIG);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your drafts</h1>
        <Link href="/cubes" className="text-sm text-subtle underline-offset-4 hover:underline">
          Your cubes
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-10 text-center">
          <p className="text-muted">
            You haven&rsquo;t drafted yet. Open any cube and choose{" "}
            <span className="font-medium">Draft</span>. You don&rsquo;t need to own it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {drafts.map((draft) => {
            const href = `/cube/${draft.ownerUsername}/${draft.cubeSlug}/draft?draft=${draft.id}`;
            return (
              <li
                key={draft.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
              >
                {/* The link covers the draft, not the row: a Delete button
                    inside a link is a misclick waiting to happen. */}
                <Link href={href} className="font-medium hover:underline">
                  {draft.cubeName}
                </Link>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    draft.status === "complete"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                  }`}
                >
                  {draft.status === "complete" ? "Finished" : "In progress"}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {draft.picked} / {target} picked
                </span>
                <span className="ml-auto text-sm text-subtle">
                  <time dateTime={draft.createdAt.toISOString()}>
                    {dateFormat.format(draft.createdAt)}
                  </time>
                </span>
                <DeleteDraft
                  draftId={draft.id}
                  label={`${draft.cubeName} draft from ${dateFormat.format(draft.createdAt)}`}
                />
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={DRAFTS_PAGE_SIZE}
            href={(target) => (target > 1 ? `/drafts?page=${target}` : "/drafts")}
            label="drafts"
          />
        </div>
      )}
    </div>
  );
}
