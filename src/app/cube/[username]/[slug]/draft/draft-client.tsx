"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import CardArt from "@/components/card-art";
import { cardThumb } from "@/lib/card-images";
import { domainDot } from "@/lib/domain-columns";
import {
  DEFAULT_DRAFT_CONFIG,
  validateDraftConfig,
  type DraftConfig,
} from "@/lib/draft/config";
import { aspectRatio } from "@/lib/riftbound";

import {
  makePickAction,
  setCardBoardAction,
  startDraftAction,
  type DraftActionState,
} from "./actions";
import DraftSettings, { type PoolCounts } from "@/components/draft-settings";
import DeckExport from "./deck-export";
import PoolPiles, { type PoolCard } from "./pool-piles";

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
  pools,
  currentDraftPath,
}: {
  cubeId: string;
  returnPath: string;
  pools: PoolCounts;
  /** Set when a draft of this cube already exists, so the screen can say it
   *  survives. Starting another never destroys one. */
  currentDraftPath?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<DraftActionState>({});
  const [pending, startTransition] = useTransition();
  const [config, setConfig] = useState<DraftConfig>(DEFAULT_DRAFT_CONFIG);

  // The settings panel computes this too, but the button needs its own answer:
  // an incoherent config must not be submittable at all. Pool sufficiency is
  // deliberately *not* checked here — a shortfall in a reserved section is a
  // warning that falls back to main, and the server re-derives the blocking
  // case with the real pool anyway.
  const problems = validateDraftConfig(config);

  return (
    <div className="max-w-2xl space-y-4">
      {currentDraftPath && (
        <p className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          Starting a new draft keeps the current one — it stays in{" "}
          <a href="/drafts" className="underline underline-offset-2">
            your drafts
          </a>
          .{" "}
          <a href={currentDraftPath} className="underline underline-offset-2">
            Back to it
          </a>
          .
        </p>
      )}

      <DraftSettings pools={pools} onChange={setConfig} />

      <button
        type="button"
        disabled={pending || problems.length > 0}
        onClick={() =>
          startTransition(async () => {
            setState({});
            const result = await runAction(
              () => startDraftAction(cubeId, returnPath, config),
              (message) => setState({ error: message }),
            );
            // Navigate explicitly. This screen used to rely on the action's
            // revalidate to re-render the page into the pick screen, which
            // worked only while it rendered on `!draft` alone — with `?new=1`
            // still in the URL the page just renders these settings again, so
            // a successful start looked like nothing happening and a second
            // click dealt a second draft. Opening the new draft by id also
            // beats trusting "latest".
            if (result?.draftId) {
              router.push(`${returnPath}?draft=${result.draftId}`);
              router.refresh();
            }
          })
        }
        className="inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Dealing…" : "Start draft"}
      </button>

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
  // Art comes straight from the source CDN; a blank tile in a pack you are
  // choosing from is the worst place for a slow or missing image, which is why
  // CardArt retries before settling on the name.
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
          className="relative overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-black/10 transition group-hover:ring-2 group-hover:ring-zinc-900 dark:bg-zinc-900 dark:ring-white/15 dark:group-hover:ring-zinc-100"
          style={{ aspectRatio: aspectRatio(card.type) }}
        >
          <CardArt
            src={cardThumb(card.imageThumb)}
            name={card.name}
            className="object-contain"
          />
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

      {/* No export here: mid-draft the pool is a few picks, not a deck, and
          offering to send it to a builder invites confusion about what is
          finished. The end screen has it. */}
      <PoolPiles cards={pool} onMove={move} />
    </div>
  );
}

/**
 * End screen: the finished pool, still sortable.
 *
 * There is no "save as cube" any more. It predated `/drafts`, when a finished
 * draft became unreachable the moment a newer one started and flattening it
 * into a cube was the only way to keep it. Drafts are now kept as drafts —
 * with their packs, their pick order and the main/side split, none of which
 * survives being turned into a cube — so the button copied a pool into a
 * second place for no gain and left people with cubes they did not mean to
 * make. Cloning a cube is still how you get an editable copy of a *cube*.
 */
export function EndScreen({
  draftId,
  returnPath,
  pool,
}: {
  draftId: string;
  returnPath: string;
  pool: PoolCard[];
}) {
  const [error, setError] = useState<string | null>(null);

  const move = async (card: PoolCard, board: "main" | "side") => {
    setError(null);
    await runAction(
      () => setCardBoardAction(draftId, card.round, card.pickNumber, board, returnPath),
      setError,
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This draft is saved. Sort your pool between main and sideboard here —
        it keeps, and you can reopen it any time from{" "}
        <a href="/drafts" className="underline underline-offset-2">
          your drafts
        </a>
        .
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <DeckExport pool={pool} />

      <PoolPiles cards={pool} onMove={move} />
    </div>
  );
}
