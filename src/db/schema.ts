import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const cubeVisibilityEnum = pgEnum("cube_visibility", [
  "public",
  "unlisted",
  "private",
]);

export const cubeSectionEnum = pgEnum("cube_section", [
  "main",
  "legends",
  "runes",
  "battlefields",
  "sideboard",
  // Cards being considered but not in the cube. Distinct from the sideboard,
  // which holds cards deliberately taken out; neither counts toward the size.
  "maybeboard",
]);

// Card types are stored as text rather than a pg enum: new sets ship every
// ~3 months and the sync must ingest unknown type values without a migration.
export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(), // e.g. "OGN-001"
    // Id of the base printing: "OGN-100a" and "OGN-301-star" both point at
    // their base card; base printings point at themselves. See src/lib/card-ids.ts.
    baseId: text("base_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(), // e.g. "OGN"
    collectorNo: text("collector_no").notNull(),
    rarity: text("rarity").notNull(),
    type: text("type").notNull(), // Unit, Champion Unit, Spell, Signature Spell, Gear, Rune, Battlefield, Legend
    supertype: text("supertype"),
    domains: text("domains").array().notNull().default([]),
    energyCost: integer("energy_cost"),
    powerCost: jsonb("power_cost").$type<Record<string, number>>(), // per-domain pips, e.g. {"fury": 2}
    might: integer("might"),
    rulesText: text("rules_text"),
    keywords: text("keywords").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    champion: text("champion"),
    artist: text("artist"),
    imageFull: text("image_full"),
    imageThumb: text("image_thumb"),
    data: jsonb("data"), // raw API payload for forward-compat
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("cards_base_id_idx").on(table.baseId)],
);

// Profile row per Supabase auth user; id mirrors auth.users.id.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  username: text("username").notNull().unique(), // url-safe, used in /cube/{username}/{slug}
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cubes = pgTable(
  "cubes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // Long-form markdown write-up, separate from the one-line description.
    // Rendered through src/components/primer.tsx, never as raw HTML.
    primer: text("primer"),
    visibility: cubeVisibilityEnum("visibility").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("cubes_owner_slug_idx").on(table.ownerId, table.slug)],
);

export const cubeCards = pgTable(
  "cube_cards",
  {
    cubeId: uuid("cube_id")
      .notNull()
      .references(() => cubes.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    section: cubeSectionEnum("section").notNull().default("main"),
    quantity: integer("quantity").notNull().default(1),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.cubeId, table.cardId, table.section] }),
  ],
);

export const cubeChangeKindEnum = pgEnum("cube_change_kind", [
  "cube_created",
  "cube_cloned",
  "cards_added",
  "cards_removed",
  "copy_moved",
  "printing_switched",
  "details_edited",
  "primer_edited",
  // A bulk import is one entry, not one per card: a 300-card paste would
  // otherwise bury every other edit in the cube's history.
  "cards_imported",
]);

/**
 * Append-only record of edits to a cube, shown on its change log.
 *
 * Card name and printing id are denormalized on purpose: the log is a history
 * of what happened, and it should still read correctly if a card is later
 * removed from the cube or renamed by a data sync.
 */
export const cubeChanges = pgTable(
  "cube_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cubeId: uuid("cube_id")
      .notNull()
      .references(() => cubes.id, { onDelete: "cascade" }),
    // Kept if the account goes away, so the history doesn't develop holes.
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorUsername: text("actor_username"),
    kind: cubeChangeKindEnum("kind").notNull(),
    cardId: text("card_id"),
    cardName: text("card_name"),
    quantity: integer("quantity"),
    fromSection: cubeSectionEnum("from_section"),
    toSection: cubeSectionEnum("to_section"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cube_changes_cube_id_created_at_idx").on(table.cubeId, table.createdAt)],
);

export type CubeChange = typeof cubeChanges.$inferSelect;
export type NewCubeChange = typeof cubeChanges.$inferInsert;

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type User = typeof users.$inferSelect;
export type Cube = typeof cubes.$inferSelect;
export type CubeCard = typeof cubeCards.$inferSelect;

export const draftStatusEnum = pgEnum("draft_status", ["active", "complete"]);

/** Where a drafted card sits while the pool is being sorted. */
export const draftBoardEnum = pgEnum("draft_board", ["main", "side"]);

/**
 * A solo draft against bots.
 *
 * `config` and `packs` are **snapshots taken when the draft starts**: editing
 * the cube mid-draft must not change the packs already dealt, and a card later
 * removed from the cube has to keep resolving. `packs` holds card ids by
 * round and seat; card details are read from `cards`, which is stable.
 *
 * The seed is what makes the draft reproducible — state is rebuilt by replaying
 * picks through src/lib/draft/engine.ts rather than being stored as a blob, so
 * the engine and the row can never drift apart about whose turn it is.
 */
export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cubeId: uuid("cube_id")
      .notNull()
      .references(() => cubes.id, { onDelete: "cascade" }),
    drafterId: uuid("drafter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seed: text("seed").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    packs: jsonb("packs").$type<string[][][]>().notNull(),
    seats: integer("seats").notNull(),
    humanSeat: integer("human_seat").notNull().default(0),
    status: draftStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("drafts_drafter_id_created_at_idx").on(table.drafterId, table.createdAt)],
);

/**
 * Every pick, human and bot, in the order it happened.
 *
 * Bot picks are derivable from the seed, but storing them makes a finished
 * draft readable without re-running the engine and gives milestone B's smarter
 * bots something to be compared against.
 */
export const draftPicks = pgTable(
  "draft_picks",
  {
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    pickNumber: integer("pick_number").notNull(),
    seat: integer("seat").notNull(),
    cardId: text("card_id").notNull(),
    // Only meaningful for the human seat: bots never sort a pool.
    board: draftBoardEnum("board").notNull().default("main"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.round, table.pickNumber, table.seat] }),
  ],
);

export type Draft = typeof drafts.$inferSelect;
export type DraftPick = typeof draftPicks.$inferSelect;
