-- Locks the tables against Supabase's auto-exposed PostgREST API.
--
-- Supabase grants the `anon` and `authenticated` roles full DML on everything
-- in `public` by default, and Drizzle-created tables ship with RLS disabled —
-- so before this migration the browser-side key could read *and write* every
-- table through https://<ref>.supabase.co/rest/v1/<table>.
--
-- All application access goes through Drizzle as the table owner (`postgres`),
-- which bypasses RLS, so enabling RLS with no policies closes the REST API
-- without affecting the app. Add explicit policies here if we ever want to
-- query from the browser directly.

ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cubes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cube_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Profiles are keyed by the Supabase auth user. The FK lives here rather than
-- in the Drizzle schema because it crosses into the `auth` schema, which
-- Drizzle does not manage.
ALTER TABLE "users"
  ADD CONSTRAINT "users_id_auth_users_id_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
