# Plan: Order Status — Stock Model Clarification + Admin Cancel Restock & Cache Eviction

> **Status:** Implemented — pending manual QA (matrix in `docs/manual-qa-master.md` §C2-a)
> **Phase:** Phase A — Stabilize & Close Out (QA pass triage — bugs)
> **Created:** 2026-06-25
> **Last Updated:** 2026-06-25
> **TASK:** TASK-124

---

## Resolution (implemented) — policy refined by product owner

The owner confirmed Part 1 (stock decrements at creation; CONFIRMED is correctly a no-op)
and **narrowed the auto-restock rule** vs. this plan's original recommendation:

> **Auto-restock ONLY before shipment.** Returning reserved stock to inventory is automatic
> only when an order is cancelled from a pre-shipment state (PENDING / CONFIRMED / PROCESSING
> → CANCELLED) — the goods are still in the warehouse. **Post-shipment** cancels
> (SHIPPED / DELIVERED → CANCELLED) and **all REFUNDED** transitions are **manual** restock:
> the admin re-adds stock via product edit once the physical return is received and inspected.

This supersedes the plan's earlier "auto-restock on any CANCELLED and any REFUNDED" and the
proposed new `cancelWithRestock` repo method.

**Stock × status matrix (final):**

| From → To                                          | Stock effect                                 |
| -------------------------------------------------- | -------------------------------------------- |
| PENDING/CONFIRMED/PROCESSING → CANCELLED           | **AUTO restock** (reuse `cancelAndRestock`)  |
| SHIPPED → CANCELLED                                | no auto change — **manual**                  |
| DELIVERED → CANCELLED / REFUNDED                   | no auto change — **manual** (inspect return) |
| any → REFUNDED                                     | no auto change — **manual**                  |
| forward (→ CONFIRMED/PROCESSING/SHIPPED/DELIVERED) | no change (decrement happened at creation)   |
| already-CANCELLED → CANCELLED                      | no change (no double credit)                 |

**Implementation (no new repo method — reuse + a service guard):**

- `order.service.ts`: added pure `shouldAutoRestock(currentStatus, targetStatus)` =
  `target === CANCELLED && currentStatus ∈ {PENDING, CONFIRMED, PROCESSING}` (set
  `PRE_SHIPMENT_STATUSES`). `OrderService.updateStatus` branches: if it returns true →
  `orderRepository.cancelAndRestock(orderId)` (existing, tested: increments variant stock,
  sets CANCELLED, evicts product list + detail caches — all transactional); else the
  TASK-123 `derivePaymentStatus` + `orderRepository.updateStatus(id, status, paymentStatus)`
  path. The guard's `currentStatus` check makes it idempotent (already-cancelled ⇒ no restock).
- **No** new repository method, **no** Prisma migration, **no** Orval/Swagger change, **no**
  frontend change. `cancelAndRestock` left CANCELLED's paymentStatus untouched in the DB,
  which matches the TASK-123 "CANCELLED keeps current paymentStatus" rule.
- Tests: new `describe('updateStatus — stock restock on cancel')` block in
  `order.service.spec.ts` — 3 auto-restock cases (PENDING/CONFIRMED/PROCESSING→CANCELLED),
  paid-cancel payment-preserved, SHIPPED/DELIVERED no-restock, DELIVERED→REFUNDED no-restock,
  no-double-credit, forward no-restock, 404. The two TASK-123 CANCELLED coupling tests were
  removed (those transitions now route through `cancelAndRestock`, not `updateStatus`).
- Manual QA matrix written to `docs/manual-qa-master.md` §C2-a (+ cross-ref in §B4) and the
  original QA note resolved.
- Gates: `npm run test -w apps/store-api` 388/388 pass, lint clean, typecheck clean.

> **Note:** the detailed design sections below predate this refinement (they describe the
> broader `cancelWithRestock` approach). They are kept for context; the matrix and
> implementation notes above are authoritative.

---

## Overview

This plan addresses two related concerns raised by the QA note ("зміна статусу замовлення на
CONFIRMED не змінює число стоку — в магазині на сайті показує таке ж число"):

**Part 1 — Expected behavior (QA symptom is working-as-intended):** Stock is reserved and
decremented at order _creation_ (PENDING), not at confirmation. The storefront showing the same
stock count after PENDING→CONFIRMED is correct; the stock was already taken when the order was
placed. This part requires only documentation and a clarifying comment — no code change.

**Part 2 — Latent real bug (the genuine defect):** When an admin cancels an order (status
→CANCELLED) via the `PATCH /api/admin/orders/:orderId/status` endpoint, the reserved stock is
_never returned to inventory_ and product caches are _never evicted_. The customer-cancel path
(`OrderService.cancelOrder`) correctly calls `cancelAndRestock`, but that path is guarded to
PENDING-only and is unreachable for admin-driven cancels on CONFIRMED/PROCESSING orders. The
admin status PATCH path currently calls only `OrderRepository.updateStatus`, which writes status
and paymentStatus (TASK-123) but performs no stock increment and no cache eviction.

The result: a CONFIRMED or PROCESSING order cancelled by an admin permanently erodes variant
stock, and the storefront stock display never recovers (beyond the 5-minute cache TTL for the
display staleness — but the underlying inventory number stays wrong forever).

---

## Scope

### In Scope

- Document and confirm the stock-at-creation model (Part 1); add a clarifying code comment
- Add a `restockAndEvict` repository method (or extend the service branch) so admin-driven
  CANCELLED (and REFUNDED) transitions from a stock-holding state atomically increment variant
  stock and evict product caches
- Cover the fix with TDD unit specs in both `order.service.spec.ts` and
  `order.repository.spec.ts` (Red → Green → Refactor)
- Manual QA checklist

### Out of Scope

- Prisma schema / migrations — no new columns or enums needed (confirmed)
- Orval / Swagger — the response shape is unchanged; no regeneration needed
- Frontend code changes — the storefront reflects corrected stock after cache eviction;
  the store-admin needs no changes
- Real payment webhook (TASK-034 / Stripe) — the restock logic is orthogonal to payment
- Adding REFUNDED to the store-admin transitions dropdown — that is a separate UX decision;
  the backend restock rule is implemented for REFUNDED defensively so any future path
  (webhook, manual API call) is correct without further backend work

---

## User Stories

1. As a store admin, when I cancel a confirmed or processing order, I want the reserved stock
   returned to inventory automatically so that the storefront shows accurate availability.
2. As a customer, when I view a product page after an order is cancelled by the admin, I want
   to see the restocked quantity so I can place a new order without confusion.

---

## Stock / Cache Lifecycle — All Order Paths

| Path                                                                | Stock change                                                     | Cache eviction                                 | Notes                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `createFromCart` (order created, PENDING)                           | Decrement each variant line (oversell-safe `WHERE stock >= qty`) | Yes — list prefix + detail slug/id per product | Source of truth for reservation                                                             |
| `cancelOrder` customer path (PENDING only) → `cancelAndRestock`     | Increment each variant line                                      | Yes                                            | Symmetric to creation; guarded to PENDING                                                   |
| `updateStatus` admin PATCH → CONFIRMED/PROCESSING/SHIPPED/DELIVERED | **None** (correct)                                               | **None** (correct)                             | Stock unchanged; nothing to evict                                                           |
| `updateStatus` admin PATCH → CANCELLED (current, broken)            | **None** (BUG — stock stays decremented)                         | **None** (BUG — cache not evicted)             | Fix: add restock + evict when transitioning INTO CANCELLED from a stock-holding state       |
| `updateStatus` admin PATCH → REFUNDED (current, broken)             | **None** (BUG — same gap)                                        | **None** (BUG)                                 | Fix: same restock + evict rule; not yet reachable from dropdown but backend must be correct |
| `markPaid` / `confirmPayment` (PENDING→CONFIRMED+PAID)              | **None** (correct)                                               | **None** (correct)                             | Stock was already reserved at creation                                                      |
| `updatePaymentStatus` (future Stripe webhook)                       | **None** (correct — separate concern)                            | **None**                                       | Handles payment column only                                                                 |

The 5-minute default cache TTL (`DEFAULT_CACHE_TTL_SECONDS = 300` in `product.service.ts`)
means display staleness self-heals eventually, but the underlying inventory number stays
permanently incorrect without the restock increment. Cache eviction is a secondary concern;
inventory accuracy is the primary one.

---

## Design Decisions

### Decision 1 — Confirm the stock model

Stock is reserved (decremented) atomically at **order creation** inside `createFromCart`'s
`$transaction`. No subsequent status transition (CONFIRMED, PROCESSING, SHIPPED, DELIVERED)
changes stock. This is intentional and correct: the stock belongs to the order from the
moment it is placed. The QA-reported symptom ("CONFIRMED does not change stock") is
therefore **expected behavior**, not a bug.

Action: add a brief comment in `OrderService.updateStatus` noting that non-cancel, non-refund
status transitions are deliberately stock-neutral. No test change needed for this part.

### Decision 2 — Restock on admin CANCELLED and REFUNDED

Recommendation: **Yes** — when the admin status PATCH transitions an order INTO CANCELLED or
REFUNDED, and that order currently holds a stock decrement (i.e., its status is not already
CANCELLED or REFUNDED), the service must restock and evict caches.

Rationale: CANCELLED and REFUNDED are the only terminal statuses where the reserved inventory
should be released back to the pool. DELIVERED does not release stock (goods are gone).
REFUNDED (future webhook) is semantically identical to CANCELLED for inventory purposes — the
goods were returned or the order was voided. Both must restock and evict.

### Decision 3 — Idempotency / double-restock guard

The guard is: **restock only when the current status is a stock-holding status** (one of
PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED — i.e., any non-terminal status).

Definition of "stock-holding statuses": `[PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED]`.

If the order is already CANCELLED or REFUNDED, it has already been restocked (or was
created in a state that never held stock — unlikely but possible if the admin manually
creates an order in a terminal state). A second PATCH to CANCELLED on an already-CANCELLED
order must not increment stock again.

This guard is cheap (a Set membership check in the service) and makes repeated PATCHes
safe. The repository's restock write (`increment`) is also naturally idempotent when the
guard prevents re-entry.

```
STOCK_HOLDING_STATUSES = new Set([
  PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED
])

if (targetStatus is CANCELLED or REFUNDED)
  and (existing.status is in STOCK_HOLDING_STATUSES):
    call repo.cancelAndRestockWithStatus(orderId, targetStatus)
  else:
    call repo.updateStatus(orderId, targetStatus, paymentStatus)
```

### Decision 4 — Where the logic lives (layer placement)

The branching rule ("should I restock?") lives in **`OrderService.updateStatus`** (service
layer). This is where business logic belongs per Clean Architecture. The repository only
executes what the service decides.

For the restock path, we introduce a new repository method:

```
OrderRepository.cancelWithRestock(orderId, targetStatus, paymentStatus)
```

This method does in a single `$transaction`:

1. Re-fetch the order's items (needed for the stock increment loop)
2. Increment `productVariant.stock` for each variant line
3. Write `order.status = targetStatus` and `order.paymentStatus = paymentStatus`
4. Return the updated order

After the transaction, evict product caches (same `evictProductCaches` private method already
used by `createFromCart` and `cancelAndRestock`).

Naming `cancelWithRestock` rather than overloading `cancelAndRestock` keeps the existing
customer-cancel path (which only reaches CANCELLED) untouched, avoids a signature change
to a tested method, and makes the admin path's intent explicit.

### Decision 5 — Cache eviction on plain forward transitions

For status changes that do NOT mutate stock (CONFIRMED, PROCESSING, SHIPPED, DELIVERED):
**no cache eviction**. Stock is unchanged, so there is nothing stale to evict. Over-eviction
would cause unnecessary cache misses and Redis churn. Eviction must strictly follow actual
stock mutations.

### Decision 6 — REFUNDED: backend handles it; dropdown does not expose it yet

The backend restock rule covers REFUNDED (same logic as CANCELLED). The store-admin
`ORDER_STATUS_TRANSITIONS` map currently has no outbound edges from any status to REFUNDED
(the dropdown cannot reach it). This is left as-is — adding REFUNDED to the dropdown is a
separate UX decision for a future task. The backend being correct now means that future
webhook integration (TASK-034) or a manual API call will restock correctly without
additional backend work.

### Decision 7 — No Prisma migration; no Orval regeneration

No new schema columns or enums are needed. The `OrderStatus.CANCELLED` and
`OrderStatus.REFUNDED` values already exist. The response shape (`OrderEntity`) is unchanged.
No Orval regeneration is required.

### Decision 8 — Consistency with TASK-123

`cancelWithRestock` writes `status` and `paymentStatus` together (same as the updated
`updateStatus` from TASK-123) to keep both columns atomically consistent. The service
computes `paymentStatus` via the existing `derivePaymentStatus` helper before deciding which
repository branch to call — that helper is already correct for CANCELLED and REFUNDED.

---

## Technical Design

### Data Model

No changes. The `Order`, `OrderItem`, and `ProductVariant` models already have all required
fields. No Prisma migration is needed.

### Backend

#### OrderRepository — new method `cancelWithRestock`

```typescript
/**
 * Cancel (or refund) an order and atomically return reserved stock to inventory.
 * Used by the admin status PATCH path when the target status is CANCELLED or REFUNDED
 * and the order currently holds a stock decrement. Mirrors cancelAndRestock but
 * accepts a parameterised target status (CANCELLED or REFUNDED) and the derived
 * paymentStatus to write both columns consistently with the TASK-123 coupling.
 */
async cancelWithRestock(
  orderId: string,
  targetStatus: OrderStatus,   // CANCELLED | REFUNDED
  paymentStatus: PaymentStatus,
): Promise<OrderWithItems>
```

Transaction body:

1. `tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDERS_INCLUDE })`
2. For each item: if `item.variantId` → `tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } })`
3. `tx.order.update({ where: { id: orderId }, data: { status: targetStatus, paymentStatus }, include: ORDERS_INCLUDE })`

After transaction: `await this.evictProductCaches(updated.items)`.

#### OrderService.updateStatus — branching rule

```typescript
async updateStatus(orderId: string, status: OrderStatus): Promise<OrderEntity> {
  const existing = await this.orderRepository.findById(orderId);
  if (!existing) throw new NotFoundException('Order not found');

  const paymentStatus = derivePaymentStatus(status, existing.paymentStatus);

  const STOCK_HOLDING_STATUSES: ReadonlySet<OrderStatus> = new Set([
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
  ]);

  const isRestockTransition =
    (status === OrderStatus.CANCELLED || status === OrderStatus.REFUNDED) &&
    STOCK_HOLDING_STATUSES.has(existing.status);

  const order = isRestockTransition
    ? await this.orderRepository.cancelWithRestock(orderId, status, paymentStatus)
    : await this.orderRepository.updateStatus(orderId, status, paymentStatus);

  return OrderEntity.fromPrisma(order);
}
```

`STOCK_HOLDING_STATUSES` can be a module-level constant to avoid re-construction on every call.

#### AdminOrderController

No change. The controller calls `orderService.updateStatus(orderId, dto.status)` — the
branching logic is entirely inside the service.

### API Contract

No change to request or response shapes. No Swagger annotation change. No Orval regeneration.

### Frontend

No changes to `store-client` or `store-admin`. The storefront reflects corrected stock
after cache eviction. The store-admin order detail view already invalidates its queries
on status change (confirmed in TASK-123 planning).

---

## Tasks

### TASK-124-A: Document and confirm the stock-at-creation model

**Type:** docs
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] A comment is added to `OrderService.updateStatus` (near the `derivePaymentStatus` call)
      explicitly stating that non-cancel, non-refund status transitions are
      deliberately stock-neutral — stock was reserved at creation and is only
      released on CANCELLED or REFUNDED
- [ ] The BACKLOG.md "Pending manual QA" entry for TASK-124 notes that the
      CONFIRMED-does-not-change-stock QA symptom is expected behavior (confirmed in this plan)
- [ ] No code logic is changed in this sub-task

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts` — add clarifying comment in `updateStatus`

---

### TASK-124-B: Write failing unit tests for admin-cancel restock (TDD — Red)

**Type:** test
**Scope:** store-api
**Complexity:** M (2–3h)
**TDD Required:** Yes (Red step — write tests before any implementation)
**Depends on:** TASK-124-A

**Acceptance Criteria:**

- [ ] New `describe('updateStatus — admin cancel/refund restock')` block added to
      `order.service.spec.ts` covering all cases listed in the unit spec table below
- [ ] New `describe('cancelWithRestock')` block added to `order.repository.spec.ts`
      covering transaction behavior and cache eviction
- [ ] All new service tests FAIL (Red) before implementation — confirmed by running
      `npm run test -w apps/store-api -- --testPathPattern=order.service`
- [ ] All new repository tests FAIL (Red) before implementation — confirmed by running
      `npm run test -w apps/store-api -- --testPathPattern=order.repository`
- [ ] All existing tests continue to pass (the new mock method `cancelWithRestock`
      must be added to `orderRepositoryMock` stub in `order.service.spec.ts`)

**Unit specs — `order.service.spec.ts` (new describe block):**

| #   | Description                                                                                       | Setup                                                                     | Expected                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| S1  | Admin cancels a PENDING order → `cancelWithRestock` called                                        | `existing.status = PENDING`                                               | `cancelWithRestock('order-uuid-1', CANCELLED, PENDING)` called; `updateStatus` NOT called                   |
| S2  | Admin cancels a CONFIRMED+PAID order → `cancelWithRestock` called                                 | `existing.status = CONFIRMED`, `paymentStatus = PAID`                     | `cancelWithRestock('order-uuid-1', CANCELLED, PAID)` called; `updateStatus` NOT called                      |
| S3  | Admin cancels a PROCESSING order → `cancelWithRestock` called                                     | `existing.status = PROCESSING`                                            | `cancelWithRestock` called; `updateStatus` NOT called                                                       |
| S4  | Admin moves DELIVERED order to REFUNDED → `cancelWithRestock` called                              | `existing.status = DELIVERED`, `paymentStatus = PAID`                     | `cancelWithRestock('order-uuid-1', REFUNDED, REFUNDED)` called (derives REFUNDED via `derivePaymentStatus`) |
| S5  | Admin PATCHES an already-CANCELLED order to CANCELLED → `updateStatus` called (no double-restock) | `existing.status = CANCELLED`                                             | `updateStatus` called (not `cancelWithRestock`); stock NOT incremented again                                |
| S6  | Admin PATCHES an already-REFUNDED order to REFUNDED → `updateStatus` called (no double-restock)   | `existing.status = REFUNDED`                                              | `updateStatus` called (not `cancelWithRestock`)                                                             |
| S7  | Confirming PENDING → CONFIRMED → `updateStatus` called (no restock, correct)                      | `existing.status = PENDING`                                               | `updateStatus` called; `cancelWithRestock` NOT called                                                       |
| S8  | Advancing CONFIRMED → PROCESSING → `updateStatus` called (no restock)                             | `existing.status = CONFIRMED`                                             | `updateStatus` called; `cancelWithRestock` NOT called                                                       |
| S9  | `cancelWithRestock` returns correct OrderEntity                                                   | `cancelWithRestock` mock resolves with `makeOrder({ status: CANCELLED })` | result is `OrderEntity` with `status = CANCELLED`                                                           |
| S10 | NotFoundException when order not found (unchanged from before)                                    | `findById` returns null                                                   | throws `NotFoundException`; neither repo method called                                                      |

**Unit specs — `order.repository.spec.ts` (new describe block):**

| #   | Description                                                                                       | Expected                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `cancelWithRestock(CANCELLED)` increments stock for variant lines and sets status + paymentStatus | `tx.productVariant.update` called once with `{ increment: qty }`; `tx.order.update` called with `{ status: CANCELLED, paymentStatus: PENDING }` |
| R2  | `cancelWithRestock(REFUNDED)` increments stock and sets status=REFUNDED + paymentStatus=REFUNDED  | Same pattern with REFUNDED values                                                                                                               |
| R3  | `cancelWithRestock` skips non-variant (variantId=null) lines                                      | `tx.productVariant.update` called only for variant lines                                                                                        |
| R4  | `cancelWithRestock` evicts list prefix + per-product detail caches after commit                   | `cacheMock.delByPrefix(PRODUCT_LIST_PREFIX)` + `cacheMock.del(slug)` + `cacheMock.del(id)` called                                               |

**Files to create/modify:**

- `apps/store-api/src/order/order.service.spec.ts` — add `cancelWithRestock: jest.fn()` to
  `orderRepositoryMock`; add new `describe('updateStatus — admin cancel/refund restock')` block
- `apps/store-api/src/order/order.repository.spec.ts` — add new `describe('cancelWithRestock')`
  block with R1–R4

---

### TASK-124-C: Implement restock + evict on admin cancel/refund (TDD — Green + Refactor)

**Type:** fix
**Scope:** store-api
**Complexity:** M (2–3h)
**TDD Required:** Yes (Green step — minimum code to pass TASK-124-B tests)
**Depends on:** TASK-124-B

**Acceptance Criteria:**

- [ ] `OrderRepository.cancelWithRestock(orderId, targetStatus, paymentStatus)` added:
      single `$transaction` that increments variant stock for all order items, then
      writes `{ status: targetStatus, paymentStatus }` on the order; followed by
      `evictProductCaches(updated.items)` after the transaction
- [ ] `STOCK_HOLDING_STATUSES` module-level constant defined in `order.service.ts`
      containing `[PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED]`
- [ ] `OrderService.updateStatus` branches: if `targetStatus` is CANCELLED or REFUNDED
      AND `existing.status` is in `STOCK_HOLDING_STATUSES`, call `cancelWithRestock`;
      otherwise call `updateStatus`
- [ ] The `derivePaymentStatus` helper call happens before the branch so both repo
      methods receive the correctly derived `paymentStatus`
- [ ] All TASK-124-B tests pass (Green)
- [ ] All previously passing tests remain green
- [ ] `npm run test -w apps/store-api` — all tests pass
- [ ] `npm run lint -w apps/store-api` — clean
- [ ] `npm run typecheck` — clean (all three workspaces)
- [ ] No Prisma migration
- [ ] No Orval regeneration

**Files to create/modify:**

- `apps/store-api/src/order/order.repository.ts` — add `cancelWithRestock` method; reuse
  `evictProductCaches` private method (already exists)
- `apps/store-api/src/order/order.service.ts` — add `STOCK_HOLDING_STATUSES` constant;
  add branch in `updateStatus`; add clarifying comment (completes TASK-124-A)

---

### TASK-124-D: Manual QA

**Type:** test
**Scope:** store-api + store-client (running stack)
**Complexity:** S (30–45 min)
**TDD Required:** No
**Depends on:** TASK-124-C

**Acceptance Criteria:**

- [ ] Manual QA checklist below completed on a running stack
- [ ] No regression in existing order workflows

**Files to create/modify:**

- None (verification only)

---

## Affected Files

| File                                                | Change                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/store-api/src/order/order.repository.ts`      | Add `cancelWithRestock(orderId, targetStatus, paymentStatus)` method                                                             |
| `apps/store-api/src/order/order.service.ts`         | Add `STOCK_HOLDING_STATUSES` constant; branch `updateStatus` to call `cancelWithRestock` when restocking; add clarifying comment |
| `apps/store-api/src/order/order.service.spec.ts`    | Add `cancelWithRestock` to mock; add new describe block (S1–S10)                                                                 |
| `apps/store-api/src/order/order.repository.spec.ts` | Add new `describe('cancelWithRestock')` block (R1–R4)                                                                            |

Files confirmed unchanged:

- `apps/store-api/src/order/admin-order.controller.ts` — no change; controller calls `updateStatus` as before
- `apps/store-api/src/order/order.controller.ts` — customer cancel path (`cancelOrder` → `cancelAndRestock`) untouched
- `apps/store-api/src/order/order.repository.ts` — `cancelAndRestock` method untouched (customer path)
- `apps/store-admin/src/features/order-status-update/**` — no changes; transitions map unchanged
- `apps/store-client/**` — no changes; storefront reflects corrected stock after eviction
- Prisma schema — no changes
- Orval generated files — no regeneration needed

---

## Migration Steps

1. No Prisma migration needed.
2. **TASK-124-A** — Add clarifying comment to `order.service.ts` (documentation, no logic).
3. **TASK-124-B** — Write all failing unit tests first (TDD Red). Confirm new tests fail.
4. **TASK-124-C** — Implement `cancelWithRestock` + service branch. Confirm all tests green.
   Run lint + typecheck.
5. **TASK-124-D** — Manual QA on a running stack using the checklist below.

---

## Manual QA Checklist

To be executed on a running stack (API + store-client + store-admin) after TASK-124-C merges.

### Scenario A — Place order; stock drops at creation (expected behavior confirmed)

1. Note the variant stock for a product in the storefront (e.g., product detail page shows "50 in stock").
2. Place an order for 2 units of that variant via the storefront checkout.
3. Verify immediately after order creation: storefront product detail page shows stock decremented
   by 2 (e.g., "48 in stock"). This confirms the decrement-at-creation model.
4. The order status is PENDING.

### Scenario B — Confirm order; storefront stock unchanged (expected behavior)

1. Using Scenario A's order, open store-admin → Orders → status dropdown.
2. Change status from PENDING to CONFIRMED.
3. Verify: storefront product detail page still shows the same count as after step A3 (e.g., "48 in stock").
4. Confirm: stock is NOT returned on CONFIRMED — this is the correct, expected behavior.
   (This is the QA-reported symptom that turns out to be working-as-intended.)

### Scenario C — Admin cancel a CONFIRMED order; stock returns and storefront reflects it

1. Using Scenario B's CONFIRMED order, open store-admin → Orders → status dropdown.
2. Change status from CONFIRMED to CANCELLED.
3. Verify immediately (no page reload needed): storefront product detail page shows stock
   restored by 2 (e.g., back to "50 in stock"). Cache eviction should have fired synchronously
   after the transaction.
4. If the storefront still shows stale stock after 5 seconds, do a hard reload — the TTL
   is 5 minutes so the eviction path (not TTL) must be what restores it promptly.

### Scenario D — Admin cancel a PENDING order; stock returns (no double-restock)

1. Place a second order for 1 unit (storefront now shows "49 in stock" if Scenario C passed).
2. Open store-admin → change the PENDING order to CANCELLED immediately.
3. Verify: storefront shows stock incremented by 1 (back to "50").

### Scenario E — Double PATCH to CANCELLED does not double-restock

1. Take the CANCELLED order from Scenario C or D.
2. Try to PATCH it to CANCELLED again via Swagger UI (POST `PATCH /api/admin/orders/{id}/status` with `{ status: "CANCELLED" }`).
3. Verify: response 200 OK (no error); storefront stock is still "50 in stock" (stock NOT
   incremented again). The idempotency guard fired correctly.

### Scenario F — Non-cancel transitions do not affect stock

1. Place a third order (storefront: "49 in stock").
2. Advance it PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED via store-admin.
3. After each step: verify storefront stock remains at "49 in stock" (no change).
4. No stock is returned for DELIVERED (goods are gone).

---

## Risks & Mitigations

| Risk                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cancelAndRestock` (customer path) and `cancelWithRestock` (admin path) are similar; future developers may confuse them                                                          | Both methods are clearly commented; `cancelAndRestock` is guarded to PENDING-only by the service and does not accept a target status; `cancelWithRestock` handles CANCELLED and REFUNDED with the paymentStatus column                                                                                                                                    |
| Admin PATCHES a SHIPPED/DELIVERED order to CANCELLED; should we restock goods already in the customer's hands?                                                                   | Business decision recorded here: yes, we restock, because the admin taking this action signals the shipment was returned or the order was voided (or it is an admin data-correction). Stock accuracy is preferred over trying to infer physical state. If the product-return UX needs more nuance, that is a future task.                                 |
| `evictProductCaches` is a private method — the new `cancelWithRestock` must call it                                                                                              | Both methods live in `OrderRepository`; `cancelWithRestock` calls `this.evictProductCaches(updated.items)` in exactly the same pattern as `cancelAndRestock`. No visibility change needed.                                                                                                                                                                |
| TASK-123's `derivePaymentStatus` already returns `currentPaymentStatus` (unchanged) for CANCELLED — will the service branch pass the right paymentStatus to `cancelWithRestock`? | Yes. For CANCELLED: `derivePaymentStatus(CANCELLED, PAID) = PAID` and `derivePaymentStatus(CANCELLED, PENDING) = PENDING`. Both are correct — the existing paymentStatus is preserved on cancel, which matches the TASK-123 intent. For REFUNDED: `derivePaymentStatus(REFUNDED, PAID) = REFUNDED`. All cases are already covered by the existing helper. |
| `orderRepositoryMock` in `order.service.spec.ts` does not yet have `cancelWithRestock`                                                                                           | TASK-124-B explicitly adds `cancelWithRestock: jest.fn()` to the mock object before any tests are written.                                                                                                                                                                                                                                                |

---

## Notes

- This is a critical module (inventory / orders) — TDD is mandatory per `AGENTS.md`.
- The stock-at-creation model is a deliberate design choice, not a bug. The QA report was
  correct in observation but incorrect in implication: the stock DID change — it changed when
  the order was placed, not when it was confirmed.
- `cancelAndRestock` (existing customer-cancel method) is intentionally preserved and NOT
  modified. It handles only PENDING orders and only emits `status = CANCELLED`. The new
  `cancelWithRestock` handles admin-driven cancels/refunds from any stock-holding status.
- The `evictProductCaches` private method is reused as-is; no changes to it are needed.
- No breaking change to the OpenAPI contract; no Orval regeneration; no frontend code changes.
- REFUNDED is not currently reachable from the admin dropdown (see `transitions.ts`).
  The backend rule is implemented now so the future Stripe webhook (TASK-034) or manual
  API call will be correct without additional work.
- The 5-minute cache TTL (`DEFAULT_CACHE_TTL_SECONDS = 300`) means display staleness
  self-heals even without eviction, but inventory numbers stay permanently wrong without
  the stock increment. The primary goal of this fix is inventory correctness; the cache
  eviction is a secondary (but important) side-effect to ensure the storefront reflects
  the fix immediately.
