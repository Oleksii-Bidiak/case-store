# Plan 154 — Admin-managed recommendation carousels (TASK-139)

> **Status:** ✅ Done (TASK-139 shipped 2026-07-12; live smoke → manual QA)
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog)
> **Created:** 2026-07-11
> **BACKLOG task:** TASK-139 (single task, no BACKLOG split — internal work breakdown
> TASK-139-A…F below, mirrors the plan-150 convention)
> **Orchestration:** implemented in worktree `feature/139-recommendation-carousels` per
> `docs/plans/152-late-wave-2-orchestration.md`. **This branch is the designated merge
> ADAPTER** for the wave: before its final merge into `develop` it merges `develop` inside its
> own worktree and resolves conflicts there (see §Merge-adapter responsibility below) — this is
> the one branch of the five allowed to touch `apps/store-client/src/app/page.tsx`.

## Overview

The storefront homepage currently has exactly one product-recommendation surface —
`PopularRail` (`widgets/product-grid`), a hardcoded 3-tab rail (Хіти / Новинки / Акційні) with
no admin control over content, tab count, or ordering. This plan adds **admin-managed
recommendation carousels**: named sections an admin creates, orders, and either drives by a
**rule** (bestselling / newest / on-sale / a specific category) or fills by **hand-picking
products** (MANUAL). It is built as a direct structural copy of the `Banner` content model
(`apps/store-api/src/banners/`, plan 106) — publish lifecycle (`status`/`publishedAt`/
`scheduledAt`) + `sortOrder` + ISR tag-based revalidation — with one added dimension: each
carousel also carries a `source` that determines how its product list is computed, and,
for `MANUAL`, a child `CarouselItem` table of hand-picked products.

**Owner decision (FINAL, 2026-07-11):** "rules + manual pick" model — `Carousel.source: BESTSELLING
| NEWEST | ON_SALE | CATEGORY | MANUAL`, a `CarouselItem` table used only when `source = MANUAL`,
and a `categoryId` used only when `source = CATEGORY`. Mirrors the Banner pattern.

## Scope

### In Scope

- `Carousel` model (title, `source`, optional `categoryId`, `itemLimit`, `sortOrder`, publish
  lifecycle) + `CarouselItem` model (carousel↔product join with its own `sortOrder`, live for
  `MANUAL` carousels only).
- Backend module `apps/store-api/src/carousels/` mirroring `banners/` file-for-file: repository
  (implements `PublishablePort`), service, public controller, admin controller, DTOs, entities.
- **Source resolution** — turning a `Carousel` row into an actual ordered product list — by
  reusing `ProductService`'s existing query capabilities (`findAll`, `getCardsByIds`), not
  reimplementing catalog querying.
- Admin CRUD (list/create/edit/publish/unpublish/delete) mirroring `banner-form`/`banner-list`,
  plus a MANUAL-only product picker/reorder panel (mirrors the existing `ProductImageManager`
  move-buttons reordering pattern — no new drag-and-drop dependency).
- Storefront rendering: a new `RecommendationCarousels` widget on the homepage, **coexisting**
  below `PopularRail` (owner-approved default), fed by a tag-based ISR fetch
  (`shared/api/carousels-server.ts`, mirrors `banners-server.ts`).
- New, OWN dictionary namespaces in both apps (appended) — `carousels`/`carouselForm`/
  `carouselItems` in store-admin, a small `carousels` namespace in store-client.

### Out of Scope

- Any change to `PopularRail` itself (owner default = coexist, not replace — see §Open
  Questions for the alternative that was considered and rejected as the default).
- A live visual preview panel in the admin form (the kind TASK-265 later added to
  `banner-form`) — not requested here; noted as a natural, non-blocking future enhancement in
  §Notes.
- Wiring carousels into `docs/plans/…/content-map` (TASK-264's admin "де що на сайті" map) — a
  natural follow-up once this ships, deliberately left untouched here to keep this branch's
  conflict surface minimal (per the orchestration instructions).
- Any drag-and-drop reordering library — the codebase has none today (`ProductImageManager`
  already solved item-reordering with accessible move buttons; this plan reuses that shape).
- Redis-layer caching of carousel resolution — see §Technical Design's caching note for why this
  is intentionally not added.

## Merge-adapter responsibility

Per the orchestration plan, `feature/139-recommendation-carousels` is the **last** branch merged
into `develop` and is responsible for reconciling itself against `develop` (which by then already
contains `feature/168-google-oauth`, `feature/082-category-nav`, `feature/084-catalog-ux`) before
the orchestrator merges it. Concretely:

1. Inside the worktree, once the other three branches are already on `develop`: `git merge
develop`.
2. **`schema.prisma`**: TASK-168 (Google OAuth) also appends new models at the end of the file.
   Both branches append after the same last line, so this is very likely a real (if trivial)
   git conflict — resolve as **keep both blocks**, in whichever order git presents them; do NOT
   reorder or interleave the two branches' models. Re-run `npx prisma generate` (inline dummy
   `DATABASE_URL`) after resolving to confirm the merged schema is valid.
3. **`dictionary.ts`** (both apps): TASK-082/083 and TASK-084/086 add keys inside `header`/
   `home.categories`/`categories`/`filters`/`quickView` — namespaces this plan does not touch.
   This plan's new namespaces are appended at the very end of the file, after those branches'
   edits (which are inside existing, earlier namespaces). Expect no real conflict here beyond
   git's context lines; if one appears, resolve keep-both by namespace, never dropping a block.
4. **`apps/store-client/src/app/page.tsx`**: no other branch in this wave touches this file (per
   the orchestration hotspot table), so no conflict is expected here — this plan's edit is the
   only one.
5. Re-run this worktree's unit/lint/typecheck/build gates (§Migration Steps) after the merge,
   before signalling the orchestrator for the final `--no-ff` merge into `develop`.

## User Stories

1. As a **store admin**, I want to create a homepage section that always shows our current
   bestsellers (or newest arrivals, or everything on sale) without ever touching it again — new
   products should flow in and out automatically as the underlying data changes.
2. As a **store admin**, I want a homepage section for one specific category (e.g. "Аксесуари для
   MacBook") without hand-curating it, reusing the same category-subtree rollup the catalog
   filter already uses.
3. As a **store admin**, I want a homepage section I fully hand-pick and order myself (e.g. a
   "Редакція обирає" curated list), independent of any automatic rule.
4. As a **store admin**, I want to order multiple such sections on the homepage, and to draft,
   schedule, or unpublish any of them — exactly like I already do with banners.
5. As a **customer**, I want to see relevant, current product recommendations on the homepage
   that never show dead links (deactivated/deleted products silently disappear) and never show a
   broken empty section.

## Technical Design

### Data Model

Per the orchestration convention (plan 152 checklist item 8), new models are appended to the
**end** of `schema.prisma`. The only deviations — required by Prisma relations, not a choice —
are two single-line back-relation additions to existing model bodies (`Category`, `Product`).

```prisma
// ── Small additions to EXISTING models (not new models) ───────────────────

// Inside `model Category { ... }`, alongside its other relation arrays:
//   carousels Carousel[]

// Inside `model Product { ... }`, alongside the other back-relation arrays
// (reviews, orderItems, cartItems, wishlistItems, deviceCompat, specValues):
//   carouselItems CarouselItem[]

// ── New models — appended to the END of schema.prisma ─────────────────────

/// How a Carousel's product list is computed (TASK-139). Mirrors the "rules +
/// manual pick" owner decision: four rule-based sources reuse the existing
/// product-query capabilities (ProductService.findAll), MANUAL is backed by
/// its own CarouselItem rows.
enum CarouselSource {
  BESTSELLING
  NEWEST
  ON_SALE
  CATEGORY
  MANUAL
}

/// Admin-managed homepage recommendation carousel (TASK-139). Structural copy
/// of `Banner` (publish lifecycle + sortOrder) with one added dimension: `source`
/// determines how the product list is computed at read time — this model never
/// stores a resolved product list except via `CarouselItem` (MANUAL only).
/// `categoryId` is meaningful only when `source = CATEGORY`; `itemLimit` is
/// meaningful only for the four rule-based sources (ignored for MANUAL, whose
/// count is simply the number of `CarouselItem` rows). Both constraints are
/// enforced at the DTO/service layer, not by a DB CHECK (same documented
/// limitation as `Product.stock >= 0` elsewhere in this schema).
model Carousel {
  id          String         @id @default(uuid())
  title       String
  /// How the product list is computed — see {@link CarouselSource}.
  source      CarouselSource
  /// Category to pull from — REQUIRED when source = CATEGORY, ignored
  /// otherwise. SetNull (not Cascade) on category deletion: a carousel must
  /// survive its category disappearing — it just resolves to zero products
  /// until an admin repoints it (§Source resolution semantics, empty behavior).
  categoryId  String?        @map("category_id")
  category    Category?      @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  /// Max products to show for a rule-based source (1–24, default 12 — matches
  /// PopularRail/RecentlyViewed's existing rail size). Ignored for MANUAL.
  itemLimit   Int            @default(12) @map("item_limit")
  /// Homepage display order across ALL carousels (lower = first) — same
  /// semantics as `Banner.sortOrder` within a placement, but global here since
  /// carousels have no placement grouping.
  sortOrder   Int            @default(0) @map("sort_order")
  /// Publish lifecycle — the single source of truth for public visibility.
  status      PublishStatus  @default(DRAFT)
  publishedAt DateTime?      @map("published_at")
  scheduledAt DateTime?      @map("scheduled_at")
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")

  items CarouselItem[]

  @@index([status, sortOrder])
  @@index([categoryId])
  @@map("carousels")
}

/// One hand-picked product on a MANUAL carousel (TASK-139), with its own
/// display order. Inert (never read by the resolver) on non-MANUAL carousels —
/// switching a carousel's source away from and back to MANUAL does not lose
/// its item rows, by design (no cleanup-on-switch; see §Technical Design).
/// `onDelete: Cascade` on `product` mirrors `WishlistItem`'s live-membership
/// join (not a snapshot — if a product row were ever hard-deleted, which this
/// codebase does not do for Product, the membership row should go with it).
model CarouselItem {
  id         String   @id @default(uuid())
  carouselId String   @map("carousel_id")
  carousel   Carousel @relation(fields: [carouselId], references: [id], onDelete: Cascade)
  productId  String   @map("product_id")
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  sortOrder  Int      @default(0) @map("sort_order")
  createdAt  DateTime @default(now()) @map("created_at")

  @@unique([carouselId, productId])
  @@index([carouselId, sortOrder])
  @@map("carousel_items")
}
```

**Migration mechanics** (per the `prisma-migration` skill / memory note `migrations-gitignored`):
migration SQL is gitignored — `schema.prisma` is the single source of truth. Apply with
`npx prisma db push` on both the dev DB and `store_test` (Playwright/`test:int` target
`store_test` explicitly), never `prisma migrate dev`. In-worktree, `prisma generate` runs with an
inline dummy `DATABASE_URL` (per the implementation-context checklist); the actual `db push`
against real databases happens once on `develop` after merge (Фаза 3 of the orchestration plan).

### Source resolution semantics — the heart of this feature

`CarouselService.resolveProducts(carousel, items?)` turns one `Carousel` row into an ordered
`PublicProductEntity[]`, entirely by delegating to `ProductService` (injected — `CarouselsModule`
imports `ProductModule`, which already exports `ProductService`). **No catalog querying is
reimplemented here** — every rule source is a plain call into the exact same code path
`GET /products` already uses, so a carousel's "bestselling" ordering, "on sale" definition, and
category-subtree rollup are always in lock-step with the public catalog:

| `source`      | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BESTSELLING` | `productService.findAll({ isActive: true, sortBy: 'bestselling', sortOrder: 'desc', page: 1, limit: carousel.itemLimit })` — same units-sold-over-PAID-orders ranking as `PopularRail`'s "Хіти" tab (TASK-164).                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NEWEST`      | `productService.findAll({ isActive: true, sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: carousel.itemLimit })` — same as PopularRail's "Новинки" tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ON_SALE`     | `productService.findAll({ isActive: true, onSale: true, sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: carousel.itemLimit })` — server-side `onSale` filter (TASK-179), NOT the client-side `isOnSale()` filter PopularRail's "Акційні" tab still uses; this is strictly more correct (server-paginated, not "fetch 24 then filter").                                                                                                                                                                                                                                                                            |
| `CATEGORY`    | `carousel.categoryId == null` → `[]` (defensive; should not happen once the DTO-level `@ValidateIf` requirement is enforced, but a category can still be `SetNull`'d after the fact — see §Empty-carousel behavior). Otherwise `productService.findAll({ isActive: true, categoryId: carousel.categoryId, sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: carousel.itemLimit })` — `findAll` already expands the category to its full subtree internally (`resolveSubtreeIds`, TASK-236), so picking a PARENT category rolls up every descendant product for free, exactly like the `/products?category=` filter. |
| `MANUAL`      | Read `CarouselItem` rows for this carousel ordered by `sortOrder` ASC → map to a `productId[]` array (already de-duplicated by the `@@unique([carouselId, productId])` constraint) → `productService.getCardsByIds(productIds)` (the existing TASK-211 method — active-only, request-order-preserving, silently drops unknown/deactivated/deleted ids). `itemLimit` is not consulted for this source.                                                                                                                                                                                                                     |

**Constructing the `ProductListQueryDto` for a rule-based call.** `ProductService.findAll` expects
an actual `ProductListQueryDto` instance — its `page`/`limit`/`sortBy`/`sortOrder` defaults are
class field initializers that apply only when the class is instantiated, NOT when a same-shaped
plain object literal is passed in. `resolveProducts` must build the params via
`Object.assign(new ProductListQueryDto(), { isActive: true, categoryId, sortBy, sortOrder, page: 1,
limit: carousel.itemLimit })` (or set every field explicitly on a `new ProductListQueryDto()`)
rather than a bare object literal, so the same defaults the public `GET /products` endpoint relies
on stay identical for carousel resolution.

**Empty-carousel behavior:** `GET /carousels` (public) returns every `PUBLISHED` carousel with
its resolved `products` array, **even when that array is empty** (no bestsellers yet, an empty
category, a category that got `SetNull`'d, or every MANUAL item having since gone inactive). The
backend does not filter these out — the storefront `RecommendationCarousels` widget skips
rendering any carousel whose `products.length === 0`, exactly mirroring how `RecentlyViewed`
already hides itself when its resolved card set is empty. This keeps the API response an honest,
complete list of "what's published" (useful for admin debugging / future content-map wiring) while
guaranteeing the homepage never shows a broken empty section.

**No additional caching layer.** `ProductService.findAll` already has its own Redis cache-aside
internally, so every rule-based source benefits from the existing product-list cache for free.
`getCardsByIds` (MANUAL) is explicitly documented as uncached in its own TSDoc ("id combinations
are per-visitor") — that reasoning does NOT apply here (a carousel's id set is fixed admin content,
not per-visitor), but it is still not worth an extra cache layer: the WHOLE `GET /carousels`
response is what the storefront tags and caches via Next's `fetch(..., { next: { tags:
['carousels'] } })` (mirrors `banners-server.ts` exactly), so store-api is only hit on a cache
miss or an explicit `RevalidationNotifier` purge — the same posture as Banners, which also has no
service-level cache. If carousel count or item count ever grows enough for this to matter, adding
a cache-aside wrapper around `resolveProducts` is a contained, backwards-compatible follow-up.

**Per-carousel query count, not N+1 in the addon-resolver sense.** `GET /carousels` issues one
resolution query per PUBLISHED carousel (bounded by however many carousels an admin has created —
expected single digits, the same "low-volume admin content" assumption plan 106 already made for
Banners' unpaginated list). This is architecturally different from the N+1 pitfalls flagged
elsewhere in this codebase (e.g. the addon resolver, plan 150): there, N was the size of a
user-controlled cart; here, N is the size of an admin-controlled carousel list. No batching is
attempted across carousels — each rule source is inherently a distinct filter/sort combination
that cannot share one query with another carousel's.

### Backend (NestJS — Clean Architecture)

New module `apps/store-api/src/carousels/`, file-for-file mirroring `apps/store-api/src/banners/`.

#### `CarouselRepository`

- `findAllPublished()` — `status = PUBLISHED`, ordered by `sortOrder` asc then `createdAt` asc
  (mirrors `BannerRepository.findAllPublished`, minus the placement filter — carousels have no
  placement grouping).
- `findAllAdmin(params: { status? })` — all statuses, ordered by `sortOrder` asc then `createdAt`
  desc.
- `findById(id)` — any status (admin use).
- `create(data)` / `update(id, data)` — mirror `BannerRepository` 1:1 (publish fields
  pre-resolved by the service via `resolvePublishState`, same as Banner).
- `publish(id, now)` / `unpublish(id)` — mirror `BannerRepository` 1:1.
- `delete(id)` — hard delete; `CarouselItem` rows cascade automatically (`onDelete: Cascade`).
- `publishDue(now)` — {@link PublishablePort} implementation, mirrors `BannerRepository` 1:1;
  `revalidateTarget = { tags: ['carousels'], paths: ['/'] }`.
- `findItemIds(carouselId)` — `CarouselItem` rows for one carousel, `productId` + `sortOrder`
  only, ordered by `sortOrder` asc — feeds the resolver's MANUAL branch.
- `findItemsWithProducts(carouselId)` — same rows, `include: { product: { select: { id: true,
name: true, price: true, isActive: true, images: { where: { isPrimary: true }, take: 1 } } } }`
  in ONE query. `Product` has no scalar `imageUrl` column — images live on the related
  `ProductImage` table, so the primary image (falling back to `orderBy: { sortOrder: 'asc' },
take: 1` when none is flagged primary) is joined and flattened to
  `CarouselItemEntity.product.imageUrl` in the entity mapper. Deliberately does **not** filter
  `isActive`/`deletedAt` — this is the ADMIN-only read, so a deactivated product still resolves
  its real name/image for display fidelity (contrast with the storefront-facing `getCardsByIds`,
  which stays active-only) — feeds the admin item-management endpoint so the picker UI never does
  a follow-up per-item fetch.
- `replaceItems(carouselId, items: { productId, sortOrder }[])` — one transaction:
  `deleteMany({ carouselId })` + `createMany(...)`, full-replace (mirrors
  `ReorderImagesDto`'s persistence shape and `CategoryAddonTemplate`'s "full-replace on write"
  precedent from plan 150).

#### `CarouselService`

- Injects `CarouselRepository`, `ProductService` (from `ProductModule`), `CategoryRepository`
  (from `CategoryModule` — existence-check only, so an admin gets a clean 400/404 instead of a raw
  Prisma FK error when `categoryId` doesn't resolve to a real category), `RevalidationNotifier`.
- `findAllPublished()` — for each published carousel (repository order), calls
  `resolveProducts(carousel)` (§Source resolution semantics) and maps to `PublicCarouselEntity`.
- `findAllAdmin(query)` / `findByIdAdmin(id)` — plain CRUD reads, mirror `BannerService`.
- `create(dto)` / `update(id, dto)` — mirror `BannerService.create`/`.update` byte-for-byte
  (`resolvePublishState`, `wasPublished` visibility-change revalidation, preserved
  `publishedAt` on re-save). Additionally: when `dto.source === CATEGORY`, verifies
  `categoryRepository.findById(dto.categoryId)` resolves (`NotFoundException` otherwise) before
  writing.
- `publish(id)` / `unpublish(id)` / `delete(id)` — mirror `BannerService` 1:1.
- `getItems(id)` — admin read via `findItemsWithProducts`, mapped to `CarouselItemEntity[]`.
- `setItems(id, dto)` — `replaceItems` + revalidate the homepage **iff** the carousel's current
  `status === PUBLISHED` (setting items on a DRAFT carousel is silent — nothing public changed).
  Deliberately does NOT require `source === MANUAL` to accept the write — item rows on a
  non-MANUAL carousel are simply inert (never read by the resolver) until an admin switches
  `source` to `MANUAL`, letting an admin stage a manual list before flipping the switch. The
  admin UI still only _shows_ the item panel when `source === MANUAL` (client-side gate, §Admin).
- `resolveProducts(carousel)` — private, implements the §Source resolution semantics table.

#### `CarouselController` (public)

- `GET /carousels` → `{ data: PublicCarouselEntity[] }` — every `PUBLISHED` carousel with its
  resolved products (§Empty-carousel behavior — empty arrays included, not filtered).

#### `AdminCarouselController` (`@UseGuards(AdminGuard)`, mirrors `AdminBannerController`)

| Method + path                          | Purpose                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `GET /admin/carousels`                 | list all statuses, optional `?status=`                               |
| `GET /admin/carousels/:id`             | single carousel                                                      |
| `POST /admin/carousels`                | create                                                               |
| `PUT /admin/carousels/:id`             | update                                                               |
| `PATCH /admin/carousels/:id/publish`   | status → PUBLISHED                                                   |
| `PATCH /admin/carousels/:id/unpublish` | status → DRAFT                                                       |
| `DELETE /admin/carousels/:id`          | hard delete (cascades `CarouselItem` rows)                           |
| `GET /admin/carousels/:id/items`       | current MANUAL items, joined product summary, ordered by `sortOrder` |
| `PUT /admin/carousels/:id/items`       | `{ items: [{ productId, sortOrder }] }` full-replace                 |

#### DTOs (`class-validator`, mirrors `banners/dto/`)

- `CreateCarouselDto extends PublishFieldsDto` — `title` (trim, `@MaxLength(255)`), `source`
  (`@IsEnum(CarouselSource)`), `categoryId` (`@ValidateIf((o) => o.source === CarouselSource.CATEGORY)
@IsUUID(4)` — required exactly when `source = CATEGORY`, absent/ignored otherwise),
  `itemLimit` (`@IsOptional @Type(Number) @IsInt @Min(1) @Max(24)`, default 12 — same 24-cap
  family as `PRODUCT_CARDS_MAX_IDS`/PopularRail/RecentlyViewed rail sizes, not literally shared
  code since this validates a different DTO), `sortOrder` (`@IsOptional @Type(Number) @IsInt
@Min(0)`, default 0).
- `UpdateCarouselDto extends PublishFieldsDto` — same fields, all `@IsOptional`.
- `SetCarouselItemDto` — `{ productId: string (@IsUUID), sortOrder: number (@IsInt @Min(0)) }`.
- `SetCarouselItemsDto` — `{ items: SetCarouselItemDto[] }` (`@IsArray @ValidateNested({ each:
true }) @Type(() => SetCarouselItemDto) @ArrayMaxSize(100)` — generous defensive cap, not a
  product-facing limit).
- `AdminCarouselListQueryDto` — `status?` (`@IsOptional @IsEnum(PublishStatus)`).

#### Entities (`apps/store-api/src/carousels/entities/`)

- `CarouselEntity` — admin flat row, mirrors `BannerEntity` field-for-field (`id`, `title`,
  `source`, `categoryId`, `itemLimit`, `sortOrder`, `status`, `publishedAt`, `scheduledAt`,
  `createdAt`, `updatedAt`). No embedded items (kept a separate read, per the two endpoints above).
- `CarouselItemEntity` — `id`, `productId`, `sortOrder`, plus a nested minimal `product: { id,
name, imageUrl, price }` summary (its own small `@ApiExtraModels`-registered class) so the
  admin item panel never needs a follow-up request per row.
- `PublicCarouselEntity` — `id`, `title`, `source`, `sortOrder`, `products: PublicProductEntity[]`
  (the resolved list; reuses the existing `PublicProductEntity` from `product/entities`, so Orval
  generates the exact same product-card shape `PopularRail`/`RecentlyViewed` already consume).

#### `CarouselsModule`

```ts
@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [CarouselController, AdminCarouselController],
  providers: [
    CarouselRepository,
    CarouselService,
    { provide: PUBLISHABLE_REPOSITORY, useExisting: CarouselRepository },
  ],
  exports: [CarouselService],
})
export class CarouselsModule {}
```

Registered in `app.module.ts` (append to `imports`); `'Carousels'` Swagger tag added in `main.ts`

- `export-swagger.ts` (mirrors the existing `'Banners'` tag line — append, one line each).

#### Seed

`prisma/seed.ts` idempotently upserts 2–3 `PUBLISHED` carousels (deterministic id keyed on a slug,
same `deterministicUuid('carousel:<slug>')` helper the banner seed already uses) — e.g. one
`BESTSELLING`, one `CATEGORY` (pointed at a seeded category), one `MANUAL` (with a handful of
`CarouselItem` rows against seeded products) — so dev/QA can see all three resolution shapes
without manual admin entry. The storefront renders correctly with ZERO carousels (§Empty-carousel
behavior generalizes to "zero carousels" trivially), so this is a convenience, not a requirement.

### API Contract

| Method | Path                             | Request Body          | Response                           |
| ------ | -------------------------------- | --------------------- | ---------------------------------- |
| GET    | `/carousels`                     | —                     | `{ data: PublicCarouselEntity[] }` |
| GET    | `/admin/carousels`               | — (query `?status=`)  | `{ data: CarouselEntity[] }`       |
| GET    | `/admin/carousels/:id`           | —                     | `{ data: CarouselEntity }`         |
| POST   | `/admin/carousels`               | `CreateCarouselDto`   | `{ data: CarouselEntity }`         |
| PUT    | `/admin/carousels/:id`           | `UpdateCarouselDto`   | `{ data: CarouselEntity }`         |
| PATCH  | `/admin/carousels/:id/publish`   | —                     | `{ data: CarouselEntity }`         |
| PATCH  | `/admin/carousels/:id/unpublish` | —                     | `{ data: CarouselEntity }`         |
| DELETE | `/admin/carousels/:id`           | —                     | 204                                |
| GET    | `/admin/carousels/:id/items`     | —                     | `{ data: CarouselItemEntity[] }`   |
| PUT    | `/admin/carousels/:id/items`     | `SetCarouselItemsDto` | `{ data: CarouselItemEntity[] }`   |

All routes need full Swagger decorators so `npm run swagger:export -w apps/store-api` +
`npm run generate:api` regenerate Orval hooks for both `store-client` and `store-admin` — no
hand-written `fetch`/`axios` anywhere except the tagged ISR helper (`carousels-server.ts`, which
mirrors `banners-server.ts`'s documented reason: the Orval Axios client cannot carry Next cache
tags).

### Frontend (Next.js — FSD)

#### store-admin

- `entities/carousel/` — re-exports the Orval carousel hooks + types (mirrors `entities/banner/`):
  `useAdminCarouselControllerFindAll/FindById/Create/Update/Publish/Unpublish/Delete`,
  `useAdminCarouselControllerGetItems/SetItems`, plus `CarouselEntity`/`CarouselItemEntity`/
  `PublicCarouselEntity`/`CreateCarouselDto`/`UpdateCarouselDto`/`SetCarouselItemsDto` types and
  the `CarouselEntitySource` generated enum.
- `features/carousel-form/` — mirrors `features/banner-form/`: `model/carousel-schema.ts` (zod,
  same string-bound-numeric-field pattern as `bannerSchema` for `itemLimit`/`sortOrder`, same
  `superRefine` SCHEDULED→scheduledAt-required rule) + `ui/carousel-form.tsx` (RHF, `forms.md`
  Rule 2b `reset` keyed to `id`). Fields: title, source select, a conditional category select
  (visible only when `source === CATEGORY`; reuses `useCategoryControllerGetAdminTree` — see
  below), item-limit number input (visible/relevant only for the four rule sources — kept
  editable-but-labelled-as-ignored for MANUAL rather than hidden, simplest and least surprising),
  sort order, publish controls (byte-for-byte the same block as `BannerForm`'s status/scheduledAt
  section). **New local helper**, NOT `product-form`'s `collectLeafCategories` (leaf-only,
  unsuitable — a `CATEGORY` carousel legitimately targets a parent category, since
  `ProductService.findAll` rolls up the subtree): a small `flattenCategoryTree(nodes, depth)` that
  keeps every node, mirroring `collectLeafCategories`'s shape minus the leaf filter.
- `features/carousel-item-picker/` — MANUAL-only panel, rendered inside `carousel-form` (or the
  edit view, gated on `id` being present — items cannot exist before the carousel itself does) when
  `source === 'MANUAL'`. Two halves: (a) a search-and-add box over
  `useProductControllerAdminFindAll({ search })` (debounced via `useDebouncedCallback`, direct
  import per `forms.md`) with an "add" button per result; (b) the current item list, mirroring
  `ProductImageManager`'s accessible move-up/move-down buttons (no DnD dependency) + a remove
  button per row, backed by one `useAdminCarouselControllerSetItems` full-replace mutation per
  reorder/add/remove (same `persistOrder`-style helper as `ProductImageManager`). Seeded from
  async "current items" data → `forms.md` Rule 2b guard applies to the local ordered-list state.
- `widgets/carousel-list/` + `widgets/carousel-form-view/` — catalog list/create/edit, mirrors
  `widgets/banner-list/`/`widgets/banner-form-view/` file-for-file (table columns: title, source
  badge, status badge, sort order, actions; publish/unpublish toggle + delete-with-confirm).
- `app/(dashboard)/carousels/` — `page.tsx` (list), `new/page.tsx`, `[id]/edit/page.tsx` (+
  `loading.tsx` each), mirrors `app/(dashboard)/banners/` route shape exactly.
- Sidebar entry in `widgets/admin-shell/admin-nav-list.tsx` (append one line: `{ label:
dict.carousels.navLabel, href: "/carousels", icon: <IconChoice> }` — deliberately reading the
  label from this plan's OWN new `carousels` namespace rather than `dict.nav`, per this wave's
  stricter dictionary discipline (the older `Banner`/`AddonService` precedent of adding a key to
  the shared `dict.nav` registry is NOT followed here); icon distinct from banners' `ImageIcon`,
  e.g. `lucide-react`'s `GalleryHorizontal` or `LayoutGrid`).
- `shared/config/dictionary.ts` — three NEW top-level namespaces appended at the end of the file:
  `carousels` (list/CRUD strings, mirrors `dict.banners`: heading/add/empty/loadError/back/
  createHeading/createSubmit/editHeading/toasts/`sourceLabels` keyed per `CarouselSource`
  value/`statusLabels`/colTitle/colSource/colStatus/colSort/deleteConfirm), `carouselForm`
  (mirrors `dict.bannerForm`: title/source/sourceOptions/category/categoryPlaceholder/itemLimit/
  itemLimitHint ("ігнорується для «Вибрані вручну»")/sortOrder/status/statusDraft/
  statusScheduled/statusPublished/scheduledAt/scheduledAtHint/submit/errors{…}), `carouselItems`
  (mirrors the `productImages` picker strings: searchPlaceholder/addLabel/removeLabel/
  moveUpAria/moveDownAria/emptyHint/toastSaved/toastSaveFailed), plus a `navLabel` key inside
  `carousels` (e.g. `"Каруселі"`) that `admin-nav-list.tsx` reads directly. **Deliberately does
  NOT touch the shared `nav` object** — unlike the older `Banner`/`AddonService` precedent (which
  did add a key to `dict.nav`), this wave's orchestration explicitly scopes this branch to its OWN
  new namespaces only in both apps' dictionaries; the sidebar label lives inside this plan's own
  `carousels` block instead.

#### store-client

- **No `entities/carousel/` layer** — mirrors the precedent that store-client has no
  `entities/banner/` either: the homepage consumes carousels through a server-only tagged fetch,
  typing off the generated model types directly (`PublicCarouselEntity` from
  `@/shared/api/generated/models`), not live Orval hooks.
- `shared/api/carousels-server.ts` — `fetchPublishedCarousels(): Promise<PublicCarouselEntity[]>`,
  byte-for-byte mirrors `banners-server.ts`'s shape: tagged `fetch('/api/carousels', { next: {
tags: ['carousels'] } })`, resilient (`catch` → `[]`, non-OK → `[]`). Exported constant
  `CAROUSELS_COLLECTION_TAG = 'carousels'` for the storefront's own reference (not required by the
  backend, which hardcodes its own `revalidateTarget`).
- `widgets/recommendation-carousels/ui/recommendation-carousels.tsx` — Server Component
  (no `"use client"`, mirrors `PromoBanner`/`HeroBanner`'s server-wrapper shape), takes
  `carousels: PublicCarouselEntity[]` as a prop, filters to `products.length > 0`, renders nothing
  when the filtered list is empty, otherwise maps each surviving carousel to a `<CarouselRail
key={carousel.id} carousel={carousel} />`.
- `widgets/recommendation-carousels/ui/carousel-rail.tsx` — `"use client"` (needs the scroll-arrow
  interactivity), structurally a de-tabbed `PopularRail`: a `<section aria-labelledby={...}>` with
  an `<h2>` reading `carousel.title` directly (admin-authored, no dictionary string needed for the
  heading itself — the one meaningful difference from `PopularRail`, which hardcodes its own
  `dict.home.popular.heading`), prev/next scroll buttons (`dict.carousels.prevAria`/`nextAria` —
  the two static strings this widget's new dictionary namespace actually needs), and the same
  snap-scroll rail of `<ProductCard product={...} action={<ProductCardActions product={...} />}
imageSizes={RAIL_IMAGE_SIZES} />` items `PopularRail`/`RecentlyViewed` already use (same
  `w-[244px] sm:w-[260px]` fixed-width slide, same `RAIL_IMAGE_SIZES` constant, copied not
  imported cross-widget per existing convention — each rail widget owns its own copy today).
- `shared/config/dictionary.ts` — ONE new top-level namespace appended at the end:
  `carousels: { prevAria: "Попередні товари", nextAria: "Наступні товари" }` (deliberately
  minimal — see above for why no heading/empty/error strings are needed: heading is admin data,
  empty means "render nothing", errors resolve to the same "render nothing" via the resilient
  fetch helper, exactly like every other banner region).
- `widgets/index.ts` — append `export { RecommendationCarousels } from
"./recommendation-carousels";` at the end of the file.
- `app/page.tsx` — the ONE hotspot edit this wave reserves for this branch:
  1. `const carousels = await fetchPublishedCarousels();` alongside the existing
     `fetchPublishedBanners()` call (both tagged fetches, both resilient, can run in the same
     `Promise.all` as the existing `[contact, seo]` pair or their own — either is fine, no
     ordering dependency between banners and carousels).
  2. Insert `<RecommendationCarousels carousels={carousels} />` immediately after `<PopularRail
/>` and before `<PromoBanner ... />` — the owner-approved default (coexist, grouped next to
     the other product-rail section rather than split across the promo/newsletter blocks). See
     §Open Questions for the one placement alternative considered.

## Tasks (internal work breakdown — one BACKLOG row, TASK-139)

### TASK-139-A: Prisma schema

**Type:** feat · **Scope:** store-api · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** —

**Acceptance Criteria:**

- [ ] `CarouselSource` enum + `Carousel` + `CarouselItem` models appended to the end of
      `schema.prisma`; `Category.carousels`/`Product.carouselItems` back-relation fields added
      (the only two non-append edits, isolated to single lines)
- [ ] `npx prisma generate` succeeds (inline dummy `DATABASE_URL` in-worktree); `npx prisma db
push` applied to the dev DB and `store_test` once on `develop` after merge (not required
      in-worktree per the no-e2e/no-live-DB constraint)
- [ ] `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma`

---

### TASK-139-B: `carousels` backend module (repository, service, both controllers, DTOs, entities)

**Type:** feat · **Scope:** store-api · **Complexity:** L (4-8h) · **TDD Required:** No (CRUD +
resolution logic; standard unit coverage required per acceptance criteria below, not formal
Red→Green→Refactor — this is content/display logic, not the cart/discount/inventory/auth class of
"critical module" per AGENTS.md) · **Depends on:** TASK-139-A

**Acceptance Criteria:**

- [ ] `CarouselRepository`/`CarouselService`/`CarouselController`/`AdminCarouselController`
      implemented per §Backend, mirroring `apps/store-api/src/banners/` for every method that has
      a direct Banner analog (create/update/publish/unpublish/delete/`publishDue`)
- [ ] `resolveProducts` implements all five §Source resolution semantics rows; unit tests cover
      each source independently (mocked `ProductService`/`CarouselRepository`): BESTSELLING/
      NEWEST/ON_SALE/CATEGORY each assert the exact `findAll` params passed through; CATEGORY with
      a null `categoryId` returns `[]` without calling `findAll`; MANUAL orders by `sortOrder`
      before calling `getCardsByIds`, and an empty item set returns `[]` without calling
      `getCardsByIds`
- [ ] `findAllPublished` (service) resolves every published carousel and includes carousels whose
      resolved product list is empty (§Empty-carousel behavior — NOT filtered server-side); a
      dedicated test asserts a carousel with zero resolved products still appears in the response
      with `products: []`
- [ ] `GET/PUT /admin/carousels/:id/items` full-replace via `replaceItems`, transactional; unit
      tests cover add/remove/reorder/clear-to-empty, and that `setItems` on a non-MANUAL carousel
      succeeds (no source guard, per §Backend's documented "inert until switched" design) while
      revalidation fires only when the target carousel is currently PUBLISHED
- [ ] `create`/`update` reject an unresolvable `categoryId` when `source = CATEGORY`
      (`NotFoundException`) before writing; DTO-level `@ValidateIf` rejects a MISSING `categoryId`
      when `source = CATEGORY` (400, caught by the global `ValidationPipe`, no service code
      reached)
- [ ] `AdminGuard` applied to every `/admin/carousels*` route; public routes have zero auth
- [ ] Swagger decorators complete on every route (full `@ApiOperation`/`@ApiResponse`/
      `@ApiExtraModels` coverage) so Orval generation succeeds; `'Carousels'` tag added to
      `main.ts` + `export-swagger.ts`
- [ ] `CarouselRepository` registered under `PUBLISHABLE_REPOSITORY`
      (`{ provide: PUBLISHABLE_REPOSITORY, useExisting: CarouselRepository }`); `publishDue` unit
      test mirrors `banners.repository.spec.ts`'s equivalent case
- [ ] `prisma/seed.ts` upserts 2–3 published carousels (one per interesting source, per §Seed) via
      the existing `deterministicUuid` idempotent-upsert pattern
- [ ] `CarouselsModule` registered in `app.module.ts`
- [ ] Unit tests: repository, service (incl. `resolveProducts` cases above), both controllers —
      mirrors `banners.repository.spec.ts`/`banners.service.spec.ts`/`banners.controller.spec.ts`
      structure
- [ ] Tests pass: `npm run test -w apps/store-api -- carousels`
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/carousels/carousels.module.ts`
- `apps/store-api/src/carousels/carousels.repository.ts` (+ `.spec.ts`)
- `apps/store-api/src/carousels/carousels.service.ts` (+ `.spec.ts`)
- `apps/store-api/src/carousels/carousels.controller.ts`
- `apps/store-api/src/carousels/admin-carousels.controller.ts`
- `apps/store-api/src/carousels/carousels.controller.spec.ts` (covers BOTH controllers, mirrors
  the single combined `banners.controller.spec.ts`)
- `apps/store-api/src/carousels/dto/*.ts`
- `apps/store-api/src/carousels/entities/*.ts`
- `apps/store-api/src/carousels/index.ts`
- `apps/store-api/src/app.module.ts` — register `CarouselsModule`
- `apps/store-api/src/main.ts`, `apps/store-api/src/export-swagger.ts` — `'Carousels'` Swagger tag
- `apps/store-api/prisma/seed.ts`

---

### TASK-139-C: API contract regeneration

**Type:** chore · **Scope:** shared · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-139-B

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` succeeds
- [ ] `npm run generate:api` regenerates Orval hooks in both `store-client` and `store-admin`
- [ ] Generated `CarouselEntity`, `CarouselItemEntity`, `PublicCarouselEntity`,
      `CarouselEntitySource` (enum), `CreateCarouselDto`, `UpdateCarouselDto`,
      `SetCarouselItemsDto` present in both apps' generated trees
- [ ] No manual edits committed inside `shared/api/generated/` in either app (gitignored, must
      exist on disk after this step — mirrors the orchestration checklist's Orval-copy step for
      when this branch's worktree starts, and this task's own regen once the new endpoints exist)

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/**` (gitignored)
- `apps/store-admin/src/shared/api/generated/**` (gitignored)

---

### TASK-139-D: store-admin — carousel CRUD + MANUAL item picker

**Type:** feat · **Scope:** store-admin · **Complexity:** L (4-8h) · **TDD Required:** No ·
**Depends on:** TASK-139-C

**Acceptance Criteria:**

- [ ] `/carousels` list + `/new` + `/[id]/edit` (+ `loading.tsx` each), mirrors
      `app/(dashboard)/banners/` route shape and `widgets/banner-list`/`widgets/banner-form-view`
      structure; sidebar entry added (own icon, distinct from banners')
- [ ] `carousel-form` renders: title, source select (all 5 `CarouselSource` values, UA labels),
      conditional category select (visible only when `source === CATEGORY`, backed by
      `useCategoryControllerGetAdminTree` + the new all-nodes `flattenCategoryTree` helper —
      NOT the leaf-only `collectLeafCategories`), item-limit number input, sort order, publish
      controls (status/scheduledAt, same conditional-required-when-SCHEDULED rule as
      `bannerSchema`)
- [ ] `carousel-item-picker` renders ONLY when `source === 'MANUAL'` AND the carousel already has
      an `id` (edit mode — items cannot exist before the carousel does); search-and-add via
      `useProductControllerAdminFindAll({ search })` (debounced), current-item list with
      accessible move-up/move-down + remove, one `useAdminCarouselControllerSetItems` mutation per
      change (mirrors `ProductImageManager`'s `persistOrder` shape)
- [ ] `forms.md` Rule 2b guards applied: `carousel-form`'s `reset` keyed to `id` (not bare
      `defaultValues`); the item picker's local ordered-list state re-seeds only on navigating to
      a different carousel id, not on every background refetch
- [ ] New `dict.carousels` (incl. its own `navLabel` key) / `dict.carouselForm` /
      `dict.carouselItems` namespaces appended at the end of `dictionary.ts`, all UA; the shared
      `dict.nav` object is NOT touched — `admin-nav-list.tsx` reads `dict.carousels.navLabel`
- [ ] RTL specs: `carousel-form` (schema validation incl. the CATEGORY-requires-categoryId rule,
      conditional item-limit/category field visibility per source), `carousel-item-picker`
      (search/add/remove/reorder each call the right mutation with the right payload),
      `carousel-list` (table render, publish/unpublish toggle, delete-with-confirm — mirrors
      `admin-banner-table.test.tsx`)
- [ ] `npm run test -w apps/store-admin` green
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/entities/carousel/`
- `apps/store-admin/src/features/carousel-form/`
- `apps/store-admin/src/features/carousel-item-picker/`
- `apps/store-admin/src/widgets/carousel-list/`, `widgets/carousel-form-view/`
- `apps/store-admin/src/widgets/index.ts` — append the two new widget exports
- `apps/store-admin/src/app/(dashboard)/carousels/{page.tsx,loading.tsx,new/{page.tsx,loading.tsx},[id]/edit/{page.tsx,loading.tsx}}`
- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` — append sidebar entry
- `apps/store-admin/src/shared/config/dictionary.ts`

---

### TASK-139-E: store-client — homepage wiring

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-4h) · **TDD Required:** No (RTL
component tests required) · **Depends on:** TASK-139-C

**Acceptance Criteria:**

- [ ] `shared/api/carousels-server.ts` — resilient tagged fetch per §Frontend; unit-tested for the
      three outcomes (ok-with-data, non-OK, throw) all resolving without throwing
- [ ] `widgets/recommendation-carousels/` — server wrapper + `"use client"` `CarouselRail`, per
      §Frontend; renders nothing when the filtered (`products.length > 0`) carousel list is empty;
      renders one section per surviving carousel using `carousel.title` directly as the heading
- [ ] `app/page.tsx` — `fetchPublishedCarousels()` call added, `<RecommendationCarousels
carousels={carousels} />` inserted immediately after `<PopularRail />` and before
      `<PromoBanner ... />` (the ONLY edit to this file across the whole wave, per hotspot
      ownership)
- [ ] New minimal `dict.carousels` namespace (`prevAria`/`nextAria` only) appended at the end of
      `dictionary.ts`
- [ ] `widgets/index.ts` — append `export { RecommendationCarousels } from
"./recommendation-carousels";`
- [ ] RTL specs for `CarouselRail` (renders products, scroll buttons work, no crash on a
      single-item carousel) and `RecommendationCarousels` (empty-carousels-array → renders
      nothing; mixed empty/non-empty carousels → only non-empty ones render)
- [ ] `npm run test -w apps/store-client` green (verify with `--runInBand` if parallel-flaky, per
      memory note `store-client-jest-parallel-flake`)
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/shared/api/carousels-server.ts` (+ test)
- `apps/store-client/src/widgets/recommendation-carousels/ui/recommendation-carousels.tsx`
- `apps/store-client/src/widgets/recommendation-carousels/ui/carousel-rail.tsx` (+ test)
- `apps/store-client/src/widgets/recommendation-carousels/index.ts`
- `apps/store-client/src/widgets/index.ts`
- `apps/store-client/src/app/page.tsx`
- `apps/store-client/src/shared/config/dictionary.ts`

---

### TASK-139-F: manual QA / smoke pass

**Type:** test · **Scope:** shared · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-139-D, TASK-139-E

**Acceptance Criteria:**

- [ ] On a running stack: admin creates a `BESTSELLING` carousel, publishes it, sees it appear on
      the homepage below the existing "Популярне" rail; admin creates a `CATEGORY` carousel
      pointed at a parent category with only subcategory products, confirms the subtree rollup
      shows those products; admin creates a `MANUAL` carousel, adds 3 products via search,
      reorders them with the move buttons, publishes, confirms the homepage order matches; admin
      deactivates one MANUAL-carousel product from the product list, confirms it silently
      disappears from the carousel without breaking the section; admin unpublishes a carousel,
      confirms it disappears from the homepage on next load (revalidation); a carousel with a
      CATEGORY pointing at a category that currently has zero products confirms the section is
      simply absent (no broken empty box)
- [ ] Result appended to `docs/manual-qa-pending.md` as a `### TASK-139` block

**Files to create/modify:**

- `docs/manual-qa-pending.md` — append-only `### TASK-139` block

## Migration Steps

1. TASK-139-A — schema.
2. TASK-139-B — backend module (repository/service/controllers/DTOs/entities/seed).
3. TASK-139-C — Orval regeneration.
4. TASK-139-D ∥ TASK-139-E — admin CRUD/picker and storefront wiring are independent of each
   other (both only depend on TASK-139-C), can be done in either order or in parallel within the
   same worktree session.
5. TASK-139-F — manual smoke pass.
6. **This branch's merge-adapter step** (§Merge-adapter responsibility) — `git merge develop`
   inside the worktree, resolve `schema.prisma`/`dictionary.ts` conflicts, re-run in-worktree
   gates, THEN signal the orchestrator for the final `--no-ff` merge.
7. Full gates on `develop` after merge (orchestrator, not this worktree): `npx prisma db push` on
   the dev DB and `store_test`; `npm run swagger:export -w apps/store-api` →
   `npm run generate:api` (real `.env`, no dummy needed); typecheck/lint/build all workspaces;
   store-api unit + e2e (`--runInBand`) + `test:int` against `store_test`; store-client/
   store-admin unit tests; Playwright against `store_test`.

## Test / Gate Strategy (worktree-scoped)

Per the orchestration's implementation-context constraints for this wave, applied literally inside
`feature/139-recommendation-carousels`'s worktree, BEFORE the merge-adapter step:

1. `npm install` (NOT `npm ci` — the worktree's lockfile state isn't suitable for a clean install)
   at the worktree root, then `npx prisma generate` with an inline dummy `DATABASE_URL`.
2. Copy `shared/api/generated/**` from the main tree into the worktree for BOTH `store-client` AND
   `store-admin` before any frontend typecheck/build/test — the directory is gitignored and absent
   in a fresh worktree (needed both at worktree setup time and again after TASK-139-C's own regen).
3. `.env*` files are absent (gitignored); any command needing env (`prisma generate`,
   `swagger:export`) uses inline dummies (`DATABASE_URL`, `NODE_ENV`, `JWT_SECRET`/
   `JWT_REFRESH_SECRET`, secrets ≥32 characters — the minimum env-validation requirement).
4. **No e2e / integration / Playwright runs in the worktree** — only unit tests + lint + typecheck
   - build of the three affected workspaces (`store-api`, `store-client`, `store-admin`). Full
     gates run on `develop` after merge (§Migration Steps step 7, the orchestrator's job, using the
     main tree's real `.env` — no dummies needed there).
5. Gates run **synchronously**, one Bash call per workspace/step — never `run_in_background` (a
   backgrounded gate run dies with the agent session and leaves no usable report).
6. Jest flakes under parallel workers on this machine (memory notes
   `store-client-jest-parallel-flake` / `e2e-throttler-shared-redis`): a RED full run must be
   re-confirmed with `--runInBand` before being treated as a real failure.
7. Conventional commits `type(scope): …`. `BACKLOG.md` is never touched by this branch. Append-only
   protocol, followed literally by every TASK-139-\* subtask above: `docs/manual-qa-pending.md`
   gets its `### TASK-139` block at the very END of the file (TASK-139-F); both `dictionary.ts`
   files' new keys go at the END of their OWN new namespace blocks (TASK-139-D/E — never inside an
   existing/foreign block, see §Frontend above); both `widgets/index.ts` files are append-only
   (TASK-139-D/E); `schema.prisma`'s new models are appended at the END of the file (TASK-139-A).

## Risks & Mitigations

| Risk                                                                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.prisma` append-conflict with the parallel TASK-168 branch (both append at the same end-of-file location)                                                                             | Flagged explicitly in §Merge-adapter responsibility as an EXPECTED conflict, not a surprise — resolve keep-both, never interleave                                                                                                                                               |
| An admin creates a `CATEGORY` carousel, then the category is later deleted — `categoryId` goes `SetNull`, the carousel silently starts resolving to `[]` with no obvious admin-facing signal | Acceptable per owner's "rules + manual pick" scope (no explicit ask for a "broken carousel" admin warning); §Empty-carousel behavior already makes this fail SAFE (hidden section, not a crash); a future admin-guide/content-map follow-up could surface it, out of scope here |
| Switching a carousel's `source` away from `MANUAL` and back does not clear stale `CarouselItem` rows — an admin could be surprised their old picks reappear                                  | Deliberate design choice (§Backend), explicitly documented in the model's TSDoc and in `carouselForm`'s item-limit hint copy; the item picker always shows the CURRENT live rows when reopened, so nothing is hidden from the admin                                             |
| `itemLimit` max of 24 is a judgment call, not a hard requirement from the owner decision                                                                                                     | Matches the existing rail-size family (`PRODUCT_CARDS_MAX_IDS`, PopularRail/RecentlyViewed defaults of 12); trivially raisable later via a DTO constant change, no schema impact                                                                                                |
| MANUAL carousels bypass `itemLimit` entirely — an admin could add an unbounded number of items, making one carousel's rail very long                                                         | `SetCarouselItemsDto`'s `@ArrayMaxSize(100)` is a defensive DB-sanity cap, not a UX cap; if this proves a real problem, a UI-level soft warning is a contained follow-up, not a blocker here                                                                                    |

## Notes

- A live visual preview in `carousel-form` (the kind TASK-265 added to `banner-form`) is a
  natural, non-blocking future enhancement — not built here because it was not requested and the
  admin-facing value is lower for a product rail (whose content is either "the actual catalog,
  live" for rule sources, or directly visible via the item picker's current-selection list for
  MANUAL) than it was for banners' free-form marketing copy.
- `Carousel`/`CarouselItem` intentionally do NOT snapshot product name/price/image the way, say,
  `OrderItemAddon` does (plan 150) — a carousel is a live merchandising surface, not a receipt;
  showing stale data would be a bug here, not a feature.
- This plan deliberately reuses `ProductService.findAll`/`getCardsByIds` wholesale rather than
  adding a parallel query surface — any future change to bestseller ranking, on-sale definition,
  or category-subtree rollup semantics automatically propagates to carousels with zero code
  changes here.

## Open Questions

- **Homepage placement alternative (non-blocking).** The owner's pre-approved default is
  "coexist below `PopularRail`" and this plan follows it, placing `RecommendationCarousels`
  immediately after `PopularRail`. An alternative worth a quick owner glance once this ships:
  since `PopularRail`'s three tabs (Хіти/Новинки/Акційні) are now fully expressible as three
  individual admin `Carousel` rows (`BESTSELLING`/`NEWEST`/`ON_SALE`), the owner could eventually
  retire the hardcoded `PopularRail` component entirely in favor of admin-managed carousels for
  those same three sections — full admin control over titles/ordering/scheduling, at the cost of
  losing the tabbed (single-section, 3-way-switchable) UI in favor of three separate stacked
  rails. Not proposed as a change here; flagged for a future decision once the owner has used the
  admin carousel UI and can judge whether the tabbed UX is worth keeping hardcoded.
