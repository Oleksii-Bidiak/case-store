# Plan 036: Monorepo Architecture Review — Tech Debt Cleanup

> **Status:** ✅ Done
> **Phase:** Tech Debt & Architecture Review (cross-cutting)
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-16
> **BACKLOG task:** TASK-054 (subtasks TASK-054-A through TASK-054-E)

---

## Overview

This plan covers a targeted tech-debt cleanup across the monorepo's configuration layer. It does **not** touch application code (no business logic, no Prisma schema, no Orval-generated files). The work is divided into four cleanup sub-tasks (A–D) plus a final verification gate (E).

The BACKLOG description for TASK-054 explicitly calls for a "findings doc + cleanup task breakdown." This document serves as both.

---

## User Story

As a developer maintaining the monorepo, I want all workspace scripts, TypeScript configurations, and CLI tooling to follow a single coherent convention, so that slash commands, root-level proxies, and per-workspace npm scripts are predictable and free of silent drift.

---

## Scope

### In Scope

- Standardize `db:*` / `prisma:*` script naming across root and workspace `package.json` files.
- Add missing root-level proxy scripts (`db:seed`, `db:push`, `db:migrate`, `db:studio`, `generate:api`).
- Align root script names with what `/db-push`, `/db-migrate`, `/db-seed`, `/db-studio`, and `/generate-api` slash commands actually invoke.
- Fix `packages/typescript-config/base.json` — replace deprecated `moduleResolution: "node"` (node10) with `node16`.
- Remove compiler-option duplication from `apps/store-api/test/tsconfig.e2e.json` — redirect it to extend `@store/typescript-config/nest` instead of the local `tsconfig.json` and re-declaring options by hand.
- Assess and action `@nestjs/cli` bump from `^10.4.9` to `^11.x` to clear `DEP0190` child-process shell warning.
- Document any workspace-boundary or shared-config placement issues found.

### Out of Scope

- Prisma schema changes.
- Application source code changes (`src/`).
- Orval-generated file changes — the pre-commit hook blocks these and they must not be touched.
- Changing workspace boundaries (adding or removing npm workspaces).
- ESLint configuration changes (separate concern).
- CI/CD pipeline changes.
- Frontend `tsconfig.json` files (both `store-client` and `store-admin` already extend `@store/typescript-config/next` correctly and override `moduleResolution: "bundler"` — no drift there).

---

## Findings

This section is the "findings doc" requested in the BACKLOG description. All issues below were verified by reading the actual files in the repository.

### F-1: Missing root-level `db:*` proxy scripts

**Files:** `D:\projects\store-ai\package.json` (root)

The root `package.json` `scripts` block contains only:

```json
"build", "lint", "test", "test:e2e", "typecheck", "prepare"
```

There are **no** `db:*` or `prisma:*` proxy scripts at the root. Developers must `cd apps/store-api` before running any database command, which is not how slash commands work (they run from the repo root).

**Slash command analysis:**

| Slash Command   | Invokes                                                                                | Root script exists?    |
| --------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `/db-push`      | `npx prisma db push` (raw npx, not a script)                                           | No                     |
| `/db-migrate`   | `npx prisma migrate dev ...` (raw npx, not a script)                                   | No                     |
| `/db-seed`      | `npx prisma db seed --schema=apps/store-api/prisma/schema.prisma`                      | No                     |
| `/db-studio`    | `npx prisma studio --schema=apps/store-api/prisma/schema.prisma`                       | No                     |
| `/generate-api` | References `npm run generate-api` in the description but the actual command is unclear | No root `generate:api` |

The slash commands currently call `npx prisma ...` directly with the `--schema` flag, which is workable but not aligned with the declared `prisma:*` scripts in the workspace `package.json`.

**Workspace `store-api` script names:**

```json
"prisma:generate": "prisma generate --schema=prisma/schema.prisma",
"prisma:migrate":  "prisma migrate dev --schema=prisma/schema.prisma",
"prisma:studio":   "prisma studio --schema=prisma/schema.prisma"
```

Note: the workspace has **no** `prisma:push` (db push) and **no** `db:seed` script even though `package.json` declares a `prisma.seed` entry (used by `prisma db seed` directly). There is also no workspace `swagger:generate` or `generate:api` alias; the API spec export is named `swagger:export`.

**Frontend workspaces** (`store-client`, `store-admin`) each have:

```json
"generate:api": "orval --config orval.config.ts"
```

There is no root proxy that fans out `generate:api` to both workspaces, so `/generate-api` has no consistent npm script to call.

**Decision needed:** Standardize on one naming prefix (`db:*` at root, `prisma:*` in workspace) or unify both. The recommended approach is:

- Root: `db:push`, `db:migrate`, `db:seed`, `db:studio`, `db:generate` (proxy into workspace commands).
- Workspace (`store-api`): keep existing `prisma:*` names (they are internal to the workspace); add `prisma:push` and `prisma:seed` to complete the set.
- Root: `generate:api` fanning out to both frontend workspaces.

### F-2: Deprecated `moduleResolution: "node"` in `packages/typescript-config/base.json`

**File:** `D:\projects\store-ai\packages\typescript-config\base.json`

```json
"moduleResolution": "node"
```

`"node"` is the legacy Node10 resolver, deprecated in TypeScript 4.7+. TypeScript now warns on it. The correct value for a CommonJS NestJS build is `"node16"` (or `"nodenext"`).

**The drift:** `nest.json` already overrides this correctly:

```json
"module": "node16",
"moduleResolution": "node16"
```

So any project extending only `base.json` (not `nest.json`) would silently inherit the deprecated resolver. Currently no workspace extends `base.json` directly — `store-api` extends `nest.json` and both Next.js apps extend `next.json`. However `base.json` is the published source of truth and should be correct on its own.

**`next.json`** overrides `moduleResolution` to `"bundler"` via its own `compilerOptions`, so it is not affected by the `base.json` value either.

**Fix:** Change `"moduleResolution": "node"` to `"moduleResolution": "node16"` in `base.json`, and remove the redundant `"module": "node16"` + `"moduleResolution": "node16"` from `nest.json` (since they would then be inherited). Keep `nest.json`'s NestJS-specific options (`experimentalDecorators`, `emitDecoratorMetadata`, `incremental`) which are genuinely nest-specific.

### F-3: `apps/store-api/test/tsconfig.e2e.json` re-declares compiler options by hand

**File:** `D:\projects\store-ai\apps\store-api\test\tsconfig.e2e.json`

Current content extends `../tsconfig.json` (the workspace root config, which already extends `@store/typescript-config/nest`) but then re-declares many of the same options:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "node16",
    "moduleResolution": "node16",
    "isolatedModules": true,
    "declaration": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "target": "ES2021",
    "lib": ["ES2021"],
    "outDir": "./dist",
    "rootDir": ".",
    "paths": { "@/*": ["../src/*"] },
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "types": ["jest", "node"]
  },
  "include": ["../src/**/*", "./**/*"]
}
```

Options that are already declared in `@store/typescript-config/nest` (via `base.json`/`nest.json`) and therefore duplicated here: `module`, `moduleResolution`, `emitDecoratorMetadata`, `experimentalDecorators`, `esModuleInterop`, `target`, `lib`, `skipLibCheck`, `strict`.

Options that are legitimately local to the e2e config: `noEmit: true`, `isolatedModules: true` (test-specific), `rootDir: "."` (overrides workspace `src`), `paths` (test-relative alias), `types: ["jest", "node"]`, `include`.

**Fix:** Strip the hand-declared duplicates; keep only the local overrides. The result should be a minimal file that overrides only what differs for the e2e context.

**Note on `tsconfig.spec.json`:** `apps/store-api/tsconfig.spec.json` extends `./tsconfig.json` and adds `noEmit`, `isolatedModules`, `types`. This is already lean — no changes needed there.

### F-4: `apps/store-client/tsconfig.json` and `apps/store-admin/tsconfig.json` re-declare base options

**Files:** `D:\projects\store-ai\apps\store-client\tsconfig.json`, `D:\projects\store-ai\apps\store-admin\tsconfig.json`

Both files extend `@store/typescript-config/next` but then re-declare many options already defined in `next.json` or the base: `lib`, `allowJs`, `skipLibCheck`, `strict`, `noEmit`, `esModuleInterop`, `module`, `moduleResolution`, `resolveJsonModule`, `isolatedModules`, `jsx`, `incremental`, `plugins`.

Legitimately local options (not in `next.json`): `target: "ES2017"`, `rootDir: "."`, the expanded `paths` block (FSD layer aliases beyond the base `@/*`), the extended `include` list (adds `.next/dev/types/**/*.ts` and `**/*.mts`).

This is lower priority than F-2/F-3 (the redundancy causes no runtime errors), but can be cleaned up in the same pass. Scope this as optional within TASK-054-B or defer.

### F-5: `@nestjs/cli` version and `DEP0190` warning

**File:** `D:\projects\store-ai\apps\store-api\package.json`

```json
"@nestjs/cli": "^10.4.9"
```

Installed version: `10.4.9` (confirmed via `npm list`).

`DEP0190` is a Node.js deprecation warning: _"Passing `shell: true` to `child_process.spawn` is deprecated when no `shell` option is needed."_ This was emitted by `@nestjs/cli@10.x` when running `nest start`, `nest build`, etc., due to how the CLI spawned the TypeScript compiler. It was addressed in `@nestjs/cli@11.x` which was released alongside `@nestjs/common@11.x`.

**Important caveat:** The rest of the NestJS stack in `store-api` is pinned at `^10.x` (`@nestjs/common`, `@nestjs/core`, `@nestjs/testing`, etc.). Bumping only `@nestjs/cli` to v11 while keeping `@nestjs/common` at v10 is safe because `@nestjs/cli` is a `devDependency` (it only runs build/scaffold commands; it does not run at runtime). The NestJS CLI v11 supports building NestJS v10 applications.

**Recommendation:** Bump `@nestjs/cli` to `^11.0.0` and `@nestjs/schematics` to `^11.0.0` (the matching schematics package) in `apps/store-api/package.json`. Run `npm install` and verify `nest build` completes without the `DEP0190` warning. If runtime packages also need a bump, defer that to a separate `TASK-055` (NestJS v11 migration) — it is out of scope here.

### F-6: `generate-api` slash command references inconsistent script name

**File:** `D:\projects\store-ai\.claude\commands\generate-api.md`

The `allowed-tools` front-matter lists `Bash(npm run generate-api:*)` and `Bash(npm run generate:api:*)` — two different patterns covering both possible naming conventions. The body text says "Run `npm run generate-api`" but no root script with that name exists. The per-workspace script is `generate:api` (colon separator). This inconsistency means the slash command description could mislead an agent to run a nonexistent script.

**Fix:** Add a root `generate:api` script that fans out to both frontend workspaces; update the slash command body to reference it consistently.

### F-7: No `test` script in `store-admin`

**File:** `D:\projects\store-ai\apps\store-admin\package.json`

The root `package.json` runs `npm run test -w apps/store-admin`, but `store-admin` has no `test` script. This causes a silent failure (npm prints a warning and skips the workspace). This is a minor gap — `store-admin` has no tests yet — but it should have at minimum a `"test": "echo 'No tests yet' && exit 0"` stub so the root `test` command does not produce spurious warnings.

Similarly, `store-client/package.json` has `"test": "jest"` but no Jest config file was observed. This is acceptable for now (Jest will find no test files and exit 0), but is worth noting.

---

## Architecture Decisions

### AD-1: One naming prefix — `db:*` at root, `prisma:*` in workspace

Root scripts proxy to the workspace. This means developers running from the repo root always use `npm run db:push`, `npm run db:seed`, etc. The workspace's `prisma:*` names are preserved for workspace-specific runs (`npm run prisma:push -w apps/store-api`). Slash commands should call the root `db:*` scripts via `npm run db:...`.

### AD-2: Fix `base.json` — `"node16"` is the source of truth

`base.json` should declare `"moduleResolution": "node16"` so it is correct standalone. `nest.json` then removes its redundant `module`/`moduleResolution` re-declaration, keeping only the NestJS-specific additions. This makes the inheritance chain unambiguous: `base.json` → `nest.json` → `apps/store-api/tsconfig.json`.

### AD-3: `tsconfig.e2e.json` — minimal override only

Strip all options already inherited from the chain. The resulting file should have `noEmit`, `isolatedModules`, `rootDir`, `paths`, `types`, and `include` as the only local concerns.

### AD-4: `@nestjs/cli` bump is devDependency-only

Bump CLI + schematics to v11 in `store-api`. Do not touch `@nestjs/common`/`@nestjs/core` runtime packages — those require a full NestJS v11 migration and are out of scope.

---

## Task Breakdown

### TASK-054-A: Standardize `package.json` scripts — root proxies + `db:*` / `generate:api` alignment

**Type:** chore
**Scope:** store-api, store-client, store-admin (package.json files only)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none

**Problem addressed:** F-1, F-6, F-7

**Acceptance Criteria:**

- [ ] Root `package.json` gains `db:push`, `db:migrate`, `db:seed`, `db:studio`, `db:generate` proxy scripts that invoke the matching workspace commands via `npm run prisma:* -w apps/store-api` (or direct `npx prisma ...` with `--schema` flag, whichever is cleaner and consistent with how slash commands already work).
- [ ] Root `package.json` gains `generate:api` that fans out Orval generation to both `store-client` and `store-admin`: `npm run generate:api -w apps/store-client -w apps/store-admin`.
- [ ] `apps/store-api/package.json` adds `prisma:push` (`prisma db push --schema=prisma/schema.prisma`) to complete the `prisma:*` set.
- [ ] `apps/store-admin/package.json` gains a `test` stub: `"test": "echo 'No tests yet' && exit 0"` so the root `test` command does not warn.
- [ ] `.claude/commands/generate-api.md` body updated to reference `npm run generate:api` (the root proxy) consistently; `allowed-tools` header simplified to `Bash(npm run generate:api:*)`.
- [ ] `.claude/commands/db-push.md`, `db-migrate.md`, `db-seed.md`, `db-studio.md` bodies updated to reference the root `npm run db:*` scripts in step descriptions (where they currently call `npx prisma ...` directly) so they are consistent with the new root scripts.
- [ ] All existing root scripts (`build`, `lint`, `test`, `test:e2e`, `typecheck`) remain unchanged.
- [ ] `npm run db:seed` (from repo root) successfully seeds the dev database without needing to change directory.
- [ ] `npm run generate:api` (from repo root) successfully generates Orval hooks for both frontend workspaces.

**Files to create/modify:**

- `package.json` (root) — add `db:*` and `generate:api` scripts
- `apps/store-api/package.json` — add `prisma:push`
- `apps/store-admin/package.json` — add `test` stub
- `.claude/commands/generate-api.md` — align body + allowed-tools
- `.claude/commands/db-push.md` — update step 2 reference
- `.claude/commands/db-migrate.md` — update step 2 reference
- `.claude/commands/db-seed.md` — update step 3 reference
- `.claude/commands/db-studio.md` — update step 2 reference

---

### TASK-054-B: Consolidate TypeScript configs — remove `moduleResolution: "node"` drift

**Type:** chore
**Scope:** shared (packages/typescript-config), store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none (independent of TASK-054-A)

**Problem addressed:** F-2, F-3, F-4

**Acceptance Criteria:**

- [ ] `packages/typescript-config/base.json`: `"moduleResolution"` changed from `"node"` to `"node16"`. No other options changed.
- [ ] `packages/typescript-config/nest.json`: `"module": "node16"` and `"moduleResolution": "node16"` entries removed (now inherited from `base.json`). Remaining options (`experimentalDecorators`, `emitDecoratorMetadata`, `incremental`, and the `exclude` block) are preserved unchanged.
- [ ] `apps/store-api/test/tsconfig.e2e.json`: stripped to a minimal override — only `noEmit`, `isolatedModules`, `rootDir`, `paths`, `types`, and `include` remain as local declarations. All other options that are already in the inheritance chain (`module`, `moduleResolution`, `emitDecoratorMetadata`, `experimentalDecorators`, `esModuleInterop`, `target`, `lib`, `skipLibCheck`, `strict`, `declaration`) are removed.
- [ ] `apps/store-client/tsconfig.json` and `apps/store-admin/tsconfig.json`: remove options already declared in `@store/typescript-config/next` (`lib`, `allowJs`, `skipLibCheck`, `strict`, `noEmit`, `esModuleInterop`, `module`, `moduleResolution`, `resolveJsonModule`, `isolatedModules`, `jsx`, `incremental`, `plugins`). Retain local-only options (`target: "ES2017"`, `rootDir`, the FSD `paths` aliases, the extended `include` list).
- [ ] `npm run typecheck` (root) passes green across all three workspaces after the changes.
- [ ] `npm run build -w apps/store-api` passes green.
- [ ] `npm run test:e2e -w apps/store-api` passes green (e2e config still resolves correctly).

**Files to create/modify:**

- `packages/typescript-config/base.json` — change `moduleResolution`
- `packages/typescript-config/nest.json` — remove duplicated module/moduleResolution
- `apps/store-api/test/tsconfig.e2e.json` — strip re-declared options
- `apps/store-client/tsconfig.json` — strip re-declared options (optional/lower priority)
- `apps/store-admin/tsconfig.json` — strip re-declared options (optional/lower priority)

**Risk note:** Changing `base.json` affects all three extends chains simultaneously. If any workspace starts failing type-checking after the change, the most likely cause is a path or module resolution difference between `"node"` and `"node16"` for `.json` imports or non-`.ts` files. Rollback is `git checkout packages/typescript-config/base.json`. Run `typecheck` before committing.

---

### TASK-054-C: Bump `@nestjs/cli` to v11 to clear `DEP0190` warning

**Type:** chore
**Scope:** store-api (devDependency only)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none (independent)

**Problem addressed:** F-5

**Acceptance Criteria:**

- [ ] `apps/store-api/package.json` `devDependencies` updated: `"@nestjs/cli": "^11.0.0"` and `"@nestjs/schematics": "^11.0.0"`.
- [ ] `npm install` completes without peer-dependency conflicts.
- [ ] `npm run build -w apps/store-api` (`nest build`) completes without the `DEP0190` warning.
- [ ] `npm run start:dev -w apps/store-api` starts without the `DEP0190` warning.
- [ ] No changes to `@nestjs/common`, `@nestjs/core`, `@nestjs/testing`, or any other runtime `@nestjs/*` package.
- [ ] All unit tests pass: `npm run test -w apps/store-api`.
- [ ] All e2e tests pass: `npm run test:e2e -w apps/store-api`.

**Files to create/modify:**

- `apps/store-api/package.json` — bump `@nestjs/cli` and `@nestjs/schematics`
- `package-lock.json` — updated by `npm install` (expected)

**Risk note:** If `@nestjs/cli@11` introduces breaking scaffold changes (e.g., new default `tsconfig` templates), confirm that `nest build` still respects the project's existing `tsconfig.build.json`. The CLI v11 should be backward-compatible with NestJS v10 runtime — if it is not, revert and file a separate `TASK-055` for a full NestJS v11 upgrade.

---

### TASK-054-D: Directory layout and workspace boundary audit

**Type:** chore / docs
**Scope:** monorepo root
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none (can run in parallel with A–C; findings may create new tasks)

**Problem addressed:** workspace boundaries, shared config placement consistency

**Acceptance Criteria:**

- [ ] A written findings section (added as an appendix to this plan document, or as inline comments in the relevant config files) covering:
  - Whether `packages/eslint-config` and `packages/typescript-config` placement is correct and complete (currently both are correct — they are in `packages/` and referenced as workspace devDependencies).
  - Whether any `shared/` utilities exist that should be in a `packages/shared` workspace instead of duplicated across `apps/`.
  - Whether `apps/store-client` and `apps/store-admin` have diverged `orval.config.ts` files that could be consolidated into a shared config.
  - Whether Docker Compose volumes or environment files reference app paths that would break if workspace structure changed.
- [ ] Any actionable items found are added as new BACKLOG entries (do not implement them in this task — plan only).
- [ ] If no actionable items are found, a one-paragraph "no further action needed" note is added to this plan document.

**Files to create/modify:**

- `docs/plans/036-monorepo-architecture-review.md` — append findings as "Appendix: D Findings" section
- `BACKLOG.md` — add any newly discovered tasks

---

### TASK-054-E: Verification gate — build / lint / typecheck / tests all green

**Type:** chore
**Scope:** monorepo (all workspaces)
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-054-A, TASK-054-B, TASK-054-C, TASK-054-D

**Problem addressed:** Integration confirmation after cross-cutting config changes

**Acceptance Criteria:**

- [ ] `npm run typecheck` (root, fans out to all workspaces) exits 0.
- [ ] `npm run build` (root, fans out to all workspaces) exits 0.
- [ ] `npm run lint` (root, fans out to all workspaces) exits 0.
- [ ] `npm run test` (root, fans out to all workspaces) exits 0.
- [ ] `npm run test:e2e` exits 0.
- [ ] `npm run db:push` (new root script) runs without error against the dev database.
- [ ] `npm run db:seed` (new root script) runs without error against the dev database.
- [ ] `npm run generate:api` (new root script) generates files in `apps/store-client/src/shared/api/generated/` and `apps/store-admin/src/shared/api/generated/`.
- [ ] No Orval-generated files (`**/shared/api/generated/**`) were modified by any of the config changes in tasks A–D.
- [ ] Git status shows only the expected config-layer files changed; no `src/` files changed.
- [ ] `nest build` (in `store-api`) emits no `DEP0190` deprecation warning in its output.

**Files to create/modify:**

- `BACKLOG.md` — mark TASK-054 and sub-tasks complete after this gate passes

---

## Risks and Rollback

| Risk                                                                                          | Likelihood                                                                                                                                                           | Mitigation                                                                                                    |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `moduleResolution: "node16"` in `base.json` breaks a path alias or JSON import in a workspace | Low — all workspaces already override to `node16` or `bundler` in their own `nest.json`/`next.json`; `base.json` change has no net effect on existing extends chains | Run `typecheck` immediately after each file change; revert `base.json` if failures appear                     |
| `@nestjs/cli@11` is incompatible with NestJS runtime v10                                      | Low — CLI is a dev tool only; the NestJS team maintains backward CLI compatibility                                                                                   | Revert `@nestjs/cli` to `^10.4.9` and document the issue; open `TASK-055` for a full v11 runtime upgrade      |
| New root `db:*` scripts call the wrong schema path                                            | Low — commands currently call `--schema=apps/store-api/prisma/schema.prisma` from repo root; scripts should mirror this                                              | Smoke-test `npm run db:push` and `npm run db:studio` from repo root before committing                         |
| Stripping `tsconfig.e2e.json` options causes e2e test compilation to fail                     | Low — all stripped options are inherited from the parent chain                                                                                                       | Run `npm run test:e2e -w apps/store-api` immediately after the change; revert `tsconfig.e2e.json` if it fails |

---

## Implementation Order

```
TASK-054-A  ──┐
TASK-054-B  ──┤── All independent, run in any order ──► TASK-054-E (gate)
TASK-054-C  ──┤
TASK-054-D  ──┘
```

Tasks A, B, C, and D are independent of each other and can be done in any order or in parallel. TASK-054-E must follow all four.

---

## Appendix: D Findings

_Executed 2026-06-16. Audit of workspace boundaries, shared config placement, Orval config duplication, and Docker Compose path coupling._

### D-1: Shared config package placement — correct and complete

`packages/eslint-config` (`@store/eslint-config`) and `packages/typescript-config` (`@store/typescript-config`) both sit under `packages/` and are referenced as workspace `devDependencies` from the apps that consume them (`store-client`, `store-admin` reference both; `store-api` references the TS config via `extends: "@store/typescript-config/nest"`). Placement follows the npm-workspaces convention. **No action needed.**

### D-2: No `shared/` utilities currently warrant a `packages/shared` workspace

The frontend `shared/` layers have **diverged**, not duplicated:

- `store-client/src/shared/lib/` contains `index.ts` + `schema/` (zod form schemas — storefront-specific).
- `store-admin/src/shared/lib/` contains `index.ts` + `utils.ts` (admin-specific `cn`/class helpers).

There is no meaningful cross-app duplication to extract. Promoting `shared/` into a `packages/shared` workspace would be premature for a two-frontend monorepo. **No action needed now;** revisit only if a third consumer appears or genuine duplication emerges.

### D-3: `orval.config.ts` is near-identical across frontends — low-value consolidation candidate

`apps/store-client/orval.config.ts` and `apps/store-admin/orval.config.ts` differ by **exactly one line** — the project key (`storeClient` vs `storeAdmin`). Everything else (input target `../store-api/swagger.json`, `tags-split` mode, `react-query`/`axios` client, the `instance.ts` mutator override, the prettier `afterAllFilesWrite` hook) is identical. This could be consolidated into a shared factory in `packages/`, but the saving is ~25 lines across two files in a two-app repo — marginal. **Actionable but low priority** → tracked as TASK-058.

### D-4: `shared/api/instance.ts` has a divergent `/api` baseURL convention

The two frontends' Axios mutators (`src/shared/api/instance.ts`) are **not** pure duplicates — they encode different baseURL conventions:

- `store-client`: `baseURL` has no `/api` suffix; endpoint paths are written **with** `/api` (e.g. `/api/auth/refresh`, `CSRF_TOKEN_PATH = "/api/csrf-token"`).
- `store-admin`: `baseURL` **includes** `/api`; endpoint paths are written without it (`/auth/refresh`, `/csrf-token`).

This is a real inconsistency (the same hand-written refresh/CSRF logic is expressed two different ways), but reconciling it is a refactor that touches both apps' request behaviour, not a config cleanup — it is **out of scope** for a tech-debt config pass and carries regression risk for auth/CSRF flows. **Actionable, low priority** → tracked as TASK-059.

### D-5: Docker Compose has no app-path coupling

`docker-compose.yml` defines `postgres`, `redis`, and a `tools`-profile `pgadmin`. All volumes are **named** Docker volumes (`postgres_data`, `redis_data`, `pgadmin_data`) — there are **no** bind mounts to `apps/` source and **no** env files referencing workspace paths. The compose stack is fully decoupled from the workspace directory layout; restructuring workspaces would not break it. **No action needed.**

### Summary

Placement (D-1), `shared/` boundaries (D-2), and Docker coupling (D-5) are all healthy. Two low-priority, optional cleanups were identified and added to the backlog (TASK-058 Orval config consolidation, TASK-059 `instance.ts` convention alignment). Neither blocks TASK-054 completion.
