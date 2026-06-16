# Plan 037: Orval Config Consolidation

> **Status:** ✅ Done
> **Phase:** Tech Debt & Architecture Review (cross-cutting)
> **Created:** 2026-06-16
> **Last Updated:** 2026-06-16
> **BACKLOG task:** TASK-058

> **Implementation note (2026-06-16):** Shipped as a **hand-authored CJS `index.js` +
> `index.d.ts` with no build step**, instead of the TS-source-compiled-to-`dist/` approach
> in the Technical Design below. Rationale: the repo's existing shared package
> `@store/eslint-config` ships authored `.js` directly with no build, and the root `build`
> script does not build `packages/*` — a compiled `dist/` would not exist after a fresh
> `npm ci`, breaking `generate:api` in CI. The factory return type is derived as
> `Parameters<typeof defineConfig>[0]` because orval (ESM-only) does not name-export its
> `ConfigExternal`/`ConfigFileType` config type. All acceptance criteria — including the
> primary zero-diff gate — pass; only the packaging mechanism differs.

---

## Overview

`apps/store-client/orval.config.ts` and `apps/store-admin/orval.config.ts` are effectively
identical — they differ by exactly one token (the project key: `storeClient` vs `storeAdmin`).
Every other field — input path, output mode, client, httpClient, mock flag, clean flag, mutator
override, and the `afterAllFilesWrite` prettier hook — is duplicated verbatim.

This plan extracts the shared config into a tiny factory function living under
`packages/orval-config` (name `@store/orval-config`), following the exact same pattern used
by `packages/eslint-config` and `packages/typescript-config`. Each frontend's
`orval.config.ts` is then reduced to a two-line call-site.

**Honest scope assessment:** This is a low-priority cosmetic refactor. It eliminates
approximately 25 lines of duplication across two files and reduces the risk of the two configs
diverging silently in the future. The payoff is small. The generated output must not change at
all — zero diff in `**/shared/api/generated/**` is the primary correctness criterion.

---

## Scope

### In Scope

- Create `packages/orval-config/` workspace package exporting `@store/orval-config`.
- Export a `createOrvalConfig({ name, outputDir? })` factory that returns a valid Orval
  `ConfigFileType` object.
- Rewrite `apps/store-client/orval.config.ts` to use the factory.
- Rewrite `apps/store-admin/orval.config.ts` to use the factory.
- Add `@store/orval-config` as a `devDependency` in both frontend `package.json` files.
- Verify that `npm run generate:api` from the repo root produces zero diff in generated files.

### Out of Scope

- Changing what the generated files contain.
- Modifying `apps/store-api/swagger.json`.
- Modifying `shared/api/instance.ts` in either frontend.
- Any application source code changes.
- Orval version upgrades.
- Changing the `generate:api` script names in any `package.json`.

---

## User Story

As a developer maintaining the monorepo, I want both frontend Orval configurations to share a
single factory function, so that changes to generation settings (mode, client, prettier hook,
etc.) only need to be made once and cannot silently drift between the two apps.

---

## Technical Design

### Package Structure

New workspace package modeled directly on `packages/eslint-config` and
`packages/typescript-config`:

```
packages/
  orval-config/
    package.json        — name: "@store/orval-config", version: "0.1.0", private: true
    index.ts            — exports createOrvalConfig factory
    tsconfig.json       — minimal: extends @store/typescript-config/base, compilerOptions.outDir
    dist/
      index.js          — compiled output (main entry point)
      index.d.ts        — type declarations
```

The package is compiled (CJS) before being consumed, consistent with how `@store/eslint-config`
ships a plain `.js` file. `orval.config.ts` in each frontend is executed by the `orval` CLI
via `ts-node` or `tsx` at generation time, so the consumed package simply needs a `main` field
pointing to the compiled `dist/index.js`.

### Factory Signature

```typescript
import type { ConfigFileType } from "orval";

export interface OrvalAppConfig {
  /** The Orval project key — becomes the top-level key in the config object. */
  name: string;
  /**
   * Path to the OpenAPI input file, relative to the consuming workspace root.
   * Defaults to "../store-api/swagger.json".
   */
  inputTarget?: string;
  /**
   * Directory prefix for generated output files, relative to consuming workspace root.
   * Defaults to "src/shared/api/generated".
   */
  outputDir?: string;
}

export function createOrvalConfig(config: OrvalAppConfig): ConfigFileType;
```

The function encodes all shared settings and allows callers to supply only what differs.

### Resulting call-sites

`apps/store-client/orval.config.ts` (after):

```typescript
import { defineConfig } from "orval";
import { createOrvalConfig } from "@store/orval-config";

export default defineConfig(createOrvalConfig({ name: "storeClient" }));
```

`apps/store-admin/orval.config.ts` (after):

```typescript
import { defineConfig } from "orval";
import { createOrvalConfig } from "@store/orval-config";

export default defineConfig(createOrvalConfig({ name: "storeAdmin" }));
```

### Risk: Relative Mutator Path

The current `mutator.path` value is `"./src/shared/api/instance.ts"`. This path is relative
to the **consuming app's working directory** at the time `orval` runs, not to the package.
Because Orval resolves the mutator path from the config file's location (which stays in the
app root), this path continues to resolve correctly after extraction into the factory. However,
it must remain a parameter passed in by the factory rather than hardcoded as a relative path
within the package itself — any future attempt to move the factory call or change directory
structure could silently break resolution.

**Mitigation:** The factory should document in a comment that `mutator.path` is resolved
relative to the consuming app root (i.e., where `orval.config.ts` lives), not relative to the
package. An optional `mutatorPath` parameter on `OrvalAppConfig` can be added if apps ever
need to override it. The default stays `"./src/shared/api/instance.ts"`.

---

## Tasks

### TASK-058-A: Create `packages/orval-config` workspace package

**Type:** chore
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `packages/orval-config/package.json` exists with `name: "@store/orval-config"`,
      `version: "0.1.0"`, `private: true`, `main: "dist/index.js"`, and a `build` script
      (`tsc`).
- [ ] `packages/orval-config/tsconfig.json` extends `@store/typescript-config/base` and
      sets `outDir: "dist"`, `declaration: true`.
- [ ] `packages/orval-config/index.ts` exports `createOrvalConfig` implementing the
      factory described in the Technical Design section.
- [ ] `packages/orval-config/dist/index.js` and `dist/index.d.ts` are produced by
      `npm run build -w packages/orval-config` without errors.
- [ ] The factory default values reproduce the current configs exactly:
  - `input.target`: `"../store-api/swagger.json"`
  - `output.mode`: `"tags-split"`
  - `output.target`: `"src/shared/api/generated/endpoints.ts"`
  - `output.schemas`: `"src/shared/api/generated/models"`
  - `output.client`: `"react-query"`
  - `output.httpClient`: `"axios"`
  - `output.mock`: `false`
  - `output.clean`: `true`
  - `output.override.mutator.path`: `"./src/shared/api/instance.ts"`
  - `output.override.mutator.name`: `"customInstance"`
  - `hooks.afterAllFilesWrite`: `"prettier --write"`

**Files to create:**

- `packages/orval-config/package.json` — package manifest
- `packages/orval-config/tsconfig.json` — TypeScript config
- `packages/orval-config/index.ts` — factory implementation

---

### TASK-058-B: Add `@store/orval-config` devDependency to both frontend apps

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (under 30 min)
**TDD Required:** No
**Depends on:** TASK-058-A

**Acceptance Criteria:**

- [ ] `apps/store-client/package.json` lists `"@store/orval-config": "^0.1.0"` under
      `devDependencies`.
- [ ] `apps/store-admin/package.json` lists `"@store/orval-config": "^0.1.0"` under
      `devDependencies`.
- [ ] `npm install` (or `npm ci`) at the repo root resolves the workspace symlink without
      errors — confirmed by `node_modules/@store/orval-config` pointing into
      `packages/orval-config`.

**Files to modify:**

- `apps/store-client/package.json` — add devDependency
- `apps/store-admin/package.json` — add devDependency

---

### TASK-058-C: Rewrite both `orval.config.ts` files to use the factory

**Type:** refactor
**Scope:** store-client, store-admin
**Complexity:** S (under 30 min)
**TDD Required:** No
**Depends on:** TASK-058-A, TASK-058-B

**Acceptance Criteria:**

- [ ] `apps/store-client/orval.config.ts` imports `createOrvalConfig` from
      `@store/orval-config` and calls `defineConfig(createOrvalConfig({ name: "storeClient" }))`.
      The existing comment block about static spec generation should be preserved — move it to
      the factory's JSDoc or retain as a comment in the call-site above the `import`.
- [ ] `apps/store-admin/orval.config.ts` imports `createOrvalConfig` from
      `@store/orval-config` and calls `defineConfig(createOrvalConfig({ name: "storeAdmin" }))`.
- [ ] Each file is 5-8 lines total (import + comment + export default).
- [ ] `npm run generate:api -w apps/store-client` completes without error.
- [ ] `npm run generate:api -w apps/store-admin` completes without error.

**Files to modify:**

- `apps/store-client/orval.config.ts` — replace body with factory call
- `apps/store-admin/orval.config.ts` — replace body with factory call

---

### TASK-058-D: Verification gate — zero generated-file diff + full build green

**Type:** chore
**Scope:** shared
**Complexity:** S (under 1h)
**TDD Required:** No
**Depends on:** TASK-058-C

This is the acceptance gate for the entire TASK-058 feature. It confirms the refactor is
purely cosmetic: the generated output is byte-for-byte identical and nothing downstream breaks.

**Acceptance Criteria:**

- [ ] Run `npm run generate:api` from repo root. `git diff -- apps/store-client/src/shared/api/generated apps/store-admin/src/shared/api/generated` reports **zero changes**. This is the primary correctness criterion.
- [ ] `npm run typecheck` passes across all workspaces (no new type errors from the factory
      or the rewritten config files).
- [ ] `npm run build` passes for `store-client` and `store-admin`.
- [ ] `npm run lint` passes for `store-client` and `store-admin`.
- [ ] `npm run test -w apps/store-api` remains green (no backend regression).
- [ ] Pre-commit hook does not flag any Orval-generated files as modified.

**Files to verify (read-only check, no edits):**

- `apps/store-client/src/shared/api/generated/` — must be unchanged
- `apps/store-admin/src/shared/api/generated/` — must be unchanged

---

## Migration Steps

1. Build and validate the `packages/orval-config` package in isolation (TASK-058-A).
2. Wire it as a devDependency in both frontends, run `npm install` to create the workspace
   symlink (TASK-058-B).
3. Rewrite both `orval.config.ts` call-sites (TASK-058-C).
4. Run the full verification gate to confirm zero generated-file diff (TASK-058-D).

---

## Risks & Mitigations

| Risk                                                                                   | Mitigation                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutator `path` resolves relative to the wrong directory after extraction               | The path `"./src/shared/api/instance.ts"` is always relative to the app root (where `orval` is invoked), not to the package. Keep it a parameter default, not a package-internal constant. Verify with `npm run generate:api` in each workspace.                                                         |
| `@store/orval-config` package needs to be built before `orval.config.ts` can import it | Add a `build` script to `packages/orval-config/package.json` and run it before the first `generate:api`. In CI, add `npm run build -w packages/orval-config` before the generate step, or use `ts-node`/`tsx` interop if the orval CLI resolves `.ts` config imports via the consuming app's `tsconfig`. |
| Orval CLI's `defineConfig` type may not accept the return type of the factory          | Use `import type { ConfigFileType } from "orval"` as the explicit return type annotation in the factory. Run `typecheck` to confirm.                                                                                                                                                                     |
| Drift between factory defaults and the original configs                                | TASK-058-D's zero-diff gate catches any mismatch immediately.                                                                                                                                                                                                                                            |

---

## Notes

- This task is marked **low priority** and explicitly **low-payoff** (~25 lines removed).
  Do not invest more than half a day total across all sub-tasks.
- The `"generate:api"` scripts in both frontends remain `"orval --config orval.config.ts"` —
  unchanged. The root proxy `"generate:api"` also stays unchanged. This is a config-internals
  refactor only.
- The `packages/orval-config` package follows the naming convention `@store/*` and the
  `private: true` + `version: "0.1.0"` pattern of both existing shared packages.
- If the Orval CLI version is ever upgraded, only `packages/orval-config/package.json`'s
  `peerDependencies` (or devDependencies) needs updating rather than both frontend
  `package.json` files.
- `docs/plans/036-monorepo-architecture-review.md` (finding D-3) is the source of this task.
  TASK-054-D recorded: "Consolidate the near-identical `orval.config.ts` files (differ only
  by project key) into a shared factory under `packages/`."
