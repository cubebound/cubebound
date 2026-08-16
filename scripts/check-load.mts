/**
 * Guards against the card browser exhausting the connection pool.
 *
 * This is the outage of 16 August 2026, written down as a test. Adding cards
 * quickly from the editor's browse tab took the whole site down: the database
 * stayed healthy — `/explore` answered in 240ms throughout — but every
 * connection was held by a `/cards` request, so unrelated routes queued for one
 * with no deadline and timed out. `getFilterOptions` was firing six queries per
 * request and the pool was unbounded and never released.
 *
 * **The sharpest signal is how long the slowest request takes**, not how many
 * fail. Measured on the same machine: healthy runs finish in ~5s, the pre-fix
 * code takes 45s and only starts failing outright once requests pass whatever
 * deadline the client sets. Counting failures alone made the result depend on
 * that deadline — one run failed 39 of 40, another only 1 of 40, both equally
 * broken — so `SLOWEST_LIMIT` sits in the wide gap between the two.
 *
 * The `/explore` bystander assertion is kept because it is the user-visible
 * symptom — "I can't get any pages to load" — but note it did **not** fire on
 * the broken code in testing: the pool starved the card browser without ever
 * quite starving a one-query route. It is a backstop, not the primary signal.
 *
 * **Run it against a freshly started dev server.** A server that had been up
 * for hours through dozens of hot reloads reached a state where all 40 requests
 * timed out at 45s and `/explore` failed too — while a restart, with identical
 * code, passed immediately and kept passing through the rest of the gate. The
 * cause was not pinned down: server-side connections in `pg_stat_activity` held
 * steady at 13 across forced reload cycles, but that is measured through the
 * transaction pooler, which multiplexes, so it cannot see client-side pools.
 * Production is serverless with short-lived processes and no HMR, so the
 * pattern does not obviously exist there — but "does not obviously exist" is
 * not "ruled out", and `connect_timeout` plus Sentry is what would surface it.
 *
 * The practical consequence: a failure here from a long-lived dev server is not
 * necessarily a regression. Restart and re-run before believing it — and do not
 * dismiss a *fresh* server failing, which is the mistake that let the original
 * outage reach production.
 *
 * Prerequisite: a freshly started npm run dev. Reads only; creates nothing.
 *
 *   npm run check:load
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";

/** Enough to exhaust an unbounded pool, few enough to finish quickly. */
const BURST = 40;
/** Well past the ~4s a healthy run takes, well under the 60s failure. */
const BURST_DEADLINE_MS = 45_000;
/** A cheap unrelated route must stay responsive throughout. */
const BYSTANDER_DEADLINE_MS = 15_000;
/**
 * The slowest single request allowed. Healthy is ~5s and the pre-fix code is
 * ~45s, so this sits in the middle of a nine-fold gap — far enough from healthy
 * not to be flaky, far enough from broken not to be missed.
 */
const SLOWEST_LIMIT_MS = 20_000;

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

async function timed(path: string, timeoutMs: number) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${APP}${path}`, { signal: controller.signal });
    // Drain the body: a response is not finished until it is read, and an
    // unread stream can hold the server-side request open.
    await res.arrayBuffer();
    return { status: res.status, ms: Date.now() - started };
  } catch {
    return { status: 0, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

try {
  // Warm the route so compilation isn't measured as saturation.
  await timed("/cards", 120_000);

  // Distinct querystrings so nothing is served from the default-view memo —
  // this has to be real work, or the check proves nothing.
  const burst = Array.from({ length: BURST }, (_, i) =>
    timed(`/cards?q=probe${i}`, BURST_DEADLINE_MS),
  );

  // Fired while the burst is in flight: this is the user-visible symptom —
  // "I can't get any pages to load" — and the reason this check exists.
  const bystander = timed("/explore", BYSTANDER_DEADLINE_MS);

  const [results, explore] = await Promise.all([Promise.all(burst), bystander]);

  const ok = results.filter((r) => r.status === 200).length;
  const slowest = Math.max(...results.map((r) => r.ms));

  expect(
    ok === BURST,
    `${BURST - ok} of ${BURST} card-browser requests failed under load ` +
      `(slowest ${slowest}ms) — the pool is being exhausted`,
  );
  expect(
    slowest < SLOWEST_LIMIT_MS,
    `the slowest card-browser request took ${slowest}ms under load (limit ` +
      `${SLOWEST_LIMIT_MS}ms) — healthy is around 5s, pool exhaustion is around 45s`,
  );
  expect(
    explore.status === 200,
    `/explore returned ${explore.status || "nothing"} after ${explore.ms}ms while ` +
      `the card browser was busy — one heavy route must not take the site down`,
  );
  expect(
    explore.ms < BYSTANDER_DEADLINE_MS,
    `/explore took ${explore.ms}ms during the burst; an unrelated page should ` +
      `stay responsive`,
  );

  console.log(
    `load: ${ok}/${BURST} card requests OK, slowest ${slowest}ms; ` +
      `/explore ${explore.status} in ${explore.ms}ms during the burst`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
}

if (failures.length > 0) {
  console.error(`load check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("load check passed");
}
process.exit(failures.length > 0 ? 1 : 0);
