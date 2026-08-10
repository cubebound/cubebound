/**
 * Dev-only interceptor that captures the magic-link request instead of sending it.
 *
 * Preloaded into the dev server by check:magic-link:
 *   npm run dev:probe
 *
 * That runs Next directly rather than through npm. NODE_OPTIONS would otherwise
 * be inherited by npm's own helper node processes, and this module loading into
 * those breaks them.
 *
 * It wraps global fetch, and when the app calls Supabase's /auth/v1/otp it
 * records the `redirect_to` and answers with a synthetic success — so the
 * check can read the exact URL that would have been sent without emailing
 * anyone or creating a user. Inert unless SIGNIN_PROBE=1.
 *
 * The capture goes to a file, deliberately. An HTTP listener here would be
 * worse than it sounds: NODE_OPTIONS applies to *every* node process npm
 * spawns, including its short-lived helpers, and an open server socket keeps
 * those helpers alive — which deadlocks `npm run dev` before Next ever starts.
 * A file write has no such lifetime coupling. Writes go to a temp file and are
 * renamed into place so a reader never sees half a record.
 */
import { renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PROBE_FILE =
  process.env.SIGNIN_PROBE_FILE ?? join(tmpdir(), "cubebound-otp-probe.json");

if (process.env.SIGNIN_PROBE === "1") {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));

    if (url.includes("/auth/v1/otp")) {
      let redirectTo = null;
      try {
        redirectTo = new URL(url).searchParams.get("redirect_to");
      } catch {
        /* not absolute; fall through to the body */
      }
      // supabase-js sends it as a query param, but tolerate a body form too.
      if (!redirectTo && init?.body) {
        try {
          const body = JSON.parse(String(init.body));
          redirectTo = body.options?.email_redirect_to ?? body.email_redirect_to ?? null;
        } catch {
          /* not JSON; leave null */
        }
      }

      const record = JSON.stringify({ url, redirectTo, at: new Date().toISOString() });
      const temp = `${PROBE_FILE}.${process.pid}.tmp`;
      writeFileSync(temp, record);
      renameSync(temp, PROBE_FILE);
      process.stderr.write(`[otp-probe] intercepted redirect_to=${redirectTo}\n`);

      // Short-circuit: never actually send the mail.
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return realFetch(input, init);
  };

  // stderr, never stdout: npm parses the stdout of its helper node processes
  // as data, and a stray line there breaks `npm run` outright.
  process.stderr.write(`[otp-probe] armed in pid ${process.pid} -> ${PROBE_FILE}\n`);
}
