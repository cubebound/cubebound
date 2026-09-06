"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The nav's section links, with a current-page indicator.
 *
 * A client component for one reason: the layout is server-rendered and the
 * active section is a function of the URL, which only `usePathname` reports
 * without threading a pathname through middleware into a header. The
 * alternative was setting `x-pathname` in `src/middleware.ts`, which handles
 * session refresh and the opengraph redirect and is not worth destabilising
 * for a underline.
 *
 * The indicator is drawn as an `::after` bar rather than a border so it does
 * not add to the link's box and shift the nav's height between pages.
 */

const SECTIONS = [
  { href: "/cards", label: "Cards" },
  { href: "/explore", label: "Explore" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {SECTIONS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative py-1 text-sm transition-colors ${
              active
                ? "font-medium text-ink after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-accent-strong"
                : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
