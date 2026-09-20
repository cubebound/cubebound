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
deck builder. See [draft.md](draft.md).

**Export to Draftmancer has shipped** — any cube downloads as a Draftmancer
Custom Card List, so eight people can draft it in a browser. It is not a
stopgap for multiplayer lobbies: those are parked, and this is the answer
instead. See [exports.md](exports.md).

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

## Build order

**The [cubebound build order](https://claude.ai/artifact/5xyrDck2rNoMExUoVtrqGW) doc
is the roadmap, and it is the only authoritative copy.** It carries each item's
reasoning and your own note deciding it. The list below is a **snapshot taken on
19 September 2026** so a session with no access to that doc is not flying blind;
where the two disagree, the doc wins, and if you are about to start something,
open it rather than trusting this.

**Now**

1. ✅ CLAUDE.md cleanup, before any feature. Merged `6175c9a`, `1081b67`, `389ce8e`.
2. ✅ The Legacy booster becomes the default everywhere. Merged `195a160`.
3. **Account deletion.** `/privacy` and `/settings` both promise it and it does not
   exist; `deleteUserAccount` today is admin-only and refuses self-deletion. Those
   two pages change in the same commit as the button. See [auth.md](auth.md) and
   [moderation.md](moderation.md).
4. **Investigate whether large imports are failing.** A 426-line buylist is the
   signal. Diagnosis before any fix, and `npm run stats` reports import sizes for
   exactly this. See [agents.md](agents.md).
5. Give a new cube somewhere to start.
5b. Rename a cube while cloning it, so a clone is not stuck with `copy-of-`.
6. Popularity %, placed carefully.

**Next**

7. Limited formats: a sealed tab, then retail products.
8. The Draftmancer round trip — a spike, not a build.
9. Smarter bots. Lower priority.

**Workflow** (items 10 to 14, all of which are about how the work gets done rather
than what ships)

10. ✅ Give Claude the data — `npm run stats`, the read-only production role, MCP.
11. ✅ The four agents in `.claude/agents/`.
12. Automation worth having.
13. How we work, changed.
14. ✅ CLAUDE.md, split by what it costs not to know. This doc set is that item.

**Parked, with the decision already made — do not re-argue these.** Multiplayer
draft lobbies are **not being built**: item 8, the Draftmancer handoff, is the
answer instead. Also parked: one shared filter expression language (the card pool
is small enough that it is not required yet), proxy sheets, a deck builder over a
drafted pool, cube snapshots, a public read API, surfacing draftability on the cube
page, and anything needing a migration. The doc records your reason for each.

**The old phase-2 list is superseded** and is only in git history now. It led with
search syntax and had multiplayer lobbies at item 4, and both of those are decided
the other way.

## Phase 1 milestones

1. ✅ Scaffold — Next.js + Tailwind + Drizzle + Supabase, env setup, CI.
2. ✅ Card ingestion — sync script, all sets, per-set counts verified.
3. ✅ Card browser — `/cards`, filters for set/domain/type/rarity, name search.
4. ✅ Auth + profiles — magic links, username claim.
5. ✅ Cube CRUD — create/edit/delete, add/remove cards, sections.
6. ✅ Cube view — public page, domain/cost grouping, view toggle, clone.
7. ✅ Deploy to Vercel with the production domain — live at cubebound.gg.

Phase 1 is done, and so is bulk import. What comes next is under "Build order"
above.
