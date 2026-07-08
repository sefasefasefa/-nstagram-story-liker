---
name: Silent route-mounting failures
description: A router module can exist, be fully implemented, and still be dead code if it's never imported/mounted in the central routes/index.ts — causes confusing 404s that look like frontend bugs.
---

## Symptom
Frontend calls an endpoint, gets a 404 (or the whole feature silently does nothing), but the route handler code looks complete and correct when read in isolation.

## Root cause pattern
`routes/index.ts` (or equivalent central router) explicitly imports and `router.use()`s each sub-router. If a sub-router file is added/kept but its import + `.use()` line is missing, every route it defines 404s — nothing in the file itself indicates this, since the code is syntactically valid and only fails at the mounting layer.

**Why:** Express (and similar frameworks) require explicit mounting; there's no auto-discovery, so a forgotten import is invisible unless you specifically diff the sub-router's exported paths against what's mounted.

## How to apply
When a reported bug is "this whole feature does nothing" / "never even attempts X" rather than "X fails with an error", check the central router file first: list every router import there against every router file in the directory. A file present but not imported is the bug.

Also watch for the inverse smell: two router files defining the same path (e.g. `/session` in both `auth.ts` and `session.ts`) — the one mounted first silently shadows the other, creating dead code that looks live.
