/**
 * Fills the **dev** database with users, cubes and follows so Explore, the
 * Followed tab and the search boxes have something to work on by hand.
 *
 * Everything it makes is tagged: seeded accounts use `@seed.cubebound.test`
 * emails, and `--clean` deletes exactly those, taking their cubes and follows
 * with them by cascade. Nothing else is touched, so it is safe to re-run.
 *
 *   npm run seed:discovery              # 8 users, ~14 cubes
 *   npm run seed:discovery -- --users 20 --cubes 40
 *   npm run seed:discovery -- --follow-as yourname   # they follow YOUR cubes too
 *   npm run seed:discovery -- --clean
 *
 * This reads DATABASE_URL from `.env.local`, which points at dev — the same
 * switch every other script uses. It refuses to run if that URL is not a
 * Supabase host it can see is the dev project, so a mis-set shell variable
 * cannot turn a seed run into a production write. See CLAUDE.md, "Environments".
 *
 * Seeded accounts cannot sign in: the app is magic-link only and these have no
 * mailbox. They exist to be *found*, not to be used. Follow, search and browse
 * from your own account.
 */
import postgres from "postgres";

import { fromEnvFile } from "./lib/env";

import { db } from "../src/db";
import { cubeCards, cubeFollows, cubes as cubesTable } from "../src/db/schema";
import { claimUsername } from "../src/db/queries/users";
import { defaultSectionForType } from "../src/lib/riftbound";
import { slugify, uniqueSlug } from "../src/lib/slug";

const SEED_DOMAIN = "seed.cubebound.test";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const databaseUrl = fromEnvFile("DATABASE_URL");
const projectRef = new URL(fromEnvFile("NEXT_PUBLIC_SUPABASE_URL")).host.split(".")[0];
if (!databaseUrl.includes(projectRef)) {
  throw new Error(
    `DATABASE_URL does not match NEXT_PUBLIC_SUPABASE_URL (${projectRef}) — refusing to seed a ` +
      `database this script cannot identify.`,
  );
}
const sql = postgres(databaseUrl, { prepare: false });

// --- word lists, for names that read like real cubes --------------------------
const ADJECTIVES = [
  "Peasant", "Powered", "Vintage", "Legacy", "Budget", "Chaos", "Artisan", "Unhinged",
  "Grindy", "Hyper", "Lowpower", "Boutique", "Community", "Kitchen-Sink", "Curated",
  "Experimental", "Classic", "Turbo", "Midrange", "Singleton",
];
const NOUNS = [
  "Cube", "Pauper Cube", "Draft Cube", "Legend Cube", "Battlefield Cube", "Rune Cube",
  "Testing Ground", "Proving Grounds", "Sandbox", "Gauntlet", "Arena", "Workshop",
];
const THEMES = [
  "Fury aggro", "Calm ramp", "Mind tempo", "Body midrange", "Chaos combo", "Order control",
  "two-domain gold", "signature spells", "champion tribal", "low curve", "battlefield matters",
  "rune-light", "artifacts and gear", "big might", "token swarm",
];
const BLURBS = [
  "Built for eight-player pods and finished in about ninety minutes.",
  "Every domain pair is represented at least twice.",
  "Deliberately low power — games go long and decisions matter.",
  "A first pass. Expect the curve to move around a lot.",
  "Tuned over about a dozen drafts with the local group.",
  "Signature spells are the whole point of this list.",
  "No legends above three energy, on purpose.",
  "A grindy, attrition-heavy environment.",
  "Fast. If your deck can't start on turn one, rebuild it.",
  "Half the fun is the battlefields; there are a lot of them.",
];
const USERNAMES = [
  "riftsmith", "poro_pilot", "domainweaver", "cubecrafter", "tempo_tess", "kennen_fan",
  "shellofthe", "silentakali", "battlefield_bo", "runekeeper", "midrange_mo", "chaos_carl",
  "orderly_ora", "furyfirst", "calmcollected", "mindmelder", "bodyblocker", "draftdad",
  "pod_of_eight", "signature_sam", "legendlover", "peasantpete", "turbo_tina", "gearhead_gil",
];

/** Small deterministic RNG so a run can be reproduced from its printed seed. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function clean() {
  const removed = await sql`
    delete from auth.users where email like ${`%@${SEED_DOMAIN}`} returning id`;
  console.log(`removed ${removed.length} seeded account(s) and everything they owned`);
}

async function main() {
  if (flag("clean")) {
    await clean();
    return;
  }

  const seed = Number(arg("seed", String(Date.now() % 100000)));
  const rng = makeRng(seed);
  const userCount = Math.max(1, Number(arg("users", "8")));
  const cubeCount = Math.max(1, Number(arg("cubes", "14")));
  const followAs = arg("follow-as");

  const pick = <T,>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

  // --- the card pool ----------------------------------------------------------
  // Canonical printings only: alt arts and showcase reprints would make every
  // cube look like it runs the same card three times.
  const pool = await sql<{ id: string; type: string }[]>`
    select id, type from cards where base_id = id`;
  if (pool.length === 0) throw new Error("no cards in this database — run `npm run sync-cards` first");
  const byType = new Map<string, { id: string; type: string }[]>();
  for (const card of pool) {
    const key = defaultSectionForType(card.type);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(card);
  }
  console.log(`pool: ${pool.length} canonical printings, seed ${seed}`);

  // --- users ------------------------------------------------------------------
  const stamp = Date.now().toString(36).slice(-4);
  const made: { id: string; username: string }[] = [];
  for (let i = 0; i < userCount; i++) {
    const base = USERNAMES[i % USERNAMES.length];
    // Suffixed so a second run doesn't collide with the first's usernames.
    const username = `${base}_${stamp}`.slice(0, 30);
    const email = `${username}@${SEED_DOMAIN}`;
    const [row] = await sql<{ id: string }[]>`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${email}, '', now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
        '', '', '', '', '', '', '', ''
      ) returning id`;
    const claimed = await claimUsername(row.id, username);
    if (!claimed.ok) throw new Error(`${username}: ${claimed.error}`);
    made.push({ id: row.id, username });
  }
  console.log(`created ${made.length} users`);

  // --- cubes ------------------------------------------------------------------
  const built: { id: string; owner: string; slug: string; name: string; visibility: string }[] = [];
  for (let i = 0; i < cubeCount; i++) {
    const owner = pick(made);
    const theme = pick(THEMES);
    const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;

    // The first three cover one visibility each, then it goes random and
    // public-weighted. Left purely to chance, a run can easily produce no
    // private cube at all — and private is the case with a rule to get wrong,
    // so it must be present every time.
    const roll = rng();
    const visibility =
      i === 0 ? "public"
      : i === 1 ? "unlisted"
      : i === 2 ? "private"
      : roll < 0.7 ? "public"
      : roll < 0.85 ? "unlisted"
      : "private";

    const existing = await sql<{ slug: string }[]>`
      select slug from cubes where owner_id = ${owner.id}::uuid`;
    const slug = uniqueSlug(slugify(name), new Set(existing.map((r) => r.slug)));

    // Older cubes for some, so "recently updated" has a real ordering to show.
    const ageDays = between(0, 120);
    const [cube] = await db
      .insert(cubesTable)
      .values({
        ownerId: owner.id,
        name,
        slug,
        description: `${pick(BLURBS)} Focused on ${theme}.`,
        primer:
          rng() < 0.6
            ? `# ${name}\n\n## What this cube is about\n\n${pick(BLURBS)}\n\n` +
              `The environment leans on **${theme}**, so expect the first few picks ` +
              `to set your domains earlier than you might like.\n\n` +
              `## Changes\n\n- Cut the top end by four cards\n- Added more two-drops\n`
            : null,
        visibility: visibility as "public" | "unlisted" | "private",
      })
      .returning();

    await sql`
      update cubes
      set created_at = now() - ${`${ageDays + 30} days`}::interval,
          updated_at = now() - ${`${ageDays} days`}::interval
      where id = ${cube.id}::uuid`;

    // A plausible spread: mostly main, a handful of each identity section.
    const wanted: Record<string, number> = {
      main: between(40, 220),
      legends: between(0, 10),
      battlefields: between(0, 12),
      runes: between(0, 6),
      sideboard: between(0, 8),
      maybeboard: between(0, 10),
    };
    const rows: { cubeId: string; cardId: string; section: string; quantity: number }[] = [];
    for (const [section, count] of Object.entries(wanted)) {
      // The maybeboard and sideboard hold anything; the rest take their own type.
      const source =
        section === "main" || section === "sideboard" || section === "maybeboard"
          ? (byType.get("main") ?? [])
          : (byType.get(section) ?? []);
      if (source.length === 0) continue;
      const taken = new Set<string>();
      for (let n = 0; n < Math.min(count, source.length); n++) {
        const card = pick(source);
        if (taken.has(card.id)) continue;
        taken.add(card.id);
        rows.push({
          cubeId: cube.id,
          cardId: card.id,
          section,
          // Mostly singleton, occasionally a multiple — the quantity model
          // should be exercised, not just described.
          quantity: rng() < 0.1 ? between(2, 3) : 1,
        });
      }
    }
    // One statement per cube: 14 cubes × 250 rows is 3,500 round trips otherwise.
    if (rows.length > 0) {
      await db
        .insert(cubeCards)
        .values(rows as never)
        .onConflictDoNothing();
    }

    built.push({ id: cube.id, owner: owner.username, slug, name, visibility });
  }
  console.log(`created ${built.length} cubes`);

  // --- follows ------------------------------------------------------------------
  // Skewed rather than uniform, so "most followed" has a visible winner instead
  // of a flat list every cube ties in.
  const followable = built.filter((c) => c.visibility !== "private");
  const follows: { userId: string; cubeId: string }[] = [];
  for (const user of made) {
    for (const cube of followable) {
      const popularity = 1 / (1 + followable.indexOf(cube) * 0.35);
      if (rng() < popularity * 0.8) follows.push({ userId: user.id, cubeId: cube.id });
    }
  }
  if (follows.length > 0) {
    await db.insert(cubeFollows).values(follows).onConflictDoNothing();
  }
  console.log(`created ${follows.length} follows`);

  // --- your own cubes, so follower counts show up where you'll look -------------
  if (followAs) {
    const [you] = await sql<{ id: string }[]>`
      select id from users where username = ${followAs.toLowerCase()}`;
    if (!you) {
      console.warn(`--follow-as ${followAs}: no such user, skipping`);
    } else {
      const yours = await sql<{ id: string }[]>`
        select id from cubes where owner_id = ${you.id}::uuid and visibility <> 'private'`;
      const mine = yours.flatMap((cube) =>
        made.filter(() => rng() < 0.5).map((user) => ({ userId: user.id, cubeId: cube.id })),
      );
      if (mine.length > 0) {
        await db.insert(cubeFollows).values(mine).onConflictDoNothing();
      }
      console.log(`seeded users now follow your cubes ${mine.length} time(s)`);
    }
  }

  const top = followable
    .map((c) => ({ ...c, n: follows.filter((f) => f.cubeId === c.id).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  console.log("\nmost-followed seeded cubes:");
  for (const c of top) {
    console.log(`  ${String(c.n).padStart(3)} followers  /cube/${c.owner}/${c.slug}  (${c.name})`);
  }
  const tally = built.reduce<Record<string, number>>((acc, c) => {
    acc[c.visibility] = (acc[c.visibility] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\nvisibility: ${Object.entries(tally)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ")}  — only the public ones should appear on /explore`,
  );
  const hidden = built.filter((c) => c.visibility !== "public").slice(0, 3);
  for (const c of hidden) {
    console.log(`  ${c.visibility.padEnd(8)} /cube/${c.owner}/${c.slug}  (${c.name})`);
  }
  console.log("\nclean up with: npm run seed:discovery -- --clean");
}

try {
  await main();
} finally {
  await sql.end();
}
process.exit(0);
