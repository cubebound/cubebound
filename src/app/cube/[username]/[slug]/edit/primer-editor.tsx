"use client";

import { useActionState, useRef, useState } from "react";

import { updatePrimerAction, type ActionState } from "@/app/cube/actions";
import MarkdownToolbar, {
  applyEdit,
  markdownShortcut,
} from "@/components/markdown-toolbar";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = draft !== (primer ?? "");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="cubeId" value={cubeId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="primer" className="mb-1 block text-sm font-medium">
            Primer <span className="font-normal text-subtle">(markdown)</span>
          </label>
          <MarkdownToolbar textareaRef={textareaRef} onChange={setDraft} />
          <textarea
            ref={textareaRef}
            id="primer"
            name="primer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              const edit = markdownShortcut(event);
              if (!edit) return;
              // Only now, so Ctrl+A / Ctrl+C and every other shortcut still
              // reach the browser.
              event.preventDefault();
              applyEdit(event.currentTarget, edit, setDraft);
            }}
            rows={22}
            spellCheck
            placeholder={"# About this cube\n\nWhat's the archetype plan? How does drafting it feel?\n\n- Use the buttons above, or write markdown directly.\n- HTML is not rendered."}
            className="w-full rounded-b-md border border-line bg-sunken p-3 font-mono text-sm leading-relaxed focus:border-line-strong"
          />
          <p className="mt-1 text-xs text-subtle">
            Markdown only. Raw HTML is stripped when the primer is shown.
          </p>
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-sm font-medium">Preview</p>
          <div className="min-h-[10rem] rounded-md border border-line p-4">
            {draft.trim() ? (
              <Primer markdown={draft} />
            ) : (
              <p className="text-sm text-subtle">Nothing written yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-surface hover:bg-ink-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save primer"}
        </button>
        <p aria-live="polite" className="text-sm">
          {state.error ? (
            <span role="alert" className="text-red-600 dark:text-red-400">
              {state.error}
            </span>
          ) : dirty ? (
            <span className="text-subtle">Unsaved changes</span>
          ) : state.saved ? (
            <span className="text-subtle">Saved</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
