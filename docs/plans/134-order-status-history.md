# Plan 134 — OrderStatusHistory

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 4 (Передзапускові фічі + решта CRM)
> **Origin:** `docs/handoff-2026-07-07.md` Блок A · discovery plan 100
> (`docs/plans/100-admin-crm-dashboard-checklist.md` §2–3, §4.1, §6)
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-251
> **Depends on:** TASK-248 (✅, `getNeedsAction()` baseline this plan extends), TASK-249 (✅,
> `AdminDashboardStats.tsx` StatCard/Tooltip/`formatPercent` pattern this plan reuses), TASK-254
> (✅, `restockedAt` revive/cancel/eviction logic this plan must not regress)

## Overview

TASK-251 asks for a `OrderStatusHistory` table written transactionally on **every** status and
paymentStatus change (including the very first PENDING one at order creation), an order timeline
on admin `/orders/[id]`, a "> 48h in PENDING" indicator on the dashboard "Потребує дії" widget, and
a processing-speed stat (average time from order creation to first SHIPPED transition).

Today `Order` has no change log — only `createdAt`/`updatedAt` and the narrow `restockedAt` flag
(TASK-228/254). The admin can see an order's _current_ status but not who changed it, when, or how
long it sat waiting. This plan closes that gap without disturbing the existing (fairly intricate)
status-transition logic in `order.service.ts`/`order.repository.ts`: the auto-restock guard
(`shouldAutoRestock`), the revive-and-reserve path (`isRevive`/`reviveAndReserve`), and the
pre-shipment cache-eviction flag (`crossesPreShipmentBoundary`) all keep their exact current
behavior — history-writing is added _alongside_ each of these paths, inside the same transaction,
never replacing or reordering their existing logic.

This is flagged **critical / TDD Red→Green→Refactor** in the BACKLOG because it touches the order
module's transactional mutation paths — the same paths TASK-228 and TASK-254 hardened against
double stock-credit and stale-cache bugs. A regression here (e.g. a history insert that silently
swallows an error, or a `$transaction` conversion that changes commit semantics) would be a
critical-module bug by the same standard as cart/discounts/inventory/auth.

## Scope

### In Scope

- New `OrderStatusHistory` Prisma model + `OrderHistoryChangeType` enum (`STATUS` |
  `PAYMENT_STATUS`) + `Order.statusHistory` relation.
- Every order-status-or-payment-status mutation path in `order.repository.ts` becomes (or stays) a
  single `$transaction` that also inserts exactly one history row:
  - `createFromCart` — initial row `fromStatus: null → toStatus: PENDING`, `changedBy: null`
    (system-authored; the order is born, not "changed" by anyone).
  - `updateStatus` (plain transition) — converted from a bare `prisma.order.update` to a
    `$transaction`; row `fromStatus → toStatus`, `changedBy` = the acting admin's user id.
  - `cancelAndRestock` — already a `$transaction`; gains the history insert using the `fromStatus`
    it already reads (`order.status` from its own `findUniqueOrThrow`).
  - `reviveAndReserve` — already a `$transaction`; gains the history insert, same pattern.
  - `updatePaymentStatus` — converted from a bare `prisma.order.update` to a `$transaction`; row
    `fromPaymentStatus → toPaymentStatus`, `changedBy` = the acting admin's user id.
- `changedBy` threading: `OrderService.updateStatus`/`adminUpdatePaymentStatus` gain a
  `changedBy: string | null` parameter; `AdminOrderController` supplies it via
  `@CurrentUser('id')`; the customer-facing self-cancel path (`OrderService.cancelOrder`) supplies
  the customer's own `userId` (they are the actor for their own cancellation).
- New read endpoint `GET /admin/orders/:orderId/history` (oldest-first timeline) +
  `OrderStatusHistoryEntity`.
- Dashboard: `NeedsActionDto` gains `pendingOver48h` (5th needs-action counter); new
  `OperationsMetricsDto`/`DashboardSummaryResponse.operations.averageProcessingHoursLast30Days`
  (processing-speed stat).
- Frontend: order timeline widget on `/orders/[id]`; 5th "Потребує дії" card; a new
  processing-speed `StatCard` on the dashboard.
- Unit + e2e + int-spec coverage per the TDD Red-first list below.

### Out of Scope

- A formal order-status state machine / transition-validity enforcement (still none exists —
  `PRE_SHIPMENT_STATUSES` remains the only stock gate, per the existing `order.constants.ts`
  comment; this plan does not add one).
- The Stripe/payment-webhook handler (TASK-034, parked) — its future `changedBy: null` (system)
  convention is documented here for forward-compatibility but no webhook code is touched.
- Customer-facing visibility of the timeline (storefront `/account/orders/[id]`) — admin-only per
  the BACKLOG wording ("order timeline on admin `/orders/[id]`").
- Resolving `changedBy` to an admin's display name/email — see Design Decision 3 below (single-admin
  store; a generic "Адміністратор" label is sufficient, no `User` join needed).
- Any change to `PRE_SHIPMENT_STATUSES`, `shouldAutoRestock`, or the pre-shipment cache-eviction
  boundary logic — this plan adds a write _alongside_ them, never edits their conditions.
- Customer card v1 (TASK-252, separate plan) — reads a different set of tables (User relations),
  not `OrderStatusHistory`.

## User Stories

1. As the store owner, I want to see a chronological history of every status and payment change on
   an order, so I know exactly when it was confirmed, shipped, or had its payment status changed —
   and can tell a genuine system record apart from a manual correction.
2. As the store owner, I want the dashboard to flag orders that have been sitting in "Очікує
   підтвердження" for more than 48 hours, so I never let a new order go unnoticed.
3. As the store owner, I want to see how fast, on average, orders go from placed to shipped, so I
   can tell if my fulfilment process is speeding up or slowing down.

## Technical Design

### Data Model

```prisma
enum OrderHistoryChangeType {
  STATUS
  PAYMENT_STATUS
}

model OrderStatusHistory {
  id                String                 @id @default(uuid())
  orderId           String                 @map("order_id")
  order             Order                  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  changeType        OrderHistoryChangeType @map("change_type")
  // Populated only for changeType = STATUS rows; both null for PAYMENT_STATUS rows.
  fromStatus        OrderStatus?           @map("from_status")
  toStatus          OrderStatus?           @map("to_status")
  // Populated only for changeType = PAYMENT_STATUS rows; both null for STATUS rows.
  fromPaymentStatus PaymentStatus?         @map("from_payment_status")
  toPaymentStatus   PaymentStatus?         @map("to_payment_status")
  // Nullable: system/webhook-driven changes (order creation's initial PENDING row today;
  // a future Stripe/payment webhook tomorrow) have no acting admin/customer user. Populated
  // with the acting user's id when the change came from an authenticated request.
  changedBy         String?                @map("changed_by")
  changedAt         DateTime               @default(now()) @map("changed_at")

  @@index([orderId, changedAt])
  @@map("order_status_history")
}
```

Add to `model Order`: `statusHistory OrderStatusHistory[]`.

**Design Decision 1 — one table, two change "kinds" via a discriminator column**, rather than two
separate tables or a generic `field/fromValue/toValue` string pair. Rationale: a single
`OrderStatusHistory` table (matching the name specified in the BACKLOG/discovery doc) is simplest to
query for "the full timeline of order X" (one `ORDER BY changed_at` scan, no `UNION`), while the
nullable status/payment-status column pairs keep both directions strongly typed (`OrderStatus?` /
`PaymentStatus?` enums, not free-text) so a typo in a status string can never silently corrupt the
log. The `changeType` discriminator resolves which pair is populated for a given row (both status
columns null for a `PAYMENT_STATUS` row, and vice versa) — enforced by convention at the write
sites (repository-only concern), not a DB constraint (Postgres has no clean partial-nullability
CHECK across two enum pairs without needless complexity for an append-only audit log).

**Design Decision 2 — `createOrder` writes an initial history row (`null → PENDING`,
`changedBy: null`).** Recommended and adopted: without it, the timeline's very first entry would be
missing (the order simply "appears" at CONFIRMED-or-later with no birth record), and the
processing-speed query becomes marginally harder to reason about. `changedBy: null` because order
creation is the customer placing an order, not an admin "changing" its status — the same
system-authored convention a future payment webhook will reuse.

**Design Decision 3 — `changedBy` stores a raw user id; the frontend disambiguates the _display_
label, not the backend.** The API returns the actor's user id (or null); the frontend timeline
widget already has both the order's `userId` (owner) and the current admin's session available, so
resolving "Клієнт" (self-cancel) vs "Адміністратор" (any other non-null id) vs "Система" (null) is a
pure, unit-testable frontend concern (`historyActorLabel`, see Frontend below) — no `User` join or
email resolution needed on the backend. This matches plan 100's framing of the store as
single-admin ("один власник-адмін"): there is no need to resolve _which_ admin, only _that_ it was
an admin action versus the customer's own action versus the system.

### Backend (NestJS — Clean Architecture)

No new module. `OrderStatusHistory` is intrinsically part of the `Order` aggregate (mirrors how
`restockedAt` and the pre-shipment eviction flag already live directly in `OrderRepository`/
`OrderService` rather than a separate module) — every read/write lives in the existing `order`
module.

#### `OrderRepository` — every mutation path gains a history insert in the same transaction

```ts
// createFromCart — inside the existing `this.prisma.$transaction(async (tx) => { ... })`,
// immediately after `tx.order.create(...)`:
await tx.orderStatusHistory.create({
  data: {
    orderId: created.id,
    changeType: OrderHistoryChangeType.STATUS,
    fromStatus: null,
    toStatus: OrderStatus.PENDING,
    changedBy: null,
  },
});
```

```ts
// updateStatus — converted from a bare `prisma.order.update` to a `$transaction`. `fromStatus`
// is passed in by the caller (the service already loaded `existing.status` via `findById` before
// deciding this is a plain transition — see Design Decision 4), not re-read inside the tx.
async updateStatus(
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  paymentStatus: PaymentStatus,
  changedBy: string | null,
  options: { evictProductStockCaches?: boolean } = {},
): Promise<OrderWithItems> {
  const updated = (await this.prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: toStatus, paymentStatus },
      include: ORDERS_INCLUDE,
    });
    await tx.orderStatusHistory.create({
      data: { orderId, changeType: OrderHistoryChangeType.STATUS, fromStatus, toStatus, changedBy },
    });
    return order;
  })) as OrderWithItems;

  if (options.evictProductStockCaches) {
    await this.evictProductCaches(updated.items);
  }
  return updated;
}
```

```ts
// cancelAndRestock — already a $transaction; `order.status` (read via the existing
// `findUniqueOrThrow`) IS the fromStatus, so no extra read is needed. Gains `changedBy` param
// and the history insert, inserted after the existing restock loop, alongside the order update:
async cancelAndRestock(orderId: string, changedBy: string | null): Promise<OrderWithItems> {
  const updated = (await this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDERS_INCLUDE });
    for (const item of order.items) { /* unchanged restock loop */ }
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        changeType: OrderHistoryChangeType.STATUS,
        fromStatus: order.status,
        toStatus: OrderStatus.CANCELLED,
        changedBy,
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, restockedAt: new Date() },
      include: ORDERS_INCLUDE,
    });
  })) as OrderWithItems;
  await this.evictProductCaches(updated.items);
  return updated;
}
```

```ts
// reviveAndReserve — same pattern: `order.status` from the existing `findUniqueOrThrow` is the
// fromStatus (e.g. CANCELLED); gains `changedBy` param + history insert alongside the reserve loop.
```

```ts
// updatePaymentStatus — converted from a bare `prisma.order.update` to a `$transaction` (this is
// the plan's one genuinely new "wrap in tx" case that has no pre-existing read to reuse — a
// lightweight `select: { paymentStatus: true }` read is added inside the tx for the fromValue).
async updatePaymentStatus(
  orderId: string,
  paymentStatus: PaymentStatus,
  changedBy: string | null,
): Promise<OrderWithItems> {
  return (await this.prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { paymentStatus: true },
    });
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus },
      include: ORDERS_INCLUDE,
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        changeType: OrderHistoryChangeType.PAYMENT_STATUS,
        fromPaymentStatus: existing.paymentStatus,
        toPaymentStatus: paymentStatus,
        changedBy,
      },
    });
    return updated;
  })) as OrderWithItems;
}
```

**Design Decision 4 — `updateStatus`'s `fromStatus` is passed in by the service, not re-read inside
the transaction.** The service already loads the order via `findById` to decide _which_ branch to
take (`isRevive` / `shouldAutoRestock` / plain transition) before calling the repository — exactly
the same "service computes, repository persists" split the existing `crossesPreShipmentBoundary`
flag already uses (computed in the service, merely consumed by the repository as an
`evictProductStockCaches` boolean). Re-reading `existing.status` a second time inside the
transaction would only protect against an exceedingly narrow window (another write landing between
the service's `findById` and this transaction starting) whose worst case is a mislabeled history
row — never a corrupted `Order.status` column, since the actual status transition is still
whatever the service decided and the repository writes. Accepted as consistent with the existing
pattern rather than adding an extra read for a cosmetic edge case.

#### `OrderRepository` — new read method

```ts
findHistoryByOrderId(orderId: string): Promise<OrderStatusHistoryRow[]> {
  return this.prisma.orderStatusHistory.findMany({
    where: { orderId },
    orderBy: { changedAt: 'asc' },
  });
}
```

#### `OrderService`

- `updateStatus(orderId: string, status: OrderStatus, changedBy: string | null): Promise<OrderEntity>`
  — gains the `changedBy` parameter; threads it into whichever branch fires
  (`reviveAndReserve(orderId, status, existing.paymentStatus, changedBy)` /
  `cancelAndRestock(orderId, changedBy)` /
  `updateStatus(orderId, existing.status, status, existing.paymentStatus, changedBy, { evictProductStockCaches })`).
  No other branching logic changes.
- `adminUpdatePaymentStatus(orderId: string, paymentStatus: PaymentStatus, changedBy: string | null): Promise<OrderEntity>`
  — threads `changedBy` into `orderRepository.updatePaymentStatus(orderId, paymentStatus, changedBy)`.
- `cancelOrder(userId: string, orderId: string): Promise<OrderEntity>` — unchanged signature;
  internally now calls `orderRepository.cancelAndRestock(orderId, userId)` (the customer is the
  actor for their own self-cancel).
- New `getOrderHistory(orderId: string): Promise<OrderStatusHistoryEntity[]>` — `findById` existence
  check (404 if missing/soft-deleted, mirrors `adminGetOrder`), then
  `orderRepository.findHistoryByOrderId(orderId)` mapped through
  `OrderStatusHistoryEntity.fromPrisma`.

#### `AdminOrderController`

- `updateStatus` and `updatePaymentStatus` handlers gain `@CurrentUser('id') adminUserId: string`
  and pass it as `changedBy` to the service (mirrors the `@CurrentUser('id') userId` pattern already
  used in `order.controller.ts`'s customer-facing handlers).
- New endpoint:

  ```
  GET /admin/orders/:orderId/history
  ```

  Returns `{ data: OrderStatusHistoryEntity[] }`, oldest-first, admin-only (class-level
  `AdminGuard`), `operationId: 'adminOrderControllerGetHistory'`. 404 when the order does not exist
  (reuses `OrderService.getOrderHistory`'s existence check).

#### New entity — `OrderStatusHistoryEntity` (`order/entities/order-status-history.entity.ts`)

```ts
export class OrderStatusHistoryEntity {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty({ enum: OrderHistoryChangeType })
  changeType!: OrderHistoryChangeType;
  @ApiProperty({ enum: OrderStatus, nullable: true, type: String })
  fromStatus!: OrderStatus | null;
  @ApiProperty({ enum: OrderStatus, nullable: true, type: String })
  toStatus!: OrderStatus | null;
  @ApiProperty({ enum: PaymentStatus, nullable: true, type: String })
  fromPaymentStatus!: PaymentStatus | null;
  @ApiProperty({ enum: PaymentStatus, nullable: true, type: String })
  toPaymentStatus!: PaymentStatus | null;
  @ApiProperty({ type: String, nullable: true }) changedBy!: string | null;
  @ApiProperty() changedAt!: Date;

  static fromPrisma(row: OrderStatusHistoryRow): OrderStatusHistoryEntity {
    /* straight field mapping */
  }
}
```

Exported from `order/entities/index.ts` alongside the existing `OrderEntity`/`OrderItemEntity`.

### Dashboard — ">48h in PENDING" needs-action counter

`dashboard.types.ts`:

```ts
export const PENDING_STALE_HOURS = 48;
```

`NeedsAction` interface + `NeedsActionDto` gain `pendingOver48h: number`.

`DashboardRepository.getNeedsAction()` gains a 5th parallel count, mirroring the existing
`unrealizedOrderWhere()` helper pattern:

```ts
private pendingOver48hWhere(): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.PENDING,
    deletedAt: null,
    createdAt: { lt: new Date(Date.now() - PENDING_STALE_HOURS * 60 * 60 * 1000) },
  };
}

async getNeedsAction(): Promise<NeedsAction> {
  const [newOrders, pendingReviews, unpaidInTransit, failedMails, pendingOver48h] = await Promise.all([
    this.prisma.order.count({ where: { status: OrderStatus.PENDING, deletedAt: null } }),
    this.prisma.review.count({ where: { isActive: false } }),
    this.prisma.order.count({ where: this.unrealizedOrderWhere() }),
    this.prisma.mailOutbox.count({ where: { status: MailOutboxStatus.FAILED } }),
    this.prisma.order.count({ where: this.pendingOver48hWhere() }),
  ]);
  return { newOrders, pendingReviews, unpaidInTransit, failedMails, pendingOver48h };
}
```

Note: `newOrders` (all PENDING) and `pendingOver48h` (PENDING older than 48h) are **not mutually
exclusive** — `pendingOver48h` is a subset of `newOrders`, deliberately (the widget already shows
"how many are new"; this adds "of those, how many have been waiting too long").

### Dashboard — processing-speed stat

New top-level `operations` slice on `DashboardSummary`/`DashboardSummaryResponse` (sibling to the
`customers` slice TASK-249 added), rather than folding it into the existing `orders` slice — it is a
distinct operational-efficiency signal, not an order count:

```ts
export interface OperationsMetrics {
  /** Avg hours from order creation to its first SHIPPED transition, for orders created in the
   *  last 30 days that have shipped at least once. 0 if none have shipped yet. */
  averageProcessingHoursLast30Days: number;
}
```

`DashboardRepository` — new private method, raw SQL (Prisma's `groupBy` cannot express a
per-order correlated subquery):

```ts
private async getAverageProcessingHours(since: Date): Promise<number> {
  const rows = await this.prisma.$queryRaw<{ avgHours: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (h.first_shipped_at - o.created_at)) / 3600.0)::float8 AS "avgHours"
    FROM orders o
    JOIN LATERAL (
      SELECT MIN(changed_at) AS first_shipped_at
      FROM order_status_history
      WHERE order_id = o.id AND change_type = 'STATUS' AND to_status = 'SHIPPED'
    ) h ON true
    WHERE h.first_shipped_at IS NOT NULL
      AND o.created_at >= ${since}
  `;
  return Number(rows[0]?.avgHours ?? 0);
}
```

Wired into `getSummary()`'s existing `Promise.all` (one more parallel entry, `windowStart(30)` as
`since`); assembled as `operations: { averageProcessingHoursLast30Days }`.

**Design Decision 5 — "first SHIPPED transition", not "first PENDING→SHIPPED"**. Using the order's
own `createdAt` as the start (rather than requiring a `toStatus: PENDING` history row) is more
robust: it works identically whether or not the initial-PENDING history row exists, and correctly
measures "time from placement to shipment" even for an order that was revived after an auto-cancel
(the clock still runs from the _original_ placement, which is what the owner actually wants to
know — "how long did this customer wait, total"). Taking the _first_ SHIPPED row (not the latest)
means a later revive-and-reship of an already-shipped-then-somehow-reverted order does not distort
the metric.

### API Contract changes

| Method | Path                                    | New/Changed                                                                         |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/admin/orders/:orderId/history`        | **New.** `{ data: OrderStatusHistoryEntity[] }`, oldest-first, admin-only.          |
| GET    | `/admin/dashboard/needs-action`         | `NeedsActionDto` gains `pendingOver48h: number`.                                    |
| GET    | `/admin/dashboard/summary`              | `DashboardSummaryResponse` gains `operations: OperationsMetricsDto`.                |
| PATCH  | `/admin/orders/:orderId/status`         | No request/response shape change — internal `changedBy` wiring is server-side only. |
| PATCH  | `/admin/orders/:orderId/payment-status` | No request/response shape change — same.                                            |

Orval regen required in `store-admin` (new `OrderStatusHistoryEntity`/`AdminOrderHistoryResponse`/
`OperationsMetricsDto` models, extended `NeedsActionDto`, new
`useAdminOrderControllerGetHistory` hook).

## Tasks

### TASK-251-A: Prisma schema — `OrderStatusHistory` model + relation

**Type:** chore
**Scope:** store-api
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `OrderHistoryChangeType` enum and `OrderStatusHistory` model added to `schema.prisma` exactly
      as specified in Technical Design (snake_case `@map`s throughout, matching the project's
      existing convention — see `orders`/`order_items` table names).
- [ ] `Order.statusHistory OrderStatusHistory[]` relation added.
- [ ] `npx prisma generate` run so `@prisma/client` types include the new model/enum (no migration
      SQL committed — migrations are gitignored in this repo; the actual `prisma migrate dev`/
      `db push` happens once on `develop` post-merge, see Migration & Regen Notes).
- [ ] `npm run typecheck -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — new enum + model + relation

---

### TASK-251-B: Repository — transactional history writes on every mutation path

**Type:** feat
**Scope:** store-api
**Complexity:** L (4-8h)
**TDD Required:** Yes — critical order-module transactional writes (RED→GREEN→REFACTOR); must not
regress the existing `createFromCart` stock-decrement guard, `cancelAndRestock`/`reviveAndReserve`
restock semantics, or the `crossesPreShipmentBoundary` cache-eviction flag (TASK-228/254 territory).
**Depends on:** TASK-251-A

**Acceptance Criteria (RED-first — write these against the current code so they fail, then make
them pass):**

- [ ] `createFromCart`: same transaction that creates the order also inserts one
      `OrderStatusHistory` row (`changeType: STATUS`, `fromStatus: null`, `toStatus: PENDING`,
      `changedBy: null`); asserted via the mocked `tx.orderStatusHistory.create` call in the unit
      spec.
- [ ] `updateStatus` (plain transition, not revive/restock): converted to `$transaction`; asserted
      that (a) the order update and the history insert happen inside the same mocked `tx`, (b) if
      the history insert's mock rejects, the order update's effect is not returned (transaction
      semantics honored — test via `prismaMock.$transaction` invoking the callback and letting a
      rejected `tx.orderStatusHistory.create` propagate).
- [ ] `cancelAndRestock`: existing restock-loop assertions (from `order.repository.spec.ts`) stay
      green unmodified; new assertion that the history insert receives `fromStatus: order.status`
      (the pre-cancel status) and `toStatus: CANCELLED`, in the same transaction as the restock
      loop and the terminal `order.update`.
- [ ] `reviveAndReserve`: existing reserve-loop / `ConflictException`-on-oversell assertions stay
      green unmodified; new assertion that the history insert receives `fromStatus: order.status`
      (e.g. `CANCELLED`) and `toStatus` = the revived status.
- [ ] `updatePaymentStatus`: converted to `$transaction`; asserted that the history insert receives
      `fromPaymentStatus` (read from the pre-update row) and `toPaymentStatus`, in the same
      transaction as the order update.
- [ ] New `findHistoryByOrderId(orderId)` method added (plain `findMany`, `orderBy: { changedAt:
    'asc' }`), unit-tested for the query shape.
- [ ] All five mutation methods gain a `changedBy: string | null` parameter (or, for `updateStatus`,
      `fromStatus` + `changedBy` — see Technical Design's exact signature) — no parameter is
      silently defaulted to `null` inside the repository; callers (the service, updated in
      TASK-251-C) always pass an explicit value.
- [ ] Existing `order.repository.spec.ts` test suite updated for the new signatures — every
      pre-existing assertion about stock decrement/restock/reserve/eviction behavior continues to
      pass conceptually unchanged.
- [ ] `npm run typecheck`/`lint` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- order.repository`.

**Files to create/modify:**

- `apps/store-api/src/order/order.repository.ts` — five methods updated/converted, new read method
- `apps/store-api/src/order/order.repository.spec.ts` — updated signatures + new RED-first cases
- `apps/store-api/src/order/order.types.ts` — new `OrderStatusHistoryRow` interface

---

### TASK-251-C: Service — thread `changedBy` through status/payment mutations

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes — this is the layer that decides _which_ repository branch fires
(`isRevive`/`shouldAutoRestock`/plain transition); a wiring mistake here would misattribute or drop
history rows on exactly the paths TASK-228/254 hardened.
**Depends on:** TASK-251-B

**Acceptance Criteria:**

- [ ] `OrderService.updateStatus(orderId, status, changedBy)` threads `changedBy` into whichever of
      `reviveAndReserve` / `cancelAndRestock` / `updateStatus` fires, per Technical Design. The
      existing `isRevive` / `shouldAutoRestock` / `crossesPreShipmentBoundary` decision logic is
      **not** reordered or altered — only the new parameter is added and forwarded.
- [ ] `OrderService.adminUpdatePaymentStatus(orderId, paymentStatus, changedBy)` threads
      `changedBy` into `orderRepository.updatePaymentStatus`.
- [ ] `OrderService.cancelOrder(userId, orderId)` — unchanged public signature; internally passes
      `userId` as `changedBy` to `cancelAndRestock`.
- [ ] `AdminOrderController.updateStatus`/`updatePaymentStatus` gain
      `@CurrentUser('id') adminUserId: string` and pass it as `changedBy`.
- [ ] Existing `order.service.spec.ts` unit tests updated for the new signatures; existing
      assertions about revive/restock/eviction branching stay green unmodified; new assertions
      confirm `changedBy` reaches the correct repository call for each of the three branches.
- [ ] `apps/store-api/test/order.e2e-spec.ts`: the existing `PATCH .../status` and
      `PATCH .../payment-status` admin e2e tests still pass with the controller's new
      `@CurrentUser` dependency (test JWT already carries a `sub` claim used elsewhere).
- [ ] `npm run typecheck`/`lint` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- order.service`,
      `npm run test:e2e -w apps/store-api -- order.e2e-spec` (run `--runInBand`, per the
      store-api-e2e-serial convention).

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts` — `changedBy` threading
- `apps/store-api/src/order/order.service.spec.ts` — updated signatures + new assertions
- `apps/store-api/src/order/admin-order.controller.ts` — `@CurrentUser('id')` on two handlers
- `apps/store-api/test/order.e2e-spec.ts` — sanity-check existing status/payment-status specs still
  pass

---

### TASK-251-D: Timeline read endpoint

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (read-only wiring around already-tested writes; covered by e2e per this
module's existing convention rather than a Red-Green unit cycle)
**Depends on:** TASK-251-B, TASK-251-C

**Acceptance Criteria:**

- [ ] New `OrderStatusHistoryEntity` (`order/entities/order-status-history.entity.ts`) with a
      `fromPrisma` mapper, exported from `order/entities/index.ts`.
- [ ] `OrderService.getOrderHistory(orderId)` — 404s via the same existence check pattern as
      `adminGetOrder` (order not found or soft-deleted), otherwise returns
      `orderRepository.findHistoryByOrderId(orderId)` mapped through
      `OrderStatusHistoryEntity.fromPrisma`, oldest-first.
- [ ] `AdminOrderController`: new `GET /admin/orders/:orderId/history` handler, admin-only (class
      `AdminGuard`), explicit `operationId: 'adminOrderControllerGetHistory'`, `@ApiParam`/
      `@ApiResponse`(200/404/403) decorators mirroring the existing `findById` handler; new
      `AdminOrderHistoryResponse` envelope class added to `@ApiExtraModels(...)`.
- [ ] e2e coverage in `order.e2e-spec.ts`: 200 with the seeded history rows in chronological order
      for an existing order; 404 for a non-existent order; 403 for a non-admin caller; 401 without a
      JWT (mirrors the existing `findById` e2e block's four cases).
- [ ] `npm run typecheck`/`lint`/`build` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- order`,
      `npm run test:e2e -w apps/store-api -- order.e2e-spec` (`--runInBand`).

**Files to create/modify:**

- `apps/store-api/src/order/entities/order-status-history.entity.ts` — new
- `apps/store-api/src/order/entities/index.ts` — export addition
- `apps/store-api/src/order/order.service.ts` — `getOrderHistory`
- `apps/store-api/src/order/admin-order.controller.ts` — new `GET :orderId/history` handler +
  `AdminOrderHistoryResponse` envelope
- `apps/store-api/test/order.e2e-spec.ts` — new `describe('GET /api/admin/orders/:orderId/history')`
  block

---

### TASK-251-E: Dashboard — ">48h in PENDING" needs-action counter

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (a single additional `Prisma.OrderWhereInput` count, same shape as the four
existing `getNeedsAction` counters) — the 48-hour boundary itself gets a dedicated int-spec
assertion rather than a formal Red-Green cycle, since there is no pure function to extract (it is a
direct Prisma count).
**Depends on:** TASK-251-A (schema only — does not depend on B/C; queries `Order` directly, not
`OrderStatusHistory`)

**Acceptance Criteria:**

- [ ] `dashboard.types.ts`: new `PENDING_STALE_HOURS = 48` constant; `NeedsAction` interface gains
      `pendingOver48h: number`.
- [ ] `dashboard-needs-action.dto.ts`: `NeedsActionDto` gains `pendingOver48h` with an explicit
      `@ApiProperty({ type: Number, description: ..., example: 1 })`.
- [ ] `DashboardRepository.getNeedsAction()`: new private `pendingOver48hWhere()` helper (mirrors
      `unrealizedOrderWhere()`); 5th parallel count added to the existing `Promise.all` (still one
      batch, no new N+1); returned object gains `pendingOver48h`.
- [ ] `dashboard.repository.int-spec.ts`: new case seeding one PENDING order with `createdAt` 49
      hours ago and one PENDING order with `createdAt` 47 hours ago (explicit `Prisma.order.create({
    data: { createdAt: <Date> } })`, same technique plan 120 used for its 90-day window case) —
      asserts `pendingOver48h === 1` (only the 49h-old order counts; the 47h-old one does not,
      pinning the exact boundary).
- [ ] `dashboard.e2e-spec.ts`: needs-action fixture/assertions extended with `pendingOver48h`.
- [ ] `npm run typecheck`/`lint`/`build` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test:e2e -w apps/store-api` (dashboard
      specs), `npm run test:int -w apps/store-api` (dashboard int-spec, DB up + migrated).

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.types.ts` — constant + interface field
- `apps/store-api/src/dashboard/dto/dashboard-needs-action.dto.ts` — new DTO field
- `apps/store-api/src/dashboard/dashboard.repository.ts` — new helper + wiring
- `apps/store-api/test/dashboard.e2e-spec.ts` — fixture + assertions
- `apps/store-api/test/dashboard.repository.int-spec.ts` — new boundary-pinning case

---

### TASK-251-F: Dashboard — processing-speed stat

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (a single raw-SQL aggregate, no pure function to extract) — correctness is
pinned by a fixture-based int-spec against real Postgres (the arithmetic itself, e.g. `AVG` over
`EXTRACT(EPOCH FROM ...)`, is exactly the kind of thing that is easy to get subtly wrong with mocked
Prisma, so a real-DB assertion is required, not optional).
**Depends on:** TASK-251-A (schema — reads `order_status_history` directly via raw SQL; does not
require TASK-251-B/C to be merged first since the int-spec seeds rows directly via
`prisma.orderStatusHistory.create`, but should land after B/C in the actual merge order so
production data starts accumulating real rows immediately)

**Acceptance Criteria:**

- [ ] `dashboard.types.ts`: new `OperationsMetrics { averageProcessingHoursLast30Days: number }`
      interface; `DashboardSummary` gains `operations: OperationsMetrics`.
- [ ] `DashboardRepository.getAverageProcessingHours(since)` implemented exactly as specified in
      Technical Design (LATERAL join on `order_status_history` filtered to `change_type = 'STATUS'
    AND to_status = 'SHIPPED'`, `MIN(changed_at)` per order, `AVG` of the hour delta from
      `orders.created_at`); wired into `getSummary()`'s `Promise.all` with `windowStart(30)`.
- [ ] Divide-by-zero / no-shipped-orders case returns `0`, not `null`/`NaN` (`Number(rows[0]?.avgHours
    ?? 0)`).
- [ ] `dto/dashboard-summary.dto.ts`: new `OperationsMetricsDto` class; `DashboardSummaryResponse`
      gains `operations: OperationsMetricsDto`.
- [ ] `dashboard.controller.ts`: `OperationsMetricsDto` added to `@ApiExtraModels(...)`.
- [ ] `dashboard.repository.int-spec.ts`: new case seeding (a) one order created 10 days ago with an
      `order_status_history` row `toStatus: SHIPPED` inserted 2 days after creation (48h), and (b)
      one order created 5 days ago with no SHIPPED history row at all — asserts
      `averageProcessingHoursLast30Days` reflects only order (a)'s 48-hour gap (order (b) is
      excluded from both the numerator and the denominator, not counted as `0` hours). A second
      all-orders-unshipped case asserts `0`.
- [ ] `dashboard.e2e-spec.ts`: summary fixture/assertions extended with the `operations` slice.
- [ ] `npm run typecheck`/`lint`/`build` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test:e2e -w apps/store-api` (dashboard
      specs), `npm run test:int -w apps/store-api` (dashboard int-spec, DB up + migrated).

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.types.ts` — new interface + `DashboardSummary` field
- `apps/store-api/src/dashboard/dashboard.repository.ts` — new private method + wiring
- `apps/store-api/src/dashboard/dto/dashboard-summary.dto.ts` — new DTO class + field
- `apps/store-api/src/dashboard/dashboard.controller.ts` — `@ApiExtraModels` addition
- `apps/store-api/test/dashboard.e2e-spec.ts` — fixture + assertions
- `apps/store-api/test/dashboard.repository.int-spec.ts` — new fixture-based case

---

### TASK-251-G: Frontend — order timeline widget

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** post-merge Orval regen (see Migration & Regen Notes) — the generated
`useAdminOrderControllerGetHistory` hook and `OrderStatusHistoryEntity` type must exist on
`develop` before this task starts.

**Acceptance Criteria:**

- [ ] New `entities/order/history-label.ts` (+ `.test.ts`, mirroring `is-pre-shipment-status.ts`'s
      table-driven-unit-test style):
  - `historyActorLabel(changedBy: string | null, orderUserId: string): string` — returns `"Клієнт"`
    when `changedBy === orderUserId`, `"Адміністратор"` when `changedBy` is any other truthy id,
    `"Система"` when `changedBy` is `null`.
  - `historyChangeLabel(entry: OrderStatusHistoryEntity): string` — for `changeType: 'STATUS'`
    entries, e.g. `"Статус: Очікує підтвердження → Підтверджено"` (reusing `orderStatusLabel`,
    treating a `null` `fromStatus` as the order's birth: `"Замовлення створено (Очікує
підтвердження)"`); for `changeType: 'PAYMENT_STATUS'` entries, e.g. `"Оплата: Очікує оплати →
Оплачено"` (reusing `paymentStatusLabel`).
  - Re-exported from `entities/order/index.ts`.
- [ ] New `widgets/order-detail/ui/order-timeline.tsx` — self-fetching via
      `useAdminOrderControllerGetHistory(orderId)` (same "independent of the parent order fetch"
      pattern as `NeedsActionWidget`); renders a vertical list, oldest-first, each row showing
      `historyChangeLabel(entry)`, `historyActorLabel(entry.changedBy, customerUserId)`, and
      `changedAt` formatted via the existing `dateFormatter`/`timeFormatter` pattern already in
      `order-detail-view.tsx`.
- [ ] `ui/order-timeline-skeleton.tsx` — small skeleton (mirrors `NeedsActionWidgetSkeleton`'s
      shape/complexity).
- [ ] Loading → skeleton; error → `dict.orders.timelineLoadError` alert paragraph; empty list (should
      not occur in practice since `createOrder` always seeds one row, but defensively handled) →
      `dict.orders.timelineEmpty`.
- [ ] `order-detail-view.tsx`: `<OrderTimeline orderId={order.id} customerUserId={order.userId} />`
      rendered as a new full-width section below the two-column grid (main-column items table +
      sidebar), under a `dict.orders.timelineHeading` heading.
- [ ] New `dict.orders` keys: `timelineHeading`, `timelineLoadError`, `timelineEmpty`.
- [ ] New `OrderTimeline.test.tsx` (MSW-mocked, following the `NeedsActionWidget.test.tsx` pattern):
      asserts entries render in order with the correct actor label for a customer-authored row, an
      admin-authored row, and a system (`null`) row; asserts the error and empty states.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- history-label`,
      `npm run test -w apps/store-admin -- OrderTimeline`, full
      `npm run test -w apps/store-admin` green (`--runInBand` if the full suite times out under
      parallel load, per the store-client-jest-parallel-flake note).

**Files to create/modify:**

- `apps/store-admin/src/entities/order/history-label.ts` — new
- `apps/store-admin/src/entities/order/history-label.test.ts` — new
- `apps/store-admin/src/entities/order/index.ts` — export additions (types + helpers + generated hook)
- `apps/store-admin/src/widgets/order-detail/ui/order-timeline.tsx` — new
- `apps/store-admin/src/widgets/order-detail/ui/order-timeline-skeleton.tsx` — new
- `apps/store-admin/src/widgets/order-detail/ui/order-timeline.test.tsx` — new
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — widget wiring
- `apps/store-admin/src/shared/config/dictionary.ts` — new `orders.timeline*` keys

---

### TASK-251-H: Frontend — ">48h in PENDING" needs-action card

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** post-merge Orval regen (extended `NeedsActionDto`)

**Acceptance Criteria:**

- [ ] `NeedsActionWidget.tsx`: 5th `NeedsActionCard` added — label
      `dict.dashboard.needsActionPendingOver48h`, count `counts.pendingOver48h`, deep-links to
      `/orders?status=PENDING` (same filtered view as the "new orders" card — no new query-param
      plumbing is introduced by this plan; the owner narrows further by eyeballing each order's age
      once inside the filtered list).
- [ ] Grid updated from `lg:grid-cols-4` to `lg:grid-cols-5` to fit the 5th card (mobile
      `grid-cols-2` unchanged — 5 cards wrap to a 3rd row with one card, consistent with the
      existing responsive convention).
- [ ] `nothingToDo` "all clear" check extended to include `counts.pendingOver48h === 0`.
- [ ] New `dict.dashboard.needsActionPendingOver48h` key (e.g. `"Довго в очікуванні (>48 год)"`).
- [ ] `NeedsActionWidget.test.tsx`: `mockNeedsAction` helper + all four existing test cases updated
      to include `pendingOver48h` in the fixture; new assertion(s) for the 5th card's label/count/
      href and its warning/muted tone.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- NeedsActionWidget`.

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-needs-action/ui/NeedsActionWidget.tsx` — 5th card + grid
- `apps/store-admin/src/widgets/dashboard-needs-action/ui/NeedsActionWidget.test.tsx` — fixture +
  assertions
- `apps/store-admin/src/shared/config/dictionary.ts` — new `dashboard.needsActionPendingOver48h` key

---

### TASK-251-I: Frontend — processing-speed stat card

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No (unit-tested formatter, same characterization as `formatPercent` in plan 120's
TASK-249-D — a plain presentational utility, not one of the four named critical modules)
**Depends on:** post-merge Orval regen (new `operations` field on `DashboardSummaryResponse`)

**Acceptance Criteria:**

- [ ] New `shared/lib/format/formatDurationHours.ts` (mirrors `formatPercent.ts`'s structure/doc
      comment style): input is a plain number of hours; `< 24` → `"{n} год"` (rounded to the nearest
      whole hour); `>= 24` → `"{days} дн {hours} год"`. `0` → `"0 год"`.
- [ ] Unit test (`formatDurationHours.test.ts`): `0` → `"0 год"`; `36` → `"36 год"`; `50` → `"2 дн 2
    год"`; a non-finite input falls back to a defensive `String(value)`, mirroring
      `formatPercent`'s fallback.
- [ ] Exported from `shared/lib/format/index.ts`.
- [ ] `AdminDashboardStats.tsx`: new `StatCard` — label `dict.dashboard.averageProcessingTime`,
      value `formatDurationHours(summary.operations.averageProcessingHoursLast30Days)`, subText
      `dict.dashboard.averageProcessingTimeSub`, `tooltip={dict.dashboard.averageProcessingTimeTooltip}`,
      `tone="default"`; placed after the two repeat-buyer cards (operational-efficiency signal,
      grouped with the other "recent behavior" cards).
- [ ] `entities/dashboard/index.ts`: re-export the new generated `OperationsMetricsDto` type.
- [ ] New `dict.dashboard` keys: `averageProcessingTime`, `averageProcessingTimeSub`,
      `averageProcessingTimeTooltip`.
- [ ] `AdminDashboardStats.test.tsx`: fixture updated to include `operations`; new assertion that the
      new card renders its formatted value; existing assertions stay green unmodified.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- formatDurationHours`,
      `npm run test -w apps/store-admin -- AdminDashboardStats`.

**Files to create/modify:**

- `apps/store-admin/src/shared/lib/format/formatDurationHours.ts` — new
- `apps/store-admin/src/shared/lib/format/formatDurationHours.test.ts` — new
- `apps/store-admin/src/shared/lib/format/index.ts` — export addition
- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx` — new card
- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.test.tsx` — fixture + assertion
- `apps/store-admin/src/entities/dashboard/index.ts` — new type re-export
- `apps/store-admin/src/shared/config/dictionary.ts` — new `dashboard.averageProcessingTime*` keys

## Migration Steps

1. TASK-251-A (schema) — first, no dependencies.
2. TASK-251-B (repository transactional writes, RED→GREEN→REFACTOR) — depends on A.
3. TASK-251-C (service `changedBy` threading + controller wiring) — depends on B.
4. TASK-251-D (timeline read endpoint) — depends on B, C.
5. TASK-251-E (>48h needs-action counter) — depends on A only; parallel-safe with B/C/D.
6. TASK-251-F (processing-speed stat) — depends on A; best merged after B/C so real history rows
   start accumulating, but not a hard technical dependency (its int-spec seeds directly).
7. **Post-merge on `develop` (not a numbered task in this plan):**
   - Run `npx prisma migrate dev` (or `db push` for the dev/`store_test` DBs) to create the actual
     migration for `OrderStatusHistory`/`OrderHistoryChangeType` — per this repo's
     migrations-gitignored convention, `schema.prisma` is the only source of truth committed by the
     build agent; the migration folder itself (naming convention:
     `<timestamp>_order_status_history`, following the existing `20260704144646_order_restocked_at`
     pattern) is generated once against the real dev/test databases after A–F merge to `develop`.
   - Run the Orval regen for the `orders` and `dashboard` tags in `store-admin`
     (`npm run generate:api` or the project's equivalent script) so
     `useAdminOrderControllerGetHistory`, `OrderStatusHistoryEntity`, `AdminOrderHistoryResponse`,
     the extended `NeedsActionDto`, and `OperationsMetricsDto` all become available to the frontend.
8. TASK-251-G, TASK-251-H, TASK-251-I (frontend) — start only after step 7's regen has landed on
   `develop`; parallel-safe with each other (touch disjoint widget files, only the shared
   `dictionary.ts` file is a soft merge-conflict risk across the three).

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                                                                       | Mitigation                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Converting `updateStatus`/`updatePaymentStatus` from a bare `prisma.order.update` to a `$transaction` changes error semantics (a Prisma error inside the tx now rolls back everything, vs. previously being the only write)                                                                                | This is actually the _intended_ fix — the history row and the status update must commit or roll back together; TASK-251-B's RED-first tests explicitly assert atomicity via the mocked `tx` callback       |
| A missed call site continues calling the old (bare, non-history-writing) signature after the refactor, silently producing orders with gaps in their timeline                                                                                                                                               | TypeScript's compiler enforces every call site is updated (`changedBy`/`fromStatus` become required parameters, not optional) — a missed call site is a compile error, not a silent runtime gap            |
| The processing-speed raw-SQL `LATERAL` join has a subtle date-arithmetic bug (timezone, `EXTRACT(EPOCH ...)` unit mistake) that would silently misreport hours                                                                                                                                             | Fixture-based int-spec (TASK-251-F) asserts an exact expected value against real Postgres with hand-constructed `createdAt`/`changed_at` timestamps — not just "is a number"                               |
| `changedBy` resolution on the frontend (`historyActorLabel`) could misclassify an admin-initiated cancel of _the admin's own test customer account_ as "Клієнт" if the admin happens to share a user id with the order owner (impossible in practice — admin and customer are always distinct `User` rows) | Documented as a non-issue: `changedBy === orderUserId` can only be true when the actor genuinely _is_ the order's owner (customer self-cancel), since admin and customer accounts are always distinct rows |
| Frontend tasks (G/H/I) start before the post-merge Orval regen lands, causing typecheck failures against not-yet-generated types                                                                                                                                                                           | Each frontend task's "Depends on" explicitly gates on the post-merge regen (Migration Steps step 7), not on the backend PR alone                                                                           |
| Adding a 5th `NeedsActionCard` and a new dashboard `StatCard` in the same wave as other Хвиля-4 work (TASK-252) could collide in `dictionary.ts`                                                                                                                                                           | Both this plan's frontend tasks and TASK-252 append new, disjoint dict keys — a standard append-only merge, no key renames                                                                                 |

## Notes

- This plan absorbs plan 100's (`docs/plans/100-admin-crm-dashboard-checklist.md`) explicit
  recommendation (§2, §4.1, §6): "`OrderStatusHistory (orderId, fromStatus, toStatus, changedAt,
changedBy)`" as the schema, extended here with a `changeType` discriminator and a payment-status
  column pair so the same table also covers the "written on every ... paymentStatus change" half
  of the BACKLOG requirement that plan 100's original sketch (order-status only) did not yet
  specify.
- Deliberately does **not** introduce a formal order-status state machine — `PRE_SHIPMENT_STATUSES`
  remains the single source of truth for "which statuses hold stock," exactly as documented in
  `order.constants.ts` today. `OrderStatusHistory` is a passive audit log of whatever transitions
  the existing (state-machine-free) logic decides to make, not a new set of transition rules.
- A future Stripe/payment-webhook handler (TASK-034, parked) should call
  `orderService.updateStatus`/`adminUpdatePaymentStatus` with `changedBy: null` (system-authored),
  reusing the exact convention this plan establishes for `createOrder`'s initial row — no design
  change needed when that task is eventually picked up.
- `historyActorLabel`'s three-way disambiguation (customer / admin / system) deliberately avoids
  resolving `changedBy` to an admin's email/name — plan 100 §1 explicitly frames this as a
  single-admin store, so "an admin did this" is all the timeline needs to communicate; a
  multi-admin future would need a real `User` join, at which point `historyActorLabel` gets a
  fourth `adminName` parameter, not a schema change (the `changedBy` column already stores the
  correct id for that join).
