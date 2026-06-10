# Plan 019: AddToCart Feature (store-client)

> **Status:** In Progress
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11

## Overview

Add a `features/add-to-cart` slice to `apps/store-client` that lets a visitor (guest or
authenticated) add a product to their cart. This closes the loop in Phase 2: products can now
be browsed (HomePage, ProductListPage), inspected (ProductDetailPage), **added to the cart**,
and managed (CartPage).

The `AddToCartButton` calls the Orval-generated `useAddToCart` hook (already re-exported from
`@/entities/cart` as of TASK-031-A) and invalidates the cart query on success so the header
and CartPage reflect the change. It replaces the disabled placeholder CTA built in TASK-030-E
inside `ProductDetailView`.

**Dependency:** TASK-051-J (Orval regen — cart endpoints are guest-capable). Works for guests
via the `cartToken` cookie; no auth required.

## API Status — No Blockers

| Hook           | Variable                 | Endpoint               | Auth          |
| -------------- | ------------------------ | ---------------------- | ------------- |
| `useAddToCart` | `{ data: AddToCartDto }` | `POST /api/cart/items` | None (cookie) |

```ts
interface AddToCartDto {
  productId: string;
  variantId?: string; // omit for products without variants
  quantity: number; // 1-99
}
```

The mutation response is the full updated cart; we ignore the body and instead invalidate
`getGetCartQueryKey()` so all cart consumers refetch (consistent with TASK-031's
refetch-on-success strategy).

## Scope

### In Scope

- `features/add-to-cart/ui/add-to-cart-button.tsx` — `'use client'` button calling `useAddToCart`
- `features/add-to-cart/index.ts` barrel + `features/index.ts` export
- Integrate `<AddToCartButton>` into `widgets/product-detail/ProductDetailView`, replacing the
  disabled "Add to Cart — coming soon" placeholder (uses the selected variant + base product)
- Transient success feedback ("Added ✓") derived from `mutation.isSuccess` (no effect)
- Pending state ("Adding…") and inline error (`role="alert"`)
- Disable when the selected variant is out of stock
- Cart query invalidation on success
- Design tokens only; Orval hooks only; a11y

### Out of Scope

- Quick-add from `ProductCard` on listing/home grids (cards have no variant selection — a
  variant-required product can't be added without a choice; deferred)
- Quantity selector on the detail page (adds quantity 1; CartPage adjusts quantity afterwards)
- Cart item-count badge in the header (future CartWidget task)
- Optimistic updates (Phase 5)

## Tasks

### TASK-032-A: Create features/add-to-cart/AddToCartButton

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-3h) · **Depends on:** TASK-031-A

**Acceptance Criteria:**

- [ ] `src/features/add-to-cart/ui/add-to-cart-button.tsx` is a `'use client'` component
- [ ] Props: `{ productId: string; variantId?: string | null; quantity?: number; disabled?: boolean; className?: string }`
- [ ] Calls `useAddToCart` from `@/entities/cart`; on click mutates
      `{ data: { productId, variantId: variantId ?? undefined, quantity: quantity ?? 1 } }`
- [ ] `onSuccess` invalidates `getGetCartQueryKey()` via `useQueryClient`
- [ ] Button label: "Add to Cart"; while `isPending`: "Adding…" + disabled; on `isSuccess`: "Added ✓"
- [ ] Disabled when `disabled` prop is true or mutation is pending
- [ ] On error: inline `<p role="alert" className="text-destructive text-sm">`
- [ ] Design tokens only (`bg-primary text-primary-foreground`); no raw hex; no manual fetch/axios
- [ ] `features/add-to-cart/index.ts` barrel exports `AddToCartButton`; `features/index.ts` updated
- [ ] `npm run typecheck`/`lint -w apps/store-client` pass

### TASK-032-B: Integrate AddToCartButton into ProductDetailView

**Type:** feat · **Scope:** store-client · **Complexity:** S (1h) · **Depends on:** TASK-032-A

**Acceptance Criteria:**

- [ ] The disabled placeholder button in `widgets/product-detail/ui/product-detail-view.tsx`
      is replaced with `<AddToCartButton productId={product.id} variantId={effectiveVariantId} disabled={outOfStock} />`
- [ ] `outOfStock` is true when a variant is selected and its `stock === 0`
- [ ] FSD respected: `widgets/product-detail` imports `AddToCartButton` from `@/features/add-to-cart`
- [ ] `npm run typecheck`/`lint -w apps/store-client` pass

### TASK-032-C: Build verification

**Type:** test · **Scope:** store-client · **Complexity:** S (30min) · **Depends on:** TASK-032-B

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-client` exits 0
- [ ] `/products/[slug]` renders a working "Add to Cart" button (manual smoke once app + DB run)

## Notes

- `widgets → features` import is the correct FSD direction.
- Adding to cart as a guest issues/uses the `cartToken` cookie automatically (`withCredentials`).
- After login, the merged user cart already reflects items added as a guest (TASK-051-H).
