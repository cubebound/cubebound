"use client";

import { useState } from "react";

/**
 * Card art that retries before giving up.
 *
 * The name shows underneath until the art covers it: art arrives over the
 * network and a blank tile is indistinguishable from a bug — that exact
 * confusion has been reported twice.
 *
 * **A single failure is not treated as final.** Every one of these used to set
 * a permanent "failed" state on the first `onError`, which assumed a failure
 * meant a bad URL. In practice the URLs are fine and the failures are transient
 * — one card came back blank in a draft pack while its image served a normal
 * 200 the whole time, and it appeared when the pack came round again and the
 * tile re-rendered. So one hiccup blanked a card for as long as that render
 * lived. It now retries a couple of times with a short backoff, and only then
 * settles on the name.
 *
 * The retry counter rides in the `src` as a cache-busting parameter, because
 * re-assigning an identical `src` does not make a browser fetch again. Riot's
 * CDN ignores parameters it doesn't know, and this is still the source CDN
 * serving its own asset — the no-proxy rule in CLAUDE.md is untouched.
 *
 * A plain `<img>` on purpose, never `next/image`: optimizing through Vercel
 * would proxy and cache these, which we deliberately do not do.
 */

/** Two retries then stop — enough for a blip, few enough that a genuinely dead
 *  URL costs three requests rather than a loop. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

export default function CardArt({
  src,
  name,
  className = "",
  loading = "lazy",
}: {
  /** Already sized by `cardThumb`/`cardFull`. Null renders the name alone. */
  src: string | null | undefined;
  name: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const givenUp = attempt >= MAX_ATTEMPTS;

  const url = (() => {
    if (!src) return null;
    if (attempt === 0) return src;
    return `${src}${src.includes("?") ? "&" : "?"}cbretry=${attempt}`;
  })();

  return (
    <>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted">
          {name}
        </div>
      )}
      {url && !givenUp && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Keyed by attempt so a retry mounts a fresh element rather than
          // mutating one the browser already considers finished.
          key={attempt}
          ref={(node) => {
            if (!node) return;
            // **An image that fails before hydration never fires onError** —
            // the browser requested it from the server-rendered HTML and the
            // event was over before React attached a listener. That is the
            // common case on a grid of sixty tiles, and without this check the
            // retry never runs for exactly the images most likely to have
            // failed. `complete` with no intrinsic width is the reliable
            // "already broken" signal.
            if (node.complete) {
              if (node.naturalWidth > 0) setReady(true);
              else setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
            }
          }}
          src={url}
          alt={name}
          loading={loading}
          onLoad={() => setReady(true)}
          onError={() => {
            // A plain event handler, so scheduling here is a browser side
            // effect rather than render-time state the compiler objects to.
            setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
          }}
          className={`relative size-full ${className}`}
        />
      )}
    </>
  );
}
