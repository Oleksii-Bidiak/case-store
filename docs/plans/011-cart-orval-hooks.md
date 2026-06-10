# Plan: Generate Orval Hooks for Cart API

> **Status:** In Progress
> **Phase:** Phase 2 — Storefront & Cart
> **Parent Plan:** docs/plans/009-cart-module.md
> **Created:** 2026-06-10
> **Last Updated:** 2026-06-10

## Overview

Generate typed React Query hooks for the Cart API in `store-client` using Orval. The Cart
controller (TASK-025) is complete and fully decorated with `@ApiTags`, `@ApiOperation`,
`@ApiResponse`, `@ApiExtraModels`, and `@ApiBearerAuth` decorators. The Orval configuration
for `store-client` is also fully in place (TASK-017-E). The generated directory
`apps/store-client/src/shared/api/generated/` exists but is empty — generation has never
been executed successfully.

This plan resolves the one genuine blocking gap: there is no `swagger:export` npm script in
`apps/store-api` that writes the OpenAPI document to a static `swagger.json` file. Without
that script, Orval can only run if the backend server is already running on
`http://localhost:3001`, which is fragile in CI and developer onboarding. This plan adds that
script and then executes the full generation workflow.

## Prerequisite State Audit

| Prerequisite                                                     | Expected                | Actual                                                                                                                                     | Verdict     |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Swagger `DocumentBuilder` configured in `main.ts`                | Required                | Present — `SwaggerModule`, `DocumentBuilder`, Bearer + Cookie auth, Cart tag                                                               | OK          |
| Cart controller Swagger decorators                               | Required                | Full coverage — `@ApiTags('Cart')`, `@ApiOperation`, `@ApiResponse` on all 5 endpoints, `@ApiExtraModels(CartEntity, CartTotals)`          | OK          |
| `CartEntity` and `CartItemEntity` `@ApiProperty` decorators      | Required                | Complete on all fields including nested `totals: CartTotals`                                                                               | OK          |
| `AddToCartDto` and `UpdateCartItemDto` `@ApiProperty` decorators | Required                | Present on all fields                                                                                                                      | OK          |
| `apps/store-client/orval.config.ts`                              | Required                | Present — reads from `http://localhost:3001/api-json`, outputs to `src/shared/api/generated/`, `tags-split` mode, `customInstance` mutator | OK          |
| `apps/store-client/src/shared/api/instance.ts` (mutator)         | Required                | Present — `customInstance` exported, `ErrorType` and `BodyType` exported                                                                   | OK          |
| `npm run generate:api` script in `store-client/package.json`     | Required                | Present — `"generate:api": "orval --config orval.config.ts"`                                                                               | OK          |
| Static `swagger.json` file or `swagger:export` npm script        | Required for CI/offline | **MISSING** — no static file, no export script in `store-api/package.json`                                                                 | **GAP**     |
| TASK-014 (Configure Swagger/OpenAPI decorators)                  | Marked ⬜ in BACKLOG    | Swagger is configured in `main.ts`; Cart decorators are complete. Infrastructure done as part of other tasks.                              | Stale entry |
| TASK-015 (Set up Orval config for store-client)                  | Marked ⬜ in BACKLOG    | Orval config exists and is correct (completed as TASK-017-E).                                                                              | Stale entry |

**Conclusion — OPTION B (partially blocked by one missing script):** TASK-027 can run
today only against a live server. To make it reproducible in CI and offline, a
`swagger:export` script must be added to `store-api` first. TASK-014 and TASK-015 in
BACKLOG.md are stale — their work was already done under TASK-017-E. This plan adds the
export script as TASK-027-A, then completes TASK-027-B (run generation and verify output),
and finally closes TASK-014 and TASK-015 as stale via BACKLOG cleanup.

## Scope

### In Scope

- Add `swagger:export` script to `apps/store-api/package.json` that bootstraps the NestJS
  app, writes the OpenAPI document to `apps/store-api/swagger.json`, and exits cleanly
- Update `apps/store-client/orval.config.ts` to reference the static `swagger.json` file
  as a fallback input (or as the primary input when the server is not running)
- Run `npm run generate:api -w apps/store-client` and verify hooks are generated
- Verify expected hook names and type names appear in generated output
- Run typecheck on `store-client` to confirm no TypeScript errors in generated code
- Mark TASK-014 and TASK-015 as done in BACKLOG.md (stale — already implemented)

### Out of Scope

- `store-admin` Orval generation (separate TASK-016, separate workspace)
- Changing any backend cart logic
- Writing frontend components that consume the hooks (TASK-031, TASK-032)
- CI pipeline wiring for API generation (Phase 5 polish)

## User Stories

1. As a **frontend developer**, I want typed React Query hooks for every Cart endpoint, so
   that I can build the CartPage and AddToCart feature without writing manual API calls.
2. As a **developer onboarding**, I want `npm run generate:api` to work without manually
   starting the backend server first, so that the setup is reproducible.
3. As a **CI pipeline**, I want the OpenAPI spec to be derivable from a build step, so that
   hook generation can run in an automated environment.

## Technical Design

### The Missing Link: swagger:export Script

The `api-contract` skill specifies a `swagger:generate` script pattern. The NestJS app
bootstraps but does not write `swagger.json` to disk during normal startup. The correct
pattern is a separate entry-point script that:

1. Creates the NestJS application context (without `listen()`)
2. Builds the Swagger document
3. Writes it to `apps/store-api/swagger.json`
4. Calls `process.exit(0)`

This script must be written in TypeScript and compiled/executed via `tsx` (already a dev
dependency in `store-api`).

```typescript
// apps/store-api/src/export-swagger.ts
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { writeFileSync } from "fs";
import { join } from "path";

async function exportSwagger() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api", { exclude: ["health"] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Mobile Accessories Store API")
    .setDescription("B2C e-commerce platform for mobile accessories")
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        in: "header",
      },
      "access-token",
    )
    .addCookieAuth(
      "refreshToken",
      { type: "apiKey", in: "cookie", name: "refreshToken" },
      "refresh-token",
    )
    .addTag("Health", "Health check endpoints")
    .addTag("Auth", "Authentication and authorization")
    .addTag("Users", "User profile and admin user management")
    .addTag("Products", "Product catalog browsing and admin management")
    .addTag("Categories", "Category browsing and admin management")
    .addTag("Cart", "Shopping cart management")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = join(process.cwd(), "swagger.json");
  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI spec written to ${outputPath}`);
  await app.close();
  process.exit(0);
}

exportSwagger();
```

The `DocumentBuilder` configuration MUST be kept in sync with `main.ts`. Any new module
added to `AppModule` that has Swagger-decorated controllers will be picked up automatically.

### Orval Config — Dual-Mode Input

The existing `orval.config.ts` reads from the live server URL. After adding the export
script, update the config to prefer the static file so it works offline:

```typescript
// apps/store-client/orval.config.ts (updated)
import { defineConfig } from "orval";

export default defineConfig({
  storeClient: {
    input: {
      // Primary: static file generated by npm run swagger:export in store-api.
      // Fallback to live server: set target to "http://localhost:3001/api-json"
      target: "../store-api/swagger.json",
    },
    output: {
      mode: "tags-split",
      target: "src/shared/api/generated/endpoints.ts",
      schemas: "src/shared/api/generated/models",
      client: "react-query",
      httpClient: "axios",
      mock: false,
      clean: true,
      override: {
        mutator: {
          path: "./src/shared/api/instance.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "prettier --write",
    },
  },
});
```

### Expected Generated Output

With `mode: 'tags-split'` and the Cart tag in the spec, Orval will generate the following
structure inside `apps/store-client/src/shared/api/generated/`:

```
generated/
  models/
    index.ts                    — re-exports all generated types
    cartEntity.ts               — CartEntity interface
    cartItemEntity.ts           — CartItemEntity interface
    cartTotals.ts               — CartTotals interface
    addToCartDto.ts             — AddToCartDto interface
    updateCartItemDto.ts        — UpdateCartItemDto interface
  cart/
    cart.ts                     — typed hooks for the Cart tag
    cart.msw.ts                 — (only if mock: true, not generated here)
  endpoints.ts                  — re-export barrel
```

Expected hook function names generated from Cart endpoints:

| Endpoint                         | HTTP Method | Operation ID (Swagger)      | Orval Hook                    |
| -------------------------------- | ----------- | --------------------------- | ----------------------------- |
| `/api/cart` GET                  | GET         | `CartController_getCart`    | `useCartControllerGetCart`    |
| `/api/cart/items` POST           | POST        | `CartController_addToCart`  | `useCartControllerAddToCart`  |
| `/api/cart/items/:itemId` PATCH  | PATCH       | `CartController_updateItem` | `useCartControllerUpdateItem` |
| `/api/cart/items/:itemId` DELETE | DELETE      | `CartController_removeItem` | `useCartControllerRemoveItem` |
| `/api/cart` DELETE               | DELETE      | `CartController_clearCart`  | `useCartControllerClearCart`  |

Note: Orval derives hook names from the `operationId` in the OpenAPI spec. NestJS Swagger
generates `operationId` as `ControllerName_methodName` by default. If cleaner names like
`useGetCart` are required, `@ApiOperation({ operationId: 'getCart' })` decorators must be
added to the controller methods — this is flagged as an acceptance criterion below.

### API Contract

| Method | Path                      | Request Body        | Response               | Generated Hook                |
| ------ | ------------------------- | ------------------- | ---------------------- | ----------------------------- |
| GET    | `/api/cart`               | —                   | `{ data: CartEntity }` | `useCartControllerGetCart`    |
| POST   | `/api/cart/items`         | `AddToCartDto`      | `{ data: CartEntity }` | `useCartControllerAddToCart`  |
| PATCH  | `/api/cart/items/:itemId` | `UpdateCartItemDto` | `{ data: CartEntity }` | `useCartControllerUpdateItem` |
| DELETE | `/api/cart/items/:itemId` | —                   | `{ data: CartEntity }` | `useCartControllerRemoveItem` |
| DELETE | `/api/cart`               | —                   | `{ data: CartEntity }` | `useCartControllerClearCart`  |

## Tasks

### TASK-027-A: Add swagger:export script to store-api

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-025 (done)

**Acceptance Criteria:**

- [ ] `apps/store-api/src/export-swagger.ts` exists with the NestJS bootstrap + document
      write + `process.exit(0)` pattern shown in Technical Design above
- [ ] `apps/store-api/package.json` has `"swagger:export": "tsx src/export-swagger.ts"` in
      `scripts`
- [ ] Running `npm run swagger:export -w apps/store-api` from the monorepo root produces
      `apps/store-api/swagger.json` (requires a running PostgreSQL but no `listen()` call)
- [ ] `swagger.json` contains a `paths` key with at minimum:
      `/api/cart`, `/api/cart/items`, `/api/cart/items/{itemId}`
- [ ] `swagger.json` is added to `apps/store-api/.gitignore` (it is auto-generated; do not
      commit it)
- [ ] The `DocumentBuilder` configuration in `export-swagger.ts` is identical to the one in
      `main.ts` (same tags, same security schemes, same version)

**Files to create/modify:**

- `apps/store-api/src/export-swagger.ts` — standalone bootstrap script that writes swagger.json
- `apps/store-api/package.json` — add `swagger:export` script
- `apps/store-api/.gitignore` — add `swagger.json`

---

### TASK-027-B: Update Orval config to use static swagger.json input

**Type:** chore
**Scope:** store-client
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-027-A

**Acceptance Criteria:**

- [ ] `apps/store-client/orval.config.ts` has `input.target` pointing to
      `'../store-api/swagger.json'` (relative path from `store-client` root to `store-api`)
- [ ] A comment in the config explains the two-mode workflow:
      "Switch to `http://localhost:3001/api-json` for live-server generation"
- [ ] The rest of the config (output, schemas, client, httpClient, mutator) is unchanged

**Files to create/modify:**

- `apps/store-client/orval.config.ts` — update `input.target` to static file path

---

### TASK-027-C: Add explicit operationIds to Cart controller

**Type:** chore
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-025 (done)

**Context:** NestJS Swagger auto-generates `operationId` as `CartController_getCart`.
Orval converts this to `useCartControllerGetCart`. The acceptance criteria in plan 009 list
cleaner names (`useGetCart`, `useAddToCart`). To get those names, explicit `operationId`
values must be set in `@ApiOperation`.

**Acceptance Criteria:**

- [ ] `GET /api/cart` has `@ApiOperation({ summary: '...', operationId: 'getCart' })`
- [ ] `POST /api/cart/items` has `@ApiOperation({ ..., operationId: 'addToCart' })`
- [ ] `PATCH /api/cart/items/:itemId` has `@ApiOperation({ ..., operationId: 'updateCartItem' })`
- [ ] `DELETE /api/cart/items/:itemId` has `@ApiOperation({ ..., operationId: 'removeCartItem' })`
- [ ] `DELETE /api/cart` has `@ApiOperation({ ..., operationId: 'clearCart' })`
- [ ] Existing `summary` strings are preserved
- [ ] `npm run typecheck -w apps/store-api` passes with no errors

**Files to create/modify:**

- `apps/store-api/src/cart/cart.controller.ts` — add `operationId` to each `@ApiOperation`

---

### TASK-027-D: Run Orval generation and verify Cart hooks

**Type:** chore
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-027-A, TASK-027-B, TASK-027-C

**How to execute:**

```powershell
# Step 1: Generate the static OpenAPI spec (requires DB connection)
npm run swagger:export -w apps/store-api

# Step 2: Verify the spec contains Cart paths
# (Read apps/store-api/swagger.json and confirm /api/cart paths are present)

# Step 3: Generate typed hooks for store-client
npm run generate:api -w apps/store-client

# Step 4: Verify generated files exist
# Expected: apps/store-client/src/shared/api/generated/cart/cart.ts
# Expected: apps/store-client/src/shared/api/generated/models/cartEntity.ts

# Step 5: Run typecheck to confirm no TypeScript errors
npm run typecheck -w apps/store-client
```

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` exits 0 and writes `swagger.json`
- [ ] `swagger.json` has `paths['/api/cart']` with GET and DELETE operations
- [ ] `swagger.json` has `paths['/api/cart/items']` with POST operation
- [ ] `swagger.json` has `paths['/api/cart/items/{itemId}']` with PATCH and DELETE operations
- [ ] `npm run generate:api -w apps/store-client` exits 0 with no errors
- [ ] File `apps/store-client/src/shared/api/generated/cart/cart.ts` exists
- [ ] `cart.ts` exports `useGetCart` (query hook for GET /api/cart)
- [ ] `cart.ts` exports `useAddToCart` (mutation hook for POST /api/cart/items)
- [ ] `cart.ts` exports `useUpdateCartItem` (mutation hook for PATCH /api/cart/items/:itemId)
- [ ] `cart.ts` exports `useRemoveCartItem` (mutation hook for DELETE /api/cart/items/:itemId)
- [ ] `cart.ts` exports `useClearCart` (mutation hook for DELETE /api/cart)
- [ ] `apps/store-client/src/shared/api/generated/models/index.ts` exports `CartEntity`,
      `CartItemEntity`, `CartTotals`, `AddToCartDto`, `UpdateCartItemDto`
- [ ] `npm run typecheck -w apps/store-client` passes with 0 errors
- [ ] `npm run lint -w apps/store-client` passes (generated files use prettier via afterAllFilesWrite hook)
- [ ] Generated files are NOT committed (`.gitignore` in `generated/` blocks them)

**Files created (auto-generated — do not hand-edit):**

- `apps/store-client/src/shared/api/generated/cart/cart.ts`
- `apps/store-client/src/shared/api/generated/models/cartEntity.ts`
- `apps/store-client/src/shared/api/generated/models/cartItemEntity.ts`
- `apps/store-client/src/shared/api/generated/models/cartTotals.ts`
- `apps/store-client/src/shared/api/generated/models/addToCartDto.ts`
- `apps/store-client/src/shared/api/generated/models/updateCartItemDto.ts`
- `apps/store-client/src/shared/api/generated/models/index.ts` (updated)

---

### TASK-027-E: Update shared/api index to re-export generated Cart hooks

**Type:** chore
**Scope:** store-client
**Complexity:** S (15 min)
**TDD Required:** No
**Depends on:** TASK-027-D

**Context:** `apps/store-client/src/shared/api/index.ts` currently only exports the Axios
instance. After generation, consumers in `entities/` and `features/` layers should be able
to import Cart hooks from `@/shared/api` rather than reaching into `generated/` directly.
This follows the FSD rule that generated internals should not be imported directly by upper
layers.

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/api/index.ts` re-exports all items from
      `./generated/cart/cart` (hooks) and `./generated/models` (types)
- [ ] Existing exports (`api`, `customInstance`, `ErrorType`, `BodyType`) are preserved
- [ ] `npm run typecheck -w apps/store-client` passes with 0 errors

**Files to create/modify:**

- `apps/store-client/src/shared/api/index.ts` — add re-exports for generated Cart hooks and types

## Migration Steps

1. Implement TASK-027-C — add `operationId` to Cart controller `@ApiOperation` decorators.
2. Implement TASK-027-A — create `export-swagger.ts` and add `swagger:export` script.
3. Implement TASK-027-B — update `orval.config.ts` to point at the static file.
4. Run `npm run swagger:export -w apps/store-api` to generate `swagger.json`.
5. Inspect `swagger.json` — confirm Cart paths, operation IDs, and model schemas.
6. Run `npm run generate:api -w apps/store-client` (TASK-027-D).
7. Verify generated file structure and hook names match acceptance criteria.
8. Run `npm run typecheck -w apps/store-client` — confirm 0 errors.
9. Implement TASK-027-E — update `shared/api/index.ts` with re-exports.
10. Run full typecheck one more time across all workspaces.

## Risks & Mitigations

| Risk                                                                               | Mitigation                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export-swagger.ts` cannot bootstrap AppModule without a real DB connection        | `ValidationPipe` and Pino logger are configured in `main.ts` but `export-swagger.ts` only calls `NestFactory.create` with `{ logger: false }` — if DB is unreachable the script fails. Keep Docker Compose running during generation.  |
| Orval hook names differ from acceptance criteria if `operationId` is wrong         | TASK-027-C enforces explicit `operationId` values before generation runs; verify hook names in generated file as part of TASK-027-D criteria.                                                                                          |
| `swagger.json` accidentally committed                                              | Add `swagger.json` to `apps/store-api/.gitignore` in TASK-027-A. The pre-commit hook in `.claude/hooks/guard-edits.js` blocks editing generated files but not committing unblocked files — `.gitignore` is the correct mechanism here. |
| `DocumentBuilder` config drifts between `main.ts` and `export-swagger.ts`          | A comment in `export-swagger.ts` explicitly references `main.ts` as the source of truth; future module additions require updating both files. Long-term: extract `buildSwaggerConfig()` to a shared helper.                            |
| Orval `clean: true` wipes previously generated files if generation partially fails | This is expected behavior; re-running generation is idempotent. The `.gitkeep` is excluded from clean by the existing `.gitignore` inside `generated/`.                                                                                |
| `prettier --write` hook in `afterAllFilesWrite` requires `prettier` on PATH        | `prettier` is a dev dependency available via `npx`; Orval calls it as a shell command. Ensure it resolves in the workspace.                                                                                                            |

## Notes

- The BACKLOG entries TASK-014 ("Configure Swagger/OpenAPI decorators") and TASK-015 ("Set
  up Orval config for store-client") are **stale**. Swagger was set up in `main.ts` during
  TASK-009/TASK-010 work, and Orval config was created as TASK-017-E. Both should be marked
  ✅ in BACKLOG.md.
- The `orval.config.ts` currently fetches from `http://localhost:3001/api-json`. This works
  fine for local development (developer runs `npm run start:dev -w apps/store-api` first),
  but breaks CI. The static-file approach in TASK-027-B is the more robust default.
- Generated files are intentionally excluded from git (`.gitignore` in `generated/`). This
  means every developer and every CI job must run `npm run generate:api` after checkout. A
  note in the project README should document this.
- The `CartResponseEnvelope` class defined inline in `cart.controller.ts` is registered
  with `@ApiExtraModels` but is an internal wrapper — Orval may or may not generate a
  named type for it depending on how NestJS Swagger resolves inline schema references.
  The important types are `CartEntity`, `CartTotals`, and `CartItemEntity`, which are
  proper exported classes.
- Hook naming: Orval generates names from `operationId`. After TASK-027-C adds explicit
  `operationId` values (`getCart`, `addToCart`, `updateCartItem`, `removeCartItem`,
  `clearCart`), Orval will produce hooks named `useGetCart`, `useAddToCart`,
  `useUpdateCartItem`, `useRemoveCartItem`, `useClearCart` — matching the names in the
  original acceptance criteria in plan 009.
