# Plan 023: Order Confirmation Page (store-client)

> **Status:** ✅ Complete (manual smoke test pending running app)
> **Phase:** Phase 3 — Checkout & Orders
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11

## Overview

The checkout flow (TASK-035, Plan 022, Done) ends by redirecting to
`/orders/[id]/confirmation`, which currently renders a minimal stub — a static "Thank you
for your order" heading plus the raw order UUID. TASK-036 replaces that stub with the full
Order Confirmation Page UI.

The page fetches the real order by ID via the Orval hook `useGetOrder`, applies the same
auth-gate pattern already established in `CheckoutView`, and renders a structured
confirmation: order number, placed date, status badge, line-item summary with snapshotted
prices, shipping address, billing address (if different), totals breakdown (subtotal,
discount, shipping, tax, grand total), and CTAs.

This is a read-only presentational page. All monetary arithmetic was computed server-side
and is stored as strings on `OrderEntity`; the frontend only formats and displays them.

**Stub file to overwrite:**
`apps/store-client/src/app/orders/[id]/confirmation/page.tsx`

## Scope

### In Scope

- `widgets/order-confirmation/` slice:
  - `OrderConfirmationSkeleton` — two-panel loading placeholder consistent with
    `CartSkeleton` / `CheckoutOrderSummary` skeleton patterns
  - `OrderConfirmationHeader` — order number (formatted UUID prefix), placed date, order
    status badge, payment status badge
  - `OrderItemList` — ordered list of `OrderItemEntity` rows (name, variant, qty, unit
    price, line total)
  - `OrderAddressSummary` — shipping address block; billing address block only when
    `billingAddress` differs from `shippingAddress` (or when it is explicitly present)
  - `OrderTotalsBreakdown` — subtotal; discount row (only when `discount !== "0"`);
    shipping cost row (only when `shippingCost !== "0"`); tax row (only when `tax !== "0"`);
    grand total row
  - `OrderConfirmationView` — client orchestrator: auth-gate, `useGetOrder` loading /
    error / not-found states, success render, "Continue shopping" CTA
  - `widgets/order-confirmation/index.ts` — barrel
- Update `widgets/index.ts` — add `OrderConfirmationView` export
- Rewrite `app/orders/[id]/confirmation/page.tsx` — keep Server Component, `params:
Promise<{ id: string }>`, export `generateMetadata`, pass `orderId` to
  `<OrderConfirmationView orderId={id} />` wrapped in `<Suspense>`
- Final verification gate: typecheck + lint + build + manual smoke test

### Out of Scope

- Order history list page (`/orders`) — route does not exist yet
- Order cancellation UI
- Payment status actions or payment-retry UI (TASK-034 Payment integration is ⬜)
- Email order confirmation (TASK-037, separate plan)
- Admin order views (Phase 4, TASK-041)
- Optimistic updates or real-time status polling
- Print/PDF export of the confirmation
- Estimated delivery date display (no backend field)

## User Stories

1. As a customer who just completed checkout, I want to land on a confirmation page that
   shows my real order details (order number, items, totals, and shipping address), so that
   I can verify my purchase was placed correctly.
2. As a customer visiting `/orders/[id]/confirmation` while not logged in, I want to be
   redirected to the login page with a `redirect` query param, so that I can sign in and
   return to my confirmation without re-entering the URL.
3. As a customer visiting a confirmation URL for an order that does not belong to me (or
   does not exist), I want to see a friendly "order not found" message with a link home,
   so that I do not see a blank crash screen or a leaked error trace.
4. As a customer, I want the totals breakdown to only show non-zero optional lines
   (discount, shipping, tax), so that the page is clean for simple orders where those
   lines are zero.
5. As a customer, I want a "Continue shopping" CTA that takes me back to the home page,
   so that I can easily resume browsing after placing my order.

## Technical Design

### No Prisma Changes

This is a pure frontend task. The Order backend (TASK-033) and Orval regeneration
(TASK-033-J) are already complete. No schema or backend changes are required.

### API Contract

| Method | Path              | Hook          | Auth     | Response                                 |
| ------ | ----------------- | ------------- | -------- | ---------------------------------------- |
| GET    | `/api/orders/:id` | `useGetOrder` | Required | `GetOrder200` (`{ data?: OrderEntity }`) |

Hook signature (from generated `orders/orders.ts`):

```ts
useGetOrder(orderId: string, options?, queryClient?)
// Returns UseQueryResult; data is GetOrder200 = OrderResponseEnvelope & { data?: OrderEntity }
// The order is at result.data?.data — always narrow with optional chaining.
```

The backend applies `JwtAuthGuard` and scopes to the owning user: an unauthenticated
request or a request for another user's order returns an HTTP error (404 or 403). The
frontend treats both as "order not found" and renders the not-found state rather than
crashing.

### entities/order Barrel — No Changes Needed

`apps/store-client/src/entities/order/index.ts` already exports (verified):

```ts
// types
OrderEntity, OrderItemEntity, OrderResponseEnvelope, GetOrder200, AddressDto, ...
// hooks
useGetOrder, getGetOrderQueryKey, ...
```

The implementer MUST NOT add duplicate exports to the barrel. Import from
`@/entities/order` throughout.

### OrderEntity Shape (Verified)

```ts
// apps/store-client/src/shared/api/generated/models/orderEntity.ts
interface OrderEntity {
  id: string; // UUID — display prefix as order number
  userId: string;
  status: OrderEntityStatus; // "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED"
  paymentStatus: OrderEntityPaymentStatus; // "PENDING" | "PAID" | "FAILED" | "REFUNDED"
  subtotal: string; // monetary string — parse with Number(), format with Intl.NumberFormat
  discount: string;
  shippingCost: string;
  tax: string;
  total: string;
  shippingAddress: OrderEntityShippingAddress; // { [key: string]: unknown } | null
  billingAddress: OrderEntityBillingAddress; // { [key: string]: unknown } | null
  notes: OrderEntityNotes; // string | null
  items: OrderItemEntity[];
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

interface OrderItemEntity {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  price: string; // unit price, snapshotted at purchase time
  lineTotal: string; // price × quantity
  createdAt: string;
}
```

`OrderEntityShippingAddress` and `OrderEntityBillingAddress` are typed as
`{ [key: string]: unknown } | null` (Orval generates nullable object types for address
snapshots). The implementer must check the exact generated types in
`orderEntityShippingAddress.ts` and `orderEntityBillingAddress.ts` and cast / narrow
appropriately when reading fields such as `firstName`, `lastName`, `address1`, `city`,
`country`. A safe approach: define a local `AddressSnapshot` interface matching the known
`AddressDto` fields and cast with `as AddressSnapshot | null`.

### Currency Formatting

`CheckoutOrderSummary` (in `widgets/checkout/ui/checkout-order-summary.tsx`) already
defines the canonical formatter used in this project:

```ts
const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : value;
}
```

The implementer MUST copy this exact formatter (or extract it to `shared/utils` in a
separate refactor task) rather than introducing a second formatter. Do NOT do arithmetic on
the monetary strings — they are display values only. Use `Number(value)` purely for
formatting.

### Auth-Gate Strategy

`OrderConfirmationView` reads `{ isAuthenticated, isInitializing }` from `useAuth()`:

- `isInitializing === true` → render `<OrderConfirmationSkeleton />` (silent refresh
  in-flight; avoid flash-redirect for already-authenticated users).
- `isInitializing === false && !isAuthenticated` → `router.replace('/login?redirect=/orders/${orderId}/confirmation')` inside `useEffect`; render skeleton while navigation settles.
- `isAuthenticated === true` → enable `useGetOrder(orderId)` and render based on its state.

This matches the pattern in `CheckoutView` (TASK-035-G) exactly.

### useGetOrder Query Enablement

Pass `{ query: { enabled: isAuthenticated } }` to `useGetOrder` so the hook does not fire
an unauthenticated request during the `isInitializing` window:

```ts
const { data, isLoading, isError } = useGetOrder(orderId, {
  query: { enabled: isAuthenticated },
});
const order = data?.data;
```

### Not-Found / Error State

The backend returns an HTTP error (404 or similar) when the order does not exist or does
not belong to the authenticated user. `isError` will be `true` in both cases. Render a
friendly not-found panel rather than crashing:

```tsx
// When isError === true:
<div role="alert" className="...">
  <h1>We couldn't find that order</h1>
  <p>The order may not exist or may belong to a different account.</p>
  <Link href="/">Go to home page</Link>
</div>
```

### Totals Breakdown — Conditional Rows

Render a line only when the value is non-zero. Use this guard:

```ts
function isNonZero(value: string): boolean {
  return Number(value) !== 0;
}
```

Lines to conditionally render: `discount`, `shippingCost`, `tax`. Always render:
`subtotal` and `total`.

### FSD Architecture

```
app/
  orders/
    [id]/
      confirmation/
        page.tsx                          — Server Component (rewritten); exports generateMetadata;
                                            awaits params; renders <OrderConfirmationView orderId={id} />
                                            wrapped in <Suspense fallback={<OrderConfirmationSkeleton />}>

widgets/
  order-confirmation/
    ui/
      order-confirmation-skeleton.tsx     — 'use client' or pure RSC; loading placeholder
      order-confirmation-header.tsx       — order number, placed date, status badges
      order-item-list.tsx                 — line-item table/list
      order-address-summary.tsx           — shipping + optional billing address blocks
      order-totals-breakdown.tsx          — subtotal / discount / shipping / tax / total
      order-confirmation-view.tsx         — 'use client'; auth-gate + query orchestration
    index.ts                              — barrel

  index.ts                                — add OrderConfirmationView export
```

### Server vs Client Split

| File                                                            | Type   | Rationale                                                        |
| --------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `app/orders/[id]/confirmation/page.tsx`                         | Server | Awaits params Promise; exports metadata; no hooks                |
| `widgets/order-confirmation/ui/order-confirmation-view.tsx`     | Client | Calls `useAuth`, `useGetOrder`, `useRouter`, `useEffect`         |
| `widgets/order-confirmation/ui/order-confirmation-skeleton.tsx` | Either | No hooks; can be Server Component or 'use client' — keep it pure |
| `widgets/order-confirmation/ui/order-confirmation-header.tsx`   | Either | Pure presentational; receives props only                         |
| `widgets/order-confirmation/ui/order-item-list.tsx`             | Either | Pure presentational; receives `items: OrderItemEntity[]`         |
| `widgets/order-confirmation/ui/order-address-summary.tsx`       | Either | Pure presentational; receives address snapshot props             |
| `widgets/order-confirmation/ui/order-totals-breakdown.tsx`      | Either | Pure presentational; receives monetary string props              |

Only `OrderConfirmationView` needs `'use client'`. All sub-components receive data as
props and have no hooks — they do NOT need the directive and should not add it unless they
have their own state or effects.

### Status Badge Design

Render order and payment status as small coloured badge spans using design tokens:

| Status value | Suggested token class                      |
| ------------ | ------------------------------------------ |
| PENDING      | `bg-muted text-muted-foreground`           |
| CONFIRMED    | `bg-primary/10 text-primary`               |
| PROCESSING   | `bg-primary/20 text-primary`               |
| SHIPPED      | `bg-primary/30 text-primary`               |
| DELIVERED    | `bg-primary/10 text-primary font-semibold` |
| CANCELLED    | `bg-destructive/10 text-destructive`       |
| REFUNDED     | `bg-destructive/10 text-destructive`       |
| PAID         | `bg-primary/10 text-primary`               |
| FAILED       | `bg-destructive/10 text-destructive`       |

These are guidelines. The implementer may adjust token classes as long as no raw hex values
are used. Accessibility: badge `<span>` should have `aria-label` or be wrapped in a
`<dl>/<dt>/<dd>` pair so screen readers convey meaning.

## Tasks

---

### TASK-036-A: Verify entities/order barrel — no changes required

**Type:** chore
**Scope:** store-client
**Complexity:** S (15min)
**TDD Required:** No
**Depends on:** TASK-035-A (already done — barrel exists)

**Note (TDD):** No business logic lives here. The barrel is a re-export file; verification
is sufficient.

**Acceptance Criteria:**

- [ ] Read `apps/store-client/src/entities/order/index.ts` and confirm it exports:
  - `useGetOrder` (hook)
  - `getGetOrderQueryKey` (query key factory)
  - `OrderEntity`, `OrderItemEntity`, `GetOrder200`, `OrderResponseEnvelope` (types)
- [ ] Confirm no duplicate exports exist with any other entity barrel
- [ ] If any export is missing, add it; otherwise leave the file unchanged
- [ ] `npm run typecheck -w apps/store-client` passes with no new errors

**Files to create/modify:**

- `apps/store-client/src/entities/order/index.ts` — verify only; modify only if an export
  is genuinely missing

---

### TASK-036-B: Create OrderConfirmationSkeleton

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-036-A

**Note (TDD):** Purely presentational skeleton with no logic. TDD does not apply to layout
components; all order math was computed server-side and is already covered by Order module
unit tests.

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/ui/order-confirmation-skeleton.tsx` created
- [ ] Mirrors the two-panel layout of the confirmation page: a header block on top, then a
      two-column section (item list on the left, totals panel on the right) on large screens,
      stacked on mobile
- [ ] Uses `<Skeleton>` from `@/shared/ui` for all placeholder elements — consistent with
      `CartSkeleton` in `widgets/cart/ui/cart-skeleton.tsx`
- [ ] Has `aria-hidden="true"` on the root element (same as `CartSkeleton`)
- [ ] No hooks, no `'use client'` directive
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-skeleton.tsx` — new file

---

### TASK-036-C: Create OrderConfirmationHeader

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-036-A

**Note (TDD):** Presentational component receiving typed props. No business logic.

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/ui/order-confirmation-header.tsx` created
- [ ] Props interface:
  ```ts
  interface OrderConfirmationHeaderProps {
    orderId: string;
    status: OrderEntityStatus;
    paymentStatus: OrderEntityPaymentStatus;
    createdAt: string; // ISO timestamp
  }
  ```
- [ ] Renders:
  - `<h1>` "Order Confirmed!" or "Thank you for your order!"
  - Order number line: "Order #" + first 8 characters of `orderId` (uppercase, e.g.
    `#A1B2C3D4`) — the full UUID is verbose; the prefix is sufficient for visual reference.
    The full `orderId` is still passed to the page as the URL param for data fetching
  - Placed date: format `createdAt` using `new Date(createdAt).toLocaleDateString("en-US",
{ year: "numeric", month: "long", day: "numeric" })`
  - Order status badge (colour-coded per the Status Badge Design table in Technical Design)
  - Payment status badge
- [ ] `OrderEntityStatus` and `OrderEntityPaymentStatus` imported as types from
      `@/entities/order`
- [ ] No hooks; no `'use client'` directive; receives all data via props
- [ ] Design tokens only; no raw hex values
- [ ] Accessibility: status badges include `aria-label` or are inside a `<dl>` with
      `<dt>` / `<dd>` pairs
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-header.tsx` — new file

---

### TASK-036-D: Create OrderItemList

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-036-A

**Note (TDD):** Read-only display of snapshotted data. No business logic — all line totals
are pre-computed by the backend OrderService (already TDD-covered in TASK-033-F/G).

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/ui/order-item-list.tsx` created
- [ ] Props interface:
  ```ts
  interface OrderItemListProps {
    items: OrderItemEntity[];
  }
  ```
- [ ] `OrderItemEntity` imported as a type from `@/entities/order`
- [ ] Renders `<h2>` "Items Ordered" followed by a `<ul>` of item rows
- [ ] Each item row renders:
  - `productName`
  - `variantName` (only when non-null / non-empty — use the same `asString` / nullish
    guard pattern used in `CheckoutOrderSummary`)
  - `quantity` + formatted `price` (unit price)
  - Formatted `lineTotal` (right-aligned)
- [ ] Price formatting uses the same `formatPrice` pattern as `CheckoutOrderSummary`
      (see Technical Design — Currency Formatting section). Copy or reference; do not
      introduce a different formatter
- [ ] No hooks; no `'use client'` directive
- [ ] Design tokens only; no raw hex values
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-item-list.tsx` — new file

---

### TASK-036-E: Create OrderAddressSummary

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-036-A

**Note (TDD):** Presentational address block. No business logic.

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/ui/order-address-summary.tsx` created
- [ ] Accepts:
  ```ts
  interface OrderAddressSummaryProps {
    shippingAddress: OrderEntityShippingAddress; // { [key: string]: unknown } | null
    billingAddress: OrderEntityBillingAddress; // { [key: string]: unknown } | null
  }
  ```
- [ ] Defines a local `AddressSnapshot` interface matching the known `AddressDto` fields:
      `firstName`, `lastName`, `company?`, `address1`, `address2?`, `city`, `state?`,
      `postalCode`, `country`, `phone?` — all `string | undefined`; casts the incoming
      address objects as `AddressSnapshot | null`
- [ ] Renders `<h2>` "Shipping Address" + formatted shipping address block when
      `shippingAddress` is not null
- [ ] Renders `<h2>` "Billing Address" + formatted billing address block only when
      `billingAddress` is not null (the backend stores null when billing === shipping,
      so a null `billingAddress` means "same as shipping" — do not render a redundant block)
- [ ] When `shippingAddress` is null, renders nothing for that section (graceful
      degradation — should not happen in practice for valid orders)
- [ ] No hooks; no `'use client'` directive
- [ ] Design tokens only; no raw hex values
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-address-summary.tsx` — new file

---

### TASK-036-F: Create OrderTotalsBreakdown

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-036-A

**Note (TDD):** Pure display component; formats and renders pre-computed strings from
the server. No arithmetic is performed; all totals were computed and TDD-tested in
TASK-033-F/G (OrderService). Introducing tests here would duplicate server-side coverage
without adding value.

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/ui/order-totals-breakdown.tsx` created
- [ ] Props interface:
  ```ts
  interface OrderTotalsBreakdownProps {
    subtotal: string;
    discount: string;
    shippingCost: string;
    tax: string;
    total: string;
  }
  ```
- [ ] Implements `isNonZero(value: string): boolean` returning `Number(value) !== 0` to
      gate conditional rows — uses only `Number()` for the non-zero check, never for display
- [ ] Renders:
  - Always: "Subtotal" row with formatted `subtotal`
  - Conditional: "Discount" row (shown only when `isNonZero(discount)`) with formatted
    `discount` displayed as a negative value (e.g. `–$5.00`)
  - Conditional: "Shipping" row (shown only when `isNonZero(shippingCost)`) with formatted
    `shippingCost`
  - Conditional: "Tax" row (shown only when `isNonZero(tax)`) with formatted `tax`
  - Always: `<hr>` separator then "Total" row with formatted `total` in bold
- [ ] Price formatting uses `formatPrice` consistent with `CheckoutOrderSummary` pattern
- [ ] No hooks; no `'use client'` directive
- [ ] Design tokens only; no raw hex values
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-totals-breakdown.tsx` — new file

---

### TASK-036-G: Create OrderConfirmationView orchestrator

**Type:** feat
**Scope:** store-client
**Complexity:** M (3-4h)
**TDD Required:** No
**Depends on:** TASK-036-B, TASK-036-C, TASK-036-D, TASK-036-E, TASK-036-F

**Note (TDD):** This is a client orchestrator that wires auth-gating, data fetching, and
presentational sub-components together. No business logic resides here — it delegates to
sub-components and to the Orval hook. TDD is not applied to React orchestrators in this
project (consistent with `CheckoutView`, `CartView`, etc.).

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/ui/order-confirmation-view.tsx` is a `'use client'`
      component
- [ ] Accepts `orderId: string` as a prop
- [ ] Imports `useAuth` from `@/entities/session`
- [ ] Imports `useGetOrder` from `@/entities/order`
- [ ] Auth-gate (identical pattern to `CheckoutView`):
  - While `isInitializing === true`: return `<OrderConfirmationSkeleton />`
  - When `isInitializing === false && !isAuthenticated`: call
    `router.replace('/login?redirect=/orders/${orderId}/confirmation')` in `useEffect`;
    return `<OrderConfirmationSkeleton />`
  - When `isAuthenticated === true`: proceed
- [ ] Calls `useGetOrder(orderId, { query: { enabled: isAuthenticated } })`
- [ ] Loading state (`isLoading === true`): render `<OrderConfirmationSkeleton />`
- [ ] Error state (`isError === true` — includes order-not-found and order-not-owned):
  - Render a `role="alert"` container with:
    - `<h1>` "We couldn't find that order"
    - `<p>` "The order may not exist or may belong to a different account."
    - `<Link href="/">Go to home page</Link>` styled as a primary button (matching the
      stub page's CTA: `rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground
hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`)
- [ ] `order = data?.data` — always narrow with optional chaining; if `order` is undefined
      after a successful fetch, treat as error (render the not-found state)
- [ ] Success state: render the full confirmation layout:
  ```
  <div> (outer container: max-w-4xl, centred, px-4 py-8 gap-8 flex flex-col)
    <OrderConfirmationHeader
      orderId={order.id}
      status={order.status}
      paymentStatus={order.paymentStatus}
      createdAt={order.createdAt}
    />
    <div> (two-column on lg: items lg:col-span-2, totals+address lg:col-span-1)
      <section> (left)
        <OrderItemList items={order.items} />
        <OrderAddressSummary
          shippingAddress={order.shippingAddress}
          billingAddress={order.billingAddress}
        />
      </section>
      <aside> (right)
        <OrderTotalsBreakdown
          subtotal={order.subtotal}
          discount={order.discount}
          shippingCost={order.shippingCost}
          tax={order.tax}
          total={order.total}
        />
        {order.notes && (
          <div>
            <h2>Order Notes</h2>
            <p>{order.notes}</p>
          </div>
        )}
      </aside>
    </div>
    <div> (CTAs row)
      <Link href="/">Continue shopping</Link>
      // "View my orders" CTA is deferred — /orders list page does not exist yet
    </div>
  </div>
  ```
- [ ] FSD layer rule respected: `widgets/order-confirmation` imports from `entities/*`,
      `shared/*` only — never from `app/` or `features/`
- [ ] Design tokens only; no raw hex values
- [ ] All interactive elements are keyboard-focusable with `focus-visible:ring-ring` class
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-confirmation-view.tsx` — new file

---

### TASK-036-H: Create widgets/order-confirmation barrel and update widgets/index.ts

**Type:** chore
**Scope:** store-client
**Complexity:** S (15min)
**TDD Required:** No
**Depends on:** TASK-036-B through TASK-036-G

**Note (TDD):** Barrel file — no logic; no tests needed.

**Acceptance Criteria:**

- [ ] `src/widgets/order-confirmation/index.ts` created; exports:
  - `OrderConfirmationView` from `./ui/order-confirmation-view`
  - `OrderConfirmationSkeleton` from `./ui/order-confirmation-skeleton`
- [ ] `src/widgets/index.ts` updated to add:
  ```ts
  export {
    OrderConfirmationView,
    OrderConfirmationSkeleton,
  } from "./order-confirmation";
  ```
  — inserted below the existing `CheckoutView` / `CheckoutOrderSummary` line to keep
  exports grouped by feature area
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/index.ts` — new file
- `apps/store-client/src/widgets/index.ts` — add `OrderConfirmationView` +
  `OrderConfirmationSkeleton` exports

---

### TASK-036-I: Rewrite app/orders/[id]/confirmation/page.tsx

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-036-G, TASK-036-H

**Note (TDD):** Route file — thin Server Component delegating to the widget. No logic to
test independently.

**Acceptance Criteria:**

- [ ] `src/app/orders/[id]/confirmation/page.tsx` is rewritten as a Server Component (no
      `'use client'` directive)
- [ ] Accepts `params: Promise<{ id: string }>` — consistent with App Router convention
      used throughout this project (matches the existing stub signature)
- [ ] Exports `generateMetadata`:
  ```ts
  export async function generateMetadata({
    params,
  }: OrderConfirmationPageProps): Promise<Metadata> {
    const { id } = await params;
    return {
      title: `Order ${id.slice(0, 8).toUpperCase()} Confirmed | MobileStore`,
    };
  }
  ```
- [ ] Default export renders:
  ```tsx
  const { id } = await params;
  return (
    <Suspense fallback={<OrderConfirmationSkeleton />}>
      <OrderConfirmationView orderId={id} />
    </Suspense>
  );
  ```
- [ ] `OrderConfirmationView` and `OrderConfirmationSkeleton` imported from `@/widgets`
- [ ] Does NOT add a second `<main>` wrapper — root layout provides it
- [ ] The stub placeholder content ("Full order details coming soon.") is fully removed
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/app/orders/[id]/confirmation/page.tsx` — rewrite (overwrites stub)

---

### TASK-036-J: Build / lint / typecheck / smoke verification

**Type:** test
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-036-A through TASK-036-I

**Note (TDD):** Verification gate only — no new code is written here. The absence of unit
tests for this page is intentional: it is a read-only presentational page; all order
calculations are covered by the Order module unit tests (TASK-033-F/G). Full checkout-to-
confirmation E2E coverage is deferred to a future E2E test plan.

**Acceptance Criteria:**

- [ ] `npm run typecheck -w apps/store-client` exits 0 — no TypeScript errors across the
      entire `store-client` workspace
- [ ] `npm run lint -w apps/store-client` exits 0 — no ESLint errors; FSD layer boundary
      rules (`import/no-restricted-paths`) pass
- [ ] `npm run build -w apps/store-client` exits 0 — production Next.js build succeeds;
      no missing imports or unresolved modules
- [ ] Manual smoke test (requires running API + DB):
  - Complete a checkout flow → land on `/orders/[id]/confirmation`
  - Page renders the real order: order number prefix, status badge (PENDING), item list
    with product names and prices, shipping address, grand total
  - Payment status badge shows "PENDING" (before payment integration)
  - Page title in browser tab shows "Order [PREFIX] Confirmed | MobileStore"
  - "Continue shopping" CTA navigates to `/`
  - Visit `/orders/[id]/confirmation` while logged out → redirected to
    `/login?redirect=/orders/[id]/confirmation`
  - Visit `/orders/[NONEXISTENT_ID]/confirmation` while logged in → "We couldn't find
    that order" message with link home
  - Visit `/orders/[OTHER_USERS_ORDER_ID]/confirmation` while logged in → "We couldn't
    find that order" message (backend returns error for non-owned orders)

**Files to create/modify:**

- No new files; verification only

---

## Migration Steps (Implementation Order)

1. **TASK-036-A** — Verify `entities/order` barrel (5 min; confirms exports are in place
   before any widget imports from it)
2. **TASK-036-B** — `OrderConfirmationSkeleton` (no deps on other new files; can be built
   first to enable fast visual prototyping)
3. **TASK-036-C through TASK-036-F** — Presentational sub-components (can be developed in
   parallel; each only depends on TASK-036-A and receives all data via props):
   - TASK-036-C: `OrderConfirmationHeader`
   - TASK-036-D: `OrderItemList`
   - TASK-036-E: `OrderAddressSummary`
   - TASK-036-F: `OrderTotalsBreakdown`
4. **TASK-036-G** — `OrderConfirmationView` orchestrator (depends on B–F being complete)
5. **TASK-036-H** — Barrel + `widgets/index.ts` update (depends on G)
6. **TASK-036-I** — Rewrite `app/orders/[id]/confirmation/page.tsx` (depends on H)
7. **TASK-036-J** — Verification gate

Steps 3 (C through F) are fully independent of each other and can be developed in
parallel by multiple developers or in a single sitting in any order.

## Risks and Mitigations

| Risk                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `GetOrder200.data` is `data?: OrderEntity` (optional). Accessing `.id` or `.items` without narrowing crashes at runtime.                                                                                          | Always narrow with `const order = data?.data`. After the query resolves successfully, if `order` is `undefined`, treat it as the not-found / error state — same guard as the `isError` branch.                                                               |
| Auth-gate flash: `isInitializing` is `true` for ~200ms on every page load while the silent refresh fires. Without a guard, `OrderConfirmationView` would redirect unauthenticated users even for logged-in users. | Guard on `isInitializing`: render `<OrderConfirmationSkeleton />` while `true`; redirect only when `isInitializing === false && !isAuthenticated`. Exact same pattern as `CheckoutView` (TASK-035-G).                                                        |
| Order-not-owned returns an HTTP error (404 or 403). Without explicit handling, `isError` becomes `true` and the page would crash or render an ugly error.                                                         | The `isError` branch in `OrderConfirmationView` renders the friendly "We couldn't find that order" panel — covers both not-found and not-owned cases uniformly.                                                                                              |
| `OrderEntityShippingAddress` is typed as `{ [key: string]: unknown }                                                                                                                                              | null` — field access without casting will produce TypeScript errors.                                                                                                                                                                                         | Define a local `AddressSnapshot` interface in `order-address-summary.tsx` matching `AddressDto` fields; cast with `as AddressSnapshot | null`. Document the cast in a comment. |
| Monetary values are strings. Doing arithmetic (e.g. `Number(subtotal) - Number(discount)`) would re-derive values that should only come from the server.                                                          | All arithmetic is performed server-side. Frontend uses `Number()` solely to invoke `Intl.NumberFormat`. The `isNonZero` helper also uses `Number()` only for a zero-check, not for display. Never add, subtract, or multiply monetary strings on the client. |
| The page is the post-checkout redirect target; the cart was emptied by the backend when the order was created. The page must not depend on cart state.                                                            | `OrderConfirmationView` does NOT call `useGetCart` at any point — it only calls `useGetOrder`. There is no cart dependency or empty-cart guard on this page.                                                                                                 |
| Duplicate `formatPrice` implementation: introducing a second formatter (e.g. in a new `utils` file) risks diverging from the `CheckoutOrderSummary` implementation.                                               | Copy the exact `priceFormatter` + `formatPrice` from `checkout-order-summary.tsx` into the widget files that need it. A future tech-debt task may extract it to `shared/utils`; that refactor is explicitly out of scope here.                               |
| `useGetOrder` may fire before auth is initialised, returning a 401 that TanStack Query retries unnecessarily.                                                                                                     | Pass `{ query: { enabled: isAuthenticated } }` to `useGetOrder` so the query only fires when authentication is confirmed.                                                                                                                                    |

## Notes

### "View my orders" CTA deferred

The order-history list page (`/orders`) does not exist. The "View my orders" button is
therefore intentionally omitted from `OrderConfirmationView`. It will be added when the
order history page is planned. The only CTA on this page is "Continue shopping" → `/`.

### Monetary String Contract

All five monetary fields on `OrderEntity` (`subtotal`, `discount`, `shippingCost`, `tax`,
`total`) are `string` typed in the generated model. They are decimal strings produced by
Prisma's `Decimal` serialisation (e.g. `"12.99"`, `"0"`, `"0.00"`). The frontend should
treat them as opaque display strings after formatting — do not convert, round, or sum them.

### Address Snapshot Nullability

The backend stores shipping and billing address snapshots as a JSON blob in the `Order`
table. Orval generates the TypeScript type as `{ [key: string]: unknown } | null`. In
practice, for any valid completed order the shipping address will always be present.
The billing address is null when the customer did not provide a separate billing address
(i.e. it defaults to shipping). Treat null billing address as "same as shipping" and
omit the billing address block rather than showing a redundant duplicate.

### Orval-Generated Files

Files under `apps/store-client/src/shared/api/generated/` are auto-generated and must
not be hand-edited. Consume all order types and hooks exclusively via the
`@/entities/order` barrel (`src/entities/order/index.ts`).
