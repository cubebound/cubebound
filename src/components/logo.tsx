import Link from "next/link";

/**
 * The brand mark, in one place.
 *
 * Every surface that shows the logo — the nav, the landing page, the
 * coming-soon pages and the 404 — renders this, so replacing the wordmark with
 * artwork is a change to this file alone rather than a hunt through the app.
 *
 * **To drop in an SVG:** put it at `public/logo.svg` and swap the wordmark
 * below for an `<img src="/logo.svg" alt="cubebound.gg" />` sized by `size`.
 * Keep the `<Link>` wrapper and the sizes; they are what the callers rely on.
 */

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-3xl",
} as const;

export type LogoSize = keyof typeof SIZES;

export function LogoMark({ size = "md" }: { size?: LogoSize }) {
  return (
    <span className={`${SIZES[size]} font-semibold tracking-tight whitespace-nowrap`}>
      cubebound<span className="text-zinc-400">.gg</span>
    </span>
  );
}

/** The logo as a link home. */
export default function Logo({
  size = "md",
  className = "",
}: {
  size?: LogoSize;
  className?: string;
}) {
  return (
    <Link href="/" className={className} aria-label="cubebound.gg home">
      <LogoMark size={size} />
    </Link>
  );
}
