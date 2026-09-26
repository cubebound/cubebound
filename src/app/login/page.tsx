import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { safeReturnPath } from "@/lib/site-url";

import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [current, params] = await Promise.all([getCurrentUser(), searchParams]);
  // Where sign-in started, e.g. a cube someone tried to clone while signed out.
  // It travels through the callback and `/welcome` so they land back there.
  const next = safeReturnPath(Array.isArray(params.next) ? params.next[0] : params.next);
  if (current) {
    if (current.profile) redirect(next ?? "/");
    redirect(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
  }

  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 mb-6 text-sm text-muted">
        Sign in to build and share cubes.
      </p>
      <LoginForm initialError={error} next={next} />
    </div>
  );
}
