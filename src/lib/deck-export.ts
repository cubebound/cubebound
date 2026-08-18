/**
 * Turning a drafted pool into a list other Riftbound tools can read.
 *
 * The target is the plain-text format every builder accepts — one
 * `<quantity> <card name>` per line, no headers — which is what Piltover
 * Archive itself exports ("Export as Text") and what the others parse. There is
 * also an official-ish binary deck code (`Piltover-Archive/RiftboundDeckCodes`,
 * set + collector number encoded as base32), and it is deliberately not used
 * here: it is a dependency and an encoding to get wrong, where the text list is
 * a paste that a human can also read and fix.
 *
 * **The names need reconstructing, and this is the whole reason the feature is
 * not three lines.** Our `cards.name` is normalised per type by the sync:
 * champion units are stored as `Darius, Trifarian` — already the spelling a
 * builder wants — but **a legend stores only its title**, with the champion in
 * its own column: `Daughter of the Void` with `champion` = `Kai'Sa`. Pasting
 * that gives a list where every legend fails to match. So legends are rebuilt
 * as `Kai'Sa, Daughter of the Void`, which is the same rule `aliasesFor` in
 * `import-list.ts` applies in the other direction — so a list exported here
 * also re-imports here.
 */

export interface ExportableCard {
  name: string;
  champion?: string | null;
  type: string;
}

/**
 * Order a decklist reads in: identity first, then the deck, then the pieces
 * that sit outside it. Not `CARD_TYPE_ORDER`, which is the *game's* order and
 * puts Legend last — a decklist opens with the legend.
 */
const EXPORT_TYPE_ORDER = ["Legend", "Unit", "Spell", "Gear", "Battlefield", "Rune"];

function typeRank(type: string): number {
  const i = EXPORT_TYPE_ORDER.indexOf(type);
  return i === -1 ? EXPORT_TYPE_ORDER.length : i;
}

/**
 * Drops a promo variant's suffix: `Battle Mistress (Metal)` → `Battle Mistress`.
 *
 * Thirty-five cards carry one — `(Metal)` on 24, plus `(Starter)`,
 * `(Launch Exclusive)`, `(Ultimate)` and `(GG EZ)` — and they are separate rows
 * with their own ids rather than alt art of a base printing. **Every one of
 * them has a same-named plain card in the pool**, which is what makes stripping
 * safe: the drafter holds the same card, printed differently, and a text list
 * has no way to say which printing anyway (the binary deck code encodes that in
 * a variant suffix on the card code). Left in, every such line fails to import.
 *
 * Only a *trailing* parenthetical is removed. Four cards have parentheses
 * elsewhere in the name and are left alone.
 */
function withoutVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "");
}

/**
 * Puts a legend's champion back on the front of its title.
 *
 * The sync stores a legend as its title alone with the champion in its own
 * column — `Daughter of the Void` / `Kai'Sa` — so anything showing a legend to
 * a person or another tool has to rebuild it. Shared with the Draftmancer
 * export, which needs this half of the rule but not the suffix stripping.
 *
 * The `startsWith` guard matters: champion *units* already carry the champion
 * (`Darius, Trifarian`), so applying the rule blindly would produce
 * `Darius, Darius, Trifarian`.
 */
export function withChampionPrefix(name: string, card: ExportableCard): string {
  const champion = card.champion?.trim();
  if (!champion) return name;
  if (name.toLowerCase().startsWith(`${champion.toLowerCase()},`)) return name;
  if (card.type !== "Legend") return name;
  return `${champion}, ${name}`;
}

/** The card's name as another Riftbound builder expects to read it. */
export function deckListName(card: ExportableCard): string {
  // Stripping first, so a variant legend still gets its champion: the stored
  // `Battle Mistress (Metal)` has to become `Sivir, Battle Mistress`.
  return withChampionPrefix(withoutVariantSuffix(card.name), card);
}

export interface DeckList {
  /** The list itself, ready to paste. Empty string when there is nothing. */
  text: string;
  /** Copies, not lines — a card run three times counts three. */
  count: number;
}

/**
 * Aggregates copies into `<n> <name>` lines.
 *
 * The pool holds each copy separately, keyed by (round, pick), because two
 * copies of one card move between boards independently. A decklist wants them
 * summed, so this is where that collapses.
 */
export function toDeckList(cards: ExportableCard[]): DeckList {
  const counts = new Map<string, { n: number; card: ExportableCard }>();
  for (const card of cards) {
    const name = deckListName(card);
    const seen = counts.get(name);
    if (seen) seen.n += 1;
    else counts.set(name, { n: 1, card });
  }

  const lines = [...counts]
    .sort((a, b) => {
      const byType = typeRank(a[1].card.type) - typeRank(b[1].card.type);
      return byType !== 0 ? byType : a[0].localeCompare(b[0]);
    })
    .map(([name, { n }]) => `${n} ${name}`);

  return {
    text: lines.join("\n"),
    count: [...counts.values()].reduce((sum, entry) => sum + entry.n, 0),
  };
}
