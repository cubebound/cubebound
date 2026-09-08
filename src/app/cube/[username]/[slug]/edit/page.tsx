import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import CardFilterBar from "@/components/card-filter-bar";
import CardPagination from "@/components/card-pagination";
import ChangeLog from "@/components/change-log";
import CubeViewToggle from "@/components/cube-view-toggle";
import { CardsPerRowMenu, CardsPerRowProvider } from "@/components/cards-per-row";
import { getFilterOptions, PAGE_SIZE, searchCards } from "@/db/queries/cards";
import {
  getCubeCards,
  getCubeHoldingsForBases,
  listCubeChanges,
} from "@/db/queries/cubes";
import { tab as tabStyle } from "@/lib/ui";
import { getPrintingsForBases } from "@/db/queries/cards";
import { loadCube, loadViewer } from "@/lib/cube-request";
import { cardFiltersFromParams, type SearchParams } from "@/lib/card-search-params";
import { canEditCube } from "@/lib/cube-access";
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
import { resolveSiteUrl } from "@/lib/site-url";

import ShareButton from "../share-button";
import AddCards from "./add-cards";
import CubeContents from "./cube-contents";
import ImportCards from "./import-cards";
import PrimerEditor from "./primer-editor";
import EditPanel from "./edit-panel";
import CubeAnalyticsView from "@/components/cube-analytics-view";

export const metadata: Metadata = {
  title: "Edit cube",
  // The editor is owner-only; keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function EditCubePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  // Supabase is remote, so this page's cost is the number of round trips it
  // makes in a row rather than the size of any one of them. Nothing here needs
  // anything else's answer, so it all goes out at once.
  const { username, slug } = await params;
  const [cube, current, query, cookieStore, requestHeaders] = await Promise.all([
    loadCube(username, slug),
    loadViewer(),
    searchParams,
    cookies(),
    headers(),
  ]);

  // Non-owners get a 404 rather than a 403, so the existence of someone else's
  // private cube isn't leaked. The mutations re-check ownership independently.
  if (!canEditCube(cube, current?.profile?.id)) notFound();

  const filters = cardFiltersFromParams(query);
  const publicPath = `/cube/${cube.ownerUsername}/${cube.slug}`;
  const basePath = `${publicPath}/edit`;
  // Absolute, built from this request's origin — the same helper the magic
  // links use, so a copied link is never relative or pinned to the wrong host.
  const shareUrl = `${resolveSiteUrl(requestHeaders)}${publicPath}`;
  const mode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  // `browse` and `import` are modes, not tabs: nothing in the tab row points at
  // them, they are reached from inside the edit panel and by URL, and two check
  // scripts navigate straight to them. Everything else is one of the five tabs.
  const browsing = mode === "browse";
  const importing = mode === "import";
  const tab = browsing || importing ? null : resolveCubeTab(mode);
  const writingPrimer = tab === "primer";
  const viewingLog = tab === "log";
  const onMaybeboard = tab === "maybeboard";
  const onAnalytics = tab === "analytics";
  const view = resolveCubeView(query.view, cookieStore.get(CUBE_VIEW_COOKIE)?.value);
  const perRow = resolveCardsPerRow(cookieStore.get(CARDS_PER_ROW_COOKIE)?.value);

  // Which mode renders what, decided before the fetch rather than after it.
  // Every mode used to read the whole cube's quantities and every printing of
  // every card in it — on a 500-card cube that is a thousand-odd wide rows,
  // paid for while showing the change log, which uses neither.
  const editing = tab === "cube";

  // Mode-specific data joins this round rather than waiting for the cube's
  // cards, which it does not depend on — the browse grid and the change log
  // were each costing their own extra trip on top of everything above.
  const [allContents, browse, changes] = await Promise.all([
    getCubeCards(cube.id),
    // Only rendered in browse mode, so don't pay for it in the default view.
    browsing ? Promise.all([getFilterOptions(), searchCards(filters)]) : null,
    viewingLog ? listCubeChanges(cube.id) : [],
  ]);
  // The maybeboard is a shortlist, not part of the cube, so it neither shows
  // in the cube list nor counts toward the size.
  const contents = allContents.filter((card) => card.section !== "maybeboard");
  const maybeboard = allContents.filter((card) => card.section === "maybeboard");
  const totalCopies = countCopies(contents);

  // Printings for the cards actually on screen, and only where alternates
  // exist. `cube-contents.tsx` renders a plain label rather than a select when
  // a base has a single printing, so those rows never changed anything visible.
  // `printingCount` rides along on getCubeCards, so knowing which qualify costs
  // nothing, and an empty list short-circuits without a query.
  const rendered = onMaybeboard ? maybeboard : editing ? contents : [];
  // Analytics is pure over the cards already loaded, so it adds no query — but
  // it must not look like the cube tab, or it would pull every printing to
  // render a bar chart.
  const switchableBases = [
    ...new Set(rendered.filter((card) => card.printingCount > 1).map((card) => card.baseId)),
  ];

  const [printingRows, holdings] = await Promise.all([
    getPrintingsForBases(switchableBases),
    // Which of the results the cube already holds, and in which printing.
    browse ? getCubeHoldingsForBases(cube.id, browse[1].cards.map((c) => c.baseId)) : {},
  ]);
  const printingsByBase: Record<string, typeof printingRows> = {};
  for (const printing of printingRows) {
    (printingsByBase[printing.baseId] ??= []).push(printing);
  }

  // `key` lives here rather than at the call site because these are rendered
  // from CUBE_TABS.map, and the returned element *is* the array item.
  const modeLink = (label: string, href: string, active: boolean) => (
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
      <header className="mb-5">
        <Link href="/cubes" className="text-sm text-subtle underline-offset-4 hover:underline">
          ← Your cubes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cube.name}</h1>
          <span className="rounded bg-sunken px-2 py-0.5 text-xs font-medium capitalize text-muted">
            {cube.visibility}
          </span>
          <span className="text-sm text-subtle tabular-nums">
            {totalCopies} {totalCopies === 1 ? "card" : "cards"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* The owner works here, so this is where they reach for a link to
                hand out. Same component and same URL as the public page. */}
            <ShareButton
              url={shareUrl}
              visibility={cube.visibility}
              settingsHref={`${publicPath}/settings`}
            />
            <Link
              /* Same as the public page: Draft sets one up. */
              href={`${publicPath}/draft?new=1`}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover"
            >
              Draft
            </Link>
            <Link
              href={`${publicPath}/settings`}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover"
            >
              Settings
            </Link>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap items-center gap-2">
          {CUBE_TABS.map((name) =>
            modeLink(
              CUBE_TAB_LABELS[name],
              name === DEFAULT_CUBE_TAB ? basePath : `${basePath}?mode=${name}`,
              name === tab,
            ),
          )}
        </nav>

        {/* Editing and the view controls belong to the card lists, so they sit
            with the list rather than in the tab row. Density folds into a menu:
            four visible chips beside a two-way toggle is most of a phone's
            width, and it is a setting you change occasionally. */}
        {tab !== null && tabShowsCards(tab) && (
          <div className="mt-3 flex items-center gap-2">
            <EditPanel
              cubeId={cube.id}
              browsePath={`${basePath}?mode=browse`}
              importPath={`${basePath}?mode=import`}
              board={onMaybeboard ? "maybeboard" : "mainboard"}
              contents={(onMaybeboard ? maybeboard : contents).map((card) => ({
                cardId: card.id,
                baseId: card.baseId,
                name: card.name,
                section: card.section,
                quantity: card.quantity,
                type: card.type,
                champion: card.champion,
                imageThumb: card.imageThumb,
                imageFull: card.imageFull,
              }))}
            />
            <span className="ml-auto flex items-center gap-2">
              {view === "visual" && <CardsPerRowMenu />}
              <CubeViewToggle active={view} />
            </span>
          </div>
        )}
      </header>

      {onMaybeboard ? (
        <section>
          <p className="mb-4 max-w-3xl text-sm text-muted">
            Cards you&rsquo;re considering. They don&rsquo;t count toward the cube
            or get drafted. Move one to a section when you decide to run it, the
            same way you move cards between sections.
          </p>
          <CubeContents
            cubeId={cube.id}
            cards={maybeboard}
            printingsByBase={printingsByBase}
            view={view}
            emptyMessage="Nothing here yet. Move a card to the Maybeboard from any section to shortlist it."
            sections={["maybeboard"]}
          />
        </section>
      ) : importing ? (
        <section className="max-w-4xl">
          <p className="mb-4 text-sm text-muted">
            Paste a card list to add many cards at once. You&rsquo;ll see exactly
            what matched before anything is added, and imports append to what the
            cube already holds.
          </p>
          <ImportCards cubeId={cube.id} editorPath={basePath} />
        </section>
      ) : onAnalytics ? (
        <CubeAnalyticsView cards={contents} />
      ) : viewingLog ? (
        <section>
          <p className="mb-4 max-w-3xl text-sm text-muted">
            Every edit to this cube, newest first.
          </p>
          <ChangeLog changes={changes} />
        </section>
      ) : writingPrimer ? (
        <section>
          <p className="mb-4 max-w-3xl text-sm text-muted">
            A long-form write-up for people browsing your cube: the archetypes,
            the house rules, why a card is in. Separate from the one-line
            description, and shown on the cube&rsquo;s Primer tab.
          </p>
          <PrimerEditor cubeId={cube.id} primer={cube.primer} />
        </section>
      ) : browsing ? (
        /* Browse mode replaces the cube list rather than sitting under it, so
           the search controls are the first thing on screen. */
        <section>
          <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-line bg-raised/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <CardFilterBar
              options={browse![0]}
              active={filters}
              total={browse![1].total}
              basePath={basePath}
              extraParams={{ mode: "browse" }}
              unit="matches"
            />
          </div>

          {browse![1].cards.length === 0 ? (
            <p className="py-16 text-center text-muted">
              No cards match those filters.
            </p>
          ) : (
            <div className="space-y-6">
              <AddCards
                cubeId={cube.id}
                cards={browse![1].cards}
                holdings={holdings}
                showingEveryPrinting={Boolean(filters.allPrintings)}
              />
              <CardPagination
                filters={filters}
                page={browse![1].page}
                pageCount={browse![1].pageCount}
                total={browse![1].total}
                pageSize={PAGE_SIZE}
                basePath={basePath}
                extraParams={{ mode: "browse" }}
              />
            </div>
          )}
        </section>
      ) : (
        <div className="grid gap-6">
          <section className="min-w-0">
            <CubeContents
              cubeId={cube.id}
              cards={contents}
              view={view}
              printingsByBase={printingsByBase}
            />
          </section>
        </div>
      )}
      </div>
    </CardsPerRowProvider>
  );
}
