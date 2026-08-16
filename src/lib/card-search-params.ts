import type { CardFilters } from "@/db/queries/cards";
import { CARD_SORTS, type CardSort, ENERGY_BUCKETS } from "@/lib/riftbound";

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Longest filter value we'll act on.
 *
 * Every value here reaches Postgres — the search term as an `ILIKE` pattern
 * against rules text and tags on 1,288 rows. A URL can carry kilobytes, and
 * matching a kilobyte-long pattern row by row is work an anonymous visitor
 * shouldn't be able to ask for. The cube searches already cap at 100; this is
 * the same rule for the card browser, which didn't have one.
 */
const MAX_FILTER_LENGTH = 100;

/**
 * Most values a multi-select filter will act on.
 *
 * The same reasoning one level up: `?domain=` repeated four hundred times is
 * four hundred `@>` clauses OR'd together, from a URL anyone can construct.
 * The real lists are single digits, so this only ever bites abuse. Values are
 * deduplicated first, so a legitimate "tick everything" is never near it.
 */
const MAX_FILTER_VALUES = 24;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim().slice(0, MAX_FILTER_LENGTH) || undefined;
}

/** Repeated params (`?set=OGN&set=VEN`) as a clean, deduplicated list. */
function many(value: string | string[] | undefined): string[] | undefined {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const seen = new Set<string>();
  for (const entry of raw) {
    const trimmed = entry?.trim().slice(0, MAX_FILTER_LENGTH);
    if (trimmed) seen.add(trimmed);
    if (seen.size >= MAX_FILTER_VALUES) break;
  }
  return seen.size > 0 ? [...seen] : undefined;
}

/** Keeps a bad `?sort=` from reaching the ORDER BY builder as a stray branch. */
function sortOf(value: string | undefined): CardSort | undefined {
  return CARD_SORTS.includes(value as CardSort) ? (value as CardSort) : undefined;
}

/**
 * Serializes card filters into a clean querystring (empty values dropped).
 *
 * Lives here rather than beside the filter bar because the pagination server
 * component needs it too, and a `"use client"` module's exports cannot be
 * called from the server.
 *
 * Multi-select filters repeat their key rather than joining with a separator:
 * `?domain=Fury&domain=Calm`. That keeps every URL shared before multi-select
 * existed working unchanged, and it is what a plain HTML form submits, so the
 * no-JS path and the router produce the same URL.
 */
export function cardFilterParams(
  filters: CardFilters,
  extraParams: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", String(filters.q).trim());

  const lists: [string, string[] | undefined][] = [
    ["set", filters.sets],
    ["domain", filters.domains],
    ["rarity", filters.rarities],
    ["energy", filters.energy],
  ];
  for (const [key, values] of lists) {
    for (const value of values ?? []) if (value) params.append(key, value);
  }

  if (filters.type) params.set("type", String(filters.type).trim());
  if (filters.trait) params.set("trait", String(filters.trait).trim());
  // Omitted when it's the default, so the common URL stays clean.
  if (filters.sort && filters.sort !== "set") params.set("sort", filters.sort);
  if (filters.allPrintings) params.set("printings", "all");

  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  return params;
}

/** Reads the shared card filter querystring, used by /cards and the cube editor. */
export function cardFiltersFromParams(params: SearchParams): CardFilters {
  const energy = many(params.energy)?.filter((value) =>
    (ENERGY_BUCKETS as readonly string[]).includes(value),
  );
  return {
    q: one(params.q),
    sets: many(params.set),
    domains: many(params.domain),
    type: one(params.type),
    rarities: many(params.rarity),
    energy: energy?.length ? energy : undefined,
    trait: one(params.trait),
    sort: sortOf(one(params.sort)),
    page: Number(one(params.page)) || 1,
    allPrintings: one(params.printings) === "all",
  };
}
