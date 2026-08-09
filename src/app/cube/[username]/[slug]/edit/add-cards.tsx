"use client";

import { useCallback, useState } from "react";

import { addCardAction, listPrintingsAction } from "@/app/cube/actions";
import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import type { BrowseCard } from "@/db/queries/cards";
import type { CubeHolding } from "@/db/queries/cubes";
import { CUBE_SECTION_LABELS, defaultSectionForType } from "@/lib/riftbound";

interface Props {
  cubeId: string;
  cards: BrowseCard[];
  /** What the cube holds, keyed by base card id. */
  holdings: Record<string, CubeHolding>;
}

/** Local view of a card's holding, updated optimistically as you add. */
interface Held {
  total: number;
  byPrinting: Record<string, number>;
  shown: BrowseCard;
}

const addClass =
  "h-8 rounded-md bg-zinc-900 text-xs font-medium text-white transition hover:bg-zinc-700 " +
  "disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

export default function AddCards({ cubeId, cards, holdings }: Props) {
  const [held, setHeld] = useState<Record<string, Held>>(() => toHeld(holdings));
  const [selected, setSelected] = useState<BrowseCard | null>(null);
  const [picker, setPicker] = useState<{ card: BrowseCard; printings: BrowseCard[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Server holdings can change under us after a revalidate; keep in step.
  const [synced, setSynced] = useState(holdings);
  if (synced !== holdings) {
    setSynced(holdings);
    setHeld(toHeld(holdings));
  }

  const add = useCallback(
    async (card: BrowseCard, printing: BrowseCard) => {
      setBusyId(printing.id);
      setError(null);
      const result = await addCardAction(cubeId, printing.id, undefined);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setHeld((prev) => {
        const current = prev[card.baseId];
        const byPrinting = {
          ...(current?.byPrinting ?? {}),
          [printing.id]: (current?.byPrinting?.[printing.id] ?? 0) + 1,
        };
        return {
          ...prev,
          [card.baseId]: {
            total: (current?.total ?? 0) + 1,
            byPrinting,
            // Once a printing is in the cube, the tile shows that one.
            shown: printing,
          },
        };
      });
      setPicker(null);
    },
    [cubeId],
  );

  const openPicker = useCallback(
    async (card: BrowseCard) => {
      setBusyId(card.id);
      setError(null);
      const result = await listPrintingsAction(cubeId, card.baseId);
      setBusyId(null);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPicker({ card, printings: result.printings });
    },
    [cubeId],
  );

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ul className={CARD_GRID_CLASS}>
        {cards.map((card) => {
          const holding = held[card.baseId];
          // Show whichever printing the cube holds, so an alt-art copy is
          // visible here rather than the tile looking like nothing is in.
          const shown = holding?.shown ?? card;
          const total = holding?.total ?? 0;
          const busy = busyId === shown.id || busyId === card.id;

          return (
            <CardTile
              key={card.baseId}
              card={shown}
              quantity={total}
              onOpen={() => setSelected(shown)}
              action={
                // One row of a fixed height for every tile, so the Add buttons
                // line up whether or not a card has other printings.
                <div className="flex items-stretch gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => add(card, shown)}
                    className={`${addClass} min-w-0 flex-1`}
                    title={
                      total > 0
                        ? `Add another copy of ${shown.name}`
                        : `Add to ${CUBE_SECTION_LABELS[defaultSectionForType(shown.type)]}`
                    }
                  >
                    {busy ? "…" : total > 0 ? "Add another" : "Add"}
                  </button>
                  {card.printingCount > 1 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openPicker(card)}
                      aria-label={`Choose a printing of ${card.name}`}
                      title={`${card.printingCount} printings`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-sm leading-none text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      ▾
                    </button>
                  )}
                </div>
              }
            />
          );
        })}
      </ul>

      {selected && (
        <CardDetail
          card={selected}
          onClose={() => setSelected(null)}
          footer={
            <button
              type="button"
              onClick={() => {
                const card = cards.find((c) => c.baseId === selected.baseId) ?? selected;
                add(card, selected).then(() => setSelected(null));
              }}
              className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Add to {CUBE_SECTION_LABELS[defaultSectionForType(selected.type)]}
            </button>
          }
        />
      )}

      {picker && (
        <PrintingPicker
          card={picker.card}
          printings={picker.printings}
          counts={held[picker.card.baseId]?.byPrinting ?? {}}
          onPick={(printing) => add(picker.card, printing)}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

function toHeld(holdings: Record<string, CubeHolding>): Record<string, Held> {
  return Object.fromEntries(
    Object.entries(holdings).map(([baseId, holding]) => [
      baseId,
      { total: holding.total, byPrinting: holding.byPrinting, shown: holding.held },
    ]),
  );
}

function PrintingPicker({
  card,
  printings,
  counts,
  onPick,
  onClose,
}: {
  card: BrowseCard;
  printings: BrowseCard[];
  counts: Record<string, number>;
  onPick: (printing: BrowseCard) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Printings of ${card.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{card.name}</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Pick which printing to add. The base printing is listed first.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {printings.map((printing) => {
            const isBase = printing.id === printing.baseId;
            const copies = counts[printing.id] ?? 0;
            return (
              <li key={printing.id}>
                {printing.imageThumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={printing.imageThumb}
                    alt={printing.name}
                    loading="lazy"
                    className="w-full rounded-lg"
                  />
                )}
                <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {printing.id} · {printing.rarity}
                  {isBase && <span className="ml-1 text-zinc-400">(base)</span>}
                  {copies > 0 && <span className="ml-1 tabular-nums">· ×{copies}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => onPick(printing)}
                  className={`${addClass} mt-1 w-full`}
                >
                  {copies > 0 ? "Add another" : "Add this printing"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
