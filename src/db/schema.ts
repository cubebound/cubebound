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

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type User = typeof users.$inferSelect;
export type Cube = typeof cubes.$inferSelect;
export type CubeCard = typeof cubeCards.$inferSelect;
