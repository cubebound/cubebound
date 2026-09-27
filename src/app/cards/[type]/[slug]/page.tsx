import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRepresentativeCardsByKeys } from "@/db/queries/cards";
import { collapseIdentityKey } from "@/lib/card-ids";
import {
  cardPageName,
  cardPagePath,
  commonlyCubedWith,
  findCardByPath,
  hasCardPage,
  popularityForCards,
  sharePercent,
  STATS_MIN_CARDS,
} from "@/lib/card-popularity";
import { loadCardIdentities, loadCardPopularity } from "@/lib/cube-request";
import { metaDescription } from "@/lib/meta";
import { link as linkClass, panelEmpty } from "@/lib/ui";

import PairingTable, { type PairingRow } from "./pairing-table";

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

  // The twenty-five rows actually rendered, as full cards: each opens the
  // detail box, which needs everything the browser's does.
  const paired = await getRepresentativeCardsByKeys(rows.map((row) => row.key));
  const byKey = new Map(paired.map((entry) => [collapseIdentityKey(entry), entry]));
  // A key with no printing behind it would mean the snapshot and the card pool
  // disagree, which `check:printings` exists to prevent. Dropping the row is
  // still better than rendering a blank one.
  const table: PairingRow[] = rows.flatMap((row) => {
    const other = byKey.get(row.key);
    if (!other) return [];
    return [
      {
        card: other,
        withPct: row.withPct,
        overallPct: row.overallPct,
        pageHref: row.hasPage ? cardPagePath(other) : null,
      },
    ];
  });
  // Only the label and the link cross to the browser, as on every surface.
  const popularity = popularityForCards(snapshot, paired);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">
          Cards commonly cubed with {name}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {name} is in {share} of cubes. These cards show up alongside it more
          often than they do in cubes overall.
        </p>
      </header>

      {table.length === 0 ? (
        <p className={`mt-8 ${panelEmpty}`}>
          Nothing shows up alongside {name} often enough to list yet.
        </p>
      ) : (
        <PairingTable rows={table} subjectName={name} popularity={popularity} />
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
