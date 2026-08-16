/**
 * Throwaway accounts for the check scripts, in one place.
 *
 * Every check needs a signed-in user, and each one used to carry its own copy
 * of the same twenty-line `insert into auth.users` — byte-identical across six
 * scripts, with two near-identical variants. Beyond the duplication that list
 * of columns is brittle: GoTrue requires several to be non-null with no
 * defaults, so one schema change upstream broke all nine copies at once.
 *
 * **Create, use, delete — never borrow an existing account.** A script that
 * instead updates a real row's email and password to get a session locks its
 * owner out: a magic link goes to whatever address is in `auth.users`, so
 * overwriting it means their own address matches nothing. That happened to the
 * dev admin account once. `deleteTestAccounts` in a `finally` is the other half
 * of the rule; the cascade takes the cubes, drafts and follows with it.
 */
import type { Sql } from "postgres";

import { claimUsername } from "../../src/db/queries/users";
import { fromEnvFile } from "./env";

export interface SupabaseSettings {
  /** Origin only — the project URL with any path stripped. */
  origin: string;
  /** The `sb-<ref>-auth-token` cookie name depends on this. */
  ref: string;
  publishableKey: string;
  databaseUrl: string;
}

export function supabaseSettings(): SupabaseSettings {
  const url = new URL(fromEnvFile("NEXT_PUBLIC_SUPABASE_URL"));
  return {
    origin: url.origin,
    ref: url.host.split(".")[0],
    publishableKey: fromEnvFile("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    databaseUrl: fromEnvFile("DATABASE_URL"),
  };
}

export interface TestAccount {
  id: string;
  username: string;
  email: string;
  /** `name=value`, ready for a `cookie:` header or `Network.setCookie`. */
  cookie: string;
}

/**
 * Creates a confirmed account with a claimed username and returns a session.
 *
 * `signIn: false` skips the password and the token grant, for accounts that
 * only need to *exist* — seeded users, or a second identity a check merely
 * compares against. Those cannot sign in, which is correct: the app is
 * magic-link only and they have no mailbox.
 */
export async function createTestAccount(
  sql: Sql,
  options: { prefix: string; signIn?: boolean } = { prefix: "test" },
): Promise<TestAccount> {
  const { prefix, signIn = true } = options;
  const stamp = Date.now();
  const email = `${prefix}-${stamp}-${Math.floor(Math.random() * 1000)}@cubebound.test`;
  const password = `Pw-${Math.random().toString(36).slice(2)}`;

  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      ${email},
      ${signIn ? sql`extensions.crypt(${password}, extensions.gen_salt('bf'))` : sql`''`},
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
      '', '', '', '', '', '', '', ''
    ) returning id`;

  // Usernames are 3–30 chars of [a-z0-9_-]; keep the prefix short enough that
  // the stamp still fits.
  const username = `${prefix.replace(/[^a-z0-9]/g, "").slice(0, 8)}${stamp % 1000000}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(`claiming ${username}: ${claimed.error}`);

  if (!signIn) return { id: row.id, username, email, cookie: "" };

  const { origin, ref, publishableKey } = supabaseSettings();
  const res = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(`token grant failed: ${JSON.stringify(session)}`);

  // The shape `@supabase/ssr` expects in the cookie.
  const value =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user,
        token_type: session.token_type,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
      }),
      "utf8",
    ).toString("base64url");

  return { id: row.id, username, email, cookie: `sb-${ref}-auth-token=${value}` };
}

/** Removes accounts and everything they own. Safe to call with an empty list. */
export async function deleteTestAccounts(sql: Sql, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await sql`delete from auth.users where id = ${id}::uuid`;
  }
}
