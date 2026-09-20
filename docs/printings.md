# Printings and print groups

## base_id and collapseKey

- Printings: `cards.base_id` is the id of the **canonical printing** of a card, resolved from card data — not from the id string. Sets reprint cards in their high-numbered showcase slots, within a set (`SFD-049` → `SFD-224`) and across sets (`OGN-013` "Pouty Poro" → `UNL-220`), so no amount of suffix-stripping can group them. Identity is `(lower(name), type)`; see `assignBaseIds` in `src/lib/card-ids.ts` and the matching SQL in `drizzle/0003_base_id_print_groups.sql`, which must stay in step. Because identity is name-based, different cards sharing a collector number (`UNL-T01` "Baron Pit" vs `UNL-001` "Arena Kingpin") never group. `npm run check:printings` asserts all of this.
- **`base_id` is not what the card browser collapses on, because the source
  puts some treatments in the *name*.** 34 rows are spelled
  "Nine-Tailed Fox (Metal)", "Ahri, Alluring (Launch Exclusive)",
  "Dark Child (Starter)", "Teemo, Scout (GG EZ)", "Baron Nashor (Ultimate)".
  Identity being name-based, each became its own canonical printing and so
  survived the collapse — 31 phantom entries in a browser promising one row per
  card, which is how a search for "ahri" returned six cards for four. All 31
  groups were checked against the pool and agree on domains, energy, might,
  power cost and rules text: they are treatments, not cards.
  `collapseKey` in `src/db/queries/cards.ts` strips a **trailing** parenthetical
  and groups on that instead, mirrored by `nameWithoutTreatment` /
  `collapseIdentityKey` in `src/lib/card-ids.ts` so `check:printings` can assert
  Postgres and TypeScript agree on every row — the same two-definitions
  arrangement `assignBaseIds` has with `0003`. The mirror lives in `card-ids.ts`
  rather than beside the query because that module imports nothing, and
  `check:printings` runs without `--env-file-if-exists`. Trailing is the whole rule — `Recruit (271) //
  Buff` and `Sprite (274) // Buff` are four genuinely distinct cards carrying a
  parenthetical mid-name, and a looser match would merge cards the game keeps
  apart. `canonicalFirst` picks the representative: a plainly-named printing
  beats a treatment-named one, then the sequence `comparePrintings` uses. That
  first rule is load-bearing rather than cosmetic — Dark Child, Wuju Bladesman,
  Might of Demacia and Lady of Luminosity exist only as an OGS "(Starter)"
  printing and an OPP plain one, and OGS sorts first, so without it the
  collapsed row would be titled "Dark Child (Starter)".
- **The fix is in the two queries that collapse printings, and nowhere else.**
  Deliberately: `base_id` is stored and read by the printing picker, the
  contents switcher, the swap guard, the import catalog and the Draftmancer
  rarity resolution, so rewriting it is a migration plus a re-sync per
  environment. The cost of not doing that is recorded where it bites — the tile's
  printing badge stays partitioned by `base_id` so it agrees with what the
  picker will offer, which means those 31 cards undercount by one and their
  treatment printing is reachable only through "All printings". If the deeper
  unification is ever wanted, it is `cardIdentityKey` in `src/lib/card-ids.ts`,
  the recompute SQL in `scripts/sync-cards.ts` and a migration mirroring `0003`,
  all three in step, with `check:printings` asserting they agree.
- Do **not** use rules text as card identity: showcase reprints drop the parenthetical reminder text and sometimes reword the ability outright.
