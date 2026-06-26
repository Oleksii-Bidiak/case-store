# Plan: Cart Add-to-Cart — Validate Before Write (TASK-143)

> **Status:** Done (TASK-143-A/B/C complete)
> **Phase:** Phase 2 — Storefront & Cart (critical bug fix)
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **Branch:** `fix/143-cart-validate-before-write` from `develop`

---

## Overview

A critical bug causes `addToCart` to persist a `CartItem` row to the database **before**
business-rule validation runs. When the added quantity violates stock limits, the
`isActive` flag, or the 99-unit ceiling, the API returns HTTP 400 and the client shows
an error toast — but the row is already committed. The item therefore reappears in the
cart on the next page reload (or the next `GET /cart` call), producing an invisible
corrupted-cart state for both guests and authenticated users.

The fix moves all three validations (stock, isActive, MAX_QUANTITY) **before** the
`cartRepository.addItem()` call so the DB write never happens on an invalid request.

---

## Scope

### In Scope

- `cart.service.ts` — reorder: validate before write in `addToCart()`
- `cart.repository.ts` — add a narrow `findProductForCartValidation()` read for products
  not yet present in the cart
- `cart.service.spec.ts` — update existing failing-validation tests; add explicit
  regression tests asserting `addItem` is not called
- `cart.repository.spec.ts` — add a test for `findProductForCartValidation()`
- Summed-quantity semantics (existing line qty + incoming qty) must be preserved exactly
  as in the current post-write validation

### Out of Scope

- TASK-144 — frontend stock guard on the product-card `AddToCartButton` (companion fix;
  tracked separately)
- `updateItem()` and `removeItem()` service methods — these already validate before
  writing
- Any Prisma schema change — no migration needed
- Any frontend change — this plan is backend only
- API contract / Orval regeneration — no endpoint signature changes

---

## Root Cause

`cart.service.ts` `addToCart()` (lines 40–55) has the write-then-validate ordering:

```
const cart = await this.cartRepository.findOrCreate(identity);   // read
const updated = await this.cartRepository.addItem(input);         // COMMITS write
this.validateCartItems(updated);                                  // throws AFTER commit
```

`cartRepository.addItem()` (lines 226–242) runs a Prisma `$transaction` that upserts the
line via `writeCartLine` with `mode: 'increment'` and returns the full cart. That
transaction commits successfully. `validateCartItems` then inspects the returned cart and
may throw a `BadRequestException` — but the `CartItem` row is already in the database.

The three checks inside `validateCartItems()` (lines 217–236):

- `product.isActive === false` → throw 400
- `item.quantity > product.stock` → throw 400
- `item.quantity > MAX_QUANTITY (99)` → throw 400

All three operate on the **resulting** quantity after the increment, which is correct
because `addItem` increments — adding qty 5 to an existing line of 96 should indeed fail
the MAX_QUANTITY check (96 + 5 = 101 > 99). The fix must preserve this summed-quantity
semantic by computing `resultingQty = existingQty + dto.quantity` **before** the write.

---

## Approach Decision

Two options were evaluated:

**Option B — validate inside the repository `$transaction`:** push validation SQL into
`addItem` so a thrown error rolls back. This is rejected because it would move business
rules (isActive, MAX_QUANTITY) into the repository layer, violating the project's
Clean Architecture constraint (repositories = DB access only, services = business logic).

**Option A (chosen) — validate before write in the service:**

1. Use the `CartWithItems` already returned by `findOrCreate` to find the existing line's
   current quantity and product details (stock, isActive, name).
2. For a product **not yet in the cart** (a new line), fetch its details with a new
   narrow repository read — `findProductForCartValidation(productId)` — which queries
   `prisma.product` for `{id, name, stock, isActive}` only.
3. Compute `resultingQty = existingQty + dto.quantity`.
4. Run the three validations against `resultingQty` and `productDetails`.
5. Call `cartRepository.addItem()` only when all checks pass.

**Cross-module note:** `findProductForCartValidation` reads from the `Product` table
inside `CartRepository`. This is a deliberate, narrow exception: `CartRepository`
already reads product columns via `CART_ITEMS_INCLUDE` as part of every cart query.
Adding a direct product lookup for validation avoids injecting `ProductRepository`
(or `ProductService`) into `CartService`, which would create a cross-module dependency
and a potential circular-injection risk. The method is documented as cart-internal and
must not grow into a general product-access API.

---

## Technical Design

### Backend (NestJS — Clean Architecture)

#### CartRepository — new method

```typescript
/**
 * Fetch the fields needed to validate an add-to-cart request for a product
 * that is not yet present in the cart. Returns null when the product does
 * not exist or has been hard-deleted.
 *
 * Cart-internal use only — not a general product lookup.
 */
findProductForCartValidation(
  productId: string,
): Promise<{ id: string; name: string; stock: number; isActive: boolean } | null> {
  return this.prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stock: true, isActive: true },
  });
}
```

#### CartService — reordered `addToCart()`

High-level logic (see task TASK-143-B for full implementation):

```
findOrCreate(identity)                     → cart (with items)
existingLine = cart.items.find(productId)
existingQty  = existingLine?.quantity ?? 0
resultingQty = existingQty + dto.quantity

if existingLine:
  productDetails = existingLine.product    // already loaded
else:
  product = findProductForCartValidation(dto.productId)
  if !product → throw NotFoundException('Product not found')
  productDetails = product

// Validate BEFORE write
if !productDetails.isActive    → throw BadRequestException(…)
if resultingQty > stock        → throw BadRequestException(…)
if resultingQty > MAX_QUANTITY → throw BadRequestException(…)

// Only write after all checks pass
addItem({ cartId, productId, quantity })   // DB write
return CartEntity.fromPrisma(updated)
```

#### No controller changes — same HTTP 400 responses, same endpoint signature.

---

## Tasks

### TASK-143-A: Write failing tests (TDD — Red phase)

**Type:** test
**Scope:** store-api
**Complexity:** S (1–2 h)
**TDD Required:** Yes
**Depends on:** none (tests are written against the current broken behaviour first)

**Acceptance Criteria:**

- [ ] Existing `addToCart` tests that mock `cartRepository.addItem` to return an
      out-of-stock / inactive / over-max cart are updated to the new mock pattern:
  - `findOrCreate` returns a cart whose `items` array represents the pre-add state
    (either an existing line or an empty cart for new products).
  - `findProductForCartValidation` is mocked for the new-product cases (product not yet
    in cart).
  - `findItem` is no longer used in this flow (ensure mock is not accidentally called).
- [ ] New explicit regression test added:
      `"should NOT call addItem when validation fails (regression: no ghost row)"` — covers
      each failure mode (out-of-stock, inactive, over-max) asserting
      `expect(cartRepositoryMock.addItem).not.toHaveBeenCalled()`.
- [ ] New test for the summed-quantity edge case:
      `"should throw when existing qty (96) + incoming qty (5) exceeds MAX_QUANTITY (99)"` —
      `findOrCreate` returns a cart with an existing line of qty 96; validation must throw
      before `addItem` is called.
- [ ] New test for new-product NotFoundException:
      `"should throw NotFoundException when product does not exist"` — mocks
      `findProductForCartValidation` to return `null`.
- [ ] All modified tests **fail** with the current implementation (Red) — do not touch
      `cart.service.ts` or `cart.repository.ts` in this task.
- [ ] `cart.repository.spec.ts` has a new test for `findProductForCartValidation`:
      verifies it calls `prisma.product.findUnique` with the correct `where` + `select`.
- [ ] `npm run test -w apps/store-api` shows the new/modified `addToCart` tests as
      FAILING; all other tests remain green.

**Files to create/modify:**

- `apps/store-api/src/cart/cart.service.spec.ts` — update existing `addToCart` describe
  block; add regression + edge-case tests; add `findProductForCartValidation` to
  `cartRepositoryMock`
- `apps/store-api/src/cart/cart.repository.spec.ts` — add test for the new read method

---

### TASK-143-B: Fix implementation (TDD — Green phase)

**Type:** fix
**Scope:** store-api
**Complexity:** M (2–4 h)
**TDD Required:** Yes
**Depends on:** TASK-143-A

**Acceptance Criteria:**

- [ ] `CartRepository.findProductForCartValidation(productId)` added — queries
      `prisma.product.findUnique` selecting `{id, name, stock, isActive}` only; returns
      `null` when the product does not exist.
- [ ] `CartService.addToCart()` reordered:
  - `findOrCreate` result is inspected for an existing line matching `dto.productId`.
  - For an existing line, `productDetails` is taken from `existingLine.product`.
  - For a new product (no existing line), `findProductForCartValidation` is called; a
    `null` result throws `NotFoundException('Product not found')`.
  - `resultingQty = existingQty + dto.quantity` is computed.
  - All three checks (isActive, stock, MAX_QUANTITY) run against `resultingQty` BEFORE
    `cartRepository.addItem()` is called.
  - `cartRepository.addItem()` is called only after all validations pass.
  - `validateCartItems()` private method is removed (or kept as a private guard on
    `getCart` if desired — document the decision in a code comment; removing it is
    recommended to eliminate the post-write safety net that masks the bug).
- [ ] Summed-quantity semantics preserved: for an existing line of qty N and incoming qty
      M, the check is `N + M > stock` and `N + M > MAX_QUANTITY`.
- [ ] Clean Architecture preserved: business rules remain in the service; `CartRepository`
      has only the narrow product-field read, with a JSDoc comment stating its scope.
- [ ] All `addToCart` unit tests written in TASK-143-A now pass (Green).
- [ ] All pre-existing `cart.service.spec.ts` tests (getCart, updateItem, removeItem,
      clearCart, mergeGuestCart) remain green.
- [ ] `cart.repository.spec.ts` new `findProductForCartValidation` test passes.
- [ ] `npm run test -w apps/store-api` exits 0 (all tests green).
- [ ] `npm run lint` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] **Regression guard:** a manual smoke (or any e2e test) confirms that attempting to
      add an out-of-stock product returns 400 AND a subsequent `GET /cart` does NOT return
      the item (no ghost row).

**Files to create/modify:**

- `apps/store-api/src/cart/cart.service.ts` — reorder `addToCart()`; remove (or
  deprecate) `validateCartItems()`
- `apps/store-api/src/cart/cart.repository.ts` — add `findProductForCartValidation()`

---

### TASK-143-C: Refactor & documentation (TDD — Refactor phase)

**Type:** refactor
**Scope:** store-api
**Complexity:** S (< 1 h)
**TDD Required:** Yes (all tests must stay green)
**Depends on:** TASK-143-B

**Acceptance Criteria:**

- [ ] `addToCart()` has a JSDoc comment explaining the validate-before-write invariant
      and the `resultingQty` summed-quantity semantics.
- [ ] `findProductForCartValidation()` has a JSDoc comment explicitly stating it is
      cart-internal and must not be used as a general product API.
- [ ] If `validateCartItems()` was retained, a `// @deprecated` note is added
      explaining it is no longer called by `addToCart` (and should be removed in a future
      cleanup).
- [ ] No logic changes — only comments and, optionally, variable-name readability
      improvements.
- [ ] `npm run test -w apps/store-api` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run typecheck` exits 0.

**Files to create/modify:**

- `apps/store-api/src/cart/cart.service.ts` — JSDoc additions / cleanup
- `apps/store-api/src/cart/cart.repository.ts` — JSDoc additions

---

## Migration Steps

No Prisma migration needed — this fix touches only TypeScript service and repository
logic.

1. Complete TASK-143-A: write the new tests (Red — expect failures).
2. Complete TASK-143-B: implement the fix (Green — all tests pass).
3. Complete TASK-143-C: tighten documentation (Refactor — tests still green).
4. Open a PR from `fix/143-cart-validate-before-write` → `develop`.

---

## Test Impact Summary

### `cart.service.spec.ts` — `describe('addToCart')`

| Test                                                          | Current mock                            | After fix                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| "should throw when out-of-stock"                              | `addItem` returns out-of-stock cart     | `findOrCreate` returns empty cart; `findProductForCartValidation` returns stock:0 product; `addItem` must NOT be called    |
| "should throw when qty exceeds stock"                         | `addItem` returns low-stock cart        | `findOrCreate` returns empty cart; `findProductForCartValidation` returns stock:2; dto.qty=5; `addItem` must NOT be called |
| "should throw when total qty exceeds MAX_QUANTITY"            | `addItem` returns qty:100 cart          | `findOrCreate` returns cart with existing line qty:96; dto.qty=5; resultingQty=101>99; `addItem` must NOT be called        |
| "should throw when adding inactive product"                   | `addItem` returns inactive-product cart | `findOrCreate` returns empty cart; `findProductForCartValidation` returns isActive:false; `addItem` must NOT be called     |
| NEW — "should NOT call addItem on any invalid add"            | —                                       | Explicit assertion `expect(addItem).not.toHaveBeenCalled()` on all failure cases                                           |
| NEW — "should throw NotFoundException when product not found" | —                                       | `findProductForCartValidation` returns null                                                                                |
| NEW — "existing qty + incoming qty validated as sum"          | —                                       | Existing line qty:96 + dto.qty:5 = 101 > MAX_QUANTITY                                                                      |

### `cart.repository.spec.ts`

| Test                                                                                   | Notes                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| NEW — "findProductForCartValidation calls prisma.product.findUnique with correct args" | Mocks `prismaMock.product.findUnique`; verifies `where: {id}` and `select: {id, name, stock, isActive}` |

---

## Risks & Mitigations

| Risk                                                                                             | Mitigation                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Race condition: product stock changes between the pre-write validation read and the actual write | Acceptable at MVP level; the window is milliseconds. A database-level constraint (CHECK stock >= 0) or a pessimistic lock is a Phase 5 hardening task.                                          |
| `findProductForCartValidation` grows into a general product API                                  | JSDoc explicitly forbids it; code-reviewer agent checks cross-module reads                                                                                                                      |
| Removing `validateCartItems` breaks a safety net that catches other callers                      | Audit all callers before removal: only `addToCart` calls it; safe to remove. Document in commit message.                                                                                        |
| Existing snapshot / e2e tests rely on the post-write cart state                                  | None found — existing e2e tests for the cart module (`cart.e2e-spec.ts`) should be checked; if they pass a 400 scenario and assert no item in the cart they will now be stricter (and correct). |

---

## Related Tasks

- **TASK-144** (companion) — Frontend stock guard: add `disabled={product.stock === 0}`
  to the product-grid `AddToCartButton`. This prevents the invalid request being sent
  at all, complementing the backend guard.
- **TASK-145** — Public PDP serves deactivated products (separate bug in the product
  read path; not the same code).

---

## Notes

- This plan is scoped to the **backend** fix only. The frontend companion (TASK-144) is
  a separate plan/task to keep PRs reviewable.
- The `findOrCreate` return already includes `items[].product.{stock, isActive, name}`
  via `CART_ITEMS_INCLUDE`, so no extra DB round-trip is needed for the existing-line
  path. Only the new-line path (`existingLine === undefined`) requires the additional
  `findProductForCartValidation` call.
- `findItem(cartId, productId)` (cart.repository.ts:278) returns only `CartItem` without
  product details — it is not sufficient for pre-write validation and is not used in this
  fix.
- The lettered sub-tasks (A/B/C) follow the TDD Red → Green → Refactor discipline
  mandated by `AGENTS.md` for the cart module.
