# Plan: Admin/Staff Preview of Deactivated Products (TASK-155)

> **Status:** Done
> **Phase:** Phase 5 — Polish & Production (Tier 3 — UX, data & admin polish)
> **Created:** 2026-06-29
> **Last Updated:** 2026-06-29
> **Branch:** `feature/155-admin-staff-preview-deactivated-products` from `develop`
>
> **Outcome:** All sub-tasks A–G shipped. Product descriptions are plain text
> (a `<Textarea>`, not Tiptap HTML), so the widget renders them with
> `whitespace-pre-wrap` and **no DOMPurify dependency** was needed (the plan's
> DOMPurify note is moot). Verified: 482 store-api unit + 28 product-e2e + 77
> store-admin tests (3 new) + typecheck/lint/build green across all workspaces.

---

## Overview

TASK-145 closed a security bug by blocking public access to deactivated products
(`GET /api/products/:slug` now returns 404 for any product where `isActive = false`).
That fix deliberately left the repository door open: `ProductRepository.findBySlugWithRelations`
accepts an `{ activeOnly?: boolean }` option, defaulting to `true` for the public path.

TASK-155 is the paired staff-facing feature: admins must be able to preview a
deactivated product — the full rich detail view, exactly as customers would see it —
so they can verify content before re-activating. Without this, the admin deactivates a
product, loses the ability to check its presentation, and must re-activate (making it
temporarily public again) just to review it.

The scope is:

1. A new backend endpoint (`GET /api/products/admin/preview/:slug`, AdminGuard) that
   calls the existing `findBySlugWithRelations(slug, { activeOnly: false })` path.
2. Orval regen for store-admin to expose the generated hook.
3. A read-only preview page in store-admin that renders the full product detail
   (images, category, group siblings, attributes, price, stock) with a prominent
   "DEACTIVATED" banner when `isActive = false`.
4. A "Preview" link on the product edit page linking to the new preview route.

No Prisma migration is required. The repository change from TASK-145 is already in place.

---

## Design Analysis: Key Open Question

### Should "live preview" mean a storefront URL or an admin-app page?

This is the central design decision and it determines the entire scope.

**Option A — Admin-app preview page (recommended)**

A dedicated route inside store-admin at `/products/preview/[slug]` fetches the product
via a new admin-guarded API endpoint and renders a product detail view within the
admin shell. The admin sees the same data a customer would, plus staff-only context
(isActive badge, edit link, "DEACTIVATED" warning banner when applicable).

Pros:

- No cross-app authentication needed. Admins authenticate once with their admin JWT on
  store-admin; the preview call uses the same token through the existing Orval/axios
  instance that all other admin API calls use.
- Contained scope: one new endpoint, one new page, one new widget.
- The "preview" can include staff-only UI elements (warning banners, edit shortcut)
  that must not appear for customers.
- Consistent with how every other admin detail view works in this codebase.

Cons:

- The UI is a re-implementation of the storefront PDP, not the real storefront. If the
  storefront's visual design diverges significantly from the admin's rendering, the
  preview would not be pixel-perfect.

**Option B — Storefront URL with a special preview token**

The admin generates a short-lived signed JWT preview token and opens
`/products/{slug}?preview={token}` in a new tab. The storefront PDP checks for the
token, validates it against the API, and bypasses the `isActive` guard if valid.

Pros:

- The admin sees the exact storefront output.

Cons:

- Requires storefront code changes (token extraction, validation, a new "preview mode"
  code path in the PDP Server Component).
- Requires a new API endpoint to validate preview tokens, a token-generation endpoint,
  and the Token lifetime/invalidation story.
- Auth coupling: the storefront (store-client) currently has no admin JWT. Even with
  a preview token, you need a secure signing key shared between the two apps.
- The Orval-generated hook in store-client calls the public `GET /products/:slug` which
  returns 404 for deactivated products — bypassing this requires a secondary fetch
  path or a query param the hook does not currently accept.
- Significant scope increase for what is a staff-only convenience feature.

**Option C — Open the admin edit page as a "preview" (no new endpoint)**

Repurpose `GET /api/products/admin/:id` (which already bypasses isActive) and render a
read-only version of the existing product data in store-admin.

Pros: Zero new backend work.

Cons:

- `findById` returns a flat `ProductEntity` (no images array, no category name, no group
  siblings). The admin "preview" would be missing the rich display data (image gallery,
  sibling navigator, formatted description) that characterises the real PDP.
- Does not serve the use-case well.

### Recommendation: Option A

Option A delivers the meaningful preview (full rich-data view) with the narrowest
possible scope. Cross-app auth (Option B) introduces a token lifecycle problem that is
entirely out of proportion to a staff convenience feature. Option C fails to serve the
use-case. Option A is recommended.

---

## Codebase Verification

### Repository — TASK-145 hook confirmed

`apps/store-api/src/product/product.repository.ts`, method `findBySlugWithRelations`:

```typescript
async findBySlugWithRelations(
  slug: string,
  options?: { activeOnly?: boolean },
): Promise<ProductWithRelations['product'] | null> {
  const product = await this.prisma.product.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...((options?.activeOnly ?? true) ? { isActive: true } : {}),
    },
    // ... full include block (category, group + axes + positions, images)
  });
  // ...
}
```

The bypass path `findBySlugWithRelations(slug, { activeOnly: false })` is available and
tested. No new repository method is needed.

### Service — existing admin method pattern

`findById(id)` is the existing admin-only method: it calls `productRepository.findById`
(which only excludes `deletedAt: null`, not `isActive`) and returns `ProductEntity`.
`findBySlug(slug)` is the public method: calls `findBySlugWithRelations` with default
`activeOnly: true`.

The new `findBySlugForAdminPreview(slug)` method follows the same pattern as `findById`
but calls `findBySlugWithRelations(slug, { activeOnly: false })` and returns the full
relation shape.

### Controller — RBAC and route prefix

All admin product routes use `@UseGuards(AdminGuard)`, which is a single guard that:

1. Delegates to `JwtAuthGuard` (returns 401 on missing/invalid token).
2. Checks `user.role === UserRole.ADMIN` (returns 403 otherwise).

There is no `ManagerGuard` or `@Roles()` decorator pattern in the product controller.
The Prisma schema confirms only two roles exist: `CUSTOMER` and `ADMIN`. The task
description's mention of "admin/manager" therefore maps to `AdminGuard` (ADMIN role
only) in the current schema. If a MANAGER role is introduced in the future, the guard
can be extended without changing the endpoint route.

Existing admin route: `GET /api/products/admin/:id` at controller position 3.
New route: `GET /api/products/admin/preview/:slug` must be declared BEFORE
`GET admin/:id` in the controller source file. NestJS matches routes in declaration
order; if `admin/:id` is encountered first, the literal string "preview" is captured
as the `:id` parameter, and the new handler is never reached.

### ProductEntity — mapping compatibility

`ProductEntity.fromPrisma` accepts an object with optional `ratingAverage`,
`ratingCount`, and `primaryImage` fields. The return value of `findBySlugWithRelations`
(type `ProductWithRelations['product']`) includes all of those fields. The service
method can destructure `category`, `group`, and `images` and pass the rest directly
to `ProductEntity.fromPrisma`. No new entity class is required.

Response envelope for the new endpoint:

```typescript
{
  data: ProductEntity;          // full admin entity including isActive
  category: ProductCategoryEntity;
  group: ProductGroupEntity | null;
  images: ProductImageEntity[];
}
```

This reuses the four entity classes already exported from `product/entities/index.ts`.

### Cache safety

`ProductService.findBySlug` (public) populates `productDetailSlugKey(slug)` with a
`ProductDetailResponse` (containing `PublicProductEntity` — no `isActive`, no raw
`stock`). The new `findBySlugForAdminPreview` method MUST NOT write to any public cache
key, because:

- The response shape is different (`ProductEntity` vs `PublicProductEntity`).
- A cache poisoning scenario would expose admin-only data to public callers.

The preview method must skip caching entirely. Staff preview is an infrequent,
administrative operation; the absence of a cache layer is acceptable.

### Store-admin FSD structure

Relevant existing paths:

- Widget: `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`
  → `product.slug` is available on the fetched `product` object (from
  `useProductControllerFindById`). The "Preview" link goes here.
- App route: `apps/store-admin/src/app/(dashboard)/products/[id]/edit/page.tsx`
- New preview route: `apps/store-admin/src/app/(dashboard)/products/preview/[slug]/page.tsx`
  (slug-based, parallel to the public PDP's slug-based routing)

The slug-based preview route is chosen over an ID-based route (`[id]/preview`) because:

- The backend endpoint is slug-based (matching `findBySlugWithRelations`).
- It keeps the routing symmetry with the public storefront PDP.
- The Edit page has the slug available in `product.slug` from the already-cached
  `useProductControllerFindById` response, so no extra request is needed for the link.

---

## Proposed Approach

### Backend (bottom-up, TDD for new service method)

1. **Repository**: No changes. `findBySlugWithRelations` with `{ activeOnly: false }` is ready.
2. **Service**: Add `findBySlugForAdminPreview(slug)`:
   - Calls `productRepository.findBySlugWithRelations(slug, { activeOnly: false })`.
   - Throws `NotFoundException` if result is `null` (product not found or soft-deleted).
   - Returns `{ data: ProductEntity, category, group, images }`.
   - Does NOT touch the public cache.
3. **Controller**: Add `GET admin/preview/:slug` route declared BEFORE `GET admin/:id`,
   guarded by `@UseGuards(AdminGuard)`, with full Swagger annotations.
4. **Orval regen**: Generates `useProductControllerPreviewProductBySlug` hook in
   store-admin `shared/api/generated/`.

### Store-admin (FSD, frontend bottom-up)

5. **`AdminProductPreviewView` widget** (`widgets/admin-product-preview/`):
   - Uses the new Orval hook.
   - Renders: deactivated warning banner (when `data.isActive === false`), images
     (scrollable strip), name, price, compareAtPrice, description (raw HTML rendered via
     `dangerouslySetInnerHTML` + DOMPurify, matching the pattern from TASK-153), stock,
     category, attributes table, group siblings list.
   - "Back to Edit" link pointing to `/products/{productId}` — but the page receives
     the slug, not the ID. To resolve this, the widget can either navigate back in
     history (`router.back()`) or the page can pass the ID as a search param.
   - Loading skeleton + error state.
6. **App route** `products/preview/[slug]/page.tsx` + `loading.tsx`.
7. **Edit page link**: Add a "Preview" button/link in `EditProductView` that links to
   `/products/preview/{product.slug}` (opens in a new tab is optional but recommended so
   the admin does not lose form state).

---

## TDD: Red → Green → Refactor

This task introduces new business-logic behaviour on a security-relevant code path
(RBAC-guarded access to inactive content). TDD discipline applies.

### Red (TASK-155-A)

Write all failing tests BEFORE any implementation:

**`product.service.spec.ts`** — new `describe('findBySlugForAdminPreview')` block:

1. Calls `productRepository.findBySlugWithRelations` with `{ activeOnly: false }`.
2. Returns a correctly mapped response when the product is deactivated (`isActive: false`).
3. Throws `NotFoundException` when `findBySlugWithRelations` returns `null`.

**`product.e2e-spec.ts`** — new `describe('GET /api/products/admin/preview/:slug')` block: 4. Returns 200 with full product shape for a deactivated product (mock returns result
with `isActive: false`). 5. Returns 404 when `findBySlugWithRelations` returns null. 6. Returns 401 when no Authorization header is present. 7. Returns 403 when the caller has `role: CUSTOMER`.

All seven tests must fail against the current codebase (no `findBySlugForAdminPreview`
method exists; no route exists).

### Green (TASK-155-B)

Implement the minimum code to make all Red tests pass:

- Add `findBySlugForAdminPreview` to `ProductService`.
- Add `GET admin/preview/:slug` route to `ProductController` (before `GET admin/:id`).
- Add `AdminProductPreviewResponseEnvelope` class with Swagger annotations.

### Refactor (TASK-155-C)

- JSDoc on the new service method and controller handler.
- Explicit comment on cache-skip rationale in the service method.
- Verify no regressions: `npm run test -w apps/store-api` must show all existing + all
  new tests Green.

---

## Tasks

### TASK-155-A: Write failing tests (TDD Red)

**Type:** test
**Scope:** store-api
**Complexity:** S (1–2 h)
**TDD Required:** Yes — this IS the Red step
**Depends on:** none

**Acceptance Criteria:**

- [ ] `product.service.spec.ts` has a new `describe('findBySlugForAdminPreview')` block with:
  - Test: method calls `findBySlugWithRelations` with `{ activeOnly: false }`.
  - Test: returns correctly shaped response when the product has `isActive: false`.
  - Test: throws `NotFoundException` when `findBySlugWithRelations` returns `null`.
- [ ] `product.e2e-spec.ts` has a new `describe('GET /api/products/admin/preview/:slug')` block with:
  - Test: 200 response with full product body for a deactivated product mock.
  - Test: 404 when the mock returns null.
  - Test: 401 with no Authorization header.
  - Test: 403 for a CUSTOMER-role JWT.
- [ ] All seven new tests fail when run against the current codebase.
- [ ] No previously passing tests are broken.
- [ ] `npm run lint -w apps/store-api` exits 0.

**Files to create/modify:**

- `apps/store-api/src/product/product.service.spec.ts` — add `findBySlugForAdminPreview` describe block
- `apps/store-api/test/product.e2e-spec.ts` — add admin preview e2e describe block

---

### TASK-155-B: Implement backend service method and controller route (TDD Green)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1–2 h)
**TDD Required:** Yes — this IS the Green step
**Depends on:** TASK-155-A

**Acceptance Criteria:**

- [ ] `ProductService.findBySlugForAdminPreview(slug: string)` exists and:
  - Calls `this.productRepository.findBySlugWithRelations(slug, { activeOnly: false })`.
  - Does NOT call `this.cache.get` or `this.cache.set` (no public cache interaction).
  - Throws `NotFoundException('Product not found')` when the result is null.
  - Returns `{ data: ProductEntity, category: ProductCategoryEntity, group: ProductGroupEntity | null, images: ProductImageEntity[] }`.
- [ ] `GET /api/products/admin/preview/:slug` route exists in `ProductController`:
  - Declared BEFORE the `@Get('admin/:id')` handler to avoid route collision.
  - Decorated with `@UseGuards(AdminGuard)`, `@ApiBearerAuth('access-token')`.
  - Decorated with `@ApiOperation`, `@ApiParam`, and `@ApiResponse` for 200, 401, 403, 404.
  - Decorated with `operationId: 'productControllerPreviewProductBySlug'` (ensures a
    stable, predictable Orval hook name).
- [ ] A new `AdminProductPreviewResponseEnvelope` class is created (local to the
      controller file) with `@ApiProperty` on `data: ProductEntity`, `category`,
      `group`, and `images` fields.
- [ ] All seven tests from TASK-155-A are now Green.
- [ ] All previously passing tests remain Green.
- [ ] `npm run test -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0.
- [ ] `npm run typecheck` exits 0.

**Files to create/modify:**

- `apps/store-api/src/product/product.service.ts` — add `findBySlugForAdminPreview` method
- `apps/store-api/src/product/product.controller.ts` — add `AdminProductPreviewResponseEnvelope` class + `findPreviewBySlug` handler before `findById`

---

### TASK-155-C: Refactor + JSDoc + full suite verification (TDD Refactor)

**Type:** refactor
**Scope:** store-api
**Complexity:** S (< 1 h)
**TDD Required:** No (all tests already Green)
**Depends on:** TASK-155-B

**Acceptance Criteria:**

- [ ] JSDoc on `ProductService.findBySlugForAdminPreview` states:
  - That it is admin-only (the RBAC guard is at the controller level).
  - That it intentionally skips the public cache (explains why, citing cache shape
    difference and poisoning risk).
  - That it calls `findBySlugWithRelations` with `{ activeOnly: false }`.
- [ ] JSDoc on the controller handler states: "Returns the full product detail including
      deactivated products. Intended for admin preview; do not call from public paths."
- [ ] Controller file comment above the `findPreviewBySlug` handler notes the
      declaration-order requirement: "Must be declared before GET admin/:id".
- [ ] No behaviour change. `npm run test -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0.
- [ ] `npm run typecheck` exits 0.

**Files to create/modify:**

- `apps/store-api/src/product/product.service.ts` — JSDoc on `findBySlugForAdminPreview`
- `apps/store-api/src/product/product.controller.ts` — JSDoc on preview handler

---

### TASK-155-D: Orval regeneration for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (< 30 min)
**TDD Required:** No
**Depends on:** TASK-155-B

**Acceptance Criteria:**

- [ ] Running `npm run swagger:export -w apps/store-api` produces an updated OpenAPI spec
      that includes the new `GET /api/products/admin/preview/{slug}` path.
- [ ] Running `npm run generate:api -w apps/store-admin` produces a new
      `useProductControllerPreviewProductBySlug` hook and a matching
      `getProductControllerPreviewProductBySlugQueryKey` helper in
      `apps/store-admin/src/shared/api/generated/`.
- [ ] The generated types include `AdminProductPreviewResponseEnvelope` (or the inlined
      equivalent) so TypeScript consumers are fully typed.
- [ ] `npm run build -w apps/store-admin` exits 0 after regen (no TypeScript errors from
      the generated files).
- [ ] `npm run lint -w apps/store-admin` exits 0.
- [ ] Generated files are NOT hand-edited (they are gitignored and regenerated on every run).

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/products/products.ts` — auto-generated (do not hand-edit)
- `apps/store-admin/src/shared/api/generated/products/products.msw.ts` — auto-generated MSW handler (do not hand-edit)

---

### TASK-155-E: Store-admin `AdminProductPreviewView` widget

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2–4 h)
**TDD Required:** No (no critical business logic; RTL smoke test recommended)
**Depends on:** TASK-155-D

**Acceptance Criteria:**

- [ ] Widget exists at `apps/store-admin/src/widgets/admin-product-preview/ui/admin-product-preview-view.tsx`.
- [ ] On loading: renders a skeleton (reuse `AdminFormSkeleton` from `shared/ui` or a
      bespoke skeleton matching the preview layout).
- [ ] On error / 404: renders an error message with a "Back" link.
- [ ] On success (product found):
  - [ ] Renders a banner with `dict.products.previewDeactivatedBanner` (e.g.,
        "Цей товар деактивований і не відображається для покупців") when
        `data.isActive === false`. Banner must be visually prominent (yellow/warning
        background using existing design tokens).
  - [ ] Renders product images in a simple horizontal scrollable strip (first image
        prominent, others as thumbnails).
  - [ ] Renders name, price (formatted via `formatCurrency`), compareAtPrice (if set,
        with strike-through), SKU (if set), stock count.
  - [ ] Renders category name and a breadcrumb string.
  - [ ] Renders attributes as a two-column key/value table (if any attributes exist).
  - [ ] Renders group sibling list (if group is not null): each sibling as name + price,
        linking to `/products/preview/{sibling.slug}` for cross-sibling navigation.
  - [ ] Renders description using safe HTML rendering (DOMPurify sanitization, matching
        the TASK-153 pattern in `store-client`).
  - [ ] Renders a "Edit product" link pointing to `/products/{productId}` — the product
        ID is available in `data.id`.
- [ ] RTL smoke test (`admin-product-preview-view.test.tsx`):
  - Deactivated banner renders when `isActive: false`.
  - No banner when `isActive: true`.
  - Product name is rendered.
- [ ] `npm run test -w apps/store-admin` exits 0.
- [ ] `npm run build -w apps/store-admin` exits 0.

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-product-preview/ui/admin-product-preview-view.tsx` — new widget component
- `apps/store-admin/src/widgets/admin-product-preview/ui/admin-product-preview-view.test.tsx` — RTL smoke test
- `apps/store-admin/src/widgets/admin-product-preview/index.ts` — barrel export
- `apps/store-admin/src/widgets/index.ts` — re-export `AdminProductPreviewView`
- `apps/store-admin/src/shared/config/dictionary.ts` — add `products.previewDeactivatedBanner`, `products.previewHeading`, `products.previewBackToEdit`, `products.previewEditLink` keys

---

### TASK-155-F: Store-admin preview route + loading skeleton

**Type:** feat
**Scope:** store-admin
**Complexity:** S (< 1 h)
**TDD Required:** No
**Depends on:** TASK-155-E

**Acceptance Criteria:**

- [ ] Route exists at `apps/store-admin/src/app/(dashboard)/products/preview/[slug]/page.tsx`.
- [ ] The page component reads the `slug` param and renders `<AdminProductPreviewView slug={slug} />` inside a `<Suspense>` boundary.
- [ ] `loading.tsx` exists at the same route level and renders a loading skeleton.
- [ ] The page has metadata: `title: dict.products.metaTitlePreview` (add the key to
      `dictionary.ts` if not already added in TASK-155-E).
- [ ] The route is NOT listed in the admin sidebar nav (it is a contextual detail page,
      not a primary nav destination).
- [ ] `npm run build -w apps/store-admin` exits 0.
- [ ] `npm run lint -w apps/store-admin` exits 0.

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/products/preview/[slug]/page.tsx` — new page
- `apps/store-admin/src/app/(dashboard)/products/preview/[slug]/loading.tsx` — loading skeleton

---

### TASK-155-G: "Preview" link on admin product edit page

**Type:** feat
**Scope:** store-admin
**Complexity:** S (< 1 h)
**TDD Required:** No
**Depends on:** TASK-155-F

**Acceptance Criteria:**

- [ ] `EditProductView` renders a "Preview" link/button in the page header area (next to
      the "Back" link or as a secondary action next to the save button).
- [ ] The link is conditionally rendered: only when `product` is not undefined (i.e.,
      after the product data has loaded successfully).
- [ ] The link href is `/products/preview/${product.slug}` (uses the slug from the
      already-fetched product entity — no additional API call).
- [ ] The link opens in a new browser tab (`target="_blank"` with `rel="noopener noreferrer"`).
- [ ] The link label uses `dict.products.previewLink` (e.g., "Переглянути").
- [ ] The deactivated/active state of the product is not a condition for showing the link
      — the preview is always available for staff (the banner inside the preview page
      communicates the deactivated status).
- [ ] `npm run build -w apps/store-admin` exits 0.
- [ ] `npm run lint -w apps/store-admin` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test -w apps/store-admin` exits 0 (existing edit-view tests still pass).

**Files to create/modify:**

- `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx` — add Preview link
- `apps/store-admin/src/shared/config/dictionary.ts` — add `products.previewLink` key if not added in TASK-155-E

---

## Implementation Sequence

1. **TASK-155-A**: Write all failing tests (service spec + e2e). Confirm they fail.
2. **TASK-155-B**: Implement service method + controller route + response envelope.
   Confirm all seven new tests pass; confirm full suite still Green.
3. **TASK-155-C**: Add JSDoc; re-run full suite.
4. **TASK-155-D**: Regen Orval for store-admin. Confirm build/typecheck pass.
5. **TASK-155-E**: Build `AdminProductPreviewView` widget. Confirm RTL tests pass.
6. **TASK-155-F**: Add preview route + loading. Confirm build passes.
7. **TASK-155-G**: Add "Preview" link to edit page. Confirm full store-admin test suite passes.
8. Open a PR from `feature/155-admin-staff-preview-deactivated-products` → `develop`.

---

## Technical Notes

### Route declaration order in the controller (critical)

NestJS processes route handlers in declaration order. The controller currently declares:

```
@Get()               → findAll (public)
@Get(':slug')        → findBySlug (public)
@Get('admin/:id')    → findById (admin)
```

The new handler `@Get('admin/preview/:slug')` must be inserted between the class-level
Swagger decorators and `@Get('admin/:id')`. If placed after `@Get('admin/:id')`, the
request `GET /products/admin/preview/my-product` is captured by `admin/:id` with
`id = 'preview'`, causing a 404 (no product with id "preview") instead of routing to
the preview handler.

Correct order after the change:

```
@Get()                  → findAll (public)
@Get(':slug')           → findBySlug (public)
@Get('admin/preview/:slug') → findPreviewBySlug (admin) ← NEW, must be before admin/:id
@Get('admin/:id')       → findById (admin)
```

### Cache isolation

`findBySlug` (public) reads from / writes to `productDetailSlugKey(slug)`. The new
`findBySlugForAdminPreview` must NOT interact with this key or any public cache key,
for two reasons:

1. Shape difference: public cache holds `ProductDetailResponse` (`PublicProductEntity`
   with `inStock`/`lowStock`, no raw `stock`, no `isActive`). The preview response
   holds `ProductEntity` (raw `stock`, `isActive: boolean`). A public caller that hits
   a poisoned cache entry would receive admin-only fields.
2. Stale preview: a deactivated product should always be fetched fresh from the DB on
   each admin preview request, since the admin may be previewing to check a recent
   content change.

The service method simply omits all cache calls.

### `ProductEntity.fromPrisma` mapping

The value returned by `findBySlugWithRelations` is typed as
`ProductWithRelations['product']` — a `Product & ProductRating & { category, group, images }`.
`ProductEntity.fromPrisma` accepts a structurally compatible object (all fields are
optional except the core ones). The service method can safely pass the full result
object; `fromPrisma` ignores unrecognised fields. The `category`, `group`, and `images`
fields must be extracted separately before mapping:

```typescript
const { category, group, images, ...productFields } = product;
return {
  data: ProductEntity.fromPrisma(productFields),
  category: ProductCategoryEntity.fromPrisma(category),
  group: group ? ProductGroupEntity.fromPrisma(group) : null,
  images: images.map((img) => ProductImageEntity.fromPrisma(img)),
};
```

### DOMPurify in store-admin

TASK-153 established the pattern of using `DOMPurify.sanitize` for admin-rendered rich
HTML (the `store-client` `/info/[slug]` page). The `AdminProductPreviewView` should
follow the same pattern: `const safeHtml = DOMPurify.sanitize(data.description ?? '')`.
`isomorphic-dompurify` is available if SSR is needed; the widget is `"use client"` so
browser DOMPurify is fine.

### Sibling navigation in the preview

The group siblings returned by `findBySlugWithRelations` include both active and
inactive sibling positions (the positions sub-query filters `isActive: true` — see
`product.repository.ts` line 223). This means inactive sibling positions do NOT appear
in the siblings navigator, even in the admin preview. This is an acceptable limitation
for this task: the sibling filter on the inner query is a different concern and changing
it is out of scope. Document this in the widget via a code comment.

### `isActive` filter on sibling positions query

The inner `positions` query inside `findBySlugWithRelations` still filters
`where: { isActive: true, deletedAt: null }`. This is unchanged and intentional: even
in the admin preview, sibling navigation shows only active siblings. Showing inactive
siblings in the preview is a potential future enhancement but out of scope here.

---

## Risks and Edge Cases

| Risk                                                                   | Likelihood                                                 | Mitigation                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Route collision: `GET admin/preview/:slug` matched as `admin/:id`      | High if order is wrong                                     | Declare preview route BEFORE `admin/:id`; covered by e2e test 4 (200 expected, 404 if routing is wrong) |
| Cache poisoning: preview response leaks into public cache              | Low (service method has no cache.set call)                 | Service method explicitly skips cache; documented in JSDoc                                              |
| Soft-deleted product returned by preview                               | Low                                                        | `findBySlugWithRelations` always applies `deletedAt: null`; null result → 404; covered by test 5        |
| Missing Orval operationId → unstable hook name                         | Medium (Orval infers from method name)                     | Set explicit `operationId: 'productControllerPreviewProductBySlug'` on `@ApiOperation`                  |
| `DOMPurify` not installed in store-admin                               | Low (used in store-client per TASK-153)                    | Check `apps/store-admin/package.json` before TASK-155-E; install if missing                             |
| New route not reflected in admin sidebar (user can't discover preview) | Low (preview is a contextual action, not a top-level page) | Preview link is on the edit page; sidebar entry not needed                                              |

---

## Out of Scope

- `findAll` list endpoint `isActive` hard-default hardening (secondary gap noted in
  TASK-145 plan; tracked separately).
- Storefront-side preview (Option B): cross-app auth token, preview mode query param,
  store-client code changes.
- Inline preview panel within the edit page (modal/drawer): the separate route is
  cleaner and avoids nesting a full PDP inside an already-complex form page.
- Preview for soft-deleted products: `findBySlugWithRelations` always applies
  `deletedAt: null`. Viewing tombstoned products requires a separate admin archival view.
- Adding a MANAGER role to the Prisma schema: out of scope, not part of the current
  `UserRole` enum.
- Showing inactive sibling positions in the preview's group navigator.
- Redis cache entry for the admin preview response (intentionally skipped; see Cache
  isolation note).
- Adding the preview route to sitemap or public SEO metadata.

---

## Acceptance Criteria (summary)

- [ ] `GET /api/products/admin/preview/:slug` returns 200 with `{ data: ProductEntity, category, group, images }` for a deactivated product (`isActive: false`).
- [ ] The same endpoint returns 200 for an active product (the endpoint works regardless of `isActive`).
- [ ] The same endpoint returns 404 for a soft-deleted or non-existent slug.
- [ ] The same endpoint returns 401 without a valid JWT.
- [ ] The same endpoint returns 403 for a CUSTOMER-role JWT.
- [ ] `GET /api/products/:slug` (public endpoint) still returns 404 for a deactivated product — TASK-145 regression is not introduced.
- [ ] `ProductService.findBySlugForAdminPreview` does not interact with the public product detail cache.
- [ ] The store-admin preview page at `/products/preview/[slug]` renders the product detail for deactivated products.
- [ ] The preview page shows a prominent warning banner when `isActive === false`.
- [ ] The product edit page shows a "Preview" link that opens the preview page in a new tab using the product's current slug.
- [ ] `npm run test -w apps/store-api` exits 0 (all existing + all new tests Green).
- [ ] `npm run test -w apps/store-admin` exits 0.
- [ ] `npm run build -w apps/store-api` exits 0.
- [ ] `npm run build -w apps/store-admin` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-admin` exits 0.
- [ ] `npm run typecheck` exits 0.

---

## Related Tasks

- **TASK-145** (done, `docs/plans/064-pdp-deactivated-product-guard.md`) — blocks public PDP
  for deactivated products; parameterized `findBySlugWithRelations` that TASK-155 relies on.
- **TASK-143** (done, `docs/plans/062-cart-add-validate-before-write.md`) — blocks adding
  deactivated products to the cart.
- **TASK-153** (done, `docs/plans/085-admin-static-pages-rich-text.md`) — DOMPurify
  sanitization pattern reused in the preview widget.
- **TASK-156** (open, Tier 3) — admin order-detail line items linking to the product edit
  page; a natural companion to this task's edit-page "Preview" link.
