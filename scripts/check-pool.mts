/**
 * Guards the two fixes that ended the outage of 16 August 2026.
 *
 * Adding cards quickly from the editor's browse tab took the whole site down.
 * The database stayed healthy — `/explore` answered in 240ms — but every
 * connection was held by a `/cards` request, so unrelated routes queued for one
 * with no deadline. Two causes: `getFilterOptions` fired six queries on every
 * card-browser load, and the pool was unbounded with no idle timeout, so each
 * frozen Vercel instance sat on up to ten connections forever.
 *
 * **This replaces a load test, deliberately.** The first version fired 40
 * concurrent requests at `/cards`, and it worked — until it didn't: it drove
 * the shared dev Supabase project into statement timeouts, so a standalone
 * `select 1` took seconds, `check:browse-grid` failed immediately afterwards,
 * and the check reported an outage that was its own doing. A gate step that
 * breaks the next gate step is worse than no gate step. It also measured the
 * database's capacity as much as the code's behaviour, which is not what needs
 * guarding: the regression to prevent is someone removing the pool bounds or
 * the memo, and both of those are checkable directly and deterministically.
 *
 * Needs a database for the memo assertion, but issues three queries, not 240.
 *
 *   npm run check:pool
 */
import { readFileSync } from "node:fs";

import { getFilterOptions, searchCards } from "../src/db/queries/cards";

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

try {
  // ---- the pool is bounded and releases what it takes -------------------
  // Read as source rather than imported: importing `db` opens a connection,
  // and the options are not exposed on the client afterwards.
  const source = readFileSync("src/db/index.ts", "utf8");

  expect(
    /\bmax:\s*\d+/.test(source),
    "src/db/index.ts must set an explicit `max` — postgres-js defaults to 10 " +
      "per instance, and every Vercel instance builds its own pool",
  );
  expect(
    /\bidle_timeout:\s*\d+/.test(source),
    "src/db/index.ts must set `idle_timeout` — without it a frozen serverless " +
      "instance holds its connections forever, which is what exhausted the pool",
  );
  expect(
    /\bconnect_timeout:\s*\d+/.test(source),
    "src/db/index.ts must set `connect_timeout` — otherwise exhaustion is an " +
      "indefinite hang instead of a fast error with a digest in Sentry",
  );

  const max = Number(/\bmax:\s*(\d+)/.exec(source)?.[1] ?? 0);
  expect(
    max > 0 && max <= 10,
    `pool max is ${max}: it must be small enough that many instances cannot ` +
      `exhaust the transaction pooler between them`,
  );
  // Pages deliberately run independent queries in `Promise.all`; a pool of one
  // would serialise them and undo the page-speed work.
  expect(max >= 4, `pool max is ${max}, too small for the widest Promise.all fan-out`);

  // ---- the hot paths are memoised --------------------------------------
  // Timing, not counting: a second call that still hits the network takes tens
  // of milliseconds, a memo hit takes under one. The gap is three orders of
  // magnitude, so this needs no instrumentation and cannot be flaky.
  const firstOptions = Date.now();
  await getFilterOptions();
  const optionsCold = Date.now() - firstOptions;

  const secondOptions = Date.now();
  await getFilterOptions();
  const optionsWarm = Date.now() - secondOptions;

  expect(
    optionsWarm < 5,
    `getFilterOptions took ${optionsWarm}ms on a second call (first ${optionsCold}ms) ` +
      `— it must be memoised; it fires six queries and ran on every card-browser load`,
  );

  const firstPage = Date.now();
  await searchCards({});
  const pageCold = Date.now() - firstPage;

  const secondPage = Date.now();
  await searchCards({});
  const pageWarm = Date.now() - secondPage;

  expect(
    pageWarm < 5,
    `the unfiltered card page took ${pageWarm}ms on a second call (first ${pageCold}ms) ` +
      `— the default view must be memoised`,
  );

  // ...but only the default view, or a crafted querystring could grow the map
  // without bound. **The same filters twice**, deliberately: two *different*
  // ones both miss whatever the caching rule is, so they cannot tell a scoped
  // memo from one that caches everything — a mutation doing exactly that
  // passed until this repeated a single query.
  const sameFilter = { q: `pool-check-${Date.now()}` };
  const filtered = Date.now();
  await searchCards(sameFilter);
  const filteredFirst = Date.now() - filtered;
  const filteredAgain = Date.now();
  await searchCards(sameFilter);
  const filteredSecond = Date.now() - filteredAgain;
  expect(
    filteredSecond >= 5,
    `the same filtered search returned in ${filteredSecond}ms on its second call ` +
      `(first ${filteredFirst}ms) — filtered searches must NOT be cached, or the ` +
      `memo grows without bound on attacker-controlled keys`,
  );

  // ---- a bad read is never cached --------------------------------------
  // Production once served a rarity filter whose only option was "966" — the
  // card count, which the count query aliased `value`, exactly the shape the
  // rarity query returns. Nothing threw, and the five-minute memo then held the
  // wrong answer. The alias is now `total`, so the two can no longer be
  // confused; this asserts the second half, that an implausible read is not
  // cached even if one somehow arrives.
  const cardsSource = readFileSync("src/db/queries/cards.ts", "utf8");
  expect(
    /select\(\{\s*total:/.test(cardsSource),
    "the count must be aliased `total`, not `value` — sharing a shape with the " +
      "filter-option queries is what made a crossed result undetectable",
  );
  expect(
    !/select\(\{ value: grouped/.test(cardsSource),
    "the old ambiguous `value` alias is back on the count query",
  );
  expect(
    cardsSource.includes("looksLikeFilterOptions"),
    "getFilterOptions must validate before memoising, or one bad read sticks " +
      "for the whole TTL",
  );
  expect(
    /looksLikeFilterOptions[\s\S]{0,600}captureMessage/.test(cardsSource),
    "an implausible read must be reported, or the next occurrence is invisible " +
      "again — that invisibility is the actual bug being fixed",
  );

  console.log(
    `pool: max ${max}, idle and connect timeouts set; ` +
      `filter options ${optionsCold}ms then ${optionsWarm}ms, ` +
      `default page ${pageCold}ms then ${pageWarm}ms`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
}

if (failures.length > 0) {
  console.error(`pool check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("pool check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
