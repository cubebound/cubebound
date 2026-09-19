# Riftbound rendering and format rules

## Rendering

- Riftbound term casing in UI: domains and card types are proper nouns (Fury, Battlefield). Sources store them lowercase; title-case at the boundary via `titleCase` in `src/lib/riftbound.ts`.

- Card rendering rules live in `src/lib/riftbound.ts` (domain colors, canonical orderings, orientation). Battlefields are printed landscape (7:5), every other type portrait (5:7) — the printed image already reads upside-down on its top half, that is correct.

- Rules text contains symbol tokens (`:rb_energy_1:`, `:rb_rune_fury:`). Never render `rules_text` raw — go through `parseRulesText` in `src/lib/rules-text.ts`, which resolves the tokens to badges and degrades unknown ones to readable words. Note the source names domain symbols `rune_*` but they are **Power** costs; runes are the resource cards you exhaust or recycle to produce Energy and Power.

### Format rules (for milestone C's deck builder)

Not enforced anywhere yet — the draft produces a pool, and nothing validates a
deck. Written down now so the builder does not have to re-derive them:

- A deck may use cards from **up to three domains**.
- **Any signature spell is usable regardless of which champions the deck runs.**
  Signature spells are tied to a champion by flavour, not by a deckbuilding
  restriction.
- **No legend or champion is required.** A legal deck need contain neither.
