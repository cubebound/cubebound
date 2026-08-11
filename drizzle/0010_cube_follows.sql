CREATE TABLE "cube_follows" (
	"user_id" uuid NOT NULL,
	"cube_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cube_follows_user_id_cube_id_pk" PRIMARY KEY("user_id","cube_id")
);
--> statement-breakpoint
ALTER TABLE "cube_follows" ADD CONSTRAINT "cube_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cube_follows" ADD CONSTRAINT "cube_follows_cube_id_cubes_id_fk" FOREIGN KEY ("cube_id") REFERENCES "public"."cubes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cube_follows_cube_id_idx" ON "cube_follows" USING btree ("cube_id");--> statement-breakpoint
CREATE INDEX "cube_follows_user_id_created_at_idx" ON "cube_follows" USING btree ("user_id","created_at");--> statement-breakpoint

-- Supabase auto-exposes public tables over PostgREST and grants anon full DML,
-- so every new table gets RLS with no policies. The app reads through Drizzle
-- as the table owner, which bypasses RLS. See CLAUDE.md.
ALTER TABLE "cube_follows" ENABLE ROW LEVEL SECURITY;
