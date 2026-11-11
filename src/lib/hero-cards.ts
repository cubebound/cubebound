import { createRng } from "@/lib/draft/rng";

/**
 * Which three cards the home page's hero shows today.
 *
 * Pure, so the same day and the same candidates always give the same answer:
 * nothing is stored, and every instance agrees without talking to another.
 *
 * **Each card gets its own score from `(day, id)`, and the lowest scores win.**
 * A shuffle of the whole list was the first idea and is the wrong shape: the
 * candidates are the twenty most-cubed cards, that set shifts when the hourly
 * popularity snapshot refreshes, and one card entering or leaving reshuffles
 * every position, so the hero would change mid-day. With a score per card, a
 * card that drops out of the twenty only matters if it was one of the three
 * shown, and a newcomer only matters if it happens to outrank them.
 */

export interface HeroCandidate {
  id: string;
  domains: readonly string[];
}

/** The UTC calendar day, which is what the pick is keyed on. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function pickHeroCards<T extends HeroCandidate>(
  candidates: readonly T[],
  day: string,
  count = 3,
): T[] {
  const ranked = candidates
    .map((card) => ({ card, score: createRng("home-hero", day, card.id).next() }))
    .sort((a, b) => a.score - b.score || (a.card.id < b.card.id ? -1 : 1))
    .map((entry) => entry.card);

  // First pass: no two picks share a domain, so the fan shows three colours.
  // A multi-domain card claims every domain it has.
  const picked: T[] = [];
  const claimed = new Set<string>();
  for (const card of ranked) {
    if (picked.length === count) break;
    const domains = card.domains.map((domain) => domain.toLowerCase());
    if (domains.length === 0 || domains.some((domain) => claimed.has(domain))) continue;
    for (const domain of domains) claimed.add(domain);
    picked.push(card);
  }

  // Second pass, only when the candidates cannot supply three distinct
  // domains: three cards beat an empty slot.
  for (const card of ranked) {
    if (picked.length === count) break;
    if (!picked.includes(card)) picked.push(card);
  }

  return picked;
}
