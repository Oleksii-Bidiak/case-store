# Plan: PDP Deactivated-Product Guard — Block Public Access to Inactive Products (TASK-145)

> **Status:** Done
> **Phase:** Phase 5 — Polish & Production (Tier 0 security bug fix)
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **Branch:** `fix/145-pdp-deactivated-product-guard` from `develop`

---

## Overview

The public Product Detail Page endpoint (`GET /api/products/:slug`) serves deactivated
products when their slug is requested directly. An admin who deactivates a product expects
it to disappear from the storefront immediately. Instead, the product remains accessible
via its URL, leaking hidden content to any customer who knows the slug. This closes the
admin panel QA finding B2 ("deactivate still visible on storefront").

The root cause is a single missing filter in `ProductRepository.findBySlugWithRelations`:
the query excludes soft-deleted rows (`deletedAt: null`) but does not exclude inactive
rows (`isActive: false`).

The fix must not permanently block the future admin/manager preview path (TASK-155). The
recommended approach parameterizes the filter so TASK-155 can bypass it for staff without
requiring a new repository method.

This plan follows the same TDD structure used for TASK-143
(`docs/plans/062-cart-add-validate-before-write.md`): Red → Green → Refactor.

---

## Root Cause Analysis

### Call-site audit — every public product read path

| Method                          | Called from                                                          | Guard                  | `isActive` enforced?                       | Verdict                        |
| ------------------------------- | -------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | ------------------------------ |
| `findBySlugWithRelations(slug)` | `ProductService.findBySlug()` → `GET /products/:slug` (public)       | None                   | No — only `deletedAt: null`                | **BUG — fix in this task**     |
| `findAll(params)`               | `ProductService.findAll()` → `GET /products` (public)                | None                   | Optional via caller param; no hard default | Secondary gap (see note below) |
| `findById(id)`                  | `ProductService.findById()` → `GET /products/admin/:id`              | `AdminGuard`           | No — intentional; admin sees inactive      | Correct — admin-only           |
| `findBySlug(slug)`              | `ProductService.create()` / `.update()` — slug uniqueness check only | `AdminGuard` on caller | n/a — uniqueness check, not a public read  | Not a bug                      |
| `findBySku(sku)`                | `ProductService.create()` / `.update()` — SKU uniqueness check only  | `AdminGuard` on caller | n/a — uniqueness check                     | Not a bug                      |

**Secondary gap — list endpoint (`findAll`):**
`ProductListQueryDto.isActive` is optional with no hard default. If a client omits the
query parameter, the repository returns all products including inactive ones. The storefront
Orval hook (`useProductControllerFindAll`) passes `isActive: true` in its default call,
so the real storefront is safe. However this is a defence-in-depth gap. It is **out of scope
for TASK-145** — fixing it requires a separate decision on whether the public list endpoint
should force `isActive: true` or leave the filter to callers (the admin uses the same
endpoint). It should be tracked as a follow-up.

### Exact bug location

`apps/store-api/src/product/product.repository.ts`, method `findBySlugWithRelations`,
line 196–197:

```typescript
// Current (line 196-197 of product.repository.ts):
where: { slug, deletedAt: null },
```

The `positions` relation filter at line 209 already uses the correct pattern
`where: { isActive: true, deletedAt: null }`. The root query must match it.

### Error surface — how "not found" currently surfaces

When `findBySlugWithRelations` returns `null`, `ProductService.findBySlug` throws
`NotFoundException('Product not found')` (service line 130–132). NestJS maps this to HTTP 404. After the fix, a deactivated product's slug also returns `null` from the repository,
triggering the same `NotFoundException` and the same 404 response. The deactivated case
is therefore indistinguishable from a missing slug — which is the correct, desired
behaviour.

### Cache interaction

`ProductService.deactivate()` already calls `this.evictProductDetail(id, product.slug)`,
which deletes both `productDetailIdKey(id)` and `productDetailSlugKey(slug)` from Redis
immediately after deactivation (service lines 258–260). So after the fix:

1. Admin deactivates a product → cache evicted immediately.
2. Next public request to that slug → `findBySlugWithRelations` returns `null` → 404.

No additional cache work is required. Deployments that have an existing stale cache entry
for a deactivated product will serve it until the TTL expires or until the admin
reactivates+deactivates the product (which re-evicts). This is an acceptable operational
note for the first deploy.

---

## Proposed Fix

### Recommendation: Option B — parameterized `activeOnly` flag (default `true`)

Add an optional second argument `{ activeOnly?: boolean }` (default `true`) to
`findBySlugWithRelations`. The `where` clause becomes:

```typescript
where: { slug, deletedAt: null, ...(activeOnly ? { isActive: true } : {}) },
```

The public call site (`ProductService.findBySlug`) does not pass the argument, picking up
the safe default. When TASK-155 (admin preview) is implemented, its new service method
can call `findBySlugWithRelations(slug, { activeOnly: false })` without any additional
repository method or duplication.

**Why not Option A (direct hardcode)?**
Option A (`where: { slug, isActive: true, deletedAt: null }`) closes the bug with the
smallest possible change but forces TASK-155 to either duplicate the entire query into a
new repository method or add an awkward workaround (e.g., re-fetching via `findById`). The
one-argument overhead of the flag is trivial and keeps the door open cleanly.

**Why not a second repository method?**
A `findBySlugWithRelationsUnguarded(slug)` method would duplicate the complex `include`
block (category, group, positions, images) verbatim. Any future change to the include
shape (new relation, ordering change) would then need to be applied in two places. The
flag approach keeps the query in one place.

**Clean Architecture compliance:**
The repository decides _what data to fetch_; the service decides _which visibility policy
applies_. The `activeOnly` flag is a data-access parameter (part of the repository
interface), not business logic leaking downward. The service remains the authority on
"this is a public call, so apply the active filter."

---

## TDD: Red → Green → Refactor

### Red (TASK-145-A)

Write failing tests before touching any implementation.

**`product.repository.spec.ts` — new `findBySlugWithRelations` describe block:**

1. Test: `should include isActive: true in the where clause by default` — assert that the
   Prisma `findFirst` call includes `{ isActive: true, deletedAt: null, slug }`.
   Current code only has `{ slug, deletedAt: null }` → test fails (Red).

2. Test: `should omit the isActive filter when activeOnly is false` — assert that
   `findFirst` receives `{ slug, deletedAt: null }` without `isActive` when called with
   `{ activeOnly: false }`.

**`product.service.spec.ts` — new test in the `findBySlug` describe block:**

3. Test: `should throw NotFoundException when product exists but is inactive` — mock
   `findBySlugWithRelations` to return `null` (simulating the repository correctly
   filtering out an inactive product), assert that `findBySlug` throws `NotFoundException`.
   This documents the service-level contract independent of the repository implementation.

**`product.e2e-spec.ts` — new tests in the `GET /api/products/:slug` describe block:**

4. Test: `should return 404 when a deactivated product slug is requested` — mock
   `productRepositoryMock.findBySlugWithRelations` to return `null` (as it will after
   the fix when `isActive: false`), assert HTTP 404.

5. Test (regression guard): `should return 200 for an active product slug` — mock returns
   the full `testProductWithRelations` object, assert HTTP 200 and body shape. This is a
   restatement of the existing passing test to make it explicit in the regression context.

### Green (TASK-145-B)

Apply the minimal implementation change:

- Add optional `activeOnly?: boolean` (default `true`) to `findBySlugWithRelations`.
- Spread `isActive: true` into the `where` clause when `activeOnly` is `true`.
- Run the full test suite — all five Red tests should now be Green.

### Refactor (TASK-145-C)

- Update JSDoc on `findBySlugWithRelations` to document the `activeOnly` parameter and
  describe when to pass `false` (staff/admin preview, TASK-155).
- Update JSDoc on `ProductService.findBySlug` to note it uses the default public filter.
- Verify no regressions: `npm run test -w apps/store-api` (unit + e2e).

---

## Tasks

### TASK-145-A: Write failing tests (Red)

**Type:** test
**Scope:** store-api
**Complexity:** S (1–2 h)
**TDD Required:** Yes — this IS the Red step
**Depends on:** none

**Acceptance Criteria:**

- [ ] `product.repository.spec.ts` has a new `describe('findBySlugWithRelations')` block
      with at least two tests:
  - Default call includes `where: { slug, isActive: true, deletedAt: null }` in the Prisma
    `findFirst` argument.
  - Call with `{ activeOnly: false }` omits `isActive` from the `where` clause
    (or sets it absent), proving the bypass option works.
- [ ] `product.service.spec.ts` `findBySlug` describe block includes a test asserting that
      when `findBySlugWithRelations` resolves `null`, `findBySlug` throws `NotFoundException`.
      (This test may already exist in a weaker form — make it explicit for the inactive case.)
- [ ] `product.e2e-spec.ts` `GET /api/products/:slug` describe block has a new test:
      `should return 404 when the repository returns null (deactivated or missing product)`.
- [ ] All new tests **fail** when run against the current implementation
      (`npm run test -w apps/store-api` shows failures in the new cases).
- [ ] No existing passing tests are broken by adding these tests.
- [ ] `npm run lint -w apps/store-api` exits 0.

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.spec.ts` — add `findBySlugWithRelations` test block
- `apps/store-api/src/product/product.service.spec.ts` — add/strengthen inactive-product test in `findBySlug`
- `apps/store-api/test/product.e2e-spec.ts` — add 404-for-deactivated e2e test

---

### TASK-145-B: Fix `findBySlugWithRelations` (Green)

**Type:** fix
**Scope:** store-api
**Complexity:** S (< 30 min)
**TDD Required:** Yes — this IS the Green step
**Depends on:** TASK-145-A

**Acceptance Criteria:**

- [ ] `findBySlugWithRelations` signature changes to
      `findBySlugWithRelations(slug: string, options?: { activeOnly?: boolean })`.
- [ ] When `options.activeOnly` is `true` (the default), the Prisma `findFirst` call
      includes `isActive: true` in the `where` clause alongside `slug` and `deletedAt: null`.
- [ ] When `options.activeOnly` is `false` (staff override for TASK-155), `isActive` is
      absent from the `where` clause — only `slug` and `deletedAt: null` filter.
- [ ] The call site in `ProductService.findBySlug` is not modified (no explicit argument
      passed; the default `true` applies).
- [ ] All five tests written in TASK-145-A are now Green.
- [ ] All previously passing tests remain Green: `npm run test -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0.
- [ ] `npm run typecheck` exits 0.

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.ts` — add `options` parameter to
  `findBySlugWithRelations`; spread `isActive: true` into `where` when `activeOnly` defaults
  or is `true`

---

### TASK-145-C: Refactor + JSDoc

**Type:** refactor
**Scope:** store-api
**Complexity:** S (< 30 min)
**TDD Required:** No (all tests already Green)
**Depends on:** TASK-145-B

**Acceptance Criteria:**

- [ ] JSDoc on `findBySlugWithRelations` updated to document the `options.activeOnly` flag,
      its default of `true`, and that `false` is reserved for staff preview (TASK-155).
- [ ] JSDoc on `ProductService.findBySlug` updated to state: "Public endpoint — uses the
      default `activeOnly: true` filter; deactivated products return 404."
- [ ] The existing `// Sibling positions are ... active, non-deleted` comment at the
      `positions` relation filter (line 208) is left intact — it already explains that
      pattern correctly.
- [ ] No behaviour change: all tests remain Green after the refactor.
- [ ] `npm run test -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0.
- [ ] `npm run typecheck` exits 0.

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.ts` — JSDoc on `findBySlugWithRelations`
- `apps/store-api/src/product/product.service.ts` — JSDoc on `findBySlug`

---

## Implementation Sequence

1. Complete TASK-145-A: write the three failing test additions (repo spec, service spec, e2e spec). Confirm they fail.
2. Complete TASK-145-B: apply the one-line `where` fix in `findBySlugWithRelations`. Confirm all tests are now Green.
3. Complete TASK-145-C: update JSDoc. Re-run the suite to confirm no regressions.
4. Run `npm run lint -w apps/store-api && npm run typecheck` for a full clean gate.
5. Open a PR from `fix/145-pdp-deactivated-product-guard` → `develop`.

---

## Technical Notes

### Exact `where` clause before and after

**Before (current — buggy):**

```typescript
where: { slug, deletedAt: null },
```

**After (fixed — public default):**

```typescript
const activeFilter = (options?.activeOnly ?? true) ? { isActive: true } : {};
// ...
where: { slug, deletedAt: null, ...activeFilter },
```

or equivalently with inline spread:

```typescript
where: {
  slug,
  deletedAt: null,
  ...(options?.activeOnly ?? true ? { isActive: true } : {}),
},
```

### Precedent in the same method

Line 209 (the `positions` sub-relation filter) already does this correctly:

```typescript
where: { isActive: true, deletedAt: null },
```

The root `product` query must now mirror this pattern for consistency.

### Why the service layer does not need to change for the public path

`ProductService.findBySlug` currently calls:

```typescript
const product = await this.productRepository.findBySlugWithRelations(slug);
```

With the fix, this call transparently picks up `activeOnly: true` as the default. No
change to the call site is required. The service remains unchanged and the public contract
is unaffected.

### TASK-155 future call site (preview only)

When TASK-155 (admin preview of deactivated products) is implemented, a new service method
(e.g., `findBySlugForAdminPreview`) will call:

```typescript
const product = await this.productRepository.findBySlugWithRelations(slug, {
  activeOnly: false,
});
```

That method will be guarded by `AdminGuard`/`ManagerGuard` at the controller level. No
repository duplication is required.

### `findAll` list endpoint — secondary gap (out of scope)

`ProductListQueryDto.isActive` has no hard default. A caller that omits `isActive=true`
will receive inactive products in the list. The DTO comment says "defaults to true for
public" but the code does not enforce it. The fix for TASK-145 does not touch the list
path (it is controller-guarded by query param convention, and the storefront Orval hook
passes `isActive: true`). A defence-in-depth hardening of the list default should be
tracked as a separate task.

---

## Risk & Edge Cases

| Risk                                                               | Mitigation                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale Redis cache serves a deactivated product post-deploy         | `deactivate()` already evicts `productDetailSlugKey(slug)`. Entries cached before deploy expire at TTL (default 300 s). No extra work required; document in deploy notes. |
| TASK-155 (admin preview) path blocked permanently                  | Mitigated by the `activeOnly: false` option — the door is not closed, just default-shut.                                                                                  |
| `findAll` list endpoint still has no hard `isActive: true` default | Out of scope; noted above as a follow-up. The storefront hook passes `isActive: true` so the real UI is safe.                                                             |
| Cart/order references to already-deactivated products              | Cart validates `isActive` at add time (TASK-143). Orders reference products by `id`; order history resolves via `findById` which is admin-only. No new exposure.          |
| Regression on active product slug                                  | Covered by the explicit regression test added in TASK-145-A (test 5).                                                                                                     |

---

## Out of Scope

- TASK-155 — admin/manager preview of deactivated products (the new `activeOnly: false`
  call site must be implemented there, not here).
- `findAll` list endpoint default `isActive` hardening — separate task.
- Frontend changes — the PDP client already shows a 404 page when the API returns 404.
  No frontend work needed; the 404 case is already handled.
- Prisma schema changes — no new columns or migrations required.
- Orval regeneration — the API contract for `GET /products/:slug` does not change (404 is
  already documented in `@ApiResponse`).

---

## Acceptance Criteria (summary)

- [ ] `GET /api/products/:slug` for a deactivated product returns HTTP 404 — identical to a
      missing slug.
- [ ] `GET /api/products/:slug` for an active product continues to return HTTP 200 with the
      full product detail shape.
- [ ] `findBySlugWithRelations` default call includes `isActive: true` in the Prisma
      `where` clause — confirmed by the repository unit test.
- [ ] `findBySlugWithRelations({ activeOnly: false })` omits the `isActive` filter —
      confirmed by the bypass unit test; leaves TASK-155's implementation path open.
- [ ] No changes to the admin `GET /products/admin/:id` path — it continues to use
      `findById` which intentionally shows inactive products.
- [ ] `npm run test -w apps/store-api` exits 0 (all existing + all new tests Green).
- [ ] `npm run lint -w apps/store-api` exits 0.
- [ ] `npm run typecheck` exits 0.

---

## Related Tasks

- **TASK-143** (done) — validate-before-write in `CartService.addToCart()`; backend guard
  against adding inactive products to cart. TASK-145 closes the parallel PDP exposure.
- **TASK-144** (done) — stock-0 guard on product card `AddToCartButton`.
- **TASK-155** (planned, Tier 3) — admin/manager preview of deactivated products via the
  `activeOnly: false` override path this task deliberately leaves open.
