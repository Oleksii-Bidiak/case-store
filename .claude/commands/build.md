---
description: Build all workspaces
allowed-tools: Bash(npm run build:*), Bash(npm run typecheck:*)
---

Build all workspaces in the monorepo.

1. Run `npm run build` to build all workspaces.
2. If any workspace fails, identify the error and suggest fixes.
3. After a successful build, run `npm run typecheck` to verify TypeScript types.
4. Report the build status for each workspace.
