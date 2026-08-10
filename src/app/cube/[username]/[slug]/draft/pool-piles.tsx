"use client";

import { useState, useTransition } from "react";

import { cardThumb } from "@/lib/card-images";
import { aspectRatio, isLandscape, COLORLESS, DOMAIN_COLORS } from "@/lib/riftbound";

export interface PoolCard {
  /** (round, pickNumber) identifies the copy — a pool can hold two of a card. */
  round: number;
  pickNumber: number;
  id: string;
  name: string;
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

export function domainDot(domains: string[]): string {
  if (domains.length === 0) return DOMAIN_COLORS[COLORLESS];
  if (domains.length === 1) return DOMAIN_COLORS[domains[0]] ?? DOMAIN_COLORS[COLORLESS];
  const step = 100 / domains.length;
  const bands = domains.map(
    (d, i) => `${DOMAIN_COLORS[d] ?? DOMAIN_COLORS[COLORLESS]} ${i * step}% ${(i + 1) * step}%`,
  );
  return `linear-gradient(135deg, ${bands.join(", ")})`;
}

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
 * Card art is served straight from the source CDN, so an occasional image
 * simply does not load — a blank tile then gives no clue what the card is,
 * which matters most in a pile you are trying to read at a glance.
 */
function CardArt({ card }: { card: PoolCard }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(
    card.imageThumb ? "loading" : "failed",
  );

  return (
    <div
      className="relative overflow-hidden rounded bg-zinc-100 ring-1 ring-black/10 dark:bg-zinc-900 dark:ring-white/15"
      style={{ aspectRatio: aspectRatio(card.type) }}
    >
      {/* The name sits underneath until the art covers it, so a slow or failed
          image reads as the card rather than as an empty box. */}
      {state !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center p-1 text-center text-[10px] leading-tight text-zinc-600 dark:text-zinc-300">
          {card.name}
        </div>
      )}
      {card.imageThumb && state !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cardThumb(card.imageThumb)!}
          alt={card.name}
          loading="lazy"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className="relative size-full object-contain"
        />
      )}
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
      <p className="mb-1 flex items-baseline gap-1 border-b border-zinc-200 pb-1 text-xs font-semibold uppercase tracking-wide dark:border-zinc-800">
        <span className="truncate">{label}</span>
        <span className="ml-auto font-normal tabular-nums text-zinc-500">{cards.length}</span>
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
              title={`${card.name} — ${actionLabel}`}
              aria-label={`${card.name}, ${actionLabel}`}
              className="block w-full rounded text-left transition disabled:opacity-50"
            >
              <div
                className={
                  raised === index
                    ? "rounded shadow-xl ring-2 ring-zinc-900 dark:ring-zinc-100"
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
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
        <span className="ml-2 font-normal tabular-nums">{data.inBoard.length}</span>
      </h2>
      {data.inBoard.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
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
