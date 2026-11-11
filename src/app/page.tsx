import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AuthHashError from "@/app/auth-hash-error";
import { SkeletonCardRow, SkeletonCubeCards, SkeletonRows } from "@/components/skeleton";
import { loadViewer } from "@/lib/cube-request";
import { btn, link } from "@/lib/ui";

import HeroFan, { HeroFanPlaceholder } from "./home-hero";
import {
  HowItWorks,
  MostCubedCards,
  MostFollowedCubes,
  RecentlyUpdated,
  SECTION,
  SectionHeading,
  YourCubesStrip,
} from "./home-sections";

// Title and description come from the layout's defaults; only the canonical is
// this page's own. The near-miss `?code=…` catch below means the landing page
// is reachable under a query string it should never be indexed under.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/** First value of a param that may arrive repeated. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The landing page also catches near-miss auth redirects.
 *
 * Supabase falls back to the project's Site URL when `emailRedirectTo` isn't on
 * the allowlist, which drops the visitor here with `?code=…` and nothing to
 * consume it — sign-in silently never completes. Forwarding to the callback
 * makes that self-heal instead of stranding the user. The PKCE verifier lives
 * in a cookie, so the exchange still works after the hop.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const code = one(params.code);
  const errorDescription = one(params.error_description) ?? one(params.error);

  if (code || errorDescription) {
    const forward = new URLSearchParams();
    if (code) forward.set("code", code);
    if (errorDescription) forward.set("error_description", errorDescription);
    const next = one(params.next);
    if (next?.startsWith("/")) forward.set("next", next);
    redirect(`/auth/callback?${forward.toString()}`);
  }

  // Signed in without a profile means the username was never claimed, and
  // cube creation needs one — send them to finish that instead of to a form
  // that would bounce them.
  const current = await loadViewer();
  const profile = current?.profile ?? null;

  // Signed out, browsing leads: a first-time visitor needs to see real cubes
  // before a form. The sign-in link carries `next` itself, because /cubes/new
  // bounces a signed-out visitor to a bare /login and the destination is lost.
  const browse = { href: "/explore", label: "Browse cubes" };
  const build = profile
    ? { href: "/cubes/new", label: "Create a cube" }
    : current
      ? { href: "/welcome", label: "Choose a username" }
      : { href: "/login?next=/cubes/new", label: "Build a cube" };
  const [primary, secondary] = current ? [build, browse] : [browse, build];

  // 44px of tap height and full width on a phone; the designed size from `sm`.
  const heroButton = "min-h-11 sm:min-h-0";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
      {/* The query-string self-heal above cannot see a fragment, and Supabase
          reports some OAuth failures that way — see auth-hash-error.tsx. */}
      <AuthHashError signedIn={Boolean(current)} />

      <section className="flex items-center gap-12 py-10 lg:py-20">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
          <h1 className="text-[34px] leading-[1.08] font-semibold lg:text-[52px] lg:leading-[1.05]">
            Cube construction and drafting for Riftbound
          </h1>
          <p className="max-w-[560px] text-base text-muted sm:text-lg">
            Build a cube, share it, and draft it against bots or with friends on
            Draftmancer. It&rsquo;s free, and you can export to Draftmancer
            without an account.
          </p>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={primary.href} className={`${btn.primary} ${heroButton}`}>
              {primary.label}
            </Link>
            <Link href={secondary.href} className={`${btn.secondary} ${heroButton}`}>
              {secondary.label}
            </Link>
          </div>
          <p className="text-sm text-subtle">
            New to cube?{" "}
            <Link href="/guides/riftbound-cube-drafting" className={link}>
              How Riftbound cube drafting works
            </Link>
          </p>
        </div>
        <Suspense fallback={<HeroFanPlaceholder />}>
          <HeroFan />
        </Suspense>
      </section>

      {/* Each section reads for itself inside its own boundary, so the hero
          paints at once and the queries run side by side. There is
          deliberately no `loading.tsx` on this route: it would commit a 200
          ahead of the `?code=` redirect above. See docs/routes.md. */}
      {profile && (
        <Suspense fallback={null}>
          <YourCubesStrip ownerId={profile.id} />
        </Suspense>
      )}

      <Suspense
        fallback={
          <section className={SECTION}>
            <SectionHeading title="Most-followed cubes" />
            <SkeletonCubeCards />
          </section>
        }
      >
        <MostFollowedCubes />
      </Suspense>

      <HowItWorks buildHref={build.href} />

      <Suspense
        fallback={
          <section className={SECTION}>
            <SectionHeading title="Most-cubed cards" />
            <SkeletonCardRow />
          </section>
        }
      >
        <MostCubedCards />
      </Suspense>

      <Suspense
        fallback={
          <section className={SECTION}>
            <SectionHeading title="Recently updated" />
            <SkeletonRows rows={5} />
          </section>
        }
      >
        <RecentlyUpdated viewerId={profile?.id ?? null} />
      </Suspense>
    </div>
  );
}
