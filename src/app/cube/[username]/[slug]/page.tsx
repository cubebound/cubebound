import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import CubeSections from "@/components/cube-sections";
import CubeViewToggle from "@/components/cube-view-toggle";
import Primer from "@/components/primer";
import { getCubeByOwnerAndSlug, getCubeCards } from "@/db/queries/cubes";
import { getCurrentUser } from "@/lib/auth";
import type { SearchParams } from "@/lib/card-search-params";
import { canEditCube, canViewCube } from "@/lib/cube-access";
import { CUBE_VIEW_COOKIE, resolveCubeView } from "@/lib/cube-view";
import { countCopies } from "@/lib/cube-cards";
import {
  CUBE_SECTIONS,
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
  const cube = await getCubeByOwnerAndSlug(username, slug);
  if (!cube || cube.visibility === "private") {
    return { title: "Cube · cubebound.gg" };
  }
  return {
    title: `${cube.name} by ${cube.ownerUsername} · cubebound.gg`,
    description: cube.description ?? `A Riftbound cube by ${cube.ownerUsername}.`,
    // Unlisted means "not advertised": reachable by link, but kept out of
    // search results.
    robots: cube.visibility === "unlisted" ? { index: false, follow: false } : undefined,
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
  const { username, slug } = await params;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  // Private cubes 404 for everyone but their owner — the same convention the
  // mutations use, so a stranger can't confirm a private cube exists.
  const current = await getCurrentUser();
  if (!canViewCube(cube, current?.profile?.id)) notFound();

  const isOwner = canEditCube(cube, current?.profile?.id);
  const query = await searchParams;
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const hasPrimer = Boolean(cube.primer?.trim());
  const showingPrimer = tab === "primer" && hasPrimer;
  const view = resolveCubeView(query.view, (await cookies()).get(CUBE_VIEW_COOKIE)?.value);

  const cards = await getCubeCards(cube.id);
  const total = countCopies(cards);

  const bySection = new Map<CubeSection, number>();
  for (const card of cards) {
    bySection.set(card.section, (bySection.get(card.section) ?? 0) + card.quantity);
  }
  const sectionCounts = CUBE_SECTIONS.filter((section) => bySection.has(section));

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
            <ShareButton
              url={shareUrl}
              visibility={cube.visibility}
              settingsHref={isOwner ? `${basePath}/settings` : undefined}
            />
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
          {/* The owner's profile page doesn't exist yet, so this stays text. */}
          by <span className="font-medium">{cube.ownerUsername}</span>
          {" · "}
          <span className="tabular-nums">{total}</span>{" "}
          {total === 1 ? "card" : "cards"}
          {" · updated "}
          <time dateTime={cube.updatedAt.toISOString()}>
            {dateFormat.format(cube.updatedAt)}
          </time>
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
          {tabLink("Cube", basePath, !showingPrimer)}
          {hasPrimer && tabLink("Primer", `${basePath}?tab=primer`, showingPrimer)}
          {!showingPrimer && cards.length > 0 && (
            <span className="ml-auto">
              <CubeViewToggle active={view} />
            </span>
          )}
        </nav>
      </header>

      {showingPrimer ? (
        <Primer markdown={cube.primer!} />
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
