# Status and roadmap

## What is shipped

Working: card ingestion (**production** 1,294 printings / 966 `base_id` groups
across 8 sets; **dev** 1,288 / 960 — the difference is production's six
riftscribe token rows, see [environments.md](environments.md)). **The card browser
collapses to fewer than that** — 935 production / 929 dev — because 31 of those
groups are promo treatments the source spells in the name; see the `collapseKey`
bullet in [printings.md](printings.md). Also working:
`/cards` browser, magic-link auth with username claim, cube CRUD, the staged
edit panel, visual and text views, primer, change log, the public cube view with
Share and Clone, and CI.

**Bulk import has shipped** — paste a card list on the editor's Import tab,
preview exactly what matched, then commit.

**Cube analytics has shipped** — the Analytics tab on any cube page.

**Solo bot drafting has shipped, and its settings are configurable** — choose
seats, packs, pack size and reserved legend/battlefield slots, then draft
against bots. Milestone B makes the bots smart; milestone C adds the post-draft
deck builder. See "Draft".

**Export to Draftmancer has shipped** — any cube downloads as a Draftmancer
Custom Card List, so eight people can draft it in a browser today rather than
waiting on multiplayer lobbies. See "Exports".

**Crack-A-Pack has shipped** — the third tab on the draft settings screen draws
one pack as a single high-resolution image to post, replacing the screenshots
creators were taking of the pack view. It renders server-side because Riot's card
CDN sends no CORS headers, which makes it the first feature where card art costs
us bandwidth, and the reason it is the one export that needs an account. See
"Crack-A-Pack".

Open items:
- **The production origin is derived from the request**, not from config —
  `resolveSiteUrl` reads the forwarded host, so cubebound.gg, preview
  deployments and localhost each build their own correct magic-link and share
  URLs. The live domain must stay on the Supabase redirect allowlist; see
  "Auth and data access" for what breaks when it isn't.

- Feature work lands on a branch and pushes to
  `github.com/cubebound/cubebound`; `master` is production — see
  "Environments".

## Product vision

Later phases, in priority order:
1. Search syntax (`domain:fury cost:2 type:unit`)
2. ✅ Cube analytics — energy curve, domains, types, rarity, rules-text length, keywords. See "Analytics".
3. Solo bot drafting — **milestone A is done, ahead of 1 and 2 by request**
4. Multiplayer draft lobbies (websockets)
5. Community features (clone, changelogs, card pick data)
6. Exports (proxy sheets, deck lists compatible with other Riftbound tools) —
   **the Draftmancer cube export landed early, by request**, like solo drafting
   did before it. The reasoning was that it substitutes for item 4 at a fraction
   of the cost: Draftmancer already runs multiplayer drafts in a browser, so a
   cube file gets people drafting together without us writing a websocket
   server. Proxy sheets and the rest of item 6 are still unbuilt.

## Phase 1 milestones

1. ✅ Scaffold — Next.js + Tailwind + Drizzle + Supabase, env setup, CI.
2. ✅ Card ingestion — sync script, all sets, per-set counts verified.
3. ✅ Card browser — `/cards`, filters for set/domain/type/rarity, name search.
4. ✅ Auth + profiles — magic links, username claim.
5. ✅ Cube CRUD — create/edit/delete, add/remove cards, sections.
6. ✅ Cube view — public page, domain/cost grouping, view toggle, clone.
7. ✅ Deploy to Vercel with the production domain — live at cubebound.gg.

Phase 1 is done, and so is bulk import. Then phase 2 in the order under
"Product vision", starting with search syntax. Do NOT build ahead of it.
