import type { CubeChange } from "@/db/schema";
import { CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";

const timestamp = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat("en", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function sectionLabel(section: string | null): string {
  return section ? CUBE_SECTION_LABELS[section as CubeSection] : "";
}

/** One line describing what happened, in plain past tense. */
function describe(change: CubeChange) {
  const copies = change.quantity ?? 1;
  const plural = copies === 1 ? "copy" : "copies";

  switch (change.kind) {
    case "cube_created":
      return <>Created the cube.</>;
    case "cube_cloned":
      return (
        <>
          Cloned from <span className="font-mono text-xs">{change.fromValue}</span>.
        </>
      );
    case "cards_added":
      return (
        <>
          Added {copies > 1 && <span className="tabular-nums">{copies} {plural} of </span>}
          <span className="font-medium">{change.cardName}</span>
          {change.toSection && <> to {sectionLabel(change.toSection)}</>}.
        </>
      );
    case "cards_removed":
      return (
        <>
          Removed {copies > 1 && <span className="tabular-nums">{copies} {plural} of </span>}
          <span className="font-medium">{change.cardName}</span>
          {change.fromSection && <> from {sectionLabel(change.fromSection)}</>}.
        </>
      );
    case "copy_moved":
      return (
        <>
          Moved <span className="font-medium">{change.cardName}</span> from{" "}
          {sectionLabel(change.fromSection)} to {sectionLabel(change.toSection)}.
        </>
      );
    case "printing_switched":
      return (
        <>
          Switched <span className="font-medium">{change.cardName}</span> from{" "}
          <span className="font-mono text-xs">{change.fromValue}</span> to{" "}
          <span className="font-mono text-xs">{change.toValue}</span>.
        </>
      );
    case "details_edited":
      return <>Edited the cube details.</>;
    case "primer_edited":
      return <>{change.toValue === "cleared" ? "Cleared" : "Updated"} the primer.</>;
    default:
      return <>Made a change.</>;
  }
}

/**
 * A cube's history, newest first, grouped by day.
 *
 * Read-only and self-contained, so the public cube page can show it too when
 * changelogs become a community feature.
 */
export default function ChangeLog({ changes }: { changes: CubeChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        Nothing has changed yet. Edits show up here as you make them.
      </p>
    );
  }

  const byDay = new Map<string, CubeChange[]>();
  for (const change of changes) {
    const day = change.createdAt.toISOString().slice(0, 10);
    const entries = byDay.get(day);
    if (entries) entries.push(change);
    else byDay.set(day, [change]);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {[...byDay.entries()].map(([day, entries]) => (
        <section key={day}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {dayFormat.format(entries[0].createdAt)}
            <span className="ml-2 font-normal tabular-nums">
              {entries.length} {entries.length === 1 ? "change" : "changes"}
            </span>
          </h3>
          <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {entries.map((change) => (
              <li key={change.id} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2">
                <time
                  dateTime={change.createdAt.toISOString()}
                  className="shrink-0 text-xs tabular-nums text-zinc-500"
                  title={timestamp.format(change.createdAt)}
                >
                  {change.createdAt.toLocaleTimeString("en", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                <p className="min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-200">
                  {describe(change)}
                </p>
                {change.actorUsername && (
                  <span className="shrink-0 text-xs text-zinc-500">
                    {change.actorUsername}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
