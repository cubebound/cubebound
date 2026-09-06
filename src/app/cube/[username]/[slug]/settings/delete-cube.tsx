"use client";

import { useActionState, useState } from "react";

import { deleteCubeAction, type ActionState } from "@/app/cube/actions";
import type { Cube } from "@/db/schema";

const initial: ActionState = {};

export default function DeleteCube({ cube, cardCount }: { cube: Cube; cardCount: number }) {
  const [state, formAction, pending] = useActionState(deleteCubeAction, initial);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Delete this cube
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-red-300 p-4 dark:border-red-800">
      <input type="hidden" name="cubeId" value={cube.id} />
      <p className="text-sm text-muted">
        This permanently deletes <strong>{cube.name}</strong>
        {cardCount > 0 && <> and its {cardCount} {cardCount === 1 ? "card" : "cards"}</>}. This
        cannot be undone, and the URL will stop working for anyone you shared it with.
      </p>
      <label htmlFor="confirmName" className="block text-sm">
        Type <span className="font-mono font-semibold">{cube.name}</span> to confirm:
      </label>
      <input
        id="confirmName"
        name="confirmName"
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        className="w-full rounded-md border border-line bg-sunken px-3 py-2 text-sm focus:border-line-strong"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || typed !== cube.name}
          className="h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="h-10 rounded-md border border-line px-4 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
