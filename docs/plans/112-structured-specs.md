# Plan 112 — Structured product specifications (TASK-191)

> **Status:** ✅ Completed (2026-07-06) — unit + typecheck + lint green across all
> workspaces; e2e/integration deferred to the coordinating agent (see Notes).
> **Phase:** Roadmap Етап 3 — Фундамент каталогу — **Фаза C**
> **Design source:** `docs/plans/099-category-variant-architecture.md` §3, §4.3 (schema),
> §6 (phasing) — do not re-litigate the design, only operationalize it.
> **Created:** 2026-07-05
> **Last Updated:** 2026-07-05
> **BACKLOG task:** TASK-191. Absorbs the specs slice of TASK-178
> (`docs/backlog-archive.md:633` — PDP "Характеристики" tab shows `specsEmpty`; the design's
> "Коротко про товар" key-highlights grid is omitted for lack of a structured spec model; the
> catalog's "Обирай швидко" spec quick-filters are omitted per `docs/backlog-archive.md:582`).

## Overview

Today `Product.attributes Json` is the **variant-axis** map (`{"color":"blue","pack":"single"}`)
that drives the PDP's sibling-position selector (TASK-142). It has no types, no per-category
vocabulary, and is the wrong shape for "material: Silicone" / "power: 20W" style comparison
facts. This plan adds a **separate**, per-category template system —
`AttributeDefinition` (the template: "Матеріал", type SELECT, options
`["Силікон","Шкіра"]`) + `ProductAttributeValue` (the filled-in value per product) — and wires it
into the PDP's already-stubbed "Характеристики" tab
(`apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx:45-47`, currently
rendering the static `dict.product.specsEmpty` placeholder) plus basic catalog facet filters.

**Critical constraint (doc 099 §3, restated so it isn't missed during implementation):**
`Product.attributes Json` (the variant-axis map) is **not touched** by this plan. The two
systems can hold the same conceptual value (e.g. "colour") for different reasons — one for
sibling navigation, one for a comparison fact — and that overlap is expected, not a bug to
reconcile.

## Scope

### In Scope

- `AttributeDefinition` (per-category template, inherited down the subtree — see Technical
  Design) + `ProductAttributeValue` (filled-in values per product) + `AttributeType` enum
  (`TEXT | NUMBER | BOOLEAN | SELECT`).
- Admin: a "Характеристики" template editor on the category edit page (add/edit/remove/reorder
  attribute definitions for that category).
- Admin: a "Характеристики" tab on the product form rendering the **effective** definitions
  (own category + all ancestor categories) as typed inputs, saving `ProductAttributeValue` rows.
- Public: PDP "Характеристики" tab renders real key/value/unit rows; a small "highlights" strip
  (top N `isFilterable` specs) near the PDP title/buy-box.
- Public: basic catalog facet filters — one or two attribute filters surfaced per active
  category (Postgres-backed `ProductAttributeValue` join; no Meilisearch facet parity in this
  cut, see Out of Scope).

### Out of Scope

- Meilisearch dynamic facet attributes (`attr_material`, `attr_power`, …) for typo-tolerant/
  fast faceted search — doc 099 §6 calls this "базові фасет-фільтри" (basic), and a per-category,
  dynamically-shaped facet set is materially more Meilisearch config/reindex complexity than the
  Postgres join this plan ships. Flagged as a documented follow-up, not silently dropped.
- Any change to `Product.attributes Json` or the `ProductGroup`/`ProductGroupAxis` variant
  selector (TASK-142) — explicitly a different system (doc 099 §3).
- Range-slider UI for `valueNumber`-backed specs (e.g. "power 10–30W") — the schema supports it
  (`valueNumber Decimal?`) but the catalog UI in this plan only needs exact/select-style facet
  filters to satisfy "basic". A numeric range filter can reuse the existing price-slider pattern
  (`docs/plans/097`-era `price-range.ts`) as a later follow-up.

## User Story

As a shopper, I want to see a real, structured specification table on a product page (material,
dimensions, power output, …) instead of an empty placeholder, and filter the catalog by a spec
that matters to me (e.g. only silicone cases). As an admin, I want to define what characteristics
matter for a category once (a template) and then just fill in values per product, instead of
free-typing arbitrary key/value pairs with no consistency.

## Dependencies & Ordering

- **Depends on:** TASK-236 (plan 109) — specifically `CategoryRepository.findAncestorIds`
  (plan 109, TASK-236-A), reused here to compute the **effective** attribute-definition set for
  a product (own category's definitions + every ancestor category's definitions, since a
  template on "Чохли" should apply to "Чохли для смартфонів" beneath it — doc 099 §4.3:
  "успадковується піддеревом").
- **Independent of:** TASK-190 (plan 111, device compat) — doc 099 §6 explicitly notes "C
  незалежна від B", though the doc also notes facet-UI is "зручніше зводити після B" (i.e. once
  the device-model filter UI exists, adding one more facet control alongside it is easier — a
  UX-sequencing preference, not a hard dependency). This plan does not block on plan 111 landing.
- **Blocks:** nothing further in Етап 3.

## Technical Design

### Data Model

```prisma
enum AttributeType { TEXT NUMBER BOOLEAN SELECT }

model AttributeDefinition {
  id           String        @id @default(uuid())
  categoryId   String        @map("category_id")
  category     Category      @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  key          String
  label        String
  type         AttributeType @default(TEXT)
  unit         String?
  options      Json?
  isFilterable Boolean       @default(false) @map("is_filterable")
  sortOrder    Int           @default(0)     @map("sort_order")
  @@unique([categoryId, key])
  @@map("attribute_definitions")
}

model ProductAttributeValue {
  id           String  @id @default(uuid())
  productId    String  @map("product_id")
  product      Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  definitionId String  @map("definition_id")
  definition   AttributeDefinition @relation(fields: [definitionId], references: [id], onDelete: Cascade)
  value        String
  valueNumber  Decimal? @map("value_number") @db.Decimal(12, 3)
  @@unique([productId, definitionId])
  @@index([definitionId, value])
  @@map("product_attribute_values")
}
```

`Product.attributes Json` is unchanged — see Overview.

### Naming collision to avoid (implementation note, not a schema concern)

The word "attributes" is already the public-facing name for the variant-axis JSON in existing
DTOs/entities (`Product.attributes`). To avoid ambiguity in request/response shapes and admin UI
copy, this plan's API surface uses **"specs"** (not "attributes") wherever it's user- or
client-facing: `GET /products/:id` → `specs: ProductSpecEntity[]`, admin endpoint
`PUT /products/:id/specs`, React component names `ProductSpecsEditor`/`useProductSpecs`, etc. The
Prisma model names (`AttributeDefinition`/`ProductAttributeValue`) stay as designed in doc 099
§4.3 since those are internal/DB-only and don't leak into the ambiguous public vocabulary.

### Backend (NestJS — Clean Architecture)

New `attribute-definition` module (per-category templates) + a specs slice inside the `product`
module (filled-in values, same "lives on the position" shape as plan 111's compat slice).

#### `AttributeDefinitionRepository` (`apps/store-api/src/attribute-definition/attribute-definition.repository.ts`)

- `findByCategoryId(categoryId): Promise<AttributeDefinition[]>` — own-category only.
- `findEffectiveForCategory(categoryId): Promise<AttributeDefinition[]>` — own category +
  every ancestor's definitions (via `CategoryRepository.findAncestorIds`, plan 109), de-duplicated
  by `key` with the **most specific** (deepest) category's definition winning a key collision
  (e.g. a leaf category can override a broader ancestor template for the same key).
- `create`/`update`/`delete`/`reorder` scoped to one category.

#### `AttributeDefinitionService` (`apps/store-api/src/attribute-definition/attribute-definition.service.ts`)

- Validates `key` is a stable, URL/filter-safe token (kebab or camel, no spaces — mirrors the
  "англ. ключ" convention from doc 099 §5's authoring guide); enforces the `@@unique([categoryId,
key])` constraint with a friendly error.
- `options` validated as a non-empty string array when `type === SELECT`.

#### `AttributeDefinitionController` (admin-only — templates are an authoring concern, never

public)

- `GET /categories/:categoryId/attribute-definitions` — own-category templates, for the admin
  category-edit page.
- `POST`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/reorder` — `AdminGuard`.

#### Product module extension — spec values

- New `product-spec.repository.ts` (co-located in `product/`, mirrors plan 111's
  `product-device-compat.repository.ts` file-per-concern pattern):
  - `getSpecs(productId): Promise<ProductAttributeValue[]>` (joined with `definition` for
    label/type/unit).
  - `setSpecs(productId, values: { definitionId: string; value: string; valueNumber?: number
}[]): Promise<void>` — replace-all in one transaction, validated against the product's
    **effective** definition set (reject a `definitionId` that isn't in scope for the product's
    category; reject a value that doesn't match its definition's `type`, e.g. non-numeric
    `value` for a `NUMBER` definition, an option outside `options` for a `SELECT` definition).
- `ProductService.updateSpecs(productId, values)` — resolves the effective definitions via
  `AttributeDefinitionRepository.findEffectiveForCategory(product.categoryId)`, validates, then
  writes.
- New endpoint `PUT /products/:id/specs` (`AdminGuard`) — body `{ specs: { definitionId, value,
valueNumber? }[] }`.
- Public + admin product entities gain `specs: { key, label, unit, value, isFilterable }[]`
  (already-hydrated, ready for the PDP to render with no further lookups) and `highlights:
ProductSpecEntity[]` (the `isFilterable`-flagged subset, capped at a small N, e.g. 4 — for the
  PDP's "Коротко про товар" grid, mirroring the mockup's key-highlights layout that TASK-167-M
  omitted for lack of data).

#### Catalog facet filter (basic, Postgres-backed)

- `ProductListQueryDto` gains an optional structured filter, e.g. `specs?: string` parsed as
  `key:value` pairs (`class-transformer` `@Transform` to `Record<string, string>`, following the
  existing boolean-DTO gotcha precedent — read `obj[key]` directly in the `@Transform`, per the
  project's documented Boolean query DTO gotcha) — e.g. `?specs=material:Силікон`.
- `ProductRepository.findAll` applies, for each `key:value` pair, a
  `specValues.some({ definition: { key }, value })` nested-relation filter.
- `GET /categories/:id/filterable-specs` (public) — returns the `isFilterable` effective
  definitions + the distinct values currently in use for products under that category's subtree
  (for the storefront to render facet options without a separate "distinct values" query on the
  client). Reuses `CategoryRepository.findSubtreeIds` (plan 109).

### Frontend — store-admin (FSD)

- New `entities/attribute-definition` (Orval hooks).
- New `features/attribute-definition-editor` — a repeatable-row editor (key/label/type/unit/
  options/isFilterable/sortOrder), embedded in the category edit page as a new section/tab (not
  a separate route — templates are 1:1 with a category's edit context).
- `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/page.tsx` — add the templates
  section/tab.
- New `features/product-specs-editor` — renders the product's **effective** definitions
  (fetched via the product's `categoryId`) as typed inputs (text/number/checkbox/select per
  `AttributeType`), added as a new tab/section on `product-form.tsx` alongside the existing
  fields; saves via `PUT /products/:id/specs` on submit (or its own save action, whichever fits
  the existing form's save-flow better — prefer folding into the single form submit to avoid a
  second "did you forget to save" surface).

### Frontend — store-client (FSD)

- `widgets/product-detail/ui/product-specs-tabs.tsx:45-47` — the "specs" `TabsContent` renders a
  real key/value/unit list from `product.specs` instead of `dict.product.specsEmpty` (empty
  state preserved for products with zero specs).
- New small "highlights" strip near the PDP title/buy-box (new file, e.g.
  `product-highlights.tsx`) rendering `product.highlights` as compact icon-less chips/rows —
  fills the mockup's "Коротко про товар" grid that TASK-167-M explicitly omitted for lack of
  data.
- `features/product-filters` — one or two basic facet controls (select-style, populated from
  `GET /categories/:id/filterable-specs` when a category is active), URL-synced via
  `?specs=key:value` (single pair for this "basic" cut — multi-pair facet stacking is a
  documented future enhancement, not required by doc 099's "базові фасет-фільтри" wording).

## API Contract

| Method | Path                                            | Request Body                                         | Response                                                                  |
| ------ | ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/categories/:categoryId/attribute-definitions` | —                                                    | `{ data: AttributeDefinitionEntity[] }` (`AdminGuard`)                    |
| POST   | `/categories/:categoryId/attribute-definitions` | `CreateAttributeDefinitionDto`                       | `{ data: AttributeDefinitionEntity }` (`AdminGuard`)                      |
| PATCH  | `/attribute-definitions/:id`                    | `UpdateAttributeDefinitionDto`                       | `{ data: AttributeDefinitionEntity }` (`AdminGuard`)                      |
| DELETE | `/attribute-definitions/:id`                    | —                                                    | `{ data: { id } }` (`AdminGuard`)                                         |
| PUT    | `/products/:id/specs`                           | `{ specs: { definitionId, value, valueNumber? }[] }` | `{ data: ProductEntity }` (`AdminGuard`)                                  |
| GET    | `/categories/:id/filterable-specs`              | —                                                    | `{ data: { definition: AttributeDefinitionEntity, values: string[] }[] }` |
| GET    | `/products?specs=key:value`                     | —                                                    | unchanged envelope, filtered                                              |

## Tasks

### TASK-191-A: `AttributeDefinition` + `ProductAttributeValue` schema

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-236-A (plan 109 — `findAncestorIds` must exist for effective-definition
resolution)

**Acceptance Criteria:**

- [x] `AttributeType` enum + both models added to `schema.prisma` exactly per the Technical
      Design snippet; migration `npx prisma migrate dev --name add-structured-specs`.
- [x] `Product.attributes Json` field is verified byte-for-byte unchanged in the diff (explicit
      review checkpoint — this is the one field a careless edit could collide with).
- [x] Tests pass: `npx prisma validate` (schema-only check) + existing product test suite
      unaffected: `npm run test -w apps/store-api -- product.repository`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `AttributeType`, `AttributeDefinition`,
  `ProductAttributeValue`, plus `Category.attributeDefinitions` / `Product.specValues` back-relations.

---

### TASK-191-B: `AttributeDefinitionRepository`/`Service`/admin controller

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-191-A

**Acceptance Criteria:**

- [x] `findByCategoryId` returns only that category's own definitions, ordered by `sortOrder`.
- [x] `findEffectiveForCategory` returns own + all ancestors' definitions, with a leaf-category
      definition overriding an ancestor's same-`key` definition (unit test with a 3-level
      fixture: grandparent defines `material`, leaf overrides `material`'s `label` — leaf wins).
- [x] `key` validated as a stable token (regex, mirrors doc 099 §5's "англ. ключ" convention);
      duplicate `(categoryId, key)` create returns a friendly validation error.
- [x] `SELECT`-type definitions require a non-empty `options` array.
- [x] All admin endpoints (`GET`/`POST`/`PATCH`/`DELETE`/reorder) guarded by `AdminGuard`,
      documented with Swagger.
- [x] Tests pass: `npm run test -w apps/store-api -- attribute-definition`

**Files to create/modify:**

- `apps/store-api/src/attribute-definition/attribute-definition.repository.ts` (+ spec) — new.
- `apps/store-api/src/attribute-definition/attribute-definition.service.ts` (+ spec) — new.
- `apps/store-api/src/attribute-definition/attribute-definition.controller.ts` (+ spec) — new.
- `apps/store-api/src/attribute-definition/dto/*.ts`, `entities/*.ts`,
  `attribute-definition.module.ts`, `index.ts` — new.
- `apps/store-api/src/app.module.ts` — register the new module.
- `apps/store-api/src/category/category.module.ts` — export `CategoryRepository` if not already
  available for the ancestor-lookup dependency.

---

### TASK-191-C: Product spec values — assignment endpoint + entity hydration

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-191-B

**Acceptance Criteria:**

- [x] `setSpecs` replaces the full value set for a product in one transaction; rejects any
      `definitionId` outside the product's effective definition set (400, no partial write);
      rejects a value that violates its definition's `type` (non-numeric for `NUMBER`, non-member
      of `options` for `SELECT`).
- [x] `PUT /products/:id/specs` is `AdminGuard`-protected, documented with Swagger.
- [x] Product entities (public + admin) expose `specs: { key, label, unit, value, isFilterable
  }[]` and `highlights: ProductSpecEntity[]` (capped, `isFilterable`-only subset).
- [x] The response shape uses **"specs"**, never "attributes", per the Naming Collision note.
- [x] Unit tests cover: valid assign, effective-definition validation rejection, type
      validation rejection (NUMBER/SELECT). Hydration on `GET /products/:slug` and the e2e
      surface are deferred to the coordinating agent's serial integration pass (see Notes).
- [x] Unit tests pass: `npm run test -w apps/store-api -- product` (e2e deferred — not run
      here to avoid shared-DB contention across parallel agents).

**Files to create/modify:**

- `apps/store-api/src/product/product-spec.repository.ts` (+ spec) — new.
- `apps/store-api/src/product/product.service.ts` — `updateSpecs`.
- `apps/store-api/src/product/admin-product.controller.ts` — new `PUT :id/specs` route.
- `apps/store-api/src/product/entities/*.ts` — `specs`/`highlights` fields.
- `apps/store-api/src/product/product.module.ts` — import `AttributeDefinitionModule`.

---

### TASK-191-D: Basic catalog facet filter (Postgres-backed)

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-191-C, TASK-236-B (plan 109 — combines with the rolled-up category filter)

**Acceptance Criteria:**

- [x] `ProductListQueryDto` gains a `specs?: string` (`key:value`) param, transformed to a
      `{ key, value }` pair via `@Transform` (following the project's documented Boolean-DTO
      `enableImplicitConversion` gotcha — read `obj[key]` directly, don't rely on implicit
      coercion).
- [x] `ProductRepository.findAll` applies a `specValues.some({ definition: { key }, value })`
      filter when present, composable with `categoryId`/`brandId`/`deviceModelId`.
- [x] `GET /categories/:id/filterable-specs` returns the effective `isFilterable` definitions for
      that category plus the distinct values currently in use among products in its subtree
      (uses `findSubtreeIds` from plan 109).
- [x] Tests pass: `npm run test -w apps/store-api -- product category`

**Files to create/modify:**

- `apps/store-api/src/product/dto/product-list-query.dto.ts` — `specs` param + transform.
- `apps/store-api/src/product/product.repository.ts` — nested relation filter.
- `apps/store-api/src/category/category.controller.ts` — new `GET :id/filterable-specs` route.
- `apps/store-api/src/category/category.service.ts` — supporting method.

---

### TASK-191-E: Admin — category attribute-template editor

**Type:** feat
**Scope:** store-admin
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-191-B, Orval regeneration

**Acceptance Criteria:**

- [x] `npm run generate:api -w apps/store-admin` produces attribute-definition CRUD hooks.
- [x] Category edit page (`app/(dashboard)/categories/[id]/edit/page.tsx`) gains a
      "Характеристики" section listing that category's own templates (not inherited ones — the
      editor only manages what's defined directly on this category) with add/edit/remove/reorder.
- [x] The `type` field drives a conditional `options` input (shown only for `SELECT`).
- [x] `key` input validates the same token format the backend enforces, with an inline error.
- [x] Tests pass: `npm run test -w apps/store-admin -- attribute-definition category-form`

**Files to create/modify:**

- `apps/store-admin/src/entities/attribute-definition/index.ts` — new.
- `apps/store-admin/src/features/attribute-definition-editor/{ui,model}/*` — new.
- `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/page.tsx` — embed the editor.

---

### TASK-191-F: Admin — product specs editor tab

**Type:** feat
**Scope:** store-admin
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-191-C, TASK-191-E, Orval regeneration

**Acceptance Criteria:**

- [x] `product-form.tsx` gains a "Характеристики" section/tab rendering the product's effective
      definitions (own category + ancestors) as typed inputs matching each `AttributeType`.
- [x] Values persist via the specs save path on form submit (folded into the existing save flow,
      not a separate un-guarded "unsaved changes" surface).
- [x] Changing a product's category (before save) refreshes the rendered definition set to match
      the newly selected category's effective templates.
- [x] Tests pass: `npm run test -w apps/store-admin -- product-form`

**Files to create/modify:**

- `apps/store-admin/src/features/product-specs-editor/{ui,model}/*` — new.
- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — embed the editor tab.

---

### TASK-191-G: Storefront — PDP specs tab + highlights

**Type:** feat
**Scope:** store-client
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-191-C, Orval regeneration

**Acceptance Criteria:**

- [x] `product-specs-tabs.tsx`'s "specs" `TabsContent` (lines 45-47) renders a real key/label/
      unit/value list from `product.specs`; falls back to `dict.product.specsEmpty` only when
      the array is empty.
- [x] New highlights strip renders `product.highlights` (capped subset) near the PDP title/buy
      box; renders nothing when empty (matches the "no invented data" convention already used
      elsewhere on this page per TASK-167-M).
- [x] Tests pass: `npm run test -w apps/store-client -- product-specs-tabs product-detail-view`

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx` — real specs list.
- `apps/store-client/src/widgets/product-detail/ui/product-highlights.tsx` — new.
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — render highlights.

---

### TASK-191-H: Storefront — basic catalog facet filter UI

**Type:** feat
**Scope:** store-client
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-191-D, Orval regeneration

**Acceptance Criteria:**

- [x] `product-filters` renders one or two facet select controls, populated from
      `GET /categories/:id/filterable-specs` when a category is active in the URL; hidden when no
      category is selected or the category has no filterable specs.
- [x] Selecting a facet value writes `?specs=key:value` to the URL (single pair for this cut);
      `active-filter-chips.tsx` shows a removable chip for it.
- [x] Clearing the category filter also clears any active `specs` filter (facet options are
      category-scoped and become meaningless without one).
- [x] Tests pass: `npm run test -w apps/store-client -- product-filters`

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/product-filters.tsx`,
  `active-filter-chips.tsx` — new facet control + chip.
- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — thread `specs`
  through URL-synced filter state, clear-on-category-change logic.

## Migration Steps

1. `TASK-191-A` (schema).
2. `TASK-191-B` (definition repository/service/admin controller) — templates authorable, no
   products have values yet.
3. `TASK-191-C` (product spec-value assignment) — needs B's effective-definition resolution.
4. `TASK-191-D` (catalog facet filter, Postgres) — needs C's values to filter against.
5. `TASK-191-E` (admin template editor) and `TASK-191-F` (admin product specs tab) — E first in
   practice (staff need templates before there's anything to fill in on F), but F only _depends_
   on C being live, not on E shipping — an admin could theoretically use Swagger to seed
   definitions. Sequence E → F for a sane manual QA path regardless.
6. `TASK-191-G` (PDP specs/highlights) and `TASK-191-H` (catalog facet UI) in parallel once D–F
   ship and an Orval regen has run.

## Risks & Mitigations

| Risk                                                                                                   | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confusing `Product.attributes` (variant axis) with the new specs system                                | Explicit "Naming Collision" section above; API surface never reuses the word "attributes"; TASK-191-A's acceptance criteria include an explicit diff-review checkpoint |
| Ancestor-template override semantics (leaf overrides parent on same key) are surprising to admins      | Document the behavior in the category-template editor's UI copy ("успадковано від «Чохли»" style hint) — a copy/UX detail for TASK-191-E, not a schema change          |
| No products have specs yet — PDP tab/facets show empty everywhere until admins fill templates + values | Both surfaces already have documented empty states (`specsEmpty`, hidden highlights/facets) — ships correctly with zero data, same posture as plan 110's brand strip   |
| `specs=key:value` single-pair limitation feels incomplete next to a "real" faceted search              | Explicitly scoped as "basic" per doc 099 §6 wording; multi-pair stacking and Meilisearch facet parity are named as follow-ups, not silently dropped                    |

## Notes

- `Product.attributes Json` (variant axes) is explicitly out of scope everywhere in this plan —
  see the Overview and TASK-191-A's diff-review acceptance criterion.
- The Meilisearch facet-parity gap (Out of Scope) and the numeric range-filter gap are both worth
  a future one-off task once real spec data exists and usage patterns (which specs shoppers
  actually filter by) are observable.
