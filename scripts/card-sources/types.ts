import type { NewCard } from "../../src/db/schema";
import { decodeEntities } from "../../src/lib/rules-text";

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
    /**
     * Every id the source delivered, including cards it chose not to return
     * (incomplete data). When present, the sync refuses to run if a stored id
     * in a set this source owns is missing from it: see `checkFloor` in
     * scripts/sync-cards.ts.
     */
    deliveredIds?: Set<string>;
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

/**
 * Rules text as we store it: a source's rich HTML reduced to plain text that
 * keeps its line structure.
 *
 * Both Riot's gallery and Riftcodex serve the same HTML (Riftcodex copies it).
 * Their `plain` alternatives are not what they look like: built by deleting
 * the tags, so every `<br />` and paragraph break vanished with nothing in its
 * place. Measured on 27 September 2026: 625 of 1,288 cards ran one ability
 * into the next ("resolve.)Give a unit"), 30 lost the options of a "Choose
 * one" list, and 105 still carried HTML codes (`[Empowered][&gt;]`, `&quot;`).
 * The symbol tokens and `[bracket]` markers are in the HTML exactly as in
 * `plain`, so the renderer needs nothing else.
 *
 * Breaks and every block boundary become newlines, a list item becomes a "• "
 * line, any other tag is dropped, and character references are decoded. Falls
 * back to `plain` (decoded) when a card has no rich text.
 */
export function richToRulesText(
  rich: string | null | undefined,
  plain: string | null | undefined,
): string | null {
  const source = rich ?? plain;
  if (!source) return null;
  const text = decodeEntities(
    source
      .replace(/<li\b[^>]*>/gi, "\n• ")
      // Every block boundary is a line boundary, whichever block follows
      // which: `</ul><p>` ends a list as surely as `</p><p>` ends a paragraph.
      .replace(/<br\s*\/?>|<\/?(p|ul|ol|div)\b[^>]*>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
  const cleaned = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  // The upstream writes a literal "[NO TEXT]" on cards that have none: the VEN
  // runes and six OPP promos in Riftcodex, and Radiance's alt-art runes in
  // Riot's own feed. It was shown to readers as rules text.
  return cleaned.length > 0 && cleaned !== "[NO TEXT]" ? cleaned : null;
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
