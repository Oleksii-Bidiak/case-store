# Plan 111 — Device compatibility ("Сумісні товари") (TASK-190)

> **Status:** ✅ Done (2026-07-06) — code complete on `feature/190-device-compat`;
> DB migration + `db:seed` + Meili reindex + e2e are manual (shared-DB constraint,
> see `docs/manual-qa-pending.md`).
> **Phase:** Roadmap Етап 3 — Фундамент каталогу — **Фаза B**
> **Design source:** `docs/plans/099-category-variant-architecture.md` §2.3, §3, §4.2
> (schema), §6 (phasing) — do not re-litigate the design, only operationalize it.
> **Created:** 2026-07-05
> **Last Updated:** 2026-07-05
> **BACKLOG task:** TASK-190. Absorbs TASK-165 (`docs/backlog-archive.md:622` — homepage
> `ModelPicker` is a UI-only stub, submit no-ops) + the compatibility slice of TASK-178
> (`docs/backlog-archive.md:633` — PDP "Сумісні аксесуари" cross-sell aside omitted; catalog's
> "Сумісний пристрій" picker omitted per `docs/backlog-archive.md:582`).

## Overview

Device compatibility ("this case fits an iPhone 15 Pro", "this powerbank fits everything") is an
**orthogonal axis** to the category tree (doc 099 §2.3) — not a category, not always identical
to a `ProductGroup` axis (doc 099 §3). This plan adds a generic `DeviceBrand`/`DeviceModel`
taxonomy and a `Product ↔ DeviceModel` many-to-many (`ProductDeviceCompat`), then wires the two
storefront surfaces that already have compat-shaped stubs waiting: the homepage `ModelPicker`
(`apps/store-client/src/widgets/hero-banner/ui/model-picker.tsx`, currently local `useState` with
a no-op submit over static `dict.home.modelPicker.brands/models` arrays) and the PDP's omitted
"Сумісні аксесуари" cross-sell aside.

This is the largest slice of Етап 3 (doc 099 sizes it **L**) because it spans two new taxonomy
tables, an M2M assignment surface (including a bulk "apply to the whole group" admin action —
doc 099 §3's explicit design call for the group/compat mismatch case), a catalog filter, and two
storefront wiring points.

## Scope

### In Scope

- `DeviceBrand` + `DeviceModel` taxonomy tables (generic multi-brand: Apple, Samsung, Xiaomi,
  Google, …), admin CRUD.
- `ProductDeviceCompat` M2M on `Product` (the position, not the group — doc 099 §3).
- Admin: multiselect "Сумісні пристрої" on the product form + a bulk "застосувати до всіх позицій
  групи" action (applies the same compat set to every sibling `Product` row sharing a
  `groupId`).
- Public catalog filter by `deviceModelId`.
- Meilisearch: `deviceModelIds: string[]` filterable attribute (parity with plan 109's
  `categoryIds[]` pattern).
- Homepage `ModelPicker` wired to real data + real navigation
  (`/products?deviceModelId=…`).
- PDP cross-sell widget: "Сумісні аксесуари" — other products compatible with the same device
  model as the current one (mirrors the existing `ProductRelated` rail pattern).
- Seed data: Apple lineup (iPhone/iPad/Watch series) + a representative Samsung/Xiaomi slice
  (doc 099 §4.5).

### Out of Scope

- Automatic compat inference from product names/descriptions (doc 099 §4.5 mentions a
  keyword-matching backfill script as an _option_, with mandatory manual review — not required
  to ship this plan; a product simply has no compat until an admin sets it).
- Catalog "Обирай швидко" spec quick-filters (TASK-178 remainder — that is structured specs,
  plan 112, not this one).
- Wishlist page's compat/model picker parity — not requested by doc 099.

## User Story

As a shopper, I want to tell the storefront which phone/device I own and immediately see
accessories that fit it (homepage picker → filtered catalog; PDP → "also fits your device"
cross-sell). As an admin, I want to tag a product (or, in one action, an entire variant group)
with the device models it's compatible with, without re-tagging every color/size position by
hand.

## Dependencies & Ordering

- **Depends on:** TASK-236 (plan 109) — device-model filtering composes with the rolled-up
  category filter in the same `GET /products` call.
- **Parallel with:** TASK-189 (plan 110, brands) — independent data model; both plans touch
  `product.repository.ts`/`product.service.ts`/`product-form.tsx`, so land whichever merges
  first and rebase the other (doc 099 §6: A and B are explicitly parallel-safe).
- **Blocks:** nothing in Етап 3 — TASK-191 (plan 112) is independent of this plan (doc 099 §6:
  "C незалежна від B", though facet-UI polish is easier once B's filter UI exists).

## Technical Design

### Data Model

```prisma
model DeviceBrand {
  id        String  @id @default(uuid())
  name      String
  slug      String  @unique
  isActive  Boolean @default(true) @map("is_active")
  sortOrder Int     @default(0)    @map("sort_order")
  models    DeviceModel[]
  @@map("device_brands")
}

model DeviceModel {
  id            String      @id @default(uuid())
  deviceBrandId String      @map("device_brand_id")
  brand         DeviceBrand @relation(fields: [deviceBrandId], references: [id])
  name          String
  slug          String      @unique
  series        String?
  releaseYear   Int?        @map("release_year")
  isActive      Boolean     @default(true) @map("is_active")
  compat        ProductDeviceCompat[]
  @@index([deviceBrandId])
  @@map("device_models")
}

model ProductDeviceCompat {
  productId     String      @map("product_id")
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  deviceModelId String      @map("device_model_id")
  deviceModel   DeviceModel @relation(fields: [deviceModelId], references: [id], onDelete: Cascade)
  @@id([productId, deviceModelId])
  @@index([deviceModelId])
  @@map("product_device_compat")
}
```

`onDelete: Cascade` on `ProductDeviceCompat` is correct here (join-row lifecycle is fully owned
by its two parents — not a cross-aggregate relationship in the `prisma-migration` skill's sense).

### Backend (NestJS — Clean Architecture)

New `device` module (taxonomy) + a compat slice living inside the `product` module (compat is a
property of the position, per doc 099 §3 — not a peer aggregate).

#### `DeviceRepository` (`apps/store-api/src/device/device.repository.ts`)

Covers both `DeviceBrand` and `DeviceModel` (small, tightly-coupled taxonomy — one repository,
like `Category`'s single repository covers the self-referential tree):

- `findBrands(activeOnly: boolean): Promise<DeviceBrand[]>`
- `findModels(params: { deviceBrandId?, series?, search?, activeOnly, page?, limit? }):
Promise<PaginatedDeviceModelsResult>` — supports the ModelPicker's brand→model cascade and the
  admin list.
- `findModelById(id)`, `findModelsByIds(ids: string[])` — for compat validation.
- CRUD for both `DeviceBrand` and `DeviceModel` (create/update/setActive).

#### `DeviceService` (`apps/store-api/src/device/device.service.ts`)

- Slug auto-generation (mirror `CategoryService`); validates `deviceBrandId` exists when
  creating/updating a model.

#### `DeviceController` (public) / `AdminDeviceController` (admin)

- Public: `GET /device-brands`, `GET /device-models` (query: `deviceBrandId?`, `search?`) — feeds
  the `ModelPicker` cascade and the catalog filter dropdown.
- Admin: full CRUD on both, `AdminGuard`.

#### `Product` module extension — compat assignment

- New repository methods on `ProductRepository` (or a small co-located
  `product-device-compat.repository.ts` inside `product/` if `product.repository.ts` gets too
  large — prefer the latter, following the same file-per-concern split
  `ProductImage`/`ProductGroup` already use):
  - `getDeviceCompat(productId): Promise<DeviceModelSummary[]>`
  - `setDeviceCompat(productId, deviceModelIds: string[]): Promise<void>` — replace-all
    semantics (delete existing rows for the product, insert the new set) inside a transaction.
  - `setDeviceCompatForGroup(groupId, deviceModelIds: string[]): Promise<void>` — applies the
    same set to every `Product` row sharing that `groupId` (the bulk admin action from doc 099
    §3). Validates the group exists and has at least one position.
- `ProductService` exposes `updateDeviceCompat(productId, deviceModelIds)` and
  `updateGroupDeviceCompat(groupId, deviceModelIds)`, validating every id via
  `DeviceRepository.findModelsByIds` before writing (reject unknown ids with a 400).
- New endpoints on the existing `admin-product.controller.ts` (or `product.controller.ts`'s
  admin-guarded section, matching wherever `product-form.tsx`'s other admin writes already
  land):
  - `PUT /products/:id/device-compat` — body `{ deviceModelIds: string[] }`.
  - `PUT /products/group/:groupId/device-compat` — same body, bulk action.
- Public + admin product entities gain `compatibleDeviceModels: { id, name, slug, brandName }[]`.

#### Catalog filter

- `ProductListQueryDto` gains `deviceModelId?: string`.
- `ProductRepository.findAll`'s `where` gains a relational filter:
  `where.deviceCompat = { some: { deviceModelId } }` (Prisma nested relation filter through the
  join table — no raw SQL needed here, unlike the category subtree CTE).

### Search (Meilisearch)

- `ProductSearchDocument` gains `deviceModelIds: string[]` (flat list of compatible model ids for
  the product — no ancestor expansion needed here, `DeviceModel` has no hierarchy beyond its
  `DeviceBrand` parent, and brand-level filtering is a separate concern if ever needed).
- `filterableAttributes` gains `'deviceModelIds'`.
- `toDocument` populates it from the compat join (`ProductIndexSource` projection extended with
  `deviceCompat: { deviceModelId }[]`).

### Frontend — store-admin (FSD)

- New `entities/device` (Orval hooks: device-brand + device-model list/CRUD).
- New `features/device-brand-form`, `features/device-model-form` (mirror `brand-form` from plan
  110 — same RHF/zod/slug-preview pattern).
- New `widgets/device-brand-list`, `widgets/device-model-list` (mirror `widgets/brand-list`).
- New routes under `app/(dashboard)/devices/brands/*` and `app/(dashboard)/devices/models/*`
  (nested the same way `blog/categories` nests under `blog/*`).
- `features/product-form/ui/product-form.tsx`:
  - New multiselect "Сумісні пристрої" (device-brand-grouped checkbox list or a searchable
    multiselect combobox — reuse whatever multiselect primitive already exists in
    `shared/ui`, or add one if none does; check before introducing a new dependency).
  - New "Застосувати до всіх позицій групи" button, enabled only when the product has a
    `groupId`, calling `updateGroupDeviceCompat` and showing a confirmation toast with the
    affected position count.

### Frontend — store-client (FSD)

- New `entities/device` (Orval hooks).
- `widgets/hero-banner/ui/model-picker.tsx` — replace the static `dict.home.modelPicker.brands`/
  `models` arrays with real `useDeviceControllerFindBrands`/`useDeviceControllerFindModels`
  (cascading: model select disabled/empty until a brand is chosen, model options scoped to
  `deviceBrandId`). `handleSubmit` navigates to
  `/products?deviceModelId=${selectedModelId}` instead of the current no-op.
- `features/product-filters` — new "Сумісний пристрій" filter control (brand→model cascade,
  same UX shape as the ModelPicker but inline in the filter stack), URL-synced via
  `?deviceModelId=`.
- New `widgets/product-detail/ui/product-compatible.tsx` — PDP cross-sell rail, structurally
  mirroring `product-related.tsx` (same snap-scroll/arrow-nav shell) but querying
  `GET /products?deviceModelId=<one of the current product's compat models>` and excluding the
  current product, rendered only when the current product has at least one compat model.
- `widgets/product-detail/ui/product-detail-view.tsx` — render `ProductCompatible` alongside the
  existing `ProductRelated` rail when `product.compatibleDeviceModels.length > 0`.

## API Contract

| Method     | Path                                         | Request Body                   | Response                                            |
| ---------- | -------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| GET        | `/device-brands`                             | —                              | `{ data: DeviceBrandEntity[] }` (active only)       |
| GET        | `/device-models?deviceBrandId=&search=`      | —                              | `{ data: DeviceModelEntity[] }` (active only)       |
| GET        | `/device-models/admin/list`                  | —                              | paginated, all statuses, `AdminGuard`               |
| POST/PATCH | `/device-brands`, `/device-models` (+`/:id`) | Create/Update DTOs             | `AdminGuard`                                        |
| PUT        | `/products/:id/device-compat`                | `{ deviceModelIds: string[] }` | `{ data: ProductEntity }` (`AdminGuard`)            |
| PUT        | `/products/group/:groupId/device-compat`     | `{ deviceModelIds: string[] }` | `{ data: { updatedCount: number } }` (`AdminGuard`) |
| GET        | `/products?deviceModelId=`                   | —                              | unchanged envelope, filtered                        |

## Tasks

### TASK-190-A: `DeviceBrand`/`DeviceModel`/`ProductDeviceCompat` schema + seed

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-236 (plan 109) merged/available

**Acceptance Criteria:**

- [x] Three models added to `schema.prisma` exactly per the Technical Design snippet.
      (Migration run `npx prisma migrate dev` is **manual** — shared-DB constraint.)
- [x] `prisma/seed.ts` upserts an Apple lineup (iPhone 12–16 series incl. Pro/Plus/Max variants,
      iPad, Apple Watch case sizes) and a representative Samsung + Xiaomi slice, grouped by
      `series` for the ModelPicker's cascade UX.
- [x] Seed is idempotent (`upsert` on `slug`), safe to re-run.
- [x] Tests pass: `npx prisma db seed` runs clean against the dev DB (3 device brands, 40 device
      models upserted idempotently) — verified during the Етап 3 integration.

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — three new models.
- `apps/store-api/prisma/seed.ts` — device brand/model seed rows.

---

### TASK-190-B: `DeviceRepository`/`DeviceService` + public/admin controllers

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-190-A

**Acceptance Criteria:**

- [x] `DeviceRepository` implements brand + model CRUD/list per Technical Design, with unit
      tests (including the brand→model cascade query and pagination).
- [x] `GET /device-brands`, `GET /device-models` are public, active-only by default.
- [x] Admin CRUD endpoints (`AdminGuard`) for both brand and model, including a status/`isActive`
      toggle.
- [x] `DeviceModule` registered in `app.module.ts`.
- [x] Tests pass: `npm run test -w apps/store-api -- device`

**Files to create/modify:**

- `apps/store-api/src/device/device.repository.ts` (+ spec) — new.
- `apps/store-api/src/device/device.service.ts` (+ spec) — new.
- `apps/store-api/src/device/device.controller.ts`,
  `admin-device.controller.ts` (+ specs) — new.
- `apps/store-api/src/device/dto/*.ts`, `entities/*.ts`, `device.module.ts`, `index.ts` — new.
- `apps/store-api/src/app.module.ts` — register `DeviceModule`.

---

### TASK-190-C: Product ↔ device-model compat assignment (incl. bulk group action)

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-190-B

**Acceptance Criteria:**

- [x] `setDeviceCompat(productId, deviceModelIds)` replaces the full compat set for a product in
      one transaction (delete + insert), never leaves a partial state on error.
- [x] `setDeviceCompatForGroup(groupId, deviceModelIds)` applies the same set to every sibling
      position sharing that `groupId`; returns the count of positions updated; 404 if the group
      has zero positions.
- [x] Unknown `deviceModelId`s are rejected with a 400 before any write (validated via
      `DeviceRepository.findModelsByIds`).
- [x] `PUT /products/:id/device-compat` and `PUT /products/group/:groupId/device-compat` are
      `AdminGuard`-protected and documented with Swagger.
- [x] Product entities (public + admin) expose `compatibleDeviceModels: { id, name, slug,
brandName }[]`.
- [x] Unit tests cover: single-position assign, group bulk-assign across 3 sibling positions,
      invalid id rejection, and idempotent re-assignment (composite-key dedupe). _(e2e is
      **manual** — shared-DB constraint.)_
- [x] Tests pass: `npm run test -w apps/store-api -- product`. `test:e2e` deferred to manual QA.

**Files to create/modify:**

- `apps/store-api/src/product/product-device-compat.repository.ts` (+ spec) — new, co-located in
  the `product` module.
- `apps/store-api/src/product/product.service.ts` — `updateDeviceCompat`,
  `updateGroupDeviceCompat`.
- `apps/store-api/src/product/admin-product.controller.ts` (or wherever admin product writes
  live) — two new routes.
- `apps/store-api/src/product/entities/*.ts` — `compatibleDeviceModels` field.
- `apps/store-api/src/product/product.module.ts` — import `DeviceModule` for id validation.

---

### TASK-190-D: Public catalog filter by device model + Meilisearch facet

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-190-C, TASK-236-B (plan 109 rollup — combines with `categoryId` in the same
query)

**Acceptance Criteria:**

- [x] `ProductListQueryDto` gains `deviceModelId?: string`; `ProductRepository.findAll` applies
      `where.deviceCompat = { some: { deviceModelId } }`.
- [x] `ProductSearchDocument` gains `deviceModelIds: string[]`; `filterableAttributes` gains
      `'deviceModelIds'`; `toDocument` populated from the compat join.
- [x] Filtering by `categoryId` + `deviceModelId` together narrows correctly (combined `AND`).
- [x] Tests pass: `npm run test -w apps/store-api -- product search`

**Files to create/modify:**

- `apps/store-api/src/product/dto/product-list-query.dto.ts` — `deviceModelId`.
- `apps/store-api/src/product/product.repository.ts` — where-clause + `ProductIndexSource`
  projection extension.
- `apps/store-api/src/search/meili.client.ts`, `search.service.ts` — document shape + settings.

---

### TASK-190-E: Admin device-taxonomy CRUD + product-form compat multiselect + bulk action

**Type:** feat
**Scope:** store-admin
**Complexity:** L
**TDD Required:** No
**Depends on:** TASK-190-B, TASK-190-C, Orval regeneration

**Acceptance Criteria:**

- [x] `npm run generate:api -w apps/store-admin` produces device-brand/device-model hooks.
- [x] Device brand + device model CRUD pages (`/devices/brands`, `/devices/models`) —
      list/create/edit/status toggle; model form's brand select scopes to existing device brands.
- [x] The edit-product view gains a "Сумісні пристрої" multiselect (brand-grouped checkbox list)
      bound to `updateDeviceCompat` — implemented as a co-located `ProductDeviceCompatManager`
      (compat has its own endpoint, not the product create/update DTO).
- [x] A "Застосувати до всіх позицій групи" button appears only when the product has a
      `groupId`; clicking it calls the bulk endpoint and shows a toast with the count of
      positions updated; hidden for group-less products.
- [x] Admin sidebar nav includes "Пристрої" (Brands/Models cross-linked tabs).
- [x] Tests pass: `npm run test -w apps/store-admin` (179 green).

**Files to create/modify:**

- `apps/store-admin/src/entities/device/index.ts` — new.
- `apps/store-admin/src/features/device-brand-form/*`, `device-model-form/*` — new.
- `apps/store-admin/src/widgets/device-brand-list/*`, `device-model-list/*` — new.
- `apps/store-admin/src/app/(dashboard)/devices/brands/*`, `devices/models/*` — new routes.
- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — multiselect + bulk button.
- Admin sidebar nav config — new "Пристрої" section.

---

### TASK-190-F: Homepage ModelPicker wiring + storefront device-model filter + PDP cross-sell

**Type:** feat
**Scope:** store-client
**Complexity:** L
**TDD Required:** No
**Depends on:** TASK-190-B, TASK-190-D, Orval regeneration

**Acceptance Criteria:**

- [x] `npm run generate:api -w apps/store-client` produces device-brand/device-model hooks.
- [x] `widgets/hero-banner/ui/model-picker.tsx` — brand select populated from
      `GET /device-brands`; model select populated from `GET /device-models?deviceBrandId=`,
      disabled until a brand is chosen; submit navigates to
      `/products?deviceModelId=<id>` (real navigation, no more no-op).
- [x] `product-filters` gains a "Сумісний пристрій" cascade control, URL-synced via
      `?deviceModelId=`, combinable with category/price filters.
- [x] `active-filter-chips.tsx` shows a removable "Пристрій: X" chip when set.
- [x] New `widgets/product-detail/ui/product-compatible.tsx` renders a cross-sell rail (mirrors
      `product-related.tsx`'s shell) of other products compatible with the same device model,
      excluding the current product; renders nothing when the current product has zero compat
      models.
- [x] `product-detail-view.tsx` includes `ProductCompatible` when applicable.
- [x] `dict.home.modelPicker.brands`/`models` static arrays removed (no longer used).
- [x] Tests pass: `npm run test -w apps/store-client` (365 green), incl. a new `model-picker`
      cascade+navigation test.

**Files to create/modify:**

- `apps/store-client/src/entities/device/index.ts` — new.
- `apps/store-client/src/widgets/hero-banner/ui/model-picker.tsx` — real data + navigation.
- `apps/store-client/src/features/product-filters/ui/product-filters.tsx`,
  `active-filter-chips.tsx` — device-model control + chip.
- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — thread
  `deviceModelId` through URL-synced filter state.
- `apps/store-client/src/widgets/product-detail/ui/product-compatible.tsx` — new.
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — render the new
  rail.
- `apps/store-client/src/shared/config/dictionary.ts` — remove the now-dead
  `dict.home.modelPicker.brands`/`models` stub arrays; keep title/subtitle/aria copy keys.

## Migration Steps

1. `TASK-190-A` (schema + seed).
2. `TASK-190-B` (taxonomy repository/service/controllers) — endpoints live, unused.
3. `TASK-190-C` (compat assignment on `Product`, incl. bulk group action).
4. `TASK-190-D` (catalog filter + Meilisearch facet).
5. `TASK-190-E` (admin UI) and `TASK-190-F` (storefront UI) in parallel once B–D ship and an
   Orval regen has run in each workspace.

## Risks & Mitigations

| Risk                                                                                                                         | Mitigation                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk group-compat action silently overwrites intentionally-different per-position compat (doc 099 §3's "may not match" case) | Admin UI shows a confirmation with the affected position count before applying; the endpoint is opt-in per click, never automatic                                     |
| No multiselect primitive exists yet in `shared/ui` (admin)                                                                   | Check `shared/ui` first (task acceptance criteria implicitly requires this); if absent, add a minimal one scoped to this feature rather than pulling a new dependency |
| Device-model seed data grows unbounded over time (many phone models)                                                         | Seed only a representative slice per doc 099 §4.5; admin CRUD covers the long tail without further migrations                                                         |
| `deviceCompat = { some: {...} }` Prisma filter performance at scale                                                          | `@@index([deviceModelId])` on `ProductDeviceCompat` already covers the lookup direction used by the catalog filter                                                    |

## Notes

- `Brand` (plan 110, product manufacturer) and `DeviceBrand` (this plan, compatible-device
  manufacturer) are intentionally separate tables — see plan 110's Overview for the same note
  from the other side.
- Compat lives on `Product` (the position), not `ProductGroup`, per doc 099 §3 — a color axis and
  a device-compat axis can coincide (case: color positions each need their own compat) or diverge
  (cable: compat is identical across every color/length position) in ways a single group-level
  field can't express; the bulk "apply to group" admin action is the ergonomic answer to the
  common "identical across the group" case without forcing that model universally.
