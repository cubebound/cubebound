/**
 * Card id composition and the base-printing rule.
 *
 * Ids are Riot-style: `OGN-001` base, `OGN-100a` alt art, `OGN-301-star`
 * signature, `UNL-T03` token. Tokens are not cards; see `isTokenCard`.
 *
 * `cards.base_id` is the id of the CANONICAL printing of a card — the row the
 * browser shows when printings are collapsed.
 *
 * This cannot be derived from an id string. Sets reprint cards in their
 * high-numbered showcase slots, both within a set (`SFD-049` reprinted as
 * `SFD-224`) and across sets (`OGN-013` "Pouty Poro" reprinted as `UNL-220`),
 * and nothing in `UNL-220` reveals that it is the same card as `OGN-013`. So
 * the canonical printing is resolved from the card data — see `assignBaseIds`,
 * which mirrors the recompute SQL in scripts/sync-cards.ts.
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
 * A card's name with a trailing printing treatment removed.
 *
 * The sources spell some treatments in the name rather than the id: "Nine-Tailed
 * Fox (Metal)", "Teemo, Scout (GG EZ)". Identity being (name, type), each of
 * those became its own canonical printing and showed up as a second entry in
 * the collapsed browser.
 *
 * **Only a trailing parenthetical.** Riftcodex named four distinct tokens
 * `Recruit (271) // Buff`, `Sprite (274) // Buff` and so on, a parenthetical
 * mid-name, and a looser match would merge cards the game keeps apart. Riot's
 * gallery no longer spells them that way, so `check:printings` asserts the
 * rule on those names directly.
 *
 * Mirrors the `regexp_replace` inside `collapseKey` in
 * src/db/queries/cards.ts; `check:printings` asserts the two agree on every
 * row. It lives here rather than beside that query because this module imports
 * nothing — see the note on scripts/lib/env.ts.
 */
export function nameWithoutTreatment(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

/** How the card browser groups printings: the stripped name plus the type. */
export function collapseIdentityKey(card: Pick<PrintingLike, "name" | "type">): string {
  return `${nameWithoutTreatment(card.name).toLowerCase()}|${card.type}`;
}

/**
 * A token's id: `UNL-T01`, `SFD-T03`. An ordinary id is `SET-NNN`, and `T` is
 * not a digit, so no real card can match. The suffix grammar is the ordinary
 * one (`a`, `-star`), so a future alt-art token is caught too.
 *
 * A string rather than a `RegExp` because the SQL half binds it as a parameter
 * (`tokenCard` in src/db/queries/cards.ts): one source for both definitions.
 */
export const TOKEN_ID_PATTERN = "^[A-Z]+-T[0-9]+([a-z]|-[a-z]+)?$";
const TOKEN_ID = new RegExp(TOKEN_ID_PATTERN);

/**
 * Whether a row is a token (Recruit, Sprite, Gold…) rather than a card.
 *
 * **Both halves are needed.** Tokens from Riot's gallery and Riftcodex carry
 * `supertype = 'Token'`, but production once held six (`UNL-T01` to
 * `UNL-T07`) from the retired riftscribe source with a null supertype, which a
 * supertype-only rule let through while every check on dev passed. A source
 * can write a null supertype again; the id half costs nothing. A card merely *named* after a
 * token ("Recruit the Vanguard") is neither, and stays.
 *
 * Mirrors `tokenCard` in src/db/queries/cards.ts. `check:printings` asserts
 * this agrees with the same expression in SQL on every row, and
 * `check:card-filters` and `check:import` that what the queries return leaves
 * out exactly the rows this names.
 */
export function isTokenCard(card: { id: string; supertype: string | null }): boolean {
  return card.supertype === "Token" || TOKEN_ID.test(card.id);
}

/**
 * The promo sets the site no longer offers: organized-play, general and judge
 * promos. Retired in October 2026 when Riot's gallery feed became the only card
 * source, because it carries none of them.
 *
 * **Every one is an alternate printing of a card a main set carries**, checked
 * against all 133 OPP records the old source held, so retiring them removes no
 * card. Their rows stay in `cards`: drafts store card ids in `drafts.packs` and
 * replay against live rows, and 130 production drafts had dealt one. Nothing
 * offers them any more (browser, search, filters, import, starter lists,
 * picker, card pages, add paths), but anything reading by id still resolves
 * them. A one-off script moved every cube off them on 17 October 2026
 * (docs/card-data.md).
 *
 * A string list rather than a `Set` because the SQL half binds it as a
 * parameter (`retiredPrinting` in src/db/queries/cards.ts).
 */
export const RETIRED_SETS: readonly string[] = ["OPP", "PR", "JDG"];
const RETIRED = new Set(RETIRED_SETS);

/** Whether a row is a printing from a retired promo set. */
export function isRetiredPrinting(card: { setCode: string }): boolean {
  return RETIRED.has(card.setCode.toUpperCase());
}

/** Whether a row is a card the site still hands out: not a token, not retired. */
export function isOfferedCard(card: { id: string; supertype: string | null; setCode: string }): boolean {
  return !isTokenCard(card) && !isRetiredPrinting(card);
}

/**
 * The offered printing each retired printing is replaced by, in cubes.
 *
 * The same card (`collapseIdentityKey`, so "Prodigal Explorer (Metal)" finds
 * "Prodigal Explorer"), and among its offered printings **the one with the same
 * art if there is one**, otherwise the one the browser shows for the card.
 * Three promos in production cubes carried art no main printing has except a
 * Vendetta showcase reprint (OPP-120 Rengar is VEN-179's art), and moving those
 * to the main printing would have changed what 32 cube entries look like.
 * Preferring the representative among same-art printings keeps every other
 * promo on the main printing rather than an odd special-slot reprint.
 *
 * Retired rows with no offered printing of their card are left out of the
 * map; the caller decides whether that is fatal.
 */
export function retiredPrintingTargets<
  T extends PrintingLike & { supertype: string | null; imageFull: string | null },
>(pool: T[]): Map<string, T> {
  const art = (url: string | null) => (url ?? "").split("?")[0];
  const offeredByKey = new Map<string, T[]>();
  for (const card of pool) {
    if (!isOfferedCard(card)) continue;
    const key = collapseIdentityKey(card);
    const group = offeredByKey.get(key);
    if (group) group.push(card);
    else offeredByKey.set(key, [card]);
  }
  for (const group of offeredByKey.values()) group.sort(compareRepresentatives);

  const targets = new Map<string, T>();
  for (const card of pool) {
    if (!isRetiredPrinting(card)) continue;
    const offered = offeredByKey.get(collapseIdentityKey(card));
    if (!offered) continue;
    const sameArt = card.imageFull ? offered.find((o) => art(o.imageFull) === art(card.imageFull)) : undefined;
    targets.set(card.id, sameArt ?? offered[0]);
  }
  return targets;
}

/**
 * The browser's representative order within one card: a plainly-named
 * printing first, then `comparePrintings`. Mirrors `canonicalFirst` in
 * src/db/queries/cards.ts.
 */
function compareRepresentatives(a: PrintingLike, b: PrintingLike): number {
  const treated = (c: PrintingLike) => Number(nameWithoutTreatment(c.name) !== c.name.trim());
  return treated(a) - treated(b) || comparePrintings(a, b);
}

/**
 * The treatment of one printing in words — "Signature", "Metal", "Alt art" —
 * or null when it is an ordinary printing.
 *
 * Two printings of a card routinely agree on set, collector number and rarity,
 * so nothing in the line the card detail modal used to render told them apart.
 * The discriminator lives in two different places depending on the treatment:
 * the source spells some of them in the *name* ("Nine-Tailed Fox (Metal)") and
 * leaves the rest to the *id* suffix (`OGN-303-star`, `OGN-066a`). This reads
 * both, name first, because a name that says "GG EZ" is more use to a reader
 * than the `b` its id happens to carry.
 *
 * Purely descriptive: no grouping decision reads this. The rule that collapses
 * printings is `collapseKey` in src/db/queries/cards.ts.
 */
export function printingTreatment(card: Pick<PrintingLike, "id" | "name">): string | null {
  const named = /\(([^()]+)\)\s*$/.exec(card.name);
  if (named) return named[1].trim();
  if (/-star$/.test(card.id)) return "Signature";
  // A letter glued to the collector number, never the `-star` above nor a
  // token / promo id like `UNL-T01` or `VEN-SP3`, which end in a digit.
  if (/-\d+[a-z]$/.test(card.id)) return "Alt art";
  return null;
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
 *   1. an offered printing before a retired promo (`RETIRED_SETS`),
 *   2. a real printing before a Showcase reprint,
 *   3. earliest set code,
 *   4. lowest collector number (numerically),
 *   5. plain id before its `a` / `-star` variants.
 *
 * Rule 1 is why promos stopped reaching cubes. Without it "OPP" sorted before
 * "SFD", "UNL" and "VEN" under rule 3, the promo became the canonical printing
 * of 65 cards, and import, starter lists and the browser handed it out: 887
 * production cube copies before October 2026. Every group in the current pool
 * has at least one non-Showcase printing, so rule 2 decides most of the rest;
 * the others are tie-breakers that only need to be deterministic and stable.
 *
 * Mirrored by the recompute SQL in scripts/sync-cards.ts, which is what keeps
 * stored `base_id` current; `check:printings` asserts the two agree.
 */
function comparePrintings(a: PrintingLike, b: PrintingLike): number {
  const retired = Number(isRetiredPrinting(a)) - Number(isRetiredPrinting(b));
  if (retired !== 0) return retired;
  const showcase = Number(a.rarity === "Showcase") - Number(b.rarity === "Showcase");
  if (showcase !== 0) return showcase;
  if (a.setCode !== b.setCode) return a.setCode < b.setCode ? -1 : 1;
  const lengths = a.collectorNo.length - b.collectorNo.length;
  if (lengths !== 0) return lengths;
  if (a.collectorNo !== b.collectorNo) return a.collectorNo < b.collectorNo ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Maps every printing to the id of its canonical printing. Mirrors the
 * recompute SQL every sync runs in `scripts/sync-cards.ts` (which superseded
 * the backfill in `drizzle/0003_base_id_print_groups.sql`); the mismatch check
 * in `scripts/check-printings.mts` asserts stored `base_id` agrees across the
 * whole pool.
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
