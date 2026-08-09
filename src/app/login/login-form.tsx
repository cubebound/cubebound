"use client";

import { useActionState } from "react";

import { signInWithEmail, type FormState } from "@/app/auth/actions";

const initial: FormState = {};

export default function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState(signInWithEmail, initial);
  const error = state.error ?? initialError;

  if (state.sent) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          We sent you a sign-in link. It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="email" className="block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-xs text-zinc-500">
        No password needed — we email you a one-time link.
      </p>
    </form>
  );
}
