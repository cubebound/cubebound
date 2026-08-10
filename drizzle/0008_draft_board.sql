CREATE TYPE "public"."draft_board" AS ENUM('main', 'side');--> statement-breakpoint

-- Add nullable, backfill, then constrain: a plain NOT NULL ADD COLUMN fails
-- against a populated table (see CLAUDE.md).
ALTER TABLE "draft_picks" ADD COLUMN "board" "draft_board";--> statement-breakpoint
UPDATE "draft_picks" SET "board" = 'main' WHERE "board" IS NULL;--> statement-breakpoint
ALTER TABLE "draft_picks" ALTER COLUMN "board" SET DEFAULT 'main';--> statement-breakpoint
ALTER TABLE "draft_picks" ALTER COLUMN "board" SET NOT NULL;
