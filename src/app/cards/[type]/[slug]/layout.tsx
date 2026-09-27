import { notFound } from "next/navigation";

import { collapseIdentityKey } from "@/lib/card-ids";
import { findCardByPath, hasCardPage } from "@/lib/card-popularity";
import { loadCardIdentities, loadCardPopularity } from "@/lib/cube-request";

/**
 * Decides whether this page exists at all, above the loading boundary.
 *
 * Same reason as the cube and profile layouts: `loading.tsx` lets Next flush
 * the shell, and flushing commits **HTTP 200**, after which the page's
 * `notFound()` can change the body but not the status. A soft 404 is a page
 * crawlers index as real, which for these pages would mean indexing a URL that
 * exists only because a slug happened to parse.
 *
 * **Three different reasons look identical from outside, deliberately.** An
 * unknown card, a non-canonical spelling of a real one, and a real card in
 * cubes from fewer than `CARD_PAGE_MIN_OWNERS` people all 404 the same way. The
 * third is the one that matters: "this card exists but has no page yet" is
 * itself a statement about how many people are running it, and on a site this
 * size that is close to a statement about which people.
 *
 * The page below re-reads both loaders through `cache()`, so the guard costs
 * no extra query.
 */
export default async function CardPageLayout({
  children,
  params,
}: LayoutProps<"/cards/[type]/[slug]">) {
  const { type, slug } = await params;
  const [identities, snapshot] = await Promise.all([
    loadCardIdentities(),
    loadCardPopularity(),
  ]);

  const card = findCardByPath(identities, `/cards/${type}/${slug}`);
  if (!card || !hasCardPage(snapshot, collapseIdentityKey(card))) notFound();

  return children;
}
