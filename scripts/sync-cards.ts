/**
 * Syncs all Riftbound cards into the `cards` table from a pluggable source.
 *
 * Sources (scripts/card-sources/) return cards already normalized to our row
 * shape; this entry point owns the idempotent diffing, chunked upserts, and
 * per-set reporting regardless of source:
 *   - riftscribe (default) — RiftScribe open API, no auth.
 *   - riot (dormant)       — riftbound-content-v1; 403s on dev keys until our
 *                            API application is approved. CARD_SOURCE=riot.
 *
 * Idempotent: diffs by card id against the stored raw payload (`data` jsonb,
 * which carries a `source` field per row) and only writes new/changed cards.
 */

import { config } from "dotenv";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { cards } from "../src/db/schema";
import { createRiftScribeSource } from "./card-sources/riftscribe";
import { createRiotSource } from "./card-sources/riot";
import type { CardSource } from "./card-sources/types";

config({ path: ".env.local" });
config();

const SOURCES: Record<string, () => CardSource> = {
  riftscribe: createRiftScribeSource,
  riot: createRiotSource,
};

function pickSource(): CardSource {
  const name = process.env.CARD_SOURCE ?? "riftscribe";
  const factory = SOURCES[name];
  if (!factory) {
    console.error(
      `Unknown CARD_SOURCE "${name}"; expected one of: ${Object.keys(SOURCES).join(", ")}`,
    );
    process.exit(1);
  }
  return factory();
}

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

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing required environment variable: DATABASE_URL");
    process.exit(1);
  }

  const source = pickSource();
  console.log(`Card source: ${source.name}`);

  const client = postgres(databaseUrl, { prepare: false });
  const db = drizzle(client);

  try {
    const syncedAt = new Date();
    const { cards: rows, setNames } = await source.fetchCards(syncedAt);

    const perSet = new Map<string, number>();
    for (const row of rows) {
      const name = setNames?.get(row.setCode);
      const label = name ? `${row.setCode} (${name})` : row.setCode;
      perSet.set(label, (perSet.get(label) ?? 0) + 1);
    }

    // Diff against stored raw payloads so re-runs are cheap no-ops.
    const ids = rows.map((r) => r.id);
    const existing =
      ids.length > 0
        ? await db.select({ id: cards.id, data: cards.data }).from(cards).where(inArray(cards.id, ids))
        : [];
    const existingById = new Map(existing.map((r) => [r.id, stableStringify(r.data)]));

    const toWrite = rows.filter(
      (r) => existingById.get(r.id) !== stableStringify(r.data),
    );
    const inserted = toWrite.filter((r) => !existingById.has(r.id)).length;
    const updated = toWrite.length - inserted;
    const unchanged = rows.length - toWrite.length;

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
    // Mirrors assignBaseIds() in src/lib/card-ids.ts.
    const rebased = await db.execute(sql`
      update cards as c
      set base_id = r.canonical
      from (
        select id,
               first_value(id) over (
                 partition by lower(name), type
                 order by (rarity = 'Showcase'), set_code,
                          length(collector_no), collector_no, id
               ) as canonical
        from cards
      ) as r
      where r.id = c.id and c.base_id is distinct from r.canonical`);
    const rebasedCount = (rebased as { count?: number }).count ?? 0;
    if (rebasedCount > 0) {
      console.log(`Re-pointed ${rebasedCount} row(s) at a different canonical printing.`);
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
