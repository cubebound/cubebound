/**
 * Moves every cube off the retired promo printings (OPP, PR, JDG).
 *
 * One-off, October 2026. Riot's gallery feed became the only card source and it
 * carries no promo sets, so the site stopped offering them (`RETIRED_SETS` in
 * src/lib/card-ids.ts). Every promo is an alternate printing of a card a main
 * set carries, and 55 production cubes held one (54 an OPP one), almost all because the site
 * had handed it out as the card's canonical printing. This puts each cube on
 * the same card's offered printing instead, keeping the art where an offered
 * printing has it (`retiredPrintingTargets`).
 *
 *   npm run retire-promos                report what would change; write nothing
 *   npm run retire-promos -- --apply     write it
 *
 * **Report-only unless `--apply`**, the reverse of the sync's `--dry-run`,
 * because this writes into people's cubes. It reads `DATABASE_URL` the way the
 * sync does (.env.local, so dev, unless the variable is already set in the
 * shell for this one run) and prints which project it is pointed at, never
 * the credentials.
 *
 * What `--apply` does, in one transaction:
 *   - locks `cube_cards` against writes (reads continue) for its few seconds,
 *   - refuses unless the sync has already made no promo canonical,
 *   - moves every promo `cube_cards` row, in every section, onto its target,
 *     merging quantities where the cube already holds the target there,
 *   - points any promo cover at its target,
 *   - writes one `printing_switched` change per cube, section and promo, with
 *     no actor, all sharing one timestamp so a reversal can find them,
 *   - verifies before committing: no promo left in any cube or cover, and every
 *     cube's copy count unchanged. Anything else rolls the whole run back.
 * It leaves `cubes.updated_at` alone: bumping it would push every touched cube
 * to the top of the recency lists for a change its owner did not make.
 *
 * Drafts are not touched. They hold card ids in `drafts.packs` and replay
 * against live rows, which is why the promo rows themselves stay in `cards`.
 *
 * Writes a journal of every row it replaced next to where it runs
 * (`retire-promos-<host>-<time>.json`, gitignored) so a run can be reversed
 * exactly. Running it again finds nothing to do.
 */

import { writeFileSync } from "node:fs";

import { config } from "dotenv";
import postgres from "postgres";

import { databaseLabel } from "./lib/database-label";
import {
  isRetiredPrinting,
  RETIRED_SETS,
  retiredPrintingTargets,
} from "../src/lib/card-ids";

config({ path: ".env.local" });
config();

/** The cube editor's own ceiling on copies of one printing (`MAX_CARD_QUANTITY`). */
const MAX_QUANTITY = 99;
const apply = process.argv.includes("--apply");

type CardRow = {
  id: string;
  name: string;
  type: string;
  setCode: string;
  collectorNo: string;
  rarity: string;
  supertype: string | null;
  imageFull: string | null;
  baseId: string;
};
type CubeCardRow = { cubeId: string; cardId: string; section: string; quantity: number };

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing required environment variable: DATABASE_URL");
    process.exit(1);
  }
  const host = databaseLabel(databaseUrl);
  console.log(`Database: ${host}${apply ? "" : "  (report only; pass --apply to write)"}`);

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const pool = await sql<CardRow[]>`
      select id, name, type, set_code as "setCode", collector_no as "collectorNo", rarity,
             supertype, image_full as "imageFull", base_id as "baseId"
        from cards`;
    const byId = new Map(pool.map((c) => [c.id, c]));

    // The sync must run first: its base_id recompute is what stops a promo
    // being canonical, and the new code hides promos assuming it has.
    const promoCanonical = pool.filter(
      (c) => !isRetiredPrinting(c) && isRetiredPrinting(byId.get(c.baseId) ?? c),
    );
    if (promoCanonical.length > 0) {
      throw new Error(
        `${promoCanonical.length} offered card(s) still have a promo as their base printing ` +
          `(e.g. ${promoCanonical[0].id} -> ${promoCanonical[0].baseId}). Run sync-cards with the ` +
          `retired-sets code first.`,
      );
    }

    const targets = retiredPrintingTargets(pool);
    const plan = await planMoves(sql, targets);
    report(plan, byId, targets);
    if (!apply || plan.rows.length + plan.covers.length === 0) return;

    const stamp = new Date();
    const journal = `retire-promos-${host.replace(/[^a-z0-9]+/gi, "-")}-${stamp.toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(
      journal,
      JSON.stringify(
        { host, at: stamp, promoRows: plan.rows, mergedInto: plan.existing, covers: plan.covers },
        null,
        1,
      ),
    );
    console.log(`\nJournal written: ${journal}`);

    await sql.begin(async (tx) => {
      await tx`lock table cube_cards in share row exclusive mode`;
      // Re-plan under the lock, so nothing added since the report is missed.
      const locked = await planMoves(tx, targets);
      const before = await copiesPerCube(tx);

      for (const move of locked.moves) {
        await tx`
          insert into cube_cards (cube_id, card_id, section, quantity)
          values (${move.cubeId}, ${move.targetId}, ${move.section}, ${Math.min(MAX_QUANTITY, move.quantity)})
          on conflict (cube_id, card_id, section)
          do update set quantity = least(${MAX_QUANTITY}, cube_cards.quantity + excluded.quantity)`;
      }
      await tx`delete from cube_cards where card_id in (select id from cards where set_code in ${tx([...RETIRED_SETS])})`;
      for (const cover of locked.covers) {
        await tx`update cubes set cover_card_id = ${cover.targetId} where id = ${cover.cubeId}`;
      }
      for (const row of locked.rows) {
        const target = byId.get(targets.get(row.cardId)!.id)!;
        await tx`
          insert into cube_changes (cube_id, actor_id, actor_username, kind, card_id, card_name,
                                    quantity, to_section, from_value, to_value, created_at)
          values (${row.cubeId}, null, null, 'printing_switched', ${target.id}, ${target.name},
                  ${row.quantity}, ${row.section}, ${row.cardId}, ${target.id}, ${stamp})`;
      }

      const [left] = await tx<{ rows: number; covers: number }[]>`
        select (select count(*)::int from cube_cards cc join cards c on c.id = cc.card_id
                 where c.set_code in ${tx([...RETIRED_SETS])}) as rows,
               (select count(*)::int from cubes cu join cards c on c.id = cu.cover_card_id
                 where c.set_code in ${tx([...RETIRED_SETS])}) as covers`;
      if (left.rows > 0 || left.covers > 0) {
        throw new Error(`verification failed: ${left.rows} promo row(s) and ${left.covers} cover(s) remain`);
      }
      const after = await copiesPerCube(tx);
      const capped = locked.overflow;
      for (const [cubeId, copies] of before) {
        const expected = copies - (capped.get(cubeId) ?? 0);
        if ((after.get(cubeId) ?? 0) !== expected) {
          throw new Error(`verification failed: cube ${cubeId} had ${copies} copies, now ${after.get(cubeId) ?? 0}`);
        }
      }
      console.log(
        `\nApplied: ${locked.rows.length} row(s) moved, ${locked.covers.length} cover(s), ` +
          `${locked.rows.length} change-log entr${locked.rows.length === 1 ? "y" : "ies"} at ${stamp.toISOString()}.`,
      );
    });
  } finally {
    await sql.end();
  }
}

type Plan = Awaited<ReturnType<typeof planMoves>>;

/** What a run would do, read without writing. */
async function planMoves(sql: postgres.Sql | postgres.TransactionSql, targets: Map<string, CardRow>) {
  const rows = await sql<CubeCardRow[]>`
    select cc.cube_id as "cubeId", cc.card_id as "cardId", cc.section::text as section, cc.quantity
      from cube_cards cc join cards c on c.id = cc.card_id
     where c.set_code in ${sql([...RETIRED_SETS])}
     order by cc.cube_id, cc.section, cc.card_id`;
  const covers = (
    await sql<{ cubeId: string; cardId: string }[]>`
      select cu.id as "cubeId", cu.cover_card_id as "cardId"
        from cubes cu join cards c on c.id = cu.cover_card_id
       where c.set_code in ${sql([...RETIRED_SETS])}`
  ).map((cover) => ({ ...cover, targetId: targets.get(cover.cardId)?.id }));

  const untargeted = [...new Set([...rows, ...covers].map((r) => r.cardId))].filter((id) => !targets.has(id));
  if (untargeted.length > 0) {
    throw new Error(`no offered printing to move to for: ${untargeted.join(", ")}`);
  }

  // One upsert can't touch a row twice, so aggregate by destination first.
  const moveMap = new Map<string, { cubeId: string; section: string; targetId: string; quantity: number }>();
  for (const row of rows) {
    const targetId = targets.get(row.cardId)!.id;
    const key = `${row.cubeId}|${row.section}|${targetId}`;
    const move = moveMap.get(key) ?? { cubeId: row.cubeId, section: row.section, targetId, quantity: 0 };
    move.quantity += row.quantity;
    moveMap.set(key, move);
  }
  const moves = [...moveMap.values()];

  const existing =
    moves.length === 0
      ? []
      : await sql<CubeCardRow[]>`
          select cube_id as "cubeId", card_id as "cardId", section::text as section, quantity
            from cube_cards
           where (cube_id::text || '|' || section::text || '|' || card_id) in ${sql([...moveMap.keys()])}`;
  const overflow = new Map<string, number>();
  for (const held of existing) {
    const move = moveMap.get(`${held.cubeId}|${held.section}|${held.cardId}`)!;
    const lost = Math.max(0, held.quantity + move.quantity - MAX_QUANTITY);
    if (lost > 0) overflow.set(held.cubeId, (overflow.get(held.cubeId) ?? 0) + lost);
  }
  for (const move of moves) {
    if (existing.some((h) => h.cubeId === move.cubeId && h.section === move.section && h.cardId === move.targetId)) continue;
    const lost = Math.max(0, move.quantity - MAX_QUANTITY);
    if (lost > 0) overflow.set(move.cubeId, (overflow.get(move.cubeId) ?? 0) + lost);
  }
  return { rows, covers: covers as { cubeId: string; cardId: string; targetId: string }[], moves, existing, overflow };
}

async function copiesPerCube(sql: postgres.TransactionSql): Promise<Map<string, number>> {
  const rows = await sql<{ cubeId: string; copies: number }[]>`
    select cube_id as "cubeId", sum(quantity)::int as copies from cube_cards group by cube_id`;
  return new Map(rows.map((r) => [r.cubeId, r.copies]));
}

function report(plan: Plan, byId: Map<string, CardRow>, targets: Map<string, CardRow>) {
  const { rows, covers, existing, overflow } = plan;
  const copies = rows.reduce((sum, r) => sum + r.quantity, 0);
  const cubes = new Set(rows.map((r) => r.cubeId));
  const capped = [...overflow.values()].reduce((a, b) => a + b, 0);
  console.log(
    `\n${rows.length} promo cube row(s), ${copies} cop(ies), in ${cubes.size} cube(s); ` +
      `${covers.length} promo cover(s); ${existing.length} row(s) merge into a printing the cube already holds; ` +
      `${capped} cop(ies) over the ${MAX_QUANTITY} cap.`,
  );
  if (rows.length === 0 && covers.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const bySection = new Map<string, number>();
  for (const row of rows) bySection.set(row.section, (bySection.get(row.section) ?? 0) + 1);
  console.log(`By section: ${[...bySection].map(([s, n]) => `${s} ${n}`).join(", ")}`);

  const perCard = new Map<string, { rows: number; copies: number; cubes: Set<string> }>();
  for (const row of rows) {
    const entry = perCard.get(row.cardId) ?? { rows: 0, copies: 0, cubes: new Set<string>() };
    entry.rows += 1;
    entry.copies += row.quantity;
    entry.cubes.add(row.cubeId);
    perCard.set(row.cardId, entry);
  }
  const art = (url: string | null) => (url ?? "").split("?")[0];
  let artChanges = 0;
  console.log("\nPromo -> target (rows / copies / cubes)   * = the art changes");
  for (const [cardId, entry] of [...perCard].sort((a, b) => b[1].cubes.size - a[1].cubes.size)) {
    const promo = byId.get(cardId)!;
    const target = targets.get(cardId)!;
    const changes = art(promo.imageFull) !== art(target.imageFull);
    if (changes) artChanges += entry.rows;
    console.log(
      `  ${cardId.padEnd(10)} ${promo.name.padEnd(38)} -> ${target.id.padEnd(12)} ` +
        `${entry.rows}/${entry.copies}/${entry.cubes.size}${changes ? " *" : ""}`,
    );
  }
  for (const cover of covers) console.log(`  cover of cube ${cover.cubeId}: ${cover.cardId} -> ${cover.targetId}`);
  console.log(`\nRows whose art changes: ${artChanges}.`);
}

main().catch((err) => {
  console.error("Retire promos failed:", err);
  process.exit(1);
});
