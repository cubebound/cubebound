/**
 * Turning stored cube rows into the individual copies the UI shows.
 *
 * `cube_cards` stores a quantity per (card, section) because two copies of the
 * same printing are genuinely identical — there is nothing to tell them apart.
 * The interface shows each copy as its own entry anyway, so a cube running
 * three of a card reads as three entries you can retarget one at a time,
 * rather than one entry wearing a "×3".
 *
 * "Change this copy's printing" therefore means "move one copy from printing A
 * to printing B", which is exactly what the per-copy actions do.
 */

export interface CopyOf<T> {
  card: T;
  /** 1-based position among the copies of this card in this section. */
  copyNumber: number;
  /** Stable within a render; copies of one printing are interchangeable. */
  key: string;
}

/** Total copies in a set of rows, not the number of rows. */
export function countCopies(cards: { quantity: number }[]): number {
  return cards.reduce((sum, card) => sum + card.quantity, 0);
}

/** Expands each stored row into one entry per copy. */
export function expandCopies<T extends { id: string; section: string; quantity: number }>(
  rows: T[],
): CopyOf<T>[] {
  const copies: CopyOf<T>[] = [];
  for (const row of rows) {
    for (let n = 1; n <= row.quantity; n++) {
      copies.push({ card: row, copyNumber: n, key: `${row.id}:${row.section}:${n}` });
    }
  }
  return copies;
}

/**
 * Card ids that appear in more than one printing within the same section, so
 * the text view can disambiguate rows that would otherwise be identical names.
 */
export function ambiguousBaseIds<T extends { baseId: string; id: string; section: string }>(
  rows: T[],
): Set<string> {
  const printingsPerBase = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.baseId}:${row.section}`;
    const seen = printingsPerBase.get(key) ?? new Set<string>();
    seen.add(row.id);
    printingsPerBase.set(key, seen);
  }
  const ambiguous = new Set<string>();
  for (const [key, printings] of printingsPerBase) {
    if (printings.size > 1) ambiguous.add(key.split(":")[0]);
  }
  return ambiguous;
}
