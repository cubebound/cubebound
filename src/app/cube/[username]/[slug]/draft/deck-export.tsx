"use client";

import { useRef, useState } from "react";

import { toDeckList } from "@/lib/deck-export";

import type { PoolCard } from "./pool-piles";
import { segment } from "@/lib/ui";

/**
 * Copies the drafted deck out as text for another Riftbound builder.
 *
 * A `<details>` panel rather than a modal or a second page: the list is the
 * whole content, it is short, and a dialog would need focus trapping and an
 * escape route to show a textarea. It also keeps the deck on screen beside the
 * pool it came from.
 *
 * **Mainboard by default, sideboard on request.** The flat `<n> <name>` format
 * has no notion of a sideboard, so appending one would silently present cards
 * the drafter deliberately cut as part of the deck. The toggle produces a
 * separate list rather than a combined one.
 */
export default function DeckExport({ pool }: { pool: PoolCard[] }) {
  const [showSide, setShowSide] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const board = showSide ? "side" : "main";
  const list = toDeckList(pool.filter((card) => card.board === board));

  async function copy() {
    const value = list.text;
    if (!value) return;
    try {
      // Needs a secure context; the fallback selects the text so Ctrl+C works.
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      textareaRef.current?.select();
    }
  }

  return (
    <details className="rounded-md border border-line">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium hover:bg-hover">
        Export deck
        <span className="ml-2 font-normal text-subtle">
          for Piltover Archive and other builders
        </span>
      </summary>

      <div className="space-y-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border border-line text-sm">
            {(["main", "side"] as const).map((which) => (
              <button
                key={which}
                type="button"
                onClick={() => setShowSide(which === "side")}
                aria-pressed={board === which}
                className={`first:rounded-l-md last:rounded-r-md ${
                  board === which ? segment.active : segment.inactive
                }`}
              >
                {which === "main" ? "Main deck" : "Sideboard"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={copy}
            disabled={list.count === 0}
            className="h-9 rounded-md bg-ink px-3 text-sm font-medium text-surface hover:bg-ink-hover disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>

          <span className="text-sm tabular-nums text-subtle">
            {list.count} {list.count === 1 ? "card" : "cards"}
          </span>
        </div>

        {list.count === 0 ? (
          <p className="text-sm text-subtle">
            {showSide
              ? "Nothing in the sideboard."
              : "Nothing in the main deck yet. Move cards up from the sideboard."}
          </p>
        ) : (
          <textarea
            ref={textareaRef}
            readOnly
            value={list.text}
            rows={Math.min(16, Math.max(4, list.text.split("\n").length))}
            aria-label={`${showSide ? "Sideboard" : "Main deck"} as text`}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-line bg-sunken p-3 font-mono text-xs leading-relaxed"
          />
        )}

        <p className="text-xs text-subtle">
          One card per line, quantity first: the format Piltover Archive and
          other builders accept. <strong className="font-medium">Runes are not
          included</strong>, because they are supplied outside the draft; add
          them in the builder.
        </p>
      </div>
    </details>
  );
}
