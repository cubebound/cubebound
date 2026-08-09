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

/** Legends, runes and battlefields have no energy cost; they sort last. */
function costLabel(cost: number | null): string {
  return cost === null ? "—" : String(cost);
}

export default function CubeTable({
  cards,
  onSelect,
  onRemove,
  busyKey,
}: {
  cards: CubeCardRow[];
  onSelect: (card: CubeCardRow) => void;
  /** Omitted for read-only views. */
  onRemove?: (card: CubeCardRow) => void;
  busyKey?: string | null;
}) {
  const columns = new Map<string, Map<string, CubeCardRow[]>>();
  for (const card of cards) {
    const column = columnFor(card);
    if (!columns.has(column)) columns.set(column, new Map());
    const byCost = columns.get(column)!;
    const cost = costLabel(card.energyCost);
    if (!byCost.has(cost)) byCost.set(cost, []);
    byCost.get(cost)!.push(card);
  }

  const present = COLUMN_ORDER.filter((c) => columns.has(c));
  if (present.length === 0) return null;

  // Columns keep a readable minimum and the wrapper scrolls, rather than
  // squeezing names to nothing when the quick-add sidebar sits alongside.
  const gridTemplateColumns = `repeat(${present.length}, minmax(9rem, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-3" style={{ gridTemplateColumns }}>
        {present.map((column) => {
          const byCost = columns.get(column)!;
          const total = [...byCost.values()].reduce((sum, group) => sum + group.length, 0);
          // Numeric costs ascending, the costless group last.
          const costs = [...byCost.keys()].sort((a, b) => {
            if (a === "—") return 1;
            if (b === "—") return -1;
            return Number(a) - Number(b);
          });

          return (
            <section key={column} className="min-w-0">
              <h4 className="mb-1.5 flex items-center gap-1.5 border-b border-zinc-200 pb-1 text-xs font-semibold uppercase tracking-wide dark:border-zinc-800">
                <span
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ backgroundColor: DOMAIN_COLORS[column] ?? "#9aa0a6" }}
                />
                <span className="truncate">{column}</span>
                <span className="ml-auto font-normal tabular-nums text-zinc-500">{total}</span>
              </h4>

              {costs.map((cost) => {
                const group = byCost.get(cost)!;
                return (
                  <div key={cost} className="mb-2">
                    <p className="flex items-baseline gap-1 px-1 text-[11px] text-zinc-500">
                      <span>{cost === "—" ? "No cost" : `Cost ${cost}`}</span>
                      <span className="ml-auto tabular-nums">{group.length}</span>
                    </p>
                    <ul>
                      {group.map((card) => {
                        const key = `${card.id}:${card.section}`;
                        return (
                          <li key={key} className="group flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelect(card)}
                              title={`${card.name} · ${card.type} · ${card.setCode}`}
                              className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              {card.name}
                            </button>
                            {card.might !== null && (
                              <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
                                {card.might}
                              </span>
                            )}
                            {onRemove && (
                              <button
                                type="button"
                                onClick={() => onRemove(card)}
                                disabled={busyKey === key}
                                aria-label={`Remove ${card.name}`}
                                title="Remove from cube"
                                className="shrink-0 rounded px-1 text-xs text-zinc-300 opacity-0 transition hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40 dark:text-zinc-600 dark:hover:text-red-400"
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
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
