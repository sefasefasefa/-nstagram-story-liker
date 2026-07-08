---
name: Artifact registration for imported projects
description: How to properly register pre-existing artifact directories as Replit artifacts, and the critical port-mapping rule that prevents SecFetch Policy violations.
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

## CRITICAL: .replit port mapping must point to the FRONTEND port
`[[ports]] localPort = <frontend_port> externalPort = 80`

**Never** map the API server port to externalPort 80. If the API server claims port 80, all browser requests go to Express directly — bypassing Vite's proxy — and Replit's proxy returns "SecFetch Policy violation" because the request is treated as cross-service.

**Why:** Replit's proxy checks Sec-Fetch headers between services. The only safe path is all browser traffic → Vite (port 80) → Vite proxy → Express (internal port). This keeps everything same-origin from the browser's perspective.

## Artifact routing for frontend+API pattern
- Frontend artifact (`paths = ["/", "/api"]`, localPort = <vite_port>): claims ALL paths including /api
- API server artifact (`paths = []`, no external routing): internal only
- Vite config proxy: `'/api' → 'http://127.0.0.1:<api_port>'`

This way the Replit router sends everything to Vite, Vite proxies /api internally, and no cross-service SecFetch check ever fires.

## Router note
`router = "application"` in `.replit [deployment]` requires registered artifacts for dev preview routing. Without them, the preview shows a blank page even with `[[ports]]` mappings. `createArtifact` sets `router = "path"` in the new artifact.toml, which works correctly.

## Registering via existing artifact.toml (in place, no scaffold)
If `createArtifact`/import tooling registers an artifact directly against an existing `artifacts/<name>-backup/` dir (rather than creating a fresh scaffold at the canonical slug), the directory name itself becomes the permanent artifact path — there's no supported rename flow (no callback moves an artifact's directory). Leaving the `-backup` name is safe/cosmetic as long as it's the only dir with that package name (no port conflicts). Just double check `services.production.run.args` in that artifact's toml — it may still reference the old canonical path (e.g. `artifacts/api-server/dist/index.mjs`) even though the real dir is `artifacts/api-server-backup`; fix via `verifyAndReplaceArtifactToml`.

## CORS regex
Must be fully anchored for credentialed requests:
`/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https:\/\/[a-z0-9-]+\.replit\.dev(:\d+)?$/`
The unanchored form `\.replit\.dev$` was valid but any `.replit.dev` subdomain could make credentialed API calls.
