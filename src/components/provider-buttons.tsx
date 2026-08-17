"use client";

import { useActionState } from "react";

import { OAUTH_PROVIDERS, PROVIDER_LABELS, type OAuthProvider } from "@/lib/auth-providers";

interface FormState {
  error?: string;
}

const initial: FormState = {};

/** Brand marks, inline so they follow the theme and cost no extra request. */
function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === "discord") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-current">
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.6.4 2.9 1 4.1 1.8a13.9 13.9 0 0 0-11-1.3l.3-.5A19.8 19.8 0 0 0 3.7 4.4C1.1 8.3.4 12.1.7 15.9a20 20 0 0 0 6 3l.5-.7c-1-.4-1.9-.9-2.7-1.5l.6-.4a14.2 14.2 0 0 0 13.8 0l.6.4c-.8.6-1.7 1.1-2.7 1.5l.5.7a20 20 0 0 0 6-3c.4-4.4-.6-8.2-3-11.5ZM8.4 13.6c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6Z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3Z" />
      <path fill="#EA4335" d="M12 5.1c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3c.9-2.7 3.4-4.7 6.4-4.7Z" />
    </svg>
  );
}

/**
 * One button per provider, posting to a server action.
 *
 * A form rather than a link: the action calls `signInWithOAuth`, which sets the
 * PKCE verifier cookie *before* handing back the URL to redirect to. A plain
 * anchor straight to the provider would skip that and the exchange would fail
 * on the way back with "code verifier not found in storage".
 *
 * `hide` drops providers already on the account, so the settings page offers
 * only what is missing.
 */
export default function ProviderButtons({
  action,
  hide = [],
  verb = "Continue with",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hide?: string[];
  verb?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const offered = OAUTH_PROVIDERS.filter((provider) => !hide.includes(provider));

  if (offered.length === 0) return null;

  return (
    <div className="space-y-2">
      {offered.map((provider) => (
        <form key={provider} action={formAction}>
          <input type="hidden" name="provider" value={provider} />
          <button
            type="submit"
            disabled={pending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <ProviderIcon provider={provider} />
            {verb} {PROVIDER_LABELS[provider]}
          </button>
        </form>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </div>
  );
}
