# Plan 025 — RBAC: Admin Roles (TASK-038)

**Roadmap Phase:** Phase 4 — Admin Panel
**Feature:** Implement RBAC (admin roles) — harden, complete, and extend the existing role-based access control system to the store-admin frontend, enabling the entire admin panel feature set (TASK-039 through TASK-043).
**Status:** Done
**Created:** 2026-06-12
**Completed:** 2026-06-12

---

## 1. Problem Statement

Phase 4 opens the Admin Panel. Every subsequent task (TASK-039 Product CRUD, TASK-040 Category CRUD, TASK-041 Order management, TASK-042 User management, TASK-043 Dashboard) requires a secure, verified admin identity. Without a proper admin authentication flow in `store-admin`, those features cannot gate access or call ADMIN-only API endpoints.

The backend guards and decorators already exist. What is missing is:

1. **A hardened, type-safe backend RBAC contract** — the `@Roles()` decorator accepts raw strings, not the `UserRole` enum; there is no `AdminGuard` convenience shorthand; the `RolesGuard` only fires a `ForbiddenException` but does not distinguish between "not authenticated" (401) and "authenticated but wrong role" (403) in all code paths.
2. **Admin-only API surface on the backend** — no dedicated admin route prefix exists; admin endpoints are scattered inside public controllers (Product, Category, Order). A new `/api/admin` namespace (or at minimum a globally-verified admin middleware guard) is needed so every TASK-039/040/041/042 endpoint lives under a protected subtree.
3. **The store-admin frontend has no auth** — `store-admin` has an Axios instance with a `TODO` comment where the `Authorization: Bearer` interceptor belongs, no `AuthProvider`, no session state, no admin login page, and the root layout renders the full admin shell unconditionally (no login gate).

TASK-038 closes all three gaps and puts the foundation in place for every Phase 4 feature that follows.

---

## 2. Goals

- Replace raw-string role arguments with the `UserRole` enum (type-safety, prevent typos).
- Add an `AdminGuard` convenience class that composes `JwtAuthGuard + RolesGuard` to enforce `ADMIN` role in a single decorator.
- Verify that 401 vs 403 semantics are correct at every existing ADMIN endpoint.
- Implement admin login in `store-admin`: `entities/session` (AuthProvider, useAuth, useAdminAuth), `features/admin-auth` (LoginForm, LogoutButton), admin login page, and the Axios Bearer interceptor.
- Add a route-level auth gate to the admin root layout so unauthenticated users are redirected to `/login`.
- Regenerate Orval hooks for `store-admin` so the admin app uses the latest API contract.
- Write unit tests for `RolesGuard` (401 vs 403, missing user, correct role) and e2e guard-behaviour tests.
- Document how admin users are provisioned in the database (seed or migration).

## 3. Non-Goals

- Implementing fine-grained permissions beyond ADMIN/CUSTOMER (multi-role matrices, resource-level ACL) — out of scope for this MVP phase.
- Implementing a self-serve "promote user to admin" UI — admin promotion is done via seed script or direct DB update only.
- Implementing Phase 4 admin CRUD features (TASK-039 through TASK-043) — those depend on this task.
- Changing the existing `UserRole` enum values in the Prisma schema — `CUSTOMER` and `ADMIN` are correct as-is.

---

## 4. Current State — What Already Exists

### 4.1 Prisma Schema

`User.role` is `UserRole @default(CUSTOMER)` where `UserRole` is an enum with `CUSTOMER | ADMIN`. No migration is needed for TASK-038.

### 4.2 Backend Guards and Decorators

| File                                        | What it does                                                                                                                           | Gaps                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `auth/guards/jwt-auth.guard.ts`             | Extends `AuthGuard('jwt-access')` — returns 401 on missing/invalid JWT                                                                 | None                                                                     |
| `auth/guards/roles.guard.ts`                | Reads `@Roles()` metadata via Reflector; throws `ForbiddenException(403)` if user role not in list; passes if no roles metadata is set | Accepts `string[]` not `UserRole[]`; no `AdminGuard` convenience wrapper |
| `auth/decorators/roles.decorator.ts`        | `SetMetadata('roles', roles)` with `(...roles: string[])` signature                                                                    | Should accept `UserRole[]` to eliminate magic strings                    |
| `auth/decorators/current-user.decorator.ts` | Extracts `request.user` (set by JWT strategy)                                                                                          | None                                                                     |
| `auth/strategies/jwt-access.strategy.ts`    | `validate()` returns `{ id: payload.sub, role: payload.role }`                                                                         | None — role is already in JWT payload                                    |
| `auth.service.ts`                           | `generateTokenPair(userId, role)` signs `{ sub, role }` into the JWT                                                                   | None                                                                     |

All of the above are exported from `auth/index.ts`.

### 4.3 Existing ADMIN-protected Endpoints

These already use `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')`:

- `ProductController` — `POST /products`, `PUT /products/:id`, `PATCH /products/:id/deactivate`, `PATCH /products/:id/activate`
- `OrderController` — `PATCH /orders/:orderId/confirm-payment`
- `CategoryController` — admin CRUD endpoints (confirmed via Orval-generated `adminCategoryController*` models in `store-admin`)

All of these will benefit from the `AdminGuard` refactor (replacing two-guard boilerplate with one).

### 4.4 store-admin Frontend

| Area                                   | Current state                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `shared/api/instance.ts`               | Axios instance with `TODO` comment — no Bearer interceptor, no 401→refresh retry                 |
| `shared/api/index.ts`                  | Exports Orval-generated hooks for all API tags (auth, users, products, categories, cart, orders) |
| `app/providers.tsx`                    | Only `QueryClientProvider` + `ReactQueryDevtools` — no `AuthProvider`                            |
| `app/layout.tsx`                       | Renders full admin shell (`AdminSidebar` + `AdminHeader`) unconditionally — no login gate        |
| `app/page.tsx`                         | Static dashboard placeholder page                                                                |
| `entities/index.ts`                    | Empty barrel                                                                                     |
| `features/index.ts`                    | Empty barrel                                                                                     |
| `widgets/admin-shell/admin-header.tsx` | Placeholder header — no user menu, no logout                                                     |

### 4.5 store-client Session Pattern (to Mirror)

`store-client` implements a complete in-memory JWT session:

- `entities/session/model/auth.context.tsx` — `AuthProvider` with `setTokens`, `clearTokens`, `isInitializing`, `role`, `userId`; decodes JWT client-side for informational claims; silently refreshes on mount.
- `entities/session/model/use-auth.ts` — `useAuth()` hook with null-check.
- `features/auth/ui/login-form.tsx` — react-hook-form + zod + `useAuthControllerLogin` mutation + `setTokens` + `queryClient.invalidateQueries`.

The `store-admin` session layer follows the same pattern but adds an `isAdmin` computed property and enforces that only `role === 'ADMIN'` sessions are valid.

---

## 5. Proposed Approach

### Architecture Decision

Rather than creating a new `/api/admin` route prefix (which would require all existing admin endpoints to change their paths and break the already-generated Orval types), TASK-038 introduces an `AdminGuard` class that composes `JwtAuthGuard` and `RolesGuard` into a single reusable guard. Existing controllers that already apply `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` are refactored to use `@UseGuards(AdminGuard)` only.

This approach:

- Does not change existing API routes (no breaking change to Orval-generated clients).
- Keeps the auth/guard barrel clean.
- Gives TASK-039/040/041/042 a single, clear decorator to apply.

### Role Type Safety

A `UserRole` re-export (from `@prisma/client`) is placed in `auth/guards/roles.guard.ts` and the `@Roles()` decorator signature is changed from `string[]` to `UserRole[]`. All existing call sites that pass `'ADMIN'` are updated to `UserRole.ADMIN`.

### Admin Frontend Auth Flow

```
store-admin bootstrap
  └── AuthProvider (entities/session)
        ├── mount: call POST /api/auth/refresh
        │     success → setTokens(accessToken)  [user is ADMIN]
        │     fail    → redirect to /login
        └── AdminShellGuard (app/layout.tsx)
              role !== 'ADMIN' → redirect /login
              role === 'ADMIN' → render AdminSidebar + AdminHeader + {children}
```

---

## 6. Tasks

### TASK-038-A: Harden RolesGuard and Roles decorator with UserRole enum

**Type:** refactor
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** —

**Acceptance Criteria:**

- [ ] `@Roles()` decorator signature changed from `(...roles: string[])` to `(...roles: UserRole[])`.
- [ ] `RolesGuard.canActivate()` compares `user.role` against `UserRole[]` (no runtime change, only type safety).
- [ ] All existing call sites updated: `@Roles('ADMIN')` → `@Roles(UserRole.ADMIN)` in `ProductController`, `CategoryController`, `OrderController`.
- [ ] Unit test file `auth/guards/roles.guard.spec.ts` added covering:
  - No roles metadata → returns `true` (any authenticated user).
  - `UserRole.ADMIN` required, user has `ADMIN` → returns `true`.
  - `UserRole.ADMIN` required, user has `CUSTOMER` → throws `ForbiddenException` (403).
  - No user on request → throws `ForbiddenException` (403, not 401 — 401 is JwtAuthGuard's job).
- [ ] `npm run test -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/auth/decorators/roles.decorator.ts` — change signature to `UserRole[]`
- `apps/store-api/src/auth/guards/roles.guard.ts` — use `UserRole[]` type
- `apps/store-api/src/auth/guards/roles.guard.spec.ts` — new unit test file
- `apps/store-api/src/product/product.controller.ts` — update `@Roles` call sites
- `apps/store-api/src/order/order.controller.ts` — update `@Roles` call site
- `apps/store-api/src/category/category.controller.ts` — update `@Roles` call sites (if present)

---

### TASK-038-B: Create AdminGuard convenience guard

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** TASK-038-A

**Acceptance Criteria:**

- [ ] `apps/store-api/src/auth/guards/admin.guard.ts` created. The guard is a `CanActivate` class that delegates to `JwtAuthGuard` then `RolesGuard(UserRole.ADMIN)` in sequence (or is implemented as a mixin/composed class).
- [ ] `AdminGuard` exported from `auth/guards/index.ts` and from `auth/index.ts`.
- [ ] Unit test `auth/guards/admin.guard.spec.ts` covers:
  - Unauthenticated request (missing JWT) → 401 (from JwtAuthGuard).
  - Authenticated `CUSTOMER` → 403 (from RolesGuard).
  - Authenticated `ADMIN` → passes.
- [ ] At least two existing admin endpoints (in `ProductController` and `OrderController`) are refactored from `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN)` to `@UseGuards(AdminGuard)`. The remaining endpoints are refactored as part of TASK-039/040/041/042 as each is touched.
- [ ] `npm run test -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/auth/guards/admin.guard.ts` — new file
- `apps/store-api/src/auth/guards/admin.guard.spec.ts` — new unit test file
- `apps/store-api/src/auth/guards/index.ts` — add export
- `apps/store-api/src/auth/index.ts` — add export
- `apps/store-api/src/product/product.controller.ts` — use `AdminGuard`
- `apps/store-api/src/order/order.controller.ts` — use `AdminGuard`

---

### TASK-038-C: Add e2e guard-behaviour tests

**Type:** test
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (tests against existing behaviour)
**Depends on:** TASK-038-B

**Acceptance Criteria:**

- [ ] New e2e test file `apps/store-api/test/rbac.e2e-spec.ts` covering the following scenarios against the real application (mocked repositories, real guards):
  - `POST /api/products` with no JWT → 401.
  - `POST /api/products` with valid `CUSTOMER` JWT → 403.
  - `POST /api/products` with valid `ADMIN` JWT → passes guard (201 or mocked service response).
  - `PATCH /api/orders/:id/confirm-payment` with no JWT → 401.
  - `PATCH /api/orders/:id/confirm-payment` with `CUSTOMER` JWT → 403.
  - `PATCH /api/orders/:id/confirm-payment` with `ADMIN` JWT → passes guard.
- [ ] Tests mint JWTs directly via `JwtService` (same pattern as `order.e2e-spec.ts`) — no real DB needed.
- [ ] `npm run test:e2e -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/test/rbac.e2e-spec.ts` — new e2e test file

---

### TASK-038-D: Add admin seed data and document admin provisioning

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/prisma/seed.ts` (or equivalent seed file) creates at least one admin user with `role: UserRole.ADMIN` if none exists (idempotent upsert).
- [ ] Admin seed credentials are documented in `.env.example` as `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` (optional, only used by seed).
- [ ] A comment in the seed file explains that admin promotion for existing users is done via `UPDATE users SET role='ADMIN' WHERE email='...'` or via the seed.
- [ ] `.env.example` updated with the two new optional seed vars.
- [ ] `npm run db:seed` (or equivalent) completes without error.

**Files to create/modify:**

- `apps/store-api/prisma/seed.ts` — add admin upsert block
- `apps/store-api/.env.example` — add `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`

---

### TASK-038-E: Implement store-admin entities/session (AuthProvider + useAuth + useAdminAuth)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/session/model/auth.context.tsx` created mirroring `store-client` pattern with these differences:
  - Exposes `isAdmin: boolean` computed as `role === 'ADMIN'`.
  - On successful silent refresh, if decoded role is not `'ADMIN'`, calls `clearTokens()` immediately (reject non-admin sessions silently).
- [ ] `apps/store-admin/src/entities/session/model/use-auth.ts` created (identical to store-client pattern).
- [ ] `apps/store-admin/src/entities/session/index.ts` barrel exports `AuthProvider`, `AuthContextValue`, `useAuth`, and re-exports `useAuthControllerLogin`, `useAuthControllerLogout`, `useAuthControllerRefresh` from `@/shared/api`.
- [ ] `apps/store-admin/src/entities/index.ts` re-exports from `./session`.
- [ ] FSD import rules satisfied — entities layer only imports from `shared`.

**Files to create/modify:**

- `apps/store-admin/src/entities/session/model/auth.context.tsx` — new file
- `apps/store-admin/src/entities/session/model/use-auth.ts` — new file
- `apps/store-admin/src/entities/session/index.ts` — new file
- `apps/store-admin/src/entities/index.ts` — add re-export

---

### TASK-038-F: Implement store-admin Axios Bearer interceptor and 401 refresh retry

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-038-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/api/instance.ts` updated:
  - Request interceptor reads in-memory access token and sets `Authorization: Bearer <token>` on every request (token sourced from a module-level `setAccessToken`/`getAccessToken` pair, same as `store-client`).
  - Response interceptor catches 401, calls `POST /api/auth/refresh`, retries the original request with the new token; if refresh also returns 401, clears the token and does not retry further.
- [ ] `setAccessToken(token: string | null): void` and `getAccessToken(): string | null` exported from `shared/api/instance.ts`.
- [ ] `shared/api/index.ts` updated to re-export `setAccessToken` and `getAccessToken`.
- [ ] No manual `fetch`/`axios` calls introduced — all API calls go through `customInstance`.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/instance.ts` — add interceptors and token setter/getter
- `apps/store-admin/src/shared/api/index.ts` — re-export token helpers

---

### TASK-038-G: Implement store-admin features/admin-auth (LoginForm + LogoutButton)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-038-E, TASK-038-F

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/admin-auth/ui/login-form.tsx` created:
  - Uses `react-hook-form` + `zodResolver` with a schema: `{ email: z.string().email(), password: z.string().min(1) }`.
  - Calls `useAuthControllerLogin` mutation from `entities/session`.
  - On success: calls `setTokens(accessToken)`, then navigates to `/`.
  - Shows appropriate error messages: 401 → "Invalid credentials", network error → "Something went wrong".
  - Fully accessible: `htmlFor`/`id` pairs, `role="alert"` on errors, keyboard-navigable submit.
  - Uses `shadcn/ui` components (`Input`, `Button`, `Label`) from `@/shared/ui`.
- [ ] `apps/store-admin/src/features/admin-auth/ui/logout-button.tsx` created:
  - Calls `useAuthControllerLogout` mutation.
  - On success: calls `clearTokens()`, navigates to `/login`.
  - Renders as an icon button with accessible `aria-label="Sign out"`.
- [ ] `apps/store-admin/src/features/admin-auth/index.ts` barrel exports both components.
- [ ] `apps/store-admin/src/features/index.ts` re-exports from `./admin-auth`.
- [ ] FSD: `features` layer only imports from `entities` and `shared`.

**Files to create/modify:**

- `apps/store-admin/src/features/admin-auth/ui/login-form.tsx` — new file
- `apps/store-admin/src/features/admin-auth/ui/logout-button.tsx` — new file
- `apps/store-admin/src/features/admin-auth/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-038-H: Add store-admin login page route and auth gate in root layout

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-038-G

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/app/(auth)/login/page.tsx` created — renders `AdminLoginForm` centered on a clean full-screen layout (no sidebar/header).
- [ ] `apps/store-admin/src/app/(auth)/layout.tsx` created — renders only `{children}` with the `Providers` wrapper (no admin shell).
- [ ] Root layout (`apps/store-admin/src/app/layout.tsx`) wraps the admin shell section in an `AdminShellGuard` client component:
  - Reads `isInitializing` and `isAdmin` from `useAuth`.
  - While `isInitializing`: renders a full-screen centered loading spinner (accessible `role="status"` + `aria-label="Loading"`).
  - Once resolved, `!isAdmin` → `router.replace('/login')` (client-side redirect).
  - Once `isAdmin` → renders `AdminSidebar + AdminHeader + {children}`.
- [ ] `AdminProvider` (wraps `AuthProvider` + `QueryClientProvider`) added to `app/providers.tsx`.
- [ ] Navigation to `/` while unauthenticated redirects to `/login`.
- [ ] Navigation to `/login` while authenticated as ADMIN redirects to `/`.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/app/(auth)/login/page.tsx` — new file
- `apps/store-admin/src/app/(auth)/layout.tsx` — new file
- `apps/store-admin/src/app/layout.tsx` — add `AdminShellGuard`
- `apps/store-admin/src/app/providers.tsx` — add `AuthProvider`
- `apps/store-admin/src/widgets/admin-shell/admin-shell-guard.tsx` — new guard component
- `apps/store-admin/src/widgets/admin-shell/index.ts` — add export

---

### TASK-038-I: Update AdminHeader with user identity and logout

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-038-G, TASK-038-H

**Acceptance Criteria:**

- [ ] `AdminHeader` updated to show the signed-in admin's email (from `useAuth().userId` — or decoded from the JWT if email is not in the payload, fall back to "Admin").
- [ ] `LogoutButton` from `features/admin-auth` wired into the header's right-side actions area (replaces or supplements the notification bell placeholder).
- [ ] Widget still satisfies FSD: `widgets` layer imports from `features` and `shared` only.
- [ ] `npm run build -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-header.tsx` — add user identity + logout

---

### TASK-038-J: Regenerate Orval API hooks for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-038-B (AdminGuard in place — no API route changes, but verifying generated hooks are up to date)

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error (generates `swagger.json`).
- [ ] `npm run generate:api -w apps/store-admin` runs without error.
- [ ] Generated files in `apps/store-admin/src/shared/api/generated/` reflect any Swagger annotation changes introduced in TASK-038-A/B (e.g., updated `@ApiResponse` 403 descriptions).
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration.
- [ ] Generated files are NOT hand-edited.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)

---

### TASK-038-K: Build, lint, typecheck, and integration verification gate

**Type:** chore
**Scope:** store-api, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** All previous TASK-038-\* subtasks

**Acceptance Criteria:**

- [ ] `npm run build` (all workspaces) completes without error.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test -w apps/store-api` passes (all unit tests, including new `roles.guard.spec.ts`, `admin.guard.spec.ts`).
- [ ] `npm run test:e2e -w apps/store-api` passes (including new `rbac.e2e-spec.ts`).
- [ ] Manual smoke test: visiting `http://localhost:3000` (store-admin) without a session redirects to `/login`; logging in with a CUSTOMER account is rejected with an appropriate error; logging in with an ADMIN account lands on the dashboard.

---

## 7. Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                                     | Action                              | Subtask |
| ---------------------------------------- | ----------------------------------- | ------- |
| `src/auth/decorators/roles.decorator.ts` | Modify — `UserRole[]` type          | 038-A   |
| `src/auth/guards/roles.guard.ts`         | Modify — `UserRole[]` type          | 038-A   |
| `src/auth/guards/roles.guard.spec.ts`    | Create — unit tests                 | 038-A   |
| `src/auth/guards/admin.guard.ts`         | Create — convenience guard          | 038-B   |
| `src/auth/guards/admin.guard.spec.ts`    | Create — unit tests                 | 038-B   |
| `src/auth/guards/index.ts`               | Modify — add `AdminGuard` export    | 038-B   |
| `src/auth/index.ts`                      | Modify — add `AdminGuard` export    | 038-B   |
| `src/product/product.controller.ts`      | Modify — use `AdminGuard`           | 038-B   |
| `src/order/order.controller.ts`          | Modify — use `AdminGuard`           | 038-B   |
| `src/category/category.controller.ts`    | Modify — update `@Roles` call sites | 038-A   |
| `prisma/seed.ts`                         | Modify — add admin upsert           | 038-D   |
| `.env.example`                           | Modify — add seed vars              | 038-D   |
| `test/rbac.e2e-spec.ts`                  | Create — guard e2e tests            | 038-C   |

### Frontend (store-admin)

| File                                            | Action                                | Subtask |
| ----------------------------------------------- | ------------------------------------- | ------- |
| `src/shared/api/instance.ts`                    | Modify — interceptors + token helpers | 038-F   |
| `src/shared/api/index.ts`                       | Modify — re-export token helpers      | 038-F   |
| `src/entities/session/model/auth.context.tsx`   | Create                                | 038-E   |
| `src/entities/session/model/use-auth.ts`        | Create                                | 038-E   |
| `src/entities/session/index.ts`                 | Create                                | 038-E   |
| `src/entities/index.ts`                         | Modify — add session re-export        | 038-E   |
| `src/features/admin-auth/ui/login-form.tsx`     | Create                                | 038-G   |
| `src/features/admin-auth/ui/logout-button.tsx`  | Create                                | 038-G   |
| `src/features/admin-auth/index.ts`              | Create                                | 038-G   |
| `src/features/index.ts`                         | Modify — add admin-auth re-export     | 038-G   |
| `src/widgets/admin-shell/admin-shell-guard.tsx` | Create                                | 038-H   |
| `src/widgets/admin-shell/admin-header.tsx`      | Modify — user identity + logout       | 038-I   |
| `src/widgets/admin-shell/index.ts`              | Modify — add guard export             | 038-H   |
| `src/app/(auth)/login/page.tsx`                 | Create                                | 038-H   |
| `src/app/(auth)/layout.tsx`                     | Create                                | 038-H   |
| `src/app/layout.tsx`                            | Modify — add `AdminShellGuard`        | 038-H   |
| `src/app/providers.tsx`                         | Modify — add `AuthProvider`           | 038-H   |
| `src/shared/api/generated/`                     | Regenerate (do not edit)              | 038-J   |

---

## 8. Testing Strategy

### Unit Tests (Jest)

| Test file                         | What it covers                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `auth/guards/roles.guard.spec.ts` | No-roles pass-through; ADMIN match; CUSTOMER reject (403); no user reject (403) |
| `auth/guards/admin.guard.spec.ts` | Missing JWT → 401; CUSTOMER JWT → 403; ADMIN JWT → pass                         |

Both test files mock the `ExecutionContext` directly (no NestJS module spin-up needed) following the pattern used in `auth.service.spec.ts`.

### E2E Tests (Supertest)

| Test file               | What it covers                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `test/rbac.e2e-spec.ts` | 401 on missing JWT (admin product create); 403 on CUSTOMER JWT; 200/201 on ADMIN JWT (guard passes, service mocked) |

The e2e spec follows the same bootstrap pattern as `order.e2e-spec.ts`: real `AppModule`, mocked repositories, `JwtService` to mint tokens directly, `ThrottlerGuardPassThrough` to disable rate limiting.

### Manual Smoke Tests

After TASK-038-H is implemented:

1. Start API (`npm run start:dev -w apps/store-api`) and admin (`npm run dev -w apps/store-admin`).
2. Visit `http://localhost:3000` — should redirect to `/login`.
3. Submit login with a CUSTOMER account — error message shown, no redirect.
4. Submit login with the seeded ADMIN account — redirected to `/` (dashboard).
5. Click logout — redirected to `/login`.

---

## 9. Security Considerations

### 401 vs 403 Semantics

- **401 Unauthorized** — the request has no valid authentication credential (missing or invalid JWT). Handled by `JwtAuthGuard`.
- **403 Forbidden** — the request is authenticated but the user lacks the required role. Handled by `RolesGuard`.

The `AdminGuard` must apply `JwtAuthGuard` first so that unauthenticated requests always receive 401, not 403. The test suite explicitly verifies both codes.

### Role Escalation Prevention

The `@Roles()` decorator uses the server-side JWT payload (`request.user.role`), which is signed by `JWT_SECRET`. Client-side role decoding in `auth.context.tsx` is used only for UI decisions (redirect logic, display name) and is never trusted by the API. This separation must be preserved.

### Admin Session in the Frontend

- Access tokens are held in React state (in-memory), not `localStorage` or `sessionStorage`, to prevent XSS exfiltration.
- Refresh tokens travel via `HttpOnly` cookie only, scoped to `/api/auth/refresh`.
- The admin app rejects sessions where `role !== 'ADMIN'` at the `AuthProvider` level, so a CUSTOMER who somehow obtains the admin app URL sees the login screen.
- The `?redirect=` open-redirect guard used in `store-client` must be applied to the admin login page as well (only same-origin `/` prefix paths allowed).

### No Admin Self-Registration

The `POST /api/auth/register` endpoint always creates users with `role: UserRole.CUSTOMER`. There is no API endpoint to set `role: UserRole.ADMIN` on registration. Admin accounts are created only via the seed script or a direct DB operation. This must not change.

---

## 10. Rollout and Sequencing

TASK-038 is the gate for Phase 4. The sub-tasks form a linear dependency chain within the backend (A → B → C) and the frontend (E → F → G → H → I → J):

```
TASK-038-A (RolesGuard type safety)
    └── TASK-038-B (AdminGuard)
          └── TASK-038-C (e2e guard tests)
          └── TASK-038-J (Orval regen — no API changes, but verify)

TASK-038-D (seed admin user)           [independent, can run in parallel]

TASK-038-E (entities/session)
    └── TASK-038-F (Axios interceptors)
          └── TASK-038-G (LoginForm + LogoutButton)
                └── TASK-038-H (login page + auth gate)
                      └── TASK-038-I (AdminHeader user identity)

TASK-038-K (final verification gate)   [last, all must be done]
```

Once TASK-038-K is green:

- **TASK-039** (Admin Product CRUD) can begin immediately — it uses `AdminGuard` on the backend and the `store-admin` auth session on the frontend.
- **TASK-040** (Admin Category CRUD), **TASK-041** (Admin Order management), and **TASK-042** (Admin User management) are also unblocked and can proceed in any order.

---

## 11. Open Questions

1. **Email in JWT payload?** Currently the JWT payload contains `{ sub, role }` only. The `AdminHeader` user display might want the admin's email. Options: (a) add `email` to the JWT payload in `generateTokenPair` (minor breaking change to token shape), or (b) fetch the user profile via `GET /api/users/profile` after login. Option (b) is preferred — it avoids changing the token shape and aligns with how `store-client` could eventually display user info. The `AdminHeader` can call `useGetUserProfile` (already generated by Orval) to display the admin email.

2. **SUPER_ADMIN role?** Out of scope for MVP. If a finer-grained role (e.g., a "super admin" who can promote other users) is needed in a future phase, the `UserRole` enum and `@Roles()` decorator are already structured to accommodate additional values.
