/**
 * Deletes an account `dev:login` created.
 *
 * The other half of "create, use, delete". Refuses anything whose email is not
 * a `@cubebound.test` throwaway, so it cannot be pointed at a real account by a
 * mistyped username — which is the accident worth designing against here, given
 * deletion cascades to cubes, drafts and follows.
 *
 *   npm run dev:logout -- devlogin123456
 *   npm run dev:logout -- --all
 */
import postgres from "postgres";

import { fromEnvFile } from "./lib/env";

const args = process.argv.slice(2);
const all = args.includes("--all");
const username = args.find((a) => !a.startsWith("--"));

if (!all && !username) {
  console.error("usage: npm run dev:logout -- <username>   (or --all)");
  process.exit(1);
}

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false, max: 1 });

try {
  const targets = all
    ? await sql<{ id: string; username: string; email: string }[]>`
        select u.id, u.username, a.email
        from users u join auth.users a on a.id = u.id
        where a.email like '%@cubebound.test'`
    : await sql<{ id: string; username: string; email: string }[]>`
        select u.id, u.username, a.email
        from users u join auth.users a on a.id = u.id
        where u.username = ${username!.toLowerCase()}`;

  if (targets.length === 0) {
    console.log("nothing to delete");
  }

  for (const target of targets) {
    // The guard: only ever a throwaway address.
    if (!target.email?.endsWith("@cubebound.test")) {
      console.error(
        `refusing to delete "${target.username}" — its address is not a ` +
          `@cubebound.test throwaway, so it is somebody's real account`,
      );
      process.exitCode = 1;
      continue;
    }
    await sql`delete from auth.users where id = ${target.id}::uuid`;
    console.log(`deleted ${target.username}`);
  }
} finally {
  await sql.end();
}
process.exit(process.exitCode ?? 0);
