/**
 * Guards the share-preview images: the site-wide one, a profile's, and a
 * cube's.
 *
 * These shipped broken. `cubeCoverImageSql` referenced `${cubes.id}`, which
 * Drizzle renders *unqualified* when the outer query has no join — so inside
 * the subquery Postgres bound it to `cards.id` (text) instead of `cubes.id`
 * (uuid) and every cube preview 500'd. It went unnoticed because the cube
 * *lists* use the same fragment through a query that joins `users`, where
 * Drizzle qualifies the column and the SQL is correct. Only the previews were
 * broken, and nothing looked at them.
 *
 * So this asserts on the bytes a scraper would receive, per route, rather than
 * on any helper in isolation — and it covers a cube **with** a cover set and
 * one without, because those take different branches of that same fragment.
 *
 * A private cube must render the generic card rather than leak its name, so
 * that is checked too.
 *
 * Prerequisite: npm run dev. Creates a throwaway account and deletes it again.
 *
 *   npm run check:share-previews
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { addCubeCard, createCube, setCubeCover } from "../src/db/queries/cubes";
import { claimUsername } from "../src/db/queries/users";

const APP = process.env.APP_URL ?? "http://localhost:3000";

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

const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });
const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

/** A PNG starts with this signature; anything else means we got an error page. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function preview(label: string, path: string, opts: { minBytes: number }) {
  let res: Response;
  try {
    res = await fetch(`${APP}${path}`);
  } catch (error) {
    failures.push(`${label}: request failed — ${(error as Error).message}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());

  expect(res.status === 200, `${label}: expected HTTP 200, got ${res.status}`);
  expect(
    (res.headers.get("content-type") ?? "").startsWith("image/png"),
    `${label}: expected image/png, got ${res.headers.get("content-type")}`,
  );
  expect(
    buf.subarray(0, 4).equals(PNG_MAGIC),
    `${label}: body is not a PNG (first bytes ${buf.subarray(0, 8).toString("hex")})`,
  );
  // A render that lost its art or its text still returns a valid PNG, just a
  // much smaller one, so size is the cheap proxy for "something is on it".
  expect(
    buf.length >= opts.minBytes,
    `${label}: only ${buf.length} bytes, expected at least ${opts.minBytes}`,
  );
  console.log(`  ${label.padEnd(34)} ${res.status} ${(buf.length / 1024).toFixed(0)}KB`);
  return buf;
}

const created: string[] = [];

try {
  const email = `preview-${Date.now()}@cubebound.test`;
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
  created.push(row.id);
  const username = `prev${Date.now() % 1000000}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(claimed.error);

  const [unit] = await sql<{ id: string }[]>`
    select id from cards where type = 'Unit' and base_id = id order by id limit 1`;

  const withCover = await createCube({
    ownerId: row.id,
    name: "Preview Cube With Cover",
    description: "Art chosen deliberately.",
    visibility: "public",
  });
  await addCubeCard(withCover.id, unit.id, "main");
  await setCubeCover(withCover.id, unit.id);

  const noCover = await createCube({
    ownerId: row.id,
    name: "Preview Cube Falling Back",
    description: "No cover set; the fallback picks a card.",
    visibility: "public",
  });
  await addCubeCard(noCover.id, unit.id, "main");

  const secret = await createCube({
    ownerId: row.id,
    name: "Preview Private Cube",
    description: "Must not appear in a preview.",
    visibility: "private",
  });
  await addCubeCard(secret.id, unit.id, "main");

  console.log("share previews:");
  await preview("site", "/opengraph-image", { minBytes: 10_000 });
  await preview(`profile /u/${username}`, `/u/${username}/opengraph-image`, {
    minBytes: 10_000,
  });

  // Both branches of the cover fragment. An explicit cover reads
  // `cubes.cover_card_id`; the fallback runs the correlated subquery over
  // cube_cards — the branch that was broken.
  const covered = await preview(
    "cube (cover set)",
    `/cube/${username}/${withCover.slug}/opengraph-image`,
    { minBytes: 40_000 },
  );
  const fallback = await preview(
    "cube (cover falls back)",
    `/cube/${username}/${noCover.slug}/opengraph-image`,
    { minBytes: 40_000 },
  );
  // Same card either way, so the two should be near-identical in size. A
  // fallback that silently produced no art would be far smaller.
  if (covered && fallback) {
    expect(
      Math.abs(covered.length - fallback.length) < covered.length * 0.25,
      `the fallback preview (${fallback.length}B) should carry art like the explicit ` +
        `one (${covered.length}B) — a large gap means the art is missing`,
    );
  }

  // A private cube renders the generic card: no session reaches a scraper, so
  // its name must not be on the image. Smaller than a real one by construction.
  const priv = await preview(
    "cube (private → generic)",
    `/cube/${username}/${secret.slug}/opengraph-image`,
    { minBytes: 5_000 },
  );
  if (priv && covered) {
    expect(
      priv.length < covered.length / 2,
      `a private cube's preview (${priv.length}B) should be the generic card, not a ` +
        `rendered cube (${covered.length}B)`,
    );
  }

  // The page has to point at the image, absolutely, or none of the above is
  // ever fetched by a scraper.
  const html = await (await fetch(`${APP}/cube/${username}/${withCover.slug}`)).text();
  const tag = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
  expect(Boolean(tag), "the cube page should carry an og:image tag");
  expect(
    Boolean(tag && /^https?:\/\//.test(tag)),
    `og:image must be absolute — scrapers do not resolve relative URLs (got ${tag})`,
  );
  expect(
    Boolean(tag?.includes(`/cube/${username}/${withCover.slug}/opengraph-image`)),
    `og:image should point at this cube's own preview (got ${tag})`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  for (const id of created) await sql`delete from auth.users where id = ${id}::uuid`;
  await sql.end();
}

if (failures.length > 0) {
  console.error(`share preview check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("share preview check passed");
}
process.exit(failures.length > 0 ? 1 : 0);
