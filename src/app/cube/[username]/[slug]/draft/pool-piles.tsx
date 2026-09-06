"use client";

import { useState, useTransition } from "react";

import SharedCardArt from "@/components/card-art";
import { cardThumb } from "@/lib/card-images";
import { aspectRatio, isLandscape } from "@/lib/riftbound";

export interface PoolCard {
  /** (round, pickNumber) identifies the copy — a pool can hold two of a card. */
  round: number;
  pickNumber: number;
  id: string;
  name: string;
  /** A legend's name is only its title; the champion completes it on export. */
  champion: string | null;
  type: string;
  domains: string[];
  imageThumb: string | null;
  energyCost: number | null;
  board: "main" | "side";
}

/** Legends and battlefields sit outside the curve; they have no energy cost. */
const LEGENDS = "Legends";
const BATTLEFIELDS = "Battlefields";
/** Anything else without a cost still needs somewhere to go. */
const NO_COST = "—";

function pileOf(card: PoolCard): string {
  if (card.type === "Legend") return LEGENDS;
  if (card.type === "Battlefield") return BATTLEFIELDS;
  return card.energyCost === null ? NO_COST : String(card.energyCost);
}

/** Costs ascending, then the no-cost pile, then legends and battlefields. */
function comparePiles(a: string, b: string): number {
  const rank = (p: string) =>
    p === LEGENDS ? 3 : p === BATTLEFIELDS ? 4 : p === NO_COST ? 2 : 1;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return ra === 1 ? Number(a) - Number(b) : 0;
}

/**
 * A card image that degrades to its name.
 *
 * The retry-then-degrade behaviour lives in `components/card-art.tsx`; this is
 * just the frame it sits in, sized to the card's own orientation.
 */
function CardArt({ card }: { card: PoolCard }) {
  return (
    <div
      className="relative overflow-hidden rounded bg-sunken ring-1 ring-black/10 dark:ring-white/15"
      style={{ aspectRatio: aspectRatio(card.type) }}
    >
      <SharedCardArt
        src={cardThumb(card.imageThumb)}
        name={card.name}
        className="object-contain"
      />
    </div>
  );
}

/**
 * How much of a covered card stays visible, as a fraction of its own height.
 *
 * Cube Cobra can stack to a thin sliver because Magic prints the card name
 * along the top edge. Riftbound puts the name band around 60% down, so a
 * sliver shows cost and art but not the name — which is why hovering raises
 * the whole card. Raise this toward 0.65 to trade density for legibility.
 */
const REVEAL = 0.3;

/**
 * Negative margin that pulls a card up over the one before it.
 *
 * Percentage margins resolve against the container's *width*, and so does the
 * card's height via its aspect ratio, so expressing the overlap this way keeps
 * the stack correct at any column width. The covered card decides the offset,
 * which is why a battlefield (landscape) overlaps differently to a unit.
 */
function overlapPercent(covered: PoolCard): number {
  const heightPerWidth = isLandscape(covered.type) ? 5 / 7 : 7 / 5;
  return heightPerWidth * (1 - REVEAL) * 100;
}

function Pile({
  label,
  cards,
  onMove,
  busy,
  actionLabel,
}: {
  label: string;
  cards: PoolCard[];
  onMove: (card: PoolCard) => void;
  busy: boolean;
  actionLabel: string;
}) {
  // Which card is raised. Held in state rather than done with `hover:z-…`
  // because the stacking order is an inline style, and inline styles win over
  // classes — a hover class could never lift a card above its neighbours.
  const [raised, setRaised] = useState<number | null>(null);

  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-baseline gap-1 border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide">
        <span className="truncate">{label}</span>
        <span className="ml-auto font-normal tabular-nums text-subtle">{cards.length}</span>
      </p>
      <ul className="relative">
        {cards.map((card, index) => (
          <li
            key={`${card.round}-${card.pickNumber}`}
            className="relative"
            style={{
              marginTop: index === 0 ? 0 : `-${overlapPercent(cards[index - 1])}%`,
              zIndex: raised === index ? cards.length + 10 : index,
            }}
            onMouseEnter={() => setRaised(index)}
            onMouseLeave={() => setRaised((current) => (current === index ? null : current))}
          >
            <button
              type="button"
              onClick={() => onMove(card)}
              onFocus={() => setRaised(index)}
              onBlur={() => setRaised((current) => (current === index ? null : current))}
              disabled={busy}
              title={`${card.name}: ${actionLabel}`}
              aria-label={`${card.name}, ${actionLabel}`}
              className="block w-full rounded text-left transition disabled:opacity-50"
            >
              <div
                className={
                  raised === index
                    ? "rounded shadow-xl ring-2 ring-ink"
                    : ""
                }
              >
                <CardArt card={card} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The drafted pool as a curve, split into a main board and a sideboard.
 *
 * Clicking moves a card to the other board — the whole interaction, matching
 * the packs above where a click takes a card. Piles are by energy cost, with
 * legends and battlefields kept apart because they are off that scale
 * entirely rather than at the cheap end of it.
 */
export default function PoolPiles({
  cards,
  onMove,
}: {
  cards: PoolCard[];
  onMove: (card: PoolCard, board: "main" | "side") => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const board = (which: "main" | "side") => {
    const inBoard = cards.filter((card) => card.board === which);
    const piles = new Map<string, PoolCard[]>();
    for (const card of inBoard) {
      const key = pileOf(card);
      const bucket = piles.get(key) ?? [];
      bucket.push(card);
      piles.set(key, bucket);
    }
    for (const bucket of piles.values()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { inBoard, piles, keys: [...piles.keys()].sort(comparePiles) };
  };

  const main = board("main");
  const side = board("side");

  const section = (
    title: string,
    data: ReturnType<typeof board>,
    target: "main" | "side",
    actionLabel: string,
    emptyMessage: string,
  ) => (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-subtle">
        {title}
        <span className="ml-2 font-normal tabular-nums">{data.inBoard.length}</span>
      </h2>
      {data.inBoard.length === 0 ? (
        <p className="rounded border border-dashed border-line p-4 text-sm text-subtle">
          {emptyMessage}
        </p>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${data.keys.length}, minmax(0, 1fr))`,
            // Cap the width so a pool of five piles doesn't render five
            // enormous cards; with many piles the cap exceeds the viewport and
            // the columns shrink to fit instead.
            maxWidth: `${data.keys.length * 9}rem`,
          }}
        >
          {data.keys.map((key) => (
            <Pile
              key={key}
              label={key}
              cards={data.piles.get(key)!}
              busy={pending}
              actionLabel={actionLabel}
              onMove={(card) => startTransition(async () => { await onMove(card, target); })}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {section(
        "Mainboard",
        main,
        "side",
        "click to move to the sideboard",
        "Cards you pick land here. Click one to move it to the sideboard.",
      )}
      {section(
        "Sideboard",
        side,
        "main",
        "click to move to the mainboard",
        "Nothing sidelined. Click a mainboard card to move it here.",
      )}
    </div>
  );
}
