"use client";

import Link from "next/link";
import { useActionState } from "react";

import { cloneCubeAction, type ActionState } from "@/app/cube/actions";
import { btn } from "@/lib/ui";

const initial: ActionState = {};

const PROMINENT = btn.primarySm;
const QUIET = btn.secondarySm;

/**
 * Signed-out visitors still see the button — hiding it would hide the feature
 * from exactly the people who need an account to use it — but it routes to
 * sign-in rather than pretending to work.
 */
export default function CloneButton({
  username,
  slug,
  signedIn,
  prominent = true,
}: {
  username: string;
  slug: string;
  signedIn: boolean;
  /** Cloning is the main thing a visitor can do here, so it leads for them.
   *  On your own cube it steps aside for Edit. */
  prominent?: boolean;
}) {
  const [state, formAction, pending] = useActionState(cloneCubeAction, initial);
  const buttonClass = prominent ? PROMINENT : QUIET;

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
