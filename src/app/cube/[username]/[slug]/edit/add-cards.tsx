"use client";

import { useCallback, useState, useTransition } from "react";

import { addCardAction, listPrintingsAction } from "@/app/cube/actions";
import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import type { BrowseCard } from "@/db/queries/cards";
import { CUBE_SECTION_LABELS, defaultSectionForType } from "@/lib/riftbound";

interface Props {
  cubeId: string;
  cards: BrowseCard[];
  /** Card ids already in the cube, so tiles can show "In cube". */
  presentCardIds: string[];
}

const buttonClass =
  "h-8 w-full rounded-md text-xs font-medium transition disabled:opacity-60";

export default function AddCards({ cubeId, cards, presentCardIds }: Props) {
  const [present, setPresent] = useState(() => new Set(presentCardIds));
  const [selected, setSelected] = useState<BrowseCard | null>(null);
  const [picker, setPicker] = useState<{ card: BrowseCard; printings: BrowseCard[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Server-side ids can change under us after a revalidate; keep in step.
  const [syncedIds, setSyncedIds] = useState(presentCardIds);
  if (syncedIds !== presentCardIds) {
    setSyncedIds(presentCardIds);
    setPresent(new Set(presentCardIds));
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
      // Optimistic locally; the revalidated page confirms it.
      setPresent((prev) => new Set(prev).add(card.id));
      setPicker(null);
      startTransition(() => {});
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
          const inCube = present.has(card.id);
          const busy = busyId === card.id;
          return (
            <CardTile
              key={card.id}
              card={card}
              dimmed={inCube}
              onOpen={() => setSelected(card)}
              action={
                <div className="space-y-1">
                  <button
                    type="button"
                    disabled={inCube || busy}
                    onClick={() => add(card)}
                    className={`${buttonClass} ${
                      inCube
                        ? "cursor-default bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                        : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    }`}
                    title={
                      inCube
                        ? "Already in this cube"
                        : `Add to ${CUBE_SECTION_LABELS[defaultSectionForType(card.type)]}`
                    }
                  >
                    {inCube ? "In cube" : busy ? "Adding…" : "Add"}
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
            present.has(selected.id) ? (
              <p className="text-sm text-zinc-500">Already in this cube.</p>
            ) : (
              <button
                type="button"
                onClick={() => add(selected).then(() => setSelected(null))}
                className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Add to {CUBE_SECTION_LABELS[defaultSectionForType(selected.type)]}
              </button>
            )
          }
        />
      )}

      {picker && (
        <PrintingPicker
          card={picker.card}
          printings={picker.printings}
          present={present}
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
  present,
  onPick,
  onClose,
}: {
  card: BrowseCard;
  printings: BrowseCard[];
  present: Set<string>;
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
            const inCube = present.has(printing.id);
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
                </p>
                <button
                  type="button"
                  disabled={inCube}
                  onClick={() => onPick(printing)}
                  className={`${buttonClass} mt-1 ${
                    inCube
                      ? "cursor-default bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                      : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  }`}
                >
                  {inCube ? "In cube" : "Add this printing"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
