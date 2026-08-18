import { draftmancerPlan, type PlannableCard } from "@/lib/draftmancer-export";

/**
 * Offers the cube as a Draftmancer Custom Card List.
 *
 * Solo drafting here is one person against deliberately dumb bots. Draftmancer
 * is where eight actual people draft, and its custom-card support is what lets
 * it run a game it has never heard of — so this is the shortest path from a
 * cube to a real draft pod, and it is why the panel says what it is *for* and
 * not merely what it does.
 *
 * A **server** component: the whole interaction is a link to a route handler,
 * so there is nothing to hydrate, and the summary comes from the cards the page
 * has already loaded rather than a second query. Collapsed by default — it is a
 * power-user path, and the cube itself is what the page is for.
 */
export default function DraftmancerExport({
  cards,
  href,
}: {
  cards: PlannableCard[];
  href: string;
}) {
  const plan = draftmancerPlan(cards);
  if (plan.cardCount === 0) return null;

  return (
    <details className="mb-5 rounded-md border border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900">
        Export to Draftmancer
        <span className="ml-2 font-normal text-zinc-500">
          to draft this cube with other people
        </span>
      </summary>

      <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={href}
            download
            className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Download cube file
          </a>
          <span className="text-sm text-zinc-500">
            <span className="tabular-nums">{plan.cardCount}</span>{" "}
            {plan.cardCount === 1 ? "card" : "cards"}
            {plan.identityPerPack > 0 && (
              <>
                {" · packs of "}
                <span className="tabular-nums">{plan.packSize}</span>
                {": "}
                <span className="tabular-nums">{plan.mainPerPack}</span> main +{" "}
                <span className="tabular-nums">{plan.identityPerPack}</span> legend
                or battlefield
              </>
            )}
          </span>
        </div>

        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Download the file above.</li>
          <li>
            Open{" "}
            <a
              href="https://draftmancer.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium underline"
            >
              draftmancer.com
            </a>{" "}
            and create a session.
          </li>
          <li>
            Under <strong className="font-medium">Settings → Card List</strong>,
            choose <strong className="font-medium">Load Custom Card List</strong>{" "}
            and pick the file.
          </li>
        </ol>

        {plan.warnings.length > 0 && (
          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-500">
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <p className="text-xs text-zinc-500">
          Main, legends and battlefields are exported.{" "}
          <strong className="font-medium">Runes, sideboard and maybeboard are
          not</strong> — the same sections our own draft leaves out. Draftmancer
          bots have never seen a Riftbound card, so each one carries a 0–5 rating
          derived from its rarity to give them something to pick on.
        </p>
      </div>
    </details>
  );
}
