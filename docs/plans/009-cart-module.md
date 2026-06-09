# Plan: Cart Module (Backend)

> **Status:** 🔄 In Progress
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-05-07
> **Last Updated:** 2026-05-07

## Overview

Implement the Cart module for the NestJS backend following Clean Architecture (Controller → Service → Repository). The cart allows authenticated users to add, remove, and update items, with automatic total calculation. The Cart schema already exists in Prisma (Cart + CartItem models), so no database migration is needed.

This is a **TDD-critical module** because cart calculations (totals, discounts, quantity validation) are business-critical and must be correct.

## Scope

### In Scope

- CartRepository with Prisma queries for cart CRUD operations
- CartService with business logic: add/remove/update items, calculate totals, validate stock
- CartController with public (authenticated user) endpoints
- Domain entities (CartEntity, CartItemEntity) with proper Decimal-to-string conversion
- DTOs for cart operations (AddToCartDto, UpdateCartItemDto)
- Unit tests for CartService (TDD — Red/Green/Refactor)
- E2E tests for Cart endpoints
- Swagger/OpenAPI decorators for API documentation

### Out of Scope

- Coupon/discount code system (Phase 5)
- Guest cart (session-based) — only authenticated carts for MVP
- Cart merge on login
- Abandoned cart detection (Phase 5)
- Frontend implementation (separate plan)

## User Stories

1. As a **logged-in customer**, I want to **add a product variant to my cart**, so that I can purchase it later.
2. As a **logged-in customer**, I want to **update the quantity of an item in my cart**, so that I can adjust my order.
3. As a **logged-in customer**, I want to **remove an item from my cart**, so that I no longer intend to purchase it.
4. As a **logged-in customer**, I want to **view my cart with all items and the total price**, so that I know what I'm about to buy.
5. As a **logged-in customer**, I want to **clear my entire cart**, so that I can start fresh.

## Technical Design

### Data Model

No Prisma schema changes needed. The existing models are sufficient:

```prisma
model Cart {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items     CartItem[]
}

model CartItem {
  id        String   @id @default(uuid())
  cartId    String   @map("cart_id")
  cart      Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id])
  variantId String?  @map("variant_id")
  variant   ProductVariant? @relation(fields: [variantId], references: [id])
  quantity  Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([cartId, productId, variantId])
}
```

### Backend (NestJS — Clean Architecture)

#### CartRepository

Located at `apps/store-api/src/cart/cart.repository.ts`

```typescript
interface AddToCartInput {
  userId: string;
  productId: string;
  variantId?: string;
  quantity: number;
}

interface UpdateCartItemInput {
  quantity: number;
}

interface CartWithItems {
  id: string;
  userId: string;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    product: {
      id: string;
      name: string;
      price: Decimal;
      compareAtPrice: Decimal | null;
      isActive: boolean;
    };
    variant: {
      id: string;
      name: string;
      price: Decimal;
      stock: number;
      isActive: boolean;
    } | null;
  }>;
}

class CartRepository {
  findByUserId(userId: string): Promise<CartWithItems | null>;
  findById(cartId: string): Promise<CartWithItems | null>;
  findOrCreate(userId: string): Promise<CartWithItems>;
  addItem(input: AddToCartInput): Promise<CartItem>;
  updateItem(itemId: string, input: UpdateCartItemInput): Promise<CartItem>;
  removeItem(itemId: string): Promise<void>;
  clearItems(cartId: string): Promise<void>;
  findItem(
    cartId: string,
    productId: string,
    variantId?: string,
  ): Promise<CartItem | null>;
}
```

#### CartService

Located at `apps/store-api/src/cart/cart.service.ts`

Business rules:

- **Add to cart**: If item already exists, increment quantity. Validate stock availability. Max quantity per item = 99.
- **Update quantity**: Validate new quantity (1-99). Validate stock. If quantity = 0, remove item.
- **Remove item**: Delete the cart item.
- **Clear cart**: Delete all items in the cart.
- **Get cart**: Return cart with items, product info, and calculated totals.
- **Calculate totals**: Sum of (item price × quantity). Use variant price if variant exists, otherwise product price.

```typescript
interface CartTotals {
  subtotal: string; // Sum of (price × quantity) for all items
  itemCount: number; // Total number of items (sum of quantities)
  uniqueItems: number; // Number of distinct line items
}

interface CartResponse {
  id: string;
  items: CartItemEntity[];
  totals: CartTotals;
}

class CartService {
  async getCart(userId: string): Promise<CartResponse>;
  async addToCart(userId: string, dto: AddToCartDto): Promise<CartResponse>;
  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponse>;
  async removeItem(userId: string, itemId: string): Promise<CartResponse>;
  async clearCart(userId: string): Promise<CartResponse>;
}
```

**TDD Required**: All calculation logic and business rules must be test-driven.

#### CartController

Located at `apps/store-api/src/cart/cart.controller.ts`

All endpoints require JWT authentication (user's own cart only).

| Method | Path                  | Description             | Auth         |
| ------ | --------------------- | ----------------------- | ------------ |
| GET    | `/cart`               | Get current user's cart | JwtAuthGuard |
| POST   | `/cart/items`         | Add item to cart        | JwtAuthGuard |
| PATCH  | `/cart/items/:itemId` | Update item quantity    | JwtAuthGuard |
| DELETE | `/cart/items/:itemId` | Remove item from cart   | JwtAuthGuard |
| DELETE | `/cart`               | Clear entire cart       | JwtAuthGuard |

### Frontend (Next.js — FSD)

Not in scope for this plan. Frontend tasks are covered by TASK-029 and TASK-030.

### API Contract

Key endpoints with request/response shapes:

| Method | Path                  | Request Body                          | Response                                 |
| ------ | --------------------- | ------------------------------------- | ---------------------------------------- |
| GET    | `/cart`               | —                                     | `{ data: CartEntity, meta: { totals } }` |
| POST   | `/cart/items`         | `{ productId, variantId?, quantity }` | `{ data: CartEntity, meta: { totals } }` |
| PATCH  | `/cart/items/:itemId` | `{ quantity }`                        | `{ data: CartEntity, meta: { totals } }` |
| DELETE | `/cart/items/:itemId` | —                                     | `{ data: CartEntity, meta: { totals } }` |
| DELETE | `/cart`               | —                                     | `{ data: CartEntity, meta: { totals } }` |

All responses return the full updated cart so the frontend can re-render.

## Tasks

### TASK-021: Create Cart domain entities and DTOs

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `CartEntity` class with `fromPrisma()` static method — converts Prisma Cart to domain entity
- [ ] `CartItemEntity` class with `fromPrisma()` — includes product name, price, quantity, line total
- [ ] `AddToCartDto` with validation: `productId` (UUID), `variantId` (optional UUID), `quantity` (1-99)
- [ ] `UpdateCartItemDto` with validation: `quantity` (1-99)
- [ ] All DTOs have `class-validator` decorators and `@ApiProperty` Swagger decorators
- [ ] Decimal fields converted to strings in entities (avoid float precision issues)
- [ ] Entities exported via `entities/index.ts` barrel file
- [ ] DTOs exported via `dto/index.ts` barrel file

**Files to create/modify:**

- `apps/store-api/src/cart/entities/cart.entity.ts` — CartEntity domain class
- `apps/store-api/src/cart/entities/cart-item.entity.ts` — CartItemEntity domain class
- `apps/store-api/src/cart/entities/index.ts` — Barrel export
- `apps/store-api/src/cart/dto/add-to-cart.dto.ts` — AddToCartDto with validation
- `apps/store-api/src/cart/dto/update-cart-item.dto.ts` — UpdateCartItemDto with validation
- `apps/store-api/src/cart/dto/index.ts` — Barrel export

---

### TASK-022: Implement CartRepository

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-021

**Acceptance Criteria:**

- [ ] `findByUserId(userId)` — returns cart with items, product details, and variant details
- [ ] `findOrCreate(userId)` — returns existing cart or creates a new one
- [ ] `addItem(input)` — creates or updates cart item (upsert pattern for existing product+variant)
- [ ] `updateItem(itemId, input)` — updates quantity of a specific cart item
- [ ] `removeItem(itemId)` — deletes a cart item
- [ ] `clearItems(cartId)` — deletes all items in a cart
- [ ] `findItem(cartId, productId, variantId?)` — finds a specific cart item
- [ ] All methods use Prisma through the injected PrismaService
- [ ] Repository follows existing patterns (Logger, interface types for inputs)
- [ ] Unit tests for repository methods (mock Prisma)

**Files to create/modify:**

- `apps/store-api/src/cart/cart.repository.ts` — CartRepository class
- `apps/store-api/src/cart/cart.repository.spec.ts` — Unit tests for repository

---

### TASK-023: Write failing unit tests for CartService (TDD — Red)

**Type:** test
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes
**Depends on:** TASK-021, TASK-022

**Acceptance Criteria:**

- [ ] Tests for `getCart()` — returns cart with items and calculated totals
- [ ] Tests for `addToCart()` — new item, existing item (quantity increment), max quantity (99), out of stock
- [ ] Tests for `updateItem()` — valid update, quantity=0 (removes item), exceeds stock, exceeds max
- [ ] Tests for `removeItem()` — removes item, throws if item not in user's cart
- [ ] Tests for `clearCart()` — removes all items
- [ ] Tests for total calculation — single item, multiple items, with/without variants
- [ ] All tests are FAILING (Red phase) — CartService methods not yet implemented
- [ ] Test file follows existing patterns (mock repository, describe blocks per method)

**Files to create/modify:**

- `apps/store-api/src/cart/cart.service.spec.ts` — Failing unit tests for CartService

---

### TASK-024: Implement CartService (TDD — Green)

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes
**Depends on:** TASK-023

**Acceptance Criteria:**

- [ ] `getCart(userId)` — fetches cart, calculates totals, returns CartResponse
- [ ] `addToCart(userId, dto)` — validates product/variant exists and is active, checks stock, adds or increments
- [ ] `updateItem(userId, itemId, dto)` — validates ownership, checks stock, updates or removes if qty=0
- [ ] `removeItem(userId, itemId)` — validates ownership, deletes item
- [ ] `clearCart(userId)` — validates ownership, deletes all items
- [ ] Stock validation: quantity requested ≤ available stock (variant stock or product-level)
- [ ] Max quantity per item: 99
- [ ] All tests from TASK-023 pass (Green phase)
- [ ] Service uses repository only — no direct Prisma imports
- [ ] Proper error handling: NotFoundException for missing cart/items, BadRequestException for invalid quantities

**Files to create/modify:**

- `apps/store-api/src/cart/cart.service.ts` — CartService with business logic

---

### TASK-025: Implement CartController and CartModule

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-021, TASK-024

**Acceptance Criteria:**

- [ ] `GET /cart` — returns current user's cart with totals
- [ ] `POST /cart/items` — adds item to cart, returns updated cart
- [ ] `PATCH /cart/items/:itemId` — updates item quantity, returns updated cart
- [ ] `DELETE /cart/items/:itemId` — removes item, returns updated cart
- [ ] `DELETE /cart` — clears cart, returns empty cart
- [ ] All endpoints protected by `JwtAuthGuard`
- [ ] User can only access their own cart (userId from JWT)
- [ ] Swagger decorators on all endpoints (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`)
- [ ] Response envelopes consistent with existing patterns (`{ data, meta? }`)
- [ ] CartModule registered in AppModule
- [ ] CartService exported from CartModule for use by Order module later
- [ ] All endpoints return proper HTTP status codes (200, 201, 400, 404)

**Files to create/modify:**

- `apps/store-api/src/cart/cart.controller.ts` — CartController with all endpoints
- `apps/store-api/src/cart/cart.module.ts` — CartModule registration
- `apps/store-api/src/cart/index.ts` — Barrel export
- `apps/store-api/src/app.module.ts` — Register CartModule

---

### TASK-026: Write E2E tests for Cart endpoints

**Type:** test
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-025

**Acceptance Criteria:**

- [ ] Test: authenticated user can get their cart (empty initially)
- [ ] Test: authenticated user can add item to cart
- [ ] Test: adding same item increments quantity
- [ ] Test: authenticated user can update item quantity
- [ ] Test: authenticated user can remove item from cart
- [ ] Test: authenticated user can clear their cart
- [ ] Test: unauthenticated user gets 401 on all cart endpoints
- [ ] Test: user cannot access another user's cart items
- [ ] Test: adding out-of-stock item returns 400
- [ ] Test: adding quantity > 99 returns 400
- [ ] E2E tests use test database (isolated from dev DB)
- [ ] All E2E tests pass with `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/test/cart/cart.e2e-spec.ts` — E2E test suite for cart endpoints
- `apps/store-api/test/cart/cart.e2e-spec.ts` — May need test utilities/fixtures

---

### TASK-027: Generate Orval hooks for Cart API

**Type:** chore
**Scope:** shared
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-025

**Acceptance Criteria:**

- [ ] Swagger spec includes all Cart endpoints with proper schemas
- [ ] Run `npm run generate:api` in store-client — generates Cart hooks without errors
- [ ] Generated hooks include: `useGetCart`, `useAddToCart`, `useUpdateCartItem`, `useRemoveCartItem`, `useClearCart`
- [ ] Generated types include: `CartEntity`, `CartItemEntity`, `AddToCartDto`, `UpdateCartItemDto`
- [ ] No TypeScript errors in generated code
- [ ] Orval config updated if needed for new tags

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/` — Auto-generated (do not edit manually)
- `apps/store-api/src/main.ts` — Verify Swagger config includes Cart module

## Migration Steps

1. **No database migration needed** — Cart and CartItem models already exist in the Prisma schema.
2. Create Cart entities and DTOs (TASK-021).
3. Implement CartRepository (TASK-022).
4. Write failing tests for CartService — TDD Red phase (TASK-023).
5. Implement CartService — TDD Green phase (TASK-024).
6. Run `npm run test -w apps/store-api` — verify all unit tests pass.
7. Implement CartController and CartModule (TASK-025).
8. Register CartModule in AppModule.
9. Write and run E2E tests (TASK-026).
10. Generate Orval hooks (TASK-027).
11. Run full build: `npm run build -w apps/store-api` — verify no errors.

## Risks & Mitigations

| Risk                                                 | Mitigation                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Decimal precision issues in cart totals              | Convert all Decimal fields to strings in entities; use string-based arithmetic or a decimal library for calculations |
| Race conditions when updating cart items             | Use Prisma transactions for add/update operations; upsert pattern for existing items                                 |
| Stock validation becomes stale between check and add | Accept eventual consistency for MVP; add optimistic stock check, rely on Order creation for final validation         |
| Cart grows unbounded (performance)                   | Max 99 items per line; cart clear endpoint; future: implement cart size limits                                       |
| Orval generation conflicts with existing hooks       | Ensure Swagger tags are unique; test generation in isolation first                                                   |

## Notes

- **Price source**: When a cart item has a variant, use the variant's price. Otherwise, use the product's price. This is important because variant prices may differ from the base product price.
- **Cart auto-creation**: The cart is lazily created on first `addToCart` call. No explicit "create cart" endpoint needed.
- **Ownership validation**: Every cart operation validates that the cart belongs to the authenticated user (userId from JWT). This prevents users from accessing other users' carts.
- **Future extension points**: The CartService is designed to support coupon codes later. The `CartTotals` interface can be extended with `discount`, `shippingCost`, `tax`, and `total` fields when the discount system is implemented.
- **TDD approach**: Follow strict Red → Green → Refactor cycle for CartService. Write ALL tests first (Red), then implement minimum code to pass (Green), then clean up (Refactor).
