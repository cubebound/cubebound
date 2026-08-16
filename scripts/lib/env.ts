import { readFileSync } from "node:fs";

/**
 * Reads a variable straight out of `.env.local`, falling back to `.env`.
 *
 * **Deliberately importing nothing.** Some checks run without
 * `--env-file-if-exists`, so anything they import must not touch
 * `src/db/index.ts` — that module reads `DATABASE_URL` at load time and throws
 * if it is missing. Putting this beside the test-account helpers pulled the
 * whole database layer in behind it and broke `check:printings` on import
 * rather than on use.
 *
 * The scripts read the file rather than the process environment so they behave
 * the same however they were started.
 */
export function fromEnvFile(name: string): string {
  for (const file of [".env.local", ".env"]) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const line = contents.split(/\r?\n/).find((l) => l.trim().startsWith(`${name}=`));
    if (line) return line.slice(line.indexOf("=") + 1).trim();
  }
  throw new Error(`${name} not found in .env.local or .env`);
}
