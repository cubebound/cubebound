import Link from "next/link";

import FollowButton from "@/components/follow-button";
import type { CubeSearchResult } from "@/db/queries/discovery";

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const VISIBILITY_STYLE: Record<string, string> = {
  public: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  unlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  private: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

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
      <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        {empty}
      </div>
    );
  }

  const owned = variant === "owned";

  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {cubes.map((cube) => {
        const path = `/cube/${cube.ownerUsername}/${cube.slug}`;
        return (
          <li key={cube.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link
                href={owned ? `${path}/edit` : path}
                className="font-medium hover:underline"
              >
                {cube.name}
              </Link>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                {!owned && (
                  <>
                    by {cube.ownerUsername}
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
                <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
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
