import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateCubeAction } from "@/app/cube/actions";
import CubeForm from "@/app/cubes/cube-form";
import { countCubeCards, getCubeByOwnerAndSlug, getCubeCards } from "@/db/queries/cubes";
import { getCurrentUser } from "@/lib/auth";
import { canEditCube } from "@/lib/cube-access";

import CoverPicker from "./cover-picker";
import DeleteCube from "./delete-cube";

export const metadata: Metadata = {
  title: "Cube settings",
  robots: { index: false, follow: false },
};

export default async function CubeSettingsPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const cube = await getCubeByOwnerAndSlug(username, slug);

  const current = await getCurrentUser();
  if (!canEditCube(cube, current?.profile?.id)) notFound();

  const cardCount = await countCubeCards(cube.id);

  // One row per printing, deduplicated: the picker chooses *art*, so two copies
  // of the same printing are the same choice. The maybeboard is excluded, being
  // no part of the cube.
  const allCards = await getCubeCards(cube.id);
  const seen = new Set<string>();
  const coverChoices = allCards
    .filter((card) => card.section !== "maybeboard")
    .filter((card) => (seen.has(card.id) ? false : (seen.add(card.id), true)))
    .map((card) => ({
      id: card.id,
      name: card.name,
      type: card.type,
      imageThumb: card.imageThumb,
    }));

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <Link
        href={`/cube/${cube.ownerUsername}/${cube.slug}/edit`}
        className="text-sm text-subtle underline-offset-4 hover:underline"
      >
        ← Back to {cube.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold">Cube settings</h1>

      <CubeForm action={updateCubeAction} cube={cube} submitLabel="Save changes" />

      <div className="mt-8 border-t border-line pt-6">
        <p className="mb-4 text-sm text-muted">
          The URL stays <span className="font-mono">/cube/{cube.ownerUsername}/{cube.slug}</span>{" "}
          even if you rename the cube, so shared links keep working.
        </p>
      </div>

      <div className="mt-4 border-t border-line pt-6">
        <h2 className="mb-1 text-lg font-semibold">Cover art</h2>
        <p className="mb-3 text-sm text-muted">
          The card shown when someone shares this cube in a chat or on social.
        </p>
        <CoverPicker
          cubeId={cube.id}
          cards={coverChoices}
          selected={cube.coverCardId}
        />
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="mb-3 text-lg font-semibold">Delete this cube</h2>
        <DeleteCube cube={cube} cardCount={cardCount} />
      </div>
    </div>
  );
}
