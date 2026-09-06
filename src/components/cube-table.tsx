"use client";

import { useSyncExternalStore } from "react";

import CardHoverPreview, {
  useCardPreview,
  type PreviewCard,
} from "@/components/card-hover-preview";
import { PowerCost } from "@/components/card-visuals";
import type { CubeCardRow } from "@/db/queries/cubes";
import { ambiguousBaseIds, countCopies, expandCopies } from "@/lib/cube-cards";
import {
  columnKey,
  compareColumns,
  domainDot,
  domainsOfColumn,
} from "@/lib/domain-columns";
import { COLORLESS, DOMAIN_COLORS } from "@/lib/riftbound";


/**
 * How many columns a row may hold, by viewport width.
 *
 * Cube Cobra's behaviour, and the reason it stays readable: columns flex
 * within a tier, and at a threshold the *count* drops rather than the columns
 * continuing to narrow. Three is the floor — below that a column is too thin
 * for a card name to survive at all.
 *
 * Squeezing every column onto one row was the alternative and it does not work
 * here: a cube spanning 18 domain combinations left each column ~63px, which
 * truncated names to about six characters.
 */
const COLUMN_TIERS = [
  { from: 1280, columns: 8 },
  { from: 768, columns: 4 },
  { from: 0, columns: 3 },
] as const;

function maxColumnsFor(width: number): number {
  return COLUMN_TIERS.find((tier) => width >= tier.from)?.columns ?? 3;
}

function subscribeToWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * Read through `useSyncExternalStore` rather than an effect: it keeps the value
 * out of render-time state (which the compiler lint rejects) and gives the
 * server a defined snapshot instead of a hydration mismatch.
 */
function useMaxColumns(): number {
  return useSyncExternalStore(
    subscribeToWidth,
    () => maxColumnsFor(window.innerWidth),
    // Widest tier on the server: desktop is the common case, so this is the
    // layout least likely to visibly correct itself after hydration.
    () => 8,
  );
}

/**
 * Type subgroups inside a domain column, so the main section reads
 * domain → type → cost.
 *
 * Champions are Units and Signature Spells are Spells — for drafting they
 * behave as their base type, and splitting them out would scatter a domain's
 * creatures across two lists. Any type we don't know about (a future set's, or
 * a Legend the owner filed into Main) gets its own subgroup at the end rather
 * than being silently dropped.
 */
const UNIT_TYPES = new Set(["Unit", "Champion Unit"]);
const SPELL_TYPES = new Set(["Spell", "Signature Spell"]);
const SUBGROUP_ORDER = ["Units", "Gear", "Spells"];

function subgroupFor(type: string): string {
  if (UNIT_TYPES.has(type)) return "Units";
  if (type === "Gear") return "Gear";
  if (SPELL_TYPES.has(type)) return "Spells";
  return type;
}

function orderSubgroups(names: string[]): string[] {
  const known = SUBGROUP_ORDER.filter((n) => names.includes(n));
  const rest = names.filter((n) => !SUBGROUP_ORDER.includes(n)).sort();
  return [...known, ...rest];
}

/** Legends, runes and battlefields have no energy cost; they sort last. */
function costLabel(cost: number | null): string {
  return cost === null ? "—" : String(cost);
}

function compareCosts(a: string, b: string): number {
  if (a === "—") return 1;
  if (b === "—") return -1;
  return Number(a) - Number(b);
}

/**
 * One line per copy. A cube running three of a card shows three lines rather
 * than one wearing a "×3", matching the visual view, so each copy can be
 * retargeted on its own.
 *
 * Copies of one printing are interchangeable, so a row carries the printing it
 * belongs to and the remove control takes one copy off it.
 */
interface CopyRow {
  key: string;
  card: CubeCardRow;
  /** Printing id, shown only when a card sits in the cube twice over in
   *  different printings and the names would otherwise be identical. */
  distinguishBy: string | null;
}

function toCopyRows(cards: CubeCardRow[], ambiguous: Set<string>): CopyRow[] {
  return expandCopies(cards)
    .map(({ card, key }) => ({
      key,
      card,
      distinguishBy: ambiguous.has(card.baseId) ? card.id : null,
    }))
    .sort(
      (a, b) =>
        a.card.name.localeCompare(b.card.name) || a.card.id.localeCompare(b.card.id),
    );
}

/**
 * Background for a cost cell: its column's domain, mixed down against
 * `--tint-base` so the same percentage reads as a pale wash in light mode and
 * a dark wash in dark mode, leaving the body text legible either way.
 *
 * Multi-domain gets a diagonal blend of its actual domains rather than a single
 * "multicolour gold" — gold would sit right on top of Order, which is already
 * the yellow domain.
 */
function cellBackground(column: string): string {
  const wash = (color: string) => `color-mix(in srgb, ${color} 16%, var(--tint-base))`;
  const stops = domainsOfColumn(column)
    .map((domain) => DOMAIN_COLORS[domain])
    .filter(Boolean)
    .map(wash);

  if (stops.length === 0) return wash(DOMAIN_COLORS[COLORLESS]);
  if (stops.length === 1) return stops[0];
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

function CostCell({
  cost,
  rows,
  background,
  onSelect,
  onRemove,
  busyKey,
  preview,
}: {
  cost: string;
  rows: CopyRow[];
  background: string;
  onSelect: (card: CubeCardRow) => void;
  onRemove?: (card: CubeCardRow) => void;
  busyKey?: string | null;
  preview: {
    show: (card: PreviewCard, event: { clientX: number; clientY: number }) => void;
    showAt: (card: PreviewCard, element: HTMLElement) => void;
    hide: () => void;
  };
}) {
  const total = rows.length;

  return (
    <div className="mb-1.5 overflow-hidden rounded border border-black/10 dark:border-white/10">
      <p
        className="flex items-baseline gap-1 bg-black/[0.03] px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400"
        title={cost === "—" ? "No energy cost" : `Energy cost ${cost}`}
      >
        <span className="font-medium tabular-nums">{cost}</span>
        <span className="tabular-nums">({total})</span>
      </p>
      <ul style={{ background }}>
        {rows.map((row) => {
          const key = `${row.card.id}:${row.card.section}`;
          return (
            <li key={row.key} className="group flex items-center gap-1 px-1.5">
              <button
                type="button"
                onClick={() => onSelect(row.card)}
                onMouseEnter={(event) => preview.show(row.card, event)}
                onMouseMove={(event) => preview.show(row.card, event)}
                onMouseLeave={preview.hide}
                onFocus={(event) => preview.showAt(row.card, event.currentTarget)}
                onBlur={preview.hide}
                // No `title` here. It used to carry "name · type · id" for
                // names the column truncates, but the browser draws that
                // tooltip near the cursor after a second — landing on top of
                // the hover preview the same gesture just opened, over roughly
                // where the card prints its own name. The preview shows the
                // whole card, so the tooltip was covering better information
                // than it carried. Truncation is visual only: the button's
                // accessible name is still the full text.
                className="min-w-0 flex-1 truncate rounded py-0.5 text-left text-xs text-zinc-900 hover:underline dark:text-zinc-100"
              >
                {row.card.name}
                {row.distinguishBy && (
                  <span className="ml-1 text-[10px] text-black/45 dark:text-white/45">
                    {row.distinguishBy}
                  </span>
                )}
              </button>
              {/* Outside the name button, so the button's accessible name stays
                  the card name, and `shrink-0` so the indicator never
                  compresses — the name absorbs the width through `truncate`. */}
              <PowerCost powerCost={row.card.powerCost} />
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(row.card)}
                  disabled={busyKey === key}
                  aria-label={`Remove one ${row.card.name}`}
                  title="Remove this copy"
                  className="shrink-0 rounded px-0.5 text-xs text-black/25 opacity-0 transition hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 dark:text-white/30 dark:hover:text-red-400"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function CubeTable({
  cards,
  onSelect,
  onRemove,
  busyKey,
  groupByType = false,
}: {
  cards: CubeCardRow[];
  onSelect: (card: CubeCardRow) => void;
  /** Omitted for read-only views. */
  onRemove?: (card: CubeCardRow) => void;
  busyKey?: string | null;
  /** Split each column into Units / Gear / Spells. Only the main section
   *  mixes types; the others are single-type already. */
  groupByType?: boolean;
}) {
  const maxColumns = useMaxColumns();
  const preview = useCardPreview();

  // column -> subgroup -> cost -> cards. Non-main sections use a single
  // unnamed subgroup so the render path stays the same.
  const columns = new Map<string, Map<string, Map<string, CubeCardRow[]>>>();
  for (const card of cards) {
    const column = columnKey(card);
    if (!columns.has(column)) columns.set(column, new Map());
    const bySubgroup = columns.get(column)!;

    const subgroup = groupByType ? subgroupFor(card.type) : "";
    if (!bySubgroup.has(subgroup)) bySubgroup.set(subgroup, new Map());
    const byCost = bySubgroup.get(subgroup)!;

    const cost = costLabel(card.energyCost);
    if (!byCost.has(cost)) byCost.set(cost, []);
    byCost.get(cost)!.push(card);
  }

  const present = [...columns.keys()].sort(compareColumns);
  if (present.length === 0) return null;

  // Only annotate rows with a printing id where the same card sits in the cube
  // under more than one printing; otherwise the names alone are unambiguous.
  const ambiguous = ambiguousBaseIds(cards);

  // Every column fits across the viewport, so the only scrolling is vertical.
  // `minmax(0, 1fr)` is what allows it: the 0 minimum lets a column shrink
  // below its content, and the card names inside truncate. A section with a
  // column per domain *pair* can run to a dozen, and they still share the
  // width rather than pushing the rest off-screen or onto a second row.
  // Columns beyond what a row holds wrap onto the next row and the page scrolls
  // vertically; there is never a horizontal scrollbar, and a column never
  // shrinks below its tier to force everything onto one line.
  const perRow = Math.min(present.length, maxColumns);
  const gridTemplateColumns = `repeat(${perRow}, minmax(0, 1fr))`;
  // Without a ceiling, a section with fewer columns than the tier allows
  // (Battlefields has one) would stretch them across the whole page and stop
  // lining up with the section above it.
  const maxWidth = `${perRow * 11}rem`;

  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns, maxWidth }}>
        {present.map((column) => {
          const bySubgroup = columns.get(column)!;
          const allCards = [...bySubgroup.values()].flatMap((byCost) =>
            [...byCost.values()].flat(),
          );
          const columnTotal = countCopies(allCards);
          const background = cellBackground(column);

          return (
            <section key={column} className="min-w-0">
              <h4 className="mb-1.5 flex items-center gap-1.5 border-b border-zinc-200 pb-1 text-xs font-semibold uppercase tracking-wide dark:border-zinc-800">
                <span
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ background: domainDot(domainsOfColumn(column)) }}
                />
                <span className="truncate">{column}</span>
                <span className="ml-auto font-normal tabular-nums text-zinc-500">
                  {columnTotal}
                </span>
              </h4>

              {orderSubgroups([...bySubgroup.keys()]).map((subgroup) => {
                const byCost = bySubgroup.get(subgroup)!;
                const costs = [...byCost.keys()].sort(compareCosts);
                const subgroupTotal = countCopies([...byCost.values()].flat());

                return (
                  <div key={subgroup || "all"} className="mb-2">
                    {subgroup && (
                      <p className="mb-1 flex items-baseline gap-1 px-0.5 text-[11px] font-medium text-zinc-500">
                        <span>{subgroup}</span>
                        <span className="tabular-nums">({subgroupTotal})</span>
                      </p>
                    )}
                    {costs.map((cost) => (
                      <CostCell
                        key={cost}
                        cost={cost}
                        rows={toCopyRows(byCost.get(cost)!, ambiguous)}
                        background={background}
                        onSelect={onSelect}
                        onRemove={onRemove}
                        busyKey={busyKey}
                        preview={preview}
                      />
                    ))}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <CardHoverPreview target={preview.target} />
    </div>
  );
}
