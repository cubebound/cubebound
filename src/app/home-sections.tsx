import Link from "next/link";

import CardArt from "@/components/card-art";
import CubeResults from "@/components/cube-results";
import { searchCubes } from "@/db/queries/discovery";
import { link, panel } from "@/lib/ui";

import HomeCubeCard from "./home-cube-card";
import {
  loadMostCubed,
  loadMostFollowed,
  MOST_CUBED_LIMIT,
  RECENT_LIMIT,
  RECENT_MIN_CARDS,
} from "./home-data";

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** A section's heading row: the title, an optional gloss, and one way onward. */
export function SectionHeading({
  title,
  note,
  more,
}: {
  title: string;
  note?: string;
  more?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className="text-[22px] font-semibold sm:text-[26px]">{title}</h2>
      {note && <span className="hidden text-sm text-subtle sm:inline">{note}</span>}
      {more && (
        <Link href={more.href} className={`${link} ml-auto text-sm`}>
          {more.label}
        </Link>
      )}
    </div>
  );
}

/** Every section below the hero shares this rhythm. */
export const SECTION = "flex flex-col gap-5 border-t border-line py-10";

/**
 * The signed-in shortcut: the three cubes you edited last, and the way to the
 * ones you follow. No covers, because this is a way back to work rather than
 * something to browse, and the cover subquery is most of what a cube list
 * costs. Renders nothing for an account with no cubes yet; the hero's Create
 * button already covers that.
 */
export async function YourCubesStrip({ ownerId }: { ownerId: string }) {
  const cubes = await searchCubes({
    ownerId,
    includeNonPublic: true,
    limit: 3,
    omitCover: true,
  });
  if (cubes.length === 0) return null;

  return (
    <section className={SECTION}>
      <SectionHeading
        title="Your cubes"
        more={{ href: "/cubes?tab=followed", label: "Followed cubes" }}
      />
      <ul className="grid gap-3 sm:grid-cols-3">
        {cubes.map((cube) => (
          <li key={cube.id}>
            <Link
              href={`/cube/${cube.ownerUsername}/${cube.slug}/edit`}
              className={`${panel} block px-4 py-3 transition-colors hover:bg-hover`}
            >
              <span className="block truncate font-medium">{cube.name}</span>
              <span className="mt-0.5 block text-sm text-muted">
                <span className="tabular-nums">{cube.cardCount}</span>{" "}
                {cube.cardCount === 1 ? "card" : "cards"}
                {" · updated "}
                <time dateTime={cube.updatedAt.toISOString()}>
                  {dateFormat.format(cube.updatedAt)}
                </time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The six most-followed public cubes of a draftable size. Chosen by the query
 * alone; nobody hand-picks. Hidden entirely when none qualifies, since an
 * empty grid under this heading says nothing.
 *
 * A row that scrolls sideways on a phone and a grid from `sm` up. The negative
 * margin lets the row run to the screen edge while the page itself never
 * scrolls sideways.
 */
export async function MostFollowedCubes() {
  const cubes = await loadMostFollowed();
  if (cubes.length === 0) return null;

  return (
    <section className={SECTION}>
      <SectionHeading
        title="Most-followed cubes"
        more={{ href: "/explore?sort=follows", label: "See more" }}
      />
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1.5 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
        {cubes.map((cube) => (
          <HomeCubeCard key={cube.id} cube={cube} />
        ))}
      </div>
    </section>
  );
}

const STEP = `${panel} flex flex-col gap-2 p-5`;

/** Static: three steps, each ending in the guide or tool that does it. */
export function HowItWorks({ buildHref }: { buildHref: string }) {
  const steps = [
    {
      title: "Build or clone",
      body: "Start from scratch, paste in a list, or clone a cube you like.",
      href: buildHref,
      label: "Build a cube",
    },
    {
      title: "Draft against bots",
      body: "Do a quick test draft of any cube against bots. You need to be signed in for this one.",
      href: "/guides/riftbound-cube-drafting",
      label: "How cube drafting works",
    },
    {
      title: "Draft with friends",
      body: "Export any cube to Draftmancer and draft it with friends in the browser. No account needed.",
      href: "/guides/draftmancer",
      label: "Draftmancer guide",
    },
  ];

  return (
    <section className={SECTION}>
      <SectionHeading title="How it works" />
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className={STEP}>
            {/* Not the accent: that marks state, and a step number is not one. */}
            <span aria-hidden className="font-semibold text-subtle">
              {index + 1}
            </span>
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="text-sm text-muted">{step.body}</p>
            <Link href={step.href} className={`${link} mt-1 self-start text-sm`}>
              {step.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The eight most-cubed cards, labelled exactly as the card browser labels
 * them. Hidden when popularity is unavailable: a row of cards with no numbers
 * under this heading would be a claim the page cannot back.
 *
 * A card below the distinct-owner floor has no page, so it is drawn unlinked
 * rather than pointed at a 404.
 */
export async function MostCubedCards() {
  const cards = await loadMostCubed();
  if (!cards) return null;

  return (
    <section className={SECTION}>
      <SectionHeading
        title="Most-cubed cards"
        note="How often each card appears across cubes"
        more={{ href: "/cards", label: "See all cards" }}
      />
      <ul className="-mx-4 flex gap-3.5 overflow-x-auto px-4 pb-1.5 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:pb-0">
        {cards.slice(0, MOST_CUBED_LIMIT).map((card) => {
          const tile = (
            <>
              <span
                className="relative block overflow-hidden rounded-lg bg-sunken ring-1 ring-black/5 dark:ring-white/10"
                style={{ aspectRatio: "5 / 7" }}
              >
                <CardArt
                  src={card.src}
                  name={card.name}
                  turned={card.turned}
                  className="object-cover"
                />
              </span>
              <span className="mt-2 block truncate text-[13px] font-medium">{card.name}</span>
              <span className="block text-xs text-muted">{card.label}</span>
            </>
          );
          return (
            <li key={card.id} className="w-[116px] shrink-0 sm:w-[132px] lg:w-auto">
              {card.href ? (
                <Link href={card.href} className="block hover:underline">
                  {tile}
                </Link>
              ) : (
                tile
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The five public cubes changed most recently, as Explore's own rows, so a
 * cube reads the same here as there. The follow state is only asked for when
 * someone is signed in; signed out it costs no query.
 */
export async function RecentlyUpdated({ viewerId }: { viewerId: string | null }) {
  const cubes = await searchCubes({
    sort: "updated",
    minCards: RECENT_MIN_CARDS,
    limit: RECENT_LIMIT,
    viewerId,
  });
  if (cubes.length === 0) return null;

  return (
    <section className={SECTION}>
      <SectionHeading
        title="Recently updated"
        more={{ href: "/explore", label: "Explore all cubes" }}
      />
      <CubeResults
        cubes={cubes}
        returnPath="/"
        signedIn={Boolean(viewerId)}
        empty={null}
        coverFromSm
      />
    </section>
  );
}
