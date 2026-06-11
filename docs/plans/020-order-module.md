# Plan 020: Order Module (Backend) — TDD

> **Status:** Done
> **Phase:** Phase 3 — Checkout & Orders
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11
> **BACKLOG task:** TASK-033

## Overview

Implement the Order module for the NestJS backend following Clean Architecture
(Repository → Service → Controller). The module allows an authenticated user to
create an order from their current cart, track order status, and view order
history. Price and product data are snapshotted at purchase time so the order
record is immutable even if products change later.

This is a **TDD-critical module** — `OrderService` business logic (create-from-cart,
state machine transitions, ownership checks) must be implemented following the
strict Red → Green → Refactor cycle defined in `requirements.md §4.1`.

**Scope boundary with TASK-034 (Payment stub):** This plan ends at a fully
functional HTTP API that creates orders, persists them to Postgres, enforces
business rules, and returns correct responses. Payment intent creation (Stripe)
is wired in TASK-034. `Order.paymentStatus` starts as `PENDING` and is updated
by the payment webhook handler, not this plan.

**Scope boundary with TASK-035 (Checkout frontend):** No frontend code. Orval
regeneration is included here as a final sub-task so TASK-035 can begin
immediately after.

## Prisma Schema Analysis

The `Order`, `OrderItem`, and all required enums already exist in
`apps/store-api/prisma/schema.prisma`. No new models are needed; however the
current schema is reviewed below to confirm it supports all required operations.

### Existing Order model (confirmed in schema)

```prisma
model Order {
  id              String        @id @default(uuid())
  userId          String        @map("user_id")
  user            User          @relation(fields: [userId], references: [id])
  status          OrderStatus   @default(PENDING)
  paymentStatus   PaymentStatus @default(PENDING) @map("payment_status")
  subtotal        Decimal       @db.Decimal(10, 2)
  discount        Decimal       @default(0) @db.Decimal(10, 2)
  shippingCost    Decimal       @default(0) @map("shipping_cost") @db.Decimal(10, 2)
  tax             Decimal       @default(0) @db.Decimal(10, 2)
  total           Decimal       @db.Decimal(10, 2)
  shippingAddress Json?         @map("shipping_address")
  billingAddress  Json?         @map("billing_address")
  notes           String?
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  items           OrderItem[]

  @@index([userId])
  @@index([status])
  @@index([createdAt(sort: Desc)])
  @@map("orders")
}
```

### Existing OrderItem model (confirmed in schema)

```prisma
model OrderItem {
  id        String          @id @default(uuid())
  orderId   String          @map("order_id")
  order     Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String          @map("product_id")
  product   Product         @relation(fields: [productId], references: [id])
  variantId String?         @map("variant_id")
  variant   ProductVariant? @relation(fields: [variantId], references: [id])
  quantity  Int
  price     Decimal         @db.Decimal(10, 2)  // price snapshot at purchase
  createdAt DateTime        @default(now()) @map("created_at")

  @@index([orderId])
  @@map("order_items")
}
```

### Existing enums (confirmed in schema)

```prisma
enum OrderStatus  { PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED }
enum PaymentStatus { PENDING PAID FAILED REFUNDED }
```

### Schema decisions for this plan

| Decision                                                        | Rationale                                                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Prisma migration needed                                      | `Order`, `OrderItem`, all enums, and all indexes already exist                                                                                                             |
| `shippingAddress` / `billingAddress` stored as `Json?`          | Snapshot semantics — address data is embedded in the order, not linked to `Address` table. The `CreateOrderDto` accepts a typed address object that is serialised to JSON. |
| `discount`, `shippingCost`, `tax` fields exist but default to 0 | Set to 0 for Phase 3 MVP; coupon/tax logic comes in Phase 5                                                                                                                |
| `OrderItem.price` is the price at time of purchase              | Snapshotted from `variant.price ?? product.price` during order creation, not recalculated after                                                                            |
| `OrderItem` has no `updatedAt`                                  | Order lines are immutable once created — correct per schema                                                                                                                |
| No `orderNumber` human-readable field in schema                 | The UUID `id` is used in API responses; a `orderNumber` column can be added via migration in a later phase                                                                 |

**Open question for user (schema):** The `Order` model has no `orderNumber`
(human-readable sequence, e.g. `ORD-20260611-001`). Do you want to add a
`orderNumber` field in this plan, or defer it? If deferred, the UUID `id` is
used throughout. **Recommendation: defer to Phase 4 admin panel when the
display requirement becomes concrete.**

## Architecture Overview

The Order module follows the same layering as Cart and Category:

```
order/
  order.controller.ts          — Routes, DTO validation, @UseGuards(JwtAuthGuard)
  order.service.ts             — Business logic (TDD)
  order.repository.ts          — Prisma queries only; never imports business logic
  order.module.ts              — Module registration, exports OrderService
  order.service.spec.ts        — Unit tests (TDD Red→Green)
  dto/
    create-order.dto.ts        — Input DTO: shippingAddress, billingAddress?, notes?
    update-order-status.dto.ts — Admin/internal status transition DTO
    order-list-query.dto.ts    — Pagination + status filter for GET /orders
    address.dto.ts             — Nested address shape (embedded in CreateOrderDto)
    index.ts
  entities/
    order.entity.ts            — OrderEntity with fromPrisma(), totals as strings
    order-item.entity.ts       — OrderItemEntity with fromPrisma()
    index.ts
```

### Service boundaries

- `OrderService` creates an order by reading the caller's cart via
  `CartRepository` (injected directly — no circular module dependency).
  `CartService` is NOT injected into `OrderService`; the repository is used
  directly to avoid pulling the full cart service dependency tree into the
  order module.
- `CartRepository` is exported from `CartModule` alongside `CartService` to
  enable this. `OrderModule` imports `CartModule`.
- After a successful order creation, `CartRepository.clearItems(cartId)` is
  called inside the same Prisma transaction that creates the order so the cart
  is atomically emptied.
- Inventory decrement (`ProductVariant.stock--`) is performed inside the same
  transaction. This is a best-effort MVP guard; the final stock authority is
  the checkout/payment flow (Phase 5).

**Open question for user (inventory):** Should order creation decrement
`ProductVariant.stock`? The `CartService` already validates stock at add-to-cart
time, but stock is re-validated here at order creation time as well. **Recommendation:
yes — decrement on order creation, restore on cancellation/refund. This is the
standard e-commerce pattern and prevents overselling between add-to-cart and
checkout.**

## User Stories

1. As an authenticated customer, I want to place an order from my current cart,
   so that I can purchase the items I have selected.
2. As an authenticated customer, I want to view my order history, so that I can
   track past purchases.
3. As an authenticated customer, I want to view a single order's details, so that
   I can see the items, totals, and status.
4. As an authenticated customer, I want to cancel a PENDING order, so that I can
   change my mind before it is processed.
5. As a system process (payment webhook — Phase 4), I want to update order payment
   status to PAID, so that the order can be confirmed and fulfilled.

## Technical Design

### Domain types

#### OrderWithItems (repository return shape)

```ts
export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  price: { toString(): string }; // Prisma Decimal
  createdAt: Date;
  product: { id: string; name: string; slug: string };
  variant: { id: string; name: string } | null;
}

export interface OrderWithItems {
  id: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: { toString(): string };
  discount: { toString(): string };
  shippingCost: { toString(): string };
  tax: { toString(): string };
  total: { toString(): string };
  shippingAddress: Prisma.JsonValue | null;
  billingAddress: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRow[];
}
```

This mirrors the `CartWithItems` pattern in `cart.repository.ts`.

#### OrderEntity + OrderItemEntity

```ts
// entities/order-item.entity.ts
export class OrderItemEntity {
  id!: string;
  productId!: string;
  variantId!: string | null;
  productName!: string;    // snapshotted product name
  variantName!: string | null;
  quantity!: number;
  price!: string;          // Decimal → string
  lineTotal!: string;      // price × quantity, same cents-arithmetic as CartItemEntity
  createdAt!: Date;

  static fromPrisma(row: OrderItemRow): OrderItemEntity { ... }
}

// entities/order.entity.ts
export class OrderEntity {
  id!: string;
  userId!: string;
  status!: OrderStatus;
  paymentStatus!: PaymentStatus;
  subtotal!: string;
  discount!: string;
  shippingCost!: string;
  tax!: string;
  total!: string;
  shippingAddress!: ShippingAddressData | null;
  billingAddress!: ShippingAddressData | null;
  notes!: string | null;
  items!: OrderItemEntity[];
  createdAt!: Date;
  updatedAt!: Date;

  static fromPrisma(order: OrderWithItems): OrderEntity { ... }
}
```

All `Decimal` fields are converted to strings in `fromPrisma()` using the same
`.toString()` pattern established in `CartItemEntity`.

### DTO design

#### CreateOrderDto

```ts
export class CreateOrderDto {
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  @IsDefined()
  shippingAddress!: AddressDto;

  @ApiProperty({ type: AddressDto, required: false })
  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  billingAddress?: AddressDto;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
```

#### AddressDto

```ts
export class AddressDto {
  @IsString() @IsNotEmpty() firstName!: string;
  @IsString() @IsNotEmpty() lastName!: string;
  @IsString() @IsOptional() company?: string;
  @IsString() @IsNotEmpty() address1!: string;
  @IsString() @IsOptional() address2?: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsNotEmpty() postalCode!: string;
  @IsString() @Length(2, 2) country!: string; // ISO-3166-1 alpha-2, defaults "UA"
  @IsString() @IsOptional() phone?: string;
}
```

#### UpdateOrderStatusDto (internal / admin use, Phase 4 will extend this)

```ts
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
```

#### OrderListQueryDto

```ts
export class OrderListQueryDto {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}
```

### OrderRepository methods

```ts
class OrderRepository {
  // Create an order + items + clear cart + (optionally) decrement stock
  // — all inside a single Prisma transaction.
  createFromCart(params: CreateOrderParams): Promise<OrderWithItems>;

  // Find all orders for a user with optional status filter and pagination.
  findByUserId(
    userId: string,
    query: OrderListQueryDto,
  ): Promise<{ orders: OrderWithItems[]; total: number }>;

  // Find a single order by ID.
  findById(orderId: string): Promise<OrderWithItems | null>;

  // Update order status (used by service after ownership/transition checks).
  updateStatus(orderId: string, status: OrderStatus): Promise<OrderWithItems>;

  // Update payment status (called by payment webhook handler in TASK-034).
  updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
  ): Promise<OrderWithItems>;
}

interface CreateOrderParams {
  userId: string;
  cartId: string;
  cartItems: CartItemRow[]; // passed in by service from cart lookup
  shippingAddress: AddressDto;
  billingAddress?: AddressDto;
  notes?: string;
}
```

The transaction inside `createFromCart`:

1. Compute `subtotal` = sum of `(item.price × item.quantity)` using cents arithmetic
2. Set `discount = 0`, `shippingCost = 0`, `tax = 0`, `total = subtotal` (Phase 3 MVP)
3. `prisma.order.create(...)` with nested `items.createMany([...])`
4. `prisma.cartItem.deleteMany({ where: { cartId } })`
5. For each item that has a variant: `prisma.productVariant.update({ data: { stock: { decrement: quantity } } })`

### OrderService business rules (TDD)

```ts
class OrderService {
  // Create an order from the user's current cart.
  // Throws EmptyCartException (BadRequestException) if cart has no items.
  // Throws InsufficientStockException (BadRequestException) if any variant
  //   has stock < quantity at the moment of order creation.
  // Throws NotFoundException if the user has no cart.
  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderEntity>;

  // List the calling user's orders (paginated, optional status filter).
  async getOrders(
    userId: string,
    query: OrderListQueryDto,
  ): Promise<{ data: OrderEntity[]; meta: PaginationMeta }>;

  // Get a single order, throwing NotFoundException if not found or not owned.
  async getOrder(userId: string, orderId: string): Promise<OrderEntity>;

  // Cancel a PENDING order (customer action).
  // Throws ConflictException if status is not PENDING.
  // Restores variant stock for each cancelled item in a transaction.
  async cancelOrder(userId: string, orderId: string): Promise<OrderEntity>;

  // Internal — update order status (used by webhook/admin, bypasses ownership check).
  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderEntity>;
}
```

**State machine (valid transitions enforced in service):**

```
PENDING → CONFIRMED   (triggered by payment success — Phase 4)
PENDING → CANCELLED   (customer action or timeout)
CONFIRMED → PROCESSING
PROCESSING → SHIPPED
SHIPPED → DELIVERED
PENDING → CANCELLED
CONFIRMED → CANCELLED
* → REFUNDED          (admin action — Phase 4)
```

For Phase 3, only `PENDING → CANCELLED` is exposed to the customer via API.
The other transitions are prepared in `updateStatus` for Phase 4 webhook use.

### OrderController endpoints

All endpoints require `JwtAuthGuard` — orders always belong to an authenticated
user.

| Method | Path                      | Description                      | Auth         | operationId   |
| ------ | ------------------------- | -------------------------------- | ------------ | ------------- |
| POST   | `/orders`                 | Create order from cart           | JwtAuthGuard | `createOrder` |
| GET    | `/orders`                 | List caller's orders (paginated) | JwtAuthGuard | `getOrders`   |
| GET    | `/orders/:orderId`        | Get single order                 | JwtAuthGuard | `getOrder`    |
| PATCH  | `/orders/:orderId/cancel` | Cancel a PENDING order           | JwtAuthGuard | `cancelOrder` |

Response envelopes:

- `POST /orders` → `{ data: OrderEntity }` (HTTP 201)
- `GET /orders` → `{ data: OrderEntity[], meta: { total, page, limit, totalPages } }` (HTTP 200)
- `GET /orders/:orderId` → `{ data: OrderEntity }` (HTTP 200)
- `PATCH /orders/:orderId/cancel` → `{ data: OrderEntity }` (HTTP 200)

Error responses follow the existing pattern:

- `400 Bad Request` — empty cart, insufficient stock, invalid DTO
- `404 Not Found` — order not found or does not belong to user
- `409 Conflict` — invalid status transition (e.g., cancelling a SHIPPED order)

### CartModule exports update

`CartRepository` must be added to `CartModule.exports` so `OrderModule` can
inject it. Currently only `CartService` is exported.

### Module registration

`OrderModule` is registered in `AppModule` the same way `CartModule` is.

## Tasks

### TASK-033-A: Review Prisma schema — confirm no migration needed

**Type:** chore
**Scope:** store-api
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `apps/store-api/prisma/schema.prisma` reviewed — `Order`, `OrderItem`,
      `OrderStatus`, `PaymentStatus` models and enums confirmed present and
      sufficient for this plan
- [ ] Confirmed: no Prisma migration file needs to be created for TASK-033
- [ ] `npx prisma generate` runs cleanly (PrismaClient already reflects the
      `Order`/`OrderItem` models)
- [ ] Any schema adjustments needed (e.g. adding `orderNumber`) are documented
      as a deferred decision and NOT implemented in this task

**Files to review (no changes expected):**

- `apps/store-api/prisma/schema.prisma` — read-only verification

---

### TASK-033-B: Expose CartRepository from CartModule

**Type:** chore
**Scope:** store-api
**Complexity:** S (15min)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `CartModule.exports` updated to include `CartRepository` alongside
      the existing `CartService` export
- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run build -w apps/store-api` exits with code 0
- [ ] No other module is broken (existing `AuthModule` which imports `CartModule`
      continues to work)

**Files to modify:**

- `apps/store-api/src/cart/cart.module.ts` — add `CartRepository` to `exports`

---

### TASK-033-C: Create Order domain entities

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-033-A

**Acceptance Criteria:**

- [ ] `OrderItemEntity` class created:
  - Fields: `id`, `productId`, `variantId: string | null`, `productName`,
    `variantName: string | null`, `quantity`, `price: string`,
    `lineTotal: string`, `createdAt`
  - `static fromPrisma(row: OrderItemRow): OrderItemEntity` — converts
    `Decimal` price to string, computes `lineTotal` using cents arithmetic
    (same pattern as `CartItemEntity.fromPrisma`)
  - All fields decorated with `@ApiProperty` / `@ApiProperty({ nullable: true })`
- [ ] `OrderEntity` class created:
  - Fields: `id`, `userId`, `status: OrderStatus`, `paymentStatus: PaymentStatus`,
    `subtotal`, `discount`, `shippingCost`, `tax`, `total` (all `string`),
    `shippingAddress: ShippingAddressData | null`,
    `billingAddress: ShippingAddressData | null`, `notes: string | null`,
    `items: OrderItemEntity[]`, `createdAt`, `updatedAt`
  - `static fromPrisma(order: OrderWithItems): OrderEntity` — converts all
    `Decimal` fields to strings via `.toString()`
  - All fields decorated with `@ApiProperty`
- [ ] `ShippingAddressData` interface exported (mirrors `AddressDto` shape, used
      for typed JSON deserialization in the entity)
- [ ] `OrderItemRow` and `OrderWithItems` interfaces defined and exported from
      `order.repository.ts` (or a co-located `order.types.ts`) — defined here
      first so entities can type-check independently
- [ ] Entities exported via `apps/store-api/src/order/entities/index.ts` barrel
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/order/entities/order-item.entity.ts`
- `apps/store-api/src/order/entities/order.entity.ts`
- `apps/store-api/src/order/entities/index.ts`
- `apps/store-api/src/order/order.types.ts` — `OrderWithItems`, `OrderItemRow`,
  `CreateOrderParams` interfaces

---

### TASK-033-D: Create Order DTOs

**Type:** feat
**Scope:** store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-033-A

**Acceptance Criteria:**

- [ ] `AddressDto` class created with `class-validator` decorators:
  - `firstName`, `lastName` — `@IsString() @IsNotEmpty()`
  - `company` — `@IsString() @IsOptional()`
  - `address1` — `@IsString() @IsNotEmpty()`
  - `address2` — `@IsString() @IsOptional()`
  - `city` — `@IsString() @IsNotEmpty()`
  - `state` — `@IsString() @IsOptional()`
  - `postalCode` — `@IsString() @IsNotEmpty()`
  - `country` — `@IsString() @Length(2, 2)` (ISO-3166-1 alpha-2)
  - `phone` — `@IsString() @IsOptional()`
  - All fields decorated with `@ApiProperty`

- [ ] `CreateOrderDto` class:
  - `shippingAddress: AddressDto` — `@ValidateNested() @Type(() => AddressDto) @IsDefined()`
  - `billingAddress?: AddressDto` — `@ValidateNested() @Type(() => AddressDto) @IsOptional()`
  - `notes?: string` — `@IsString() @IsOptional() @MaxLength(500)`
  - All fields decorated with `@ApiProperty`

- [ ] `UpdateOrderStatusDto` class:
  - `status: OrderStatus` — `@IsEnum(OrderStatus)`
  - Used internally (admin/webhook); not exposed on a public endpoint in Phase 3

- [ ] `OrderListQueryDto` class:
  - `status?: OrderStatus` — `@IsOptional() @IsEnum(OrderStatus)`
  - `page?: number` — `@IsOptional() @IsInt() @Min(1) @Type(() => Number)`
  - `limit?: number` — `@IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)`
  - All fields decorated with `@ApiProperty({ required: false })`

- [ ] All DTOs exported via `apps/store-api/src/order/dto/index.ts`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/order/dto/address.dto.ts`
- `apps/store-api/src/order/dto/create-order.dto.ts`
- `apps/store-api/src/order/dto/update-order-status.dto.ts`
- `apps/store-api/src/order/dto/order-list-query.dto.ts`
- `apps/store-api/src/order/dto/index.ts`

---

### TASK-033-E: Implement OrderRepository

**Type:** feat
**Scope:** store-api
**Complexity:** M (3-4h)
**TDD Required:** No
**Depends on:** TASK-033-B, TASK-033-C, TASK-033-D

**Acceptance Criteria:**

- [ ] `OrderRepository` class created, decorated with `@Injectable()`
- [ ] Constructor injects only `PrismaService` (no other dependencies)
- [ ] `ORDERS_INCLUDE` constant defined (mirrors `CART_ITEMS_INCLUDE` pattern):
  ```ts
  const ORDERS_INCLUDE = {
    items: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        orderId: true,
        productId: true,
        variantId: true,
        quantity: true,
        price: true,
        createdAt: true,
        product: { select: { id: true, name: true, slug: true } },
        variant: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.OrderInclude;
  ```
- [ ] `createFromCart(params: CreateOrderParams): Promise<OrderWithItems>`
  - Runs inside `this.prisma.$transaction(async (tx) => { ... })`
  - Computes `subtotal` (cents arithmetic, same as `CartEntity.calculateTotals`)
  - Sets `discount = 0`, `shippingCost = 0`, `tax = 0`, `total = subtotal`
  - Creates `Order` record + nested `OrderItem` rows (price snapshot)
  - Calls `tx.cartItem.deleteMany({ where: { cartId: params.cartId } })` to clear the cart
  - For each item with a `variantId`: calls
    `tx.productVariant.update({ where: { id }, data: { stock: { decrement: quantity } } })`
  - Returns the full order using `ORDERS_INCLUDE`
- [ ] `findByUserId(userId, query): Promise<{ orders: OrderWithItems[]; total: number }>`
  - Supports optional `query.status` filter
  - Paginates via `skip` / `take` from `query.page` and `query.limit`
    (default: page=1, limit=10)
  - Uses `prisma.$transaction` to run count and findMany in parallel
    (`prisma.$transaction([prisma.order.count(...), prisma.order.findMany(...)])`)
- [ ] `findById(orderId): Promise<OrderWithItems | null>`
- [ ] `updateStatus(orderId, status): Promise<OrderWithItems>`
- [ ] `updatePaymentStatus(orderId, paymentStatus): Promise<OrderWithItems>`
  - Used by payment webhook (TASK-034)
- [ ] Private readonly `logger = new Logger(OrderRepository.name)` following
      the pattern in `CartRepository`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/order/order.repository.ts`

---

### TASK-033-F: Write failing unit tests for OrderService (TDD — Red)

**Type:** test
**Scope:** store-api
**Complexity:** M (3-4h)
**TDD Required:** Yes
**Depends on:** TASK-033-C, TASK-033-D, TASK-033-E

**Acceptance Criteria:**

- [ ] Test file `order.service.spec.ts` created following the exact structure of
      `cart.service.spec.ts` (mock data section, mock repository section, describe
      blocks per method)
- [ ] `OrderRepository` mock object covers all public methods:
      `createFromCart`, `findByUserId`, `findById`, `updateStatus`, `updatePaymentStatus`
- [ ] `CartRepository` mock covers: `findByUserId` (used to read the cart before creating an order)

- [ ] **`createOrder` tests (all failing — Red):**
  - Creates an order from a cart with one variant item and one non-variant item
  - Throws `NotFoundException` when the user has no cart
  - Throws `BadRequestException` ("Cart is empty") when the cart exists but has no items
  - Throws `BadRequestException` when a variant's stock is less than the requested quantity
  - Passes the correct `CreateOrderParams` (snapshotted prices, cartId, userId, address)
    to `orderRepository.createFromCart`
  - Returns an `OrderEntity` instance

- [ ] **`getOrders` tests:**
  - Returns paginated list with `data` array and `meta` (total, page, limit, totalPages)
  - Passes the `userId` and `query` to `orderRepository.findByUserId`
  - Uses default page=1, limit=10 when not provided

- [ ] **`getOrder` tests:**
  - Returns `OrderEntity` for an order that belongs to the user
  - Throws `NotFoundException` when order does not exist
  - Throws `NotFoundException` when order exists but belongs to a different user
    (ownership check: `order.userId !== userId`)

- [ ] **`cancelOrder` tests:**
  - Calls `orderRepository.updateStatus(orderId, OrderStatus.CANCELLED)` for a PENDING order
  - Throws `NotFoundException` when order not found or not owned
  - Throws `ConflictException` when order status is not PENDING
    (test with CONFIRMED, PROCESSING, SHIPPED, DELIVERED)

- [ ] **`updateStatus` tests (internal):**
  - Updates to a valid target status
  - Note: no ownership check — this is an internal method for webhook/admin use

- [ ] All tests **fail** at the end of this task (Red phase — `OrderService`
      does not yet exist)
- [ ] Test file compiles without TypeScript errors
- [ ] `npm run typecheck -w apps/store-api` passes (even though tests fail at runtime)

**Files to create:**

- `apps/store-api/src/order/order.service.spec.ts`

---

### TASK-033-G: Implement OrderService (TDD — Green)

**Type:** feat
**Scope:** store-api
**Complexity:** M (3-4h)
**TDD Required:** Yes
**Depends on:** TASK-033-F (tests must be written first)

**Acceptance Criteria:**

- [ ] `OrderService` class created, decorated with `@Injectable()`
- [ ] Constructor injects `OrderRepository` and `CartRepository`
- [ ] `createOrder(userId, dto)`:
  1. Reads user's cart via `cartRepository.findByUserId(userId)`
  2. Throws `NotFoundException('Cart not found')` if cart is null
  3. Throws `BadRequestException('Cart is empty — add items before placing an order')`
     if `cart.items.length === 0`
  4. Validates stock: for each item where `item.variant !== null`, checks
     `item.quantity <= item.variant.stock`; throws `BadRequestException(
\`Insufficient stock for "${item.product.name}" — ${item.variant.stock} available\`)`
  5. Calls `orderRepository.createFromCart({ userId, cartId: cart.id, cartItems: cart.items, ...dto })`
  6. Returns `OrderEntity.fromPrisma(order)`
- [ ] `getOrders(userId, query)`:
  1. Calls `orderRepository.findByUserId(userId, query)`
  2. Maps each order to `OrderEntity.fromPrisma`
  3. Returns `{ data: OrderEntity[], meta: { total, page, limit, totalPages } }`
     where `totalPages = Math.ceil(total / limit)`
- [ ] `getOrder(userId, orderId)`:
  1. Calls `orderRepository.findById(orderId)`
  2. Throws `NotFoundException('Order not found')` if null
  3. Throws `NotFoundException('Order not found')` if `order.userId !== userId`
     (ownership check — never reveal that the order exists for another user)
  4. Returns `OrderEntity.fromPrisma(order)`
- [ ] `cancelOrder(userId, orderId)`:
  1. Fetches order via `getOrder(userId, orderId)` (ownership + existence check reused)
  2. Fetches raw order via `orderRepository.findById(orderId)` to read `status`
  3. Throws `ConflictException('Only PENDING orders can be cancelled')` if
     `status !== OrderStatus.PENDING`
  4. Calls `orderRepository.updateStatus(orderId, OrderStatus.CANCELLED)`
  5. Returns `OrderEntity.fromPrisma(updatedOrder)`
- [ ] `updateStatus(orderId, status)` (internal):
  1. Calls `orderRepository.updateStatus(orderId, status)`
  2. Returns `OrderEntity.fromPrisma(order)`
- [ ] `private readonly logger = new Logger(OrderService.name)`
- [ ] All tests from TASK-033-F pass (Green phase)
- [ ] `npm run test -w apps/store-api` exits with code 0

**Files to create:**

- `apps/store-api/src/order/order.service.ts`

---

### TASK-033-H: Implement OrderController and OrderModule

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-033-G

**Acceptance Criteria:**

- [ ] `OrderController` created:
  - `@ApiTags('Orders')` at class level
  - `@ApiBearerAuth('access-token')` at class level
  - `@UseGuards(JwtAuthGuard)` at class level — all order endpoints require auth
  - Each method receives `@CurrentUser('id') userId: string` (same pattern as
    existing controllers using the `@CurrentUser` decorator from `src/auth/decorators`)

- [ ] `POST /orders` → `createOrder`:
  - `@Post()`
  - `@HttpCode(HttpStatus.CREATED)`
  - `@ApiOperation({ summary: 'Create order from cart', operationId: 'createOrder' })`
  - `@ApiResponse({ status: 201, description: 'Order created' })`
  - `@ApiResponse({ status: 400, description: 'Empty cart or insufficient stock' })`
  - `@ApiResponse({ status: 404, description: 'Cart not found' })`
  - Returns `{ data: OrderEntity }`

- [ ] `GET /orders` → `getOrders`:
  - `@Get()`
  - `@ApiOperation({ summary: 'List current user orders', operationId: 'getOrders' })`
  - `@ApiQuery` decorators for `status`, `page`, `limit`
  - `@ApiResponse({ status: 200 })`
  - Returns `{ data: OrderEntity[], meta: PaginationMeta }`

- [ ] `GET /orders/:orderId` → `getOrder`:
  - `@Get(':orderId')`
  - `@ApiOperation({ summary: 'Get order by ID', operationId: 'getOrder' })`
  - `@ApiParam({ name: 'orderId', description: 'Order UUID' })`
  - `@ApiResponse({ status: 200 })`, `@ApiResponse({ status: 404 })`
  - Returns `{ data: OrderEntity }`

- [ ] `PATCH /orders/:orderId/cancel` → `cancelOrder`:
  - `@Patch(':orderId/cancel')`
  - `@ApiOperation({ summary: 'Cancel a pending order', operationId: 'cancelOrder' })`
  - `@ApiParam({ name: 'orderId', description: 'Order UUID' })`
  - `@ApiResponse({ status: 200 })`, `@ApiResponse({ status: 404 })`,
    `@ApiResponse({ status: 409, description: 'Order cannot be cancelled in its current status' })`
  - Returns `{ data: OrderEntity }`

- [ ] `OrderModule` created:

  ```ts
  @Module({
    imports: [CartModule],
    controllers: [OrderController],
    providers: [OrderRepository, OrderService],
    exports: [OrderService],
  })
  export class OrderModule {}
  ```

- [ ] `OrderModule` registered in `AppModule` (added to `imports` array, same
      pattern as `CartModule`)

- [ ] `apps/store-api/src/order/index.ts` barrel created, exporting
      `OrderModule`, `OrderService`, `OrderRepository`

- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run lint -w apps/store-api` passes
- [ ] `npm run build -w apps/store-api` exits with code 0

**Files to create/modify:**

- `apps/store-api/src/order/order.controller.ts`
- `apps/store-api/src/order/order.module.ts`
- `apps/store-api/src/order/index.ts`
- `apps/store-api/src/app.module.ts` — add `OrderModule` to `imports`

---

### TASK-033-I: Write E2E tests for Order endpoints

**Type:** test
**Scope:** store-api
**Complexity:** L (4-6h)
**TDD Required:** No
**Depends on:** TASK-033-H

**Acceptance Criteria:**

- [ ] E2E test file `apps/store-api/test/order.e2e-spec.ts` created following the
      pattern established in `cart.e2e-spec.ts` (mock repository at the
      clean-architecture boundary; AppModule bootstrapped; ThrottlerGuard
      overridden with pass-through; JWT minted directly via JwtService)

- [ ] `OrderRepository` mock object covers all public methods
- [ ] `CartRepository` mock covers `findByUserId`

- [ ] **POST /api/orders — create order:**
  - `POST /api/orders` with valid JWT + valid `CreateOrderDto` → 201, returns
    `OrderEntity` with correct fields
  - `POST /api/orders` with no JWT → 401
  - `POST /api/orders` with missing `shippingAddress` → 400
  - `POST /api/orders` when `CartRepository.findByUserId` returns `null` → 404
  - `POST /api/orders` when cart is empty (`items: []`) → 400

- [ ] **GET /api/orders — list orders:**
  - `GET /api/orders` with valid JWT → 200, `{ data: [...], meta: { total, page, limit, totalPages } }`
  - `GET /api/orders?status=PENDING` → 200, passes status filter to repository
  - `GET /api/orders` with no JWT → 401

- [ ] **GET /api/orders/:orderId — single order:**
  - `GET /api/orders/:orderId` with valid JWT, order owned by user → 200
  - `GET /api/orders/:orderId` with valid JWT, order NOT owned by user → 404
  - `GET /api/orders/:orderId` with no JWT → 401
  - `GET /api/orders/nonexistent-uuid` → 404

- [ ] **PATCH /api/orders/:orderId/cancel — cancel:**
  - `PATCH /api/orders/:orderId/cancel` for a PENDING order → 200, status = CANCELLED
  - `PATCH /api/orders/:orderId/cancel` for a CONFIRMED order → 409
  - `PATCH /api/orders/:orderId/cancel` for a non-existent order → 404
  - `PATCH /api/orders/:orderId/cancel` with no JWT → 401

- [ ] All e2e tests pass with `npm run test:e2e -w apps/store-api`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/test/order.e2e-spec.ts`

---

### TASK-033-J: Regenerate Orval API hooks (store-client + store-admin)

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-033-H (controller must be complete and Swagger decorators correct)

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error and produces
      an updated `apps/store-api/swagger.json` that contains:
  - `POST /api/orders` with `operationId: createOrder`
  - `GET /api/orders` with `operationId: getOrders`
  - `GET /api/orders/{orderId}` with `operationId: getOrder`
  - `PATCH /api/orders/{orderId}/cancel` with `operationId: cancelOrder`
  - `OrderEntity`, `OrderItemEntity`, `CreateOrderDto`, `AddressDto`,
    `OrderListQueryDto` schemas present in the spec
- [ ] `npm run generate:api -w apps/store-client` runs without errors; generated
      hooks are created in `apps/store-client/src/shared/api/generated/orders/`
- [ ] `npm run generate:api -w apps/store-admin` runs without errors
- [ ] `npm run typecheck -w apps/store-client` passes after regeneration
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration
- [ ] TASK-035 (Checkout frontend) is unblocked by this regeneration

**Files modified by tool (do not hand-edit):**

- `apps/store-client/src/shared/api/generated/` — regenerated by Orval
- `apps/store-admin/src/shared/api/generated/` — regenerated by Orval

---

## Migration Steps

Execute sub-tasks in this order:

1. **TASK-033-A** — Schema review (no-op; confirms no migration needed)
2. **TASK-033-B** — Export `CartRepository` from `CartModule` (standalone, no deps)
3. **TASK-033-C** — Order entities + interface types (depends on A)
4. **TASK-033-D** — Order DTOs (depends on A; can be done in parallel with C)
5. **TASK-033-E** — `OrderRepository` (depends on B, C, D)
6. **TASK-033-F** — Failing unit tests for `OrderService` (TDD — Red; depends on C, D, E)
7. **TASK-033-G** — Implement `OrderService` (TDD — Green; depends on F)
8. **TASK-033-H** — `OrderController` + `OrderModule` + `AppModule` registration (depends on G)
9. **TASK-033-I** — E2E tests (depends on H)
10. **TASK-033-J** — Orval regeneration (depends on H; unblocks TASK-035)

## Risks and Mitigations

| Risk                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stock decrement race condition.** Two concurrent orders for the same variant could each pass the stock check but together oversell.                                            | For Phase 3 MVP: decrement inside the Prisma transaction is sufficient. For production scale, use `UPDATE product_variants SET stock = stock - qty WHERE id = ? AND stock >= qty` and check affected rows. Defer to Phase 5. |
| **Cart cleared on order creation.** If the order `INSERT` succeeds but the cart `deleteMany` fails (e.g., DB timeout), the cart is stale.                                        | Both happen inside a single `$transaction` — either the full block commits or nothing does. No partial state is possible.                                                                                                    |
| **Address stored as untyped JSON.** The `Order.shippingAddress` column is `Json?`. If the address shape changes in a future phase, existing rows are not automatically migrated. | For Phase 3 MVP: `AddressDto` shape is embedded and stable. Add a typed migration script (not a schema change) if the shape changes in Phase 5.                                                                              |
| **`CartRepository` injected into `OrderService`.** Could create a circular dependency if `CartModule` ever imports `OrderModule`.                                                | `CartModule` has no reason to import `OrderModule`. One-way dependency. Verify with NestJS circular-dependency detection in tests.                                                                                           |
| **Swagger `operationId` collisions.** If another controller defines `createOrder`, Orval will generate a duplicate hook name.                                                    | All four `operationId` values are unique across the current API. Cross-check before regeneration.                                                                                                                            |

## Scope Boundaries (What This Plan Does NOT Include)

- **No payment processing** — `Order.paymentStatus` starts as `PENDING`. The
  Stripe payment intent and webhook handler are TASK-034.
- **No email sending** — Order confirmation email is TASK-037.
- **No admin order management** — Admin status updates (CONFIRMED, PROCESSING,
  SHIPPED, DELIVERED, REFUNDED) are wired in TASK-041.
- **No frontend** — Checkout form and order confirmation page are TASK-035/036.
- **No coupon/discount logic** — `discount` field exists in the schema but
  defaults to 0 throughout this plan.
- **No `orderNumber` sequence** — UUID `id` is used for all order references.
  A human-readable order number can be added in a later phase.
