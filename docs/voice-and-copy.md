# Voice and copy

## The register

- **The rest of the voice**, derived from the copy that was already there and
  worth keeping to: plain and declarative, no exclamation marks and no
  marketing verbs; say the consequence rather than only the rule ("so shared
  links keep working"); name a tradeoff instead of hiding it; contractions
  throughout; second person and active. **One verb per concept** — it is *sign
  in* and *sign out* everywhere, never "log out"; a generic "you must be
  authenticated" error is always "You need to be signed in.", and where the
  action can be named, name it ("Sign in to clone this cube.").

## The checks that constrain copy

**Three checks constrain user-facing copy, which is easy to forget when the
change in hand looks like a wording tweak.** `check:oauth-buttons` requires
`/login` to keep the two-sided same-address warning — reword it freely, remove
it and the build fails, which is the point, since dropping half that guidance
is what pushes people into making the duplicate account it exists to prevent.
`check:cube-ownership` requires the two delete confirmations to keep
*comparing* the typed name; the prose around them is free, the comparison is
not. `check:public-cube` asserts a cube page still offers Share and Clone by
those exact labels. Run all three after a copy pass.
