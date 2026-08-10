-- Bulk import records itself as a single batch entry rather than one row per
-- card, so a 300-card import doesn't bury the rest of a cube's history.
ALTER TYPE "public"."cube_change_kind" ADD VALUE IF NOT EXISTS 'cards_imported';
