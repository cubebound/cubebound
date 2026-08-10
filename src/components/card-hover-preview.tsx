"use client";

import { useState } from "react";

import { cardThumb } from "@/lib/card-images";
import { aspectRatio, isLandscape } from "@/lib/riftbound";

export interface PreviewCard {
  id: string;
  name: string;
  type: string;
  imageThumb: string | null;
  imageFull: string | null;
}

export interface PreviewTarget {
  card: PreviewCard;
  x: number;
  y: number;
}

const WIDTH = 240;
const GAP = 16;

/**
 * Floating card art for a text row.
 *
 * The list view trades pictures for density, which is the point of it — but
 * "which card is that" then costs a click into the modal. A preview on hover
 * gives the picture back without giving up the density.
 *
 * Positioned `fixed` rather than absolute: the piles and columns it hovers over
 * have their own overflow and stacking contexts, and an absolutely positioned
 * preview gets clipped by them.
 */
export function useCardPreview() {
  const [target, setTarget] = useState<PreviewTarget | null>(null);

  const show = (card: PreviewCard, event: { clientX: number; clientY: number }) =>
    setTarget({ card, x: event.clientX, y: event.clientY });

  /** For keyboard focus, which has no cursor: anchor to the element instead. */
  const showAt = (card: PreviewCard, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTarget({ card, x: rect.right, y: rect.top + rect.height / 2 });
  };

  const hide = () => setTarget(null);

  return { target, show, showAt, hide };
}

export default function CardHoverPreview({ target }: { target: PreviewTarget | null }) {
  if (!target) return null;

  const { card, x, y } = target;
  const height = isLandscape(card.type) ? (WIDTH * 5) / 7 : (WIDTH * 7) / 5;

  // Flip to the other side of the cursor near the right edge, and keep the
  // whole card on screen vertically, so a row at the bottom of a long cube
  // still previews fully.
  const spaceRight = typeof window === "undefined" ? 9999 : window.innerWidth - x;
  const left = spaceRight > WIDTH + GAP * 2 ? x + GAP : x - WIDTH - GAP;
  const viewportHeight = typeof window === "undefined" ? 9999 : window.innerHeight;
  const top = Math.max(GAP, Math.min(y - height / 2, viewportHeight - height - GAP));

  const src = cardThumb(card.imageThumb ?? card.imageFull);

  return (
    <div
      // Purely decorative: the row it mirrors is already a labelled control.
      aria-hidden="true"
      className="pointer-events-none fixed z-50 overflow-hidden rounded-lg bg-zinc-100 shadow-2xl ring-1 ring-black/20 dark:bg-zinc-900 dark:ring-white/20"
      style={{ left, top, width: WIDTH, aspectRatio: aspectRatio(card.type) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-contain" />
      ) : (
        <div className="flex size-full items-center justify-center p-2 text-center text-xs">
          {card.name}
        </div>
      )}
    </div>
  );
}
