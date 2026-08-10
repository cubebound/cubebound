/**
 * The public origin to build magic-link redirects against.
 *
 * This has to be the origin the visitor is actually browsing, because Supabase
 * checks `emailRedirectTo` against the project's redirect allowlist and
 * **silently falls back to the dashboard's Site URL when it doesn't match** —
 * which lands the user on `/?code=…` with nothing to consume the code.
 *
 * That is exactly what broke production: the old implementation used Vercel's
 * `VERCEL_URL`, which is the *per-deployment* hostname
 * (`cubebound-a1b2c3-carl.vercel.app`), not the project domain
 * (`cubebound.vercel.app`). It is never the allowlisted origin, so every
 * production sign-in fell back to the Site URL. `VERCEL_URL` is deliberately
 * not consulted here.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — an explicit pin, for when links must always
 *      point at the canonical domain regardless of where the visitor is.
 *   2. The request's own forwarded host — correct by construction on
 *      production, preview deployments, custom domains and localhost alike,
 *      with no configuration at all. This is the normal path.
 *   3. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's *stable* project domain
 *      (unlike `VERCEL_URL`), for any server context without a request.
 *   4. localhost, for local dev.
 *
 * Trusting a request header is safe here because Vercel's edge overwrites
 * `x-forwarded-*` on the way in, and Supabase's redirect allowlist is a second
 * gate: a spoofed host produces a link Supabase refuses rather than one that
 * leaks a code to an attacker.
 */

function clean(url: string): string {
  return url.replace(/\/+$/, "");
}

function withScheme(host: string, proto: string | null): string {
  if (/^https?:\/\//.test(host)) return clean(host);
  // Bare hostnames only carry a scheme via x-forwarded-proto; assume TLS
  // unless this is plainly a loopback address.
  const scheme = proto ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https");
  return clean(`${scheme}://${host}`);
}

/**
 * @param headers request headers, when resolving inside a request. Omit only
 *   from contexts that genuinely have none.
 */
export function resolveSiteUrl(headers?: Headers | null): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return withScheme(explicit.trim(), null);

  const forwardedHost = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (forwardedHost) {
    // A comma-joined list can appear behind more than one proxy; the first
    // entry is the origin the client asked for.
    const host = forwardedHost.split(",")[0].trim();
    const proto = headers?.get("x-forwarded-proto")?.split(",")[0].trim() || null;
    if (host) return withScheme(host, proto);
  }

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return withScheme(production.trim(), null);

  return "http://localhost:3000";
}

/** Absolute URL of the magic-link landing route. */
export function authCallbackUrl(headers?: Headers | null): string {
  return `${resolveSiteUrl(headers)}/auth/callback`;
}
