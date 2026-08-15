import {
  BarChart,
  ChartDefs,
  Donut,
  Legend,
  Panel,
  StatCard,
} from "@/components/charts";
import { analyzeCube, type AnalyticsCard } from "@/lib/cube-analytics";

/** The keyword table's domain bars are 2.5px tall, so hard bands rather than a
 *  blend — see the note on MULTI_FILL in components/charts.tsx. */
const MULTI_BAND =
  "linear-gradient(135deg,#dc4a3d 0% 25%,#3b82d6 25% 50%,#3f9e5f 50% 75%,#9a5bd4 75% 100%)";

/**
 * The analytics tab.
 *
 * All six panels come from one `analyzeCube` call over the cube's cards — no
 * database work beyond the cards the page already loaded, and no client
 * JavaScript, so this is as cheap as any other tab.
 */
export default function CubeAnalyticsView({ cards }: { cards: AnalyticsCard[] }) {
  const stats = analyzeCube(cards);

  if (stats.total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        Add some cards and this fills in.
      </p>
    );
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="space-y-4">
      <ChartDefs />

      <Panel
        title="Energy curve"
        subtitle={
          stats.curve.costless > 0
            ? `By energy cost, split by domain. ${stats.curve.costless} card${
                stats.curve.costless === 1 ? "" : "s"
              } with no cost — legends, runes and battlefields — sit off this scale.`
            : "By energy cost, split by domain."
        }
      >
        <BarChart
          groups={stats.curve.buckets}
          max={stats.curve.max}
          height={280}
        />
        <Legend slices={stats.domains} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Domains" subtitle="Cards with two domains count once, as Multi.">
          <Donut slices={stats.domains} />
        </Panel>
        <Panel title="Card types" subtitle="Champions and signatures counted separately.">
          <Donut slices={stats.types} />
        </Panel>
        <Panel title="Rarity">
          <Donut slices={stats.rarities} />
        </Panel>
      </div>

      <Panel
        title="Rules text length"
        subtitle="Words per card, symbols resolved. Cards with no rules text count as zero."
      >
        <BarChart
          groups={stats.wordCounts.map((bucket) => ({
            label: bucket.label,
            total: bucket.count,
            segments: [
              { key: bucket.label, label: bucket.label, count: bucket.count, color: "#c9a23c" },
            ],
          }))}
          max={Math.max(1, ...stats.wordCounts.map((b) => b.count))}
          height={220}
        />
      </Panel>

      <Panel
        title={`Keywords (${stats.keywords.unique})`}
        subtitle="Read from each card's printed rules text — what the cube uses, how often, and which domains carry it."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard value={String(stats.keywords.unique)} label="Unique keywords" />
          <StatCard
            value={String(stats.keywords.instances)}
            label="Keyword instances"
            hint="keyword ↔ card pairings"
          />
          <StatCard
            value={String(stats.keywords.cardsWithKeywords)}
            label="Cards with keywords"
            hint={`${pct(stats.keywords.shareWithKeywords)} of the cube`}
          />
          <StatCard
            value={stats.keywords.mostCommon?.keyword ?? "—"}
            label="Most common"
            hint={
              stats.keywords.mostCommon
                ? `${stats.keywords.mostCommon.count} cards`
                : undefined
            }
          />
        </div>

        {stats.keywords.rows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Keyword</th>
                  <th className="py-2 pr-3 text-right font-medium">Cards</th>
                  <th className="py-2 pr-3 text-right font-medium">Share</th>
                  <th className="py-2 font-medium">Domains</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {stats.keywords.rows.map((row) => (
                  <tr key={row.keyword}>
                    <td className="py-1.5 pr-3 font-medium">{row.keyword}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{row.count}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">
                      {pct(row.share)}
                    </td>
                    <td className="py-1.5">
                      {/* A bar per domain rather than a list of names: at this
                          density the shape is readable and the words are not. */}
                      <span className="flex h-2.5 w-32 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                        {row.domains.map((domain) => (
                          <span
                            key={domain.key}
                            title={`${domain.key} ${domain.count}`}
                            style={{
                              width: `${(domain.count / row.count) * 100}%`,
                              background: domain.color ?? MULTI_BAND,
                            }}
                          />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
