"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { claimUsername } from "@/db/queries/users";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { checkUsername } from "@/lib/username";

export interface FormState {
  error?: string;
  sent?: boolean;
}

function siteUrl(): string {
  // Vercel sets VERCEL_URL per deployment; NEXT_PUBLIC_SITE_URL pins the
  // production domain so magic links don't point at a preview build.
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
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
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) return { error: error.message };
  return { sent: true };
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
  if (!user) return { error: "You need to sign in first." };

  const check = checkUsername(String(formData.get("username") ?? ""));
  if (!check.ok) return { error: check.error };

  const result = await claimUsername(user.id, check.username);
  if (!result.ok) return { error: result.error };

  revalidateAuthUi();
  redirect("/");
}
