# Plan 017: Guest Cart Backend

> **Status:** To Do
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11

## Overview

Extend the existing Cart backend so that any visitor — authenticated or not — can maintain a
shopping cart. The current implementation (`TASK-021..027`) stores carts exclusively by
`userId` and applies `@UseGuards(JwtAuthGuard)` to every endpoint, making the entire cart
inaccessible to guests.

This plan introduces three coordinated changes:

1. **Prisma migration:** Make `Cart.userId` nullable and add a unique `token` column.
   A guest cart is identified by an opaque token stored in an HttpOnly cookie (`cartToken`).
   An authenticated user's cart is identified by `userId`.

2. **Optional-auth guard + cart identity resolver:** A new `OptionalJwtAuthGuard` (plus a
   `CartIdentityInterceptor` or helper service) resolves who "owns" the current request's
   cart — from the JWT access token if present, or from the `cartToken` cookie otherwise. If
   neither exists, a new `cartToken` is issued and set as an HttpOnly cookie on the response,
   and an empty guest cart is lazily created.

3. **Cart-merge on login/register:** When `AuthService.login()` or `AuthService.register()`
   succeeds, the backend reads the `cartToken` cookie (if present), merges the guest cart
   items into the user's cart (summing quantities, clamping to stock and `MAX_QUANTITY = 99`),
   clears the guest cart, and clears the `cartToken` cookie. This logic is encapsulated in
   `CartService.mergeGuestCart()` and called from `AuthController.login()` /
   `AuthController.register()`.

**Scope boundary with TASK-010 (auth module):** The auth module already implements
register/login/refresh/logout with JWT access + HttpOnly refresh cookies. This plan follows
the same cookie conventions (`httpOnly`, `secure`, `sameSite: 'strict'`) already established
in `AuthController`. The `CartModule` is imported into `AuthModule` to make
`CartService.mergeGuestCart()` available to `AuthController`.

**Consumer plan:** TASK-051 (this plan) feeds into TASK-052 (storefront auth) and TASK-031
(CartPage). Once this plan is done and Orval is regenerated, the frontend can call cart
endpoints without a JWT and receive a functional guest cart via cookie.

## Current State Analysis

### Prisma `Cart` Model (must change)

```prisma
model Cart {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")   // currently NOT NULL
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  items     CartItem[]
  @@map("carts")
}
```

**Required changes:**

- `userId` → `String? @unique @map("user_id")` (nullable; one cart per user, enforced by
  partial unique index at DB level — or by app logic since Postgres `UNIQUE` allows multiple
  NULLs)
- `user` relation → `User? @relation(...)` (nullable)
- New field: `token String? @unique @map("token")` — the guest cart token (UUID v4)
- New index: `@@index([token])`

The `@@unique([userId])` constraint remains (Prisma `@unique`). Because PostgreSQL treats
`NULL != NULL` for UNIQUE constraints, multiple rows with `userId = NULL` are allowed — each
identified by its distinct `token`.

### CartRepository (must change)

- `findOrCreate(userId)` — must be split or overloaded to handle token-based and user-based
  lookup. New signature: `findOrCreate(identity: CartIdentity): Promise<CartWithItems>`.
- `findByUserId(userId)` — unchanged, still needed for merge logic.
- New: `findByToken(token: string): Promise<CartWithItems | null>`
- New: `createGuestCart(token: string): Promise<CartWithItems>`
- New: `assignCartToUser(cartId: string, userId: string): Promise<void>` — used during merge
  when user has no existing cart.
- `addItem(input: AddToCartInput)` — `userId` in `AddToCartInput` must become
  `cartId: string` (or a union identity). The repository works at cart-ID level internally.
- `CartWithItems` interface: `userId` becomes `userId: string | null`, `token` added:
  `token: string | null`.

### CartService (must change)

All service methods currently accept `userId: string` as the cart identity. They must accept
a `CartIdentity = { userId: string } | { token: string }` union type instead. A private
helper `resolveCart(identity: CartIdentity): Promise<CartWithItems>` replaces the scattered
`findByUserId` calls.

New public method: `mergeGuestCart(guestToken: string, userId: string): Promise<void>` —
called from `AuthController` after successful login/register.

### CartController (must change)

- Remove `@UseGuards(JwtAuthGuard)` from the class level.
- Remove `@ApiBearerAuth('access-token')` from the class level.
- Each route uses `@UseGuards(OptionalJwtAuthGuard)` instead.
- Replace `@CurrentUser('id') userId: string` param with a new
  `@CartIdentity() identity: ResolvedCartIdentity` custom param decorator that reads from
  `request.cartIdentity` (set by the guard/interceptor).
- On every mutating response (`addToCart`, `updateItem`, `removeItem`, `clearCart`), the
  controller must set the `cartToken` cookie on the response when the identity is token-based.
- On GET `/api/cart`, if no identity exists (no JWT and no cookie), a new `cartToken` is
  generated, the cookie is set, and an empty cart is returned.

### AuthController (must change)

- `login()` and `register()` must read the `cartToken` cookie from the incoming request and
  call `cartService.mergeGuestCart(token, userId)` before returning.
- After merge, `clearCartTokenCookie(response)` clears the guest cookie.
- `AuthModule` must import `CartModule` (which exports `CartService`).

## Architecture Decisions (Fixed)

| Decision                                                                               | Rationale                                                                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cartToken` = HttpOnly cookie, UUID v4                                                 | Same pattern as `refreshToken`; immune to XSS; opaque to client                                       |
| Cart identified by `userId` when JWT present, else `cartToken`                         | Single record per session; no duplication                                                             |
| Guest cart cleared after merge                                                         | Prevents items accumulating across sessions                                                           |
| `OptionalJwtAuthGuard` extends `AuthGuard('jwt-access')` with `handleRequest` override | NestJS-idiomatic; no error thrown for missing/invalid JWT                                             |
| Merge runs in a Prisma transaction                                                     | Atomicity: merge + clear + cookie reset happen together or not at all                                 |
| `cartToken` cookie path = `/api/cart`                                                  | Scoped so the cookie is only sent on cart requests (mirrors refresh token's `/api/auth/refresh` path) |
| `MAX_QUANTITY = 99` enforced during merge                                              | Prevents overflow when guest + user carts sum to > 99 for the same item                               |

## User Stories

1. As a guest visitor, I want to add items to a cart without logging in, so that I can
   prepare my purchase and decide to register only at checkout time.
2. As a guest, when I log in, I want my guest cart items to appear in my user cart, so that
   I do not lose the products I was considering.
3. As a developer, I want the guest cart identification to be opaque and HttpOnly, so that
   it cannot be read or forged by client-side JavaScript.

## Technical Design

### OptionalJwtAuthGuard

```ts
// apps/store-api/src/cart/guards/optional-jwt-auth.guard.ts
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt-access") {
  handleRequest<TUser>(err: unknown, user: TUser): TUser | null {
    // Do NOT throw on missing/invalid JWT — return null instead
    return user ?? null;
  }
}
```

When no valid JWT is present, `request.user` will be `null`. The `CartIdentityInterceptor`
(or equivalent logic in the controller) then reads the `cartToken` cookie.

### CartIdentity Resolution Flow

```
Incoming request to /api/cart/*
  ├── OptionalJwtAuthGuard runs
  │     ├── Valid JWT → request.user = { id, role }  (authenticated user)
  │     └── No/invalid JWT → request.user = null     (guest)
  └── CartIdentityInterceptor runs (NestJS interceptor, after guards)
        ├── request.user.id exists
        │     └── request.cartIdentity = { type: 'user', userId: request.user.id }
        └── request.user is null
              ├── cartToken cookie present
              │     └── request.cartIdentity = { type: 'token', token: cookie.cartToken }
              └── cartToken cookie absent
                    └── generate UUID → set cartToken cookie → request.cartIdentity = { type: 'token', token: newToken }
```

The interceptor sets `cartToken` cookie on the response only when a new token was generated.
`CartIdentityInterceptor` is applied at the controller class level via `@UseInterceptors`.

### ResolvedCartIdentity Type

```ts
export type ResolvedCartIdentity =
  | { type: "user"; userId: string }
  | { type: "token"; token: string };
```

The `@CartIdentity()` custom param decorator reads `request.cartIdentity` (set by the
interceptor) and passes it to the controller method.

### CartWithItems Interface Extension

```ts
export interface CartWithItems {
  id: string;
  userId: string | null;  // changed from string
  token: string | null;   // new
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ ... }>;  // unchanged
}
```

### CartService.mergeGuestCart()

```ts
async mergeGuestCart(guestToken: string, userId: string): Promise<void> {
  // Runs inside a Prisma transaction:
  // 1. Find guest cart by token
  // 2. If no guest cart or guest cart is empty → return early
  // 3. Find or create user cart
  // 4. For each guest item:
  //    a. Find existing user cart item with same (productId, variantId)
  //    b. If exists: new qty = min(MAX_QUANTITY, existingQty + guestQty);
  //       clamp to variant.stock if variant present
  //    c. If not exists: copy item to user cart (same clamp logic)
  // 5. Delete guest cart (cascades CartItems)
}
```

### CartEntity Update

`CartEntity` currently has `userId!: string` (non-nullable). After the migration it must be
`userId: string | null` and a new field `token: string | null` must be added (or `token`
can be omitted from the entity if it should not be exposed to the client — see Security note
below).

**Security:** The `cartToken` value itself should NOT be included in the JSON response body
(`CartEntity`). It travels only via the HttpOnly cookie. `CartEntity.userId` can remain as
`string | null` — showing `null` for guest carts is acceptable and informs frontend logic.

### Cookie Conventions (mirror auth pattern)

```ts
// Same options as refreshToken cookie in AuthController
response.cookie("cartToken", token, {
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
  path: "/api/cart", // scoped to cart endpoints only
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — guest carts persist longer
});
```

Clearing the `cartToken` after merge:

```ts
response.cookie("cartToken", "", {
  httpOnly: true,
  secure: isProduction,
  sameSite: "strict",
  path: "/api/cart",
  maxAge: 0,
});
```

### ENV Validation

No new env variables required for the cart token. The `CART_TOKEN_EXPIRY_DAYS` constant is
hardcoded to 30 in the interceptor (sufficient for MVP). If a configurable value is desired
later, add it to `EnvironmentVariables` in `src/config/env.validation.ts`.

### Swagger Annotations

- Remove `@ApiBearerAuth('access-token')` from the Cart controller class.
- Add `@ApiCookieAuth('cart-token')` decorator to the controller class, documenting the
  optional `cartToken` cookie.
- Add `@ApiSecurity([])` or similar to indicate endpoints are accessible without auth.
- Response bodies for all cart endpoints remain unchanged (`CartEntity` within the envelope).
- `CartEntity` Swagger schema: update `userId` to `nullable: true`.

### Orval Regeneration

After all backend changes are committed and the OpenAPI spec is re-exported
(`npm run swagger:export -w apps/store-api`), run:

```bash
npm run generate:api -w apps/store-client
npm run generate:api -w apps/store-admin
```

The `401` response codes on cart endpoints will be removed from the spec. Any generated
code that assumed 401 (e.g., frontend error-handling branches) must be reviewed.

## Tasks

### TASK-051-A: Prisma migration — nullable userId + token column on Cart

**Type:** chore
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** none (first task in this plan)

**Acceptance Criteria:**

- [ ] `apps/store-api/prisma/schema.prisma` `Cart` model updated:
  - `userId String? @unique @map("user_id")` (was `String @unique`)
  - `user User? @relation(...)` (nullable relation)
  - New field: `token String? @unique @map("token")`
  - New index: `@@index([token])`
- [ ] A Prisma migration file is created via `npx prisma migrate dev --name guest-cart-token`
      (run from `apps/store-api/`)
- [ ] Migration SQL makes `user_id` nullable (`ALTER TABLE carts ALTER COLUMN user_id DROP NOT NULL`)
      and adds `token VARCHAR UNIQUE`
- [ ] `npx prisma generate` succeeds — `@prisma/client` types reflect nullable `userId` and `token`
- [ ] Existing rows (users with carts) are NOT broken — their `userId` remains populated,
      `token` defaults to `NULL`
- [ ] `npx prisma db push` (or the migration) applies cleanly to the dev database
- [ ] `CartWithItems` interface in `cart.repository.ts` updated:
  - `userId: string | null`
  - `token: string | null`
- [ ] `CartEntity.fromPrisma()` static method updated to accept nullable `userId` and `token`
- [ ] `CartEntity` class field `userId!: string` changed to `userId: string | null` with
      `@ApiProperty({ nullable: true })`
- [ ] `CartEntity` class field `token` added but marked `@ApiHideProperty()` (not exposed
      in JSON response — only travels via cookie)
- [ ] `npm run typecheck -w apps/store-api` passes with no errors

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — update `Cart` model
- `apps/store-api/prisma/migrations/<timestamp>_guest_cart_token/migration.sql` — created by CLI
- `apps/store-api/src/cart/cart.repository.ts` — update `CartWithItems` interface
- `apps/store-api/src/cart/entities/cart.entity.ts` — update `userId`, add `token`

---

### TASK-051-B: Implement OptionalJwtAuthGuard

**Type:** feat
**Scope:** store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** none (independent of schema change)

**Acceptance Criteria:**

- [ ] `apps/store-api/src/cart/guards/optional-jwt-auth.guard.ts` created
- [ ] `OptionalJwtAuthGuard` extends `AuthGuard('jwt-access')` (same strategy as
      `JwtAuthGuard`)
- [ ] `handleRequest<TUser>(err: unknown, user: TUser): TUser | null` overrides the base
      implementation to return `null` instead of throwing on missing/invalid JWT
- [ ] When a valid JWT is provided, `request.user` is populated with `{ id, role }` as normal
- [ ] When NO JWT is provided, `request.user` is `null` — no 401 is thrown
- [ ] When an EXPIRED or INVALID JWT is provided, `request.user` is `null` — no 401 is thrown
- [ ] `apps/store-api/src/cart/guards/index.ts` created (or updated) to export
      `OptionalJwtAuthGuard`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/cart/guards/optional-jwt-auth.guard.ts` — new file
- `apps/store-api/src/cart/guards/index.ts` — new barrel

---

### TASK-051-C: Implement CartIdentityInterceptor

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-051-B

**Acceptance Criteria:**

- [ ] `apps/store-api/src/cart/interceptors/cart-identity.interceptor.ts` created
- [ ] `CartIdentityInterceptor` implements `NestInterceptor`
- [ ] On intercept:
  1. If `request.user?.id` is truthy → sets `request.cartIdentity = { type: 'user', userId: request.user.id }`; does not read or write the `cartToken` cookie
  2. If `request.user` is null and `request.cookies.cartToken` is present → sets
     `request.cartIdentity = { type: 'token', token: request.cookies.cartToken }`
  3. If `request.user` is null and no `cartToken` cookie → generates a UUID v4 token,
     sets `request.cartIdentity = { type: 'token', token: newToken }`, AND calls
     `response.cookie('cartToken', newToken, { ...guestCookieOptions })` so the browser
     receives the cookie immediately
- [ ] `guestCookieOptions` matches the project's pattern:
      `{ httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/api/cart', maxAge: 30 * 24 * 60 * 60 * 1000 }`
- [ ] `isProduction` is read via injected `ConfigService` (`NODE_ENV === 'production'`)
- [ ] The interceptor is `@Injectable()` and declared in the `CartModule` providers array
- [ ] `ResolvedCartIdentity` type is exported from
      `apps/store-api/src/cart/interceptors/cart-identity.interceptor.ts` (or a co-located
      types file)
- [ ] `@CartIdentity()` custom param decorator created at
      `apps/store-api/src/cart/decorators/cart-identity.decorator.ts`:
      reads `request.cartIdentity` from the `ExecutionContext`
- [ ] `apps/store-api/src/cart/interceptors/index.ts` and
      `apps/store-api/src/cart/decorators/index.ts` barrels created
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/cart/interceptors/cart-identity.interceptor.ts` — new file
- `apps/store-api/src/cart/interceptors/index.ts` — new barrel
- `apps/store-api/src/cart/decorators/cart-identity.decorator.ts` — new file
- `apps/store-api/src/cart/decorators/index.ts` — new barrel

---

### TASK-051-D: Update CartRepository for dual-identity lookup

**Type:** refactor
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-051-A

**Acceptance Criteria:**

- [ ] `CartRepository` updated with the following new / changed methods:

  **New:** `findByToken(token: string): Promise<CartWithItems | null>`
  - Queries `prisma.cart.findUnique({ where: { token }, include: CART_ITEMS_INCLUDE })`

  **New:** `findOrCreateByToken(token: string): Promise<CartWithItems>`
  - Upserts a cart with `where: { token }`, `create: { token }`, `update: {}`

  **Changed:** `findOrCreate(identity: CartIdentity): Promise<CartWithItems>`
  - `CartIdentity = { type: 'user'; userId: string } | { type: 'token'; token: string }`
  - Delegates to `findOrCreateByUserId` or `findOrCreateByToken` based on type

  **Changed:** `addItem(input: AddToCartInput): Promise<CartWithItems>`
  - `AddToCartInput` changes: remove `userId: string`, add `cartId: string`
  - The service resolves `cartId` before calling `addItem` (via `findOrCreate`)

  **New:** `assignCartToUser(cartId: string, userId: string): Promise<void>`
  - `prisma.cart.update({ where: { id: cartId }, data: { userId, token: null } })`
  - Used when a guest cart becomes the user's only cart (no prior user cart exists)

- [ ] `CART_ITEMS_INCLUDE` unchanged — still selects same fields
- [ ] All existing `findByUserId` usages inside the repository are unchanged
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to modify:**

- `apps/store-api/src/cart/cart.repository.ts` — add/update methods

---

### TASK-051-E: Update CartService for dual-identity and add mergeGuestCart

**Type:** feat
**Scope:** store-api
**Complexity:** L (4-6h)
**TDD Required:** Yes
**Depends on:** TASK-051-D

**Acceptance Criteria:**

- [ ] `CartService` method signatures updated:
  - `getCart(identity: ResolvedCartIdentity): Promise<CartEntity>`
  - `addToCart(identity: ResolvedCartIdentity, dto: AddToCartDto): Promise<CartEntity>`
  - `updateItem(identity: ResolvedCartIdentity, itemId: string, dto: UpdateCartItemDto): Promise<CartEntity>`
  - `removeItem(identity: ResolvedCartIdentity, itemId: string): Promise<CartEntity>`
  - `clearCart(identity: ResolvedCartIdentity): Promise<CartEntity>`

- [ ] Private helper `resolveCart(identity: ResolvedCartIdentity): Promise<CartWithItems | null>`:
  - `{ type: 'user' }` → `cartRepository.findByUserId(userId)`
  - `{ type: 'token' }` → `cartRepository.findByToken(token)`

- [ ] Private helper `resolveOrCreateCart(identity): Promise<CartWithItems>`:
  - Calls `cartRepository.findOrCreate(identity)` (the updated overloaded version)

- [ ] `updateItem` and `removeItem` use `resolveCart` and throw `NotFoundException` if cart is
      not found (same as today), but now works for token-based carts

- [ ] New public method `mergeGuestCart(guestToken: string, userId: string): Promise<void>`:
  - Runs inside `this.cartRepository.prisma.$transaction(async (tx) => { ... })`
    (or via a dedicated repository transaction method)
  - Steps:
    1. Find guest cart by token; if not found or no items → return (no-op)
    2. Find user cart via `findByUserId`; if not found, call `assignCartToUser(guestCart.id, userId)` and return (guest cart becomes user cart)
    3. For each guest item, find matching item in user cart (`productId` + `variantId` match):
       - If match found: update quantity = `Math.min(MAX_QUANTITY, existingQty + guestQty)`;
         further clamp to `variant.stock` if `variant !== null`
       - If no match: copy item to user cart (create new `CartItem` record with `cartId = userCart.id`)
    4. Delete guest cart (Prisma `onDelete: Cascade` removes all its `CartItem` rows)

- [ ] TDD — write failing unit tests FIRST (TASK-051-E-Red) then implement (TASK-051-E-Green):
  - Test: `mergeGuestCart` with empty guest cart → no-op
  - Test: `mergeGuestCart` with no existing user cart → guest cart reassigned to user
  - Test: `mergeGuestCart` with non-overlapping items → all items copied to user cart
  - Test: `mergeGuestCart` with overlapping item → quantities summed, clamped to `MAX_QUANTITY`
  - Test: `mergeGuestCart` with overlapping item exceeding stock → clamped to `variant.stock`
  - Test: `getCart` with token identity → returns guest cart
  - Test: `getCart` with user identity → returns user cart

- [ ] `npm run test -w apps/store-api` passes (all cart service tests green)
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to modify:**

- `apps/store-api/src/cart/cart.service.ts` — update all methods + add `mergeGuestCart`
- `apps/store-api/src/cart/cart.service.spec.ts` — add/update unit tests

---

### TASK-051-F: Update CartController for optional auth

**Type:** refactor
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-051-C, TASK-051-E

**Acceptance Criteria:**

- [ ] `@UseGuards(JwtAuthGuard)` removed from the `CartController` class
- [ ] `@ApiBearerAuth('access-token')` removed from the `CartController` class
- [ ] `@UseGuards(OptionalJwtAuthGuard)` added at the class level
- [ ] `@UseInterceptors(CartIdentityInterceptor)` added at the class level
- [ ] `@ApiCookieAuth('cart-token')` added at the class level to document the optional cookie
- [ ] Each route method signature updated:
  - Remove `@CurrentUser('id') userId: string`
  - Add `@CartIdentity() identity: ResolvedCartIdentity`
  - Each method passes `identity` to the service method

- [ ] All five route methods (`getCart`, `addToCart`, `updateItem`, `removeItem`,
      `clearCart`) updated to call the service with `ResolvedCartIdentity`

- [ ] `@ApiResponse({ status: 401, description: 'Unauthorized' })` removed from all cart
      endpoints (cart endpoints no longer require auth)

- [ ] `@ApiResponse({ status: 200, description: 'Cart with items and totals' ... })` kept
      on `getCart`; description updated to "Guest or user cart"

- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run lint -w apps/store-api` passes

**Files to modify:**

- `apps/store-api/src/cart/cart.controller.ts` — full update

---

### TASK-051-G: Update CartModule to register new providers

**Type:** chore
**Scope:** store-api
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-051-B, TASK-051-C

**Acceptance Criteria:**

- [ ] `CartModule` providers array includes `CartIdentityInterceptor`
- [ ] `CartModule` imports `ConfigModule` (already globally available via `AppModule`, but
      explicitly listed for clarity since `CartIdentityInterceptor` injects `ConfigService`)
- [ ] `CartModule.exports` still includes `CartService` (unchanged)
- [ ] `npm run build -w apps/store-api` exits with code 0

**Files to modify:**

- `apps/store-api/src/cart/cart.module.ts` — update providers/imports

---

### TASK-051-H: Wire cart-merge into AuthController (login + register)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-051-E, TASK-051-G

**Acceptance Criteria:**

- [ ] `AuthModule` imports `CartModule` so `CartService` is injectable in `AuthController`
- [ ] `AuthController` constructor injects `CartService` as a new dependency
- [ ] `AuthController.login()` updated:
  1. Reads `request.cookies?.cartToken` (via `@Req() request: Request` parameter or
     `@Req()` + Express `req.cookies`)
  2. Calls `this.authService.login(dto.email, dto.password)` as before
  3. If `cartToken` cookie is present: calls
     `await this.cartService.mergeGuestCart(cartToken, tokens.userId)`
  4. Calls `clearCartTokenCookie(response)` after merge
  5. Sets refresh cookie and returns `{ data: { accessToken } }` as before

- [ ] `AuthController.register()` updated with the same merge logic (steps 1-5)

- [ ] Helper method `clearCartTokenCookie(response: Response): void` added to
      `AuthController` (private method, mirrors `clearRefreshCookie`):

  ```ts
  response.cookie("cartToken", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/cart",
    maxAge: 0,
  });
  ```

- [ ] Swagger `@ApiOperation` summaries for login/register updated to note cart merge:
      "Authenticate user (merges guest cart if cartToken cookie present)"

- [ ] If `mergeGuestCart` throws, the error is caught and LOGGED (not re-thrown) — a failed
      merge must not prevent a successful login. This avoids a broken cart blocking authentication.

- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run lint -w apps/store-api` passes

**Files to modify:**

- `apps/store-api/src/auth/auth.module.ts` — add `CartModule` to imports
- `apps/store-api/src/auth/auth.controller.ts` — inject `CartService`, add merge logic

---

### TASK-051-I: Update E2E tests for guest + authenticated + merge paths

**Type:** test
**Scope:** store-api
**Complexity:** L (4-6h)
**TDD Required:** No
**Depends on:** TASK-051-F, TASK-051-H

**Acceptance Criteria:**

- [ ] Existing cart E2E tests (TASK-026) updated to use the new identity model:
  - Authenticated path tests now explicitly set `Authorization: Bearer <token>` header
  - Tests still pass for all existing authenticated cart operations

- [ ] New E2E test suite `cart-guest.e2e-spec.ts` (or added to existing spec):

  **Guest cart — no cookie:**
  - `GET /api/cart` with NO cookie and NO JWT → 200 response + `Set-Cookie: cartToken=<uuid>; HttpOnly`
  - Response body is an empty cart (`items: [], totals.itemCount: 0`)

  **Guest cart — with cartToken cookie:**
  - `POST /api/cart/items` with `cartToken` cookie and NO JWT → 201, item added, same cart
  - `GET /api/cart` with same `cartToken` cookie → 200, returns cart with the added item
  - `PATCH /api/cart/items/:itemId` with `cartToken` cookie → 200, quantity updated
  - `DELETE /api/cart/items/:itemId` with `cartToken` cookie → 200, item removed
  - `DELETE /api/cart` with `cartToken` cookie → 200, cart cleared

  **Merge on login:**
  - Register user A; obtain `userId`
  - Create a guest cart via cookie; add item X (qty 2) and item Y (qty 1)
  - `POST /api/auth/login` with valid credentials AND `cartToken` cookie →
    - Response: 200 with `accessToken`
    - Response: `Set-Cookie: cartToken=; MaxAge=0` (cookie cleared)
  - `GET /api/cart` with the new access token (no cookie) →
    - Returns user cart containing item X (qty 2) and item Y (qty 1)

  **Merge with overlap:**
  - User has existing cart with item X (qty 3)
  - Guest cart has item X (qty 2) → after merge, user cart has item X (qty 5)

  **Merge with quantity clamp:**
  - User has item X (qty 90); guest cart has item X (qty 15)
  - After merge, user cart has item X (qty 99) — clamped to `MAX_QUANTITY`

  **Merge failure does not block login:**
  - If `mergeGuestCart` throws (e.g., product deleted), login still returns 200 with
    `accessToken` (error is logged, not propagated)

- [ ] All e2e tests run against an isolated test database (existing pattern from TASK-026)
- [ ] `npm run test:e2e -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/test/cart-guest.e2e-spec.ts` — new file (or added to existing cart e2e)
- `apps/store-api/test/cart.e2e-spec.ts` — update existing tests

---

### TASK-051-J: Regenerate Orval API hooks (store-client + store-admin)

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-051-F (cart controller updated, OpenAPI spec changed)

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs successfully and produces updated
      `apps/store-api/swagger.json` reflecting:
  - Cart endpoints have no `401` response code
  - `CartEntity.userId` is `nullable: true` in the schema
  - `ApiCookieAuth('cart-token')` appears in cart endpoint security schemes
- [ ] `npm run generate:api -w apps/store-client` runs without errors; generated cart hooks
      are updated in `apps/store-client/src/shared/api/generated/cart/`
- [ ] `npm run generate:api -w apps/store-admin` runs without errors
- [ ] `npm run typecheck -w apps/store-client` passes after regeneration
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration
- [ ] `getGetCartQueryKey()` still exported; no hook names have changed (the HTTP operations
      are the same, only the security model changed)
- [ ] `TASK-031` (CartPage) and `TASK-052` (storefront auth) are unblocked by this regeneration

**Files modified by tool (do not hand-edit):**

- `apps/store-client/src/shared/api/generated/` — all files regenerated
- `apps/store-admin/src/shared/api/generated/` — all files regenerated

## Migration Steps

Execute in this order:

1. **TASK-051-A** — Schema migration (no code dependencies; run first so types exist)
2. **TASK-051-B** — `OptionalJwtAuthGuard` (standalone)
3. **TASK-051-D** — Repository update (depends on A for Prisma types)
4. **TASK-051-C** — `CartIdentityInterceptor` (depends on B, uses `ConfigService`)
5. **TASK-051-E** — Service update + TDD (depends on D)
6. **TASK-051-F** — Controller update (depends on C + E)
7. **TASK-051-G** — CartModule wiring (depends on B + C)
8. **TASK-051-H** — AuthController merge wiring (depends on E + G)
9. **TASK-051-I** — E2E tests (depends on F + H; full integration)
10. **TASK-051-J** — Orval regeneration (depends on F; unblocks frontend plans)

## Risks and Mitigations

| Risk                                                                                                                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Prisma migration on a live database.** Making `userId` nullable is non-destructive (existing rows keep their `userId`). Adding `token` column with `DEFAULT NULL` is safe. The migration is backward-compatible.                                                                                        | Test migration on dev DB before staging. Keep migration SQL in source control. Rollback: `ALTER TABLE carts ALTER COLUMN user_id SET NOT NULL; ALTER TABLE carts DROP COLUMN token;`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`@@unique([userId])` in Prisma allows only one NULL per implementation — but PostgreSQL UNIQUE indexes allow multiple NULLs.** Prisma generates a `findUnique` query using the unique constraint, which will not work for `token = NULL`. We rely on the `token` field being unique-indexed separately. | Both `userId` and `token` have separate `@unique` decorators in the schema. Guest carts use `token`; user carts use `userId`. They are never both NULL simultaneously.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`cartToken` cookie path `/api/cart` scoping.** If the browser does not send the `cartToken` cookie on `POST /api/auth/login` (path `/api/auth`), the merge cannot happen.                                                                                                                               | The `cartToken` cookie path must be `/api/cart` for security scoping, but the merge needs the token during login. Solution: the frontend reads the `cartToken` cookie value (NOT accessible via JS if HttpOnly) — or, alternatively, path is set to `/api` (broader scope). **Recommended fix: use `path: '/api'` for the `cartToken` cookie**, so it is sent on all `/api/*` requests including login. The `refreshToken` uses `/api/auth/refresh` because it's only needed there. The `cartToken` has no such restriction. Update cookie path to `/api` in `CartIdentityInterceptor` and `AuthController`. |
| **Authenticated user sending both a valid JWT and a `cartToken` cookie.** The `CartIdentityInterceptor` will correctly prefer the JWT (`request.user.id` is truthy) and ignore the cookie. However, a stale `cartToken` cookie with path `/api` will persist until it expires (30 days).                  | This is acceptable. Stale cookies are ignored. A future improvement could clear the `cartToken` cookie on any authenticated cart request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`mergeGuestCart` failure blocking login.**                                                                                                                                                                                                                                                              | Wrapped in try/catch; error is logged but not re-thrown. Login succeeds regardless.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`CartService` injected into `AuthController` creates a circular module dependency.** `AuthModule` → `CartModule` → (no dependency on AuthModule) — this is a one-way dependency, so there is no circular reference.                                                                                     | Verify with `@nestjs/core` circular dependency detection in unit tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Existing cart E2E tests send `Authorization: Bearer` header — they still work after the guard change.** `OptionalJwtAuthGuard` is a superset of `JwtAuthGuard`; it accepts valid tokens normally.                                                                                                       | Confirmed by running existing tests after TASK-051-F.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Review Follow-ups (deferred to next session)

From the code review on 2026-06-11 (read-only). No CRITICAL issues; the items below are
WARNINGs to resolve **before merging `develop` → `main`**. Tracked in BACKLOG as
TASK-051-K..N.

### TASK-051-K — Make `mergeGuestCart` transactional (WARNING #1)

**Problem:** `CartService.mergeGuestCart` (`cart.service.ts:152-193`) is a sequence of
independent repository calls, not one DB transaction. A mid-loop failure leaves the user cart
partially merged and the guest cart undeleted; meanwhile `AuthController.mergeGuestCartIfPresent`
clears the `cartToken` cookie in its `finally` block even on failure, so the un-merged remainder
is orphaned with no retry path.

**Fix:**

- Add a repository method that runs the whole merge in a single `prisma.$transaction` (upsert
  each clamped line + delete the guest cart atomically). The service computes the clamped
  quantities (stock / MAX_QUANTITY=99) and hands the line list to the transactional method.
- In `AuthController.mergeGuestCartIfPresent`, clear the `cartToken` cookie **only on success**
  (move `clearCartTokenCookie` out of `finally`) so a transient failure can retry on the next
  authenticated request.
- Keep the try/catch so a failed merge still never blocks login.

### TASK-051-L — Handle `findOrCreate` vs `assignCartToUser` race (WARNING #2)

**Problem:** `assignCartToUser` does `UPDATE carts SET user_id=?, token=NULL`. A concurrent
`findOrCreate({type:'user'})` could create a second user cart, making `assignCartToUser` violate
the `userId @unique` constraint (Prisma `P2002`) — e.g. multi-tab login.

**Fix:** Re-check for an existing user cart inside the merge transaction (TASK-051-K); or catch
`P2002` in `assignCartToUser` and fall back to the item-by-item merge path.

### TASK-051-M — Add unit/e2e coverage for the untested identity layer (WARNING #1/#2 support)

**Problem:** `OptionalJwtAuthGuard`, `CartIdentityInterceptor`, and
`AuthController.mergeGuestCartIfPresent` (decode + try/catch + cookie clear) have no tests.
`mergeGuestCart` lacks a mixed overlap+new+delete case and the `quantity <= 0` `continue` branch.

**Fix:** Add unit tests for the interceptor (cookie issuance, identity precedence) and the
merge mixed case; assert "merge failure does not block login" and "cookie not cleared on
failure" (after TASK-051-K).

### TASK-051-N — Apply migration + write guest/merge e2e (WARNING #4) — ⚠️ user will re-verify manually

**Problem:** The migration (`20260611120000_guest_cart_token`) is **not yet applied** (no DB at
implementation time) and the guest/merge **e2e tests (TASK-051-I) are not written**, so the
dual-identity DB paths (`findByToken`, upsert-by-token, `assignCartToUser` with `token:null`,
nullable `user_id`, unique `token`) have never executed against Postgres.

**Fix / verification:**

- Apply the migration on a dev/test DB (`npm run prisma:migrate -w apps/store-api`).
- Write TASK-051-I e2e: guest gets `cartToken`; guest can't read another cart by forging a
  token (404/empty, not 500); login with `cartToken` merges + clears cookie; login with a
  malformed `cartToken` still succeeds. Run migration in CI via `prisma migrate deploy`.
- **NOTE:** the user will also re-verify these flows manually (see `docs/manual-qa-phase2.md`).

### SUGGESTIONS (optional, non-blocking)

- Return `userId` from `AuthService.login/register` and pass it to `mergeGuestCart` instead of
  `jwtService.decode(accessToken)` in `AuthController` — removes the `jwtService` dependency and
  the brittle `as { sub?: string }` cast (`auth.controller.ts:261-262`).
- `setItemQuantity` writes an absolute quantity with no DB-level stock guard — acceptable for
  MVP (stock re-validated at checkout, Phase 3); revisit when the Order module lands.
