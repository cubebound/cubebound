# Routes

```
/                                     landing
/cards                                card browser (milestone 3)
/guides/riftbound-cube-drafting       the format explained — static, no data
/privacy                              privacy policy — static, must match the code
/explore                              public cube search — ?q= &card= &sort= &page=
/u/{username}                         public profile — their public cubes; ?q= &page=
/profile                              redirect to your own /u/{username}
/settings                             account settings — sign-in methods, delete your account
/login  /welcome  /auth/callback      magic link, username claim, PKCE exchange
/cubes  /cubes/new                    the signed-in user's cubes; ?tab=followed &q= &page=
/cube/{username}/{slug}               public view — visibility-gated;
                                      307s the cube's own owner to /edit
/cube/{username}/{slug}/edit          owner editor;
                                      ?mode=maybeboard|primer|analytics|log|browse|import
/cube/{username}/{slug}/settings      rename, visibility, delete
/cube/{username}/{slug}/draft         solo draft against bots — any viewer, not just the owner
                                      ?draft={id} opens a specific one, else the latest
                                      ?new=1 is the settings screen:
                                      Draftmancer export | bots | Crack-A-Pack
/cube/{username}/{slug}/draftmancer.txt  the cube as a Draftmancer Custom Card List
                                      ?packSize= &legendSlots= &… is the pack template;
                                      a route handler, so it gates itself — see [exports.md](exports.md)
/cube/{username}/{slug}/pack.png      one pack drawn as an image — see [crack-a-pack.md](crack-a-pack.md)
                                      ?seed= &packSize= &… regenerates it deterministically;
                                      ?tier=preview is the on-page size, ?dl=1 downloads;
                                      needs an account, unlike the export beside it
/drafts                               every draft the signed-in user has sat in
/robots.txt  /sitemap.xml             crawl rules; static pages + public cubes and profiles
/opengraph-image                      share previews — also under /cube/… and /u/…
```

Server Actions live in `src/app/cube/actions.ts`, `src/app/auth/actions.ts`,
`src/app/cube/[username]/[slug]/draft/actions.ts`, `src/app/explore/actions.ts`,
`src/app/moderation/actions.ts` and `src/app/settings/actions.ts`.
