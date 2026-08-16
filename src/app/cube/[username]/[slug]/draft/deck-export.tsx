"use client";

import { useRef, useState } from "react";

import { toDeckList } from "@/lib/deck-export";

import type { PoolCard } from "./pool-piles";

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
    <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900">
        Export deck
        <span className="ml-2 font-normal text-zinc-500">
          for Piltover Archive and other builders
        </span>
      </summary>

      <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
            {(["main", "side"] as const).map((which) => (
              <button
                key={which}
                type="button"
                onClick={() => setShowSide(which === "side")}
                aria-pressed={board === which}
                className={`px-3 py-1.5 first:rounded-l-md last:rounded-r-md ${
                  board === which
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
            className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {copied ? "Copied" : "Copy"}
          </button>

          <span className="text-sm tabular-nums text-zinc-500">
            {list.count} {list.count === 1 ? "card" : "cards"}
          </span>
        </div>

        {list.count === 0 ? (
          <p className="text-sm text-zinc-500">
            {showSide
              ? "Nothing in the sideboard."
              : "Nothing in the main deck yet — move cards up from the sideboard."}
          </p>
        ) : (
          <textarea
            ref={textareaRef}
            readOnly
            value={list.text}
            rows={Math.min(16, Math.max(4, list.text.split("\n").length))}
            aria-label={`${showSide ? "Sideboard" : "Main deck"} as text`}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}

        <p className="text-xs text-zinc-500">
          One card per line, quantity first — the format Piltover Archive and
          other builders accept. <strong className="font-medium">Runes are not
          included</strong>, because they are supplied outside the draft; add
          them in the builder.
        </p>
      </div>
    </details>
  );
}
