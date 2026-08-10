/**
 * Inspects the `redirect_to` actually put on the wire by a sign-in request.
 *
 * This exists because the production bug was invisible to every other check:
 * localhost worked, the code looked right, and the failure only appeared in
 * the URL Supabase received. So this drives the real login form in a browser
 * and reads the outgoing `/auth/v1/otp` request, rather than asserting on the
 * helper in isolation.
 *
 * The request is intercepted and short-circuited at the dev server, so no
 * email is sent and no user is created.
 *
 * Prerequisites:
 *   1. SIGNIN_PROBE=1 npm run dev:probe
 *   2. chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *   3. npm run check:magic-link
 *
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveSiteUrl } from "../src/lib/site-url";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CDP = process.env.CDP_URL ?? "http://localhost:9222";
const PROBE_FILE =
  process.env.SIGNIN_PROBE_FILE ?? join(tmpdir(), "cubebound-otp-probe.json");

interface Capture {
  url: string;
  redirectTo: string | null;
  at: string;
}

function readCapture(): Capture | null {
  if (!existsSync(PROBE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PROBE_FILE, "utf8")) as Capture;
  } catch {
    return null; // mid-rename; the caller polls
  }
}

const failures: string[] = [];
const expect = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

/** Minimal CDP driver: open a tab, set headers, drive the page. */
async function connect(extraHeaders: Record<string, string>) {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((t: { type: string }) => t.type === "page");
  if (!page) throw new Error("no page target on the CDP endpoint");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.result);
      pending.delete(msg.id);
    }
  };
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const n = ++id;
      pending.set(n, resolve as (v: unknown) => void);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setExtraHTTPHeaders", { headers: extraHeaders });

  const evaluate = async (expression: string) => {
    const res = (await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { value?: unknown } };
    return res.result?.value;
  };

  const go = async (url: string) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 100; i++) {
      if ((await evaluate("document.readyState")) === "complete") return;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  return { evaluate, go, close: () => ws.close() };
}

/**
 * Submits the login form as a user would, then returns what the server tried
 * to send Supabase.
 */
async function signInFrom(host: string, proto: string, email: string) {
  rmSync(PROBE_FILE, { force: true }); // clear any previous capture

  // Origin has to travel with the forwarded host. Next validates Server Action
  // requests by comparing Origin against the (forwarded) host and rejects a
  // mismatch as "Invalid Server Actions request" — spoofing only the host
  // makes every submit 500.
  const d = await connect({
    "x-forwarded-host": host,
    "x-forwarded-proto": proto,
    origin: `${proto}://${host}`,
  });
  try {
    await d.go(`${APP}/login`);

    // Submit only once React owns the form. Before hydration the button falls
    // back to a native multipart POST, which Next rejects outright.
    for (let i = 0; i < 100; i++) {
      if (await d.evaluate("typeof window.next !== 'undefined'")) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // Target the login form specifically. The nav also contains a form (sign
    // out), and grabbing document.querySelector("form") has bitten this suite
    // before.
    const filled = await d.evaluate(`(() => {
      const input = document.querySelector('input[type="email"]');
      if (!input) return "no email input";
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(email)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const form = input.closest("form");
      if (!form) return "email input has no form";
      const submit = form.querySelector('button[type="submit"]');
      if (!submit) return "form has no submit button";
      // A real click, so React's handler runs instead of a native submit.
      submit.click();
      return "submitted";
    })()`);
    if (filled !== "submitted") throw new Error(`could not submit login form: ${filled}`);

    for (let i = 0; i < 150; i++) {
      const captured = readCapture();
      if (captured?.redirectTo) return { ...captured, redirectTo: captured.redirectTo };
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("no /auth/v1/otp request was captured within 15s");
  } finally {
    d.close();
  }
}

// If the probe were not loaded, the sign-in would go out for real and this
// check would hang rather than fail — so confirm it is armed first.
const armed = await fetch(`${APP}/login`)
  .then((r) => r.ok)
  .catch(() => false);
if (!armed) {
  console.error(
    `The dev server is not answering at ${APP}.\n` +
      `Start it with the probe loaded:\n` +
      `  SIGNIN_PROBE=1 npm run dev:probe`,
  );
  process.exit(1);
}

console.log("resolveSiteUrl, in isolation:");
for (const [label, headers] of [
  ["production host", new Headers({ "x-forwarded-host": "cubebound.vercel.app", "x-forwarded-proto": "https" })],
  ["preview host", new Headers({ "x-forwarded-host": "cubebound-a1b2c3.vercel.app", "x-forwarded-proto": "https" })],
  ["localhost", new Headers({ host: "localhost:3000" })],
] as const) {
  console.log(`   ${String(label).padEnd(18)} -> ${resolveSiteUrl(headers)}`);
}

// The regression itself: VERCEL_URL must never decide the origin, because it
// is the per-deployment hostname and is never on the Supabase allowlist.
process.env.VERCEL_URL = "cubebound-deadbeef-carl.vercel.app";
const withVercelUrl = resolveSiteUrl(
  new Headers({ "x-forwarded-host": "cubebound.vercel.app", "x-forwarded-proto": "https" }),
);
delete process.env.VERCEL_URL;
expect(
  withVercelUrl === "https://cubebound.vercel.app",
  `VERCEL_URL must not win over the request host, got ${withVercelUrl}`,
);

console.log("\non the wire:");
const probe = await signInFrom("cubebound.vercel.app", "https", "magic-link-probe@cubebound.test");
console.log(`   POST ${probe.url}`);
console.log(`   redirect_to = ${probe.redirectTo}`);

expect(
  probe.redirectTo === "https://cubebound.vercel.app/auth/callback",
  `expected https://cubebound.vercel.app/auth/callback, got ${probe.redirectTo}`,
);
expect(
  !probe.redirectTo.includes("localhost"),
  `a production request must not produce a localhost redirect: ${probe.redirectTo}`,
);
expect(
  new URL(probe.redirectTo).pathname === "/auth/callback",
  `redirect_to must land on the callback route, got ${probe.redirectTo}`,
);

// Local dev is the path that already worked; make sure the fix didn't cost it.
const local = await signInFrom("localhost:3000", "http", "magic-link-probe@cubebound.test");
console.log(`   from localhost -> ${local.redirectTo}`);
expect(
  local.redirectTo === "http://localhost:3000/auth/callback",
  `localhost should still resolve to itself over http, got ${local.redirectTo}`,
);

// The self-heal: / with a stray ?code= forwards to the callback.
console.log("\nnear-miss redirect:");
const landing = await fetch(`${APP}/?code=probe-code-123`, { redirect: "manual" });
const location = landing.headers.get("location") ?? "";
console.log(`   GET /?code=… -> ${landing.status} ${location}`);
expect(
  [307, 308, 302, 303].includes(landing.status),
  `/?code= should redirect, got ${landing.status}`,
);
expect(
  location.includes("/auth/callback") && location.includes("probe-code-123"),
  `/?code= should forward the code to /auth/callback, got ${location}`,
);

console.log(
  failures.length
    ? `\nFAILURES:\n - ${failures.join("\n - ")}`
    : "\nmagic link check passed",
);
process.exit(failures.length ? 1 : 0);
