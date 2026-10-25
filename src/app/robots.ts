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
 *
 * **The second group is URL variants, disallowed to save compute rather than
 * to hide anything.** Every route is dynamic, so each URL a crawler fetches is
 * a full server render plus a proxy invocation, and those are what the Hobby
 * plan's CPU limit counts. A cube page has a `?tab=` and `?view=` variant per
 * tab, `/cards` has every filter combination, and the listings page through
 * `?q=`/`?page=`. Each already declares its bare path as canonical, so the
 * variants add nothing to the index. The tool routes under a cube (draft,
 * editor, settings, the Draftmancer file and the pack image) are per-viewer,
 * 404 for a crawler, or a download. The bare pages, the card pages and every
 * `/opengraph-image` stay allowed: Twitterbot obeys this file, and Next
 * appends a bare `?<hash>` to preview URLs, which none of these patterns
 * match. Google and Bing honour `*`; a crawler that does not simply crawls
 * what it always did.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = resolveSiteUrl(await headers());
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/auth/",
        "/login",
        "/welcome",
        "/cubes",
        "/drafts",
        "/settings",
        "/profile",
        // Variants of pages whose bare path is the canonical one.
        "/*?*tab=",
        "/*?*view=",
        "/cards?",
        "/explore?",
        "/u/*?*q=",
        "/u/*?*page=",
        // Tool routes under a cube; `/draft` also covers `/draftmancer.txt`.
        "/cube/*/draft",
        "/cube/*/edit",
        "/cube/*/settings",
        "/cube/*/pack.png",
      ],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
