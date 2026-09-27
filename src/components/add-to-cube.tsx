"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  addCardAction,
  addTargetAction,
  cubeCopiesAction,
  listCubeChoicesAction,
} from "@/app/cube/actions";
import type { CubeChoice } from "@/db/queries/cubes";
import { btn, inputSm, link } from "@/lib/ui";

type Choice = CubeChoice & { editPath: string };

/**
 * The cube the reader last had open, remembered on this device.
 *
 * A convenience and nothing more: the server re-checks ownership of whatever
 * this holds and falls back to the most recently edited cube, so a stale or
 * missing value only costs the reader a click on Change. Storage can throw in
 * a private window, hence the guards.
 */
const LAST_CUBE_KEY = "cubebound:last-cube";

export function rememberCube(cubeId: string): void {
  try {
    localStorage.setItem(LAST_CUBE_KEY, cubeId);
  } catch {
    // Storage unavailable; the server's fallback covers it.
  }
}

function recalledCube(): string | null {
  try {
    return localStorage.getItem(LAST_CUBE_KEY);
  } catch {
    return null;
  }
}

/** Written by the editor on open, so "the cube you are working on" is literal. */
export function RememberCube({ cubeId }: { cubeId: string }) {
  useEffect(() => rememberCube(cubeId), [cubeId]);
  return null;
}

const LOST =
  "Lost contact with the server. Nothing was added. Check your connection and try again.";

/**
 * Add the open card to one of your cubes, from anywhere a card's detail box
 * opens outside the editor.
 *
 * **One request when the box opens, one more only if asked for.** Opening
 * resolves the cube you last had open, or your most recently edited one, and
 * how many copies of this card it holds. Your whole list loads only when you
 * press Change, because most of the time you are adding to the one cube
 * already on screen. Signed out, the answer is `signedOut` and nothing renders.
 *
 * The add itself is the editor's `addCardAction`, so ownership, suspension,
 * the token refusal and the change log all apply unchanged, and the card lands
 * in the section it would by default. Every call here catches a rejected
 * promise, per the root CLAUDE.md, so a dropped request is a message, not the
 * error page.
 */
export default function AddToCube({ cardId }: { cardId: string }) {
  const [target, setTarget] = useState<Choice | null>(null);
  const [copies, setCopies] = useState(0);
  const [state, setState] = useState<"loading" | "hidden" | "none" | "ready">("loading");
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    addTargetAction(cardId, recalledCube())
      .then((result) => {
        if (!live) return;
        if ("signedOut" in result) return setState("hidden");
        if ("error" in result) {
          setError(result.error);
          return setState("ready");
        }
        if (!result.cube) return setState("none");
        setTarget(result.cube);
        setCopies(result.copies);
        setState("ready");
      })
      // Failing to learn the target hides the control rather than showing a
      // broken one; the rest of the box is unaffected.
      .catch(() => live && setState("hidden"));
    return () => {
      live = false;
    };
  }, [cardId]);

  if (state === "loading" || state === "hidden") return null;

  if (state === "none") {
    return (
      <p className="text-sm text-muted">
        <Link href="/cubes/new" className={link}>
          Create a cube
        </Link>{" "}
        to add cards to it from here.
      </p>
    );
  }

  const openPicker = () => {
    setPicking(true);
    if (choices) return;
    startTransition(async () => {
      try {
        const result = await listCubeChoicesAction();
        if ("error" in result) setError(result.error);
        else setChoices(result.cubes);
      } catch {
        setError(LOST);
      }
    });
  };

  const choose = (cubeId: string) => {
    const next = choices?.find((c) => c.id === cubeId);
    if (!next) return;
    setTarget(next);
    setPicking(false);
    setMessage(null);
    setError(null);
    rememberCube(next.id);
    startTransition(async () => {
      try {
        const result = await cubeCopiesAction(next.id, cardId);
        if ("error" in result) setError(result.error);
        else setCopies(result.copies);
      } catch {
        setError(LOST);
      }
    });
  };

  const add = () => {
    if (!target) return;
    setMessage(null);
    setError(null);
    setAdding(true);
    startTransition(async () => {
      try {
        const result = await addCardAction(target.id, cardId);
        if (result.error) return setError(result.error);
        setCopies((n) => n + 1);
        setMessage(`Added to ${target.name}.`);
        rememberCube(target.id);
      } catch {
        setError(LOST);
      } finally {
        setAdding(false);
      }
    });
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {picking ? (
          <select
            autoFocus
            aria-label="Cube to add to"
            value={target?.id ?? ""}
            onChange={(event) => choose(event.target.value)}
            onBlur={() => choices && setPicking(false)}
            disabled={!choices}
            className={`${inputSm} max-w-60`}
          >
            {!choices && <option value={target?.id ?? ""}>Loading your cubes…</option>}
            {choices?.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">
            Add to{" "}
            {target && (
              <Link href={target.editPath} className="font-medium text-ink hover:underline">
                {target.name}
              </Link>
            )}{" "}
            <button type="button" onClick={openPicker} className={link}>
              Change
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={add}
          disabled={pending || !target}
          className={`${btn.primarySm} ml-auto`}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-xs text-subtle" aria-live="polite">
        {error ? (
          <span className="text-red-600 dark:text-red-400">{error}</span>
        ) : message ? (
          `${message} ${copies} ${copies === 1 ? "copy" : "copies"} in the cube now.`
        ) : copies > 0 ? (
          `Already in this cube (${copies} ${copies === 1 ? "copy" : "copies"}). Add puts in another.`
        ) : (
          "Goes in the section the cube files it under."
        )}
      </p>
    </div>
  );
}
