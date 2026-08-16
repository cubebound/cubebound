-- Moderation, owner-only for now.
--
-- Suspend and hide are the primary verbs and both are reversible; delete is
-- gated behind them because there is no point-in-time recovery on this plan,
-- so a wrong delete is unrecoverable. `moderation_log` keeps a snapshot of
-- whatever was acted on, which is the only record that survives a delete.

-- `is_admin` carries a default, so this is not the `ADD COLUMN NOT NULL`
-- rewrite the conventions warn about — every existing row gets false.
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "cubes" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cubes" ADD COLUMN "hidden_reason" text;--> statement-breakpoint

-- Partial: nearly every row is null, and the only question ever asked is
-- "which cubes are hidden".
CREATE INDEX "cubes_hidden_at_idx" ON "cubes" USING btree ("hidden_at") WHERE "hidden_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_suspended_at_idx" ON "users" USING btree ("suspended_at") WHERE "suspended_at" IS NOT NULL;--> statement-breakpoint

CREATE TABLE "moderation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	-- Set null rather than cascade: the log must outlive the moderator, or
	-- deleting an account would erase the record of what it did.
	"actor_id" uuid,
	-- Denormalised for the same reason, on both sides.
	"actor_username" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	-- Deliberately NOT a foreign key: the whole point is to survive the target
	-- being deleted.
	"target_id" uuid NOT NULL,
	"target_label" text NOT NULL,
	"reason" text,
	-- What was there before the action, so a delete leaves something to read.
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_log_created_at_idx" ON "moderation_log" USING btree ("created_at" DESC);--> statement-breakpoint

-- Supabase auto-exposes public tables over PostgREST and grants anon full DML,
-- so every new table gets RLS with no policies. The app reads through Drizzle
-- as the table owner, which bypasses RLS. See CLAUDE.md.
ALTER TABLE "moderation_log" ENABLE ROW LEVEL SECURITY;
