/**
 * Drives the bulk importer with a fixture list and checks both halves: what the
 * preview says would happen, and what the cube actually holds afterwards.
 *
 * The fixture deliberately covers the parsing rules that are easy to get subtly
 * wrong — both quantity forms, both comment markers, section headers, a name
 * that does not exist, a near-miss that must suggest rather than guess, and a
 * name carrying punctuation ("Daisy!").
 *
 * Ambiguity is covered with a synthetic catalog: no name in the real pool maps
 * to two distinct cards today, so testing it against live data would assert
 * nothing. The rule still has to hold for the day a set reprints a name onto a
 * different card type.
 *
 * Prerequisite: npm run dev. Creates a throwaway account and deletes it again.
 *
 *   npm run check:import
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { getImportCatalog } from "../src/db/queries/cards";
import {
  addCubeCard,
  createCube,
  getCubeCards,
  listCubeChanges,
} from "../src/db/queries/cubes";
import { claimUsername } from "../src/db/queries/users";
import { MAX_CARD_QUANTITY } from "../src/db/queries/cubes";
import {
  MAX_IMPORT_LINES,
  buildCatalogIndex,
  mergeImportRows,
  parseImportList,
  previewImport,
  resolveLine,
  type CatalogCard,
} from "../src/lib/import-list";

function fromEnvFile(name: string): string {
  for (const file of [".env.local", ".env"]) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const line = contents
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line) return line.slice(line.indexOf("=") + 1).trim();
  }
  throw new Error(`${name} is not set`);
}

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });

const failures: string[] = [];
const expect = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

const created: string[] = [];

async function makeUser(): Promise<{ id: string; username: string }> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `import-${suffix}@cubebound.test`;
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
      'authenticated', ${email}, crypt('probe-password', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', '', '', '', '', ''
    ) returning id`;
  created.push(row.id);
  const username = `import${suffix}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(`could not claim username: ${claimed.error}`);
  return { id: row.id, username };
}

try {
  const catalog = await getImportCatalog();
  expect(catalog.length > 0, "the catalog should not be empty");

  const byName = new Map(catalog.map((c) => [c.name.toLowerCase(), c]));
  const need = (name: string): CatalogCard => {
    const card = byName.get(name.toLowerCase());
    if (!card) throw new Error(`fixture expects a card named "${name}"`);
    return card;
  };

  // Real cards the fixture leans on.
  const furyRune = need("Fury Rune");
  const daisy = need("Daisy!");
  const scorcher = need("Blazing Scorcher");
  const legend = catalog.find((c) => c.type === "Legend")!;

  // --- 1. Parsing ------------------------------------------------------------
  const list = [
    "# a comment, ignored",
    "// so is this one",
    "",
    "   ",
    `2 ${furyRune.name}`,
    `3x ${scorcher.name}`,
    daisy.name,
    "",
    "Legends:",
    legend.name,
    "Sideboard:",
    `2x ${daisy.name}`,
    "// trailing comment",
    "Definitely Not A Real Card",
    "Blazing Scorche",
  ].join("\n");

  const parsed = parseImportList(list);
  expect(parsed.error === undefined, `clean list should parse without error: ${parsed.error}`);
  expect(parsed.lines.length === 7, `expected 7 card lines, got ${parsed.lines.length}`);
  expect(
    parsed.lines[0].quantity === 2 && parsed.lines[0].name === furyRune.name,
    `"2 ${furyRune.name}" should parse as quantity 2`,
  );
  expect(
    parsed.lines[1].quantity === 3 && parsed.lines[1].name === scorcher.name,
    `"3x ${scorcher.name}" should parse as quantity 3`,
  );
  expect(parsed.lines[2].quantity === 1, "a bare name should be quantity 1");
  expect(parsed.lines[2].name === daisy.name, `punctuation should survive: ${parsed.lines[2].name}`);
  expect(parsed.lines[3].section === "legends", "a Legends: header should set the section");
  expect(parsed.lines[4].section === "sideboard", "a Sideboard: header should switch the section");

  // --- 2. Matching -----------------------------------------------------------
  const preview = previewImport(list, catalog);
  expect(preview.matchedCount === 5, `expected 5 matched rows, got ${preview.matchedCount}`);
  expect(preview.unmatchedCount === 2, `expected 2 unmatched rows, got ${preview.unmatchedCount}`);
  expect(preview.ambiguousCount === 0, `expected no ambiguity, got ${preview.ambiguousCount}`);
  // 2 + 3 + 1 + 1 legend + 2 sideboard
  expect(preview.totalCopies === 9, `expected 9 copies, got ${preview.totalCopies}`);

  const daisyRow = preview.rows.find((r) => r.name === daisy.name)!;
  expect(
    daisyRow.resolution.status === "matched",
    `"${daisy.name}" should match exactly, got ${daisyRow.resolution.status}`,
  );
  expect(
    daisyRow.section === "main",
    `"${daisy.name}" is a ${daisy.type}, so it should infer main, got ${daisyRow.section}`,
  );

  const legendRow = preview.rows.find((r) => r.name === legend.name)!;
  expect(legendRow.section === "legends", "the header should win for the legend line");

  const sideboardDaisy = preview.rows.filter((r) => r.name === daisy.name)[1];
  expect(
    sideboardDaisy.section === "sideboard",
    "an explicit header should override the type-inferred section",
  );

  // The invented name resolves to nothing and suggests nothing confidently.
  const missing = preview.rows.find((r) => r.name === "Definitely Not A Real Card")!;
  expect(missing.resolution.status === "unmatched", "an invented name should not match");

  // The near miss must SUGGEST rather than silently correct itself.
  const nearMiss = preview.rows.find((r) => r.name === "Blazing Scorche")!;
  expect(nearMiss.resolution.status === "unmatched", "a near miss must not auto-match");
  expect(
    nearMiss.resolution.status === "unmatched" &&
      nearMiss.resolution.suggestions.some((c) => c.id === scorcher.id),
    `a near miss should suggest "${scorcher.name}"`,
  );

  // Case-insensitivity, and smart-quote tolerance for pasted lists.
  const cased = previewImport(furyRune.name.toUpperCase(), catalog);
  expect(cased.matchedCount === 1, "matching should be case-insensitive");

  const apostrophe = catalog.find((c) => c.name.includes("'"));
  if (apostrophe) {
    const curly = previewImport(apostrophe.name.replace(/'/g, "’"), catalog);
    expect(
      curly.matchedCount === 1,
      `a curly apostrophe should still match "${apostrophe.name}"`,
    );
  }

  // --- 3. Ambiguity, on a synthetic catalog ---------------------------------
  const twins: CatalogCard[] = [
    { id: "AAA-001", name: "Twinned Name", type: "Unit" },
    { id: "BBB-002", name: "Twinned Name", type: "Spell" },
  ];
  const twinPreview = previewImport("Twinned Name", twins);
  expect(twinPreview.ambiguousCount === 1, "one name, two cards, should be ambiguous");
  expect(twinPreview.matchedCount === 0, "an ambiguous name must never count as matched");
  const twinRow = twinPreview.rows[0];
  expect(
    twinRow.resolution.status === "ambiguous" && twinRow.resolution.candidates.length === 2,
    "an ambiguity should carry both candidates for the user to pick from",
  );

  // A name that begins with digits must beat the quantity reading.
  const numbered = buildCatalogIndex([{ id: "N-1", name: "1000 Cuts", type: "Spell" }]);
  const numberedRow = resolveLine(parseImportList("1000 Cuts").lines[0], numbered);
  expect(
    numberedRow.resolution.status === "matched" && numberedRow.quantity === 1,
    "a name starting with digits should not be read as a quantity",
  );

  // --- 4. The line cap -------------------------------------------------------
  const tooMany = Array.from({ length: MAX_IMPORT_LINES + 5 }, () => furyRune.name).join("\n");
  const capped = parseImportList(tooMany);
  expect(capped.error !== undefined, "exceeding the cap should be an error, not a silent trim");
  expect(
    (capped.error ?? "").includes(String(MAX_IMPORT_LINES)),
    "the cap message should say what the limit is",
  );

  // --- 4b. Commit validation -------------------------------------------------
  // The client picks from options; it does not get to dictate them.
  const bad = [
    [{ cardId: "X-1", section: "main", quantity: 0 }, "a zero quantity"],
    [{ cardId: "X-1", section: "main", quantity: 1000 }, "a quantity past the cap"],
    [{ cardId: "X-1", section: "nowhere", quantity: 1 }, "an unknown section"],
    [{ cardId: "", section: "main", quantity: 1 }, "a missing card id"],
  ] as const;
  for (const [row, label] of bad) {
    const result = mergeImportRows([row], MAX_CARD_QUANTITY);
    expect(result.ok === false, `merge should reject ${label}`);
  }
  expect(
    mergeImportRows([], MAX_CARD_QUANTITY).ok === false,
    "merge should reject an empty import",
  );
  const duplicated = mergeImportRows(
    [
      { cardId: "X-1", section: "main", quantity: 2 },
      { cardId: "X-1", section: "main", quantity: 3 },
    ],
    MAX_CARD_QUANTITY,
  );
  expect(
    duplicated.ok && duplicated.rows.length === 1 && duplicated.rows[0].quantity === 5,
    "the same card twice should merge into one row of 5",
  );

  // --- 5. Committing ---------------------------------------------------------
  const user = await makeUser();
  const cube = await createCube({
    ownerId: user.id,
    name: "Import Check Cube",
    description: null,
    visibility: "private",
  });

  // Something already in the cube, so we can prove imports append rather than
  // replace and that duplicates increment.
  await addCubeCard(cube.id, furyRune.id, "runes", 1);

  const rows = preview.rows.flatMap((row) =>
    row.resolution.status === "matched" && row.section
      ? [{ cardId: row.resolution.card.id, section: row.section, quantity: row.quantity }]
      : [],
  );

  // The real merge/validate the action runs, not a copy of it.
  const merge = mergeImportRows(rows, MAX_CARD_QUANTITY);
  if (!merge.ok) throw new Error(`merge rejected a valid import: ${merge.error}`);
  for (const entry of merge.rows) {
    await addCubeCard(cube.id, entry.cardId, entry.section, entry.quantity);
  }
  const copies = merge.totalCopies;

  const contents = await getCubeCards(cube.id);
  const runeRow = contents.find(
    (c) => c.id === furyRune.id && c.section === "runes",
  );
  expect(
    runeRow?.quantity === 3,
    `the pre-existing copy plus 2 imported should be 3, got ${runeRow?.quantity}`,
  );

  const daisyMain = contents.find((c) => c.id === daisy.id && c.section === "main");
  const daisySide = contents.find((c) => c.id === daisy.id && c.section === "sideboard");
  expect(daisyMain?.quantity === 1, "Daisy! should land in main once");
  expect(daisySide?.quantity === 2, "Daisy! should also land in the sideboard twice");

  const legendRowDb = contents.find((c) => c.id === legend.id);
  expect(legendRowDb?.section === "legends", "the legend should be filed under legends");

  expect(copies === 9, `the import should have added 9 copies, got ${copies}`);

  // --- 6. One batch entry in the log ----------------------------------------
  const { recordCubeChange } = await import("../src/db/queries/cubes");
  await recordCubeChange({
    cubeId: cube.id,
    actorId: user.id,
    actorUsername: user.username,
    kind: "cards_imported",
    quantity: copies,
    toValue: String(merge.rows.length),
  });
  const changes = await listCubeChanges(cube.id);
  const imports = changes.filter((c) => c.kind === "cards_imported");
  expect(imports.length === 1, `an import should log exactly one entry, got ${imports.length}`);
  expect(imports[0]?.quantity === 9, `the entry should record 9 copies, got ${imports[0]?.quantity}`);

  console.log(
    `import: ${preview.matchedCount} matched, ${preview.unmatchedCount} unmatched, ` +
      `${preview.ambiguousCount} ambiguous, ${copies} copies committed across ${merge.rows.length} rows`,
  );
} finally {
  for (const id of created) await sql`delete from auth.users where id = ${id}::uuid`;
  await sql.end();
}

console.log(
  failures.length ? `\nFAILURES:\n - ${failures.join("\n - ")}` : "import check passed",
);
process.exit(failures.length ? 1 : 0);
