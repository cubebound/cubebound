/**
 * How cards are bucketed and ordered by domain.
 *
 * Shared by the text view's columns and the visual view's default sort so the
 * two agree on what "sorted by colour" means — they used to be the text view's
 * private business, and a second definition would drift.
 *
 * A card gets a column per domain *combination*, not one shared "Multi"
 * bucket: nearly every legend has two domains, so a single bucket would
 * swallow most of them and say nothing.
 */

import { COLORLESS, DOMAINS, DOMAIN_COLORS, totalPips } from "@/lib/riftbound";

export function sortDomains(domains: string[]): string[] {
  return [...domains].sort(
    (a, b) => DOMAINS.indexOf(a as never) - DOMAINS.indexOf(b as never),
  );
}

/** "Fury", "Fury/Chaos", or Colorless. */
export function columnKey(card: { domains: string[] }): string {
  if (card.domains.length === 0) return COLORLESS;
  return sortDomains(card.domains).join("/");
}

export function domainsOfColumn(column: string): string[] {
  return column === COLORLESS ? [] : column.split("/");
}

/**
 * Single domains in the game's order, then Colorless, then the pairs — each
 * ordered by its own domains, so Fury/… come before Calm/… .
 */
function columnRank(column: string): number[] {
  if (column === COLORLESS) return [1];
  const domains = domainsOfColumn(column).map((d) => DOMAINS.indexOf(d as never));
  return [domains.length === 1 ? 0 : 2, ...domains];
}

export function compareColumns(a: string, b: string): number {
  const left = columnRank(a);
  const right = columnRank(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? -1) - (right[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

/**
 * What a card costs, for ordering: energy when it has one, otherwise its total
 * power pips, and null when it has neither.
 *
 * Legends, runes and battlefields have no cost at all — they are not "zero
 * cost", they are off this scale entirely, so they group separately rather
 * than sorting to the front.
 */
export function displayCost(card: {
  energyCost: number | null;
  powerCost: Record<string, number> | null;
}): number | null {
  if (card.energyCost !== null && card.energyCost !== undefined) return card.energyCost;
  const total = totalPips(card.powerCost);
  return total > 0 ? total : null;
}

/**
 * The visual view's default order: domain, then cost, with the costless cards
 * kept together at the end instead of scattered through every colour.
 */
export function compareForDisplay(
  a: { domains: string[]; name: string; energyCost: number | null; powerCost: Record<string, number> | null },
  b: { domains: string[]; name: string; energyCost: number | null; powerCost: Record<string, number> | null },
): number {
  const costA = displayCost(a);
  const costB = displayCost(b);
  if ((costA === null) !== (costB === null)) return costA === null ? 1 : -1;

  const byColumn = compareColumns(columnKey(a), columnKey(b));
  if (byColumn !== 0) return byColumn;

  if (costA !== null && costB !== null && costA !== costB) return costA - costB;
  return a.name.localeCompare(b.name);
}

/**
 * The little colour dot that stands for a card's domains.
 *
 * A hard split rather than a blend for multi-domain: at 10px a blend is mud,
 * and it has to stay legible next to the single-domain dots it sits beside.
 */
export function domainDot(domains: readonly string[]): string {
  const colors = domains
    .map((domain) => DOMAIN_COLORS[domain])
    .filter(Boolean);
  if (colors.length === 0) return DOMAIN_COLORS[COLORLESS];
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const bands = colors.map((color, i) => `${color} ${i * step}% ${(i + 1) * step}%`);
  return `linear-gradient(135deg, ${bands.join(", ")})`;
}
