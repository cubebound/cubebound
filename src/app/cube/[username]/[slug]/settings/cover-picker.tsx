"use client";

import { useState, useTransition } from "react";

import { setCubeCoverAction } from "@/app/cube/actions";
import { cardPicker } from "@/lib/card-images";
import { aspectRatio } from "@/lib/riftbound";

export interface CoverChoice {
  id: string;
  name: string;
  type: string;
  imageThumb: string | null;
}

/**
 * Picks the card art that represents the cube on its share preview.
 *
 * Every card in the cube at once, filtered by name, rather than a search box
 * that returns one card at a time: choosing a cover is a *visual* decision and
 * you make it by looking at the options side by side. Images come at
 * `PICKER_WIDTH`, and lazily, so a 300-card cube doesn't pull megabytes to
 * answer a question about art.
 *
 * The chosen id is sent straight to the action rather than posted as a form,
 * so the grid keeps its scroll position — the whole point is comparing cards
 * far apart in a long list.
 */
export default function CoverPicker({
  cubeId,
  cards,
  selected,
}: {
  cubeId: string;
  cards: CoverChoice[];
  selected: string | null;
}) {
  const [choice, setChoice] = useState(selected);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(cardId: string | null) {
    const previous = choice;
    setChoice(cardId);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setCubeCoverAction(cubeId, cardId);
        if (result?.error) {
          setChoice(previous);
          setError(result.error);
        }
      } catch {
        setChoice(previous);
        setError("Couldn't reach the server.");
      }
    });
  }

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add some cards and you&rsquo;ll be able to pick one as the cube&rsquo;s
        cover art.
      </p>
    );
  }

  const term = filter.trim().toLowerCase();
  const shown = term
    ? cards.filter((card) => card.name.toLowerCase().includes(term))
    : cards;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name…"
          aria-label="Filter cards by name"
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 text-sm"
        />
        {choice && (
          <button
            type="button"
            onClick={() => choose(null)}
            disabled={pending}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-sm hover:bg-hover disabled:opacity-60"
          >
            Use default
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 grid max-h-96 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-4">
        {shown.map((card) => {
          const active = card.id === choice;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => choose(card.id)}
              disabled={pending}
              aria-pressed={active}
              title={card.name}
              className={`relative overflow-hidden rounded transition ${
                active
                  ? "ring-2 ring-ink"
                  : "opacity-80 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardPicker(card.imageThumb) ?? ""}
                alt={card.name}
                loading="lazy"
                style={{ aspectRatio: aspectRatio(card.type) }}
                className="w-full object-cover"
              />
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-subtle">
            No cards match &ldquo;{filter}&rdquo;.
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-subtle">
        {choice
          ? "This art shows when the cube is shared as a link."
          : "No cover set, so a card from the cube is used automatically."}
      </p>
    </div>
  );
}
