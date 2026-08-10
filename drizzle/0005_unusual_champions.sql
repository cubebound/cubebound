CREATE TYPE "public"."cube_change_kind" AS ENUM('cube_created', 'cube_cloned', 'cards_added', 'cards_removed', 'copy_moved', 'printing_switched', 'details_edited', 'primer_edited');--> statement-breakpoint
CREATE TABLE "cube_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cube_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_username" text,
	"kind" "cube_change_kind" NOT NULL,
	"card_id" text,
	"card_name" text,
	"quantity" integer,
	"from_section" "cube_section",
	"to_section" "cube_section",
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cube_changes" ADD CONSTRAINT "cube_changes_cube_id_cubes_id_fk" FOREIGN KEY ("cube_id") REFERENCES "public"."cubes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cube_changes" ADD CONSTRAINT "cube_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cube_changes_cube_id_created_at_idx" ON "cube_changes" USING btree ("cube_id","created_at");--> statement-breakpoint
-- Supabase auto-exposes public tables over PostgREST and grants anon full DML,
-- so every new table gets RLS with no policies. The app reads through Drizzle
-- as the table owner, which bypasses RLS. See CLAUDE.md.
ALTER TABLE "cube_changes" ENABLE ROW LEVEL SECURITY;
