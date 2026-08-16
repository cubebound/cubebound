import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/** Share-preview routes: `/opengraph-image` and the per-cube/profile ones. */
const OG_SUFFIX = "/opengraph-image";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.endsWith(OG_SUFFIX)) {
    /**
     * Share previews get no session work and exactly one cache entry each.
     *
     * They are fetched by scrapers, which carry no cookies, so refreshing a
     * session on them is a Supabase round trip per scrape for a route that
     * could not use the result.
     *
     * The query string is stripped because **Vercel's CDN keys on the full
     * URL**, and these are the most expensive unauthenticated endpoint on the
     * site: a database read, a fetch of the cover art from Riot, and a PNG
     * render. Measured against production, `/cube/…/opengraph-image?cb=<random>`
     * missed the cache every time and took 1–2.5s, so an attacker with a loop
     * could bypass the day-long cache indefinitely. Redirecting to the bare
     * path collapses every variant onto one entry, and the redirect itself is
     * edge-cached.
     *
     * **Next appends its own hash** to these URLs (`?429e02205bb3ec5b`), which
     * is why this must be a redirect rather than a rewrite — a rewrite would
     * leave the CDN keying on the original URL and change nothing. Legitimate
     * scrapers therefore take one extra, edge-cached hop; `check:share-previews`
     * follows it and asserts real PNG bytes still arrive.
     */
    if (search) {
      const canonical = new URL(request.url);
      canonical.search = "";
      return NextResponse.redirect(canonical, 308);
    }
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
