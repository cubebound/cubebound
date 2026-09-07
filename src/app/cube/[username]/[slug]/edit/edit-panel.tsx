"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  quickSearchAction,
  saveCubeEditsAction,
  type CardSuggestion,
} from "@/app/cube/actions";
import StagedList, { type StagedRow } from "./staged-list";
import {
  CUBE_SECTION_LABELS,
  type CubeSection,
} from "@/lib/riftbound";
import {
  EDIT_BOARDS,
  MAX_STAGED_ROWS,
  printingLabel,
  sectionForBoard,
  type EditBoard,
  type StagedEditRow,
} from "@/lib/staged-edit";
import { btn, check, errorText, input, label as labelClass, segment } from "@/lib/ui";

/**
 * A copy already in the cube, for the remove/replace picker.
 *
 * The page has these anyway — it renders the cube from them — so passing a slim
 * projection down means the remove side of this panel costs **no query at
 * all**, however much you type. Only the add side reaches the card pool.
 */
export interface HeldCard {
  cardId: string;
  baseId: string;
  name: string;
  setCode: string | null;
  collectorNo: string | null;
  section: CubeSection;
  quantity: number;
}

const SEARCH_DEBOUNCE_MS = 300;
const BOARD_LABELS: Record<EditBoard, string> = {
  mainboard: "Mainboard",
  maybeboard: "Maybeboard",
};

export default function EditPanel({
  cubeId,
  contents,
  browsePath,
}: {
  cubeId: string;
  contents: HeldCard[];
  browsePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StagedRow[]>([]);

  // Escape hides the panel; it deliberately does not discard the batch. The
  // whole point of staging is that your work survives until you say otherwise.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Staged work lives only in this tab, so leaving with a batch pending would
  // lose it silently — which would make staging a trap rather than a safety net.
  useEffect(() => {
    if (rows.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rows.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className={`${btn.primary} fixed right-4 bottom-4 z-30 rounded-full shadow-lg`}
      >
        {/* Never "×3": check:copies-and-log asserts the editor's HTML carries no
            ×N notation, and this button renders on the server. */}
        Edit{rows.length > 0 ? ` (${rows.length})` : ""}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit cube"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 flex items-end bg-black/60 lg:items-stretch lg:justify-end"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex h-[85vh] w-full flex-col rounded-t-xl bg-raised lg:h-full lg:w-[24rem] lg:rounded-none lg:border-l lg:border-line"
          >
            <PanelBody
              cubeId={cubeId}
              contents={contents}
              browsePath={browsePath}
              rows={rows}
              setRows={setRows}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function PanelBody({
  cubeId,
  contents,
  browsePath,
  rows,
  setRows,
  onClose,
}: {
  cubeId: string;
  contents: HeldCard[];
  browsePath: string;
  rows: StagedRow[];
  setRows: (next: StagedRow[] | ((prev: StagedRow[]) => StagedRow[])) => void;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<EditBoard>("mainboard");
  const [specifyVersions, setSpecifyVersions] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [removeQuery, setRemoveQuery] = useState("");
  const [pending, setPending] = useState<CardSuggestion | null>(null);
  // What the last completed search answered, and for which term. "Is a search
  // in flight" is then derived rather than stored, which keeps the previous
  // matches on screen while you type instead of blinking to empty — the same
  // shape the quick-add panel used before this replaced it.
  const [answered, setAnswered] = useState<{ key: string; items: CardSuggestion[] }>({
    key: "",
    items: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const term = addQuery.trim();
  const longEnough = term.length >= 2;
  const wantKey = `${specifyVersions ? "all" : "one"}:${term}`;
  const searching = longEnough && answered.key !== wantKey;
  const matches = longEnough ? answered.items : [];

  useEffect(() => {
    addRef.current?.focus();
  }, []);

  useEffect(() => {
    const current = addQuery.trim();
    if (current.length < 2) return;
    const key = `${specifyVersions ? "all" : "one"}:${current}`;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await quickSearchAction(cubeId, current, specifyVersions);
      if (cancelled) return;
      setAnswered({ key, items: response.results ?? [] });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addQuery, cubeId, specifyVersions]);

  /**
   * One entry per copy the cube still holds, minus whatever this batch has
   * already claimed. Two copies of one printing are two entries, so picking one
   * stages exactly one removal and the other stays available — which is the
   * same per-copy rule the cube list follows everywhere else.
   */
  const removable = useMemo(() => {
    const claimed = new Map<string, number>();
    for (const row of rows) {
      if (row.op === "add") continue;
      const id = row.op === "replace" ? row.fromCardId! : row.cardId;
      const key = `${id}|${row.section}`;
      claimed.set(key, (claimed.get(key) ?? 0) + 1);
    }
    const copies: HeldCard[] = [];
    for (const held of contents) {
      const spare = held.quantity - (claimed.get(`${held.cardId}|${held.section}`) ?? 0);
      for (let n = 0; n < spare; n += 1) copies.push(held);
    }
    const term = removeQuery.trim().toLowerCase();
    if (term.length === 0) return copies.slice(0, 12);
    return copies.filter((copy) => copy.name.toLowerCase().includes(term)).slice(0, 12);
  }, [contents, removeQuery, rows]);

  function stage(row: Omit<StagedRow, "key">) {
    if (rows.length >= MAX_STAGED_ROWS) {
      setError(`A single save can carry at most ${MAX_STAGED_ROWS} changes.`);
      return;
    }
    setError(null);
    nextKey.current += 1;
    setRows((prev) => [...prev, { ...row, key: `staged-${nextKey.current}` }]);
  }

  function stageAdd(result: CardSuggestion) {
    stage({
      op: "add",
      cardId: result.card.id,
      section: sectionForBoard(board, result.card.type),
      label: printingLabel(result.card),
    });
    setAddQuery("");
    addRef.current?.focus();
  }

  /** Remove on its own; a replace when a card is queued on the add side. */
  function stageRemoveOrReplace(copy: HeldCard) {
    if (pending) {
      stage({
        op: "replace",
        cardId: pending.card.id,
        fromCardId: copy.cardId,
        section: copy.section,
        label: printingLabel(pending.card),
        fromLabel: printingLabel(copy),
      });
      setPending(null);
    } else {
      stage({
        op: "remove",
        cardId: copy.cardId,
        section: copy.section,
        label: printingLabel(copy),
      });
    }
    setRemoveQuery("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload: StagedEditRow[] = rows.map((row) => ({
      op: row.op,
      cardId: row.cardId,
      fromCardId: row.fromCardId,
      section: row.section,
      quantity: 1,
    }));
    const response = await saveCubeEditsAction(cubeId, payload);
    setSaving(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    setRows([]);
    setPending(null);
    onClose();
  }

  const adds = rows.filter((row) => row.op === "add").length;
  const removes = rows.filter((row) => row.op === "remove").length;
  const swaps = rows.filter((row) => row.op === "replace").length;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">Edit</h2>
        <button type="button" onClick={onClose} className={`${btn.ghostSm} ml-auto`}>
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <span className={labelClass}>Board</span>
          <div
            role="group"
            aria-label="Board"
            className="mt-1 inline-flex overflow-hidden rounded-md border border-line"
          >
            {EDIT_BOARDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBoard(option)}
                aria-pressed={option === board}
                className={option === board ? segment.active : segment.inactive}
              >
                {BOARD_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-subtle">
            {board === "mainboard"
              ? "Legends, runes and battlefields still file into their own sections."
              : "A shortlist. Maybeboard cards aren't counted or drafted."}
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-add">
            Add card
          </label>
          <input
            id="edit-add"
            ref={addRef}
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            placeholder="Card to add"
            autoComplete="off"
            className={`${input} mt-1`}
          />
          {pending && (
            <p className="mt-1 text-xs text-muted">
              Queued to replace with: <span className="text-ink">{printingLabel(pending.card)}</span>{" "}
              <button type="button" onClick={() => setPending(null)} className={btn.ghostSm}>
                clear
              </button>
            </p>
          )}
          <p aria-live="polite" className="min-h-4 text-xs text-subtle">
            {searching ? "Searching…" : ""}
          </p>
          {matches.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {matches.map((result) => (
                <li key={result.card.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {printingLabel(result.card)}
                    <span className="block text-xs text-subtle">
                      {CUBE_SECTION_LABELS[sectionForBoard(board, result.card.type)]}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => stageAdd(result)}
                    className={btn.primarySm}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(result);
                      setAddQuery("");
                    }}
                    title="Use this card to replace one already in the cube"
                    className={btn.secondarySm}
                  >
                    Replace&hellip;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-remove">
            {pending ? "Card to replace" : "Remove card"}
          </label>
          <input
            id="edit-remove"
            value={removeQuery}
            onChange={(event) => setRemoveQuery(event.target.value)}
            placeholder="Card already in the cube"
            autoComplete="off"
            className={`${input} mt-1`}
          />
          {removable.length > 0 ? (
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line">
              {removable.map((copy, index) => (
                <li
                  key={`${copy.cardId}|${copy.section}|${index}`}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {printingLabel(copy)}
                    <span className="block text-xs text-subtle">
                      {CUBE_SECTION_LABELS[copy.section]}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => stageRemoveOrReplace(copy)}
                    className={btn.secondarySm}
                  >
                    {pending ? "Replace" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-subtle">
              {removeQuery.trim() ? "No copies left matching that." : "Nothing in the cube yet."}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={specifyVersions}
            onChange={(event) => setSpecifyVersions(event.target.checked)}
            className={check}
          />
          Specify versions
          <span className="text-xs text-subtle">(list every printing)</span>
        </label>

        <div>
          <span className={labelClass}>
            Staged changes{" "}
            <span className="font-normal text-subtle">
              {rows.length > 0 ? `+${adds}, −${removes}${swaps ? `, ${swaps} swapped` : ""}` : ""}
            </span>
          </span>
          <div className="mt-1">
            <StagedList
              rows={rows}
              onDrop={(key) => setRows((prev) => prev.filter((row) => row.key !== key))}
            />
          </div>
        </div>

        <p className="text-xs text-subtle">
          Looking for something specific?{" "}
          <Link href={browsePath} className="underline underline-offset-2">
            Browse the full card pool
          </Link>
          .
        </p>
      </div>

      <footer className="space-y-2 border-t border-line px-4 py-3">
        {error && <p className={errorText}>{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={rows.length === 0 || saving}
            className={`${btn.primary} flex-1`}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRows([]);
              setPending(null);
              setError(null);
            }}
            disabled={rows.length === 0 || saving}
            className={btn.secondary}
          >
            Discard all
          </button>
        </div>
      </footer>
    </>
  );
}
