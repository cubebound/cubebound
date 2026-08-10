/**
 * Covers the per-copy model and the change log.
 *
 *   1. adding a card twice stores one row with quantity 2, and the editor
 *      lists it as two entries rather than one "×2"
 *   2. section moves and printing switches act on ONE copy, leaving the rest
 *   3. every edit lands in the change log with the right shape
 *
 * Prerequisite: npm run dev. Creates a throwaway account and deletes it again.
 *
 *   npm run check:copies-and-log
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import {
  addCubeCard,
  countCubeCards,
  createCube,
  getCubeCards,
  listCubeChanges,
  moveCopyToSection,
  recordCubeChange,
  removeCubeCard,
  switchCopyPrinting,
} from "../src/db/queries/cubes";
import { claimUsername } from "../src/db/queries/users";
import { countCopies, expandCopies, ambiguousBaseIds } from "../src/lib/cube-cards";

const APP = process.env.APP_URL ?? "http://localhost:3000";

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

const projectUrl = new URL(fromEnvFile("NEXT_PUBLIC_SUPABASE_URL"));
const projectRef = projectUrl.host.split(".")[0];
const publishable = fromEnvFile("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

let userId: string | undefined;

try {
  // --- pure helpers ----------------------------------------------------------
  const sample = [
    { id: "A", baseId: "A", section: "main", quantity: 3 },
    { id: "B", baseId: "B", section: "main", quantity: 1 },
  ];
  expect(countCopies(sample) === 4, "countCopies should total copies");
  const expanded = expandCopies(sample);
  expect(expanded.length === 4, `expandCopies should yield one entry per copy, got ${expanded.length}`);
  expect(
    new Set(expanded.map((c) => c.key)).size === 4,
    "each expanded copy needs its own key",
  );
  expect(
    expanded.filter((c) => c.card.id === "A").map((c) => c.copyNumber).join() === "1,2,3",
    "copies should be numbered within their card",
  );
  const ambiguous = ambiguousBaseIds([
    { id: "X-1", baseId: "X", section: "main" },
    { id: "X-1a", baseId: "X", section: "main" },
    { id: "Y-1", baseId: "Y", section: "main" },
  ]);
  expect(ambiguous.has("X") && !ambiguous.has("Y"), "only multi-printing cards are ambiguous");
  expect(
    !ambiguousBaseIds([
      { id: "X-1", baseId: "X", section: "main" },
      { id: "X-1a", baseId: "X", section: "sideboard" },
    ]).has("X"),
    "printings in different sections are not ambiguous with each other",
  );

  // --- setup ------------------------------------------------------------------
  const email = `copies-${Date.now()}@cubebound.test`;
  const password = `Pw-${Math.random().toString(36).slice(2)}`;
  const [row] = await sql`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      ${email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
      '', '', '', '', '', '', '', ''
    ) returning id`;
  userId = row.id;
  const username = `copies${Date.now() % 1000000}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(claimed.error);

  const cube = await createCube({
    ownerId: row.id,
    name: "Copies Cube",
    description: null,
    visibility: "private",
  });

  // A card with two printings, so a per-copy printing switch is possible.
  const [pair] = await sql<{ base_id: string }[]>`
    select base_id from cards where type = 'Unit'
    group by base_id having count(*) > 1 order by base_id limit 1`;
  const printings = await sql<{ id: string; name: string }[]>`
    select id, name from cards where base_id = ${pair.base_id}
    order by (id = base_id) desc, id`;
  const [basePrinting, altPrinting] = printings;

  // --- 1: three copies live in one row and expand to three entries ------------
  await addCubeCard(cube.id, basePrinting.id, "main");
  await addCubeCard(cube.id, basePrinting.id, "main");
  await addCubeCard(cube.id, basePrinting.id, "main");
  let rows = await getCubeCards(cube.id);
  expect(rows.length === 1, `three adds should be one row, got ${rows.length}`);
  expect(rows[0].quantity === 3, `stored quantity should be 3, got ${rows[0].quantity}`);
  expect(expandCopies(rows).length === 3, "the UI should see three entries");
  expect((await countCubeCards(cube.id)) === 3, "counts should be copies");

  // --- 2: moving one copy leaves the others behind ---------------------------
  const moved = await moveCopyToSection(cube.id, basePrinting.id, "main", "sideboard");
  expect(moved, "moving a copy should report success");
  rows = await getCubeCards(cube.id);
  const mainRow = rows.find((r) => r.section === "main");
  const sideRow = rows.find((r) => r.section === "sideboard");
  expect(mainRow?.quantity === 2, `two copies should stay in main, got ${mainRow?.quantity}`);
  expect(sideRow?.quantity === 1, `one copy should move, got ${sideRow?.quantity}`);
  expect(countCopies(rows) === 3, "moving must not create or lose copies");

  // Switching one copy's printing likewise affects one.
  const switched = await switchCopyPrinting(cube.id, basePrinting.id, altPrinting.id, "main");
  expect(switched, "switching a printing should report success");
  rows = await getCubeCards(cube.id);
  const stillBase = rows.find((r) => r.id === basePrinting.id && r.section === "main");
  const nowAlt = rows.find((r) => r.id === altPrinting.id && r.section === "main");
  expect(stillBase?.quantity === 1, `one copy should keep the base printing, got ${stillBase?.quantity}`);
  expect(nowAlt?.quantity === 1, `one copy should become the alt printing, got ${nowAlt?.quantity}`);
  expect(countCopies(rows) === 3, "switching must not create or lose copies");

  // Both printings in one section: the text view needs to label them.
  expect(
    ambiguousBaseIds(rows).has(pair.base_id),
    "a card held in two printings in one section should be flagged ambiguous",
  );

  // Merging back onto an occupied slot keeps both copies.
  await switchCopyPrinting(cube.id, altPrinting.id, basePrinting.id, "main");
  rows = await getCubeCards(cube.id);
  expect(
    countCopies(rows) === 3 &&
      rows.find((r) => r.id === basePrinting.id && r.section === "main")?.quantity === 2,
    "switching back onto an occupied printing should merge, not overwrite",
  );

  const removed = await removeCubeCard(cube.id, basePrinting.id, "main");
  expect(removed === 2, `removing the row should report both copies, got ${removed}`);

  // --- 3: the change log --------------------------------------------------------
  // Log entries come from the actions, which need a session; record a couple
  // directly to prove the storage and ordering, then check the page renders.
  await recordCubeChange({
    cubeId: cube.id,
    actorId: row.id,
    actorUsername: username,
    kind: "cards_added",
    cardId: basePrinting.id,
    cardName: basePrinting.name,
    quantity: 2,
    toSection: "main",
  });
  await recordCubeChange({
    cubeId: cube.id,
    actorId: row.id,
    actorUsername: username,
    kind: "printing_switched",
    cardId: altPrinting.id,
    cardName: altPrinting.name,
    quantity: 1,
    toSection: "main",
    fromValue: basePrinting.id,
    toValue: altPrinting.id,
  });

  const log = await listCubeChanges(cube.id);
  expect(log.length >= 2, `the log should have entries, got ${log.length}`);
  expect(log[0].kind === "printing_switched", "the log should be newest first");
  expect(log[0].actorUsername === username, "entries should record who made the change");
  expect(
    log.every((entry) => entry.createdAt instanceof Date),
    "entries should be timestamped",
  );

  // A bad entry must not throw into the caller — the edit already happened.
  await recordCubeChange({
    cubeId: "00000000-0000-0000-0000-0000000000ff",
    kind: "cards_added",
  });
  expect(true, "recording against a missing cube should not throw");

  // --- the tab renders -----------------------------------------------------------
  const res = await fetch(`${projectUrl.origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(`token grant failed: ${JSON.stringify(session)}`);
  const cookie =
    `sb-${projectRef}-auth-token=base64-` +
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

  const page = await fetch(`${APP}/cube/${username}/${cube.slug}/edit?mode=log`, {
    headers: { cookie },
  });
  const html = await page.text();
  expect(page.status === 200, `the change log tab should render, got ${page.status}`);
  expect(html.includes("Change log"), "the tab should be present in the nav");
  expect(html.includes(basePrinting.name), "the log should name the cards involved");
  expect(!/×\d/.test(html), "the change log should not use ×N notation");
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  if (userId) await sql`delete from auth.users where id = ${userId}::uuid`;
  await sql.end();
}

if (failures.length > 0) {
  console.error(`copies and log check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("copies and log check passed");
}
process.exit(failures.length > 0 ? 1 : 0);
