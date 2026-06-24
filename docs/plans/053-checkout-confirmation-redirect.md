# Plan: Checkout Confirmation Redirect Bug

> **Status:** Done (code) — manual checkout/confirmation QA pending
> **Phase:** Phase A — Stabilize & close out
> **Created:** 2026-06-24
> **Last Updated:** 2026-06-24
> **Absorbs:** TASK-111 (smoke-verify order-confirmation page with UA address shape)
>
> **Implementation deviations (2026-06-24):**
>
> 1. **`useState`, not `useRef`** — the plan recommended a ref so the flag wouldn't schedule a
>    re-render. The `react-hooks` lint rule forbids reading `ref.current` during render (the hook
>    must return the value to `CheckoutView`), and the ref reasoning was unnecessary anyway: the
>    race is caused by the async cart refetch flipping `cartIsEmpty`, not by this flag's render.
>    `setIsOrderSubmitted(true)` runs synchronously in `onSuccess` — before the refetch resolves —
>    so the guard already sees `true` when `cartIsEmpty` flips. Verified Red→Green (the regression
>    test fails on the unfixed guard, passes after).
> 2. **Order-status localization NOT done here** — the plan's TASK-119-D acceptance mentioned a
>    Ukrainian status label via `dict.order.status.*`, but no such mapping exists and the
>    confirmation header renders `status` raw by design. Localizing order status is **TASK-129**'s
>    scope; TASK-119-D only verifies the page renders and fixes the raw `country` ISO code
>    (`"UA"` → "Україна" via a new `dict.order.countryLabel`).

## Overview

After a successful order submission the user is redirected to `/cart` (now empty) instead of
`/orders/{id}/confirmation`. The order **is** created on the backend; the problem is entirely
on the frontend redirect/guard path. This plan diagnoses the exact failure chain, fixes it,
and folds in the absorbed TASK-111 confirmation-page smoke verification so both issues are
closed together.

---

## Root-Cause Analysis

### Finding 1 — `customInstance` double-unwraps the envelope (HIGH CONFIDENCE — code-visible)

`apps/store-client/src/shared/api/instance.ts` line 174:

```ts
export const customInstance = <T>(config, options): Promise<T> => {
  ...
  const promise = api({ ... }).then(({ data }) => data);
  ...
};
```

Axios already populates `response.data` with the **HTTP response body**. This `.then(({ data }) => data)`
strips the Axios wrapper, so the value returned to every Orval hook is the **raw HTTP body** — in this
case `{ data: OrderEntity }`.

The Orval-generated `createOrder` is typed as `customInstance<CreateOrder201>`, where
`CreateOrder201 = OrderResponseEnvelope & { data?: OrderEntity }`, i.e. `{ data: OrderEntity }`.
So the **type** and the **runtime value** agree: the hook resolves to `{ data: OrderEntity }`.

`useCheckout` correctly reads:

```ts
const orderId = res?.data?.id;
```

This path (`res.data.id`) is **correct for the type** and would work if `res.data` is an
`OrderEntity`. The type is right. So why does `orderId` come out falsy?

### Finding 2 — The cart-empty redirect fires BEFORE navigation completes (HIGH CONFIDENCE — code-visible)

`CheckoutView` has two concurrent effects:

```ts
// effect A — cart empty guard
useEffect(() => {
  if (cartIsEmpty) {
    router.replace("/cart"); // fires when cart becomes empty
  }
}, [cartIsEmpty, router]);
```

`useCheckout.onSuccess`:

```ts
onSuccess: (res) => {
  const orderId = res?.data?.id;
  queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
  router.push(orderId ? `/orders/${orderId}/confirmation` : "/");
},
```

**Execution sequence:**

1. Mutation resolves — `onSuccess` fires.
2. `queryClient.invalidateQueries` marks the cart query stale and triggers a background refetch.
3. `router.push("/orders/{id}/confirmation")` is called — React schedules the navigation.
4. The cart refetch completes and returns an **empty cart** (backend emptied it when creating the order).
5. `data?.data?.items` is now `[]` — `cartIsEmpty` flips to `true`.
6. `useEffect` in `CheckoutView` fires: `router.replace("/cart")`.
7. Because `router.replace` runs **after** `router.push` but in the **same React render cycle on the
   still-mounted `CheckoutView`**, the `replace` call wins — it overwrites the pending push navigation.

Result: the user lands on `/cart` regardless of the push. The `router.push` to the confirmation
page is overwritten by the `router.replace("/cart")` from the guard.

**This is the primary bug.** It is a race condition between the cart-invalidation side-effect and the
cart-empty redirect guard on the still-mounted `CheckoutView`.

### Finding 3 — Fallback destination is `/` not `/cart` (LOW severity, separate)

If `orderId` were falsy, `router.push` would go to `"/"`, not `"/cart"`. The bug description
says the user lands on `/cart`, confirming `orderId` is in fact a valid UUID — the push fires
correctly, but the subsequent `replace("/cart")` overwrites it. The `orderId` access path
(`res?.data?.id`) is correct per the type.

### Finding 4 — `OrderConfirmationView` unauthenticated redirect (INFORMATIONAL)

The confirmation page redirects unauthenticated visitors to `/login?redirect=...`. This guard is
correctly gated on `!isInitializing`, so it should not fire for a freshly-logged-in user arriving
immediately after checkout. This path is fine and does not contribute to the bug.

### Finding 5 — No stale `.next` cache contribution (ASSESSMENT)

The cache primarily affects server-rendered HTML chunks and route manifests, not the runtime JS
logic of these client components. Performing a clean build is good hygiene and may clear unrelated
rendering artefacts, but it is very unlikely to fix this specific race condition.

### What still needs a running stack to confirm

- Whether the cart background refetch truly lands **before** the navigation completes (depends on
  Next.js App Router internals for concurrent navigation + React state flushing). The code analysis
  shows the race is structurally present; a running stack confirms it fires reliably.
- Whether the Orval-generated `CreateOrder201` type (`data?: OrderEntity` — note the `?`) ever
  produces `undefined` at runtime for the `data` field. The `?` is a Orval quirk when using
  `allOf` in the Swagger schema; the backend always returns `{ data: OrderEntity }`, so in practice
  `data` is always defined.

---

## Most-Likely Fix (Primary)

**Prevent the cart-empty guard from firing during the post-order redirect window.**

The cleanest approach: introduce a `isSubmitting` / `isRedirecting` flag in `CheckoutView` (or
co-locate it in `useCheckout`) that is set to `true` before the mutation fires and prevents the
cart-empty `useEffect` from calling `router.replace("/cart")` while navigation is in-flight.

Secondary: move `queryClient.invalidateQueries` to **after** the `router.push` resolves (i.e.,
using `router.push` return or a small deferred call), so the cart query does not refetch while
`CheckoutView` is still mounted. However, since Next.js App Router `router.push` does not return
a Promise in all versions, the flag approach is more reliable.

A minimal one-line alternative that does NOT require a flag: gate the cart-empty guard on
`!isPending` from `useCheckout` — but `isPending` flips to `false` in `onSuccess` before the
effect runs, so this does not reliably prevent the race. The explicit flag is the correct fix.

---

## Scope

### In Scope

- Fix the cart-empty redirect race in `CheckoutView` that causes `router.replace("/cart")` to
  overwrite the `router.push("/orders/{id}/confirmation")` from `useCheckout.onSuccess`.
- Add a `isOrderSubmitted` flag to `useCheckout` (returned to consumers) that `CheckoutView`
  can use to suppress the cart-empty guard.
- Smoke-verify the order-confirmation page renders correctly with the current UA address shape
  (absorbs TASK-111): `OrderConfirmationView`, `OrderAddressSummary`, and related sub-components.
- Add regression tests covering the fixed redirect flow and the order-submission success path.
- Clean `.next` build (rule out stale cache as a compounding factor).

### Out of Scope

- Backend changes — the backend creates orders correctly; no Prisma or controller changes needed.
- Orval regeneration — the generated types are correct (`res.data.id` is the right access path);
  no regen needed unless the Swagger spec is changed for another reason.
- Payment status bug (TASK-123) — separate concern.
- Any UI/UX redesign of the confirmation page beyond fixing data render correctness.

---

## User Stories

1. As a customer, after I submit a checkout form, I want to land on the order-confirmation page
   so that I can see my order details and keep a record of my purchase.
2. As a customer, I want the confirmation page to show my UA delivery address (city, deliveryAddress
   mapped to address1, phone) so that I can verify my shipping details are correct.
3. As a developer, I want regression tests for the checkout submit success path so that the
   redirect race cannot silently regress.

---

## Technical Design

### Data Model

No Prisma changes required.

### Backend

No backend changes required. The backend correctly:

- Creates the order and returns `{ data: OrderEntity }` (HTTP 201).
- Empties the user's cart on order creation.
- The Swagger schema and Orval types are consistent.

### Frontend (Next.js — FSD)

#### The Race Condition Fix

`useCheckout` (`features/checkout/model/use-checkout.ts`) currently returns:
`{ submitOrder, isPending, isError, errorMessage }`.

Add `isOrderSubmitted: boolean` — set to `true` in `onSuccess` before the `router.push` call.
Once set to `true` it never resets (the component unmounts on successful navigation anyway).

`CheckoutView` (`widgets/checkout/ui/checkout-view.tsx`) currently:

```ts
useEffect(() => {
  if (cartIsEmpty) {
    router.replace("/cart");
  }
}, [cartIsEmpty, router]);
```

Gate this guard:

```ts
useEffect(() => {
  if (cartIsEmpty && !isOrderSubmitted) {
    router.replace("/cart");
  }
}, [cartIsEmpty, isOrderSubmitted, router]);
```

Also gate the early-return render guard the same way:

```ts
// Before fix:
if (isInitializing || !isAuthenticated || isCartLoading || cartIsEmpty) { ... }
// After fix:
if (isInitializing || !isAuthenticated || isCartLoading || (cartIsEmpty && !isOrderSubmitted)) { ... }
```

This is a purely additive change to two files. No new components, no Orval regen.

#### Confirmation Page Smoke (Absorbed TASK-111)

Verify `OrderAddressSummary` correctly renders the UA address shape:

- `shippingAddress.address1` (mapped from `deliveryAddress` in `submitOrder`)
- `shippingAddress.city`
- `shippingAddress.phone`
- `shippingAddress.firstName` / `lastName`
- `shippingAddress.country` = `"UA"` — confirm this is either not shown or shown correctly

Check `OrderConfirmationHeader` renders `status` (UA label) and `paymentStatus`.

### API Contract

No changes to the API contract. Existing Orval-generated types are correct.

| Method | Path        | Request Body   | Response                                     |
| ------ | ----------- | -------------- | -------------------------------------------- |
| POST   | /api/orders | CreateOrderDto | { data: OrderEntity } (HTTP 201) — unchanged |

---

## Tasks

### TASK-119-A: Add `isOrderSubmitted` flag to `useCheckout` and fix the cart-empty redirect race

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No (test is TASK-119-C)
**Depends on:** none

**Acceptance Criteria:**

- [x] `useCheckout` returns `isOrderSubmitted: boolean` (a `useState` flag), set to `true` in
      `onSuccess` before `router.push` is called.
- [x] `CheckoutView` cart-empty `useEffect` is gated on `!isOrderSubmitted`.
- [x] `CheckoutView` synchronous render guard is updated to `(cartIsEmpty && !isOrderSubmitted)`.
- [x] TypeScript: `npm run typecheck -w apps/store-client` passes with no new errors.
- [x] Lint: `npm run lint -w apps/store-client` passes.

**Files to modify:**

- `apps/store-client/src/features/checkout/model/use-checkout.ts` — add `isOrderSubmitted` ref/state,
  set it in `onSuccess`, return it from the hook.
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — consume `isOrderSubmitted`, gate
  both the `useEffect` and the synchronous render guard.

---

### TASK-119-B: Clean `.next` build to rule out stale cache

**Type:** chore
**Scope:** store-client
**Complexity:** S (<30 min)
**TDD Required:** No
**Depends on:** TASK-119-A

**Acceptance Criteria:**

- [x] `.next` directory deleted, then rebuilt from clean state.
- [x] `npm run build -w apps/store-client` compiled successfully (16.9s) + TS check passed; all 12
      routes generated incl. `ƒ /orders/[id]/confirmation`.
- [x] No new console errors or webpack warnings introduced by TASK-119-A changes.

**Files to modify:**

- No source files — this is a build-artifact-only step.
- CI: confirm no `--no-cache` flag is needed for the GitHub Actions build job (the CI runner starts
  clean; no change needed).

---

### TASK-119-C: Regression tests for checkout submit success path

**Type:** test
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** Yes
**Depends on:** TASK-119-A

**Acceptance Criteria:**

- [x] Extended existing `checkout-view.test.tsx` with the regression scenario:
  - Submit success → `router.push` called with `/orders/order-1/confirmation`.
  - Submit success + cart becomes empty (MSW flips to empty after the POST) → `router.replace("/cart")`
    is NOT called. **Verified Red→Green**: this case fails on the unfixed effect guard
    (`mockReplace` called with `/cart`, 1 call) and passes after the fix.
  - Existing scenarios retained: unauthenticated → `/login?redirect=/checkout`; authenticated +
    empty cart (no order) → `/cart`.
- [x] MSW mocks `POST /api/orders` returning `{ data: { id: "order-1" } }`.
- [x] `npm run test -w apps/store-client` green — **64 tests / 15 suites** (run `--runInBand`;
      parallel workers time out on this machine but all suites pass).

**Files to create/modify:**

- `apps/store-client/src/widgets/checkout/ui/checkout-view.test.tsx` — add redirect-race regression
  scenarios (or create `checkout-view.redirect.test.tsx` alongside existing test if that keeps
  concerns cleaner).
- `apps/store-client/src/shared/test/msw-handlers.ts` — add `POST /api/orders` handler if not
  already present; return a minimal `CreateOrder201` envelope.

---

### TASK-119-D: Smoke-verify order-confirmation page with UA address shape (absorbed TASK-111)

**Type:** test
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-119-A

**Acceptance Criteria:**

- [x] `OrderConfirmationView` renders without errors given a mock order with UA address fields:
      `address1` (from `deliveryAddress`), `city`, `phone`, `firstName`, `lastName`, `country: "UA"`.
- [x] `OrderAddressSummary` displays name, `address1`, `city`, and `phone` — no `undefined`/`[object Object]`.
- [~] Order status label: **deferred to TASK-129** (no `dict.order.status.*` exists; the header
  renders `status` raw by design). Out of scope for this fix — see deviation note in the header.
- [x] `country: "UA"` is now localized to "Україна" via the new `dict.order.countryLabel` helper
      (fixed in `order-address-summary.tsx`); the raw `"UA"` is no longer shown.
- [x] Auth guard covered: unauthenticated → `router.replace("/login?redirect=/orders/order-1/confirmation")`.
- [x] `npm run test -w apps/store-client` passes with the new confirmation-page test scenarios.

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.test.tsx` — new
  test file covering UA address rendering, status label rendering, and the auth redirect guard.
- `apps/store-client/src/widgets/order-confirmation/ui/order-address-summary.tsx` — fix country
  display if raw ISO code is rendered (likely one-line change or `countryCodeToLabel` helper).
- `apps/store-client/src/shared/test/msw-handlers.ts` — add `GET /api/orders/:id` handler
  returning a minimal `GetOrder200` envelope with UA address shape.

---

## Implementation Sequence

1. **TASK-119-A** — Fix the redirect race (core bug). Can be done in one sitting; purely additive.
2. **TASK-119-B** — Clean build verification. Run this immediately after A to confirm nothing breaks.
3. **TASK-119-C** — Regression tests. Write tests that would have caught the race before the fix,
   then confirm they now pass. Follow Red→Green: write the `router.replace("/cart")` NOT called
   scenario first, observe it failing on the unfixed code, then verify it passes after A.
4. **TASK-119-D** — Confirmation page smoke (absorbed TASK-111). Can run in parallel with C once A
   is done; does not depend on C.

---

## Risks & Mitigations

| Risk                                                                                                                                                      | Mitigation                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router.push` in Next.js App Router does not guarantee completion before the component re-renders, so the flag may not suppress the race on every version | Use `useRef` (not `useState`) for `isOrderSubmitted` so setting it does not trigger a re-render that could cause the guard to re-evaluate mid-navigation |
| `isOrderSubmitted` ref set but component re-renders before `router.push` executes                                                                         | Set the ref synchronously in `onSuccess` before the `router.push` call — same JS tick, so the effect cleanup and next render will see `true`             |
| Existing `checkout-view.test.tsx` already mocks `router` — new tests may collide with those mocks                                                         | Use the same mock pattern established in the file; scope each test's mock reset in `beforeEach`                                                          |
| `OrderAddressSummary` may render `country` as raw `"UA"` — not a blocker for the redirect fix but a UX issue                                              | Handle in TASK-119-D; if not fixable within the S-complexity budget, park as a follow-up in the Phase B UX list                                          |
| Stale `.next` cache containing an old JS chunk with the original `use-checkout.ts` could mask the fix in local dev                                        | TASK-119-B explicitly clears it; CI starts clean                                                                                                         |

---

## Manual QA Checklist

> Run on a live stack after all sub-tasks are merged. Covers both the original TASK-119 bug and
> the absorbed TASK-111 confirmation-page smoke.

### Checkout Redirect (TASK-119 core)

- [ ] Log in as a registered user; add at least one item to the cart.
- [ ] Navigate to `/checkout`, fill in the UA address form (firstName, lastName, phone, city,
      deliveryAddress), submit.
- [ ] Observe: browser navigates to `/orders/{uuid}/confirmation` — NOT to `/cart`.
- [ ] Confirm the URL contains a real UUID (not empty/undefined).
- [ ] Confirm the cart badge in the header shows 0 (or empty) — cart was cleared.
- [ ] Confirm the `/cart` page shows the empty-cart state (not the order summary).

### Confirmation Page Content (absorbed TASK-111)

- [ ] On the `/orders/{uuid}/confirmation` page: order ID, status (Ukrainian label), createdAt are
      shown in the header section.
- [ ] Shipping address block shows: firstName + lastName, phone, city, deliveryAddress (address1).
- [ ] Country field: either shows "Україна" (localized) or is not shown — NOT shown as raw `"UA"`.
- [ ] Order items list shows product names, quantities, and per-item prices.
- [ ] Totals breakdown shows subtotal, discount, shippingCost, tax, total — no `NaN`/`undefined`.
- [ ] "Продовжити покупки" (continue shopping) link navigates to `/`.
- [ ] Hard-refresh the confirmation page — order data reloads without redirecting to `/login`
      (user is still authenticated).

### Regression — Empty Cart Guard Still Works

- [ ] Log in; ensure cart is empty; navigate directly to `/checkout` — confirm redirect to `/cart`
      (the guard must still work for the non-order-submitted case).

### Regression — Unauthenticated Guard Still Works

- [ ] Log out (clear session); navigate directly to `/checkout` — confirm redirect to
      `/login?redirect=/checkout`.

---

## Notes

- The `isOrderSubmitted` value should be a **`useRef`** rather than `useState` so that setting
  it does not schedule a React re-render. A re-render during the navigation window is precisely
  what causes the race; using a ref avoids re-triggering the `useEffect` while still making the
  flag readable synchronously.
- The absorbed TASK-111 items (§A5 / Режим A points 3–5 from `docs/manual-qa-master.md`) are
  fully covered by this plan's TASK-119-D and the Manual QA Checklist above.
- No Orval regeneration is needed. The `CreateOrder201` type (`data?: OrderEntity`) uses `?`
  because Orval emits optional properties from `allOf` compositions. At runtime the backend
  always returns `data`, so `res.data.id` is safe. If this ever becomes a type-narrowing concern
  a simple `if (!res.data) return;` guard in `onSuccess` is sufficient.
- Next free BACKLOG task ID after authoring this plan: **TASK-142**.
