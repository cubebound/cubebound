"use client";

import { useActionState } from "react";

import { signInWithEmail, signInWithProvider, type FormState } from "@/app/auth/actions";
import ProviderButtons from "@/components/provider-buttons";

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
        {/* Offered here too: this screen is exactly where someone ends up when
            the mail does not arrive, and a dead end is the worst thing to show
            them. */}
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="mb-2 text-zinc-600 dark:text-zinc-400">
            Didn&rsquo;t arrive? You can sign in another way:
          </p>
          <ProviderButtons action={signInWithProvider} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Providers first: they are one click, and the email path is the one
          that can silently fail. */}
      <ProviderButtons action={signInWithProvider} />

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

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

      {/* Signing in and *linking* resolve accounts differently, and only one of
          them cares about the address. Signing in with a provider matches on
          email, so a different address silently creates a second account and
          the cubes appear to have vanished. Linking from Settings attaches to
          whatever account you are already in, whatever address the provider
          uses — so that is the route to say out loud, rather than leaving
          people to discover the failure. */}
      <p className="text-xs text-zinc-500">
        Already have an account? Signing in with Google or Discord using the{" "}
        <strong className="font-medium">same email address</strong> connects to it
        automatically, cubes and all. To use a Google or Discord account
        associated with a{" "}
        <strong className="font-medium">different email address</strong>, sign in
        with your email first, then connect it from Settings. Otherwise, you get
        a second, empty account.
      </p>
    </div>
  );
}
