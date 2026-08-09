import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createCubeAction } from "@/app/cube/actions";
import CubeForm from "@/app/cubes/cube-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "New cube · cubebound.gg",
};

export default async function NewCubePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile) redirect("/welcome");

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <Link href="/cubes" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
        ← Your cubes
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">New cube</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Its URL comes from the name — you can rename it later without breaking
        the link.
      </p>
      <CubeForm action={createCubeAction} submitLabel="Create cube" />
    </div>
  );
}
