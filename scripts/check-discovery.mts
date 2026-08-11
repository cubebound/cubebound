/**
 * Covers cube discovery and following.
 *
 *   1. Explore lists public cubes only — unlisted and private stay out of
 *      results even for their own owner, whatever they search for
 *   2. keywords match name, description and primer, and multiple terms AND
 *      rather than OR
 *   3. the card filter finds cubes running a card, once each, and ignores the
 *      maybeboard
 *   4. sorting by follows and by last update
 *   5. follow is idempotent, unfollow is not a delete-all, and following is
 *      gated on being able to *view* the cube
 *   6. the followed list holds what you follow and nothing you own, and a cube
 *      that turns private drops out of it
 *   7. the pages render: /explore shows a public cube and its Follow control,
 *      /cubes?tab=followed shows the followed one
 *
 * Prerequisite: npm run dev. Creates throwaway accounts and deletes them again.
 *
 *   npm run check:discovery
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { addCubeCard, createCube, updateCube } from "../src/db/queries/cubes";
import {
  countCubes,
  countFollowers,
  followCube,
  isFollowing,
  searchCubes,
  unfollowCube,
} from "../src/db/queries/discovery";
import { claimUsername } from "../src/db/queries/users";
import { canViewCube } from "../src/lib/cube-access";

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

async function makeUser(label: string) {
  const email = `disc-${label}-${Date.now()}@cubebound.test`;
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

  const username = `disc${label}${Date.now() % 1000000}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(claimed.error);

  const res = await fetch(`${projectUrl.origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const s = await res.json();
  if (!res.ok) throw new Error(`token grant failed: ${JSON.stringify(s)}`);
  const value =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        user: s.user,
        token_type: s.token_type,
        expires_in: s.expires_in,
        expires_at: s.expires_at,
      }),
      "utf8",
    ).toString("base64url");

  return { id: row.id, username, cookie: `sb-${projectRef}-auth-token=${value}` };
}

const created: string[] = [];
/** A nonsense token planted in every cube this run makes, so assertions can
 *  scope to them and never trip over whatever else lives in the dev database. */
const TAG = `zqx${Date.now().toString(36)}`;
const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort().join(", ");

try {
  const owner = await makeUser("own");
  created.push(owner.id);
  const reader = await makeUser("rdr");
  created.push(reader.id);
  const alt = await makeUser("alt");
  created.push(alt.id);

  // --- a small corpus --------------------------------------------------------
  const open = await createCube({
    ownerId: owner.id,
    name: `${TAG} Aggro Cube`,
    description: `A fast ${TAG} list.`,
    visibility: "public",
  });
  const control = await createCube({
    ownerId: owner.id,
    name: `${TAG} Control Cube`,
    description: null,
    visibility: "public",
  });
  const unlisted = await createCube({
    ownerId: owner.id,
    name: `${TAG} Unlisted Cube`,
    description: null,
    visibility: "unlisted",
  });
  const secret = await createCube({
    ownerId: owner.id,
    name: `${TAG} Private Cube`,
    description: null,
    visibility: "private",
  });

  // The primer is searched too, so put the distinguishing word only there.
  await sql`update cubes set primer = ${`# Plan\n\nThis one is ${TAG}primerword.`} where id = ${control.id}::uuid`;

  const [unitRow] = await sql<{ id: string; name: string }[]>`
    select id, name from cards where type = 'Unit' and base_id = id order by id limit 1`;
  const [otherRow] = await sql<{ id: string; name: string }[]>`
    select id, name from cards where type = 'Unit' and base_id = id and id <> ${unitRow.id}
    order by id limit 1`;

  // Two copies in one cube, so the EXISTS has something to deduplicate.
  await addCubeCard(open.id, unitRow.id, "main");
  await addCubeCard(open.id, unitRow.id, "main");
  // The same card, but only ever on the *maybeboard* of the other cube.
  await addCubeCard(control.id, unitRow.id, "maybeboard");
  await addCubeCard(control.id, otherRow.id, "main");

  const search = (options: Parameters<typeof searchCubes>[0]) =>
    searchCubes({ ...options, keywords: options?.keywords ?? TAG, limit: 50 });

  // --- 1. Explore is public-only ---------------------------------------------
  const explore = await search({});
  expect(explore.length === 2, `explore should list the 2 public cubes, got: ${names(explore)}`);
  expect(
    !explore.some((c) => c.id === unlisted.id),
    "an unlisted cube must not appear in explore results",
  );
  expect(
    !explore.some((c) => c.id === secret.id),
    "a private cube must not appear in explore results",
  );
  // Searching its exact name as its own owner must still not surface it: the
  // owner sees their unlisted cubes on their own list, not in the public index.
  const byName = await searchCubes({
    keywords: `${TAG} Unlisted`,
    viewerId: owner.id,
    limit: 50,
  });
  expect(
    byName.length === 0,
    `an unlisted cube must not be findable by name in explore, got: ${names(byName)}`,
  );
  expect((await countCubes({ keywords: TAG })) === 2, "the count should agree with the list");

  // --- 2. keywords ------------------------------------------------------------
  const byPrimer = await search({ keywords: `${TAG}primerword` });
  expect(
    byPrimer.length === 1 && byPrimer[0].id === control.id,
    `the primer should be searched, got: ${names(byPrimer)}`,
  );
  const byDescription = await search({ keywords: "fast" });
  expect(
    byDescription.length === 1 && byDescription[0].id === open.id,
    `the description should be searched, got: ${names(byDescription)}`,
  );
  const anded = await search({ keywords: `${TAG} Aggro` });
  expect(
    anded.length === 1 && anded[0].id === open.id,
    `terms should AND, not OR — got: ${names(anded)}`,
  );
  const impossible = await search({ keywords: `${TAG} Aggro Control` });
  expect(impossible.length === 0, `all terms must match one cube, got: ${names(impossible)}`);
  // A `%` typed into the box is a literal, not a wildcard over the whole table.
  expect((await search({ keywords: "%" })).length === 0, "wildcards must be escaped");

  // --- 3. the card filter -----------------------------------------------------
  const byCard = await search({ cardName: unitRow.name });
  expect(
    byCard.length === 1 && byCard[0].id === open.id,
    `the card filter should find the cube running ${unitRow.name} once and ignore the ` +
      `maybeboard copy, got: ${names(byCard)}`,
  );
  expect(
    (await countCubes({ keywords: TAG, cardName: unitRow.name })) === 1,
    "the count should apply the card filter too",
  );
  expect(
    (await search({ cardName: "not a real card name" })).length === 0,
    "a card nobody runs should match no cubes",
  );

  // Card counts exclude the maybeboard, the same rule the cube page uses.
  const openRow = explore.find((c) => c.id === open.id);
  const controlRow = explore.find((c) => c.id === control.id);
  expect(openRow?.cardCount === 2, `two copies should count as 2, got ${openRow?.cardCount}`);
  expect(
    controlRow?.cardCount === 1,
    `the maybeboard must not be counted, got ${controlRow?.cardCount}`,
  );

  // --- 4 & 5. following -------------------------------------------------------
  await followCube(control.id, reader.id);
  await followCube(control.id, reader.id); // idempotent
  expect((await countFollowers(control.id)) === 1, "following twice should leave one follower");
  expect(await isFollowing(control.id, reader.id), "the follow should be readable back");
  expect(!(await isFollowing(open.id, reader.id)), "an unfollowed cube should read as unfollowed");

  // `open` is followed by someone who is not the reader, so a leak of one
  // account's follow state into another's would show up below.
  await followCube(open.id, owner.id);
  await followCube(control.id, alt.id);
  await unfollowCube(control.id, owner.id); // never followed; must not touch the others
  expect(
    (await countFollowers(control.id)) === 2,
    "unfollowing as a different user must not remove someone else's follow",
  );

  const viewerRows = await searchCubes({ keywords: TAG, viewerId: reader.id, limit: 50 });
  expect(
    viewerRows.find((c) => c.id === control.id)?.following === true,
    "the viewer's own follow state should come back on the row",
  );
  expect(
    viewerRows.find((c) => c.id === open.id)?.following === false,
    "someone else's follow must not read as yours",
  );
  expect(
    (await searchCubes({ keywords: TAG, limit: 50 })).every((c) => !c.following),
    "signed out, nothing is followed",
  );

  // Following is gated on viewing — the action's gate, asserted directly.
  expect(
    !canViewCube({ ownerId: owner.id, visibility: "private" }, reader.id),
    "the follow gate must reject a private cube for a stranger",
  );

  // --- sorting ----------------------------------------------------------------
  // `open` is the more recently updated; `control` has more followers. Each
  // sort should therefore put a different cube first — with equal follower
  // counts the recency tie-break would hide a broken sort.
  await updateCube(open.id, {
    name: open.name,
    description: open.description,
    visibility: "public",
  });
  const byUpdated = await search({ sort: "updated" });
  expect(
    byUpdated[0]?.id === open.id,
    `"updated" should lead with the freshest cube, got ${byUpdated[0]?.name}`,
  );
  const byFollows = await search({ sort: "follows" });
  expect(
    byFollows[0]?.id === control.id,
    `"follows" should lead with the most-followed cube, got ${byFollows[0]?.name}`,
  );

  // --- 6. the followed list ---------------------------------------------------
  const followed = () =>
    searchCubes({ keywords: TAG, followedBy: reader.id, viewerId: reader.id, limit: 50 });
  const mine = await searchCubes({
    keywords: TAG,
    ownerId: owner.id,
    includeNonPublic: true,
    limit: 50,
  });
  expect(mine.length === 4, `the owner's own tab should show all four, got: ${names(mine)}`);
  const followedRows = await followed();
  expect(
    followedRows.length === 1 && followedRows[0].id === control.id,
    `the followed tab should show only what is followed, got: ${names(followedRows)}`,
  );

  // A followed cube that turns private drops out rather than leaking its name.
  await updateCube(control.id, {
    name: control.name,
    description: control.description,
    visibility: "private",
  });
  expect(
    (await followed()).length === 0,
    "a cube that turns private must drop out of the followed list",
  );
  await updateCube(control.id, {
    name: control.name,
    description: control.description,
    visibility: "public",
  });

  // --- 7. the pages -----------------------------------------------------------
  const body = async (path: string, cookie?: string) =>
    (await fetch(`${APP}${path}`, { headers: cookie ? { cookie } : {} })).text();

  const exploreHtml = await body(`/explore?q=${TAG}`, reader.cookie);
  expect(exploreHtml.includes(`${TAG} Aggro Cube`), "explore should render the public cube");
  expect(
    !exploreHtml.includes(`${TAG} Unlisted Cube`),
    "explore must not render an unlisted cube",
  );
  expect(exploreHtml.includes(">Following<"), "explore should show the follow state it has");

  const signedOutHtml = await body(`/explore?q=${TAG}`);
  expect(
    signedOutHtml.includes(`${TAG} Aggro Cube`),
    "explore should work signed out — it is a public index",
  );
  expect(signedOutHtml.includes(">Follow<"), "a signed-out visitor should still see Follow");

  const followedHtml = await body(`/cubes?tab=followed&q=${TAG}`, reader.cookie);
  expect(
    followedHtml.includes(`${TAG} Control Cube`),
    "the followed tab should render the followed cube",
  );
  expect(
    !followedHtml.includes(`${TAG} Aggro Cube`),
    "the followed tab should not render an unfollowed cube",
  );

  const ownHtml = await body(`/cubes?q=${TAG}`, owner.cookie);
  expect(ownHtml.includes(`${TAG} Private Cube`), "your own tab should show your private cubes");
  expect(
    ownHtml.includes("/edit"),
    "your own tab should link to the editor, not the public page",
  );

  const cubeHtml = await body(`/cube/${owner.username}/${open.slug}`, reader.cookie);
  expect(cubeHtml.includes(">Follow<"), "the cube page should offer Follow to a visitor");
  const ownerCubeHtml = await body(`/cube/${owner.username}/${open.slug}`, owner.cookie);
  expect(
    !ownerCubeHtml.includes(">Follow<") && !ownerCubeHtml.includes(">Following<"),
    "the owner should not be offered a follow control on their own cube",
  );

  const navHtml = await body("/");
  expect(navHtml.includes(">Explore<"), "Explore should be in the nav");

  // An out-of-range page clamps rather than 404s, the same as /drafts.
  const clamped = await fetch(`${APP}/explore?q=${TAG}&page=99`);
  expect(clamped.status === 200, `an out-of-range page should clamp, got ${clamped.status}`);
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  for (const id of created) await sql`delete from auth.users where id = ${id}::uuid`;
  await sql.end();
}

if (failures.length > 0) {
  console.error(`discovery check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("discovery check passed");
}
process.exit(failures.length > 0 ? 1 : 0);
