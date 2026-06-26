# Plan: Product-Card Stock Guard — AddToCartButton Disabled for Stock-0 (TASK-144)

> **Status:** Done (TASK-144-A/B/C complete)
> **Phase:** Phase 2 — Storefront & Cart (critical bug fix, frontend companion to TASK-143)
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **Branch:** `fix/144-product-card-stock-guard` from `develop`

---

## Overview

Stock-0 products can be added to the cart from every product **list** surface
(homepage grid, catalog/filter page) because both list widgets pass
`<AddToCartButton productId={product.id} compact />` with no stock guard.
The PDP (`product-detail-view.tsx`) already passes `disabled={product.stock === 0}`.

The backend guard (TASK-143) now rejects the invalid add before any DB write, but the
frontend should not send the request at all: a disabled button with an out-of-stock label
eliminates the user-visible 400 toast on the card and improves UX.

This plan is frontend-only. No Prisma migration, no backend changes, no Orval
regeneration — `stock` is already present in the list API response and in the generated
`ProductEntity` type.

---

## Call-site Audit

All `<AddToCartButton` usages in `apps/store-client/src/`:

| File                                                    | Guard present?                         | Action            |
| ------------------------------------------------------- | -------------------------------------- | ----------------- |
| `widgets/product-grid/ui/product-grid.tsx:44`           | No                                     | Fix in TASK-144-B |
| `widgets/product-list/ui/product-list.tsx:71`           | No                                     | Fix in TASK-144-B |
| `widgets/product-detail/ui/product-detail-view.tsx:139` | Yes — `disabled={product.stock === 0}` | No change needed  |
| `widgets/product-detail/ui/mobile-atc-bar.tsx:31`       | Yes — receives `disabled` from parent  | No change needed  |

Both `product-grid` and `product-list` are in scope. No additional unguarded call sites
were found.

---

## `stock` Serialization Verification

The list endpoint serializes `stock` in full.

- **Backend:** `ProductEntity.fromPrisma()` (`apps/store-api/src/product/entities/product.entity.ts:169`) explicitly maps `entity.stock = product.stock`. The `@ApiProperty` decorator documents it. No stripping occurs in the list path.
- **Generated contract:** `apps/store-client/src/shared/api/generated/models/productEntity.ts` declares `stock: number` (described as "Available stock quantity for this position").
- **Grid query:** `useProductControllerFindAll({ ..., isActive: true })` returns `ProductEntity[]` — `product.stock` is available on every card without additional fetching.

---

## UX Design Decision

### Recommended: Option A — `outOfStock` prop on `AddToCartButton`

Add an `outOfStock?: boolean` prop to `AddToCartButton`. When `compact && outOfStock`:

- The button label changes to `dict.addToCart.outOfStock` ("Немає в наявності") instead of `dict.addToCart.idle` ("Додати до кошика").
- The button is `disabled` (via `disabled || outOfStock || addToCart.isPending`).
- No overlay, badge, or additional DOM element is needed — the label change alone
  communicates the state, matching the existing text that `ProductStockIndicator` shows
  on the PDP.

**Why `outOfStock` as a separate boolean and not just `disabled`:**
`disabled` is already on the interface for general disable scenarios (e.g. pending). A
dedicated `outOfStock` flag lets the button change its label semantically — "Немає в
наявності" vs "Додати до кошика" — without the caller having to inject raw strings or
children into the button. The feature layer (`add-to-cart`) owns the copy; the widget
layer just passes the domain fact (`product.stock === 0`). This respects FSD import
direction: widget passes data down into feature, never the reverse.

**Dictionary:** Add `outOfStock: "Немає в наявності"` to the `addToCart` slice in
`shared/config/dictionary.ts`. This mirrors `dict.product.outOfStock` (same string) but
lives in the feature's own slice so the slice is self-documenting. A code comment should
note the mirroring.

**a11y:** A native `<button disabled>` is excluded from tab order. The visible label
"Немає в наявності" is rendered inside the button and is announced when a screen reader
does encounter it (e.g. in browse-by-element mode). This is consistent with the PDP:
there, the `ProductStockIndicator` provides the separate "Немає в наявності" message and
the button is simply disabled. For the compact card context, the label change gives
equivalent information in a single element without adding DOM complexity. No additional
`aria-*` attributes are required beyond the native `disabled`.

### Alternative: Option B — stock badge on `ProductCard`

Add an "Немає в наявності" overlay or text line to `shared/ui/product-card.tsx` and keep
the button simply `disabled`. **Rejected** because it touches the shared/ui layer (which
must stay free of feature imports per FSD), requires adding a conditional slot or logic to
`ProductCard`, and duplicates text that the button itself can surface via Option A. The
change surface is larger for a bug fix with equivalent UX outcome.

---

## Scope

### In Scope

- `apps/store-client/src/shared/config/dictionary.ts` — add `addToCart.outOfStock`
- `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.tsx` — add `outOfStock?: boolean` prop; compact label logic
- `apps/store-client/src/widgets/product-grid/ui/product-grid.tsx` — pass `outOfStock={product.stock === 0}`
- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — pass `outOfStock={product.stock === 0}`
- New test files for `product-grid` and `add-to-cart-button`

### Out of Scope

- PDP (`product-detail-view.tsx`, `mobile-atc-bar.tsx`) — already guarded, no change
- `shared/ui/product-card.tsx` — must remain feature-agnostic (FSD rule)
- Backend / API contract / Orval regeneration — not needed
- TASK-132 (hide raw stock count from customers) — separate task, not a dependency here
- TASK-145 (deactivated products visible via direct slug) — separate backend bug

---

## Tasks

### TASK-144-A: Add `outOfStock` prop to `AddToCartButton` + dict entry

**Type:** feat
**Scope:** store-client
**Complexity:** S (< 1 h)
**TDD Required:** No (logic is trivial; tests in TASK-144-C)
**Depends on:** none

**Acceptance Criteria:**

- [ ] `dict.addToCart.outOfStock` = `"Немає в наявності"` added to `shared/config/dictionary.ts`; a
      comment notes it mirrors `dict.product.outOfStock`.
- [ ] `AddToCartButtonProps` gains `outOfStock?: boolean` (default `false`).
- [ ] Compact rendering: when `outOfStock` is true, the label is `dict.addToCart.outOfStock`;
      otherwise the existing `label` variable (`idle` / `adding` / `added`) is shown.
- [ ] The button's `disabled` attribute evaluates to `disabled || outOfStock || addToCart.isPending`
      (true when any of the three is true).
- [ ] Default (non-compact / PDP) rendering is unchanged — `outOfStock` has no visible
      effect there, because the PDP handles the "Немає в наявності" message via
      `ProductStockIndicator` and already passes `disabled` explicitly.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint -w apps/store-client` exits 0.

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — add `addToCart.outOfStock`
- `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.tsx` — add prop + compact label logic

---

### TASK-144-B: Apply stock guard to both unguarded list widgets

**Type:** fix
**Scope:** store-client
**Complexity:** S (< 30 min)
**TDD Required:** No
**Depends on:** TASK-144-A

**Acceptance Criteria:**

- [ ] `product-grid.tsx` line 44: renders
      `<AddToCartButton productId={product.id} compact outOfStock={product.stock === 0} />`
- [ ] `product-list.tsx` line 71: renders
      `<AddToCartButton productId={product.id} compact outOfStock={product.stock === 0} />`
- [ ] In-stock products (`stock > 0`) render an enabled "Додати до кошика" button — behaviour
      unchanged.
- [ ] Stock-0 products render a disabled "Немає в наявності" compact button.
- [ ] No `disabled` prop needs to be passed separately (it is implied by `outOfStock`).
- [ ] FSD import direction preserved: widgets import from features; `shared/ui/product-card.tsx`
      is untouched.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint -w apps/store-client` exits 0.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-grid/ui/product-grid.tsx` — add `outOfStock` prop
- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — add `outOfStock` prop

---

### TASK-144-C: Tests for the stock guard

**Type:** test
**Scope:** store-client
**Complexity:** M (1–2 h)
**TDD Required:** No (guard is self-evident; tests verify wiring)
**Depends on:** TASK-144-A, TASK-144-B

**Accepted test runner:** Jest + RTL (`@testing-library/react`) + MSW (`msw`), matching the
pattern established in `product-detail-view.test.tsx` and `cart-view.test.tsx`. RTL is
already wired (confirmed by existing widget tests); MSW server is available at
`@/shared/test/msw-server`.

**Acceptance Criteria:**

- [ ] `apps/store-client/src/widgets/product-grid/ui/product-grid.test.tsx` — new file:
  - Test 1: when the products API returns a stock-0 product, the rendered "Add to cart"
    action is a `<button>` that is `disabled` and whose accessible name is
    "Немає в наявності" (uses `getByRole('button', { name: dict.addToCart.outOfStock })`).
  - Test 2: when the products API returns an in-stock product, the button is NOT disabled
    and its accessible name is "Додати до кошика".
  - MSW handler mocks `GET */api/products` returning a `{ data: [...], meta: {...} }` envelope
    consistent with the `ProductEntity` shape (include `stock` field).
- [ ] `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.test.tsx` — new file
      (unit-level, no MSW needed):
  - Test 1: renders `outOfStock` compact button as disabled with label "Немає в наявності".
  - Test 2: renders normal compact button as enabled with label "Додати до кошика" when
    `outOfStock` is false/absent.
  - Mock `useAddToCart` and `useQueryClient` so the component renders without a real API.
- [ ] All new tests pass: `npm run test -w apps/store-client` exits 0.
- [ ] `npm run lint -w apps/store-client` exits 0.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-grid/ui/product-grid.test.tsx` — new
- `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.test.tsx` — new

---

## Implementation Sequence

1. Complete TASK-144-A: dict entry + button prop.
2. Complete TASK-144-B: wire the guard into both widgets.
3. Complete TASK-144-C: write and run tests.
4. Run `npm run lint -w apps/store-client && npm run typecheck` to confirm full green.
5. Open a PR from `fix/144-product-card-stock-guard` → `develop`.

---

## Technical Notes

### `AddToCartButton` compact rendering after TASK-144-A

The relevant excerpt of `add-to-cart-button.tsx` after the change (conceptual, not a
line-by-line rewrite):

```
// Props interface adds:
//   outOfStock?: boolean  (default false)

// Compact label logic (replaces the existing `label` variable usage in compact branch):
const compactLabel =
  outOfStock
    ? dict.addToCart.outOfStock
    : addToCart.isPending
      ? dict.addToCart.adding
      : addToCart.isSuccess
        ? dict.addToCart.added
        : dict.addToCart.idle;

// Compact button:
<Button
  disabled={disabled || outOfStock || addToCart.isPending}
  ...
>
  <ShoppingCart aria-hidden="true" />
  {compactLabel}
</Button>
```

The default (non-compact) button path is unchanged.

### Why both `product-grid` and `product-list` must be in scope

The task description identified only `product-grid` as the gap, but the call-site audit
found `product-list.tsx` (the catalog/filter page) has the identical unguarded call. Both
widgets consume `useProductControllerFindAll`, which returns `ProductEntity[]` with the
`stock` field. The fix is two-line in each widget and must be applied to both to close the
bug on all list surfaces.

---

## Acceptance Criteria (summary)

- [ ] Stock-0 products cannot be added from the homepage product grid (button disabled;
      no add-to-cart request fires).
- [ ] Stock-0 products cannot be added from the catalog/filter product list page (same guard).
- [ ] Out-of-stock state on the card button shows "Немає в наявності" — no raw hardcoded
      Ukrainian text in markup; copy comes from `dict.addToCart.outOfStock`.
- [ ] In-stock products add normally from both list surfaces.
- [ ] FSD import direction preserved: stock logic lives in the `product-grid` and
      `product-list` widgets (and the `add-to-cart` feature); `shared/ui/product-card.tsx`
      is untouched.
- [ ] PDP `product-detail-view.tsx` and `mobile-atc-bar.tsx` are not modified.
- [ ] a11y: disabled/out-of-stock state is perceivable via the button label
      ("Немає в наявності") — consistent with WCAG 2.1 SC 1.3.1 and 4.1.2.
- [ ] All other `AddToCartButton` call sites audited — no additional unguarded sites found.
- [ ] `npm run lint -w apps/store-client` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test -w apps/store-client` exits 0 (including new tests from TASK-144-C).

---

## Related Tasks

- **TASK-143** (backend, done) — validate-before-write in `CartService.addToCart()`;
  plan `docs/plans/062-cart-add-validate-before-write.md`. TASK-144 is the frontend
  companion: prevents the request from being sent at all.
- **TASK-145** — Public PDP serves deactivated products (different bug; different layer).
- **TASK-132** — Hide raw stock quantity from customers on storefront (UX polish;
  separate task, not a dependency).
