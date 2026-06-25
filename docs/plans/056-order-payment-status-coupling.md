# Plan: Order Payment Status Coupling Fix

> **Status:** Complete (manual QA passed — TASK-123-C ✅)
> **Phase:** Phase A — Stabilize & Close Out (QA pass triage — bugs)
> **Created:** 2026-06-25
> **Last Updated:** 2026-06-25
> **TASK:** TASK-123

## Resolution (implemented)

- **TASK-123-A (Red):** Updated the existing `updateStatus` assertion to the 3-arg call and
  added a `describe('updateStatus — paymentStatus coupling')` block (9 cases: PENDING→
  {CONFIRMED,PROCESSING,SHIPPED,DELIVERED}=PAID, CONFIRMED+PAID→CANCELLED keeps PAID,
  PENDING→CANCELLED keeps PENDING, →REFUNDED=REFUNDED, idempotency). Confirmed Red (9 fail).
- **TASK-123-B (Green):** Added pure module-scope `derivePaymentStatus(targetStatus,
currentPaymentStatus)` in `order.service.ts`; `updateStatus` now derives and passes
  `paymentStatus` to the repository. `OrderRepository.updateStatus(orderId, status,
paymentStatus)` writes both columns in one Prisma update (no business logic in the repo).
- **TASK-123-C:** Verified store-admin needs no change — `order-detail-view.tsx:119-120`
  already renders the `paymentStatus` badge and `OrderStatusSelect` invalidates the detail/
  list queries on success. Manual QA checklist (Scenarios A–D) passed on a running stack.
- Gates: `npm run test -w apps/store-api` 380/380 pass, lint clean, typecheck clean (all
  three workspaces). No Prisma migration, no Orval regeneration.

---

## Overview

`paymentStatus` stays `PENDING` forever when an admin advances an order through
the status dropdown in store-admin. Only the dedicated `confirm-payment` endpoint
sets `paymentStatus = PAID`; the general `PATCH /api/admin/orders/:orderId/status`
route leaves it untouched. This plan adds a deterministic status→paymentStatus
coupling rule inside `OrderService.updateStatus` and covers it with TDD unit tests.
No Prisma schema change, no Orval regeneration, and no frontend code change are
required — the store-admin UI already renders `order.paymentStatus` and will
reflect the corrected value automatically after the backend fix.

---

## Scope

### In Scope

- `OrderService.updateStatus` — inject coupling rule (service layer only)
- `OrderRepository.updateStatus` — extend to write both `status` and `paymentStatus`
  in a single Prisma update (repository responsibility: execute the combined write;
  no business logic here)
- `order.service.spec.ts` — TDD: write failing tests first, then implement (Red → Green → Refactor)
- Manual QA checklist (see below)

### Out of Scope

- Prisma schema / migrations — the `OrderStatus` and `PaymentStatus` enums already
  exist; no new columns, no new migrations needed (confirmed by inspection of
  `order.repository.ts` and `schema.prisma` usages)
- Orval regeneration — the response shape is unchanged: `OrderEntity.paymentStatus`
  is already exposed via `@ApiProperty` and is present in the generated client
- Frontend code changes — `order-detail-view.tsx` already renders
  `order.paymentStatus` as a `<Badge>`; it will display the corrected value without
  any modification
- Real payment webhook (TASK-034 / Stripe) — `updatePaymentStatus` stays available
  for that future path and is not modified here
- REFUNDED status handling — this maps from a future webhook or manual refund action
  and is out of scope for this bug; mapped for completeness in the table below but
  not driven by the admin status dropdown (`REFUNDED` is not in the current
  `ORDER_STATUS_TRANSITIONS` map)

---

## Root Cause

Two admin paths diverge on `paymentStatus`:

**Path 1 — confirm-payment** (`PATCH /api/orders/:orderId/confirm-payment`):
`OrderService.confirmPayment` → `OrderRepository.markPaid` → sets both
`status = CONFIRMED` and `paymentStatus = PAID` atomically. Only accepts a
`PENDING` order (guards with 409 otherwise). Produces: `{CONFIRMED, PAID}`.

**Path 2 — admin status PATCH** (`PATCH /api/admin/orders/:orderId/status`):
`OrderService.updateStatus` → `OrderRepository.updateStatus` → sets only `status`,
leaves `paymentStatus` untouched. The store-admin UI drives all lifecycle
transitions (PENDING→CONFIRMED→PROCESSING→SHIPPED→DELIVERED, and →CANCELLED)
exclusively through this path. Produces: `{CONFIRMED, PENDING}` — the bug.

Result: an order confirmed via the status dropdown never has its `paymentStatus`
updated. Orders further along (PROCESSING, SHIPPED, DELIVERED) also retain
`paymentStatus = PENDING`.

---

## Design Decisions

### 1. Status → PaymentStatus Coupling Rule

The coupling is maintained as a deterministic map inside `OrderService.updateStatus`.
The rule represents business intent: an order only advances past `PENDING` once
payment is received (pre-Stripe: the admin is the implicit payment confirmation
signal for every non-cancel non-refund transition).

| Target `OrderStatus` | Derived `PaymentStatus`  | Rationale                                                                                                                                                                                                                               |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIRMED`          | `PAID`                   | Admin explicitly confirmed order → payment is received                                                                                                                                                                                  |
| `PROCESSING`         | `PAID`                   | Order is being picked/packed → already paid                                                                                                                                                                                             |
| `SHIPPED`            | `PAID`                   | Dispatched → already paid                                                                                                                                                                                                               |
| `DELIVERED`          | `PAID`                   | Delivered → already paid                                                                                                                                                                                                                |
| `CANCELLED`          | Unchanged (keep current) | A PENDING cancel means payment was never taken; a CONFIRMED/further cancel means a refund is a separate step (TASK-034). Setting FAILED for PENDING cancels would be premature — the cancel is customer-side, not payment-failure-side. |
| `REFUNDED`           | `REFUNDED`               | Symmetric: a refunded order's payment was reversed                                                                                                                                                                                      |
| `PENDING`            | `PENDING`                | Should not occur via admin dropdown, but if called: reset to PENDING                                                                                                                                                                    |

**Idempotency / no-regression rule:** if the existing `paymentStatus` is already
`PAID` and the target status is not `REFUNDED` or `CANCELLED`, the derived value
is still `PAID` — it never regresses. The coupling function always produces the
_more advanced_ of {current, derived} for non-terminal statuses, making repeat
calls safe.

Concretely, the function (`derivePaymentStatus`) is a pure helper in
`order.service.ts`:

```typescript
function derivePaymentStatus(
  targetStatus: OrderStatus,
  currentPaymentStatus: PaymentStatus,
): PaymentStatus {
  switch (targetStatus) {
    case OrderStatus.CONFIRMED:
    case OrderStatus.PROCESSING:
    case OrderStatus.SHIPPED:
    case OrderStatus.DELIVERED:
      return PaymentStatus.PAID;
    case OrderStatus.REFUNDED:
      return PaymentStatus.REFUNDED;
    case OrderStatus.CANCELLED:
    case OrderStatus.PENDING:
    default:
      return currentPaymentStatus; // leave unchanged
  }
}
```

This is a pure function (no Prisma, no injected dependencies), testable in isolation.

### 2. Layer Placement

The coupling rule lives in **`OrderService.updateStatus`** (service layer), NOT in
the repository. The service computes the derived `paymentStatus` and passes both
`status` and `paymentStatus` down to the repository via an updated signature. The
repository's only job is to execute a single Prisma update writing both columns.

This satisfies Clean Architecture: repositories do Prisma only (no business rules),
services hold the business logic. The coupling is co-located with the only other
business rule in `updateStatus` (the 404 guard), not scattered across both layers.

### 3. confirm-payment Path

`confirmPayment` + `markPaid` remain correct and unchanged. Under the new rule,
both paths now produce identical state for PENDING→CONFIRMED:

- `confirm-payment`: `markPaid` → `{CONFIRMED, PAID}` (unchanged)
- admin status PATCH to CONFIRMED: `updateStatus` + coupling → `{CONFIRMED, PAID}` (fixed)

`confirmPayment` is not made redundant. It serves as an explicit "payment received"
affordance with its own 409 guard (only PENDING orders). The status PATCH path
does not guard transitions — that is intentional (the future webhook can force any
state). Both paths now produce consistent state.

### 4. Idempotency and Regression Guards

- `derivePaymentStatus` is a pure function; calling it with the same inputs always
  yields the same output.
- For CONFIRMED/PROCESSING/SHIPPED/DELIVERED: always returns `PAID`, so a repeat
  admin status update on an already-PAID order does not regress it.
- For CANCELLED: leaves `paymentStatus` as-is, so a CONFIRMED (already-PAID) order
  that gets cancelled retains `PAID` until a separate refund action sets `REFUNDED`.
- The service does not need an additional guard for "already PAID" — `derivePaymentStatus`
  is already idempotent for those paths.

### 5. Frontend Impact

No frontend code changes are required. Confirmed by reading `order-detail-view.tsx`:

- Line 119: `<Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>Payment: {order.paymentStatus}</Badge>`
- The `paymentStatusBadgeVariant` helper and `paymentStatus` field are already wired.
- `OrderStatusSelect` invalidates both the detail and list queries on success, so
  the corrected `paymentStatus` surfaces immediately after a status change without
  a page reload.

No `generate:api` run is needed because the API response shape (`OrderEntity`) is
unchanged — `paymentStatus` was already present.

---

## Technical Design

### Backend

#### OrderRepository.updateStatus (modified signature)

Current:

```typescript
updateStatus(orderId: string, status: OrderStatus): Promise<OrderWithItems>
```

New:

```typescript
updateStatus(orderId: string, status: OrderStatus, paymentStatus: PaymentStatus): Promise<OrderWithItems>
```

The repository update becomes:

```typescript
data: {
  (status, paymentStatus);
}
```

Single Prisma write; atomic; consistent.

#### OrderService.updateStatus (new coupling logic)

```typescript
async updateStatus(orderId: string, status: OrderStatus): Promise<OrderEntity> {
  const existing = await this.orderRepository.findById(orderId);
  if (!existing) throw new NotFoundException('Order not found');

  const paymentStatus = derivePaymentStatus(status, existing.paymentStatus);
  const order = await this.orderRepository.updateStatus(orderId, status, paymentStatus);
  return OrderEntity.fromPrisma(order);
}
```

The `derivePaymentStatus` pure helper function (module-scope, not exported) is
defined in `order.service.ts`.

### Data Model

No Prisma schema change. No migration needed. Confirmed: `OrderStatus` and
`PaymentStatus` enums and both columns on the `Order` model already exist in the
current schema.

### API Contract

No change to request or response shapes. `PATCH /api/admin/orders/:orderId/status`
continues to accept `UpdateOrderStatusDto` and return `AdminOrderResponseEnvelope`
(`{ data: OrderEntity }`). The `paymentStatus` field is already on `OrderEntity`
and already decorated with `@ApiProperty`. Swagger spec is unchanged. No Orval
regeneration needed.

---

## Tasks

### TASK-123-A: Write failing unit tests for the coupling rule (TDD — Red)

**Type:** test
**Scope:** store-api
**Complexity:** M (2–3h)
**TDD Required:** Yes (Red step — write tests before any implementation)
**Depends on:** none

**Acceptance Criteria:**

- [ ] New `describe('updateStatus — paymentStatus coupling')` block added to
      `order.service.spec.ts`, covering all mapping cases in the table above
- [ ] Test: PENDING → CONFIRMED sets paymentStatus to PAID
- [ ] Test: PENDING → PROCESSING sets paymentStatus to PAID
- [ ] Test: PENDING → SHIPPED sets paymentStatus to PAID
- [ ] Test: PENDING → DELIVERED sets paymentStatus to PAID
- [ ] Test: CONFIRMED (paymentStatus PAID) → CANCELLED leaves paymentStatus as PAID
      (no regression)
- [ ] Test: PENDING → CANCELLED leaves paymentStatus as PENDING
- [ ] Test: any non-CANCELLED status → REFUNDED sets paymentStatus to REFUNDED
- [ ] Test: already-PAID order advanced to DELIVERED stays PAID (idempotency)
- [ ] Test: NotFoundException still thrown when order not found
- [ ] All new tests FAIL (Red) before implementation — confirmed by running
      `npm run test -w apps/store-api -- --testPathPattern=order.service`
- [ ] Existing `updateStatus` tests are not broken

**Files to create/modify:**

- `apps/store-api/src/order/order.service.spec.ts` — add new `describe` block for
  coupling; update the existing `updateStatus` mock assertions to expect two-arg
  call to `orderRepositoryMock.updateStatus`

---

### TASK-123-B: Implement coupling in service + repository (TDD — Green + Refactor)

**Type:** fix
**Scope:** store-api
**Complexity:** S (1–2h)
**TDD Required:** Yes (Green step — minimum code to pass TASK-123-A tests)
**Depends on:** TASK-123-A

**Acceptance Criteria:**

- [ ] `derivePaymentStatus(targetStatus, currentPaymentStatus)` pure function
      added at module scope in `order.service.ts`; not exported
- [ ] `OrderService.updateStatus` reads `existing.paymentStatus`, calls
      `derivePaymentStatus`, passes result to `orderRepository.updateStatus`
- [ ] `OrderRepository.updateStatus` signature extended to accept `paymentStatus:
PaymentStatus` as a third argument; Prisma update writes both `status` and
      `paymentStatus` in a single call
- [ ] No business logic in the repository (the coupling computation stays in the
      service)
- [ ] All TASK-123-A tests pass (Green)
- [ ] No existing passing test is broken
- [ ] `npm run test -w apps/store-api` green
- [ ] `npm run lint -w apps/store-api` clean
- [ ] `npm run typecheck` clean

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts` — add `derivePaymentStatus` helper;
  update `updateStatus` to derive and pass `paymentStatus`
- `apps/store-api/src/order/order.repository.ts` — add `paymentStatus: PaymentStatus`
  parameter to `updateStatus`; update Prisma `data` object to include both columns

---

### TASK-123-C: Admin UI verification and Manual QA

**Type:** test
**Scope:** store-admin (read-only verification; no code change expected)
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-123-B

**Acceptance Criteria:**

- [ ] Confirm that `order-detail-view.tsx` already renders `order.paymentStatus`
      as a Badge — no code change needed (verified in planning: line 119)
- [ ] Confirm that `OrderStatusSelect` already invalidates the detail query on
      success — no code change needed (verified in planning)
- [ ] Manual QA checklist below completed on a running stack

**Files to create/modify:**

- No file changes expected; this is a verification task

---

## Test Plan (Unit Specs Enumerated)

All specs live in `apps/store-api/src/order/order.service.spec.ts` under a new
`describe('updateStatus — paymentStatus coupling')` block. The existing
`describe('updateStatus')` block is updated to match the new two-argument call
signature of `orderRepositoryMock.updateStatus`.

### New test cases (TASK-123-A)

| #   | Description                                     | Setup                                                                                                                         | Expected                                                                                        |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | PENDING→CONFIRMED derives PAID                  | `findById` returns `{status:PENDING, paymentStatus:PENDING}`; `updateStatus` returns `{status:CONFIRMED, paymentStatus:PAID}` | `updateStatus` called with `('order-uuid-1', CONFIRMED, PAID)`; result has `paymentStatus=PAID` |
| 2   | PENDING→PROCESSING derives PAID                 | same pattern                                                                                                                  | `updateStatus` called with `(…, PROCESSING, PAID)`                                              |
| 3   | PENDING→SHIPPED derives PAID                    | same pattern                                                                                                                  | `updateStatus` called with `(…, SHIPPED, PAID)`                                                 |
| 4   | PENDING→DELIVERED derives PAID                  | same pattern                                                                                                                  | `updateStatus` called with `(…, DELIVERED, PAID)`                                               |
| 5   | CONFIRMED+PAID→CANCELLED keeps PAID             | `findById` returns `{status:CONFIRMED, paymentStatus:PAID}`                                                                   | `updateStatus` called with `(…, CANCELLED, PAID)`; paymentStatus unchanged                      |
| 6   | PENDING+PENDING→CANCELLED keeps PENDING         | `findById` returns `{status:PENDING, paymentStatus:PENDING}`                                                                  | `updateStatus` called with `(…, CANCELLED, PENDING)`                                            |
| 7   | any→REFUNDED derives REFUNDED                   | `findById` returns `{status:DELIVERED, paymentStatus:PAID}`                                                                   | `updateStatus` called with `(…, REFUNDED, REFUNDED)`                                            |
| 8   | Already-PAID→DELIVERED stays PAID (idempotency) | `findById` returns `{status:PROCESSING, paymentStatus:PAID}`                                                                  | `updateStatus` called with `(…, DELIVERED, PAID)`; no regression                                |
| 9   | NotFoundException when order not found          | `findById` returns `null`                                                                                                     | throws `NotFoundException`; `updateStatus` not called                                           |

### Existing test update (TASK-123-A)

The existing `updateStatus` happy-path test in `describe('updateStatus')` asserts:

```typescript
expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
  "order-uuid-1",
  OrderStatus.CONFIRMED,
);
```

This assertion must be updated to match the new three-argument call:

```typescript
expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
  "order-uuid-1",
  OrderStatus.CONFIRMED,
  PaymentStatus.PAID, // derived from PENDING→CONFIRMED
);
```

---

## Manual QA Checklist

To be executed on a running stack (API + store-admin) after TASK-123-B merges.

### Scenario A — Status dropdown advances paymentStatus

1. Create a new order (storefront checkout or seed) — initial state: `{PENDING, PENDING}`.
2. Open store-admin → Orders → detail page for that order.
3. Observe both badges: "PENDING" (status) and "Payment: PENDING" (paymentStatus).
4. Use the status dropdown to change to CONFIRMED.
5. Verify the payment badge flips immediately to "Payment: PAID" (detail query
   invalidated by `OrderStatusSelect.onSuccess`).
6. Advance through PROCESSING → SHIPPED → DELIVERED via the dropdown.
7. Verify the payment badge remains "Payment: PAID" at each step (no regression).

### Scenario B — confirm-payment path still works

1. Create a second PENDING order.
2. Issue `PATCH /api/orders/{orderId}/confirm-payment` via Swagger UI (ADMIN token).
3. Verify response: `{status: CONFIRMED, paymentStatus: PAID}`.
4. Open the order detail page; both badges should show CONFIRMED and PAID.
5. Attempt to call confirm-payment again on the same order; expect 409
   ConflictException.

### Scenario C — Cancel from PENDING leaves paymentStatus PENDING

1. Create a third PENDING order.
2. Use the status dropdown to move it to CANCELLED.
3. Verify: status badge shows "CANCELLED", payment badge stays "Payment: PENDING".

### Scenario D — Cancel from CONFIRMED leaves paymentStatus PAID

1. Use Scenario A's CONFIRMED order (paymentStatus: PAID).
2. Use the status dropdown to move it to CANCELLED.
3. Verify: status badge shows "CANCELLED", payment badge stays "Payment: PAID".

---

## Affected Files

| File                                             | Change                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/store-api/src/order/order.service.ts`      | Add `derivePaymentStatus` helper; update `updateStatus` to read `existing.paymentStatus` and pass derived value to repo |
| `apps/store-api/src/order/order.repository.ts`   | Extend `updateStatus(orderId, status, paymentStatus)` to write both columns                                             |
| `apps/store-api/src/order/order.service.spec.ts` | Add 9 new coupling tests; update existing `updateStatus` call-argument assertion                                        |

Files confirmed unchanged:

- `apps/store-api/src/order/admin-order.controller.ts` — controller stays as-is
- `apps/store-api/src/order/order.controller.ts` — confirm-payment path unchanged
- `apps/store-api/src/order/order.repository.spec.ts` — no `updateStatus` spec exists there; no change needed
- `apps/store-api/src/order/entities/order.entity.ts` — already exposes `paymentStatus`
- `apps/store-admin/src/features/order-status-update/**` — no changes needed
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — already renders `paymentStatus`

---

## Migration Steps

1. No Prisma migration. Enums and columns exist.
2. **TASK-123-A** — Write all failing unit tests first (TDD Red). Run suite, confirm they fail.
3. **TASK-123-B** — Implement `derivePaymentStatus` + update service + update repository.
   Run suite, confirm all tests green. Lint + typecheck.
4. **TASK-123-C** — Manual QA on a running stack using the checklist above.

---

## Risks & Mitigations

| Risk                                                                             | Mitigation                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository signature change breaks the existing `updateStatus` test assertion    | The existing spec asserts the two-arg call; TASK-123-A explicitly updates this assertion before the implementation lands                                                                          |
| Future webhook (TASK-034) bypasses coupling via `updatePaymentStatus`            | `updatePaymentStatus` is a separate repository method kept for webhook use; webhook drives its own state machine — the coupling in `updateStatus` does not interfere                              |
| Admin sets CANCELLED on a PAID order; customer expects a refund                  | CANCELLED preserves PAID (correct); a separate REFUNDED status + action handles actual refunds; this is documented and out of scope here                                                          |
| `REFUNDED` not in `ORDER_STATUS_TRANSITIONS`; admin cannot reach it via dropdown | Correct — REFUNDED is intentionally absent from the admin transitions for now (requires a deliberate refund action). The coupling rule handles it for completeness when the webhook path sets it. |

---

## Notes

- This is a critical module (orders) — TDD is mandatory per AGENTS.md.
- The `derivePaymentStatus` helper is a pure function with no side effects, making
  it trivially unit-testable and future-proof for the TASK-034 webhook integration.
- The confirm-payment endpoint (`/api/orders/:orderId/confirm-payment`) and
  `markPaid` repository method are explicitly preserved; they are not merged into
  the status PATCH path. They remain the explicit "admin marks payment received by
  hand" affordance with their own tighter guard (PENDING-only).
- No breaking change to the OpenAPI contract; no Orval regeneration.
- `cancelAndRestock` (customer cancel path) is untouched — it writes only `status = CANCELLED`
  and does not set `paymentStatus`. For customer cancellation of a PENDING order,
  `paymentStatus` was already `PENDING` and stays `PENDING`. Correct.
