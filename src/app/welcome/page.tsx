import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { safeReturnPath } from "@/lib/site-url";

import UsernameForm from "./username-form";

export const metadata: Metadata = {
  title: "Choose a username",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [current, params] = await Promise.all([getCurrentUser(), searchParams]);
  // Carried from the sign-in that sent them here, so claiming a username is a
  // step on the way back rather than the end of the trip.
  const next = safeReturnPath(Array.isArray(params.next) ? params.next[0] : params.next);
  if (!current) redirect("/login");
  if (current.profile) redirect(next ?? "/");

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold">Choose a username</h1>
      <p className="mt-2 mb-6 text-sm text-muted">
        You&rsquo;re signed in as {current.user.email}. Pick a username to finish
        setting up your account.
      </p>
      <UsernameForm next={next} />
    </div>
  );
}
