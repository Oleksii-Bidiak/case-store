# Plan: Admin User Status Filter Fix + Ban Enforcement

> **Status:** ✅ Complete (within scope; Gap B deferred by design — see Risks)
> **Phase:** Post-Phase 5 — Critical Functional Bugs (Tier 2)
> **Created:** 2026-06-28
> **Last Updated:** 2026-06-28

> **Implementation outcome (2026-06-28):** Both defects fixed on `develop`. B5 fixed via a
> corrected `@Transform` that reads the raw `obj[key]` (the plan's original "remove `@Transform`"
> approach was proven wrong — `Boolean('false') === true`). Ban enforcement added to
> `OrderService.createOrder` (ForbiddenException for an inactive/missing user, before any cart
> work; the fetched user is reused for the confirmation email). Verified: store-api 433 unit +
> 38 order-e2e, store-admin 45 unit, typecheck/lint/build all green. Also corrected pre-existing
> drift in `order.e2e-spec.ts` (missing `findByIdForAdmin` mock from TASK-125; stale 2-arg
> `updateStatus` assertion from TASK-123). Gap B (JWT access-token window for non-order endpoints)
> remains deferred per the Risks table.

## Overview

Two distinct defects are bundled under TASK-150:

1. **B5 — "All statuses" filter is non-functional.** The `isActive` filter dropdown in the admin
   users table has no effect regardless of which option is selected. Root cause: a conflict between
   `class-transformer`'s `enableImplicitConversion: true` (set globally in `main.ts`) and a
   hand-rolled `@Transform` decorator in `UserListQueryDto.isActive`. The decorator was written to
   convert raw query-string literals (`'true'`/`'false'`) to booleans, but with implicit conversion
   enabled, `class-transformer` coerces the string to a boolean BEFORE calling the `@Transform`
   function. By the time `@Transform` executes, `value` is already a boolean, so `value === 'true'`
   (boolean vs string strict equality) always returns `false`, and the function returns `undefined`
   for every input. The filter is effectively disabled for all values.

2. **B6 — Banned/inactive users can still place orders.** A user banned via the admin panel
   (`PATCH /api/users/:id/deactivate`) has their refresh tokens revoked by
   `UserService.deactivateUser` (via `AuthRepository.revokeAllUserTokens`), and the `refreshToken`
   path in `AuthService` also guards against deactivated accounts. However, the JWT **access token**
   already in the user's browser memory remains valid until it expires (default `JWT_EXPIRATION =
'15m'`). During that window, `JwtAccessStrategy.validate()` returns `{ id, role }` from the
   token payload without a DB lookup, so the ban is invisible to the API. More critically,
   `OrderService.createOrder()` contains no `isActive` guard at all — it checks for cart existence,
   empty cart, and stock, but never confirms the placing user is still an active account. Combining
   these two gaps: a banned user with a live access token can successfully submit an order.

## Scope

### In Scope

- Fix `UserListQueryDto.isActive` transformation so the filter works correctly for `true`,
  `false`, and absent (all users).
- Add an `isActive` guard in `OrderService.createOrder()` (ForbiddenException when the user is
  inactive at order-submission time).
- Extend `UserRepository.findById` usage in `createOrder` to reuse the existing user fetch (the
  user is already fetched for the confirmation email; the check should happen before `createFromCart`
  is called).
- Write tests: repo filter spec, service filter spec, service ban-creates-order spec.
- Update the admin table test to cover the `isActive` filter URL param.

### Out of Scope

- Making `JwtAccessStrategy` do a DB lookup on every request (access-token validation latency vs.
  the 15-minute worst-case window is an acceptable trade-off; documented in Risks).
- Shortening `JWT_EXPIRATION` (owner/ops decision, not a code change).
- Adding `isActive` guards to other endpoints (profile update, cart mutations) — those are logged
  under Risks as a follow-up.
- No Prisma schema changes; both `isActive` and `deletedAt` fields already exist on `User`.

## User Stories

1. As an admin, I want the "Active" / "Inactive" / "All statuses" filter in the users table to
   return the correct set of users, so that I can quickly audit and act on banned accounts.
2. As a store owner, I want a banned (deactivated) customer to be unable to place new orders even
   if they still hold a short-lived access token, so that the ban takes effect as close to
   immediately as possible.

## Technical Design

### Data Model

No migration needed. The fix uses the existing `User.isActive` (boolean, not nullable) field
already present in the Prisma schema. Convention reminder (prisma-migration skill):

- `isActive` = reversible visibility/access toggle; can be set back to `true`.
- `deletedAt DateTime?` = permanent audit tombstone; set once, never cleared.
  Both are independent. The filter and ban logic concern only `isActive`.

### Backend (NestJS — Clean Architecture)

#### Defect 1 Root Cause Detail

`main.ts` configures the global `ValidationPipe`:

```typescript
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
```

With `enableImplicitConversion: true`, `class-transformer` converts the raw query-string value
`"false"` to the TypeScript type `boolean` (yielding `false`) before the `@Transform` callback
fires. The existing `@Transform`:

```typescript
@Transform(({ value }: { value: string }) => {
  if (value === 'true') return true;   // false === 'true' → false
  if (value === 'false') return false; // false === 'false' → false (type mismatch)
  return undefined;                    // ← always reached; filter is cleared
})
```

Both branches fail because `false` (boolean) is not strictly equal to `'true'` or `'false'`
(strings).

**Correction during implementation (verified against the installed `class-transformer`):**
the originally-proposed fix — _remove `@Transform` and rely on `enableImplicitConversion`_ — is
WRONG. The library coerces a Boolean-typed property with `return Boolean(value)`
(`TransformOperationExecutor.js`), and `Boolean('false') === true`. Removing the transform would
make `isActive=false` resolve to `true`, leaving the **Inactive** filter broken. Worse, for
`PLAIN_TO_CLASS` the executor runs implicit conversion _before_ the custom transform, so by the
time any `@Transform` fires the original string is already collapsed to a boolean.

**Actual fix:** keep `@Transform` but derive the value from the ORIGINAL source object
(`obj[key]`), which still holds the untouched `'true'`/`'false'` query string, rather than from
the already-coerced `value`:

```typescript
@Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return undefined; // unrecognised → no filter
})
```

#### Defect 2 Guard Location

`OrderService.createOrder(userId, dto)` does not check `UserRepository.findById(userId).isActive`.
The user is only fetched after `orderRepository.createFromCart(...)` for the email dispatch:

```typescript
const order = await this.orderRepository.createFromCart({...}); // ← order already created
...
const user = await this.userRepository.findById(userId);        // ← too late for ban check
```

Fix: fetch the user before `createFromCart` and throw `ForbiddenException('Account is
deactivated')` when `!user.isActive`. The same fetch can then be reused for the email path,
eliminating the redundant DB call.

#### UserListQueryDto (TASK-150-A)

Rewrite the `@Transform` on `isActive` to read `obj[key]` (the raw query string) instead of the
implicitly-coerced `value` (see the corrected root-cause detail above). Keep `@IsOptional`,
`@IsBoolean`. No other files change.

```
apps/store-api/src/user/dto/user-list-query.dto.ts
```

#### OrderService (TASK-150-C)

`createOrder` modification:

1. Fetch the user BEFORE `cartRepository.findByUserId`:
   ```typescript
   const user = await this.userRepository.findById(userId);
   if (!user || !user.isActive) {
     throw new ForbiddenException("Account is deactivated");
   }
   ```
2. Remove the second `userRepository.findById(userId)` call (currently only used for the email)
   and pass `user` down to the mail block.

```
apps/store-api/src/order/order.service.ts
```

### Frontend (Next.js — FSD)

No frontend changes are required for either fix:

- The admin users table (`AdminUserTable.tsx`) already correctly converts `isActiveParam` to
  `isActive: boolean | undefined` before passing it to `useUserControllerFindAll`. The filter
  correctly sends `isActive=true` / `isActive=false` / (omitted) to the API. Once the backend
  DTO transform is fixed, the filter will work end-to-end.
- No Orval regeneration is needed (the `UserControllerFindAllParams.isActive?: boolean` type is
  already correct in the generated model).

## Tasks

### TASK-150-A: Fix `UserListQueryDto.isActive` @Transform conflict

**Type:** fix
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No (covered in TASK-150-B)
**Depends on:** —

**Acceptance Criteria:**

- [x] `@Transform` on `UserListQueryDto.isActive` reads `obj[key]` (raw query string), not the
      implicitly-coerced `value`.
- [x] `@IsOptional`, `@IsBoolean` remain in place.
- [x] `isActive=true` → `true`; `isActive=false` → `false`; absent/unrecognised → `undefined`
      (proven by `user-list-query.dto.spec.ts` under `enableImplicitConversion`).
- [x] All existing store-api tests still pass: `npm run test -w apps/store-api`.

**Files modified:**

- `apps/store-api/src/user/dto/user-list-query.dto.ts` — `@Transform` rewritten to read `obj[key]`

---

### TASK-150-B: Backend tests — isActive filter in DTO, service, repository

**Type:** test
**Scope:** store-api
**Complexity:** M (1–2 h)
**TDD Required:** Yes (write the failing test first, then TASK-150-A makes it green)
**Depends on:** TASK-150-A

**Acceptance Criteria:**

- [ ] `user.repository.spec.ts` — new `findAll` cases:
  - `isActive: true` → `where.isActive === true` passed to Prisma `findMany`/`count`.
  - `isActive: false` → `where.isActive === false` passed to Prisma.
  - `isActive: undefined` → `where.isActive` not set (all users, only `deletedAt: null`).
- [ ] `user.service.spec.ts` — existing `findAll > should pass filter parameters to repository`
      extended to also assert `isActive: false` is forwarded unchanged.
- [ ] `AdminUserTable.test.tsx` — new test: selecting "Inactive" from the status filter calls
      `router.replace` with a URL containing `isActive=false`; selecting "All statuses" calls
      `router.replace` without `isActive` in the URL (or clears it).
- [ ] All tests green: `npm run test -w apps/store-api`, `npm run test -w apps/store-admin`.

**Files to modify:**

- `apps/store-api/src/user/user.repository.spec.ts` — add `isActive` filter assertions
- `apps/store-api/src/user/user.service.spec.ts` — extend `findAll` filter test with `isActive: false`
- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.test.tsx` — add status filter interaction tests

---

### TASK-150-C: Add `isActive` guard to `OrderService.createOrder`

**Type:** fix
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** Yes (Red first)
**Depends on:** —

**Acceptance Criteria:**

- [ ] `OrderService.createOrder` fetches the user via `UserRepository.findById(userId)` as its
      FIRST async operation (before cart lookup).
- [ ] If the user is not found or `!user.isActive`, throws `ForbiddenException('Account is
deactivated')`.
- [ ] The subsequent confirmation-email block reuses the same user object — no second
      `userRepository.findById` call.
- [ ] `POST /api/orders` with a valid JWT for a banned user returns `403`.
- [ ] `POST /api/orders` with a valid JWT for an active user creates the order normally.
- [ ] All existing `OrderService` tests still pass.

**Files to modify:**

- `apps/store-api/src/order/order.service.ts` — add user-active guard at the top of `createOrder`;
  remove the duplicate `findById` call in the mail block

---

### TASK-150-D: TDD — OrderService ban-guard tests

**Type:** test
**Scope:** store-api
**Complexity:** M (1–2 h)
**TDD Required:** Yes (Red→Green→Refactor)
**Depends on:** TASK-150-C

**Acceptance Criteria:**

- [ ] `order.service.spec.ts` — new `createOrder` describe block sub-cases:
  - `userRepository.findById` returns `null` → `createOrder` throws `ForbiddenException`.
  - `userRepository.findById` returns a user with `isActive: false` → throws `ForbiddenException`.
  - `userRepository.findById` returns a user with `isActive: true` → proceeds to cart check (no
    forbidden error thrown; existing happy-path test still passes).
- [ ] `userRepository.findById` is called as the first mock call in the happy-path test (before
      `cartRepository.findByUserId`), asserting the guard precedes cart logic.
- [ ] No second `userRepository.findById` call in the happy-path test execution (confirm the
      reuse, verify `userRepository.findById` call count is 1 total).
- [ ] All store-api tests green: `npm run test -w apps/store-api`.

**Files to modify:**

- `apps/store-api/src/order/order.service.spec.ts` — add `createOrder > banned/inactive user`
  describe sub-block; update the `recipient` user fixture where needed to confirm single fetch

---

### TASK-150-E: Admin users table — verify filter integration (frontend test extension)

**Type:** test
**Scope:** store-admin
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-150-B

**Acceptance Criteria:**

- [ ] `AdminUserTable.test.tsx` has tests verifying that the status `<Select>` controls the URL
      query string:
  - Selecting "Active" (`"true"`) → `router.replace` called with URL containing `isActive=true`.
  - Selecting "Inactive" (`"false"`) → `router.replace` called with URL containing `isActive=false`.
  - Selecting "All statuses" (`"__all__"`) → `router.replace` called with URL NOT containing
    `isActive` (param deleted).
- [ ] Existing sort tests still pass.
- [ ] `npm run test -w apps/store-admin` green.

**Files to modify:**

- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.test.tsx` — add status filter
  interaction tests using the existing `mockReplace` spy and MSW stub

---

## Migration Steps

No database migration. Execution order:

1. **TASK-150-B first (Red phase):** Write the failing tests before any code changes. Confirms
   the defect is reproducible at the test layer.
2. **TASK-150-A:** Rewrite the `@Transform` to read `obj[key]`. Tests from TASK-150-B turn green.
3. **TASK-150-D first (Red phase for order guard):** Write the failing `ForbiddenException` tests
   for `createOrder`. Confirms the missing guard.
4. **TASK-150-C:** Add the user-active guard to `createOrder`. TASK-150-D tests go green.
5. **TASK-150-E:** Frontend filter tests (can run in parallel with TASK-150-A/B).

## Risks & Mitigations

| Risk                                                                                                       | Mitigation                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Access-token window (up to 15 min) still allows other actions (cart mutations, profile reads) after a ban. | Acceptable for MVP: `deactivateUser` already revokes all refresh tokens, so the banned session cannot extend beyond the current access token's TTL. Order creation is the critical path blocked by TASK-150-C. Other endpoints can be hardened in a follow-up if needed. |
| Adding a DB lookup at the top of `createOrder` introduces a sequential user-fetch before cart logic.       | The user fetch is lightweight (PK lookup), and the order-creation path already had a user fetch (for email). Net cost is zero — we move the existing fetch earlier.                                                                                                      |
| `JwtAccessStrategy.validate()` still does not check `isActive`.                                            | Documented. To close this fully, a DB lookup could be added to `validate()` or a custom `ActiveUserGuard` applied to all authenticated routes. The trade-off (one extra DB query per request) is owner's call.                                                           |
| Other boolean query DTOs might share the same broken pattern.                                              | Audit search for `@Transform.*'true'` across all DTOs confirmed only `UserListQueryDto.isActive` uses this pattern. No other DTO is affected.                                                                                                                            |
| Unrecognised input (`?isActive=banana`) silently yields no filter rather than a 400.                       | The `obj[key]` transform maps anything that isn't `true`/`false` to `undefined`, which `@IsOptional` accepts → "all statuses". This is the safe/lenient default for an admin filter; add `@Matches(/^(true                                                               | false)$/)` later if strict rejection is ever required. |

## Notes

### Note on `enableImplicitConversion` string→boolean rules

`class-transformer` with `enableImplicitConversion: true` uses its own string→boolean map for
URL query parameters:

- `"true"` → `true`
- `"1"` → `true`
- `"yes"` → `true`
- `"false"` → `false`
- `"0"` → `false`
- `"no"` → `false`
- Any other non-empty string → `true` (JavaScript truthy fallback)

The last point is why a follow-up `@Matches(/^(true|false)$/)` guard is worth considering to
reject unexpected inputs such as `?isActive=banana` → would silently become `true`.

### Note on session revocation completeness

`UserService.deactivateUser` already calls `AuthRepository.revokeAllUserTokens(id)`, which sets
`isRevoked = true` on every `RefreshToken` row for the banned user. The refresh endpoint
(`AuthService.refreshToken`) also checks `!storedToken.user.isActive`. So the ban is already
enforced at the refresh-token boundary. TASK-150-C closes the only remaining gap (order creation
during the access-token window).

### Note on test file for AdminUserTable

The existing `AdminUserTable.test.tsx` mocks `useSearchParams` with `new URLSearchParams("")`.
To test filter changes, the tests need to simulate the `onValueChange` callback of the status
`<Select>` and assert `mockReplace` is called with the correct URL. The component reads
`searchParams` from `useSearchParams()`, so mock return values need to be swapped between test
cases (e.g., using `jest.mocked` + `mockReturnValueOnce`).
