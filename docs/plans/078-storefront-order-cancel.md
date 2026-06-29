# Plan 078 — Storefront user order cancellation (TASK-131)

**Phase:** Phase 3 — Storefront (Wave 1)
**Roadmap context:** Customer self-service — cancel a PENDING order before it is processed
**Branch:** feature/131-storefront-order-cancel
**Created:** 2026-06-29
**Status:** To Do

---

## User Story

As a logged-in customer, I want to cancel a PENDING order with one click (confirmed via a
dialog), so that I can change my mind before the order is processed without contacting support.

---

## Problem Statement

The backend endpoint `PATCH /api/orders/:orderId/cancel` is fully implemented
(`order.controller.ts` line 172, `order.service.ts` `cancelOrder`): it verifies ownership,
asserts `status === PENDING`, auto-restocks inventory, and returns the updated order entity.
The Orval-generated hook `useCancelOrder` is already exported from
`apps/store-client/src/entities/order/index.ts` (re-exported from
`shared/api/generated/orders/orders.ts`). The mutation variable is `{ orderId: string }`.

There is no frontend UI for the customer to trigger cancellation. The order-history list
(`/orders`, `widgets/order-history/`) and the order confirmation/detail page
(`/orders/[id]/confirmation`, `widgets/order-confirmation/`) both display the order status, but
neither provides a cancel action. A customer who immediately regrets a PENDING order has no
self-service path.

---

## Scope: Frontend-only (store-client)

- No Prisma schema changes, no backend code changes, no migration.
- No Orval regen — `useCancelOrder`, `CancelOrder200`, and the two query-key helpers
  (`getGetOrdersQueryKey`, `getGetOrderQueryKey`) are already generated and exported from
  `@/entities/order`.
- One new FSD feature slice: `features/cancel-order/`.

---

## Shared-file conflict note (TASK-134)

TASK-134 ("Order-details page — fix layout + link items to their products") also modifies
`apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.tsx`.

**TASK-131 must land on `develop` before TASK-134 is merged**, or TASK-134's branch must
rebase on top of `feature/131-storefront-order-cancel`. This ordering is captured in the
approved parallelization plan at
`C:\Users\jioii\.claude\plans\eventual-launching-glacier.md` (Wave 1, no backend work).

---

## Codebase investigation findings

### Hook signature (verified in `shared/api/generated/orders/orders.ts`)

```ts
// Generated hook — do not hand-edit.
export const useCancelOrder = <TError = ErrorType<void>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<CancelOrder200, TError, { orderId: string }, TContext>;
    request?: SecondParameter<typeof customInstance>;
  },
  queryClient?: QueryClient,
): UseMutationResult<CancelOrder200, TError, { orderId: string }, TContext>;
```

Call site: `mutation.mutate({ orderId })`.

### Query keys (verified in `entities/order/index.ts`)

Both helpers are exported:

```ts
import { getGetOrdersQueryKey, getGetOrderQueryKey } from "@/entities/order";
```

`getGetOrdersQueryKey()` — key for the list used by `OrderHistoryView`.
`getGetOrderQueryKey(orderId)` — key for the single-order used by `OrderConfirmationView`.

### Status guard

`OrderEntityStatus` is a string union. The cancel button renders only when
`order.status === 'PENDING'`. The status label map `ORDER_STATUS_LABELS` in `dictionary.ts`
documents `PENDING: "Очікує підтвердження"` (added by TASK-129).

### Mutation + invalidation pattern (from `features/add-to-cart/`)

```ts
const queryClient = useQueryClient();
const mutation = useCancelOrder({
  mutation: {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
      toast.success(dict.cancelOrder.success);
    },
    onError: () => toast.error(dict.cancelOrder.error),
  },
});
```

### Confirm dialog pattern (from `widgets/cart/ui/cart-summary.tsx`)

`CartSummary` uses a controlled `Dialog` (Radix via `shared/ui`) driven by
`useState<boolean>` for `confirmOpen`, with a `DialogTrigger` button, a
`DialogClose`-wrapped cancel button, and a destructive confirm button that is
`disabled` while `isPending`. This same pattern is applied to `CancelOrderButton`.

### Toast utility

`toast.success(...)` / `toast.error(...)` from `sonner` — consistent with
`add-to-cart-button.tsx`. The `<Toaster>` is mounted in `app/providers.tsx`.

### Placement decisions

**Order history list (`/orders` — `order-history-view.tsx`):**

Each row is currently a full-area `<Link>` containing the status badge and total.
The cancel button must not be nested inside the link (nested interactive elements are
invalid HTML). The `<li>` is refactored to a `flex items-center gap-3` container:
the `<Link>` occupies the left/main portion; `<CancelOrderButton>` sits to the right,
rendered only when `order.status === 'PENDING'`. Non-PENDING rows have no extra DOM node.

**Order confirmation/detail page (`/orders/[id]/confirmation` — `order-confirmation-view.tsx`):**

The bottom CTA strip is `<div className="flex flex-wrap gap-4">` containing a "Continue
shopping" link. When `order.status === 'PENDING'`, `<CancelOrderButton orderId={order.id} />`
is added into this strip. On success, `getGetOrderQueryKey(orderId)` invalidation causes
`useGetOrder` to refetch, and the page reflects the new `CANCELLED` status without navigation.

`OrderConfirmationHeader` is a pure presentational server component — cancel logic stays
in `OrderConfirmationView` only.

---

## Architecture: `features/cancel-order/`

Following the fsd-component skill and the `features/add-to-cart/` pattern:

```
apps/store-client/src/features/cancel-order/
  ui/
    cancel-order-button.tsx       — "use client" component: hook + Dialog + Button
    cancel-order-button.test.tsx  — RTL + MSW tests
  index.ts                        — barrel export
```

`CancelOrderButton` accepts a single prop: `orderId: string`. The parent is responsible
for rendering it conditionally (only when `status === 'PENDING'`).

---

## Dictionary keys

New top-level slice added to
`apps/store-client/src/shared/config/dictionary.ts`:

```ts
cancelOrder: {
  trigger:           "Скасувати замовлення",
  dialogTitle:       "Скасувати замовлення?",
  dialogDescription: "Це дію неможливо скасувати. Замовлення буде закрито, а резервування товарів — знято.",
  confirm:           "Так, скасувати",
  confirming:        "Скасовуємо…",
  cancel:            "Ні, залишити",
  success:           "Замовлення скасовано",
  error:             "Не вдалося скасувати замовлення. Спробуйте ще раз.",
},
```

---

## Tasks

### TASK-131-A: Add `cancelOrder` dictionary keys

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** nothing

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/config/dictionary.ts` has a new top-level `cancelOrder`
      object (not nested inside `order`) with the eight keys listed in the Dictionary section
- [ ] All values are Ukrainian strings matching the copy above
- [ ] TypeScript structural check passes — `Dictionary` type infers correctly (no `as const`
      breakage; the object is already `as const`)
- [ ] Tests pass: `npm run typecheck -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — append `cancelOrder` slice before
  the closing `} as const`

---

### TASK-131-B: Create `features/cancel-order/` FSD slice

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-131-A

**Acceptance Criteria:**

- [ ] `features/cancel-order/ui/cancel-order-button.tsx` created with `"use client"` directive
- [ ] Imports: `useCancelOrder`, `getGetOrdersQueryKey`, `getGetOrderQueryKey` from
      `@/entities/order`; `useQueryClient` from `@tanstack/react-query`; `toast` from `sonner`;
      Dialog primitives and `Button` from `@/shared/ui`; `dict` from `@/shared/config`
- [ ] Props: `interface CancelOrderButtonProps { orderId: string }`
- [ ] Internal state: `const [confirmOpen, setConfirmOpen] = useState(false)` — mirrors
      the `CartSummary` controlled-dialog pattern exactly
- [ ] `useCancelOrder` wired with `onSuccess`: invalidates `getGetOrdersQueryKey()` and
      `getGetOrderQueryKey(orderId)`, calls `setConfirmOpen(false)`, calls
      `toast.success(dict.cancelOrder.success)`
- [ ] `onError`: calls `toast.error(dict.cancelOrder.error)`
- [ ] Trigger button: `variant="outline"` with destructive colour classes
      (`border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive`),
      label `dict.cancelOrder.trigger`
- [ ] Confirm button: `variant="destructive"`, `disabled={mutation.isPending}`, label toggles
      between `dict.cancelOrder.confirming` (when pending) and `dict.cancelOrder.confirm`
- [ ] Cancel/keep button: wrapped in `<DialogClose asChild>`, label `dict.cancelOrder.cancel`
- [ ] `features/cancel-order/index.ts` exports `{ CancelOrderButton }`
- [ ] Tests pass: `npm run typecheck && npm run lint -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/features/cancel-order/ui/cancel-order-button.tsx` — new component
- `apps/store-client/src/features/cancel-order/index.ts` — barrel export

---

### TASK-131-C: Wire `CancelOrderButton` into `OrderHistoryView`

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-131-B

**Acceptance Criteria:**

- [ ] `CancelOrderButton` added to `apps/store-client/src/features/index.ts` exports
- [ ] Each `<li>` in `order-history-view.tsx` is refactored: the `<Link>` is no longer the
      direct and only child of `<li>`; the `<li>` becomes a `flex items-center gap-3`
      container so the link and the button share the row
- [ ] `<CancelOrderButton orderId={order.id} />` rendered to the right of the `<Link>` block,
      rendered only when `order.status === 'PENDING'`
- [ ] Non-PENDING rows produce no extra DOM node (conditional render, not `hidden` class)
- [ ] No nested interactive elements: the `<Link>` is not a parent of `<CancelOrderButton>`,
      nor vice versa — valid HTML5
- [ ] Hover and focus styles on the list row card remain visually correct after refactor
- [ ] Tests pass: `npm run typecheck && npm run lint && npm run build -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/features/index.ts` — add `CancelOrderButton` to barrel
- `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx` — refactor row
  layout to `flex` container + conditional `CancelOrderButton`

---

### TASK-131-D: Wire `CancelOrderButton` into `OrderConfirmationView`

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-131-B

**Acceptance Criteria:**

- [ ] `OrderConfirmationView` imports `CancelOrderButton` from `@/features/cancel-order`
      (using the FSD downward import: `widgets` may import from `features`)
- [ ] When `order.status === 'PENDING'`, `<CancelOrderButton orderId={order.id} />` is
      rendered inside the existing `<div className="flex flex-wrap gap-4">` CTA strip,
      alongside the existing "Continue shopping" link
- [ ] Non-PENDING orders produce no cancel button in the confirmation view
- [ ] On successful cancel, `getGetOrderQueryKey(orderId)` invalidation triggers `useGetOrder`
      to refetch; the `OrderConfirmationHeader` status badge reflects `CANCELLED` without a
      page navigation
- [ ] Tests pass: `npm run typecheck && npm run lint && npm run build -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.tsx` — add
  `CancelOrderButton` in the CTA strip (conditional on `order.status === 'PENDING'`)

  > TASK-134 also modifies this file. TASK-131 must be merged to `develop` first.
  > TASK-134's branch must rebase on `feature/131-storefront-order-cancel` or on the
  > post-merge `develop` head.

---

### TASK-131-E: RTL + MSW tests for `CancelOrderButton`

**Type:** test
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (RTL approach — implemented after the component per frontend-testing skill)
**Depends on:** TASK-131-B

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/test/msw-handlers.ts` gets a new default handler:
      `http.patch('*/api/orders/:orderId/cancel', () => HttpResponse.json(makeOrder({ status: 'CANCELLED' })))`
      added alongside the existing order/cart handlers
- [ ] Test file `features/cancel-order/ui/cancel-order-button.test.tsx` created; uses
      `renderWithProviders` from `@/shared/test/render` and helpers from
      `@/shared/test/msw-handlers`

- [ ] **Test 1 — happy path (dialog confirm → success):**
  - Render `<CancelOrderButton orderId="order-1" />`
  - Click the trigger button → dialog opens (title text visible in document)
  - Click the confirm button → MSW intercepts `PATCH */api/orders/order-1/cancel`
    and returns `makeOrder({ status: 'CANCELLED' })`
  - `dict.cancelOrder.success` toast text appears in the document
  - The PATCH request was made exactly once (assert via MSW request spy or
    `waitFor` on the toast)

- [ ] **Test 2 — dialog cancel (keep order):**
  - Render `<CancelOrderButton orderId="order-1" />`
  - Click the trigger button → dialog opens
  - Click `dict.cancelOrder.cancel` button → dialog closes (title text no longer visible)
  - No PATCH request was fired (assert via MSW — use an empty handler that calls
    `fail` if matched, or check the request spy count === 0)

- [ ] **Test 3 — error path:**
  - Override MSW handler: `http.patch('*/api/orders/:orderId/cancel', () => HttpResponse.json({}, { status: 500 }))`
  - Render, click trigger, click confirm
  - `dict.cancelOrder.error` toast text appears in the document

- [ ] **Test 4 — pending/disabled state:**
  - Override MSW handler to delay indefinitely (`new Promise(() => {})`)
  - Click trigger → click confirm; while mutation is in-flight, the confirm button is
    `disabled` and shows `dict.cancelOrder.confirming`

- [ ] All existing `npm run test -w apps/store-client` tests remain green

**Files to create/modify:**

- `apps/store-client/src/features/cancel-order/ui/cancel-order-button.test.tsx` — new tests
- `apps/store-client/src/shared/test/msw-handlers.ts` — add default cancel-order PATCH handler

---

### TASK-131-F: Final verification gate

**Type:** chore
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-131-C, TASK-131-D, TASK-131-E

**Acceptance Criteria:**

- [ ] `npm run test -w apps/store-client` — all tests green (including four new cancel-order tests)
- [ ] `npm run typecheck -w apps/store-client` — zero TypeScript errors
- [ ] `npm run lint -w apps/store-client` — zero warnings or errors
- [ ] `npm run build -w apps/store-client` — build succeeds with no type errors

- [ ] **Manual QA (running stack — PENDING order):**
  - Sign in as a customer with a PENDING order; navigate to `/orders`
  - The PENDING row shows a "Скасувати замовлення" button to the right of the row link
  - Click the button → modal appears with title and description
  - Click "Так, скасувати" → `toast.success("Замовлення скасовано")` fires; the row
    status badge changes to "Скасовано" (list refetches)

- [ ] **Manual QA (PENDING order — confirmation page):**
  - Navigate to `/orders/[id]/confirmation` for a PENDING order
  - Cancel button appears in the CTA strip alongside "Продовжити покупки"
  - Confirm cancel → status badge in `OrderConfirmationHeader` flips to "Скасовано"
    without page reload

- [ ] **Manual QA (non-PENDING orders):**
  - Non-PENDING rows in `/orders` show no cancel button
  - `/orders/[id]/confirmation` for a CONFIRMED/SHIPPED order shows no cancel button

**Files to create/modify:**

- (verification only — no file changes)

---

## Execution order

```
TASK-131-A (dictionary keys)
  └── TASK-131-B (feature/cancel-order/ slice)
       ├── TASK-131-C (wire → order-history-view)      ─┐
       ├── TASK-131-D (wire → order-confirmation-view)  ├── parallel
       └── TASK-131-E (RTL + MSW tests)               ─┘
            └── TASK-131-F (final gate: test + typecheck + lint + build + manual QA)
```

TASK-131-C, TASK-131-D, and TASK-131-E can proceed concurrently once TASK-131-B is complete.
All three converge at TASK-131-F.

---

## Pending manual QA (post-ship)

After merge to `develop`, promote to the `Pending manual QA` table in `BACKLOG.md`:

> Storefront order cancel (TASK-131): PENDING order in `/orders` shows "Скасувати замовлення"
> button — confirm → row flips to "Скасовано", list refetches without navigation.
> `/orders/[id]/confirmation` for a PENDING order shows the cancel button in the CTA strip —
> confirm → `OrderConfirmationHeader` status badge updates inline to "Скасовано".
> Non-PENDING orders (CONFIRMED, SHIPPED, DELIVERED, CANCELLED, REFUNDED) show no cancel button
> in either location.

---

## Completion checklist

- [ ] TASK-131-A: `cancelOrder` dictionary keys added
- [ ] TASK-131-B: `features/cancel-order/` slice created and exported
- [ ] TASK-131-C: `order-history-view.tsx` row refactored, cancel button wired
- [ ] TASK-131-D: `order-confirmation-view.tsx` CTA strip updated, cancel button wired
- [ ] TASK-131-E: RTL + MSW tests passing; default cancel handler added to `msw-handlers.ts`
- [ ] TASK-131-F: full gate green (test / typecheck / lint / build / manual QA)
- [ ] `BACKLOG.md` TASK-131 row updated: plan link set to
      `docs/plans/078-storefront-order-cancel.md`
