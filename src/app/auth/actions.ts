"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { claimUsername } from "@/db/queries/users";
import { getAuthUser } from "@/lib/auth";
import { isOAuthProvider } from "@/lib/auth-providers";
import { authCallbackUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { checkUsername } from "@/lib/username";

export interface FormState {
  error?: string;
  sent?: boolean;
}

/**
 * Drops the client Router Cache for every route.
 *
 * The nav renders the signed-in user from the ROOT LAYOUT, and a Server Action
 * that redirects does not re-render a layout the router already has cached —
 * so without this, claiming a username left the nav showing "Choose a
 * username" until a hard reload. The "layout" scope is what reaches the root
 * layout on every path, rather than just the "/" page.
 */
function revalidateAuthUi(): void {
  revalidatePath("/", "layout");
}

/** Emails a magic link. */
export async function signInWithEmail(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Derived from this request's own origin — see src/lib/site-url.ts for why
    // an env var alone is not enough.
    options: { emailRedirectTo: authCallbackUrl(await headers()) },
  });

  if (error) return { error: error.message };
  return { sent: true };
}

/**
 * Sends the browser off to Discord or Google.
 *
 * The callback needs no change: `signInWithOAuth` returns to the same
 * `/auth/callback`, which already does `exchangeCodeForSession` — the identical
 * PKCE exchange a magic link uses — and already routes a user with no profile
 * to `/welcome`. `redirectTo` goes through `authCallbackUrl` for the same
 * reason the magic links do: the origin comes from the request, and **whatever
 * it produces must be on the Supabase redirect allowlist**, or Supabase quietly
 * falls back to the dashboard Site URL and sign-in never completes. That exact
 * failure shipped once.
 *
 * The provider is validated rather than trusted: it arrives from a form.
 */
export async function signInWithProvider(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const provider = String(formData.get("provider") ?? "");
  if (!isOAuthProvider(provider)) return { error: "Unknown sign-in method." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: authCallbackUrl(await headers()) },
  });

  if (error) return { error: error.message };
  if (!data?.url) return { error: "Could not start sign-in. Try again." };
  redirect(data.url);
}

/**
 * Adds a provider to the account already signed in — the backup method.
 *
 * Distinct from signing in with it: this attaches a second identity to *this*
 * account rather than resolving to whichever account matches. It needs **manual
 * linking enabled** in the Supabase dashboard; without it Supabase returns an
 * error rather than doing something surprising, which is why the message is
 * surfaced as-is.
 */
export async function linkProvider(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const provider = String(formData.get("provider") ?? "");
  if (!isOAuthProvider(provider)) return { error: "Unknown sign-in method." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  // Come back to `/settings`, not the home page. The callback exchanges the
  // code exactly as it does for a sign-in, finds a profile, and falls through
  // to its default destination — so without a `next` a *successful* link drops
  // the person on the landing page with nothing to say it worked, which is
  // indistinguishable from it having failed. `?linked=` is what the settings
  // page confirms with.
  //
  // The `next` travels on `redirectTo`, which is the pattern Supabase's own
  // Next.js example uses, and the callback already refuses anything that does
  // not start with `/`. **`redirectTo` still has to match the allowlist**, so
  // if a successful link starts landing on `/` again, suspect that first.
  const callback = new URL(authCallbackUrl(await headers()));
  callback.searchParams.set("next", `/settings?linked=${provider}`);

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: callback.toString() },
  });

  if (error) return { error: error.message };
  if (!data?.url) return { error: "Could not start linking. Try again." };
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidateAuthUi();
  redirect("/");
}

/** Claims the username for the signed-in user, then sends them home. */
export async function claimUsernameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getAuthUser();
  if (!user) return { error: "You need to be signed in." };

  const check = checkUsername(String(formData.get("username") ?? ""));
  if (!check.ok) return { error: check.error };

  const result = await claimUsername(user.id, check.username);
  if (!result.ok) return { error: result.error };

  revalidateAuthUi();
  redirect("/");
}
