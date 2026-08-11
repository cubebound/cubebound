import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";

import Logo from "@/components/logo";
import ThemeToggle from "@/components/theme-toggle";
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

export const metadata: Metadata = {
  title: "cubebound.gg",
  description: "Build and draft Riftbound cubes.",
};

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
            <p className="text-xs leading-relaxed text-zinc-500">
              cubebound.gg is not endorsed by Riot Games and does not reflect the
              views or opinions of Riot Games or anyone officially involved in
              producing or managing Riot Games properties.
            </p>
            <div className="sm:ml-auto">
              <ThemeToggle initial={theme} />
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
