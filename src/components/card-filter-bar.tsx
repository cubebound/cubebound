"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// Types only from the query layer — importing a *value* from there pulls
// `src/db/index.ts` in behind it and bundles the postgres driver for the
// browser. See the note on CARD_SORTS in src/lib/riftbound.ts.
import type { CardFilters, FilterOptions } from "@/db/queries/cards";
import { cardFilterParams } from "@/lib/card-search-params";
import {
  CARD_SORT_LABELS,
  CARD_SORTS,
  type CardSort,
  DOMAIN_COLORS,
  ENERGY_BUCKETS,
  ENERGY_BUCKET_LABELS,
} from "@/lib/riftbound";

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

const controlClass =
  "h-9 rounded-md border border-line bg-sunken px-2 text-sm text-ink " +
  "focus:border-line-strong";

const checkboxClass = "size-4 shrink-0 accent-accent-strong";

/**
 * Every filter button is this wide, whatever is selected.
 *
 * Sized to the button, not to its label, because the label changes as you use
 * it: "Sets" measures 65px and "Riftbound Organized Play Promotional Cards"
 * measures 321px. Letting the button grow moved every control to its right and
 * tipped the whole bar onto another row — a 44px vertical jump under the
 * cursor, on a bar that is `sticky` and so always in view. A long name
 * truncates instead, with the full text in a `title` and in the open panel.
 */
const MENU_BUTTON_W = "w-24";

/** Adds or removes one value, always returning a new array. */
function toggle(list: string[] | undefined, value: string, checked: boolean): string[] {
  const next = new Set(list ?? []);
  if (checked) next.add(value);
  else next.delete(value);
  return [...next];
}

/**
 * A dropdown of checkboxes.
 *
 * Built on `<details>` rather than a controlled popover for two reasons: it
 * opens and closes with no React state at all, and it keeps working with
 * JavaScript off — the checkboxes inside carry real `name`/`value` attributes,
 * so the surrounding form submits `?domain=Fury&domain=Calm` on its own. That
 * is the same URL the router produces, so both paths agree.
 *
 * Closing on an outside click is done by setting `open` on the element
 * directly. The alternative — mirroring open state in React — would mean
 * writing state from an effect, which the compiler rightly rejects, to
 * reproduce behaviour the browser already has.
 */
function FilterMenu({
  label,
  summary,
  count,
  children,
  width = "w-64",
}: {
  label: string;
  summary: string;
  count: number;
  children: React.ReactNode;
  /** Width of the open panel. The *button* is always `MENU_BUTTON_W`. */
  width?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      el.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        title={count > 0 ? summary : undefined}
        className={`${controlClass} ${MENU_BUTTON_W} flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden ${
          count > 0 ? "border-line-strong" : ""
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
        {/* Only past one: at a single choice the summary already names it, and
            "Rare 1" reads as a quantity of cards rather than of filters. */}
        {count > 1 && (
          <span className="shrink-0 rounded bg-ink px-1.5 text-xs font-medium text-surface tabular-nums">
            {count}
          </span>
        )}
        <svg viewBox="0 0 12 12" aria-hidden className="size-3 shrink-0 fill-current opacity-60">
          <path d="M2 4.5 6 8.5 10 4.5Z" />
        </svg>
      </summary>
      <div
        className={`absolute left-0 z-30 mt-1 ${width} max-h-80 overflow-y-auto rounded-md border border-line bg-raised p-2 shadow-lg`}
      >
        {children}
      </div>
    </details>
  );
}

/** One checkbox row inside a menu. */
function CheckRow({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={checkboxClass}
      />
      {children}
    </label>
  );
}

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

  const sets = active.sets ?? [];
  const domains = active.domains ?? [];
  const rarities = active.rarities ?? [];
  const energy = active.energy ?? [];

  const hasFilters = Boolean(
    active.q ||
      sets.length ||
      domains.length ||
      rarities.length ||
      energy.length ||
      active.type ||
      active.trait ||
      active.sort ||
      active.allPrintings,
  );

  /**
   * The button's label: the group name when nothing or several are chosen, and
   * the choice itself when exactly one is. Listing two or three would truncate
   * at this width and shift the whole bar as they were ticked, so past one the
   * badge carries the number instead.
   */
  const summarize = (chosen: string[], plural: string, only?: string) =>
    chosen.length === 1 ? (only ?? chosen[0]) : plural;

  return (
    <form
      action={basePath}
      method="GET"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({});
      }}
      className="space-y-2"
    >
      {Object.entries(extraParams).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      {/* Two deliberate rows rather than one that wraps. Measured, the eleven
          controls want 1489px and the bar has 1377, so the single row wrapped —
          and *where* it wrapped moved as labels changed width, which is the
          jitter this fixes. Splitting makes the height a constant; and because
          every control below is now a fixed width whatever is selected, the
          second row's wrap points at narrower viewports no longer depend on
          the filters either. */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search names, rules text and traits…"
          aria-label="Search cards"
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 text-sm text-ink placeholder:text-subtle focus:border-line-strong"
        />

        {/* Submit target for Enter / no-JS browsers; the controls auto-apply. */}
        <button
          type="submit"
          className="h-9 shrink-0 rounded-md bg-ink px-3 text-sm font-medium text-surface hover:bg-ink-hover"
        >
          Search
        </button>

        {/* Fixed width, right-aligned: "Searching…", "960 cards" and "26 cards"
            are three different lengths, and a width that changes on every
            keystroke is what makes a bar feel unsteady. */}
        <span
          aria-live="polite"
          className={`w-24 shrink-0 text-right text-sm tabular-nums ${isPending ? "text-subtle" : "text-muted"}`}
        >
          {isPending ? "Searching…" : `${total.toLocaleString()} ${unit}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Sets carry their printed name as well as the code: "SFD" means nothing
            until you know it is Spiritforged, and the code alone was the filter
            people asked about most. */}
        <FilterMenu
          label="Sets"
          summary={summarize(
            sets,
            "Sets",
            options.sets.find((s) => s.code === sets[0])?.label,
          )}
          count={sets.length}
          width="w-72"
        >
          {options.sets.map((set) => (
            <CheckRow
              key={set.code}
              name="set"
              value={set.code}
              checked={sets.includes(set.code)}
              onChange={(checked) => navigate({ sets: toggle(sets, set.code, checked) })}
            >
              <span className="min-w-0 flex-1 truncate">{set.label}</span>
              <span className="shrink-0 font-mono text-xs text-subtle">{set.code}</span>
            </CheckRow>
          ))}
        </FilterMenu>

        <FilterMenu
          label="Domains"
          summary={summarize(domains, "Domains")}
          count={domains.length}
          width="w-56"
        >
          {options.domains.map((domain) => (
            <CheckRow
              key={domain}
              name="domain"
              value={domain}
              checked={domains.includes(domain)}
              onChange={(checked) => navigate({ domains: toggle(domains, domain, checked) })}
            >
              {/* The colour is the fast way to read this list — the names are
                  Riftbound's, not colours, so "Body" says nothing about orange. */}
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                style={{ backgroundColor: DOMAIN_COLORS[domain] ?? "transparent" }}
              />
              {domain}
            </CheckRow>
          ))}
        </FilterMenu>

        {/* Chips rather than rows: eleven buckets read as a scale laid out in a
            grid, and a cost filter is something you tick several of at once. */}
        <FilterMenu
          label="Energy cost"
          summary={summarize(energy, "Energy")}
          count={energy.length}
          width="w-64"
        >
          <div className="grid grid-cols-4 gap-1">
            {ENERGY_BUCKETS.map((bucket) => {
              const checked = energy.includes(bucket);
              return (
                <label
                  key={bucket}
                  className={`flex h-8 cursor-pointer items-center justify-center rounded border text-sm tabular-nums ${
                    checked
                      ? "border-ink bg-ink font-medium text-surface"
                      : "border-line hover:bg-hover"
                  } ${bucket === "none" ? "col-span-2" : ""}`}
                >
                  <input
                    type="checkbox"
                    name="energy"
                    value={bucket}
                    checked={checked}
                    onChange={(event) =>
                      navigate({ energy: toggle(energy, bucket, event.target.checked) })
                    }
                    className="sr-only"
                  />
                  {ENERGY_BUCKET_LABELS[bucket] ?? bucket}
                </label>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-xs text-subtle">
            “None” is legends, runes and battlefields, which have no energy cost
            at all.
          </p>
        </FilterMenu>

        <FilterMenu
          label="Rarities"
          summary={summarize(rarities, "Rarity")}
          count={rarities.length}
          width="w-52"
        >
          {options.rarities.map((rarity) => (
            <CheckRow
              key={rarity}
              name="rarity"
              value={rarity}
              checked={rarities.includes(rarity)}
              onChange={(checked) => navigate({ rarities: toggle(rarities, rarity, checked) })}
            >
              {rarity}
            </CheckRow>
          ))}
        </FilterMenu>

        <select
          name="type"
          aria-label="Card type"
          value={active.type ?? ""}
          onChange={(event) => navigate({ type: event.target.value })}
          className={controlClass}
        >
          <option value="">All types</option>
          {options.types.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        {/* Grouped: a flat list of 127 traits, 95 of them champion names, is one
            nobody can find "Pirate" in. Regions lead because they are how people
            describe a cube's theme. */}
        <select
          name="trait"
          aria-label="Trait"
          value={active.trait ?? ""}
          onChange={(event) => navigate({ trait: event.target.value })}
          className={controlClass}
        >
          <option value="">All traits</option>
          {options.traits.regions.length > 0 && (
            <optgroup label="Regions">
              {options.traits.regions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </optgroup>
          )}
          {options.traits.traits.length > 0 && (
            <optgroup label="Traits">
              {options.traits.traits.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </optgroup>
          )}
          {options.traits.champions.length > 0 && (
            <optgroup label="Champions">
              {options.traits.champions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <select
          name="sort"
          aria-label="Sort by"
          value={active.sort ?? "set"}
          onChange={(event) => navigate({ sort: event.target.value as CardSort })}
          className={controlClass}
        >
          {CARD_SORTS.map((value) => (
            <option key={value} value={value}>
              {CARD_SORT_LABELS[value]}
            </option>
          ))}
        </select>

        <label
          className="flex h-9 cursor-pointer items-center gap-2 px-1 text-sm text-muted"
          title="Alt-art and signature printings are hidden by default"
        >
          <input
            type="checkbox"
            name="printings"
            value="all"
            checked={active.allPrintings ?? false}
            onChange={(event) => navigate({ allPrintings: event.target.checked })}
            className={checkboxClass}
          />
          All printings
        </label>

          {/* Always occupies its slot. Rendering it only when there are filters
              made the row reflow the moment you ticked the first box — every
              control to its left jumped as a new button appeared. */}
          <button
            type="button"
            onClick={clear}
            disabled={!hasFilters}
            aria-hidden={!hasFilters}
            tabIndex={hasFilters ? undefined : -1}
            className={`h-9 rounded-md px-3 text-sm underline-offset-4 ${
              hasFilters ? "text-muted hover:underline" : "invisible"
            }`}
          >
            Clear
          </button>
      </div>
    </form>
  );
}
