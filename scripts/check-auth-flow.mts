/**
 * End-to-end check of the sign-in-adjacent UI state.
 *
 * Guards a specific regression: the nav renders the signed-in user from the
 * ROOT LAYOUT, and a Server Action that redirects does not re-render a layout
 * the client Router Cache already holds. Without `revalidatePath("/", "layout")`
 * in the auth actions, claiming a username left the nav showing "Choose a
 * username" until a hard reload, and Back could re-expose the claim form.
 *
 * Prerequisites:
 *   1. dev server:      npm run dev
 *   2. headless Chrome with remote debugging on port 9222:
 *      chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *   3. run:             npm run check:auth-flow
 *
 * Creates a throwaway auth user and deletes it again, including on failure.
 * Set SUPABASE_SECRET_KEY to use the admin API; otherwise the user is inserted
 * straight into auth.users (we own the database).
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

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
const origin = projectUrl.origin;
const projectRef = projectUrl.host.split(".")[0];
const publishable = fromEnvFile("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const secret = process.env.SUPABASE_SECRET_KEY;
const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });

const email = `check-${Date.now()}@cubebound.test`;
const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const username = `check${Date.now() % 1000000}`;

async function createConfirmedUser(): Promise<string> {
  if (secret) {
    const res = await fetch(`${origin}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`admin create failed: ${res.status} ${JSON.stringify(body)}`);
    return body.id as string;
  }
  // GoTrue scans the token columns into non-nullable Go strings, so they must
  // be '' rather than NULL or every lookup fails with "error querying schema".
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
  return row.id as string;
}

/** Session cookie in the shape @supabase/ssr writes, built straight from the
 *  token grant so no refresh-token rotation invalidates it. */
async function sessionCookie(): Promise<{ name: string; value: string }> {
  const res = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const s = await res.json();
  if (!res.ok) throw new Error(`token grant failed: ${res.status} ${JSON.stringify(s)}`);
  const payload = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    user: s.user,
    token_type: s.token_type,
    expires_in: s.expires_in,
    expires_at: s.expires_at,
  };
  return {
    name: `sb-${projectRef}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
  };
}

interface Snapshot {
  url: string;
  nav: string;
  hasUsernameForm: boolean;
  formError: string | null;
}

async function run(): Promise<string[]> {
  const cookie = await sessionCookie();

  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t: { type: string }) => t.type === "page");
  if (!page) throw new Error("no Chrome page target; is Chrome running with --remote-debugging-port?");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pending = new Map<number, (m: unknown) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
  };
  const send = (method: string, params: object = {}) => {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise<{ result?: { result?: { value?: string } } }>((r) =>
      pending.set(msgId, r as (m: unknown) => void),
    );
  };
  const evaluate = async (expression: string) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))
      .result?.result?.value;

  async function waitReady() {
    for (let i = 0; i < 80; i++) {
      if (await evaluate("document.readyState === 'complete'")) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("page never finished loading");
  }
  const snapshot = async (): Promise<Snapshot> =>
    JSON.parse(
      (await evaluate(`JSON.stringify({
        url: location.pathname,
        nav: document.querySelector('header nav')?.innerText.replace(/\\s+/g,' ').trim() ?? '',
        hasUsernameForm: !!document.querySelector('input[name="username"]'),
        formError: document.querySelector('[role=alert]')?.innerText ?? null,
      })`))!,
    );

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");
  await send("Network.setCookie", {
    name: cookie.name,
    value: cookie.value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
  });

  await send("Page.navigate", { url: `${APP}/welcome` });
  await waitReady();
  const before = await snapshot();

  // Submit the form that OWNS the username input: the nav's sign-out form
  // comes first in the DOM, so querySelector('form') would sign us out.
  const submitted = await evaluate(`(() => {
    const input = document.querySelector('input[name="username"]');
    if (!input) return 'no username input';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(username)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.form.requestSubmit();
    return 'ok';
  })()`);
  if (submitted !== "ok") throw new Error(`could not submit claim form: ${submitted}`);

  for (let i = 0; i < 60; i++) {
    if ((await evaluate("location.pathname")) !== "/welcome") break;
    if (await evaluate(`document.querySelector('[role=alert]')?.innerText ?? ''`)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const afterClaim = await snapshot();

  await evaluate("history.back()");
  await new Promise((r) => setTimeout(r, 2000));
  const afterBack = await snapshot();

  await send("Page.navigate", { url: `${APP}/welcome` });
  await waitReady();
  const welcomeDirect = await snapshot();

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Sign out');
    button.form.requestSubmit();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 1500));
  const afterSignOut = await snapshot();
  ws.close();

  const failures: string[] = [];
  if (!before.hasUsernameForm) failures.push("/welcome did not offer the claim form to a user without a profile");
  if (afterClaim.formError) failures.push(`claim reported an error: ${afterClaim.formError}`);
  if (!afterClaim.nav.includes(username))
    failures.push(`nav did not show "${username}" immediately after claiming (got: ${afterClaim.nav})`);
  if (afterClaim.nav.includes("Choose a username"))
    failures.push("nav still offered 'Choose a username' after claiming (stale root layout)");
  if (afterBack.hasUsernameForm)
    failures.push("Back re-exposed the claim form to a user who already has a username");
  if (welcomeDirect.url !== "/")
    failures.push(`/welcome did not redirect a user who already has a username (landed on ${welcomeDirect.url})`);
  if (!afterSignOut.nav.includes("Sign in"))
    failures.push(`nav did not return to signed-out after sign out (got: ${afterSignOut.nav})`);
  return failures;
}

let userId: string | undefined;
let failures: string[] = [];
try {
  userId = await createConfirmedUser();
  failures = await run();
} catch (error) {
  failures.push(`check crashed: ${(error as Error).message}`);
} finally {
  if (userId) await sql`delete from auth.users where id = ${userId}::uuid`; // cascades to the profile
  await sql.end();
}

if (failures.length > 0) {
  console.error(`auth flow check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("auth flow check passed");
