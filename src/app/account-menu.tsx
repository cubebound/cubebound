"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOut } from "@/app/auth/actions";

/**
 * The account control in the nav.
 *
 * It replaces a spelled-out username, which had no upper bound: a long one
 * pushed Sign out past the right edge on a phone and broke the header. An
 * avatar is a fixed 32px whatever the name is, and the items it used to sit
 * beside move inside it.
 *
 * The initial rather than a generic silhouette — it still identifies which
 * account you are signed in as, which matters on a site where you can hold
 * more than one, and the full username is announced to screen readers and
 * shown at the top of the open menu.
 */
export default function AccountMenu({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Pointer rather than click: a menu that survives until mouseup feels
    // stuck when you tap away on a touchscreen.
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const initial = username.trim().charAt(0).toUpperCase() || "?";

  const itemClass =
    "block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${username}`}
        title={username}
        className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="truncate px-3 py-2 text-xs text-zinc-500" title={username}>
            Signed in as <span className="font-medium">{username}</span>
          </p>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />

          <Link href="/profile" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link href="/settings" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            Settings
          </Link>

          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <form action={signOut}>
            <button type="submit" role="menuitem" className={itemClass}>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
