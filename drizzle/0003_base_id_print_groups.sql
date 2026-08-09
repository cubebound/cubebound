-- Redefines cards.base_id as "the canonical printing of this card".
--
-- The previous rule stripped an id suffix (OGN-100a -> OGN-100), which only
-- collapses printings that share a collector number. Sets also reprint cards in
-- their high-numbered showcase slots, within a set (SFD-049 -> SFD-224) and
-- across sets (OGN-013 "Pouty Poro" -> UNL-220), and nothing in the reprint's
-- id reveals which card it is. Those 63 cards therefore appeared twice in the
-- collapsed browser.
--
-- Identity is (lower(name), type). Verified against the full pool: no
-- (name, type) group disagrees on domains, energy, might or power cost, and no
-- name spans two types. Different names never group, which is what keeps the
-- collision case correct -- UNL-T01 "Baron Pit" and UNL-001 "Arena Kingpin"
-- share a collector number but stay separate.
--
-- Keep in step with assignBaseIds() in src/lib/card-ids.ts; the mismatch check
-- in scripts/check-printings.mts asserts both produce the same answer.

UPDATE "cards" AS c
SET "base_id" = r.canonical
FROM (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY lower("name"), "type"
      ORDER BY
        ("rarity" = 'Showcase'),          -- a real printing before a reprint
        "set_code",                       -- earliest set
        length("collector_no"),           -- numeric order without a cast
        "collector_no",
        "id"                              -- plain id before its a/-star variants
    ) AS canonical
  FROM "cards"
) AS r
WHERE r."id" = c."id" AND c."base_id" IS DISTINCT FROM r.canonical;
