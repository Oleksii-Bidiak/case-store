# Plan: Variant-as-Product-Position (EPIC TASK-142)

> **Status:** Complete — all sub-tasks (A–G) shipped to `develop`
> **Phase:** Cross-phase Epic (touches Phases 2–5)
> **Created:** 2026-06-25
> **Last Updated:** 2026-06-26

## Progress (develop)

- **TASK-142-A ✅** — Schema migrated to the position model (`ProductGroup`, `ProductGroupAxis`,
  `Product.{stock,groupId,attributes,positionOrder}`; `ProductVariant` dropped; `variantId`
  removed from `CartItem`/`OrderItem`; `CartItem` unique → `[cartId, productId]`). Migration
  `20260625210000_variant_as_product_position` applied (with `CHECK (stock >= 0)` on
  `products.stock`); no data backfill (pre-MVP, per owner).
- **TASK-142-B ✅ (read path)** — `ProductEntity` gains `stock`/`attributes`/`groupId`/
  `positionOrder`; the detail endpoint returns `group` (siblings + axes) via the new
  `ProductGroupEntity`; `findBySlugWithRelations` joins the group. The standalone admin
  `ProductGroup` CRUD module is folded into the admin phase (TASK-142-F).
- **TASK-142-C ✅** — Cart and order adapted off variants: stock decremented/restocked on
  `Product.stock`; `variantId` removed across cart (repo/service/entities/DTO) and order
  (repo/service/types/entities); dashboard low-stock and mail order-confirmation de-varianted.
  All TDD specs updated. **Backend green: 394 tests, typecheck, lint, `nest build`.**
- **TASK-142-D ✅** — Orval regenerated for both frontends; spec confirms `ProductEntity` has
  `stock`/`attributes`, the detail envelope has `group`, and `AddToCartDto` has no `variantId`.
  (Generated dirs are git-ignored — regenerated per environment.)
- **TASK-142-E ✅** — Storefront moved to cross-position navigation: `ProductSiblingNavigator`
  replaces `ProductVariantSelector`/`pick-default-variant`; `ProductDetailView` reads
  price/stock/sku off the position; `variantId` dropped from ATC button + mobile bar; cart row,
  checkout summary, order list, and JSON-LD builder de-varianted. Component tests added;
  store-client typecheck/lint/tests green. (Unrelated pre-existing `/register` prerender break
  noted, out of scope.)
- **TASK-142-F ✅** — Backend `ProductGroupModule` (admin CRUD `/api/product-groups`) + write-path
  DTO fields (`stock`/`attributes`/`groupId`/`positionOrder`); admin product form gains those
  fields (key-value attributes editor, group selector); new `/admin/product-groups` list +
  create/edit pages + sidebar nav; dashboard low-stock & order-detail de-varianted. Backend 394
  tests green; admin typecheck/lint/test/build clean.
- **TASK-142-G ✅** — Seed rewritten to positions + groups (13 groups / 32 positions incl. 2
  standalone + 1 out-of-stock; idempotent via deterministic group ids). Sitemap already emits one
  URL per active position (no change); per-position JSON-LD shipped in E. No final drop migration
  needed — `product_variants` and the `variantId` columns were dropped in migration A.
- **Status: complete.** All sub-tasks shipped to `develop`.

---

## Origin and Owner Decision

The product owner reviewed the current product-with-variants model and decided to move to a
**"variant-as-separate-product-position"** model, exactly as used by ktc.ua and Rozetka.

Owner's exact requirement:

> Each buyable variant must be its OWN catalog position with its OWN slug, its OWN card in the
> grid, and its OWN PDP. Example: "Tempered Glass Screen Protector for iPhone 15" has two
> variants → there must be TWO positions, TWO cards (a "Double Pack" card and a "Single Pack"
> card), and TWO slugs: `tempered-glass-screen-protector-for-iphone-15-double-pack` and
> `...-single-pack`. Switching an attribute (e.g. color Blue→Indigo, or pack Single→Double) must
> navigate to the sibling position's slug/URL (the page/position changes), exactly like ktc.ua
> does for the MacBook example (`noutbuk_apple_macbook_neo_256gb_blush` → `...indigo`).

This supersedes the earlier "middle path" and is explicitly bigger than the TASK-126
default-variant fix (already shipped). This is an **EPIC** that must be delivered in phases via
feature branches, not one large commit.

---

## Overview

Transform the data model from `Product` (parent) + `ProductVariant` (children) into
**product positions**: each buyable unit is a first-class, independently-addressable `Product`
row with its own slug, SKU, price, stock, and images. Sibling positions (e.g. "Single Pack" and
"Double Pack" of the same item) are linked through a new `ProductGroup` entity so the PDP can
render attribute-axis selectors that navigate between sibling slugs.

This change touches: Prisma schema, all product repositories and services, the catalog list/detail
API contract (Orval regen), storefront product grid and PDP, cart and order modules (TDD), admin
product management, SEO sitemap and JSON-LD, and the seed.

---

## Scope

### In Scope

- New Prisma models: `ProductGroup`, `ProductGroupAxis`; modified `Product` (add `groupId`,
  `attributes Json`, remove variants relation); drop `ProductVariant` table.
- Data migration: backfill every `(Product, ProductVariant)` pair into per-position `Product` rows
  with deterministic slugs; create `ProductGroup` rows; remap `CartItem` and `OrderItem` FKs.
- Catalog API: list returns one card per position; detail response includes sibling group data for
  attribute-axis navigation.
- Orval regeneration after every API contract change.
- Storefront: product grid (one card per position, no grouping), PDP attribute selectors navigate
  to sibling slug (no in-page variant switch), breadcrumb includes group name.
- Cart / Order: `variantId` dropped as a required key; positions are addressed by `productId` only.
  All cart and order inventory logic repointed to position-level `Product.stock`.
- Admin: product management creates/edits positions and group links.
- SEO: per-position sitemap, JSON-LD with group context, canonical URL per position.
- Seed: rewrite to create positions + groups; enough data for pagination and QA.

### Out of Scope

- Payment integration (TASK-034, parked).
- Full-text search (TASK-075, parked).
- Wishlist (TASK-076, parked).
- Real-time stock reservation (beyond the existing `CHECK (stock >= 0)` guard).
- Rollback of TASK-126 cheapest-variant default (shipped, largely moot after this epic; do not
  revert).

---

## Coordination / Supersession Notes

- **TASK-126** (PDP cheapest-variant default — shipped as fix): the in-page variant selector it
  fixes is replaced by cross-position navigation. Do NOT revert TASK-126; its code will be removed
  naturally when `ProductVariantSelector` is replaced by the sibling-navigation component. Mark
  TASK-126 note in BACKLOG as "superseded by TASK-142."
- **TASK-128** (seed overhaul — not yet started): must be rewritten to create positions + groups
  under the new model. TASK-142-A (schema) is a hard prerequisite. Mark TASK-128 in BACKLOG as
  "depends on / reshaped by TASK-142."
- **TASK-104** (soft-delete tombstone): the `deletedAt` + slug-mangle convention carries over
  unchanged to the new per-position `Product` rows. No `ProductVariant` soft-delete logic existed;
  nothing to remove.
- **TASK-077** (variant dots + quick-add, open): becomes "position dots + quick-navigate" under the
  new model; implementation should wait for TASK-142 to complete.

---

## Design Question Resolutions

### 1. Schema Strategy — Recommendation: Option A (promote to Product rows)

**Chosen: Option A** — promote each variant to its own `Product` row; add `ProductGroup` +
`ProductGroupAxis`; drop `ProductVariant` table.

**Justification:** Option A makes the catalog grid, SEO, and all routing trivially correct because
every position IS a `Product`. Option B (keep `ProductVariant` with per-variant slug/catalog
presence) requires duplicating most of the Product row's attributes (slug, images, price, isActive,
deletedAt) onto the variant table, effectively creating two canonical product representations that
must stay in sync — the complexity cost is nearly identical with none of the architectural
clarity. Option A also means `CartItem`, `OrderItem`, and the cache layer need no `variantId`
concept at all, simplifying every downstream module.

**Trade-offs acknowledged:**

- Data migration is the highest-risk step (see section below).
- Admin UX must shift from "one form with inline variants" to "position form + group form"; this is
  more clicks for the admin but reflects the correct mental model.
- Catalog grows proportionally to variant count; near-duplicate cards are an intended consequence
  of the owner's explicit requirement.

### 2. Attribute Axes and Sibling Navigation

Each `ProductGroup` holds an ordered list of axis names (e.g. `["color", "pack"]`) stored in
`ProductGroupAxis` rows. Each position carries an `attributes Json` field
(e.g. `{"color": "blue", "pack": "single"}`).

The detail API response includes a `group` object:

```typescript
group: {
  id: string;
  name: string;
  axes: string[];           // ordered axis names, e.g. ["color", "pack"]
  siblings: Array<{
    id: string;
    slug: string;
    name: string;
    attributes: Record<string, string>;
    isActive: boolean;
    price: string;
  }>;
}
```

The storefront PDP uses this to render one selector strip per axis. Clicking a value resolves the
sibling whose `attributes` map matches the current position's attributes for all other axes but
differs on the selected axis — then navigates to that sibling's `/products/{slug}`. This mirrors
the ktc.ua MacBook blush→indigo navigation exactly.

### 3. Catalog Granularity

The grid shows EVERY position as its own card. This is the owner's explicit requirement and is
honoured without compromise. The UX consequence (more cards, near-duplicate entries for "iPhone 15
Black 64GB" and "iPhone 15 Black 128GB") is a known trade-off that the owner has accepted; it
matches the Rozetka/ktc.ua pattern. No grouping or badging in the grid is needed at this stage
(TASK-088 bestseller badge is already parked; a future "group badge" would be a separate task).

### 4. Data Migration — Critical Risk Analysis

**Migration order (TASK-142-A):**

1. **Add** `product_groups` table + `product_group_axes` table + add nullable columns to
   `products` (`group_id`, `attributes`, `stock Int default 0`, `position_order Int default 0`).
   Apply with `prisma migrate dev`.
2. **Backfill** (TypeScript script in `prisma/migrations/NNN_backfill_positions/backfill.ts`):
   a. For each existing `Product` row that has `ProductVariant` children, create a
   `ProductGroup` row (name = `product.name`).
   b. For each `ProductVariant` child, create a new `Product` row:
   - `name` = variant.name (e.g. "Tempered Glass — Double Pack")
   - `slug` = `{product.slug}-{slugified(variant.name)}` — verified unique, suffix
     `-2`/`-3` appended on collision
   - `sku` = variant.sku (may be null)
   - `price` = variant.price
   - `compareAtPrice` = product.compareAtPrice (inherited from parent)
   - `stock` = variant.stock
   - `attributes` = variant.attributes Json
   - `categoryId` = product.categoryId
   - `isActive` = product.isActive AND variant.isActive
   - `deletedAt` = null (variant rows were never individually soft-deleted)
   - `groupId` = the new `ProductGroup.id`
   - Copy `ProductImage` rows from the parent product to each position (shared images;
     positions without unique images start with the same gallery).
     c. For `Product` rows with NO `ProductVariant` children, create a `ProductGroup` with a
     single member (the product itself); set `product.groupId`, `product.stock` (from 0,
     no variant stock existed), `product.attributes = {}`.
3. **Remap `CartItem` rows**: For each `CartItem(productId, variantId)` where `variantId IS NOT NULL`,
   find the new position `Product` row created from that variant in step 2b and set
   `CartItem.productId = newPositionId`, `CartItem.variantId = NULL`.
   Items where `variantId IS NULL` are left as-is (their parent product became a single-member group
   in step 2c with the same id — FK still valid).
4. **Remap `OrderItem` rows**: Same FK update as CartItem. `OrderItem.price` is an immutable
   snapshot — do NOT recalculate. `OrderItem.variantId` is set to NULL after the FK is
   re-pointed to the new position Product. The product name in order history resolves correctly
   because the new position Product row has the variant's name (step 2b). Historical order display
   is preserved.
5. **Drop** `product_variants` table (after FK remapping).
6. **Remove** nullable `variantId` columns from `CartItem` and `OrderItem` (make them dropped or
   keep nullable for one release cycle as a safety net — see reversibility note).
7. **Create** `ProductGroupAxis` rows from the `attributes` keys collected during step 2b.

**Historical OrderItem preservation:** OrderItem rows reference `productId`. After step 2b the new
position `Product` row exists with the variant's name and price — so `OrderItem.product.name`
and `OrderItem.price` already form a correct snapshot. The `product.deletedAt` tombstone design
(TASK-104) means even if a position is later soft-deleted, `OrderItem.product.name` still
resolves (the tombstone row is kept). No data is lost.

**Reversibility:** Run the backfill in a transaction. Keep the old `product_variants` table
alive (renamed to `product_variants_bak`) for one release cycle before dropping it. The
`variantId` columns in CartItem/OrderItem should be made nullable (not dropped) in the first
migration and dropped only in a follow-up migration after the backfill is confirmed correct.

**Stock integrity:** The `CHECK (stock >= 0)` added in migration 20260612120000 is on the
`product_variants` table. After migration, add the same CHECK on the new `stock` column in
`products`. The TASK-123/124 restock guard in `OrderService` / `OrderRepository` must be
repointed from `productVariant.updateMany` to `product.updateMany` on the position row.

### 5. Cart and Order Code Impact

With positions, every item in the cart is addressed by `productId` alone (no `variantId`).

**Decisions:**

- `CartItem.variantId` is dropped (migration step 6 above; nullable in the transition period).
- `OrderItem.variantId` is similarly dropped.
- `CartItem.@@unique([cartId, productId, variantId])` constraint changes to
  `@@unique([cartId, productId])`.
- `CartRepository.addItem`, `CartService.addToCart`, `CartService.mergeGuestCart`: remove all
  `variantId` references; stock is now checked on `Product.stock` (not `ProductVariant.stock`).
- `OrderRepository.createFromCart`: stock decrement changes from
  `productVariant.updateMany({ where: { id: variantId, stock: { gte: qty } } })`
  to `product.updateMany({ where: { id: productId, stock: { gte: qty } } })`.
- `OrderService.cancelOrder` / `cancelAndRestock` (TASK-124): restock logic changes from
  `productVariant.update` to `product.update` on the position row.
- All these changes require TDD (Red → Green → Refactor) before the service code is touched.

### 6. Admin Impact

Admin product management shifts from "one form managing a parent product + inline variant rows"
to two separate concerns:

- **Position form**: create/edit a single position (name, slug, price, compareAtPrice, sku, stock,
  attributes, isActive, images, categoryId, groupId).
- **Group management page**: create a group (name, axes), assign/reorder positions within a group,
  view sibling positions.

Image upload (TASK-073 already shipped) operates per-position; no structural change to the upload
endpoint, only the admin UI form that calls it.

### 7. SEO Impact

- Sitemap: one `<url>` entry per active position (not per group). The existing sitemap generator
  queries `Product.findMany({ isActive: true, deletedAt: null })` — after migration this
  automatically returns positions (no code change needed once the schema migration is complete,
  but the per-page `lastmod` and `changefreq` should be reviewed).
- JSON-LD: each position PDP gets its own `Product` JSON-LD block with its own name, price, sku,
  and availability. The group context (sibling slugs) is not required in JSON-LD per Schema.org
  but may be added as `isRelatedTo` or `isSimilarTo` (out of scope for initial delivery).
- `canonical` and `og:url`: point to the position's own slug. No cross-position canonical needed.

### 8. Rollout / Phasing

The epic is delivered in 7 sub-tasks (TASK-142-A through TASK-142-G). Each sub-task can be merged
to `develop` independently as a feature branch once its acceptance criteria are green.

---

## Technical Design

### Data Model — New Schema

```prisma
// New: groups sibling positions (e.g. "Tempered Glass for iPhone 15")
model ProductGroup {
  id        String   @id @default(uuid())
  name      String
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  positions ProductPosition[] // alias: Product rows with groupId = this.id
  axes      ProductGroupAxis[]

  @@map("product_groups")
}

// New: ordered attribute axis names for a group (e.g. "color", "pack")
model ProductGroupAxis {
  id        String       @id @default(uuid())
  groupId   String       @map("group_id")
  group     ProductGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  name      String       // e.g. "color", "pack", "storage"
  sortOrder Int          @default(0) @map("sort_order")

  @@index([groupId])
  @@map("product_group_axes")
}

// Modified Product — now a "position" (one row per buyable unit)
model Product {
  id             String        @id @default(uuid())
  name           String
  slug           String        @unique
  description    String?
  price          Decimal       @db.Decimal(10, 2)
  compareAtPrice Decimal?      @map("compare_at_price") @db.Decimal(10, 2)
  sku            String?       @unique
  stock          Int           @default(0) // DB CHECK (stock >= 0) — same guard as former variant
  categoryId     String        @map("category_id")
  category       Category      @relation(fields: [categoryId], references: [id])
  // Group membership (nullable: a standalone position has no group)
  groupId        String?       @map("group_id")
  group          ProductGroup? @relation(fields: [groupId], references: [id])
  // Structured attribute values for this position within its group
  // e.g. {"color": "blue", "pack": "single"}
  attributes     Json?         @default("{}")
  positionOrder  Int           @default(0) @map("position_order")
  isActive       Boolean       @default(true) @map("is_active")
  deletedAt      DateTime?     @map("deleted_at")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  images         ProductImage[]
  reviews        Review[]
  orderItems     OrderItem[]
  cartItems      CartItem[]

  @@index([slug])
  @@index([categoryId])
  @@index([isActive])
  @@index([deletedAt])
  @@index([groupId])
  @@map("products")
}

// Removed: ProductVariant table (dropped in TASK-142-A migration)

// Modified: CartItem — variantId dropped; unique on (cartId, productId) only
model CartItem {
  id        String   @id @default(uuid())
  cartId    String   @map("cart_id")
  cart      Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([cartId, productId])
  @@index([cartId])
  @@map("cart_items")
}

// Modified: OrderItem — variantId dropped
model OrderItem {
  id        String   @id @default(uuid())
  orderId   String   @map("order_id")
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int
  price     Decimal  @db.Decimal(10, 2)
  createdAt DateTime @default(now()) @map("created_at")

  @@index([orderId])
  @@map("order_items")
}
```

### Backend (NestJS — Clean Architecture)

#### ProductGroupRepository (new)

- `create(data): Promise<ProductGroup>`
- `findById(id): Promise<ProductGroup | null>`
- `findAll(): Promise<ProductGroup[]>`
- `addAxis(groupId, name, sortOrder): Promise<ProductGroupAxis>`
- `findSiblings(groupId): Promise<SiblingPosition[]>` — returns positions in group with id,
  slug, name, attributes, price, isActive

#### ProductRepository (modified)

- `findAll(params)`: unchanged in signature; now returns one row per position. The internal
  `findMany` over `Product` already works correctly after schema migration.
- `findBySlugWithRelations(slug)`: extended to include group + siblings + group axes.
- `create(data)`: add `groupId?`, `attributes?`, `stock`, `positionOrder?` fields.
- `update(id, data)`: add same fields.
- `softDelete`: unchanged (slug + sku mangle on position row).
- Remove: `findVariantsByProductId` (if it exists in any helper — variants gone).

#### ProductService (modified)

- `findBySlug(slug)`: response shape gains `group` object (axes + sibling positions).
- `create(input)`: accept `groupId?`, `attributes?`, `stock`, `positionOrder?`.
- `update(id, input)`: same.
- Stock-read path for ATC button: `product.stock` (not `variant.stock`).

#### ProductController (modified)

- `GET /api/products/:slug` — response gains `group` (sibling navigation data).
- `POST /api/products` — body gains `groupId?`, `attributes?`, `stock`, `positionOrder?`.
- `PATCH /api/products/:id` — same additions.

#### ProductGroupController (new)

- `POST /api/product-groups` — create group (admin).
- `GET /api/product-groups/:id` — get group with axes and positions (admin).
- `PATCH /api/product-groups/:id` — update group name / axes (admin).
- `DELETE /api/product-groups/:id` — soft-delete or deactivate group (admin).
- `POST /api/product-groups/:id/axes` — add axis (admin).

#### CartRepository and CartService (modified)

- Remove all `variantId` parameters from `addItem`, `updateItem`, `mergeGuestCart`.
- `findOrCreate` include: remove `variant` join; add `product.stock` to stock check.
- `validateCartItems`: check `item.product.isActive` and `item.product.stock` (not variant fields).
- `@@unique` constraint change: `[cartId, productId]` only.

#### OrderRepository (modified)

- `createFromCart`: stock decrement changes from `productVariant.updateMany` to
  `product.updateMany({ where: { id: item.productId, stock: { gte: item.quantity } } })`.
- `cancelAndRestock`: restock increments `product.stock` (not `productVariant.stock`).
- Remove `variant` join from `ORDERS_INCLUDE` (only `product: { id, name, slug }` needed).

### API Contract (Orval)

New response shape for `GET /api/products/:slug`:

```typescript
{
  data: ProductEntity;           // position row (has own slug, sku, price, stock)
  category: ProductCategoryEntity;
  images: ProductImageEntity[];
  group?: {                      // present when position belongs to a group
    id: string;
    name: string;
    axes: string[];              // ordered axis names
    siblings: Array<{
      id: string;
      slug: string;
      name: string;
      price: string;
      attributes: Record<string, string>;
      isActive: boolean;
    }>;
  };
}
```

List response (`GET /api/products`) shape is unchanged (`data: ProductEntity[], meta`).
`ProductEntity` gains `stock: number` and `attributes: Record<string, string> | null`.

Run `npm run generate:api` after each controller/DTO change.

### Frontend (Next.js — FSD)

#### shared/ui

- `ProductCard`: no change required; `product.slug` links correctly; sale badge reads
  `product.compareAtPrice` vs `product.price` (unchanged).

#### entities/product

- `useProductControllerFindAll`: no change (one position per card automatically).
- `useProductControllerFindBySlug`: response type gains `group` field (auto-generated by Orval).

#### features/add-to-cart

- `AddToCartButton`: remove `variantId` prop; send only `productId`. The
  `usePostCart` Orval hook body changes to `{ productId, quantity }`.

#### widgets/product-detail

- Remove `ProductVariantSelector` (replaced by sibling navigation).
- Remove `pickCheapestActiveVariantId` helper and `pick-default-variant.ts`.
- Add `ProductSiblingNavigator` component: renders one axis strip per group axis; each value
  button resolves the target sibling slug and calls `router.push('/products/' + targetSlug)`.
- `ProductDetailView`: remove `selectedVariantId` state; display `product.price` and
  `product.stock` directly (no variant indirection). SKU display now correct (each position
  has its own SKU). Add `ProductSiblingNavigator` if `data.group` is present.

#### widgets/product-grid / product-list

- No code change required; grid already maps `products.map(p => <ProductCard product={p} />)`.

#### app/products/[slug]/page.tsx

- No change; `ProductDetailView` receives `slug` prop as before.

### Admin (store-admin)

#### Product List

- No structural change; lists positions. Group name shown as a secondary label if desired.

#### Product Create / Edit Form

- Add fields: `stock`, `attributes` (key-value editor), `groupId` (select from groups),
  `positionOrder`.
- Remove inline variants section.
- A separate "Groups" management page is added.

#### Groups Management Page

- List groups with their positions.
- Create/edit group: name + axes (ordered list of axis name strings).
- Assign positions to group via groupId on the position form (not managed here directly).

### SEO

- `sitemap.xml` generator already queries `Product.findMany({ isActive: true, deletedAt: null })`.
  After schema migration, this naturally returns positions — no code change.
- JSON-LD: each position PDP renders its own `Product` schema with `name`, `sku`, `offers.price`,
  `offers.availability` from the position row. Group context is added as `isRelatedTo` array
  (future enhancement; not in initial scope).
- `canonical` and `og:url`: set to `https://{host}/products/{position.slug}` per position.

---

## Tasks

### TASK-142-A: Schema migration — add ProductGroup / ProductGroupAxis, add position columns to Product, backfill, drop ProductVariant

**Type:** feat
**Scope:** store-api
**Complexity:** L (4-8h)
**TDD Required:** No (migration script; verify with manual DB check)
**Depends on:** none

**Acceptance Criteria:**

- [ ] `prisma migrate dev --name add_product_groups_and_positions` creates the migration file.
- [ ] `product_groups` table created with `id`, `name`, `is_active`, timestamps.
- [ ] `product_group_axes` table created with `id`, `group_id FK`, `name`, `sort_order`, timestamps.
- [ ] `products` table gains columns: `group_id UUID? FK`, `attributes JSONB default '{}'`,
      `stock INT default 0`, `position_order INT default 0`.
- [ ] `CHECK (stock >= 0)` constraint added to `products.stock`.
- [ ] Backfill script (`prisma/scripts/backfill-positions.ts`) runs against a dev DB: - Every `ProductVariant` becomes a new `Product` row with unique slug. - Every parent `Product` with variants gets a `ProductGroup` row; its own `products` row
      is updated (groupId set, original product row becomes the first position or is replaced). - `CartItem` rows with non-null `variantId` are remapped to new position productId;
      `variantId` set to NULL. - `OrderItem` rows remapped similarly; `price` snapshot unchanged. - `ProductImage` rows cloned per position (or shared — see note).
- [ ] `ProductGroupAxis` rows created from attribute keys found in backfill.
- [ ] `product_variants` table renamed to `product_variants_bak` (not dropped yet).
- [ ] `variantId` columns in `CartItem` and `OrderItem` made nullable in Prisma schema (not
      dropped yet).
- [ ] `prisma generate` succeeds; `tsc --noEmit` passes on store-api.
- [ ] All existing backend tests remain green (`npm run test -w apps/store-api`).

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add ProductGroup, ProductGroupAxis; modify Product,
  CartItem, OrderItem
- `apps/store-api/prisma/migrations/NNN_add_product_groups_and_positions/migration.sql` — generated
- `apps/store-api/prisma/scripts/backfill-positions.ts` — standalone backfill script

---

### TASK-142-B: Backend — ProductGroup module + Product API extended for positions

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (repository unit tests sufficient)
**Depends on:** TASK-142-A

**Acceptance Criteria:**

- [ ] `ProductGroupModule` created with `ProductGroupRepository`, `ProductGroupService`,
      `ProductGroupController` (admin-guarded CRUD).
- [ ] `ProductRepository.findBySlugWithRelations` returns `group` object (id, name, axes names,
      sibling positions with slug + attributes + price + isActive).
- [ ] `ProductRepository.create` and `update` accept `groupId?`, `attributes?`, `stock`,
      `positionOrder?`.
- [ ] `ProductRepository.findAll` includes `stock` in the returned shape (for ATC stock check).
- [ ] `ProductEntity` gains `stock: number` and `attributes: Record<string, string> | null`
      fields; Swagger decorators added.
- [ ] `GET /api/products/:slug` response Swagger shape updated to include optional `group` object.
- [ ] `npm run test -w apps/store-api` green (repository unit tests updated for new shape).
- [ ] `tsc --noEmit` clean.

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.ts`
- `apps/store-api/src/product/product.service.ts`
- `apps/store-api/src/product/product.controller.ts`
- `apps/store-api/src/product/entities/product.entity.ts`
- `apps/store-api/src/product/dto/create-product.dto.ts`
- `apps/store-api/src/product/dto/update-product.dto.ts`
- `apps/store-api/src/product-group/product-group.repository.ts` (new)
- `apps/store-api/src/product-group/product-group.service.ts` (new)
- `apps/store-api/src/product-group/product-group.controller.ts` (new)
- `apps/store-api/src/product-group/product-group.module.ts` (new)
- `apps/store-api/src/product-group/entities/product-group.entity.ts` (new)

---

### TASK-142-C: Cart and Order adaptation — drop variantId, repoint stock to Product.stock (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** L (4-8h)
**TDD Required:** Yes — Red → Green → Refactor for all cart and order service methods
**Depends on:** TASK-142-A

**Acceptance Criteria:**

- [ ] **TDD Red phase:** unit tests written first for: - `CartService.addToCart`: stock read from `product.stock`; `variantId` absent. - `CartService.mergeGuestCart`: merge logic uses `productId` only as unique key. - `OrderRepository.createFromCart`: stock decrement on `product.updateMany` (not
      `productVariant.updateMany`); `ConflictException` thrown when `count === 0`. - `OrderService.cancelOrder` / `OrderRepository.cancelAndRestock`: stock increment on
      `product.update`. - `shouldAutoRestock` helper: unchanged logic, repointed entity.
- [ ] **TDD Green phase:** implementation changes pass all tests above.
- [ ] `CartItem.variantId` column no longer sent in any repository write; Prisma schema
      `CartItem` has no `variantId` field in this migration step (transition column dropped).
- [ ] `OrderItem.variantId` same treatment.
- [ ] `CartItem.@@unique([cartId, productId])` constraint (no variantId).
- [ ] `CartRepository` include clause: `variant` join removed; `product { stock, isActive }` used
      directly.
- [ ] `CartService.validateCartItems`: checks `item.product.stock` and `item.product.isActive`.
- [ ] `CartService.updateItem`: stock check against `cartItem.product.stock`.
- [ ] `OrderRepository` `ORDERS_INCLUDE`: `variant` select removed.
- [ ] `npm run test -w apps/store-api` green (all 388+ tests pass or are updated).
- [ ] `tsc --noEmit` clean.

**Files to create/modify:**

- `apps/store-api/src/cart/cart.repository.ts`
- `apps/store-api/src/cart/cart.service.ts`
- `apps/store-api/src/cart/cart.service.spec.ts`
- `apps/store-api/src/order/order.repository.ts`
- `apps/store-api/src/order/order.service.ts`
- `apps/store-api/src/order/order.service.spec.ts`
- `apps/store-api/src/order/order.types.ts`

---

### TASK-142-D: Orval regeneration and API contract verification

**Type:** chore
**Scope:** store-api, store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-142-B, TASK-142-C

**Acceptance Criteria:**

- [ ] `npm run generate:api` runs without error.
- [ ] `shared/api/generated/` in store-client updated: `ProductEntity` has `stock` and
      `attributes`; detail response type has `group?` field.
- [ ] `shared/api/generated/` in store-admin updated equivalently.
- [ ] `npm run build -w apps/store-client` clean (no TypeScript errors on generated types).
- [ ] `npm run build -w apps/store-admin` clean.
- [ ] `AddToCartDto` type in generated hooks no longer includes `variantId`.

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/` — regenerated (do not hand-edit)
- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)

---

### TASK-142-E: Storefront — PDP sibling navigation + grid cleanup

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (component tests for ProductSiblingNavigator)
**Depends on:** TASK-142-D

**Acceptance Criteria:**

- [ ] `ProductVariantSelector` component removed (replaced by `ProductSiblingNavigator`).
- [ ] `pick-default-variant.ts` and its test removed.
- [ ] `ProductSiblingNavigator` created in
      `widgets/product-detail/ui/product-sibling-navigator.tsx`: - Renders one `<fieldset>` per axis from `group.axes`. - Each axis shows all sibling values as buttons; the current position's value is marked
      `aria-pressed={true}` / active styling. - Clicking a different value finds the sibling matching current position's other attributes
      plus the new value, then calls `router.push('/products/' + sibling.slug)`. - When no sibling resolves (data gap), button is disabled.
- [ ] `ProductDetailView` updated: - Removes `selectedVariantId` state and `effectiveVariantId` / `defaultVariantId` logic. - Displays `product.price`, `product.sku`, `product.stock` directly. - Renders `<ProductSiblingNavigator group={data.group} />` when `data.group` is present. - `AddToCartButton` receives only `productId` (no `variantId`).
- [ ] `ProductStockIndicator` reads from `product.stock` (passed directly; no variant lookup).
- [ ] `MobileAtcBar` `variantId` prop removed.
- [ ] `npm run test -w apps/store-client` green.
- [ ] `npm run build -w apps/store-client` clean.
- [ ] Manual: clicking a sibling attribute button navigates to the correct sibling PDP URL.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-sibling-navigator.tsx` (new)
- `apps/store-client/src/widgets/product-detail/ui/product-sibling-navigator.test.tsx` (new)
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-variant-selector.tsx` (remove)
- `apps/store-client/src/widgets/product-detail/ui/pick-default-variant.ts` (remove)
- `apps/store-client/src/widgets/product-detail/ui/pick-default-variant.test.ts` (remove)
- `apps/store-client/src/widgets/product-detail/ui/mobile-atc-bar.tsx`
- `apps/store-client/src/features/add-to-cart/` — remove variantId prop

---

### TASK-142-F: Admin — position form + group management

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No (component smoke tests)
**Depends on:** TASK-142-D

**Acceptance Criteria:**

- [ ] Product create/edit form gains fields: `stock` (number input), `attributes` (key-value pair
      editor, e.g. `[{ key: "color", value: "blue" }]` → serialised to JSON),
      `groupId` (select from `GET /api/product-groups`), `positionOrder` (number input).
- [ ] Inline "Variants" section in product form removed.
- [ ] New admin route `/admin/product-groups` with list view of all groups.
- [ ] Group create/edit page: group name + ordered list of axis names (add/remove/reorder).
- [ ] `npm run build -w apps/store-admin` clean.
- [ ] `npm run test -w apps/store-admin` green.
- [ ] Manual: admin can create a group, create two positions with matching groupId, and observe
      both in the groups detail view.

**Files to create/modify:**

- `apps/store-admin/src/app/(admin)/products/[id]/page.tsx`
- `apps/store-admin/src/app/(admin)/products/new/page.tsx`
- `apps/store-admin/src/app/(admin)/product-groups/page.tsx` (new)
- `apps/store-admin/src/app/(admin)/product-groups/[id]/page.tsx` (new)
- `apps/store-admin/src/features/product-form/` — add stock, attributes, groupId fields
- `apps/store-admin/src/widgets/product-group-list/` (new)

---

### TASK-142-G: Seed rewrite + SEO review + drop product_variants_bak

**Type:** chore + feat
**Scope:** store-api, store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-142-B, TASK-142-C, TASK-142-E

**Acceptance Criteria:**

- [ ] `prisma/seed.ts` rewritten to seed positions + groups (no `ProductVariant` creates).
      Minimum seed data: 3 groups with 2–3 positions each, 2 standalone positions,
      1 out-of-stock position, 2 sale positions. Covers pagination threshold (>8 items).
- [ ] `npm run db:seed` runs without error on a freshly migrated DB.
- [ ] Sitemap: verify `GET /api/sitemap.xml` (or equivalent) lists one URL per active position
      (not one per group). Update generator query if needed.
- [ ] JSON-LD: each position PDP `<script type="application/ld+json">` contains the position's
      own `name`, `sku`, `price`, `availability`.
- [ ] Final migration: `product_variants_bak` table dropped via `prisma migrate dev --name
  drop_product_variants_bak`. `variantId` columns in CartItem / OrderItem dropped in same
      migration (they are null across all rows by this point).
- [ ] `npm run test -w apps/store-api` green after final migration.
- [ ] `tsc --noEmit` clean across all workspaces.
- [ ] Manual: full product list → PDP → ATC → checkout → order flow verified on seeded data.

**Files to create/modify:**

- `apps/store-api/prisma/seed.ts`
- `apps/store-api/src/seo/sitemap.service.ts` (or equivalent) — verify query
- `apps/store-client/src/app/products/[slug]/page.tsx` — verify JSON-LD still correct
- `apps/store-api/prisma/migrations/NNN_drop_product_variants_bak/migration.sql` — generated

---

## Migration Steps (Ordered)

1. Branch: `feature/142-A-schema-migration` from `develop`.
2. Implement TASK-142-A (schema + backfill). Merge to `develop`.
3. Branch: `feature/142-BC` for TASK-142-B and TASK-142-C in parallel (both depend only on A).
4. Once B and C are merged, branch `feature/142-D` for Orval regen (TASK-142-D).
5. Once D is merged, branches `feature/142-E` (storefront) and `feature/142-F` (admin) in parallel.
6. Once E is merged, branch `feature/142-G` for seed + SEO + final drop migration.

---

## Test Plan

| Layer                                                  | Approach                          | When                              |
| ------------------------------------------------------ | --------------------------------- | --------------------------------- |
| Cart service (addToCart, merge, validate)              | Jest unit (TDD Red→Green)         | TASK-142-C, before implementation |
| Order repository (stock decrement, createFromCart)     | Jest unit (TDD Red→Green)         | TASK-142-C, before implementation |
| Order service (cancelAndRestock, updateStatus)         | Jest unit (TDD Red→Green)         | TASK-142-C, before implementation |
| ProductRepository (findBySlugWithRelations with group) | Jest unit                         | TASK-142-B                        |
| ProductSiblingNavigator component                      | RTL component test                | TASK-142-E                        |
| AddToCartButton (no variantId)                         | Existing RTL tests updated        | TASK-142-E                        |
| Admin position form                                    | RTL smoke test                    | TASK-142-F                        |
| Seed idempotency                                       | `npm run db:seed` twice, no error | TASK-142-G                        |
| Full flow (PDP → ATC → checkout)                       | Playwright E2E (TASK-105-D)       | TASK-142-G                        |

---

## Risks and Mitigations

| Risk                                                                              | Likelihood | Mitigation                                                                                                         |
| --------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Backfill generates duplicate slugs                                                | Medium     | Suffix counter (`-2`, `-3`) in backfill script; uniqueness verified by Prisma unique constraint before commit      |
| Historical OrderItem names break if position row is soft-deleted                  | Low        | TASK-104 tombstone design keeps the row; `product.name` still resolves. Verified in TASK-142-A acceptance criteria |
| CartItem FK violation during backfill (cart with variantId that no longer exists) | Low        | Backfill remaps CartItem before dropping product_variants; FK constraint drop is in the same transaction           |
| Concurrent orders during migration window depleting wrong stock table             | Low        | Migration applied during a maintenance window; `product_variants_bak` kept until TASK-142-G confirms correct       |
| Orval-generated types diverge between store-client and store-admin                | Low        | TASK-142-D runs `generate:api` once and commits both sets; CI `npm run build` catches drift                        |
| Admin form regression (product edit breaks after removing variants section)       | Medium     | TASK-142-F component tests; manual smoke test                                                                      |
| Sibling resolution returns wrong position when attributes overlap partially       | Medium     | `ProductSiblingNavigator` unit tests cover multi-axis resolution; edge cases documented                            |
| DB CHECK (stock >= 0) missing on new products.stock column                        | Low        | TASK-142-A acceptance criterion explicitly requires the CHECK; verified in migration SQL                           |

---

## Notes

- This is a **breaking model change**. The API shape changes (group field added, variantId removed
  from cart/order endpoints). Existing API consumers (Orval-generated hooks) are regenerated as
  part of this epic. No external consumers exist at this stage.
- The PDP `product.sku` display gap (known since before TASK-126) is naturally fixed: each
  position carries its own SKU.
- TASK-128 (seed overhaul) is absorbed into TASK-142-G; the TASK-128 backlog entry should be
  annotated as "reshaped by TASK-142; implementation moved to TASK-142-G."
- TASK-126 (cheapest-variant default, shipped) becomes a dead code path once `ProductVariantSelector`
  is removed in TASK-142-E. The `pickCheapestActiveVariantId` helper is removed at that point.
- The `Review` model still references `productId` (position id). After migration, reviews attach
  to positions (not groups). This is intentional: a "Single Pack" position and a "Double Pack"
  position may have independent review histories.
- `ProductRelated` widget in `product-detail` queries by `categoryId, excludeId` — no change
  needed; it naturally returns sibling positions (same category) as related products, which is
  arguably better UX than before.
