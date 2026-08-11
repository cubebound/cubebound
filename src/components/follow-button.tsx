"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setFollowAction } from "@/app/explore/actions";

/**
 * Follow or unfollow a cube.
 *
 * Optimistic: the label flips on click rather than after the round trip, and
 * reverts if the server disagrees. Following is a low-stakes toggle people
 * click while scanning a list, so waiting on the network to acknowledge it
 * makes the list feel broken.
 *
 * Signed-out visitors still see the control — hiding it hides the feature from
 * exactly the people who need an account for it — but it routes to sign-in.
 */
export default function FollowButton({
  cubeId,
  following,
  followers,
  returnPath,
  signedIn,
  size = "md",
}: {
  cubeId: string;
  following: boolean;
  followers: number;
  returnPath: string;
  signedIn: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(following);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const height = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";
  const base =
    `inline-flex ${height} items-center gap-1.5 rounded-md border font-medium transition ` +
    "disabled:opacity-60";
  // Neither state is filled. Following is a state, not a call to action, and on
  // the cube page a filled one would out-shout Clone, which is the visitor's
  // actual primary action. "On" is a tinted fill instead.
  const style = optimistic
    ? "border-zinc-400 bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

  if (!signedIn) {
    return (
      <Link href="/login" className={`${base} ${style}`} title="Sign in to follow cubes">
        Follow
        {followers > 0 && <span className="tabular-nums opacity-70">{followers}</span>}
      </Link>
    );
  }

  const shown = followers + (optimistic === following ? 0 : optimistic ? 1 : -1);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-pressed={optimistic}
        onClick={() => {
          const next = !optimistic;
          setOptimistic(next);
          setError(null);
          startTransition(async () => {
            try {
              const result = await setFollowAction(cubeId, next, returnPath);
              if (result?.error) {
                setOptimistic(!next);
                setError(result.error);
                return;
              }
              router.refresh();
            } catch {
              setOptimistic(!next);
              setError("Couldn't reach the server.");
            }
          });
        }}
        className={`${base} ${style}`}
      >
        {optimistic ? "Following" : "Follow"}
        {shown > 0 && <span className="tabular-nums opacity-70">{shown}</span>}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
