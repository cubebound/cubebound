"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cloneCubeAction, type ActionState } from "@/app/cube/actions";
import { slugify } from "@/lib/slug";
import { btn, errorText, help, input, label as labelClass } from "@/lib/ui";

const initial: ActionState = {};

/** Where the clone form lives as a page: the no-JS and pre-hydration path. */
export function clonePagePath(username: string, slug: string): string {
  return `/cubes/new?start=clone&from=${encodeURIComponent(`${username}/${slug}`)}`;
}

/**
 * Clone, asking for the copy's name first.
 *
 * **The button is a link to the clone form as a page, and a click opens the
 * same form in a dialog instead.** The link is what renders on the server, so
 * a click before hydration (or with no JS at all) still lands somewhere that
 * works, and `check:public-cube` still finds `>Clone<` in the served HTML. A
 * modified click (new tab, new window) is left to the browser.
 *
 * Signed-out visitors still see the button — hiding it would hide the feature
 * from exactly the people who need an account to use it — but it routes to
 * sign-in rather than pretending to work.
 */
export default function CloneButton({
  username,
  slug,
  sourceName,
  viewerUsername,
  prominent = true,
}: {
  username: string;
  slug: string;
  sourceName: string;
  /** Null when signed out. Also what the URL preview is built from. */
  viewerUsername: string | null;
  /** Cloning is the main thing a visitor can do here, so it leads for them.
   *  On your own cube it steps aside for Edit. */
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonClass = prominent ? btn.primarySm : btn.secondarySm;

  if (!viewerUsername) {
    return (
      <Link href="/login" className={buttonClass}>
        Clone
      </Link>
    );
  }

  function openDialog(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    setOpen(true);
  }

  return (
    <>
      <Link
        href={clonePagePath(username, slug)}
        onClick={openDialog}
        className={buttonClass}
        title="Copy this cube's cards into a new private cube of your own"
      >
        Clone
      </Link>
      {open && (
        <CloneDialog onClose={() => setOpen(false)}>
          <CloneCubeForm
            username={username}
            slug={slug}
            sourceName={sourceName}
            viewerUsername={viewerUsername}
            onCancel={() => setOpen(false)}
          />
        </CloneDialog>
      )}
    </>
  );
}

/** The overlay, built the way the card detail modal is: Escape and the
 *  backdrop close it, and focus moves into it when it opens. */
function CloneDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clone this cube"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-raised p-5 text-left shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The clone form itself, used by the dialog and by `/cubes/new?start=clone`.
 *
 * Bare `useActionState`, deliberately not wrapped in a client closure: React
 * only emits a form's no-JS submit fields when the action carries
 * `$$FORM_ACTION`, and a wrapper drops it. See "Calling a server action" in
 * the root CLAUDE.md. A local error boundary is the fix if dropped requests
 * start reaching `error.tsx` from here.
 */
export function CloneCubeForm({
  username,
  slug,
  sourceName,
  viewerUsername,
  onCancel,
}: {
  username: string;
  slug: string;
  sourceName: string;
  viewerUsername: string;
  /** Present in the dialog; the page has its own way back. */
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(cloneCubeAction, initial);
  const [name, setName] = useState(sourceName);
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    // Selected rather than just focused: most people rename it outright.
    nameRef.current?.select();
  }, []);

  const preview = name.trim() ? slugify(name) : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="slug" value={slug} />

      <div>
        <h2 className="text-lg font-semibold">{`Clone ${sourceName}`}</h2>
        <p className="mt-1 text-sm text-muted">
          You get your own private copy of its cards to change however you
          like. The original stays as it is.
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-name`} className={`mb-1 ${labelClass}`}>
          Name
        </label>
        <input
          ref={nameRef}
          id={`${id}-name`}
          name="name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={input}
        />
        {/* The URL is set from the name once and never changes, which is the
            whole reason to ask now. `uniqueSlug` may add a number, which this
            cannot know without a query, so it says so rather than promising. */}
        <p className={`mt-1.5 ${help}`}>
          {preview ? (
            <>
              Your URL will be{" "}
              <span className="font-mono text-muted">
                /cube/{viewerUsername}/{preview}
              </span>
              , with a number added if you already have one. It stays the same
              if you rename the cube later.
            </>
          ) : (
            "Your URL comes from the name and stays the same if you rename the cube later."
          )}
        </p>
      </div>

      {state.error && (
        <p role="alert" className={errorText}>
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btn.primarySm}>
          {pending ? "Cloning…" : "Clone cube"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={btn.ghostSm}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
