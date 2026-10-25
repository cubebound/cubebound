/**
 * A minimal Chrome DevTools Protocol driver, for the checks that need a real
 * browser (`check:auth-flow`, `check:cube-ownership`, `check:magic-link`,
 * `check:primer-toolbar`). Chrome must be running with
 * `--remote-debugging-port=9222`; docs/gate-runbook.md has the launch line.
 *
 * Each of those checks used to carry its own copy of this: the target lookup,
 * the socket, the id-to-reply map and an `evaluate` wrapper, four times with
 * small drifts between them. What stays in each check is what genuinely
 * differs, above all **how it decides the page is usable**:
 * `document.readyState === 'complete'` goes true while a `loading.tsx`
 * skeleton is still up and before React has hydrated, so a check that clicks
 * has to wait for its own button to carry React's props key (see
 * docs/checks.md). That wait names a specific control, which is why it is not
 * a helper here.
 *
 * Imports nothing, like `env.ts`, so any check can use it without pulling the
 * database layer in behind it.
 */

/** 127.0.0.1 rather than localhost: Chrome binds the debugging port on IPv4. */
export const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9222";

export interface ChromePage {
  /** Sends one CDP command and resolves with its `result`. */
  send(method: string, params?: object): Promise<Record<string, unknown> | undefined>;
  /** Evaluates an expression in the page, awaiting a promise it returns. */
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** Hears every CDP event, for checks that watch the network. */
  onEvent(listener: (method: string, params: Record<string, unknown>) => void): void;
  /** Closes the socket, and the tab too if `openPage` created it. */
  close(): Promise<void>;
}

/**
 * Attaches to Chrome's first open page, or opens a fresh tab with
 * `{ newTab: true }`.
 */
export async function openPage({ newTab = false } = {}): Promise<ChromePage> {
  let target: { id: string; type: string; webSocketDebuggerUrl: string } | undefined;
  if (newTab) {
    target = await (await fetch(`${CDP_URL}/json/new`, { method: "PUT" })).json();
  } else {
    const targets: NonNullable<typeof target>[] = await (await fetch(`${CDP_URL}/json/list`)).json();
    target = targets.find((t) => t.type === "page");
  }
  if (!target) {
    throw new Error(
      `no Chrome page target at ${CDP_URL}; is Chrome running with --remote-debugging-port=9222?`,
    );
  }
  const tab = target;

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map<number, (result: Record<string, unknown> | undefined) => void>();
  const listeners: ((method: string, params: Record<string, unknown>) => void)[] = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)!(message.result);
      pending.delete(message.id);
    } else if (message.method) {
      for (const listener of listeners) listener(message.method, message.params ?? {});
    }
  };

  const send: ChromePage["send"] = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  return {
    send,
    async evaluate<T = unknown>(expression: string): Promise<T> {
      const reply = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      return (reply?.result as { value?: T } | undefined)?.value as T;
    },
    onEvent(listener) {
      listeners.push(listener);
    },
    async close() {
      ws.close();
      if (newTab) await fetch(`${CDP_URL}/json/close/${tab.id}`).catch(() => {});
    },
  };
}

/**
 * Polls until the document reports `complete`. **Not** "the page is usable"
 * on a route with a loading boundary; see the note at the top of this file.
 */
export async function waitForLoad(page: ChromePage, { tries = 80, intervalMs = 250 } = {}) {
  for (let i = 0; i < tries; i++) {
    if ((await page.evaluate<string>("document.readyState")) === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("page never finished loading");
}
