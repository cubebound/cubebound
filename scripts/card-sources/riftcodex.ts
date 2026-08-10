/**
 * Riftcodex adapter — the ACTIVE card source.
 *
 * Replaced RiftScribe because that API cannot express the game: its `faction`
 * is a single string, so every multi-domain card lost a domain — all 180
 * legends included, which made Chaos and Order legends unfindable. It also
 * stopped at 950 cards, missing VEN, OPP, PR and JDG entirely, and left
 * artist, tags and supertype empty.
 *
 * Verified against https://api.riftcodex.com (2026-08):
 *
 *   GET /cards?page=N&size=100  -> { items, total, page, size, pages }
 *       size caps at 100; 422 above that.
 *
 * Card shape:
 *   riftbound_id, name, collector_number, orientation, tags[],
 *   classification { type, supertype, rarity, domain[] },
 *   attributes { energy, might, power },
 *   text { rich, plain, flavour },
 *   set { set_id, label },
 *   media { image_url, artist, accessibility_text },
 *   metadata { alternate_art, signature, overnumbered, clean_name }
 */

import type { NewCard } from "../../src/db/schema";
import { provisionalBaseId } from "../../src/lib/card-ids";
import { type CardSource, fetchWithRetry, titleCase } from "./types";

const PAGE_SIZE = 100;

interface RiftcodexCard {
  riftbound_id: string;
  name: string;
  collector_number: number;
  orientation?: string | null;
  tags?: string[];
  classification?: {
    type?: string | null;
    supertype?: string | null;
    rarity?: string | null;
    domain?: string[] | null;
  } | null;
  attributes?: {
    energy?: number | null;
    might?: number | null;
    power?: number | null;
  } | null;
  text?: { rich?: string | null; plain?: string | null; flavour?: string | null } | null;
  set?: { set_id?: string | null; label?: string | null } | null;
  media?: { image_url?: string | null; artist?: string | null } | null;
  metadata?: {
    alternate_art?: boolean;
    signature?: boolean;
    overnumbered?: boolean;
    updated_on?: string | null;
  } | null;
  [key: string]: unknown;
}

interface CardsPage {
  items: RiftcodexCard[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/**
 * `riftbound_id` is `<set>-<code>[-<setsize>]`. The code carries the variant:
 *   `121`   plain            -> UNL-121
 *   `116a`  alternate art    -> UNL-116a
 *   `229*`  signature        -> UNL-229-star
 *   `126b`  second alt art   -> OPP-126b
 *   `t03`   token            -> SFD-T03
 *   `r06`   / `sp4` special  -> VEN-R06 / VEN-SP4
 * The trailing segment is the set's card count, not part of the identity.
 */
export function riftcodexCardId(riftboundId: string): string | null {
  const parts = String(riftboundId).trim().toLowerCase().split("-");
  if (parts.length < 2) return null;
  const set = parts[0].toUpperCase();
  const code = parts[1];

  const numbered = /^(\d+)(\*|[a-z])?$/.exec(code);
  if (numbered) {
    const num = numbered[1].padStart(3, "0");
    const suffix = numbered[2];
    if (!suffix) return `${set}-${num}`;
    if (suffix === "*") return `${set}-${num}-star`;
    return `${set}-${num}${suffix}`;
  }

  // Tokens and specials have no collector number of their own.
  if (/^[a-z]+\d+$/.test(code)) return `${set}-${code.toUpperCase()}`;
  return null;
}

const VARIANT_SUFFIX =
  /\s*\((Signature|Overnumbered|Alternate Art|Alt Art|Promo|Foil)\)\s*$/i;

/**
 * Riftcodex writes champion cards as "Champion - Title".
 *
 * Riftbound prints champion units as "Champion, Title" but legends as the
 * title alone, with the champion on the type line — so the two are split
 * differently. This reproduces 927 of the 944 names already stored; the
 * remainder differ only in capitalisation or token naming, and Riftcodex is
 * the more accurate of the two in several ("Master Yi, Honed" for our
 * "Yi, Honed").
 */
export function splitCardName(
  rawName: string,
  type: string | null | undefined,
  tags: readonly string[] = [],
): { name: string; champion: string | null } {
  const base = String(rawName).replace(VARIANT_SUFFIX, "").trim();
  const separator = base.indexOf(" - ");
  const isTag = (value: string) =>
    tags.some((tag) => String(tag).toLowerCase() === value.toLowerCase());

  if (separator === -1) {
    // VEN prints champion units as "Akali, Silent" with no separator at all,
    // which used to drop the champion entirely. Treat the leading segment as
    // the champion only when the card's own tags confirm it, so an ordinary
    // comma in a title ("Heisho, Shell of the World") is left alone.
    const comma = base.indexOf(", ");
    if (comma > 0) {
      const candidate = base.slice(0, comma).trim();
      if (isTag(candidate)) return { name: base, champion: candidate };
    }
    return { name: base, champion: null };
  }

  // The prefix is not always just the champion: VEN legends print the whole
  // trait line ("Yordle, Kennen - Heart of the Tempest"). The champion is its
  // last segment; anything before that is a trait, and storing the lot made
  // champion useless for those rows.
  const prefix = base.slice(0, separator).trim();
  const title = base.slice(separator + 3).trim();
  const segments = prefix.split(",").map((part) => part.trim()).filter(Boolean);
  const champion = segments[segments.length - 1] ?? "";

  return {
    champion: champion || null,
    name: type === "Legend" ? title : `${champion}, ${title}`,
  };
}

function toRow(card: RiftcodexCard, syncedAt: Date): NewCard | null {
  const id = riftcodexCardId(card.riftbound_id);
  if (!id) return null;

  const type = card.classification?.type ?? "Unknown";
  const { name, champion } = splitCardName(card.name, type, card.tags ?? []);
  const domains = (card.classification?.domain ?? [])
    .map((domain) => titleCase(String(domain)))
    .filter(Boolean);

  return {
    id,
    // Provisional: sync-cards.ts recomputes base_id across the whole pool.
    baseId: provisionalBaseId(id),
    name,
    setCode: (card.set?.set_id ?? id.split("-")[0]).toUpperCase(),
    collectorNo: String(card.collector_number),
    rarity: card.classification?.rarity ? titleCase(card.classification.rarity) : "Unknown",
    type,
    supertype: card.classification?.supertype ?? null,
    domains,
    energyCost: card.attributes?.energy ?? null,
    powerCost: buildPowerCost(card.attributes?.power, domains),
    might: card.attributes?.might ?? null,
    // `plain` is the same rules text with the markup stripped; keep it, since
    // the symbol tokens live in it and the renderer expects them.
    rulesText: card.text?.plain ?? null,
    keywords: [],
    tags: card.tags ?? [],
    champion,
    artist: card.media?.artist ?? null,
    imageFull: card.media?.image_url ?? null,
    imageThumb: card.media?.image_url ?? null,
    data: { source: "riftcodex", card },
    updatedAt: syncedAt,
  };
}

/**
 * Power is a single integer here too. Attribute it to the card's domain when
 * that is unambiguous, otherwise record it as payable from any domain rather
 * than inventing a split — multi-domain cards do not say which domain the
 * pips belong to.
 */
function buildPowerCost(
  power: number | null | undefined,
  domains: string[],
): Record<string, number> | null {
  if (!power || power <= 0) return null;
  if (domains.length === 1) return { [domains[0].toLowerCase()]: power };
  return { any: power };
}

export function createRiftcodexSource(): CardSource {
  const baseUrl = (process.env.RIFTCODEX_BASE_URL ?? "https://api.riftcodex.com").replace(
    /\/$/,
    "",
  );

  return {
    name: "riftcodex",
    async fetchCards(syncedAt) {
      console.log(`Listing cards from ${baseUrl}/cards ...`);

      const first = await loadPage(baseUrl, 1);
      const items = [...first.items];
      for (let page = 2; page <= first.pages; page++) {
        const next = await loadPage(baseUrl, page);
        items.push(...next.items);
        if (page % 5 === 0) console.log(`  fetched ${items.length}/${first.total}...`);
      }
      console.log(`Fetched ${items.length} of ${first.total} cards.`);

      const setNames = new Map<string, string>();
      const byId = new Map<string, NewCard>();
      const seen = new Map<string, RiftcodexCard>();
      let skipped = 0;
      let duplicates = 0;

      for (const card of items) {
        const row = toRow(card, syncedAt);
        if (!row) {
          skipped++;
          console.warn(`Skipping unparseable id "${card.riftbound_id}" (${card.name})`);
          continue;
        }
        if (card.set?.set_id && card.set.label) {
          setNames.set(card.set.set_id.toUpperCase(), card.set.label);
        }
        // Riftcodex serves some cards twice — the same riftbound_id and image
        // under two records, one a stale draft with no clean_name or
        // tcgplayer_id. Keep whichever was updated most recently rather than
        // whichever arrived first.
        const existing = byId.get(row.id);
        if (existing) {
          duplicates++;
          if (updatedAt(card) <= updatedAt(seen.get(row.id))) continue;
        }
        byId.set(row.id, row);
        seen.set(row.id, card);
      }

      if (skipped > 0) console.warn(`Skipped ${skipped} card(s) with unrecognised ids.`);
      if (duplicates > 0) {
        console.log(`Collapsed ${duplicates} duplicate record(s), keeping the most recent.`);
      }
      return { cards: [...byId.values()], setNames };
    },
  };
}

/** Riftcodex's own last-updated stamp; missing on their stale duplicates. */
function updatedAt(card: RiftcodexCard | undefined): number {
  const raw = (card?.metadata as { updated_on?: string } | undefined)?.updated_on;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function loadPage(baseUrl: string, page: number): Promise<CardsPage> {
  const res = await fetchWithRetry(`${baseUrl}/cards?page=${page}&size=${PAGE_SIZE}`);
  if (!res.ok) {
    throw new Error(`Riftcodex request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as CardsPage;
  if (!Array.isArray(body.items)) {
    throw new Error(`Unexpected response shape: missing "items" array on page ${page}`);
  }
  return body;
}
