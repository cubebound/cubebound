"use client";

import { useState } from "react";

import {
  adjustQuantityAction,
  moveCardAction,
  removeCardAction,
  swapPrintingAction,
} from "@/app/cube/actions";
import CubeSections from "@/components/cube-sections";
import type { BrowseCard } from "@/db/queries/cards";
import type { CubeCardRow } from "@/db/queries/cubes";
import type { CubeView } from "@/lib/cube-view";
import { CUBE_SECTIONS, CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";

const rowKey = (card: CubeCardRow) => `${card.id}:${card.section}`;

const selectClass =
  "h-7 min-w-0 rounded-md border border-zinc-300 bg-white px-1 text-[11px] text-zinc-700 " +
  "disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

export default function CubeContents({
  cubeId,
  cards,
  view,
  printingsByBase,
}: {
  cubeId: string;
  cards: CubeCardRow[];
  view: CubeView;
  /** Every printing of each card in the cube, for the per-copy switcher. */
  printingsByBase: Record<string, BrowseCard[]>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(card: CubeCardRow, work: () => Promise<{ error?: string }>) {
    setBusy(rowKey(card));
    setError(null);
    const result = await work();
    setBusy(null);
    if (result.error) setError(result.error);
  }

  /** Every control here acts on ONE copy, matching what the list shows. */
  const removeCopy = (card: CubeCardRow) =>
    run(card, () => adjustQuantityAction(cubeId, card.id, card.section, -1));

  const removeAll = (card: CubeCardRow) =>
    run(card, () => removeCardAction(cubeId, card.id, card.section));

  const moveCopy = (card: CubeCardRow, to: CubeSection) =>
    run(card, () => moveCardAction(cubeId, card.id, card.section, to));

  const switchPrinting = (card: CubeCardRow, toCardId: string) =>
    run(card, () => swapPrintingAction(cubeId, card.id, toCardId, card.section));

  const sectionSelect = (card: CubeCardRow, className: string) => (
    <select
      aria-label={`Section for ${card.name}`}
      value={card.section}
      disabled={busy === rowKey(card)}
      onChange={(event) => moveCopy(card, event.target.value as CubeSection)}
      className={className}
    >
      {CUBE_SECTIONS.map((value) => (
        <option key={value} value={value}>
          {CUBE_SECTION_LABELS[value]}
        </option>
      ))}
    </select>
  );

  const printingControl = (card: CubeCardRow, className: string) => {
    const printings = printingsByBase[card.baseId] ?? [];
    // A static label when there's nothing to choose between, so every tile
    // keeps the same height and the controls stay in line.
    if (printings.length < 2) {
      return (
        <span
          className="flex h-7 items-center justify-center truncate text-[11px] text-zinc-500"
          title={`Printing ${card.id}`}
        >
          {card.id}
        </span>
      );
    }
    return (
      <select
        aria-label={`Printing for ${card.name}`}
        value={card.id}
        disabled={busy === rowKey(card)}
        onChange={(event) => switchPrinting(card, event.target.value)}
        className={className}
      >
        {printings.map((printing) => (
          <option key={printing.id} value={printing.id}>
            {printing.id}
            {printing.id === printing.baseId ? " (base)" : ""}
          </option>
        ))}
      </select>
    );
  };

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <CubeSections
        cards={cards}
        view={view}
        busyKey={busy}
        emptyMessage="No cards yet. Use quick add to build the list."
        onRemoveOne={removeCopy}
        copyAction={({ card }) => (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {sectionSelect(card, `${selectClass} flex-1`)}
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => removeCopy(card)}
                aria-label={`Remove one ${card.name}`}
                title="Remove this copy"
                className="h-7 shrink-0 rounded-md border border-zinc-300 px-2 text-[11px] text-zinc-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:text-red-400"
              >
                Remove
              </button>
            </div>
            {printingControl(card, `${selectClass} w-full`)}
          </div>
        )}
        detailFooter={(card) => (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Section</label>
              {sectionSelect(card, `${selectClass} h-9 px-2 text-sm`)}
              {(printingsByBase[card.baseId]?.length ?? 0) > 1 && (
                <>
                  <label className="text-xs uppercase tracking-wide text-zinc-500">
                    Printing
                  </label>
                  {printingControl(card, `${selectClass} h-9 px-2 text-sm`)}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => removeCopy(card)}
                className="h-9 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:border-red-400 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500 dark:hover:text-red-400"
              >
                Remove this copy
              </button>
              {card.quantity > 1 && (
                <button
                  type="button"
                  disabled={busy === rowKey(card)}
                  onClick={() => removeAll(card)}
                  className="h-9 rounded-md border border-zinc-300 px-4 text-sm text-zinc-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:text-red-400"
                >
                  Remove all {card.quantity}
                </button>
              )}
            </div>
          </div>
        )}
      />
    </>
  );
}
