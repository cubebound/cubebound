/**
 * Proves cube mutations are gated on the server, not just in the UI.
 *
 * The strong check is a replay: it drives the owner's browser to click "Add"
 * in the cube editor, captures that exact Server Action request, then re-issues
 * it with a DIFFERENT user's session cookie and with no cookie at all, and
 * asserts the cube is unchanged both times. A UI-only guard passes the
 * page-level checks but fails this one.
 *
 * Prerequisites (same as check-auth-flow):
 *   1. npm run dev
 *   2. chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *   3. npm run check:cube-ownership
 *
 * Creates two throwaway users and a cube, and deletes them again.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { addCubeCard, createCube, getCubeCards } from "../src/db/queries/cubes";
import { claimUsername } from "../src/db/queries/users";
import { canEditCube } from "../src/lib/cube-access";
import { defaultSectionForType, isCubeSection } from "../src/lib/riftbound";
import { slugify, uniqueSlug } from "../src/lib/slug";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9222";

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

async function makeUser(label: string): Promise<{ id: string; username: string; cookie: string }> {
  const email = `cube-${label}-${Date.now()}@cubebound.test`;
  const password = `Pw-${Math.random().toString(36).slice(2)}`;
  // GoTrue scans the token columns into non-nullable Go strings.
  const [row] = await sql`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', ${email},
      extensions.crypt(${password}, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
      '', '', '', '', '', '', '', ''
    ) returning id`;

  const username = `cube${label}${Date.now() % 1000000}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(`could not claim username: ${claimed.error}`);

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

try {
  // ---- pure logic ----------------------------------------------------------
  expect(defaultSectionForType("Legend") === "legends", "Legend should default to legends");
  expect(defaultSectionForType("Rune") === "runes", "Rune should default to runes");
  expect(
    defaultSectionForType("Battlefield") === "battlefields",
    "Battlefield should default to battlefields",
  );
  expect(defaultSectionForType("Unit") === "main", "Unit should default to main");
  expect(defaultSectionForType("Spell") === "main", "Spell should default to main");
  expect(defaultSectionForType("Some Future Type") === "main", "unknown types should default to main");
  expect(!isCubeSection("../etc"), "isCubeSection must reject arbitrary strings");

  expect(slugify("My Fury Cube!") === "my-fury-cube", "slugify should kebab-case a name");
  expect(slugify("  Spaces   everywhere  ") === "spaces-everywhere", "slugify should collapse spaces");
  expect(!slugify("///").includes("/"), "slugify must never emit a slash");
  expect(slugify("edit") !== "edit", "slugify must not produce a reserved sub-route");
  expect(
    uniqueSlug("cube", new Set(["cube", "cube-2"])) === "cube-3",
    "uniqueSlug should skip taken slugs",
  );

  expect(canEditCube({ ownerId: "a" }, "a"), "owner may edit");
  expect(!canEditCube({ ownerId: "a" }, "b"), "non-owner may not edit");
  expect(!canEditCube({ ownerId: "a" }, null), "signed-out may not edit");
  expect(!canEditCube(null, "a"), "missing cube is not editable");

  // ---- every mutation goes through an authorization gate --------------------
  // Actions that are not owner-gated must say why here, and name the gate they
  // use instead, so "no gate at all" can never pass by omission.
  const OTHER_GATES: Record<string, { gate: string; why: string }> = {
    createCubeAction: {
      gate: "getCurrentUser",
      why: "creates a cube from nothing; there is no existing cube to own",
    },
    cloneCubeAction: {
      gate: "canViewCube",
      why: "reads a cube the caller may only be able to *view*, and writes a new one they own",
    },
  };

  // Draft actions live in their own file and are gated on *viewing* a cube
  // rather than owning it — anyone who can open a cube can draft it. They are
  // scanned here anyway: a mutation in a file this check does not read would
  // escape the guarantee entirely, which is worse than an exemption.
  const DRAFT_GATES: Record<string, { gate: string; why: string }> = {
    startDraftAction: {
      gate: "requireDraftableCube",
      why: "anyone who can view a cube may draft it; ownership is not required",
    },
    makePickAction: {
      gate: "requireOwnDraft",
      why: "picks belong to the drafter, not the cube owner",
    },
    setCardBoardAction: {
      gate: "requireOwnDraft",
      why: "sorts the caller's own pool between mainboard and sideboard",
    },
    saveDraftAsCubeAction: {
      gate: "requireOwnDraft",
      why: "reads the caller's own draft and writes a new cube they own",
    },
  };
  const draftSource = readFileSync(
    "src/app/cube/[username]/[slug]/draft/actions.ts",
    "utf8",
  );
  for (const body of draftSource.split(/export async function /).slice(1)) {
    const name = body.slice(0, body.indexOf("("));
    const gate = DRAFT_GATES[name];
    if (!gate) {
      failures.push(`draft action ${name} has no documented authorization gate`);
      continue;
    }
    if (!body.includes(gate.gate)) {
      failures.push(`draft action ${name} does not call ${gate.gate} (${gate.why})`);
    }
  }

  const source = readFileSync("src/app/cube/actions.ts", "utf8");
  const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  const bodies = source.split(/export async function /).slice(1);
  for (const body of bodies) {
    const name = body.slice(0, body.indexOf("("));
    const exemption = OTHER_GATES[name];
    if (exemption) {
      if (!body.includes(exemption.gate)) {
        failures.push(
          `${name} is exempt from requireOwnedCube (${exemption.why}) but does not call ${exemption.gate} either`,
        );
      }
      continue;
    }
    if (!body.includes("requireOwnedCube")) {
      failures.push(`${name} does not call requireOwnedCube`);
    }
  }
  expect(exported.length >= 7, `expected the cube actions to be exported, found ${exported.length}`);

  // ---- set up owner, intruder and a cube -----------------------------------
  const owner = await makeUser("a");
  created.push(owner.id);
  const intruder = await makeUser("b");
  created.push(intruder.id);

  const cube = await createCube({
    ownerId: owner.id,
    name: "Ownership Check Cube",
    description: null,
    visibility: "private",
  });
  expect(cube.slug === "ownership-check-cube", `unexpected slug: ${cube.slug}`);

  const twin = await createCube({
    ownerId: owner.id,
    name: "Ownership Check Cube",
    description: null,
    visibility: "private",
  });
  expect(twin.slug === "ownership-check-cube-2", `duplicate name should get -2, got ${twin.slug}`);

  // Seed one card so the section inference is observable.
  const [legend] = await sql`select id from cards where type = 'Legend' limit 1`;
  await addCubeCard(cube.id, legend.id, defaultSectionForType("Legend"));
  const seeded = await getCubeCards(cube.id);
  expect(
    seeded.length === 1 && seeded[0].section === "legends",
    `legend should land in legends, got ${JSON.stringify(seeded.map((c) => c.section))}`,
  );

  const editorPath = `/cube/${owner.username}/${cube.slug}/edit`;

  // ---- page-level access ----------------------------------------------------
  const status = async (path: string, cookie?: string) =>
    (await fetch(`${APP}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" })).status;

  const ownerStatus = await status(editorPath, owner.cookie);
  expect(ownerStatus === 200, `owner should see the editor, got HTTP ${ownerStatus}`);
  expect(
    (await status(editorPath, intruder.cookie)) === 404,
    "another user must get 404 on the editor",
  );
  expect((await status(editorPath)) === 404, "signed-out must get 404 on the editor");
  expect(
    (await status(`/cube/${owner.username}/${cube.slug}/settings`, intruder.cookie)) === 404,
    "another user must get 404 on settings",
  );

  // ---- capture a real Add request as the owner, then replay it as others ----
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t: { type: string }) => t.type === "page");
  if (!page) throw new Error("no Chrome page target; is Chrome running with --remote-debugging-port?");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pendingCalls = new Map<number, (m: unknown) => void>();
  let captured: { url: string; method: string; headers: Record<string, string>; postData?: string } | null =
    null;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pendingCalls.has(m.id)) {
      pendingCalls.get(m.id)!(m);
      pendingCalls.delete(m.id);
    }
    if (m.method === "Network.requestWillBeSent") {
      const r = m.params.request;
      if (r.method === "POST" && !captured) captured = r;
    }
  };
  const send = (method: string, params: object = {}) => {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise<{ result?: { result?: { value?: string } } }>((r) =>
      pendingCalls.set(msgId, r as (m: unknown) => void),
    );
  };
  const evaluate = async (expression: string) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))
      .result?.result?.value;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");
  const separator = owner.cookie.indexOf("=");
  await send("Network.setCookie", {
    name: owner.cookie.slice(0, separator),
    value: owner.cookie.slice(separator + 1),
    domain: "localhost",
    path: "/",
  });

  // Browse mode is where the grid's Add buttons live; search a unit so the add
  // lands in "main".
  await send("Page.navigate", { url: `${APP}${editorPath}?mode=browse&q=blazing+scorcher` });
  for (let i = 0; i < 80; i++) {
    if (await evaluate("document.readyState === 'complete'")) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const clicked = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Add');
    if (buttons.length === 0) return 'no Add button found';
    buttons[0].click();
    return 'clicked';
  })()`);
  expect(clicked === "clicked", `could not click Add in the editor: ${clicked}`);
  await new Promise((r) => setTimeout(r, 2500));

  const afterOwnerAdd = await getCubeCards(cube.id);
  const added = afterOwnerAdd.find((c) => c.name === "Blazing Scorcher");
  expect(Boolean(added), "owner's Add should have added the card");
  expect(added?.section === "main", `unit should land in main, got ${added?.section}`);

  ws.close();

  // Replay the captured Server Action request under other identities.
  const request = captured as { url: string; headers: Record<string, string>; postData?: string } | null;
  if (!request?.postData) {
    failures.push("did not capture the Add server action request; replay check skipped");
  } else {
    // Remove the card the owner just added, so a successful replay would show
    // up unmistakably as it reappearing.
    await sql`delete from cube_cards
              where cube_id = ${cube.id}::uuid and card_id = ${added?.id ?? ""}`;
    const baseline = (await getCubeCards(cube.id)).length;

    /** Re-issues the captured request under a given identity, returns the
     *  resulting card count. */
    const replayAs = async (cookie: string | null): Promise<number> => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        if (key.toLowerCase() !== "cookie") headers[key] = value;
      }
      if (cookie) headers.cookie = cookie;

      const res = await fetch(request.url, {
        method: "POST",
        headers,
        body: request.postData,
        redirect: "manual",
      });
      await res.text();
      return (await getCubeCards(cube.id)).length;
    };

    const afterIntruder = await replayAs(intruder.cookie);
    expect(
      afterIntruder === baseline,
      `another signed-in user replayed the owner's Add and mutated the cube (${baseline} -> ${afterIntruder})`,
    );

    const afterAnonymous = await replayAs(null);
    expect(
      afterAnonymous === baseline,
      `a signed-out caller replayed the owner's Add and mutated the cube (${baseline} -> ${afterAnonymous})`,
    );

    // Sanity: the captured request really can mutate, so the two rejections
    // above prove authorization rather than a replay that never worked.
    const afterOwner = await replayAs(owner.cookie);
    expect(
      afterOwner === baseline + 1,
      `replay is not exercising the action: the owner's own replay changed nothing (${baseline} -> ${afterOwner})`,
    );
  }

  // ---- deleting the owner cascades to their cubes ---------------------------
  await sql`delete from auth.users where id = ${owner.id}::uuid`;
  created.splice(created.indexOf(owner.id), 1);
  const [{ n }] = await sql`select count(*)::int as n from cubes where id = ${cube.id}::uuid`;
  expect(n === 0, "deleting the owner should cascade to their cubes");
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  for (const userId of created) {
    await sql`delete from auth.users where id = ${userId}::uuid`;
  }
  await sql.end();
}

if (failures.length > 0) {
  console.error(`cube ownership check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("cube ownership check passed");
}

// Importing the query layer opens the app's own Drizzle pool, which nothing
// here closes, so the event loop would keep the process alive forever.
process.exit(failures.length > 0 ? 1 : 0);
