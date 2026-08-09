"use client";

import { useState } from "react";

import { moveCardAction, removeCardAction } from "@/app/cube/actions";
import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import CubeTable from "@/components/cube-table";
import type { CubeCardRow } from "@/db/queries/cubes";
import type { CubeView } from "@/lib/cube-view";
import { CUBE_SECTIONS, CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";

export default function CubeContents({
  cubeId,
  cards,
  view,
}: {
  cubeId: string;
  cards: CubeCardRow[];
  view: CubeView;
}) {
  const [selected, setSelected] = useState<CubeCardRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bySection = new Map<CubeSection, CubeCardRow[]>();
  for (const section of CUBE_SECTIONS) bySection.set(section, []);
  for (const card of cards) bySection.get(card.section)?.push(card);

  const key = (card: CubeCardRow) => `${card.id}:${card.section}`;

  async function remove(card: CubeCardRow) {
    setBusy(key(card));
    setError(null);
    const result = await removeCardAction(cubeId, card.id, card.section);
    setBusy(null);
    if (result.error) setError(result.error);
    else if (selected && key(selected) === key(card)) setSelected(null);
  }

  async function move(card: CubeCardRow, to: CubeSection) {
    setBusy(key(card));
    setError(null);
    const result = await moveCardAction(cubeId, card.id, card.section, to);
    setBusy(null);
    if (result.error) setError(result.error);
  }

  if (cards.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        No cards yet. Search below to add some.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-8">
        {CUBE_SECTIONS.map((section) => {
          const inSection = bySection.get(section) ?? [];
          if (inSection.length === 0) return null;
          return (
            <section key={section}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {CUBE_SECTION_LABELS[section]}
                <span className="ml-2 font-normal tabular-nums">{inSection.length}</span>
              </h3>
              {view === "text" ? (
                <CubeTable
                  cards={inSection}
                  busyKey={busy}
                  onSelect={setSelected}
                  onRemove={remove}
                />
              ) : (
              <ul className={CARD_GRID_CLASS}>
                {inSection.map((card) => (
                  <CardTile
                    key={key(card)}
                    card={card}
                    showPrintingCount={false}
                    onOpen={() => setSelected(card)}
                    action={
                      <div className="flex items-center gap-1">
                        <select
                          aria-label={`Section for ${card.name}`}
                          value={card.section}
                          disabled={busy === key(card)}
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
                          disabled={busy === key(card)}
                          onClick={() => remove(card)}
                          aria-label={`Remove ${card.name}`}
                          title="Remove from cube"
                          className="h-7 shrink-0 rounded-md border border-zinc-300 px-2 text-[11px] text-zinc-600 hover:border-red-400 hover:text-red-600 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    }
                  />
                ))}
              </ul>
              )}
            </section>
          );
        })}
      </div>

      {selected && (
        <CardDetail
          card={selected}
          onClose={() => setSelected(null)}
          footer={
            <button
              type="button"
              onClick={() => remove(selected)}
              className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500 dark:hover:text-red-400"
            >
              Remove from cube
            </button>
          }
        />
      )}
    </>
  );
}
