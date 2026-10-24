/**
 * Riot gallery adapter — the source for every set except the retired promos.
 *
 * Reads the feed behind Riot's own card gallery (playriftbound.com/card-gallery),
 * served by Riot's public publishing-content API. No key, no auth. This is the
 * upstream Riftcodex and RiftScribe both copied, and it was the only source
 * carrying Radiance when Riftcodex stopped updating in July 2026. It has no
 * promo sets (OPP, PR, JDG), which are retired and owned by no source; their
 * frozen rows are the ones Riftcodex wrote. Ownership per set is
 * enforced in `scripts/sync-cards.ts`, not here.
 *
 *   GET <FEED_URL>  -> { data: GalleryCard[], metadata: { totalItems, ... }, linkdata }
 *
 * **One request, never paged.** Its offset paging is not stable across pages:
 * measured 17 October 2026, three `limit=200` runs each dropped or duplicated
 * up to two cards, and a different two each time. One `limit=2000` request
 * returned the identical 1,408 cards four times in four. If the feed ever
 * outgrows that limit the fetch fails rather than quietly paging.
 *
 * `metadata.totalItems` overstates what is delivered (1,416 against 1,408 on
 * 17 October) and is logged, not trusted.
 */

import type { NewCard } from "../../src/db/schema";
import { provisionalBaseId } from "../../src/lib/card-ids";
import {
  buildPowerCost,
  type CardSource,
  fetchWithRetry,
  richToRulesText,
  titleCase,
} from "./types";

const FEED_LIMIT = 2000;
const FEED_URL =
  "https://content.publishing.riotgames.com/publishing-content/v2.0/public/channel/" +
  `riftbound_website/list/riftbound_gallery_cards?locale=en_US&from=0&limit=${FEED_LIMIT}`;

interface Labelled {
  id?: string | number;
  label?: string;
}

/** The fields we read. Everything else stays in `data` untouched. */
export interface GalleryCard {
  id: string;
  collectorNumber: number;
  name: string;
  subtitle?: string;
  set?: { value?: { id?: string; label?: string } };
  cardType?: { type?: Labelled[]; superType?: Labelled[] };
  rarity?: { value?: Labelled };
  domain?: { values?: Labelled[] };
  cardImage?: { url?: string; accessibilityText?: string };
  illustrator?: { values?: Labelled[] };
  text?: { richText?: { body?: string } };
  effect?: { richText?: { body?: string } };
  energy?: { value?: Labelled };
  power?: { value?: Labelled };
  might?: { value?: Labelled };
  tags?: { tags?: string[] };
  [key: string]: unknown;
}

/**
 * The gallery's id to ours. Ours are the ids every stored row, cube and draft
 * already references, and these rules reproduce them exactly: all 1,171 cards
 * the gallery shares with Riftcodex map to the id Riftcodex gave them.
 *
 *   ogn-119-298        -> OGN-119        (the trailing segment is the set size)
 *   ogn-119a-298       -> OGN-119a       alternate art
 *   sfd-227-star-221   -> SFD-227-star   signature
 *   ven-sp3-006        -> VEN-SP3        special slot (note the set-size tail)
 *   unl-t01            -> UNL-T01        token
 *   rad-r04a           -> RAD-R04a       alt-art rune
 *
 * Anything else returns null, and the fetch fails on it: an id we cannot place
 * is a gap in these rules, not a card to drop.
 */
export function galleryCardId(rawId: string): string | null {
  const numbered = /^([a-z]+)-(\d+)([a-z])?(-star)?-\d+$/.exec(rawId);
  if (numbered) {
    const [, set, num, letter, star] = numbered;
    return `${set.toUpperCase()}-${num.padStart(3, "0")}${letter ?? ""}${star ?? ""}`;
  }
  const special = /^([a-z]+)-([a-z]+)(\d+)([a-z])?(?:-\d+)?$/.exec(rawId);
  if (special) {
    const [, set, kind, num, letter] = special;
    return `${set.toUpperCase()}-${kind.toUpperCase()}${num}${letter ?? ""}`;
  }
  return null;
}

/**
 * Riot's data, corrected where Riot is wrong or blank.
 *
 * **Every entry applies only while the feed still says `from`.** Once Riot
 * fixes a card, the feed says `to`, the entry no longer matches, and the sync
 * logs that it can be deleted. If the feed says something else entirely, the
 * feed wins and the sync warns, because a correction that guesses over a new
 * value would be inventing data. This is "fix the sync, never hand-edit card
 * data" (docs/card-data.md): every row still comes from a sync run.
 *
 * Radiance, measured 17 October 2026, six days before release. Riot's domain
 * is **wrong** on 19 of its base cards and **missing** on 11 more, which also
 * have no type, as do Hunker Down and Rousing Display. Each was settled against
 * the card art: the name banner's colour reads Riot's domain correctly on 155
 * of 160 single-domain Vendetta cards, and on Radiance it agrees with the set's
 * collector-number blocks (Fury 1-23, Calm 24-46, Mind 47-69, Body 70-92,
 * Chaos 93-115, Order 116-138) on all 136 cards it could read, where Riot's own
 * domain disagrees on 19. Clocktower Guardian (RAD-067) is the one to look at:
 * a blue banner and blue power pips, filed by Riot as Fury. The type of each
 * untyped card is the one Riot's own image description gives ("Riftbound
 * Spell: …"). Alt-art and overnumbered printings of these cards were already
 * right and need nothing.
 *
 * A wrong domain is not cosmetic here. Drafts replay against live card data and
 * the bots pick by domain, so a domain that changes under an active draft can
 * break its replay. Storing the right value from the first sync means Riot's
 * eventual fix changes nothing.
 */
interface Correction {
  /** The gallery's raw id. */
  id: string;
  /** For readers of this table and of the sync log; never matched on. */
  name: string;
  type?: { from: string | null; to: string };
  domains?: { from: string[]; to: string[] };
  /** The card's own name, for a misspelling in the feed. */
  title?: { from: string; to: string };
}

export const CORRECTIONS: Correction[] = [
  // Riot's spelling; the printed card reads "Sky Cruiser", as Riftcodex had it.
  { id: "ven-060-166", name: "Sky Cruiser", title: { from: "Sky Crusier", to: "Sky Cruiser" } },

  { id: "rad-001-167", name: "Amateur Demolitionist", domains: { from: ["Chaos"], to: ["Fury"] } },
  { id: "rad-003-167", name: "Bilgewater Tracker", domains: { from: ["Body"], to: ["Fury"] } },
  { id: "rad-004-167", name: "Brawl", domains: { from: ["Chaos"], to: ["Fury"] } },
  { id: "rad-006-167", name: "Scorched Earth", type: { from: null, to: "Spell" }, domains: { from: [], to: ["Fury"] } },
  { id: "rad-009-167", name: "Antagonistic Apparatus", type: { from: null, to: "Unit" }, domains: { from: [], to: ["Fury"] } },
  { id: "rad-012-167", name: "Runeblade Anvil", domains: { from: ["Chaos"], to: ["Fury"] } },
  { id: "rad-016-167", name: "Coalesced Energy", domains: { from: ["Mind"], to: ["Fury"] } },
  { id: "rad-017-167", name: "Detonation Amplifier", domains: { from: ["Chaos"], to: ["Fury"] } },
  { id: "rad-022-167", name: "Whirling Twirligig", type: { from: null, to: "Gear" }, domains: { from: [], to: ["Fury"] } },
  { id: "rad-024-167", name: "Blossoming Dreamroot", domains: { from: ["Chaos"], to: ["Calm"] } },
  { id: "rad-026-167", name: "Entrenched Boar", type: { from: null, to: "Unit" }, domains: { from: [], to: ["Calm"] } },
  { id: "rad-034-167", name: "Hunker Down", type: { from: null, to: "Spell" } },
  { id: "rad-041-167", name: "Hush", type: { from: null, to: "Spell" }, domains: { from: [], to: ["Calm"] } },
  { id: "rad-047-167", name: "Fanfare", type: { from: null, to: "Spell" }, domains: { from: [], to: ["Mind"] } },
  { id: "rad-049-167", name: "Industrious Mechsmith", type: { from: null, to: "Unit" }, domains: { from: [], to: ["Mind"] } },
  { id: "rad-059-167", name: "Supernova", domains: { from: ["Order"], to: ["Mind"] } },
  { id: "rad-062-167", name: "Gravity Field", domains: { from: ["Calm"], to: ["Mind"] } },
  { id: "rad-067-167", name: "Clocktower Guardian", domains: { from: ["Fury"], to: ["Mind"] } },
  { id: "rad-071-167", name: "Nazuman Ntofo", domains: { from: ["Order"], to: ["Body"] } },
  { id: "rad-073-167", name: "Pillaged Armory", domains: { from: ["Calm"], to: ["Body"] } },
  { id: "rad-081-167", name: "Elnuk Herd", domains: { from: ["Fury"], to: ["Body"] } },
  { id: "rad-093-167", name: "Disposal Expert", domains: { from: ["Fury"], to: ["Chaos"] } },
  { id: "rad-102-167", name: "Demon Shade", domains: { from: ["Fury"], to: ["Chaos"] } },
  { id: "rad-104-167", name: "Pitiless Stalker", type: { from: null, to: "Unit" }, domains: { from: [], to: ["Chaos"] } },
  { id: "rad-106-167", name: "The Good Stuff", domains: { from: ["Body"], to: ["Chaos"] } },
  { id: "rad-108-167", name: "Bushwhack Trap", domains: { from: ["Fury"], to: ["Chaos"] } },
  { id: "rad-111-167", name: "Mechanical Bandit", domains: { from: ["Fury"], to: ["Chaos"] } },
  { id: "rad-121-167", name: "One-Two Punch", type: { from: null, to: "Spell" }, domains: { from: [], to: ["Order"] } },
  { id: "rad-123-167", name: "Protector's Shield", type: { from: null, to: "Gear" }, domains: { from: [], to: ["Order"] } },
  { id: "rad-124-167", name: "Burn Away", domains: { from: ["Body"], to: ["Order"] } },
  { id: "rad-127-167", name: "Rousing Display", type: { from: null, to: "Spell" } },
  { id: "rad-134-167", name: "Raucous Anthem", type: { from: null, to: "Spell" }, domains: { from: [], to: ["Order"] } },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One correctable field: the corrected value, plus what the log should say. */
function correct<T>(
  field: { from: T; to: T } | undefined,
  current: T,
  label: string,
  notes: string[],
): T {
  if (!field) return current;
  if (same(current, field.from)) return field.to;
  if (same(current, field.to)) {
    notes.push(`${label}: Riot now agrees (${JSON.stringify(field.to)}); this correction can be deleted`);
  } else {
    notes.push(
      `${label}: Riot changed it to ${JSON.stringify(current)}, expected ${JSON.stringify(field.from)}; ` +
        `the feed's value is used, review the correction`,
    );
  }
  return current;
}

export interface MappedGallery {
  rows: NewCard[];
  /** Every id the feed delivered, skipped cards included: the floor's input. */
  deliveredIds: Set<string>;
  setNames: Map<string, string>;
  /** Cards not written, and why. They land on a later sync once Riot fills them in. */
  skipped: string[];
  /** Correction outcomes worth a line in the log. */
  notes: string[];
}

const label = (l: Labelled | undefined) => (l?.label ? String(l.label) : null);
const numeric = (l: Labelled | undefined) =>
  l?.id === undefined || l.id === null || l.id === "" ? null : Number(l.id);

/**
 * Maps the whole feed. It takes the whole feed rather than one card because a
 * legend's and a signature's champion is resolved against the pool: see
 * `championOf`.
 *
 * Throws on anything that means our rules are wrong (an id shape we cannot
 * place, two cards landing on one id, a set prefix disagreeing with the set);
 * skips, with a reason, anything that means Riot's data is incomplete.
 */
export function mapGalleryCards(cards: GalleryCard[], syncedAt: Date): MappedGallery {
  const corrections = new Map(CORRECTIONS.map((c) => [c.id, c]));
  const notes: string[] = [];
  const skipped: string[] = [];
  const setNames = new Map<string, string>();
  const deliveredIds = new Set<string>();
  const rawIds = new Set<string>();
  const rows = new Map<string, NewCard>();

  // A champion's name is the `name` of its Champion unit ("Master Yi"), which
  // is how a legend's or a signature's tags are told apart from the region and
  // species tags beside them. The subtitle cannot be used for this: 44 of the
  // 60 signatures have none, and OGS-020 Highlander's says "Yi".
  const champions = new Set(
    cards
      .filter((c) => label(c.cardType?.type?.[0]) === "Unit" && label(c.cardType?.superType?.[0]) === "Champion")
      .map((c) => c.name),
  );
  const championOf = (tags: string[]) =>
    tags.length === 1 ? tags[0] : (tags.find((tag) => champions.has(tag)) ?? null);

  for (const card of cards) {
    if (rawIds.has(card.id)) throw new Error(`Riot gallery: duplicate id ${card.id}`);
    rawIds.add(card.id);

    const id = galleryCardId(card.id);
    if (!id) throw new Error(`Riot gallery: unrecognised id shape "${card.id}" (${card.name})`);
    const setCode = id.split("-")[0];
    const feedSet = card.set?.value?.id?.toUpperCase();
    if (feedSet !== setCode) {
      throw new Error(`Riot gallery: ${card.id} is in set "${feedSet}" but its id says ${setCode}`);
    }
    if (rows.has(id) || deliveredIds.has(id)) {
      throw new Error(`Riot gallery: two cards map to ${id} (one is ${card.id})`);
    }
    deliveredIds.add(id);
    if (card.set?.value?.label) setNames.set(setCode, card.set.value.label);

    const types = card.cardType?.type ?? [];
    const supertypes = card.cardType?.superType ?? [];
    if (types.length > 1 || supertypes.length > 1) {
      throw new Error(`Riot gallery: ${card.id} has ${types.length} types and ${supertypes.length} supertypes`);
    }

    const fix = corrections.get(card.id);
    const where = `${id} ${card.name}`;
    const type = correct(fix?.type, label(types[0]), `${where} type`, notes);
    const domains = correct(
      fix?.domains,
      (card.domain?.values ?? []).map((d) => titleCase(String(d.label ?? ""))).filter(Boolean),
      `${where} domains`,
      notes,
    );
    const title = correct(fix?.title, card.name, `${where} name`, notes);

    if (!type) {
      skipped.push(`${where}: no type in the feed`);
      continue;
    }
    // A token is the one card that may legitimately have no domain worth
    // filtering on; anything else without one would match no domain filter
    // and give the draft bots nothing to weigh.
    let supertype = label(supertypes[0]);
    if (domains.length === 0 && supertype !== "Token") {
      skipped.push(`${where}: no domain in the feed`);
      continue;
    }

    // "Champion Unit" is a type plus a supertype (CLAUDE.md, domain model). The
    // gallery also files nine legends as Champion, which would make them render
    // as "Champion Legend"; a legend is identified by its type alone.
    if (type === "Legend" && supertype === "Champion") supertype = null;

    const tags = card.tags?.tags ?? [];
    let name = title;
    let champion: string | null = null;
    if (type === "Unit" && supertype === "Champion") {
      // Champion units print "Ahri, Inquisitive": the champion, then the title.
      // Requiring the Unit type matters: the four OGS legends are Champion with
      // subtitle "Starter", which is a treatment, not a title.
      name = card.subtitle ? `${title}, ${card.subtitle}` : title;
      champion = title;
    } else if (type === "Legend" || supertype === "Signature") {
      // Legends store the title alone with the champion beside it, which is
      // what `withChampionPrefix` and every card page expect.
      champion = championOf(tags);
    }

    const effect = richToRulesText(card.effect?.richText?.body, null);
    const text = richToRulesText(card.text?.richText?.body, null);
    const rulesText = [text, effect].filter(Boolean).join("\n") || null;

    const power = numeric(card.power?.value);
    const artist = (card.illustrator?.values ?? []).map(label).filter(Boolean).join(", ") || null;
    const image = card.cardImage?.url ?? null;

    rows.set(id, {
      id,
      // Provisional: sync-cards.ts recomputes base_id across the whole pool.
      baseId: provisionalBaseId(id),
      name,
      setCode,
      collectorNo: String(card.collectorNumber),
      rarity: label(card.rarity?.value) ? titleCase(label(card.rarity?.value)!) : "Unknown",
      type,
      supertype,
      domains,
      energyCost: numeric(card.energy?.value),
      powerCost: buildPowerCost(power, domains),
      // For gear the feed's `might` is the equip bonus ("+3"), which equals
      // `mightBonus` on 42 of 43 cards. Stored as might it would render as
      // "Might 3" on a sword; it stays in `data` instead.
      might: type === "Gear" ? null : numeric(card.might?.value),
      rulesText,
      keywords: [],
      tags,
      champion,
      artist,
      imageFull: image,
      imageThumb: image,
      data: { source: "riot-gallery", card },
      updatedAt: syncedAt,
    });
  }

  for (const fix of CORRECTIONS) {
    if (!rawIds.has(fix.id)) notes.push(`${fix.id} ${fix.name}: no longer in the feed; review the correction`);
  }

  return { rows: [...rows.values()], deliveredIds, setNames, skipped, notes };
}

export function createRiotGallerySource(): CardSource {
  return {
    name: "riot-gallery",
    async fetchCards(syncedAt) {
      console.log("Fetching Riot's gallery feed ...");
      const res = await fetchWithRetry(FEED_URL);
      if (!res.ok) throw new Error(`Riot gallery request failed: ${res.status} ${res.statusText}`);
      const body = (await res.json()) as { data?: unknown; metadata?: { totalItems?: number } };
      if (!Array.isArray(body.data)) throw new Error('Unexpected Riot gallery response: no "data" array');
      if (body.data.length >= FEED_LIMIT) {
        throw new Error(
          `Riot gallery returned ${body.data.length} cards, the request's whole limit: the feed has ` +
            `outgrown one request. Raise FEED_LIMIT; never page it (see the header).`,
        );
      }
      const total = body.metadata?.totalItems;
      console.log(
        `Fetched ${body.data.length} cards` +
          (total !== undefined && total !== body.data.length ? ` (the feed reports ${total})` : "") +
          ".",
      );

      const mapped = mapGalleryCards(body.data as GalleryCard[], syncedAt);
      for (const line of mapped.skipped) console.warn(`  skipped ${line}`);
      for (const line of mapped.notes) console.warn(`  correction: ${line}`);
      return { cards: mapped.rows, setNames: mapped.setNames, deliveredIds: mapped.deliveredIds };
    },
  };
}
