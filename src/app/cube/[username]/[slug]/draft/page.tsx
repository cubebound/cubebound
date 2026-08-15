import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCubeByOwnerAndSlug } from "@/db/queries/cubes";
import {
  getDraft,
  getDraftPicks,
  getDraftPools,
  getLatestDraft,
  listDraftsForUser,
} from "@/db/queries/drafts";
import { getCurrentUser } from "@/lib/auth";
import { canViewCube } from "@/lib/cube-access";
import {
  DEFAULT_DRAFT_CONFIG,
  finalPoolSize,
  mainSlotsPerPack,
} from "@/lib/draft/config";
import { generatePacks } from "@/lib/draft/packs";

import RestartDraft from "./draft-controls";
import { EndScreen, PickScreen, StartDraft, type DraftTile } from "./draft-client";
import type { PoolCard } from "./pool-piles";
import { restoreDraftState, type DetailedCard } from "./state";

export const metadata: Metadata = { title: "Draft" };

function toTile(card: DetailedCard): DraftTile {
  return {
    id: card.id,
    name: card.name,
    type: card.type,
    domains: card.domains,
    imageThumb: card.imageThumb,
    energyCost: card.energyCost,
  };
}

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { username, slug } = await params;
  const query = await searchParams;
  const requestedId = Array.isArray(query.draft) ? query.draft[0] : query.draft;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  // Same rule as the public page: anyone who can view a cube can draft it.
  const current = await getCurrentUser();
  if (!canViewCube(cube, current?.profile?.id)) notFound();

  const config = DEFAULT_DRAFT_CONFIG;
  const publicPath = `/cube/${cube.ownerUsername}/${cube.slug}`;
  const draftPath = `${publicPath}/draft`;

  const dateFormat = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const header = (extra?: React.ReactNode, others?: React.ReactNode) => (
    <header className="mb-5">
      <Link href={publicPath} className="text-sm text-zinc-500 underline-offset-4 hover:underline">
        ← {cube.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Draft</h1>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {extra}
          <Link
            href="/drafts"
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Your drafts
          </Link>
        </span>
      </div>
      {others}
    </header>
  );

  // Signed-out visitors can read a public cube but cannot hold a draft, which
  // is persisted so it survives a refresh and therefore needs an owner.
  if (!current?.profile) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        {header()}
        <p className="max-w-2xl text-sm text-zinc-700 dark:text-zinc-300">
          Solo drafting saves your progress as you go, so it needs an account.{" "}
          <Link href="/login" className="font-medium underline underline-offset-2">
            Sign in
          </Link>{" "}
          to draft this cube — you don&rsquo;t need to own it.
        </p>
      </div>
    );
  }

  // `?draft=` opens a specific one — that is how a finished draft stays
  // reachable once a newer one exists. Someone else's draft is simply not
  // found, the same convention the actions use.
  const requested = requestedId ? await getDraft(requestedId) : null;
  const draft =
    requested && requested.drafterId === current.profile.id && requested.cubeId === cube.id
      ? requested
      : await getLatestDraft(cube.id, current.profile.id);

  const history = await listDraftsForUser(current.profile.id);
  const forThisCube = history.filter((entry) => entry.cubeId === cube.id);

  if (!draft) {
    // Dry-run the deal so the start screen can show real warnings and block on
    // a pool that cannot fill the packs, rather than failing after the click.
    const pools = await getDraftPools(cube.id);
    const trial = generatePacks(config, pools, "preflight");
    const summary =
      `${config.seats} seats · ${config.packsPerPlayer} packs each · ` +
      `${config.packSize} cards per pack (${mainSlotsPerPack(config)} from the main ` +
      `section plus 1 legend or battlefield) · passing ` +
      `${config.passDirections.slice(0, config.packsPerPlayer).join(", ")}. ` +
      `You'll finish with ${finalPoolSize(config)} cards.`;

    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        {header()}
        <StartDraft
          cubeId={cube.id}
          returnPath={draftPath}
          summary={summary}
          warnings={trial.ok ? trial.warnings : []}
          blocked={trial.ok ? null : trial.error}
        />
      </div>
    );
  }

  const restored = await restoreDraftState(draft);
  if ("error" in restored) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        {header()}
        <p role="alert" className="max-w-2xl text-sm text-red-600 dark:text-red-400">
          {restored.error}
        </p>
      </div>
    );
  }

  const { state, cardsById } = restored;

  // The pool is built from the stored picks rather than from engine state:
  // only the rows carry which board a card is on and the (round, pickNumber)
  // that tells two copies of one card apart.
  const humanPicks = (await getDraftPicks(draft.id))
    .filter((pick) => pick.seat === draft.humanSeat)
    .sort((a, b) => a.round - b.round || a.pickNumber - b.pickNumber);

  const pool: PoolCard[] = humanPicks.flatMap((pick) => {
    const card = cardsById.get(pick.cardId);
    if (!card) return [];
    return [
      {
        round: pick.round,
        pickNumber: pick.pickNumber,
        id: card.id,
        name: card.name,
        type: card.type,
        domains: card.domains,
        imageThumb: card.imageThumb,
        energyCost: card.energyCost,
        board: pick.board,
      },
    ];
  });

  // Other drafts of this same cube, so a finished one stays one click away.
  const others =
    forThisCube.length > 1 ? (
      <ul className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {forThisCube.map((entry) => {
          const active = entry.id === draft.id;
          return (
            <li key={entry.id}>
              <Link
                href={`${draftPath}?draft=${entry.id}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                <span>{dateFormat.format(entry.createdAt)}</span>
                <span className="tabular-nums opacity-70">
                  {entry.status === "complete" ? "finished" : `${entry.picked} picks`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      {header(
        <RestartDraft
          cubeId={cube.id}
          draftPath={draftPath}
          unfinished={state.status !== "complete"}
        />,
        others,
      )}
      {state.status === "complete" ? (
        <EndScreen
          draftId={draft.id}
          returnPath={draftPath}
          pool={pool}
          defaultName={`${cube.name} draft`}
        />
      ) : (
        <PickScreen
          draftId={draft.id}
          returnPath={draftPath}
          pack={(state.packs[state.humanSeat] ?? []).map((card) => toTile(card as DetailedCard))}
          pool={pool}
          round={state.round}
          pickNumber={state.pickNumber}
          totalRounds={state.config.packsPerPlayer}
          packSize={state.config.packSize}
        />
      )}
    </div>
  );
}
