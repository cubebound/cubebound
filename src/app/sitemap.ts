import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getCardIdentities } from "@/db/queries/cards";
import { getCardPopularity, listPublicCubesForSitemap } from "@/db/queries/discovery";
import { cardPagesFor } from "@/lib/card-popularity";
import { resolveSiteUrl } from "@/lib/site-url";

/** Cap the crawl. Well past the current cube count, and a ceiling means this
 *  never becomes a query that scans the whole table as the site grows. */
const MAX_CUBES = 2000;

/**
 * The static pages, every eligible card page, and every **public** cube and its
 * owner.
 *
 * Public only by construction, so unlisted and private cubes cannot reach this
 * list even by mistake. Profiles come from the cubes rather than from the user
 * table, so an account with nothing public isn't advertised either — and a
 * sitemap is the one place a soft leak would be indexed and cached forever.
 *
 * The card pages are the one entry here computed partly from *private* cubes.
 * They disclose nothing a visitor could not already read on the page, and the
 * page's own owner floor is what decides which exist — see card-popularity.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = resolveSiteUrl(await headers());

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/explore`, changeFrequency: "daily", priority: 0.8 },
    { url: `${site}/cards`, changeFrequency: "weekly", priority: 0.7 },
    // The only page that explains the format rather than serving the tool, so
    // it is the one a search engine can understand the site by.
    {
      url: `${site}/guides/riftbound-cube-drafting`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    { url: `${site}/guides/draftmancer`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let cubes: Awaited<ReturnType<typeof listPublicCubesForSitemap>> = [];
  try {
    cubes = await listPublicCubesForSitemap(MAX_CUBES);
  } catch {
    // A sitemap that 500s is worse than a short one: crawlers back off from the
    // whole site. Serve the static pages and try again next crawl.
    return staticPages;
  }

  const owners = new Map<string, Date>();
  for (const cube of cubes) {
    const seen = owners.get(cube.ownerUsername);
    if (!seen || cube.updatedAt > seen) owners.set(cube.ownerUsername, cube.updatedAt);
  }

  // Card pages, in their own try/catch rather than the one above. They are the
  // newest and least load-bearing entries here, and a whole-table read is the
  // most likely thing on this page to fail; losing them must not also lose the
  // cubes, which is what one shared catch would do.
  //
  // **No `lastModified`.** Nothing records when a percentage last moved, and a
  // date invented from `Date.now()` would tell a crawler every card page
  // changed on every crawl, which is worse than saying nothing.
  //
  // `cardPagesFor` is the same owner floor the layout 404s on, so this cannot
  // advertise a URL the page refuses to serve.
  let cardPages: string[] = [];
  try {
    const [identities, snapshot] = await Promise.all([
      getCardIdentities(),
      getCardPopularity(),
    ]);
    cardPages = cardPagesFor(snapshot, identities);
  } catch {
    // Same reasoning as above: a short sitemap beats a 500.
  }

  return [
    ...staticPages,
    ...cardPages.map((path) => ({
      url: `${site}${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...cubes.map((cube) => ({
      url: `${site}/cube/${cube.ownerUsername}/${cube.slug}`,
      lastModified: cube.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...[...owners].map(([username, lastModified]) => ({
      url: `${site}/u/${username}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
