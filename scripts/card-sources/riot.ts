/**
 * Riot API adapter — DORMANT.
 *
 * riftbound-content-v1 requires app-specific approval; dev keys get 403.
 * Kept ready for when our API application is approved — activate with
 * CARD_SOURCE=riot (requires RIOT_API_KEY, optionally RIOT_API_REGION).
 *
 * Endpoint: GET https://{region}.api.riotgames.com/riftbound/content/v1/contents?locale=en
 * (regional route: americas | asia | europe; auth via X-Riot-Token header).
 *
 * Response shape (per the official riftbound-content-v1 spec):
 *   { game, version, lastUpdated, sets: [{ id, name, cards: [CardDTO] }] }
 *   CardDTO: { id, collectorNumber, set, name, description, type, rarity,
 *              faction, stats: { energy, might, cost, power }, keywords,
 *              tags, flavorText, art: { thumbnailURL, fullURL, artist } }
 *
 * Known deviation from the docs (RiotGames/developer-relations#1093,
 * unresolved): live responses have been observed returning
 * `media: [{ type, url, name }]` instead of the documented `art` object.
 * Both shapes are handled below. Re-verify against a real response when the
 * key is approved.
 */

import type { NewCard } from "../../src/db/schema";
import { provisionalBaseId } from "../../src/lib/card-ids";
import {
  buildPowerCost,
  type CardSource,
  fetchWithRetry,
  parseDomains,
  titleCase,
} from "./types";

interface CardArtDTO {
  thumbnailURL?: string;
  fullURL?: string;
  artist?: string;
}

interface CardMediaDTO {
  type?: string;
  url?: string;
  name?: string;
}

interface CardStatsDTO {
  energy?: number;
  might?: number;
  cost?: number;
  power?: number;
}

interface CardDTO {
  id: string;
  collectorNumber: number;
  set: string;
  name: string;
  description?: string;
  type: string;
  rarity: string;
  faction?: string;
  stats?: CardStatsDTO;
  keywords?: string[];
  tags?: string[];
  flavorText?: string;
  art?: CardArtDTO;
  media?: CardMediaDTO[];
  [key: string]: unknown; // new sets may add fields; kept in `data`
}

interface SetDTO {
  id: string;
  name: string;
  cards: CardDTO[];
}

interface RiftboundContentDTO {
  game: string;
  version: string;
  lastUpdated: string;
  sets: SetDTO[];
}

const VALID_REGIONS = ["americas", "asia", "europe"] as const;

function pickImages(card: CardDTO): {
  full: string | null;
  thumb: string | null;
  artist: string | null;
} {
  if (card.art && (card.art.fullURL || card.art.thumbnailURL)) {
    return {
      full: card.art.fullURL ?? null,
      thumb: card.art.thumbnailURL ?? null,
      artist: card.art.artist ?? null,
    };
  }
  const media = (card.media ?? []).filter((m) => m.url);
  const match = (re: RegExp) =>
    media.find((m) => re.test(m.type ?? "") || re.test(m.name ?? ""))?.url ?? null;
  return {
    full: match(/full|large|card/i) ?? media[0]?.url ?? null,
    thumb: match(/thumb|small/i),
    artist: card.art?.artist ?? null,
  };
}

function toRow(card: CardDTO, set: SetDTO, syncedAt: Date): NewCard {
  const domains = parseDomains(card.faction);
  const images = pickImages(card);
  return {
    id: card.id,
    // Provisional: sync-cards.ts recomputes base_id across the whole pool.
    baseId: provisionalBaseId(card.id),
    name: card.name,
    setCode: card.set || set.id,
    collectorNo: String(card.collectorNumber),
    rarity: card.rarity ? titleCase(card.rarity) : "Unknown",
    type: card.type,
    // Not provided by riftbound-content-v1; see CLAUDE.md.
    supertype: null,
    champion: null,
    domains,
    energyCost: card.stats?.energy ?? null,
    powerCost: buildPowerCost(card.stats?.power, domains),
    might: card.stats?.might ?? null,
    rulesText: card.description ?? null,
    keywords: card.keywords ?? [],
    tags: card.tags ?? [],
    artist: images.artist,
    imageFull: images.full,
    imageThumb: images.thumb,
    data: { source: "riot", card },
    updatedAt: syncedAt,
  };
}

export function createRiotSource(): CardSource {
  return {
    name: "riot",
    async fetchCards(syncedAt) {
      const apiKey = process.env.RIOT_API_KEY;
      if (!apiKey) {
        throw new Error("RIOT_API_KEY is required when CARD_SOURCE=riot");
      }
      const region = process.env.RIOT_API_REGION ?? "americas";
      if (!VALID_REGIONS.includes(region as (typeof VALID_REGIONS)[number])) {
        throw new Error(
          `RIOT_API_REGION must be one of ${VALID_REGIONS.join(", ")}; got "${region}"`,
        );
      }

      const url = `https://${region}.api.riotgames.com/riftbound/content/v1/contents?locale=en`;
      console.log(`Fetching Riftbound content from ${url} ...`);
      const res = await fetchWithRetry(url, { headers: { "X-Riot-Token": apiKey } });
      if (res.status === 403) {
        throw new Error(
          "Riot API returned 403 — riftbound-content-v1 needs app-specific approval; " +
            "dev keys are rejected. Use CARD_SOURCE=riftscribe until our application is approved.",
        );
      }
      if (!res.ok) {
        throw new Error(`Riot API request failed: ${res.status} ${res.statusText}`);
      }

      const content = (await res.json()) as RiftboundContentDTO;
      if (!Array.isArray(content.sets)) {
        throw new Error(
          `Unexpected response shape: missing "sets" array. Keys: ${Object.keys(content).join(", ")}`,
        );
      }
      console.log(
        `Content version ${content.version}, last updated ${content.lastUpdated}, ${content.sets.length} set(s).`,
      );

      const cards: NewCard[] = [];
      const setNames = new Map<string, string>();
      for (const set of content.sets) {
        setNames.set(set.id, set.name);
        for (const card of set.cards) {
          if (!card.id) {
            console.warn(
              `Skipping card without id in set ${set.id} (name: ${card.name ?? "?"})`,
            );
            continue;
          }
          cards.push(toRow(card, set, syncedAt));
        }
      }
      return { cards, setNames };
    },
  };
}
