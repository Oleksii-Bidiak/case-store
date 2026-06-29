# Plan 079 — Hide raw stock from customers on the storefront (TASK-132)

**Phase:** Phase 3 / Tier 3 UX polish — Wave 2
**Roadmap context:** Prevents internal inventory quantities from leaking to customers on the storefront; unblocked after TASK-158 (`feat/132-line-item-contract`) merges to `develop`.
**Branch:** `feat/132-hide-stock` (branched from `develop` after TASK-158 merges)
**Blocked by:** TASK-158 — `docs/plans/076-line-item-contract.md` must merge and Orval must be regenerated before this branch starts.
**Created:** 2026-06-29
**Status:** ⬜ To Do

---

## Context and Problem Statement

The storefront currently exposes the raw `stock` integer to customers in one rendered location:
`product-stock-indicator.tsx` renders "Залишилось мало: N шт." — the exact number of units
remaining — when stock is below the low-stock threshold. This leaks internal inventory data
(e.g. "залишилось 3 шт." tells a reseller exactly how many units to exhaust) and produces copy
that reads awkwardly for the customer rather than communicating a simple availability status.

The fix is a two-layer change:

1. **Backend (TASK-158 / prep):** Introduce `PublicProductEntity` that exposes `inStock: boolean`
   and `lowStock: boolean` derived from the raw `stock` integer, but never serialises `stock` itself
   to the JSON response. This removes the raw number from the wire entirely.

2. **Frontend (this plan / TASK-132):** Consume the new boolean fields, replace the stock number
   with a status label, and update every storefront location that currently reads `product.stock`.

---

## Blocking dependency: TASK-158 prep

After `docs/plans/076-line-item-contract.md` (TASK-158) merges and Orval regenerates, the
storefront-facing product contract changes as follows:

| Field      | Before (public product)             | After                                  |
| ---------- | ----------------------------------- | -------------------------------------- |
| `stock`    | `number` — present on list + detail | **removed** from `PublicProductEntity` |
| `inStock`  | absent                              | `boolean` — `stock > 0`                |
| `lowStock` | absent                              | `boolean` — `stock > 0 && stock <= 5`  |

**`CartItemEntity` retains `stock: number`** (per TASK-158-B: "stock field retained on
CartItemEntity — the cart still needs it client-side to cap quantity"). `cart-item-row.tsx`
uses `item.stock` only for internal quantity-stepper logic (`maxQty = Math.min(99, item.stock)`,
`outOfStock = item.stock <= 0`) and never renders the number as visible text. No changes to
`cart-item-row.tsx` or its tests are required by this task.

**Procedure before starting TASK-132:**

1. Pull `develop` (which now includes TASK-158).
2. Run `npm run generate:api` (or the project's Orval command) from the monorepo root.
3. Run `npm run typecheck -w apps/store-client` — every remaining `product.stock` reference on a
   public product type will produce a TypeScript error, surfacing any missed call site.

---

## Storefront stock display audit

| File                                                    | Current usage of `stock`                                                                        | Nature                                                   | Required action                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `widgets/product-detail/ui/product-stock-indicator.tsx` | `stock < LOW_STOCK_THRESHOLD` → `dict.product.lowStock(stock)` renders "Залишилось мало: N шт." | **Display — number visible to customer**                 | Rewrite props + rendering logic                |
| `widgets/product-detail/ui/product-detail-view.tsx`     | `<ProductStockIndicator stock={product.stock} />`                                               | Passes number to display component                       | Update call site                               |
| `widgets/product-detail/ui/product-detail-view.tsx`     | `disabled={product.stock === 0}` on `AddToCartButton`                                           | Logic only (button guard)                                | Change to `!product.inStock`                   |
| `widgets/product-detail/ui/product-detail-view.tsx`     | `disabled={product.stock === 0}` on `MobileAtcBar`                                              | Logic only (button guard)                                | Change to `!product.inStock`                   |
| `widgets/product-list/ui/product-list.tsx`              | `outOfStock={product.stock === 0}` on `AddToCartButton`                                         | Logic only (button guard)                                | Change to `!product.inStock`                   |
| `widgets/product-grid/ui/product-grid.tsx`              | `outOfStock={product.stock === 0}` on `AddToCartButton`                                         | Logic only (button guard)                                | Change to `!product.inStock`                   |
| `shared/lib/schema/buildProductSchema.ts`               | `const inStock = product.stock > 0;`                                                            | Logic only (JSON-LD availability)                        | Change to `product.inStock`; update input type |
| `widgets/cart/ui/cart-item-row.tsx`                     | `maxQty = Math.min(99, item.stock)`, `outOfStock = item.stock <= 0`                             | Logic only (qty cap); `CartItemEntity.stock` is retained | **No change needed**                           |

---

## Dictionary changes

`apps/store-client/src/shared/config/dictionary.ts` currently has three stock-related product keys:

```typescript
product: {
  inStock: (n: number) => `В наявності (${n})`,   // line 149 — no call site found (dead code)
  inStockLabel: "В наявності",                      // line 158 — used in stock indicator
  lowStock: (n: number) => `Залишилось мало: ${n} шт.`, // line 159 — used in stock indicator
}
```

After this plan:

| Key                    | Before                                         | After            | Reason                                                    |
| ---------------------- | ---------------------------------------------- | ---------------- | --------------------------------------------------------- |
| `product.inStock`      | `(n: number) => \`В наявності (${n})\``        | removed          | No call site found; `inStockLabel` provides the same text |
| `product.inStockLabel` | `"В наявності"`                                | unchanged        | Used in stock indicator's "in stock" branch               |
| `product.lowStock`     | `(n: number) => \`Залишилось мало: ${n} шт.\`` | `"Закінчується"` | Static; call site drops the `(stock)` argument            |

The customer sees three availability states:

| State             | Condition              | UA label            | Icon                    |
| ----------------- | ---------------------- | ------------------- | ----------------------- |
| В наявності       | `inStock && !lowStock` | "В наявності"       | Check (success)         |
| Закінчується      | `inStock && lowStock`  | "Закінчується"      | AlertTriangle (warning) |
| Немає в наявності | `!inStock`             | "Немає в наявності" | X (destructive)         |

No raw number appears in any branch.

---

## Tasks

### TASK-132-A: Dictionary — convert `lowStock` to static string; remove dead `inStock` function

**Type:** refactor
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** nothing (dictionary change; no Orval regen needed)

**Acceptance Criteria:**

- [ ] `dict.product.lowStock` changed from `(n: number) => \`Залишилось мало: ${n} шт.\``to the
    static string`"Закінчується"`.
- [ ] `dict.product.inStock` (the function form that takes `n: number`) removed from the dictionary
      (no call site exists; `inStockLabel` already provides the same "В наявності" text).
- [ ] No other file in `apps/store-client` references `dict.product.inStock(` — confirm with a
      project-wide search before deleting.
- [ ] TypeScript: no compile errors in the dictionary file or its importers.
- [ ] Tests pass: `npm run test -w apps/store-client` green (the stock indicator still renders
      correctly; `lowStock(stock)` call site will be fixed in TASK-132-B).

**Files to modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — convert `lowStock` to static string; delete `inStock` function form

---

### TASK-132-B: Rewrite `ProductStockIndicator` with boolean props — no raw number

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-132-A (dictionary key `lowStock` must be a static string by this point)

**Acceptance Criteria:**

- [ ] Component signature changes from `{ stock: number | null }` to
      `{ inStock: boolean; lowStock: boolean }`.
- [ ] The local constant `LOW_STOCK_THRESHOLD = 5` is removed (threshold computation now lives
      entirely in the backend `PublicProductEntity.fromPrisma` mapper).
- [ ] Rendering logic:
  - `!inStock` → renders `<X />` icon + `dict.product.outOfStock` ("Немає в наявності"),
    `text-destructive`.
  - `inStock && lowStock` → renders `<AlertTriangle />` icon + `dict.product.lowStock`
    ("Закінчується"), `text-warning`. No number, no `шт.`.
  - `inStock && !lowStock` → renders `<Check />` icon + `dict.product.inStockLabel`
    ("В наявності"), `text-success`.
- [ ] The `null` guard (previously `if (stock == null) return null`) is removed — booleans are
      never null.
- [ ] No text node anywhere in the component contains a numeric character derived from stock.
- [ ] `npm run typecheck -w apps/store-client` clean.

**Files to modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-stock-indicator.tsx` — full rewrite of
  props + logic; local threshold constant removed

---

### TASK-132-C: Update `product-detail-view.tsx` call sites

**Type:** feat
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-132-B (new `ProductStockIndicator` prop signature)

**Acceptance Criteria:**

- [ ] `<ProductStockIndicator stock={product.stock} />` replaced with
      `<ProductStockIndicator inStock={product.inStock} lowStock={product.lowStock} />`.
- [ ] `disabled={product.stock === 0}` on `<AddToCartButton>` changed to
      `disabled={!product.inStock}`.
- [ ] `disabled={product.stock === 0}` on `<MobileAtcBar>` changed to
      `disabled={!product.inStock}`.
- [ ] No remaining references to `product.stock` in `product-detail-view.tsx`.
- [ ] `npm run typecheck -w apps/store-client` clean (the `PublicProductEntity` from Orval no
      longer has a `stock` property, so TypeScript enforces the change).

**Files to modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — update
  `ProductStockIndicator` call and two `disabled` guards

---

### TASK-132-D: Update card guard sites (`product-list.tsx` and `product-grid.tsx`)

**Type:** feat
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-132-A (Orval types available; no indicator dependency)

**Acceptance Criteria:**

- [ ] `apps/store-client/src/widgets/product-list/ui/product-list.tsx`:
      `outOfStock={product.stock === 0}` changed to `outOfStock={!product.inStock}`.
- [ ] `apps/store-client/src/widgets/product-grid/ui/product-grid.tsx`:
      `outOfStock={product.stock === 0}` changed to `outOfStock={!product.inStock}`.
- [ ] No remaining references to `product.stock` in either file.
- [ ] The `AddToCartButton` disabled state remains functionally identical (out-of-stock products
      get a disabled button on both card widgets).
- [ ] `npm run typecheck -w apps/store-client` clean.

**Files to modify:**

- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — update `outOfStock` prop
- `apps/store-client/src/widgets/product-grid/ui/product-grid.tsx` — update `outOfStock` prop

---

### TASK-132-E: Update `buildProductSchema.ts` (type + availability logic)

**Type:** feat
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-132-A (Orval types available)

**Context:** `buildProductSchema` is a pure function consumed by the PDP server component
(`apps/store-client/src/app/products/[slug]/page.tsx`). It currently accepts `ProductEntity`
and computes `const inStock = product.stock > 0`. After TASK-158, `productControllerFindBySlug`
returns `PublicProductEntity` (no `stock`), so the input type and the availability computation
both need updating.

**Acceptance Criteria:**

- [ ] `BuildProductSchemaInput.product` type changes from `ProductEntity` to `PublicProductEntity`.
      Update the import at the top of the file accordingly.
- [ ] `const inStock = product.stock > 0;` replaced with `const inStock = product.inStock;`.
- [ ] The JSON-LD `availability` field continues to resolve to `"https://schema.org/InStock"` when
      `inStock === true` and `"https://schema.org/OutOfStock"` when `inStock === false` — the
      Schema.org output is unchanged; only the source of the boolean changes.
- [ ] `apps/store-client/src/app/products/[slug]/page.tsx` — the call site `buildProductSchema({
    product, ... })` passes the destructured `data` field from `productControllerFindBySlug`
      response; the TypeScript type flows automatically without a cast.
- [ ] `npm run typecheck -w apps/store-client` clean.

**Files to modify:**

- `apps/store-client/src/shared/lib/schema/buildProductSchema.ts` — update `BuildProductSchemaInput`
  type; replace `product.stock > 0` with `product.inStock`

---

### TASK-132-F: RTL tests — new indicator spec + update existing fixtures

**Type:** test
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-132-B, TASK-132-C, TASK-132-E

**Context:** Three existing test files carry `stock` in their product fixtures; they will fail
TypeScript compilation once Orval regen removes `stock` from `PublicProductEntity`. All three
must be updated. A new unit spec for `ProductStockIndicator` is added to assert that no raw
number is ever rendered.

**Acceptance Criteria:**

New file — `product-stock-indicator.test.tsx`:

- [ ] New file `apps/store-client/src/widgets/product-detail/ui/product-stock-indicator.test.tsx`
      created.
- [ ] Test 1: `{ inStock: false, lowStock: false }` → "Немає в наявності" visible in the DOM;
      `<X />` icon present (`aria-hidden`).
- [ ] Test 2: `{ inStock: true, lowStock: true }` → "Закінчується" visible; no text matching
      `/\d+\s*(шт|шт\.)/` present anywhere in the output (asserts no quantity number leaks).
- [ ] Test 3: `{ inStock: true, lowStock: false }` → "В наявності" visible; "Закінчується" and
      "Немає в наявності" absent.
- [ ] All three tests pass: `npm run test -w apps/store-client`.

Updated — `product-detail-view.test.tsx`:

- [ ] `baseProduct` fixture: `stock: 7` → `inStock: true, lowStock: false` (and `stock` field
      removed entirely — TypeScript will error if `stock` is left on `PublicProductEntity`).
- [ ] Group `positions` fixtures: `{ ..., stock: 7, ... }` → `{ ..., inStock: true, lowStock: false, ... }`;
      `{ ..., stock: 3, ... }` → `{ ..., inStock: true, lowStock: true, ... }`. Confirm
      `ProductSiblingNavigator` uses only `isActive` and `attributes` from positions — stock
      field is safe to remove from the sibling fixture without breaking navigator tests.
- [ ] Existing assertions ("shows the position's own price and sku", sibling navigator buttons)
      remain green — no behaviour change for those paths.
- [ ] Add one assertion: after the detail view renders, confirm the stock indicator shows
      "В наявності" (the `baseProduct` has `inStock: true, lowStock: false`) and does NOT
      contain text matching `/\d+\s*шт/` (`screen.queryByText(/\d+\s*шт/) === null`).

Updated — `schema.test.ts`:

- [ ] `const baseProduct: ProductEntity = { ..., stock: 5, ... }` →
      `const baseProduct: PublicProductEntity = { ..., inStock: true, lowStock: false, ... }`.
      Import `PublicProductEntity` from `@/shared/api/generated/models`; remove `ProductEntity`
      import if no longer needed.
- [ ] Test "marks the offer OutOfStock when the position has zero stock":
      `{ ...baseProduct, stock: 0 }` → `{ ...baseProduct, inStock: false, lowStock: false }`.
- [ ] All existing `buildProductSchema` tests remain green with no behaviour change.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-stock-indicator.test.tsx` — new; 3 tests
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.test.tsx` — update fixtures +
  add stock-indicator assertion
- `apps/store-client/src/shared/lib/schema/schema.test.ts` — update `baseProduct` type + OOS test fixture

---

## Execution order

```
TASK-132-A  (dictionary — prerequisite for B; can run before Orval regen)
     ↓
TASK-132-B  (indicator rewrite — depends on A for static lowStock key)
TASK-132-C  (PDP view — depends on B for new prop signature)
TASK-132-D  (card guards — independent of B/C; depends only on Orval types)
TASK-132-E  (schema builder — independent of B/C/D; depends only on Orval types)
     ↓
TASK-132-F  (tests — must come after B/C/E are done; fixtures must match new props and types)
```

A, D, and E can proceed concurrently once Orval is regenerated. B and C are sequential. F is
last, after all production code is updated.

---

## Verification (before opening PR)

- [ ] `npm run typecheck -w apps/store-client` — clean; zero references to `product.stock` on a
      `PublicProductEntity` type.
- [ ] `npm run lint -w apps/store-client` — clean.
- [ ] `npm run test -w apps/store-client` — all tests green; the new `product-stock-indicator.test.tsx`
      passes; no test asserts a numeric stock value in rendered output.
- [ ] `npm run build -w apps/store-client` — clean build.
- [ ] Manual — PDP: stock indicator renders "В наявності", "Закінчується", or "Немає в наявності"
      depending on server data; the raw unit count ("3 шт.", "2 шт.") never appears.
- [ ] Manual — Product grid / catalog list: "Немає в наявності" `AddToCartButton` for OOS products;
      the button guard is driven by `!product.inStock`, not a missing `stock` field.
- [ ] Manual — Cart page: quantity stepper is still capped at the available stock for each line
      (the `+` button disables at `maxQty = Math.min(99, item.stock)`); the stock number is not
      displayed anywhere on the cart line.
- [ ] Manual — PDP JSON-LD (View Source → search for `schema.org`): `offers.availability` is
      `"https://schema.org/InStock"` for an in-stock product and `"https://schema.org/OutOfStock"`
      for a product with `inStock: false`.

---

## Pending manual QA (post-ship)

Add to the `Pending manual QA` table in `BACKLOG.md`:

> TASK-132 stock hiding: on a running stack, confirm the PDP shows only "В наявності" /
> "Закінчується" / "Немає в наявності" — never a raw unit count; product grid OOS guard works;
> cart qty stepper is still capped correctly per `item.stock`.

---

## Completion checklist

- [ ] TASK-132-A: dictionary updated — `lowStock` static, dead `inStock` function removed
- [ ] TASK-132-B: `ProductStockIndicator` rewritten; boolean props; no raw number
- [ ] TASK-132-C: `product-detail-view.tsx` call sites updated
- [ ] TASK-132-D: `product-list.tsx` + `product-grid.tsx` card guards updated
- [ ] TASK-132-E: `buildProductSchema.ts` type + logic updated
- [ ] TASK-132-F: new indicator test + updated PDP view test + schema test fixtures
- [ ] All automated gates green: typecheck + lint + test + build
- [ ] `BACKLOG.md` TASK-132 → ✅, plan link added
