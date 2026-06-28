# Plan 073 — Admin Order Management Rework (TASK-151)

**Status:** ✅ Complete (implemented on `develop`, 2026-06-28)
**Roadmap phase:** Phase 4 — Admin Panel (B4 owner remark)
**Branch:** implemented directly on `develop` (owner instruction)
**TDD required:** Yes — `OrderService` is a critical module
**Prisma migration:** None — `OrderStatus` and `PaymentStatus` enums already have all needed values
**Plan written:** 2026-06-28

> **Implementation outcome (2026-06-28):** Status/payment fully decoupled. `derivePaymentStatus`
> deleted; `updateStatus` forwards the order's current `paymentStatus` unchanged. New
> `OrderService.adminUpdatePaymentStatus` + `PATCH /api/admin/orders/:id/payment-status` (DTO
> `UpdateOrderPaymentStatusDto`). `confirmPayment`/`markPaid` + the `confirm-payment` route marked
> `@deprecated`. Frontend: status select is now unrestricted (all statuses **except the current
> one** — a deliberate refinement over the plan's "all 7", since the dropdown is a "move to" picker
> and a self-transition is a no-op) and a new `PaymentStatusSelect` feature slice sits beside it.
> Orval regenerated offline (`swagger:export` → `generate:api`). Verified: store-api 436 unit + 43
> order-e2e (incl. 5 new payment-status e2e), store-admin 50 unit (incl. PaymentStatusSelect RTL +
> extended order-detail view), typecheck/lint/build all green. TASK-124 auto-restock invariant
> preserved (untouched); the only changed payment assertions were the former TASK-123 coupling ones.

---

## Context

The owner's remark B4 is: "admin has no full control over order status, and payment is coupled to the
status pipeline." Currently `updateStatus` in `order.service.ts` calls `derivePaymentStatus()` which
auto-sets `paymentStatus = PAID` any time the order is advanced past PENDING (CONFIRMED/PROCESSING/
SHIPPED/DELIVERED) and auto-sets `paymentStatus = REFUNDED` when `status = REFUNDED`. This coupling
was intentional in TASK-123 as a pre-Stripe stand-in.

TASK-151 deliberately reverses that design: the admin must be able to set any order status manually
and toggle payment status independently via a separate control.

### What MUST be preserved

- **TASK-124 auto-restock invariant:** `shouldAutoRestock(currentStatus, targetStatus)` and
  `cancelAndRestock()` must continue to work unchanged. Pre-shipment cancel (PENDING/CONFIRMED/
  PROCESSING → CANCELLED) returns reserved stock to inventory automatically. Post-shipment cancel
  and REFUNDED do NOT auto-restock (physical return must be received first). The stock side-effects
  are driven solely by `targetStatus === CANCELLED && PRE_SHIPMENT_STATUSES.has(currentStatus)` —
  completely independent of `paymentStatus`. Decoupling payment does not touch this invariant.

- **TASK-150 ban enforcement guard:** `createOrder` ban check is unrelated and untouched.

---

## Design decisions

### Decision 1: Decoupling model — recommended approach

**Remove `derivePaymentStatus` coupling entirely.** The function is deleted.

`updateStatus(orderId, status)` in the service:

- Fetches the order (same as now).
- Calls `shouldAutoRestock` (same as now).
- If pre-shipment cancel → `repo.cancelAndRestock(orderId)` (same as now, paymentStatus unchanged in DB).
- Otherwise → `repo.updateStatus(orderId, status, existing.paymentStatus)` — passes the **current** payment
  status unchanged instead of a derived value.

A new `adminUpdatePaymentStatus(orderId, paymentStatus)` service method:

- Fetches the order, throws 404 if missing.
- Calls `repo.updatePaymentStatus(orderId, paymentStatus)` — this repo method **already exists** and
  only writes the `paymentStatus` column.

No repository changes are needed; both `repo.updateStatus` and `repo.updatePaymentStatus` already exist
and only write their respective columns.

**TASK-123 tests that assert the coupling are made wrong by this change.** The spec block
`updateStatus — paymentStatus coupling` must be replaced with tests that assert paymentStatus is
preserved unchanged across all forward transitions.

### Decision 2: API surface — dedicated endpoint

Add `PATCH /api/admin/orders/:orderId/payment-status` to `AdminOrderController`.

Keep the existing `PATCH /api/admin/orders/:orderId/status` — it now sets only `orderStatus` (coupling
removed, but the endpoint itself is unchanged).

Do NOT extend the existing status endpoint with an optional `paymentStatus` — mixing two orthogonal
fields in one payload breaks Single Responsibility and forces the frontend to reason about partial
updates.

New DTO: `UpdateOrderPaymentStatusDto` with `@IsEnum(PaymentStatus)` + Swagger `@ApiProperty`.

### Decision 3: Status transition rules — unrestricted admin control

The backend `AdminOrderController` already imposes no transition constraints (any `OrderStatus` enum
value is accepted). No change is needed there.

The frontend `ORDER_STATUS_TRANSITIONS` map in `transitions.ts` enforces forward-only moves at the UI
layer. This map is replaced with a function that returns ALL statuses as valid targets for every
current status (no filtering). The terminal-state guard (showing a message when no transitions are
available) is removed — the admin always sees the full select.

**Stock side-effects matrix after the rework (TASK-124 invariant preserved):**

| Current status                   | Target status      | `shouldAutoRestock` | Result                                                                  |
| -------------------------------- | ------------------ | ------------------- | ----------------------------------------------------------------------- |
| PENDING / CONFIRMED / PROCESSING | CANCELLED          | true                | `cancelAndRestock()` called; stock returned                             |
| SHIPPED / DELIVERED              | CANCELLED          | false               | `updateStatus` called; manual stock adjustment by admin                 |
| CANCELLED                        | anything (re-open) | false               | `updateStatus` called; NO auto stock decrement (admin adjusts manually) |
| Any                              | REFUNDED           | false               | `updateStatus` called; NO auto stock decrement                          |
| Any forward transition           | any non-CANCELLED  | false               | `updateStatus` called; stock unchanged                                  |
| CANCELLED                        | CANCELLED          | false               | `updateStatus` called; no-op (double-cancel safe)                       |

> Admin re-opening a CANCELLED order (e.g. CANCELLED → PROCESSING) does NOT automatically restore
> the stock decrement. The admin must adjust stock manually in the product edit screen. This is
> intentional and safe — the service cannot know whether stock was manually restocked after cancellation.

### Decision 4: Frontend payment control

A shadcn `<Select>` (not a Switch) is the correct primitive because `PaymentStatus` has four values:
PENDING, PAID, FAILED, REFUNDED. A binary toggle would hide FAILED and REFUNDED.

New `features/order-payment-update/` feature slice containing `PaymentStatusSelect` (mirrors the
existing `features/order-status-update/` structure). Wired via the new Orval-generated hook
`useAdminOrderControllerUpdatePaymentStatus`.

`order-detail-view.tsx` gains a second control row ("Статус оплати") below the existing status row
within the same status section card.

### Decision 5: `confirmPayment` / `markPaid` legacy path

`confirmPayment` (service) and `markPaid` (repository) were the only way to manually mark an order
paid before this rework. After the rework, the new `adminUpdatePaymentStatus` service method and
`PATCH .../payment-status` endpoint replace them completely.

**In this task:** Mark `confirmPayment` in the service and `PATCH .../confirm-payment` in the
customer-facing `OrderController` as `@deprecated` with a JSDoc note pointing to the new endpoint.
Mark `markPaid` in the repository as `@deprecated` similarly. Do NOT remove them — they are
references from existing tests and the `confirm-payment` endpoint is a known public route.

**Removal:** scheduled as a follow-up item in `BACKLOG.md` (TASK-157 or higher) after verifying no
external consumer depends on it.

---

## Migration check

No Prisma migration is required.

The `OrderStatus` enum already contains: `PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED`.
The `PaymentStatus` enum already contains: `PENDING PAID FAILED REFUNDED`.
Both are exactly the values needed. The `Order` model already has both columns (`status` and
`paymentStatus`). Schema is complete.

---

## Sub-tasks

### TASK-151-A: TDD Red — failing service tests for decoupled behavior

**Type:** test
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** Yes (Red phase)
**Depends on:** none

**Acceptance criteria:**

- [ ] In `order.service.spec.ts`, add a new `describe` block `updateStatus — decoupled (no auto-derive)`
      that asserts: advancing PENDING → CONFIRMED leaves `paymentStatus = PENDING` (the call to
      `repo.updateStatus` receives `PaymentStatus.PENDING` as the third argument).
- [ ] Add cases for PENDING → PROCESSING, SHIPPED, DELIVERED (each preserves paymentStatus unchanged).
- [ ] Add a case for DELIVERED → REFUNDED (paymentStatus stays PAID, NOT auto-set to REFUNDED).
- [ ] Add a new `describe` block `adminUpdatePaymentStatus` with tests: - Sets PAID on a PENDING order (calls `repo.updatePaymentStatus('order-uuid-1', PaymentStatus.PAID)`). - Sets REFUNDED on a DELIVERED order. - Throws `NotFoundException` when the order does not exist. - Returns an `OrderEntity` on success.
- [ ] All new tests **fail** at this stage (method does not exist yet / coupling still present).
- [ ] Existing TASK-124 restock tests are untouched and remain green.
- [ ] `npm run test -w apps/store-api` shows the new tests failing; no regressions on existing tests.

**Files to create/modify:**

- `apps/store-api/src/order/order.service.spec.ts` — add failing describe blocks

---

### TASK-151-B: TDD Green — implement decoupling + new `adminUpdatePaymentStatus` service method

**Type:** feat
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** Yes (Green + Refactor phase)
**Depends on:** TASK-151-A

**Acceptance criteria:**

- [ ] `derivePaymentStatus()` function is **deleted** from `order.service.ts`.
- [ ] `updateStatus(orderId, status)` no longer derives paymentStatus; it calls
      `repo.updateStatus(orderId, status, existing.paymentStatus)` — passing the order's current
      payment status unchanged.
- [ ] New `adminUpdatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<OrderEntity>`
      method on `OrderService`: fetches the order, throws `NotFoundException` if absent, calls
      `repo.updatePaymentStatus(orderId, paymentStatus)`, logs `order.payment_status_updated`, returns
      an `OrderEntity`.
- [ ] `confirmPayment` service method is marked `@deprecated` with JSDoc: "Superseded by
      `adminUpdatePaymentStatus`. Use `PATCH /api/admin/orders/:id/payment-status`."
- [ ] `markPaid` repository method is marked `@deprecated` with JSDoc: "Superseded by
      `updatePaymentStatus`. Retained for backward compatibility."
- [ ] The TASK-123 coupling spec block (`updateStatus — paymentStatus coupling`) is REPLACED with
      the decoupled assertions from TASK-151-A (paymentStatus preserved unchanged). The old coupling
      tests are removed and replaced — NOT silently commented out. A code comment documents the
      behavioral change: `// TASK-151: coupling removed — paymentStatus is no longer auto-derived`.
- [ ] All TASK-151-A tests now pass (Green phase).
- [ ] All TASK-124 restock tests remain green (auto-restock invariant preserved).
- [ ] `orderRepositoryMock.updatePaymentStatus` is added to the mock in the spec file.
- [ ] `npm run test -w apps/store-api` — all tests green.
- [ ] `npm run lint -w apps/store-api` — clean.

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts` — delete `derivePaymentStatus`, update `updateStatus`,
  add `adminUpdatePaymentStatus`, mark `confirmPayment` deprecated
- `apps/store-api/src/order/order.repository.ts` — mark `markPaid` deprecated
- `apps/store-api/src/order/order.service.spec.ts` — replace TASK-123 coupling block, add mock for
  `updatePaymentStatus`

---

### TASK-151-C: Backend — new DTO + `PATCH .../payment-status` admin controller endpoint

**Type:** feat
**Scope:** store-api
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-151-B

**Acceptance criteria:**

- [ ] `UpdateOrderPaymentStatusDto` created in `apps/store-api/src/order/dto/`:
      `paymentStatus: PaymentStatus` decorated with `@ApiProperty({ enum: PaymentStatus })` and
      `@IsEnum(PaymentStatus)`.
- [ ] `dto/index.ts` re-exports `UpdateOrderPaymentStatusDto`.
- [ ] `AdminOrderController` gains a new method:
      `     PATCH /api/admin/orders/:orderId/payment-status
    operationId: adminOrderControllerUpdatePaymentStatus
    @Roles(AdminGuard)
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    Returns AdminOrderResponseEnvelope
    `
      Calls `this.orderService.adminUpdatePaymentStatus(orderId, dto.paymentStatus)`.
- [ ] Swagger `@ApiResponse` includes 200, 404, 403.
- [ ] `AdminOrderController` imports `UpdateOrderPaymentStatusDto` and `PaymentStatus`.
- [ ] `PATCH /api/orders/:orderId/confirm-payment` in `OrderController` is marked as deprecated in
      its `@ApiOperation` summary: `"[DEPRECATED — use PATCH /admin/orders/:id/payment-status]
    Mark payment received and confirm order (admin)"`.
- [ ] `npm run build -w apps/store-api` — clean.
- [ ] `npm run lint -w apps/store-api` — clean.
- [ ] `npm run typecheck` — clean.

**Files to create/modify:**

- `apps/store-api/src/order/dto/update-order-payment-status.dto.ts` — new DTO
- `apps/store-api/src/order/dto/index.ts` — add re-export
- `apps/store-api/src/order/admin-order.controller.ts` — new `updatePaymentStatus` method
- `apps/store-api/src/order/order.controller.ts` — deprecate `confirmPayment` operation summary

---

### TASK-151-D: Orval regeneration

**Type:** chore
**Scope:** store-admin
**Complexity:** S (<1h)
**TDD Required:** No
**Depends on:** TASK-151-C

**Acceptance criteria:**

- [ ] API server is running; `/generate-api` command is executed (or equivalent `npx orval`).
- [ ] `apps/store-admin/src/shared/api/generated/admin-orders/admin-orders.ts` gains
      `useAdminOrderControllerUpdatePaymentStatus` mutation hook and the matching query-key getter.
- [ ] `apps/store-admin/src/shared/api/generated/models/` gains `UpdateOrderPaymentStatusDto` model.
- [ ] No hand-edits to generated files (they are gitignored; regeneration is the only permitted
      modification path).
- [ ] `npm run typecheck -w apps/store-admin` — clean against the new generated types.
- [ ] `npm run build -w apps/store-admin` — clean.

**Files to create/modify (auto-generated — do not hand-edit):**

- `apps/store-admin/src/shared/api/generated/admin-orders/admin-orders.ts`
- `apps/store-admin/src/shared/api/generated/models/updateOrderPaymentStatusDto.ts`

---

### TASK-151-E: Frontend — unrestricted status select + new `PaymentStatusSelect` feature

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2–4h)
**TDD Required:** No
**Depends on:** TASK-151-D

**Acceptance criteria:**

- [ ] `apps/store-admin/src/features/order-status-update/model/transitions.ts` — replace
      `ORDER_STATUS_TRANSITIONS` forward-only map with a helper that returns ALL `OrderEntityStatus`
      values as valid targets for every current status. The `getAllowedTransitions` function signature
      is preserved (returns `OrderStatus[]`); the terminal guard in `OrderStatusSelect` that renders
      `dict.orderStatus.noTransitions` when `allowed.length === 0` is removed (admin always sees the
      full select).
- [ ] New feature slice `apps/store-admin/src/features/order-payment-update/` containing: - `ui/payment-status-select.tsx` — client component; shadcn `<Select>` over all
      `OrderEntityPaymentStatus` values; uses `useAdminOrderControllerUpdatePaymentStatus` from
      `@/entities/order`; on success invalidates `getAdminOrderControllerFindAllQueryKey()` and
      `getAdminOrderControllerFindByIdQueryKey(orderId)`; shows `toast.success` / `toast.error`
      with UA dictionary strings. - `index.ts` barrel re-exporting `PaymentStatusSelect`.
- [ ] `apps/store-admin/src/entities/order/index.ts` re-exports
      `useAdminOrderControllerUpdatePaymentStatus` and `UpdateOrderPaymentStatusDto` from `@/shared/api`.
- [ ] `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — status card section
      gains a second control row: label `dict.orderStatus.updatePaymentStatus` + `<PaymentStatusSelect>`.
      The existing `<OrderStatusSelect>` row is untouched.
- [ ] `apps/store-admin/src/shared/config/dictionary.ts` — add to `orderStatus`: - `updatePaymentStatus: 'Статус оплати'` - `changePaymentStatus: 'Змінити статус оплати…'` - `paymentToastUpdated: (label: string) => \`Статус оплати оновлено: \${label}\``    -`paymentToastFailed: 'Не вдалося оновити статус оплати'`    -`paymentUpdateAria: 'Оновити статус оплати'`
- [ ] `npm run build -w apps/store-admin` — clean.
- [ ] `npm run lint -w apps/store-admin` — clean.
- [ ] `npm run typecheck` — clean.

**Files to create/modify:**

- `apps/store-admin/src/features/order-status-update/model/transitions.ts` — replace map with
  unrestricted helper
- `apps/store-admin/src/features/order-payment-update/ui/payment-status-select.tsx` — new component
- `apps/store-admin/src/features/order-payment-update/index.ts` — barrel
- `apps/store-admin/src/entities/order/index.ts` — add payment hook + DTO re-exports
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — integrate
  `PaymentStatusSelect`
- `apps/store-admin/src/shared/config/dictionary.ts` — add `orderStatus.*` entries

---

### TASK-151-F: Frontend tests — `PaymentStatusSelect` RTL + updated order-detail view tests

**Type:** test
**Scope:** store-admin
**Complexity:** M (2–4h)
**TDD Required:** No
**Depends on:** TASK-151-E

**Acceptance criteria:**

- [ ] New test file `apps/store-admin/src/features/order-payment-update/ui/payment-status-select.test.tsx`: - Renders the payment-status select for an order with `paymentStatus = PENDING`. - Selecting PAID calls `useAdminOrderControllerUpdatePaymentStatus` mutate (MSW or mock). - On mutation success, `toast.success` fires with the localized label. - On mutation error, `toast.error` fires. - While `isPending` is true, the select is `disabled`. - At least 4 tests.
- [ ] If `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx` exists, extend it: - Verify `PaymentStatusSelect` is rendered in the order detail view. - Verify the status select now shows all 7 `OrderEntityStatus` values (not filtered by transitions).
      If the file does not exist, create a minimal smoke test (renders without crash, shows both controls).
- [ ] `npm run test -w apps/store-admin` — all tests green, no regressions.
- [ ] `npm run lint -w apps/store-admin` — clean.

**Files to create/modify:**

- `apps/store-admin/src/features/order-payment-update/ui/payment-status-select.test.tsx` — new tests
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx` — extend or create

---

## TASK-123 / TASK-124 invariant audit

| Invariant                                            | Test location                                                      | Effect of TASK-151                                              | Action                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| TASK-123: advancing past PENDING auto-sets PAID      | `order.service.spec.ts` — `updateStatus — paymentStatus coupling`  | **BROKEN by design** — this is the coupling being removed       | Replace the entire spec block with decoupled assertions (TASK-151-A/B) |
| TASK-124: pre-shipment cancel auto-restocks          | `order.service.spec.ts` — `updateStatus — stock restock on cancel` | Unchanged — `shouldAutoRestock` is independent of paymentStatus | Tests remain green without modification                                |
| TASK-124: post-shipment cancel does NOT auto-restock | Same block                                                         | Unchanged                                                       | Tests remain green without modification                                |
| TASK-124: double-cancel is a no-op                   | Same block                                                         | Unchanged                                                       | Tests remain green without modification                                |

> **Summary:** The only tests that change are the TASK-123 coupling tests in `updateStatus —
paymentStatus coupling`. All TASK-124 stock-restock tests are unaffected and must remain green
> throughout this task.

---

## Task sequence

```
TASK-151-A  (Red tests)
    ↓
TASK-151-B  (Green — service decoupling)
    ↓
TASK-151-C  (DTO + controller endpoint)
    ↓
TASK-151-D  (Orval regen)
    ↓
TASK-151-E  (Frontend UI)
    ↓
TASK-151-F  (Frontend tests)
```

---

## Done criteria for TASK-151

All of the following must be true before TASK-151 is marked ✅:

- [ ] `npm run test -w apps/store-api` green (coupling tests replaced, restock tests untouched).
- [ ] `npm run test -w apps/store-admin` green (new payment-select tests added).
- [ ] `npm run build` (all workspaces) clean.
- [ ] `npm run lint` clean.
- [ ] `npm run typecheck` clean.
- [ ] Admin order detail page shows two independent controls: one for order status (unrestricted) and
      one for payment status.
- [ ] Setting order status to CONFIRMED on a PENDING order does NOT auto-change payment status.
- [ ] Setting payment status to PAID works independently of the current order status.
- [ ] Pre-shipment cancel still auto-restocks (TASK-124 invariant verified by tests).
