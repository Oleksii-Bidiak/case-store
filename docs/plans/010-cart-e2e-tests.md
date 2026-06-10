# Plan: Cart Module — E2E Tests (TASK-026)

> **Status:** To Do
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-10
> **Last Updated:** 2026-06-10
> **Parent Plan:** docs/plans/009-cart-module.md

## Overview

Write a comprehensive end-to-end test suite for the Cart API endpoints in `apps/store-api`.
The suite exercises the full HTTP pipeline (controller → service → mocked repository) using
the same mock-at-the-repository-boundary pattern already established in `auth.e2e-spec.ts`,
`category.e2e-spec.ts`, and `product.e2e-spec.ts`.

Because the cart is an authenticated-only module (every endpoint requires `JwtAuthGuard`), the
suite follows the pattern from `category.e2e-spec.ts`: JWT tokens are minted directly via
`JwtService.sign()` rather than calling the rate-limited `POST /api/auth/register` endpoint,
and `CartRepository` (the clean architecture boundary) is fully mocked so no real database is
needed.

## Scope

### In Scope

- E2E test file `apps/store-api/test/cart.e2e-spec.ts`
- All five cart endpoints: GET /cart, POST /cart/items, PATCH /cart/items/:itemId,
  DELETE /cart/items/:itemId, DELETE /cart
- Authentication guard enforcement (401 on missing token)
- Ownership/IDOR isolation between two distinct users
- Validation rejection cases: out-of-stock item (400), quantity > 99 (400)
- Quantity increment on duplicate add
- Item removal by setting quantity to 0 (via PATCH with qty=0 if supported, otherwise by DELETE)
- Clear cart (all items removed, totals reset)

### Out of Scope

- Real database or Docker container — mocked repository only
- Coupon/discount code tests (Phase 5)
- Guest cart tests (not implemented)
- Frontend tests (separate plan)
- Orval hook generation (TASK-027)

## User Stories

1. As a **test author**, I want a fully isolated E2E suite for Cart endpoints, so that regressions
   are caught without a live database.
2. As a **developer**, I want the test suite to mirror the real HTTP contract, so that it catches
   controller/service integration bugs that unit tests miss.

## Technical Design

### Test Infrastructure

The project's E2E strategy is: **mock at the repository layer, keep the full NestJS pipeline**.
This is declared in `apps/store-api/test/setup-e2e.ts` and configured via
`apps/store-api/test/jest-e2e.json`.

Key points extracted from existing specs:

| Concern                              | How it is handled                                           |
| ------------------------------------ | ----------------------------------------------------------- |
| Env vars (JWT secrets, DATABASE_URL) | `setup-e2e.ts` sets them before any import via `setupFiles` |
| App bootstrap                        | `Test.createTestingModule({ imports: [AppModule] })`        |
| No real DB                           | `PrismaService` overridden with a minimal mock object       |
| No real auth repo                    | `AuthRepository` overridden with a jest mock                |
| Rate limiting                        | `APP_GUARD` overridden with `ThrottlerGuardPassThrough`     |
| JWT token for protected routes       | `jwtService.sign({ sub, role }, { secret, expiresIn })`     |
| Validation pipe                      | Registered in `beforeAll` matching `main.ts` setup          |
| Global prefix                        | `app.setGlobalPrefix('api', { exclude: ['health'] })`       |
| Mock reset                           | `jest.resetAllMocks()` in `afterEach`                       |

### Mock Objects Required

The cart module introduces `CartRepository` as the new dependency to mock. All other mocks
are already present in existing specs and must be repeated (copy-pattern):

```typescript
// CartRepository — clean architecture boundary
const cartRepositoryMock = {
  findByUserId: jest.fn(),
  findById: jest.fn(),
  findOrCreate: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
  clearItems: jest.fn(),
  findItem: jest.fn(),
};

// PrismaService — prevent connection errors
const prismaServiceMock = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  user: { findUnique: jest.fn(), create: jest.fn() },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

// AuthRepository — required by JwtAccessStrategy for user lookup
const authRepositoryMock = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  createUser: jest.fn(),
  findRefreshToken: jest.fn(),
  saveRefreshToken: jest.fn(),
  revokeToken: jest.fn(),
  revokeAllUserTokens: jest.fn(),
};

// UserRepository — required by UserModule which is always loaded via AppModule
const userRepositoryMock = {
  findById: jest.fn(),
  findByEmail: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
};
```

### Token Helper

Mirrors the pattern from `category.e2e-spec.ts` exactly:

```typescript
function generateAccessToken(userId: string, role: string): string {
  return jwtService.sign(
    { sub: userId, role },
    { secret: process.env.JWT_SECRET, expiresIn: "15m" },
  );
}
```

### Canonical CartWithItems Fixture

`CartService.getCart()`, `addToCart()`, `updateItem()`, `removeItem()`, and `clearCart()` all
call `cartRepository.findOrCreate()` or `cartRepository.findByUserId()` and return a
`CartWithItems` object. The mock must return values matching the `CartWithItems` interface
defined in `cart.repository.ts`:

```typescript
// Reusable fixture — a cart with one item (product, no variant)
const makeCartWithItems = (
  userId: string,
  items = [testCartItem],
): CartWithItems => ({
  id: "cart-e2e-1",
  userId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  items,
});

const emptyCart = (userId: string): CartWithItems => ({
  id: "cart-e2e-1",
  userId,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  items: [],
});

const testProduct = {
  id: "prod-e2e-1",
  name: "iPhone 15 Pro Case — Clear MagSafe",
  price: { toString: () => "29.99" },
  compareAtPrice: null,
  isActive: true,
};

const testCartItem = {
  id: "item-e2e-1",
  productId: "prod-e2e-1",
  variantId: null,
  quantity: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  product: testProduct,
  variant: null,
};

const testCartItemWithVariant = {
  id: "item-e2e-2",
  productId: "prod-e2e-1",
  variantId: "var-e2e-1",
  quantity: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  product: testProduct,
  variant: {
    id: "var-e2e-1",
    name: "Black",
    price: { toString: () => "34.99" },
    stock: 5,
    isActive: true,
  },
};

const testOutOfStockCartItem = {
  ...testCartItemWithVariant,
  quantity: 10, // exceeds stock of 5
};
```

### Response Shape

The controller wraps every response in `{ data: CartEntity }`. `CartEntity.fromPrisma()` computes
`totals` from items. For an empty cart the totals are `{ subtotal: '0.00', itemCount: 0, uniqueItems: 0 }`.
Tests must assert on `response.body.data` having the required shape:

```typescript
// Minimum assertions for a successful cart response
expect(response.body).toHaveProperty("data");
expect(response.body.data).toHaveProperty("id");
expect(response.body.data).toHaveProperty("userId");
expect(response.body.data).toHaveProperty("items");
expect(response.body.data).toHaveProperty("totals");
expect(response.body.data.totals).toHaveProperty("subtotal");
expect(response.body.data.totals).toHaveProperty("itemCount");
expect(response.body.data.totals).toHaveProperty("uniqueItems");
```

## Tasks

### TASK-026: Write E2E Tests for Cart Endpoints

**Type:** test
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-025

**Acceptance Criteria:**

- [ ] Test file `apps/store-api/test/cart.e2e-spec.ts` exists
- [ ] App bootstraps with mocked `CartRepository`, `AuthRepository`, `UserRepository`, `PrismaService`
- [ ] `ThrottlerGuardPassThrough` disables rate limiting in test context
- [ ] `jwtService.sign()` used to generate tokens — no calls to the auth register endpoint
- [ ] `jest.resetAllMocks()` runs in `afterEach` to prevent mock state leaking between tests
- [ ] All 10 test cases listed below pass
- [ ] `npm run test:e2e -w apps/store-api` exits with code 0

**Test Cases:**

| #   | Describe block                 | Test description                                            | Expected HTTP status |
| --- | ------------------------------ | ----------------------------------------------------------- | -------------------- |
| 1   | GET /api/cart                  | returns 200 with empty cart when no items exist             | 200                  |
| 2   | POST /api/cart/items           | adds item to cart and returns 201 with updated cart         | 201                  |
| 3   | POST /api/cart/items           | incrementing same product+variant adds to existing quantity | 201                  |
| 4   | PATCH /api/cart/items/:itemId  | updates quantity and returns 200 with updated cart          | 200                  |
| 5   | DELETE /api/cart/items/:itemId | removes item and returns 200 with updated cart              | 200                  |
| 6   | DELETE /api/cart               | clears all items and returns 200 with empty cart            | 200                  |
| 7   | Auth — all endpoints           | returns 401 when no Authorization header provided           | 401                  |
| 8   | Ownership (IDOR)               | user B cannot remove user A's cart item (404, not 200)      | 404                  |
| 9   | POST /api/cart/items           | returns 400 when item quantity exceeds variant stock        | 400                  |
| 10  | POST /api/cart/items           | returns 400 when requested quantity exceeds max (99)        | 400                  |

**Detailed mock setup per test case:**

- **TC-1 (GET empty cart):** `cartRepositoryMock.findOrCreate.mockResolvedValue(emptyCart(userA.id))`
- **TC-2 (POST add item):** `cartRepositoryMock.addItem.mockResolvedValue(makeCartWithItems(userA.id))` then `cartRepositoryMock.findOrCreate.mockResolvedValue(makeCartWithItems(userA.id))` for the post-add getCart call inside `addToCart`.
- **TC-3 (POST increment):** Mock `addItem` to return a cart where `testCartItem` has `quantity: 2`. Assert `response.body.data.items[0].quantity === 2`.
- **TC-4 (PATCH update):** `cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id))` for the ownership check; `cartRepositoryMock.updateItem.mockResolvedValue(...)` for the update; `cartRepositoryMock.findOrCreate.mockResolvedValue(updatedCart)` for the final getCart call.
- **TC-5 (DELETE item):** `cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id))` for ownership check; `cartRepositoryMock.removeItem.mockResolvedValue(undefined)`; `cartRepositoryMock.findOrCreate.mockResolvedValue(emptyCart(userA.id))` for the post-remove getCart.
- **TC-6 (DELETE cart clear):** `cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id))`; `cartRepositoryMock.clearItems.mockResolvedValue(undefined)`; `cartRepositoryMock.findOrCreate.mockResolvedValue(emptyCart(userA.id))`.
- **TC-7 (401 on all endpoints):** Do NOT set `Authorization` header. One assertion per endpoint (GET, POST, PATCH, DELETE item, DELETE cart).
- **TC-8 (IDOR):** `cartRepositoryMock.findByUserId.mockResolvedValue(makeCartWithItems(userA.id))` — the cart contains `item-e2e-1`. userB sends `DELETE /api/cart/items/item-e2e-1`. The service checks `cart.items.find(i => i.id === itemId)` and throws `NotFoundException` because userB's cart does not contain that item. Expect 404.
- **TC-9 (out of stock):** `cartRepositoryMock.addItem.mockResolvedValue(makeCartWithItems(userA.id, [testOutOfStockCartItem]))`. The service's `validateCartItems()` throws `BadRequestException`. Expect 400.
- **TC-10 (qty > 99):** Send `{ productId, quantity: 100 }`. The `AddToCartDto` `@Max(99)` decorator rejects it at the `ValidationPipe` level. Expect 400. (No mock setup needed — validation fires before the service.)

**Files to create/modify:**

- `apps/store-api/test/cart.e2e-spec.ts` — New E2E test suite (create)

## Implementation Notes

### UpdateCartItemDto validation — quantity minimum is 1

`UpdateCartItemDto` enforces `@Min(1)`, meaning `PATCH /cart/items/:id` with `{ quantity: 0 }`
returns 400 (validation error), not a service-level item removal. The service-level `quantity === 0`
path (which removes the item) is only reachable if the DTO validation is bypassed. The E2E tests
must not test quantity=0 via PATCH, since the DTO itself blocks it. This is tested in unit tests for
CartService, not here.

### addToCart flow — two repository calls

`CartService.addToCart()` calls `cartRepository.addItem()` (which returns the full `CartWithItems`)
and then calls `validateCartItems()` on the result. Unlike other service methods that call
`getCart()` at the end, `addToCart` calls `CartEntity.fromPrisma()` directly on the `addItem`
return value. This means for TC-2 and TC-3, only `cartRepositoryMock.addItem` needs to be mocked
(not `findOrCreate`).

### updateItem flow — three repository calls

`CartService.updateItem()` calls:

1. `cartRepository.findByUserId()` — ownership check
2. `cartRepository.updateItem()` — writes the new quantity
3. `this.getCart(userId)` internally, which calls `cartRepository.findOrCreate()`

All three mocks must be set up for TC-4.

### removeItem flow — three repository calls

`CartService.removeItem()` calls:

1. `cartRepository.findByUserId()` — ownership check
2. `cartRepository.removeItem()` — deletes the item
3. `this.getCart(userId)` internally, which calls `cartRepository.findOrCreate()`

All three mocks must be set up for TC-5.

### clearCart flow — three repository calls

`CartService.clearCart()` calls:

1. `cartRepository.findByUserId()` — checks cart exists
2. `cartRepository.clearItems()` — deletes all items
3. `this.getCart(userId)` internally, which calls `cartRepository.findOrCreate()`

All three mocks must be set up for TC-6.

### IDOR test (TC-8) — same item ID, different user

User A's cart contains `item-e2e-1`. User B sends `DELETE /api/cart/items/item-e2e-1`.
`cartRepositoryMock.findByUserId` is called with User B's ID and returns a cart with no items
(or a cart with a different item). The service's `find(i => i.id === 'item-e2e-1')` returns
`undefined`, and `removeItem` throws `NotFoundException('Cart item not found')`. NestJS maps this
to 404.

### App prefix

All requests use the `/api` prefix: e.g., `GET /api/cart`, `POST /api/cart/items`.

## Migration Steps

1. Confirm TASK-025 is done (CartController and CartModule registered in AppModule).
2. Create `apps/store-api/test/cart.e2e-spec.ts` following the structure of
   `apps/store-api/test/category.e2e-spec.ts`.
3. Import `CartRepository` from `../src/cart/cart.repository` and add it to the module override.
4. Define fixture helpers (`makeCartWithItems`, `emptyCart`, `testCartItem`, etc.) before the
   `describe` block.
5. Implement the `beforeAll` / `afterAll` / `afterEach` scaffolding.
6. Implement TC-7 (401 tests) first — they require no mocks and confirm guard wiring.
7. Implement TC-1 (GET empty cart) to confirm the happy-path app bootstrap.
8. Implement TC-2 through TC-6 (CRUD happy paths).
9. Implement TC-8 (IDOR / ownership).
10. Implement TC-9 (out-of-stock 400).
11. Verify TC-10 (qty > 99) is already covered by DTO validation without mocks.
12. Run `npm run test:e2e -w apps/store-api` and confirm all tests pass.

## Risks & Mitigations

| Risk                                                               | Mitigation                                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `cartRepository.findOrCreate` vs `findByUserId` confusion          | Trace each service method's exact repository call sequence in cart.service.ts before writing mocks |
| Multiple sequential repository calls in one service method         | Use `mockResolvedValueOnce` chaining when the same mock is called more than once per test          |
| UpdateCartItemDto `@Min(1)` blocks quantity=0 at DTO level         | Do not write a PATCH quantity=0 E2E test — this is a unit-test-only scenario                       |
| CartEntity.fromPrisma() panics on malformed Decimal mock           | Ensure price mocks include a `.toString()` method, not a bare number string                        |
| Test isolation — one test's `addItem` mock bleeds into next        | `jest.resetAllMocks()` in afterEach resets implementations and return values                       |
| Missing mock for a repository method causes "not a function" error | Enumerate all CartRepository methods in the mock object (8 methods as listed above)                |

## Notes

- The test file belongs at `apps/store-api/test/cart.e2e-spec.ts` (flat `test/` directory),
  matching every other existing spec. No `test/cart/` subdirectory is needed even though the
  original TASK-026 description mentioned it.
- `jest-e2e.json` uses `testRegex: ".e2e-spec.ts$"` so any `.e2e-spec.ts` file anywhere under
  `test/` is picked up automatically — no config changes are needed.
- `setup-e2e.ts` already provides the required env vars (`JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `DATABASE_URL`). No changes to that file are needed.
- `tsconfig.e2e.json` is already configured with the `@/` path alias pointing to `../src/`.
  Use `import { CartRepository } from '@/cart/cart.repository'` or a relative path — both work.
