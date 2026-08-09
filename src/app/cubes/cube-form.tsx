"use client";

import { useActionState } from "react";

import type { ActionState } from "@/app/cube/actions";
import type { Cube } from "@/db/schema";

const initial: ActionState = {};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 " +
  "placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

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
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={cube?.name ?? ""}
          placeholder="Fury Aggro Cube"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Description <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={cube?.description ?? ""}
          placeholder="What's the idea behind this cube?"
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Visibility</legend>
        <div className="space-y-1.5">
          {(["public", "unlisted", "private"] as const).map((value) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={value}
                defaultChecked={(cube?.visibility ?? "public") === value}
                className="mt-0.5 accent-zinc-900 dark:accent-zinc-100"
              />
              <span>
                <span className="capitalize">{value}</span>
                <span className="ml-2 text-zinc-500">{VISIBILITY_HELP[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
