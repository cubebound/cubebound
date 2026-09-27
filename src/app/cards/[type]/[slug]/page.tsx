import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRepresentativeCardsByKeys } from "@/db/queries/cards";
import { cardThumb } from "@/lib/card-images";
import { collapseIdentityKey } from "@/lib/card-ids";
import {
  cardPageName,
  cardPagePath,
  commonlyCubedWith,
  findCardByPath,
  hasCardPage,
  sharePercent,
  STATS_MIN_CARDS,
} from "@/lib/card-popularity";
import { loadCardIdentities, loadCardPopularity } from "@/lib/cube-request";
import { domainDot } from "@/lib/domain-columns";
import { metaDescription } from "@/lib/meta";
import { aspectRatio } from "@/lib/riftbound";
import { link as linkClass, panelEmpty } from "@/lib/ui";

export async function generateMetadata({
  params,
}: PageProps<"/cards/[type]/[slug]">): Promise<Metadata> {
  const { type, slug } = await params;
  const [identities, snapshot] = await Promise.all([
    loadCardIdentities(),
    loadCardPopularity(),
  ]);

  const card = findCardByPath(identities, `/cards/${type}/${slug}`);
  // Metadata is generated before the layout's `notFound()` is reached, so it
  // has to make the same decision rather than assume the page exists.
  if (!card || !hasCardPage(snapshot, collapseIdentityKey(card))) {
    return { title: "Cards" };
  }

  const name = cardPageName(card);
  // The em dash here is title convention rather than prose, and the trailing
  // words are what anyone searching for this would actually type.
  const title = `Cards commonly cubed with ${name} — Riftbound cube stats`;
  return {
    title,
    description: metaDescription(
      `Which Riftbound cards are cubed alongside ${name}, and how often, ` +
        `measured across the cubes built on cubebound.gg.`,
    ),
    // Bare: there is one URL for this page and no parameters that change it.
    alternates: { canonical: cardPagePath(card) },
  };
}

export default async function CardPage({ params }: PageProps<"/cards/[type]/[slug]">) {
  const { type, slug } = await params;
  // Both loaders are `cache()`d and the layout above has already awaited them,
  // so this is free rather than a second read.
  const [identities, snapshot] = await Promise.all([
    loadCardIdentities(),
    loadCardPopularity(),
  ]);

  const card = findCardByPath(identities, `/cards/${type}/${slug}`);
  // The layout has decided both of these already. Repeated here because the
  // page cannot render without them and a layout that stopped enforcing one
  // should fail as a 404, not as a crash.
  if (!card) notFound();
  const key = collapseIdentityKey(card);
  if (!hasCardPage(snapshot, key)) notFound();

  const name = cardPageName(card);
  const share = sharePercent(snapshot.byKey.get(key)?.cubes ?? 0, snapshot.total);
  const rows = commonlyCubedWith(snapshot, key);

  // One narrow query for the twenty-five rows actually rendered.
  const paired = await getRepresentativeCardsByKeys(rows.map((row) => row.key));
  const byKey = new Map(paired.map((entry) => [collapseIdentityKey(entry), entry]));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">
          Cards commonly cubed with {name}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {name} is in {share} of cubes. These cards show up alongside it more
          often than they do in cubes overall.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className={`mt-8 ${panelEmpty}`}>
          Nothing shows up alongside {name} often enough to list yet.
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line rounded-lg border border-line">
          {rows.map((row) => {
            const other = byKey.get(row.key);
            // A key with no printing behind it would mean the snapshot and the
            // card pool disagree, which `check:printings` exists to prevent.
            // Skipping is still better than rendering a blank row.
            if (!other) return null;
            const otherName = cardPageName(other);
            const thumb = cardThumb(other.imageThumb);
            return (
              <li key={row.key} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="w-9 shrink-0 overflow-hidden rounded-md bg-sunken"
                  style={{ aspectRatio: aspectRatio(other.type) }}
                >
                  {thumb && (
                    // Straight from the source CDN, like every other card
                    // image on the site. See docs/card-images.md.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="size-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {/* Drawn inline rather than through `DomainDots` and
                        `EnergyChip`: those live in a `"use client"` module, and
                        importing one would ship the whole detail modal to a
                        page that has no interactivity at all. */}
                    <span
                      aria-label={other.domains.join(", ")}
                      className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                      style={{ background: domainDot(other.domains) }}
                    />
                    <span className="truncate">
                      {row.hasPage ? (
                        <Link href={cardPagePath(other)} className={linkClass}>
                          {otherName}
                        </Link>
                      ) : (
                        otherName
                      )}
                    </span>
                    {other.energyCost !== null && (
                      <span
                        aria-label={`Energy ${other.energyCost}`}
                        className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken text-[11px] font-semibold tabular-nums text-muted"
                      >
                        {other.energyCost}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-subtle">
                    In {row.withPct} of cubes with {name}, {row.overallPct} overall
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-xs text-subtle">
        Counted across every cube on cubebound.gg with at least {STATS_MIN_CARDS}{" "}
        cards, private ones included. No cube or owner is ever named.
      </p>

      <p className="mt-6 text-sm">
        <Link href="/cards" className={linkClass}>
          Browse every Riftbound card
        </Link>
      </p>
    </div>
  );
}
