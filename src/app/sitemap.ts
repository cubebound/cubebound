import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { listPublicCubesForSitemap } from "@/db/queries/discovery";
import { resolveSiteUrl } from "@/lib/site-url";

/** Cap the crawl. Well past the current cube count, and a ceiling means this
 *  never becomes a query that scans the whole table as the site grows. */
const MAX_CUBES = 2000;

/**
 * The static pages plus every **public** cube and its owner.
 *
 * Public only by construction, so unlisted and private cubes cannot reach this
 * list even by mistake. Profiles come from the cubes rather than from the user
 * table, so an account with nothing public isn't advertised either — and a
 * sitemap is the one place a soft leak would be indexed and cached forever.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = resolveSiteUrl(await headers());

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/explore`, changeFrequency: "daily", priority: 0.8 },
    { url: `${site}/cards`, changeFrequency: "weekly", priority: 0.7 },
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

  return [
    ...staticPages,
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
