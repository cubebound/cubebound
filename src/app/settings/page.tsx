import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { linkProvider } from "@/app/auth/actions";
import ProviderButtons from "@/components/provider-buttons";
import { getCurrentUser } from "@/lib/auth";
import { isOAuthProvider, PROVIDER_LABELS, providersOf } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Settings" };

/**
 * Account settings. Today that means: how you get in.
 *
 * The page leads with sign-in methods rather than burying them, because the
 * only irreversible account problem this site can produce is losing access to
 * the mailbox — there is no password to fall back on and no support queue.
 */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const current = await getCurrentUser();
  if (!current) redirect("/login?next=/settings");
  if (!current.profile) redirect("/welcome");

  const providers = providersOf(current.user);
  const hasBackup = providers.some(isOAuthProvider);

  // A failed link comes back through the home page's fragment reader, because
  // Supabase reports it after a `#` where the server cannot see it. Rendered
  // here rather than there so the message lands next to the button that
  // produced it. `ProviderButtons` has its own error slot, but that one only
  // covers a failure the action returns without leaving the site.
  const params = await searchParams;
  const linkError = Array.isArray(params.error) ? params.error[0] : params.error;
  const asked = Array.isArray(params.linked) ? params.linked[0] : params.linked;
  // The URL says which provider to name; the account says whether it happened.
  // Only the second is a truth claim, so the banner is gated on that.
  const linked = asked && providers.includes(asked) ? asked : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted">
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
        <h2 className="text-lg font-semibold">Ways to sign in</h2>

        {linkError && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {linkError}
          </p>
        )}

        {/* Only shown when the provider is genuinely on the account: the query
            parameter says the browser came back from a link, the list below is
            what actually happened. A success banner that trusts the URL alone
            would congratulate someone whose link silently failed. */}
        {linked && (
          <p
            role="status"
            className="mt-3 text-sm text-green-700 dark:text-green-400"
          >
            {PROVIDER_LABELS[linked] ?? linked} is connected. You can now sign in
            with it.
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {providers.map((provider) => (
            <li
              key={provider}
              className="flex items-center justify-between rounded-md border border-line px-4 py-3 text-sm"
            >
              <span className="font-medium">
                {PROVIDER_LABELS[provider] ?? provider}
              </span>
              <span className="text-subtle">Connected</span>
            </li>
          ))}
        </ul>

        {!hasBackup ? (
          <div className="mt-4 rounded-md border border-amber-400/60 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-950/20">
            <p className="text-sm font-medium">Add a backup way in</p>
            <p className="mt-1 text-sm text-muted">
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
            <p className="text-sm text-muted">
              You have a backup way in, so losing access to your email
              won&rsquo;t lock you out.
            </p>
            <div className="mt-3">
              <ProviderButtons action={linkProvider} hide={providers} verb="Also connect" />
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-subtle">
          Connecting here attaches the provider to <em>this</em> account, whatever
          address it uses — your Google or Discord address does not have to match
          your sign-in email. The one thing that will not work is connecting an
          account already linked to a different cubebound account.
        </p>
      </section>

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="text-lg font-semibold">Your data</h2>
        <p className="mt-2 text-sm text-muted">
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
