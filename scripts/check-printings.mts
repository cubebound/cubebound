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
  isTokenCard,
  nameWithoutTreatment,
  provisionalBaseId,
  TOKEN_ID_PATTERN,
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
      supertype: string | null;
      rules_text: string | null;
    }[]
  >`select id, base_id, name, type, set_code, collector_no, rarity, supertype, rules_text from cards`;

  expect(rows.length > 0, "no cards in the database");

  // --- pure id helpers -------------------------------------------------------
  expect(provisionalBaseId("OGN-100a") === "OGN-100", "alt art should drop its letter");
  expect(provisionalBaseId("OGN-301-star") === "OGN-301", "signature should drop -star");
  expect(provisionalBaseId("UNL-T01") === "UNL-T01", "token ids have no suffix to strip");
  expect(composeCardId("ogn", 1, "") === "OGN-001", "compose should pad the collector number");
  expect(composeCardId("UNL", 3, "t03") === "UNL-T03", "compose should format tokens");

  // --- tokens are not cards --------------------------------------------------
  // Synthetic, because the half that matters most is not in dev at all: the
  // retired riftscribe tokens (`UNL-T01`…) have a null supertype and exist only
  // in production. A supertype-only rule would pass every live row below.
  const tokenCases: [string, string | null, string, boolean][] = [
    ["UNL-T01", null, "riftscribe token, null supertype, caught by id", true],
    ["SFD-T03", "Token", "riftcodex token by id and supertype", true],
    ["OGN-271", "Token", "token with an ordinary id, caught by supertype", true],
    ["UNL-T01a", null, "an alt-art token id", true],
    ["OGN-042", null, "an ordinary card", false],
    ["OGN-100a", null, "an alt art", false],
    ["OGN-301-star", null, "a signature", false],
    ["VEN-R01", "Basic", "a basic rune", false],
    ["VEN-SP3", null, "a special-slot reprint", false],
    ["OGN-150", "Champion", "a champion", false],
  ];
  for (const [id, supertype, label, token] of tokenCases) {
    expect(
      isTokenCard({ id, supertype }) === token,
      `isTokenCard(${id}, ${supertype}): ${label} should ${token ? "" : "not "}be a token`,
    );
  }

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

  // --- tokens: SQL and TypeScript agree, and never share a group with a card --
  // `tokenCard` in src/db/queries/cards.ts is the SQL half; it binds the same
  // pattern, and must use `is not distinct from` because ordinary supertypes
  // are null. This script cannot import it (importing the query layer needs
  // DATABASE_URL at load), so the query below restates it: this proves the
  // pattern means the same in Postgres and JS. That the export itself leaves
  // tokens out is `check:card-filters` and `check:import`, through its results.
  const tokensInSql = new Set(
    (
      await sql<{ id: string }[]>`
        select id from cards
         where supertype is not distinct from 'Token' or id ~ ${TOKEN_ID_PATTERN}`
    ).map((r) => r.id),
  );
  const tokensInTs = new Set(rows.filter(isTokenCard).map((r) => r.id));
  const tokenDisagree = [
    ...[...tokensInSql].filter((id) => !tokensInTs.has(id)),
    ...[...tokensInTs].filter((id) => !tokensInSql.has(id)),
  ];
  expect(tokensInTs.size > 0, "no token rows found: has the source stopped serving them?");
  expect(
    tokenDisagree.length === 0,
    `SQL and isTokenCard disagree on ${tokenDisagree.length} row(s): ${tokenDisagree.slice(0, 5).join(", ")}`,
  );
  // The import catalog keeps only base printings that are not tokens, which is
  // safe only if no print group mixes the two.
  const mixedGroups = [...new Set(rows.map((r) => r.base_id))].filter((base) => {
    const group = rows.filter((r) => r.base_id === base);
    return group.some(isTokenCard) && !group.every(isTokenCard);
  });
  expect(
    mixedGroups.length === 0,
    `${mixedGroups.length} print group(s) mix tokens and cards: ${mixedGroups.slice(0, 5).join(", ")}`,
  );
  // And the rule is not a name match: a real card carrying a token's word
  // ("Recruit the Vanguard", "Sprite Queen") stays a card.
  const tokenWords = new Set(
    rows.filter(isTokenCard).flatMap((r) => nameWithoutTreatment(r.name).toLowerCase().split(/\W+/)),
  );
  const namesakes = rows.filter(
    (r) =>
      r.supertype !== "Token" &&
      !/-T\d/.test(r.id) &&
      r.name.toLowerCase().split(/\W+/).some((word) => word.length > 3 && tokenWords.has(word)),
  );
  expect(
    namesakes.every((r) => !isTokenCard(r)),
    `a card named after a token was classed as one: ` +
      namesakes.filter(isTokenCard).map((r) => `${r.id} "${r.name}"`).join("; "),
  );

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
      `(${treated.length} treatment printing(s) folded in), ${tokensInTs.size} token row(s), ` +
      `${namesakes.length} card(s) named after a token kept`,
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
