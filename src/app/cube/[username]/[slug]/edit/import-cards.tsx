"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  commitImportAction,
  previewImportAction,
  type ImportCommitRow,
} from "@/app/cube/actions";
import type { CatalogCard, ImportPreview, PreviewRow } from "@/lib/import-list";
import { MAX_IMPORT_LINES } from "@/lib/import-list";
import { CUBE_SECTIONS, CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";
import { btn } from "@/lib/ui";

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
 */
export default function ImportCards({
  cubeId,
  editorPath,
}: {
  cubeId: string;
  editorPath: string;
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
      const result = await previewImportAction(cubeId, text);
      if (result.error) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.preview ?? null);
      setChoices({});
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
      const result = await commitImportAction(cubeId, rows);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(result.added ?? 0);
      setPreview(null);
      setText("");
      setChoices({});
      router.refresh();
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
              Add {resolvedCount} {resolvedCount === 1 ? "line" : "lines"} to the cube
            </button>
            <span className="text-sm text-muted">
              Nothing is added until you confirm.
            </span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {done !== null && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Imported {done} {done === 1 ? "copy" : "copies"}.{" "}
          <a href={editorPath} className="underline underline-offset-2">
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
