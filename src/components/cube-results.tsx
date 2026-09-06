import Link from "next/link";

import FollowButton from "@/components/follow-button";
import type { CubeSearchResult } from "@/db/queries/discovery";
import { cardPicker } from "@/lib/card-images";

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const VISIBILITY_STYLE: Record<string, string> = {
  public: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  unlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  private: "bg-sunken text-muted",
};

/**
 * The cube's cover art, cropped to a fixed 4:3 window.
 *
 * A fixed shape rather than the card's own, because a list mixing portrait
 * units with landscape battlefields makes a ragged left edge. 4:3 specifically:
 * on a 5:7 card that window is about 54% of the height, which is almost exactly
 * the illustration — a square is tall enough to catch the name bar and the top
 * of the rules box, which was the first attempt and looked like a cropped card
 * rather than a cover. `object-position` biases high for the same reason.
 *
 * Sized at `PICKER_WIDTH` and loaded lazily — twenty rows of art should not
 * cost what twenty card tiles do. `alt` is empty on purpose: the cube's name is
 * already the next thing in the row, so announcing it twice is noise.
 */
const THUMB_CLASS = "h-[3.25rem] w-[4.333rem] shrink-0 rounded";

function CoverThumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span
        aria-hidden
        title="No cards yet"
        className={`${THUMB_CLASS} flex items-center justify-center border border-dashed border-line text-subtle`}
      >
        {/* The brand mark's silhouette, as a placeholder for an empty cube. */}
        <svg viewBox="0 0 64 64" className="size-6 fill-none stroke-current" strokeWidth={4}>
          <path d="M32 9 L54 21.5 L54 42.5 L32 55 L10 42.5 L10 21.5 Z" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cardPicker(url) ?? ""}
      alt=""
      loading="lazy"
      className={`${THUMB_CLASS} border border-line object-cover`}
      style={{ objectPosition: "50% 20%" }}
    />
  );
}

/**
 * A list of cubes, used by Explore and by both tabs on Your cubes.
 *
 * One component so a cube reads the same wherever you meet it — same card
 * count, same "updated" wording, same follow control.
 *
 * Two variants, because the two audiences want different things from a row.
 * `owned` opens the editor and shows who can see the cube, which is the thing
 * you check on your own list and cannot see anywhere else. `public` opens the
 * cube as a reader and offers Follow; following your own cube is noise, and a
 * visibility badge on someone else's is meaningless — you only ever see the
 * ones you were allowed to.
 */
export default function CubeResults({
  cubes,
  returnPath,
  signedIn,
  empty,
  variant = "public",
}: {
  cubes: CubeSearchResult[];
  returnPath: string;
  signedIn: boolean;
  /** Shown in place of the list; a node so callers can offer a way out of it. */
  empty: React.ReactNode;
  variant?: "public" | "owned";
}) {
  if (cubes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-10 text-center text-muted">
        {empty}
      </div>
    );
  }

  const owned = variant === "owned";

  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {cubes.map((cube) => {
        const path = `/cube/${cube.ownerUsername}/${cube.slug}`;
        return (
          <li key={cube.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
            {/* Linked, not decorative: the thumbnail is the biggest target in
                the row and clicking a picture of a cube should open it. */}
            <Link href={owned ? `${path}/edit` : path} tabIndex={-1} aria-hidden>
              <CoverThumb url={cube.coverImage} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={owned ? `${path}/edit` : path}
                className="font-medium hover:underline"
              >
                {cube.name}
              </Link>
              <p className="mt-0.5 text-sm text-muted">
                {!owned && (
                  <>
                    by{" "}
                    <Link
                      href={`/u/${cube.ownerUsername}`}
                      className="hover:underline"
                    >
                      {cube.ownerUsername}
                    </Link>
                    {" · "}
                  </>
                )}
                <span className="tabular-nums">{cube.cardCount}</span>{" "}
                {cube.cardCount === 1 ? "card" : "cards"}
                {" · updated "}
                <time dateTime={cube.updatedAt.toISOString()}>
                  {dateFormat.format(cube.updatedAt)}
                </time>
              </p>
              {cube.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted">
                  {cube.description}
                </p>
              )}
            </div>
            {owned ? (
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${
                  VISIBILITY_STYLE[cube.visibility]
                }`}
              >
                {cube.visibility}
              </span>
            ) : (
              <FollowButton
                cubeId={cube.id}
                following={cube.following}
                followers={cube.followers}
                returnPath={returnPath}
                signedIn={signedIn}
                size="sm"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
