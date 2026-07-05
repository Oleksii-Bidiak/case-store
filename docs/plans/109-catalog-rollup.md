# Plan 109 — Catalog subtree rollup + leaf-category UI (TASK-236)

> **Status:** ✅ Complete — all subtasks A–G implemented, tested, committed on
> `feature/236-catalog-rollup` (2026-07-06). Post-deploy Meilisearch reindex tracked in
> `docs/manual-qa-pending.md`.
> **Phase:** Roadmap Етап 3 — Фундамент каталогу — **Фаза 0** (blocking prerequisite for A/B/C)
> **Design source:** `docs/plans/099-category-variant-architecture.md` §1.1, §2.2, §4.1 (discovery,
> do not re-litigate — this plan only operationalizes it)
> **Created:** 2026-07-05
> **Last Updated:** 2026-07-05
> **BACKLOG task:** TASK-236 (relocated from Етап 1 discovery-bug row to Етап 3, first row —
> see plan 099 §6 row "0")

## Overview

`ProductRepository.findAll` filters `where.categoryId = categoryId` — an exact match. The seed
(and any real catalog) places products in **leaf** categories, so clicking a root-category tile
returns zero products even though the subtree is full. The admin product form only offers root
categories (`useCategoryControllerGetRootCategories`), so staff cannot even assign a product to a
subcategory today. Meilisearch mirrors the same exact-match gap (`filterableAttributes:
['isActive', 'categoryId']`).

This is the single blocking prerequisite for the rest of Етап 3: TASK-189 (brands), TASK-190
(device compat) and TASK-191 (structured specs) all add category-scoped filters/templates that
only make sense once "select category X" reliably means "X and everything under it."

## Scope

### In Scope

- `CategoryRepository.findSubtreeIds(categoryId)` (self + all descendants) and
  `findAncestorIds(categoryId)` (self + all ancestors) — both needed: subtree for the product
  listing rollup, ancestors for the Meilisearch per-document `categoryIds` array and (later,
  plan 112) attribute-definition inheritance.
- `ProductRepository.findAll` / `ProductService.findAll` — swap the scalar `categoryId` equality
  for `categoryId IN (subtreeIds)`.
- Meilisearch: `categoryId: string` → `categoryIds: string[]` on the index document and
  `filterableAttributes`.
- New admin-only category tree endpoint (bypasses the public `isActive`-only tree) so the admin
  product form can offer **leaf** categories (indented by depth), including inactive ones.
- Admin product form (`product-form.tsx`) — leaf-only, indented category select.
- Storefront catalog filter — two-level chip disclosure (root chip → its direct children) so
  picking a parent still rolls up correctly and users can narrow to a leaf.
- `Category.metaTitle` / `Category.metaDescription` (nullable, `Page`-style) — small additive
  schema change, folded into this plan per doc 099 §4.1 rather than split off, since it shares
  the same migration window and touches the same repository/DTO/admin-form files.

### Out of Scope

- Materialized path / closure table (doc 099 §4.1: YAGNI while depth ≤ 3 and category count is
  in the dozens — revisit only if categories reach ~1000).
- `/c/[slug]` canonical category routes, breadcrumb JSON-LD rework, `CatalogLanding` — that is
  Phase D (doc 099 §6, not yet planned; would be TASK-237/238 per the discovery doc's proposal,
  distinct from the already-assigned TASK-237 newsletter follow-up in Етап 2).
- Rendering `Category.metaTitle/metaDescription` into actual `<head>` metadata on any storefront
  route — this plan only adds the admin-editable fields; wiring them into page metadata rides
  with the Phase D SEO-routes work.

## User Story

As a shopper, when I click a top-level category tile (e.g. "Чохли"), I want to see every product
in that category **and its subcategories**, so the catalog isn't empty just because the seed (or
staff) filed items one level deeper. As an admin, I want to assign a product to the specific
subcategory it belongs to, not just a root bucket.

## Dependencies & Ordering

- **Blocks:** TASK-189 (plan 110), TASK-190 (plan 111), TASK-191 (plan 112) — all three depend on
  a correct subtree rollup so their new category-scoped filters/templates behave sanely. Plan
  112 additionally reuses `findAncestorIds` for attribute-definition inheritance.
- **Depends on:** nothing new — pure delta on existing `Category`/`Product` models.
- Per doc 099 §6: order is **0 → (A, B parallel) → C**. This plan is "0".

## Technical Design

### Data Model

```prisma
model Category {
  // ...existing fields unchanged...
  metaTitle       String?  @map("meta_title")
  metaDescription String?  @map("meta_description")
}
```

No other schema changes. `parentId`/self-relation already exists
(`apps/store-api/prisma/schema.prisma:84-103` per doc 099 §1.1); this is additive-only
(nullable columns), migrated via `npx prisma migrate dev --name category-seo-meta` (migration SQL
is gitignored per the `prisma-migration` skill — `schema.prisma` stays the source of truth).

### Backend (NestJS — Clean Architecture)

#### `CategoryRepository` (`apps/store-api/src/category/category.repository.ts`)

- `findSubtreeIds(categoryId: string): Promise<string[]>` — self + all descendant ids. Given the
  existing 3-level cap enforced by `findCategoryTree` (repository.ts:208-235), implement via one
  recursive Postgres CTE (`WITH RECURSIVE`) over `categories(id, parent_id)` through
  `this.prisma.$queryRaw` — cheaper than walking the cached tree object and correct even if a
  category is looked up outside the active-tree cache (e.g. an inactive leaf).
- `findAncestorIds(categoryId: string): Promise<string[]>` — self + all ancestors, same
  `WITH RECURSIVE` shape walking `parent_id` upward. Returns `[categoryId]` for a root category.
- Both return plain `string[]`, unordered is fine (callers only need set membership).

#### `ProductRepository` (`apps/store-api/src/product/product.repository.ts`)

- `findAll` (currently line 338-339: `if (categoryId !== undefined) { where.categoryId =
categoryId; }`) — no longer resolves the subtree itself (repositories don't own cross-entity
  business rules); instead accepts an already-expanded id list.
- Change the `FindAllParams` shape (interface at line ~31/50/79) so the **service** passes
  `categoryIds?: string[]` instead of a single `categoryId`, and the repository does
  `where.categoryId = { in: categoryIds }` when present.

#### `ProductService` (`apps/store-api/src/product/product.service.ts`)

- `findAll` (categoryId wiring at line ~153) — when `query.categoryId` is present, call
  `categoryRepository.findSubtreeIds(query.categoryId)` and pass the resulting array as
  `categoryIds` to the repository. `CategoryRepository` becomes a constructor dependency of
  `ProductService` (already imports `CategoryModule` exports if not — verify in
  `product.module.ts`; add if missing).
- Same rollup applies to the admin listing path (`GET /products/admin/list`, TASK-230) so admin
  filtering by category is consistent with the public behavior.

#### `CategoryService` / `admin-category.controller.ts`

- `CreateCategoryInput` / `UpdateCategoryInput` (repository.ts) gain `metaTitle?: string | null`
  and `metaDescription?: string | null`; `CategoryEntity` gains the same two fields (mirrored
  from `Page`'s pattern — nullable, admin-editable, `@ApiProperty({ required: false, nullable:
true })`).
- New endpoint: `GET /categories/admin/tree` on `admin-category.controller.ts` (guarded by the
  existing `AdminGuard`, same pattern as the `/products/admin/list` bypass introduced by
  TASK-230) — returns the **full** tree (all `isActive` states, still capped at 3 levels) so
  staff can assign a product to a temporarily-deactivated leaf without it silently vanishing from
  the picker. Backed by a new `CategoryRepository.findCategoryTreeForAdmin()` mirroring
  `findCategoryTree()` (repository.ts:208-235) minus the `isActive: true` filters.

### Search (Meilisearch)

- `ProductSearchDocument` (`apps/store-api/src/search/meili.client.ts:17-29`) — `categoryId:
string` → `categoryIds: string[]`.
- `PRODUCTS_INDEX_SETTINGS.filterableAttributes` (`search.service.ts:30`) —
  `['isActive', 'categoryId']` → `['isActive', 'categoryIds']`.
- `toDocument` (`search.service.ts:234-251`) — `categoryIds: source.categoryId` →
  `categoryIds: [source.categoryId, ...ancestorIds]`, resolved via
  `categoryRepository.findAncestorIds(source.categoryId)`. `ProductIndexSource` gains no new DB
  field — the ancestor expansion happens at index-build time in `SearchService`, not in the
  Prisma projection.
- **Note (forward-compatible, not a live regression):** today neither `search()` nor `suggest()`
  actually applies a `categoryId = …` Meilisearch filter (only `isActive = true` is used —
  confirmed by reading `search.service.ts` in full); `GET /products` filters category purely via
  Postgres (`ProductService.findAll` → `ProductRepository.findAll`, never touches
  `SearchService`). This task still fixes the **declared** filterable attribute and document
  shape now, so a future category-scoped `/search?categoryId=` (or admin reindex tooling) inherits
  correct rollup semantics instead of baking in the same exact-match bug a second time.
- `reindexAll()` (`search.service.ts`) — unaffected structurally; re-run after deploy (per doc 099
  §4.5, migration/backfill note — no auto-migration of the live index, a manual/boot reindex is
  expected).

### Frontend — store-admin (FSD)

#### entities/features

- Regenerate Orval client after the new `GET /categories/admin/tree` endpoint + `metaTitle`/
  `metaDescription` fields land in the OpenAPI spec (`npm run generate:api -w apps/store-admin`,
  per the `api-contract` skill) — new hook `useCategoryControllerAdminTree` (or whatever Orval
  derives from the operationId) lands in `shared/api/generated/categories/`.

#### features/product-form (`apps/store-admin/src/features/product-form/ui/product-form.tsx:96`)

- Replace `useCategoryControllerGetRootCategories({ limit: 100 })` with the new admin-tree hook.
- Flatten the returned tree client-side into `{ id, name, depth, isLeaf }[]`; render only
  `isLeaf` entries in the `<Select>`, indented by `depth` (e.g. `"— ".repeat(depth) + name`) so
  staff can still see the parent context. Keep the existing `""`-guard pattern from TASK-201/232
  (Radix bubble-select empty-string bounce) — do not regress that fix.
- No schema/DTO change to the product create/update payload — `categoryId` already accepts any
  category id; the fix is purely which ids the picker offers.

#### features/category-form (`apps/store-admin/src/features/category-form/ui/category-form.tsx`)

- Add `metaTitle` / `metaDescription` text inputs (optional, same validation laxity as `Page`'s
  equivalents) to the existing RHF form; wire through `create`/`update` mutations.

### Frontend — store-client (FSD)

#### features/product-filters (`apps/store-client/src/features/product-filters/ui/category-chips.tsx`)

- Currently renders only root categories (fed by `useCategoryControllerGetRootCategories` in the
  parent `product-list-view.tsx:127`). Add a second, conditionally-rendered chip row: when a root
  chip is active, fetch its children (already available from the existing public
  `GET /categories/tree` payload — no new endpoint needed client-side, thread `children` through
  instead of re-fetching) and render them as a secondary "narrow down" row. Selecting a child
  writes the child's id to `?categoryId=`; the rollup fix (backend) means the parent chip alone
  already shows the full subtree, so this is purely a progressive-disclosure UX affordance, not a
  correctness requirement.
- No change to the URL contract (`?categoryId=` stays a single id, per TASK-216).

## API Contract

| Method | Path                     | Request Body                       | Response                                            | Notes                                  |
| ------ | ------------------------ | ---------------------------------- | --------------------------------------------------- | -------------------------------------- |
| GET    | `/categories/admin/tree` | —                                  | `{ data: CategoryTreeNodeEntity[] }` (all statuses) | New, `AdminGuard`                      |
| GET    | `/products?categoryId=`  | —                                  | unchanged envelope                                  | Now rolls up the subtree server-side   |
| POST   | `/categories`            | + `metaTitle?`, `metaDescription?` | unchanged envelope shape, two new nullable fields   | Existing endpoint, additive DTO fields |
| PATCH  | `/categories/:id`        | + `metaTitle?`, `metaDescription?` | same                                                | Existing endpoint, additive DTO fields |

## Tasks

### TASK-236-A: `CategoryRepository.findSubtreeIds` + `findAncestorIds`

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No (unit tests still required — recursive traversal is easy to get subtly wrong)
**Depends on:** —

**Acceptance Criteria:**

- [x] `findSubtreeIds(categoryId)` returns `[categoryId, ...allDescendantIds]` for a 3-level tree
      fixture (root → child → grandchild), and `[categoryId]` for a leaf with no children.
- [x] `findAncestorIds(categoryId)` returns `[categoryId, ...allAncestorIds]` up to the root.
- [x] Both handle a non-existent `categoryId` by returning `[categoryId]` (no throw) — callers
      decide whether that's an empty-result 404 or a no-op filter.
- [x] Unit tests cover: leaf, mid-level, root, and a category with siblings (siblings must NOT
      leak into either result).
- [x] Tests pass: `npm run test -w apps/store-api -- category.repository`

**Files to create/modify:**

- `apps/store-api/src/category/category.repository.ts` — add both methods (raw `WITH RECURSIVE`
  query via `this.prisma.$queryRaw`).
- `apps/store-api/src/category/category.repository.spec.ts` — new unit tests.

---

### TASK-236-B: `ProductRepository`/`ProductService` category rollup

**Type:** fix
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-236-A

**Acceptance Criteria:**

- [x] `ProductRepository.findAll`'s `FindAllParams` takes `categoryIds?: string[]` (renamed from
      the scalar `categoryId`); builds `where.categoryId = { in: categoryIds }`.
- [x] `ProductService.findAll` (public `GET /products`) and the admin listing path
      (`GET /products/admin/list`, TASK-230) both resolve `query.categoryId` through
      `categoryRepository.findSubtreeIds` before calling the repository.
- [x] Regression: filtering by a **root** category now returns products filed in its
      subcategories (integration/e2e assertion against the seed's `iphone-cases` under a root
      `cases`-style category, or an equivalent fixture).
- [x] Filtering by a **leaf** category still returns exactly that leaf's products (no
      over-broadening).
- [x] Tests pass: `npm run test -w apps/store-api -- product.service product.repository` and
      `npm run test:e2e -w apps/store-api` (run serially per the `store-api-e2e-serial` note).

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.ts` — `FindAllParams` + `findAll` where-clause
  (lines ~11, 31, 50, 79, 338-339).
- `apps/store-api/src/product/product.service.ts` — inject `CategoryRepository`, resolve subtree
  before delegating (line ~153).
- `apps/store-api/src/product/product.module.ts` — import `CategoryModule` if not already
  available for injection.
- Existing spec files for both (`product.service.spec.ts`, `product.repository.spec.ts`) updated
  for the renamed param; e2e spec extended with a subtree-rollup case.

---

### TASK-236-C: Meilisearch `categoryIds[]` rollup

**Type:** fix
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-236-A

**Acceptance Criteria:**

- [x] `ProductSearchDocument.categoryId: string` renamed to `categoryIds: string[]`.
- [x] `PRODUCTS_INDEX_SETTINGS.filterableAttributes` updated to `['isActive', 'categoryIds']`.
- [x] `toDocument` populates `categoryIds` as self + all ancestor ids (via
      `findAncestorIds`), not just the product's own category.
- [x] `meili.client.spec.ts` / `search.service.spec.ts` fixtures updated to the new shape; the
      existing assertion on `filterableAttributes` (search.service.spec.ts:130) updated.
- [x] `reindexAll()` still boots cleanly with an unconfigured (no-op) Meilisearch instance — no
      regression to the graceful-fallback behavior (TASK-075).
- [x] Tests pass: `npm run test -w apps/store-api -- search`

**Files to create/modify:**

- `apps/store-api/src/search/meili.client.ts` — `ProductSearchDocument` interface (lines 17-29).
- `apps/store-api/src/search/search.service.ts` — `filterableAttributes` (line 30), `toDocument`
  (lines 234-251), inject `CategoryRepository`.
- `apps/store-api/src/search/search.module.ts` — import `CategoryModule` if needed.
- `apps/store-api/src/search/meili.client.spec.ts`, `search.service.spec.ts` — updated fixtures.

---

### TASK-236-D: Admin-only full category tree endpoint

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [x] `CategoryRepository.findCategoryTreeForAdmin()` mirrors `findCategoryTree()`
      (repository.ts:208-235) but omits every `isActive: true` filter — returns inactive
      categories/subtrees too, still capped at 3 nested levels.
- [x] New `GET /categories/admin/tree` on `admin-category.controller.ts`, guarded by the existing
      `AdminGuard` (same guard as the rest of that controller), documented with
      `@ApiOperation`/`@ApiResponse` so Swagger + Orval pick it up.
- [x] `CategoryService.getCategoryTreeForAdmin()` wraps the repository call and maps to
      `CategoryTreeNodeEntity[]` (reuse the existing entity — no new entity needed).
- [x] Unit + controller tests for the new endpoint (guard applied, shape matches
      `CategoryTreeResponse`).
- [x] Tests pass: `npm run test -w apps/store-api -- category`

**Files to create/modify:**

- `apps/store-api/src/category/category.repository.ts` — `findCategoryTreeForAdmin()`.
- `apps/store-api/src/category/category.service.ts` — `getCategoryTreeForAdmin()`.
- `apps/store-api/src/category/admin-category.controller.ts` — new `GET admin/tree` route.
- `apps/store-api/src/category/category.service.spec.ts`, a new/extended
  `admin-category.controller.spec.ts` case.

---

### TASK-236-E: `Category.metaTitle`/`metaDescription`

**Type:** feat
**Scope:** store-api, store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [x] Schema: `Category.metaTitle String?`, `Category.metaDescription String?` (mapped
      `meta_title`/`meta_description`), migrated via `npx prisma migrate dev --name
    category-seo-meta`.
- [x] `CreateCategoryInput`/`UpdateCategoryInput` (repository) and `CategoryEntity` carry both
      fields (nullable, optional in DTOs).
- [x] Admin category form (`category-form.tsx`) has two new optional text inputs, persisted via
      the existing create/update mutations.
- [x] No storefront rendering change in this task (explicitly out of scope — see plan Notes).
- [x] Tests pass: `npm run test -w apps/store-api -- category` and
      `npm run test -w apps/store-admin -- category-form`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `Category` model.
- `apps/store-api/src/category/category.repository.ts` — input interfaces + `findById`/mapping
  untouched (Prisma returns the new columns automatically), `CreateCategoryInput`/
  `UpdateCategoryInput`.
- `apps/store-api/src/category/dto/create-category.dto.ts`,
  `apps/store-api/src/category/dto/update-category.dto.ts` — new optional fields.
- `apps/store-api/src/category/entities/category.entity.ts` — new fields.
- `apps/store-admin/src/features/category-form/ui/category-form.tsx` — two new inputs.
- `apps/store-admin/src/features/category-form/model/category-schema.ts` (or equivalent zod
  schema file) — schema update.

---

### TASK-236-F: Admin product-form — leaf-category select

**Type:** fix
**Scope:** store-admin
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-236-D (needs the admin tree endpoint + regenerated Orval hook)

**Acceptance Criteria:**

- [x] `product-form.tsx:96` no longer calls `useCategoryControllerGetRootCategories`; it uses the
      new admin-tree hook.
- [x] The category `<Select>` lists only leaf categories (no children in the fetched tree),
      indented to show ancestry, including inactive leaves (staff can still assign to a
      temporarily hidden category).
- [x] The existing `""`-bounce guard (TASK-201/232) is preserved — no regression to the
      already-fixed Radix bubble-select bounce.
- [x] Regression tests (RTL) confirm: a subcategory is selectable, a root/branch category with
      children is **not** offered as a selectable leaf.
- [x] Tests pass: `npm run test -w apps/store-admin -- product-form`

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — category query + flatten/
  filter-to-leaves + indent logic.
- `apps/store-admin/src/features/product-form/ui/product-form.test.tsx` (or equivalent) — new
  regression cases.

---

### TASK-236-G: Storefront catalog filter — two-level category disclosure

**Type:** feat
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-236-B (the correctness fix must ship first; this is a UX affordance on top)

**Acceptance Criteria:**

- [x] Selecting a root category chip (`category-chips.tsx`) reveals a secondary row of its direct
      children (from the already-fetched `GET /categories/tree` payload — no new request).
- [x] Selecting a child writes its id to `?categoryId=`, same URL contract as today (TASK-216).
- [x] Deselecting/clearing the root chip hides the child row.
- [x] No regression to the existing root-chip RTL coverage (`product-filters.test.tsx`).
- [x] Tests pass: `npm run test -w apps/store-client -- product-filters`

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/category-chips.tsx` — secondary row.
- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — thread `children` from
  the tree query down to `CategoryChips` (line ~127 area).
- `apps/store-client/src/features/product-filters/ui/product-filters.test.tsx` — new cases.

## Migration Steps

1. `TASK-236-A` (repository traversal methods) — foundation for everything else, no consumer
   changes yet.
2. `TASK-236-B` (product rollup) and `TASK-236-D` (admin tree endpoint) can proceed in parallel
   once A lands — both are independent consumers.
3. `TASK-236-C` (Meilisearch) after A; independent of B/D.
4. `TASK-236-E` (Category SEO fields) — independent additive schema change, can land any time.
5. `TASK-236-F` (admin product-form) after D + an Orval regen.
6. `TASK-236-G` (storefront chip disclosure) after B ships (so the correctness fix is live before
   the UX polish).
7. Post-deploy: trigger a Meilisearch reindex (admin reindex endpoint or boot reindex) so the live
   index picks up the `categoryIds[]` shape (doc 099 §4.5).

## Risks & Mitigations

| Risk                                                                                       | Mitigation                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Raw `$queryRaw` CTE drifts from Prisma's typed query surface                               | Keep both methods narrowly scoped (return `string[]` only), unit-tested against fixture trees                                            |
| Renaming `FindAllParams.categoryId` → `categoryIds` breaks call sites                      | Compiler (TS) catches every call site; grep for `categoryId` in `product.service.ts`/specs before merging                                |
| Meilisearch document shape change requires a reindex or stale filters silently under-match | Document the required post-deploy reindex step explicitly (§ Migration Steps); existing bootstrap reindex covers dev/local automatically |
| Admin leaf-category picker regresses the TASK-201/232 select-bounce fix                    | Explicit regression test in TASK-236-F acceptance criteria                                                                               |

## Notes

- This plan intentionally does **not** touch `/c/[slug]` routes, breadcrumb JSON-LD, or
  `CatalogLanding` (doc 099 §2.4, §4.4) — those are Phase D, not yet assigned a task number.
- `Category.metaTitle/metaDescription` land here per doc 099's explicit suggestion ("додай...
  якщо вписується в обсяг"); it fits because it shares the same migration and touches the
  category repository/DTO/admin-form files already being edited for TASK-236-D/F.
