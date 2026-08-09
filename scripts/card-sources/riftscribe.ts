/**
 * RiftScribe adapter — the ACTIVE card source.
 *
 * Open API, no auth. Verified against https://riftscribe.gg/api-docs and
 * /openapi.json (2026-08):
 *
 *   GET /api/cards?limit=200&offset=N  -> CardSummaryRead[] (bare array),
 *       total match count in the `x-total-count` response header, limit <= 200.
 *   GET /api/cards/{id}                -> CardRead: adds description,
 *       flavor_text, keywords, tags, art { image, image_thumb, artist }.
 *
 * List summaries lack rules text / keywords / tags / artist, so we fetch the
 * detail endpoint per card (bounded concurrency to stay polite).
 *
 * Field notes vs our schema:
 *   - ids look like "ogn-001-298" (set-collector-INTERNAL). The trailing
 *     internal id is a RiftScribe DB artifact — we normalize to "OGN-001"
 *     (+ variant suffix) so rows line up with Riot-style ids if/when the
 *     dormant Riot adapter takes over.
 *   - faction is a single lowercase string ("fury", incl. "colorless");
 *     rarity is lowercase; we title-case both.
 *   - stats { energy, might, power } are nullable ints.
 *   - image is a full-res PNG; image_thumb is { small, medium, large } webp —
 *     we store `medium` in image_thumb.
 */

import type { NewCard } from "../../src/db/schema";
import { composeCardId, provisionalBaseId } from "../../src/lib/card-ids";
import {
  buildPowerCost,
  type CardSource,
  fetchWithRetry,
  parseDomains,
  titleCase,
} from "./types";

const PAGE_SIZE = 200;
const DETAIL_CONCURRENCY = 8;

interface RiftScribeThumbs {
  small?: string | null;
  medium?: string | null;
  large?: string | null;
}

interface RiftScribeCardSummary {
  id: string;
  name: string;
  set_id: string;
  collector_number: number;
  variant?: string;
  [key: string]: unknown;
}

interface RiftScribeCard extends RiftScribeCardSummary {
  rarity?: string | null;
  faction?: string | null;
  type?: string | null;
  orientation?: string | null;
  stats?: {
    energy?: number | null;
    might?: number | null;
    power?: number | null;
  } | null;
  image?: string | null;
  image_thumb?: RiftScribeThumbs | null;
  is_banned?: boolean;
  description?: string | null;
  flavor_text?: string | null;
  keywords?: string[];
  tags?: string[];
  art?: {
    image?: string | null;
    image_thumb?: RiftScribeThumbs | null;
    artist?: string | null;
  } | null;
}

/**
 * "ogn-001-298" + variant -> canonical id matching RiftScribe's own short
 * formats and Riot-style ids: base "OGN-001", alt-art "OGN-100a",
 * signature "OGN-301-star", token "UNL-T03".
 */
function normalizeId(card: RiftScribeCardSummary): string {
  return composeCardId(card.set_id, card.collector_number, card.variant);
}

function toRow(card: RiftScribeCard, syncedAt: Date): NewCard {
  const domains = parseDomains(card.faction);
  const id = normalizeId(card);
  return {
    id,
    // Provisional: sync-cards.ts recomputes base_id across the whole pool
    // afterwards, which is the only place reprints can be resolved.
    baseId: provisionalBaseId(id),
    name: card.name,
    setCode: card.set_id.toUpperCase(),
    collectorNo: String(card.collector_number),
    rarity: card.rarity ? titleCase(card.rarity) : "Unknown",
    type: card.type ?? "Unknown",
    // Neither RiftScribe nor Riot expose these yet; see CLAUDE.md.
    supertype: null,
    champion: null,
    domains,
    energyCost: card.stats?.energy ?? null,
    powerCost: buildPowerCost(card.stats?.power, domains),
    might: card.stats?.might ?? null,
    rulesText: card.description ?? null,
    keywords: card.keywords ?? [],
    tags: card.tags ?? [],
    artist: card.art?.artist ?? null,
    imageFull: card.image ?? card.art?.image ?? null,
    imageThumb:
      card.image_thumb?.medium ??
      card.image_thumb?.large ??
      card.image_thumb?.small ??
      null,
    data: { source: "riftscribe", card },
    updatedAt: syncedAt,
  };
}

async function fetchAllSummaries(baseUrl: string): Promise<RiftScribeCardSummary[]> {
  const summaries: RiftScribeCardSummary[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const res = await fetchWithRetry(
      `${baseUrl}/api/cards?limit=${PAGE_SIZE}&offset=${offset}`,
    );
    if (!res.ok) {
      throw new Error(`RiftScribe list request failed: ${res.status} ${res.statusText}`);
    }
    const headerTotal = Number(res.headers.get("x-total-count"));
    if (Number.isFinite(headerTotal)) total = headerTotal;

    const page = (await res.json()) as RiftScribeCardSummary[];
    if (!Array.isArray(page)) {
      throw new Error("Unexpected RiftScribe list response: expected a JSON array");
    }
    summaries.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return summaries;
}

async function fetchDetails(
  baseUrl: string,
  summaries: RiftScribeCardSummary[],
): Promise<RiftScribeCard[]> {
  const results: RiftScribeCard[] = new Array(summaries.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < summaries.length) {
      const index = next++;
      const summary = summaries[index];
      const res = await fetchWithRetry(
        `${baseUrl}/api/cards/${encodeURIComponent(summary.id)}`,
      );
      if (!res.ok) {
        throw new Error(
          `RiftScribe detail request for ${summary.id} failed: ${res.status} ${res.statusText}`,
        );
      }
      results[index] = (await res.json()) as RiftScribeCard;
      done++;
      if (done % 100 === 0) {
        console.log(`  fetched ${done}/${summaries.length} card details...`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, summaries.length) }, worker),
  );
  return results;
}

export function createRiftScribeSource(): CardSource {
  const baseUrl = (process.env.RIFTSCRIBE_BASE_URL ?? "https://riftscribe.gg").replace(
    /\/$/,
    "",
  );
  return {
    name: "riftscribe",
    async fetchCards(syncedAt) {
      console.log(`Listing cards from ${baseUrl}/api/cards ...`);
      const summaries = await fetchAllSummaries(baseUrl);
      console.log(`Found ${summaries.length} cards; fetching details...`);
      const details = await fetchDetails(baseUrl, summaries);

      const byId = new Map<string, NewCard>();
      for (const card of details) {
        const row = toRow(card, syncedAt);
        const existing = byId.get(row.id);
        if (existing) {
          console.warn(
            `Duplicate normalized id ${row.id} (source ids ${(existing.data as { card: RiftScribeCard }).card.id} and ${card.id}); keeping the first.`,
          );
          continue;
        }
        byId.set(row.id, row);
      }
      return { cards: [...byId.values()] };
    },
  };
}
