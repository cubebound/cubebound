import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCubeByOwnerAndSlug } from "@/db/queries/cubes";
import { getDraftPicks, getDraftPools, getLatestDraft } from "@/db/queries/drafts";
import { getCurrentUser } from "@/lib/auth";
import { canViewCube } from "@/lib/cube-access";
import {
  DEFAULT_DRAFT_CONFIG,
  finalPoolSize,
  mainSlotsPerPack,
} from "@/lib/draft/config";
import { generatePacks } from "@/lib/draft/packs";

import { EndScreen, PickScreen, StartDraft, type DraftTile } from "./draft-client";
import type { PoolCard } from "./pool-piles";
import { restoreDraftState, type DetailedCard } from "./state";

export const metadata: Metadata = { title: "Draft · cubebound.gg" };

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
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  // Same rule as the public page: anyone who can view a cube can draft it.
  const current = await getCurrentUser();
  if (!canViewCube(cube, current?.profile?.id)) notFound();

  const config = DEFAULT_DRAFT_CONFIG;
  const publicPath = `/cube/${cube.ownerUsername}/${cube.slug}`;
  const draftPath = `${publicPath}/draft`;

  const header = (
    <header className="mb-5">
      <Link href={publicPath} className="text-sm text-zinc-500 underline-offset-4 hover:underline">
        ← {cube.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Draft</h1>
    </header>
  );

  // Signed-out visitors can read a public cube but cannot hold a draft, which
  // is persisted so it survives a refresh and therefore needs an owner.
  if (!current?.profile) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        {header}
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

  const draft = await getLatestDraft(cube.id, current.profile.id);

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
        {header}
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
        {header}
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

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      {header}
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
