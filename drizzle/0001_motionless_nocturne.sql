-- Adds cards.base_id (id of the base printing) and backfills existing rows.
-- Added nullable first: a plain NOT NULL ADD COLUMN fails against a populated table.
ALTER TABLE "cards" ADD COLUMN "base_id" text;--> statement-breakpoint

-- Must stay in step with baseCardId() in src/lib/card-ids.ts:
--   "OGN-100a"     -> "OGN-100"   trailing single letter (alt art)
--   "OGN-301-star" -> "OGN-301"   trailing -word (signature)
--   "OGN-001"      -> "OGN-001"   base printing, unchanged
--   "UNL-T01"      -> "UNL-T01"   token, unchanged -- NOT reduced to "UNL-001",
--                                 which is a different card entirely
UPDATE "cards" SET "base_id" =
  CASE
    WHEN "id" ~ '^[A-Z0-9]+-[0-9]+[a-z]$'   THEN left("id", length("id") - 1)
    WHEN "id" ~ '^[A-Z0-9]+-[0-9]+-[a-z]+$' THEN regexp_replace("id", '-[a-z]+$', '')
    ELSE "id"
  END;--> statement-breakpoint

ALTER TABLE "cards" ALTER COLUMN "base_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_base_id_idx" ON "cards" USING btree ("base_id");
