/**
 * Drives the primer editor's toolbar in a real browser.
 *
 * `check:markdown-edit` proves the transforms; this proves they are *wired* —
 * that a click reaches the textarea, that the change reaches React state (so
 * the live preview and the Save button's dirty check both see it), and that
 * the result survives a save and reload. Those are exactly the parts a pure
 * check cannot reach, and the parts that break silently: `execCommand` fires a
 * native input event, and if React ever stops listening for it the buttons go
 * on working visually while the form submits the old text.
 *
 * Prerequisites: npm run dev, and Chrome on :9222.
 * Creates a throwaway account and deletes it again.
 *
 *   npm run check:primer-toolbar
 */
import postgres from "postgres";

import { fromEnvFile } from "./lib/env";
import { createTestAccount, deleteTestAccounts } from "./lib/test-account";

import { createCube } from "../src/db/queries/cubes";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CDP = process.env.CDP_URL ?? "http://localhost:9222";

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

const created: string[] = [];
let ws: WebSocket | undefined;
let targetId = "";

try {
  const account = await createTestAccount(sql, { prefix: "primer" });
  created.push(account.id);
  const cube = await createCube({
    ownerId: account.id,
    name: "Toolbar Test Cube",
    description: "Exercises the primer toolbar.",
    visibility: "private",
  });

  const target = await (await fetch(`${CDP}/json/new`, { method: "PUT" })).json();
  targetId = target.id;
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws!.onopen = r));

  let id = 0;
  const pending = new Map<number, (m: { result?: Record<string, unknown> }) => void>();
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)!(message);
      pending.delete(message.id);
    }
  };
  const send = (method: string, params: unknown = {}) =>
    new Promise<{ result?: Record<string, unknown> }>((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws!.send(JSON.stringify({ id: n, method, params }));
    });

  // The trailing comma is required: in a .mts file a bare `<T>` on an arrow
  // function is parsed as the start of a type assertion.
  const evaluate = async <T,>(expression: string): Promise<T> => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true });
    const r = res.result as { result?: { value?: T } };
    return r?.result?.value as T;
  };

  await send("Network.enable");
  await send("Page.enable");
  // Split on the first `=` only — the cookie's value is base64url and can
  // contain more of them.
  const eq = account.cookie.indexOf("=");
  await send("Network.setCookie", {
    name: account.cookie.slice(0, eq),
    value: account.cookie.slice(eq + 1),
    domain: "localhost",
    path: "/",
  });

  const editUrl = `${APP}/cube/${account.username}/${cube.slug}/edit?mode=primer`;
  await send("Page.navigate", { url: editUrl });

  // Wait for hydration, not just for the markup: `readyState === 'complete'`
  // fires while the loading shell is still up, and a click on an unhydrated
  // button silently does nothing. React's internal props key is the signal
  // that a handler is actually attached.
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    ready = await evaluate<boolean>(`(() => {
      const b = document.querySelector('[role=toolbar] button');
      if (!b) return false;
      return Object.keys(b).some(k => k.startsWith('__reactProps'));
    })()`);
    if (!ready) await new Promise((r) => setTimeout(r, 250));
  }
  expect(ready, "the primer toolbar never hydrated");
  if (!ready) throw new Error("toolbar not ready");

  /** Types into the textarea the way a person would, through React. */
  const setText = async (text: string) => {
    await evaluate(`(() => {
      const el = document.getElementById('primer');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  const selectRange = (start: number, end: number) =>
    evaluate(`(() => {
      const el = document.getElementById('primer');
      el.focus(); el.setSelectionRange(${start}, ${end});
    })()`);
  const clickTool = (label: string) =>
    evaluate<boolean>(`(() => {
      const b = [...document.querySelectorAll('[role=toolbar] button')]
        .find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!b) return false;
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      b.click();
      return true;
    })()`);
  const textareaValue = () =>
    evaluate<string>(`document.getElementById('primer').value`);
  const previewHtml = () =>
    evaluate<string>(`document.querySelector('.primer')?.innerHTML ?? ''`);

  // ---- Bold wraps the selection, and the preview follows ----------------
  await setText("Fury is the aggro domain");
  await selectRange(0, 4);
  expect(await clickTool("Bold"), "no Bold button in the toolbar");
  const bolded = await textareaValue();
  expect(
    bolded === "**Fury** is the aggro domain",
    `Bold should wrap the selection, got ${JSON.stringify(bolded)}`,
  );

  // The preview is rendered from React state. If the click only mutated the
  // DOM and React never heard about it, the textarea would look right and this
  // would still show the old text — the exact failure this check exists for.
  const previewAfterBold = await previewHtml();
  expect(
    previewAfterBold.includes("<strong>Fury</strong>"),
    `the preview should re-render from React state, got ${JSON.stringify(previewAfterBold.slice(0, 160))}`,
  );

  // ---- Pressing it again unwraps ---------------------------------------
  await selectRange(0, 8);
  await clickTool("Bold");
  const unbolded = await textareaValue();
  expect(
    unbolded === "Fury is the aggro domain",
    `Bold twice should return the original, got ${JSON.stringify(unbolded)}`,
  );

  // ---- Headings and lists on multiple lines -----------------------------
  await setText("Plan\nfirst\nsecond");
  await selectRange(0, 4);
  await clickTool("Heading 2");
  expect(
    (await textareaValue()).startsWith("## Plan"),
    `Heading 2 should prefix the line, got ${JSON.stringify(await textareaValue())}`,
  );

  const withHeading = await textareaValue();
  await selectRange(withHeading.indexOf("first"), withHeading.length);
  await clickTool("Bulleted list");
  const listed = await textareaValue();
  expect(
    listed === "## Plan\n- first\n- second",
    `bullets should apply to both lines, got ${JSON.stringify(listed)}`,
  );

  // ---- Ctrl+B goes through the same path --------------------------------
  await setText("shortcut test");
  await selectRange(0, 8);
  await evaluate(`(() => {
    const el = document.getElementById('primer');
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
  })()`);
  const viaKeyboard = await textareaValue();
  expect(
    viaKeyboard === "**shortcut** test",
    `Ctrl+B should bold like the button, got ${JSON.stringify(viaKeyboard)}`,
  );

  // ---- The edit actually saves ------------------------------------------
  await setText("# Saved heading\n\n- one\n- two");
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Save primer');
    b.click();
  })()`);

  let stored: string | null = null;
  for (let i = 0; i < 40; i++) {
    const [row] = await sql<{ primer: string | null }[]>`
      select primer from cubes where id = ${cube.id}::uuid`;
    if (row?.primer) {
      stored = row.primer;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Byte-for-byte, LF and all. A textarea submits CRLF per the HTML spec, so
  // without normalising on the server what comes back never equals what was
  // sent — and the editor's dirty check compares exactly those two strings.
  expect(
    stored === "# Saved heading\n\n- one\n- two",
    `the toolbar's output should save unchanged, got ${JSON.stringify(stored)}`,
  );

  // The visible consequence of the above: after a successful save the editor
  // must not still claim there are unsaved changes.
  let settled = "";
  for (let i = 0; i < 30; i++) {
    settled = await evaluate<string>(
      `document.querySelector('[aria-live=polite]')?.textContent?.trim() ?? ''`,
    );
    if (settled !== "Unsaved changes") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(
    settled !== "Unsaved changes",
    `after saving, the editor still reports "${settled}" — the stored text does ` +
      `not match the draft it was sent`,
  );

  console.log(`primer toolbar: bold, heading, bullets, Ctrl+B and save all reached the server`);
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  if (targetId) await fetch(`${CDP}/json/close/${targetId}`).catch(() => {});
  ws?.close();
  await deleteTestAccounts(sql, created);
  await sql.end();
}

if (failures.length > 0) {
  console.error(`primer toolbar check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("primer toolbar check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
