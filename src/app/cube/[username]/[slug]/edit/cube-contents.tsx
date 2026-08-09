"use client";

import { useState } from "react";

import {
  adjustQuantityAction,
  moveCardAction,
  removeCardAction,
} from "@/app/cube/actions";
import CubeSections from "@/components/cube-sections";
import type { CubeCardRow } from "@/db/queries/cubes";
import type { CubeView } from "@/lib/cube-view";
import { CUBE_SECTIONS, CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";

const rowKey = (card: CubeCardRow) => `${card.id}:${card.section}`;

export default function CubeContents({
  cubeId,
  cards,
  view,
}: {
  cubeId: string;
  cards: CubeCardRow[];
  view: CubeView;
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

  const adjust = (card: CubeCardRow, delta: number) =>
    run(card, () => adjustQuantityAction(cubeId, card.id, card.section, delta));

  const remove = (card: CubeCardRow) =>
    run(card, () => removeCardAction(cubeId, card.id, card.section));

  const move = (card: CubeCardRow, to: CubeSection) =>
    run(card, () => moveCardAction(cubeId, card.id, card.section, to));

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
        // In the compact list a single control has to mean one thing: it takes
        // a copy off, and the last one takes the card out.
        onRemoveOne={(card) => adjust(card, -1)}
        tileAction={(card) => (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <select
                aria-label={`Section for ${card.name}`}
                value={card.section}
                disabled={busy === rowKey(card)}
                onChange={(event) => move(card, event.target.value as CubeSection)}
                className="h-7 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-1 text-[11px] text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {CUBE_SECTIONS.map((value) => (
                  <option key={value} value={value}>
                    {CUBE_SECTION_LABELS[value]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => remove(card)}
                aria-label={`Remove ${card.name} from the cube`}
                title="Remove every copy"
                className="h-7 shrink-0 rounded-md border border-zinc-300 px-2 text-[11px] text-zinc-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:text-red-400"
              >
                Remove
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => adjust(card, -1)}
                aria-label={`One fewer ${card.name}`}
                className="h-7 flex-1 rounded-md border border-zinc-300 text-[13px] leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                −
              </button>
              <span
                aria-label={`${card.quantity} in cube`}
                className="w-7 shrink-0 text-center text-[11px] font-medium tabular-nums"
              >
                {card.quantity}
              </span>
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => adjust(card, 1)}
                aria-label={`One more ${card.name}`}
                className="h-7 flex-1 rounded-md border border-zinc-300 text-[13px] leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                +
              </button>
            </div>
          </div>
        )}
        detailFooter={(card) => (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => adjust(card, -1)}
                aria-label={`One fewer ${card.name}`}
                className="size-9 rounded-md border border-zinc-300 text-lg leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                −
              </button>
              <span
                aria-live="polite"
                aria-label={`${card.quantity} in cube`}
                className="w-10 text-center text-sm font-medium tabular-nums"
              >
                ×{card.quantity}
              </span>
              <button
                type="button"
                disabled={busy === rowKey(card)}
                onClick={() => adjust(card, 1)}
                aria-label={`One more ${card.name}`}
                className="size-9 rounded-md border border-zinc-300 text-lg leading-none text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                +
              </button>
            </div>
            <span className="text-xs text-zinc-500">
              in {CUBE_SECTION_LABELS[card.section]}
            </span>
            <button
              type="button"
              disabled={busy === rowKey(card)}
              onClick={() => remove(card)}
              className="h-9 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:border-red-400 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500 dark:hover:text-red-400"
            >
              Remove all
            </button>
          </div>
        )}
      />
    </>
  );
}
