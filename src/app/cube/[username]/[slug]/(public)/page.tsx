import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import CubeAnalyticsView from "@/components/cube-analytics-view";
import CubeSections from "@/components/cube-sections";
import CubeViewToggle from "@/components/cube-view-toggle";
import { CardsPerRowMenu, CardsPerRowProvider } from "@/components/cards-per-row";
import ChangeLog from "@/components/change-log";
import FollowButton from "@/components/follow-button";
import Primer from "@/components/primer";
import { getCubeCards, listCubeChanges } from "@/db/queries/cubes";
import { getFollowState } from "@/db/queries/discovery";
import { loadCube, loadViewer } from "@/lib/cube-request";
import type { SearchParams } from "@/lib/card-search-params";
import { CubeModerationPanel } from "@/components/moderation-panel";
import { canViewCube } from "@/lib/cube-access";
import { CUBE_VIEW_COOKIE, resolveCubeView } from "@/lib/cube-view";
import { CARDS_PER_ROW_COOKIE, resolveCardsPerRow } from "@/lib/cards-per-row";
import {
  CUBE_TAB_LABELS,
  CUBE_TABS,
  DEFAULT_CUBE_TAB,
  resolveCubeTab,
  tabShowsCards,
} from "@/lib/cube-tabs";
import { countCopies } from "@/lib/cube-cards";
import {
  CUBE_LIST_SECTIONS,
  CUBE_SECTION_LABELS,
  type CubeSection,
} from "@/lib/riftbound";
import { resolveSiteUrl } from "@/lib/site-url";
import { btn, panelEmpty, tab as tabStyle } from "@/lib/ui";

import CloneButton from "../clone-button";
import ShareButton from "../share-button";

interface RouteParams {
  username: string;
  slug: string;
}

/**
 * A cube's own description, fit for a `<meta>` tag.
 *
 * The column is free text a user wrote for the page, so it can be paragraphs
 * long and carry newlines. Search engines cut a description around 155
 * characters, and a snippet cut mid-word reads as broken — so collapse the
 * whitespace and clip at the last word that fits. Kept here rather than in
 * `src/lib/` because this is its only caller; move it if a second appears.
 */
const META_DESCRIPTION_MAX = 155;

function metaDescription(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= META_DESCRIPTION_MAX) return flat;
  const cut = flat.slice(0, META_DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
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

  // "Riftbound cube" is the phrase people actually search, and the cube's own
  // name carries none of it — the same reasoning that renamed the homepage off
  // the bare brand. See "Page titles carry the words people search".
  const title = `${cube.name} — Riftbound cube by ${cube.ownerUsername}`;
  const description = metaDescription(
    cube.description ?? `A Riftbound cube by ${cube.ownerUsername}.`,
  );
  return {
    title,
    description,
    // `?view=` and `?tab=` are the same cube under four or five URLs, and the
    // view is *also* set from a cookie, so the variants get linked and shared
    // in the wild rather than only crawled. They consolidate onto the bare
    // path; none of the tabs is a page worth ranking on its own.
    alternates: { canonical: `/cube/${cube.ownerUsername}/${cube.slug}` },
    // Unlisted means "not advertised": reachable by link, but kept out of
    // search results. The link preview still works, which is the point of it.
    robots: cube.visibility === "unlisted" ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/cube/${cube.ownerUsername}/${cube.slug}`,
      // Named explicitly because `opengraph-image.tsx` sits one segment up
      // rather than beside this page, so Next does not pair the two on its own.
      // It stays up there deliberately: inside the `(public)` group Next
      // appends a group-derived suffix to the generated route
      // (`/opengraph-image-7gn1ej`), which both changes a URL scrapers have
      // already cached and stops `middleware.ts` recognising a preview route by
      // its `/opengraph-image` ending — the query-stripping redirect that keeps
      // the most expensive unauthenticated route on one CDN entry. The root
      // layout's per-request `metadataBase` turns this into the absolute URL a
      // scraper needs.
      images: [`/cube/${cube.ownerUsername}/${cube.slug}/opengraph-image`],
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
  if (!canViewCube(cube, current?.profile?.id, current?.profile?.isAdmin)) notFound();

  const tab = resolveCubeTab(query.tab);

  // Everything below is the visitor's view: the owner is redirected to the
  // editor by the layout in this route group, above the loading boundary.
  const isAdmin = Boolean(current?.profile?.isAdmin);
  const hiddenAt = cube.hiddenAt;
  const hiddenReason = cube.hiddenReason;
  const cubeName = cube.name;
  const hasPrimer = Boolean(cube.primer?.trim());
  const view = resolveCubeView(query.view, cookieStore.get(CUBE_VIEW_COOKIE)?.value);
  const perRow = resolveCardsPerRow(cookieStore.get(CARDS_PER_ROW_COOKIE)?.value);

  const cubeId = cube.id;
  const viewerId = current?.profile?.id ?? null;

  // Second round: the cards and the follow state need the cube's id, but not
  // each other.
  const [allCards, follows, changes] = await Promise.all([
    getCubeCards(cubeId),
    getFollowState(cubeId, viewerId),
    // Only the Change log tab reads this, so it is not paid for on the others.
    tab === "log" ? listCubeChanges(cubeId) : [],
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

  // Only a visitor reaches this page, so Follow is unconditional here; the
  // owner's own follower count is in the editor's byline instead.
  const { followers, following } = follows;

  const basePath = `/cube/${cube.ownerUsername}/${cube.slug}`;
  // Built server-side from the request origin (same helper the magic links
  // use), so the copied link is absolute and stable rather than depending on
  // where the client happens to be.
  const shareUrl = `${resolveSiteUrl(await headers())}${basePath}`;
  // `key` lives here rather than at the call site because these are rendered
  // from CUBE_TABS.map, and the returned element *is* the array item.
  const tabLink = (label: string, href: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={active ? tabStyle.active : tabStyle.inactive}
    >
      {label}
    </Link>
  );

  return (
    <CardsPerRowProvider initial={perRow}>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      {/* Above the header, not beside the owner's buttons: acting on someone
          else's cube by mistake is the failure to design against. */}
      {isAdmin && (
        <div className="mb-5">
          <CubeModerationPanel
            cubeId={cubeId}
            cubeName={cubeName}
            hidden={Boolean(hiddenAt)}
            hiddenReason={hiddenReason}
          />
        </div>
      )}

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cube.name}</h1>
          {cube.visibility !== "public" && (
            <span className="rounded bg-sunken px-2 py-0.5 text-xs font-medium capitalize text-muted">
              {cube.visibility}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <FollowButton
              cubeId={cubeId}
              following={following}
              followers={followers}
              returnPath={basePath}
              signedIn={Boolean(current?.profile)}
            />
            <ShareButton url={shareUrl} visibility={cube.visibility} />
            <Link
              /* `?new=1` opens the settings rather than resuming. "Draft"
                 on a cube means "set one up"; picking up where you left off is
                 what /drafts and the "Back to it" link on that screen are for,
                 and silently resuming made the settings unreachable from here
                 for anyone who had drafted this cube before. */
              href={`${basePath}/draft?new=1`}
              className={btn.secondarySm}
            >
              Draft
            </Link>
            <CloneButton
              username={cube.ownerUsername}
              slug={cube.slug}
              signedIn={Boolean(current?.profile)}
              prominent
            />
          </div>
        </div>

        <p className="mt-1 text-sm text-muted">
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
        </p>

        {cube.description && (
          <p className="mt-2 max-w-3xl text-sm text-muted">
            {cube.description}
          </p>
        )}

        {sectionCounts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {sectionCounts.map((section) => (
              <li key={section}>
                {CUBE_SECTION_LABELS[section]}{" "}
                <span className="font-medium tabular-nums text-ink">
                  {bySection.get(section)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <nav className="mt-4 flex flex-wrap items-center gap-2">
          {CUBE_TABS.map((name) =>
            tabLink(
              CUBE_TAB_LABELS[name],
              name === DEFAULT_CUBE_TAB ? basePath : `${basePath}?tab=${name}`,
              name === tab,
            ),
          )}
        </nav>

        {/* View controls belong to the card lists, so they sit with the list
            rather than with the tabs. Density folds into a menu: four visible
            chips plus a two-way toggle is most of a phone's width. */}
        {tabShowsCards(tab) && cards.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="ml-auto flex items-center gap-2">
              {view === "visual" && <CardsPerRowMenu />}
              <CubeViewToggle active={view} />
            </span>
          </div>
        )}
      </header>

      {tab === "primer" ? (
        hasPrimer ? (
          <Primer markdown={cube.primer!} />
        ) : (
          <p className={panelEmpty}>
            This cube&rsquo;s owner hasn&rsquo;t written a primer yet.
          </p>
        )
      ) : tab === "analytics" ? (
        <CubeAnalyticsView cards={cards} />
      ) : tab === "log" ? (
        <ChangeLog changes={changes} />
      ) : tab === "maybeboard" ? (
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
    </CardsPerRowProvider>
  );
}
