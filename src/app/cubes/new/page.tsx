import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createCubeAction } from "@/app/cube/actions";
import CubeForm from "@/app/cubes/cube-form";
import CloneButton, { CloneCubeForm } from "@/components/clone-cube";
import { getStarterSets } from "@/db/queries/cards";
import { getCubeByOwnerAndSlug } from "@/db/queries/cubes";
import { searchCubes } from "@/db/queries/discovery";
import { getCurrentUser } from "@/lib/auth";
import { canUseCube } from "@/lib/cube-access";
import { DEFAULT_DRAFT_CONFIG, totalMainCardsNeeded } from "@/lib/draft/config";
import { help, input, label as labelClass, link, panel } from "@/lib/ui";

import NewCubeFromList from "./new-cube-from-list";

export const metadata: Metadata = {
  title: "New cube",
};

const STARTS = ["clone", "list", "set", "empty"] as const;
type Start = (typeof STARTS)[number];

const START_COPY: Record<Start, { title: string; body: string }> = {
  clone: {
    title: "Clone a cube",
    body: "Start from a public cube someone has already built, and make it your own.",
  },
  list: {
    title: "Paste a list",
    body: "Bring a card list from a spreadsheet, a deck builder or another cube site.",
  },
  set: {
    title: "One of each card from a set",
    body: "Every card in a set, one copy each, filed by type.",
  },
  empty: {
    title: "Start empty",
    body: "Just a name. Add cards one at a time, or paste a list later.",
  },
};

/** How many cubes the clone list offers. Explore is there for the rest. */
const CLONE_LIST_SIZE = 12;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Four ways to start a cube, and **none of them creates it until you submit.**
 *
 * The name-only form this replaced produced empty cubes: four of the first 25
 * public ones never got a card. Every option here writes the cube and its
 * starting cards together, so walking away halfway leaves nothing behind.
 *
 * Which option is showing is `?start=`, so each is a plain link that works
 * before hydration, and the page reads only what the current option renders.
 * There is deliberately no `notFound()` anywhere below: this route has a
 * loading boundary, and a bad `?from=` should fall back to the chooser rather
 * than become a soft 404.
 */
export default async function NewCubePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string | string[]; from?: string | string[] }>;
}) {
  const [current, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");
  const profile = current.profile;

  const requested = one(params.start);
  const start = (STARTS as readonly string[]).includes(requested)
    ? (requested as Start)
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href={start ? "/cubes/new" : "/cubes"}
        className="text-sm text-subtle underline-offset-4 hover:underline"
      >
        {start ? "← Other ways to start" : "← Your cubes"}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">
        {start ? START_COPY[start].title : "New cube"}
      </h1>

      {start === null && (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">Pick how to get started.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {STARTS.map((option) => (
              <li key={option}>
                <Link
                  href={`/cubes/new?start=${option}`}
                  className={`block h-full p-4 transition-colors hover:bg-hover ${panel}`}
                >
                  <span className="font-medium text-ink">{START_COPY[option].title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {START_COPY[option].body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {start === "empty" && (
        <div className="max-w-lg">
          <p className="mt-1 mb-6 text-sm text-muted">
            Its URL comes from the name. You can rename it later without
            breaking the link.
          </p>
          <CubeForm action={createCubeAction} submitLabel="Create cube" />
        </div>
      )}

      {start === "list" && (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">
            Name the cube, then paste its cards. You&rsquo;ll see exactly what
            matched before anything is created.
          </p>
          <NewCubeFromList />
        </>
      )}

      {start === "set" && <FromSet />}

      {start === "clone" && (
        <FromClone from={one(params.from)} viewer={{ id: profile.id, username: profile.username }} />
      )}
    </div>
  );
}

async function FromSet() {
  const sets = await getStarterSets();

  return (
    <div className="max-w-lg">
      <p className="mt-1 mb-6 text-sm text-muted">
        One copy of every card in the set, with legends, battlefields and the
        rest each filed in their own section. Tokens and basic runes are left
        out. It&rsquo;s a big pool on purpose: cutting it down is the design.
      </p>
      <CubeForm action={createCubeAction} submitLabel="Create cube">
        <div>
          <label htmlFor="set" className={`mb-1 ${labelClass}`}>
            Set
          </label>
          <select id="set" name="set" required className={input}>
            {sets.map((set) => (
              <option key={set.code} value={set.code}>
                {`${set.label} (${set.cards} cards)`}
              </option>
            ))}
          </select>
        </div>
      </CubeForm>
    </div>
  );
}

async function FromClone({
  from,
  viewer,
}: {
  from: string;
  viewer: { id: string; username: string };
}) {
  // A specific cube: the no-JS and pre-hydration landing for a Clone button.
  // `canUseCube` before anything is read out of it, so a private cube's name
  // never pre-fills for someone who could not open it. Anything that does not
  // resolve falls through to the list rather than erroring.
  const [username, slug] = from.split("/");
  if (username && slug) {
    const source = await getCubeByOwnerAndSlug(username, slug);
    if (canUseCube(source, viewer.id)) {
      return (
        <div className={`mt-6 max-w-md p-5 ${panel}`}>
          <CloneCubeForm
            username={source.ownerUsername}
            slug={source.slug}
            sourceName={source.name}
            viewerUsername={viewer.username}
          />
        </div>
      );
    }
  }

  // Big enough to run the default draft, so a starting point is one you could
  // play. The count includes every section but the maybeboard, so it is a
  // floor rather than a guarantee, which is all a list like this needs.
  const minCards = totalMainCardsNeeded(DEFAULT_DRAFT_CONFIG);
  const cubes = await searchCubes({
    sort: "follows",
    limit: CLONE_LIST_SIZE,
    minCards,
    omitCover: true,
  });

  return (
    <>
      {/* Only cubes of at least `minCards` are listed; the page no longer says
          so, but it is why a small cube is missing from here. */}
      <p className="mt-1 mb-6 text-sm text-muted">The most followed public cubes.</p>
      {cubes.length === 0 ? (
        <p className={help}>No public cube is that big yet.</p>
      ) : (
        <ul className={`divide-y divide-line ${panel}`}>
          {cubes.map((cube) => (
            <li key={cube.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/cube/${cube.ownerUsername}/${cube.slug}`}
                  className="font-medium text-ink hover:underline"
                >
                  {cube.name}
                </Link>
                <p className="text-sm text-subtle">
                  by {cube.ownerUsername} · <span className="tabular-nums">{cube.cardCount}</span>{" "}
                  cards
                  {cube.followers > 0 && (
                    <>
                      {" "}· <span className="tabular-nums">{cube.followers}</span>{" "}
                      {cube.followers === 1 ? "follower" : "followers"}
                    </>
                  )}
                </p>
              </div>
              <CloneButton
                username={cube.ownerUsername}
                slug={cube.slug}
                sourceName={cube.name}
                viewerUsername={viewer.username}
                prominent={false}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-muted">
        Looking for something else?{" "}
        <Link href="/explore" className={link}>
          Search every public cube on Explore
        </Link>
        , then use Clone on the one you want.
      </p>
    </>
  );
}
