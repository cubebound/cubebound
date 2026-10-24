/**
 * Syncs all Riftbound cards into the `cards` table.
 *
 * One source, Riot's own card gallery feed (riot-gallery), owns every set
 * (`ownerOf`) except the retired promo sets OPP, PR and JDG, which no source
 * owns: their rows stay in the table, frozen, because drafts reference them,
 * and nothing offers them (`RETIRED_SETS` in src/lib/card-ids.ts). Any row a
 * source returns for a set it does not own is discarded, whichever way the
 * run was started. riot (dormant, the developer API) owns nothing and so
 * writes nothing. The retired riftcodex and riftscribe adapters were deleted
 * on 23 October 2026; they are in git history if a comparison is ever needed.
 *
 *   npm run sync-cards                     write
 *   npm run sync-cards -- --dry-run        fetch, map and report; write nothing
 *   npm run sync-cards -- --force          rewrite every row (after a mapping change)
 *   npm run sync-cards -- --only=riot-gallery   one source (still only its own sets)
 *   npm run sync-cards -- --allow-missing=OGN-171,UNL-224
 *
 * Idempotent: diffs by card id against the stored raw payload (`data` jsonb,
 * which carries a `source` field per row) and only writes new/changed cards.
 * Never deletes. Refuses to write if a stored card is missing from the source
 * that owns its set (`checkFloor`), which is how a dropped page of results
 * would otherwise go unnoticed.
 */

import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { cards, type NewCard } from "../src/db/schema";
import {
  assignBaseIds,
  collapseIdentityKey,
  isTokenCard,
  RETIRED_SETS,
} from "../src/lib/card-ids";
import { cardPagePath } from "../src/lib/card-popularity";
import { databaseLabel } from "./lib/database-label";
import { createRiotSource } from "./card-sources/riot";
import { createRiotGallerySource } from "./card-sources/riot-gallery";
import type { CardSource } from "./card-sources/types";

config({ path: ".env.local" });
config();

const SOURCES: Record<string, () => CardSource> = {
  "riot-gallery": createRiotGallerySource,
  riot: createRiotSource,
};
const DEFAULT_SOURCES = ["riot-gallery"];

/**
 * Which source a set's rows come from: Riot's gallery for everything, so a new
 * set lands with no code change, and nobody for the retired promo sets. A
 * promo row arriving from any source is discarded and logged rather than
 * refused, so a promo appearing in Riot's feed one day cannot block a sync.
 */
function ownerOf(setCode: string): string | null {
  return RETIRED_SETS.includes(setCode.toUpperCase()) ? null : "riot-gallery";
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

/**
 * Rewrite every row instead of only payload-changed ones. Needed whenever an
 * adapter's mapping changes, since the raw payload alone cannot reveal that.
 */
const force = flag("force");
const dryRun = flag("dry-run");
const only = option("only");
const allowMissing = new Set(
  (option("allow-missing") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

/** JSON.stringify with sorted keys, so jsonb round-trips compare stably. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

interface SourceRun {
  source: string;
  rows: NewCard[];
  delivered: Set<string>;
  setNames?: Map<string, string>;
}

/** Fetch every source first: if any fails, nothing has been written. */
async function fetchAll(names: string[], syncedAt: Date): Promise<SourceRun[]> {
  return Promise.all(
    names.map(async (name) => {
      const result = await SOURCES[name]().fetchCards(syncedAt);
      const owned = result.cards.filter((row) => ownerOf(row.setCode) === name);
      const dropped = result.cards.length - owned.length;
      console.log(
        `${name}: ${owned.length} card(s) in its own sets` +
          (dropped > 0 ? `; ${dropped} in sets it does not own discarded` : ""),
      );
      return {
        source: name,
        rows: owned,
        delivered: result.deliveredIds ?? new Set(result.cards.map((r) => r.id)),
        setNames: result.setNames,
      };
    }),
  );
}

type StoredRow = {
  id: string;
  base_id: string;
  name: string;
  set_code: string;
  collector_no: string;
  rarity: string;
  type: string;
  supertype: string | null;
  champion: string | null;
  domains: string[];
  energy_cost: number | null;
  power_cost: Record<string, number> | null;
  might: number | null;
  rules_text: string | null;
  tags: string[];
  artist: string | null;
  image_full: string | null;
  data: unknown;
};

/**
 * Every stored card in a set a source owns must still be in what that source
 * delivered. The sync never deletes, so a card that silently stopped arriving
 * would just stop updating; this turns it into a refusal instead. It is the
 * guard against Riot's feed paging wrong (see riot-gallery.ts), which dropped a
 * different card or two on each run.
 */
function checkFloor(runs: SourceRun[], stored: StoredRow[]): string[] {
  const missing: string[] = [];
  for (const run of runs) {
    for (const row of stored) {
      if (ownerOf(row.set_code) !== run.source) continue;
      if (run.delivered.has(row.id) || allowMissing.has(row.id)) continue;
      missing.push(`${row.id} "${row.name}" (${run.source})`);
    }
  }
  return missing;
}

const pick = (row: NewCard) => ({
  name: row.name,
  set_code: row.setCode,
  collector_no: row.collectorNo,
  rarity: row.rarity,
  type: row.type,
  supertype: row.supertype ?? null,
  champion: row.champion ?? null,
  domains: row.domains ?? [],
  energy_cost: row.energyCost ?? null,
  power_cost: row.powerCost ?? null,
  might: row.might ?? null,
  rules_text: row.rulesText ?? null,
  tags: row.tags ?? [],
  artist: row.artist ?? null,
  image_full: row.imageFull ?? null,
});

/** Fields listed in full in a dry run: the ones grouping, URLs and drafts read. */
const LISTED = ["name", "champion", "type", "supertype", "rarity", "collector_no", "set_code", "domains"] as const;
/** Fields counted with a few examples. */
const COUNTED = ["rules_text", "might", "energy_cost", "power_cost", "tags", "artist", "image_full"] as const;

/**
 * What a write would change, against the stored columns rather than the stored
 * payload: after a source switch every payload differs, so only the columns say
 * what a visitor would see change. Writes nothing; its one extra query is a
 * read of who references the changed cards.
 */
async function reportDryRun(
  client: postgres.Sql,
  incoming: NewCard[],
  stored: StoredRow[],
) {
  const storedById = new Map(stored.map((r) => [r.id, r]));
  const show = (v: unknown) => JSON.stringify(v);
  const listed: string[] = [];
  const counted = new Map<string, string[]>();
  const added: NewCard[] = [];
  const changedIds = new Set<string>();
  const domainChanged = new Set<string>();

  for (const row of incoming) {
    const before = storedById.get(row.id);
    if (!before) {
      added.push(row);
      continue;
    }
    const after = pick(row);
    for (const field of LISTED) {
      if (show(before[field]) !== show(after[field])) {
        listed.push(`  ${row.id} ${field}: ${show(before[field])} -> ${show(after[field])}`);
        changedIds.add(row.id);
        if (field === "domains") domainChanged.add(row.id);
      }
    }
    for (const field of COUNTED) {
      if (show(before[field]) !== show(after[field])) {
        const list = counted.get(field) ?? counted.set(field, []).get(field)!;
        list.push(`${row.id}: ${show(before[field])?.slice(0, 70)} -> ${show(after[field])?.slice(0, 70)}`);
      }
    }
  }

  console.log(`\n== Dry run: ${incoming.length} incoming, ${added.length} new, nothing written ==`);
  const addedBySet = new Map<string, number>();
  for (const row of added) addedBySet.set(row.setCode, (addedBySet.get(row.setCode) ?? 0) + 1);
  console.log(`New cards by set: ${[...addedBySet].map(([s, n]) => `${s} ${n}`).join(", ") || "none"}`);
  if (added.length <= 40) for (const row of added) console.log(`  + ${row.id} ${row.name}`);

  console.log(`\nChanged identity fields (${listed.length}):`);
  for (const line of listed) console.log(line);
  console.log("\nOther changed fields:");
  for (const field of COUNTED) {
    const list = counted.get(field) ?? [];
    console.log(`  ${field}: ${list.length}`);
    for (const line of list.slice(0, 3)) console.log(`      ${line}`);
  }

  // base_id as the post-sync recompute would set it, over the pool as it will be.
  const pool = new Map<string, { id: string; name: string; type: string; setCode: string; collectorNo: string; rarity: string; champion: string | null; supertype: string | null }>();
  for (const r of stored) {
    pool.set(r.id, { id: r.id, name: r.name, type: r.type, setCode: r.set_code, collectorNo: r.collector_no, rarity: r.rarity, champion: r.champion, supertype: r.supertype });
  }
  for (const r of incoming) {
    pool.set(r.id, { id: r.id, name: r.name, type: r.type, setCode: r.setCode, collectorNo: r.collectorNo, rarity: r.rarity, champion: r.champion ?? null, supertype: r.supertype ?? null });
  }
  const nextBase = assignBaseIds([...pool.values()]);
  const rebased = stored.filter((r) => nextBase.get(r.id) !== r.base_id);
  console.log(`\nbase_id re-points (${rebased.length}):`);
  for (const r of rebased) {
    console.log(`  ${r.id} "${r.name}": ${r.base_id} -> ${nextBase.get(r.id)}`);
    changedIds.add(r.id);
  }

  // Card page URLs: what moves, and whether the new pool keeps one URL per card.
  const moved: string[] = [];
  for (const r of stored) {
    const after = pool.get(r.id)!;
    if (isTokenCard({ id: r.id, supertype: after.supertype })) continue;
    const a = cardPagePath(r);
    const b = cardPagePath(after);
    if (a !== b) moved.push(`  ${r.id}: ${a} -> ${b}`);
  }
  const claims = new Map<string, Set<string>>();
  for (const card of pool.values()) {
    if (isTokenCard({ id: card.id, supertype: card.supertype })) continue;
    const path = cardPagePath(card);
    // Grouped as the browser collapses cards, so "Blind Monk" and its
    // "(Metal)" printing are one card claiming one URL, as they should.
    (claims.get(path) ?? claims.set(path, new Set()).get(path)!).add(collapseIdentityKey(card));
  }
  const collisions = [...claims].filter(([, keys]) => keys.size > 1);
  console.log(`\nCard page URLs that change (${moved.length}):`);
  for (const line of moved) console.log(line);
  console.log(`Card page URLs claimed by two cards: ${collisions.length}`);
  for (const [path, keys] of collisions) console.log(`  ${path} <- ${[...keys].join(" / ")}`);

  // Drafts replay against live card data and the bots pick by domain, in order
  // (src/lib/draft/bots.ts). A domain change on a card an active draft dealt
  // can make a replayed bot pick differently and break the draft.
  const active = await client<{ id: string }[]>`
    select distinct x.id
      from drafts d,
           jsonb_array_elements(d.packs) r,
           jsonb_array_elements(r) s,
           jsonb_array_elements_text(s) x(id)
     where d.status = 'active'`;
  const inActiveDrafts = new Set(active.map((r) => r.id));
  const atRisk = [...domainChanged].filter((id) => inActiveDrafts.has(id));
  console.log(
    atRisk.length > 0
      ? `\n!! ${atRisk.length} card(s) in an ACTIVE draft change domain: ${atRisk.join(", ")}`
      : `\nNo card in an active draft changes domain.`,
  );

  const ids = [...changedIds];
  if (ids.length > 0) {
    const refs = await client<{ id: string; cubes: number; copies: number; picks: number; covers: number }[]>`
      select c.id,
             (select count(distinct cc.cube_id)::int from cube_cards cc where cc.card_id = c.id) as cubes,
             (select coalesce(sum(cc.quantity), 0)::int from cube_cards cc where cc.card_id = c.id) as copies,
             (select count(*)::int from draft_picks p where p.card_id = c.id) as picks,
             (select count(*)::int from cubes cu where cu.cover_card_id = c.id) as covers
        from cards c
       where c.id in ${client(ids)}`;
    const used = refs.filter((r) => r.cubes + r.picks + r.covers > 0);
    console.log(`\nChanged cards referenced by cubes, picks or covers (${used.length} of ${ids.length}):`);
    for (const r of used.sort((a, b) => b.cubes - a.cubes)) {
      console.log(`  ${r.id}: ${r.cubes} cube(s), ${r.copies} cop(ies), ${r.picks} pick(s), ${r.covers} cover(s)`);
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing required environment variable: DATABASE_URL");
    process.exit(1);
  }
  if (process.env.CARD_SOURCE) {
    console.warn(
      `CARD_SOURCE=${process.env.CARD_SOURCE} is no longer read: each set has one owning source. ` +
        `Use --only=<source> to run a single one.`,
    );
  }
  if (only && !SOURCES[only]) {
    console.error(`Unknown --only "${only}"; expected one of: ${Object.keys(SOURCES).join(", ")}`);
    process.exit(1);
  }
  const names = only ? [only] : DEFAULT_SOURCES;
  console.log(`Database: ${databaseLabel(databaseUrl)}`);
  console.log(`Card sources: ${names.join(", ")}${dryRun ? " (dry run)" : ""}`);

  const client = postgres(databaseUrl, { prepare: false });
  const db = drizzle(client);

  try {
    const syncedAt = new Date();
    const runs = await fetchAll(names, syncedAt);
    const rows = runs.flatMap((run) => run.rows);
    const setNames = new Map(runs.flatMap((run) => [...(run.setNames ?? new Map<string, string>())]));

    const stored = await client<StoredRow[]>`
      select id, base_id, name, set_code, collector_no, rarity, type, supertype, champion,
             domains, energy_cost, power_cost, might, rules_text, tags, artist, image_full, data
        from cards`;

    const missing = checkFloor(runs, stored);
    if (missing.length > 0) {
      console.error(
        `\nRefusing to sync: ${missing.length} stored card(s) are missing from the source that owns their set. ` +
          `If the source really dropped them, re-run with --allow-missing=<ids>.\n  ` +
          missing.join("\n  "),
      );
      process.exitCode = 1;
      return;
    }

    if (dryRun) {
      await reportDryRun(client, rows, stored);
      return;
    }

    const perSet = new Map<string, number>();
    for (const row of rows) {
      const name = setNames.get(row.setCode);
      const label = name ? `${row.setCode} (${name})` : row.setCode;
      perSet.set(label, (perSet.get(label) ?? 0) + 1);
    }

    // Diff against stored raw payloads so re-runs are cheap no-ops.
    //
    // The payload is the wrong signal when the ADAPTER changes: fixing how a
    // field is mapped leaves the raw payload identical, so every row reads as
    // unchanged and the fix never lands. `--force` rewrites every row from the
    // current mapping. Use it after touching a card source.
    const ids = new Set(rows.map((r) => r.id));
    const existingById = new Map(
      stored.filter((r) => ids.has(r.id)).map((r) => [r.id, stableStringify(r.data)]),
    );

    const toWrite = force
      ? rows
      : rows.filter((r) => existingById.get(r.id) !== stableStringify(r.data));
    const inserted = toWrite.filter((r) => !existingById.has(r.id)).length;
    const updated = toWrite.length - inserted;
    const unchanged = rows.length - toWrite.length;

    // A set changing hands shows up once, here, rather than as a wall of
    // "updated" rows nobody can explain.
    const storedSource = new Map(
      stored.map((r) => [r.id, (r.data as { source?: string } | null)?.source ?? "unknown"]),
    );
    const transitions = new Map<string, number>();
    for (const row of toWrite) {
      const from = storedSource.get(row.id);
      const to = (row.data as { source: string }).source;
      if (from && from !== to) {
        const key = `${row.setCode}: ${from} -> ${to}`;
        transitions.set(key, (transitions.get(key) ?? 0) + 1);
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < toWrite.length; i += CHUNK) {
      const chunk = toWrite.slice(i, i + CHUNK);
      await db
        .insert(cards)
        .values(chunk)
        .onConflictDoUpdate({
          target: cards.id,
          set: {
            baseId: sql`excluded.base_id`,
            name: sql`excluded.name`,
            setCode: sql`excluded.set_code`,
            collectorNo: sql`excluded.collector_no`,
            rarity: sql`excluded.rarity`,
            type: sql`excluded.type`,
            supertype: sql`excluded.supertype`,
            domains: sql`excluded.domains`,
            energyCost: sql`excluded.energy_cost`,
            powerCost: sql`excluded.power_cost`,
            might: sql`excluded.might`,
            rulesText: sql`excluded.rules_text`,
            keywords: sql`excluded.keywords`,
            tags: sql`excluded.tags`,
            champion: sql`excluded.champion`,
            artist: sql`excluded.artist`,
            imageFull: sql`excluded.image_full`,
            imageThumb: sql`excluded.image_thumb`,
            data: sql`excluded.data`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    // Reprints can only be resolved with the whole pool in view, and a new set
    // can re-canonicalize rows that were not otherwise touched by this sync —
    // so recompute for every row rather than only the ones just written.
    // Mirrors assignBaseIds() in src/lib/card-ids.ts, retired promos last.
    const rebased = await db.execute(sql`
      update cards as c
      set base_id = r.canonical
      from (
        select id,
               first_value(id) over (
                 partition by lower(name), type
                 order by (set_code in (${sql.join(RETIRED_SETS.map((s) => sql`${s}`), sql`, `)})),
                          (rarity = 'Showcase'), set_code,
                          length(collector_no), collector_no, id
               ) as canonical
        from cards
      ) as r
      where r.id = c.id and c.base_id is distinct from r.canonical`);
    const rebasedCount = (rebased as { count?: number }).count ?? 0;
    if (rebasedCount > 0) {
      console.log(`Re-pointed ${rebasedCount} row(s) at a different canonical printing.`);
    }

    if (transitions.size > 0) {
      console.log("\nSource changes:");
      for (const [key, count] of [...transitions].sort()) console.log(`  ${key}: ${count}`);
    }
    console.log("\nCards per set:");
    for (const [label, count] of [...perSet.entries()].sort()) {
      console.log(`  ${label}: ${count}`);
    }
    console.log(
      `\nTotal ${rows.length} cards — ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
