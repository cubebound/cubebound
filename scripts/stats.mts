/**
 * What the site actually holds, in numbers.
 *
 * Every product question so far has been answered by scraping the public site
 * — the sitemap, Explore, and each cube's tabs — which takes dozens of requests
 * and still cannot see a private cube, an empty one that never got published,
 * or a draft. That made every usage figure a floor rather than a total. This
 * answers the same questions properly in one query round.
 *
 *   npm run stats              # dev, the default and the safe one
 *   npm run stats -- --prod    # production, through a read-only role
 *
 * **Read-only by construction and by credential.** It runs `select` and nothing
 * else, and `--prod` reads `.env.production.readonly`, which holds a Postgres
 * role granted `select` and no other privilege — so the rule in CLAUDE.md's
 * "Environments" section survives: the credential that exists here cannot write
 * even if this file were wrong. Never point it at a service key.
 *
 * Numbers print with an as-of line, because these move daily and a figure
 * pasted somewhere without its date stops being true quietly.
 */

import { readFileSync } from "node:fs";

import postgres from "postgres";

const wantsProd = process.argv.includes("--prod");
const ENV_FILE = wantsProd ? ".env.production.readonly" : ".env.local";

/**
 * Reads the connection string straight out of the env file rather than the
 * process environment, so the script behaves the same however it was started —
 * the same reasoning as `scripts/lib/env.ts`, which this deliberately does not
 * import: that helper falls back to `.env`, and a production run must never
 * silently fall back to anything.
 */
function databaseUrl(): string {
  let contents: string;
  try {
    contents = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(
      `${ENV_FILE} not found.` +
        (wantsProd
          ? " Create it with the read-only role's connection string — see" +
            " \"Working with agents\" in CLAUDE.md."
          : ""),
    );
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`DATABASE_URL not found in ${ENV_FILE}`);
}

const sql = postgres(databaseUrl(), { prepare: false, max: 2 });

/** Right-pads a label so a column of numbers lines up without a table. */
function row(label: string, value: string | number, note = "") {
  console.log(`  ${label.padEnd(34)} ${String(value).padStart(6)}  ${note}`);
}

function heading(text: string) {
  console.log(`\n${text}`);
}

try {
  const [{ now }] = await sql<{ now: string }[]>`select now()::date::text as now`;
  console.log(
    `cubebound stats — ${wantsProd ? "PRODUCTION" : "dev"} — as of ${now}`,
  );

  // --- cubes -----------------------------------------------------------------
  const visibility = await sql<{ visibility: string; n: number }[]>`
    select visibility, count(*)::int as n from cubes group by visibility order by visibility
  `;
  const [{ hidden }] = await sql<{ hidden: number }[]>`
    select count(*)::int as hidden from cubes where hidden_at is not null
  `;
  heading("Cubes");
  for (const v of visibility) row(v.visibility, v.n);
  row("total", visibility.reduce((sum, v) => sum + v.n, 0));
  row("hidden by a moderator", hidden);

  /**
   * Size buckets, counting copies rather than rows — a cube running four of a
   * card holds four cards, and the public page says so. 300 is the floor for a
   * cube that can actually be drafted eight-handed, which is why the buckets
   * break there rather than at a round number.
   */
  const sizes = await sql<{ bucket: string; n: number }[]>`
    with sized as (
      select c.id,
             coalesce((select sum(cc.quantity) from cube_cards cc
                       where cc.cube_id = c.id and cc.section <> 'maybeboard'), 0) as cards
      from cubes c
    )
    select case
             when cards = 0 then 'a. empty'
             when cards < 100 then 'b. 1-99'
             when cards < 300 then 'c. 100-299'
             when cards <= 500 then 'd. 300-500'
             else 'e. over 500'
           end as bucket,
           count(*)::int as n
    from sized group by bucket order by bucket
  `;
  heading("Cube sizes (copies, maybeboard excluded)");
  for (const s of sizes) row(s.bucket.slice(3), s.n);

  // --- people ----------------------------------------------------------------
  const [people] = await sql<
    { accounts: number; with_cube: number; with_real_cube: number; suspended: number }[]
  >`
    select
      (select count(*)::int from users) as accounts,
      (select count(distinct owner_id)::int from cubes) as with_cube,
      (select count(*)::int from (
         select c.owner_id from cubes c
         join cube_cards cc on cc.cube_id = c.id and cc.section <> 'maybeboard'
         group by c.id, c.owner_id having sum(cc.quantity) >= 300
       ) t) as with_real_cube,
      (select count(*)::int from users where suspended_at is not null) as suspended
  `;
  heading("Accounts");
  row("total", people.accounts);
  row("with at least one cube", people.with_cube);
  row("with a cube of 300+ cards", people.with_real_cube, "cubes, not accounts");
  row("suspended", people.suspended);

  // --- drafting --------------------------------------------------------------
  const [drafts] = await sql<
    {
      total: number;
      complete: number;
      cubes_drafted: number;
      last_7: number;
      last_30: number;
      drafters: number;
    }[]
  >`
    select
      count(*)::int as total,
      count(*) filter (where status = 'complete')::int as complete,
      count(distinct cube_id)::int as cubes_drafted,
      count(*) filter (where created_at > now() - interval '7 days')::int as last_7,
      count(*) filter (where created_at > now() - interval '30 days')::int as last_30,
      count(distinct drafter_id)::int as drafters
    from drafts
  `;
  heading("Drafts");
  row("started", drafts.total);
  row("completed", drafts.complete);
  row("distinct cubes drafted", drafts.cubes_drafted);
  row("distinct drafters", drafts.drafters);
  row("started in the last 7 days", drafts.last_7);
  row("started in the last 30 days", drafts.last_30);

  // --- what people use -------------------------------------------------------
  const [adoption] = await sql<
    { primers: number; maybeboards: number; follows: number; clones: number }[]
  >`
    select
      (select count(*)::int from cubes
        where primer is not null and length(trim(primer)) > 0) as primers,
      (select count(distinct cube_id)::int from cube_cards
        where section = 'maybeboard') as maybeboards,
      (select count(*)::int from cube_follows) as follows,
      (select count(*)::int from cube_changes where kind = 'cube_cloned') as clones
  `;
  heading("Feature adoption");
  row("cubes with a primer", adoption.primers);
  row("cubes using the maybeboard", adoption.maybeboards);
  row("follows", adoption.follows);
  row("clones", adoption.clones);

  /**
   * Import sizes.
   *
   * The open question this exists to answer: whether large imports are failing.
   * `MAX_IMPORT_LINES` is 500, and a real 450-card cube was built in ten pastes
   * of 25–55 cards rather than one — which is either how that person works, or
   * a cap they hit without being told. If nothing in production has ever landed
   * above ~100 lines, that is the answer.
   */
  const imports = await sql<{ bucket: string; n: number; largest: number }[]>`
    select case
             when quantity is null then 'f. unrecorded'
             when quantity <= 25 then 'a. 1-25'
             when quantity <= 60 then 'b. 26-60'
             when quantity <= 150 then 'c. 61-150'
             when quantity <= 400 then 'd. 151-400'
             else 'e. over 400'
           end as bucket,
           count(*)::int as n,
           coalesce(max(quantity), 0)::int as largest
    from cube_changes where kind = 'cards_imported'
    group by bucket order by bucket
  `;
  heading("Imports (copies per import, cap is 500 lines)");
  if (imports.length === 0) row("none recorded", 0);
  for (const i of imports) row(i.bucket.slice(3), i.n, `largest ${i.largest}`);

  // --- recent activity -------------------------------------------------------
  const [activity] = await sql<{ edited_7: number; created_7: number; created_30: number }[]>`
    select
      (select count(distinct cube_id)::int from cube_changes
        where created_at > now() - interval '7 days') as edited_7,
      (select count(*)::int from cubes where created_at > now() - interval '7 days') as created_7,
      (select count(*)::int from cubes where created_at > now() - interval '30 days') as created_30
  `;
  heading("Recent activity");
  row("cubes edited in the last 7 days", activity.edited_7);
  row("cubes created in the last 7 days", activity.created_7);
  row("cubes created in the last 30 days", activity.created_30);

  console.log("");
} finally {
  await sql.end();
}
