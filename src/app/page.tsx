import Link from "next/link";
import { redirect } from "next/navigation";

/** First value of a param that may arrive repeated. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The landing page also catches near-miss auth redirects.
 *
 * Supabase falls back to the project's Site URL when `emailRedirectTo` isn't on
 * the allowlist, which drops the visitor here with `?code=…` and nothing to
 * consume it — sign-in silently never completes. Forwarding to the callback
 * makes that self-heal instead of stranding the user. The PKCE verifier lives
 * in a cookie, so the exchange still works after the hop.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const code = one(params.code);
  const errorDescription = one(params.error_description) ?? one(params.error);

  if (code || errorDescription) {
    const forward = new URLSearchParams();
    if (code) forward.set("code", code);
    if (errorDescription) forward.set("error_description", errorDescription);
    const next = one(params.next);
    if (next?.startsWith("/")) forward.set("next", next);
    redirect(`/auth/callback?${forward.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Cube construction and drafting for Riftbound
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Cube building is still in progress. In the meantime, browse the full
        card pool.
      </p>
      <Link
        href="/cards"
        className="mt-8 inline-flex h-10 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Browse cards
      </Link>
    </div>
  );
}
