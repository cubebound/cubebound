/**
 * Rules text from our card sources embeds symbol tokens like `:rb_energy_1:`
 * and `:rb_rune_fury:`. This module turns that into renderable pieces.
 *
 * The full token vocabulary in the current pool is 17 tokens in four families,
 * all confirmed against Riot's published symbol reference:
 *   :rb_energy_0: … :rb_energy_7:   Energy cost (generic; any rune pays it)
 *   :rb_rune_<domain>:              Power cost of that domain
 *   :rb_rune_rainbow:               Wild Power (pays a Power cost of any domain)
 *   :rb_might:                      Might (a unit's combat stat)
 *   :rb_exhaust:                    Exhaust (turn the card sideways to pay)
 *
 * Note the source calls the domain symbols `rune_*`, but they are Power costs,
 * not rune cards: runes are the resource cards you exhaust or recycle to
 * produce Energy and Power. We render and label them as Power.
 *
 * Unrecognized tokens degrade to a readable form rather than leaking raw
 * `:rb_…:` into the UI, so a new set can ship a new symbol without a code
 * change (it just renders as plain text until it's mapped here).
 */

import { titleCase } from "./riftbound";

export type RulesSymbol =
  | { kind: "energy"; value: number; label: string }
  | { kind: "power"; domain: string | null; label: string } // null = Wild Power
  | { kind: "might"; label: string }
  | { kind: "exhaust"; label: string }
  | { kind: "unknown"; token: string; label: string };

export type RulesNode =
  | { type: "text"; value: string }
  | { type: "keyword"; value: string } // a [Bracketed] keyword or reminder marker
  | { type: "arrow"; value: string } // [>] or [>>], the arrow joining a condition to its effect
  | { type: "symbol"; symbol: RulesSymbol };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Turns HTML character references back into characters.
 *
 * The source HTML-escapes its rules text (`[Empowered][&gt;]`, `&quot;When I
 * attack…&quot;`), and 105 cards were shown to readers with the codes printed.
 * The sync decodes on the way in (see `richToRulesText` in the Riftcodex
 * adapter); this is also run at render so a database synced before that fix
 * still reads correctly. Decoding twice is harmless: the decoded text holds no
 * references left to decode, unless a card's text genuinely spells one out,
 * which none does.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      // Out-of-range references are left as written: `fromCodePoint` throws
      // above 0x10FFFF, and this runs on every render of every card's text.
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

const RUNE_DOMAINS = new Set(["fury", "calm", "mind", "body", "chaos", "order"]);

/** Resolves one `:rb_*:` token. Never throws; unknown tokens fall back. */
export function resolveToken(token: string): RulesSymbol {
  const inner = token.slice(1, -1); // strip the surrounding colons

  const energy = /^rb_energy_(\d+)$/.exec(inner);
  if (energy) {
    const value = Number(energy[1]);
    return { kind: "energy", value, label: `${value} Energy` };
  }

  const rune = /^rb_rune_([a-z]+)$/.exec(inner);
  if (rune) {
    const name = rune[1];
    if (name === "rainbow") {
      return { kind: "power", domain: null, label: "Wild Power" };
    }
    if (RUNE_DOMAINS.has(name)) {
      const domain = titleCase(name);
      return { kind: "power", domain, label: `${domain} Power` };
    }
  }

  if (inner === "rb_might") return { kind: "might", label: "Might" };
  if (inner === "rb_exhaust") return { kind: "exhaust", label: "Exhaust" };

  return {
    kind: "unknown",
    token,
    label: titleCase(inner.replace(/^rb_/, "").replace(/_/g, " ")),
  };
}

const SEGMENT = /(:[a-z0-9_]+:)|(\[[^\]]+\])/gi;

/** Splits rules text into plain text, [keyword] markers and symbol tokens. */
export function parseRulesText(raw: string): RulesNode[] {
  const text = decodeEntities(raw);
  const nodes: RulesNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SEGMENT)) {
    const index = match.index;
    if (index > cursor) {
      nodes.push({ type: "text", value: text.slice(cursor, index) });
    }
    if (match[1]) {
      nodes.push({ type: "symbol", symbol: resolveToken(match[1]) });
    } else {
      const inner = match[2].slice(1, -1);
      // `[>]` is not a keyword: it is the pointed tail of the badge before it,
      // which on the printed card joins a condition (`[Empowered]`,
      // `[Level 3]`, `[Reaction]`) to what it grants.
      nodes.push(/^>+$/.test(inner) ? { type: "arrow", value: inner } : { type: "keyword", value: inner });
    }
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push({ type: "text", value: text.slice(cursor) });
  }
  return nodes;
}

/**
 * Flattens rules text to searchable/screen-reader plain text.
 *
 * The card browser's search does the equivalent normalization in SQL (see
 * `rulesSearchText` in src/db/queries/cards.ts) so it can filter in the
 * database; keep the two roughly aligned.
 */
export function rulesTextToPlain(text: string): string {
  return parseRulesText(text)
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "keyword") return node.value;
      if (node.type === "arrow") return ":";
      return ` ${node.symbol.label} `;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
