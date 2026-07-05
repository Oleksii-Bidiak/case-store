# Plan 110 — Brands (TASK-189)

> **Status:** ✅ Done
> **Phase:** Roadmap Етап 3 — Фундамент каталогу — **Фаза A**
> **Design source:** `docs/plans/099-category-variant-architecture.md` §4.3 (schema),
> §6 (phasing) — do not re-litigate the design, only operationalize it.
> **Created:** 2026-07-05
> **Last Updated:** 2026-07-05
> **BACKLOG task:** TASK-189. Absorbs TASK-176 (`docs/backlog-archive.md:631` — "Популярні
> бренди" strip on `/categories` is a static stub with no brand model).

## Overview

Add a first-class `Brand` (product manufacturer, e.g. "Spigen") entity, link it to `Product` via
a nullable `brandId`, and wire it end to end: `GET /products` brand filter, Meilisearch
filterable attribute, admin CRUD, and two storefront surfaces that already have brand-shaped
stubs waiting to be wired up — the categories-hub "Популярні бренди" strip
(`apps/store-client/src/widgets/categories/ui/categories-view.tsx:170-183`, currently a static
`dict.categories.brands` string array linking to `/products` with no filter) and the catalog
page's omitted "Виробник" filter (`docs/backlog-archive.md:582`, TASK-167-O).

`Brand` (manufacturer of the accessory) is a **separate table** from `DeviceBrand` (plan 111 —
the brand of the _compatible device_, e.g. "Apple"/"Samsung"). A Spigen case is compatible with
an Apple iPhone: two different brand concepts, two different tables (doc 099 §4.3 note).

## Scope

### In Scope

- `Brand` model (`name`, `slug`, `logo?`, `isActive`) + `Product.brandId` (nullable).
- Admin CRUD for brands (list/create/edit/deactivate), mirroring the existing `Category`/`Banner`
  admin module split (public read-only controller + admin-guarded write controller).
- `GET /products?brandId=` filter (public + admin listing).
- Admin product form — brand select.
- Meilisearch: index `brandId`/`brandSlug`, add to `filterableAttributes`.
- Storefront: "Виробник" filter control in `product-filters`; wire the existing "Популярні
  бренди" strip stub to real brand links (`/products?brandId=…`); brand name/logo surfaced on
  the PDP (small addition — link back to the brand-filtered catalog).

### Out of Scope

- Brand landing pages (`/brands/[slug]`) with curated copy/SEO — not requested by doc 099; a
  brand is reachable today via `/products?brandId=` same as any other filter. Flag as a possible
  future enhancement only if the owner asks.
- Wishlist page's omitted brand filter (`docs/backlog-archive.md:583`) — same underlying
  `Brand` data model makes it trivial later, but it's not in doc 099's scope and is left as a
  follow-up (`product-filters` becomes reusable across catalog/wishlist once this ships, but
  wiring wishlist is not a listed task here).

## User Story

As a shopper, I want to filter the catalog by manufacturer (e.g. only Spigen cases), and browse a
"popular brands" strip that actually leads to real filtered results. As an admin, I want to tag
each product with its manufacturer so those filters have data to work with.

## Dependencies & Ordering

- **Depends on:** TASK-236 (plan 109) — the category rollup fix. Brand filtering composes with
  `categoryId`/`categoryIds` in the same `where` clause; landing brands before the rollup fix
  would work in isolation but doc 099 §6 orders Phase A strictly after Phase 0.
- **Parallel with:** TASK-190 (plan 111) — independent data model, no shared files beyond
  `product.repository.ts`/`product.service.ts` (both add an optional filter field there; expect a
  small merge each way, not a blocking dependency).
- **Blocks:** nothing in Етап 3; TASK-191 (plan 112) does not depend on brands.

## Technical Design

### Data Model

```prisma
model Brand {
  id       String    @id @default(uuid())
  name     String
  slug     String    @unique
  logo     String?
  isActive Boolean   @default(true) @map("is_active")
  products Product[]
  @@index([slug])
  @@map("brands")
}

model Product {
  // ...existing fields unchanged...
  brandId String? @map("brand_id")
  brand   Brand?  @relation(fields: [brandId], references: [id])
}
```

Nullable `brandId` — no backfill required to ship (doc 099 §4.5); existing products simply have
no brand until an admin sets one.

### Backend (NestJS — Clean Architecture)

New `brand` module, structured like `newsletter`/`category` (repository → service → two
controllers: public read, admin write):

#### `BrandRepository` (`apps/store-api/src/brand/brand.repository.ts`)

- `findById(id): Promise<Brand | null>`
- `findBySlug(slug): Promise<Brand | null>`
- `findAllActive(): Promise<Brand[]>` — public list (storefront filter dropdown + brand strip),
  no pagination needed at expected brand-count scale (dozens, same order as categories).
- `findAllAdmin(params: { page, limit, search?, isActive? }): Promise<PaginatedBrandsResult>`
- `create(data: CreateBrandInput): Promise<Brand>`
- `update(id, data: UpdateBrandInput): Promise<Brand>`
- `setActive(id, isActive): Promise<Brand>` — reversible visibility toggle, matches the
  `isActive` convention (no `deletedAt` on `Brand` — not in the audit-tombstone list of
  `User`/`Product`/`Order`).

#### `BrandService` (`apps/store-api/src/brand/brand.service.ts`)

- Thin — slug auto-generation from `name` on create (mirror `CategoryService`'s
  `generateSlug` helper), uniqueness validation, delegates everything else to the repository.

#### `BrandController` (public, `apps/store-api/src/brand/brand.controller.ts`)

- `GET /brands` — active brands only, for the storefront filter + strip.

#### `AdminBrandController` (`apps/store-api/src/brand/admin-brand.controller.ts`)

- `GET /brands/admin/list` — all statuses, paginated, `AdminGuard`.
- `POST /brands`, `PATCH /brands/:id`, `PATCH /brands/:id/status` — `AdminGuard`.

#### `ProductRepository`/`ProductService` (existing files)

- `FindAllParams` gains `brandId?: string`; `findAll`'s `where` gains
  `if (brandId !== undefined) { where.brandId = brandId; }` (same shape as the existing
  `categoryId`/`categoryIds` clause after plan 109 lands).
- `CreateProductDto`/`UpdateProductDto` gain optional `brandId?: string` (validated `@IsUUID`).
- `PublicProductEntity` / the admin product entity gain a nested `brand: { id, name, slug,
logo } | null` summary (same shape convention as `category`).

### Search (Meilisearch)

- `ProductSearchDocument` gains `brandId: string | null` and `brandName: string | null`.
- `filterableAttributes` gains `'brandId'`.
- `toDocument` populates both from `source.brandId`/`source.brandName` (join added to
  `ProductIndexSource`'s Prisma projection in `findOneForIndex`/`findManyForIndex`).
- Searchable attributes optionally include brand name (`searchableAttributes` gains
  `'brandName'`) so "spigen чохол" matches — small addition, low risk.

### Frontend — store-admin (FSD)

- New `entities/brand` (Orval-generated hooks only, per the api-contract skill — no manual
  fetch).
- New `features/brand-form` (mirrors `features/banner-form`: RHF + zod schema, name/slug/logo/
  isActive fields, slug live-preview like `category-form.tsx`).
- New `widgets/brand-list` (mirrors `widgets/banner-list`: admin table + skeleton).
- New routes: `app/(dashboard)/brands/page.tsx`, `.../brands/new/page.tsx`,
  `.../brands/[id]/edit/page.tsx` (+ `loading.tsx` siblings), mirroring the `banners` route
  group structure exactly.
- `features/product-form/ui/product-form.tsx` — new brand `<Select>` (optional, "Без бренду"
  sentinel following the same `""`-guard pattern as `categoryId`/`groupId`, TASK-201/232).

### Frontend — store-client (FSD)

- New `entities/brand` (Orval hooks: `useBrandControllerFindAll` or whatever the generated name
  is).
- `features/product-filters` — new "Виробник" select/chip control, URL-synced via `?brandId=`
  (same pattern as `?categoryId=` in `product-list-view.tsx`).
- `widgets/categories/ui/categories-view.tsx:170-183` — replace the static
  `dict.categories.brands` string-array strip with real `Brand[]` data
  (`useBrandControllerFindAll`), each tile linking to `/products?brandId=${brand.id}` instead of
  the current dead `href="/products"`.
- Optional, small: PDP shows the brand name (and links to `/products?brandId=`) near the title,
  if `product.brand` is present — additive, no layout rework.

## API Contract

| Method     | Path                          | Request Body            | Response                                                     |
| ---------- | ----------------------------- | ----------------------- | ------------------------------------------------------------ |
| GET        | `/brands`                     | —                       | `{ data: BrandEntity[] }` (active only)                      |
| GET        | `/brands/admin/list`          | —                       | `{ data: BrandEntity[], meta }` (all statuses, `AdminGuard`) |
| POST       | `/brands`                     | `CreateBrandDto`        | `{ data: BrandEntity }` (`AdminGuard`)                       |
| PATCH      | `/brands/:id`                 | `UpdateBrandDto`        | `{ data: BrandEntity }` (`AdminGuard`)                       |
| PATCH      | `/brands/:id/status`          | `{ isActive: boolean }` | `{ data: BrandEntity }` (`AdminGuard`)                       |
| GET        | `/products?brandId=`          | —                       | unchanged envelope, filtered                                 |
| POST/PATCH | `/products` / `/products/:id` | + `brandId?`            | unchanged envelope, additive field                           |

## Tasks

### TASK-189-A: `Brand` schema + repository

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-236 (plan 109) merged/available

**Acceptance Criteria:**

- [x] `Brand` model + `Product.brandId` (nullable) added to `schema.prisma`. Migration
      `add-brands` deferred to sequential integration (shared DB — schema.prisma is the
      source of truth; `prisma generate` run to refresh the client).
- [x] `BrandRepository` implements all methods listed in Technical Design with unit tests
      (create, update, findAllActive, findAllAdmin pagination, setActive).
- [x] Slug uniqueness enforced at the DB level (`@unique`) and surfaced as a friendly
      validation error (mirror `CategoryService`'s duplicate-slug handling).
- [x] Tests pass: `npm run test -w apps/store-api -- brand.repository`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `Brand` model, `Product.brandId`/`brand` relation.
- `apps/store-api/src/brand/brand.repository.ts` — new.
- `apps/store-api/src/brand/brand.repository.spec.ts` — new.

---

### TASK-189-B: `BrandService` + public/admin controllers

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-189-A

**Acceptance Criteria:**

- [x] `BrandService` auto-generates a slug from `name` when not provided (mirror
      `CategoryService`'s helper); duplicate-slug create returns a 409/validation error.
- [x] `GET /brands` (public) returns only `isActive: true` brands, no auth required.
- [x] `GET /brands/admin/list`, `POST /brands`, `PATCH /brands/:id`, `PATCH /brands/:id/status`
      all guarded by `AdminGuard`; documented with Swagger decorators (`@ApiOperation`,
      `@ApiResponse`, response envelope classes per the existing category/banner pattern).
- [x] `BrandModule` registered in `app.module.ts`.
- [x] Unit + controller tests for both controllers (guard enforcement, envelope shape).
- [x] Tests pass: `npm run test -w apps/store-api -- brand`

**Files to create/modify:**

- `apps/store-api/src/brand/brand.service.ts`, `brand.service.spec.ts` — new.
- `apps/store-api/src/brand/brand.controller.ts`, `admin-brand.controller.ts` (+ specs) — new.
- `apps/store-api/src/brand/dto/create-brand.dto.ts`, `update-brand.dto.ts`,
  `brand-list-query.dto.ts` — new.
- `apps/store-api/src/brand/entities/brand.entity.ts` — new.
- `apps/store-api/src/brand/brand.module.ts`, `index.ts` — new.
- `apps/store-api/src/app.module.ts` — register `BrandModule`.

---

### TASK-189-C: `GET /products` brand filter + product entity brand summary

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-189-A, TASK-236-B (plan 109 rollup, so `categoryId`+`brandId` compose
correctly in the same `where`)

**Acceptance Criteria:**

- [x] `ProductListQueryDto` gains optional `brandId?: string` (`@IsUUID`).
- [x] `ProductRepository.findAll`'s `where` applies `brandId` alongside the rolled-up
      `categoryId` filter; both can be combined in one request.
- [x] `CreateProductDto`/`UpdateProductDto` accept optional `brandId`.
- [x] `PublicProductEntity` (and the admin product entity/list) include a nested
      `brand: { id, name, slug, logo } | null`.
- [x] Unit tests pass: `npm run test -w apps/store-api -- product`. e2e deferred to
      sequential integration (shared DB — see manual-qa-pending).

**Files to create/modify:**

- `apps/store-api/src/product/dto/product-list-query.dto.ts`,
  `create-product.dto.ts`, `update-product.dto.ts` — `brandId` field.
- `apps/store-api/src/product/product.repository.ts` — `FindAllParams.brandId`, where-clause,
  Prisma `include: { brand: true }` on read queries.
- `apps/store-api/src/product/entities/*.ts` — nested `brand` summary.
- `apps/store-api/src/product/product.module.ts` — import `BrandModule` if a validation lookup
  is needed (e.g. reject an unknown `brandId` on create/update).

---

### TASK-189-D: Meilisearch brand facet

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-189-C

**Acceptance Criteria:**

- [x] `ProductSearchDocument` gains `brandId: string | null`, `brandName: string | null`.
- [x] `filterableAttributes` gains `'brandId'`; `searchableAttributes` gains `'brandName'`.
- [x] `toDocument` / the index-source Prisma projection populate both fields.
- [x] `reindexAll()` unaffected structurally; existing fallback-to-Postgres behavior intact.
- [x] Tests pass: `npm run test -w apps/store-api -- search`

**Files to create/modify:**

- `apps/store-api/src/search/meili.client.ts` — `ProductSearchDocument`.
- `apps/store-api/src/search/search.service.ts` — settings + `toDocument`.
- `apps/store-api/src/product/product.repository.ts` — `ProductIndexSource` projection gains
  `brandId`/`brandName` (via the `brand` relation).

---

### TASK-189-E: Admin brand CRUD UI + product-form brand select

**Type:** feat
**Scope:** store-admin
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-189-B, TASK-189-C, Orval regeneration

**Acceptance Criteria:**

- [x] `npm run generate:api -w apps/store-admin` produces `entities/brand`-consumable hooks
      (no hand-written fetch calls).
- [x] Brand list page (`/brands`) — table with name/slug/status, mirrors `/banners` list UX
      (search, pagination, status toggle).
- [x] Brand create/edit forms (`/brands/new`, `/brands/[id]/edit`) — RHF + zod, slug live-preview
      mirroring `category-form.tsx`'s pattern; logo as a URL/text input (no new upload pipeline
      in this task — reuse whatever the simplest existing image-URL convention is, e.g. banner's
      image field).
- [x] `product-form.tsx` gains an optional brand `<Select>` ("Без бренду" sentinel, same
      `""`-bounce guard as `categoryId`/`groupId`).
- [x] Admin sidebar nav includes a "Бренди" entry.
- [x] Tests pass: `npm run test -w apps/store-admin -- brand product-form`

**Files to create/modify:**

- `apps/store-admin/src/entities/brand/index.ts` — new.
- `apps/store-admin/src/features/brand-form/{ui,model}/*` — new (mirrors `features/banner-form`).
- `apps/store-admin/src/widgets/brand-list/ui/*` — new (mirrors `widgets/banner-list`).
- `apps/store-admin/src/widgets/brand-form-view/ui/*` — new (mirrors `widgets/banner-form-view`).
- `apps/store-admin/src/app/(dashboard)/brands/{page.tsx,loading.tsx,new/page.tsx,
[id]/edit/page.tsx}` — new routes.
- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — brand select.
- Admin sidebar nav config file — new "Бренди" link.

---

### TASK-189-F: Storefront brand filter + wired "Популярні бренди" strip

**Type:** feat
**Scope:** store-client
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-189-B, TASK-189-C, Orval regeneration

**Acceptance Criteria:**

- [x] `npm run generate:api -w apps/store-client` produces brand-list hooks.
- [x] New `entities/brand` (Orval hooks only).
- [x] `product-filters` gains a "Виробник" control (select or chip row, consistent with the
      existing category-chips visual language), URL-synced via `?brandId=`, combinable with
      `?categoryId=`/price/search per the existing `product-list-view.tsx` filter-state contract.
- [x] `active-filter-chips.tsx` shows a removable "Виробник: X" chip when `brandId` is set
      (mirror the existing category/price chip behavior).
- [x] `widgets/categories/ui/categories-view.tsx:170-183` — the "Популярні бренди" strip now
      renders real `Brand[]` data and each tile links to `/products?brandId=${brand.id}` instead
      of the current dead `/products` link; empty state (`brands.length === 0`) hides the
      section (same convention as `CategoryChips`'s empty-array guard).
- [x] Tests pass: `npm run test -w apps/store-client -- product-filters categories-view`

**Files to create/modify:**

- `apps/store-client/src/entities/brand/index.ts` — new.
- `apps/store-client/src/features/product-filters/ui/product-filters.tsx`,
  `active-filter-chips.tsx` — brand control + chip.
- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — thread `brandId`
  through the URL-synced filter state (mirrors `categoryId`).
- `apps/store-client/src/widgets/categories/ui/categories-view.tsx` — wire the brand strip to
  real data.
- `apps/store-client/src/shared/config/dictionary.ts` — drop the now-unused
  `dict.categories.brands` string array (or leave as an empty-state fallback copy key — prefer
  removal since it's dead once real data lands).

## Migration Steps

1. `TASK-189-A` (schema + repository).
2. `TASK-189-B` (service + controllers) — module registered, endpoints live but unused.
3. `TASK-189-C` (product filter + entity) — can start once A is in; independent of B's admin
   write path, but needs `BrandModule` exported for any create/update validation.
4. `TASK-189-D` (Meilisearch) after C.
5. `TASK-189-E` (admin UI) and `TASK-189-F` (storefront UI) in parallel once B + C ship and an
   Orval regen has run in each workspace.

## Risks & Mitigations

| Risk                                                                | Mitigation                                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| No products have a `brandId` yet — filters/strip show empty results | Nullable field ships fine with zero data; admin backfills brands via the new CRUD as a manual follow-up, no blocking migration needed    |
| Confusion between `Brand` (this plan) and `DeviceBrand` (plan 111)  | Explicit naming/table separation from the start; both plans cross-reference each other in their Overview                                 |
| Duplicate brand names entered with different casing/slugs           | Slug uniqueness at the DB level catches exact collisions; cosmetic duplicates are an admin data-hygiene concern, not a schema constraint |

## Notes

- `TASK-176`'s original ask ("optionally per-category product counts on the storefront") is
  explicitly **not** absorbed here — that pairs with `Category.image`/TASK-083, a separate
  concern from brands, and stays parked.
