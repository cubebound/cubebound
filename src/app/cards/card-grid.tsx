"use client";

import { useCallback, useState } from "react";

import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import type { BrowseCard } from "@/db/queries/cards";
import type { CardPopularityView } from "@/lib/card-popularity";

export default function CardGrid({
  cards,
  popularity = {},
}: {
  cards: BrowseCard[];
  /**
   * Keyed by printing id, built on the server for the cards on this page only.
   * A card with nothing to say is simply absent, so the lookup reads as the
   * optional prop it feeds.
   */
  popularity?: Record<string, CardPopularityView>;
}) {
  const [selected, setSelected] = useState<BrowseCard | null>(null);
  const close = useCallback(() => setSelected(null), []);

  return (
    <>
      <ul className={CARD_GRID_CLASS}>
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onOpen={() => setSelected(card)} />
        ))}
      </ul>
      {selected && (
        <CardDetail card={selected} onClose={close} popularity={popularity[selected.id]} />
      )}
    </>
  );
}
