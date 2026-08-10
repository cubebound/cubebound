"use client";

import { useCallback, useState, type ReactNode } from "react";

import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import CubeTable from "@/components/cube-table";
import type { CubeCardRow } from "@/db/queries/cubes";
import { countCopies, expandCopies, type CopyOf } from "@/lib/cube-cards";
import type { CubeView } from "@/lib/cube-view";
import { CUBE_SECTIONS, CUBE_SECTION_LABELS, type CubeSection } from "@/lib/riftbound";

/**
 * A cube's cards, grouped by section and rendered in the chosen view.
 *
 * Every copy is its own entry — a cube running three of a card shows three
 * entries rather than one wearing a "×3" — so each can be retargeted to a
 * different printing or section on its own.
 *
 * Shared by the owner's editor and the public page. The public page passes no
 * action props, which is what makes it read-only — there is no "is the viewer
 * the owner" flag inside here to get wrong.
 */
export default function CubeSections({
  cards,
  view,
  copyAction,
  onRemoveOne,
  busyKey,
  emptyMessage = "No cards yet.",
  detailFooter,
}: {
  cards: CubeCardRow[];
  view: CubeView;
  /** Editor controls under each copy in the visual view. */
  copyAction?: (copy: CopyOf<CubeCardRow>) => ReactNode;
  /** Text view's per-row remove; omitted for read-only views. */
  onRemoveOne?: (card: CubeCardRow) => void;
  busyKey?: string | null;
  emptyMessage?: string;
  detailFooter?: (card: CubeCardRow) => ReactNode;
}) {
  // Track the selection by key, not by row: after an edit the page revalidates
  // and hands us new row objects, and a held reference would show stale data.
  // Deriving it also closes the modal when the card is removed.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const close = useCallback(() => setSelectedKey(null), []);
  const rowKey = (card: CubeCardRow) => `${card.id}:${card.section}`;
  const selected = cards.find((card) => rowKey(card) === selectedKey) ?? null;

  if (cards.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        {emptyMessage}
      </p>
    );
  }

  const bySection = new Map<CubeSection, CubeCardRow[]>();
  for (const section of CUBE_SECTIONS) bySection.set(section, []);
  for (const card of cards) bySection.get(card.section)?.push(card);

  return (
    <>
      <div className="space-y-8">
        {CUBE_SECTIONS.map((section) => {
          const inSection = bySection.get(section) ?? [];
          if (inSection.length === 0) return null;
          return (
            <section key={section}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {CUBE_SECTION_LABELS[section]}
                <span className="ml-2 font-normal tabular-nums">
                  {countCopies(inSection)}
                </span>
              </h3>
              {view === "text" ? (
                <CubeTable
                  cards={inSection}
                  busyKey={busyKey}
                  onSelect={(card) => setSelectedKey(rowKey(card))}
                  onRemove={onRemoveOne}
                  // Only main mixes card types; the rest are single-type.
                  groupByType={section === "main"}
                />
              ) : (
                <ul className={CARD_GRID_CLASS}>
                  {expandCopies(inSection).map((copy) => (
                    <CardTile
                      key={copy.key}
                      card={copy.card}
                      showPrintingCount={false}
                      onOpen={() => setSelectedKey(rowKey(copy.card))}
                      action={copyAction?.(copy)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {selected && (
        <CardDetail card={selected} onClose={close} footer={detailFooter?.(selected)} />
      )}
    </>
  );
}
