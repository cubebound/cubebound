import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CubeResults from "@/components/cube-results";
import Pagination from "@/components/pagination";
import { CUBES_PAGE_SIZE, searchCubesPage } from "@/db/queries/discovery";
import { getUserForModeration } from "@/db/queries/moderation";
import { UserModerationPanel } from "@/components/moderation-panel";
import { loadUserByUsername, loadViewer } from "@/lib/cube-request";

interface RouteParams {
  username: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await loadUserByUsername(username);
  if (!user) return { title: "Profile" };
  const description = `Riftbound cubes built by ${user.username}.`;
  return {
    title: user.username,
    description,
    alternates: { canonical: `/u/${user.username}` },
    openGraph: {
      title: user.username,
      description,
      type: "profile",
      url: `/u/${user.username}`,
    },
  };
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Someone's public page: the cubes they've made.
 *
 * Deliberately thin. Explore puts a username on every row and the cube URL
 * carries one, so both were link-shaped dead ends — this closes that loop and
 * nothing more. Drafts, stats and a bio can come later.
 *
 * It lists **public cubes only**, even for the owner viewing their own page,
 * because a profile is what other people see. Your own private and unlisted
 * cubes live on /cubes, which says so.
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  // Looking up the profile and the viewer are independent; both are remote
  // round trips, so they go together.
  const { username } = await params;
  const [user, current, query] = await Promise.all([
    loadUserByUsername(username),
    loadViewer(),
    searchParams,
  ]);
  if (!user) notFound();

  const keywords = one(query.q).slice(0, 100);
  const isYou = current?.profile?.id === user.id;
  const isAdmin = Boolean(current?.profile?.isAdmin);
  // Only an admin pays for this query; nobody else can see what it feeds.
  const moderation = isAdmin ? await getUserForModeration(user.username) : null;

  const { cubes, total, page, pageCount } = await searchCubesPage({
    ownerId: user.id,
    keywords,
    viewerId: current?.profile?.id ?? null,
    page: Number(one(query.page)) || 1,
  });

  const basePath = `/u/${user.username}`;
  const href = (next: { q?: string; page?: number }) => {
    const search = new URLSearchParams();
    const q = next.q ?? keywords;
    if (q) search.set("q", q);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const string = search.toString();
    return string ? `${basePath}?${string}` : basePath;
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {moderation && (
        <div className="mb-6">
          <UserModerationPanel
            username={moderation.username}
            suspended={Boolean(moderation.suspendedAt)}
            cubeCount={moderation.cubeCount}
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        {/* The same initial the nav avatar uses, so you recognise the account. */}
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-medium text-surface"
        >
          {user.username.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{user.username}</h1>
          <p className="mt-0.5 text-sm text-muted">
            <span className="tabular-nums">{total}</span> public{" "}
            {total === 1 ? "cube" : "cubes"}
            {isYou && (
              <>
                {" · "}
                <Link href="/cubes" className="underline underline-offset-2">
                  manage yours
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <form method="GET" action={basePath} className="mt-6 flex gap-2">
        <input
          name="q"
          defaultValue={keywords}
          placeholder={`Search ${isYou ? "your" : `${user.username}'s`} cubes…`}
          aria-label="Search these cubes"
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 text-sm"
        />
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center rounded-md border border-line px-4 text-sm font-medium hover:bg-hover"
        >
          Search
        </button>
      </form>

      <div className="mt-4">
        <CubeResults
          cubes={cubes}
          returnPath={basePath}
          signedIn={Boolean(current?.profile)}
          empty={
            keywords ? (
              <>
                Nothing matches <span className="font-medium">{keywords}</span>.{" "}
                <Link href={href({ q: "", page: 1 })} className="underline underline-offset-4">
                  Clear the search
                </Link>
              </>
            ) : isYou ? (
              <>
                None of your cubes are public yet. Set one to public in its
                settings and it&rsquo;ll show up here.
              </>
            ) : (
              <>{user.username} hasn&rsquo;t made any public cubes yet.</>
            )
          }
        />
      </div>

      {pageCount > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={CUBES_PAGE_SIZE}
            href={(target) => href({ page: target })}
            label="cubes"
          />
        </div>
      )}
    </div>
  );
}
