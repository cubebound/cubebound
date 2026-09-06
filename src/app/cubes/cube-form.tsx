"use client";

import { useActionState } from "react";

import type { ActionState } from "@/app/cube/actions";
import type { Cube } from "@/db/schema";
import { btn, check, errorText, input, label as labelClass, textarea } from "@/lib/ui";

const initial: ActionState = {};

const VISIBILITY_HELP: Record<string, string> = {
  public: "Anyone can find and view this cube.",
  unlisted: "Only people with the link can view it.",
  private: "Only you can view it.",
};

/** Shared by the create and settings pages. */
export default function CubeForm({
  action,
  cube,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  cube?: Cube;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      {cube && <input type="hidden" name="cubeId" value={cube.id} />}

      <div>
        <label htmlFor="name" className={`mb-1 ${labelClass}`}>
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={cube?.name ?? ""}
          placeholder="Fury Aggro Cube"
          className={input}
        />
      </div>

      <div>
        <label htmlFor="description" className={`mb-1 ${labelClass}`}>
          Description <span className="font-normal text-subtle">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={cube?.description ?? ""}
          placeholder="What's the idea behind this cube?"
          className={textarea}
        />
      </div>

      <fieldset>
        <legend className={`mb-1 ${labelClass}`}>Visibility</legend>
        <div className="space-y-1.5">
          {(["public", "unlisted", "private"] as const).map((value) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={value}
                defaultChecked={(cube?.visibility ?? "public") === value}
                className={`mt-0.5 ${check}`}
              />
              <span>
                <span className="capitalize">{value}</span>
                <span className="ml-2 text-subtle">{VISIBILITY_HELP[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className={errorText}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={btn.primary}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
