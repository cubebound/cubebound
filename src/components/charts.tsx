import type { Slice } from "@/lib/cube-analytics";

/**
 * Charts, drawn by hand in SVG and CSS.
 *
 * No charting library on purpose. Every one of these is a static picture of
 * server-computed numbers with no interaction, so a library would ship a
 * client bundle and force these panels into client components to render
 * something a few `<circle>`s already do. It also keeps the whole analytics
 * tab renderable with JavaScript switched off.
 *
 * Multi-domain slices are drawn as a gradient rather than a flat colour:
 * nothing flat can mean "more than one domain" without colliding with a real
 * one — gold reads as Order — which is the same reason the text view blends a
 * pair's tint instead of inventing a seventh colour.
 */

const MULTI_GRADIENT_ID = "cb-multi-gradient";

/**
 * How "more than one domain" is drawn, at two sizes.
 *
 * Large fills — a donut arc, a bar segment — take the smooth blend. Small dots
 * take **hard bands**, the same technique as `domainDot` in
 * `src/lib/domain-columns.ts`: a blend averages to mud below about 12px, which
 * is the whole reason the text view splits a pair's header dot rather than
 * mixing it.
 */
const MULTI_FILL = "linear-gradient(135deg,#dc4a3d,#3b82d6 33%,#3f9e5f 66%,#9a5bd4)";
const MULTI_DOT =
  "linear-gradient(135deg,#dc4a3d 0% 25%,#3b82d6 25% 50%,#3f9e5f 50% 75%,#9a5bd4 75% 100%)";

/** Background for a swatch of the given size class. */
const swatch = (color: string | null, size: "dot" | "fill") =>
  color ?? (size === "dot" ? MULTI_DOT : MULTI_FILL);

/** Defined once per page; SVG ids are document-global. */
export function ChartDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <linearGradient id={MULTI_GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dc4a3d" />
          <stop offset="33%" stopColor="#3b82d6" />
          <stop offset="66%" stopColor="#3f9e5f" />
          <stop offset="100%" stopColor="#9a5bd4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const fill = (color: string | null) => color ?? `url(#${MULTI_GRADIENT_ID})`;

export function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * A donut, drawn as one circle per slice using `stroke-dasharray`.
 *
 * Each slice is the full circle stroked for its own arc length and rotated to
 * where it starts, which is far less arithmetic than building arc paths and
 * cannot produce a malformed `d` attribute.
 */
export function Donut({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((n, s) => n + s.count, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-zinc-500">Nothing to chart yet.</p>;
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  // Arc length and start offset per slice, computed up front rather than by
  // accumulating inside the map — the React Compiler's immutability rule
  // rejects the running total, and a plain scan is clearer regardless.
  const arcs = slices.reduce<{ slice: Slice; length: number; offset: number }[]>(
    (acc, slice) => {
      const previous = acc.at(-1);
      const offset = previous ? previous.offset + previous.length : 0;
      return [...acc, { slice, length: (slice.count / total) * circumference, offset }];
    },
    [],
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg viewBox="0 0 160 160" className="size-40 shrink-0" role="img" aria-label={`${total} cards`}>
        <g transform="rotate(-90 80 80)">
          {arcs.map(({ slice, length, offset }) => (
            <circle
              key={slice.key}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={fill(slice.color)}
              strokeWidth="26"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
            />
          ))}
        </g>
      </svg>

      <ul className="min-w-0 space-y-1 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ background: swatch(slice.color, "dot") }}
            />
            <span className="truncate">{slice.label}</span>
            <span className="ml-auto pl-3 tabular-nums text-zinc-500">
              {slice.count}
              <span className="ml-1 text-xs">
                ({Math.round((slice.count / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarGroup {
  label: string;
  total: number;
  segments: Slice[];
}

/**
 * Stacked bars for the curve, and plain bars for the histogram — the same
 * component, because a histogram is a stack of one.
 *
 * Heights are percentages of the tallest bar, so the chart fills its box at any
 * cube size. The tallest bar is passed in rather than derived, so two charts
 * shown together can share a scale if a caller wants that.
 */
export function BarChart({
  groups,
  max,
  height = 260,
}: {
  groups: BarGroup[];
  max: number;
  height?: number;
}) {
  if (groups.length === 0 || max === 0) {
    return <p className="py-10 text-center text-sm text-zinc-500">Nothing to chart yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[28rem] items-end gap-2" style={{ height }}>
        {groups.map((group) => (
          <div key={group.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <p className="mb-1 text-center text-[11px] tabular-nums text-zinc-500">
              {group.total > 0 ? group.total : ""}
            </p>
            {/* One column per bucket; the segments stack bottom-up, which is
                why they render in reverse. */}
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t"
              style={{ height: `${(group.total / max) * 100}%` }}
              title={`${group.label}: ${group.total}`}
            >
              {group.segments.map((segment) => (
                <div
                  key={segment.key}
                  style={{
                    height: `${(segment.count / Math.max(group.total, 1)) * 100}%`,
                    background: swatch(segment.color, "fill"),
                  }}
                  title={`${segment.label} ${segment.count}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex min-w-[28rem] gap-2">
        {groups.map((group) => (
          <p
            key={group.label}
            className="min-w-0 flex-1 truncate text-center text-xs tabular-nums text-zinc-500"
          >
            {group.label}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Legend({ slices }: { slices: Slice[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
      {slices.map((slice) => (
        <li key={slice.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: swatch(slice.color, "dot") }}
          />
          {slice.label}
        </li>
      ))}
    </ul>
  );
}

export function StatCard({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 text-center dark:border-zinc-800">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
