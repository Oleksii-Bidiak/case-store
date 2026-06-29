# Plan: Loading States & Skeleton Audit

> **Status:** Done
> **Phase:** Phase 5 — Polish & Production
> **Created:** 2026-06-28
> **Last Updated:** 2026-06-29

## Overview

The QA report flagged "немає лоадерів" — users see the app freeze or show stale content
during navigations and data-fetching actions with no visual feedback. This plan audits every
storefront and admin surface and fills only the confirmed **gaps**; it does NOT touch the many
skeleton/pending states that already work correctly.

## Scope

### In Scope

- Route-level `loading.tsx` files for every significant page in both apps (Next.js App Router
  instant navigation feedback)
- Admin `<Suspense>` boundaries that currently have no `fallback` prop (6 pages)
- A shared `Skeleton` primitive for `store-admin` (mirrors the one in `store-client`)
- A reusable `AdminFormSkeleton` component to replace three identical inline skeletons
- `isFetching` refetch overlays on the three paginated admin tables (products, orders, users)
  so filter/sort/pagination changes give visual feedback instead of silently swapping stale data
- `isFetching` overlay on the storefront product catalog so filter/sort/page changes give feedback
- Dashboard section skeletons for charts and the top-products/low-stock panels (currently hidden
  during `isLoading`, causing a layout shift)

### Out of Scope

- Backend changes — all fixes are purely frontend
- Orval regeneration (no API contract changes)
- New routes or new business features
- Global NProgress/route-progress bar (the per-route `loading.tsx` pattern is sufficient)
- Animations or skeleton shimmer variants beyond `animate-pulse` (design-system concern)

## Audit Results — What Already Exists (do NOT duplicate)

### Storefront (store-client) — ALREADY COVERED

| Surface                  | Skeleton / Loading                                                                 | Mutations                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Home page                | `Suspense` + `CategoryNavSkeleton` + `ProductGridSkeleton`                         | —                                                                |
| Products list (initial)  | `Suspense` + `ProductListSkeleton`                                                 | —                                                                |
| PDP                      | `Suspense` + `ProductDetailSkeleton`                                               | —                                                                |
| Cart page                | `Suspense` + `CartSkeleton`                                                        | CartItemRow opacity-60 on remove; CartSummary isPending on clear |
| Checkout                 | `Suspense` + `CheckoutSkeleton`; `CheckoutView` shows skeleton while auth restores | Submit button disabled+label during isPending                    |
| Orders page              | `Suspense` + `OrderHistorySkeleton`                                                | —                                                                |
| Order confirmation       | `Suspense` + `OrderConfirmationSkeleton`                                           | —                                                                |
| Account page             | `Suspense` + `<Skeleton>` (single box)                                             | ProfileForm save button isPending                                |
| Header auth              | `Skeleton` while isInitializing                                                    | LogoutButton disabled during isPending                           |
| AddToCartButton          | isPending label change + disabled                                                  | —                                                                |
| Login/Register forms     | Submit button disabled + label during isPending                                    | —                                                                |
| NP city/warehouse fields | `isFetching` spinner inside Combobox                                               | —                                                                |

### Admin (store-admin) — ALREADY COVERED

| Surface               | Skeleton / Loading                                               | Mutations                                                        |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Products list         | `Suspense` + `AdminProductTableSkeleton`                         | ProductStatusToggle disabled during isPending                    |
| Orders list           | `Suspense` + `AdminOrderTableSkeleton`                           | OrderStatusSelect, PaymentStatusSelect disabled during isPending |
| Categories list       | `Suspense` + `AdminCategoryTableSkeleton`                        | CategoryStatusToggle disabled during isPending                   |
| Users list            | `Suspense` + `AdminUserTableSkeleton`                            | UserBanToggle disabled + toast                                   |
| Order detail          | `Suspense` + `OrderDetailSkeleton`                               | Status/payment selects disabled during isPending                 |
| User detail           | `Suspense` + `UserDetailSkeleton`                                | UserBanToggle                                                    |
| Edit product          | inline `animate-pulse` form rows during isLoading                | Update button isPending                                          |
| Edit category         | inline `animate-pulse` form rows during isLoading                | Update button isPending                                          |
| Edit product group    | inline `animate-pulse` form rows during isLoading                | Update button isPending                                          |
| Product group list    | inline `animate-pulse` rows during isLoading                     | —                                                                |
| Dashboard stats       | `AdminDashboardStatsSkeleton` during isLoading                   | —                                                                |
| Admin shell           | Full-screen spinner while auth restores                          | LogoutButton disabled during isPending                           |
| Admin login           | Submit button disabled + label during isPending                  | —                                                                |
| Product image manager | `Loader2` spinner on upload; buttons disabled during any pending | —                                                                |

## Confirmed Gaps

### GAP-A — Admin: six `<Suspense>` boundaries with no `fallback`

These admin pages show a blank content area while the client component bundle loads and hydrates.
No shared `Skeleton` primitive exists in `store-admin/src/shared/ui/` either.

| File                                                                     | Current                    |
| ------------------------------------------------------------------------ | -------------------------- |
| `apps/store-admin/src/app/(dashboard)/products/new/page.tsx`             | `<Suspense>` (no fallback) |
| `apps/store-admin/src/app/(dashboard)/categories/new/page.tsx`           | `<Suspense>` (no fallback) |
| `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/page.tsx`     | `<Suspense>` (no fallback) |
| `apps/store-admin/src/app/(dashboard)/product-groups/page.tsx`           | `<Suspense>` (no fallback) |
| `apps/store-admin/src/app/(dashboard)/product-groups/new/page.tsx`       | `<Suspense>` (no fallback) |
| `apps/store-admin/src/app/(dashboard)/product-groups/[id]/edit/page.tsx` | `<Suspense>` (no fallback) |

Additionally: the three edit-view inline skeleton patterns (`edit-product-view`, `edit-category-view`,
`edit-product-group-view`) are byte-for-byte identical duplicates — no shared component.

### GAP-B — Storefront: no `loading.tsx` in any route segment

Zero `loading.tsx` files exist in `apps/store-client`. Without them, clicking a Next.js link in
the storefront shows no visual feedback until the new page fully renders. The user sees the old page
"freeze" or sees a blank flash. The `<Suspense>` inside each `page.tsx` only fires after the page
component instantiates; `loading.tsx` fires _before_ that, on first navigation.

Affected routes (7): `products/`, `products/[slug]/`, `cart/`, `checkout/`, `orders/`,
`orders/[id]/confirmation/`, `account/`.

### GAP-C — Admin: no `loading.tsx` in any route segment

Zero `loading.tsx` files exist in `apps/store-admin`. The `(dashboard)/layout.tsx` provides the
chrome (AdminShellGuard + sidebar + header), but no route-level skeleton fires during navigation
between admin pages.

Affected routes (9): `(dashboard)/` (dashboard home), `(dashboard)/products/`,
`(dashboard)/products/new/`, `(dashboard)/categories/`,
`(dashboard)/categories/[id]/edit/`, `(dashboard)/orders/`,
`(dashboard)/orders/[id]/`, `(dashboard)/users/`,
`(dashboard)/users/[id]/`.

### GAP-D — Admin tables: no feedback during filter/sort/pagination refetches

All three admin tables guard only on `isLoading` (first fetch). After React Query caches the first
result, changing a sort column, search query, status filter, or page number triggers a background
refetch (`isFetching: true`) but the UI shows stale data with NO indicator. Users click a column
header and see the old list sit there with no response.

Affected: `AdminProductTable`, `AdminOrderTable`, `AdminUserTable`.

### GAP-E — Storefront `ProductList`: no feedback during filter/sort/pagination refetches

Same pattern as GAP-D on the `/products` catalog. `ProductList` guards on `isPending` only; changing
category, price range, sort, or page silently refetches stale data with no indicator.

### GAP-F — Dashboard: only stats section has a skeleton during `isLoading`

`DashboardView` shows `AdminDashboardStatsSkeleton` during `isLoading`, but the charts section
(`DashboardCharts`) and the `DashboardTopProductsTable` / `DashboardLowStockTable` sections render
nothing — they are inside the `else` branch. On load the layout shows only the stats skeleton; when
loading completes the rest of the page jumps in, causing a significant layout shift.

## Technical Design

### Approach for `loading.tsx`

Next.js App Router: a `loading.tsx` file in a route segment directory is wrapped in an automatic
`<Suspense>` by the framework. It fires immediately during client-side navigation, before the page
component is instantiated. Each file should export a server component that renders the same skeleton
already used inside that page's `<Suspense fallback={...}>`.

Pattern for pages that already have a matching skeleton:

```tsx
// apps/store-client/src/app/products/loading.tsx
import { ProductListSkeleton } from "@/widgets";
export default function Loading() {
  return <ProductListSkeleton />;
}
```

For admin routes, the `(dashboard)` layout provides the shell chrome; `loading.tsx` only needs to
fill the `<main>` content area.

### Approach for `isFetching` overlays

Use a `data-fetching` wrapper pattern: a `div` with `relative` positioning; when `isFetching` is
true, render an absolutely-positioned inset overlay with a centered spinner and `pointer-events-none`.
The spinner re-uses `Loader2` from lucide-react (already used in `ProductImageManager`). The table
content below remains visible (stale data is more useful than a blank skeleton during refetch).

```tsx
// Pattern (not a real file — used inline):
<div className="relative">
  {isFetching && (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center
                    rounded-md bg-background/60 pointer-events-none"
    >
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  )}
  <Table>...</Table>
</div>
```

### Approach for admin `Skeleton` primitive

Mirror `apps/store-client/src/shared/ui/skeleton.tsx` exactly into `apps/store-admin/src/shared/ui/skeleton.tsx`.
Then extract `AdminFormSkeleton` (a column of N skeleton rows) as a standalone component.

### Approach for Dashboard section skeletons

Add a `DashboardSectionSkeleton` reusable component (a rounded box with animate-pulse rows).
`DashboardView` shows it for charts + top-products + low-stock sections while `isLoading` is true,
instead of rendering nothing. This eliminates the layout shift.

## Tasks

### TASK-127-A: Admin Skeleton primitive + AdminFormSkeleton + fix bare Suspense boundaries

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/ui/skeleton.tsx` exists and is re-exported from the shared/ui barrel — matches store-client's `Skeleton` component exactly (`animate-pulse rounded-md bg-muted`, `role="status"`, `aria-busy`)
- [ ] `apps/store-admin/src/shared/ui/admin-form-skeleton.tsx` (`AdminFormSkeleton`) renders a configurable number of skeleton rows; default is 6 rows at `h-10 w-full`
- [ ] `apps/store-admin/src/widgets/product-group-list/ui/admin-product-group-table-skeleton.tsx` (`AdminProductGroupTableSkeleton`) renders 4 table-row-shaped skeleton rows, matching the pattern of `AdminProductTableSkeleton`
- [ ] All 6 bare `<Suspense>` pages now pass `fallback` props:
  - `products/new` → `fallback={<AdminFormSkeleton />}`
  - `categories/new` → `fallback={<AdminFormSkeleton />}`
  - `categories/[id]/edit` → `fallback={<AdminFormSkeleton />}`
  - `product-groups/page` → `fallback={<AdminProductGroupTableSkeleton />}`
  - `product-groups/new` → `fallback={<AdminFormSkeleton />}`
  - `product-groups/[id]/edit` → `fallback={<AdminFormSkeleton />}`
- [ ] `AdminFormSkeleton` and `AdminProductGroupTableSkeleton` are barrel-exported from the widgets index
- [ ] `npm run build -w apps/store-admin` passes; `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/skeleton.tsx` — new: Skeleton primitive
- `apps/store-admin/src/shared/ui/admin-form-skeleton.tsx` — new: AdminFormSkeleton
- `apps/store-admin/src/shared/ui/index.ts` — export Skeleton + AdminFormSkeleton
- `apps/store-admin/src/widgets/product-group-list/ui/admin-product-group-table-skeleton.tsx` — new
- `apps/store-admin/src/widgets/product-group-list/index.ts` — export AdminProductGroupTableSkeleton
- `apps/store-admin/src/widgets/index.ts` — re-export AdminProductGroupTableSkeleton
- `apps/store-admin/src/app/(dashboard)/products/new/page.tsx` — add fallback to Suspense
- `apps/store-admin/src/app/(dashboard)/categories/new/page.tsx` — add fallback to Suspense
- `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/page.tsx` — add fallback to Suspense
- `apps/store-admin/src/app/(dashboard)/product-groups/page.tsx` — add fallback to Suspense
- `apps/store-admin/src/app/(dashboard)/product-groups/new/page.tsx` — add fallback to Suspense
- `apps/store-admin/src/app/(dashboard)/product-groups/[id]/edit/page.tsx` — add fallback to Suspense

---

### TASK-127-B: Storefront route-level `loading.tsx` files

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] A `loading.tsx` exists in every listed storefront route segment
- [ ] Each `loading.tsx` re-exports the same skeleton already used as the `<Suspense fallback>` inside that segment's `page.tsx`, so navigation and initial render show identical UI
- [ ] The account `loading.tsx` uses a proper `AccountSkeleton` (two skeleton rows matching the form shape) instead of the current generic single-box `<Skeleton className="mx-auto h-64 w-full max-w-2xl" />` in `account/page.tsx`; update the page fallback to match
- [ ] No layout jump between `loading.tsx` display and `page.tsx` render (skeletons match the page structure)
- [ ] `npm run build -w apps/store-client` passes; `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-client/src/app/products/loading.tsx` — re-exports `ProductListSkeleton` from `@/widgets`
- `apps/store-client/src/app/products/[slug]/loading.tsx` — re-exports `ProductDetailSkeleton` from `@/widgets`
- `apps/store-client/src/app/cart/loading.tsx` — re-exports `CartSkeleton` from `@/widgets`
- `apps/store-client/src/app/checkout/loading.tsx` — re-exports `CheckoutSkeleton` from `@/shared/ui`
- `apps/store-client/src/app/orders/loading.tsx` — re-exports `OrderHistorySkeleton` from `@/widgets`
- `apps/store-client/src/app/orders/[id]/confirmation/loading.tsx` — re-exports `OrderConfirmationSkeleton` from `@/widgets`
- `apps/store-client/src/app/account/loading.tsx` — new: renders `AccountSkeleton`
- `apps/store-client/src/widgets/account/ui/account-skeleton.tsx` — new: `AccountSkeleton` (heading + form rows)
- `apps/store-client/src/widgets/account/index.ts` — barrel-export `AccountSkeleton`
- `apps/store-client/src/widgets/index.ts` — re-export `AccountSkeleton`
- `apps/store-client/src/app/account/page.tsx` — update Suspense fallback to `<AccountSkeleton />`

---

### TASK-127-C: Admin route-level `loading.tsx` files

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-127-A (AdminFormSkeleton + AdminProductGroupTableSkeleton needed)

**Acceptance Criteria:**

- [ ] A `loading.tsx` exists in every listed admin route segment
- [ ] The `(dashboard)/loading.tsx` renders a `DashboardSkeletonPage` (stats skeleton + chart placeholder + two table placeholders) so the dashboard page has route-level loading feedback
- [ ] The `products/loading.tsx`, `orders/loading.tsx`, `categories/loading.tsx`, `users/loading.tsx` re-export the matching `*TableSkeleton` already used in their `page.tsx`
- [ ] The `products/new/loading.tsx`, `categories/new/loading.tsx`, `product-groups/new/loading.tsx` re-export `AdminFormSkeleton`
- [ ] The `[id]/` detail loading files re-export the matching detail skeleton
- [ ] The `categories/[id]/edit/loading.tsx` and `product-groups/[id]/edit/loading.tsx` re-export `AdminFormSkeleton`
- [ ] Admin loading pages respect the `(dashboard)` layout chrome (sidebar + header remain visible; only the `<main>` content area shows the skeleton)
- [ ] `npm run build -w apps/store-admin` passes; `npm run typecheck` passes

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/loading.tsx` — new: `DashboardSkeletonPage` (see GAP-F / TASK-127-E)
- `apps/store-admin/src/app/(dashboard)/products/loading.tsx` — re-exports `AdminProductTableSkeleton`
- `apps/store-admin/src/app/(dashboard)/products/new/loading.tsx` — re-exports `AdminFormSkeleton`
- `apps/store-admin/src/app/(dashboard)/orders/loading.tsx` — re-exports `AdminOrderTableSkeleton`
- `apps/store-admin/src/app/(dashboard)/orders/[id]/loading.tsx` — re-exports `OrderDetailSkeleton`
- `apps/store-admin/src/app/(dashboard)/categories/loading.tsx` — re-exports `AdminCategoryTableSkeleton`
- `apps/store-admin/src/app/(dashboard)/categories/new/loading.tsx` — re-exports `AdminFormSkeleton`
- `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/loading.tsx` — re-exports `AdminFormSkeleton`
- `apps/store-admin/src/app/(dashboard)/users/loading.tsx` — re-exports `AdminUserTableSkeleton`
- `apps/store-admin/src/app/(dashboard)/users/[id]/loading.tsx` — re-exports `UserDetailSkeleton`
- `apps/store-admin/src/app/(dashboard)/product-groups/loading.tsx` — re-exports `AdminProductGroupTableSkeleton`
- `apps/store-admin/src/app/(dashboard)/product-groups/new/loading.tsx` — re-exports `AdminFormSkeleton`
- `apps/store-admin/src/app/(dashboard)/product-groups/[id]/edit/loading.tsx` — re-exports `AdminFormSkeleton`

---

### TASK-127-D: Admin table `isFetching` refetch overlay

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `AdminProductTable`, `AdminOrderTable`, `AdminUserTable` each show a loading overlay when `isFetching` is true AND `isLoading` is false (i.e., stale data is visible while a refetch is in-flight)
- [ ] The overlay is an absolutely-positioned semi-transparent `bg-background/60` inset over the table body, with a centered `Loader2 animate-spin` icon (`size-6 text-primary`)
- [ ] The overlay has `pointer-events-none` so users cannot interact with stale rows, and `aria-hidden="true"` so screen readers ignore it
- [ ] Table container has `relative` positioning to contain the overlay
- [ ] The `Loader2` is from `lucide-react` (already a project dependency)
- [ ] `isLoading` continues to show the full `*TableSkeleton` (no change to initial-load UX)
- [ ] The overlay appears when: changing sort column, changing search query, changing status filter, changing page number
- [ ] No overlay during initial load (covered by `isLoading` guard)
- [ ] `npm run build -w apps/store-admin` passes; `npm run typecheck` passes; `npm run test -w apps/store-admin` passes

**Files to create/modify:**

- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx` — add `isFetching` from query; wrap table in relative div; add overlay
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx` — same pattern
- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx` — same pattern

---

### TASK-127-E: Storefront product list refetch overlay + admin dashboard section skeletons

**Type:** feat
**Scope:** store-client + store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Sub-scope A — Storefront `ProductList` refetch overlay:**

- [ ] `ProductList` uses both `isPending` (initial load → full skeleton) and `isFetching` (refetch → overlay over stale grid)
- [ ] The `isFetching` overlay matches the admin table pattern: semi-transparent inset + centered `Loader2` spinner
- [ ] The overlay is aria-hidden and pointer-events-none
- [ ] The skeleton count shown in `<p aria-live="polite">` remains visible and announces the update once complete
- [ ] `npm run build -w apps/store-client` passes; `npm run typecheck` passes

**Sub-scope B — Admin dashboard section skeletons:**

- [ ] A new `DashboardSectionSkeleton` widget (or a simple function component) renders a rounded-border placeholder box with 3–4 `animate-pulse` rows — suitable for charts, top-products, and low-stock panels
- [ ] `DashboardView` uses `DashboardSectionSkeleton` for the charts section and the top-products/low-stock sections during `isLoading`, instead of rendering nothing. The stats section continues to use `AdminDashboardStatsSkeleton`
- [ ] `(dashboard)/loading.tsx` (from TASK-127-C) uses a combined layout: `AdminDashboardStatsSkeleton` + `DashboardSectionSkeleton` × 3 to fill the dashboard shape
- [ ] No layout shift: the skeleton occupies approximately the same vertical space as the loaded content
- [ ] `npm run build -w apps/store-admin` passes; `npm run typecheck` passes; `npm run test -w apps/store-admin` passes (existing 52 admin tests green)

**Files to create/modify (Sub-scope A):**

- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — add `isFetching`; wrap grid in relative div; add overlay

**Files to create/modify (Sub-scope B):**

- `apps/store-admin/src/widgets/dashboard-stats/ui/DashboardSectionSkeleton.tsx` — new: reusable section placeholder
- `apps/store-admin/src/widgets/dashboard-stats/index.ts` — export `DashboardSectionSkeleton`
- `apps/store-admin/src/widgets/index.ts` — re-export `DashboardSectionSkeleton`
- `apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` — use `DashboardSectionSkeleton` in the charts/top-products/low-stock conditional
- `apps/store-admin/src/app/(dashboard)/loading.tsx` — use combined skeletons (depends on TASK-127-C)

---

## Migration Steps

1. TASK-127-A — no migration; admin shared Skeleton + fix Suspense (no dependencies)
2. TASK-127-B — no migration; storefront loading.tsx files (no dependencies; can run in parallel with A)
3. TASK-127-E (Sub-scope B) — DashboardSectionSkeleton (needed before TASK-127-C for the dashboard loading.tsx)
4. TASK-127-C — admin loading.tsx files (depends on A for AdminFormSkeleton/AdminProductGroupTableSkeleton; depends on E Sub-scope B for dashboard)
5. TASK-127-D — admin table isFetching overlay (independent; can run in parallel with B/C)
6. TASK-127-E (Sub-scope A) — storefront ProductList isFetching overlay (independent)

## Risks & Mitigations

| Risk                                                                                                                                    | Mitigation                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading.tsx` in `(dashboard)/` wraps the entire dashboard layout segment — may conflict with the `AdminShellGuard` full-screen spinner | Place `loading.tsx` only inside specific route sub-segments (products/, orders/, etc.) rather than at the `(dashboard)/` root, unless the framework resolves the guard before the loading file activates |
| `isFetching` overlay blocks user interaction (clicking stale rows)                                                                      | `pointer-events-none` on the overlay layer; users can still see stale data clearly                                                                                                                       |
| Layout shift from dashboard skeleton → real content                                                                                     | `DashboardSectionSkeleton` height must match real section height approximately; use `min-h-[200px]` / `min-h-[300px]` per section                                                                        |
| Duplicate skeleton display: `loading.tsx` fires on navigation, then Suspense fires on hydration                                         | Both show the same skeleton component → no visual jump; this is correct behaviour                                                                                                                        |
| Admin `(dashboard)/loading.tsx` at the group level vs specific route `loading.tsx`                                                      | Next.js resolves the nearest `loading.tsx`; segment-level files take precedence over group-level ones. Add both and rely on segment specificity                                                          |

## Notes

- No new Orval-generated hooks are needed; all gaps are closed with existing hooks + `isFetching`
- The `Skeleton` primitive for `store-admin` is intentionally a copy of `store-client`'s — both
  apps are independent Next.js workspaces; sharing via a `packages/` workspace is a future
  architecture task, not in scope here
- The `loading.tsx` pattern does NOT replace the existing `<Suspense>` inside pages; both coexist.
  `loading.tsx` provides instant navigation feedback; `<Suspense>` covers initial React hydration.
- Admin form edit views (`edit-product-view`, `edit-category-view`, `edit-product-group-view`) retain
  their inline `isLoading` form skeletons — those are React Query (client) loading states that fire
  AFTER navigation completes, and the inline skeleton is the correct pattern there.
- The `ProductGrid` on the home page uses `<Suspense fallback={<ProductGridSkeleton />}>` and the
  component uses `isPending` internally — home page does NOT need an `isFetching` overlay because
  the home grid params never change in response to user actions; the grid is always fetching the
  latest products only.
