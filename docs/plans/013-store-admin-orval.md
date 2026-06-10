# Plan: Store-Admin Orval Configuration

> **Status:** In Progress
> **Phase:** Phase 1 — Foundation (MVP Core) — API Contract
> **Created:** 2026-06-10
> **Last Updated:** 2026-06-10

## Overview

Wire up Orval for `apps/store-admin` so that the admin panel can consume the same
OpenAPI spec as `store-client` and get fully-typed, TanStack-Query-backed API hooks
auto-generated into `src/shared/api/generated/`. The store-client Orval setup is the
established template — this task mirrors it exactly, adapting only the config key name
(`storeAdmin` instead of `storeClient`) and ensuring all supporting infrastructure
(instance mutator, barrel export, generated-dir gitignore) is correctly in place.

**Current state of store-admin (discovered during investigation):**

- `orval.config.ts` exists but points to `http://localhost:3001/api-json` (live server).
  Must be changed to the static `../store-api/swagger.json` path to match store-client.
- `src/shared/api/instance.ts` exists and is already correct (identical to store-client).
- `src/shared/api/index.ts` exists but only re-exports the instance — it needs endpoint
  re-exports added after generation runs.
- `src/shared/api/generated/` directory exists with a `models/` subdirectory. The
  `models/index.ts` contains only an orval header comment (placeholder from a prior
  partial run). Neither `.gitignore` nor `.gitkeep` are present in `generated/` —
  they must be created.
- `package.json` already has `"generate:api": "orval --config orval.config.ts"` and
  all required runtime deps (`axios`, `@tanstack/react-query`). Orval is in devDeps.
  No missing dependencies.
- `tsconfig.json` already defines `"@/*": ["./src/*"]` path alias — generated imports
  will resolve correctly.
- `src/app/providers.tsx` already wraps the app in `QueryClientProvider` with
  `ReactQueryDevtools` — generated react-query hooks have a provider at runtime.

**The single required code change is one line in `orval.config.ts`**: switch the
`input.target` from the live-server URL to the static spec path. All other files either
already match the correct state or need only a `.gitignore` / `.gitkeep` pair created.
The barrel `index.ts` update is deferred until after generation runs (it must list
whatever tag-split files Orval actually produces).

---

## Scope

### In Scope

- Fix `apps/store-admin/orval.config.ts`: change `input.target` to
  `../store-api/swagger.json`.
- Create `apps/store-admin/src/shared/api/generated/.gitignore` and `.gitkeep` to match
  store-client convention (git-ignore all generated files, track only the sentinels).
- Run generation (`npm run swagger:export -w apps/store-api` then
  `npm run generate:api -w apps/store-admin`) and verify output.
- Update `apps/store-admin/src/shared/api/index.ts` to re-export all generated tag
  modules and models (once the generated filenames are known).
- Verify the full pipeline: `typecheck`, `lint`, `build`.

### Out of Scope

- Access-token injection (Authorization header interceptor in `instance.ts`) — this
  belongs to the admin auth task. The instance already sends cookies
  (`withCredentials: true`); bearer-token wiring comes later when the admin login flow
  is implemented.
- Building admin pages or features that consume the generated hooks.
- Adding a TanStack Query provider — already present in `src/app/providers.tsx`.
- Any changes to `store-client` or `store-api`.
- Committing generated files to git — they remain git-ignored.

---

## User Stories

1. As a frontend developer working on the admin panel, I want typed API hooks generated
   from the OpenAPI spec, so that I can call backend endpoints without writing manual
   fetch/axios code.
2. As a CI pipeline, I want generation to work offline from a static spec file, so that
   the admin build does not require a running server.

---

## Technical Design

### How the Pipeline Works

```
npm run swagger:export -w apps/store-api
  └── ts-node src/export-swagger.ts
       └── writes apps/store-api/swagger.json   (git-ignored, must be regenerated)

npm run generate:api -w apps/store-admin
  └── orval --config orval.config.ts
       └── reads  apps/store-api/swagger.json   (relative path ../store-api/swagger.json)
       └── writes apps/store-admin/src/shared/api/generated/
            ├── models/          (DTO/entity types)
            ├── auth/auth.ts     (useLogin, useRegister, useRefresh, useLogout hooks)
            ├── products/products.ts
            ├── categories/categories.ts
            ├── cart/cart.ts
            ├── users/users.ts
            └── health/health.ts (if health tag is included)
       └── runs  prettier --write on all generated files
```

Orval's `tags-split` mode produces one file per OpenAPI tag. Because all API tags are
included in the spec, the admin gets the full client — not just admin-specific endpoints.
This is intentional: admin features need auth, products, categories, orders, and users.

### File-by-File Changes

#### `apps/store-admin/orval.config.ts` — MODIFY (one line)

The only change is `input.target`. Everything else stays identical.

Current (wrong):

```typescript
input: {
  target: "http://localhost:3001/api-json",
},
```

Correct (matches store-client pattern):

```typescript
input: {
  // Static OpenAPI spec generated by `npm run swagger:export -w apps/store-api`.
  // This keeps generation reproducible offline and in CI (no running server).
  // For live-server generation instead, switch to "http://localhost:3001/api-json".
  target: "../store-api/swagger.json",
},
```

The config key remains `storeAdmin` (not `storeClient`). Output paths, client,
httpClient, mock, clean, mutator path, and afterAllFilesWrite are already correct.

#### `apps/store-admin/src/shared/api/instance.ts` — NO CHANGE NEEDED

Already identical to store-client's instance:

- `baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"`
- `withCredentials: true`
- `customInstance<T>` mutator with CancelToken unwrap
- `ErrorType<Error>` and `BodyType<BodyData>` exports

Note for implementer: Authorization bearer-token injection (an axios request interceptor
that reads the access token and sets the `Authorization: Bearer <token>` header) is NOT
added here. That wiring belongs to the admin auth task. The admin panel requires a bearer
access token on protected endpoints — it must be added to this instance as a
`request interceptor` when the auth module is implemented. Add a comment in the file
noting this as a TODO so it is not forgotten.

#### `apps/store-admin/src/shared/api/generated/.gitignore` — CREATE

Copy exactly from store-client:

```
# This directory is auto-generated by Orval.
# Track the .gitkeep file but ignore all generated content.
*
!.gitkeep
!.gitignore
```

#### `apps/store-admin/src/shared/api/generated/.gitkeep` — CREATE

Empty file. Keeps the `generated/` directory tracked in git even though all content is
ignored.

Note: The existing `generated/models/index.ts` (placeholder from a prior partial run)
will be overwritten when `generate:api` runs with `clean: true`. That is the correct
behaviour.

#### `apps/store-admin/src/shared/api/index.ts` — MODIFY (after generation runs)

Currently only re-exports the instance. After generation, add re-exports for every
generated tag module and for the models barrel. The exact module names depend on the
OpenAPI tags in `swagger.json` (currently: Auth, Users, Products, Categories, Cart,
Health). Expected final shape:

```typescript
// Shared API — Axios instance, custom mutator, and Orval-generated hooks
export { api, customInstance } from "./instance";
export type { ErrorType, BodyType } from "./instance";

// Orval-generated endpoint hooks (grouped by API tag).
// NOTE: `generated/` is git-ignored — run `npm run generate:api` after checkout.
export * from "./generated/auth/auth";
export * from "./generated/users/users";
export * from "./generated/products/products";
export * from "./generated/categories/categories";
export * from "./generated/cart/cart";

// Generated DTO / entity types
export * from "./generated/models";
```

Adjust tag filenames to match what Orval actually writes (tag names are lowercased and
kebab-cased by Orval's `tags-split` mode; confirm exact paths after running generation).
The health tag produces only a simple hook and may be included or omitted at the
implementer's discretion.

---

## Tasks

### TASK-016: Set up Orval configuration for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-027-A (swagger:export script — already done), TASK-027-B (store-client
static spec pattern — already done), TASK-018-F (store-admin orval scaffold — already done)

**Acceptance Criteria:**

- [ ] `orval.config.ts` uses `../store-api/swagger.json` as input (not the live-server URL).
- [ ] `src/shared/api/generated/.gitignore` exists and ignores all content except
      `.gitkeep` and itself.
- [ ] `src/shared/api/generated/.gitkeep` exists (empty sentinel file).
- [ ] `npm run swagger:export -w apps/store-api` completes without error and writes
      `apps/store-api/swagger.json`.
- [ ] `npm run generate:api -w apps/store-admin` completes without error.
- [ ] Generated output includes at minimum: `generated/auth/auth.ts`,
      `generated/products/products.ts`, `generated/categories/categories.ts`,
      `generated/cart/cart.ts`, `generated/users/users.ts`, and `generated/models/`.
- [ ] `src/shared/api/index.ts` re-exports all generated tag modules and models.
- [ ] `npm run typecheck -w apps/store-admin` passes with zero errors.
- [ ] `npm run lint -w apps/store-admin` passes with zero warnings/errors.
- [ ] `npm run build -w apps/store-admin` succeeds.

**Files to create/modify:**

- `apps/store-admin/orval.config.ts` — change `input.target` to static spec path
- `apps/store-admin/src/shared/api/generated/.gitignore` — create (copy from store-client)
- `apps/store-admin/src/shared/api/generated/.gitkeep` — create (empty sentinel)
- `apps/store-admin/src/shared/api/index.ts` — add generated re-exports after generation

**Verification commands (run in this order):**

```bash
# 1. Export the OpenAPI spec from the running/bootstrappable store-api
npm run swagger:export -w apps/store-api
# Expected: "OpenAPI spec written to .../apps/store-api/swagger.json"

# 2. Generate hooks for store-admin
npm run generate:api -w apps/store-admin
# Expected: Orval prints generated file paths, prettier formats them, exits 0

# 3. Confirm generated files exist (adjust paths if tag names differ)
ls apps/store-admin/src/shared/api/generated/
ls apps/store-admin/src/shared/api/generated/models/

# 4. Type-check — must be zero errors
npm run typecheck -w apps/store-admin

# 5. Lint — must be clean
npm run lint -w apps/store-admin

# 6. Build — must succeed
npm run build -w apps/store-admin
```

---

## Migration Steps

1. Edit `apps/store-admin/orval.config.ts`: replace the `target` URL with the static path.
2. Create `apps/store-admin/src/shared/api/generated/.gitignore` (copy from store-client).
3. Create `apps/store-admin/src/shared/api/generated/.gitkeep` (empty file).
4. Run `npm run swagger:export -w apps/store-api` to produce `swagger.json`.
5. Run `npm run generate:api -w apps/store-admin` to generate hooks and types.
6. Inspect the generated filenames under `generated/` and update
   `src/shared/api/index.ts` with the correct re-export paths.
7. Run `npm run typecheck -w apps/store-admin` and fix any issues.
8. Run `npm run lint -w apps/store-admin` and fix any issues.
9. Run `npm run build -w apps/store-admin` to confirm a clean build.
10. Commit only the non-generated files: `orval.config.ts`,
    `generated/.gitignore`, `generated/.gitkeep`, `shared/api/index.ts`.

---

## Risks & Mitigations

| Risk                                                                                           | Mitigation                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `swagger.json` not present when generation runs                                                | Always run `swagger:export` first; `swagger.json` is git-ignored. Document in README / CI.                             |
| swagger:export requires a reachable database (PrismaService connects on init)                  | Use a `.env` with a valid DATABASE_URL, or run `docker-compose up -d` before exporting.                                |
| Generated `models/index.ts` placeholder is overwritten by `clean: true`                        | This is intentional and correct — the placeholder will be replaced with real types.                                    |
| Tag-split filenames differ from expected paths (e.g. Orval lowercases differently)             | Inspect actual generated paths before editing `index.ts`; do not guess filenames.                                      |
| `generated/` directory and its `models/` subdir are not tracked, causing `clean: true` to fail | The `.gitignore` + `.gitkeep` ensure the parent dir is tracked; Orval creates subdirs itself.                          |
| Access-token injection missing for protected admin endpoints                                   | Documented as a follow-up for the admin auth task (TASK-038 or a sub-task). Not a blocker for generation or typecheck. |
| Barrel re-exports in `index.ts` cause name collisions between tag modules                      | Unlikely given separate tags, but if collision occurs, use named re-exports instead of `export *`.                     |

---

## Notes

### What is identical to store-client

- `instance.ts` — verbatim copy (same baseURL env var, same `withCredentials: true`,
  same `customInstance` mutator shape).
- `orval.config.ts` output section — `mode`, `target`, `schemas`, `client`, `httpClient`,
  `mock`, `clean`, `override.mutator` path and name, `hooks.afterAllFilesWrite`.
- `generate:api` script in `package.json` — already identical.
- All runtime deps — `axios`, `@tanstack/react-query`, `@tanstack/react-query-devtools`
  already present in store-admin.
- Orval in devDeps — already present.
- TanStack Query provider — already set up in `src/app/providers.tsx`.

### What differs from store-client

- Config key: `storeAdmin` vs `storeClient` — cosmetic only, no functional impact.
- `index.ts` barrel: store-client currently only exports cart hooks (TASK-027-E was the
  first generation). Store-admin will export all API tags from the start since this is
  a fresh run rather than an incremental addition.

### Follow-up work (not in this plan)

- **Authorization interceptor** (admin auth task): Add a request interceptor to
  `instance.ts` that reads the access token from memory/state and sets the
  `Authorization: Bearer <token>` header. This is required for admin-protected endpoints.
  Exact implementation depends on the token storage strategy chosen in the auth task.
- **Orval re-run in CI**: The GitHub Actions workflow should run `swagger:export` then
  `generate:api` before `typecheck` and `build` steps for store-admin. This is not
  currently in the CI pipeline (see `.github/workflows/`).
