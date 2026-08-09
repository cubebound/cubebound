import Link from "next/link";

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
          <Link
            href="/cubes"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Your cubes
          </Link>
          <span className="text-zinc-600 dark:text-zinc-400">
            {current.profile.username}
          </span>
        </>
      ) : (
        <Link href="/welcome" className="text-zinc-900 underline dark:text-zinc-100">
          Choose a username
        </Link>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
