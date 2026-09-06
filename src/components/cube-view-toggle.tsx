"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  CUBE_VIEW_COOKIE,
  CUBE_VIEW_COOKIE_MAX_AGE,
  CUBE_VIEWS,
  type CubeView,
} from "@/lib/cube-view";
import { segment } from "@/lib/ui";

const LABELS: Record<CubeView, string> = { visual: "Visual", text: "List" };

/** Kept out of the component body: writing a global from inside one trips the
 *  compiler's immutability rule, and this is a plain browser side effect. */
function rememberChoice(view: CubeView): void {
  document.cookie = `${CUBE_VIEW_COOKIE}=${view}; path=/; max-age=${CUBE_VIEW_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Writes the choice to both places: the URL so the current page and any link
 * copied from it are explicit, and a cookie so the preference carries to the
 * next cube. Written from the client because the toggle also navigates —
 * a server action would cost a second round trip for a display preference.
 */
export default function CubeViewToggle({ active }: { active: CubeView }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function choose(view: CubeView) {
    if (view === active) return;
    rememberChoice(view);
    const next = new URLSearchParams(params.toString());
    next.set("view", view);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div
      role="group"
      aria-label="Card list view"
      className={`inline-flex overflow-hidden rounded-md border border-line ${isPending ? "opacity-60" : ""}`}
    >
      {CUBE_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => choose(view)}
          aria-pressed={view === active}
          className={view === active ? segment.active : segment.inactive}
        >
          {LABELS[view]}
        </button>
      ))}
    </div>
  );
}
