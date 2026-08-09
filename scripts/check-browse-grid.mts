/**
 * Guards what a tile in the cube editor's browse grid stands for.
 *
 * The grid runs in two modes and they mean different things:
 *   grouped (default) — a tile is a CARD. It shows whichever printing the cube
 *     holds, so an alt-art copy doesn't make the tile look empty, and counts
 *     every copy of every printing.
 *   ?printings=all    — a tile is a PRINTING. It must show itself. Substituting
 *     the held printing here rendered the same art twice and hid the base
 *     printing, which is the regression this check exists for.
 *
 * Prerequisite: npm run dev. Creates a throwaway account and deletes it again.
 * Reads the server-rendered HTML, so it needs no browser.
 *
 *   npm run check:browse-grid
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { addCubeCard, createCube } from "../src/db/queries/cubes";
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

const projectUrl = new URL(fromEnvFile("NEXT_PUBLIC_SUPABASE_URL"));
const projectRef = projectUrl.host.split(".")[0];
const publishable = fromEnvFile("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const sql = postgres(fromEnvFile("DATABASE_URL"), { prepare: false });

const failures: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

/**
 * How many tiles render a printing's own image.
 *
 * Matches the `src` attribute specifically: the same URL also appears in the
 * RSC payload Next embeds for hydration (escaped, inside `self.__next_f`) and
 * can appear in a preload `<link href=…>`, so a plain substring count reports
 * two or three hits per tile.
 */
function countImage(html: string, thumbUrl: string | null): number {
  if (!thumbUrl) return 0;
  return html.split(`src="${thumbUrl}"`).length - 1;
}

let userId: string | undefined;

try {
  // A card with several printings, plus a second card sharing the search term,
  // so the grouped and ungrouped counts differ meaningfully.
  const [group] = await sql<{ base_id: string; printings: number }[]>`
    select base_id, count(*)::int as printings
    from cards group by base_id having count(*) > 1
    order by count(*) desc, base_id limit 1`;
  const printings = await sql<
    { id: string; base_id: string; name: string; image_thumb: string | null }[]
  >`select id, base_id, name, image_thumb from cards
    where base_id = ${group.base_id} order by (id = base_id) desc, id`;
  const cardName = printings[0].name;
  const alt = printings.find((p) => p.id !== p.base_id)!;

  // Every printing of every card sharing this name, since the grid searches by
  // name and will return them all.
  const sameName = await sql<
    { id: string; base_id: string; image_thumb: string | null }[]
  >`select id, base_id, image_thumb from cards where name = ${cardName}`;
  const distinctBases = new Set(sameName.map((p) => p.base_id));

  const email = `browse-${Date.now()}@cubebound.test`;
  const password = `Pw-${Math.random().toString(36).slice(2)}`;
  const [row] = await sql`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      ${email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
      '', '', '', '', '', '', '', ''
    ) returning id`;
  userId = row.id;

  const username = `browse${Date.now() % 1000000}`;
  const claimed = await claimUsername(row.id, username);
  if (!claimed.ok) throw new Error(claimed.error);

  const cube = await createCube({
    ownerId: row.id,
    name: "Browse Grid Cube",
    description: null,
    visibility: "private",
  });
  // Hold ONLY the alt printing — the case that used to render wrong.
  await addCubeCard(cube.id, alt.id, "main");

  const res = await fetch(`${projectUrl.origin}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(`token grant failed: ${JSON.stringify(session)}`);
  const cookie =
    `sb-${projectRef}-auth-token=base64-` +
    Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user,
        token_type: session.token_type,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
      }),
      "utf8",
    ).toString("base64url");

  const base = `/cube/${username}/${cube.slug}/edit?mode=browse&q=${encodeURIComponent(cardName)}`;
  const load = async (path: string) => {
    const response = await fetch(`${APP}${path}`, { headers: { cookie } });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.text();
  };

  // ---- grouped: one tile per card, showing the printing that is held --------
  const grouped = await load(base);
  const heldInGrouped = countImage(grouped, alt.image_thumb);
  expect(heldInGrouped === 1, `grouped: the held printing should appear once, saw ${heldInGrouped}`);
  for (const printing of sameName) {
    if (printing.id === alt.id) continue;
    if (printing.base_id === alt.base_id) {
      const seen = countImage(grouped, printing.image_thumb);
      expect(
        seen === 0,
        `grouped: ${printing.id} should be collapsed into the held printing, saw it ${seen} time(s)`,
      );
    }
  }
  const groupedTotal = sameName.reduce(
    (sum, p) => sum + countImage(grouped, p.image_thumb),
    0,
  );
  expect(
    groupedTotal === distinctBases.size,
    `grouped: expected one tile per card (${distinctBases.size}), saw ${groupedTotal} printing images`,
  );

  // ---- all printings: every printing exactly once, as itself ---------------
  const all = await load(`${base}&printings=all`);
  for (const printing of sameName) {
    const seen = countImage(all, printing.image_thumb);
    expect(
      seen === 1,
      `all printings: ${printing.id} should render exactly once as itself, saw ${seen}`,
    );
  }
  const allTotal = sameName.reduce((sum, p) => sum + countImage(all, p.image_thumb), 0);
  expect(
    allTotal === sameName.length,
    `all printings: expected ${sameName.length} printing images, saw ${allTotal}`,
  );

  console.log(
    `browse grid: "${cardName}" — ${distinctBases.size} card(s), ${sameName.length} printing(s), ` +
      `holding ${alt.id}`,
  );
} catch (error) {
  failures.push(`check crashed: ${(error as Error).stack ?? (error as Error).message}`);
} finally {
  if (userId) await sql`delete from auth.users where id = ${userId}::uuid`;
  await sql.end();
}

if (failures.length > 0) {
  console.error(`browse grid check FAILED:\n - ${failures.join("\n - ")}`);
} else {
  console.log("browse grid check passed");
}
// Importing the query layer opens the app's Drizzle pool, which nothing closes.
process.exit(failures.length > 0 ? 1 : 0);
