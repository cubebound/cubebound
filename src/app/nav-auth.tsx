import Link from "next/link";

import AccountMenu from "@/app/account-menu";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function NavAuth() {
  const current = await getCurrentUser();

  if (!current) {
    return (
      <Link
        href="/login"
        className="ml-auto text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      {current.profile ? (
        <>
          {/* "Your" is dropped below `sm`: with it, a 320px phone still ran
              the nav past its own right edge. */}
          <Link
            href="/cubes"
            className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span className="hidden sm:inline">Your </span>
            <span className="sm:lowercase">Cubes</span>
          </Link>
          <Link
            href="/drafts"
            className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span className="hidden sm:inline">Your </span>
            <span className="sm:lowercase">Drafts</span>
          </Link>
          <AccountMenu username={current.profile.username} />
        </>
      ) : (
        <>
          <Link href="/welcome" className="text-zinc-900 underline dark:text-zinc-100">
            Choose a username
          </Link>
          {/* No profile yet, so no account menu to put Log out inside. */}
          <form action={signOut}>
            <button
              type="submit"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </form>
        </>
      )}
    </div>
  );
}
