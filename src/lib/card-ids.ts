/**
 * Card id composition and the base-printing rule.
 *
 * Ids are Riot-style: `OGN-001` base, `OGN-100a` alt art, `OGN-301-star`
 * signature, `UNL-T03` token.
 *
 * `cards.base_id` is the id of the CANONICAL printing of a card — the row the
 * browser shows when printings are collapsed.
 *
 * This cannot be derived from an id string. Sets reprint cards in their
 * high-numbered showcase slots, both within a set (`SFD-049` reprinted as
 * `SFD-224`) and across sets (`OGN-013` "Pouty Poro" reprinted as `UNL-220`),
 * and nothing in `UNL-220` reveals that it is the same card as `OGN-013`. So
 * the canonical printing is resolved from the card data — see `assignBaseIds`,
 * which mirrors the SQL in the migration that backfills the column.
 *
 * Identity is (name, type), verified safe against the whole pool: no
 * (name, type) group disagrees on domains, energy, might or power cost, and no
 * name spans two types. Using the name is also what keeps the token-collision
 * case correct — `UNL-T01` "Baron Pit" and `UNL-001` "Arena Kingpin" share a
 * collector number but are different cards, and different names never group.
 * (Two printings of the *same* token, `SFD-T03` and `UNL-T05` "Gold", do group,
 * which is right: it's one card printed twice.)
 */

/**
 * The within-collector-number sibling: strips a trailing single letter
 * (`OGN-100a`) or `-word` suffix (`OGN-301-star`).
 *
 * Sync adapters use this as a provisional `base_id` for freshly inserted rows;
 * the pool-wide recompute at the end of a sync then sets the real value. It is
 * still the right answer whenever a card has only one collector number.
 */
export function provisionalBaseId(id: string): string {
  const letterVariant = /^(.+-\d+)[a-z]$/.exec(id);
  if (letterVariant) return letterVariant[1];
  const wordVariant = /^(.+-\d+)-[a-z]+$/.exec(id);
  if (wordVariant) return wordVariant[1];
  return id;
}

/**
 * Builds a canonical id from a source's set / collector number / variant.
 * Variant discriminators seen so far: "" base, "a" alt art, "star" signature,
 * "tNN" token.
 */
export function composeCardId(
  setCode: string,
  collectorNumber: number | string,
  variant: string | null | undefined,
): string {
  const set = setCode.toUpperCase();
  const num = String(collectorNumber).padStart(3, "0");
  const suffix = (variant ?? "").trim();
  if (!suffix) return `${set}-${num}`;
  if (/^[a-z]$/i.test(suffix)) return `${set}-${num}${suffix.toLowerCase()}`;
  if (/^t\d+$/i.test(suffix)) return `${set}-${suffix.toUpperCase()}`;
  return `${set}-${num}-${suffix.toLowerCase()}`;
}

export interface PrintingLike {
  id: string;
  name: string;
  type: string;
  setCode: string;
  collectorNo: string;
  rarity: string;
}

/** Two printings are the same card when name and type agree. */
export function cardIdentityKey(card: Pick<PrintingLike, "name" | "type">): string {
  return `${card.name.trim().toLowerCase()}|${card.type}`;
}

/**
 * Orders printings so the canonical one sorts first:
 *   1. a real printing before a Showcase reprint,
 *   2. earliest set code,
 *   3. lowest collector number (numerically),
 *   4. plain id before its `a` / `-star` variants.
 *
 * Every group in the current pool has at least one non-Showcase printing, so
 * rule 1 decides most of them; the rest are tie-breakers that only need to be
 * deterministic and stable.
 */
function comparePrintings(a: PrintingLike, b: PrintingLike): number {
  const showcase = Number(a.rarity === "Showcase") - Number(b.rarity === "Showcase");
  if (showcase !== 0) return showcase;
  if (a.setCode !== b.setCode) return a.setCode < b.setCode ? -1 : 1;
  const lengths = a.collectorNo.length - b.collectorNo.length;
  if (lengths !== 0) return lengths;
  if (a.collectorNo !== b.collectorNo) return a.collectorNo < b.collectorNo ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Maps every printing to the id of its canonical printing. Mirrors the SQL in
 * `drizzle/0003_base_id_print_groups.sql`; the mismatch check in
 * `scripts/check-printings.mts` asserts the two agree across the whole pool.
 */
export function assignBaseIds<T extends PrintingLike>(cards: T[]): Map<string, string> {
  const groups = new Map<string, T[]>();
  for (const card of cards) {
    const key = cardIdentityKey(card);
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }

  const baseIds = new Map<string, string>();
  for (const group of groups.values()) {
    const canonical = [...group].sort(comparePrintings)[0];
    for (const card of group) baseIds.set(card.id, canonical.id);
  }
  return baseIds;
}
