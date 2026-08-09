import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateCubeAction } from "@/app/cube/actions";
import CubeForm from "@/app/cubes/cube-form";
import { countCubeCards, getCubeByOwnerAndSlug } from "@/db/queries/cubes";
import { getCurrentUser } from "@/lib/auth";
import { canEditCube } from "@/lib/cube-access";

import DeleteCube from "./delete-cube";

export const metadata: Metadata = {
  title: "Cube settings · cubebound.gg",
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

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <Link
        href={`/cube/${cube.ownerUsername}/${cube.slug}/edit`}
        className="text-sm text-zinc-500 underline-offset-4 hover:underline"
      >
        ← Back to {cube.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">Cube settings</h1>

      <CubeForm action={updateCubeAction} cube={cube} submitLabel="Save changes" />

      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          The URL stays <span className="font-mono">/cube/{cube.ownerUsername}/{cube.slug}</span>{" "}
          even if you rename the cube, so shared links keep working.
        </p>
      </div>

      <div className="mt-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="mb-3 text-lg font-semibold">Danger zone</h2>
        <DeleteCube cube={cube} cardCount={cardCount} />
      </div>
    </div>
  );
}
