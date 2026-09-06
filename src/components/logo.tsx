import Link from "next/link";

/**
 * The brand mark, in one place.
 *
 * Every surface that shows the logo — the nav, the landing page, the
 * coming-soon pages and the 404 — renders this, so changing the artwork is a
 * change to this file alone.
 *
 * **There are two marks, and the size picks between them.** `public/logo.svg`
 * is the detailed one: a 320×300 viewBox carrying dashed rear edges, five
 * floating cards and sparkles. Its strokes are 1.2–2px on that viewBox, which
 * at the nav's 26–30px works out to roughly 0.15 CSS pixels — below what a
 * display can paint, so the cube's own edges greyed out and shimmered. That is
 * why `lg` (64px) gets the detailed file and `sm`/`md` get
 * `public/logo-mark.svg`, redrawn at 64×64 with strokes heavy enough to survive
 * the scale. Same reasoning, and the same geometry, as `src/app/icon.svg`.
 *
 * Served as `<img>` rather than inlined: both files carry fixed `id`s, and
 * inlining on a page that shows the logo twice would duplicate them. As an
 * image the internal title is ignored anyway, so the accessible name comes
 * from `alt`. Width and height are both set so the header does not jump while
 * the file loads.
 */

const SIZES = {
  sm: { mark: 26, text: "text-sm" },
  md: { mark: 30, text: "text-base" },
  lg: { mark: 64, text: "text-3xl" },
} as const;

export type LogoSize = keyof typeof SIZES;

/** The detailed mark's viewBox is 320 × 300; the small one is square. */
const DETAILED_ASPECT = 320 / 300;

export function LogoMark({
  size = "md",
  withWordmark = true,
}: {
  size?: LogoSize;
  withWordmark?: boolean;
}) {
  const { mark, text } = SIZES[size];
  const detailed = size === "lg";
  const width = Math.round(mark * (detailed ? DETAILED_ASPECT : 1));

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={detailed ? "/logo.svg" : "/logo-mark.svg"}
        alt={withWordmark ? "" : "cubebound.gg"}
        aria-hidden={withWordmark || undefined}
        width={width}
        height={mark}
        className="shrink-0"
      />
      {withWordmark && (
        <span className={`${text} font-display font-semibold whitespace-nowrap`}>
          cubebound<span className="text-subtle">.gg</span>
        </span>
      )}
    </span>
  );
}

/** The logo as a link home. */
export default function Logo({
  size = "md",
  withWordmark = true,
  className = "",
}: {
  size?: LogoSize;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <Link href="/" className={className} aria-label="cubebound.gg home">
      <LogoMark size={size} withWordmark={withWordmark} />
    </Link>
  );
}
