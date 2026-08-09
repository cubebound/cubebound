"use client";

import Link from "next/link";
import { useActionState } from "react";

import { cloneCubeAction, type ActionState } from "@/app/cube/actions";

const initial: ActionState = {};

const buttonClass =
  "inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white " +
  "hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

/**
 * Signed-out visitors still see the button — hiding it would hide the feature
 * from exactly the people who need an account to use it — but it routes to
 * sign-in rather than pretending to work.
 */
export default function CloneButton({
  username,
  slug,
  signedIn,
}: {
  username: string;
  slug: string;
  signedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(cloneCubeAction, initial);

  if (!signedIn) {
    return (
      <Link href="/login" className={buttonClass}>
        Clone
      </Link>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
        title="Copy this cube's cards into a new private cube of your own"
      >
        {pending ? "Cloning…" : "Clone"}
      </button>
      {state.error && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
    </form>
  );
}
