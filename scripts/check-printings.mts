/**
 * Guards how printings collapse in the card browser.
 *
 * `cards.base_id` names the canonical printing of a card. It is resolved from
 * card data, not from the id string, because sets reprint cards in their
 * high-numbered showcase slots both within a set and across sets — see
 * src/lib/card-ids.ts. Two definitions exist (TypeScript for the sync, SQL for
 * the migration) and this asserts they agree on every row.
 *
 *   npm run check:printings
 *
 * Read-only: it never writes to the database.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { assignBaseIds, cardIdentityKey, composeCardId, provisionalBaseId } from "../src/lib/card-ids";

function fromEnvFile(name: string): string {
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

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

/**
 * Cards that legitimately share a name while being different cards. Empty
 * today; add an id with a reason if a set ever ships one, so the check below
 * stays meaningful instead of being loosened.
 */
const DOCUMENTED_SPLITS: Record<string, string> = {};

try {
  const rows = await sql<
    {
      id: string;
      base_id: string;
      name: string;
      type: string;
      set_code: string;
      collector_no: string;
      rarity: string;
      rules_text: string | null;
    }[]
  >`select id, base_id, name, type, set_code, collector_no, rarity, rules_text from cards`;

  expect(rows.length > 0, "no cards in the database");

  // --- pure id helpers -------------------------------------------------------
  expect(provisionalBaseId("OGN-100a") === "OGN-100", "alt art should drop its letter");
  expect(provisionalBaseId("OGN-301-star") === "OGN-301", "signature should drop -star");
  expect(provisionalBaseId("UNL-T01") === "UNL-T01", "token ids have no suffix to strip");
  expect(composeCardId("ogn", 1, "") === "OGN-001", "compose should pad the collector number");
  expect(composeCardId("UNL", 3, "t03") === "UNL-T03", "compose should format tokens");

  // --- SQL and TypeScript must agree on every row ----------------------------
  const expected = assignBaseIds(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      setCode: r.set_code,
      collectorNo: r.collector_no,
      rarity: r.rarity,
    })),
  );
  const mismatches = rows.filter((r) => expected.get(r.id) !== r.base_id);
  expect(
    mismatches.length === 0,
    `SQL and assignBaseIds disagree on ${mismatches.length} row(s): ` +
      mismatches.slice(0, 5).map((m) => `${m.id} db=${m.base_id} ts=${expected.get(m.id)}`).join("; "),
  );

  // --- the bug this check exists for -----------------------------------------
  // Same card, more than one canonical printing => it shows up twice in the
  // collapsed browser. Identity is (name, type): rules text cannot be used,
  // because showcase reprints drop the parenthetical reminder text and
  // sometimes reword the ability entirely.
  const byIdentity = new Map<string, Set<string>>();
  const sampleIds = new Map<string, string[]>();
  for (const row of rows) {
    const key = cardIdentityKey({ name: row.name, type: row.type });
    if (!byIdentity.has(key)) {
      byIdentity.set(key, new Set());
      sampleIds.set(key, []);
    }
    byIdentity.get(key)!.add(row.base_id);
    sampleIds.get(key)!.push(row.id);
  }
  const split = [...byIdentity.entries()].filter(
    ([key, bases]) => bases.size > 1 && !DOCUMENTED_SPLITS[key],
  );
  expect(
    split.length === 0,
    `${split.length} card(s) collapse to more than one entry: ` +
      split.slice(0, 8).map(([key]) => `${key} (${sampleIds.get(key)!.join(", ")})`).join("; "),
  );

  // The stricter form the brief asked for: identical rules text must never be
  // split. This is a subset of the check above but fails louder when it trips.
  const byNameAndRules = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.name.trim().toLowerCase()}|${(row.rules_text ?? "").trim()}`;
    if (!byNameAndRules.has(key)) byNameAndRules.set(key, new Set());
    byNameAndRules.get(key)!.add(row.base_id);
  }
  const identicalSplit = [...byNameAndRules.entries()].filter(([, bases]) => bases.size > 1);
  expect(
    identicalSplit.length === 0,
    `${identicalSplit.length} row group(s) share a name AND identical rules text but have different base_ids: ` +
      identicalSplit.slice(0, 5).map(([key]) => key.split("|")[0]).join(", "),
  );

  // --- must NOT merge: different cards sharing a collector number ------------
  for (const row of rows.filter((r) => /-T\d+$/.test(r.id))) {
    const [set, token] = [row.id.split("-")[0], row.id.match(/-T(\d+)$/)![1]];
    const twinId = `${set}-${token.padStart(3, "0")}`;
    const twin = rows.find((r) => r.id === twinId);
    if (!twin) continue;
    if (twin.name.toLowerCase() === row.name.toLowerCase()) continue; // genuinely the same card
    expect(
      twin.base_id !== row.base_id,
      `${row.id} "${row.name}" and ${twin.id} "${twin.name}" are different cards but share base_id ${row.base_id}`,
    );
  }

  // Every base_id must point at a row that exists, and canonical rows point at
  // themselves.
  const ids = new Set(rows.map((r) => r.id));
  const dangling = rows.filter((r) => !ids.has(r.base_id));
  expect(dangling.length === 0, `${dangling.length} row(s) point at a base_id that does not exist`);

  const canonicals = new Set(rows.map((r) => r.base_id));
  const notSelfBased = [...canonicals].filter(
    (base) => rows.find((r) => r.id === base)?.base_id !== base,
  );
  expect(
    notSelfBased.length === 0,
    `${notSelfBased.length} canonical row(s) do not point at themselves: ${notSelfBased.slice(0, 5).join(", ")}`,
  );

  console.log(
    `printings: ${rows.length} rows -> ${canonicals.size} entries when collapsed ` +
      `(${byIdentity.size} distinct cards by name+type)`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  await sql.end();
}

if (failures.length > 0) {
  console.error(`printing check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("printing check passed");
