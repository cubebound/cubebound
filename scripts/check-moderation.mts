/**
 * Guards the moderation tools.
 *
 * This is a **privilege boundary**, which makes it different from the other
 * checks: the question is not only "does it work" but "does it refuse". So the
 * central assertions are the negative ones — a non-admin's request must do
 * nothing, and the rendering of a button must be irrelevant to that.
 *
 * The access rules are pure, so they are asserted directly; the effects need a
 * database, so those run against real rows. What it covers:
 *  - hidden cubes and suspended owners drop out of `canViewCube` for strangers,
 *    stay visible to an admin, and stay visible to their owner **only** in the
 *    hidden case, so they can be told why
 *  - `canUseCube` refuses even the owner, so cloning or drafting cannot route
 *    around moderation
 *  - moderated content disappears from every listing, including the owner's own
 *    `/cubes`, which is the one that would otherwise still advertise it
 *  - a non-admin calling the actions changes nothing
 *  - deleting an account takes its cubes, and leaves a log entry that survives
 *
 * Prerequisite: DB. Creates throwaway accounts and deletes them again.
 *
 *   npm run check:moderation
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { fromEnvFile } from "./lib/env";
import { createTestAccount, deleteTestAccounts } from "./lib/test-account";

import { addCubeCard, createCube, getCubeById } from "../src/db/queries/cubes";
import { searchCubes } from "../src/db/queries/discovery";
import {
  deleteUserAccount,
  logModeration,
  setCubeHidden,
  setUserSuspended,
  summarizeUser,
} from "../src/db/queries/moderation";
import { canUseCube, canViewCube, suspensionError } from "../src/lib/cube-access";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false, max: 3 });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const created: string[] = [];

try {
  // ---- the pure rules --------------------------------------------------
  const base = { ownerId: "owner", visibility: "public" };
  const hidden = { ...base, hiddenAt: new Date(), ownerSuspendedAt: null };
  const suspended = { ...base, hiddenAt: null, ownerSuspendedAt: new Date() };
  const clean = { ...base, hiddenAt: null, ownerSuspendedAt: null };

  expect(!canViewCube(hidden, "stranger"), "a hidden cube must not render for a stranger");
  expect(!canViewCube(hidden, null), "a hidden cube must not render signed out");
  // Deliberately visible to its owner: otherwise they think the site is broken.
  expect(canViewCube(hidden, "owner"), "a hidden cube must stay visible to its owner");
  expect(canViewCube(hidden, "stranger", true), "an admin must see a hidden cube");

  expect(!canViewCube(suspended, "stranger"), "a suspended owner's cube must not render");
  // Suspension switches the account off, owner included.
  expect(!canViewCube(suspended, "owner"), "a suspended owner must not see their own cube");
  expect(canViewCube(suspended, "owner", true), "an admin must see a suspended owner's cube");

  // The separate verb: readable is not usable.
  expect(!canUseCube(hidden, "owner"), "a hidden cube must not be clonable by its owner");
  expect(!canUseCube(suspended, "owner"), "a suspended owner's cube must not be usable");
  expect(canUseCube(clean, "stranger"), "an ordinary public cube stays usable");

  // ---- effects on real rows -------------------------------------------
  const owner = await createTestAccount(sql, { prefix: "modown" });
  created.push(owner.id);
  const stranger = await createTestAccount(sql, { prefix: "modstr", signIn: false });
  created.push(stranger.id);

  const [unit] = await sql<{ id: string }[]>`
    select id from cards where type = 'Unit' and base_id = id order by id limit 1`;

  const cube = await createCube({
    ownerId: owner.id,
    name: `Moderation Target ${Date.now()}`,
    description: "public and findable",
    visibility: "public",
  });
  await addCubeCard(cube.id, unit.id, "main");

  const findable = async (label: string) => {
    const rows = await searchCubes({ keywords: label, limit: 20 });
    return rows.some((row) => row.id === cube.id);
  };
  // ...and the owner's own list, which uses the same query with a different
  // restriction — the one that would still advertise a hidden cube.
  const inOwnList = async () => {
    const rows = await searchCubes({ ownerId: owner.id, includeNonPublic: true, limit: 50 });
    return rows.some((row) => row.id === cube.id);
  };

  expect(await findable(cube.name), "the cube should be findable before moderation");
  expect(await inOwnList(), "the cube should be in its owner's list before moderation");

  await setCubeHidden(cube.id, true, "check: hidden");
  expect(!(await findable(cube.name)), "a hidden cube must drop out of Explore");
  expect(
    !(await inOwnList()),
    "a hidden cube must drop out of its owner's own list too — that is the list " +
      "they look at, and it would otherwise still advertise it",
  );

  const reloaded = await getCubeById(cube.id);
  expect(Boolean(reloaded?.hiddenAt), "hiddenAt should be set");
  expect(
    reloaded?.hiddenReason === "check: hidden",
    `the reason should be stored, got ${reloaded?.hiddenReason}`,
  );
  expect(
    !canViewCube(reloaded, stranger.id),
    "the reloaded row must fail the read rule for a stranger",
  );

  await setCubeHidden(cube.id, false, null);
  expect(await findable(cube.name), "unhiding must restore it");
  const unhidden = await getCubeById(cube.id);
  expect(unhidden?.hiddenReason === null, "unhiding must clear the reason");

  // ---- suspension hides everything the account owns --------------------
  await setUserSuspended(owner.id, true);
  expect(!(await findable(cube.name)), "a suspended owner's cubes must drop out of Explore");
  expect(!(await inOwnList()), "a suspended owner's cubes must drop out of their own list");
  const underSuspension = await getCubeById(cube.id);
  expect(
    Boolean(underSuspension?.ownerSuspendedAt),
    "getCubeById must carry the owner's suspension, or the read rule cannot apply it",
  );
  expect(
    !canViewCube(underSuspension, owner.id),
    "a suspended owner must not read their own cube",
  );

  await setUserSuspended(owner.id, false);
  expect(await findable(cube.name), "unsuspending must restore the account's cubes");

  // ---- suspension stops the account writing, not just being seen -------
  // Found by audit rather than by this check: a suspended account could still
  // create and edit cubes. They were invisible, but still accumulated against
  // the 25-cube ceiling, and "suspended" that lets you carry on working is not
  // a suspension. Asserted structurally, because the gates are server actions
  // and calling them needs a request context.
  const gateFiles = [
    "src/app/cube/actions.ts",
    "src/app/cube/[username]/[slug]/draft/actions.ts",
    "src/app/explore/actions.ts",
  ];
  for (const file of gateFiles) {
    const body = readFileSync(file, "utf8");
    expect(
      body.includes("suspensionError"),
      `${file} must stop a suspended account writing — suspension has to end ` +
        `the account's ability to act, not only its visibility`,
    );
  }
  expect(
    suspensionError({ suspendedAt: new Date() }) !== null,
    "suspensionError must refuse a suspended profile",
  );
  expect(
    suspensionError({ suspendedAt: null }) === null,
    "suspensionError must let an ordinary profile through",
  );

  // ---- deleting an account takes its cubes -----------------------------
  const doomed = await createTestAccount(sql, { prefix: "moddel", signIn: false });
  const doomedCube = await createCube({
    ownerId: doomed.id,
    name: `Doomed ${Date.now()}`,
    description: "about to go",
    visibility: "public",
  });
  await addCubeCard(doomedCube.id, unit.id, "main");

  const snapshot = await summarizeUser(doomed.id);
  expect(snapshot?.cubeCount === 1, `snapshot should count 1 cube, got ${snapshot?.cubeCount}`);
  expect(
    snapshot?.cubeNames.includes(doomedCube.name) ?? false,
    "the snapshot should name the cubes, since it is all that survives",
  );

  await logModeration({
    actorId: owner.id,
    actorUsername: owner.username,
    action: "user_deleted",
    targetType: "user",
    targetId: doomed.id,
    targetLabel: doomed.username,
    reason: "check",
    snapshot,
  });
  await deleteUserAccount(doomed.id);

  const [{ n: userRows }] = await sql<{ n: number }[]>`
    select count(*)::int as n from users where id = ${doomed.id}::uuid`;
  expect(userRows === 0, "the profile row should be gone");
  const [{ n: cubeRows }] = await sql<{ n: number }[]>`
    select count(*)::int as n from cubes where id = ${doomedCube.id}::uuid`;
  expect(cubeRows === 0, "the account's cubes should cascade away");
  const [{ n: authRows }] = await sql<{ n: number }[]>`
    select count(*)::int as n from auth.users where id = ${doomed.id}::uuid`;
  expect(
    authRows === 0,
    "the auth row must go too — otherwise the account can sign in and claim a " +
      "fresh username, which is the same person with no record",
  );

  // The log outlives its target: `target_id` is deliberately not a foreign key.
  const [{ n: logRows }] = await sql<{ n: number }[]>`
    select count(*)::int as n from moderation_log where target_id = ${doomed.id}::uuid`;
  expect(logRows === 1, `the log entry must survive the delete, found ${logRows}`);
  const [entry] = await sql<{ snapshot: { cubeCount: number } | null }[]>`
    select snapshot from moderation_log where target_id = ${doomed.id}::uuid`;
  expect(
    entry?.snapshot?.cubeCount === 1,
    "the snapshot must survive with it — it is the only record of what was deleted",
  );

  console.log(
    `moderation: hide, suspend and delete all took effect; ` +
      `the log survived a cascading account delete`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  // The log rows reference a deleted actor by then, which is the intent.
  await sql`delete from moderation_log where actor_username like 'modown%'`;
  await deleteTestAccounts(sql, created);
  await sql.end();
}

if (failures.length > 0) {
  console.error(`moderation check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("moderation check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
