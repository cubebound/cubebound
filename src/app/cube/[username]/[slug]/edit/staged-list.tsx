"use client";

import { CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";
import type { StagedOp } from "@/lib/staged-edit";
import { btn } from "@/lib/ui";

export interface StagedRow {
  key: string;
  op: StagedOp;
  /** add and replace: the printing going in. remove: the one coming out. */
  cardId: string;
  fromCardId?: string;
  section: CubeSection;
  /** `Name [set-collector]` for the card going in, or out for a removal. */
  label: string;
  /** The card being replaced, for a swap. */
  fromLabel?: string;
}

/**
 * The pending batch.
 *
 * One row per change rather than a merged tally: "added Dark Banishing" and
 * "removed Faithless Looting" are the two things the reader did, and a summary
 * that folded them into counts would make the list harder to check than the
 * cube itself. The server collapses duplicates when it writes; that is a
 * database constraint, not something the reader should have to think about.
 */
export default function StagedList({
  rows,
  onDrop,
}: {
  rows: StagedRow[];
  onDrop: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
        No changes staged yet. Nothing is saved until you press Save changes.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {rows.map((row) => (
        <li key={row.key} className="flex items-start gap-2 px-3 py-2 text-sm">
          <span
            aria-hidden="true"
            className={`mt-0.5 font-mono text-xs ${
              row.op === "add"
                ? "text-accent"
                : row.op === "remove"
                  ? "text-muted"
                  : "text-accent"
            }`}
          >
            {row.op === "add" ? "+" : row.op === "remove" ? "−" : "⇄"}
          </span>
          <span className="min-w-0 flex-1">
            {row.op === "replace" ? (
              <span className="block">
                <span className="text-muted line-through">{row.fromLabel}</span>{" "}
                <span aria-hidden="true" className="text-subtle">
                  &rarr;
                </span>{" "}
                <span className="text-ink">{row.label}</span>
              </span>
            ) : (
              <span className="block text-ink">{row.label}</span>
            )}
            <span className="block text-xs text-subtle">
              {CUBE_SECTION_LABELS[row.section]}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onDrop(row.key)}
            aria-label={`Unstage ${row.label}`}
            className={`${btn.ghostSm} shrink-0 px-2`}
          >
            &times;
          </button>
        </li>
      ))}
    </ul>
  );
}
