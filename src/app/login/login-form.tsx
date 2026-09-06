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
      <div className="rounded-lg border border-line bg-sunken p-4 text-sm">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1 text-muted">
          We sent you a sign-in link. It expires in an hour.
        </p>
        {/* Offered here too: this screen is exactly where someone ends up when
            the mail does not arrive, and a dead end is the worst thing to show
            them. */}
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-muted">
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

      <div className="flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-sunken" />
        or
        <span className="h-px flex-1 bg-sunken" />
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
        className="h-10 w-full rounded-md border border-line bg-sunken px-3 text-sm text-ink placeholder:text-subtle focus:border-line-strong"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-md bg-ink text-sm font-medium text-surface hover:bg-ink-hover disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
        <p className="text-xs text-subtle">
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
      <p className="text-xs text-subtle">
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
