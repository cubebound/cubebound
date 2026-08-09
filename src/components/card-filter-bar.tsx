"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { CardFilters, FilterOptions } from "@/db/queries/cards";
import { cardFilterParams } from "@/lib/card-search-params";
import { DOMAIN_COLORS } from "@/lib/riftbound";

interface Props {
  options: FilterOptions;
  active: CardFilters;
  total: number;
  /** Route the filters navigate to — /cards, or a cube editor path. */
  basePath: string;
  /** Query params to preserve that aren't card filters (e.g. editor tab). */
  extraParams?: Record<string, string>;
  /** Wording for the result count, e.g. "cards" or "matches". */
  unit?: string;
}

const selectClass =
  "h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 " +
  "focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default function CardFilterBar({
  options,
  active,
  total,
  basePath,
  extraParams = {},
  unit = "cards",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(active.q ?? "");

  // Keep the box in step with back/forward navigation, adjusting during render
  // rather than in an effect so typing never loses focus to a remount.
  const [syncedQ, setSyncedQ] = useState(active.q ?? "");
  if (syncedQ !== (active.q ?? "")) {
    setSyncedQ(active.q ?? "");
    setQ(active.q ?? "");
  }

  /**
   * Keeps the reader's place across a filter change.
   *
   * The filter bar can sit far down the page — in the cube editor it is below
   * the whole cube — so jumping on every refinement is disorienting.
   * `scroll: false` stops Next's scroll-to-top (without it the page goes to 0),
   * but the router still pulls the viewport to the top of the refreshed
   * segment afterwards, so the position is captured before navigating and
   * reapplied once the transition settles. Re-applying is clamped by the
   * browser, so a shorter results page still lands at its own bottom.
   */
  const restoreScrollTo = useRef<number | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && restoreScrollTo.current !== null) {
      window.scrollTo(0, restoreScrollTo.current);
      restoreScrollTo.current = null;
    }
    wasPending.current = isPending;
  }, [isPending]);

  function navigate(next: Partial<CardFilters>) {
    const query = cardFilterParams(
      { ...active, q, ...next, page: undefined },
      extraParams,
    ).toString();
    restoreScrollTo.current = window.scrollY;
    startTransition(() =>
      router.push(query ? `${basePath}?${query}` : basePath, { scroll: false }),
    );
  }

  function clear() {
    setQ("");
    const query = new URLSearchParams(extraParams).toString();
    restoreScrollTo.current = window.scrollY;
    startTransition(() =>
      router.push(query ? `${basePath}?${query}` : basePath, { scroll: false }),
    );
  }

  const hasFilters = Boolean(
    active.q ||
      active.set ||
      active.domain ||
      active.type ||
      active.rarity ||
      active.allPrintings,
  );

  return (
    <form
      action={basePath}
      method="GET"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({});
      }}
      className="flex flex-wrap items-center gap-2"
    >
      {Object.entries(extraParams).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <input
        type="search"
        name="q"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search names and rules text…"
        aria-label="Search cards"
        className="h-9 min-w-56 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      <select
        name="set"
        aria-label="Set"
        value={active.set ?? ""}
        onChange={(event) => navigate({ set: event.target.value })}
        className={selectClass}
      >
        <option value="">All sets</option>
        {options.sets.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        name="domain"
        aria-label="Domain"
        value={active.domain ?? ""}
        onChange={(event) => navigate({ domain: event.target.value })}
        className={selectClass}
        style={
          active.domain ? { borderColor: DOMAIN_COLORS[active.domain] ?? undefined } : undefined
        }
      >
        <option value="">All domains</option>
        {options.domains.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        name="type"
        aria-label="Card type"
        value={active.type ?? ""}
        onChange={(event) => navigate({ type: event.target.value })}
        className={selectClass}
      >
        <option value="">All types</option>
        {options.types.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        name="rarity"
        aria-label="Rarity"
        value={active.rarity ?? ""}
        onChange={(event) => navigate({ rarity: event.target.value })}
        className={selectClass}
      >
        <option value="">All rarities</option>
        {options.rarities.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <label
        className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm text-zinc-700 dark:text-zinc-300"
        title="Alt-art and signature printings are hidden by default"
      >
        <input
          type="checkbox"
          name="printings"
          value="all"
          checked={active.allPrintings ?? false}
          onChange={(event) => navigate({ allPrintings: event.target.checked })}
          className="size-4 accent-zinc-900 dark:accent-zinc-100"
        />
        All printings
      </label>

      {/* Submit target for Enter / no-JS browsers; the selects auto-apply. */}
      <button
        type="submit"
        className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Search
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={clear}
          className="h-9 rounded-md px-3 text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Clear
        </button>
      )}

      <span
        aria-live="polite"
        className={`ml-auto text-sm tabular-nums ${isPending ? "text-zinc-400" : "text-zinc-600 dark:text-zinc-400"}`}
      >
        {isPending ? "Searching…" : `${total.toLocaleString()} ${unit}`}
      </span>
    </form>
  );
}
