CREATE TYPE "public"."draft_status" AS ENUM('active', 'complete');--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cube_id" uuid NOT NULL,
	"drafter_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"config" jsonb NOT NULL,
	"packs" jsonb NOT NULL,
	"seats" integer NOT NULL,
	"human_seat" integer DEFAULT 0 NOT NULL,
	"status" "draft_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_picks" (
	"draft_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"pick_number" integer NOT NULL,
	"seat" integer NOT NULL,
	"card_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_picks_draft_id_round_pick_number_seat_pk"
		PRIMARY KEY("draft_id","round","pick_number","seat")
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_cube_id_cubes_id_fk" FOREIGN KEY ("cube_id") REFERENCES "public"."cubes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_drafter_id_users_id_fk" FOREIGN KEY ("drafter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_drafter_id_created_at_idx" ON "drafts" USING btree ("drafter_id","created_at");--> statement-breakpoint

-- Supabase auto-exposes public tables over PostgREST and grants anon full DML,
-- so every new table gets RLS with no policies. The app reads through Drizzle
-- as the table owner, which bypasses RLS. See CLAUDE.md.
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "draft_picks" ENABLE ROW LEVEL SECURITY;
