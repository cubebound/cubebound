import Link from "next/link";

import type { CubeSearchResult } from "@/db/queries/discovery";
import { cardFull } from "@/lib/card-images";
import { btn, panel } from "@/lib/ui";

/** 44px of tap height on a phone, the designed size from `sm` up. */
const TAP = "min-h-11 sm:min-h-0";

/**
 * A cube on the home page's most-followed grid.
 *
 * Bigger than an Explore row because this is the first cube a new visitor
 * sees, but it says the same things in the same words: the card count and the
 * follower count are the ones `CubeResults` shows.
 *
 * The cover is the list thumbnail's crop at card width, so it asks for the
 * larger rendition: at roughly 380px wide the 512px thumbnail would be under
 * 2x. `alt` is empty because the name is the next thing in the card.
 */
export default function HomeCubeCard({ cube }: { cube: CubeSearchResult }) {
  const path = `/cube/${cube.ownerUsername}/${cube.slug}`;
  const cover = cardFull(cube.coverImage);
  const description = cube.description?.trim();

  return (
    <article className={`${panel} flex w-[280px] shrink-0 flex-col overflow-hidden sm:w-auto`}>
      <Link href={path} tabIndex={-1} aria-hidden className="block bg-sunken">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-[110px] w-full object-cover sm:h-[132px]"
            style={{ objectPosition: "50% 20%" }}
          />
        ) : (
          <span className="block h-[110px] sm:h-[132px]" />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-lg font-semibold">
          <Link href={path} className="hover:underline">
            {cube.name}
          </Link>
        </h3>
        <p className="text-[13px] text-subtle">
          by{" "}
          <Link href={`/u/${cube.ownerUsername}`} className="hover:underline">
            {cube.ownerUsername}
          </Link>
          {" · "}
          <span className="tabular-nums">{cube.cardCount}</span>{" "}
          {cube.cardCount === 1 ? "card" : "cards"}
          {" · "}
          <span className="tabular-nums">{cube.followers}</span>{" "}
          {cube.followers === 1 ? "follower" : "followers"}
        </p>
        {/* Up to three lines, clipped after that. Nothing at all for an empty
            description, and none on a phone, where the cards scroll sideways
            and stay short. */}
        {description && (
          <p className="hidden text-sm text-muted sm:line-clamp-3">{description}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-2.5">
          <Link href={path} className={`${btn.primarySm} ${TAP}`}>
            View
          </Link>
          {/* The draft settings screen: Draftmancer export, bots and
              Crack-A-Pack are its three tabs. */}
          <Link href={`${path}/draft?new=1`} className={`${btn.secondarySm} ${TAP}`}>
            Draft
          </Link>
        </div>
      </div>
    </article>
  );
}
