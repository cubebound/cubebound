"use client";

import { useState } from "react";

import { type DraftConfig } from "@/lib/draft/config";
import { btn } from "@/lib/ui";

/**
 * The third tab: one pack from this cube, drawn as a single image to share.
 *
 * It exists because creators are already posting screenshots of the pack view,
 * and a screenshot is unreadable once a video has re-encoded it. The image is
 * rendered at the card assets' own resolution instead.
 *
 * **The image is built on the server, and that was not the plan.** The intended
 * design was a canvas in the browser, free and instant, using art the pack view
 * has already loaded. Riot's card CDN sends no `Access-Control-Allow-Origin`, so
 * the canvas is tainted and `toBlob` throws at the last step. Proxying the art
 * to get around that is the thing "we store image URLs, never image bytes"
 * exists to prevent, so the render moved server-side.
 *
 * **The preview is not a second implementation.** It is the same route at a
 * smaller tier, shown in an `<img>`. Displaying a cross-origin image was never
 * the problem — only reading its pixels back is — so nothing here touches a
 * canvas. Without it, Shuffle was a blind download: click, wait, open a file,
 * find out. That is the wrong loop for someone hunting a good P1P1.
 *
 * **Only Shuffle deals, and that means the template is snapshotted too.**
 * Opening the tab renders nothing: it is not a request for a pack, and dealing
 * one on mount spends a render, and Riot's bandwidth, on settings the reader has
 * not chosen yet. The same argument applies to the form above — building the
 * image URL from the *live* config re-rendered on every keystroke, so typing
 * "15" into Cards per pack dealt a 1-card pack and then a 15-card one. The seed
 * and the template are captured together when Shuffle is pressed, which also
 * makes the pair of them a single description of one pack: exactly what the
 * download needs, and what a permalink will need later.
 *
 * **The seat count is irrelevant here and the link says so by omission.** A pack
 * is a pack however many people are drafting, so `seats` is not in the query at
 * all — only the pack template is.
 *
 * **It asks for an account, and the export tab beside it does not.** The
 * difference is real rather than arbitrary: the export assembles a text file
 * from rows we already hold, while this fetches every card's art and composites
 * it server-side. The screen states the requirement rather than the reasoning —
 * knowing *that* you need an account is what stops someone meeting a 401 on a
 * download; knowing why it is this tab and not the one beside it is our problem,
 * not the reader's.
 */
export default function CrackAPack({
  imagePath,
  config,
  disabled,
  signedIn,
}: {
  /** The cube's `pack.png` route; the pack template rides in its query string. */
  imagePath: string;
  config: DraftConfig;
  /** Set when the config is incoherent — the route would 400 on it anyway. */
  disabled: boolean;
  /** The route refuses a signed-out caller regardless; this only decides what
   *  is offered, the same arrangement the bots tab uses. */
  signedIn: boolean;
}) {
  /**
   * The pack on screen: a seed and the template it was dealt from.
   *
   * Null until asked, because a seed *is* a pack and minting one on mount would
   * be dealing a pack nobody asked for. The two travel together so the image
   * cannot drift from what produced it, and so the download is the same pack you
   * are looking at rather than whatever the form says right now.
   */
  const [dealt, setDealt] = useState<{ seed: string; template: string } | null>(null);
  /**
   * Which image has finished, by its own URL, rather than a loading flag.
   *
   * A flag needs resetting whenever the src changes, and the src changes from
   * two directions — shuffling here and typing in the form above — so the reset
   * lands in an effect, which is both a lint error and a frame of stale image.
   * Comparing against the current src derives the state instead: a new URL is
   * by definition not the one that loaded.
   */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // What Shuffle would deal right now. Compared against the dealt template to
  // notice that the form has moved on; never used to build the image directly.
  const template = new URLSearchParams({
    packSize: String(config.packSize),
    legendSlots: String(config.legendSlots),
    battlefieldSlots: String(config.battlefieldSlots),
    legendOrBattlefieldSlots: String(config.legendOrBattlefieldSlots),
    shuffleLegendsIntoPacks: config.shuffleLegendsIntoPacks ? "1" : "0",
    shuffleBattlefieldsIntoPacks: config.shuffleBattlefieldsIntoPacks ? "1" : "0",
  }).toString();

  const previewSrc = dealt
    ? `${imagePath}?${dealt.template}&seed=${dealt.seed}&tier=preview`
    : null;
  const downloadHref = dealt
    ? `${imagePath}?${dealt.template}&seed=${dealt.seed}&dl=1`
    : null;
  const stale = dealt !== null && dealt.template !== template;
  const failed = previewSrc !== null && failedSrc === previewSrc;
  const ready = previewSrc !== null && loadedSrc === previewSrc;
  const loading = previewSrc !== null && !ready && !failed;

  if (!signedIn) {
    return (
      <p className="text-sm text-muted">
        <a href="/login" className="font-medium underline underline-offset-2">
          Sign in
        </a>{" "}
        to use it. You don&rsquo;t need to own the cube.
      </p>
    );
  }

  if (disabled) {
    return (
      <p className="text-sm text-subtle">Fix the settings above to crack a pack.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative min-h-40 overflow-hidden rounded-md border border-line bg-sunken">
        {/* `key` on the src, so a shuffle remounts the element. Re-assigning an
            identical-looking `src` does not reliably re-fire `onLoad`, which is
            the same trap `card-art.tsx` documents about retrying a failed image.
            Plain `<img>`, never `next/image`, for the same reason the card tiles
            are: optimising through Vercel would proxy and cache what we just
            rendered, and this is already a sized WebP. */}
        {previewSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={previewSrc}
            src={previewSrc}
            alt="The cards in this pack, laid out as one image"
            onLoad={() => setLoadedSrc(previewSrc)}
            onError={() => setFailedSrc(previewSrc)}
            className={`block w-full transition-opacity duration-150 ${
              ready ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-subtle">
            {failed
              ? "That pack could not be drawn. Shuffle to try another."
              : loading
                ? "Dealing a pack…"
                : "Shuffle to deal a pack."}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setDealt({ seed: crypto.randomUUID(), template })}
          className={btn.primary}
        >
          Shuffle
        </button>
        {/* A link with nothing behind it is worse than no link, so until a pack
            has actually drawn this is inert text rather than an `<a>` that would
            download a 400. */}
        {ready && downloadHref ? (
          <a href={downloadHref} download className={btn.secondarySm}>
            Download
          </a>
        ) : (
          <span className={`${btn.secondarySm} cursor-not-allowed opacity-40`} aria-disabled>
            Download
          </span>
        )}
      </div>

      <p className="text-sm text-muted">
        {stale
          ? "The settings above have changed. Shuffle to deal a pack with them."
          : "Shuffle deals a pack, and again for another. Download gives you the one on screen at full card resolution."}
      </p>
    </div>
  );
}
