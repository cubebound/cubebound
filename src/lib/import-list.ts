/**
 * Parsing and matching for bulk card-list import.
 *
 * Pure: no database, no request. The caller supplies a catalog of canonical
 * printings, which keeps every rule here directly testable and lets the same
 * code run in the check script and the server action.
 *
 * The guiding rule is that the importer never silently guesses. A name it
 * cannot resolve exactly becomes an unmatched line with suggestions for the
 * user to pick from, and a name that resolves to more than one distinct card
 * becomes an ambiguity — never a coin flip.
 */

import { defaultSectionForType, isCubeSection, type CubeSection } from "@/lib/riftbound";

/** Refuses input beyond this many lines. A cube is a few hundred cards. */
export const MAX_IMPORT_LINES = 500;

/** Matches the per-row cap in the schema, so a parsed quantity can't exceed it. */
export const MAX_LINE_QUANTITY = 99;

/** A canonical printing: the row the importer adds by default. */
export interface CatalogCard {
  id: string;
  name: string;
  type: string;
}

export interface ParsedLine {
  /** 1-based line number in the pasted text, for error reporting. */
  line: number;
  raw: string;
  quantity: number;
  name: string;
  /**
   * The whole line treated as a name, when a quantity prefix was stripped.
   * Lets "1000 Cuts" still resolve if such a card ever ships, rather than
   * silently importing 1000 copies of "Cuts".
   */
  nameWithPrefix?: string;
  /** Set by a section header above this line; null means infer from type. */
  section: CubeSection | null;
}

export interface ParseResult {
  lines: ParsedLine[];
  /** Non-blank, non-comment lines seen before any cap was applied. */
  totalLines: number;
  error?: string;
}

export type Resolution =
  | { status: "matched"; card: CatalogCard }
  | { status: "ambiguous"; candidates: CatalogCard[] }
  | { status: "unmatched"; suggestions: CatalogCard[] };

export interface PreviewRow {
  line: number;
  raw: string;
  quantity: number;
  name: string;
  /** Where it would land: the header's section, else inferred from the type. */
  section: CubeSection | null;
  resolution: Resolution;
}

export interface ImportPreview {
  rows: PreviewRow[];
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  /** Total copies that would be added if committed as previewed. */
  totalCopies: number;
  error?: string;
}

/**
 * Case- and punctuation-shape-insensitive key for exact matching.
 *
 * Deliberately does NOT strip punctuation: "Daisy!" and a hypothetical "Daisy"
 * are different cards, and collapsing them would be exactly the silent guess
 * this importer avoids. It only normalizes characters that differ by keyboard
 * or copy-paste source — smart quotes and dashes — plus case and whitespace.
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ");
}

const SECTION_ALIASES: Record<string, CubeSection> = {
  main: "main",
  maindeck: "main",
  legend: "legends",
  legends: "legends",
  rune: "runes",
  runes: "runes",
  battlefield: "battlefields",
  battlefields: "battlefields",
  sideboard: "sideboard",
  side: "sideboard",
};

/** "Legends:" / "Main:" — a header line, not a card. */
function readSectionHeader(text: string): CubeSection | null {
  if (!text.endsWith(":")) return null;
  const key = text.slice(0, -1).trim().toLowerCase().replace(/\s+/g, "");
  const mapped = SECTION_ALIASES[key];
  if (mapped) return mapped;
  // Tolerate a section name we already know without an alias entry.
  return isCubeSection(key) ? key : null;
}

// A leading count, with or without the "x": "2 Fury Rune", "2x Fury Rune".
// The trailing \s+ is what keeps it from eating a name that starts with digits.
const QUANTITY_PREFIX = /^(\d{1,3})\s*[xX]?\s+(.+)$/;

/**
 * Splits pasted text into card lines.
 *
 * Blank lines and comments (`#`, `//`) are dropped. Section headers switch the
 * target section for everything after them.
 */
export function parseImportList(text: string): ParseResult {
  const rawLines = text.split(/\r?\n/);
  const lines: ParsedLine[] = [];
  let section: CubeSection | null = null;
  let totalLines = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    if (trimmed.length === 0) continue;
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    const header = readSectionHeader(trimmed);
    if (header) {
      section = header;
      continue;
    }

    totalLines++;
    if (lines.length >= MAX_IMPORT_LINES) continue; // keep counting for the message

    const match = QUANTITY_PREFIX.exec(trimmed);
    const quantity = match ? Math.min(Number(match[1]), MAX_LINE_QUANTITY) : 1;
    const name = match ? match[2].trim() : trimmed;

    lines.push({
      line: i + 1,
      raw: trimmed,
      quantity: Math.max(1, quantity),
      name,
      ...(match ? { nameWithPrefix: trimmed } : {}),
      section,
    });
  }

  if (totalLines > MAX_IMPORT_LINES) {
    return {
      lines,
      totalLines,
      error:
        `That list has ${totalLines} card lines; the importer takes at most ` +
        `${MAX_IMPORT_LINES} at a time. Split it up and import in batches.`,
    };
  }

  return { lines, totalLines };
}

/** Levenshtein distance, abandoned once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1; // no cell in this row can still win
    previous = current;
  }
  return previous[b.length];
}

/** Roughly a typo or two, scaled so short names don't match everything. */
function distanceBudget(length: number): number {
  if (length <= 4) return 1;
  if (length <= 12) return 2;
  return 3;
}

export interface CatalogIndex {
  byName: Map<string, CatalogCard[]>;
  cards: CatalogCard[];
}

export function buildCatalogIndex(cards: CatalogCard[]): CatalogIndex {
  const byName = new Map<string, CatalogCard[]>();
  for (const card of cards) {
    const key = normalizeName(card.name);
    const bucket = byName.get(key);
    if (bucket) bucket.push(card);
    else byName.set(key, [card]);
  }
  return { byName, cards };
}

/** Up to `limit` plausible alternatives, prefix matches first. */
export function suggestionsFor(
  name: string,
  index: CatalogIndex,
  limit = 5,
): CatalogCard[] {
  const target = normalizeName(name);
  if (target.length === 0) return [];
  const budget = distanceBudget(target.length);

  const scored: { card: CatalogCard; rank: number; distance: number }[] = [];
  for (const card of index.cards) {
    const candidate = normalizeName(card.name);
    // Rank 0: the typed text is the start of this name ("Ahri" -> "Ahri, …").
    // Rank 1: it appears somewhere inside. Rank 2: it is within a typo or two.
    let rank: number | null = null;
    if (candidate.startsWith(target)) rank = 0;
    else if (candidate.includes(target)) rank = 1;

    const distance = rank === null ? editDistance(target, candidate, budget) : 0;
    if (rank === null && distance <= budget) rank = 2;
    if (rank === null) continue;

    scored.push({ card, rank, distance });
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.distance - b.distance ||
      a.card.name.length - b.card.name.length ||
      a.card.name.localeCompare(b.card.name),
  );
  return scored.slice(0, limit).map((s) => s.card);
}

function resolveName(name: string, index: CatalogIndex): CatalogCard[] {
  return index.byName.get(normalizeName(name)) ?? [];
}

/** Resolves one parsed line against the catalog. */
export function resolveLine(line: ParsedLine, index: CatalogIndex): PreviewRow {
  let quantity = line.quantity;
  let name = line.name;
  let exact = resolveName(name, index);

  // A name that genuinely begins with digits beats the quantity reading.
  if (exact.length === 0 && line.nameWithPrefix) {
    const whole = resolveName(line.nameWithPrefix, index);
    if (whole.length > 0) {
      exact = whole;
      name = line.nameWithPrefix;
      quantity = 1;
    }
  }

  const base = { line: line.line, raw: line.raw, quantity, name };

  if (exact.length === 1) {
    const card = exact[0];
    return {
      ...base,
      section: line.section ?? defaultSectionForType(card.type),
      resolution: { status: "matched", card },
    };
  }

  if (exact.length > 1) {
    return {
      ...base,
      section: line.section,
      resolution: { status: "ambiguous", candidates: exact },
    };
  }

  return {
    ...base,
    section: line.section,
    resolution: { status: "unmatched", suggestions: suggestionsFor(name, index) },
  };
}

/** Full preview for a pasted list. Writes nothing. */
export function previewImport(text: string, catalog: CatalogCard[]): ImportPreview {
  const parsed = parseImportList(text);
  const index = buildCatalogIndex(catalog);
  const rows = parsed.lines.map((line) => resolveLine(line, index));

  let matchedCount = 0;
  let unmatchedCount = 0;
  let ambiguousCount = 0;
  let totalCopies = 0;

  for (const row of rows) {
    if (row.resolution.status === "matched") {
      matchedCount++;
      totalCopies += row.quantity;
    } else if (row.resolution.status === "ambiguous") ambiguousCount++;
    else unmatchedCount++;
  }

  return {
    rows,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    totalCopies,
    ...(parsed.error ? { error: parsed.error } : {}),
  };
}

export interface CommitRow {
  cardId: string;
  section: CubeSection;
  quantity: number;
}

export type MergeResult =
  | { ok: true; rows: CommitRow[]; totalCopies: number }
  | { ok: false; error: string };

/**
 * Validates confirmed rows and collapses duplicates.
 *
 * Collapsing matters for correctness, not tidiness: the same card listed twice
 * would otherwise become two upserts racing on one primary key. Shared by the
 * server action and its check so the rules are tested where they live.
 *
 * @param maxQuantity per (card, section) ceiling, matching the column's cap.
 */
export function mergeImportRows(
  rows: { cardId: string; section: string; quantity: number }[],
  maxQuantity: number,
): MergeResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Nothing to import." };
  }
  if (rows.length > MAX_IMPORT_LINES) {
    return { ok: false, error: `An import can add at most ${MAX_IMPORT_LINES} lines at a time.` };
  }

  const merged = new Map<string, CommitRow>();
  for (const row of rows) {
    const quantity = Math.floor(Number(row?.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      return { ok: false, error: "An import line had an invalid quantity." };
    }
    if (typeof row.cardId !== "string" || row.cardId.length === 0) {
      return { ok: false, error: "An import line was missing its card." };
    }
    if (!isCubeSection(row.section)) {
      return { ok: false, error: "An import line named a section that doesn't exist." };
    }

    const key = `${row.cardId}|${row.section}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, maxQuantity);
    else merged.set(key, { cardId: row.cardId, section: row.section, quantity });
  }

  const result = [...merged.values()];
  return {
    ok: true,
    rows: result,
    totalCopies: result.reduce((sum, row) => sum + row.quantity, 0),
  };
}
