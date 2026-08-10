import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import CardFilterBar from "@/components/card-filter-bar";
import CardPagination from "@/components/card-pagination";
import ChangeLog from "@/components/change-log";
import CubeViewToggle from "@/components/cube-view-toggle";
import { getFilterOptions, PAGE_SIZE, searchCards } from "@/db/queries/cards";
import {
  getCubeByOwnerAndSlug,
  getCubeCardQuantities,
  getCubeCards,
  getCubeHoldingsForBases,
  listCubeChanges,
} from "@/db/queries/cubes";
import { getPrintingsForBases } from "@/db/queries/cards";
import { getCurrentUser } from "@/lib/auth";
import { cardFiltersFromParams, type SearchParams } from "@/lib/card-search-params";
import { canEditCube } from "@/lib/cube-access";
import { CUBE_VIEW_COOKIE, resolveCubeView } from "@/lib/cube-view";
import { countCopies } from "@/lib/cube-cards";
import { resolveSiteUrl } from "@/lib/site-url";

import ShareButton from "../share-button";
import AddCards from "./add-cards";
import CubeContents from "./cube-contents";
import ImportCards from "./import-cards";
import PrimerEditor from "./primer-editor";
import QuickAdd from "./quick-add";

export const metadata: Metadata = {
  title: "Edit cube · cubebound.gg",
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
  const { username, slug } = await params;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  // Non-owners get a 404 rather than a 403, so the existence of someone else's
  // private cube isn't leaked. The mutations re-check ownership independently.
  const current = await getCurrentUser();
  if (!canEditCube(cube, current?.profile?.id)) notFound();

  const query = await searchParams;
  const filters = cardFiltersFromParams(query);
  const publicPath = `/cube/${cube.ownerUsername}/${cube.slug}`;
  const basePath = `${publicPath}/edit`;
  // Absolute, built from this request's origin — the same helper the magic
  // links use, so a copied link is never relative or pinned to the wrong host.
  const shareUrl = `${resolveSiteUrl(await headers())}${publicPath}`;
  const mode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const browsing = mode === "browse";
  const writingPrimer = mode === "primer";
  const viewingLog = mode === "log";
  const importing = mode === "import";
  const view = resolveCubeView(query.view, (await cookies()).get(CUBE_VIEW_COOKIE)?.value);

  const [contents, inCube] = await Promise.all([
    getCubeCards(cube.id),
    getCubeCardQuantities(cube.id),
  ]);
  const totalCopies = countCopies(contents);

  // Every printing of every card in the cube, so each copy can be switched
  // without a round trip when the control is opened.
  const printingRows = await getPrintingsForBases([
    ...new Set(contents.map((card) => card.baseId)),
  ]);
  const printingsByBase: Record<string, typeof printingRows> = {};
  for (const printing of printingRows) {
    (printingsByBase[printing.baseId] ??= []).push(printing);
  }

  // The browse grid is only rendered in browse mode, so don't pay for it in
  // the default view.
  const browse = browsing
    ? await Promise.all([getFilterOptions(), searchCards(filters)])
    : null;
  const changes = viewingLog ? await listCubeChanges(cube.id) : [];
  // Which of the results the cube already holds, and in which printing.
  const holdings = browse
    ? await getCubeHoldingsForBases(cube.id, browse[1].cards.map((c) => c.baseId))
    : {};

  const modeLink = (label: string, href: string, active: boolean) => (
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
        <Link href="/cubes" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
          ← Your cubes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{cube.name}</h1>
          <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
            {cube.visibility}
          </span>
          <span className="text-sm text-zinc-500 tabular-nums">
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
              href={`${publicPath}/draft`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Draft
            </Link>
            <Link
              href={`${publicPath}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              View
            </Link>
            <Link
              href={`${publicPath}/settings`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Settings
            </Link>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap items-center gap-2">
          {modeLink("Cube", basePath, !browsing && !writingPrimer && !viewingLog)}
          {modeLink("Browse cards", `${basePath}?mode=browse`, browsing)}
          {modeLink("Primer", `${basePath}?mode=primer`, writingPrimer)}
          {modeLink("Import", `${basePath}?mode=import`, importing)}
          {modeLink("Change log", `${basePath}?mode=log`, viewingLog)}
          {!browsing && !writingPrimer && !viewingLog && !importing && contents.length > 0 && (
            <span className="ml-auto">
              <CubeViewToggle active={view} />
            </span>
          )}
        </nav>
      </header>

      {importing ? (
        <section className="max-w-4xl">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Paste a card list to add many cards at once. You&rsquo;ll see exactly
            what matched before anything is added, and imports append to what the
            cube already holds.
          </p>
          <ImportCards cubeId={cube.id} editorPath={basePath} />
        </section>
      ) : viewingLog ? (
        <section>
          <p className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            Every edit to this cube, newest first.
          </p>
          <ChangeLog changes={changes} />
        </section>
      ) : writingPrimer ? (
        <section>
          <p className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            A long-form write-up for people browsing your cube — the archetypes,
            the house rules, why a card is in. Separate from the one-line
            description, and shown on the cube&rsquo;s Primer tab.
          </p>
          <PrimerEditor cubeId={cube.id} primer={cube.primer} />
        </section>
      ) : browsing ? (
        /* Browse mode replaces the cube list rather than sitting under it, so
           the search controls are the first thing on screen. */
        <section>
          <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
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
            <p className="py-16 text-center text-zinc-600 dark:text-zinc-400">
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
          <QuickAdd cubeId={cube.id} inCube={inCube} />
        </div>
      )}
    </div>
  );
}
