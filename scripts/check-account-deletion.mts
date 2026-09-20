/**
 * Guards self-serve account deletion.
 *
 * Every other check here guards a regression that already happened. This one
 * guards a regression that must never happen once, because the failure mode is
 * deleting the wrong account with no way back: there is no point-in-time
 * recovery on this plan.
 *
 * The security design is that **no identifier crosses the wire** — the row to
 * delete comes from `getCurrentUser()`, and the form supplies only a string that
 * is compared. So the central assertions are the negative ones: a body stuffed
 * with somebody else's id, username and email must change nothing about them,
 * and a wrong confirmation must change nothing at all. What it covers:
 *  - structurally, that `confirm` is the only key the action reads from the form
 *    and that the typed name is still *compared*, not merely present
 *  - a wrong confirmation deletes nothing
 *  - a forged body naming a bystander deletes the caller and not the bystander
 *  - the cascade takes the cubes, cards, drafts and follows
 *  - the log row outlives its author, with a null actor and the username kept
 *  - the dead session cookie stops working immediately
 *  - a suspended account can still delete itself, which is a decision rather
 *    than an accident and which nothing else in the gate would notice
 *
 * Prerequisite: DB + dev server. Creates throwaway accounts and deletes them.
 *
 *   npm run check:account-deletion
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { fromEnvFile } from "./lib/env";
import { createTestAccount, deleteTestAccounts } from "./lib/test-account";

import { addCubeCard, createCube } from "../src/db/queries/cubes";
import { followCube } from "../src/db/queries/discovery";
import { createDraftRow } from "../src/db/queries/drafts";
import { setUserSuspended } from "../src/db/queries/moderation";

const APP = process.env.APP_URL ?? "http://localhost:3000";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false, max: 3 });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const created: string[] = [];

/** Rows still in `auth.users` for an id — 1 or 0. */
const authRows = async (id: string): Promise<number> => {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from auth.users where id = ${id}::uuid`;
  return n;
};

const countWhere = async (table: string, column: string, id: string): Promise<number> => {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from ${sql(table)} where ${sql(column)} = ${id}::uuid`;
  return n;
};

try {
  // ---- structural: only `confirm` is read from the form --------------------
  // This is the mechanical form of "no id, username or email from the client
  // ever selects the delete target". A hidden `userId` field added later "to
  // avoid a lookup" is exactly the change that would make the dangerous case
  // reachable, and it should fail the build rather than a code review.
  const source = readFileSync("src/app/settings/actions.ts", "utf8");
  const body = source.split("export async function deleteOwnAccountAction")[1] ?? "";
  expect(body.length > 0, "deleteOwnAccountAction must exist in src/app/settings/actions.ts");
  expect(
    body.includes("getCurrentUser()"),
    "the delete target must come from getCurrentUser(), not from the request body",
  );

  const formKeys = [...body.matchAll(/formData\.get\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map(
    (match) => match[1],
  );
  expect(formKeys.length > 0, "the action should read its confirmation from the form");
  const extras = formKeys.filter((key) => key !== "confirm");
  expect(
    extras.length === 0,
    `the action must read only "confirm" from the form; it also reads ${extras.join(", ")} — ` +
      `any other field is an identifier the caller controls`,
  );
  // Same trap check:cube-ownership carries: asserting the word `confirm`
  // appears is not enough, because a mutation once passed that with the
  // comparison deleted and the variable left behind.
  expect(
    /confirm\s*!==/.test(body),
    "the typed username must still be COMPARED, not merely read",
  );

  // ---- fixtures -----------------------------------------------------------
  const victim = await createTestAccount(sql, { prefix: "acctdel" });
  created.push(victim.id);
  const bystander = await createTestAccount(sql, { prefix: "acctbys", signIn: false });
  created.push(bystander.id);

  const [unit] = await sql<{ id: string }[]>`
    select id from cards where type = 'Unit' and base_id = id order by id limit 1`;

  const victimCube = await createCube({
    ownerId: victim.id,
    name: `Self Delete ${Date.now()}`,
    description: "about to go with its owner",
    visibility: "public",
  });
  await addCubeCard(victimCube.id, unit.id, "main");

  const bystanderCube = await createCube({
    ownerId: bystander.id,
    name: `Bystander ${Date.now()}`,
    description: "must survive somebody else's deletion",
    visibility: "public",
  });
  await addCubeCard(bystanderCube.id, unit.id, "main");

  // A real draft and a real follow, so the cascade assertions below are not
  // vacuous. Asserting `drafts = 0` for an account that never drafted passes
  // whatever the schema does, which is worse than not asserting it: it reads
  // like coverage. The follow deliberately points at somebody *else's* cube, so
  // it cannot be carried away by the owner's own cube cascading and has to be
  // taken by `cube_follows.user_id` itself.
  await createDraftRow({
    cubeId: victimCube.id,
    drafterId: victim.id,
    seed: "check-account-deletion",
    config: {},
    packs: [[[unit.id]]],
    seats: 1,
    humanSeat: 0,
  });
  await followCube(bystanderCube.id, victim.id);

  expect(
    (await countWhere("drafts", "drafter_id", victim.id)) === 1,
    "fixture: the victim should have a draft before deletion, or the cascade " +
      "assertion below proves nothing",
  );
  expect(
    (await countWhere("cube_follows", "user_id", victim.id)) === 1,
    "fixture: the victim should follow a cube before deletion, or the cascade " +
      "assertion below proves nothing",
  );

  // ---- the no-JS submit fields, off the server-rendered form --------------
  // React only emits a form's no-JS submit fields when the action carries
  // `$$FORM_ACTION` and the form is in the server response. Both are
  // deliberate in delete-account.tsx; if either goes away this scrape finds
  // nothing, which is the point — it means the action got wrapped in a client
  // closure, or the form moved behind client state, and the pre-hydration
  // submit path broke with it.
  //
  // The hidden fields are read rather than named: React's encoding of them is
  // its own business and has changed shape between versions (`$ACTION_ID_…`
  // once, `$ACTION_REF_n` + `$ACTION_n:0` + `$ACTION_KEY` now). What this check
  // is entitled to assert is that *some* set of them is in the markup, not
  // which.
  const unescape = (value: string) =>
    value
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  /** The delete form's hidden fields, as that account's own render emits them. */
  const deleteFormFields = async (cookie: string) => {
    const page = await fetch(`${APP}/settings`, { headers: { cookie } });
    const html = await page.text();
    const anchor = html.indexOf('name="confirm"');
    const start = anchor === -1 ? -1 : html.lastIndexOf("<form", anchor);
    const end = anchor === -1 ? -1 : html.indexOf("</form>", anchor);
    const formHtml = start === -1 || end === -1 ? "" : html.slice(start, end);
    return [
      ...formHtml.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\s*\/?>/g),
    ].map(([, name, value]) => [unescape(name), unescape(value ?? "")] as const);
  };

  /** Submits the delete form the way a browser with no JS would. */
  const submitDelete = async (
    cookie: string,
    hidden: readonly (readonly [string, string])[],
    fields: Record<string, string>,
  ) => {
    // multipart/form-data, which is the encoding the rendered form declares;
    // `FormData` on the body sets the header and boundary.
    const form = new FormData();
    for (const [name, value] of hidden) form.append(name, value);
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    const res = await fetch(`${APP}/settings`, {
      method: "POST",
      headers: { cookie },
      body: form,
      redirect: "manual",
    });
    await res.text();
  };

  const hidden = await deleteFormFields(victim.cookie);
  expect(
    hidden.length > 0,
    "no hidden action fields on a form carrying `confirm` in the /settings " +
      "markup: React emits those only for a bare server action in the server " +
      "response, so either the form moved behind client state or the action was " +
      "wrapped in a client closure, and the pre-hydration submit path is broken",
  );

  if (hidden.length > 0) {
    const submit = (cookie: string, fields: Record<string, string>) =>
      submitDelete(cookie, hidden, fields);

    // ---- a wrong confirmation deletes nothing -----------------------------
    await submit(victim.cookie, { confirm: "not-my-username" });
    expect(
      (await authRows(victim.id)) === 1,
      "a wrong confirmation string deleted the account anyway",
    );
    expect(
      (await countWhere("cubes", "owner_id", victim.id)) === 1,
      "a wrong confirmation string took the cubes",
    );

    // ---- a forged body names the bystander; only the caller goes ----------
    // One request, two assertions. The bystander surviving is only meaningful
    // because the victim does not: together they prove the request reached and
    // completed the action rather than failing for some unrelated reason.
    await submit(victim.cookie, {
      confirm: victim.username,
      userId: bystander.id,
      id: bystander.id,
      username: bystander.username,
      email: bystander.email,
    });

    expect(
      (await authRows(bystander.id)) === 1,
      "a forged userId in the form body deleted somebody else's auth row",
    );
    expect(
      (await countWhere("users", "id", bystander.id)) === 1,
      "a forged userId in the form body deleted somebody else's profile",
    );
    expect(
      (await countWhere("cubes", "id", bystanderCube.id)) === 1,
      "a forged userId in the form body deleted somebody else's cube",
    );

    expect(
      (await authRows(victim.id)) === 0,
      "the caller's own auth row must be gone — an auth row left behind is the " +
        "same person with no record, free to claim a fresh username on /welcome",
    );

    // ---- the cascade ------------------------------------------------------
    expect(
      (await countWhere("users", "id", victim.id)) === 0,
      "the profile row must cascade from auth.users",
    );
    expect(
      (await countWhere("cubes", "owner_id", victim.id)) === 0,
      "the account's cubes must cascade with it",
    );
    expect(
      (await countWhere("cube_cards", "cube_id", victimCube.id)) === 0,
      "the cube's cards must cascade with the cube",
    );
    expect(
      (await countWhere("drafts", "drafter_id", victim.id)) === 0,
      "the account's drafts must cascade with it",
    );
    expect(
      (await countWhere("cube_follows", "user_id", victim.id)) === 0,
      "the account's follows must cascade with it",
    );

    // ---- the log row outlives its author ----------------------------------
    const entries = await sql<
      {
        actor_id: string | null;
        actor_username: string;
        action: string;
        snapshot: { cubeCount: number } | null;
      }[]
    >`select actor_id, actor_username, action, snapshot
        from moderation_log where target_id = ${victim.id}::uuid`;
    expect(
      entries.length === 1,
      `exactly one log row should record the deletion, found ${entries.length}`,
    );
    const entry = entries[0];
    expect(
      entry?.actor_id === null,
      "actor_id must be null: the actor is the row that was deleted, and the FK " +
        "would have nulled it regardless",
    );
    expect(
      entry?.actor_username === victim.username,
      `actor_username must survive as the only readable trace, got ${entry?.actor_username}`,
    );
    expect(
      entry?.action === "account_self_deleted",
      `the row must be distinguishable from an admin delete, got ${entry?.action}`,
    );
    expect(
      entry?.snapshot?.cubeCount === 1,
      "the snapshot must survive with it — it is the only record of what was deleted",
    );

    // ---- the dead cookie is inert -----------------------------------------
    // The observable form of verifying with getUser() rather than getSession():
    // a cookie whose user no longer exists must not still browse as them.
    const after = await fetch(`${APP}/settings`, {
      headers: { cookie: victim.cookie },
      redirect: "manual",
    });
    expect(
      after.status === 307 || after.status === 302,
      `a deleted account's cookie still reached /settings (HTTP ${after.status})`,
    );
  }

  // ---- a suspended account can still delete itself ------------------------
  // A decision, not an accident: `suspensionError` gates the paths that let an
  // account go on building things, and refusing here would turn a suspension
  // into data retention. Nothing else asserts it — `check:moderation` reads the
  // write gates structurally and this file is not one of them — so without this
  // case either answer would pass the whole gate.
  const suspended = await createTestAccount(sql, { prefix: "acctsus" });
  created.push(suspended.id);
  await setUserSuspended(suspended.id, true);

  const suspendedFields = await deleteFormFields(suspended.cookie);
  expect(
    suspendedFields.length > 0,
    "a suspended account must still be able to reach its own delete form",
  );
  if (suspendedFields.length > 0) {
    await submitDelete(suspended.cookie, suspendedFields, { confirm: suspended.username });
    expect(
      (await authRows(suspended.id)) === 0,
      "a suspended account must be able to delete itself — refusing would turn " +
        "suspension into data retention",
    );
    const [{ n: suspendedLog }] = await sql<{ n: number }[]>`
      select count(*)::int as n from moderation_log
       where target_id = ${suspended.id}::uuid and action = 'account_self_deleted'`;
    expect(
      suspendedLog === 1,
      "a suspended account's self-deletion must still be logged, since the " +
        "snapshot is the only record a moderator has afterwards",
    );
  }

  console.log(
    "account deletion: a forged body changed nobody else, the caller's rows " +
      "cascaded away, and the log row outlived them",
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  // The log rows reference a deleted actor by then, which is the intent.
  await sql`delete from moderation_log where actor_username like 'acctdel%'
                                              or actor_username like 'acctsus%'`;
  await deleteTestAccounts(sql, created);
  await sql.end();
}

if (failures.length > 0) {
  console.error(`account deletion check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("account deletion check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
