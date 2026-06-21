# Plan 041 — Product Images (Backend + Frontend)

**Roadmap Phase:** Phase 4 (Admin Panel) + Phase 5 (Polish) — cross-cutting feature that
touches the API, admin panel, and storefront.

**Parent Task:** TASK-073

**Created:** 2026-06-21

**Status:** Implemented — all sub-tasks (A–M) complete; typecheck, unit (338) and e2e (181) green.

---

## 1. User Stories

**Admin:**
As a store admin, I want to upload, reorder, and delete product images so that shoppers see
real photos instead of gradient placeholders.

**Shopper:**
As a shopper, I want to see a product's photos on the listing and detail pages so that I
can assess the product before buying.

---

## 2. Scope and Key Decisions

### 2.1 Iteration 1 constraint — local-disk storage only

Files are stored on the NestJS server's local filesystem (`uploads/products/` inside the
`apps/store-api/` working directory, or an absolute path from env). NestJS serves them
as static assets via `@nestjs/serve-static` at the path `/uploads/<file>`. The public URL
takes the form `http://localhost:3001/uploads/products/<uuid>.<ext>`.

The implementation is designed for a future storage-abstraction migration (TASK-074):

- A thin `StorageService` interface owns `save(buffer, ext): Promise<string>` and
  `delete(relativePath): Promise<void>`. Iteration 1 ships `LocalDiskStorageService`
  that implements it. Swapping to S3 / Cloudinary later means writing one new class
  and changing the DI binding — no controller or service changes.

`.gitignore` must exclude `apps/store-api/uploads/` to prevent binary files from
reaching the repository.

### 2.2 Prisma schema — `isPrimary` addition

The existing `ProductImage` model (already in `schema.prisma`) lacks an `isPrimary` flag
and a compound index on `(productId, sortOrder)`. A migration will add:

- `isPrimary  Boolean  @default(false)  @map("is_primary")`
- `@@index([productId, sortOrder])` (replaces the existing `@@index([productId])`)

Variant-level images are **deferred**. Iteration 1 attaches images only at the product
level. The `ProductVariant` model is not touched. The rationale: variant images require
a separate upload surface in admin and a variant-aware gallery on the PDP; this doubles
the scope. A product's variant colour can be represented via the colour dot (TASK-077)
without an image per variant. Variant images can be added in a follow-up plan that
piggybacks on the storage abstraction built here.

### 2.3 Image URL shape

Public URL: `GET /uploads/products/<uuid>.<ext>`

This path is served outside the `/api` prefix via `ServeStaticModule` pointing to the
`uploads/` directory. The env var `UPLOAD_DEST` (default: `./uploads`) controls the root
on disk. `PUBLIC_BASE_URL` (default: `http://localhost:3001`) is used to construct the
absolute URL stored in `ProductImage.url` at upload time.

Both vars are `@IsOptional()` in `env.validation.ts` — they are not secrets and the
defaults work for local development without any `.env` changes.

### 2.4 API surface (new admin endpoints)

```
POST   /api/products/:id/images          — upload one or more images (multipart/form-data)
PATCH  /api/products/:id/images/reorder  — update sortOrder + isPrimary for all images
DELETE /api/products/:id/images/:imageId — delete one image (disk + DB)
```

All three are admin-only (AdminGuard). The existing public endpoints `GET /api/products`
and `GET /api/products/:slug` are updated to include image data (primary image on list,
full gallery on detail — already partially wired but currently always returns `[]`).

### 2.5 List endpoint primary image inclusion

`ProductRepository.findAll` currently returns flat `Product` rows with no image join.
It will be updated to include the single primary image (`isPrimary: true`, else first by
`sortOrder`) per product. A single lateral join / separate query per page (not N+1) is
used to keep the query efficient. This unblocks `ProductCard` image rendering.

### 2.6 Cache invalidation

Any image mutation (upload, reorder, delete) must evict:

- `product:detail:slug:<slug>` and `product:detail:id:<id>` (via `evictProductDetail`)
- `product:list:*` prefix (via `delByPrefix(PRODUCT_LIST_PREFIX)`)

This follows the exact same pattern used in `ProductService` today.

### 2.7 Frontend: iteration 1 image display

`next/image` with a remote host configured is deferred to TASK-074. Iteration 1:

- `ProductImageGallery` (PDP) already renders `<img>` tags with an `onError` fallback —
  it works as-is once the API returns real URLs.
- `ProductCard` (list) will be updated to render a primary image using `<img>` with
  `onError` fall-through to `ProductThumb`. The existing gradient placeholder is promoted
  to a genuine fallback rather than the only option.

The `/* eslint-disable-next-line @next/next/no-img-element */` comment convention
(already used in `ProductImageGallery`) will be applied and note that `next/image` is
deferred to TASK-074.

### 2.8 File security rules

- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Max file size: 5 MB per file
- Max files per upload request: 10
- Filename on disk: `<uuid-v4>.<original-extension>` — no user-supplied name is ever
  written to disk; prevents path traversal and collisions.
- Extension derived from detected MIME type (not the client-supplied Content-Type), using
  a small lookup table. Multer `fileFilter` rejects unsupported types before any write.

---

## 3. Architecture

### 3.1 Backend module structure additions

```
apps/store-api/src/
  product/
    product-image.controller.ts   — NEW: upload, reorder, delete endpoints
    product-image.service.ts      — NEW: business logic for image management
    product-image.repository.ts   — NEW: Prisma queries for ProductImage
    dto/
      upload-images.dto.ts        — NEW: multipart metadata (alt text array, etc.)
      reorder-images.dto.ts       — NEW: [{id, sortOrder, isPrimary}]
    entities/
      product-image.entity.ts     — UPDATED: add isPrimary field
  storage/
    storage.service.interface.ts  — NEW: StorageService interface
    local-disk-storage.service.ts — NEW: LocalDiskStorageService implementation
    storage.module.ts             — NEW: provides + exports StorageService token
```

### 3.2 Storefront changes

```
apps/store-client/src/
  shared/
    api/generated/                — REGEN: new hooks for image fields on list + detail
  shared/ui/
    product-card.tsx              — UPDATE: render primary image or fallback to ProductThumb
  widgets/product-detail/ui/
    product-image-gallery.tsx     — UNCHANGED: already handles real images correctly
```

### 3.3 Admin changes

```
apps/store-admin/src/
  shared/api/generated/           — REGEN: new upload/reorder/delete hooks
  features/product-image-manager/ — NEW: ImageManager component (upload + grid + reorder)
  widgets/product-form-view/ui/
    edit-product-view.tsx         — UPDATE: add ImageManager below ProductForm
```

---

## 4. Sub-task Breakdown

---

### TASK-073-A: Prisma migration — add `isPrimary` to `ProductImage` + compound index

**Type:** chore (schema)
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Context:**
The `ProductImage` model exists in `schema.prisma` but lacks `isPrimary` and has only a
single-column index `@@index([productId])`. This migration adds the field and replaces
the index with a compound one.

**Acceptance Criteria:**

- [ ] `schema.prisma`: `ProductImage` gains `isPrimary  Boolean  @default(false)  @map("is_primary")`
- [ ] `schema.prisma`: existing `@@index([productId])` replaced by `@@index([productId, sortOrder])`
- [ ] Migration file generated via `npx prisma migrate dev --name add_product_image_is_primary`
- [ ] Migration applied cleanly against local dev DB (`prisma migrate status` shows all applied)
- [ ] Existing `ProductImageEntity.fromPrisma` signature NOT yet updated (done in TASK-073-B)
- [ ] `npm run test -w apps/store-api` still green (migration only — no service code changed)

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add `isPrimary` field + replace index
- `apps/store-api/prisma/migrations/<timestamp>_add_product_image_is_primary/migration.sql` — generated

---

### TASK-073-B: `StorageService` abstraction — interface + `LocalDiskStorageService`

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Context:**
Introduces the thin storage abstraction that TASK-074 will swap to a CDN provider.
`LocalDiskStorageService` writes files to `<UPLOAD_DEST>/products/` and returns a
relative path. The absolute public URL is assembled by the image service.

**Acceptance Criteria:**

- [ ] `StorageService` symbol (injection token string constant) defined
- [ ] Interface `IStorageService` with `save(buffer: Buffer, ext: string): Promise<string>` and
      `delete(relativePath: string): Promise<void>`
- [ ] `LocalDiskStorageService` implements `IStorageService`:
  - Reads `UPLOAD_DEST` from `ConfigService` (default `./uploads`)
  - Ensures `<UPLOAD_DEST>/products/` directory exists on save (mkdirSync recursive)
  - Writes file as `<uuid>.<ext>` using `fs/promises.writeFile`
  - On delete calls `fs/promises.unlink`; if file not found, logs a warning but does
    NOT throw (disk and DB can diverge on partial failure)
- [ ] `StorageModule` is a NestJS module: provides `{ provide: STORAGE_SERVICE, useClass: LocalDiskStorageService }` and exports `STORAGE_SERVICE`
- [ ] `env.validation.ts` gains `UPLOAD_DEST?: string` and `PUBLIC_BASE_URL?: string` — both `@IsOptional() @IsString()`; comments document allowed values and iteration-2 note
- [ ] `apps/store-api/uploads/` added to repo `.gitignore`
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/storage/storage.service.interface.ts` — interface + token
- `apps/store-api/src/storage/local-disk-storage.service.ts` — implementation
- `apps/store-api/src/storage/storage.module.ts` — module
- `apps/store-api/src/storage/index.ts` — barrel
- `apps/store-api/src/config/env.validation.ts` — add `UPLOAD_DEST`, `PUBLIC_BASE_URL`
- `.gitignore` (root) — add `apps/store-api/uploads/`

---

### TASK-073-C: `ProductImageRepository` + `ProductImageEntity` update

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-073-A

**Context:**
A dedicated repository owns all Prisma queries against `product_images`. The existing
`ProductImageEntity` gains `isPrimary`. The existing `ProductRepository.findAll` is
extended to join the primary image per product (no N+1: one extra query keyed by
productId set).

**Acceptance Criteria:**

- [ ] `ProductImageEntity`:
  - Gains `isPrimary: boolean` with `@ApiProperty`
  - `fromPrisma` signature updated to accept `isPrimary: boolean`
- [ ] `ProductImageRepository` methods:
  - `findByProductId(productId: string): Promise<ProductImageEntity[]>` — ordered by `sortOrder asc`
  - `findPrimaryByProductIds(productIds: string[]): Promise<Map<string, ProductImageEntity>>` —
    one query joining `isPrimary = true OR (no primary exists → first by sortOrder)` for a set of
    product IDs; returns a Map keyed by productId; used by list endpoint
  - `create(data: CreateImageInput): Promise<ProductImageEntity>` — inserts one row
  - `bulkCreate(data: CreateImageInput[]): Promise<void>` — `createMany` for multi-file upload
  - `updateMany(updates: UpdateImageInput[]): Promise<void>` — `updateMany` in a transaction
    (updates sortOrder + isPrimary for a product's full image set); enforces at-most-one
    `isPrimary = true` across the set via a guard
  - `delete(imageId: string): Promise<ProductImageEntity | null>` — returns the entity (with url)
    before deleting so the caller can remove the file from disk
  - `findById(imageId: string): Promise<ProductImageEntity | null>`
- [ ] `ProductRepository.findAll` updated to call `findPrimaryByProductIds` after the product
      page fetch and attach the primary image URL to each result
- [ ] `PaginatedProductsResult` type extended with optional `primaryImage` field
- [ ] `ProductEntity` response for list endpoint gains optional `primaryImage?: ProductImageEntity`
      with `@ApiProperty({ required: false, type: ProductImageEntity })`
- [ ] `npm run test -w apps/store-api` green

**Files to create/modify:**

- `apps/store-api/src/product/entities/product-image.entity.ts` — add `isPrimary`
- `apps/store-api/src/product/product-image.repository.ts` — new repository
- `apps/store-api/src/product/product.repository.ts` — extend `findAll` + `PaginatedProductsResult`
- `apps/store-api/src/product/entities/product.entity.ts` — add `primaryImage` optional field
- `apps/store-api/src/product/entities/index.ts` — re-export `ProductImageRepository`

---

### TASK-073-D: `ProductImageService` — business logic for image management

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes (unit tests first)
**Depends on:** TASK-073-B, TASK-073-C

**Context:**
The service orchestrates file validation, disk write, DB insert, and cache eviction.
Because it touches money-equivalent business rules (primary-image invariant, size/type
guard, ordering consistency), TDD applies.

**Acceptance Criteria:**

- [ ] Failing unit tests written first (TASK-073-D Red phase) covering:
  - Rejecting a file with a disallowed MIME type (throws `UnsupportedMediaTypeException`)
  - Rejecting a file exceeding 5 MB (throws `PayloadTooLargeException`)
  - Upload happy path: calls `StorageService.save`, `ProductImageRepository.bulkCreate`,
    evicts product cache (verifies `CacheService.del` and `CacheService.delByPrefix` called)
  - Delete happy path: calls `ProductImageRepository.delete`, then `StorageService.delete`
  - Delete: when image not found in DB throws `NotFoundException`
  - Reorder: calls `ProductImageRepository.updateMany`; if incoming set has >1 `isPrimary`
    throws `BadRequestException`
- [ ] `ProductImageService` implemented:
  - `uploadImages(productId, files: Express.Multer.File[], altTexts: string[]): Promise<ProductImageEntity[]>`
    - validates MIME + size for each file
    - assigns `sortOrder` starting from current max + 1
    - sets `isPrimary = true` on the first file if the product has no existing images
    - calls `StorageService.save` for each file
    - constructs public URL as `${PUBLIC_BASE_URL}/uploads/products/<filename>`
    - calls `ProductImageRepository.bulkCreate`
    - evicts cache (product detail + list prefix)
    - returns created entities
  - `reorderImages(productId, updates: ReorderImageInput[]): Promise<void>`
    - validates at most one `isPrimary = true` in the update set
    - delegates to `ProductImageRepository.updateMany`
    - evicts cache
  - `deleteImage(productId, imageId): Promise<void>`
    - calls `ProductImageRepository.delete(imageId)` → gets entity with url
    - verifies `entity.productId === productId` (prevents cross-product manipulation)
    - extracts relative path from URL for `StorageService.delete`
    - evicts cache
- [ ] `npm run test -w apps/store-api` green including new spec

**Files to create/modify:**

- `apps/store-api/src/product/product-image.service.ts` — new service
- `apps/store-api/src/product/product-image.service.spec.ts` — unit tests (TDD)

---

### TASK-073-E: `ProductImageController` + DTOs + `ProductModule` wiring

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (covered by e2e in TASK-073-F)
**Depends on:** TASK-073-D

**Context:**
The new admin-only image endpoints are added to the product module. Multer is
configured inline on the controller (not globally) to avoid interfering with other
routes. `@nestjs/platform-express` already ships Multer; only `multer` types package
needs to be installed as a dev dependency.

**Acceptance Criteria:**

- [ ] `UploadImagesDto`:
  - `altTexts?: string[]` — optional alt texts, one per file; `@IsOptional() @IsArray() @IsString({ each: true })`
- [ ] `ReorderImageDto` (for each item in array):
  - `id: string` — `@IsUUID()`
  - `sortOrder: number` — `@IsInt() @Min(0)`
  - `isPrimary: boolean` — `@IsBoolean()`
- [ ] `ReorderImagesDto`: wraps `items: ReorderImageDto[]` — `@ValidateNested({ each: true }) @Type(() => ReorderImageDto)`
- [ ] `ProductImageController` on path `products/:productId/images`:
  - `POST /` — `@UseGuards(AdminGuard)`, `@UseInterceptors(FilesInterceptor('files', 10, multerOptions))`; extracts `altTexts` from body via `@Body() dto: UploadImagesDto`; calls `ProductImageService.uploadImages`
  - `PATCH /reorder` — `@UseGuards(AdminGuard)`; `@Body() dto: ReorderImagesDto`; calls `ProductImageService.reorderImages`
  - `DELETE /:imageId` — `@UseGuards(AdminGuard)`; calls `ProductImageService.deleteImage`
- [ ] `multerOptions` defined in `product-image.controller.ts`:
  - `storage: multer.memoryStorage()` (buffers in memory — avoids temp files on disk)
  - `limits: { fileSize: 5 * 1024 * 1024, files: 10 }`
  - `fileFilter` rejects non-image MIME types with a `MulterError`-compatible message
- [ ] `@ApiTags('Products')`, `@ApiBearerAuth('access-token')`, `@ApiConsumes('multipart/form-data')`,
      full `@ApiResponse` decorators on every endpoint; `operationId` set explicitly
      (e.g. `productImageControllerUpload`, `productImageControllerReorder`,
      `productImageControllerDelete`)
- [ ] `ProductModule` registers `ProductImageController`, `ProductImageService`,
      `ProductImageRepository`; imports `StorageModule`
- [ ] `ServeStaticModule` added to `AppModule` imports:
  ```ts
  ServeStaticModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => [
      {
        rootPath: resolve(config.get("UPLOAD_DEST", "./uploads")),
        serveRoot: "/uploads",
        serveStaticOptions: { index: false },
      },
    ],
  });
  ```
  `@nestjs/serve-static` installed as a production dependency.
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/product/dto/upload-images.dto.ts` — new
- `apps/store-api/src/product/dto/reorder-images.dto.ts` — new
- `apps/store-api/src/product/dto/index.ts` — export new DTOs
- `apps/store-api/src/product/product-image.controller.ts` — new controller
- `apps/store-api/src/product/product.module.ts` — register new providers + StorageModule import
- `apps/store-api/src/app.module.ts` — add ServeStaticModule import
- `apps/store-api/package.json` — add `@nestjs/serve-static` prod dep; `multer` + `@types/multer` dev deps

---

### TASK-073-F: E2E tests — image upload, reorder, delete, auth guards

**Type:** test
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-073-E

**Context:**
Follows the existing e2e pattern: `@nestjs/testing` + `supertest`, repositories mocked
via `jest.mock`, no real DB required for guard/contract tests. File uploads use
`supertest`'s `.attach()` API.

**Acceptance Criteria:**

- [ ] `test/product-images.e2e-spec.ts` covers:
  - `POST /api/products/:id/images` without token → 401
  - `POST /api/products/:id/images` with customer token → 403
  - `POST /api/products/:id/images` with admin token + valid JPEG → 201 with array of `ProductImageEntity`
  - `POST /api/products/:id/images` with admin token + oversized file → 413 / 400
  - `POST /api/products/:id/images` with admin token + non-image file (e.g. `.txt`) → 400
  - `PATCH /api/products/:id/images/reorder` without token → 401
  - `PATCH /api/products/:id/images/reorder` with admin + valid body → 200
  - `PATCH /api/products/:id/images/reorder` with admin + >1 isPrimary → 400
  - `DELETE /api/products/:id/images/:imageId` without token → 401
  - `DELETE /api/products/:id/images/:imageId` with admin + existing image → 204
  - `DELETE /api/products/:id/images/:imageId` with admin + non-existent imageId → 404
- [ ] `StorageService` is mocked in e2e context (saves nothing to disk)
- [ ] All existing e2e suites still green (`npm run test:e2e -w apps/store-api`)

**Files to create/modify:**

- `apps/store-api/test/product-images.e2e-spec.ts` — new e2e spec

---

### TASK-073-G: Regenerate Orval API hooks (store-client + store-admin)

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-073-E (Swagger decorators complete)

**Context:**
Follows the standard Orval regen pattern: export swagger.json from the NestJS app
(via the `swagger:export` npm script), then run `generate:api` in both frontends.

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` succeeds and produces an updated `swagger.json`
- [ ] `npm run generate:api -w apps/store-client` completes without errors; new hooks present:
  - `useProductImageControllerUpload`
  - `useProductImageControllerReorder`
  - `useProductImageControllerDelete`
  - `ProductImageEntity` type now includes `isPrimary: boolean`
  - `ProductEntity` type now includes optional `primaryImage?: ProductImageEntity`
- [ ] `npm run generate:api -w apps/store-admin` completes without errors; same hooks generated
- [ ] No hand-edits made to any file under `**/shared/api/generated/`
- [ ] `npm run typecheck -w apps/store-client` and `npm run typecheck -w apps/store-admin` pass

**Files to create/modify:**

- `apps/store-api/swagger.json` — regenerated (not committed if `.gitignore`d; update as needed)
- `apps/store-client/src/shared/api/generated/**` — regenerated
- `apps/store-admin/src/shared/api/generated/**` — regenerated

---

### TASK-073-H: Storefront — `ProductCard` shows primary image

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-073-G

**Context:**
`ProductCard` currently always renders a gradient placeholder because the list API
returns no image data. After TASK-073-C the list response carries `primaryImage`. The
card should render the real image when present and fall back to `ProductThumb` on error
or absence.

**Acceptance Criteria:**

- [ ] `ProductCard` updated:
  - When `product.primaryImage` is defined and not failed-to-load: renders an `<img>` with
    `src={product.primaryImage.url}` and `alt={product.primaryImage.alt ?? product.name}`;
    uses `onError` handler to switch to the gradient placeholder
  - When no `primaryImage` or image failed: renders current gradient placeholder block
    (`ProductThumb`)
  - Badges (Sale, New) overlay is preserved on top of either rendering path
  - Follows `/* eslint-disable-next-line @next/next/no-img-element -- next/image deferred to TASK-074 */`
    convention already established in `ProductImageGallery`
- [ ] Existing hover, badge, and action-slot behaviour unchanged
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/shared/ui/product-card.tsx` — add conditional image/fallback rendering

---

### TASK-073-I: Storefront — `ProductImageGallery` confirmed working with real URLs

**Type:** chore / verification
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-073-G

**Context:**
`ProductImageGallery` already renders `<img>` tags with `onError` fallback and was
written in anticipation of real image data. This task is a verification pass — confirm
types align after Orval regen and add a unit test for the `altText` coercion helper.

**Acceptance Criteria:**

- [ ] TypeScript compilation of `product-image-gallery.tsx` with the new `ProductImageEntity`
      (which now includes `isPrimary`) is clean — no type errors
- [ ] `altText()` helper function has a unit test covering:
  - `image.alt` is a non-empty string → returns it
  - `image.alt` is null → returns fallback
  - `image.alt` is empty string → returns fallback
- [ ] `npm run test -w apps/store-client` green
- [ ] No changes needed to `product-image-gallery.tsx` template logic

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.test.tsx` — new unit test

---

### TASK-073-J: Admin — `ProductImageManager` feature slice

**Type:** feat
**Scope:** store-admin
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-073-G

**Context:**
A new FSD feature slice `features/product-image-manager` provides the image management
UI. It is kept as a self-contained Client Component that can be embedded in
`EditProductView`. Creating a product and then adding images is a two-step flow (create
product first to get the ID, then upload images on the edit page).

**Acceptance Criteria:**

- [ ] `features/product-image-manager/ui/ProductImageManager.tsx`:
  - Props: `productId: string`
  - Shows the current image list (fetches via `useProductControllerFindBySlug` or a
    dedicated admin images query — prefer the existing `useProductControllerFindById`
    response once `images` are included there, else a separate fetch)
  - File input (`<input type="file" multiple accept="image/*">`) or drag-drop zone
  - On file selection: calls `useProductImageControllerUpload` mutation with
    `multipart/form-data`; shows upload progress indication
  - Image grid: renders each image as a thumbnail with:
    - A "Set as primary" button (disabled if already primary)
    - A "Delete" button with confirm
    - Display of `sortOrder`
  - Drag-and-drop reorder (via HTML5 drag events or a lightweight utility — no heavy
    DnD library): on drop, calls `useProductImageControllerReorder` with the new order
  - Error and success toasts via Sonner (matching admin toast convention)
  - Loading skeleton while fetching
- [ ] `features/product-image-manager/index.ts` barrel exports `ProductImageManager`
- [ ] FSD import rules respected (feature imports only from `entities/` and `shared/`)
- [ ] `npm run typecheck -w apps/store-admin` passes
- [ ] `npm run lint -w apps/store-admin` passes

**Files to create/modify:**

- `apps/store-admin/src/features/product-image-manager/ui/ProductImageManager.tsx` — new
- `apps/store-admin/src/features/product-image-manager/index.ts` — barrel

---

### TASK-073-K: Admin — wire `ProductImageManager` into `EditProductView`

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-073-J

**Context:**
The image manager is placed below the product form in the edit page. Create-product flow
does not offer image upload (the product does not exist yet); admins create the product
first, then manage images on the edit page. This is a deliberate UX trade-off to keep
iteration 1 simple.

**Acceptance Criteria:**

- [ ] `EditProductView` imports and renders `<ProductImageManager productId={productId} />`
      below the `<ProductForm />` section, separated by a `<Separator />` and a section
      heading "Product Images"
- [ ] Section is only rendered when `product` data has loaded (not during skeleton state)
- [ ] `CreateProductView` is NOT modified (no image upload on create — documented as a
      known limitation)
- [ ] `npm run typecheck -w apps/store-admin` and `npm run lint -w apps/store-admin` pass

**Files to create/modify:**

- `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx` — add image section

---

### TASK-073-L: Seed data update — attach sample images to seeded products

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-073-A (migration applied), TASK-073-E (URL shape known)

**Context:**
Seed data currently creates products with no images. After this task, a few seeded
products will have placeholder image records pointing to publicly accessible placeholder
URLs (e.g. `https://picsum.photos/seed/<productslug>/800/800`) so the storefront looks
populated during development without needing real uploads. These URLs work for local dev
and do not require local file storage.

**Acceptance Criteria:**

- [ ] `prisma/seed.ts` updated: for the first 6 seeded products, an `upsert` or `createMany`
      (skipDuplicates) inserts `ProductImage` rows using picsum.photos URLs as `url`,
      sets `isPrimary = true` on the first image, `sortOrder` starts at 0
- [ ] Running `npm run db:seed` is idempotent (re-run does not create duplicates)
- [ ] `npm run typecheck -w apps/store-api` passes (seed.ts is not strict-typed but
      must not have obvious errors)

**Files to create/modify:**

- `apps/store-api/prisma/seed.ts` — add image seed records

---

### TASK-073-M: Verification gate — build / lint / typecheck / tests across all workspaces

**Type:** chore
**Scope:** store-api, store-client, store-admin
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-073-A through TASK-073-L

**Context:**
Final integration check. No Orval-generated files should have changed since TASK-073-G
unless a schema correction was needed. All workspace builds must be clean.

**Acceptance Criteria:**

- [ ] `npm run typecheck` (root, all workspaces) — zero errors
- [ ] `npm run lint` (root, all workspaces) — zero warnings/errors on modified files
- [ ] `npm run build -w apps/store-api` — succeeds
- [ ] `npm run build -w apps/store-client` — succeeds
- [ ] `npm run build -w apps/store-admin` — succeeds
- [ ] `npm run test -w apps/store-api` — all unit tests green (including new TASK-073-D spec)
- [ ] `npm run test -w apps/store-client` — all unit tests green (including TASK-073-I spec)
- [ ] `npm run test:e2e -w apps/store-api` — all e2e tests green (including TASK-073-F spec)
- [ ] `git diff -- "**/shared/api/generated/**"` shows only the diffs expected from TASK-073-G
      (no accidental regeneration of unrelated hooks)
- [ ] `apps/store-api/uploads/` does not appear in `git status` (confirmed in .gitignore)

---

## 5. Dependency Graph

```
TASK-073-A (Prisma migration)
    ↓
TASK-073-B (StorageService)   TASK-073-C (Repository + Entity)
           \                 /
            TASK-073-D (Service — TDD)
                    ↓
            TASK-073-E (Controller + Module + ServeStaticModule)
                    ↓
            TASK-073-F (E2E tests)
                    ↓
            TASK-073-G (Orval regen)
           /         \          \
TASK-073-H      TASK-073-I   TASK-073-J (admin image manager)
(ProductCard)   (gallery verify)    ↓
                             TASK-073-K (wire into EditProductView)

TASK-073-A → TASK-073-L (seed data — parallel with D onward)
All → TASK-073-M (verification gate)
```

Note: TASK-073-B and TASK-073-C can be developed in parallel since they have no mutual
dependency; both feed into TASK-073-D.

---

## 6. Out of Scope (deferred)

| Item                                                    | Deferred to             |
| ------------------------------------------------------- | ----------------------- |
| `next/image` with remote host config + blur placeholder | TASK-074                |
| CDN / object storage (S3, Cloudinary)                   | TASK-074                |
| Variant-level images                                    | Future follow-up plan   |
| Image upload on the Create Product page                 | Future UX improvement   |
| Image compression / resizing on upload                  | Future (TASK-074 scope) |
| Mobile filter drawer                                    | TASK-084                |
| Category tile images                                    | TASK-083                |

---

## 7. Migration Safety / Rollout Notes

- Existing products have `images: []` in the API response — this is already the
  behaviour today (the relation is populated but empty). No breaking change occurs.
- The new `primaryImage` field on `ProductEntity` is optional (`required: false` in
  Swagger); Orval generates it as `primaryImage?: ProductImageEntity`. All existing
  consumers of `ProductEntity` continue to compile because the field is additive.
- The `ProductImage.isPrimary` column defaults to `false` for all existing rows —
  no data migration required beyond the column addition.
- `ServeStaticModule` serves under `/uploads` which is outside the `/api` prefix
  (the API sets its global prefix to `api` in `main.ts`). The paths do not overlap.
- The `uploads/` directory must exist before the app starts. `LocalDiskStorageService`
  creates `uploads/products/` on the first `save()` call. For production deployments,
  ensure the directory exists and is writable; consider a startup health check.

---

## 8. Environment Variables (new — documented only; no .env file committed)

| Variable          | Default                 | Description                                                        |
| ----------------- | ----------------------- | ------------------------------------------------------------------ |
| `UPLOAD_DEST`     | `./uploads`             | Root directory for file uploads (relative to CWD or absolute)      |
| `PUBLIC_BASE_URL` | `http://localhost:3001` | Public-facing base URL of the NestJS API, used to build image URLs |

Both variables are defined in `env.validation.ts` as `@IsOptional() @IsString()` with
the defaults documented in comments. They are not secrets and do not need to be in a
`.env` file for local development.
