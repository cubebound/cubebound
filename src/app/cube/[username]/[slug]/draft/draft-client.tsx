"use client";

import { useState, useTransition } from "react";

import { aspectRatio } from "@/lib/riftbound";

import {
  makePickAction,
  saveDraftAsCubeAction,
  setCardBoardAction,
  startDraftAction,
  type DraftActionState,
} from "./actions";
import PoolPiles, { domainDot, type PoolCard } from "./pool-piles";

export interface DraftTile {
  id: string;
  name: string;
  type: string;
  domains: string[];
  imageThumb: string | null;
  energyCost: number | null;
}

/**
 * Runs a server action without letting a failure strand the UI.
 *
 * A rejected action inside `startTransition` — a stopped dev server, a dropped
 * connection, a sleeping laptop — leaves `isPending` true forever, which
 * disables every card and shows "Bots picking…" with no way back. Draft state
 * is persisted server-side, so the honest recovery is to say so and let the
 * page be reloaded.
 *
 * A `redirect()` inside an action surfaces as a thrown NEXT_REDIRECT, which
 * must be re-thrown or the navigation is swallowed.
 */
async function runAction<T extends { error?: string }>(
  call: () => Promise<T>,
  onError: (message: string) => void,
): Promise<T | null> {
  try {
    const result = await call();
    if (result?.error) {
      onError(result.error);
      return null;
    }
    return result;
  } catch (error) {
    const digest = (error as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
    onError(
      "Lost contact with the server. Your draft is saved — reload the page to pick up where you left off.",
    );
    return null;
  }
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
              setState({});
              await runAction(
                () => startDraftAction(cubeId, returnPath),
                (message) => setState({ error: message }),
              );
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
  // Art comes straight from the source CDN and occasionally fails; a blank
  // tile in a pack you are choosing from is the worst place for that.
  const [artFailed, setArtFailed] = useState(false);

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
          {card.imageThumb && !artFailed ? (
            // Plain <img> on purpose — see CLAUDE.md on not proxying card art.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageThumb}
              alt={card.name}
              loading="lazy"
              onError={() => setArtFailed(true)}
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

/** Pick screen: the pack on top, the pool laid out as a curve beneath it. */
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
  pool: PoolCard[];
  round: number;
  pickNumber: number;
  totalRounds: number;
  packSize: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const move = async (card: PoolCard, board: "main" | "side") => {
    setError(null);
    await runAction(
      () => setCardBoardAction(draftId, card.round, card.pickNumber, board, returnPath),
      setError,
    );
  };

  return (
    <div className="space-y-8">
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
                  await runAction(
                    () => makePickAction(draftId, card.id, returnPath),
                    setError,
                  );
                })
              }
            />
          ))}
        </ul>
      </div>

      <PoolPiles cards={pool} onMove={move} />
    </div>
  );
}

/** End screen: the finished pool, still sortable, and a way to keep it. */
export function EndScreen({
  draftId,
  returnPath,
  pool,
  defaultName,
}: {
  draftId: string;
  returnPath: string;
  pool: PoolCard[];
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const move = async (card: PoolCard, board: "main" | "side") => {
    setError(null);
    await runAction(
      () => setCardBoardAction(draftId, card.round, card.pickNumber, board, returnPath),
      setError,
    );
  };

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
              await runAction(() => saveDraftAsCubeAction(draftId, name), setError);
            })
          }
          className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Saving…" : "Save as cube"}
        </button>
        <span className="text-sm text-zinc-500">
          Creates a private cube you own; sidelined cards go to its sideboard.
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <PoolPiles cards={pool} onMove={move} />
    </div>
  );
}
