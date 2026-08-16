import Link from "next/link";

/**
 * Goes to the draft settings to start a fresh draft of the same cube.
 *
 * A link, not an action: it used to deal immediately on click, which meant the
 * settings screen was reachable only on a cube you had never drafted — that is
 * to say, never, after the first time. Routing to `?new=1` shows the settings
 * first and makes that screen the commit point.
 *
 * It also removes the confirm this used to need. Nothing is dealt by *looking*
 * at settings, and the screen it lands on says plainly that the current draft
 * survives, which is what the confirm existed to promise.
 */
export default function RestartDraft({ draftPath }: { draftPath: string }) {
  return (
    <Link
      href={`${draftPath}?new=1`}
      className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      New draft
    </Link>
  );
}
