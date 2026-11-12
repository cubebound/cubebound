-- Moves every Legend and Battlefield copy out of Main into its own section.
--
-- From this release no write path can put one there (`sectionAllowsType` in
-- src/lib/riftbound.ts). Before it, the importer filed any line the user
-- resolved by hand into Main whatever its type, and a `Main:` header or a
-- per-copy move could do it deliberately. Measured in production on
-- 12 November 2026: 15 battlefield copies in 4 cubes and 28 legend copies in
-- 2. Sideboard and maybeboard rows are left alone; any card may sit there.
--
-- Each moved row gets one `copy_moved` change-log entry with no actor, so the
-- owner can see what changed and nobody is credited with it. `cubes.updated_at`
-- is deliberately not bumped: a housekeeping move should not float these cubes
-- to the top of "recently updated".
--
-- Merging matches `moveOneCopy`: into any row already in the target section,
-- capped at 99. Active drafts are unaffected, because `drafts.packs` is a
-- snapshot taken when the draft started.

INSERT INTO "cube_changes"
  ("cube_id", "actor_id", "actor_username", "kind", "card_id", "card_name",
   "quantity", "from_section", "to_section")
SELECT cc."cube_id", NULL, NULL, 'copy_moved', cc."card_id", c."name",
       cc."quantity", 'main',
       (CASE c."type" WHEN 'Legend' THEN 'legends' ELSE 'battlefields' END)::"cube_section"
FROM "cube_cards" cc
JOIN "cards" c ON c."id" = cc."card_id"
WHERE cc."section" = 'main' AND c."type" IN ('Legend', 'Battlefield');
--> statement-breakpoint
INSERT INTO "cube_cards" ("cube_id", "card_id", "section", "quantity", "added_at")
SELECT cc."cube_id", cc."card_id",
       (CASE c."type" WHEN 'Legend' THEN 'legends' ELSE 'battlefields' END)::"cube_section",
       cc."quantity", cc."added_at"
FROM "cube_cards" cc
JOIN "cards" c ON c."id" = cc."card_id"
WHERE cc."section" = 'main' AND c."type" IN ('Legend', 'Battlefield')
ON CONFLICT ("cube_id", "card_id", "section")
  DO UPDATE SET "quantity" = least(99, "cube_cards"."quantity" + excluded."quantity");
--> statement-breakpoint
DELETE FROM "cube_cards" cc
USING "cards" c
WHERE c."id" = cc."card_id"
  AND cc."section" = 'main'
  AND c."type" IN ('Legend', 'Battlefield');
