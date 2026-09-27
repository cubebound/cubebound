/**
 * How often a card is cubed, and what tends to sit beside it.
 *
 * Pure: the arithmetic lives here and the reading lives in
 * `src/db/queries/discovery.ts`, so `check:popularity` can assert every rule
 * against hand-built cubes where the right answer is obvious by inspection.
 * These numbers are a claim the site makes about other people's private cubes,
 * and a percentage that is quietly wrong looks exactly like one that is right.
 *
 * This module imports only `card-ids.ts` and `deck-export.ts`, both of which
 * import nothing, so the check runs without an env file — the same arrangement
 * `check:printings` relies on.
 *
 * **What counts, decided once and not re-argued here:**
 *  - the denominator is *every* cube with at least `STATS_MIN_CARDS` cards,
 *    private and unlisted included, minus hidden cubes and suspended owners
 *  - a cube counts once per card by collapsed identity, whatever the quantity
 *    or printing; the sideboard counts and the maybeboard does not
 *  - tokens and basic runes are not cards anyone chose, so they are out
 *  - a clone is its own cube
 *
 * The reader enforces all of that; this module is handed the result.
 */

import { collapseIdentityKey, nameWithoutTreatment } from "./card-ids";
import { withChampionPrefix } from "./deck-export";

/**
 * The floor a cube has to clear to say anything about the pool.
 *
 * Under fifty cards a "cube" is usually an abandoned first attempt, and at the
 * size this site is today a handful of those would move every percentage on
 * screen. The same reasoning as `SITEMAP_MIN_CARDS`, at a higher bar, because
 * this one is arithmetic rather than a crawl hint.
 */
export const STATS_MIN_CARDS = 50;

/**
 * How many **distinct owners** must be running a card before it gets a page.
 *
 * Distinct owners, not cubes: private cubes are in the denominator, so one
 * person with five copies of their own list must not be able to publish a
 * pairing page about them. Five different people is the point at which a
 * co-occurrence says something about the format rather than about someone.
 */
export const CARD_PAGE_MIN_OWNERS = 5;

/** Fewer shared cubes than this and a pairing is noise, whatever its lift. */
export const MIN_SHARED_CUBES = 3;

/** A page people read, not a data dump. */
export const COMMONLY_CUBED_LIMIT = 25;

/** One qualifying cube, reduced to the set of cards it holds. */
export interface CubeCardSet {
  cubeId: string;
  ownerId: string;
  /** Collapsed identity keys, already deduplicated within the cube. */
  keys: readonly string[];
}

export interface KeyStats {
  /** Cubes holding this card. **Never rendered** — see the percent rule. */
  readonly cubes: number;
  /** Distinct owners of those cubes, which is what the page floor reads. */
  readonly owners: number;
  /** The cubes themselves, so a pairing can be counted without a second read. */
  readonly holders: readonly CubeCardSet[];
}

/**
 * Everything the site knows about how cards are cubed.
 *
 * **Server-only. This must never be passed to a client component.** It carries
 * per-cube card lists for cubes their owners marked private, which is exactly
 * what the anonymity promise on /privacy rules out disclosing — and it holds
 * `Map`s, so React would refuse to serialise it anyway, which is a cheaper
 * failure than the one that matters. `CardPopularityView` is the only shape
 * that crosses to the browser.
 */
export interface PopularitySnapshot {
  /** Cubes in the denominator. */
  readonly total: number;
  readonly byKey: ReadonlyMap<string, KeyStats>;
}

/** The only popularity value a client component ever receives. */
export interface CardPopularityView {
  /** Ready to render: "In 34% of cubes". */
  label: string;
  /** The pairings page, or null when the card is below the owner floor. */
  href: string | null;
}

/** The card fields every helper here needs. `BrowseCard` and `CubeCardRow`
 *  both satisfy it, which is what lets one map serve every surface. */
export interface PopularityCard {
  id: string;
  name: string;
  type: string;
  champion: string | null;
}

/** Reduces the reader's rows to counts. Idempotent and pure. */
export function summarise(sets: readonly CubeCardSet[]): PopularitySnapshot {
  const byKey = new Map<string, { cubes: number; owners: Set<string>; holders: CubeCardSet[] }>();

  for (const set of sets) {
    // Defensive rather than decorative: the reader already aggregates with
    // `array_agg(distinct …)`, but a cube counted twice for one card would
    // inflate a percentage past what the denominator can justify, and that is
    // the one failure this whole module exists to avoid.
    for (const key of new Set(set.keys)) {
      let stats = byKey.get(key);
      if (!stats) {
        stats = { cubes: 0, owners: new Set(), holders: [] };
        byKey.set(key, stats);
      }
      stats.cubes += 1;
      stats.owners.add(set.ownerId);
      stats.holders.push(set);
    }
  }

  return {
    total: sets.length,
    byKey: new Map(
      [...byKey].map(([key, stats]) => [
        key,
        { cubes: stats.cubes, owners: stats.owners.size, holders: stats.holders },
      ]),
    ),
  };
}

/**
 * A share as a whole-number percentage, with both ends told honestly.
 *
 * Percentages only: a cube *count* would disclose how many cubes exist, and on
 * a site this size it would come close to naming whose they are. Two rounding
 * rules matter more than they look:
 *
 *  - a card that really is in some cubes must never read "0%", because that
 *    says "nobody runs this" about a card somebody runs. Under half a percent
 *    it says so in words instead.
 *  - "100%" is a claim that *every* cube runs it, so a 99.6% that rounds up
 *    is held at 99%. Rounding the other way is a rounding error; rounding this
 *    way is a false statement.
 */
export function sharePercent(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  const rounded = Math.round((part / whole) * 100);
  if (rounded === 0) return "under 1%";
  if (rounded >= 100 && part < whole) return "99%";
  return `${rounded}%`;
}

/**
 * The line under a card in the detail modal, or null when there is nothing
 * honest to say — no qualifying cubes at all, or a card nobody has cubed.
 *
 * Silence rather than "In 0% of cubes": a card that has never been picked is
 * not a fact about the card, it is the absence of one.
 */
export function popularityLabel(snapshot: PopularitySnapshot, key: string): string | null {
  if (snapshot.total <= 0) return null;
  const stats = snapshot.byKey.get(key);
  if (!stats || stats.cubes <= 0) return null;
  return `In ${sharePercent(stats.cubes, snapshot.total)} of cubes`;
}

/** Whether a card has enough distinct owners behind it to get its own page. */
export function hasCardPage(snapshot: PopularitySnapshot, key: string): boolean {
  return (snapshot.byKey.get(key)?.owners ?? 0) >= CARD_PAGE_MIN_OWNERS;
}

export interface CommonlyCubed {
  /** The other card's collapsed identity key. */
  key: string;
  /** "70%" — of the cubes running the subject, how many also run this. */
  withPct: string;
  /** "30%" — of every cube, how many run this. Already formatted, so the
   *  never-0%-and-never-a-false-100% rule cannot be reimplemented wrongly at a
   *  call site. */
  overallPct: string;
  /** Whether this card clears the owner floor and can be linked. */
  hasPage: boolean;
}

/**
 * The cards that turn up alongside one card more than they turn up generally.
 *
 * Ranked by **lift** — `(n_AB / n_A) / (n_B / N)` — not by raw co-occurrence.
 * Raw counts would put the same handful of near-universal staples at the top of
 * every card's page, which tells a reader nothing they could not have guessed;
 * lift asks "is this pairing *unusual*", which is the question someone opening
 * this page actually has. Anything at or below 1 turns up no more often beside
 * this card than anywhere else and is dropped rather than shown as a weak hit.
 *
 * `MIN_SHARED_CUBES` is what keeps a single quirky cube from minting a 100%
 * pairing: lift is a ratio, so two cubes agreeing is arithmetically identical
 * to two hundred agreeing.
 *
 * Ties break on shared cubes and then on the key, so the order is total and the
 * page is stable between requests rather than reshuffling on a memo refresh.
 */
export function commonlyCubedWith(
  snapshot: PopularitySnapshot,
  key: string,
  {
    support = MIN_SHARED_CUBES,
    limit = COMMONLY_CUBED_LIMIT,
  }: { support?: number; limit?: number } = {},
): CommonlyCubed[] {
  const subject = snapshot.byKey.get(key);
  if (!subject || subject.cubes <= 0 || snapshot.total <= 0) return [];

  const shared = new Map<string, number>();
  for (const holder of subject.holders) {
    for (const other of holder.keys) {
      // A card is not commonly cubed with itself.
      if (other === key) continue;
      shared.set(other, (shared.get(other) ?? 0) + 1);
    }
  }

  const ranked: { entry: CommonlyCubed; lift: number; together: number }[] = [];
  for (const [other, together] of shared) {
    if (together < support) continue;
    const overall = snapshot.byKey.get(other);
    if (!overall || overall.cubes <= 0) continue;
    const lift = (together / subject.cubes) / (overall.cubes / snapshot.total);
    if (lift <= 1) continue;
    ranked.push({
      lift,
      together,
      entry: {
        key: other,
        withPct: sharePercent(together, subject.cubes),
        overallPct: sharePercent(overall.cubes, snapshot.total),
        hasPage: hasCardPage(snapshot, other),
      },
    });
  }

  ranked.sort(
    (a, b) =>
      b.lift - a.lift ||
      b.together - a.together ||
      (a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0),
  );
  return ranked.slice(0, limit).map((row) => row.entry);
}

/**
 * The client-safe view for a set of cards, keyed by printing id.
 *
 * Keyed by `id` rather than by identity so a component can look up whatever
 * row it is holding — the detail modal opens a *printing*, and every printing
 * of a card shares the card's popularity. Cards with nothing to say are absent
 * rather than present with an empty label, so a call site cannot render a blank
 * line by forgetting to check.
 */
export function popularityForCards(
  snapshot: PopularitySnapshot,
  cards: readonly PopularityCard[],
): Record<string, CardPopularityView> {
  const view: Record<string, CardPopularityView> = {};
  for (const card of cards) {
    if (view[card.id]) continue;
    const key = collapseIdentityKey(card);
    const label = popularityLabel(snapshot, key);
    if (!label) continue;
    view[card.id] = { label, href: hasCardPage(snapshot, key) ? cardPagePath(card) : null };
  }
  return view;
}

/**
 * A card name as a URL segment.
 *
 * Its own rule rather than `slugify` from `src/lib/slug.ts`: that one exists to
 * make a cube's name unique within an owner and is free to change, while this
 * decides a public URL that gets linked and indexed. Apostrophes are dropped
 * rather than turned into a separator, so Kai'Sa is `kaisa` and not `kai-sa`;
 * accents fold to their base letter for the same reason.
 */
export function cardSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Where a card's pairings page lives: `/cards/unit/poro-herder`.
 *
 * Typed by the game's own vocabulary rather than by an opaque id, so the URL
 * reads as what it is and two cards that share a name across types get their
 * own pages. The printing treatment is stripped, because the page is about the
 * card and `nine-tailed-fox-metal` would be a second URL for the same one.
 *
 * **A legend carries its champion.** The sync stores a legend as its title
 * alone (`Nine-Tailed Fox`, champion `Ahri`), so without this the URL and the
 * title would both name something nobody would recognise, and two legends could
 * collide. `withChampionPrefix` is the same rule the exports use, so the page
 * is spelled the way the decklists are. `check:printings` asserts the result is
 * unique across every identity in the pool.
 */
export function cardPagePath(card: Pick<PopularityCard, "name" | "type" | "champion">): string {
  const name = withChampionPrefix(nameWithoutTreatment(card.name), card);
  return `/cards/${cardSlug(card.type)}/${cardSlug(name)}`;
}
