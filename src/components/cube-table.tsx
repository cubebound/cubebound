"use client";

import type { CubeCardRow } from "@/db/queries/cubes";
import { COLORLESS, DOMAINS, DOMAIN_COLORS } from "@/lib/riftbound";

/** Cards with more than one domain get their own column rather than being
 *  filed under an arbitrary one. */
const MULTI = "Multi";

const COLUMN_ORDER = [...DOMAINS, COLORLESS, MULTI];

function columnFor(card: CubeCardRow): string {
  if (card.domains.length === 0) return COLORLESS;
  if (card.domains.length > 1) return MULTI;
  return card.domains[0];
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
 * A card as one line, however many printings of it the cube holds. Art variants
 * are indistinguishable once they're just text, so two printings of the same
 * card collapse to one row with a count.
 */
interface MergedRow {
  baseId: string;
  name: string;
  /** Canonical printing — what the detail modal opens. */
  card: CubeCardRow;
  /** Canonical first; removing takes from the end so the base survives. */
  printings: CubeCardRow[];
  quantity: number;
}

function mergePrintings(cards: CubeCardRow[]): MergedRow[] {
  const rows = new Map<string, MergedRow>();
  for (const card of cards) {
    const existing = rows.get(card.baseId);
    if (existing) {
      existing.printings.push(card);
      existing.quantity += card.quantity;
      continue;
    }
    rows.set(card.baseId, {
      baseId: card.baseId,
      name: card.name,
      card,
      printings: [card],
      quantity: card.quantity,
    });
  }

  for (const row of rows.values()) {
    row.printings.sort((a, b) => {
      const canonical = Number(b.id === b.baseId) - Number(a.id === a.baseId);
      return canonical !== 0 ? canonical : a.id.localeCompare(b.id);
    });
    row.card = row.printings[0];
  }

  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
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
function cellBackground(column: string, domains: string[]): string {
  const wash = (color: string) => `color-mix(in srgb, ${color} 16%, var(--tint-base))`;

  if (column !== MULTI) {
    return wash(DOMAIN_COLORS[column] ?? DOMAIN_COLORS[COLORLESS]);
  }
  const stops = domains
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
}: {
  cost: string;
  rows: MergedRow[];
  background: string;
  onSelect: (card: CubeCardRow) => void;
  onRemove?: (card: CubeCardRow) => void;
  busyKey?: string | null;
}) {
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);

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
          // Removing takes the last printing, so the base printing outlives
          // its variants and one click never drops two cards.
          const target = row.printings[row.printings.length - 1];
          const key = `${target.id}:${target.section}`;
          return (
            <li key={row.baseId} className="group flex items-center gap-1 px-1.5">
              <button
                type="button"
                onClick={() => onSelect(row.card)}
                title={`${row.name} · ${row.card.type} · ${row.card.setCode}`}
                className="min-w-0 flex-1 truncate rounded py-0.5 text-left text-xs text-zinc-900 hover:underline dark:text-zinc-100"
              >
                {row.name}
              </button>
              {row.quantity > 1 && (
                <span
                  title={`${row.quantity} printings in this cube`}
                  className="shrink-0 rounded bg-black/10 px-1 text-[10px] font-medium tabular-nums text-zinc-700 dark:bg-white/15 dark:text-zinc-200"
                >
                  ×{row.quantity}
                </span>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(target)}
                  disabled={busyKey === key}
                  aria-label={
                    row.quantity > 1
                      ? `Remove one printing of ${row.name}`
                      : `Remove ${row.name}`
                  }
                  title={
                    row.quantity > 1
                      ? `Remove one printing (${row.quantity} in cube)`
                      : "Remove from cube"
                  }
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
  // column -> subgroup -> cost -> cards. Non-main sections use a single
  // unnamed subgroup so the render path stays the same.
  const columns = new Map<string, Map<string, Map<string, CubeCardRow[]>>>();
  for (const card of cards) {
    const column = columnFor(card);
    if (!columns.has(column)) columns.set(column, new Map());
    const bySubgroup = columns.get(column)!;

    const subgroup = groupByType ? subgroupFor(card.type) : "";
    if (!bySubgroup.has(subgroup)) bySubgroup.set(subgroup, new Map());
    const byCost = bySubgroup.get(subgroup)!;

    const cost = costLabel(card.energyCost);
    if (!byCost.has(cost)) byCost.set(cost, []);
    byCost.get(cost)!.push(card);
  }

  const present = COLUMN_ORDER.filter((column) => columns.has(column));
  if (present.length === 0) return null;

  // Columns keep a readable minimum and the wrapper scrolls rather than
  // squeezing names to nothing. The maximum matters as much: without it a
  // single-domain section (Legends, Battlefields) would stretch one column
  // across the whole page and stop lining up with the section above it.
  // 11rem keeps all seven domain columns on screen next to the quick-add
  // sidebar at desktop widths, while still capping single-column sections.
  const gridTemplateColumns = `repeat(${present.length}, minmax(8.5rem, 11rem))`;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-3" style={{ gridTemplateColumns }}>
        {present.map((column) => {
          const bySubgroup = columns.get(column)!;
          const allCards = [...bySubgroup.values()].flatMap((byCost) =>
            [...byCost.values()].flat(),
          );
          const columnTotal = allCards.reduce((sum, card) => sum + card.quantity, 0);
          // Multi columns blend the domains actually present in them.
          const multiDomains = [
            ...new Set(allCards.flatMap((card) => card.domains)),
          ].sort((a, b) => DOMAINS.indexOf(a as never) - DOMAINS.indexOf(b as never));
          const background = cellBackground(column, multiDomains);

          return (
            <section key={column} className="min-w-0">
              <h4 className="mb-1.5 flex items-center gap-1.5 border-b border-zinc-200 pb-1 text-xs font-semibold uppercase tracking-wide dark:border-zinc-800">
                <span
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{
                    background:
                      column === MULTI && multiDomains.length > 1
                        ? `linear-gradient(135deg, ${multiDomains.map((d) => DOMAIN_COLORS[d]).join(", ")})`
                        : (DOMAIN_COLORS[column] ?? DOMAIN_COLORS[COLORLESS]),
                  }}
                />
                <span className="truncate">{column}</span>
                <span className="ml-auto font-normal tabular-nums text-zinc-500">
                  {columnTotal}
                </span>
              </h4>

              {orderSubgroups([...bySubgroup.keys()]).map((subgroup) => {
                const byCost = bySubgroup.get(subgroup)!;
                const costs = [...byCost.keys()].sort(compareCosts);
                const subgroupTotal = [...byCost.values()]
                  .flat()
                  .reduce((sum, card) => sum + card.quantity, 0);

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
                        rows={mergePrintings(byCost.get(cost)!)}
                        background={background}
                        onSelect={onSelect}
                        onRemove={onRemove}
                        busyKey={busyKey}
                      />
                    ))}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
