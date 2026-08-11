import Link from "next/link";

/**
 * The brand mark, in one place.
 *
 * Every surface that shows the logo — the nav, the landing page, the
 * coming-soon pages and the 404 — renders this, so changing the artwork is a
 * change to this file alone.
 *
 * The mark is `public/logo.svg`, drawn on a 320×300 viewBox. It carries a lot
 * of small detail (dashed rear edges, sparkles, 1px card strokes) so it needs
 * real size to read — hence 26px even in the nav, rather than the 16–20px an
 * icon-only mark could get away with. Width and height are both set so the
 * header does not jump while the file loads.
 *
 * Served as an `<img>` rather than inlined: the file repeats fixed `id`s
 * (`cbTitle`, `cbDesc`), and inlining it on a page that shows the logo twice
 * would duplicate them. As an image its internal title is ignored anyway, so
 * the accessible name comes from `alt`.
 */

const SIZES = {
  sm: { mark: 26, text: "text-sm" },
  md: { mark: 30, text: "text-base" },
  lg: { mark: 64, text: "text-3xl" },
} as const;

export type LogoSize = keyof typeof SIZES;

/** viewBox is 320 × 300, so width is a touch wider than height. */
const ASPECT = 320 / 300;

export function LogoMark({
  size = "md",
  withWordmark = true,
}: {
  size?: LogoSize;
  withWordmark?: boolean;
}) {
  const { mark, text } = SIZES[size];

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt={withWordmark ? "" : "cubebound.gg"}
        aria-hidden={withWordmark || undefined}
        width={Math.round(mark * ASPECT)}
        height={mark}
        className="shrink-0"
      />
      {withWordmark && (
        <span className={`${text} font-semibold tracking-tight whitespace-nowrap`}>
          cubebound<span className="text-zinc-400">.gg</span>
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
