"use client";

import { useCallback, useState } from "react";

import { CARD_GRID_CLASS, CardDetail, CardTile } from "@/components/card-visuals";
import type { BrowseCard } from "@/db/queries/cards";

export default function CardGrid({ cards }: { cards: BrowseCard[] }) {
  const [selected, setSelected] = useState<BrowseCard | null>(null);
  const close = useCallback(() => setSelected(null), []);

  return (
    <>
      <ul className={CARD_GRID_CLASS}>
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onOpen={() => setSelected(card)} />
        ))}
      </ul>
      {selected && <CardDetail card={selected} onClose={close} />}
    </>
  );
}
