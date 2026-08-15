import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { resolveSiteUrl } from "@/lib/site-url";

/**
 * What crawlers may index.
 *
 * The disallowed paths are all either per-account or pointless to index:
 * `/cubes`, `/drafts` and `/settings` redirect signed-out visitors to sign-in,
 * so a crawler would only ever see the login page under a dozen URLs; the auth
 * routes are one-shot exchanges. Individual cube pages are **not** listed —
 * unlisted ones carry their own `noindex` from `generateMetadata`, which is the
 * right place for a per-cube decision, and a blanket rule here would hide the
 * public ones too.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = resolveSiteUrl(await headers());
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/auth/", "/login", "/welcome", "/cubes", "/drafts", "/settings", "/profile"],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
