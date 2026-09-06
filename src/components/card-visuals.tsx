"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import type { BrowseCard } from "@/db/queries/cards";
import CardArt from "@/components/card-art";
import { cardFull, cardThumb } from "@/lib/card-images";
import { domainDot } from "@/lib/domain-columns";
import { aspectRatio, DOMAIN_COLORS, titleCase, totalPips } from "@/lib/riftbound";
import { parseRulesText, type RulesSymbol } from "@/lib/rules-text";

/* Shared between the card browser and the cube editor.
   Card images come straight from the source CDN — we deliberately do not proxy
   or re-optimize them yet (see CLAUDE.md), so next/image is not used. */

export function DomainDots({ domains }: { domains: string[] }) {
  if (domains.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label={domains.join(", ")}>
      {domains.map((domain) => (
        <span
          key={domain}
          title={domain}
          className="size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/15"
          style={{ backgroundColor: DOMAIN_COLORS[domain] ?? "#9aa0a6" }}
        />
      ))}
    </span>
  );
}

/** Energy is the generic cost; distinct from Power pips and from Might. */
export function EnergyChip({ energy }: { energy: number | null }) {
  if (energy === null) return null;
  return (
    <span
      title={`Energy ${energy}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
    >
      {energy}
    </span>
  );
}

/** Power is a domain-specific pip cost in Riftbound, not a combat stat. */
export function PowerPips({ powerCost }: { powerCost: Record<string, number> | null }) {
  if (!powerCost) return null;
  const pips = Object.entries(powerCost).flatMap(([domain, n]) =>
    Array.from({ length: n }, (_, i) => ({ domain, key: `${domain}-${i}` })),
  );
  if (pips.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {pips.map(({ domain, key }) => {
        const color = DOMAIN_COLORS[titleCase(domain)];
        return (
          <span
            key={key}
            title={color ? `${titleCase(domain)} power` : "Power (any domain)"}
            className="size-3 rounded-full ring-1 ring-black/15 dark:ring-white/20"
            style={{ backgroundColor: color ?? "transparent" }}
          />
        );
      })}
    </span>
  );
}

/**
 * Power cost for a dense row: the pip count, then one dot for its domain.
 *
 * `PowerPips` draws a dot per pip, which is faithful where there is room. A cube
 * list row has about 19px to spare beside a name that already truncates, so this
 * renders the *count* instead: constant width whatever the cost, where a run of
 * pips grows with it and would need an arbitrary cap. The digit carries the
 * number and the dot carries the colour, which is the whole of what the row
 * needs — the cost cell above it already states the energy.
 *
 * **No `title` attribute**, deliberately. A tooltip here lands on top of the
 * hover preview the same gesture just opened — the reason the card name lost
 * its own `title`, explained at length in cube-table.tsx. The `aria-label`
 * carries the same words without drawing anything.
 *
 * A card with no power cost renders nothing rather than a 0: costless is not
 * zero, and `totalPips` returns 0 for both.
 */
export function PowerCost({
  powerCost,
  domains,
}: {
  powerCost: Record<string, number> | null;
  /** The card's own domains, for the `{"any": n}` case below. */
  domains: string[];
}) {
  const total = totalPips(powerCost);
  if (total === 0) return null;

  // Sources cannot say which domain the pips belong to on a multi-domain card,
  // so those arrive as `{"any": n}`. Fall back to the card's own domains, which
  // is the same split `domainDot` draws in the column header above — the pips
  // certainly belong to those domains even though the breakdown is unknown, and
  // a hard-banded dot claims no more than the header's does. A named domain
  // still wins when a source ever provides one.
  const known = Object.keys(powerCost ?? {})
    .map(titleCase)
    .filter((domain) => DOMAIN_COLORS[domain]);
  const tint = known.length > 0 ? known : domains;

  return (
    <span
      aria-label={`Power ${total}${tint.length > 0 ? ` ${tint.join("/")}` : ""}`}
      className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400"
    >
      {total}
      <span
        className="size-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/20"
        style={{ background: domainDot(tint) }}
      />
    </span>
  );
}

/** One `:rb_*:` token rendered as an inline badge. */
function SymbolBadge({ symbol }: { symbol: RulesSymbol }) {
  const shared = "mx-0.5 inline-flex shrink-0 items-center justify-center align-[-0.15em]";

  switch (symbol.kind) {
    case "energy":
      return (
        <span
          title={symbol.label}
          className={`${shared} size-[1.15em] rounded-full bg-zinc-700 text-[0.72em] font-semibold tabular-nums text-white dark:bg-zinc-300 dark:text-zinc-900`}
        >
          {symbol.value}
        </span>
      );
    case "power":
      return (
        <span
          title={symbol.label}
          className={`${shared} size-[0.85em] rounded-full ring-1 ring-black/20 dark:ring-white/25`}
          style={
            symbol.domain
              ? { backgroundColor: DOMAIN_COLORS[symbol.domain] }
              : {
                  // Wild Power pays any domain — show it as the domain wheel.
                  backgroundImage: `conic-gradient(${Object.values(DOMAIN_COLORS)
                    .slice(0, 6)
                    .join(",")},${DOMAIN_COLORS.Fury})`,
                }
          }
        />
      );
    case "might":
      return (
        <span title="Might" className={`${shared} font-semibold text-zinc-700 dark:text-zinc-300`}>
          ⚔
        </span>
      );
    case "exhaust":
      return (
        <span title="Exhaust" className={`${shared} font-semibold text-zinc-700 dark:text-zinc-300`}>
          ⟳
        </span>
      );
    default:
      // Unmapped token from a future set: show its readable name, not `:rb_…:`.
      return (
        <span title={symbol.token} className={`${shared} italic`}>
          {symbol.label}
        </span>
      );
  }
}

export function RulesText({ text }: { text: string }) {
  return (
    <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      {parseRulesText(text).map((node, i) => {
        if (node.type === "text") return <span key={i}>{node.value}</span>;
        if (node.type === "keyword") {
          return (
            <span
              key={i}
              className="mx-0.5 rounded bg-zinc-200 px-1 py-px text-[0.85em] font-semibold text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
            >
              {node.value}
            </span>
          );
        }
        return <SymbolBadge key={i} symbol={node.symbol} />;
      })}
    </p>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="flex items-center gap-1.5 text-sm text-zinc-900 dark:text-zinc-100">
        {children}
      </dd>
    </div>
  );
}

export function CardDetail({
  card,
  onClose,
  footer,
}: {
  card: BrowseCard;
  onClose: () => void;
  /** Extra controls, e.g. the cube editor's add button. */
  footer?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col gap-6 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl md:flex-row dark:bg-zinc-900"
      >
        <div className="w-full shrink-0 md:w-80" style={{ aspectRatio: aspectRatio(card.type) }}>
          {card.imageFull ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardFull(card.imageFull) ?? undefined}
              alt={card.name}
              className="size-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex size-full items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-800">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {card.name}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {card.setCode} · #{card.collectorNo} · {card.rarity}
              </p>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-md px-2 py-1 text-xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ×
            </button>
          </div>

          <dl className="mt-5 space-y-2.5">
            <Stat label="Type">{card.type}</Stat>
            <Stat label="Domains">
              {card.domains.length > 0 ? (
                <>
                  <DomainDots domains={card.domains} />
                  <span>{card.domains.join(" / ")}</span>
                </>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </Stat>
            {card.energyCost !== null && (
              <Stat label="Energy">
                <EnergyChip energy={card.energyCost} />
              </Stat>
            )}
            {card.powerCost && (
              <Stat label="Power">
                <PowerPips powerCost={card.powerCost} />
              </Stat>
            )}
            {card.might !== null && <Stat label="Might">{card.might}</Stat>}
            {/* The type line's trait half. Shown as links so a card is a way
                into "everything else from Ionia" — the filter exists, and this
                is where someone is actually wondering about it. */}
            {card.tags.length > 0 && (
              <Stat label="Traits">
                <span className="flex flex-wrap gap-1">
                  {card.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/cards?trait=${encodeURIComponent(tag)}`}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                    >
                      {tag}
                    </Link>
                  ))}
                </span>
              </Stat>
            )}
            {card.artist && <Stat label="Artist">{card.artist}</Stat>}
          </dl>

          {card.rulesText && (
            <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <RulesText text={card.rulesText} />
            </div>
          )}

          {card.printingCount > 1 && (
            <p className="mt-4 text-xs text-zinc-500">
              {card.printingCount} printings of this card.
            </p>
          )}

          {footer && <div className="mt-5">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function CardTile({
  card,
  onOpen,
  action,
  showPrintingCount = true,
  dimmed = false,
  quantity,
}: {
  card: BrowseCard;
  onOpen: () => void;
  /** Rendered under the tile. Must not contain the tile's own button. */
  action?: ReactNode;
  showPrintingCount?: boolean;
  dimmed?: boolean;
  /** Copies of this printing in the cube; the badge shows only above one. */
  quantity?: number;
}) {
  const thumb = cardThumb(card.imageThumb ?? card.imageFull);
  return (
    <li className="self-start">
      <button
        onClick={onOpen}
        className="group block w-full cursor-pointer text-left"
        aria-label={`View ${card.name}`}
      >
        <div
          className={`relative overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-black/5 transition group-hover:ring-2 group-hover:ring-zinc-400 group-focus-visible:ring-2 group-focus-visible:ring-zinc-500 dark:bg-zinc-800 dark:ring-white/10 ${dimmed ? "opacity-45" : ""}`}
          style={{ aspectRatio: aspectRatio(card.type) }}
        >
          {/* Retries a failed fetch before settling on the name: this grid
              shows sixty tiles at once, so a transient CDN blip used to leave
              broken images with nothing to identify them. */}
          <CardArt
            src={thumb}
            name={card.name}
            className="object-cover transition group-hover:scale-[1.02]"
          />
          {/* Printing count is a bare number, not "×N" — that reads as a
              quantity, and a tile can show both at once. */}
          {showPrintingCount && card.printingCount > 1 && (
            <span
              title={`${card.printingCount} printings of this card`}
              className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white ring-1 ring-white/25"
            >
              {card.printingCount}
            </span>
          )}
          {quantity !== undefined && quantity > 0 && (
            <span
              title={`${quantity} in this cube`}
              className="absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
            >
              ×{quantity}
            </span>
          )}
        </div>
        {/* Fixed height: the energy chip is taller than bare text, and without
            this the tiles that have one push their action row out of line with
            the tiles that don't. */}
        <div className="mt-1.5 flex h-5 items-center gap-1.5">
          <DomainDots domains={card.domains} />
          <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">{card.name}</span>
          <span className="ml-auto">
            <EnergyChip energy={card.energyCost} />
          </span>
        </div>
      </button>
      {action && <div className="mt-1.5">{action}</div>}
    </li>
  );
}

export const CARD_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
