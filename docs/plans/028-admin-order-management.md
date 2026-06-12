# Plan 028 — Admin Order Management (TASK-041)

**Roadmap Phase:** Phase 4 — Admin Panel
**Feature:** Admin Order management — order list (with filters), order detail view, and status update in `apps/store-admin`.
**Status:** Implemented (automated gate green; manual smoke pending)
**Created:** 2026-06-12

> **Backend scope note:** The existing `OrderController` (`/api/orders`) is a
> customer-facing controller that gates all routes behind `JwtAuthGuard` and
> applies an ownership check. Admin order management needs a **separate**
> `AdminOrderController` at prefix `admin/orders`, protected by `AdminGuard`,
> so that admins can list ALL orders (not just their own), fetch any single
> order by ID, and drive status transitions across the full `OrderStatus`
> lifecycle (CONFIRMED → PROCESSING → SHIPPED → DELIVERED). This mirrors the
> pattern used by `AdminCategoryController` vs `CategoryController`.
>
> **Service reuse note:** `OrderService.updateStatus(orderId, status)` and
> `OrderService.confirmPayment(orderId)` already exist and are already
> admin-oriented (no ownership check). The admin controller will delegate to
> these existing service methods plus a new `getAllOrders` method that queries
> across all users.
>
> **Swagger gap note:** The existing `OrderController` response envelopes
> (`OrderResponseEnvelope`, `OrderListResponseEnvelope`) are defined as bare
> classes inside the controller file (same file-local pattern as the product
> and category controllers). The admin controller will introduce a new
> `AdminOrderListResponse` decorated class (analogous to
> `AdminCategoryListResponse`) so Orval generates a typed list hook.
> The single-order response reuses `OrderResponseEnvelope` from the shared
> entities barrel.
>
> **No new Prisma migration needed.** The `Order`, `OrderItem`, `OrderStatus`,
> and `PaymentStatus` models are fully established and unchanged.
>
> **Frontend-only order hook gap:** The currently generated
> `apps/store-admin/src/shared/api/generated/orders/orders.ts` contains hooks
> for the customer-facing `GET /api/orders` (returns user's own orders only)
> and `GET /api/orders/:orderId` (ownership-checked). After the new admin
> controller is added and Orval is regenerated, admin-specific hooks
> (`useAdminOrderControllerFindAll`, `useAdminOrderControllerFindById`,
> `useAdminOrderControllerUpdateStatus`) will be generated in a new file
> `generated/admin-orders/admin-orders.ts`.

---

## 1. Problem Statement

TASK-039 and TASK-040 delivered admin Product and Category CRUD. The next Phase 4
feature is order management. Currently the `store-admin` sidebar has an "Orders"
link pointing to `#`. Admins have no way to view orders from all users, track their
status, or advance an order through the fulfillment lifecycle (CONFIRMED →
PROCESSING → SHIPPED → DELIVERED) without writing SQL directly.

The `confirm-payment` endpoint on the existing `OrderController` is an admin action
but it is routed under `/api/orders` (customer prefix) — it should be complemented
by a proper dedicated admin controller that provides full visibility and control over
all orders.

---

## 2. Goals

- Provide a paginated, filterable order list at `/orders` inside the admin shell,
  showing ALL orders across all users.
- Allow filtering by `status`, `userId`, and date range from URL query params.
- Allow viewing the full detail of any order at `/orders/[id]` (read-only view with
  order items, shipping address, and totals).
- Allow advancing an order's status via a dropdown/select directly on the detail
  page: `PENDING → CONFIRMED`, `CONFIRMED → PROCESSING`, `PROCESSING → SHIPPED`,
  `SHIPPED → DELIVERED`, with `CANCEL` available from `PENDING`.
- Fix the Orders sidebar link from `#` to `/orders`.
- Gate all pages behind the existing `AdminShellGuard`.
- No "create order" UI — orders originate from the storefront only.
- No "edit order items" UI — order items are immutable snapshots.

## 3. Non-Goals

- Refund management — a separate `REFUNDED` status transition exists in the enum
  but requires payment gateway integration (TASK-034); it is out of scope here.
- Bulk status updates — selecting multiple orders and changing their statuses is
  a Phase 5 enhancement.
- Order deletion — the backend has no delete endpoint for orders; they are immutable
  audit records.
- Payment management — `confirm-payment` (manual stub) exists on the customer
  controller; Stripe integration is TASK-034.
- Storefront order history — this plan is admin-only.

---

## 4. Current State — What Already Exists

### 4.1 Backend (store-api) — Order Endpoints

| Method  | Path                                   | Guard                            | Notes                                    |
| ------- | -------------------------------------- | -------------------------------- | ---------------------------------------- |
| `POST`  | `/api/orders`                          | `JwtAuthGuard`                   | Create order from cart (customer only)   |
| `GET`   | `/api/orders`                          | `JwtAuthGuard`                   | List user's own orders (ownership check) |
| `GET`   | `/api/orders/:orderId`                 | `JwtAuthGuard`                   | Get single order (ownership check)       |
| `PATCH` | `/api/orders/:orderId/cancel`          | `JwtAuthGuard`                   | Cancel PENDING order (ownership check)   |
| `PATCH` | `/api/orders/:orderId/confirm-payment` | `JwtAuthGuard` + `@Roles(ADMIN)` | Admin: mark paid + confirm               |

**Gap:** There is no dedicated admin controller. An admin visiting the panel has no
`GET /api/admin/orders` endpoint to fetch all orders across all users. The existing
`GET /api/orders` only returns the admin's own orders.

### 4.2 OrderService — Existing Methods (Reusable)

| Method                          | Notes                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `getOrders(userId, query)`      | User-scoped. **Not reusable** for admin list (user-filtered).                                          |
| `getOrder(userId, orderId)`     | User-scoped (ownership check). **Not reusable** for admin.                                             |
| `cancelOrder(userId, orderId)`  | User-scoped. Can be reused; admin passes any userId OR service skips ownership check via a new method. |
| `confirmPayment(orderId)`       | No ownership check. **Reusable** for admin confirm-payment action.                                     |
| `updateStatus(orderId, status)` | No ownership check. **Reusable** for all admin transitions.                                            |

Two new service methods must be added:

- `adminGetAllOrders(query: AdminOrderListQueryDto)` — fetches all orders across
  all users with optional `status`, `userId`, `dateFrom`, `dateTo` filters.
- `adminGetOrder(orderId: string)` — fetches any order by ID with no ownership check.

### 4.3 OrderRepository — Existing Methods (Reusable)

| Method                          | Notes                                                          |
| ------------------------------- | -------------------------------------------------------------- |
| `findByUserId(userId, query)`   | User-scoped. **Not reusable** for admin.                       |
| `findById(orderId)`             | No ownership check. **Reusable** for admin single-order fetch. |
| `updateStatus(orderId, status)` | No ownership check. **Reusable**.                              |
| `cancelAndRestock(orderId)`     | No ownership check. **Reusable** for admin cancel.             |
| `markPaid(orderId)`             | No ownership check. **Reusable** for admin confirm-payment.    |

One new repository method must be added:

- `findAll(query: AdminOrderListQueryDto)` — queries across all users with optional
  filters, paginated, newest first.

### 4.4 Orval-Generated Hooks (store-admin) — Currently Available

All hooks in `generated/orders/orders.ts` target the customer-facing prefix. After
TASK-041-A adds the admin controller and TASK-041-B regenerates Orval, a new file
`generated/admin-orders/admin-orders.ts` will appear with:

| Hook                                            | Endpoint                                  |
| ----------------------------------------------- | ----------------------------------------- |
| `useAdminOrderControllerFindAll`                | `GET /api/admin/orders`                   |
| `useAdminOrderControllerFindById`               | `GET /api/admin/orders/:orderId`          |
| `useAdminOrderControllerUpdateStatus`           | `PATCH /api/admin/orders/:orderId/status` |
| `useAdminOrderControllerCancelOrder` (optional) | `PATCH /api/admin/orders/:orderId/cancel` |

### 4.5 store-admin FSD Structure (Post TASK-040)

```
apps/store-admin/src/
  shared/
    api/
      instance.ts             — Axios + Bearer interceptor (done)
      index.ts                — re-exports generated hooks (must add admin-orders)
      generated/
        orders/orders.ts      — customer-facing order hooks (already generated)
        admin-orders/         — will be created after regen (TASK-041-B)
    ui/                       — shadcn/ui: Button, Input, Label, Badge, Select,
                                Table, Separator, Skeleton (all present)
  entities/
    session/                  — AuthProvider, useAuth (done)
    product/                  — product barrel (done)
    category/                 — category barrel (done)
  features/
    admin-auth/               — AdminLoginForm, LogoutButton (done)
    product-form/             — ProductForm (done)
    product-status-toggle/    — ProductStatusToggle (done)
    category-form/            — CategoryForm (done)
    category-status-toggle/   — CategoryStatusToggle (done)
  widgets/
    admin-shell/              — AdminSidebar (Orders href is `#`), AdminHeader (done)
    product-list/             — AdminProductTable (done)
    product-form-view/        — CreateProductView, EditProductView (done)
    category-list/            — AdminCategoryTable (done)
    category-form-view/       — CreateCategoryView, EditCategoryView (done)
  app/
    (dashboard)/
      layout.tsx              — AdminShellGuard (done)
      page.tsx                — Static dashboard (done)
      products/               — Product CRUD pages (done)
      categories/             — Category CRUD pages (done)
    (auth)/login/page.tsx     — Admin login (done)
```

### 4.6 Order Domain Specifics vs. Products / Categories

| Aspect             | Products/Categories                                         | Orders                                                                                                |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| List response type | `ProductListResponseEnvelope` / `AdminCategoryListResponse` | New `AdminOrderListResponse` (all-users list)                                                         |
| List item type     | `ProductEntity` / `CategoryWithCountEntity`                 | `OrderEntity` (has `items[]`, `userId`, `status`, `paymentStatus`, money fields)                      |
| Find-by-ID         | Typed envelope                                              | `OrderResponseEnvelope` (can reuse from existing Orval models)                                        |
| Write operations   | Create / Update / Activate / Deactivate                     | Status transitions only (`updateStatus`); no create/edit/delete                                       |
| Special relation   | `categoryId` → category name                                | `userId` → customer email (lookup via `UserRepository`)                                               |
| Status field       | `isActive` (boolean)                                        | `status` enum (`PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`) |
| Payment field      | n/a                                                         | `paymentStatus` enum (`PENDING`, `PAID`, `FAILED`, `REFUNDED`)                                        |
| Money fields       | Price string                                                | `subtotal`, `discount`, `shippingCost`, `tax`, `total` as strings                                     |
| Items              | No nested items                                             | `items[]` with product/variant snapshots                                                              |

---

## 5. Architecture Decisions

### 5.1 Dedicated AdminOrderController at `admin/orders`

Following the exact `AdminCategoryController` pattern, the new controller lives at
`apps/store-api/src/order/admin-order.controller.ts` and uses prefix `admin/orders`.
It is decorated with `@ApiTags('Admin Orders')`, `@ApiBearerAuth('access-token')`,
`@UseGuards(AdminGuard)`, and registers the response envelope classes via
`@ApiExtraModels`.

Endpoints:

| Method  | Path                                | Description                           |
| ------- | ----------------------------------- | ------------------------------------- |
| `GET`   | `/api/admin/orders`                 | List all orders (paginated + filters) |
| `GET`   | `/api/admin/orders/:orderId`        | Get any single order by UUID          |
| `PATCH` | `/api/admin/orders/:orderId/status` | Update order status (any transition)  |

No `POST` (orders are created by customers) and no `DELETE` (orders are immutable).

### 5.2 New Service Methods (No New Repository Methods for Single-Order)

`OrderService` gets two new admin-oriented methods:

- `adminGetAllOrders(query: AdminOrderListQueryDto)` — delegates to
  `OrderRepository.findAll(query)` (new repository method).
- `adminGetOrder(orderId: string)` — delegates to `OrderRepository.findById(orderId)`;
  throws `NotFoundException` if null (no ownership check).

`OrderRepository` gets one new method:

- `findAll(query: AdminOrderListQueryDto)` — unscoped paginated query; supports
  optional `status`, `userId`, `dateFrom`, `dateTo` filters; ordered newest first.

`OrderService.updateStatus` already exists and can be called directly from the admin
controller for the status-update endpoint.

### 5.3 New DTO: AdminOrderListQueryDto

A new `AdminOrderListQueryDto` that extends `OrderListQueryDto` with an additional
optional `userId` filter field, a `dateFrom` field, and a `dateTo` field. The base
`OrderListQueryDto` already has `status`, `page`, `limit`.

```typescript
// apps/store-api/src/order/dto/admin-order-list-query.dto.ts
export class AdminOrderListQueryDto extends OrderListQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
```

### 5.4 Decorated Response Envelopes for Swagger

Two decorated response classes in `admin-order.controller.ts`:

```typescript
class AdminOrderListResponse {
  @ApiProperty({ type: [OrderEntity] }) data!: OrderEntity[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}
```

`OrderResponseEnvelope` is redeclared locally (same pattern as category) or imported
from a shared location — since the existing definition is file-local to
`order.controller.ts`, a local declaration in the admin controller is the least-risk
approach (matches the category pattern exactly).

### 5.5 Frontend: No Form, Status Transition via Select

Unlike products and categories, admin order management has **no create/edit form**.
The only write action is a **status transition**. This simplifies the FSD layer
assignments:

| Layer                          | Slice                                                      | Purpose                                                                                                    |
| ------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `entities/order`               | `index.ts`                                                 | Re-export `OrderEntity`, `OrderItemEntity`, `UpdateOrderStatusDto`, admin-order hooks + query key getters  |
| `features/order-status-update` | `ui/OrderStatusSelect.tsx`                                 | Dropdown `<Select>` that calls `useAdminOrderControllerUpdateStatus`; invalidates list + detail on success |
| `widgets/order-list`           | `ui/AdminOrderTable.tsx`, `ui/AdminOrderTableSkeleton.tsx` | Paginated table with status filter; rows link to detail page                                               |
| `widgets/order-detail`         | `ui/OrderDetailView.tsx`, `ui/OrderDetailSkeleton.tsx`     | Full detail: header (status, dates, payment), items table, address, totals, status-update control          |
| `app/(dashboard)/orders/`      | `page.tsx`, `[id]/page.tsx`                                | Route pages (Server Components, Suspense)                                                                  |

Import direction: `app → widgets → features → entities → shared`.

### 5.6 Status Transition Rules (UI Enforcement)

The admin `OrderStatusSelect` component enforces sensible one-way transitions in the
UI (the backend's `updateStatus` does not guard transitions — that is intentional per
the existing service design, so the UI is the first line of consistency):

| Current Status | Allowed Next Statuses                  |
| -------------- | -------------------------------------- |
| `PENDING`      | `CONFIRMED`, `CANCELLED`               |
| `CONFIRMED`    | `PROCESSING`, `CANCELLED`              |
| `PROCESSING`   | `SHIPPED`, `CANCELLED`                 |
| `SHIPPED`      | `DELIVERED`                            |
| `DELIVERED`    | _(terminal — no transition available)_ |
| `CANCELLED`    | _(terminal — no transition available)_ |
| `REFUNDED`     | _(terminal — no transition available)_ |

The select renders "No further transitions available" text (not a `<Select>`) for
terminal statuses. The status badge color mapping mirrors the storefront
`order-confirmation` status badge colors.

### 5.7 Route Structure

```
app/(dashboard)/
  orders/
    page.tsx           — Order list (all users, filterable by status)
    [id]/
      page.tsx         — Order detail (read + status-update widget)
```

No `new/` or `edit/` sub-routes since order creation and item editing are out of
scope.

### 5.8 Invalidation Strategy

- `useAdminOrderControllerUpdateStatus` mutation: on success, invalidates both the
  admin list query key (`/api/admin/orders`) and the specific order detail key
  (`/api/admin/orders/:orderId`).
- Skeleton used while the detail query is loading.
- 404 on detail page redirects to `/orders` (same pattern as EditProductView /
  EditCategoryView).

---

## 6. Tasks

### TASK-041-A: Add AdminOrderController + AdminOrderListQueryDto + new service/repository methods (backend)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/src/order/dto/admin-order-list-query.dto.ts` created with `AdminOrderListQueryDto` extending `OrderListQueryDto` and adding optional `userId` (UUID), `dateFrom` (ISO date string), `dateTo` (ISO date string) fields decorated with `@ApiProperty`, `@IsOptional`, `@IsUUID` / `@IsDateString`.
- [ ] `apps/store-api/src/order/dto/index.ts` updated to export `AdminOrderListQueryDto`.
- [ ] `OrderRepository.findAll(query: AdminOrderListQueryDto)` method added:
  - Builds `Prisma.OrderWhereInput` from optional `userId`, `status`, `dateFrom` (`createdAt >= dateFrom`), `dateTo` (`createdAt <= dateTo`) filters.
  - Returns `{ orders: OrderWithItems[]; total: number }` with newest-first ordering.
  - Pagination via `page` / `limit` from the base DTO (defaults match existing `DEFAULT_PAGE` / `DEFAULT_LIMIT`).
  - Runs count and page query in a single `$transaction`.
- [ ] `OrderService.adminGetAllOrders(query: AdminOrderListQueryDto)` method added:
  - Delegates to `orderRepository.findAll(query)`.
  - Returns `{ data: OrderEntity[]; meta: PaginationMeta }`.
- [ ] `OrderService.adminGetOrder(orderId: string)` method added:
  - Delegates to `orderRepository.findById(orderId)`.
  - Throws `NotFoundException('Order not found')` if null.
  - Returns `OrderEntity.fromPrisma(order)`.
- [ ] `apps/store-api/src/order/admin-order.controller.ts` created:
  - Prefix `admin/orders`; decorated with `@ApiTags('Admin Orders')`, `@ApiBearerAuth('access-token')`, `@UseGuards(AdminGuard)`.
  - Local `AdminOrderListResponse` class: `@ApiProperty({ type: [OrderEntity] }) data: OrderEntity[]` and `@ApiProperty() meta: PaginationMeta`. Decorated with `@ApiProperty` on both fields.
  - Local `AdminOrderResponseEnvelope` class: `@ApiProperty({ type: OrderEntity }) data: OrderEntity`. Decorated with `@ApiProperty`.
  - `@ApiExtraModels(OrderEntity, OrderItemEntity, AdminOrderListResponse, AdminOrderResponseEnvelope)` on the controller class.
  - `GET /api/admin/orders` — calls `orderService.adminGetAllOrders(query)`, accepts `AdminOrderListQueryDto` as query params; `@ApiResponse({ status: 200, type: AdminOrderListResponse })`.
  - `GET /api/admin/orders/:orderId` — calls `orderService.adminGetOrder(orderId)`; `@ApiResponse({ status: 200, type: AdminOrderResponseEnvelope })`, `@ApiResponse({ status: 404 })`.
  - `PATCH /api/admin/orders/:orderId/status` — accepts `UpdateOrderStatusDto` body; calls `orderService.updateStatus(orderId, dto.status)`; `@ApiResponse({ status: 200, type: AdminOrderResponseEnvelope })`, `@ApiResponse({ status: 404 })`.
  - All handlers use `@ApiOperation` with distinct `operationId` values: `adminOrderControllerFindAll`, `adminOrderControllerFindById`, `adminOrderControllerUpdateStatus`.
- [ ] `apps/store-api/src/order/order.module.ts` updated: `AdminOrderController` added to `controllers` array.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run test -w apps/store-api` passes (existing specs unaffected).
- [ ] `npm run swagger:export -w apps/store-api` produces swagger.json where all three `/api/admin/orders` endpoints appear with correct Swagger schemas.

**Files to create/modify:**

- `apps/store-api/src/order/dto/admin-order-list-query.dto.ts` — new DTO
- `apps/store-api/src/order/dto/index.ts` — add `AdminOrderListQueryDto` export
- `apps/store-api/src/order/order.repository.ts` — add `findAll()` method
- `apps/store-api/src/order/order.service.ts` — add `adminGetAllOrders()` and `adminGetOrder()` methods
- `apps/store-api/src/order/admin-order.controller.ts` — new admin controller
- `apps/store-api/src/order/order.module.ts` — register `AdminOrderController`

---

### TASK-041-B: Regenerate Orval hooks for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-041-A

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error.
- [ ] `npm run generate:api -w apps/store-admin` runs without error.
- [ ] `apps/store-admin/src/shared/api/generated/admin-orders/admin-orders.ts` created (or equivalent path determined by Orval tag grouping), containing:
  - `useAdminOrderControllerFindAll` (query hook returning `AdminOrderListResponse`)
  - `useAdminOrderControllerFindById` (query hook returning the order envelope)
  - `useAdminOrderControllerUpdateStatus` (mutation hook)
  - Corresponding query key getter functions.
- [ ] `apps/store-admin/src/shared/api/generated/models/` contains new generated model files for `AdminOrderListResponse`, `AdminOrderResponseEnvelope`, `AdminOrderListQueryDto` (or equivalent Orval-named files).
- [ ] `apps/store-admin/src/shared/api/index.ts` updated to export from the new generated admin-orders module (add `export * from "./generated/admin-orders/admin-orders"`).
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration.
- [ ] Generated files are NOT hand-edited.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)
- `apps/store-admin/src/shared/api/index.ts` — add admin-orders re-export

---

### TASK-041-C: Create entities/order barrel slice (store-admin)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-041-B

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/order/index.ts` created, re-exporting from `@/shared/api`:
  - Types: `OrderEntity`, `OrderItemEntity`, `UpdateOrderStatusDto`, `AdminOrderControllerFindAllParams` (or equivalent generated params type), `AdminOrderListResponse`
  - Hooks: `useAdminOrderControllerFindAll`, `useAdminOrderControllerFindById`, `useAdminOrderControllerUpdateStatus`
  - Query key getters: `getAdminOrderControllerFindAllQueryKey`, `getAdminOrderControllerFindByIdQueryKey`
  - Enums (re-export from `@/shared/api`): `OrderEntityStatus` (generated enum values), `OrderEntityPaymentStatus`
- [ ] `apps/store-admin/src/entities/index.ts` updated to add `export * from './order'`.
- [ ] FSD import rule satisfied: `entities` layer imports only from `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/entities/order/index.ts` — new barrel
- `apps/store-admin/src/entities/index.ts` — add `export * from './order'`

---

### TASK-041-D: Create features/order-status-update slice (OrderStatusSelect component)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-041-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/order-status-update/ui/OrderStatusSelect.tsx` created:
  - Props: `{ orderId: string; currentStatus: string }`
  - Renders a `shadcn/ui` `Select` component with allowed next statuses derived from the transition map (see Architecture Decision 5.6).
  - For terminal statuses (`DELIVERED`, `CANCELLED`, `REFUNDED`), renders a `<p>` text "No further transitions available" instead of a `<Select>`.
  - Uses `useAdminOrderControllerUpdateStatus` mutation from `@/entities/order`.
  - On success: invalidates `getAdminOrderControllerFindAllQueryKey()` and `getAdminOrderControllerFindByIdQueryKey(orderId)` via `useQueryClient()`; shows a sonner success toast.
  - On error: shows a sonner error toast.
  - Select is disabled while mutation is pending.
  - `aria-label="Update order status"`.
- [ ] `apps/store-admin/src/features/order-status-update/index.ts` barrel exports `OrderStatusSelect`.
- [ ] `apps/store-admin/src/features/index.ts` updated to add `export * from './order-status-update'`.
- [ ] FSD: `features` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/features/order-status-update/ui/OrderStatusSelect.tsx` — new file
- `apps/store-admin/src/features/order-status-update/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-041-E: Create widgets/order-list slice (AdminOrderTable + Skeleton)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-041-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/order-list/ui/AdminOrderTableSkeleton.tsx` created — 5 animated skeleton rows matching the order table column structure.
- [ ] `apps/store-admin/src/widgets/order-list/ui/AdminOrderTable.tsx` created:
  - A "use client" component.
  - Reads `?status=` and `?page=` URL query params via `useSearchParams()` for list state.
  - Provides a status filter `<Select>` at the top of the table (options: All, PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED); sets the `?status=` param via `router.push`.
  - Fetches orders via `useAdminOrderControllerFindAll` with current params.
  - Renders a `shadcn/ui` `Table` with columns: Order ID (truncated UUID), Customer (userId truncated), Status (colored `Badge`), Payment (colored `Badge`), Total, Items (#), Created At, Actions.
  - Status badge colors: `PENDING` = secondary, `CONFIRMED` = default (blue), `PROCESSING` = outline (yellow), `SHIPPED` = outline (purple), `DELIVERED` = default (green), `CANCELLED`/`REFUNDED` = destructive.
  - Actions column: `View` link (`<Link href={/orders/${order.id}}>`) as a `Button` variant `"outline"` size `"sm"`.
  - Shows `AdminOrderTableSkeleton` while loading.
  - Shows empty-state message when `data.data` is empty.
  - Pagination controls (Previous / page N of M / Next) using `Button` components; disables Previous on page 1, Next on last page.
- [ ] `apps/store-admin/src/widgets/order-list/index.ts` exports `AdminOrderTable` and `AdminOrderTableSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add `AdminOrderTable` and `AdminOrderTableSkeleton` exports.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/order-list/ui/AdminOrderTableSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/order-list/ui/AdminOrderTable.tsx` — new file
- `apps/store-admin/src/widgets/order-list/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-041-F: Create widgets/order-detail slice (OrderDetailView + Skeleton)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-041-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/order-detail/ui/OrderDetailSkeleton.tsx` created — animated placeholder for the full detail layout.
- [ ] `apps/store-admin/src/widgets/order-detail/ui/OrderDetailView.tsx` created:
  - Props: `{ orderId: string }`
  - A "use client" component.
  - Fetches order via `useAdminOrderControllerFindById(orderId)` from `@/entities/order`.
  - While loading: renders `OrderDetailSkeleton`.
  - On 404 (`error?.response?.status === 404`): redirects to `/orders` via `router.replace`.
  - On load success, renders a two-column layout:
    - **Left / main column:**
      - Page header: "Order #[id truncated]" + `<Link>` "Back to Orders" → `/orders`.
      - Status section: current `status` badge, current `paymentStatus` badge, created/updated timestamps.
      - `OrderStatusSelect` component (from `features/order-status-update`) — passes `orderId` and `currentStatus`.
      - Order items `<Table>`: Product name, variant name (if any), unit price, quantity, line total. Uses `shadcn/ui` `Table`.
    - **Right / sidebar column:**
      - Money summary: subtotal, discount, shipping, tax, grand total.
      - Shipping address block (street, city, state, zip, country from `shippingAddress` JSON).
      - Billing address block (if `billingAddress` differs from `shippingAddress`).
      - Notes section (if `notes` is not null).
- [ ] `apps/store-admin/src/widgets/order-detail/index.ts` exports `OrderDetailView` and `OrderDetailSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add `OrderDetailView` and `OrderDetailSkeleton` exports.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/order-detail/ui/OrderDetailSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/order-detail/ui/OrderDetailView.tsx` — new file
- `apps/store-admin/src/widgets/order-detail/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-041-G: Create app route pages for order management

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-041-E, TASK-041-F

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/app/(dashboard)/orders/page.tsx` created:
  - Server Component with `export const metadata = { title: 'Orders — Admin' }`.
  - Renders a page header: heading "Orders".
  - Renders `<Suspense fallback={<AdminOrderTableSkeleton />}><AdminOrderTable /></Suspense>`.
  - Status and page state are driven by URL query params consumed inside `AdminOrderTable` (client component).
- [ ] `apps/store-admin/src/app/(dashboard)/orders/[id]/page.tsx` created:
  - Server Component.
  - `generateMetadata`: returns `{ title: 'Order [id] — Admin' }`.
  - Accepts `{ params: Promise<{ id: string }> }` (Next.js 15 async params pattern — `await params`).
  - Renders `<Suspense fallback={<OrderDetailSkeleton />}><OrderDetailView orderId={id} /></Suspense>`.
- [ ] All pages are gated by the existing `(dashboard)/layout.tsx` `AdminShellGuard` — no additional guard needed.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/orders/page.tsx` — new file
- `apps/store-admin/src/app/(dashboard)/orders/[id]/page.tsx` — new file

---

### TASK-041-H: Fix AdminSidebar Orders link

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-041-G

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` updated: `href: '#'` for the Orders nav item changed to `href: '/orders'`.
- [ ] Active-link logic (`isNavItemActive`) works for `/orders` and `/orders/[id]` without change (the existing `pathname.startsWith(`${href}/`)` check covers sub-routes).
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — change Orders `href` from `#` to `/orders`

---

### TASK-041-I: Build, lint, typecheck, test verification gate

**Type:** chore
**Scope:** store-api, store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** All previous TASK-041-\* subtasks

**Acceptance Criteria:**

- [ ] `npm run build` (all workspaces) completes without error.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test -w apps/store-api` passes — all existing specs green; new `findAll` repository method and `adminGetAllOrders` / `adminGetOrder` service methods covered by existing test patterns (or brief new specs added without blocking the gate).
- [ ] `npm run test:e2e -w apps/store-api` passes — existing order e2e unaffected by admin controller addition.
- [ ] Manual smoke test (running app):
  - Navigate to `/orders` in `store-admin` — order table loads with all orders from seeded data across all users.
  - Status filter `<Select>` filters the table to the selected status; `?status=` appears in the URL.
  - Click "View" on an order row → `/orders/[id]` detail page renders with items table, totals, and address.
  - `OrderStatusSelect` shows the valid next statuses; select a transition → status badge updates, table refreshes on back-navigation.
  - Terminal-status orders show "No further transitions available" in place of the select.
  - Orders sidebar link is active-highlighted on `/orders` and `/orders/[id]` routes.

---

## 7. Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                                          | Action                                                                             | Subtask |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| `src/order/dto/admin-order-list-query.dto.ts` | Create — new DTO extending `OrderListQueryDto` with `userId`, `dateFrom`, `dateTo` | 041-A   |
| `src/order/dto/index.ts`                      | Modify — add `AdminOrderListQueryDto` export                                       | 041-A   |
| `src/order/order.repository.ts`               | Modify — add `findAll(query)` method                                               | 041-A   |
| `src/order/order.service.ts`                  | Modify — add `adminGetAllOrders()` and `adminGetOrder()` methods                   | 041-A   |
| `src/order/admin-order.controller.ts`         | Create — new admin controller                                                      | 041-A   |
| `src/order/order.module.ts`                   | Modify — register `AdminOrderController` in `controllers`                          | 041-A   |

### Frontend (store-admin)

| File                                                        | Action                                                               | Subtask      |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| `src/shared/api/generated/`                                 | Regenerate (do not hand-edit)                                        | 041-B        |
| `src/shared/api/index.ts`                                   | Modify — add `export * from "./generated/admin-orders/admin-orders"` | 041-B        |
| `src/entities/order/index.ts`                               | Create — order entity barrel                                         | 041-C        |
| `src/entities/index.ts`                                     | Modify — add `export * from './order'`                               | 041-C        |
| `src/features/order-status-update/ui/OrderStatusSelect.tsx` | Create                                                               | 041-D        |
| `src/features/order-status-update/index.ts`                 | Create — barrel                                                      | 041-D        |
| `src/features/index.ts`                                     | Modify — add `export * from './order-status-update'`                 | 041-D        |
| `src/widgets/order-list/ui/AdminOrderTableSkeleton.tsx`     | Create                                                               | 041-E        |
| `src/widgets/order-list/ui/AdminOrderTable.tsx`             | Create                                                               | 041-E        |
| `src/widgets/order-list/index.ts`                           | Create — barrel                                                      | 041-E        |
| `src/widgets/order-detail/ui/OrderDetailSkeleton.tsx`       | Create                                                               | 041-F        |
| `src/widgets/order-detail/ui/OrderDetailView.tsx`           | Create                                                               | 041-F        |
| `src/widgets/order-detail/index.ts`                         | Create — barrel                                                      | 041-F        |
| `src/widgets/index.ts`                                      | Modify — add order-list + order-detail re-exports                    | 041-E, 041-F |
| `src/app/(dashboard)/orders/page.tsx`                       | Create — order list route                                            | 041-G        |
| `src/app/(dashboard)/orders/[id]/page.tsx`                  | Create — order detail route                                          | 041-G        |
| `src/widgets/admin-shell/admin-sidebar.tsx`                 | Modify — change Orders `href` from `#` to `/orders`                  | 041-H        |

---

## 8. Testing Strategy

### Backend Unit Tests

The `findAll` repository method and `adminGetAllOrders` / `adminGetOrder` service methods follow the same structural pattern as the existing `findByUserId` / `getOrders` / `getOrder` methods. Recommended approach:

- Add a `describe('adminGetAllOrders')` block to `order.service.spec.ts` testing:
  - Returns paginated `{ data, meta }` from `orderRepository.findAll`.
  - Delegates filter params correctly.
- Add a `describe('adminGetOrder')` block testing:
  - Returns `OrderEntity` when order exists.
  - Throws `NotFoundException` when `findById` returns `null`.
- No TDD cycle required (no complex business logic; repository method is a Prisma query filter).

### Backend E2E Tests

Add a new `describe('Admin Order Management — /api/admin/orders')` block to the
existing order e2e spec file (or a new `order-admin.e2e-spec.ts`):

- `GET /api/admin/orders` returns 401 without token, 403 with non-admin token, 200
  with admin token (returns all orders including those of other users).
- `GET /api/admin/orders/:orderId` returns 404 for non-existent order, 200 for a
  valid order (any user's order visible to admin).
- `PATCH /api/admin/orders/:orderId/status` returns 200 and updates status; returns
  404 for non-existent order.

### Frontend Tests

TDD is not required for this feature. The critical path is:

- `OrderStatusSelect` — verify that the allowed-transitions map is correct (a unit
  test on the pure transition-map object is recommended in
  `features/order-status-update/model/transitions.ts` if extracted).
- Manual smoke test in TASK-041-I covers the full flow.

### Manual Smoke Tests

Described in TASK-041-I acceptance criteria.

---

## 9. Sequencing Diagram

```
TASK-041-A  (backend: AdminOrderController + DTO + service/repository methods)
    └── TASK-041-B  (Orval regen — gets typed AdminOrderListResponse + admin hooks)
              └── TASK-041-C  (entities/order barrel)
                        └── TASK-041-D  (features/order-status-update)
                                  ├── TASK-041-E  (widgets/order-list)
                                  │         └── TASK-041-G  (app route pages)
                                  │                   └── TASK-041-H  (sidebar link)
                                  │                             └── TASK-041-I  (verify)
                                  └── TASK-041-F  (widgets/order-detail)
                                            └── TASK-041-G  (app route pages)
```

TASK-041-E and TASK-041-F can be worked on in parallel after TASK-041-D completes.
TASK-041-G gates on both TASK-041-E and TASK-041-F.

---

## 10. Risks and Mitigations

| Risk                                                                                                     | Mitigation                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AdminOrderController` route `/api/admin/orders` conflicts with existing `/api/orders`                   | The NestJS route prefix is `admin/orders` — completely separate from `orders`. Confirmed no existing controller uses this prefix.                                                                                                                                                                                                                      |
| `AdminOrderListResponse` class name conflicts with `OrderListResponseEnvelope` (existing)                | Use a distinct name `AdminOrderListResponse` and register via `@ApiExtraModels`. The existing `OrderListResponseEnvelope` is file-local to `order.controller.ts` and is not exported.                                                                                                                                                                  |
| Orval generates a different filename for the admin-orders module (e.g., `admin-orders` vs `adminOrders`) | Run `generate:api`, check the actual generated path, and update `shared/api/index.ts` accordingly. Document the actual path in TASK-041-B acceptance criteria sign-off.                                                                                                                                                                                |
| `await params` pattern in Next.js 15 is different from previous examples                                 | Follow the same `await params` pattern already used in `categories/[id]/edit/page.tsx` (TASK-040-H). The plan explicitly calls it out.                                                                                                                                                                                                                 |
| Status transition UI allows an admin to drive an order backward (e.g., DELIVERED → CONFIRMED)            | The transition map in `OrderStatusSelect` only offers valid forward transitions and CANCEL where appropriate. The backend `updateStatus` does not guard transitions — this is intentional per the service design comment. If backward-transition prevention is needed at the API layer, a future TASK can add a state-machine guard to `updateStatus`. |
| `userId` in the order table is a raw UUID — not a human-readable customer email                          | The admin order list shows the truncated UUID. Resolving customer email would require an additional `User` lookup per row (N+1) or a join in the repository. For MVP, UUID display is acceptable; a future task can add a `customerEmail` field to the list response by extending the query.                                                           |

---

## 11. Open Questions

1. **Customer email in order list**: Should the admin order list show the customer's
   email address instead of (or alongside) their UUID? This would require either
   a backend join (`findAll` includes `user: { select: { email: true } }`) or a
   separate `/api/admin/users/:id` lookup. The recommended approach is to add the
   join in TASK-041-A at the `findAll` repository query level and surface
   `customerEmail` in the response. This is marked as a stretch goal — not
   blocking for the gate task.

2. **Date range filter in the UI**: `AdminOrderListQueryDto` accepts `dateFrom` /
   `dateTo` but the table UI in TASK-041-E currently only exposes the `status`
   filter. A date picker for the range filter can be added as a follow-up task.

3. **`confirm-payment` migration**: The existing `PATCH /api/orders/:orderId/confirm-payment`
   action (which is admin-only via `@Roles(ADMIN)`) is on the customer-facing
   controller. It should eventually be migrated to `AdminOrderController`. For now,
   the UI does not expose `confirm-payment` directly — the admin can use
   `updateStatus` to transition to `CONFIRMED` and separately mark payment via the
   existing endpoint if needed. Full consolidation is a Phase 5 cleanup task.
