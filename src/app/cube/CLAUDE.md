`actions.ts` holds every cube mutation, and each one goes through `requireOwnedCube`.

Read before changing a file in this directory: [docs/cube-access.md](../../../docs/cube-access.md).

Directories beneath this one carry their own `CLAUDE.md`. This file governs the
files directly in `src/app/cube/` only, so ignore it when you are working deeper.

Rules live in those docs and in the root [CLAUDE.md](../../../CLAUDE.md), never in this file.
