"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  ActionState,
  ImportCommitRow,
  ImportPreviewState,
} from "@/app/cube/actions";
import type { CatalogCard, ImportPreview, PreviewRow } from "@/lib/import-list";
import { MAX_IMPORT_LINES } from "@/lib/import-list";
import { CUBE_SECTIONS, CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";
import { btn, errorText } from "@/lib/ui";

const PLACEHOLDER = `# Paste a card list, one per line
2 Fury Rune
Blazing Scorcher

Legends:
Daughter of the Void`;

/** A row the user has resolved, keyed by preview line number. */
type Choice = { cardId: string; section: CubeSection };

function statusLabel(row: PreviewRow): string {
  switch (row.resolution.status) {
    case "matched":
      return "Matched";
    case "ambiguous":
      return "Ambiguous";
    default:
      return "Not found";
  }
}

/**
 * Paste a list, see exactly what would happen, then commit.
 *
 * The preview is the point: nothing reaches the cube until the user confirms,
 * and lines the importer could not resolve are shown as their own problem to
 * solve rather than being dropped quietly or guessed at.
 *
 * Two places use it, which is why it lives here: the editor's Import mode,
 * adding to a cube that exists, and the new-cube screen, where the confirmed
 * list *creates* the cube. The actions come in as props (bound server actions
 * from the editor, a closure over the name fields from the new-cube screen), so
 * this file never imports a server value.
 */
export default function ImportCards({
  preview: previewAction,
  commit: commitAction,
  target,
}: {
  preview: (text: string) => Promise<ImportPreviewState>;
  commit: (rows: ImportCommitRow[]) => Promise<ActionState & { added?: number; path?: string }>;
  /** An existing cube, whose editor the success message links back to, or a
   *  cube that is created by the commit and opened when it lands. */
  target: { kind: "cube"; editorPath: string } | { kind: "new" };
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const result = await previewAction(text);
        if (result.error) {
          setError(result.error);
          setPreview(null);
          return;
        }
        setPreview(result.preview ?? null);
        setChoices({});
      } catch {
        // A dropped request rejects the action, and React rethrows that during
        // the next render — which takes out the whole editor through error.tsx
        // and loses the pasted list with it. Nothing reached the cube on a
        // preview, so a retry is safe to offer outright.
        setError("Couldn't reach the server. Your list is still here, so try again.");
        setPreview(null);
      }
    });
  }

  /** Matched rows, plus anything the user resolved by hand. */
  function rowsToCommit(current: ImportPreview): ImportCommitRow[] {
    const rows: ImportCommitRow[] = [];
    for (const row of current.rows) {
      const chosen = choices[row.line];
      if (chosen) {
        rows.push({ cardId: chosen.cardId, section: chosen.section, quantity: row.quantity });
      } else if (row.resolution.status === "matched" && row.section) {
        rows.push({
          cardId: row.resolution.card.id,
          section: row.section,
          quantity: row.quantity,
        });
      }
    }
    return rows;
  }

  function commit() {
    if (!preview) return;
    const rows = rowsToCommit(preview);
    if (rows.length === 0) {
      setError("Nothing resolved to import yet.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await commitAction(rows);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.path) {
          // The cube was created by this commit; its editor is the result.
          router.push(result.path);
          return;
        }
        setDone(result.added ?? 0);
        setPreview(null);
        setText("");
        setChoices({});
        router.refresh();
      } catch {
        // Same rethrow as the preview, but this call mutates: a request that
        // dies in flight may still have been applied on the server. Reporting
        // it as failed would walk the user into a second import, so say only
        // what is actually known.
        setError(
          target.kind === "cube"
            ? "Lost contact with the server. The import may or may not have gone through, so reload the cube and check before trying again."
            : "Lost contact with the server. The cube may or may not have been created, so check Your cubes before trying again.",
        );
      }
    });
  }

  /** Resolves an unmatched or ambiguous line to a specific card. */
  function choose(row: PreviewRow, card: CatalogCard | null, section: CubeSection) {
    setChoices((prev) => {
      const next = { ...prev };
      if (card) next[row.line] = { cardId: card.id, section };
      else delete next[row.line];
      return next;
    });
  }

  const resolvedCount = preview ? rowsToCommit(preview).length : 0;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="import-list" className="text-sm font-medium">
          Card list
        </label>
        <p className="mt-1 text-sm text-muted">
          One card per line. Optional quantity (<code>2 Fury Rune</code> or{" "}
          <code>2x Fury Rune</code>), <code>#</code> or <code>{"//"}</code> for comments, and{" "}
          <code>Legends:</code>-style headers to set the section for the lines beneath.
          Up to {MAX_IMPORT_LINES} lines at a time.
        </p>
        <textarea
          id="import-list"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          className="mt-2 w-full rounded-md border border-line bg-sunken p-3 font-mono text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runPreview}
          disabled={pending || text.trim().length === 0}
          className={btn.primarySm}
        >
          {pending ? "Working…" : "Preview import"}
        </button>
        {preview && (
          <>
            <button
              type="button"
              onClick={commit}
              disabled={pending || resolvedCount === 0}
              className={btn.secondarySm}
            >
              {target.kind === "cube" ? "Add" : "Create the cube with"} {resolvedCount}{" "}
              {resolvedCount === 1 ? "line" : "lines"}
              {target.kind === "cube" ? " to the cube" : ""}
            </button>
            <span className="text-sm text-muted">
              {target.kind === "cube"
                ? "Nothing is added until you confirm."
                : "Nothing is created until you confirm."}
            </span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}

      {done !== null && target.kind === "cube" && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Imported {done} {done === 1 ? "copy" : "copies"}.{" "}
          <a href={target.editorPath} className="underline underline-offset-2">
            Back to the cube
          </a>
        </p>
      )}

      {preview && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            <span className="font-medium tabular-nums">{preview.matchedCount}</span> matched
            {" · "}
            <span className="font-medium tabular-nums">{preview.unmatchedCount}</span> not found
            {" · "}
            <span className="font-medium tabular-nums">{preview.ambiguousCount}</span> ambiguous
            {" · "}
            <span className="font-medium tabular-nums">{preview.totalCopies}</span> copies
          </p>

          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
                <th className="py-1 pr-2 font-medium">Line</th>
                <th className="py-1 pr-2 font-medium">Qty</th>
                <th className="py-1 pr-2 font-medium">Card</th>
                <th className="py-1 pr-2 font-medium">Section</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => {
                const chosen = choices[row.line];
                const matched = row.resolution.status === "matched";
                const options =
                  row.resolution.status === "ambiguous"
                    ? row.resolution.candidates
                    : row.resolution.status === "unmatched"
                      ? row.resolution.suggestions
                      : [];
                const section: CubeSection = chosen?.section ?? row.section ?? "main";

                return (
                  <tr
                    key={row.line}
                    className="border-b border-line align-top"
                  >
                    <td className="py-1.5 pr-2 tabular-nums text-subtle">{row.line}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{row.quantity}</td>
                    <td className="py-1.5 pr-2">
                      {matched ? (
                        <span className="font-medium">
                          {(row.resolution as { card: CatalogCard }).card.name}
                        </span>
                      ) : (
                        <div>
                          <span className="text-muted line-through">
                            {row.name}
                          </span>
                          {options.length > 0 ? (
                            <select
                              aria-label={`Replacement for line ${row.line}`}
                              value={chosen?.cardId ?? ""}
                              onChange={(event) =>
                                choose(
                                  row,
                                  options.find((c) => c.id === event.target.value) ?? null,
                                  section,
                                )
                              }
                              className="ml-2 rounded border border-line bg-sunken px-1 py-0.5 text-xs"
                            >
                              <option value="">Skip this line</option>
                              {options.map((card) => (
                                <option key={card.id} value={card.id}>
                                  {card.name} ({card.type})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="ml-2 text-xs text-subtle">no close matches</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        aria-label={`Section for line ${row.line}`}
                        value={section}
                        onChange={(event) => {
                          const nextSection = event.target.value as CubeSection;
                          if (matched) {
                            choose(
                              row,
                              (row.resolution as { card: CatalogCard }).card,
                              nextSection,
                            );
                          } else if (chosen) {
                            choose(
                              row,
                              options.find((c) => c.id === chosen.cardId) ?? null,
                              nextSection,
                            );
                          }
                        }}
                        className="rounded border border-line bg-sunken px-1 py-0.5 text-xs"
                      >
                        {CUBE_SECTIONS.map((value) => (
                          <option key={value} value={value}>
                            {CUBE_SECTION_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 text-xs text-muted">
                      {chosen && !matched ? "Resolved" : statusLabel(row)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
