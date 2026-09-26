import { NextResponse, type NextRequest } from "next/server";

import { getProfileById } from "@/db/queries/users";
import { safeReturnPath } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the magic link. Exchanges the PKCE code for a session,
 * then sends first-time users to claim a username.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeReturnPath(searchParams.get("next"));

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
  // A first-time user claims a username before anything else, and the return
  // path waits for them on the far side of that.
  if (!profile) {
    const welcome = next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome";
    return NextResponse.redirect(`${origin}${welcome}`);
  }

  // Only same-site paths; see `safeReturnPath`.
  return NextResponse.redirect(`${origin}${next ?? "/"}`);
}
