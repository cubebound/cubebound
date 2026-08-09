import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · cubebound.gg",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const current = await getCurrentUser();
  if (current) redirect(current.profile ? "/" : "/welcome");

  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Sign in to build and share cubes.
      </p>
      <LoginForm initialError={error} />
    </div>
  );
}
