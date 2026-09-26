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
import { TOKEN_ID_PATTERN } from "../src/lib/card-ids";
import { defaultSectionForType } from "../src/lib/riftbound";
import { slugify } from "../src/lib/slug";
import { btn } from "../src/lib/ui";

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
    const cube = { ownerId: "a", visibility, hiddenAt: null, ownerSuspendedAt: null };
    expect(canViewCube(cube, null), `${visibility} should be readable signed out`);
    expect(canViewCube(cube, "b"), `${visibility} should be readable by others`);
  }
  expect(!canViewCube({ ownerId: "a", visibility: "private", hiddenAt: null, ownerSuspendedAt: null }, null), "private is not public");
  expect(!canViewCube({ ownerId: "a", visibility: "private", hiddenAt: null, ownerSuspendedAt: null }, "b"), "private is not readable by others");
  expect(canViewCube({ ownerId: "a", visibility: "private", hiddenAt: null, ownerSuspendedAt: null }, "a"), "private is readable by its owner");
  expect(!canEditCube({ ownerId: "a", visibility: "public", hiddenAt: null, ownerSuspendedAt: null }, "b"), "public is still not editable by others");

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
        and not (supertype is not distinct from 'Token' or id ~ ${TOKEN_ID_PATTERN})
    ) ranked where rn <= 2`;
  for (const card of spread) {
    await addCubeCard(cube.id, card.id, defaultSectionForType(card.type));
  }
  await addCubeCard(cube.id, spread[0].id, defaultSectionForType(spread[0].type)); // a multiple
  const sourceRows = await getCubeCards(cube.id);
  const sourceTotal = await countCubeCards(cube.id);
  expect(sourceTotal === sourceRows.length + 1, "the source cube should hold one multiple");

  // --- clone -----------------------------------------------------------------
  // The copy is named by its new owner before it exists, because the slug is
  // taken from the name once and never changes. Naming it "Copy of …" first is
  // how a live cube ended up at `copy-of-the-blevins-cube` for good.
  //
  // A token in the source stands in for a cube that picked one up before the
  // add paths refused them. It is written straight through the query layer,
  // which does not refuse, and taken out again once both clones exist.
  const [token] = await sql<{ id: string }[]>`
    select id from cards
     where supertype is not distinct from 'Token' or id ~ ${TOKEN_ID_PATTERN}
     order by id limit 1`;
  expect(Boolean(token), "no token row in this database; the clone's token rule is untested");
  if (token) await addCubeCard(cube.id, token.id, "main");
  const cloneName = "Stranger's Variant";
  const clone = await cloneCube(cube.id, stranger.id, cloneName);
  const clonedRows = await getCubeCards(clone.id);
  expect(clone.visibility === "private", `clones should be private, got ${clone.visibility}`);
  expect(clone.name === cloneName, `the clone should carry the chosen name, got ${clone.name}`);
  expect(
    clone.slug === slugify(cloneName) && !clone.slug.startsWith("copy-of"),
    `the clone's slug should come from the chosen name, got ${clone.slug}`,
  );
  const again = await cloneCube(cube.id, stranger.id, cloneName);
  expect(
    again.slug === `${slugify(cloneName)}-2`,
    `a second clone under the same name should get a numbered slug, got ${again.slug}`,
  );
  if (token) {
    await sql`delete from cube_cards where cube_id = ${cube.id}::uuid and card_id = ${token.id}`;
    expect(
      !clonedRows.some((r) => r.id === token.id),
      `the clone copied the token ${token.id}; tokens are not cards`,
    );
  }
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
  // Where a redirect points, for the owner's bounce to the editor. Kept
  // separate from `status` so the existing assertions read the same as before.
  const location = async (path: string, cookie?: string) => {
    const res = await fetch(`${APP}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    return { status: res.status, to: res.headers.get("location") ?? "" };
  };

  const publicPath = `/cube/${owner.username}/${cube.slug}`;
  expect((await status(publicPath)) === 200, "a public cube should render signed out");
  expect((await status(publicPath, stranger.cookie)) === 200, "a public cube should render for others");
  // The owner does not read their own cube here — the page redirects them to
  // the editor, which is the same tabs plus the ability to change something.
  const ownerBounce = await location(publicPath, owner.cookie);
  expect(
    ownerBounce.status >= 300 && ownerBounce.status < 400,
    `the owner should be redirected off the public page, got ${ownerBounce.status}`,
  );
  expect(
    ownerBounce.to.includes(`${publicPath}/edit`),
    `the owner should be sent to the editor, got "${ownerBounce.to}"`,
  );
  // The redirect resolves in a layout, which Next does not give
  // `searchParams`, so a tab on the URL is dropped rather than carried — but
  // the bounce still has to happen instead of rendering the visitor's view.
  const tabBounce = await location(`${publicPath}?tab=analytics`, owner.cookie);
  expect(
    tabBounce.to.includes(`${publicPath}/edit`),
    `a tabbed link should still bounce the owner to the editor, got "${tabBounce.to}"`,
  );
  // 307, not 200: a 200 means the loading shell was flushed first and the
  // redirect degraded to a client-side hop, which is what putting this in the
  // page did. See the note in (public)/layout.tsx.
  expect(
    ownerBounce.status === 307,
    `the bounce should be a real 307, got ${ownerBounce.status}`,
  );

  // The owner-only routes must 404 **while the cube is still public**, which is
  // the case that went wrong. On a private cube the [slug] layout refuses first,
  // above every loading boundary, so the status is right for the wrong reason —
  // asserting only that let a soft 404 (HTTP 200 carrying the 404 body) sit on
  // /edit and /settings for every public cube. The fix is a layout beside each
  // page; this is what stops it coming back.
  for (const [route, who, cookie] of [
    ["/edit", "a stranger", stranger.cookie],
    ["/edit", "a signed-out visitor", undefined],
    ["/settings", "a stranger", stranger.cookie],
    ["/settings", "a signed-out visitor", undefined],
  ] as [string, string, string | undefined][]) {
    const code = await status(`${publicPath}${route}`, cookie);
    expect(
      code === 404,
      `a public cube's ${route} should 404 for ${who}, got ${code} — a 200 here is the loading-boundary soft 404`,
    );
  }

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
  //
  // Matched against `btn.primarySm` itself rather than a palette string. The
  // old literal (`bg-zinc-900 px-3 text-sm font-medium text-white`) broke the
  // moment the design tokens landed, while the guarantee it protects did not
  // change at all — so ask the question of whatever "filled" currently means,
  // and this can never drift from the styling again.
  const filled = btn.primarySm;
  const clonePosition = visitorHtml.indexOf(">Clone<");
  expect(clonePosition !== -1, "a visitor should see Clone");
  expect(
    visitorHtml.slice(Math.max(0, clonePosition - 900), clonePosition).includes(filled),
    "Clone should be the prominent button for a visitor",
  );

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
  // The owner's only route to Clone, now that the public page redirects them
  // here. Quiet rather than filled: on your own cube it is not the main action.
  const editorClone = editorHtml.indexOf(">Clone<");
  expect(editorClone !== -1, "the editor should offer Clone");
  expect(
    !editorHtml.slice(Math.max(0, editorClone - 900), editorClone).includes(filled),
    "Clone should be the quiet button on your own cube",
  );
  expect(
    editorHtml.includes(`${APP}${publicPath}`),
    `the editor's Share should carry the absolute URL ${APP}${publicPath}`,
  );

  // Clone is a link to the clone form as a page, which a click turns into a
  // dialog. The page is the no-JS path, so it has to work on its own: it names
  // the source and offers the form.
  const clonePage = `/cubes/new?start=clone&from=${encodeURIComponent(`${owner.username}/${cube.slug}`)}`;
  expect(
    visitorHtml.includes(`href="${clonePage.replace(/&/g, "&amp;")}"`),
    "a visitor's Clone should link to the clone form",
  );
  const clonePageHtml = await body(clonePage, stranger.cookie);
  expect(
    clonePageHtml.includes("Clone Public View Cube") && clonePageHtml.includes(">Clone cube<"),
    "the clone page should offer the form for a cube the visitor can open",
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
  const privateBounce = await location(publicPath, owner.cookie);
  expect(
    privateBounce.to.includes(`${publicPath}/edit`),
    "a private cube should send its owner to the editor rather than 404",
  );

  // Nor may the clone page read a private cube's name out to a stranger who
  // guesses its path: it falls back to the list instead of pre-filling.
  const privateClonePage = await body(clonePage, stranger.cookie);
  expect(
    !privateClonePage.includes("Public View Cube"),
    "the clone page must not reveal a private cube's name to a stranger",
  );

  // A stranger must not be able to clone a private cube, even knowing its path.
  expect(
    !canViewCube({ ownerId: owner.id, visibility: "private", hiddenAt: null, ownerSuspendedAt: null }, stranger.id),
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
