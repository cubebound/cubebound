# Printings and print groups

## base_id and collapseKey

- Printings: `cards.base_id` is the id of the **canonical printing** of a card, resolved from card data — not from the id string. Sets reprint cards in their high-numbered showcase slots, within a set (`SFD-049` → `SFD-224`) and across sets (`OGN-013` "Pouty Poro" → `UNL-220`), so no amount of suffix-stripping can group them. Identity is `(lower(name), type)`; see `assignBaseIds` in `src/lib/card-ids.ts` and the recompute SQL every sync runs in `scripts/sync-cards.ts`, which must stay in step. `drizzle/0003_base_id_print_groups.sql` was the one-off backfill that SQL superseded, and is history: it is not edited when the rule changes. Because identity is name-based, different cards sharing a collector number (`UNL-T01` "Baron Pit" vs `UNL-001` "Arena Kingpin") never group. `npm run check:printings` asserts all of this.
- **`base_id` is not what the card browser collapses on, because the source
  puts some treatments in the *name*.** Promo rows are spelled
  "Nine-Tailed Fox (Metal)", "Ahri, Alluring (Launch Exclusive)",
  "Teemo, Scout (GG EZ)". Identity being name-based, each became its own
  canonical printing and so survived the collapse — 31 phantom entries in a
  browser promising one row per card when this was found, which is how a search
  for "ahri" returned six cards for four. Every such group was checked against
  the pool and agrees on domains, energy, might, power cost and rules text: they
  are treatments, not cards.
  `collapseKey` in `src/db/queries/cards.ts` strips a **trailing** parenthetical
  and groups on that instead, mirrored by `nameWithoutTreatment` /
  `collapseIdentityKey` in `src/lib/card-ids.ts` so `check:printings` can assert
  Postgres and TypeScript agree on every row — the same two-definitions
  arrangement `assignBaseIds` has with the sync's recompute SQL. The mirror lives in `card-ids.ts`
  rather than beside the query because that module imports nothing, and
  `check:printings` runs without `--env-file-if-exists`. Trailing is the whole rule — Riftcodex named
  four distinct tokens `Recruit (271) // Buff`, `Sprite (274) // Buff` and so
  on, with a parenthetical mid-name, and a looser match would merge cards the
  game keeps apart. No live row is spelled that way since Riot's gallery took
  over those sets (it calls them `Recruit (DE)`, a trailing parenthetical that
  folds, harmlessly, because tokens are never shown), so `check:printings`
  asserts the rule on the old names directly. `canonicalFirst` picks the
  representative: a plainly-named printing beats a treatment-named one, then the
  sequence `comparePrintings` uses. That first rule was load-bearing while the
  promos were offered — a Spiritforged card's "(Metal)" promo is in OPP, and OPP
  sorts before SFD, so the collapsed row for Battle Mistress read
  "Battle Mistress (Metal)". Every collapsing query that renders cards now
  filters on `offeredCard`, so no live group has a treatment-named member; the
  rule stays as the defence for the day a source spells one again.
- **The fix is in the six queries that collapse printings, and nowhere else**:
  `searchCards`, `quickSearchCards`, `getSetStarterCards`, which builds "one of each card
  from a set" for a new cube (`getStarterSets` counts by the same key),
  `getCardIdentities` and `getRepresentativeCardsByKeys`, which are the pool a
  card page's URL is resolved against and the rows that page renders
  ([card-browser.md](card-browser.md)), and
  `readCubeCardSets` in `discovery.ts`, so a cube running two printings of a
  card counts once in the statistics ([discovery.md](discovery.md)). The first
  five filter on `offeredCard`, so no retired promo is shown or handed out;
  `readCubeCardSets` keeps `realCard`, because it counts what cubes hold and a
  promo still held there is still its card. The last
  is why the expression is built by the exported
  `collapseKeyOf(nameCol, typeCol)` rather than closing over `cards`: a rule
  this fiddly restated in a second file is a rule that will drift. `collapseKey`
  is that function applied to `cards`, and is the only form `queries/cards.ts`
  itself uses.
  Deliberately: `base_id` is stored and read by the printing picker, the
  contents switcher, the swap guard, the import catalog and the Draftmancer
  rarity resolution, so rewriting it is a re-sync per environment, run before
  the deploy that relies on it ([card-data.md](card-data.md)). The cost of not doing that is that the tile's
  printing badge, `printingCountByBase`, stays partitioned by `base_id` so it agrees with what the
  picker will offer, which means those cards undercount by one and their
  treatment printing is reachable only through "All printings". No offered
  printing is treatment-named today, so that cost has no live case. If the deeper
  unification is ever wanted, it is `cardIdentityKey` in `src/lib/card-ids.ts`
  and the recompute SQL in `scripts/sync-cards.ts`, in step, with
  `check:printings` asserting they agree.
- **The promo sets OPP, PR and JDG are retired: kept in `cards`, offered
  nowhere.** `RETIRED_SETS` in `src/lib/card-ids.ts` is the list, mirrored in
  SQL by `retiredSetCode` in `src/db/queries/cards.ts`, the one place `src/`
  binds it (`retiredPrinting` is that over `"cards"."set_code"`; the scripts
  bind their own). Riot's gallery feed,
  the only source, carries none of them, and every one is an alternate printing
  of a card a main set carries (checked against all 133 OPP records the old
  source held), so retiring them removes no card. **The rows stay because
  drafts reference them**: `drafts.packs` and `draft_picks` store card ids and
  replay against live rows, and production drafts, active ones among them, had
  dealt promos. Which reads leave them out and which deliberately do not is in
  [card-browser.md](card-browser.md); the add paths' refusal is in
  [cube-editor.md](cube-editor.md).
- **A retired printing is never canonical while an offered one exists.**
  `comparePrintings`' first rule puts retired sets last, ahead of the Showcase
  rule, and the sync's recompute SQL leads its `order by` with the same test.
  Before it, "OPP" sorted before "SFD", "UNL" and "VEN" on set code, an OPP
  promo became the canonical printing of 65 cards, and import, the starter
  lists and the browser handed it out — 887 production cube copies of OPP printings, in 54 of
  63 cubes (55 counting PR and JDG). `retiredPrintingTargets` picks where a cube's promo goes instead:
  the same card by `collapseIdentityKey`, preferring an offered printing with
  **identical art** (OPP-120 Rengar lands on the VEN-179 showcase, whose art it
  shares, rather than changing what the cube shows), otherwise the browser's
  representative. `check:printings` asserts no offered printing has a retired
  canonical and that every retired card has a target.
- **A token only ever groups with tokens**, and `check:printings` asserts that
  no `base_id` group mixes the two. Two things lean on it: the import catalog
  drops tokens *after* choosing base printings, so a card whose base printing
  were a token would vanish from import; and `swapPrintingAction`'s token
  guard is unreachable only while it holds. Identity is name plus type, so a
  token and a card sharing both would break it, and the check is what notices.
- Do **not** use rules text as card identity: showcase reprints drop the parenthetical reminder text and sometimes reword the ability outright.
