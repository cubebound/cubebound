-- The card whose art represents a cube: on its share preview, and anywhere a
-- cube needs a picture. Nullable, and falls back to the cube's first legend or
-- main card at render time, so nobody has to set one.
--
-- ON DELETE SET NULL rather than CASCADE: a card leaving the pool must clear
-- the cover, never delete the cube.
ALTER TABLE "cubes" ADD COLUMN "cover_card_id" text;--> statement-breakpoint
ALTER TABLE "cubes" ADD CONSTRAINT "cubes_cover_card_id_cards_id_fk"
  FOREIGN KEY ("cover_card_id") REFERENCES "public"."cards"("id")
  ON DELETE set null ON UPDATE no action;
