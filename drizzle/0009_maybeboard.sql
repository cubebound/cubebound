-- A holding area for cards being considered, distinct from the sideboard:
-- the sideboard is cards taken *out* of the cube, the maybeboard is cards not
-- in it yet. Neither counts toward the cube's size.
ALTER TYPE "public"."cube_section" ADD VALUE IF NOT EXISTS 'maybeboard';
