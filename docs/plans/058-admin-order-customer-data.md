# Plan: Admin Order Customer Data — Expose Email + Account Info on Admin Order Responses

> **Status:** Implemented — pending manual QA (TASK-125-D)
> **Phase:** Phase A — Stabilize & Close Out (QA pass triage — bugs)
> **Created:** 2026-06-25
> **Last Updated:** 2026-06-25
> **TASK:** TASK-125

---

## Resolution (implemented)

- **TASK-125-A (backend, TDD):** Added optional `user?` to `OrderWithItems`; new
  Swagger-decorated `OrderCustomerData` class + optional `customer?` on `OrderEntity` with a
  conditional `fromPrisma` mapping (set only when `order.user` present). `ADMIN_ORDERS_INCLUDE`
  (= `ORDERS_INCLUDE` + `user` select) added; `findAll` switched to it; new `findByIdForAdmin`
  added; `OrderService.adminGetOrder` now calls it. `OrderCustomerData` registered in the admin
  controller's `@ApiExtraModels`. Tests: service spec S1–S4 + E1–E3 (customer mapping), repo spec
  R1–R2 (admin include) — written Red first, then green. All mutation/customer paths keep the lean
  `ORDERS_INCLUDE` (PII isolation), reinforced by the `AdminGuard` route guard.
- **TASK-125-B (Orval):** `swagger:export` + `generate:api` regenerated both clients;
  `OrderEntity.customer?: OrderCustomerData | null` and the `orderCustomerData` model emitted.
- **TASK-125-C (store-admin):** list table "Customer" cell now shows email + name (UUID fallback
  when absent); detail view gained a "Customer" sidebar card above Summary. Component tests
  (`admin-order-table.test.tsx`, `order-detail-view.test.tsx`) cover both present/absent cases.
- Gates: store-api **397/397** tests pass; store-admin **5/5** pass; lint clean; typecheck clean
  (all workspaces); `npm run build` green. No Prisma migration.
- **TASK-125-D:** Manual QA on a running stack still pending.

---

## Problem Statement

The admin order list (`GET /api/admin/orders`) and detail (`GET /api/admin/orders/:id`) expose
no customer account data beyond `userId` — a raw UUID that is truncated to 8 characters in the
`store-admin` UI. The shipping address snapshot captures the customer's delivery name and phone
but not their account email. An admin trying to contact a customer about an order has no
usable information.

QA source (`docs/manual-qa-master.md` §"Адмінка"): "в ордерах для адміна не відображаються
email користувачів. там мають бути дані по клієнту" — admin orders don't show user emails;
customer data should be present.

This is a pure additive read-data bug. It does not touch payments, stock, or status transitions.
No Prisma schema migration is required (the `User` table already stores `email`, `firstName`,
`lastName`). The fix is: add a `user` relation to the admin-only repository queries, surface the
data as an optional `customer` object on `OrderEntity`, and update two store-admin views.

---

## Current State Analysis

### Backend

**`apps/store-api/src/order/entities/order.entity.ts`**

`OrderEntity` is shared by both the customer-facing `GET /api/orders` (via `OrderController`)
and the admin `GET /api/admin/orders` (via `AdminOrderController`). It has `userId: string` but
no `customer` object. `fromPrisma(order: OrderWithItems)` maps all fields; `OrderWithItems` has
no `user` relation in scope.

**`apps/store-api/src/order/order.types.ts`**

`OrderWithItems` contains `userId: string` but no `user` property. Any attempt to access
`order.user` from `OrderEntity.fromPrisma` would be a type error today.

**`apps/store-api/src/order/order.repository.ts`**

A single `ORDERS_INCLUDE` constant (items-only, no `user`) is used by **all** query methods:

| Method             | Who calls it                           | Include used     |
| ------------------ | -------------------------------------- | ---------------- |
| `createFromCart`   | service                                | `ORDERS_INCLUDE` |
| `findByUserId`     | customer order list                    | `ORDERS_INCLUDE` |
| `findAll`          | admin list                             | `ORDERS_INCLUDE` |
| `findById`         | customer + admin detail, all mutations | `ORDERS_INCLUDE` |
| `updateStatus`     | admin PATCH                            | `ORDERS_INCLUDE` |
| `cancelAndRestock` | customer cancel / admin cancel         | `ORDERS_INCLUDE` |
| `markPaid`         | admin confirm-payment                  | `ORDERS_INCLUDE` |
| `softDelete`       | admin delete                           | `ORDERS_INCLUDE` |

The admin queries (`findAll`, `findById` when called from admin context) currently never load
the `user` relation. Adding it to `ORDERS_INCLUDE` would load it on ALL paths including
customer-facing ones, which would leak user account data on customer responses and unnecessarily
inflate every order query in the system.

**`apps/store-api/src/order/admin-order.controller.ts`**

`AdminOrderListResponse.data: OrderEntity[]` and `AdminOrderResponseEnvelope.data: OrderEntity`
are the Swagger-decorated response classes. The whole controller is `@UseGuards(AdminGuard)`.
The controller calls `orderService.adminGetAllOrders(query)` and `orderService.adminGetOrder(orderId)`.

**`apps/store-api/src/user/entities/user.entity.ts`**

`UserEntity` is the established precedent for exposing `email: string`, `firstName: string | null`,
`lastName: string | null`. The `customer` object on `OrderEntity` will mirror this shape (without
role, isActive, createdAt, updatedAt — those are unnecessary in an order context).

### Frontend (store-admin)

**`apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`**

The "Customer" column renders:

```tsx
<TableCell className="font-mono text-xs text-muted-foreground">
  {order.userId.slice(0, 8)}…
</TableCell>
```

This is a useless truncated UUID. It should render the customer email (primary) with the account
name as secondary text, falling back to `order.userId.slice(0,8)…` only if `customer` is absent.

**`apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx`**

Renders shipping/billing address blocks (name, address, city, phone) via a local `AddressBlock`
helper but has no "Customer" account section. The sidebar currently shows Summary → Shipping
address → (optional Billing address) → (optional Notes). A new "Customer" card should appear
at the top of the sidebar, before Summary, showing the account email and display name (from
`customer.firstName`/`customer.lastName`).

The view uses `useAdminOrderControllerFindById` (Orval-generated); the list uses
`useAdminOrderControllerFindAll`. After Orval regeneration, both hooks will surface the optional
`customer` property on the `OrderEntity` model automatically.

---

## Design Decisions

### Decision 1 — Optional `customer` object on `OrderEntity` (not a subclass)

**Recommendation: add an optional `customer?: OrderCustomerData` field to the existing
`OrderEntity` class.** Do NOT create a separate `AdminOrderEntity` subclass.

Rationale:

- An `AdminOrderEntity` subclass would require new Swagger envelope classes (`AdminOrderListResponse`
  and `AdminOrderResponseEnvelope` already exist but would need to type their `data` field
  against the subclass), and Orval would generate a distinct model type. The store-admin
  currently imports `OrderEntity` types through Orval. Splitting the type means the shared
  `entities/order` slice in store-admin would need to re-export both types, and existing
  component props would need to be updated — a larger refactor than the data addition warrants.
- The optional field approach is **additive**: the Swagger schema gains a nullable/optional
  property. Orval regenerates `OrderEntity` with `customer?: OrderCustomerData`. The
  customer-facing `store-client` uses `OrderEntity` too (for the customer order list/detail),
  but those queries never include the `user` relation, so `customer` will always be `undefined`
  on the wire from those endpoints — no data leaks, and the TypeScript type is correct
  (optional = can be undefined, which it will be on customer responses).
- The customer-facing `OrderController` returns entities where `customer` is `undefined`
  (because the repository never fetches the `user` relation for those paths). This is safe: the
  `customer` field carries the requesting user's own data even if it were present, but it will
  not be — the customer order paths use `ORDERS_INCLUDE` (lean, no `user`), so the field is
  simply absent from the JSON response. No PII of other users is ever reachable.

**`OrderCustomerData` interface / nested class:**

```typescript
// Nested Swagger-decorated class inside order.entity.ts
class OrderCustomerData {
  @ApiProperty({ description: "Customer account ID", example: "550e8400-..." })
  id!: string;

  @ApiProperty({ description: "Customer email", example: "user@example.com" })
  email!: string;

  @ApiProperty({
    description: "First name",
    nullable: true,
    type: String,
    example: "Ivan",
  })
  firstName!: string | null;

  @ApiProperty({
    description: "Last name",
    nullable: true,
    type: String,
    example: "Petrenko",
  })
  lastName!: string | null;
}
```

And on `OrderEntity`:

```typescript
@ApiProperty({
  description: 'Customer account data — present only on admin responses',
  type: () => OrderCustomerData,
  required: false,
  nullable: true,
})
customer?: OrderCustomerData;
```

`fromPrisma` maps it conditionally:

```typescript
if (order.user) {
  entity.customer = {
    id: order.user.id,
    email: order.user.email,
    firstName: order.user.firstName,
    lastName: order.user.lastName,
  };
}
```

When `order.user` is absent (customer-facing queries using `ORDERS_INCLUDE`), `customer` is
not set, so it is `undefined` on the entity and absent from the JSON response — the contract
remains additive.

### Decision 2 — Admin-only repository include

**Recommendation: introduce `ADMIN_ORDERS_INCLUDE` used only by `findAll` and the admin
`findById` call, leaving `ORDERS_INCLUDE` untouched for all other methods.**

```typescript
const ADMIN_ORDERS_INCLUDE = {
  ...ORDERS_INCLUDE,
  user: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} satisfies Prisma.OrderInclude;
```

This keeps the lean `ORDERS_INCLUDE` (items only) on all mutation paths (`createFromCart`,
`updateStatus`, `cancelAndRestock`, `markPaid`, `softDelete`) and the customer `findByUserId`
path — those never need user data and should not pay the join cost.

The tricky point is `findById`: this single method is called both from the customer path
(`OrderService.getOrder`) and the admin path (`OrderService.adminGetOrder`). Two approaches:

**Option A — Admin-specific `findByIdForAdmin` method**: A second repository method that uses
`ADMIN_ORDERS_INCLUDE`. The service calls the right one based on context. Clean separation,
no conditionals in the repository.

**Option B — Optional include parameter on `findById`**: `findById(orderId, includeUser = false)`.
The caller passes `true` for admin context. One method, but the boolean parameter is a
code smell and makes testing slightly more complex.

**Recommendation: Option A** — add `findByIdForAdmin(orderId: string)` that uses
`ADMIN_ORDERS_INCLUDE`. The service method `adminGetOrder` calls `findByIdForAdmin`; the
customer `getOrder` continues to call `findById`. This is the cleanest Clean Architecture
split: the repository exposes intent-named methods, and the service layer picks the right one.

### Decision 3 — Typing `OrderWithItems` for the user relation

The admin queries return an order object that now has a `user` property; the customer queries
do not. Two typing options:

**Option A — Optional `user?` on the base `OrderWithItems`:**

```typescript
export interface OrderWithItems {
  // ...existing fields...
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}
```

All methods return `OrderWithItems`. When the lean `ORDERS_INCLUDE` is used, Prisma does not
select `user`, so the field is absent at runtime (TypeScript sees it as `undefined`). When
`ADMIN_ORDERS_INCLUDE` is used, Prisma selects it and the field is present. The `as
OrderWithItems` casts already used throughout the repository continue to work, and
`fromPrisma` can safely check `if (order.user)`.

**Option B — A separate `AdminOrderWithItems extends OrderWithItems`** with a required `user`
property. More precise, but requires additional cast sites in the service (the admin service
methods would need to assert the narrower type), and Prisma's `as` casts would need to target
the new type.

**Recommendation: Option A** — optional `user?` on `OrderWithItems`. It avoids unsafe
narrowing casts and requires no changes to the existing `as OrderWithItems` casts. The
`fromPrisma` conditional check `if (order.user)` is the correct runtime guard.

### Decision 4 — PII / privacy guarantee

Email is PII. The design guarantees it is exposed exclusively through the `AdminGuard`-protected
endpoints via two orthogonal controls:

1. **Include isolation**: `ADMIN_ORDERS_INCLUDE` (which selects `user.*`) is used only in
   `findAll` and `findByIdForAdmin`. Customer-facing paths (`findByUserId`, `findById`) use
   `ORDERS_INCLUDE` — no `user` join, no email in the Prisma result, no email in the entity.
2. **Route guard**: `AdminOrderController` is decorated `@UseGuards(AdminGuard)`. A non-admin
   JWT cannot reach those endpoints even if the include were changed.

The customer-facing `OrderController` endpoints (`GET /api/orders`, `GET /api/orders/:id`)
call `orderService.getOrders` and `orderService.getOrder`, which call `findByUserId` and
`findById` respectively — both using `ORDERS_INCLUDE`. The `customer` field will never be
populated on customer responses.

No additional serialization guards (e.g., `@Exclude`) are needed because the field is simply
never set.

### Decision 5 — Frontend rendering conventions

**Admin orders are currently in English UI strings** (TASK-115 localizes admin to Ukrainian
but is still in progress; the orders section has not yet been localized). This plan matches
the existing English conventions in `admin-order-table.tsx` and `order-detail-view.tsx` — no
Ukrainian strings are introduced, and no localization regression is created.

**Order list table (`admin-order-table.tsx`):**

Replace the truncated-UUID "Customer" cell with:

- Primary line: `order.customer?.email`
- Secondary line: display name if both names present (`order.customer?.firstName + ' ' + order.customer?.lastName`)
- Fallback: `order.userId.slice(0, 8)…` if `order.customer` is absent (defensive, should not
  occur in practice once the backend change is deployed)

```tsx
<TableCell>
  {order.customer ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm">{order.customer.email}</span>
      {(order.customer.firstName || order.customer.lastName) && (
        <span className="text-xs text-muted-foreground">
          {[order.customer.firstName, order.customer.lastName]
            .filter(Boolean)
            .join(" ")}
        </span>
      )}
    </div>
  ) : (
    <span className="font-mono text-xs text-muted-foreground">
      {order.userId.slice(0, 8)}…
    </span>
  )}
</TableCell>
```

**Order detail view (`order-detail-view.tsx`):**

Add a "Customer" card at the top of the sidebar (before Summary), visible only when
`order.customer` is present:

```tsx
{
  order.customer && (
    <section className="flex flex-col gap-1 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">Customer</h3>
      <div className="text-sm text-muted-foreground">
        <div>{order.customer.email}</div>
        {(order.customer.firstName || order.customer.lastName) && (
          <div>
            {[order.customer.firstName, order.customer.lastName]
              .filter(Boolean)
              .join(" ")}
          </div>
        )}
      </div>
    </section>
  );
}
```

Keep the existing `AddressBlock` component for the shipping address — it already renders
the delivery name and phone from the snapshot. The new Customer card is the account section
(email + account name); the shipping address remains the delivery-logistics section. These
are intentionally separate.

### Decision 6 — No Prisma migration

Confirmed: the `User` model already has `email`, `firstName`, `lastName`. The `Order` model
already has a `userId` foreign key that Prisma can join through. No new columns, no new
relations, no migration required.

### Decision 7 — Orval regeneration is required

`OrderEntity` gains the optional `customer` property and a new nested type
`OrderCustomerData`. The Swagger spec changes. Orval must be re-run for store-admin to pick
up the updated `OrderEntity` model type. The generated file
`apps/store-admin/src/shared/api/generated/` must NOT be hand-edited.

Command: `npm run generate:api` (from the repo root, or the workspace-specific equivalent).

### Decision 8 — Consistency with recent order work

This task is purely additive read-data:

- **TASK-123** (`derivePaymentStatus` coupling) — untouched; no status write paths changed.
- **TASK-124** (`shouldAutoRestock` cancel guard) — untouched; no stock mutation paths changed.
- The mutation methods (`updateStatus`, `cancelAndRestock`, `markPaid`, `softDelete`) all use
  `ORDERS_INCLUDE` and return `OrderWithItems`. They are not changed by this task.

---

## Technical Design

### Data Model

No Prisma migration. The `Order→User` relation already exists via the `userId` foreign key.
Prisma can select `user` fields in any order query — we just have not been doing so.

### Backend

#### `order.types.ts` — extend `OrderWithItems`

Add an optional `user` field:

```typescript
export interface OrderWithItems {
  // ...all existing fields unchanged...
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}
```

#### `order.repository.ts` — add `ADMIN_ORDERS_INCLUDE` + `findByIdForAdmin`

```typescript
const ADMIN_ORDERS_INCLUDE = {
  ...ORDERS_INCLUDE,
  user: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} satisfies Prisma.OrderInclude;
```

New method (mirrors `findById` but uses the admin include):

```typescript
findByIdForAdmin(orderId: string): Promise<OrderWithItems | null> {
  return this.prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: ADMIN_ORDERS_INCLUDE,
  }) as Promise<OrderWithItems | null>;
}
```

Change `findAll` to use `ADMIN_ORDERS_INCLUDE`:

```typescript
// In findAll — change both the count+page transaction queries:
this.prisma.order.findMany({
  where,
  include: ADMIN_ORDERS_INCLUDE,  // was ORDERS_INCLUDE
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * limit,
  take: limit,
}),
```

All other methods (`findByUserId`, `findById`, `createFromCart`, `updateStatus`,
`cancelAndRestock`, `markPaid`, `softDelete`) retain `ORDERS_INCLUDE` unchanged.

#### `order.service.ts` — call `findByIdForAdmin` from `adminGetOrder`

```typescript
async adminGetOrder(orderId: string): Promise<OrderEntity> {
  const order = await this.orderRepository.findByIdForAdmin(orderId);  // was findById
  if (!order) throw new NotFoundException('Order not found');
  return OrderEntity.fromPrisma(order);
}
```

`adminGetAllOrders` calls `this.orderRepository.findAll(query)` — no change at the service
level; the repository change to `ADMIN_ORDERS_INCLUDE` inside `findAll` is sufficient.

#### `order.entity.ts` — add `OrderCustomerData` + optional `customer`

New nested class (Swagger-decorated) and field added to `OrderEntity`. `fromPrisma` maps
conditionally. Full design in Decision 1 above.

### API Contract

The Swagger spec for `OrderEntity` gains an optional `customer` property of type
`OrderCustomerData`. This is an additive, non-breaking change:

- Existing consumers that do not read `customer` are unaffected.
- The `store-client` Orval client regenerates with the new optional field; the customer-facing
  views never receive it and can safely ignore it.
- The `store-admin` Orval client regenerates; components can reference `order.customer?.email`.

After `npm run generate:api`:

- `apps/store-admin/src/shared/api/generated/` is updated with `OrderCustomerData` type and
  `customer?: OrderCustomerData` on `OrderEntity`.
- `apps/store-client/src/shared/api/generated/` is also updated (additive, no view changes
  needed there).

### Frontend (store-admin)

**`admin-order-table.tsx`**: replace "Customer" cell (Decision 5 above).

**`order-detail-view.tsx`**: add "Customer" card at top of sidebar (Decision 5 above).

No changes to `order-detail-skeleton.tsx`, `admin-order-table-skeleton.tsx`, the
`order-status-update` feature, or any other file.

### Test Plan

**Backend unit tests — TDD for critical paths:**

`order.service.spec.ts` additions (in a new `describe('adminGetOrder — customer data')` block):

| #   | Description                                                                   | Setup                                                | Expected                                         |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| S1  | `adminGetOrder` calls `findByIdForAdmin` not `findById`                       | `findByIdForAdmin` returns order with `user`         | `findByIdForAdmin` called; `findById` NOT called |
| S2  | `adminGetOrder` maps `customer` from `order.user`                             | order has `user: { id, email, firstName, lastName }` | returned `OrderEntity` has matching `customer`   |
| S3  | `adminGetOrder` leaves `customer` undefined when `order.user` absent          | order has no `user` field                            | returned `OrderEntity.customer` is `undefined`   |
| S4  | `adminGetOrder` throws NotFoundException when `findByIdForAdmin` returns null | `findByIdForAdmin` returns null                      | `NotFoundException` thrown                       |

`order.entity.spec.ts` additions (or new `describe('OrderEntity.fromPrisma — customer mapping')`
block in `order.service.spec.ts`):

| #   | Description                                                           | Expected                                                 |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| E1  | `fromPrisma` with `user` present sets `customer` with all four fields | entity.customer === `{ id, email, firstName, lastName }` |
| E2  | `fromPrisma` with `user: undefined` leaves `customer` as `undefined`  | entity.customer is `undefined`                           |
| E3  | `fromPrisma` with `user.firstName = null` maps `null` through         | entity.customer.firstName === null                       |

`order.repository.spec.ts` additions (new `describe('findByIdForAdmin')`):

| #   | Description                                                                               | Expected                                                         |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| R1  | `findByIdForAdmin` calls `findFirst` with `ADMIN_ORDERS_INCLUDE` (includes `user` select) | Prisma mock called with `include.user.select` containing `email` |
| R2  | `findAll` (admin) includes user select                                                    | Prisma mock called with `include.user` in the `findMany` call    |

**Frontend component tests (store-admin Jest + RTL + MSW):**

Store-admin has a full RTL + MSW component-test harness (TASK-105-C): `shared/test/render.tsx`,
`msw-handlers.ts`, `msw-server.ts`. Component tests are feasible.

Two test files:

`apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx`:

- MSW handler returns a page with one order that has `customer: { email: 'test@example.com', firstName: 'Ivan', lastName: 'Petrenko', id: '...' }`
- Assert: `screen.getByText('test@example.com')` is present
- Assert: `screen.getByText('Ivan Petrenko')` is present
- Assert: the old `userId.slice(0,8)…` format is NOT present when customer is populated

`apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx`:

- MSW handler for `GET */api/admin/orders/:orderId` returns a single order with `customer`
- Assert: "Customer" section heading is present
- Assert: `screen.getByText('test@example.com')` is in the document

---

## Tasks

### TASK-125-A: Backend — TDD for `OrderEntity.fromPrisma` customer mapping + admin repository include

**Type:** fix
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** Yes (Red → Green → Refactor)
**Depends on:** none

**Acceptance Criteria:**

- [ ] `order.types.ts`: `OrderWithItems.user?` optional field added with `{ id, email, firstName, lastName }` shape
- [ ] `order.entity.ts`: `OrderCustomerData` class added with `@ApiProperty` decorators; `OrderEntity` gains optional `@ApiProperty({ required: false, nullable: true, type: () => OrderCustomerData }) customer?: OrderCustomerData`; `fromPrisma` sets `entity.customer` when `order.user` is present, leaves it unset otherwise
- [ ] `order.repository.ts`: `ADMIN_ORDERS_INCLUDE` constant added (spreads `ORDERS_INCLUDE` + adds `user: { select: { id, email, firstName, lastName } }`); `findAll` switches to `ADMIN_ORDERS_INCLUDE`; `findByIdForAdmin(orderId)` method added using `ADMIN_ORDERS_INCLUDE`; all other methods untouched
- [ ] `order.service.ts`: `adminGetOrder` calls `this.orderRepository.findByIdForAdmin(orderId)` instead of `findById`; `adminGetAllOrders` unchanged (repository handles the include)
- [ ] Unit tests written first (TDD Red), then implementation makes them green:
  - `order.service.spec.ts`: `findByIdForAdmin` added to `orderRepositoryMock`; new describe block covering S1–S4
  - `order.entity.spec.ts` (or describe block within service spec): E1–E3 covering `fromPrisma` customer mapping
  - `order.repository.spec.ts`: R1–R2 covering `findByIdForAdmin` and updated `findAll`
- [ ] `npm run test -w apps/store-api` — all tests pass (including all pre-existing 388 tests)
- [ ] `npm run lint -w apps/store-api` — clean
- [ ] `npm run typecheck` — clean
- [ ] No Prisma migration created or applied
- [ ] `ORDERS_INCLUDE`, `findById`, `findByUserId`, `updateStatus`, `cancelAndRestock`, `markPaid`, `softDelete`, `createFromCart` — all unchanged

**Files to create/modify:**

- `apps/store-api/src/order/order.types.ts` — add `user?` to `OrderWithItems`
- `apps/store-api/src/order/entities/order.entity.ts` — add `OrderCustomerData` class + `customer?` field + `fromPrisma` mapping
- `apps/store-api/src/order/order.repository.ts` — add `ADMIN_ORDERS_INCLUDE`, `findByIdForAdmin`, update `findAll`
- `apps/store-api/src/order/order.service.ts` — update `adminGetOrder` to call `findByIdForAdmin`
- `apps/store-api/src/order/order.service.spec.ts` — add mock method + new describe block (S1–S4)
- `apps/store-api/src/order/order.repository.spec.ts` — new describe block (R1–R2)

---

### TASK-125-B: Orval regeneration

**Type:** chore
**Scope:** store-admin, store-client
**Complexity:** S (15–30 min)
**TDD Required:** No
**Depends on:** TASK-125-A

**Acceptance Criteria:**

- [ ] `npm run generate:api` run from repo root (or equivalent workspace command)
- [ ] `apps/store-admin/src/shared/api/generated/` updated — `OrderEntity` now includes `customer?: OrderCustomerData`; `OrderCustomerData` type present in generated output
- [ ] `apps/store-client/src/shared/api/generated/` also updated (additive, no view changes needed)
- [ ] Generated files not hand-edited
- [ ] `npm run build` — all workspaces build clean
- [ ] `npm run typecheck` — clean

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)
- `apps/store-client/src/shared/api/generated/` — regenerated (do not hand-edit)

---

### TASK-125-C: store-admin views — list table + detail view customer section

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2–4h)
**TDD Required:** No (component tests included)
**Depends on:** TASK-125-B

**Acceptance Criteria:**

- [ ] `admin-order-table.tsx`: "Customer" column cell replaced — shows `order.customer.email` on the primary line and `firstName + lastName` (if present) on a secondary muted line; falls back to `order.userId.slice(0,8)…` when `order.customer` is absent
- [ ] `order-detail-view.tsx`: a "Customer" section card added at the top of the sidebar (before Summary); shows the account email and display name; only rendered when `order.customer` is present; existing `AddressBlock` shipping/billing sections unchanged
- [ ] Component test `admin-order-table.test.tsx`: MSW handler returns a page with one order that has a populated `customer`; asserts email and name are visible; asserts the UUID fallback is not rendered
- [ ] Component test `order-detail-view.test.tsx`: MSW handler returns an order with `customer`; asserts "Customer" heading and email are in the document
- [ ] `npm run test -w apps/store-admin` — all tests pass
- [ ] `npm run lint -w apps/store-admin` — clean
- [ ] `npm run typecheck` — clean
- [ ] No new Ukrainian string keys introduced (store-admin orders not yet localized per TASK-115 status — English strings match existing view conventions)

**Files to create/modify:**

- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx` — update "Customer" cell
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — add "Customer" card to sidebar
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx` — new component test
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx` — new component test

---

### TASK-125-D: Manual QA

**Type:** test
**Scope:** store-admin + store-api (running stack)
**Complexity:** S (20–30 min)
**TDD Required:** No
**Depends on:** TASK-125-C

**Acceptance Criteria:**

- [ ] Manual QA checklist below completed on a running stack
- [ ] No regression in customer-facing order flows (customer order list/detail do not expose customer data of other users)

**Files to create/modify:**

- None (verification only)

---

## Affected Files

| File                                                                      | Change                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/store-api/src/order/order.types.ts`                                 | Add `user?` optional field to `OrderWithItems`                                              |
| `apps/store-api/src/order/entities/order.entity.ts`                       | Add `OrderCustomerData` nested class + `customer?` field + conditional `fromPrisma` mapping |
| `apps/store-api/src/order/order.repository.ts`                            | Add `ADMIN_ORDERS_INCLUDE`; add `findByIdForAdmin`; switch `findAll` to admin include       |
| `apps/store-api/src/order/order.service.ts`                               | `adminGetOrder` calls `findByIdForAdmin`                                                    |
| `apps/store-api/src/order/order.service.spec.ts`                          | Add `findByIdForAdmin` mock method; new describe block S1–S4                                |
| `apps/store-api/src/order/order.repository.spec.ts`                       | New describe block R1–R2                                                                    |
| `apps/store-admin/src/shared/api/generated/`                              | Regenerated by Orval — do not hand-edit                                                     |
| `apps/store-client/src/shared/api/generated/`                             | Regenerated by Orval — do not hand-edit                                                     |
| `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`        | Replace "Customer" cell                                                                     |
| `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx`      | Add "Customer" sidebar card                                                                 |
| `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx`   | New component test                                                                          |
| `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx` | New component test                                                                          |

Files confirmed unchanged:

- `apps/store-api/src/order/admin-order.controller.ts` — no change; Swagger envelopes remain `OrderEntity[]` (gain the optional field automatically through the entity class)
- `apps/store-api/src/order/order.controller.ts` — customer order controller untouched
- `apps/store-api/src/order/order.repository.ts` — `ORDERS_INCLUDE`, `findById`, `findByUserId`, mutation methods all untouched
- `apps/store-api/src/order/order.service.ts` — only `adminGetOrder` changes; all other methods untouched
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-skeleton.tsx` — no change
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table-skeleton.tsx` — no change
- `apps/store-admin/src/features/order-status-update/` — no change
- `apps/store-client/**` — no view changes; generated types updated additively
- Prisma schema — no changes; no migration

---

## Migration Steps

1. No Prisma migration.
2. **TASK-125-A** — TDD: write failing tests first, then implement `OrderWithItems.user?`,
   `OrderCustomerData`, `OrderEntity.customer?`, `ADMIN_ORDERS_INCLUDE`, `findByIdForAdmin`,
   updated `findAll`, updated `adminGetOrder`. Gate: all backend tests green.
3. **TASK-125-B** — Run `npm run generate:api`. Confirm `OrderCustomerData` present in generated
   output. Run build + typecheck.
4. **TASK-125-C** — Update the two store-admin views; write component tests. Gate: store-admin
   tests + lint + typecheck green.
5. **TASK-125-D** — Manual QA on a running stack using the checklist below.

---

## Manual QA Checklist

To be executed on a running stack (API + store-admin) after TASK-125-C merges.

### A — Admin order list shows customer email

1. Open store-admin → `/orders`.
2. Locate any order row in the table.
3. Verify the "Customer" column shows a real email address (e.g., `user@example.com`), not a
   UUID fragment like `550e8400…`.
4. If the user has a first and/or last name, verify a secondary muted line shows the name
   below the email.
5. Verify the rest of the row (order ID, status, payment, total, items count, date) is
   unchanged.

### B — Admin order detail shows Customer section

1. Click "View" on any order row to open the detail page (`/orders/:id`).
2. Verify the sidebar shows a "Customer" card at the top (above "Summary").
3. Verify the card contains the account email address.
4. If the user has a name, verify it is displayed below the email.
5. Verify the existing "Shipping address" block still shows the delivery name, address,
   city, and phone — unchanged from before.
6. Verify the "Summary", "Billing address" (if different), and "Notes" blocks are unchanged.

### C — Customer-facing order responses are unaffected

1. Log in as a regular customer (not admin) in `store-client`.
2. Place an order or navigate to `/orders` (order history).
3. Open browser DevTools → Network → find a `GET /api/orders` or `GET /api/orders/:id`
   response.
4. Confirm the response JSON does NOT contain a `customer` key on any order object.
5. Confirm the order confirmation page (`/orders/:id/confirmation`) still renders correctly
   with no console errors.

### D — No regression in order status updates

1. In store-admin, open an order detail page.
2. Change the order status using the "Update status" control.
3. Verify the status updates successfully (200 response, badge updates).
4. Verify the "Customer" section remains visible after the status update (the `findByIdForAdmin`
   query is re-run by TanStack Query invalidation).

---

## Risks & Mitigations

| Risk                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findById` vs `findByIdForAdmin` confusion — a future developer accidentally calls the wrong one from a new service method              | Both methods are clearly JSDoc-commented. `findById` is the lean method for customer and mutation paths. `findByIdForAdmin` is the admin read path. The naming is explicit.                                                                                                        |
| Orval generates a breaking change to `OrderEntity` if `customer` is typed as required                                                   | `@ApiProperty({ required: false, nullable: true })` ensures Swagger marks the field optional. Orval will emit `customer?: OrderCustomerData` (optional). All existing consumers continue to compile.                                                                               |
| `store-client` components access `order.customer` and crash on undefined                                                                | The TypeScript type is `customer?: OrderCustomerData` (optional). Any store-client code that accesses it must use optional chaining. In practice, store-client order views do not read `customer` at all — they have no need for it.                                               |
| `ADMIN_ORDERS_INCLUDE` spreads `ORDERS_INCLUDE` — if `ORDERS_INCLUDE` changes in the future, `ADMIN_ORDERS_INCLUDE` inherits the change | This is desirable: any new field added to the base include (e.g., a future `reviews` relation) is automatically present in admin queries. The spread is intentional.                                                                                                               |
| `as OrderWithItems` casts in `findByIdForAdmin` return type — the runtime object has `user` but the type has `user?`                    | This is correct. The cast accurately represents the type: `user` will be present (the query selects it) but TypeScript types it as optional (it is structurally optional in the interface). `fromPrisma`'s `if (order.user)` guard handles both cases safely.                      |
| TASK-115 (store-admin localization) may eventually localize the orders section and need to translate "Customer"                         | The "Customer" heading string follows existing English conventions (other headings in `order-detail-view.tsx` are already English: "Summary", "Shipping address", etc.). When TASK-115 extends to orders, all headings will be localized together. No special handling needed now. |

---

## Notes

- No Prisma migration required — confirmed. The `User.email`, `User.firstName`, `User.lastName`
  columns already exist. The `Order.userId` foreign key already provides the Prisma relation.
- No new NestJS module, no new controller, no new service method except the single
  `findByIdForAdmin` repository method.
- The `OrderCustomerData` Swagger class must be listed in `@ApiExtraModels(...)` on
  `AdminOrderController` alongside the existing `OrderEntity`, `OrderItemEntity`, etc.,
  so Swagger emits the nested schema and Orval can resolve the type reference.
- This is a critical module (orders) — TDD is mandatory per `AGENTS.md`. All backend changes
  in TASK-125-A must follow Red → Green → Refactor.
- The `adminGetAllOrders` service method calls `this.orderRepository.findAll(query)` and maps
  with `OrderEntity.fromPrisma(order)` — no service-level change is needed for the list path;
  the `fromPrisma` change handles the mapping automatically once the repository includes the
  `user` relation.
