# Plan: Build CartPage with Quantity Management (store-client)

> **Status:** To Do
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11
> **Revised:** 2026-06-11 — Updated for guest-cart architecture (Plan 017 / TASK-051).
> The CartPage now works fully for unauthenticated guests via `cartToken` HttpOnly cookie.
> The previous 401 sign-in-gate assumption has been removed. Cross-links added to
> docs/plans/017-guest-cart-backend.md (TASK-051) and docs/plans/018-storefront-auth.md
> (TASK-052).

## Overview

Build the `/cart` route in `apps/store-client` — the shopping cart page for the Mobile
Accessories storefront. Any visitor — authenticated or anonymous — who has added items to
their cart lands on this page to review their selections, adjust quantities, remove items,
and see the calculated cart total before proceeding to checkout.

**Prerequisites (dependency chain):**

- **TASK-051 (Plan 017 — Guest Cart Backend)** must be complete before this page is built.
  That plan migrates the Cart model to support nullable `userId` + `token`, removes
  `@UseGuards(JwtAuthGuard)` from all cart endpoints, and regenerates Orval hooks (TASK-051-J).
- **TASK-051-J (Orval regeneration)** specifically must complete before TASK-031 so the
  generated cart hooks reflect the new schema (no 401 response, nullable `userId` in
  `CartEntity`).
- TASK-031 does NOT depend on TASK-052 (storefront auth). A guest can use the CartPage
  without ever logging in. Storefront auth (TASK-052) adds the authenticated user experience
  (merged cart, header login state) on top of an already-functional CartPage.

**Architecture — guest-cart model:** After TASK-051, the backend identifies the cart by
`userId` when a valid JWT is present, or by the `cartToken` HttpOnly cookie when no JWT is
present. On the first `GET /api/cart` call with no cookie and no JWT, the backend issues a
`Set-Cookie: cartToken=<uuid>; HttpOnly; Path=/api` response header — the browser stores
it automatically. All subsequent cart calls from the same browser include this cookie, so
the guest cart persists across page reloads without any JavaScript token management.

**Frontend auth status:** `shared/api/instance.ts` has `withCredentials: true` (already set),
so the `cartToken` cookie is sent automatically on every cart request. The CartPage does NOT
need to know about or manage the cookie. No JWT interceptor is required for the CartPage to
function — that is added by TASK-052.

**Scope boundary with TASK-032 (AddToCart):** TASK-031 focuses exclusively on viewing and
managing the contents of an existing cart — quantity adjustments, item removal, and total
display. Adding items to the cart from product pages (the `POST /api/cart/items` flow) is
the sole responsibility of TASK-032. The CartPage does not need to call `useAddToCart`.

## API Status — No Blockers After TASK-051-J

All required hooks exist and are correctly typed in the generated client after TASK-051-J
(Orval regeneration). They are **already re-exported** from `shared/api/index.ts`.

Cart endpoints no longer require authentication. The backend uses `OptionalJwtAuthGuard` +
`CartIdentityInterceptor` to identify the cart from JWT or `cartToken` cookie.

| Hook            | Generated name      | HTTP   | Endpoint                  | Auth required                    |
| --------------- | ------------------- | ------ | ------------------------- | -------------------------------- |
| Get cart        | `useGetCart`        | GET    | `/api/cart`               | NO — works for guests via cookie |
| Update quantity | `useUpdateCartItem` | PATCH  | `/api/cart/items/:itemId` | NO                               |
| Remove item     | `useRemoveCartItem` | DELETE | `/api/cart/items/:itemId` | NO                               |
| Clear cart      | `useClearCart`      | DELETE | `/api/cart`               | NO                               |
| Add item        | `useAddToCart`      | POST   | `/api/cart/items`         | NO — used by TASK-032 only       |

Query key helpers:

| Helper                 | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `getGetCartQueryKey()` | Returns `['/api/cart']` — used for `queryClient.invalidateQueries` after mutations |

Response type chain for all cart endpoints (confirmed from generated models):

```ts
// GET /api/cart returns GetCart200
type GetCart200 = CartResponseEnvelope & { data?: CartEntity };

// CartEntity — updated after TASK-051-A (userId is now nullable for guest carts)
interface CartEntity {
  id: string;
  userId: string | null; // null for guest carts; string for user carts
  items: CartItemEntity[];
  totals: CartTotals; // subtotal: string, itemCount: number, uniqueItems: number
  createdAt: string;
  updatedAt: string;
}

// CartItemEntity
interface CartItemEntity {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  productName: string;
  price: string; // unit price — "29.99"
  compareAtPrice?: string | null;
  variantName?: string | null;
  stock: number; // available stock for this variant/product
  isActive: boolean;
  lineTotal: string; // price * quantity — "59.98"
  createdAt: string;
  updatedAt: string;
}

// CartTotals
interface CartTotals {
  subtotal: string; // sum of all lineTotals — "149.97"
  itemCount: number; // total units
  uniqueItems: number; // distinct line items
}
```

**Note on `CartResponseEnvelope`:** The generated `CartResponseEnvelope` is typed as
`{ [key: string]: unknown }` (weak type from the OpenAPI `allOf` pattern). All five response
types (`GetCart200`, `AddToCart201`, `UpdateCartItem200`, `RemoveCartItem200`, `ClearCart200`)
are typed as `CartResponseEnvelope & { data?: CartEntity }`. The `data` field must always
be accessed via optional chaining (`response?.data`) and narrowed before use. This is an
existing pattern — the same design was used in TASK-030 for product response envelopes.

**No `entities/cart` slice exists yet.** One must be created as the first sub-task, mirroring
`entities/product/index.ts`. Upper-layer components (widgets) must import cart types and hooks
from `@/entities/cart`, never directly from the generated path.

## Scope

### In Scope

- Route `app/cart/page.tsx` (new — no such route exists today)
- `entities/cart` new entity slice — barrel re-exporting cart types and hooks
- `widgets/cart` new widget slice containing:
  - `CartView` — Client Component; root orchestrator; calls `useGetCart`, renders all states
  - `CartItemRow` — Client Component; single line item with quantity stepper and remove button
  - `CartSummary` — Client Component; displays subtotal, item count, and a checkout CTA placeholder
  - `CartSkeleton` — Server-compatible skeleton matching the full cart layout
- Quantity stepper per line item: decrement / direct input / increment; clamped `1..min(99, stock)`
- Remove item button per line item (`useRemoveCartItem`)
- Update quantity mutation (`useUpdateCartItem`); setting quantity to 0 removes the item (server handles this)
- Clear cart button (`useClearCart`)
- Cart totals display: subtotal (from `CartTotals.subtotal`), total item count
- Empty-cart state: message + link to `/products` (shown for both guests and logged-in users)
- Loading skeleton (full-page) while `useGetCart` is pending
- Error state for genuine API errors such as 5xx or network failures (inline `role="alert"`)
  — NOTE: 401 is no longer a valid error state for cart endpoints after TASK-051; any 401
  from a cart call would indicate a backend misconfiguration, not a missing user session
- Mutation strategy: **refetch-on-success** (not optimistic) — after each mutation resolves,
  call `queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` so the server's
  recalculated totals replace the local state. This is safe because:
  - The server always returns the updated full cart on every mutation response
  - Quantity clamping and stock validation are server-side; optimistic updates would need
    to duplicate that logic
  - For MVP, the minor UX difference (brief loading flash) is acceptable; optimistic updates
    can be layered on in Phase 5
- Accessible: `<main>` landmark exists in layout; page uses `<section>`, `<ul>`, `aria-live`
  for cart update notifications, keyboard-navigable stepper buttons, `aria-label` on icon buttons
- Design tokens only — no raw hex values
- Page-level `metadata` export (`"Cart | MobileStore"`)
- Responsive layout: single column on mobile, two-column (items | summary) on `lg:`

### Out of Scope

- Adding items to cart from product pages (TASK-032 — `useAddToCart`)
- Frontend authentication flow — login page, JWT storage, axios interceptor (TASK-052, Plan 018)
- Cart merge trigger — handled entirely by the backend (TASK-051-H); no frontend action needed
- Checkout flow (TASK-035 — Phase 3)
- Coupon / discount code input (no backend support in current `CartTotals`)
- Shipping cost estimate (Phase 3)
- Tax calculation (Phase 3)
- Product images in cart line items (no image field on `CartItemEntity`; a `bg-muted` placeholder is used)
- Cart badge / item count in the header (CartWidget — future task after TASK-032)
- `loading.tsx` or `error.tsx` route-level files (per-component states are used, per homepage convention)
- Optimistic updates (deferred to Phase 5 polish)
- Authentication state display in the CartPage — the header auth widget (TASK-052-G) handles this

## User Stories

1. As any visitor (guest or logged-in), I want to see all items currently in my cart with
   names, quantities, unit prices, and line totals, so that I know exactly what I am buying.
2. As any visitor, I want to increase or decrease the quantity of a cart item,
   so that I can adjust my order without removing and re-adding the product.
3. As any visitor, I want to remove a specific item from my cart, so that I can
   discard products I no longer want.
4. As any visitor, I want to see the cart subtotal update after every change,
   so that I always have an accurate view of the cost.
5. As any visitor with an empty cart, I want to see a helpful message with a link
   to browse products, so that I can quickly find something to buy.
6. As any visitor, I want a "Clear cart" option to remove all items at once,
   so that I can start fresh without removing items one by one.
7. As a guest visitor who navigates to `/cart` for the first time, I want the cart to
   load immediately (empty) without requiring me to log in, so that I can start adding
   items directly.

## Technical Design

### Next.js 16 Conventions — Critical Notes

The same conventions confirmed for TASK-029 and TASK-030 apply here:

1. **`params` is a `Promise`** — not applicable to `/cart` (no dynamic route segments).
   `app/cart/page.tsx` is a static route; no `params` or `searchParams` needed.

2. The cart page does **not** read `searchParams`, so it does not opt into per-request
   dynamic rendering by that mechanism alone. However, since it calls `useGetCart` from a
   Client Component subtree, the page renders on the client (all cart data is user-specific
   and cannot be statically generated or shared across users).

3. **`notFound()` is not used** on this page. A 404 from the cart API is not semantically
   a missing page — it means the user has no cart record yet. The service creates an empty
   cart on first `GET /api/cart` if none exists; a 404 here would only occur on implementation
   error. A 401 is the expected unauthenticated response.

4. **Turbopack** is the default bundler. No custom webpack changes needed.

### Guest-Cart Data Fetching

After TASK-051, `useGetCart` will NEVER return 401. The backend's `OptionalJwtAuthGuard`
always allows the request through, and `CartIdentityInterceptor` either reads a `cartToken`
cookie or issues a new one. The response is always a valid `CartEntity` (possibly with an
empty `items` array for a brand-new guest).

`withCredentials: true` is already set in `shared/api/instance.ts`, so the `cartToken`
cookie is sent and received automatically by the browser — no JavaScript intervention
needed.

```ts
// CartView — simplified data fetching (no 401 branch needed)
const { data, isLoading, isError, refetch } = useGetCart();

// States: isLoading → skeleton; isError → error banner with retry; data → cart
```

The `CartView` component renders three states: loading (skeleton), error (genuine
network/server error), and data (empty or populated cart). There is no unauthenticated
state in the CartPage itself — authentication is shown in the header widget (TASK-052-G).

**Relationship to TASK-052 (storefront auth):** Once TASK-052 is complete, logging in
triggers `queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` from within
`LoginForm.onSuccess`. This causes `useGetCart` to refetch, and the server returns the
user's cart (with merged guest items). The CartPage automatically shows the updated cart
with no additional changes.

### Mutation Strategy — Refetch on Success

All three mutation hooks (`useUpdateCartItem`, `useRemoveCartItem`, `useClearCart`) follow
the same pattern:

```ts
const queryClient = useQueryClient();

const updateItem = useUpdateCartItem({
  mutation: {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
    },
    onError: (err) => {
      // show inline error toast / message
    },
  },
});
```

`queryClient.invalidateQueries` marks the `['/api/cart']` query as stale and triggers an
automatic refetch. The server returns the fully recalculated `CartEntity` (including updated
`totals`), which becomes the new `data` in `useGetCart`. No local state mutation is needed.

**Why not optimistic updates:** The server applies stock clamping and max-quantity validation
(`MAX_QUANTITY = 99`) on every PATCH. If the server rejects a quantity (e.g. exceeds stock),
an optimistic update would need to be rolled back. The complexity of rollback logic
outweighs the UX benefit for MVP. Refetch-on-success is the safer pattern here.

### entities/cart — New Slice Required

There is currently no `entities/cart` directory. It must be created to expose cart types and
hooks to upper layers:

```ts
// src/entities/cart/index.ts
export type {
  CartEntity,
  CartItemEntity,
  CartTotals,
  AddToCartDto,
  UpdateCartItemDto,
  GetCart200,
  UpdateCartItem200,
  RemoveCartItem200,
  ClearCart200,
  AddToCart201,
} from "@/shared/api/generated/models";

export {
  useGetCart,
  getGetCartQueryKey,
  useUpdateCartItem,
  useRemoveCartItem,
  useClearCart,
  useAddToCart, // exported here for use by TASK-032 AddToCart feature
} from "@/shared/api/generated/cart/cart";
```

`entities/index.ts` must be updated to export `* from "./cart"`.

### Frontend (Next.js — FSD)

#### Server vs Client Split

| File / Component                    | Type                              | Rationale                                                                                                                                                                |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/cart/page.tsx`                 | Server Component (`async`)        | Static route; no params. Exports `metadata`. Renders `<Suspense fallback={<CartSkeleton />}><CartView /></Suspense>`.                                                    |
| `widgets/cart/ui/cart-view.tsx`     | Client Component (`'use client'`) | Root of the interactive cart subtree. Calls `useGetCart`. Handles all states (loading, 401, error, empty, populated). Orchestrates `CartItemRow` list and `CartSummary`. |
| `widgets/cart/ui/cart-item-row.tsx` | Client Component (`'use client'`) | Single line item. Renders product name, variant name, unit price, line total, quantity stepper, remove button. Calls `useUpdateCartItem` and `useRemoveCartItem`.        |
| `widgets/cart/ui/cart-summary.tsx`  | Client Component (`'use client'`) | Totals panel. Displays `totals.subtotal`, `totals.itemCount`. Renders "Proceed to Checkout" placeholder CTA and "Clear cart" button. Calls `useClearCart`.               |
| `widgets/cart/ui/cart-skeleton.tsx` | Server-compatible                 | Static skeleton matching the two-panel layout. Used as `<Suspense>` fallback.                                                                                            |
| `shared/ui/Skeleton`                | Server-compatible (exists)        | Reused unchanged from TASK-028.                                                                                                                                          |

**Hydration strategy:** `QueryClientProvider` is already provided by the root layout
`<Providers>`. `CartView` calls `useGetCart` directly as a Client Component. No
`HydrationBoundary` or `dehydrate` is needed for MVP (cart data is 100% user-specific and
cannot be prefetched server-side without auth headers).

#### widgets/cart — New Widget Slice

- `widgets/cart/ui/cart-view.tsx` — Client Component; calls `useGetCart`; routes to sub-states.
- `widgets/cart/ui/cart-item-row.tsx` — Client Component; renders one `CartItemEntity`.
- `widgets/cart/ui/cart-summary.tsx` — Client Component; renders `CartTotals` + CTAs.
- `widgets/cart/ui/cart-skeleton.tsx` — static skeleton; `aria-hidden="true"`.
- `widgets/cart/index.ts` — barrel; exports `CartView`, `CartSkeleton`.

`widgets/index.ts` must be updated to export `CartView` and `CartSkeleton`.

#### features — No New Feature Slices in This Task

No `features/` slice is introduced for TASK-031. Quantity stepper logic lives inside the
`CartItemRow` widget component as local state (a controlled `<input type="number">` mirroring
the committed quantity, with pending state while the mutation is in-flight). The `AddToCart`
feature slice belongs to TASK-032.

#### Quantity Stepper Design

Each `CartItemRow` manages its own local `pendingQty: number` state initialised from
`item.quantity`. The stepper renders:

- A decrement `<button>` (disabled when `pendingQty <= 1`)
- A `<input type="number" min="1" max={item.stock > 0 ? Math.min(99, item.stock) : 99}>`
  showing `pendingQty`, updated on `onChange`
- An increment `<button>` (disabled when `pendingQty >= Math.min(99, item.stock)` or when
  `item.stock === 0`)
- When `pendingQty` changes (via button or direct input), the component calls
  `updateItem.mutate({ itemId: item.id, data: { quantity: pendingQty } })` on blur for the
  input, or immediately for button clicks

The UI must show a subtle loading indicator (e.g., reduced `opacity-50` on the stepper
row) while `updateItem.isPending` is `true` for that row. The `itemId` is used to track
which row is loading when multiple rows exist.

When `pendingQty` is set to `0` by the user typing `0` and confirming (blur), the component
calls `removeItem.mutate({ itemId: item.id })` instead of `updateItem`, since the server
removes the item when quantity is 0. Alternatively, the decrement button shows "Remove" when
`pendingQty === 1` — clicking it calls `removeItem` directly.

### API Contract

Backend endpoints are updated by Plan 017 (TASK-051). Cart endpoints no longer require auth.
All Orval hooks are regenerated by TASK-051-J.

| Method | Path                      | Hook                | Auth                    | Returns                                |
| ------ | ------------------------- | ------------------- | ----------------------- | -------------------------------------- |
| GET    | `/api/cart`               | `useGetCart`        | None (cookie auto-sent) | `GetCart200` (`{ data?: CartEntity }`) |
| PATCH  | `/api/cart/items/:itemId` | `useUpdateCartItem` | None                    | `UpdateCartItem200`                    |
| DELETE | `/api/cart/items/:itemId` | `useRemoveCartItem` | None                    | `RemoveCartItem200`                    |
| DELETE | `/api/cart`               | `useClearCart`      | None                    | `ClearCart200`                         |

## Tasks

### TASK-031-A: Create entities/cart barrel slice

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-051-J (Orval regenerated after Plan 017 backend changes)

**Acceptance Criteria:**

- [ ] `src/entities/cart/index.ts` exists and exports the following as `type` re-exports
      from `@/shared/api/generated/models`:
  - `CartEntity`, `CartItemEntity`, `CartTotals`
  - `AddToCartDto`, `UpdateCartItemDto`
  - `GetCart200`, `UpdateCartItem200`, `RemoveCartItem200`, `ClearCart200`, `AddToCart201`
- [ ] `src/entities/cart/index.ts` exports the following (value exports) from
      `@/shared/api/generated/cart/cart`:
  - `useGetCart`, `getGetCartQueryKey`
  - `useUpdateCartItem`, `useRemoveCartItem`, `useClearCart`
  - `useAddToCart` (exported here for TASK-032; CartPage itself does not use it)
- [ ] `src/entities/index.ts` updated to add `export * from "./cart"` alongside existing
      product and category exports
- [ ] No export naming conflicts with `entities/product` or `entities/category` barrels
- [ ] `npm run typecheck -w apps/store-client` passes with no errors
- [ ] `npm run lint -w apps/store-client` passes with no errors

**Files to create/modify:**

- `apps/store-client/src/entities/cart/index.ts` — new file
- `apps/store-client/src/entities/index.ts` — add `export * from "./cart"`

---

### TASK-031-B: Create widgets/cart/CartSkeleton

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-031-A

**Acceptance Criteria:**

- [ ] `src/widgets/cart/ui/cart-skeleton.tsx` is Server-compatible (no `'use client'` directive)
- [ ] Matches the two-panel layout of the populated `CartView`:
  - Left/main panel: 3 skeleton rows, each representing a `CartItemRow`:
    - A short wide skeleton for product name
    - A row of three small skeletons (price, quantity stepper placeholder, line total)
    - A thin separator line skeleton
  - Right/summary panel: skeleton for subtotal label + value, skeleton for CTA button (full-width)
- [ ] Single-column stacked on mobile; two-column (`lg:grid lg:grid-cols-3`) on large screens
      (items take 2 cols, summary takes 1 col)
- [ ] Uses `<Skeleton>` from `@/shared/ui` — no raw `animate-pulse` inline classes
- [ ] Sets `aria-hidden="true"` on the top-level wrapper
- [ ] `src/widgets/cart/index.ts` barrel created; exports `CartSkeleton`
- [ ] `src/widgets/index.ts` updated to add `CartSkeleton` export
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-skeleton.tsx` — new file
- `apps/store-client/src/widgets/cart/index.ts` — new barrel
- `apps/store-client/src/widgets/index.ts` — add `CartSkeleton` export

---

### TASK-031-C: Create widgets/cart/CartItemRow

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-031-A

**Acceptance Criteria:**

- [ ] `src/widgets/cart/ui/cart-item-row.tsx` is a `'use client'` component
- [ ] Accepts props:
  - `item: CartItemEntity` (imported from `@/entities/cart`)
- [ ] Renders a `<li>` element (parent `CartView` renders the `<ul>`)
- [ ] Displays `item.productName` as the item title (`<p className="font-medium text-foreground">`)
- [ ] Displays `item.variantName` below the title when non-null
      (`<p className="text-sm text-muted-foreground">`)
- [ ] Displays unit price: `item.price` formatted via `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- [ ] Displays `item.compareAtPrice` as a strikethrough when non-null and greater than
      `item.price` (same sale logic as `ProductDetailView`)
- [ ] Displays `item.lineTotal` as the line subtotal (right-aligned, `font-semibold`)
- [ ] Renders a quantity stepper:
  - Decrement `<button aria-label="Decrease quantity">` — disabled when `pendingQty <= 1`;
    when `pendingQty === 1`, label changes to "Remove item" and click calls `removeItem.mutate`
    instead of `updateItem.mutate`
  - `<input type="number" aria-label="Quantity" min="1" max={Math.min(99, item.stock || 99)}>` —
    controlled; shows `pendingQty`; on blur with changed value, calls `updateItem.mutate`;
    direct entry of `0` is treated as remove
  - Increment `<button aria-label="Increase quantity">` — disabled when
    `pendingQty >= Math.min(99, item.stock)` or when `item.stock === 0`
- [ ] Renders a "Remove" `<button aria-label="Remove ${item.productName} from cart">` (icon button
      with visible text fallback) that calls `removeItem.mutate({ itemId: item.id })`
- [ ] While `updateItem.isPending` or `removeItem.isPending` is `true`: the entire row has
      `opacity-50 pointer-events-none` to signal mutation in progress
- [ ] On mutation error: renders an inline `<p role="alert" className="text-destructive text-sm">`
      with the error message; error clears on next successful mutation or re-render
- [ ] Calls `useUpdateCartItem` and `useRemoveCartItem` from `@/entities/cart`; passes
      `onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` to both
- [ ] Calls `useQueryClient()` from `@tanstack/react-query` for cache invalidation
- [ ] No raw hex values; only design tokens
- [ ] No manual `fetch`/`axios` calls
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` — new file

---

### TASK-031-D: Create widgets/cart/CartSummary

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-031-A

**Acceptance Criteria:**

- [ ] `src/widgets/cart/ui/cart-summary.tsx` is a `'use client'` component
- [ ] Accepts props:
  - `totals: CartTotals` (imported from `@/entities/cart`)
- [ ] Renders a summary card (`<div className="rounded-lg bg-card p-6 border border-border">`)
- [ ] Displays:
  - Label "Order Summary" as `<h2 className="text-lg font-semibold text-foreground">`
  - Subtotal row: "Subtotal" label + `totals.subtotal` formatted as USD currency
  - Item count: `"${totals.itemCount} item${totals.itemCount !== 1 ? 's' : ''}"` in
    `text-sm text-muted-foreground`
  - A separator `<hr className="border-border">`
  - Total row (same value as subtotal for MVP — no discount/shipping yet):
    "Total" in `font-semibold` + formatted value
- [ ] Renders a "Proceed to Checkout" `<button disabled>` placeholder CTA:
  - Full-width, `bg-primary text-primary-foreground rounded-lg`
  - Disabled and `opacity-50 cursor-not-allowed` — checkout is TASK-035
  - `aria-label="Checkout — coming in a future update"`
- [ ] Renders a "Clear cart" `<button>` that calls `clearCart.mutate()`:
  - Styled as a destructive secondary action (`text-destructive border border-destructive`)
  - While `clearCart.isPending`: shows "Clearing..." text and `opacity-50`
  - On error: inline `<p role="alert" className="text-destructive text-sm">` message
  - Requires confirmation (a simple `window.confirm` dialog) before calling `mutate` — to
    prevent accidental clearing; this avoids a modal component dependency for MVP
- [ ] Calls `useClearCart` from `@/entities/cart` with
      `onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })`
- [ ] No raw hex values
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-summary.tsx` — new file

---

### TASK-031-E: Create widgets/cart/CartView (orchestrator)

**Type:** feat
**Scope:** store-client
**Complexity:** L (4-6h)
**TDD Required:** No
**Depends on:** TASK-031-B, TASK-031-C, TASK-031-D

**Acceptance Criteria:**

- [ ] `src/widgets/cart/ui/cart-view.tsx` is a `'use client'` component
- [ ] Calls `useGetCart()` imported from `@/entities/cart`
- [ ] Handles all states:

  **Loading state** (`isLoading === true`):
  - Renders `<CartSkeleton />` (imported from `@/entities/cart` or from local barrel)

  **Error state** (`isError === true`):
  - Renders `<p role="alert" className="text-destructive">Something went wrong. Please try again.</p>`
  - Renders a "Retry" `<button>` that calls `refetch()` from `useGetCart`

  **Empty cart state** (`data?.data?.items.length === 0`):
  - Renders a centred `<section aria-labelledby="empty-cart-heading">` with:
    - `<h2 id="empty-cart-heading">Your cart is empty</h2>` (`text-xl font-semibold`)
    - Descriptive text: "Looks like you have not added anything yet."
    - A `<Link href="/products" className="...">Shop now</Link>` CTA
  - No `CartSummary` is rendered for an empty cart

  **Populated cart state** (`data?.data?.items.length > 0`):
  - Renders a two-panel responsive layout:
    - Page heading: `<h1 className="text-2xl font-bold text-foreground">Shopping Cart</h1>`
      followed by `<p className="text-sm text-muted-foreground">{totals.uniqueItems} item type(s)</p>`
    - Left/main area (2 cols on `lg:`): `<ul>` of `<CartItemRow item={item} key={item.id}>` for
      each item in `data.data.items`
    - An `<p aria-live="polite" aria-atomic="true" className="sr-only">` that announces
      "Cart updated" after each successful mutation (tracked via a local `lastUpdated` state
      toggled in `onSuccess` callbacks)
    - Right panel (1 col on `lg:`): `<CartSummary totals={data.data.totals} />`

- [ ] Images are not part of `CartItemEntity`; no image column is rendered — this is
      documented as a known gap (same as `ProductCard` on the listing page)
- [ ] `src/widgets/cart/index.ts` updated to export `CartView`
- [ ] `src/widgets/index.ts` updated to export `CartView`
- [ ] FSD import direction respected: `widgets` imports from `entities` and `shared`, NOT
      from `app` or `features`
- [ ] No raw hex values
- [ ] No manual `fetch`/`axios` calls
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-view.tsx` — new file
- `apps/store-client/src/widgets/cart/index.ts` — update barrel to add `CartView`
- `apps/store-client/src/widgets/index.ts` — add `CartView` export

---

### TASK-031-F: Create app/cart/page.tsx and verify full build

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-031-E

**Acceptance Criteria:**

- [ ] `src/app/cart/page.tsx` does not exist before this task; it is created here
- [ ] The page component is NOT `async` — no `params` or `searchParams` to await; it is a
      standard Server Component function that renders synchronously
- [ ] TypeScript signature:
  ```ts
  export default function CartPage() { ... }
  ```
- [ ] Exports static `metadata`:
  ```ts
  export const metadata: Metadata = {
    title: "Cart | MobileStore",
    description: "Review and manage items in your shopping cart.",
  };
  ```
- [ ] Renders:
  ```tsx
  <div className="mx-auto w-full max-w-7xl px-4 py-8">
    <Suspense fallback={<CartSkeleton />}>
      <CartView />
    </Suspense>
  </div>
  ```
- [ ] Does NOT add a second `<main>` element — the root layout already provides `<main className="flex-1">`
- [ ] `CartView` and `CartSkeleton` are imported from `@/widgets/cart`
- [ ] `Suspense` is imported from `react`
- [ ] `Metadata` is imported from `next`
- [ ] Visiting `/cart` when unauthenticated renders the sign-in prompt (not a white page crash)
- [ ] Visiting `/cart` when authenticated (once auth is wired up) renders the live cart
- [ ] `npm run build -w apps/store-client` exits with code 0
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes
- [ ] No raw hex values in any new `.tsx` file
- [ ] No manual `fetch`/`axios` in any new file
- [ ] FSD import direction respected: `app` imports from `widgets` and `shared` only

**Files to create/modify:**

- `apps/store-client/src/app/cart/page.tsx` — new route file

---

## Migration Steps

1. Create `entities/cart` barrel (TASK-031-A) — prerequisite for every widget; no UI risk.
   Typecheck immediately to catch any naming conflicts with existing entity exports.
2. Create `CartSkeleton` (TASK-031-B) — no runtime API calls; safe to build and inspect
   visually in isolation.
3. Create `CartItemRow` (TASK-031-C) and `CartSummary` (TASK-031-D) — can be developed in
   parallel; both depend only on TASK-031-A. Each component can be tested in isolation by
   rendering with mock `CartItemEntity` / `CartTotals` props.
4. Create `CartView` orchestrator (TASK-031-E) — requires B, C, D to be complete; wires all
   sub-components and the live `useGetCart` hook.
5. Create `app/cart/page.tsx` and run full build verification (TASK-031-F) — final integration
   step; run `npm run build`, `npm run typecheck`, and `npm run lint` here.

## Risks and Mitigations

| Risk                                                                                                                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TASK-031 cannot start until TASK-051-J (Orval regeneration) is complete.** The regenerated cart hooks reflect nullable `CartEntity.userId` and no 401 response type. Building CartPage against the old generated types would cause a typecheck failure.                      | Enforce the dependency in BACKLOG.md (TASK-031-A depends on TASK-051-J). Do not begin TASK-031 until the Orval regeneration step in Plan 017 is marked done.                                                                                                             |
| \*\*`CartEntity.userId` is now `string                                                                                                                                                                                                                                         | null`in the generated type.** Any code that assumes`cart.userId` is always a string will fail typecheck.                                                                                                                                                                 | `CartView` does not render `userId` directly. `CartSummary` and `CartItemRow` receive `CartTotals` and `CartItemEntity` — neither contains `userId`. The only place `userId` matters is the `CartEntity` root object, which `CartView` accesses as `data?.data` — `userId` is not used. No issue in practice. |
| `CartResponseEnvelope` is typed as `{ [key: string]: unknown }`. Accessing `response.data` is safe, but TypeScript will not provide strong type checking without a cast or the `GetCart200` narrowing type.                                                                    | Always use `GetCart200`, `UpdateCartItem200`, etc. as the return types (they intersect with `CartResponseEnvelope` and add `data?: CartEntity`). Use optional chaining `data?.data?.items` throughout `CartView`.                                                        |
| `useGetCart` has no parameters — the cart endpoint is `GET /api/cart` with no query params. The query key is the constant `['/api/cart']`. `getGetCartQueryKey()` must be called (not inlined as a string literal) in all `invalidateQueries` calls to ensure consistency.     | Enforce in acceptance criteria: always import and call `getGetCartQueryKey()` for cache invalidation, never hardcode the string `'/api/cart'`.                                                                                                                           |
| `item.stock === 0` for products without variants (the repository sets `stock = 0` as a sentinel). The stepper max must use `item.stock > 0 ? Math.min(99, item.stock) : 99` to avoid disabling the increment button for stockless products.                                    | Specified in TASK-031-C acceptance criteria. The business rule is documented in `CartItemEntity.fromPrisma`: "No variant = no stock tracking at product level".                                                                                                          |
| Multiple `CartItemRow` components each calling their own `useUpdateCartItem` / `useRemoveCartItem` mutations simultaneously creates independent loading states. The `aria-live` announcement in `CartView` fires once per successful cache invalidation, not per row mutation. | Each row manages its own `isPending` loading overlay. The `aria-live` region in `CartView` is keyed to successful query invalidation — correct behaviour.                                                                                                                |
| `window.confirm` in `CartSummary` for the "Clear cart" confirmation will not work in server-rendered or test environments.                                                                                                                                                     | `CartSummary` is a `'use client'` component, so `window.confirm` is always safe to call. Tests that mock the component can skip the confirmation. This pattern is acceptable for MVP.                                                                                    |
| FSD import direction: `widgets/cart` must not import from `features/` in TASK-031. The `AddToCart` feature (TASK-032) will be injected by a future plan.                                                                                                                       | No `features/` imports in any TASK-031 file. Enforced by ESLint `import/no-restricted-paths`.                                                                                                                                                                            |
| `entities/index.ts` re-exports everything from `product`, `category`, and now `cart`. If `CartEntity` has a field name that clashes with `ProductEntity`, TypeScript will error on the wildcard export.                                                                        | Both entities have `id`, `createdAt`, `updatedAt` fields — but these are on different named types so there is no runtime conflict. Only ambiguous named exports cause TS errors. Checked: no naming conflicts exist. Typecheck gate in TASK-031-A will catch any issues. |

## Notes

### Design Tokens Available

All Tailwind classes must reference tokens defined in `src/app/globals.css`:

| Token                            | Utility classes                                            | Usage                                                 |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `--color-background`             | `bg-background`                                            | Page background                                       |
| `--color-foreground`             | `text-foreground`                                          | Headings, body text                                   |
| `--color-primary`                | `bg-primary`, `text-primary`, `border-primary`             | CTA buttons, selected states                          |
| `--color-primary-foreground`     | `text-primary-foreground`                                  | Text on primary bg                                    |
| `--color-muted`                  | `bg-muted`                                                 | Image placeholder, skeleton cells                     |
| `--color-muted-foreground`       | `text-muted-foreground`                                    | Secondary text, item meta                             |
| `--color-accent`                 | `bg-accent`                                                | Hover states on quantity buttons                      |
| `--color-destructive`            | `bg-destructive`, `text-destructive`, `border-destructive` | Remove button, error messages, sale badge, clear cart |
| `--color-destructive-foreground` | `text-destructive-foreground`                              | Text on destructive bg                                |
| `--color-card`                   | `bg-card`                                                  | Summary panel surface                                 |
| `--color-card-foreground`        | `text-card-foreground`                                     | Summary panel text                                    |
| `--color-border`                 | `border-border`                                            | Row separators, input borders, card border            |
| `--color-ring`                   | `ring-ring`                                                | Focus ring on stepper buttons and inputs              |
| `--radius-lg`                    | `rounded-lg`                                               | Summary card, CTA button                              |

### Generated Hook Name Reference (exact)

These are the Orval-generated export names from `shared/api/generated/cart/cart.ts`. Use
these exact names — do not invent alternatives:

| Hook / function      | Type              | Usage                                                                   |
| -------------------- | ----------------- | ----------------------------------------------------------------------- |
| `useGetCart`         | query hook        | Fetch current user cart                                                 |
| `getGetCartQueryKey` | query key factory | Returns `['/api/cart']`                                                 |
| `useUpdateCartItem`  | mutation hook     | PATCH quantity; variable: `{ itemId: string, data: UpdateCartItemDto }` |
| `useRemoveCartItem`  | mutation hook     | DELETE item; variable: `{ itemId: string }`                             |
| `useClearCart`       | mutation hook     | DELETE all items; no variable                                           |
| `useAddToCart`       | mutation hook     | POST new item (for TASK-032 only)                                       |

### Known Limitations and Future Work

1. **No product images in cart.** `CartItemEntity` has no image URL field. Line items show a
   `bg-muted` colour block as a placeholder. Adding images requires a backend change to
   `CartItemEntity` (include a thumbnail from the first `ProductImage`). Tracked alongside
   the same limitation noted in plans 012 and 014 for `ProductCard`.

2. **No frontend auth (TASK-052).** The CartPage works fully as a guest experience. Until
   TASK-052 is complete, the header shows no user identity. After TASK-052, logging in
   triggers a cart query invalidation that seamlessly loads the user's merged cart.

3. **No optimistic updates.** Refetch-on-success is used for all mutations. For Phase 5,
   optimistic updates can be added by implementing `onMutate` / `onError` rollback logic in
   each mutation call, caching the previous `GetCart200` data and restoring it on error.

4. **Checkout CTA is a placeholder.** "Proceed to Checkout" is `disabled`. TASK-035
   (Phase 3) will enable this button and link it to the checkout flow.

5. **No coupon/discount field in `CartTotals`.** The `subtotal` IS the total for MVP. Phase 3
   will extend `CartTotals` with `discount`, `shippingCost`, and `total` fields.

### Connection to TASK-032 (AddToCart)

TASK-032 will create a `features/add-to-cart` slice that calls `useAddToCart` (exported from
`@/entities/cart` as of TASK-031-A). It will also need to invalidate the cart query key after
a successful add. This plan's TASK-031-A exports `useAddToCart` and `getGetCartQueryKey`
specifically to make TASK-032 straightforward.

### Connection to Future Auth Task

The CartPage assumes a `/login` route will exist. Once the frontend auth task is implemented,
the sign-in prompt link will automatically become functional with no changes to CartPage.
The Axios `customInstance` interceptor will attach the Bearer token transparently once auth
is wired up, at which point `useGetCart` will return real cart data.
