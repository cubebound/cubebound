# Draft

Solo drafting against bots lives at `/cube/{username}/{slug}/draft`. **Milestone
A is done**: configuration chosen per draft, dumb bots, pool-only result. B makes
the bots smart; C adds the deck builder.

- **The engine is pure and deterministic** — `src/lib/draft/`, no database, no
  React, no clock. Given a seed, config and packs, a sequence of human picks
  always yields the same draft. That is why the persisted draft is a *log*
  rather than a snapshot: state is rebuilt by replaying picks through the
  engine, so the row and the engine cannot disagree about whose turn it is.
  Every random decision goes through `createRng(seed, ...parts)`, whose streams
  are derived per seat and pick rather than drawn from one shared generator —
  replay then cannot drift if call order ever changes.
- **Configuration is chosen per draft on the start screen** and snapshotted
  into `drafts.config`, so a cube edited mid-draft — or different settings next
  time — cannot change what was already dealt. Seats, packs, cards per pack, and
  three kinds of reserved slot: legend, battlefield, and either-at-random.
  Defaults are 8 seats, 3 packs, 12 cards, 1 either-slot — the either-slot
  matching the Legend-or-Battlefield slot Riot's boosters guarantee from Legacy
  (Set 6, January 2027) onward. **Pack size deliberately does not track a retail
  pack's card count**: rarity, rune and insert slots have no cube equivalent, so
  only the Legend-or-Battlefield structure is matched. Do not "correct" 12 to a
  printed pack size.
  Bounds live in `DRAFT_LIMITS` and are enforced by `validateDraftConfig` **on
  the server** — the config arrives from a browser, so `readDraftConfig` rebuilds
  it field by field rather than spreading it, which also stops a caller
  smuggling in `passDirections` and pinning the passing order.
  **Seats run 2 to 16, and the ceiling is a sanity bound rather than a product
  opinion.** It was 8, which was the standard draft pod size mistaken for a
  limit: nothing in the engine cares how many seats there are, and for an export
  `seats` never reaches the file at all, so the old cap meant a twelve-person pod
  could not even be checked for. A cube too small for the seats asked for still
  blocks, with the real numbers. `check:draft` asserts both ends of the range, so
  moving it again is a two-file change.
- **Passing direction is derived, not stored.** It used to be a fixed
  `["left","right","left"]` array that `directionForRound` threw on past round
  three — so more than three packs was impossible, and the failure landed
  mid-draft rather than at creation. `passDirectionForRound` alternates from
  left for any round, which reproduces the old default exactly. A draft that
  *stored* a list still wins, so nothing in flight can drift.
- **Reserved slots come out of the pack, not on top of it**: 12 cards with 1
  legend and 2 battlefield slots is 9 main cards. The start screen shows the
  arithmetic live, because an 8-seat 3-pack draft with one legend slot needs 24
  legends and most cubes hold far fewer — finding that out after pressing start
  is a bad way to learn a number was too big.
- **A dedicated slot never substitutes the other type.** Short on legends, a
  legend slot fills from **main**, not from battlefields — you asked for a
  legend. Only the either-slot swaps, which is what it is for. A shortfall in
  any reserved section warns and falls back; only a main pool too small to cover
  its own slots *plus* the whole fallback actually blocks.
- **Each of legends and battlefields is either reserved or shuffled — one
  choice, not two settings.** Reserved means N guaranteed slots a pack; shuffled
  means the whole section joins the main pile and turns up wherever the shuffle
  puts it, for cubes that mix everything together and deal off the top. Both at
  once is incoherent — the guaranteed count would be a lie — so
  `validateDraftConfig` rejects it and the form offers a radio rather than a
  number plus a checkbox, which makes the exclusivity structural instead of a
  rule the UI has to police.
  **The either-slot needs both types reserved**, because it draws from each:
  shuffling one in empties the deck it would have taken from and would silently
  turn it into a one-type slot. `canUseEitherSlot` is that rule.
- **`buildMainPool` is both halves of the same rule.** When a type is
  *reserved*, its type beats its section: a legend filed in `main` is dropped,
  because the reserved slots exist so that type turns up a known number of times
  and a stray makes the number a lie. When a type is *shuffled*, there is no
  count to protect, so its section folds in and strays stay put. It reports both
  what it removed and what it folded in, so the start screen can say so rather
  than silently changing what a cube drafts.
  A shuffled type's reserved deck is emptied at the same time, and **that** is
  what stops a card being dealt from both piles — validation normally makes the
  combination unreachable, so `check:draft` builds the contradictory config on
  purpose to exercise the guard, since `generatePacks` does not validate.
- **The pack template reserves one Legend-or-Battlefield**, chosen 50/50 per
  pack, with the other eleven cards from the cube's main section — the same
  guaranteed slot Riot's boosters carry from Legacy (Set 6) onward. Legends and
  battlefields are a deck's *identity* rather than its body — you play one
  legend and a handful of battlefields — so dealing them from the main pool
  would both flood packs with cards nobody can use twice and starve drafters of
  the one card that fixes their domains. A guaranteed slot gives every seat
  three shots at each.
- **Rarity plays no part in pack construction.** A cube is already a curated
  pool; re-imposing the printed rarity distribution would double-filter it and
  put Riot's choices above the cube owner's.
- **Dealing is without replacement across the whole draft, respecting
  quantity**: a card the cube holds twice appears in at most two packs, total.
  Copies are expanded into individual entries before shuffling, so the limit
  holds by construction rather than by a counter someone must remember to
  decrement. Only the **main** section is drafted — never sideboard (a holding
  area for cards the owner deliberately removed) or runes (resources, not
  draftable cards).
- **Fallbacks.** Too few legends and battlefields to fill their slots: fill from
  main and warn before the draft starts. Too few main cards for
  `seats × packs × 11`: **block** with the actual numbers, because a draft that
  silently ran short packs reads as an engine bug to whoever hits it, and the
  cube owner can fix it by adding cards.
- **Bots are deliberately dumb.** Each commits to the domains of its first pick
  (at most two) and thereafter takes a random in-domain card, falling back to
  random when the pack offers none. That drains packs in a plausible *shape*
  without pretending to a skill the engine does not have — and it keeps a bot
  bug distinguishable from a bot opinion. A one-domain first pick commits to
  one domain; there is nothing principled to invent for the second.
- **Drafting is gated on viewing, not owning** — the point of sharing a cube.
  Sign-in is still required *for the bots*, because that draft is persisted to
  survive a refresh and a row has to belong to someone.
  `requireDraftableCube` gates starting, `requireOwnDraft` gates picking and
  saving: a public cube does not make someone else's draft yours to pick in.
- **The draft screen renders signed out, and the Draftmancer tab works there.**
  Only the bots tab asks for an account, and it says so in place of the button
  rather than replacing the screen — so the export beside it stays usable. The
  whole screen used to be a single sign-in prompt, which hid the tab that
  *leads* behind an account and put a magic-link email in front of anyone sent
  a cube to go draft. That reaches past the UI: sign-in email is metered and
  capped upstream of us (see [security.md](security.md)), so the cheapest way to
  protect it is not to need it. Nothing about the download itself changed —
  `draftmancer.txt` never read a session, only `canUseCube` with a
  possibly-absent viewer — the page simply stopped hiding it. The header's
  "Your drafts" link is hidden signed out, being a link to a sign-in prompt.
  `StartDraft` takes `signedIn` and decides what to *offer*; the server action
  refuses a signed-out caller either way, as always.
- **Config and the dealt cards are snapshotted at draft start**, so editing the
  cube mid-draft cannot change packs already dealt. `drafts.packs` stores card
  *ids*; details come from `cards`, which cube edits don't touch. A card
  deleted from the database outright makes the draft unresumable, and it says so
  rather than dealing a hole.
- **The pool sits beneath the packs as a curve**, not beside them: piles by
  energy cost with legends and battlefields kept separate, because those are
  off the cost scale rather than at the cheap end of it. Cards **stack** within
  a pile and hovering raises one to full view. The overlap is a negative
  percentage margin, which resolves against the container's *width* — and so
  does card height via its aspect ratio, so the stack stays correct at any
  column width, with the covered card deciding the offset so a landscape
  battlefield overlaps differently to a unit. `REVEAL` controls how much of a
  covered card shows: Cube Cobra can stack to a sliver because Magic prints the
  name along the top edge, whereas Riftbound puts it around 60% down, so a
  sliver shows cost and art but not the name. That is what makes the hover
  necessary rather than a nicety. Raising is React state, not a `hover:z-…`
  class, because the stacking order is an inline style and inline styles win. One click is the whole
  interaction — a card in the pack goes to the mainboard, a mainboard card goes
  to the sideboard, a sideboard card comes back. The board is stored per pick
  (`draft_picks.board`) and keyed by `(round, pickNumber)` rather than card id,
  so two copies of one card move independently. Saving as a cube keeps the
  split: sidelined cards land in the new cube's sideboard section.
- **Card art degrades to the card name.** Images come straight from the source
  CDN and one occasionally fails; a blank tile in a pack you are choosing from
  is the worst place for that, so both the pack tiles and the pool piles fall
  back to the name on `onError`.
- **A finished draft exports as a text decklist**, from the end screen, for
  pasting into Piltover Archive and the other Riftbound builders. The format is
  one `<quantity> <card name>` per line with no headers — what Piltover itself
  exports and what the others parse. The binary deck code
  (`Piltover-Archive/RiftboundDeckCodes`) is deliberately not used: it is a
  dependency and an encoding to get wrong, where a text list is a paste a human
  can read and fix.
  **The names have to be rebuilt, and that is the whole feature.** `cards.name`
  is normalised per type by the sync: champion units are stored `Darius,
  Trifarian`, which is already right, but **a legend stores only its title**
  (`Daughter of the Void`, champion `Kai'Sa`) — exported raw, every legend fails
  to match. And 35 cards carry a promo suffix (`(Metal)` on 24, plus
  `(Starter)`, `(Launch Exclusive)`, `(Ultimate)`, `(GG EZ)`), each of which has
  a same-named plain card in the pool, so the suffix is stripped. `deckListName`
  does both, in that order, so a variant legend still gets its champion.
  Mainboard and sideboard are separate lists, never concatenated: the flat
  format has no notion of a sideboard, so appending one would present cards the
  drafter cut as part of the deck. Runes are absent because they are not
  drafted, and the panel says so.
- **Drafts are kept as drafts.** `/drafts` lists every draft the user has sat
  in, and `?draft={id}` on the draft route reopens one — a draft holds the
  packs it was dealt, every pick in order and the main/side split, none of
  which survives being flattened into a cube. **"Save as cube" is gone**: it
  predated `/drafts`, when a finished draft became unreachable the moment a
  newer one started and flattening it into a cube was the only way to keep it.
  Now that drafts keep, it copied a pool into a second place for no gain and
  left people with cubes they had not meant to make. Cloning is still how you
  get an editable copy of a *cube*. Without the id parameter the route shows the
  latest draft of that cube, which is why a finished draft used to become
  unreachable the moment a new one started. A draft id belonging to someone
  else, or to another cube, falls back to the latest rather than opening.
- **Deleting a draft takes its picks with it** (`draft_picks` cascades) and is
  gated on being the drafter, in the action and again in the query's `WHERE`.
  It confirms first: it is the only irreversible thing on the list and sits
  next to the link that opens a draft. `/drafts` pages at
  `DRAFTS_PAGE_SIZE`, and an out-of-range `?page=` clamps rather than 404s so
  deleting the last draft on a page still lands somewhere real.
- Generic page controls live in `src/components/pagination.tsx`; the card
  browser's `CardPagination` wraps them to carry its filters through the link,
  which is the only part that differs between the two.
- **The settings screen is three tabs over one form, and the Draftmancer export
  is the one that opens.** Drafting against bots, exporting to Draftmancer and
  drawing a pack as an image all start from the same question — what goes in a
  pack — so `DraftSettings` renders once above all three and only the action
  differs. See "Exports" and "Crack-A-Pack". `mode` changes what the fields
  *say*, except on the pack tab, where Players and Packs each are hidden
  outright: a single pack has no seats and no rounds, so they are not merely
  worded differently there, they are meaningless.
- **"Draft" on a cube means "set one up", so both Draft buttons link to
  `?new=1`.** Resuming the latest draft made the settings unreachable from a
  cube for anyone who had drafted it before, which is everyone after the first
  time. Picking up where you left off is what `/drafts`, the draft switcher and
  the "Back to it" link on the settings screen are for. The **bare
  `/cube/…/draft` still resumes**, so a bookmark keeps working.
- **"New draft" is a link to `?new=1`, not an action.** It used to deal on
  click, which made the settings screen reachable only on a cube you had never
  drafted — that is, never, after the first time. Routing to the settings makes
  that screen the commit point, and it also replaces the old confirm: nothing is
  dealt by *looking* at settings, and the screen says plainly that the current
  draft survives, which is what the confirm existed to promise.
- **Milestone A adds migration `0007`**, which was applied to production before
  the environment split (see [environments.md](environments.md)). The general rule still holds for
  the next one: a deploy does not migrate, so a feature adding tables fails at
  request time however green the build looks.
- Bot picks are stored as well as the human's, though only the human's are
  replayed — the bots' are a deterministic function of the seed, so feeding
  them back would assert them twice. They are kept for readability and to give
  milestone B's smarter bots something to be compared against.
