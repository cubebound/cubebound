"use client";

import { useEffect, useState } from "react";

/**
 * Jumps back to the top of a long page.
 *
 * Appears only once there is something to go back to, so it never covers
 * content on a short cube. It sits above the editor's Quick add button rather
 * than beside it — both are bottom-right, and stacking keeps either one from
 * moving depending on whether the other is rendered.
 */
export default function BackToTop({ showAfter = 600 }: { showAfter?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only ever set from the scroll handler: a page loads at the top, so the
    // initial `false` is already correct and reading scrollY during the effect
    // would be a render-time write.
    const onScroll = () => setVisible(window.scrollY > showAfter);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfter]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-20 right-4 z-30 flex size-10 items-center justify-center rounded-full border border-line bg-raised/90 text-muted shadow-lg backdrop-blur transition hover:bg-raised hover:text-ink"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden="true"
      >
        <path d="M10 16V5M5 10l5-5 5 5" />
      </svg>
    </button>
  );
}
