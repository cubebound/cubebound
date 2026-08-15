import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import CubeAnalyticsView from "@/components/cube-analytics-view";
import CubeSections from "@/components/cube-sections";
import CubeViewToggle from "@/components/cube-view-toggle";
import FollowButton from "@/components/follow-button";
import Primer from "@/components/primer";
import { getCubeCards } from "@/db/queries/cubes";
import { getFollowState } from "@/db/queries/discovery";
import { loadCube, loadViewer } from "@/lib/cube-request";
import type { SearchParams } from "@/lib/card-search-params";
import { canEditCube, canViewCube } from "@/lib/cube-access";
import { CUBE_VIEW_COOKIE, resolveCubeView } from "@/lib/cube-view";
import { countCopies } from "@/lib/cube-cards";
import {
  CUBE_LIST_SECTIONS,
  CUBE_SECTION_LABELS,
  type CubeSection,
} from "@/lib/riftbound";
import { resolveSiteUrl } from "@/lib/site-url";

import CloneButton from "./clone-button";
import ShareButton from "./share-button";

interface RouteParams {
  username: string;
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const cube = await loadCube(username, slug);
  // A private cube's metadata is served to anyone who guesses the URL — there
  // is no session behind a link preview — so it must say nothing the page
  // itself 404s rather than reveal. The matching opengraph-image does the same.
  if (!cube || cube.visibility === "private") {
    return { title: "Cube" };
  }

  const title = `${cube.name} by ${cube.ownerUsername}`;
  const description = cube.description ?? `A Riftbound cube by ${cube.ownerUsername}.`;
  return {
    title,
    description,
    // Unlisted means "not advertised": reachable by link, but kept out of
    // search results. The link preview still works, which is the point of it.
    robots: cube.visibility === "unlisted" ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/cube/${cube.ownerUsername}/${cube.slug}`,
    },
  };
}

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function CubePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  // Supabase is remote: every query is a ~60ms round trip whatever it asks
  // for, so what costs time here is *how many trips happen in a row*, not how
  // much data any of them returns. Anything independent is awaited together.
  //
  // The cube and viewer come from the request-scoped loaders the layout already
  // used, so these two resolve without touching the database again. Visibility
  // was decided there — see the note in layout.tsx about why it cannot be
  // decided here — and is re-asserted only to narrow the type.
  const { username, slug } = await params;
  const [cube, current, query, cookieStore] = await Promise.all([
    loadCube(username, slug),
    loadViewer(),
    searchParams,
    cookies(),
  ]);
  if (!canViewCube(cube, current?.profile?.id)) notFound();

  const isOwner = canEditCube(cube, current?.profile?.id);
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const hasPrimer = Boolean(cube.primer?.trim());
  const showingPrimer = tab === "primer" && hasPrimer;
  const showingMaybeboard = tab === "maybeboard";
  const showingAnalytics = tab === "analytics";
  const view = resolveCubeView(query.view, cookieStore.get(CUBE_VIEW_COOKIE)?.value);

  // `cubeId` is hoisted because `isOwner` is an aliased type predicate: reading
  // `cube.id` under `!isOwner` narrows the cube to `never`.
  const cubeId = cube.id;
  const viewerId = current?.profile?.id ?? null;

  // Second round: the cards and the follow state need the cube's id, but not
  // each other.
  const [allCards, follows] = await Promise.all([
    getCubeCards(cubeId),
    getFollowState(cubeId, isOwner ? null : viewerId),
  ]);

  // The maybeboard is a shortlist, not part of the cube: counting it would make
  // a 300-card cube read as 340.
  const cards = allCards.filter((card) => card.section !== "maybeboard");
  const maybeboard = allCards.filter((card) => card.section === "maybeboard");
  const total = countCopies(cards);

  const bySection = new Map<CubeSection, number>();
  for (const card of cards) {
    bySection.set(card.section, (bySection.get(card.section) ?? 0) + card.quantity);
  }
  const sectionCounts = CUBE_LIST_SECTIONS.filter((section) => bySection.has(section));

  // The owner sees the count in the byline rather than a Follow button —
  // following your own cube is noise, but knowing who's watching it isn't.
  const { followers, following } = follows;

  const basePath = `/cube/${cube.ownerUsername}/${cube.slug}`;
  // Built server-side from the request origin (same helper the magic links
  // use), so the copied link is absolute and stable rather than depending on
  // where the client happens to be.
  const shareUrl = `${resolveSiteUrl(await headers())}${basePath}`;
  const tabLink = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{cube.name}</h1>
          {cube.visibility !== "public" && (
            <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
              {cube.visibility}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!isOwner && (
              <FollowButton
                cubeId={cubeId}
                following={following}
                followers={followers}
                returnPath={basePath}
                signedIn={Boolean(current?.profile)}
              />
            )}
            <ShareButton
              url={shareUrl}
              visibility={cube.visibility}
              settingsHref={isOwner ? `${basePath}/settings` : undefined}
            />
            <Link
              href={`${basePath}/draft`}
              className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Draft
            </Link>
            {isOwner && (
              <Link
                href={`${basePath}/edit`}
                className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Edit
              </Link>
            )}
            <CloneButton
              username={cube.ownerUsername}
              slug={cube.slug}
              signedIn={Boolean(current?.profile)}
              prominent={!isOwner}
            />
          </div>
        </div>

        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          by{" "}
          <Link
            href={`/u/${cube.ownerUsername}`}
            className="font-medium hover:underline"
          >
            {cube.ownerUsername}
          </Link>
          {" · "}
          <span className="tabular-nums">{total}</span>{" "}
          {total === 1 ? "card" : "cards"}
          {" · updated "}
          <time dateTime={cube.updatedAt.toISOString()}>
            {dateFormat.format(cube.updatedAt)}
          </time>
          {isOwner && followers > 0 && (
            <>
              {" · "}
              <span className="tabular-nums">{followers}</span>{" "}
              {followers === 1 ? "follower" : "followers"}
            </>
          )}
        </p>

        {cube.description && (
          <p className="mt-2 max-w-3xl text-sm text-zinc-700 dark:text-zinc-300">
            {cube.description}
          </p>
        )}

        {sectionCounts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {sectionCounts.map((section) => (
              <li key={section}>
                {CUBE_SECTION_LABELS[section]}{" "}
                <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {bySection.get(section)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <nav className="mt-4 flex flex-wrap items-center gap-2">
          {tabLink("Cube", basePath, !showingPrimer && !showingMaybeboard && !showingAnalytics)}
          {hasPrimer && tabLink("Primer", `${basePath}?tab=primer`, showingPrimer)}
          {/* Only advertised when it holds something: an empty shortlist is
              noise on someone else's cube. */}
          {maybeboard.length > 0 &&
            tabLink(
              `Maybeboard (${countCopies(maybeboard)})`,
              `${basePath}?tab=maybeboard`,
              showingMaybeboard,
            )}
          {cards.length > 0 &&
            tabLink("Analytics", `${basePath}?tab=analytics`, showingAnalytics)}
          {!showingPrimer && !showingMaybeboard && !showingAnalytics && cards.length > 0 && (
            <span className="ml-auto">
              <CubeViewToggle active={view} />
            </span>
          )}
        </nav>
      </header>

      {showingPrimer ? (
        <Primer markdown={cube.primer!} />
      ) : showingAnalytics ? (
        <CubeAnalyticsView cards={cards} />
      ) : showingMaybeboard ? (
        <CubeSections
          cards={maybeboard}
          view={view}
          sections={["maybeboard"]}
          emptyMessage="Nothing on the maybeboard."
        />
      ) : (
        <CubeSections
          cards={cards}
          view={view}
          emptyMessage="This cube doesn't have any cards yet."
        />
      )}
    </div>
  );
}
