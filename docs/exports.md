# Exports

Two different things are called "export" and they are not interchangeable.
`src/lib/deck-export.ts` turns a **finished draft's deck** into a text decklist
for Piltover Archive (see [draft.md](draft.md)). `src/lib/draftmancer-export.ts` turns a
**whole cube** into a Draftmancer Custom Card List so other people can draft it.

- **Why Draftmancer at all.** Our own drafting is one person against
  deliberately dumb bots, and multiplayer lobbies are item 4 of phase 2 —
  a websocket server we have not written. Draftmancer already runs multiplayer
  drafts in a browser, and its **custom card** support lets it run a game it has
  never heard of: `[CustomCards]` defines cards by name, type and image URL, and
  the sheets below reference them. Cubecana runs Lorcana cubes through it the
  same way. So the export substitutes for the expensive feature.
- **Exporting needs no account.** The route has always been `canUseCube` with
  whatever viewer there was, signed out included; the draft screen now renders
  signed out too, so the tab is actually reachable — see [draft.md](draft.md). A cube you
  send someone should not cost them a sign-in email before they can draft it.
- **The file is four parts in a fixed order** — `[CustomCards]`, `[Settings]`,
  then one bare-headed sheet per section (`[Main]`, `[Legends]`,
  `[Battlefields]`). Counts live in the layout rather than in `[Name(N)]`
  headers, which is how Draftmancer's own multi-layout example writes them.
  **Runes, sideboard and maybeboard are not exported**, for the same reasons the
  engine does not deal them.
- **The pack template is ours; the session is Draftmancer's.** Composition comes
  from the cube's own `DraftConfig` — the same object the solo draft screen
  produces and `validateDraftConfig` polices — so the two ways of drafting a
  cube cannot drift into meaning different things. What we deliberately do not
  own is the session: `boostersPerPlayer` is written as a **default** the host
  may override, and `seats` is used only to size the "is this cube big enough"
  warnings and is never written to the file. Baking in eight seats becomes a lie
  the moment six people turn up. The route reads the config from its **query
  string** through `readDraftConfig` and rejects an incoherent one with a 400
  carrying the validator's own message, so a config that could never work cannot
  produce a file that fails on upload instead.
- **The either-slot is a weighted slot, not a mixed sheet.** A slot may name
  several sheets with weights, picking a sheet before it picks a card:
  `{ "name": "LegendOrBattlefield", "count": 1, "sheets": [{"name":"Legends","weight":1},
  {"name":"Battlefields","weight":1}] }`. One combined sheet was the first
  version and it was subtly wrong — it draws in proportion to what the cube
  holds, which on the dev cube is 26 legends against 56 battlefields, about 68%
  battlefield, where the engine chooses the type 50/50 per slot. Reserved
  legend and battlefield slots are ordinary slots against their own sheets, and
  a shuffled type has no slot and no sheet because it is part of the main pile.
- **A weighted sheet has no fallback, so each one has to cover its own share
  with headroom.** Picking the sheet first is what makes this bite: a slot that
  has chosen Legends cannot spend a battlefield, and if that sheet is empty
  Draftmancer fails the whole booster generation with "Make sure there are
  enough cards in the list", naming no sheet. **Our engine does the opposite** —
  `generatePacks` takes the other type, then main, and only warns — so the same
  cube genuinely drafts here and refuses to start there. The panel and
  `draftmancerPlan` both used to check legends *plus* battlefields against the
  slot total, which is the wrong quantity and reads healthy on cubes Draftmancer
  rejects outright.
  **And the share is a mean, not a bound.** Draws across a draft are binomial,
  so a sheet holding exactly half the slot count generates about half the time,
  and because Draftmancer retries, that surfaces as "it errored twice and then
  worked" rather than as a clean refusal. Measured against draftmancer.com by
  hand: 96 either-slots against 48 legends generated on roughly one attempt in
  two, 24 against 12 did the same, 24 legends against 96 slots never generated
  in many attempts, and 60 against 96 worked first try. `draftmancerSheetNeeded`
  in `src/lib/draft/config.ts` is the one definition — dedicated slots, which are
  deterministic, plus `mean + 2.33 sd` of the weighted draw, which is about 99%
  per attempt and is what puts 96 slots at 60 rather than 48. It lives beside the
  pool math rather than in the exporter because the settings panel shows it and
  the file's own warnings use it, and those two must not disagree. `check:draftmancer`
  asserts it against every one of those hand-run sessions, since nothing in CI
  can talk to Draftmancer.
  **This is reachable from the defaults.** One either-slot at 8 players and 3
  packs is 24 draws, so each section wants about 18; a cube with 14 legends is
  intermittent, and before this it reported "needs 24, 70 spare" and looked fine.
- **A slot may never name a sheet that was not emitted, and no sheet may be
  empty** — either one is a file that errors. A reserved type the cube has none
  of gives its slots back to main and says so, which is the same "fall back and
  warn" the engine does for a short reserved section; an either-slot with only
  one type available narrows to that type and says so too. `check:draftmancer`
  asserts the slots and sheets agree across four different configs.
- **Grouping is by section, not by card type**, matching `getDraftPools` and so
  matching the counts `DraftSettings` shows as "(26 in this cube)". The engine
  layers a type-beats-section rule on top of those pools inside `buildMainPool`;
  reimplementing half of it here would let the panel and the file disagree about
  how big a section is, which is worse than the rare stray legend filed under
  main that it would catch.
- **Everything that affects how the cube drafts is written explicitly**, so a
  change to Draftmancer's defaults cannot quietly alter what a cube plays like.
  `colorBalance` **off** — it defaults on and would balance the largest slot
  against a `colors` field we deliberately never emit; `withReplacement` **off**,
  matching our own rule that a card held twice appears in at most two packs;
  `refillWhenEmpty` **off**, so a cube too small fails loudly rather than
  silently dealing the same cards again; `duplicateProtection` **on**.
- **Sheet lines reference cards by name, so names must be unique — and a
  duplicate does not error.** Draftmancer binds both lines to whichever entry it
  read last, and the cube drafts with one card missing and another doubled,
  invisibly. `uniqueNames` appends the printing id when two collide and the
  panel says it did. This is why the export **keeps** promo variant suffixes
  where `deckListName` strips them: stripping `(Metal)` is right for a text
  decklist another builder has to match, and here it would manufacture exactly
  that collision. The champion-rebuilding half of the rule *is* shared —
  `withChampionPrefix` — because a legend stores only its title either way.
- **Domains are deliberately not mapped to MTG colors.** Draftmancer's `colors`
  takes W/U/B/R/G and Riftbound has six domains; five slots do not hold six, and
  choosing one to drop would be the silent guess `import-list.ts` refuses to
  make about names. They ride in `subtypes`, where they show on the type line.
  The cost is that Draftmancer's bots have no colour signal, which is what
  `rating` is for.
- **`rarity` is a closed set, and Draftmancer rejects the entire file over
  it.** `Invalid mandatory property 'rarity' in custom card, must be one of
  [common, uncommon, rare, mythic, special]`. **Its published format
  documentation says the field is optional and lists no allowed values, and is
  wrong on both counts** — write against the validator, not the docs, and
  confirm by actually uploading. Riftbound's vocabulary is not accepted, so
  Common/Uncommon/Rare map across and **Epic becomes `mythic`**, the top of our
  scale onto the top of theirs. `DraftmancerRarity` is a union type so an
  unmapped value is a compile error rather than an upload failure, and
  `check:draftmancer` asserts every emitted value is in the set.
- **`rating` is derived from that same resolution, and it is a deliberate
  exception.** "Rarity plays no part in pack construction" still holds for
  *dealing packs*. This is bot pick order: Draftmancer's bots have never seen a
  Riftbound card and have no colour to read either, so an unrated pool makes
  them pick at random. Printed rarity is a weak proxy, but it is the only signal
  we have until pick data exists. One function resolves the tier and both the
  rarity and the rating come from it, so the two cannot disagree.
  **Showcase and Promo are printing treatments, not power tiers**, so the
  resolution looks through `base_id` to the canonical printing — all 120
  showcase rows resolve that way (70 Rare, 42 Epic). Promo mostly does not (73
  of 117 are their own base) and lands on `special`, rated a neutral **2, never
  0**: zero is the bottom of the scale rather than an absence, and 339 Promo
  rows sit in real cubes, so bots would take every one of them last. A real
  export of the 426-card dev cube comes out 123 rare, 119 uncommon, 82 common,
  80 mythic, 22 special.
- **Costless is an empty `mana_cost`, not `{0}`** — legends, runes and
  battlefields have no energy cost at all, the same distinction that keeps them
  off the analytics curve instead of bucketing them at zero. Power cost and
  might have no MTG equivalent and go in `oracle_text`, which is also where the
  source's HTML-escaped `&gt;` separator has to be decoded: on our own pages
  that text goes into JSX, but here it lands in a plain-text field Draftmancer
  shows verbatim.
- **It is a route handler, and route handlers do not run the layout above
  them.** `cube/[username]/[slug]/layout.tsx` gates the pages; the export
  repeats the check itself or it has none. It uses **`canUseCube`, not
  `canViewCube`** — taking a cube away to draft elsewhere is *using* it, like
  cloning and drafting, so a hidden cube or a suspended owner's cube must not
  export even for its own owner. Verified: suspended and hidden both 404,
  unlisted works, and a cube that does not exist is indistinguishable from one
  that is private.
- **Both export routes read that gate from one place**,
  `cube/[username]/[slug]/export-request.ts`: the access check and the pack
  template it validates were duplicated in `draftmancer.txt` and `pack.png`,
  and a visibility rule kept in two copies is one that eventually disagrees
  with itself. The helper answers with either the resolved request or the
  `Response` to send instead, so a caller that skips the failure branch has no
  cube to read.
- **The export lives on the draft screen, as one of three tabs over one settings
  form, and it is the one that opens.** `/cube/{username}/{slug}/draft?new=1`
  leads with **Export to Draftmancer**, then **Draft against bots**, then
  **Crack-A-Pack**; `DraftSettings` renders once above them and each tab carries
  only its own action. The row wraps below `sm` rather than scrolling sideways,
  which is the rule the cube page's tabs already follow. Drafting a cube with other people is the thing people want, and
  our own bots are deliberately dumb — whichever tab leads should also be the
  default, or the highlighted tab is the second one. They differ in *where* the
  draft happens, not in what a legend slot is, so configuring the pack template
  twice would have meant two copies of that form and eventually two answers. It
  is deliberately not on the cube page: "Draft" is already the verb that leads
  here.
- **`seats` is not written to the file, and `packsPerPlayer` is.** Players sizes
  the "is this cube big enough" arithmetic and nothing else; packs becomes
  `boostersPerPlayer`, the default the Draftmancer host sees and may override.
  Because one form serves both tabs, **the qualification rides on the field it
  qualifies**: `DraftSettings` takes a `mode`, and exporting, the Players hint
  says it only sizes the check below while Packs each says it is the file's
  default. That started as a paragraph above the form, on the reasoning that
  explaining a field after it has been read is too late — which was right and did
  not go far enough. The paragraph is read once and then forgotten while the eye
  is on the fields, so by the time you are typing in Players there is nothing
  beside it saying the number is only a check. `mode` changes hint text and one
  sentence of the summary and nothing else: the config, the arithmetic and the
  validation stay identical, which is what keeps one form safe to share.
  The summary is tab-aware for the same reason. Exporting, the seat count is an
  assumption about a session the host will size themselves, so it reads "Sized
  for 8 players" and "Each player finishes with 36 cards" rather than stating
  either as fact.
  **The tab is client state, not a URL parameter**, unlike the cube page's tabs
  — those select what to read and are worth linking to, while this one sits over
  a form you have just filled in, and a round trip to a dynamic route would
  throw the settings away to change a heading.
- **The screen costs no extra query.** `DraftSettings` takes **three counts**,
  not the cards, so nothing extra crosses to the client, and only pressing
  Download runs a query. That is also why the route selects its own columns:
  `champion` and the base printing's rarity are not in `browseColumns` and no
  page wants them.
- **`readDraftConfig` lives in `src/lib/draft/config.ts`, not beside the draft
  action**, because the export route needs the same field-by-field rebuild from
  a query string that the start action needs from a form. Its booleans accept
  `"true"` and `"1"` for exactly that reason — a URL has no booleans, and the
  alternative is a second parser that could disagree with this one about what a
  config is.
