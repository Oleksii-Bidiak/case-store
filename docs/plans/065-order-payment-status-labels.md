# Plan: Order & Payment Status Labels — Ukrainian Localization

> **Status:** Done
> **Phase:** Phase 5 — Polish & Production (Tier-1 UA Localization)
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **BACKLOG task:** TASK-129

---

## Overview

Every order-status and payment-status value is currently rendered as a raw API enum
string (`PENDING`, `CONFIRMED`, `PAID`, …) in both the storefront (order history page
and confirmation page) and the admin panel (order list table, order detail view, status
dropdown). This is unacceptable for a Ukrainian-language storefront.

This plan replaces every raw enum render with human-readable Ukrainian labels via
per-app static maps. No backend, no DB, no Orval regeneration — display strings only.

---

## Scope

### In Scope

- Ukrainian display labels for all 7 `OrderStatus` values and all 4 `PaymentStatus`
  values (see wording tables below).
- Storefront: `order-confirmation-header.tsx`, `order-history-view.tsx`,
  `dictionary.ts` (`dict.order` helpers).
- Admin: new `entities/order/status-label.ts`, `admin-order-table.tsx`,
  `order-detail-view.tsx`, `order-status-select.tsx`, `shared/config/dictionary.ts`
  helpers that interpolate status strings.
- aria-labels that currently embed raw enums.
- Toast message that currently embeds the raw next-status enum
  (`dict.orderStatus.toastUpdated`).
- Status filter dropdown empty-state message that currently embeds the raw URL enum
  (`dict.orders.emptyStatus`).
- Unit tests for the new label functions; new render assertions in existing component
  tests.

### Out of Scope

- No backend / Prisma / migration changes. Enum values stay English in the API
  contract and DB.
- No Orval regeneration.
- No changes to the `STATUS_BADGE` colour maps (CSS-only, colours are correct today).
- Admin currency formatting (`en-US`/`USD` → `uk-UA`/`UAH`) — that is TASK-148.
- Nova Poshta delivery (TASK-080), checkout prefill (TASK-135), multi-step checkout
  (TASK-146).

---

## User Stories

1. As a customer viewing my order history, I want each order's status to read
   "Доставлено" or "В обробці" instead of "DELIVERED" / "PROCESSING", so I
   understand it without knowing backend enum names.
2. As a customer on the order confirmation page, I want both the order status and the
   payment status displayed in Ukrainian, so the confirmation feels professional.
3. As an admin managing orders, I want the status badges in the table and on the
   detail page to show Ukrainian labels, and the status-transition dropdown to offer
   human-readable options, so I can work in my native language.

---

## Proposed Ukrainian Wording

### OrderStatus map

| Enum value   | Ukrainian label      | Rationale                          |
| ------------ | -------------------- | ---------------------------------- |
| `PENDING`    | Очікує підтвердження | Just placed, awaiting admin review |
| `CONFIRMED`  | Підтверджено         | Admin acknowledged the order       |
| `PROCESSING` | В обробці            | Being picked/packed                |
| `SHIPPED`    | Відправлено          | Handed to courier                  |
| `DELIVERED`  | Доставлено           | Customer received                  |
| `CANCELLED`  | Скасовано            | Either party cancelled             |
| `REFUNDED`   | Повернення коштів    | Process-level refund state         |

### PaymentStatus map

| Enum value | Ukrainian label | Rationale                                         |
| ---------- | --------------- | ------------------------------------------------- |
| `PENDING`  | Очікує оплати   | Intentionally different from OrderStatus PENDING  |
| `PAID`     | Оплачено        | Payment captured                                  |
| `FAILED`   | Помилка оплати  | Payment declined / error                          |
| `REFUNDED` | Кошти повернено | Intentionally different from OrderStatus REFUNDED |

> **Important:** `PENDING` and `REFUNDED` appear in both enums but carry different
> meanings for customers. The two maps are deliberately kept separate so the labels
> can diverge freely. Never merge them into a single map.

---

## Technical Design

### No new data model

This is a pure presentation change. The Prisma schema, API contract, and Orval
generated files are untouched.

### Storefront approach (`store-client`)

`shared/config/dictionary.ts` is the single locale file for the storefront. The
label maps live here as module-level `const` objects defined _before_ the `dict`
export so they can be referenced inside the helper closures:

```ts
// Defined above the dict export:
const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Очікує підтвердження",
  CONFIRMED: "Підтверджено",
  PROCESSING: "В обробці",
  SHIPPED: "Відправлено",
  DELIVERED: "Доставлено",
  CANCELLED: "Скасовано",
  REFUNDED: "Повернення коштів",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Очікує оплати",
  PAID: "Оплачено",
  FAILED: "Помилка оплати",
  REFUNDED: "Кошти повернено",
};
```

Then inside `dict.order`:

- expose `orderStatusLabels: ORDER_STATUS_LABELS` and
  `paymentStatusLabels: PAYMENT_STATUS_LABELS` as direct-access maps for components
  that need a plain lookup (e.g. `order-history-view.tsx`).
- update the three existing helpers:
  - `orderStatusAria` — interpolate `ORDER_STATUS_LABELS[status] ?? status`
  - `paymentStatusAria` — interpolate `PAYMENT_STATUS_LABELS[status] ?? status`
  - `paymentLabel` — interpolate `PAYMENT_STATUS_LABELS[status] ?? status`

String keys are used intentionally (not `OrderEntityStatus` enum values) because
`dictionary.ts` sits in `shared/config` and importing from `@/entities/order` or
`@/shared/api/generated` would either violate FSD direction or introduce a generated-
file dependency. The `Record<string, string>` with `?? status` fallback provides
adequate runtime safety.

### Admin approach (`store-admin`)

The label functions live in `apps/store-admin/src/entities/order/status-label.ts`,
a sibling of the existing `status-badge.ts`. This file can safely import
`OrderEntityStatus` and `OrderEntityPaymentStatus` from `@/shared/api` (same
`entities/order` slice already does this). Using typed `Record<OrderEntityStatus, …>`
keys gives TypeScript exhaustiveness: the compiler will error if a new enum value is
added without a corresponding label.

```ts
// entities/order/status-label.ts
import { OrderEntityStatus, OrderEntityPaymentStatus } from "@/shared/api";

const ORDER_STATUS_LABELS: Record<OrderEntityStatus, string> = {
  [OrderEntityStatus.PENDING]: "Очікує підтвердження",
  [OrderEntityStatus.CONFIRMED]: "Підтверджено",
  [OrderEntityStatus.PROCESSING]: "В обробці",
  [OrderEntityStatus.SHIPPED]: "Відправлено",
  [OrderEntityStatus.DELIVERED]: "Доставлено",
  [OrderEntityStatus.CANCELLED]: "Скасовано",
  [OrderEntityStatus.REFUNDED]: "Повернення коштів",
};

const PAYMENT_STATUS_LABELS: Record<OrderEntityPaymentStatus, string> = {
  [OrderEntityPaymentStatus.PENDING]: "Очікує оплати",
  [OrderEntityPaymentStatus.PAID]: "Оплачено",
  [OrderEntityPaymentStatus.FAILED]: "Помилка оплати",
  [OrderEntityPaymentStatus.REFUNDED]: "Кошти повернено",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderEntityStatus] ?? status;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status as OrderEntityPaymentStatus] ?? status;
}
```

Export both functions through `entities/order/index.ts`.

Components (widgets/features) import `orderStatusLabel` / `paymentStatusLabel` from
`@/entities/order` and call them at the point of render. This keeps `dictionary.ts`
at the `shared` layer free of entity imports. Helpers in `dict` that currently embed
a raw status string (e.g. `dict.orderStatus.toastUpdated(value)`,
`dict.orders.emptyStatus(statusParam)`, `dict.orders.payment(paymentStatus)`) do NOT
need to be modified — components simply pass the already-translated label string to
them instead of the raw enum value.

---

## Raw Render Inventory

The following is the exhaustive list of sites that display raw enum values to users.
Every line must be addressed before the task is closed.

### Storefront (`store-client`)

| File                            | Line | Raw value                                                      | Fix                                                           |
| ------------------------------- | ---- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `order-confirmation-header.tsx` | 78   | `dict.order.orderStatusAria(status)` embeds `status`           | fix helper in dict                                            |
| `order-confirmation-header.tsx` | 81   | `{status}` (badge text)                                        | replace with `dict.order.orderStatusLabels[status] ?? status` |
| `order-confirmation-header.tsx` | 87   | `dict.order.paymentStatusAria(paymentStatus)` embeds raw       | fix helper in dict                                            |
| `order-confirmation-header.tsx` | 90   | `{dict.order.paymentLabel(paymentStatus)}` (badge text)        | fix `paymentLabel` helper in dict                             |
| `order-history-view.tsx`        | 97   | `` `${dict.orderHistory.statusSr}: ${order.status}` `` in aria | replace with label lookup                                     |
| `order-history-view.tsx`        | 103  | `{order.status}` (badge text)                                  | replace with label lookup                                     |

Lines 78, 87, 90 are fixed automatically once the helpers in `dictionary.ts` are
updated. The component file needs touching only for lines 81 and 97/103.

### Admin (`store-admin`)

| File                      | Line    | Raw value                                         | Fix                                                                                                                                          |
| ------------------------- | ------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-order-table.tsx`   | 115–118 | `{status}` in filter `SelectItem`                 | `{orderStatusLabel(status)}`                                                                                                                 |
| `admin-order-table.tsx`   | 131–132 | `dict.orders.emptyStatus(statusParam)`            | pass `orderStatusLabel(statusParam)`                                                                                                         |
| `admin-order-table.tsx`   | 179     | `{order.status}` in order Badge                   | `{orderStatusLabel(order.status)}`                                                                                                           |
| `admin-order-table.tsx`   | 184     | `{order.paymentStatus}` in payment Badge          | `{paymentStatusLabel(order.paymentStatus)}`                                                                                                  |
| `order-detail-view.tsx`   | 118     | `{order.status}` in Badge                         | `{orderStatusLabel(order.status)}`                                                                                                           |
| `order-detail-view.tsx`   | 121     | `{dict.orders.payment(order.paymentStatus)}`      | `{paymentStatusLabel(order.paymentStatus)}` (drop the dict wrapper; it only prepended "Оплата:" which is redundant next to the status badge) |
| `order-status-select.tsx` | 86      | `{status}` in transition `SelectItem`             | `{orderStatusLabel(status)}`                                                                                                                 |
| `order-status-select.tsx` | 65      | `dict.orderStatus.toastUpdated(value)` embeds raw | pass `orderStatusLabel(value)` instead                                                                                                       |

---

## Tasks

### TASK-129-A: Storefront — add label maps and replace raw renders

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `ORDER_STATUS_LABELS` and `PAYMENT_STATUS_LABELS` module-level constants are
      defined above `dict` in
      `apps/store-client/src/shared/config/dictionary.ts`.
- [ ] `dict.order` exposes `orderStatusLabels` and `paymentStatusLabels` (readonly
      reference to the above consts) for direct component access.
- [ ] `dict.order.orderStatusAria`, `dict.order.paymentStatusAria`, and
      `dict.order.paymentLabel` no longer interpolate a raw enum; they use the label maps
      with `?? status` fallback.
- [ ] `order-confirmation-header.tsx` line 81 renders the UA label (e.g. "Очікує
      підтвердження") — not "PENDING".
- [ ] `order-history-view.tsx` line 103 badge text renders the UA label.
- [ ] `order-history-view.tsx` line 97 aria-label reads "Статус замовлення: Очікує
      підтвердження" (not "…: PENDING").
- [ ] `npm run typecheck -w apps/store-client` passes.
- [ ] `npm run lint -w apps/store-client` passes.
- [ ] `npm run test -w apps/store-client` passes (no regressions in existing 84 tests).

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — add label consts; update
  `orderStatusAria`, `paymentStatusAria`, `paymentLabel`; expose maps in `dict.order`
- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-header.tsx`
  — replace `{status}` at line 81 with `{dict.order.orderStatusLabels[status] ?? status}`
- `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx`
  — replace `${order.status}` in aria-label (line 97) and badge text (line 103) with
  label lookup via `dict.order.orderStatusLabels`

---

### TASK-129-B: Admin — add label functions and replace raw renders

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2–4 h)
**TDD Required:** No
**Depends on:** none (can be done in parallel with TASK-129-A)

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/order/status-label.ts` created with
      `orderStatusLabel(status: string): string` and
      `paymentStatusLabel(status: string): string`; both use typed
      `Record<OrderEntityStatus | OrderEntityPaymentStatus, string>` internally and fall
      back to the raw string for unknown values.
- [ ] Both functions are exported from
      `apps/store-admin/src/entities/order/index.ts`.
- [ ] `admin-order-table.tsx`: all 4 raw render sites replaced (filter SelectItems,
      empty-state message, order Badge, payment Badge).
- [ ] `order-detail-view.tsx`: order status Badge and payment status Badge both show
      Ukrainian labels; `dict.orders.payment()` wrapper removed from the payment badge
      render (call `paymentStatusLabel` directly).
- [ ] `order-status-select.tsx`: transition SelectItems show Ukrainian labels; toast
      on success reads "Статус замовлення змінено на Відправлено" (not "…SHIPPED").
- [ ] `npm run typecheck -w apps/store-admin` passes.
- [ ] `npm run lint -w apps/store-admin` passes.
- [ ] `npm run test -w apps/store-admin` passes (no regressions).

**Files to create/modify:**

- `apps/store-admin/src/entities/order/status-label.ts` — CREATE: label maps and
  two exported accessor functions
- `apps/store-admin/src/entities/order/index.ts` — add exports for
  `orderStatusLabel`, `paymentStatusLabel`
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx` — 4 raw render
  sites fixed (see inventory table above)
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — 2 raw
  render sites fixed
- `apps/store-admin/src/features/order-status-update/ui/order-status-select.tsx`
  — `{status}` in SelectItem and raw enum in `toastUpdated` call both fixed

---

### TASK-129-C: Tests — update assertions and add label-map unit tests

**Type:** test
**Scope:** store-client, store-admin
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** TASK-129-A, TASK-129-B

**Acceptance Criteria:**

- [ ] New unit test file
      `apps/store-admin/src/entities/order/status-label.test.ts` covers:
  - all 7 `orderStatusLabel` values return the correct Ukrainian string
  - all 4 `paymentStatusLabel` values return the correct Ukrainian string
  - an unknown string falls back to the input value (e.g.
    `orderStatusLabel("UNKNOWN") === "UNKNOWN"`)
- [ ] `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx`
      updated: existing tests keep passing; add one assertion that the order Badge renders
      "Очікує підтвердження" (the PENDING fixture's Ukrainian label), not "PENDING".
- [ ] `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx`
      updated: add assertion that the rendered order page contains "Очікує підтвердження"
      and "Очікує оплати" (both PENDING fixtures), not the raw strings.
- [ ] `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.test.tsx`
      updated: add assertion that the order header renders "Очікує підтвердження" (the
      PENDING fixture default in `makeOrder()`), not "PENDING"; existing UA address
      assertions still pass.
- [ ] `npm run test -w apps/store-admin` green (all existing + new tests).
- [ ] `npm run test -w apps/store-client` green (all existing + new tests).

**Files to create/modify:**

- `apps/store-admin/src/entities/order/status-label.test.ts` — CREATE: pure-function
  unit tests for both label accessors
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx`
  — add UA label assertion
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx`
  — add UA label assertions
- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.test.tsx`
  — add UA label assertion

---

## Migration Steps

There is no migration (no DB / schema changes). Implementation order:

1. **TASK-129-A** (storefront) and **TASK-129-B** (admin) can be developed in
   parallel on the same feature branch — they touch different apps.
2. **TASK-129-C** (tests) is written after A and B are complete. The
   `status-label.test.ts` unit tests for the admin can technically be written first
   (TDD-style) as a guide, but the component render tests require the components to
   exist first.
3. Run the full test suites before pushing:
   ```bash
   npm run test -w apps/store-client
   npm run test -w apps/store-admin
   npm run typecheck -w apps/store-client
   npm run typecheck -w apps/store-admin
   npm run lint
   ```

---

## Acceptance Checklist (TASK-129 overall)

- [ ] Zero occurrences of literal `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`,
      `DELIVERED`, `CANCELLED`, `REFUNDED`, `PAID`, `FAILED` rendered as visible badge
      text or aria-label text in the 5 user-facing files listed in the inventory.
- [ ] Both the storefront order history page and the order confirmation page display
      Ukrainian status labels.
- [ ] The admin order list table displays Ukrainian labels in both the status column
      and the payment column.
- [ ] The admin order detail page displays Ukrainian labels in both status badges.
- [ ] The admin status-transition dropdown lists Ukrainian options.
- [ ] The admin success toast after a status change reads a Ukrainian label (not the
      raw enum).
- [ ] The admin status filter empty-state message uses a Ukrainian label.
- [ ] All 5 aria-labels that previously embedded raw enums now embed Ukrainian labels.
- [ ] `npm run lint` passes across the monorepo.
- [ ] `npm run typecheck` passes for both `store-client` and `store-admin`.
- [ ] `npm run test -w apps/store-client` and `npm run test -w apps/store-admin` pass
      with the new assertions included.

---

## Risks & Mitigations

| Risk                                                                                                 | Mitigation                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New OrderStatus or PaymentStatus value added to the API in the future without updating the label map | The admin `status-label.ts` uses a `Record<OrderEntityStatus, string>` which causes a TypeScript compile error when a new enum value appears without a corresponding entry. Storefront `Record<string, string>` falls back to the raw value — add a TODO comment to keep maps in sync. |
| `dict` `as const` preventing mutation of the exposed label maps                                      | Maps are exposed as readonly references, which is the correct behaviour. Components must not mutate them.                                                                                                                                                                              |
| `order-detail-view.tsx` removing `dict.orders.payment()` breaks other callers                        | Grep confirms `dict.orders.payment` is only called in `order-detail-view.tsx`. Removing that call site is safe. The dict entry can remain for now and be pruned in a later clean-up.                                                                                                   |
| store-client Next.js breaking-change risk                                                            | This task is plain client-component rendering (no server actions, no routing APIs). Risk is minimal; still verify with `npm run typecheck -w apps/store-client` per the AGENTS.md note.                                                                                                |

---

## Notes

- The `STATUS_BADGE` local colour maps in both `order-confirmation-header.tsx` and
  `order-history-view.tsx` are colour-only (CSS class strings). They are correct and
  remain untouched.
- The admin's existing `orderStatusBadgeVariant()` / `paymentStatusBadgeVariant()` in
  `status-badge.ts` are also colour-only and remain untouched. The new
  `status-label.ts` adds labels as a parallel concern in the same FSD slice.
- `dict.orders.emptyStatus` and `dict.orderStatus.toastUpdated` in the admin
  dictionary are NOT modified. Components will simply pass a translated label string
  as the argument instead of a raw enum value. This keeps the dict at the `shared`
  layer free of entity-level imports.
- This plan deliberately does not touch the admin `orders.payment` helper signature or
  the storefront `orderHistory.statusSr` key — both remain as-is; only the call sites
  and the aria-label construction in the components change.
