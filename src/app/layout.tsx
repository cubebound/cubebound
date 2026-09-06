import type { Metadata } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import "./globals.css";

import { Analytics } from "@vercel/analytics/next";

import Logo, { LogoMark } from "@/components/logo";
import ThemeToggle from "@/components/theme-toggle";
import { resolveSiteUrl } from "@/lib/site-url";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";

import NavAuth from "./nav-auth";
import NavLinks from "./nav-links";

/**
 * Two faces, both self-hosted by `next/font` — no external request, no layout
 * shift, no new dependency.
 *
 * Inter carries body text, card names and the dense cube tables, where
 * character becomes noise at 12–14px. Space Grotesk carries headings and the
 * wordmark, where it is the site's voice: squared-off, slightly technical,
 * deliberate. `globals.css` applies it to h1/h2/h3 in one rule so the site's
 * ~40 headings cannot drift apart.
 *
 * Geist Mono stays. Mono appears in three places — the error digest, the cube
 * URL on Settings, and `.primer code` — and swapping it would be churn for no
 * visible gain.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * `metadataBase` has to be resolved per request, not hardcoded.
 *
 * Next builds absolute `og:image` URLs against it, and a scraper only ever
 * fetches absolute ones — so a wrong base means no preview at all. The origin
 * comes from the request for the same reason the magic links do: production,
 * previews and localhost each need their own, with no configuration. See
 * `resolveSiteUrl`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = resolveSiteUrl(await headers());
  return {
    metadataBase: new URL(site),
    // The default is the homepage's title, and it is the strongest on-page
    // signal there is — so it names what the site *does*, not just the brand.
    // "cubebound.gg" alone ranked for nothing because nobody searches a brand
    // they have never heard of. The template keeps the suffix on every other
    // page, so page titles must not repeat it.
    title: {
      default: "Riftbound Cube Builder & Draft Simulator · cubebound.gg",
      template: "%s · cubebound.gg",
    },
    description:
      "Build a Riftbound cube from the full card pool, draft it against bots, " +
      "and share it. A free cube builder and draft simulator for Riftbound, " +
      "Riot's League of Legends TCG.",
    openGraph: {
      siteName: "cubebound.gg",
      type: "website",
      url: site,
    },
    // Large card, so a shared cube shows its art rather than a thumbnail.
    twitter: { card: "summary_large_image", site: "@cubeboundgg" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read on the server so the first paint is already the right theme; a
  // client-side decision would flash the wrong one on every navigation.
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased ${
        theme === "dark" ? "dark" : ""
      }`}
    >
      <body className="flex min-h-full flex-col bg-surface text-ink">
        {/* `raised` against the page's `surface`: one step of elevation is what
            separates the chrome from the content. The header used to be the
            page's own colour with a hairline under it, which read as flat. */}
        <header className="border-b border-line bg-raised">
          <nav className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
            {/* Below `sm` the wordmark goes and the mark stands alone: five nav
                items plus "cubebound.gg" ran a 320px phone past its own right
                edge. The mark is still the link home, and the accessible name
                moves onto it. */}
            <Logo size="sm" withWordmark={false} className="sm:hidden" />
            <Logo size="md" className="hidden sm:block" />
            <NavLinks />
            <NavAuth />
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-16 border-t border-line bg-raised">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
            {/* Brand and navigation lead; the Riot disclaimer sits below the
                rule. It is required on every page (see CLAUDE.md) and stays
                verbatim — this only stops it being the first thing the footer
                says. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <LogoMark size="sm" />
              <nav
                aria-label="Footer"
                className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted"
              >
                <Link
                  href="/guides/riftbound-cube-drafting"
                  className="transition-colors hover:text-ink"
                >
                  How to build and draft a cube
                </Link>
                <Link href="/explore" className="transition-colors hover:text-ink">
                  Explore cubes
                </Link>
                <Link href="/privacy" className="transition-colors hover:text-ink">
                  Privacy
                </Link>
                <a
                  href="https://x.com/cubeboundgg"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
                >
                  {/* Inline rather than an <img>: one 16px glyph is smaller as
                      markup than as a request, and it inherits currentColor so
                      it follows the theme without a second asset. */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-3.5 fill-current"
                  >
                    <path d="M18.9 2.2h3.4l-7.4 8.5 8.7 11.5h-6.8l-5.3-7-6.1 7H1.9l7.9-9.1L1.5 2.2h7l4.8 6.4 5.6-6.4Zm-1.2 18h1.9L7.4 4.1H5.4l12.3 16.1Z" />
                  </svg>
                  @cubeboundgg
                </a>
              </nav>
              <div className="ml-auto">
                <ThemeToggle initial={theme} />
              </div>
            </div>

            <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-subtle">
              cubebound.gg is not endorsed by Riot Games and does not reflect the
              views or opinions of Riot Games or anyone officially involved in
              producing or managing Riot Games properties.
            </p>
          </div>
        </footer>

        {/* Page views, cookieless. It reports the pathname, which for a cube is
            its URL — and an unlisted cube's URL is the secret the
            Referrer-Policy exists to protect. That is acceptable only because
            Vercel already logs every request path as the host, so this adds no
            new party; it would not be if analytics moved elsewhere. Off outside
            production so local navigation doesn't fill the dashboard. */}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
