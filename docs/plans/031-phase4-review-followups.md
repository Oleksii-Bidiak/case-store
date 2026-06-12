# Plan 031 — Phase 4 Admin Panel Code-Review Follow-ups (TASK-061..TASK-067)

> **Status:** Implemented — TASK-061..065, 067 done & verified (235 unit + 163 e2e green, build/lint/typecheck clean). TASK-066 int-spec written & type-correct but unverified locally (no Postgres on :5432 — runs under the CI `test:int` job).
> **Phase:** Phase 4 — Admin Panel (code-review follow-ups)
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-13

## Overview

This plan captures seven security and quality findings from the Phase 4 Admin Panel
code review. They are sequenced by severity (HIGH → MEDIUM → LOW) and produce no
new user-visible features — each task closes a concrete gap in correctness, security,
or test coverage that the automated gate does not yet catch.

The findings span three areas:

1. **Authentication hardening (TASK-061..063):** A deactivated (`isActive === false`)
   user can still obtain tokens or continue using an existing refresh token. The
   `JwtAccessStrategy.validate()` also emits no DB lookup at all, meaning a banned
   user whose access token has not yet expired keeps API access for up to 15 minutes.
   These three tasks collectively close that window.

2. **Dashboard raw-SQL correctness and coverage (TASK-064, TASK-066):**
   `DashboardRepository.getTopProducts` joins `order_items` without filtering out
   `CANCELLED`/`REFUNDED` orders, so cancelled revenue inflates the top-products
   metric even though the revenue trend correctly excludes those statuses. A
   real-DB integration spec is also missing — the existing e2e suite mocks the
   repository, so it cannot prove the `generate_series` gap-fill or SQL arithmetic.

3. **Self-ban prevention at the API layer (TASK-065):** The frontend
   `features/user-ban-toggle` already disables the button when the current user is
   trying to ban themselves, but there is no backend guard. An admin can bypass the
   UI and call `PATCH /api/users/:id/deactivate` directly, locking themselves out.

4. **Consistency cleanup (TASK-067):** `UserController` still uses
   `@UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN)` on its admin endpoints
   while every other admin controller switched to `@UseGuards(AdminGuard)` in
   TASK-038-B. Also, the dashboard day-series queries use `DATE_TRUNC` in the DB
   session timezone while the JS `windowStart` helper computes midnight in the
   server-local timezone — these need to be aligned or explicitly documented.

---

## Scope

### In Scope

- `AuthService.login` / `AuthService.refreshToken` — add `isActive` check.
- `AuthRepository.findByEmail` / `findRefreshToken` — confirm `isActive` field is
  returned (it is, via `include: { user: true }` and full `User` select); no schema
  change needed.
- `UserService.deactivateUser` — call `authRepository.revokeAllUserTokens` after
  deactivation; resolve the DI wiring between `UserModule` and `AuthModule`.
- `UserService.deactivateUser` / `UserController.deactivateUser` — accept and enforce
  `adminId !== targetId` check.
- `auth.service.spec.ts` — TDD extension for TASK-061 (deactivated-login,
  deactivated-refresh).
- `user.service.spec.ts` — unit test that `deactivateUser` triggers revocation and
  that self-ban throws `ForbiddenException`.
- `auth.e2e-spec.ts` — new banned-user 401 specs for login and refresh.
- `user.e2e-spec.ts` — admin-deactivates-self 403 spec.
- `DashboardRepository.getTopProducts` — add `INNER JOIN orders` with
  `status NOT IN ('CANCELLED', 'REFUNDED')`.
- `apps/store-api/test/dashboard.repository.int-spec.ts` — new integration spec
  mirroring the `test:int` harness.
- `UserController` admin endpoints — migrate from
  `@UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN)` to `@UseGuards(AdminGuard)`.
- Dashboard timezone comment / normalisation.

### Out of Scope

- Making `JwtAccessStrategy.validate()` perform a live DB lookup on every request
  (that would remove stateless JWT benefits; this plan relies on the 15-minute
  access-token window + immediate refresh-token revocation to bound the exposure).
- Sending a "your account has been banned" email notification — Phase 5.
- Redis session blocklist for instant access-token revocation — Phase 5.
- Storefront or admin frontend changes (no UI changes required for these tasks).
- Changes to `UserController.activate` (re-activating is always safe).
- Changing the default dashboard window from 30 days.

---

## User Stories

1. As a security engineer, I want a deactivated user to be immediately rejected at
   login and token-refresh so that a banned account cannot obtain new credentials.
2. As a security engineer, I want banning a user to atomically revoke all their
   refresh tokens so that existing sessions cannot outlive the ban.
3. As an admin, I want the API to prevent me from accidentally banning my own account
   so that I cannot lock myself out of the system via a direct API call.
4. As an admin, I want the top-products revenue metric to exclude cancelled and
   refunded orders so that the dashboard reflects earned revenue consistently.
5. As a developer, I want a real-DB integration spec for the dashboard SQL so that
   I can trust the `generate_series` gap-fill and arithmetic are correct.

---

## Technical Design

### Current State — What the Code Review Found

#### Finding 1 — isActive not checked in AuthService (TASK-061, HIGH)

`AuthService.login()` (line 59 in `auth.service.ts`) calls
`authRepository.findByEmail(email)` which returns the full `User` Prisma record
(the `User` type includes `isActive`). After verifying the password, the method
immediately calls `generateTokenPair` without checking `user.isActive`.

`AuthService.refreshToken()` (line 84) calls
`authRepository.findRefreshToken(oldToken)` which returns `RefreshTokenWithUser`
(a `RefreshToken` with `user: User` included via `include: { user: true }`). The
`user` field therefore carries `isActive`. After the reuse/expiry checks, the method
calls `generateTokenPair(storedToken.user.id, storedToken.user.role)` without
checking `storedToken.user.isActive`.

No schema or repository changes are required — both methods already have access to
`isActive`; they just need to check it.

#### Finding 2 — Sessions not revoked on ban (TASK-062, HIGH)

`UserService.deactivateUser()` sets `isActive = false` via `UserRepository.deactivate`
but does not invalidate the user's refresh tokens. A banned user can therefore
continue to silently refresh their access token for up to 7 days.

`AuthRepository.revokeAllUserTokens(userId)` already exists with the correct
signature (`updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } })`).
The DI question is how to give `UserService` access to it.

**DI Decision for TASK-062:**

The cleanest approach is to import `AuthModule` into `UserModule`. `AuthModule`
already exports both `AuthRepository` and `AuthService` (see `auth.module.ts`
line 32: `exports: [AuthRepository, AuthService]`). Importing `AuthModule` into
`UserModule` therefore gives `UserService` access to `AuthRepository` without
creating any circular dependency (AuthModule imports CartModule; UserModule is not
in that chain). The implementation injects `AuthRepository` directly into
`UserService` and calls `authRepository.revokeAllUserTokens(id)` inside
`deactivateUser` after the `userRepository.deactivate(id)` call.

An alternative would be to define a thin `TokenRevocationService` in a shared
module, but this adds a new abstraction layer with no benefit given the existing
clean export from `AuthModule`. The direct `AuthRepository` injection is chosen.

#### Finding 3 — No e2e coverage for banned-user auth paths (TASK-063, HIGH)

`auth.e2e-spec.ts` tests register, login, refresh, and logout but has no test for
a deactivated user attempting login or refresh. The mock pattern is already
established: `authRepositoryMock.findByEmail` and `authRepositoryMock.findRefreshToken`
return controlled objects. Adding `isActive: false` to those returns is sufficient.

#### Finding 4 — getTopProducts ignores order status (TASK-064, MEDIUM)

`DashboardRepository.getTopProducts` (line 194) runs:

```sql
SELECT oi.product_id AS "productId",
       p.name AS name,
       SUM(oi.price * oi.quantity)::float8 AS "totalRevenue"
FROM order_items oi
JOIN products p ON p.id = oi.product_id
GROUP BY oi.product_id, p.name
ORDER BY "totalRevenue" DESC
LIMIT ${limit}
```

There is no JOIN to the `orders` table and no status filter. Items from
`CANCELLED` and `REFUNDED` orders are counted, which inflates the revenue figure
and potentially mis-ranks products. The fix adds `INNER JOIN orders o ON o.id = oi.order_id`
with `AND o.status NOT IN ('CANCELLED', 'REFUNDED')`.

#### Finding 5 — Self-ban not guarded at API layer (TASK-065, MEDIUM)

`UserController.deactivateUser` receives only `@Param('id')` — it has no reference
to the calling admin's own ID. `@CurrentUser('id')` is already used in the same
controller for `/me` endpoints, so the pattern is established. The fix passes
`@CurrentUser('id') adminId: string` as a second parameter and delegates the check
to `UserService.deactivateUser(id, adminId)`, which throws `ForbiddenException`
when `id === adminId`.

#### Finding 6 — No real-DB integration coverage for dashboard SQL (TASK-066, MEDIUM)

The existing `dashboard.e2e-spec.ts` (TASK-043-B) mocks `DashboardRepository` at
the NestJS provider level. This means none of the raw `$queryRaw` SQL — including
`generate_series`, `DATE_TRUNC`, the gap-fill LEFT JOIN, and `SUM(price*quantity)` —
is executed against a real database. A real-DB integration spec is required to
close this gap, mirroring the `cart.repository.int-spec.ts` harness.

#### Finding 7 — Guard inconsistency + timezone comment (TASK-067, LOW)

`UserController` admin endpoints use:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
```

The three other admin controllers (`AdminOrderController`, `AdminCategoryController`,
`DashboardController`) use `@UseGuards(AdminGuard)` since TASK-038-B. The
`/me` endpoints correctly stay on `JwtAuthGuard` alone.

The dashboard `windowStart` JS helper computes midnight in the **server-local TZ**
(`new Date()` + `setHours(0,0,0,0)`). The SQL series anchor is
`DATE_TRUNC('day', NOW())` which respects the **PostgreSQL session TZ** (usually
UTC in Docker). In a UTC Docker container and a server also running UTC these
coincide, but they would diverge if either is changed. For MVP the behaviour is
acceptable; the task documents it with an explicit code comment.

---

## Tasks

### TASK-061: Enforce isActive in AuthService login and refreshToken

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/src/auth/auth.service.spec.ts` extended BEFORE the fix
      (TDD — Red) with two new failing `describe` blocks:
  - `describe('login — deactivated user')`: mocks `findByEmail` to return a user
    with `isActive: false` and valid password hash; asserts that `login()` throws
    `UnauthorizedException` with message `'Account is deactivated'`.
  - `describe('refreshToken — deactivated user')`: mocks `findRefreshToken` to
    return a non-revoked, non-expired token whose `.user.isActive === false`; asserts
    that `refreshToken()` throws `UnauthorizedException` with message
    `'Account is deactivated'`.
- [ ] `apps/store-api/src/auth/auth.service.ts` `login()` updated (TDD — Green):
      after the `isPasswordValid` check, add:
  ```typescript
  if (!user.isActive) {
    throw new UnauthorizedException("Account is deactivated");
  }
  ```
- [ ] `auth.service.ts` `refreshToken()` updated (TDD — Green): after the expiry
      check and before `generateTokenPair`, add:
  ```typescript
  if (!storedToken.user.isActive) {
    throw new UnauthorizedException("Account is deactivated");
  }
  ```
- [ ] `authRepository.findByEmail` already returns the full `User` record (Prisma
      default select — `User` type includes `isActive`); no repository change needed.
      Confirm this via the existing `AuthRepository` code: `findByEmail` uses
      `this.prisma.user.findUnique({ where: { email } })` with no explicit `select`,
      so the full row including `isActive` is returned.
- [ ] `authRepository.findRefreshToken` returns `RefreshTokenWithUser` which has
      `user: User` via `include: { user: true }` — `user.isActive` is available.
      No repository change needed.
- [ ] `npm run test -w apps/store-api` passes — all new specs green; all existing
      auth service, auth e2e, and other unit specs unaffected.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run lint -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/auth/auth.service.spec.ts` — extend with TDD Red tests first, then Green
- `apps/store-api/src/auth/auth.service.ts` — add `isActive` check in `login()` and `refreshToken()`

---

### TASK-062: Revoke all sessions when a user is deactivated

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes
**Depends on:** TASK-061

**Acceptance Criteria:**

- [ ] `apps/store-api/src/user/user.service.spec.ts` extended BEFORE the fix
      (TDD — Red) with:
  - A test asserting that `deactivateUser(id)` calls
    `authRepository.revokeAllUserTokens(id)` after persisting the deactivation.
  - A test asserting the call happens even when the user already has `isActive: false`
    (idempotent re-deactivation: tokens must still be revoked to handle the edge case
    where prior revocation missed some tokens).
- [ ] `apps/store-api/src/user/user.module.ts` updated: import `AuthModule`
      (already exports `AuthRepository`) so `UserModule` providers can inject
      `AuthRepository`.
- [ ] `apps/store-api/src/user/user.service.ts` updated (TDD — Green):
  - Constructor gains `private readonly authRepository: AuthRepository` parameter.
  - `deactivateUser(id: string)` calls
    `await this.authRepository.revokeAllUserTokens(id)` after the
    `this.userRepository.deactivate(id)` call.
  - Import added: `import { AuthRepository } from '../auth/auth.repository'`.
- [ ] No circular dependency introduced: `AuthModule` → `CartModule` is the only
      transitive import; `UserModule` does not appear in that chain. Verify by running
      `npm run build -w apps/store-api` (NestJS will throw at startup if a circular
      dependency exists).
- [ ] `npm run test -w apps/store-api` passes — all new specs green; existing user
      service unit tests still pass.
- [ ] `npm run build -w apps/store-api` passes without circular dependency warnings.
- [ ] `npm run lint -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/user/user.service.spec.ts` — add TDD revocation tests
- `apps/store-api/src/user/user.service.ts` — inject AuthRepository, call revokeAllUserTokens
- `apps/store-api/src/user/user.module.ts` — import AuthModule

---

### TASK-063: E2E coverage — banned user cannot authenticate

**Type:** test
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-061

**Acceptance Criteria:**

- [ ] `apps/store-api/test/auth.e2e-spec.ts` extended with a new
      `describe('Deactivated user — authentication blocked')` block containing:
  - `POST /api/auth/login` with a deactivated user (mock `findByEmail` to return
    `{ ...validUser, isActive: false }` with valid password hash verified by
    `argon2.hash`) → asserts HTTP 401 and response body
    `{ message: 'Account is deactivated' }`.
  - `POST /api/auth/refresh` with a refresh token belonging to a deactivated user
    (mock `findRefreshToken` to return
    `{ isRevoked: false, expiresAt: future, user: { ...validUser, isActive: false } }`)
    → asserts HTTP 401 and response body `{ message: 'Account is deactivated' }`.
- [ ] Mock setup mirrors the existing `auth.e2e-spec.ts` pattern: use
      `authRepositoryMock.findByEmail.mockResolvedValueOnce(...)` and
      `authRepositoryMock.findRefreshToken.mockResolvedValueOnce(...)` inside the
      individual `it` blocks. For the login spec, `argon2.hash` the test password in a
      `beforeAll` within the new describe block so the password-verify step passes and
      the test reaches the `isActive` check.
- [ ] No new NestJS module bootstrap required — extend the existing `app` fixture
      defined in the outer `beforeAll`.
- [ ] `npm run test:e2e -w apps/store-api` passes — all new specs green; existing
      auth e2e specs unaffected.
- [ ] `npm run test -w apps/store-api` passes (unit specs unaffected).

**Files to create/modify:**

- `apps/store-api/test/auth.e2e-spec.ts` — add deactivated-user 401 specs

---

### TASK-064: Fix getTopProducts to exclude cancelled and refunded orders

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/src/dashboard/dashboard.repository.ts`
      `getTopProducts` raw query updated: the `FROM order_items oi` clause gains an
      `INNER JOIN orders o ON o.id = oi.order_id AND o.status NOT IN ('CANCELLED', 'REFUNDED')`.
      The final query reads:
  ```sql
  SELECT oi.product_id AS "productId",
         p.name AS name,
         SUM(oi.price * oi.quantity)::float8 AS "totalRevenue"
  FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
    AND o.status NOT IN ('CANCELLED', 'REFUNDED')
  JOIN products p ON p.id = oi.product_id
  GROUP BY oi.product_id, p.name
  ORDER BY "totalRevenue" DESC
  LIMIT ${limit}
  ```
- [ ] The `NON_REVENUE_STATUSES` constant already defined at the top of the file
      (`[OrderStatus.CANCELLED, OrderStatus.REFUNDED]`) is used conceptually but the
      raw query must enumerate the string literals because Prisma `$queryRaw` tagged
      templates cannot interpolate arrays as SQL `IN` lists safely. Document this with
      a comment referencing `NON_REVENUE_STATUSES`.
- [ ] Existing `dashboard.e2e-spec.ts` still passes (the mocked repository is
      unaffected — only the real SQL changes).
- [ ] TASK-066 integration spec (when implemented) asserts that a product with only
      CANCELLED order-items does not appear in top-products, providing the executable
      proof of this fix.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run test -w apps/store-api` passes.
- [ ] `npm run test:e2e -w apps/store-api` passes.
- [ ] `npm run lint -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.repository.ts` — update `getTopProducts` raw SQL

---

### TASK-065: Prevent admin self-ban at the API layer

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** TASK-062

**Acceptance Criteria:**

- [ ] `apps/store-api/src/user/user.service.spec.ts` extended BEFORE the fix
      (TDD — Red) with:
  - A test asserting that `deactivateUser(id, adminId)` throws `ForbiddenException`
    with message `'Cannot deactivate your own account'` when `id === adminId`.
  - The existing deactivation tests must still pass with the new signature
    `deactivateUser(id, adminId)` where `id !== adminId`.
- [ ] `apps/store-api/src/user/user.service.ts` `deactivateUser` signature updated:
  ```typescript
  async deactivateUser(id: string, adminId: string): Promise<UserEntity>
  ```
  Self-ban check added as the first line of the method body:
  ```typescript
  if (id === adminId) {
    throw new ForbiddenException("Cannot deactivate your own account");
  }
  ```
  Import added: `ForbiddenException` from `@nestjs/common`.
- [ ] `apps/store-api/src/user/user.controller.ts` `deactivateUser` handler updated:
  - `@CurrentUser('id') adminId: string` parameter added.
  - Call becomes: `this.userService.deactivateUser(id, adminId)`.
  - `@ApiResponse({ status: 403, description: 'Cannot deactivate your own account' })`
    added to the Swagger decorators for `PATCH :id/deactivate`.
- [ ] `apps/store-api/test/user.e2e-spec.ts` extended with:
  - A test in the existing admin block: `PATCH /api/users/:id/deactivate` where
    `:id` equals the calling admin's own ID → asserts HTTP 403 and response body
    `{ message: 'Cannot deactivate your own account' }`. The admin token is generated
    with `jwtService.sign({ sub: adminId, role: 'ADMIN' }, ...)`, and the target
    `:id` is the same `adminId` value. The `userRepositoryMock.findById` is configured
    to return the admin user record for that ID.
- [ ] `npm run test -w apps/store-api` passes — all new specs green; existing user
      service specs updated to pass `adminId` argument where needed.
- [ ] `npm run test:e2e -w apps/store-api` passes.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run lint -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/user/user.service.spec.ts` — add self-ban TDD tests; update existing call sites to pass `adminId`
- `apps/store-api/src/user/user.service.ts` — add `adminId` param + ForbiddenException check
- `apps/store-api/src/user/user.controller.ts` — add `@CurrentUser('id') adminId` + 403 Swagger decorator
- `apps/store-api/test/user.e2e-spec.ts` — add admin-self-deactivate 403 spec

---

### TASK-066: Dashboard real-DB integration spec

**Type:** test
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-064

**Acceptance Criteria:**

- [ ] `apps/store-api/test/dashboard.repository.int-spec.ts` created, mirroring the
      `cart.repository.int-spec.ts` harness exactly:
  - Bootstraps `DashboardRepository` + `PrismaService` via `Test.createTestingModule`
    (no `AppModule` — lean module with `ConfigModule.forRoot` + the two providers).
  - `beforeAll` guard: `if (!/test/i.test(process.env.DATABASE_URL ?? ''))` throws to
    prevent running against a non-test DB.
  - Seeds unique rows (using `randomUUID()` suffix on slugs/emails) for:
    - 1 user, 1 category, 2 products, 2 variants (stock values chosen so one is
      below threshold and one is above).
    - 3 orders in different statuses: one `DELIVERED`, one `CANCELLED`, one `PENDING`.
    - `OrderItem` rows linking each order to a variant with `price` and `quantity`.
  - `afterAll` cleans up seeded rows in reverse FK order.
  - `describe('getTopProducts')`:
    - Asserts the product with only CANCELLED order items does NOT appear in results.
    - Asserts the product with DELIVERED/PENDING order items DOES appear, with
      `totalRevenue === price * quantity` for those items only.
    - Asserts `SUM(price * quantity)` is used (not just `SUM(price)`): seed a
      variant with `quantity: 3` so the revenue is `3 * price`, then assert the
      returned `totalRevenue` matches `3 * price`.
  - `describe('generate_series gap-fill — getRevenueByDay')`:
    - With only one day's worth of seeded orders, asserts that the returned array
      has exactly 30 elements (the full window).
    - Asserts that days without orders have `value: 0`.
    - Asserts the day with the DELIVERED order has `value > 0` and the day with
      the CANCELLED order has `value === 0` (excluded).
  - `describe('getLowStockVariants')`:
    - Asserts the variant with `stock <= LOW_STOCK_THRESHOLD` appears.
    - Asserts the variant with `stock > LOW_STOCK_THRESHOLD` does NOT appear.
    - Asserts the result is ordered by stock ascending.
- [ ] The spec file targets the `test:int` Jest config (`.int-spec.ts` suffix
      — already matched by `"testRegex": ".int-spec.ts$"` in `test/jest-int.json`).
- [ ] `npm run test:int -w apps/store-api` passes with all new specs green.
- [ ] `npm run test -w apps/store-api` and `npm run test:e2e -w apps/store-api`
      are unaffected (different Jest configs / no overlap).

**Files to create/modify:**

- `apps/store-api/test/dashboard.repository.int-spec.ts` — new integration spec

---

### TASK-067: Consistency cleanup — AdminGuard migration and timezone documentation

**Type:** refactor
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-065

**Acceptance Criteria:**

#### Part A — UserController AdminGuard migration

- [ ] `apps/store-api/src/user/user.controller.ts` updated: the four admin endpoints
      (`GET /`, `GET /:id`, `PATCH /:id/deactivate`, `PATCH /:id/activate`) change from:
  ```typescript
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  ```
  to:
  ```typescript
  @UseGuards(AdminGuard)
  ```
- [ ] The two `/me` endpoints (`GET /me`, `PUT /me`) retain `@UseGuards(JwtAuthGuard)`
      — they are customer-facing and must NOT use `AdminGuard`.
- [ ] Imports updated: add `AdminGuard` import from `'../auth/guards'`; remove
      `RolesGuard` import if it is no longer used in the file; remove `Roles` decorator
      import if no longer used; remove `UserRole` import if no longer used.
- [ ] `UserRole` import may still be needed if any DTO or entity in the same file
      references it — check before removing.
- [ ] The existing `user.e2e-spec.ts` 401/403 behavioural tests continue to pass
      without modification (`AdminGuard` produces the same 401/403 outcomes as the
      previous two-guard setup).

#### Part B — Dashboard timezone documentation

- [ ] `apps/store-api/src/dashboard/dashboard.repository.ts` `windowStart` helper
      updated with an explicit comment documenting the timezone behaviour:
  ```typescript
  /**
   * Start of the rolling window (midnight, `windowDays - 1` days ago).
   *
   * NOTE — timezone alignment: this computation uses the Node.js server's local
   * timezone via `new Date()` + `setHours(0,0,0,0)`. The corresponding SQL series
   * anchor `DATE_TRUNC('day', NOW())` uses the PostgreSQL session timezone (which
   * defaults to UTC in Docker Compose). In a standard deployment where both the
   * server and the DB run UTC these two values coincide and the series is
   * consistent. If either is reconfigured to a non-UTC timezone the window
   * boundaries will diverge by up to 23 h 59 m. MVP assumption: both run UTC.
   * To make this fully robust, replace `new Date()` with
   * `new Date(Date.now()).toISOString()` as the anchor and pass it into the SQL
   * so a single UTC timestamp drives both the JS filter and the SQL series.
   */
  ```
- [ ] No logic change — comment only for Part B.

#### Shared gate

- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run lint -w apps/store-api` passes.
- [ ] `npm run typecheck -w apps/store-api` (via `tsc --noEmit`) passes.
- [ ] `npm run test -w apps/store-api` passes — all existing unit specs unaffected.
- [ ] `npm run test:e2e -w apps/store-api` passes — existing user e2e 401/403 specs
      still green after guard migration.

**Files to create/modify:**

- `apps/store-api/src/user/user.controller.ts` — swap guards on admin endpoints; update imports
- `apps/store-api/src/dashboard/dashboard.repository.ts` — add timezone comment to `windowStart`

---

## Migration Steps

No Prisma migrations are required. All tasks target existing services, repositories,
controllers, and tests.

Recommended implementation order:

1. **TASK-061** (TDD — auth service isActive check). Start here; all downstream
   auth hardening depends on this being correct at the unit level.
2. **TASK-062** (session revocation on ban; depends on TASK-061 for coherent auth
   semantics). Wire `AuthModule` into `UserModule`, inject `AuthRepository` into
   `UserService`, add TDD test.
3. **TASK-063** (e2e banned-user 401; depends on TASK-061). Can be worked in
   parallel with TASK-062 once TASK-061 is merged.
4. **TASK-064** (fix `getTopProducts` SQL). Independent of the auth tasks.
5. **TASK-065** (self-ban prevention; depends on TASK-062 because it extends the
   same `deactivateUser` signature change).
6. **TASK-066** (dashboard integration spec; depends on TASK-064 so the spec can
   assert the CANCELLED exclusion).
7. **TASK-067** (guard cleanup + timezone comment; depends on TASK-065 to ensure
   `deactivateUser` controller changes are already in place before guard refactor).

---

## Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                                    | Action                                                                                      | Task               |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------ |
| `src/auth/auth.service.ts`              | Modify — add `isActive` guard in `login()` and `refreshToken()`                             | TASK-061           |
| `src/auth/auth.service.spec.ts`         | Modify — extend with deactivated-user TDD specs                                             | TASK-061           |
| `src/user/user.service.ts`              | Modify — inject AuthRepository; add revocation call; add adminId param + self-ban check     | TASK-062, TASK-065 |
| `src/user/user.service.spec.ts`         | Modify — add revocation TDD test; add self-ban TDD test; update call sites                  | TASK-062, TASK-065 |
| `src/user/user.module.ts`               | Modify — import AuthModule                                                                  | TASK-062           |
| `src/user/user.controller.ts`           | Modify — add `@CurrentUser('id') adminId` to deactivate; swap to AdminGuard; update imports | TASK-065, TASK-067 |
| `src/dashboard/dashboard.repository.ts` | Modify — fix `getTopProducts` SQL; add timezone comment                                     | TASK-064, TASK-067 |
| `test/auth.e2e-spec.ts`                 | Modify — add banned-user 401 specs                                                          | TASK-063           |
| `test/user.e2e-spec.ts`                 | Modify — add admin-self-deactivate 403 spec                                                 | TASK-065           |
| `test/dashboard.repository.int-spec.ts` | Create — new real-DB integration spec                                                       | TASK-066           |

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                                 | Mitigation                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importing `AuthModule` into `UserModule` introduces a circular dependency if `AuthModule` ever imports `UserModule`                                                                                                  | Confirmed safe: `AuthModule` imports only `JwtModule`, `ConfigModule`, and `CartModule` — no `UserModule` in the chain. The build gate (`npm run build`) will catch any circular dependency at startup.                                         |
| `deactivateUser(id, adminId)` signature change breaks the existing `userService.deactivateUser(id)` call sites in `user.service.spec.ts`                                                                             | All existing unit tests must be updated to pass a distinct `adminId !== id` value. This is called out explicitly in TASK-065 acceptance criteria.                                                                                               |
| `getTopProducts` query change may break the existing `dashboard.e2e-spec.ts` if that spec asserts specific revenue numbers                                                                                           | The e2e spec mocks `DashboardRepository` entirely (it does not execute real SQL), so any SQL change is invisible to it. No e2e breakage expected.                                                                                               |
| The integration spec (TASK-066) requires the `store_test` database to be up and migrated                                                                                                                             | The harness already handles this: `setup-int.ts` refuses to run against a non-test DB, and the `test:int` script is gated on the CI `test-int` job (see `TASK-051-O` history). Locally, run `npx prisma migrate dev` before `npm run test:int`. |
| `revokeAllUserTokens` is called unconditionally even if the user was already inactive — this is safe (idempotent `updateMany` with `isRevoked: false` WHERE clause returns 0 rows if all tokens are already revoked) | No extra guard needed. Confirmed by reading `AuthRepository.revokeAllUserTokens`: `updateMany({ where: { userId, isRevoked: false }, ... })`.                                                                                                   |
| Access tokens already issued to a deactivated user remain valid for up to 15 minutes (JWT is stateless)                                                                                                              | Accepted for MVP. The fix (TASK-061/062) closes the refresh path immediately. A Redis blocklist (Phase 5) can reduce the access-token window to zero if required. Document the 15-minute residual window in the TASK-061 comments.              |

---

## Sequencing Diagram

```
TASK-061  (auth service: isActive check — TDD)
    ├── TASK-063  (e2e: banned-user 401 — can start in parallel once 061 merges)
    └── TASK-062  (session revocation on ban — UserModule imports AuthModule — TDD)
              └── TASK-065  (self-ban prevention — extends deactivateUser signature — TDD)
                        └── TASK-067  (guard cleanup + timezone comment)

TASK-064  (fix getTopProducts SQL — independent)
    └── TASK-066  (dashboard int-spec — asserts CANCELLED exclusion from 064)
```

TASK-063 and TASK-062 can proceed in parallel after TASK-061 lands.
TASK-064 and its dependent TASK-066 are entirely independent of the auth chain.
TASK-067 gates on TASK-065 so the controller has its final signature before the
guard swap.

---

## Notes

- **Why not add a DB lookup in JwtAccessStrategy.validate()?** Adding a `findById`
  - `isActive` check to every access-token validation would make the stateless JWT
    into a stateful lookup on every API call. The current 15-minute access-token TTL
    bounds the exposure to at most 15 minutes after a ban, which is acceptable for MVP.
    TASK-061 + TASK-062 together ensure that (a) no new tokens are issued after a ban
    and (b) all refresh tokens are invalidated, preventing token rotation from
    extending access beyond the current access-token lifetime. A Redis blocklist can
    reduce this to zero if the product requires it (Phase 5 candidate).

- **DI decision for TASK-062:** `AuthModule` is imported into `UserModule` (not vice
  versa). `AuthRepository` is injected directly into `UserService` rather than
  wrapping it in a new shared service. The rationale: `revokeAllUserTokens` is a
  single, well-defined operation already exported by `AuthModule`; adding an
  intermediate service would be over-engineering for one call site.

- **Why `INNER JOIN` instead of a subquery in TASK-064?** The `INNER JOIN orders`
  approach keeps the SQL readable and allows the query planner to use the
  `orders.status` index directly. A subquery (`WHERE oi.order_id IN (SELECT id FROM
orders WHERE ...)`) would be semantically equivalent but less idiomatic for this
  aggregation pattern.

- **Timezone note for TASK-067 Part B:** The MVP assumption (server + DB both UTC) is
  correct for the Docker Compose setup. The comment added in TASK-067 Part B ensures
  the next developer who reads the code understands the coupling and knows what to
  fix if the deployment timezone changes.

- **`UserRole` import cleanup in TASK-067:** After removing `@Roles(UserRole.ADMIN)`
  from `user.controller.ts`, verify whether `UserRole` is still referenced anywhere
  else in the file (e.g., in a DTO type annotation or response helper). If it is not,
  remove the import to avoid a lint `no-unused-vars` warning.
