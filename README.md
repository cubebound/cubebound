# cubebound.gg

Cube construction and drafting for [Riftbound](https://riftbound.leagueoflegends.com/),
Riot's League of Legends TCG. Think Cube Cobra, but Riftbound-native.

Live at **[cubebound.gg](https://cubebound.gg)**.

Build a cube from the full card pool, organise it by domain, cost and type,
write a primer explaining how it drafts, and share a public page anyone can
browse, clone or draft against bots.

> Unofficial fan project. cubebound.gg is not endorsed by Riot Games and does
> not reflect the views or opinions of Riot Games or anyone officially involved
> in producing or managing Riot Games properties.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in your own Supabase project
npm run db:migrate           # apply migrations
npm run sync-cards           # pull the card pool (~1,300 printings, no API key)
npm run dev
```

`.env.example` documents every variable and which ones are optional.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Drizzle ORM · Postgres and auth
via Supabase · deployed on Vercel. Card images are served from the source CDN
and never proxied or stored.

## Working on it

**Read [CLAUDE.md](CLAUDE.md) first.** It is the orientation document: the game's
domain model, the schema, the conventions, and — more usefully — the reasoning
behind decisions that look arbitrary until you know what broke. It is kept true
in the same commit as the code it describes.

```bash
npm run typecheck
npm run lint
npm run check:draft           # and the other checks; see CLAUDE.md
```

Each `check:*` script guards a regression that has already happened once. The
pure ones run in CI; the rest need a live Supabase and are a documented
pre-deploy gate.
