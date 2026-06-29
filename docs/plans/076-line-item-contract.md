# Plan 076 — Line-item product link contract + public stock hiding (prep for TASK-132/133/134)

**Phase:** Phase 3 / Tier 3 UX polish — Wave 0 prep branch
**Roadmap context:** Unblocks the frontend halves of TASK-132 (hide raw stock), TASK-133 (cart images + PDP links), TASK-134 (order-detail images + links); must merge to `develop` BEFORE those three Wave-2 branches start.
**Branch:** `feat/132-line-item-contract` (branched from `develop`)
**Created:** 2026-06-29
**Status:** ⬜ To Do

---

## Context and Problem Statement

Three Tier-3 UX tasks (TASK-132, TASK-133, TASK-134) require contract changes that live in a shared
backend seam. Running them as independent frontend branches is only safe once that seam is stable on
`develop`. This prep plan captures the backend-only work:

1. **Line-item slug + image** (TASK-133 cart / TASK-134 order-details):
   `CartItemEntity` and `OrderItemEntity` expose `productId` and `productName` but **no slug and no
   primary image URL**. The storefront cart and order-confirmation pages therefore cannot render a
   product thumbnail or link to the product detail page (PDP) without an extra HTTP round-trip per
   line — which the admin-guarded `GET /products/admin/:id` endpoint would require. Adding
   `productSlug` and `imageUrl` directly to both line-item entities resolves this cleanly.

2. **Hide raw stock on public product responses** (TASK-132 backend):
   `ProductEntity` currently exposes the raw `stock` integer on **all** responses — public list
   (`GET /products`), public detail (`GET /products/:slug`), and the admin find-by-id
   (`GET /products/admin/:id`). Only the admin path legitimately needs the number; customer-facing
   responses should expose only the derived availability signal (`inStock: boolean`, `lowStock:
boolean`) so that internal inventory quantities are never leaked.

3. **Orval regen**: once the Swagger spec reflects the two changes above, regenerate the TypeScript
   client hooks consumed by the Wave-2 frontend branches. Generated files are gitignored, so they
   never cause merge conflicts — but each Wave-2 worktree must pull `develop` and regen before coding.

---

## Investigation Findings

### ProductImage model (Prisma schema)

```
model ProductImage {
  id        String   @id @default(uuid())
  productId String   @map("product_id")
  url       String
  alt       String?
  sortOrder Int      @default(0)   @map("sort_order")
  isPrimary Boolean  @default(false) @map("is_primary")
  createdAt DateTime @default(now()) @map("created_at")
  ...
}
```

The existing `product.repository.ts → getPrimaryImagesByProductId` already establishes the canonical
"pick primary" strategy: `orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }]`. The same ordering
with `take: 1` is used in the new cart/order product `images` sub-select (see Task C).

### Current relation selects in `cart.repository.ts`

`CART_ITEMS_INCLUDE` (line ~68) selects from the `product` relation:

```typescript
product: {
  select: { id: true, name: true, price: true, compareAtPrice: true, stock: true, isActive: true }
}
```

Missing: `slug` and `images`.

### Current relation select in `order.repository.ts`

`ORDERS_INCLUDE` (line ~18) selects from the `product` relation:

```typescript
product: { select: { id: true, name: true, slug: true } }
```

`slug` is **already present** at the repository level and is typed in `OrderItemRow.product`. It just
is not yet mapped into `OrderItemEntity` (no `productSlug` field exists). Missing: `images`.

### `OrderItemRow` type (order.types.ts, line ~32)

```typescript
product: {
  id: string;
  name: string;
  slug: string;
}
```

`slug` is there; `images` is not.

### `CartWithItems.items[].product` type (cart.repository.ts, line ~52)

```typescript
product: { id: string; name: string; price: ...; compareAtPrice: ...; stock: number; isActive: boolean }
```

Neither `slug` nor `images` are present.

### Low-stock threshold

`LOW_STOCK_THRESHOLD = 5` is exported from
`apps/store-api/src/dashboard/dashboard.types.ts` (line 73). The `PublicProductEntity` mapper
needs this constant. To avoid a cross-module dependency (product → dashboard), the constant is moved
to a new `apps/store-api/src/product/product.constants.ts` file, and `dashboard.types.ts` is updated
to import from there.

### Existing entity spec files

No dedicated entity unit-spec files exist for `CartItemEntity`, `OrderItemEntity`, or `ProductEntity`
yet. The Red steps create them as new files.

---

## Recommended Approach: Public Stock Hiding

**Option chosen: dedicated `PublicProductEntity` class** (not conditional serialization).

- Create `apps/store-api/src/product/entities/public-product.entity.ts` with identical fields to
  `ProductEntity` **except**: no `stock` property; adds `inStock: boolean` and `lowStock: boolean`.
- The `static fromPrisma` mapper still **receives** `stock` internally (to compute the booleans) but
  never assigns it to the returned object — so it never reaches the JSON serializer.
- `ProductService.findAll` and `findBySlug` change their return-type interfaces to use
  `PublicProductEntity` for the `data` / `data[]` slot.
- `ProductController.findAll` and `findBySlug` update `@ApiResponse({ type: ... })` to
  `PublicProductEntity`-based envelopes so the Swagger spec reflects the new shape.
- `ProductService.findById` and `ProductController.findById` (admin path) are **untouched** —
  `ProductEntity` with raw `stock` stays.
- This gives an unambiguous Swagger schema: two distinct model names in the spec
  (`ProductEntity` for admin, `PublicProductEntity` for storefront). Orval generates separate
  TypeScript types with no union confusion.

**Why not class-transformer `@Exclude()`?**
Swagger/Orval infer the contract from decorators, not runtime values. Conditional `@Exclude()` or
serialization groups would still show `stock` in the generated schema unless a separate DTO class is
used — effectively the same outcome with more indirection.

---

## Migration Impact

None. No Prisma schema changes. All work is in query select clauses, entity classes, and the service
mapper layer. No `prisma migrate dev` required.

---

## Tasks

### TASK-158-A: TDD Red — entity mapper unit tests (CartItemEntity + OrderItemEntity slug + imageUrl)

**Type:** test
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes (this IS the Red step)
**Depends on:** nothing (new spec files)

**Acceptance Criteria:**

- [ ] New file `cart/entities/cart-item.entity.spec.ts` created.
- [ ] Test: `fromPrisma` maps `item.product.slug` → entity `productSlug`; assert value equals the
      input slug string.
- [ ] Test: `fromPrisma` maps `item.product.images[0].url` → entity `imageUrl`; assert the URL string.
- [ ] Test: `fromPrisma` with `item.product.images = []` → entity `imageUrl === null`.
- [ ] New file `order/entities/order-item.entity.spec.ts` created.
- [ ] Test: `OrderItemEntity.fromPrisma` maps `row.product.slug` → entity `productSlug`.
- [ ] Test: `OrderItemEntity.fromPrisma` maps `row.product.images[0].url` → entity `imageUrl`.
- [ ] Test: `OrderItemEntity.fromPrisma` with `images: []` → entity `imageUrl === null`.
- [ ] Running `npm run test -w apps/store-api` shows these specs **fail** (Red) — the fields
      `productSlug` and `imageUrl` do not exist on the entities yet, so assignments are undefined
      / TypeScript errors prevent compilation.

**Files to create/modify:**

- `apps/store-api/src/cart/entities/cart-item.entity.spec.ts` — new unit spec
- `apps/store-api/src/order/entities/order-item.entity.spec.ts` — new unit spec

---

### TASK-158-B: TDD Green — CartItemEntity + OrderItemEntity + repository select extensions

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes (this IS the Green step)
**Depends on:** TASK-158-A

**Acceptance Criteria:**

- [ ] `CartItemEntity` gains two new fields and decorator declarations:
  - `productSlug: string` — `@ApiProperty({ description: 'URL slug for the PDP link', example: 'iphone-15-pro-case-clear-magsafe' })`
  - `imageUrl: string | null` — `@ApiProperty({ description: 'Primary image URL, null when the product has no images', type: String, nullable: true, required: false })`
- [ ] `CartItemEntity.fromPrisma` parameter type adds:
  - `product.slug: string`
  - `product.images: Array<{ url: string }>`
- [ ] `CartItemEntity.fromPrisma` body sets:
  - `entity.productSlug = item.product.slug`
  - `entity.imageUrl = item.product.images[0]?.url ?? null`
- [ ] `stock` field **retained** on `CartItemEntity` (the cart still needs it client-side to cap
      quantity; it is no longer rendered as a visible number by the storefront, but the contract
      field stays).
- [ ] `CART_ITEMS_INCLUDE` constant in `cart.repository.ts` extends the product select:
  ```typescript
  slug: true,
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true },
  },
  ```
- [ ] `CartWithItems.items[].product` interface in `cart.repository.ts` adds:
  - `slug: string`
  - `images: Array<{ url: string }>`
- [ ] `OrderItemEntity` gains two new fields:
  - `productSlug: string` with `@ApiProperty` decorator
  - `imageUrl: string | null` with `@ApiProperty` decorator (nullable, required: false)
- [ ] `OrderItemRow.product` type in `order.types.ts` adds `images: Array<{ url: string }>`.
- [ ] `ORDERS_INCLUDE` constant in `order.repository.ts` extends the product select:
  ```typescript
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true },
  },
  ```
- [ ] `OrderItemEntity.fromPrisma` body sets:
  - `entity.productSlug = row.product.slug` (slug was already in `OrderItemRow.product`; mapping was the only missing piece)
  - `entity.imageUrl = row.product.images[0]?.url ?? null`
- [ ] All TASK-158-A specs pass green: `npm run test -w apps/store-api`
- [ ] No TypeScript errors: `npm run typecheck -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/cart/entities/cart-item.entity.ts` — add `productSlug`/`imageUrl` fields + update `fromPrisma`
- `apps/store-api/src/cart/cart.repository.ts` — extend `CART_ITEMS_INCLUDE` product select; extend `CartWithItems.items[].product` interface
- `apps/store-api/src/order/entities/order-item.entity.ts` — add `productSlug`/`imageUrl` fields + update `fromPrisma`
- `apps/store-api/src/order/order.types.ts` — add `images` to `OrderItemRow.product`
- `apps/store-api/src/order/order.repository.ts` — extend `ORDERS_INCLUDE` product select

---

### TASK-158-C: TDD Red — `PublicProductEntity` mapper unit tests

**Type:** test
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes (this IS the Red step)
**Depends on:** nothing (independent of TASK-158-A/B)

**Acceptance Criteria:**

- [ ] New file `product/entities/public-product.entity.spec.ts` created.
- [ ] Test input fixture: a product with `stock = 0` → `inStock === false`, `lowStock === false`.
- [ ] Test: `stock = 3` (≤ `LOW_STOCK_THRESHOLD = 5`) → `inStock === true`, `lowStock === true`.
- [ ] Test: `stock = 6` (> threshold) → `inStock === true`, `lowStock === false`.
- [ ] Test: the returned entity object does **not** have a `stock` own-property (assertion:
      `'stock' in entity === false` or `entity.stock === undefined`).
- [ ] Test: `ratingAverage` rounds to one decimal place (carry-over from `ProductEntity` — the same
      `Math.round(x * 10) / 10` formula applies).
- [ ] Test: `primaryImage` is mapped via `ProductImageEntity.fromPrisma` when present; `null` when
      absent.
- [ ] Running `npm run test -w apps/store-api` shows these specs **fail** (Red) — `PublicProductEntity`
      does not exist yet.

**Files to create/modify:**

- `apps/store-api/src/product/entities/public-product.entity.spec.ts` — new unit spec

---

### TASK-158-D: TDD Green — `PublicProductEntity`, constant extraction, service + controller update

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes (this IS the Green step)
**Depends on:** TASK-158-C

**Acceptance Criteria:**

- [ ] New file `apps/store-api/src/product/product.constants.ts` created, exporting:
  ```typescript
  /** Positions with stock at or below this level (but > 0) are considered low stock. */
  export const LOW_STOCK_THRESHOLD = 5;
  ```
- [ ] `apps/store-api/src/dashboard/dashboard.types.ts` updated to **import** `LOW_STOCK_THRESHOLD`
      from `../../product/product.constants` instead of defining it locally; the local definition is
      removed. The exported constant re-export (`export { LOW_STOCK_THRESHOLD }`) is kept so any
      existing dashboard imports need not change.
- [ ] New file `apps/store-api/src/product/entities/public-product.entity.ts` created:
  - Class `PublicProductEntity` with all fields from `ProductEntity` **except** `stock`.
  - Two new `@ApiProperty`-decorated boolean fields: `inStock` and `lowStock`.
  - `static fromPrisma` accepts the same shape as `ProductEntity.fromPrisma` (including `stock`)
    and computes:
    ```typescript
    entity.inStock = product.stock > 0;
    entity.lowStock = product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;
    ```
  - `stock` is **not** assigned to the entity object — it never reaches the JSON response.
- [ ] `apps/store-api/src/product/entities/index.ts` barrel export adds `PublicProductEntity`.
- [ ] `ProductService` internal interfaces `PaginatedProductsResponse.data` changes from
      `ProductEntity[]` to `PublicProductEntity[]`.
- [ ] `ProductService` internal interface `ProductDetailResponse.data` changes from `ProductEntity`
      to `PublicProductEntity`.
- [ ] `ProductService.findAll` maps via `PublicProductEntity.fromPrisma` instead of
      `ProductEntity.fromPrisma`.
- [ ] `ProductService.findBySlug` maps via `PublicProductEntity.fromPrisma` instead of
      `ProductEntity.fromPrisma`.
- [ ] `ProductService.findById` (admin path) **unchanged** — continues to use `ProductEntity.fromPrisma`.
- [ ] `ProductController`:
  - `ProductListResponseEnvelope.data` typed as `PublicProductEntity[]`.
  - `ProductDetailResponseEnvelope.data` typed as `PublicProductEntity`.
  - Both public `@ApiResponse` types updated accordingly.
  - `findAll` and `findBySlug` return types updated.
  - `findById` (admin) and all mutation endpoints **unchanged**.
  - `@ApiExtraModels` updated to include `PublicProductEntity`.
- [ ] All TASK-158-C specs pass green: `npm run test -w apps/store-api`
- [ ] `npm run typecheck -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/src/product/product.constants.ts` — new file, `LOW_STOCK_THRESHOLD` constant
- `apps/store-api/src/product/entities/public-product.entity.ts` — new entity class
- `apps/store-api/src/product/entities/index.ts` — barrel: add `PublicProductEntity`
- `apps/store-api/src/product/product.service.ts` — update interfaces + two `fromPrisma` call sites
- `apps/store-api/src/product/product.controller.ts` — update envelope types + `@ApiResponse` + `@ApiExtraModels`
- `apps/store-api/src/dashboard/dashboard.types.ts` — import `LOW_STOCK_THRESHOLD` from product.constants; remove local definition

---

### TASK-158-E: TDD Refactor — JSDoc, full test suite green, cache-key awareness

**Type:** refactor
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (cleanup only)
**Depends on:** TASK-158-B, TASK-158-D

**Acceptance Criteria:**

- [ ] `CART_ITEMS_INCLUDE` JSDoc comment updated to mention `slug` and `images` (take: 1,
      isPrimary-first) are now selected.
- [ ] `ORDERS_INCLUDE` JSDoc comment updated to mention `images` (take: 1, isPrimary-first).
- [ ] `CartItemEntity` class-level JSDoc updated to note `productSlug` and `imageUrl` fields.
- [ ] `OrderItemEntity` class-level JSDoc updated to note `productSlug` and `imageUrl` fields.
- [ ] `PublicProductEntity` class-level JSDoc explains the relationship to `ProductEntity`: that raw
      `stock` is intentionally withheld, and `inStock`/`lowStock` are computed from `stock` +
      `LOW_STOCK_THRESHOLD`. Notes which service methods use it (findAll, findBySlug) and which keep
      `ProductEntity` (admin findById).
- [ ] `product.constants.ts` has a JSDoc comment on `LOW_STOCK_THRESHOLD` explaining the threshold
      is shared between the public product contract and the dashboard low-stock query.
- [ ] `dashboard.types.ts` JSDoc updated: `LOW_STOCK_THRESHOLD` line replaced with an import note.
- [ ] Cache invalidation awareness: because `ProductService.findAll` now caches a response where
      `data[]` items are `PublicProductEntity` (no `stock` field), a comment is added near the
      `cache.set` call noting that any Redis warm-up entries from before this change must be evicted
      on deploy. (No code change required — the cache TTL handles it; the comment prevents future
      confusion.)
- [ ] Full suite green: `npm run test -w apps/store-api` + `npm run test:e2e -w apps/store-api` +
      `npm run lint -w apps/store-api`.

**Files to create/modify:**

- `apps/store-api/src/cart/cart.repository.ts` — JSDoc only
- `apps/store-api/src/cart/entities/cart-item.entity.ts` — JSDoc only
- `apps/store-api/src/order/order.repository.ts` — JSDoc only
- `apps/store-api/src/order/entities/order-item.entity.ts` — JSDoc only
- `apps/store-api/src/product/entities/public-product.entity.ts` — JSDoc + cache note
- `apps/store-api/src/product/product.constants.ts` — JSDoc refinement
- `apps/store-api/src/dashboard/dashboard.types.ts` — JSDoc update for imported constant

---

### TASK-158-F: Orval regen + contract verification

**Type:** chore
**Scope:** store-api + store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-158-E

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without errors and writes the updated spec
      (or prints to stdout — whichever the project is configured to do).
- [ ] Root `npm run generate:api` (or `npm run generate:api -w apps/store-client`) runs without
      errors and regenerates `apps/store-client/src/shared/api/generated/`.
- [ ] The regenerated Swagger spec (or the generated TypeScript types) confirms:
  - `CartItemDto` (or equivalent Orval-generated name) has `productSlug: string` and
    `imageUrl: string | null` fields.
  - `OrderItemDto` has `productSlug: string` and `imageUrl: string | null` fields.
  - The public product list/detail schema (`PublicProductEntity`) has `inStock: boolean` and
    `lowStock: boolean` but **no** `stock` field.
  - The admin product schema (`ProductEntity`) still has `stock: number`.
- [ ] `npm run typecheck -w apps/store-client` clean after regen (generated types integrate without
      errors; existing storefront code that referenced `data.stock` on a public product will fail
      TypeScript — that is intentional and the Wave-2 TASK-132 branch fixes it).
- [ ] `npm run lint -w apps/store-api` clean.
- [ ] Generated files (`apps/store-client/src/shared/api/generated/`) are **not** staged for commit
      (they are gitignored per project convention).

**Files to create/modify:**

- Generated Orval output in `apps/store-client/src/shared/api/generated/` (gitignored, not committed)

---

## Execution Order

```
TASK-158-A  →  TASK-158-B  (line-item mapper TDD Red → Green, sequential)
TASK-158-C  →  TASK-158-D  (public entity TDD Red → Green, sequential; can run in parallel with A→B)
                 ↓
           TASK-158-E       (refactor, depends on B + D complete)
                 ↓
           TASK-158-F       (Orval regen, must be last)
```

The two TDD chains (A→B and C→D) are independent at the file level and can be worked concurrently.
The refactor and Orval steps must come after both Green steps are complete.

---

## Verification (before opening PR)

- [ ] `npm run test -w apps/store-api` — all unit tests green, including the new entity specs.
- [ ] `npm run test:e2e -w apps/store-api` — all e2e tests green (repositories are mocked in e2e
      so the select changes do not reach the DB; entity mappers are exercised by unit tests).
- [ ] `npm run typecheck -w apps/store-api` — clean.
- [ ] `npm run lint -w apps/store-api` — clean.
- [ ] `npm run typecheck -w apps/store-client` — clean after Orval regen.
- [ ] Swagger UI (`/api/docs`) or the exported spec:
  - `GET /products` response schema: `data[]` items have `inStock`, `lowStock` but NO `stock`.
  - `GET /products/:slug` response schema: `data` has `inStock`, `lowStock` but NO `stock`.
  - `GET /products/admin/:id` response schema: `data` still has `stock` (and no `inStock`/`lowStock`).
  - `CartItemDto` schema: has `productSlug` (string, required) and `imageUrl` (string, nullable).
  - `OrderItemDto` schema: has `productSlug` (string, required) and `imageUrl` (string, nullable).
- [ ] `npm run build -w apps/store-api` — clean build.

---

## Completion Checklist

- [ ] TASK-158-A: entity mapper Red tests written, confirmed failing
- [ ] TASK-158-B: CartItemEntity + OrderItemEntity Green, repo selects extended, specs green
- [ ] TASK-158-C: PublicProductEntity Red tests written, confirmed failing
- [ ] TASK-158-D: PublicProductEntity Green, constant extracted, service + controller updated
- [ ] TASK-158-E: Refactor — JSDoc complete, full suite green
- [ ] TASK-158-F: Orval regen complete, generated types verified, no generated files committed
- [ ] `BACKLOG.md` TASK-158 → ✅ at merge; TASK-132/133/134 "(blocked by TASK-158)" notes removed
- [ ] PR merged to `develop` before Wave-2 worktrees are created
