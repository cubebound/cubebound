"use client";

import { useActionState, useState } from "react";

import { updatePrimerAction, type ActionState } from "@/app/cube/actions";
import Primer from "@/components/primer";

const initial: ActionState & { saved?: boolean } = {};

/**
 * Markdown source on the left, live preview on the right. The preview uses the
 * exact component the cube page renders with, so what the owner sees while
 * writing is what readers get — including anything the sanitizer strips.
 */
export default function PrimerEditor({
  cubeId,
  primer,
}: {
  cubeId: string;
  primer: string | null;
}) {
  const [state, formAction, pending] = useActionState(updatePrimerAction, initial);
  const [draft, setDraft] = useState(primer ?? "");
  const dirty = draft !== (primer ?? "");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="cubeId" value={cubeId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="primer" className="mb-1 block text-sm font-medium">
            Primer <span className="font-normal text-zinc-500">(markdown)</span>
          </label>
          <textarea
            id="primer"
            name="primer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={22}
            spellCheck
            placeholder={"# About this cube\n\nWhat's the archetype plan? How does drafting it feel?\n\n- Headings, lists, **bold**, links and tables all work.\n- HTML is not rendered."}
            className="w-full rounded-md border border-zinc-300 bg-white p-3 font-mono text-sm leading-relaxed focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Markdown only — raw HTML is stripped when the primer is shown.
          </p>
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-sm font-medium">Preview</p>
          <div className="min-h-[10rem] rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            {draft.trim() ? (
              <Primer markdown={draft} />
            ) : (
              <p className="text-sm text-zinc-500">Nothing written yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Saving…" : "Save primer"}
        </button>
        <p aria-live="polite" className="text-sm">
          {state.error ? (
            <span role="alert" className="text-red-600 dark:text-red-400">
              {state.error}
            </span>
          ) : dirty ? (
            <span className="text-zinc-500">Unsaved changes</span>
          ) : state.saved ? (
            <span className="text-zinc-500">Saved</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
