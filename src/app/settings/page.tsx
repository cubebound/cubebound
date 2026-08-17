import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { linkProvider } from "@/app/auth/actions";
import ProviderButtons from "@/components/provider-buttons";
import { getCurrentUser } from "@/lib/auth";
import { hasBackupSignIn, PROVIDER_LABELS, providersOf } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Settings" };

/**
 * Account settings. Today that means: how you get in.
 *
 * The page leads with sign-in methods rather than burying them, because the
 * only irreversible account problem this site can produce is losing access to
 * the mailbox — there is no password to fall back on and no support queue.
 */
export default async function SettingsPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login?next=/settings");
  if (!current.profile) redirect("/welcome");

  const providers = providersOf(current.user);
  const hasBackup = hasBackupSignIn(current.user);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Signed in as{" "}
        <Link
          href={`/u/${current.profile.username}`}
          className="font-medium underline underline-offset-2"
        >
          {current.profile.username}
        </Link>
        .
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Ways to sign in</h2>

        <ul className="mt-3 space-y-2">
          {providers.map((provider) => (
            <li
              key={provider}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <span className="font-medium">
                {PROVIDER_LABELS[provider] ?? provider}
              </span>
              <span className="text-zinc-500">Connected</span>
            </li>
          ))}
        </ul>

        {!hasBackup ? (
          <div className="mt-4 rounded-md border border-amber-400/60 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20">
            <p className="text-sm font-medium">Add a backup way in</p>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              Right now your email is the only way into this account. If you lose
              access to that mailbox — or mail simply stops arriving — there is
              no password to fall back on and no way for us to verify it is you.
              Connecting Discord or Google takes a few seconds and fixes that
              permanently.
            </p>
            <div className="mt-3">
              <ProviderButtons action={linkProvider} hide={providers} verb="Connect" />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You have a backup way in, so losing access to your email
              won&rsquo;t lock you out.
            </p>
            <div className="mt-3">
              <ProviderButtons action={linkProvider} hide={providers} verb="Also connect" />
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Connecting a provider only works when its email address matches the one
          on this account. A different address signs you into a separate account
          instead.
        </p>
      </section>

      <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-lg font-semibold tracking-tight">Your data</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          You can delete any cube from its own Settings page. Deleting your whole
          account isn&rsquo;t self-serve yet — see the{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>{" "}
          for how to ask.
        </p>
      </section>
    </div>
  );
}
