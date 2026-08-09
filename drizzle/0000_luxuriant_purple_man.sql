CREATE TYPE "public"."cube_section" AS ENUM('main', 'legends', 'runes', 'battlefields', 'sideboard');--> statement-breakpoint
CREATE TYPE "public"."cube_visibility" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"set_code" text NOT NULL,
	"collector_no" text NOT NULL,
	"rarity" text NOT NULL,
	"type" text NOT NULL,
	"supertype" text,
	"domains" text[] DEFAULT '{}' NOT NULL,
	"energy_cost" integer,
	"power_cost" jsonb,
	"might" integer,
	"rules_text" text,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"champion" text,
	"artist" text,
	"image_full" text,
	"image_thumb" text,
	"data" jsonb,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cube_cards" (
	"cube_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"section" "cube_section" DEFAULT 'main' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cube_cards_cube_id_card_id_section_pk" PRIMARY KEY("cube_id","card_id","section")
);
--> statement-breakpoint
CREATE TABLE "cubes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"visibility" "cube_visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "cube_cards" ADD CONSTRAINT "cube_cards_cube_id_cubes_id_fk" FOREIGN KEY ("cube_id") REFERENCES "public"."cubes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cube_cards" ADD CONSTRAINT "cube_cards_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cubes" ADD CONSTRAINT "cubes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cubes_owner_slug_idx" ON "cubes" USING btree ("owner_id","slug");