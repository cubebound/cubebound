import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

import UsernameForm from "./username-form";

export const metadata: Metadata = {
  title: "Choose a username",
};

export default async function WelcomePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.profile) redirect("/");

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a username</h1>
      <p className="mt-2 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        You&rsquo;re signed in as {current.user.email}. Pick a username to finish
        setting up your account.
      </p>
      <UsernameForm />
    </div>
  );
}
