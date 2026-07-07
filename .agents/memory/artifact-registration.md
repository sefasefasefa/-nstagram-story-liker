---
name: Artifact registration for imported projects
description: How to properly register pre-existing artifact directories as Replit artifacts
---

## Rule
Imported projects with existing `artifacts/<slug>/` dirs and `artifact.toml` files are NOT registered in Replit's artifact system — `listArtifacts()` returns empty. Without registration, `router = "application"` in `.replit` blocks the preview entirely.

## Fix sequence
1. Move existing artifact dirs to backups (`mv artifacts/<slug> artifacts/<slug>-backup`)
2. Call `createArtifact()` — this registers the artifact AND creates scaffold files at the original path
3. Copy original source files over the scaffold (`cp -r artifacts/<slug>-backup/src/* artifacts/<slug>/src/`, plus vite.config, tsconfig, package.json, etc.)
4. Delete backup dirs (they share the same package name, causing port conflicts in managed workflows)
5. Kill any stale processes on the artifact ports (`lsof -i :<port> | awk 'NR>1{print $2}' | xargs kill -9`)
6. Start managed workflows with `WorkflowsRestart { name: "artifacts/<slug>: <service>" }`

**Why:** The managed workflow runs `pnpm --filter @workspace/<slug> run dev` — if a backup dir also has the same package name, pnpm runs the command in BOTH dirs, causing port conflicts.

## Router note
`router = "application"` in `.replit [deployment]` requires registered artifacts for dev preview routing. Without them, the preview shows a blank page even with `[[ports]]` mappings. `createArtifact` sets `router = "path"` in the new artifact.toml, which works correctly.
