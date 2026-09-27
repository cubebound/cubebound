"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import AddToCube from "@/components/add-to-cube";
import CardArt from "@/components/card-art";
import { CardDetail } from "@/components/card-visuals";
import type { BrowseCard } from "@/db/queries/cards";
import { cardThumb } from "@/lib/card-images";
import { cardPageName, type CardPopularityView } from "@/lib/card-popularity";
import { domainDot } from "@/lib/domain-columns";
import { aspectRatio } from "@/lib/riftbound";


export interface PairingRow {
  card: BrowseCard;
  /** "46%": of the cubes running the subject, how many also run this. */
  withPct: string;
  /** "15%": of every cube, how many run this. */
  overallPct: string;
  /** "3.1×": the two above divided, and what the rows are sorted by. */
  strength: string;
  /** This card's own page, or null below the owner floor. */
  pageHref: string | null;
}

/**
 * A percentage label as a dial's fill.
 *
 * Read back from the rounded label on purpose, never from an exact ratio: the
 * browser only ever receives what is printed, because an unrounded share of a
 * small denominator (6/13) is a cube count by another name. "under 1%" draws
 * as a sliver rather than as nothing, the same promise the label makes.
 */
function fillOf(label: string): number {
  if (label.startsWith("under")) return 0.01;
  const value = Number.parseInt(label, 10);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value / 100)) : 0;
}

/** A ring filled to the percentage, with the percentage in the middle. */
function Dial({ label, strong }: { label: string; strong?: boolean }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const fill = fillOf(label);
  return (
    <span className="relative inline-flex size-12 shrink-0 items-center justify-center sm:size-14">
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" className="stroke-line" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${fill * circumference} ${circumference}`}
          className={strong ? "stroke-accent-strong" : "stroke-subtle"}
        />
      </svg>
      <span className="relative text-[11px] font-semibold tabular-nums text-ink sm:text-xs">
        {label.startsWith("under") ? "<1%" : label}
      </span>
    </span>
  );
}

/**
 * The pairings as a table you can act on.
 *
 * The image and the name open the card's detail box, the same one the browser
 * uses, so a reader can judge a card without leaving the page; the arrow goes
 * to that card's own pairings page when it has one.
 */
export default function PairingTable({
  rows,
  subjectName,
  popularity,
}: {
  rows: PairingRow[];
  subjectName: string;
  /** For the detail box's own popularity line; keyed by printing id. */
  popularity: Record<string, CardPopularityView>;
}) {
  const [selected, setSelected] = useState<BrowseCard | null>(null);
  const close = useCallback(() => setSelected(null), []);

  const columns =
    "grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_3rem_3rem_1.25rem] items-center gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)_5rem_6rem_6rem_2rem] sm:gap-4";

  return (
    <>
      <div className="mt-8 overflow-hidden rounded-lg border border-line">
        <div
          className={`${columns} border-b border-line bg-sunken px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle sm:px-4`}
        >
          <span className="col-span-2">Card</span>
          <span
            className="text-center leading-tight"
            title={`How many times as often a card turns up in cubes with ${subjectName} as in cubes overall. The list is sorted by this.`}
          >
            Pairing
          </span>
          <span className="text-center leading-tight">With {subjectName}</span>
          <span className="text-center leading-tight">Overall</span>
          <span className="sr-only">Card page</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const name = cardPageName(row.card);
            const thumb = cardThumb(row.card.imageThumb);
            return (
              <li key={row.card.id} className={`${columns} px-3 py-2 sm:px-4`}>
                <button
                  type="button"
                  onClick={() => setSelected(row.card)}
                  aria-label={`Show ${name}`}
                  className="relative block w-full overflow-hidden rounded-md bg-sunken ring-1 ring-black/10 transition hover:ring-2 hover:ring-ink dark:ring-white/15"
                  style={{ aspectRatio: aspectRatio(row.card.type) }}
                >
                  <CardArt src={thumb} name={name} className="object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(row.card)}
                  className="flex min-w-0 items-center gap-2 text-left text-sm font-medium text-ink hover:text-accent"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                    style={{ background: domainDot(row.card.domains) }}
                  />
                  <span className="line-clamp-2 leading-snug [overflow-wrap:anywhere] sm:line-clamp-1">{name}</span>
                </button>
                <span
                  className="text-center text-sm font-semibold tabular-nums text-ink sm:text-base"
                  title={`Turns up ${row.strength} as often with ${subjectName} as overall`}
                >
                  {row.strength}
                </span>
                <span
                  className="flex justify-center"
                  title={`In ${row.withPct} of cubes with ${subjectName}`}
                >
                  <Dial label={row.withPct} strong />
                </span>
                <span className="flex justify-center" title={`In ${row.overallPct} of all cubes`}>
                  <Dial label={row.overallPct} />
                </span>
                {row.pageHref ? (
                  <Link
                    href={row.pageHref}
                    aria-label={`Cards commonly cubed with ${name}`}
                    title={`Cards commonly cubed with ${name}`}
                    className="text-lg text-accent transition-colors hover:text-accent-hover"
                  >
                    →
                  </Link>
                ) : (
                  <span aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {selected && (
        <CardDetail
          card={selected}
          onClose={close}
          popularity={popularity[selected.id]}
          footer={<AddToCube key={selected.id} cardId={selected.id} />}
        />
      )}
    </>
  );
}
