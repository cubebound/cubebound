/**
 * One-off `select` against production, for questions the standing report cannot
 * answer.
 *
 *   npm run prod-read -- "select supertype, count(*) from cards group by 1"
 *
 * **Try `npm run stats -- --prod` first.** That covers the standing questions —
 * cubes by visibility, sizes, accounts, drafts, imports, adoption — and a figure
 * that belongs there should end up there. This is for the one-off: a supertype
 * breakdown, a join the report does not do, a number nobody will ask for twice.
 * A query written here twice is a query that belongs in stats.mts.
 *
 * **Production only, and read-only by credential.** It reads
 * `.env.production.readonly`, which holds a Postgres role granted `select` and
 * no other privilege. *That role is the guarantee.* The statement check below is
 * belt-and-braces — it catches a mistake one error message earlier than the
 * server would, and must never be mistaken for the thing keeping production
 * safe. Dev needs no script and no ceremony: point anything at `.env.local`.
 *
 * **Run it bare.** `npm run prod-read -- "…"` matches the allow rule in
 * .claude/settings.json. Wrapping it in `cd … && …`, or piping it into `head`,
 * does not match that rule and falls through to a permission prompt — which is
 * how two production reads were lost before this script existed.
 */

import { readFileSync } from "node:fs";

import postgres from "postgres";

const ENV_FILE = ".env.production.readonly";

/** Rows printed before the rest is summarised. An ad-hoc query is usually read
 *  by a person or an agent, and a thousand rows helps neither. Aggregate in SQL
 *  rather than raising this. */
const MAX_ROWS = 200;

/** Cells wider than this are elided, so one long rules_text cannot destroy the
 *  alignment of every other column. */
const MAX_CELL = 60;

/**
 * Reads the connection string straight out of the env file rather than the
 * process environment, so the script behaves the same however it was started.
 * Deliberately not `scripts/lib/env.ts`: that helper falls back to `.env`, and
 * this must never silently land on a different database. Same reasoning as
 * stats.mts, which does the same thing for the same reason.
 */
function databaseUrl(): string {
  let contents: string;
  try {
    contents = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(
      `${ENV_FILE} not found. It holds the read-only role's connection string` +
        ` — see docs/agents.md. Never put a service key in it.`,
    );
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`DATABASE_URL not found in ${ENV_FILE}`);
}

/**
 * Words that have no business in a read. Checked as whole words against the
 * query with its comments stripped, so `-- delete this later` does not trip it
 * and `select 1; delete from cubes` cannot hide behind one.
 *
 * Conservative on purpose: `where name = 'update'` is refused too. That is a
 * false positive worth having, and the message says which word did it.
 */
const FORBIDDEN = [
  "insert", "update", "delete", "merge", "truncate", "drop", "alter", "create",
  "grant", "revoke", "copy", "call", "do", "into", "comment", "refresh",
  "reindex", "vacuum", "analyze", "cluster", "lock", "listen", "notify",
  "prepare", "execute", "deallocate", "discard", "set", "reset", "begin",
  "commit", "rollback", "savepoint", "security",
];

/** The query with comments replaced by a space, so the checks below cannot be
 *  talked past by hiding a second statement in one. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function assertSingleSelect(raw: string): void {
  const sql = stripComments(raw).trim().replace(/;\s*$/, "");
  if (!sql) throw new Error("No query given.");

  if (sql.includes(";")) {
    throw new Error(
      "More than one statement. This runs a single `select`, so that a query" +
        " cannot carry a second one along behind it.",
    );
  }

  if (!/^\s*(select|with)\b/i.test(sql)) {
    throw new Error(
      `A query must start with \`select\` or \`with\`. This one starts with` +
        ` "${sql.split(/\s+/)[0]}".`,
    );
  }

  for (const word of FORBIDDEN) {
    if (new RegExp(`\b${word}\b`, "i").test(sql)) {
      throw new Error(
        `\`${word}\` is not allowed here. This script runs reads only, and the` +
          ` check is deliberately blunt — if the word is innocent (a string` +
          ` literal, a column name), rewrite the query to avoid it or add the` +
          ` figure to stats.mts instead.`,
      );
    }
  }
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
}

function printTable(rows: Record<string, unknown>[]): void {
  const columns = Object.keys(rows[0]);
  const shown = rows.slice(0, MAX_ROWS).map((r) => columns.map((c) => cell(r[c])));
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...shown.map((r) => r[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((v, i) => v.padEnd(widths[i])).join("  ").trimEnd();

  console.log(line(columns));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of shown) console.log(line(r));

  if (rows.length > MAX_ROWS) {
    console.log(
      `\n… ${rows.length - MAX_ROWS} more rows not shown. Aggregate in SQL` +
        ` rather than reading past ${MAX_ROWS}.`,
    );
  }
}

const query = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
assertSingleSelect(query);

const sql = postgres(databaseUrl(), { prepare: false, max: 2 });

try {
  const [{ now }] = await sql<{ now: string }[]>`select now()::date::text as now`;
  const rows = (await sql.unsafe(query)) as unknown as Record<string, unknown>[];

  console.log(`cubebound prod-read — PRODUCTION — as of ${now}\n`);
  if (rows.length === 0) console.log("No rows.");
  else printTable(rows);
  console.log(`\n${rows.length} row${rows.length === 1 ? "" : "s"}.`);
} finally {
  await sql.end();
}
