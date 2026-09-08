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

import postgres from "postgres";

import { fromEnvFile } from "./lib/env";

import {
  assignBaseIds,
  cardIdentityKey,
  collapseIdentityKey,
  composeCardId,
  nameWithoutTreatment,
  provisionalBaseId,
} from "../src/lib/card-ids";

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

  // --- what the card browser actually collapses on --------------------------
  // `base_id` is right for every card whose printings share a name, and wrong
  // for the ones whose treatment the source spells *in* the name. The browser
  // groups on `collapseKey` instead (src/db/queries/cards.ts); these assert the
  // TypeScript mirror of that regex agrees with Postgres on every row, and that
  // the rule does what it was added to do.
  const strippedInSql = await sql<{ id: string; stripped: string }[]>`
    select id, regexp_replace(name, '\\s*\\([^()]*\\)\\s*$', '') as stripped from cards`;
  const sqlStrip = new Map(strippedInSql.map((r) => [r.id, r.stripped.trim()]));
  const stripMismatches = rows.filter(
    (r) => sqlStrip.get(r.id) !== nameWithoutTreatment(r.name),
  );
  expect(
    stripMismatches.length === 0,
    `SQL and nameWithoutTreatment disagree on ${stripMismatches.length} row(s): ` +
      stripMismatches
        .slice(0, 5)
        .map((m) => `${m.id} sql="${sqlStrip.get(m.id)}" ts="${nameWithoutTreatment(m.name)}"`)
        .join("; "),
  );

  const collapsed = new Set(rows.map((r) => collapseIdentityKey(r)));

  // The bug this rule exists for: a promo whose name carries its treatment must
  // land on the same entry as the card it varies, not beside it.
  const treated = rows.filter((r) => nameWithoutTreatment(r.name) !== r.name.trim());
  expect(treated.length > 0, "no treatment-suffixed rows found — has the source changed?");
  const orphaned = treated.filter(
    (r) => !rows.some((o) => o !== r && collapseIdentityKey(o) === collapseIdentityKey(r)),
  );
  expect(
    orphaned.length === 0,
    `${orphaned.length} treatment printing(s) collapse to an entry of their own: ` +
      orphaned.slice(0, 5).map((o) => `${o.id} "${o.name}"`).join("; "),
  );

  // And the other half: a parenthetical that is *not* trailing is part of the
  // name. `Recruit (271) // Buff` and its three siblings are distinct cards.
  const midName = rows.filter((r) => /\([^()]*\)/.test(r.name) && !/\([^()]*\)\s*$/.test(r.name));
  expect(
    midName.length > 0 && midName.every((r) => nameWithoutTreatment(r.name) === r.name.trim()),
    `a mid-name parenthetical was stripped: ` +
      midName
        .filter((r) => nameWithoutTreatment(r.name) !== r.name.trim())
        .map((r) => `${r.id} "${r.name}"`)
        .join("; "),
  );
  expect(
    new Set(midName.map((r) => collapseIdentityKey(r))).size === midName.length,
    `mid-name parenthetical cards collapsed together: ` +
      midName.map((r) => `${r.id} "${r.name}"`).join("; "),
  );

  console.log(
    `printings: ${rows.length} rows -> ${canonicals.size} base_id group(s), ` +
      `${collapsed.size} entries as the browser collapses them ` +
      `(${treated.length} treatment printing(s) folded in)`,
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
