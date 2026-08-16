/**
 * A local session without email.
 *
 * The dev project sends auth mail through Supabase's built-in sender, which is
 * testing-only: a few messages an hour, and restricted to addresses in your
 * Supabase organisation. When it silently drops one, `/auth/v1/otp` still
 * returns 200 and GoTrue still stamps `recovery_sent_at`, so nothing local
 * looks wrong and there is no link. This is the way in that does not depend on
 * any of that.
 *
 * **It creates a new throwaway account. It never touches an existing one.**
 * That rule is not stylistic: a script that instead set a password on a real
 * row to borrow a session once locked the dev admin out of their own account,
 * because overwriting the email means their magic links match nothing. If the
 * username is taken this refuses rather than reusing it.
 *
 * Dev only, by construction — it refuses unless `DATABASE_URL` and
 * `NEXT_PUBLIC_SUPABASE_URL` name the same project, which is the same guard
 * `seed:discovery` uses to stop a stray shell variable pointing it at
 * production.
 *
 *   npm run dev:login                    # a plain account
 *   npm run dev:login -- --admin         # with the moderation tools
 *   npm run dev:login -- --name mytester --admin
 */
import postgres from "postgres";

import { fromEnvFile } from "./lib/env";
import { createTestAccount, supabaseSettings } from "./lib/test-account";

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const wantsAdmin = args.includes("--admin");
const nameArg = args[args.indexOf("--name") + 1];
const requested = args.includes("--name") && nameArg ? nameArg.toLowerCase() : null;

const { origin, databaseUrl } = supabaseSettings();

// Both must name the same project, or this could be pointed at production by a
// stray environment variable.
const dbHost = new URL(databaseUrl).hostname;
const projectRef = new URL(origin).hostname.split(".")[0];
if (!dbHost.includes(projectRef) && !dbHost.includes("pooler")) {
  console.error(
    `refusing to run: DATABASE_URL (${dbHost}) and NEXT_PUBLIC_SUPABASE_URL ` +
      `(${projectRef}) do not look like the same project`,
  );
  process.exit(1);
}

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false, max: 2 });

try {
  if (requested) {
    const [taken] = await sql<{ id: string }[]>`
      select id from users where username = ${requested}`;
    if (taken) {
      console.error(
        `refusing: "${requested}" already exists. This script never reuses an ` +
          `existing account — pick another name, or drop --name for a fresh one.`,
      );
      process.exit(1);
    }
  }

  const account = await createTestAccount(sql, { prefix: requested ?? "devlogin" });

  if (wantsAdmin) {
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, account.id));
  }

  const { ref } = supabaseSettings();
  const [name, ...rest] = account.cookie.split("=");
  const value = rest.join("=");

  console.log(`\nSigned in as ${account.username}${wantsAdmin ? " (admin)" : ""}.\n`);
  console.log("Paste this into the browser console on http://localhost:3000, then reload:\n");
  console.log(
    `document.cookie = ${JSON.stringify(`${name}=${value}; path=/; max-age=3600`)};\n`,
  );
  console.log(`Cookie name: ${name}   (project ${ref})`);
  console.log(`Delete the account when you are done:`);
  console.log(`  npm run dev:logout -- ${account.username}\n`);
} catch (error) {
  console.error("dev login failed:", (error as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(process.exitCode ?? 0);
