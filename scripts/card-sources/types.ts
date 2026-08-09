import type { NewCard } from "../../src/db/schema";

/**
 * A card data source. Adapters fetch from their API and return cards already
 * mapped into our normalized `cards` row shape, with the raw source payload
 * stored as `data: { source: "<name>", card: <raw> }`.
 */
export interface CardSource {
  readonly name: string;
  /** Optional set-code -> display-name map used to label per-set counts. */
  fetchCards(syncedAt: Date): Promise<{
    cards: NewCard[];
    setNames?: Map<string, string>;
  }>;
}

/** "fury" / "FURY" -> "Fury" (domains and card types are proper nouns in UI). */
export { titleCase } from "../../src/lib/riftbound";
import { titleCase } from "../../src/lib/riftbound";

/** Sources report faction as a single string; split defensively in case
 *  multi-domain cards arrive as "fury/calm" or "Fury, Calm". */
export function parseDomains(faction: string | null | undefined): string[] {
  if (!faction) return [];
  return faction
    .split(/\s*[/,+&]\s*/)
    .map((d) => titleCase(d.trim()))
    .filter(Boolean);
}

/** Sources report power as a single int, not per-domain pips. For
 *  single-domain cards attribute it to that domain; otherwise keep it under
 *  "any" so nothing is invented. Raw stats stay in `data`. */
export function buildPowerCost(
  power: number | null | undefined,
  domains: string[],
): Record<string, number> | null {
  if (!power || power <= 0) return null;
  if (domains.length === 1) return { [domains[0].toLowerCase()]: power };
  return { any: power };
}

/** Retrying fetch for sync use: waits out 429s and retries transient 5xx. */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  attempts = 3,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
      console.warn(
        `${res.status} from ${url}; retrying in ${retryAfter}s (attempt ${attempt}/${attempts})`,
      );
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    return res;
  }
}
