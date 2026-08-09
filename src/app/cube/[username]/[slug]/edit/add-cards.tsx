"use client";

import { useCallback, useState } from "react";

import { addCardAction, listPrintingsAction } from "@/app/cube/actions";
import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import type { BrowseCard } from "@/db/queries/cards";
import { CUBE_SECTION_LABELS, defaultSectionForType } from "@/lib/riftbound";

interface Props {
  cubeId: string;
  cards: BrowseCard[];
  /** Copies of each printing already in the cube, by card id. */
  inCube: Record<string, number>;
}

const buttonClass = "h-8 w-full rounded-md text-xs font-medium transition disabled:opacity-60";
const addClass =
  "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

export default function AddCards({ cubeId, cards, inCube }: Props) {
  const [counts, setCounts] = useState(inCube);
  const [selected, setSelected] = useState<BrowseCard | null>(null);
  const [picker, setPicker] = useState<{ card: BrowseCard; printings: BrowseCard[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Server-side counts can change under us after a revalidate; keep in step.
  const [synced, setSynced] = useState(inCube);
  if (synced !== inCube) {
    setSynced(inCube);
    setCounts(inCube);
  }

  const add = useCallback(
    async (card: BrowseCard, section?: string) => {
      setBusyId(card.id);
      setError(null);
      const result = await addCardAction(cubeId, card.id, section);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Adding again adds a copy, so reflect the increment rather than
      // flipping to a terminal "in cube" state.
      setCounts((prev) => ({ ...prev, [card.id]: (prev[card.id] ?? 0) + 1 }));
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

  const addLabel = (card: BrowseCard) => {
    const held = counts[card.id] ?? 0;
    return held > 0 ? `Add another (${held})` : "Add";
  };

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ul className={CARD_GRID_CLASS}>
        {cards.map((card) => {
          const held = counts[card.id] ?? 0;
          const busy = busyId === card.id;
          return (
            <CardTile
              key={card.id}
              card={card}
              quantity={held}
              onOpen={() => setSelected(card)}
              action={
                <div className="space-y-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => add(card)}
                    className={`${buttonClass} ${addClass}`}
                    title={`Add to ${CUBE_SECTION_LABELS[defaultSectionForType(card.type)]}`}
                  >
                    {busy ? "Adding…" : addLabel(card)}
                  </button>
                  {card.printingCount > 1 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openPicker(card)}
                      className="h-7 w-full rounded-md border border-zinc-300 text-[11px] text-zinc-600 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Choose printing ({card.printingCount})
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
              onClick={() => add(selected).then(() => setSelected(null))}
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
          counts={counts}
          onPick={(printing) => add(printing)}
          onClose={() => setPicker(null)}
        />
      )}
    </>
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
            const held = counts[printing.id] ?? 0;
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
                  {held > 0 && <span className="ml-1 tabular-nums">· ×{held}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => onPick(printing)}
                  className={`${buttonClass} ${addClass} mt-1`}
                >
                  {held > 0 ? "Add another" : "Add this printing"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
