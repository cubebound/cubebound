/**
 * Validated Supabase connection settings shared by the browser and server
 * clients.
 *
 * The guard here exists because `NEXT_PUBLIC_*` values are inlined into the
 * client bundle by Next: putting a secret key in that slot ships it to every
 * visitor, and secret keys bypass Row Level Security. Supabase's key families:
 *
 *   sb_publishable_…  browser-safe, subject to RLS   <- belongs in NEXT_PUBLIC_
 *   sb_secret_…       server-only, bypasses RLS      <- never in NEXT_PUBLIC_
 *
 * Legacy JWT keys (`eyJ…`) carry the role in the payload; `service_role` is the
 * secret one. We fail loudly rather than quietly leaking a credential.
 */

function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64").toString("utf8"),
      );
      return payload.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}

export function supabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example)");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set (see .env.example)");

  if (isSecretKey(key)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET Supabase key. NEXT_PUBLIC_ " +
        "values are inlined into the browser bundle, so this would publish a " +
        "credential that bypasses Row Level Security. Rotate that key in the " +
        "Supabase dashboard and use the publishable (sb_publishable_…) key here.",
    );
  }

  // A project URL with a path (e.g. ".../rest/v1/") makes supabase-js build
  // requests like <origin>/rest/v1/rest/v1/… and every call 404s with PGRST125.
  const origin = new URL(url).origin;
  return { url: origin, key };
}
