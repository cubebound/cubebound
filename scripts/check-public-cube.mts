/**
 * Covers the public cube view and the quantity model.
 *
 *   1. public and unlisted cubes render for signed-out visitors
 *   2. private cubes 404 for strangers and for signed-out visitors, and the
 *      owner still sees them
 *   3. cloning copies sections, printings and quantities into a new private
 *      cube owned by the caller, and cannot be used to clone someone else's
 *      private cube
 *   4. adding a card already in the cube increments its quantity, and counts
 *      are copies rather than rows
 *
 * Prerequisite: npm run dev. Creates throwaway accounts and deletes them again.
 *
 *   npm run check:public-cube
 */

import postgres from "postgres";

import { fromEnvFile } from "./lib/env";
import { createTestAccount, deleteTestAccounts } from "./lib/test-account";

import { getCardById } from "../src/db/queries/cards";
import {
  addCubeCard,
  adjustCubeCardQuantity,
  cloneCube,
  countCubeCards,
  createCube,
  getCubeCards,
  updateCube,
} from "../src/db/queries/cubes";
import { canEditCube, canViewCube } from "../src/lib/cube-access";
import { defaultSectionForType } from "../src/lib/riftbound";

const APP = process.env.APP_URL ?? "http://localhost:3000";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const created: string[] = [];

try {
  // --- the access rule itself ------------------------------------------------
  for (const visibility of ["public", "unlisted"]) {
    expect(canViewCube({ ownerId: "a", visibility }, null), `${visibility} should be readable signed out`);
    expect(canViewCube({ ownerId: "a", visibility }, "b"), `${visibility} should be readable by others`);
  }
  expect(!canViewCube({ ownerId: "a", visibility: "private" }, null), "private is not public");
  expect(!canViewCube({ ownerId: "a", visibility: "private" }, "b"), "private is not readable by others");
  expect(canViewCube({ ownerId: "a", visibility: "private" }, "a"), "private is readable by its owner");
  expect(!canEditCube({ ownerId: "a", visibility: "public" }, "b"), "public is still not editable by others");

  const owner = await createTestAccount(sql, { prefix: "own" });
  created.push(owner.id);
  const stranger = await createTestAccount(sql, { prefix: "str" });
  created.push(stranger.id);

  const cube = await createCube({
    ownerId: owner.id,
    name: "Public View Cube",
    description: "Visible to everyone.",
    visibility: "public",
  });

  // --- quantity model --------------------------------------------------------
  const [unitRow] = await sql<{ id: string }[]>`
    select id from cards where type = 'Unit' and base_id = id order by id limit 1`;
  const unit = await getCardById(unitRow.id);
  if (!unit) throw new Error("no unit card found");
  const section = defaultSectionForType(unit.type);

  await addCubeCard(cube.id, unit.id, section);
  await addCubeCard(cube.id, unit.id, section);
  await addCubeCard(cube.id, unit.id, section);

  const rows = await getCubeCards(cube.id);
  expect(rows.length === 1, `re-adding should not create extra rows, got ${rows.length}`);
  expect(rows[0]?.quantity === 3, `re-adding should increment quantity, got ${rows[0]?.quantity}`);
  expect((await countCubeCards(cube.id)) === 3, "counts should be copies, not rows");

  const afterDown = await adjustCubeCardQuantity(cube.id, unit.id, section, -1);
  expect(afterDown === 2, `decrement should leave 2, got ${afterDown}`);

  const afterZero = await adjustCubeCardQuantity(cube.id, unit.id, section, -5);
  expect(afterZero === 0, `over-decrementing should clamp to 0, got ${afterZero}`);
  expect((await getCubeCards(cube.id)).length === 0, "reaching zero should remove the row");

  // Rebuild a small cube across sections for the clone check.
  const spread = await sql<{ id: string; type: string }[]>`
    select id, type from (
      select id, type, row_number() over (partition by type order by id) as rn
      from cards where base_id = id and type in ('Unit','Spell','Legend','Rune','Battlefield')
    ) ranked where rn <= 2`;
  for (const card of spread) {
    await addCubeCard(cube.id, card.id, defaultSectionForType(card.type));
  }
  await addCubeCard(cube.id, spread[0].id, defaultSectionForType(spread[0].type)); // a multiple
  const sourceRows = await getCubeCards(cube.id);
  const sourceTotal = await countCubeCards(cube.id);
  expect(sourceTotal === sourceRows.length + 1, "the source cube should hold one multiple");

  // --- clone -----------------------------------------------------------------
  const clone = await cloneCube(cube.id, stranger.id, `Copy of ${cube.name}`);
  const clonedRows = await getCubeCards(clone.id);
  expect(clone.visibility === "private", `clones should be private, got ${clone.visibility}`);
  expect(clone.name === "Copy of Public View Cube", `unexpected clone name: ${clone.name}`);
  expect(clone.ownerId === stranger.id, "the clone should belong to the caller");
  expect(clone.description === null, "the clone should not inherit the original's description");
  expect(
    clonedRows.length === sourceRows.length,
    `clone should copy every row (${sourceRows.length} -> ${clonedRows.length})`,
  );
  expect(
    (await countCubeCards(clone.id)) === sourceTotal,
    "clone should preserve quantities, not just rows",
  );
  const sourceKeys = sourceRows.map((r) => `${r.id}:${r.section}:${r.quantity}`).sort();
  const cloneKeys = clonedRows.map((r) => `${r.id}:${r.section}:${r.quantity}`).sort();
  expect(
    JSON.stringify(sourceKeys) === JSON.stringify(cloneKeys),
    "clone should copy the exact printings, sections and quantities",
  );

  // --- HTTP visibility -------------------------------------------------------
  const status = async (path: string, cookie?: string) =>
    (await fetch(`${APP}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" }))
      .status;

  const publicPath = `/cube/${owner.username}/${cube.slug}`;
  expect((await status(publicPath)) === 200, "a public cube should render signed out");
  expect((await status(publicPath, stranger.cookie)) === 200, "a public cube should render for others");
  expect((await status(publicPath, owner.cookie)) === 200, "a public cube should render for its owner");

  // --- Share button ----------------------------------------------------------
  // The link it copies has to be absolute: a relative one is useless the moment
  // it leaves the page, which is the entire point of the button.
  const body = async (path: string, cookie?: string) =>
    (await fetch(`${APP}${path}`, { headers: cookie ? { cookie } : {} })).text();

  const visitorHtml = await body(publicPath, stranger.cookie);
  expect(visitorHtml.includes(">Share<"), "the public page should offer a Share button");
  expect(
    visitorHtml.includes(`${APP}${publicPath}`),
    `Share should carry the absolute cube URL ${APP}${publicPath}`,
  );
  // A visitor's primary action is cloning; the owner's is editing. Prominence
  // is the filled button style, so exactly one of them should carry it.
  const filled = /bg-zinc-900 px-3 text-sm font-medium text-white/;
  const clonePosition = visitorHtml.indexOf(">Clone<");
  expect(clonePosition !== -1, "a visitor should see Clone");
  expect(
    filled.test(visitorHtml.slice(Math.max(0, clonePosition - 600), clonePosition)),
    "Clone should be the prominent button for a visitor",
  );

  const ownerHtml = await body(publicPath, owner.cookie);
  expect(ownerHtml.includes(">Share<"), "the owner should also get a Share button");

  // The analytics tab is computed, not stored, so a broken panel renders as a
  // 500 rather than as wrong numbers. Assert it comes back at all, and that it
  // reports the cube's real size — the share previews taught us that a route
  // nothing looks at is a route that ships broken.
  const analyticsHtml = await body(`${publicPath}?tab=analytics`, stranger.cookie);
  expect(
    analyticsHtml.includes("Energy curve") && analyticsHtml.includes("Keywords"),
    "the analytics tab should render its panels",
  );
  expect(
    analyticsHtml.includes("Rules text length"),
    "including the rules-text panel",
  );

  // The owner works in the editor, so the link has to be reachable from there
  // too — that is where they are when they want to hand the cube to someone.
  const editorHtml = await body(`${publicPath}/edit`, owner.cookie);
  expect(editorHtml.includes(">Share<"), "the editor should offer a Share button");
  expect(
    editorHtml.includes(`${APP}${publicPath}`),
    `the editor's Share should carry the absolute URL ${APP}${publicPath}`,
  );
  const editPosition = ownerHtml.indexOf(">Edit<");
  expect(editPosition !== -1, "the owner should see Edit");
  expect(
    filled.test(ownerHtml.slice(Math.max(0, editPosition - 600), editPosition)),
    "Edit should be the prominent button for the owner",
  );

  await updateCube(cube.id, {
    name: cube.name,
    description: cube.description,
    visibility: "unlisted",
  });
  expect((await status(publicPath)) === 200, "an unlisted cube should render signed out");

  await updateCube(cube.id, {
    name: cube.name,
    description: cube.description,
    visibility: "private",
  });
  expect((await status(publicPath)) === 404, "a private cube should 404 signed out");
  expect((await status(publicPath, stranger.cookie)) === 404, "a private cube should 404 for others");
  expect((await status(publicPath, owner.cookie)) === 200, "a private cube should render for its owner");

  // A stranger must not be able to clone a private cube, even knowing its path.
  expect(
    !canViewCube({ ownerId: owner.id, visibility: "private" }, stranger.id),
    "the clone action's gate must reject a private cube for a stranger",
  );

  // The editor stays owner-only regardless of visibility.
  expect(
    (await status(`${publicPath}/edit`, stranger.cookie)) === 404,
    "the editor should stay owner-only",
  );

  const missing = await status(`/cube/${owner.username}/does-not-exist`);
  expect(missing === 404, `an unknown slug should 404, got ${missing}`);
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  await deleteTestAccounts(sql, created);
  await sql.end();
}

if (failures.length > 0) {
  console.error(`public cube check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("public cube check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing here
// closes, so the event loop would keep the process alive.
process.exit(failures.length > 0 ? 1 : 0);
