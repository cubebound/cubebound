"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { aspectRatio, DOMAIN_COLORS, COLORLESS } from "@/lib/riftbound";

import {
  makePickAction,
  saveDraftAsCubeAction,
  startDraftAction,
  type DraftActionState,
} from "./actions";

export interface DraftTile {
  id: string;
  name: string;
  type: string;
  domains: string[];
  imageThumb: string | null;
  energyCost: number | null;
}

function domainDot(domains: string[]): string {
  if (domains.length === 0) return DOMAIN_COLORS[COLORLESS];
  if (domains.length === 1) return DOMAIN_COLORS[domains[0]] ?? DOMAIN_COLORS[COLORLESS];
  const step = 100 / domains.length;
  const bands = domains.map(
    (d, i) => `${DOMAIN_COLORS[d] ?? DOMAIN_COLORS[COLORLESS]} ${i * step}% ${(i + 1) * step}%`,
  );
  return `linear-gradient(135deg, ${bands.join(", ")})`;
}

/** Start screen: what the draft will be, plus anything worth knowing first. */
export function StartDraft({
  cubeId,
  returnPath,
  summary,
  warnings,
  blocked,
}: {
  cubeId: string;
  returnPath: string;
  summary: string;
  warnings: string[];
  blocked: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<DraftActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary}</p>

      {warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {warning}
        </p>
      ))}

      {blocked ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {blocked}
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await startDraftAction(cubeId, returnPath);
              setState(result);
              if (!result.error) router.refresh();
            })
          }
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Dealing…" : "Start draft"}
        </button>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </div>
  );
}

function CardButton({
  card,
  onPick,
  disabled,
}: {
  card: DraftTile;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        title={`Pick ${card.name}`}
        className="group block w-full text-left disabled:opacity-50"
      >
        <div
          className="overflow-hidden rounded-lg ring-1 ring-black/10 transition group-hover:ring-2 group-hover:ring-zinc-900 dark:ring-white/15 dark:group-hover:ring-zinc-100"
          style={{ aspectRatio: aspectRatio(card.type) }}
        >
          {card.imageThumb ? (
            // Plain <img> on purpose — see CLAUDE.md on not proxying card art.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageThumb}
              alt={card.name}
              loading="lazy"
              className="size-full object-contain"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-zinc-100 p-2 text-center text-xs dark:bg-zinc-900">
              {card.name}
            </div>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
            style={{ background: domainDot(card.domains) }}
          />
          <span className="truncate">{card.name}</span>
          {card.energyCost !== null && (
            <span className="ml-auto tabular-nums text-zinc-500">{card.energyCost}</span>
          )}
        </p>
      </button>
    </li>
  );
}

/** Pool, grouped by domain combination. */
export function Pool({ cards, title }: { cards: DraftTile[]; title: string }) {
  const groups = new Map<string, DraftTile[]>();
  for (const card of cards) {
    const key = card.domains.length === 0 ? COLORLESS : card.domains.join("/");
    const bucket = groups.get(key) ?? [];
    bucket.push(card);
    groups.set(key, bucket);
  }
  const keys = [...groups.keys()].sort();

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
        <span className="ml-2 font-normal tabular-nums">{cards.length}</span>
      </h2>
      {cards.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing picked yet.</p>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div key={key}>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <span
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                  style={{ background: domainDot(key === COLORLESS ? [] : key.split("/")) }}
                />
                {key}
                <span className="tabular-nums text-zinc-500">
                  ({groups.get(key)!.length})
                </span>
              </p>
              <ul className="space-y-0.5 text-sm">
                {groups
                  .get(key)!
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((card, i) => (
                    <li key={`${card.id}-${i}`} className="truncate">
                      {card.name}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Pick screen: the pack in front of you, the counter, and your pool. */
export function PickScreen({
  draftId,
  returnPath,
  pack,
  pool,
  round,
  pickNumber,
  totalRounds,
  packSize,
}: {
  draftId: string;
  returnPath: string;
  pack: DraftTile[];
  pool: DraftTile[];
  round: number;
  pickNumber: number;
  totalRounds: number;
  packSize: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Pack <span className="font-medium tabular-nums">{round + 1}</span> of{" "}
          <span className="tabular-nums">{totalRounds}</span> · pick{" "}
          <span className="font-medium tabular-nums">{pickNumber + 1}</span> of{" "}
          <span className="tabular-nums">{packSize}</span>
          {pending && <span className="ml-2 text-zinc-500">Bots picking…</span>}
        </p>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {pack.map((card, index) => (
            <CardButton
              key={`${card.id}-${index}`}
              card={card}
              disabled={pending}
              onPick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await makePickAction(draftId, card.id, returnPath);
                  if (result.error) setError(result.error);
                  else router.refresh();
                })
              }
            />
          ))}
        </ul>
      </div>

      <Pool cards={pool} title="Your pool" />
    </div>
  );
}

/** End screen: the finished pool, and a way to keep it. */
export function EndScreen({
  draftId,
  pool,
  defaultName,
}: {
  draftId: string;
  pool: DraftTile[];
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Save this pool as a cube</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-72 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await saveDraftAsCubeAction(draftId, name);
              if (result?.error) setError(result.error);
            })
          }
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Saving…" : "Save as cube"}
        </button>
        <span className="text-sm text-zinc-500">Creates a private cube you own.</span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Pool cards={pool} title="Your drafted pool" />
    </div>
  );
}
