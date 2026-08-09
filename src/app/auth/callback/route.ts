import { NextResponse, type NextRequest } from "next/server";

import { getProfileById } from "@/db/queries/users";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the magic link. Exchanges the PKCE code for a session,
 * then sends first-time users to claim a username.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    const reason = searchParams.get("error_description") ?? "Missing sign-in code";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(reason)}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`,
    );
  }

  const profile = await getProfileById(data.user.id);
  if (!profile) return NextResponse.redirect(`${origin}/welcome`);

  // Only allow same-site redirects.
  const destination = next?.startsWith("/") ? next : "/";
  return NextResponse.redirect(`${origin}${destination}`);
}
