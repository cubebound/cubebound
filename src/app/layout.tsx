import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import "./globals.css";

import { Analytics } from "@vercel/analytics/next";

import Logo from "@/components/logo";
import ThemeToggle from "@/components/theme-toggle";
import { resolveSiteUrl } from "@/lib/site-url";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";

import NavAuth from "./nav-auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
    title: {
      default: "cubebound.gg",
      template: "%s · cubebound.gg",
    },
    description: "Build and draft Riftbound cubes.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${
        theme === "dark" ? "dark" : ""
      }`}
    >
      <body className="flex min-h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
            {/* Below `sm` the wordmark goes and the mark stands alone: five nav
                items plus "cubebound.gg" ran a 320px phone past its own right
                edge. The mark is still the link home, and the accessible name
                moves onto it. */}
            <Logo size="sm" withWordmark={false} className="sm:hidden" />
            <Logo size="md" className="hidden sm:block" />
            <Link
              href="/cards"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Cards
            </Link>
            <Link
              href="/explore"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Explore
            </Link>
            <NavAuth />
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 sm:flex-row sm:items-start sm:px-6">
            <div className="min-w-0">
              <p className="text-xs leading-relaxed text-zinc-500">
                cubebound.gg is not endorsed by Riot Games and does not reflect
                the views or opinions of Riot Games or anyone officially involved
                in producing or managing Riot Games properties.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                <a
                  href="https://x.com/cubeboundgg"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
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
              </p>
            </div>
            <div className="sm:ml-auto">
              <ThemeToggle initial={theme} />
            </div>
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
