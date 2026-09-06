"use client";

import Link from "next/link";
import { useState } from "react";
import { btn } from "@/lib/ui";

/**
 * Copies the cube's public URL.
 *
 * Visibility-aware, because the same link means three different things:
 *   public    — anyone can open it, and search engines index it
 *   unlisted  — anyone with the link can open it, but it stays out of search
 *   private   — nobody but the owner can open it, so the link is dead on
 *               arrival for whoever receives it
 *
 * The private case still copies rather than refusing: the owner may want the
 * URL for their own notes, and silently handing over a link that 404s for the
 * recipient is the failure worth preventing — so it says so, and points at
 * Settings.
 */
export default function ShareButton({
  url,
  visibility,
  settingsHref,
}: {
  url: string;
  visibility: "public" | "unlisted" | "private";
  /** Owner-only; omitted for visitors, who can't change visibility. */
  settingsHref?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      // navigator.clipboard needs a secure context; plain http on a LAN
      // address has neither, so failure here is expected rather than broken.
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        title={`Copy this cube's link (${visibility})`}
        className={btn.secondarySm}
      >
        {state === "copied" ? "Link copied" : "Share"}
      </button>

      {/* Assertive: the caveat matters more than the confirmation, and a
          visitor acting on a dead link is the thing to interrupt for. */}
      <span role="status" aria-live="polite" className="text-xs text-muted">
        {state === "copied" && visibility === "unlisted" && "Unlisted: anyone with the link can view."}
        {state === "copied" && visibility === "private" && (
          <>
            Private: only you can open this.{" "}
            {settingsHref && (
              <Link href={settingsHref} className="underline underline-offset-2">
                Change visibility
              </Link>
            )}
          </>
        )}
      </span>

      {state === "failed" && (
        <input
          readOnly
          value={url}
          aria-label="Cube link"
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 w-64 rounded-md border border-line bg-sunken px-2 text-xs"
        />
      )}
    </div>
  );
}
