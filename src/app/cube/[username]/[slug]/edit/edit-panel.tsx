"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  quickSearchAction,
  saveCubeEditsAction,
  type CardSuggestion,
} from "@/app/cube/actions";
import StagedList, { type StagedRow } from "./staged-list";
import CardHoverPreview, {
  useCardPreview,
  type PreviewCard,
} from "@/components/card-hover-preview";
import { CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";
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
  /** For the hover preview. `type` decides portrait against landscape. */
  type: string;
  imageThumb: string | null;
  imageFull: string | null;
}

const SEARCH_DEBOUNCE_MS = 300;
/** Past this the floating trigger appears; above it the toolbar one is in view. */
const FLOATING_TRIGGER_AFTER = 400;
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
  const [scrolled, setScrolled] = useState(false);

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

  // The toolbar trigger is the discoverable one and sits at the top of the
  // page; the floating one appears only once that has scrolled away, so a long
  // cube always has Edit within reach without ever showing two at once.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > FLOATING_TRIGGER_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Never "×3": check:copies-and-log asserts the editor's HTML carries no ×N
  // notation, and both triggers render on the server.
  const count = rows.length > 0 ? ` (${rows.length})` : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className={btn.primarySm}
      >
        Edit cube{count}
      </button>

      {scrolled && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={`${btn.primary} fixed right-4 bottom-4 z-30 rounded-full shadow-lg`}
        >
          Edit cube{count}
        </button>
      )}

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

/**
 * A suggestion list that floats over the panel rather than pushing it around.
 *
 * Absolutely positioned on purpose: growing the document as you type moved the
 * Remove field down the panel while you were reaching for it. `onMouseDown`
 * preventing default is what stops the input's blur firing before the click
 * lands and closing the list out from under the cursor.
 */
function Suggestions<T>({
  items,
  render,
  onPick,
  keyOf,
  listId,
  previewOf,
  preview,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  onPick: (item: T) => void;
  keyOf: (item: T, index: number) => string;
  listId: string;
  /** The art to float beside the row under the cursor. */
  previewOf: (item: T) => PreviewCard;
  preview: ReturnType<typeof useCardPreview>;
}) {
  // Clear any floating art when this list goes away. Picking a row unmounts the
  // list, so the row never sees `mouseleave` and the preview would otherwise
  // stay on screen until another hover replaced it.
  const { hide } = preview;
  useEffect(() => hide, [hide]);

  if (items.length === 0) return null;
  return (
    <ul
      id={listId}
      role="listbox"
      className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-raised shadow-lg"
    >
      {items.map((item, index) => (
        <li key={keyOf(item, index)}>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              preview.hide();
              onPick(item);
            }}
            onMouseEnter={(event) => preview.show(previewOf(item), event)}
            onMouseMove={(event) => preview.show(previewOf(item), event)}
            onMouseLeave={preview.hide}
            onFocus={(event) => preview.showAt(previewOf(item), event.currentTarget)}
            onBlur={preview.hide}
            className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-hover"
          >
            {render(item)}
          </button>
        </li>
      ))}
    </ul>
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
  const [addChoice, setAddChoice] = useState<CardSuggestion | null>(null);
  const [addDismissed, setAddDismissed] = useState(false);

  const [removeQuery, setRemoveQuery] = useState("");
  const [removeChoice, setRemoveChoice] = useState<HeldCard | null>(null);
  const [removeDismissed, setRemoveDismissed] = useState(false);

  // What the last completed search answered, and for which term. "Is a search
  // in flight" is then derived rather than stored, which keeps previous matches
  // on screen while you type instead of blinking to empty.
  const [answered, setAnswered] = useState<{ key: string; items: CardSuggestion[] }>({
    key: "",
    items: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const preview = useCardPreview();

  const term = addQuery.trim();
  // A locked-in choice fills the box with its own label, so searching again
  // would re-open the list over a field the reader has finished with.
  const looking = addChoice === null && term.length >= 2;
  const wantKey = `${specifyVersions ? "all" : "one"}:${term}`;
  const searching = looking && answered.key !== wantKey;
  const matches = looking && answered.key === wantKey ? answered.items : [];

  /**
   * Visibility is a *dismissal* flag, not a focus one.
   *
   * Gating on "is the field focused" fails closed: any path where React does
   * not see the focus event leaves a filled box with no list under it, and the
   * control looks broken. Starting from visible and closing on an explicit
   * dismissal — blur, Escape, or picking something — fails open instead, which
   * at worst shows a list a moment longer than needed. The list is empty until
   * something is typed either way, so there is nothing to show unbidden.
   */
  const showAddList = !addDismissed && matches.length > 0;

  useEffect(() => {
    addRef.current?.focus();
  }, []);

  useEffect(() => {
    if (addChoice !== null) return;
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
  }, [addQuery, addChoice, cubeId, specifyVersions]);

  /**
   * One entry per copy the cube still holds, minus whatever this batch has
   * already claimed. Two copies of one printing are two entries, so picking one
   * stages exactly one removal and the other stays available — the same
   * per-copy rule the cube list follows everywhere else.
   *
   * Empty until something is typed: this is a picker for a card you already
   * have in mind, not a second copy of the cube list.
   */
  const removable = useMemo(() => {
    const query = removeQuery.trim().toLowerCase();
    if (query.length === 0) return [];
    const claimed = new Map<string, number>();
    for (const row of rows) {
      if (row.op === "add") continue;
      const id = row.op === "replace" ? row.fromCardId! : row.cardId;
      claimed.set(`${id}|${row.section}`, (claimed.get(`${id}|${row.section}`) ?? 0) + 1);
    }
    const copies: HeldCard[] = [];
    for (const held of contents) {
      const spare = held.quantity - (claimed.get(`${held.cardId}|${held.section}`) ?? 0);
      for (let n = 0; n < spare; n += 1) copies.push(held);
    }
    return copies.filter((copy) => copy.name.toLowerCase().includes(query)).slice(0, 12);
  }, [contents, removeQuery, rows]);

  const removeMatches = removeChoice === null ? removable : [];
  const showRemoveList = !removeDismissed && removeMatches.length > 0;

  function stage(row: Omit<StagedRow, "key">) {
    if (rows.length >= MAX_STAGED_ROWS) {
      setError(`A single save can carry at most ${MAX_STAGED_ROWS} changes.`);
      return;
    }
    setError(null);
    nextKey.current += 1;
    setRows((prev) => [...prev, { ...row, key: `staged-${nextKey.current}` }]);
  }

  function clearAdd() {
    setAddChoice(null);
    setAddQuery("");
    setAddDismissed(false);
  }

  function clearRemove() {
    setRemoveChoice(null);
    setRemoveQuery("");
    setRemoveDismissed(false);
  }

  /** Adds the queued card and nothing else — whatever sits in Remove stays. */
  function commitAdd() {
    if (!addChoice) return;
    stage({
      op: "add",
      cardId: addChoice.card.id,
      section: sectionForBoard(board, addChoice.card.type),
      label: printingLabel(addChoice.card),
    });
    clearAdd();
    addRef.current?.focus();
  }

  /**
   * A removal on its own, or a swap when a card is also queued to add — which
   * is the only thing that consumes both fields.
   */
  function commitRemoveOrReplace() {
    if (!removeChoice) return;
    if (addChoice) {
      stage({
        op: "replace",
        cardId: addChoice.card.id,
        fromCardId: removeChoice.cardId,
        section: removeChoice.section,
        label: printingLabel(addChoice.card),
        fromLabel: printingLabel(removeChoice),
      });
      clearAdd();
    } else {
      stage({
        op: "remove",
        cardId: removeChoice.cardId,
        section: removeChoice.section,
        label: printingLabel(removeChoice),
      });
    }
    clearRemove();
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
    clearAdd();
    clearRemove();
    onClose();
  }

  const adds = rows.filter((row) => row.op === "add").length;
  const removes = rows.filter((row) => row.op === "remove").length;
  const swaps = rows.filter((row) => row.op === "replace").length;

  return (
    <>
      {/* Rendered once for the whole panel, and `fixed`, so the drawer's own
          overflow cannot clip it. */}
      <CardHoverPreview target={preview.target} />

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
          <div className="relative mt-1">
            <input
              id="edit-add"
              ref={addRef}
              value={addQuery}
              onChange={(event) => {
                setAddQuery(event.target.value);
                setAddChoice(null);
                setAddDismissed(false);
              }}
              onBlur={() => setAddDismissed(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAddDismissed(true);
              }}
              placeholder="Card to add"
              autoComplete="off"
              role="combobox"
              aria-expanded={showAddList}
              aria-controls="edit-add-list"
              className={input}
            />
            {showAddList && (
              <Suggestions
                listId="edit-add-list"
                items={matches}
                preview={preview}
                previewOf={(result) => result.card}
                keyOf={(result) => result.card.id}
                onPick={(result) => {
                  setAddChoice(result);
                  setAddQuery(printingLabel(result.card));
                  setAddDismissed(true);
                }}
                render={(result) => (
                  <>
                    <span className="block truncate">{printingLabel(result.card)}</span>
                    <span className="block text-xs text-subtle">
                      {CUBE_SECTION_LABELS[sectionForBoard(board, result.card.type)]}
                    </span>
                  </>
                )}
              />
            )}
          </div>
          <p aria-live="polite" className="min-h-4 text-xs text-subtle">
            {searching ? "Searching…" : ""}
          </p>
          <button
            type="button"
            onClick={commitAdd}
            disabled={!addChoice}
            className={`${btn.primary} w-full`}
          >
            Add
          </button>
        </div>

        <div>
          <label className={labelClass} htmlFor="edit-remove">
            Remove/Replace card
          </label>
          <div className="relative mt-1">
            <input
              id="edit-remove"
              value={removeQuery}
              onChange={(event) => {
                setRemoveQuery(event.target.value);
                setRemoveChoice(null);
                setRemoveDismissed(false);
              }}
              onBlur={() => setRemoveDismissed(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setRemoveDismissed(true);
              }}
              placeholder="Card to remove"
              autoComplete="off"
              role="combobox"
              aria-expanded={showRemoveList}
              aria-controls="edit-remove-list"
              className={input}
            />
            {showRemoveList && (
              <Suggestions
                listId="edit-remove-list"
                items={removeMatches}
                preview={preview}
                previewOf={(copy) => ({
                  id: copy.cardId,
                  name: copy.name,
                  type: copy.type,
                  imageThumb: copy.imageThumb,
                  imageFull: copy.imageFull,
                })}
                keyOf={(copy, index) => `${copy.cardId}|${copy.section}|${index}`}
                onPick={(copy) => {
                  setRemoveChoice(copy);
                  setRemoveQuery(printingLabel(copy));
                  setRemoveDismissed(true);
                }}
                render={(copy) => (
                  <>
                    <span className="block truncate">{printingLabel(copy)}</span>
                    <span className="block text-xs text-subtle">
                      {CUBE_SECTION_LABELS[copy.section]}
                    </span>
                  </>
                )}
              />
            )}
          </div>
          <button
            type="button"
            onClick={commitRemoveOrReplace}
            disabled={!removeChoice}
            className={`${btn.secondary} mt-2 w-full`}
          >
            {addChoice ? "Replace" : "Remove"}
          </button>
          {addChoice && removeChoice && (
            <p className="mt-1 text-xs text-subtle">
              Replace swaps them. Add takes the card above on its own and leaves this one
              here.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={specifyVersions}
            onChange={(event) => {
              setSpecifyVersions(event.target.checked);
              setAddChoice(null);
            }}
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
              clearAdd();
              clearRemove();
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
