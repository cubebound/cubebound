import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseConfig } from "./config";

/**
 * Whether the request carries a Supabase session cookie at all.
 *
 * supabase-js names it `sb-<project-ref>-auth-token`, split into `.0`, `.1`…
 * chunks when large; the PKCE verifier rides as `…-auth-token-code-verifier`.
 * Matching the prefix and the infix covers every form, on any project ref.
 */
export function hasAuthCookie(names: readonly string[]): boolean {
  return names.some((name) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/**
 * Refreshes the auth token and writes the rotated cookies onto the outgoing
 * response. Server Components cannot set cookies, so without this a session
 * would silently expire mid-visit.
 *
 * **A request with no session cookie skips all of it.** There is nothing to
 * refresh, and that is most traffic: signed-out visitors, crawlers, and every
 * `<Link>` prefetch they fire. Middleware was half the site's Fluid Active CPU
 * in September 2026, almost all of it this function running for nobody.
 */
export async function updateSession(request: NextRequest) {
  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the token with Supabase; getSession() would trust the
  // cookie as-is. Do not add logic between client creation and this call.
  await supabase.auth.getUser();

  return response;
}
