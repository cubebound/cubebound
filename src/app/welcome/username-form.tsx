"use client";

import { useActionState } from "react";

import { claimUsernameAction, type FormState } from "@/app/auth/actions";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/username";

const initial: FormState = {};

export default function UsernameForm() {
  const [state, formAction, pending] = useActionState(claimUsernameAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="username" className="block text-sm font-medium">
        Username
      </label>
      <div className="flex items-center rounded-md border border-zinc-300 bg-white focus-within:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="pl-3 text-sm text-zinc-400 select-none">cubebound.gg/cube/</span>
        <input
          id="username"
          name="username"
          required
          autoFocus
          autoComplete="off"
          spellCheck={false}
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          pattern="[A-Za-z0-9_\-]+"
          placeholder="your-name"
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Claiming…" : "Claim username"}
      </button>
      <p className="text-xs text-zinc-500">
        {USERNAME_MIN}–{USERNAME_MAX} characters: letters, numbers, hyphens and
        underscores. This becomes part of your cube URLs, so choose carefully.
      </p>
    </form>
  );
}
