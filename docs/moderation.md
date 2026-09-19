# Moderation

Owner-only, and deliberately small. `users.is_admin` is the flag; there is no
moderator role beyond it yet.

- **Suspend and hide are the primary verbs; delete is the last resort.** There
  is no point-in-time recovery on this plan, so a wrong delete cannot be undone
  from anywhere. Both delete actions require the cube name or username typed
  exactly, and `check:cube-ownership` fails the build if either stops
  *comparing* that confirmation — checking only that the word `confirm` appears
  let a mutation through that deleted the guard and left the variable behind.
- **`canViewCube` is still the one read rule**, now taking `hiddenAt` and
  `ownerSuspendedAt`. Those live on `ViewableCube` as a required type rather
  than being read loosely, so adding a moderation state breaks every call site
  that has not considered it — which is how the check scripts caught up.
- **A hidden cube stays visible to its owner; a suspended account's cubes do
  not, even to the owner.** Hiding tells the owner why, on the page, because
  otherwise they conclude the site is broken and email about it. Suspension is
  the account being switched off, so it applies to them too. Admins see
  everything, since reviewing what you hid is the job.
- **Suspension stops the account acting, not only being seen.** `suspensionError`
  is checked in `requireOwnedCube`, `createCubeAction`, the clone path, the draft
  gate and the follow gate. It was missing at first: a suspended account could go
  on creating and editing cubes — invisible to everyone, but still accumulating
  against the 25-cube ceiling, and a suspension that lets you keep working is not
  one. Read paths deliberately do **not** use it, because the moderator still has
  to look at what the account made. `check:moderation` asserts every write gate
  calls it.
- **`is_admin` is not writable from the web at all.** No form field, no action,
  no input reaches it — the only ways to set it are SQL and the dev-only
  `dev:login --admin`. A moderator therefore cannot be created by a bug in a
  form, only by someone with database access.
- **`canUseCube` is separate from `canViewCube`**: readable is not usable.
  Cloning, drafting and following all go through the stricter one, so a hidden
  cube cannot be copied out from under the moderation by its own owner.
- **The exclusion lives in `conditions()` in `discovery.ts`, above the
  `includeNonPublic` branch**, so it applies to *every* listing — Explore, a
  profile, the followed tab, the sitemap, and the owner's own `/cubes`. That
  last one is the point: the owner's list is where a hidden cube would
  otherwise still be advertised.
- **`moderation_log` is outside every cascade.** `actor_id` sets null and
  `target_id` is deliberately not a foreign key, because the record has to
  outlive both the moderator and the thing acted on; `snapshot` is the only
  trace a deleted cube or account leaves. Unlike `recordCubeChange`, logging
  here does **not** swallow failures, and it is written *before* the action, so
  an action with no audit trail cannot happen.
- Deleting an account deletes the **`auth.users`** row, not just the profile.
  Deleting the public row alone would leave an auth account that can still sign
  in and claim a fresh username on `/welcome` — the same person, a clean slate,
  no record.
