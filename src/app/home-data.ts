import * as Sentry from "@sentry/nextjs";
import { cache } from "react";

import { searchCards } from "@/db/queries/cards";
import { searchCubes } from "@/db/queries/discovery";
import { cardThumb } from "@/lib/card-images";
import { cardPageName, popularityForCards } from "@/lib/card-popularity";
import { loadCardPopularityIfAvailable } from "@/lib/cube-request";
import { pickHeroCards, utcDay } from "@/lib/hero-cards";
import { isLandscape } from "@/lib/riftbound";

/**
 * What the home page reads. The decisions behind the numbers are in
 * docs/discovery.md, "Landing page".
 *
 * Each loader is wrapped in `cache()` because two sections can want the same
 * rows in one render (the hero falls back to the most-followed cubes' covers),
 * and the sections sit in separate Suspense boundaries, so nothing else would
 * share the query.
 */

export const FEATURED_MIN_CARDS = 300;
export const FEATURED_LIMIT = 6;
export const RECENT_MIN_CARDS = 100;
export const RECENT_LIMIT = 5;
export const MOST_CUBED_LIMIT = 8;
/** The hero picks from this many of the most-cubed cards. */
const HERO_POOL = 20;

export const loadMostFollowed = cache(() =>
  searchCubes({ sort: "follows", minCards: FEATURED_MIN_CARDS, limit: FEATURED_LIMIT }),
);

/** A card as the home page draws it: art, a name, and the browser's own label. */
export interface HomeCard {
  id: string;
  name: string;
  /** Already sized by `cardThumb`. */
  src: string | null;
  /** A battlefield, stood upright like every other grid on the site. */
  turned: boolean;
  /** "In 34% of cubes", from the same reduction the card browser uses. */
  label: string;
  /** The card's page, or null below the distinct-owner floor. */
  href: string | null;
  domains: readonly string[];
}

/**
 * The most-cubed cards, in order, or null when there is nothing honest to show.
 *
 * The rows are the memoised opening page of `/cards`, so a warm instance pays
 * no query for them. Only cards the snapshot has a label for are kept: if the
 * snapshot failed while that page was being memoised it is in printed order,
 * and the filter is what stops printed order being presented as popularity.
 * The shared result is read and mapped, never mutated.
 */
export const loadMostCubed = cache(async (): Promise<HomeCard[] | null> => {
  try {
    const [snapshot, result] = await Promise.all([
      loadCardPopularityIfAvailable(),
      searchCards({ sort: "played" }),
    ]);
    if (!snapshot) return null;

    const views = popularityForCards(snapshot, result.cards);
    const cards = result.cards.flatMap((card): HomeCard[] => {
      const view = views[card.id];
      if (!view) return [];
      return [
        {
          id: card.id,
          name: cardPageName(card),
          src: cardThumb(card.imageThumb ?? card.imageFull),
          turned: isLandscape(card.type),
          label: view.label,
          href: view.href,
          domains: card.domains,
        },
      ];
    });
    return cards.length > 0 ? cards : null;
  } catch (error) {
    // The stat is an extra here, so the page renders without it. Reported by
    // hand because a caught error never reaches `onRequestError`.
    Sentry.captureException(error);
    console.error("most-cubed cards unavailable", error);
    return null;
  }
});

/** One tile of the hero fan. */
export interface HeroCard {
  id: string;
  name: string;
  src: string | null;
  turned: boolean;
}

/**
 * Today's picks, held for the rest of the UTC day once made.
 *
 * `pickHeroCards` is already deterministic per day; this pin covers what it
 * cannot, which is the candidate set itself moving when the hourly snapshot
 * refreshes. Per instance, like every memo here, and it holds no request data.
 */
let pinned: { day: string; cards: HeroCard[] } | null = null;

/**
 * Three cards for the hero, or fewer than three when there is nothing to show
 * (the caller then draws no fan).
 *
 * With popularity unavailable it falls back to the covers of the three
 * most-followed cubes, which the page has already asked for, so the fallback
 * costs no query of its own. A fallback is never pinned: the real picks take
 * over as soon as the snapshot is readable again.
 */
export async function loadHeroCards(): Promise<HeroCard[]> {
  const day = utcDay(new Date());
  if (pinned?.day === day) return pinned.cards;

  const mostCubed = await loadMostCubed();
  if (mostCubed) {
    const picks = pickHeroCards(mostCubed.slice(0, HERO_POOL), day);
    if (picks.length === 3) {
      const cards = picks.map(({ id, name, src, turned }) => ({ id, name, src, turned }));
      pinned = { day, cards };
      return cards;
    }
  }

  const cubes = await loadMostFollowed();
  return cubes
    .filter((cube) => cube.coverImage)
    .slice(0, 3)
    .map((cube) => ({
      id: cube.id,
      name: cube.name,
      src: cardThumb(cube.coverImage),
      turned: false,
    }));
}
