import type { CardFilters } from "@/db/queries/cards";

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

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim().slice(0, MAX_FILTER_LENGTH) || undefined;
}

/**
 * Serializes card filters into a clean querystring (empty values dropped).
 *
 * Lives here rather than beside the filter bar because the pagination server
 * component needs it too, and a `"use client"` module's exports cannot be
 * called from the server.
 */
export function cardFilterParams(
  filters: CardFilters,
  extraParams: Record<string, string> = {},
): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["q", "set", "domain", "type", "rarity", "trait"] as const) {
    const value = filters[key];
    if (value) params.set(key, String(value).trim());
  }
  if (filters.allPrintings) params.set("printings", "all");
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  return params;
}

/** Reads the shared card filter querystring, used by /cards and the cube editor. */
export function cardFiltersFromParams(params: SearchParams): CardFilters {
  return {
    q: one(params.q),
    set: one(params.set),
    domain: one(params.domain),
    type: one(params.type),
    rarity: one(params.rarity),
    trait: one(params.trait),
    page: Number(one(params.page)) || 1,
    allPrintings: one(params.printings) === "all",
  };
}
