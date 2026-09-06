"use client";

import { useEffect, useRef, useState } from "react";

import {
  addCardAction,
  quickSearchAction,
  type QuickAddResult,
} from "@/app/cube/actions";
import { DomainDots, EnergyChip } from "@/components/card-visuals";
import {
  CUBE_SECTIONS,
  CUBE_SECTION_LABELS,
  aspectRatio,
  type CubeSection,
} from "@/lib/riftbound";

/** Debounce for the type-ahead; long enough to skip most intermediate keystrokes. */
const SEARCH_DEBOUNCE_MS = 220;

interface Props {
  cubeId: string;
  /** Copies of each printing already in the cube, by card id. */
  inCube: Record<string, number>;
}

/**
 * Rapid-add panel: type a name, pick a printing and section if you want, add,
 * keep typing. It never navigates, so consecutive adds cost one keystroke run
 * and one click each. The page behind it revalidates so the cube list stays
 * in step.
 */
function QuickAddPanel({ cubeId, inCube, onClose }: Props & { onClose?: () => void }) {
  const [query, setQuery] = useState("");
  // Results carry the term they answer, so "is a search in flight" is derived
  // rather than another piece of state to keep in sync.
  const [answered, setAnswered] = useState<{ term: string; items: QuickAddResult[] }>({
    term: "",
    items: [],
  });
  const [counts, setCounts] = useState(inCube);
  const [chosen, setChosen] = useState<Record<string, { printingId: string; section: CubeSection }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Server-side counts can change under us after a revalidate; keep in step.
  const [synced, setSynced] = useState(inCube);
  if (synced !== inCube) {
    setSynced(inCube);
    setCounts(inCube);
  }

  // The panel is mounted only while open, so "on mount" is "on open": the
  // point of a quick-add is that opening it costs one click and you are
  // already typing. It is also the right thing for the dialog it sits in —
  // opening a modal should move focus into it.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const term = query.trim();
  const longEnough = term.length >= 2;
  const searching = longEnough && answered.term !== term;
  // Keep the previous matches on screen while the next search runs, so the
  // list doesn't blink empty between keystrokes.
  const results = longEnough ? answered.items : [];

  useEffect(() => {
    const current = query.trim();
    if (current.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await quickSearchAction(cubeId, current);
      if (cancelled) return;
      if (response.error) {
        setError(response.error);
        setAnswered({ term: current, items: [] });
        return;
      }
      setError(null);
      setAnswered({ term: current, items: response.results });
      setCounts(response.inCube);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, cubeId]);

  // The row resolves which printing and section it is showing; add takes them
  // rather than re-deriving, so the button always does what the row says.
  async function add(result: QuickAddResult, printingId: string, section: CubeSection) {
    setBusyId(printingId);
    setError(null);
    const response = await addCardAction(cubeId, printingId, section);
    setBusyId(null);
    if (response.error) {
      setError(response.error);
      return;
    }

    setCounts((prev) => ({ ...prev, [printingId]: (prev[printingId] ?? 0) + 1 }));
    setLastAdded(`${result.card.name} → ${CUBE_SECTION_LABELS[section]}`);
    // Leave the query in place but selected, so the next name replaces it
    // without reaching for the mouse.
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <h2 className="text-sm font-semibold">Quick add</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close quick add"
            className="rounded-md px-2 text-xl leading-none text-subtle hover:bg-hover"
          >
            ×
          </button>
        )}
      </div>

      <div className="border-b border-line p-3">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Card name…"
          aria-label="Search card names"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-line bg-sunken px-3 text-sm placeholder:text-subtle focus:border-line-strong"
        />
        <p aria-live="polite" className="mt-1.5 min-h-4 text-xs text-subtle">
          {error ? (
            <span className="text-red-600 dark:text-red-400">{error}</span>
          ) : searching ? (
            "Searching…"
          ) : lastAdded ? (
            `Added ${lastAdded}`
          ) : (
            "Type at least two letters."
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {results.length === 0 && longEnough && !searching && (
          <p className="p-3 text-sm text-subtle">No cards match.</p>
        )}
        <ul className="divide-y divide-line">
          {results.map((result) => {
            const choice = chosen[result.card.baseId];
            // Default to the printing already in the cube, so adding again
            // adds to that one rather than silently starting a second printing.
            const heldPrinting = result.printings
              .filter((p) => (counts[p.id] ?? 0) > 0)
              .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
            const printingId = choice?.printingId ?? heldPrinting?.id ?? result.card.id;
            const section = choice?.section ?? result.defaultSection;
            const printing =
              result.printings.find((p) => p.id === printingId) ?? result.card;
            const held = counts[printingId] ?? 0;
            const busy = busyId === printingId;

            const setChoice = (patch: Partial<{ printingId: string; section: CubeSection }>) =>
              setChosen((prev) => ({
                ...prev,
                [result.card.baseId]: { printingId, section, ...patch },
              }));

            return (
              <li key={result.card.baseId} className="flex gap-2.5 p-2.5">
                <div
                  className="w-12 shrink-0 self-start overflow-hidden rounded bg-sunken"
                  style={{ aspectRatio: aspectRatio(printing.type) }}
                >
                  {printing.imageThumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={printing.imageThumb}
                      alt={printing.name}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <DomainDots domains={printing.domains} />
                    <span className="truncate text-sm font-medium">{printing.name}</span>
                    <span className="ml-auto shrink-0">
                      <EnergyChip energy={printing.energyCost} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-subtle">
                    {printing.type} · {printing.setCode}
                  </p>

                  {/* Two fixed rows rather than a wrapping one: with a
                      printing select in play the row wrapped on some cards and
                      not others, so Add moved around between neighbours. */}
                  <div className="mt-1.5 flex items-center gap-1">
                    <select
                      aria-label={`Section for ${printing.name}`}
                      value={section}
                      onChange={(event) =>
                        setChoice({ section: event.target.value as CubeSection })
                      }
                      className="h-7 min-w-0 flex-1 rounded border border-line bg-sunken px-1 text-[11px]"
                    >
                      {CUBE_SECTIONS.map((value) => (
                        <option key={value} value={value}>
                          {CUBE_SECTION_LABELS[value]}
                        </option>
                      ))}
                    </select>

                    {result.printings.length > 1 && (
                      <select
                        aria-label={`Printing for ${printing.name}`}
                        value={printingId}
                        onChange={(event) => setChoice({ printingId: event.target.value })}
                        className="h-7 min-w-0 flex-1 rounded border border-line bg-sunken px-1 text-[11px]"
                      >
                        {result.printings.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.id}
                            {option.id === option.baseId ? " (base)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1">
                    {held > 0 && (
                      <span
                        title={`${held} in this cube`}
                        className="shrink-0 rounded bg-sunken px-1 text-[10px] font-medium tabular-nums text-muted"
                      >
                        ×{held}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => add(result, printingId, section)}
                      title={held > 0 ? "Add another copy" : "Add to the cube"}
                      className="ml-auto h-7 rounded bg-ink px-2.5 text-[11px] font-medium text-surface hover:bg-ink-hover disabled:opacity-60"
                    >
                      {busy ? "…" : held > 0 ? "Add another" : "Add"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Opened on demand, never docked.
 *
 * It used to hold a permanent 20rem column on desktop, which taxed every visit
 * to the cube for a panel you only want while adding. Now the cube list gets
 * the full width and this slides in over it: a right-hand drawer at desktop
 * widths, a bottom sheet on small screens.
 */
export default function QuickAdd(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Floating so it stays reachable part-way down a long cube list. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-30 rounded-full bg-ink px-5 py-3 text-sm font-medium text-surface shadow-lg hover:bg-ink-hover"
      >
        Quick add
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/60 lg:items-stretch lg:justify-end"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Quick add"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="h-[80vh] w-full rounded-t-xl bg-raised lg:h-full lg:w-[22rem] lg:rounded-none lg:border-l lg:border-line"
          >
            <QuickAddPanel {...props} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
