# Plan 150 — Add-on Services / Protection Plans (TASK-174)

> **Status:** ⬜ To Do
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11 (rev. 2 — owner decision on applicability model + discount scope)
> **BACKLOG task:** TASK-174 (single task, no sub-task split in BACKLOG — see §Scope note below)
> **Orchestration:** implemented in a single worktree `feature/174-addon-services` per
> `docs/plans/149-late-wave-orchestration.md`. **Revision note:** the owner has since parked
> TASK-175 (loyalty), so this task has **no** parallel-worktree dependency to coordinate around —
> the schema-merge-conflict concerns from rev. 1 of this plan no longer apply. Next free plain
> task ID is **TASK-287** (TASK-286 was taken by the owner for a parked "discounts on add-on
> services" follow-up, referenced in §Out of Scope).

## Revision history

- **rev. 1 (2026-07-11):** initial plan — flat per-product applicability (`AddonServiceProduct`
  M2M), 3 open blockers.
- **rev. 2 (2026-07-11):** owner resolved all 3 blockers. Applicability is **not** flat
  per-product — it's a **category template with prototype-style inheritance** (nearest-ancestor-
  wins) plus **per-product point deltas** (ADD/REMOVE/OVERRIDE). Standalone add-on purchase stays
  out of scope. Discounts never apply to add-ons (owner-verified against the live
  `order.repository.ts` discount-base code). This revision replaces rev. 1's `AddonServiceProduct`
  model entirely — see §Data Model.

## Overview

The cart page already renders a per-line "add-on services" UI (warranty certificate / insurance /
setup) — a **front-end-only stub** wired since the Design-import redesign. Selections toggle
correctly and are totalled into the cart summary, but they are client `useState` only: they
disappear on reload and are never sent to the backend, so they never reach checkout or the created
order. This plan replaces the stub with a real catalog (`AddonService`), a **category-template +
per-product-delta** applicability model, cart/order persistence, and admin management — while
preserving the exact cart UX the stub already established (per-line toggle, flat price add, no
quantity multiplication).

Grounded stub location (plan 129, audit row 1):

- `apps/store-client/src/widgets/cart/model/addon-services.ts` — static `ADDON_SERVICES` catalog
  (3 hardcoded items) + `addonServicesForItem()` price-threshold heuristic (`price >= 2000`).
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` (~L198) — renders the toggle checkboxes
  per line via `onToggleService`.
- `apps/store-client/src/widgets/cart/ui/cart-view.tsx` (`computeServicesTotal`, L31–43) — owns the
  `Record<string, boolean>` selection state keyed by `addonKey(itemId, serviceId)`, sums selected
  prices (flat add, **not** multiplied by line quantity).
- `apps/store-client/src/widgets/cart/ui/cart-summary.tsx` (`servicesTotal` prop, L58–65) — renders
  the "add-on services" line in the totals panel when `servicesTotal > 0`.

## Owner-locked decisions (2026-07-11)

These four decisions replace rev. 1's open blockers and are treated as settled requirements, not
options, for the rest of this plan:

1. **Applicability = category template with prototype-style inheritance, not flat per-product
   assignment.** A "template" is a named set of add-on services attached to a `Category`. The link
   is **live**: editing which services belong to a category's template is immediately reflected
   everywhere that template applies, except where an explicit product-level override exists.
   Resolution over the category tree is **nearest-ancestor-wins**: a subcategory with no template
   of its own inherits its nearest ancestor's template; a subcategory that defines its own template
   fully replaces (does not merge with) the inherited one — exactly the semantics of JS prototype
   own-property shadowing.
2. **Product level = point deltas, not full replacement.** A product inherits its category's
   resolved template and may additionally carry per-addon deltas of three kinds: **ADD** (an
   exclusive add-on for this product only, independent of any template), **REMOVE** (suppress one
   inherited add-on for this product), **OVERRIDE** (this product's own price/terms for an
   inherited add-on — shadows the template value without touching the template itself). Anything
   the product has no delta for keeps tracking the template live. A product is never fully
   detached from its category's template.
3. **No standalone add-on purchase.** An add-on only ever exists as a toggle under an existing cart
   line, exactly as the stub already ships it — out of scope, as in rev. 1.
4. **Add-ons are never discounted.** `order.repository.ts` L120–137 computes the discount strictly
   against the product-line `subtotal` (`total = subtotal + shipping - discount`, shipping already
   excluded from the discount base). `addonsTotal` joins that same "excluded from the discount
   base" list — a coupon reduces `subtotal`'s contribution to `total`, never `addonsTotal`'s. This
   is a hard invariant (§Money logic case 24), not a default pending confirmation. Discounts _on_
   add-on services specifically is parked separately as **TASK-286** (owner-parked, not this
   plan's scope).

## Scope

**Single BACKLOG task, not split.** TASK-174-A…J below are this plan's internal work-breakdown
structure for one implementer/worktree — they do **not** correspond to separate BACKLOG rows.
§Risks flags where the scope may be too large for one sitting, without unilaterally splitting it;
that call belongs to the orchestrator/owner, not this plan.

### In Scope

- `AddonService` catalog model (admin-managed: name, description, price, `isActive`).
- `CategoryAddonTemplate` — which add-on services belong to a category's own template.
- `AddonServiceDelta` — per-product ADD/REMOVE/OVERRIDE deltas against the resolved template.
- A pure `AddonApplicabilityResolver` service method — nearest-ancestor template lookup (reusing
  `CategoryRepository`'s existing tree-traversal primitives, extended, not reimplemented) + delta
  application. This resolver is the heart of the feature and is fully unit-tested (§TDD).
- Cart persistence (`CartItemAddon`) — selecting/deselecting an add-on for a cart line survives
  reload and guest→user cart merge, exactly like quantity does today.
- Order persistence (`OrderItemAddon`) — selected add-ons snapshot their name+price into the order
  at creation time (mirrors `OrderItem.price` snapshotting `Product.price`) and survive product,
  category-template, or delta changes afterwards.
- Money logic: cart/order totals grow an `addonsTotal` figure that is **never** part of the
  discount base (owner decision 4) — TDD, critical module.
- Public read endpoint(s)/enriched `GET /cart` so the storefront shows, per cart line, the
  resolved applicable add-ons and which are currently selected — no manual `fetch`/`axios`.
- Admin management for **both** halves of the model: category templates (on the category form)
  and product deltas (on the product form), with clear "inherited vs. overridden vs. exclusive"
  affordances.
- `store-client` rewiring: `widgets/cart` swaps the static stub for real Orval hooks; the stub file
  (`addon-services.ts`) is deleted once nothing imports it.
- New dictionary entries in both apps, in a **dedicated namespace** — `dict.cart.addons.*` on the
  storefront and `dict.addonServices.*` on the admin (mirrors `dict.brands.*`/`dict.discounts.*`/
  `dict.categories.*` — one top-level section per CRUD-ish module).

### Out of Scope

- Standalone add-on purchase without an associated product/cart-line (owner decision 3).
- Discounts/coupons applying to the add-on total (owner decision 4) — a _future_ "discounts on
  services" idea is parked one-line as **TASK-286**, not implemented here.
- Real payment integration, refund handling for add-ons specifically (rides the existing
  order-level refund flow, parked `TASK-034/081`).
- Express "buy in 1 click" (`TASK-178`, parked) — untouched.
- Changing the flat, non-quantity-multiplied add-on pricing UX — preserved exactly (Design
  Decision, unchanged from rev. 1).
- Loyalty/TASK-175 — parked by the owner; **no dependency on it exists in this plan** (rev. 1's
  shared-worktree/merge-order concerns with TASK-175 are moot).

## User Stories

1. As a **customer**, I want to add a protection plan / warranty to an eligible product in my cart
   and have that choice survive a page reload and carry through to my placed order.
2. As a **store admin**, I want to define an add-on template once on a category (e.g. "all
   audio/headphone products get a warranty + insurance offer") and have every product in that
   category and its subcategories pick it up automatically, without touching each product.
3. As a **store admin**, I want to give one specific flagship product an exclusive add-on the rest
   of its category doesn't have, or override the price of an inherited one, or suppress an
   inherited one that doesn't make sense for that product — without forking the whole category's
   template.
4. As a **store admin**, I want a placed order's add-ons to keep their name/price even if I later
   change the catalog price, the category template, or a product's delta.

## Technical Design

### Why point deltas over full per-product replacement

A naïve alternative — "each product has its own complete add-on list" — throws away the "define
once on a category" win the owner explicitly asked for, and would force re-entering the same 2-3
services on every product in a category. The delta model (ADD/REMOVE/OVERRIDE) is the smallest
mechanism that supports all three product-level needs the owner named (exclusive extras, opt-outs,
price overrides) while keeping the common case ("product just uses its category's template, no
exceptions") a **zero-row** state — no delta rows exist for a product until an admin explicitly
diverges from the template. A single delta table with an enum `type` column (rather than three
separate tables) is chosen because: (a) all three delta kinds share the same identity key
(`productId` + `addonServiceId`) and are mutually exclusive per pair (a product can't both ADD and
REMOVE the same add-on) — a single `@@unique([productId, addonServiceId])` constraint expresses
that cleanly; (b) the resolver's "apply deltas" step is one pass over one result set instead of
three; (c) the admin UI's "this row has an exception" state is one lookup, not three.

### Data Model

Per the orchestration convention (plan 149 §Фаза 2 checklist item 8 — no longer contended with a
parallel worktree since TASK-175 is parked, but kept as the house style anyway), every brand-new
model is appended to the end of `schema.prisma`. The only deviations — required by Prisma
relations, not a choice — are four single-line back-relation additions to existing model bodies
(`Category`, `Product`, `CartItem`, `OrderItem`), called out explicitly below.

```prisma
// ── Small additions to EXISTING models (not new models) ───────────────────

// Inside `model Category { ... }`, alongside its other relation arrays:
//   addonTemplates CategoryAddonTemplate[]

// Inside `model Product { ... }`, alongside the other back-relation arrays
// (reviews, orderItems, cartItems, wishlistItems, deviceCompat, specValues):
//   addonDeltas AddonServiceDelta[]

// Inside `model CartItem { ... }`, alongside `product`:
//   addons CartItemAddon[]

// Inside `model OrderItem { ... }`, alongside `product`:
//   addons OrderItemAddon[]

// ── New models — appended to the END of schema.prisma ─────────────────────

/// Admin-managed catalog of purchasable add-on services (warranty / insurance /
/// setup, TASK-174). Replaces the store-client stub catalog
/// (`widgets/cart/model/addon-services.ts`). `isActive` is the standard
/// reversible visibility toggle — an inactive service disappears from the
/// resolver's output immediately (both template membership AND any product
/// delta involving it), but is NOT retroactively stripped from carts/orders
/// that already reference it (cart re-validates live on next read, per
/// §Money logic case 13; orders are frozen snapshots, unaffected either way).
model AddonService {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Decimal  @db.Decimal(10, 2)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  categoryTemplates CategoryAddonTemplate[]
  productDeltas     AddonServiceDelta[]
  cartItemAddons    CartItemAddon[]
  orderItemAddons   OrderItemAddon[]

  @@index([isActive])
  @@map("addon_services")
}

/// One add-on service belonging to a category's OWN template (owner decision
/// 1). A category with zero rows here has no template of its own and
/// inherits its nearest ancestor's template (nearest-ancestor-wins — see
/// {@link AddonApplicabilityResolver}); a category with ≥1 row here fully
/// replaces whatever its ancestors would have contributed (prototype
/// own-property shadowing, not a merge). The relationship is intentionally a
/// live join, not a value copy — editing these rows changes the resolved set
/// everywhere the template applies, immediately.
model CategoryAddonTemplate {
  id             String       @id @default(uuid())
  categoryId     String       @map("category_id")
  category       Category     @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  addonServiceId String       @map("addon_service_id")
  addonService   AddonService @relation(fields: [addonServiceId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now()) @map("created_at")

  @@unique([categoryId, addonServiceId])
  @@index([categoryId])
  @@index([addonServiceId])
  @@map("category_addon_templates")
}

/// A product-level point delta against its resolved category template (owner
/// decision 2). At most one delta row per (product, add-on service) pair —
/// `type` disambiguates ADD (exclusive to this product, independent of any
/// template membership) / REMOVE (suppress an inherited add-on for this
/// product) / OVERRIDE (this product's own price for an inherited add-on).
/// `price` is only meaningful for ADD (optional — null means "use the
/// catalog `AddonService.price`") and OVERRIDE (required); it is ignored for
/// REMOVE. A single table with an enum column, not three tables, per
/// §Technical Design's rationale above.
model AddonServiceDelta {
  id             String         @id @default(uuid())
  productId      String         @map("product_id")
  product        Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  addonServiceId String         @map("addon_service_id")
  addonService   AddonService   @relation(fields: [addonServiceId], references: [id], onDelete: Cascade)
  type           AddonDeltaType
  // Meaningful for ADD (optional price override) and OVERRIDE (required);
  // ignored for REMOVE. Validated at the service layer, not by a DB CHECK
  // (Prisma has no CHECK support — same documented limitation as
  // `Product.stock >= 0`).
  price          Decimal?       @db.Decimal(10, 2)
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  @@unique([productId, addonServiceId])
  @@index([productId])
  @@map("addon_service_deltas")
}

enum AddonDeltaType {
  ADD
  REMOVE
  OVERRIDE
}

/// A customer's selection of a resolved add-on for one cart line (TASK-174).
/// Mirrors `CartItem` itself: no price snapshot here — the live resolved
/// price is read at cart-render/order-creation time (a cart is a "shopping
/// list", not a receipt; snapshotting only happens at order creation, exactly
/// like `Product.price` vs `OrderItem.price`).
model CartItemAddon {
  id             String       @id @default(uuid())
  cartItemId     String       @map("cart_item_id")
  cartItem       CartItem     @relation(fields: [cartItemId], references: [id], onDelete: Cascade)
  addonServiceId String       @map("addon_service_id")
  addonService   AddonService @relation(fields: [addonServiceId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now()) @map("created_at")

  @@unique([cartItemId, addonServiceId])
  @@index([cartItemId])
  @@map("cart_item_addons")
}

/// Snapshot of a selected add-on at order-creation time (TASK-174). `name`
/// and `price` are copied at the moment `OrderRepository.createFromCart` runs
/// — exactly like `OrderItem.price` snapshots `Product.price` — so a later
/// catalog-price change, template edit, or delta edit never rewrites history.
/// `addonServiceId` is nullable + `onDelete: SetNull` for symmetry with how
/// `OrderItem.product` is never hard-deleted (Product uses `deletedAt`
/// tombstones) — `AddonService` has no hard-delete path either (admin can
/// only deactivate), so this column is not expected to go null in practice,
/// but the schema doesn't assume that invariant holds forever.
model OrderItemAddon {
  id             String        @id @default(uuid())
  orderItemId    String        @map("order_item_id")
  orderItem      OrderItem     @relation(fields: [orderItemId], references: [id], onDelete: Cascade)
  addonServiceId String?       @map("addon_service_id")
  addonService   AddonService? @relation(fields: [addonServiceId], references: [id], onDelete: SetNull)
  name           String
  price          Decimal       @db.Decimal(10, 2)
  createdAt      DateTime      @default(now()) @map("created_at")

  @@index([orderItemId])
  @@map("order_item_addons")
}
```

`Order` also gets one new column (append to the existing `Order` model, alongside `discount`/
`shippingCost`/`tax`):

```prisma
// Inside `model Order { ... }`, alongside shippingCost/tax:
addonsTotal Decimal @default(0) @map("addons_total") @db.Decimal(10, 2)
```

**Migration mechanics** (per the `prisma-migration` skill / memory note `migrations-gitignored`):
migration SQL is gitignored — `schema.prisma` is the single source of truth. Apply with
`npx prisma db push` on both the dev DB and `store_test` (Playwright/`test:int` target `store_test`
explicitly), never `prisma migrate dev`.

### The resolver — `AddonApplicabilityResolver`

A single, pure(-ish — it reads through two repositories but does no writes) service class, the
"heart of the feature" per the owner's framing. Lives in the new `addon-service` module but depends
on `CategoryRepository` from the `category` module (an existing, established cross-module
dependency pattern — e.g. `OrderService` already depends on `CartRepository`/`DiscountService`).

```ts
export interface ResolvedAddon {
  addonServiceId: string;
  name: string;
  /** Effective price as a decimal string — catalog price, or the ADD/OVERRIDE delta's price. */
  price: string;
  /** For admin UI affordances: where this entry's effective value came from. */
  source: "template" | "add" | "override";
}

@Injectable()
export class AddonApplicabilityResolver {
  constructor(
    private readonly addonServiceRepository: AddonServiceRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  /**
   * Resolve the effective add-on set for one product:
   *   1. Nearest-ancestor-wins template lookup — walk the product's category's
   *      ordered ancestor chain (self first, then parent, then grandparent, …)
   *      and use the FIRST category that owns ≥1 `CategoryAddonTemplate` row.
   *      A product with no category resolves an empty base set (deltas can
   *      still ADD exclusives — see below).
   *   2. Apply the product's `AddonServiceDelta` rows on top of that base set:
   *      REMOVE deletes an entry (no-op if it wasn't in the base set — a
   *      dangling delta from a since-changed template is never an error);
   *      OVERRIDE replaces an existing entry's price (no-op — logged, not
   *      thrown — if the target isn't in the base set, since the template
   *      may have changed since the override was set); ADD inserts/overwrites
   *      an entry regardless of the base set (this is the "exclusive to this
   *      product" case, and also covers "re-add something REMOVEd" without a
   *      separate mechanism).
   *   3. Filter out any resulting entry whose `AddonService.isActive` is
   *      false, regardless of which step produced it.
   */
  async resolveForProduct(product: {
    id: string;
    categoryId: string | null;
  }): Promise<ResolvedAddon[]>;

  /**
   * Batched form of {@link resolveForProduct} for N products in one call — the
   * cart/order code paths always resolve multiple lines at once and must not
   * do it as an N-query loop (no-N+1 convention, per TASK-193). Groups
   * products by distinct `categoryId`, resolves each distinct category's
   * ancestor chain + template in one pass, then applies each product's own
   * deltas. See TASK-174-D's acceptance criteria for the concrete no-N+1
   * assertion.
   */
  async resolveForProducts(
    products: Array<{ id: string; categoryId: string | null }>,
  ): Promise<Map<string, ResolvedAddon[]>>;
}
```

**Reusing, not reimplementing, category tree traversal.** `CategoryRepository` already has
`findSubtreeIds`/`findAncestorIds`/`findDescendantIds` (TASK-236/TASK-238, recursive-CTE-based).
`findAncestorIds` returns an **unordered** `Set` (fine for its existing subtree/rollup callers, who
only need set membership) — this resolver needs the chain **ordered nearest-first** to implement
"nearest ancestor wins" without an extra per-row round trip. Rather than duplicating the recursive
CTE elsewhere, `CategoryRepository` gains one new method, `findAncestorChainOrdered(categoryId):
Promise<string[]>`, extending the existing `findAncestorIds` CTE with a `depth` column and
`ORDER BY depth ASC` (self depth 0, parent depth 1, …) — same recursive-CTE shape, same file, same
cycle-safety properties already proven by the TASK-238 fix. A batched sibling,
`findAncestorChainsOrdered(categoryIds: string[]): Promise<Map<string, string[]>>`, backs
`resolveForProducts`'s no-N+1 requirement (one recursive CTE over the whole distinct-category-id
set, partitioned by the base row it started from).

### Backend (NestJS — Clean Architecture)

New module: `apps/store-api/src/addon-service/` (mirrors `apps/store-api/src/brand/` file layout).

#### AddonServiceRepository

- `findAllAdmin(query)` / `findById(id)` / `create` / `update` / `setActive` — catalog CRUD,
  mirrors `BrandRepository`.
- `findCategoryTemplateRows(categoryId)` — `CategoryAddonTemplate` rows (+ joined `AddonService`)
  for one category, own rows only (no inheritance — that's the resolver's job).
- `replaceCategoryTemplate(categoryId, addonServiceIds: string[])` — full-replace, one transaction
  (mirrors rev. 1's `replaceProductAssignments` shape, retargeted at categories).
- `findProductDeltaRows(productId)` — `AddonServiceDelta` rows (+ joined `AddonService`) for one
  product.
- `upsertProductDelta(productId, addonServiceId, type, price?)` — one delta row, admin action.
- `clearProductDelta(productId, addonServiceId)` — delete the delta row (revert the product back to
  pure-inherited behavior for that add-on) — distinct from a `type: REMOVE` delta, which is itself
  a _row that exists_; clearing removes the row entirely.

#### AddonApplicabilityResolver

As specified above — its own file/class, injected into `AddonServiceService`/`CartService`, unit
tested in isolation with both repositories mocked (§TDD).

#### AddonServiceService

Thin orchestration: catalog CRUD pass-through (mirrors `BrandService`) + template/delta pass-
through + exposes `resolveForProduct(s)` for controllers that need the read view (admin product/
category forms) — the resolver itself has no HTTP awareness.

#### AddonServiceController (public)

- `GET /addon-services/resolved-for-product/:productId` — the resolved list for one product; the
  storefront's primary path is still the enriched `GET /cart` (below, no N+1), this route is a
  fallback/PDP-preview path.

#### AdminAddonServiceController (admin CRUD, `@UseGuards(AdminGuard)`, shares the `addon-services`

prefix with the public controller — mirrors `AdminBrandController`/`BrandController`)

- `GET /addon-services/admin/list`, `GET /addon-services/admin/:id`, `POST /addon-services`,
  `PATCH /addon-services/:id`, `PATCH /addon-services/:id/status` — catalog CRUD, mirrors
  `AdminBrandController` 1:1.
- `PATCH /addon-services/templates/category/:categoryId` — `{ addonServiceIds: string[] }`,
  full-replace the category's own template.
- `GET /addon-services/templates/category/:categoryId/resolved` — admin read: `{ source: 'own' |
'inherited' | 'none', sourceCategoryId, sourceCategoryName, addons: ResolvedAddon[] }` — powers
  the category-form's "this category has no template of its own; it currently inherits from
  «Навушники»" affordance.
- `PUT /addon-services/deltas/product/:productId/:addonServiceId` — `{ type, price? }`, upsert one
  delta.
- `DELETE /addon-services/deltas/product/:productId/:addonServiceId` — clear one delta (revert to
  inherited).
- `GET /addon-services/resolved-for-product/:productId` (admin variant reuses the public route,
  gated further by returning `source` per entry for the product-form's badges).

#### DTOs (`class-validator`, mirrors `brand/dto/`)

- `CreateAddonServiceDto` / `UpdateAddonServiceDto` — `name`, `description?`, `price` (decimal
  string, matches `Product.price`/`Discount.value` convention).
- `UpdateAddonServiceStatusDto` — `{ isActive: boolean }`.
- `SetCategoryTemplateDto` — `{ addonServiceIds: string[] }` (`@IsArray @IsUUID('4', { each: true
})`, empty array = "clear this category's own template, fall back to inheritance").
- `SetProductDeltaDto` — `{ type: AddonDeltaType; price?: string }` (`@IsEnum(AddonDeltaType)`,
  `@ValidateIf` requiring `price` when `type === 'OVERRIDE'`).
- `AddonServiceListQueryDto` — `page?`, `limit?`, `search?`, `isActive?` (boolean — remember the
  **boolean query DTO gotcha**: read `obj[key]` inside `@Transform`, per memory note
  `boolean-query-dto-implicit-conversion`).

#### Cart module changes (`apps/store-api/src/cart/`)

- `CartRepository`: enrich the cart-item include so `CartItemAddon` rows are pulled per line in the
  same query as today's `product`/`images` include (no extra round trip). The _available_ addons
  come from `AddonApplicabilityResolver.resolveForProducts` (called once per `GET /cart`, batched
  over all distinct product/category pairs in the cart), not a Prisma include (it's computed, not
  stored).
- New repository methods: `setItemAddon(cartItemId, addonServiceId)` (idempotent upsert) and
  `unsetItemAddon(cartItemId, addonServiceId)` (delete-if-exists).
- `CartService.toggleAddon(identity, itemId, addonServiceId, selected)` — validates cart/item
  ownership (same `resolveCart` pattern as `updateItem`), then calls
  `AddonApplicabilityResolver.resolveForProduct(item.product)` and requires `addonServiceId` to be
  present in the resolved set (`BadRequestException` otherwise — validate-before-write, mirrors
  `validateAddition`'s invariant), then delegates to the repository.
- `CartController`: `POST /cart/items/:itemId/addons/:addonServiceId` (select) and
  `DELETE /cart/items/:itemId/addons/:addonServiceId` (deselect).
- `CartItemEntity` gains `availableAddons: ResolvedAddonEntity[]` (the resolver's output for this
  line's product) and `selectedAddonIds: string[]`.
- `CartTotals` gains `addonsTotal: string` — sum of the _selected_ add-ons' effective price across
  all lines, flat (not multiplied by line quantity — unchanged from rev. 1).

#### Order module changes (`apps/store-api/src/order/`)

- `OrderRepository.createFromCart`: inside the existing transaction, snapshot each cart line's
  selected `CartItemAddon` rows into `OrderItemAddon` (name + **effective, already-resolved**
  price — the resolver's output re-resolved fresh at order-creation time exactly like stock/
  discount are re-validated fresh, not trusted from an earlier `GET /cart` response).
  `Order.addonsTotal` derives from the persisted `OrderItemAddon` rows via integer-cents arithmetic
  (mirrors the existing `subtotalCents` derivation).
- **Hard invariant (owner decision 4):** `total = subtotal + shipping + addonsTotal - discount`,
  where `discount` is computed and clamped against `subtotal` **only** — `addonsTotal` is never
  part of the discount base, mirroring how `shippingCost` is already excluded
  (`order.repository.ts` L120–137, `computeSubtotalString` in `order.service.ts`). This is not
  configurable in this plan.
- `OrderService.createOrder`: re-resolves each line's product through
  `AddonApplicabilityResolver.resolveForProduct` at order-creation time and silently drops (does
  not throw) any previously-selected add-on that is no longer resolved (deactivated service,
  template/delta changed, category changed) — logs a warning, same spirit as the existing
  "stock may have changed since add-to-cart" defensive re-check.
- `OrderItemEntity` gains `addons: OrderItemAddonEntity[]` (`{ id, name, price }` — pure snapshot
  read, no live join). `OrderEntity` gains `addonsTotal: string`.

### API Contract

| Method | Path                                                        | Request Body                 | Response                                                                                              |
| ------ | ----------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/addon-services/resolved-for-product/:productId`           | —                            | `{ data: ResolvedAddonEntity[] }`                                                                     |
| GET    | `/addon-services/admin/list`                                | — (query)                    | `{ data: AddonServiceEntity[], meta }`                                                                |
| GET    | `/addon-services/admin/:id`                                 | —                            | `{ data: AddonServiceEntity }`                                                                        |
| POST   | `/addon-services`                                           | `CreateAddonServiceDto`      | `{ data: AddonServiceEntity }`                                                                        |
| PATCH  | `/addon-services/:id`                                       | `UpdateAddonServiceDto`      | `{ data: AddonServiceEntity }`                                                                        |
| PATCH  | `/addon-services/:id/status`                                | `{ isActive }`               | `{ data: AddonServiceEntity }`                                                                        |
| PATCH  | `/addon-services/templates/category/:categoryId`            | `SetCategoryTemplateDto`     | `{ data: { addonServiceIds: string[] } }`                                                             |
| GET    | `/addon-services/templates/category/:categoryId/resolved`   | —                            | `{ data: { source, sourceCategoryId, sourceCategoryName, addons: ResolvedAddonEntity[] } }`           |
| PUT    | `/addon-services/deltas/product/:productId/:addonServiceId` | `SetProductDeltaDto`         | `{ data: AddonServiceDeltaEntity }`                                                                   |
| DELETE | `/addon-services/deltas/product/:productId/:addonServiceId` | —                            | `{ data: null }`                                                                                      |
| POST   | `/cart/items/:itemId/addons/:addonServiceId`                | —                            | `{ data: CartEntity }`                                                                                |
| DELETE | `/cart/items/:itemId/addons/:addonServiceId`                | —                            | `{ data: CartEntity }`                                                                                |
| GET    | `/cart`                                                     | —                            | `{ data: CartEntity }` — items carry `availableAddons`/`selectedAddonIds`, totals carry `addonsTotal` |
| POST   | `/orders`                                                   | `CreateOrderDto` (unchanged) | `{ data: OrderEntity }` — items carry `addons`, entity carries `addonsTotal`                          |

All routes need full Swagger decorators so `npm run swagger:export -w apps/store-api` +
`npm run generate:api` regenerate Orval hooks for both `store-client` and `store-admin` — no
hand-written `fetch`/`axios` anywhere.

### Frontend (Next.js — FSD)

#### store-client

- `entities/addon-service/` — thin re-export of generated types (`ResolvedAddonEntity`, etc.); no
  standalone hook needed beyond what `useGetCart` already carries.
- `features/cart-addon-toggle/` — wraps the new `useSetCartItemAddon`/`useUnsetCartItemAddon` Orval
  mutation hooks with optimistic update + `invalidateQueries(getGetCartQueryKey())`, mirroring
  `useClearCart` in `cart-view.tsx`.
- `widgets/cart/ui/cart-item-row.tsx` — swap `addonServicesForItem(item)` for `item.availableAddons`
  (real, resolved data); toggle callbacks call the new feature's mutations.
- `widgets/cart/ui/cart-view.tsx` — delete the local `services` `useState` + `computeServicesTotal`;
  read `cart.totals.addonsTotal` directly (server-computed).
- `widgets/cart/ui/cart-summary.tsx` — `servicesTotal` prop replaced by reading `totals.addonsTotal`
  directly (prop surface simplifies).
- Delete `widgets/cart/model/addon-services.ts` once a repo-wide grep confirms zero remaining
  import.
- `shared/config/dictionary.ts` — new `dict.cart.addons.*` sub-namespace.

#### store-admin

- `entities/addon-service/` — re-exports generated types (mirrors `entities/brand/`).
- `features/addon-service-form/` — catalog RHF+zod form (`name`/`description`/`price`), mirrors
  `features/brand-form/ui/brand-form.tsx`; edit form uses `form.reset(...)` keyed to the entity id
  per `docs/conventions/forms.md` Rule 2b, not bare `defaultValues`.
- `features/category-addon-template-picker/` — multi-select of `AddonService` rows for a category's
  own template, embedded as a new section/tab in the existing `category-form`; shows a read-only
  "успадковано з «X»" note (via the `.../resolved` endpoint) when the category has no own template.
  Seeded from async data → Rule 2b guard.
- `features/product-addon-delta-panel/` — embedded in the existing `product-form`; lists the
  resolved set (via `resolved-for-product`) with a badge per entry (`шаблон` / `перевизначено` /
  `ексклюзив`) and inline actions: "прибрати" (creates a REMOVE delta on an inherited row),
  "власна ціна" (creates/edits an OVERRIDE delta), "скасувати" (clears any existing delta, on an
  overridden/removed row, reverting to inherited), plus a separate picker to ADD a new
  product-exclusive add-on. Seeded from async data → Rule 2b guard.
- `widgets/addon-service-list/` + `widgets/addon-service-form-view/` — catalog list/create/edit,
  mirrors `widgets/brand-list/`/`widgets/brand-form-view/`.
- `app/(dashboard)/addon-services/` — catalog list + `/new` + `/[id]/edit` routes + sidebar entry.
  Category-template and product-delta management live **inside** the existing category/product
  admin forms (no separate route) — this is a deliberate design choice: templates/deltas are
  properties _of_ a category/product, not independent entities an admin browses on their own.
- `shared/config/dictionary.ts` — new top-level `addonServices: { ... }` section (mirrors
  `brands`/`discounts`/`categories`), plus new keys inside the existing `categories`/`products`
  dictionary sections for the embedded template/delta panels.

## Money logic + resolver — TDD (critical module)

Per `AGENTS.md` §Testing Strategy and the `tdd` skill: Red→Green→Refactor, unit-tested before
wiring repository call sites. Two clusters — the resolver (pure logic, the "heart of the feature")
and the cart/order money math built on top of it.

### Resolver test cases (`AddonApplicabilityResolver`, both repositories mocked)

1. Category with its own template, no ancestors involved — returns exactly that template.
2. Subcategory with **no** own template, parent has one — inherits the parent's template
   (nearest-ancestor-wins, depth 1).
3. Deep tree: grandchild with no own template, parent has none either, grandparent has one —
   inherits from the grandparent (depth 2) — proves the walk doesn't stop at depth 1.
4. Subcategory that **does** define its own template, while an ancestor also has one — the
   subcategory's own template wins outright; the ancestor's set is not merged in at all (own-
   property shadowing, not inheritance-plus-merge).
5. Product with an ADD delta for a service not in its resolved template — the service appears in
   the output, marked `source: 'add'`, using the delta's own price when set or falling back to
   `AddonService.price` when the delta's `price` is null.
6. Product with a REMOVE delta for a service that **is** in its resolved template — the service is
   absent from the output.
7. Product with a REMOVE delta for a service that is **not** (any longer) in its resolved template
   — no-op, no error (dangling delta after a template change).
8. Product with an OVERRIDE delta for a service in its resolved template — the output entry for
   that service uses the delta's price, marked `source: 'override'`, not the template/catalog
   price.
9. Product with an OVERRIDE delta for a service **not** in its resolved template — no-op, no error
   (same dangling-delta tolerance as case 7).
10. Changing a category's template (adding/removing a `CategoryAddonTemplate` row) is immediately
    reflected for every product that inherits it and has no delta for that service — re-resolving
    without any other write shows the new set (proves the "live" link, not a copy).
11. A product with an OVERRIDE on a given service continues to show its own overridden price even
    after the category template's price context changes elsewhere — the override is unaffected by
    template edits to _other_ services (proves shadowing is per-entry, not "opt the whole product
    out of live updates").
12. Product with `categoryId: null` — resolves an empty base set; an ADD delta still surfaces (ADD
    is independent of any template, by design).
13. A service with `isActive: false` never appears in the resolved output, whether it would have
    come from the template, an ADD, or an OVERRIDE.
14. `resolveForProducts` (batched) returns identical per-product results to calling
    `resolveForProduct` individually for each product, for a mixed batch spanning several distinct
    categories and category-less products — pins behavioral parity between the two entry points.

### Cart/order money math test cases

15. `CartEntity.calculateTotals` — no selected add-ons → `addonsTotal` is `"0.00"`.
16. One selected add-on on one line → `addonsTotal` equals that add-on's **effective** (resolved)
    price, not multiplied by the line's `quantity`.
17. Two different add-ons selected on the same line → both effective prices sum.
18. The same add-on selected on two different lines → counted once per line (sums across lines).
19. `subtotal` is unaffected by `addonsTotal` — reported as separate `CartTotals` fields.
20. `CartService.toggleAddon` throws `BadRequestException` when `addonServiceId` is not in the
    resolved set for the item's product (covers: not templated, not ADDed, or REMOVEd).
21. `CartService.toggleAddon` is idempotent — selecting twice does not duplicate the
    `CartItemAddon` row; deselecting an unselected one is a no-op.
22. `OrderRepository.createFromCart` — an order from a cart with 2 lines, one with a selected
    add-on, produces `order.addonsTotal` equal to that add-on's effective price and
    `order.total = subtotal + shipping + addonsTotal - discount` (integer-cents arithmetic).
23. Snapshot integrity — after order creation, changing `AddonService.price`, the category
    template, or the product's delta does not change the already-created `OrderItemAddon.price`/
    `name` (re-fetch the order and assert the frozen values).
24. **Discount invariant (owner decision 4, hard requirement):** a cart with both a selected
    add-on and an applied coupon produces an order where the discount amount is computed and
    capped against `subtotal` alone — asserting `discount` is unchanged whether `addonsTotal` is
    `0` or a large value, and that `total` still equals
    `subtotal + shipping + addonsTotal - discount` (i.e. a coupon never reduces `addonsTotal`'s
    contribution to the payable total).
25. `OrderService.createOrder` silently drops (does not throw) an add-on that the resolver no
    longer returns for its product at order-creation time (deactivated / template changed /
    delta removed between cart-selection and checkout).

## Tasks (internal work breakdown — one BACKLOG row, TASK-174)

### TASK-174-A: Prisma schema + `CategoryRepository` ancestor-chain extension

**Type:** feat · **Scope:** store-api · **Complexity:** M (2-4h) · **TDD Required:** No (schema +
plumbing; the resolver built on top is TDD'd in 174-B) · **Depends on:** —

**Acceptance Criteria:**

- [ ] `AddonService`, `CategoryAddonTemplate`, `AddonServiceDelta` (+ `AddonDeltaType` enum),
      `CartItemAddon`, `OrderItemAddon` appended to the end of `schema.prisma`; `Order.addonsTotal`
      added inside the existing `Order` model
- [ ] `Category.addonTemplates`, `Product.addonDeltas`, `CartItem.addons`, `OrderItem.addons`
      back-relation fields added (the only four non-append edits, isolated to single lines)
- [ ] `CategoryRepository.findAncestorChainOrdered(categoryId)` + batched
      `findAncestorChainsOrdered(categoryIds)` added, extending the existing `findAncestorIds`
      recursive CTE with an ordered `depth` column; unit tests cover: root category (chain =
      `[self]`), deep chain ordering (self first, root last), non-existent id (matches
      `findAncestorIds`'s existing "self id always present" contract)
- [ ] `npx prisma generate` succeeds; `npx prisma db push` applied to the dev DB and `store_test`
- [ ] Seed script creates a few `AddonService` rows + a `CategoryAddonTemplate` on at least one
      parent category (to exercise inheritance in dev/QA without manual admin entry) + at least one
      `AddonServiceDelta` example (one of each type) on a seeded product
- [ ] `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma`
- `apps/store-api/src/category/category.repository.ts` (+ `.spec.ts`) — new ordered-chain methods
- `apps/store-api/prisma/seed.ts` (or equivalent)

---

### TASK-174-B: `AddonApplicabilityResolver` (TDD — the heart of the feature)

**Type:** feat · **Scope:** store-api · **Complexity:** L (4-8h) · **TDD Required:** Yes —
Red→Green→Refactor for all 14 resolver cases (§Money logic + resolver, cases 1–14) before any
controller/cart/order wiring consumes it · **Depends on:** TASK-174-A

**Acceptance Criteria:**

- [ ] All 14 resolver cases written RED first, then GREEN, then refactored
- [ ] `resolveForProduct`/`resolveForProducts` implemented exactly per §The resolver; both
      repositories (`AddonServiceRepository`, `CategoryRepository`) are constructor-injected and
      fully mocked in the resolver's own spec file (no real DB in this task's unit tests)
- [ ] `resolveForProducts` demonstrably issues a bounded number of queries regardless of cart line
      count (asserted via mock call-count, not just result correctness) — no-N+1
- [ ] `npm run test -w apps/store-api -- addon-applicability` green
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/addon-service/addon-applicability.resolver.ts` (+ `.spec.ts`)

---

### TASK-174-C: `AddonService` backend module (catalog CRUD + template/delta admin endpoints)

**Type:** feat · **Scope:** store-api · **Complexity:** L (4-8h) · **TDD Required:** No (CRUD
scaffolding; standard unit coverage still required) · **Depends on:** TASK-174-B

**Acceptance Criteria:**

- [ ] `AddonServiceRepository`/`AddonServiceService`/`AddonServiceController`/
      `AdminAddonServiceController` implemented per §Backend, mirroring
      `apps/store-api/src/brand/` for the catalog-CRUD half
- [ ] `PATCH /addon-services/templates/category/:categoryId` full-replaces `CategoryAddonTemplate`
      rows transactionally; unit tests cover add/remove/no-op(same list)/clear-to-empty
- [ ] `GET /addon-services/templates/category/:categoryId/resolved` returns the correct
      `source`/`sourceCategoryId` for: own template, inherited template, no template anywhere in
      the chain
- [ ] `PUT`/`DELETE /addon-services/deltas/product/:productId/:addonServiceId` upsert/clear one
      delta row; `SetProductDeltaDto` requires `price` when `type === 'OVERRIDE'`
      (`@ValidateIf`), rejects it for `REMOVE`
- [ ] Boolean `isActive` query param uses the `obj[key]` `@Transform` workaround (memory note
      `boolean-query-dto-implicit-conversion`); regression test asserts `?isActive=false` is not
      coerced to `true`
- [ ] `AdminGuard` applied to every admin-prefixed route; public routes have zero auth
- [ ] Swagger decorators complete on every route so Orval generation succeeds
- [ ] Unit tests: repository, service, both controllers — mirrors
      `brand.repository.spec.ts`/`brand.service.spec.ts`/`brand.controller.spec.ts` structure
- [ ] Tests pass: `npm run test -w apps/store-api -- addon-service`
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/addon-service/addon-service.module.ts`
- `apps/store-api/src/addon-service/addon-service.repository.ts` (+ `.spec.ts`)
- `apps/store-api/src/addon-service/addon-service.service.ts` (+ `.spec.ts`)
- `apps/store-api/src/addon-service/addon-service.controller.ts` (+ `.spec.ts`)
- `apps/store-api/src/addon-service/admin-addon-service.controller.ts` (+ `.spec.ts`)
- `apps/store-api/src/addon-service/dto/*.ts`
- `apps/store-api/src/addon-service/entities/*.ts`
- `apps/store-api/src/addon-service/index.ts`
- `apps/store-api/src/app.module.ts` — register `AddonServiceModule`

---

### TASK-174-D: Cart persistence + money logic (TDD)

**Type:** feat · **Scope:** store-api · **Complexity:** L (4-8h) · **TDD Required:** Yes — cases
15–21 · **Depends on:** TASK-174-C

**Acceptance Criteria:**

- [ ] Cases 15–21 written RED first, then GREEN, then refactored
- [ ] `CartItemEntity.availableAddons`/`selectedAddonIds` populated via
      `AddonApplicabilityResolver.resolveForProducts` (batched, one call per `GET /cart`) — no
      N+1 verified as in TASK-174-B
- [ ] `CartTotals.addonsTotal` correct in the `GET /cart` response
- [ ] `POST`/`DELETE /cart/items/:itemId/addons/:addonServiceId` implemented, validate-before-
      write (case 20), idempotent (case 21)
- [ ] Guest-cart merge (`CartService.mergeGuestCart`) carries `CartItemAddon` rows across —
      documented collision rule (recommend: union of selected add-ons across the merged carts,
      filtered to whatever the resolver still allows post-merge) — new test case in
      `cart.service.spec.ts`
- [ ] `npm run test -w apps/store-api -- cart` green
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/cart/cart.repository.ts`, `cart.service.ts`, `cart.controller.ts`
- `apps/store-api/src/cart/entities/cart-item.entity.ts`, `entities/cart.entity.ts`
- Corresponding `.spec.ts` files — new cases

---

### TASK-174-E: Order snapshot persistence + money logic (TDD)

**Type:** feat · **Scope:** store-api · **Complexity:** M (2-4h) · **TDD Required:** Yes — cases
22–25, including the hard discount invariant (case 24) · **Depends on:** TASK-174-D

**Acceptance Criteria:**

- [ ] Cases 22–25 written RED first, then GREEN, then refactored
- [ ] `OrderRepository.createFromCart` snapshots `OrderItemAddon` rows atomically inside the
      existing transaction (order/`OrderItem`/stock-decrement/discount-redeem/mail-outbox writes)
- [ ] `Order.addonsTotal` derived via integer-cents arithmetic and folded into `order.total`;
      discount is computed/clamped against `subtotal` only (case 24 — hard invariant, not a
      configurable path)
- [ ] `OrderItemEntity.addons`/`OrderEntity.addonsTotal` exposed in customer and admin order read
      paths
- [ ] `npm run test -w apps/store-api -- order` green (unit only in-worktree; e2e/int run on
      `develop` after merge)
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/order/order.repository.ts`, `order.types.ts`, `order.service.ts`
- `apps/store-api/src/order/entities/*.ts`
- `apps/store-api/src/order/order.repository.spec.ts` — new cases

---

### TASK-174-F: API contract regeneration

**Type:** chore · **Scope:** shared · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-174-C, TASK-174-D, TASK-174-E

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` succeeds
- [ ] `npm run generate:api` regenerates Orval hooks in both `store-client` and `store-admin`
- [ ] Generated `AddonServiceEntity`, `ResolvedAddonEntity`, `AddonServiceDeltaEntity`, etc. present
      in both apps' generated trees
- [ ] No manual edits committed inside `shared/api/generated/` in either app

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/**` (gitignored)
- `apps/store-admin/src/shared/api/generated/**` (gitignored)

---

### TASK-174-G: store-client — replace the cart add-on stub with real hooks

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-4h) · **TDD Required:** No (RTL
component tests required) · **Depends on:** TASK-174-F

**Acceptance Criteria:**

- [ ] `cart-item-row.tsx` renders `item.availableAddons`; toggle calls
      `features/cart-addon-toggle` mutations instead of local `setServices`
- [ ] `cart-view.tsx` — local `services` state + `computeServicesTotal` removed;
      `cart.totals.addonsTotal` read directly
- [ ] `cart-summary.tsx` — `servicesTotal` prop replaced by reading `totals.addonsTotal` directly
- [ ] `widgets/cart/model/addon-services.ts` deleted once a repo-wide grep confirms no remaining
      import
- [ ] Optimistic update + `invalidateQueries(getGetCartQueryKey())` on toggle mutations
- [ ] New `dict.cart.addons.*` keys; existing `dict.cart.addonServicesLine` kept or updated based
      on what `cart-summary.test.tsx` still asserts (verify at implementation time)
- [ ] Cart RTL specs updated to mock the new Orval hooks (MSW) instead of local `useState`
- [ ] `npm run test -w apps/store-client` green (verify with `--runInBand` if parallel-flaky, per
      memory note `store-client-jest-parallel-flake`)
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/entities/addon-service/`
- `apps/store-client/src/features/cart-addon-toggle/`
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`, `cart-view.tsx`, `cart-summary.tsx`
- `apps/store-client/src/widgets/cart/model/addon-services.ts` — deleted
- `apps/store-client/src/shared/config/dictionary.ts`
- Cart widget test files — updated

---

### TASK-174-H: store-admin — catalog CRUD + category-template panel

**Type:** feat · **Scope:** store-admin · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** TASK-174-F

**Acceptance Criteria:**

- [ ] `/addon-services` list + `/new` + `/[id]/edit` (catalog CRUD), mirrors `widgets/brand-list/`/
      `widgets/brand-form-view/`; sidebar entry added
- [ ] `features/category-addon-template-picker` embedded in the existing category-form: multi-
      select of active `AddonService` rows for the category's own template; shows "успадковано з
      «X»" read-only note when the category has no own template (via the `.../resolved`
      endpoint); Rule 2b guard if seeded from async "currently assigned" data
- [ ] New `dict.addonServices` top-level section + new keys in the `categories` dictionary section
      for the embedded panel, all UA with plain-language hints
- [ ] RTL specs for the catalog form (schema validation) and the template picker (render + save)
- [ ] `npm run test -w apps/store-admin` green
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/entities/addon-service/`
- `apps/store-admin/src/features/addon-service-form/`
- `apps/store-admin/src/features/category-addon-template-picker/`
- `apps/store-admin/src/widgets/addon-service-list/`, `widgets/addon-service-form-view/`
- `apps/store-admin/src/app/(dashboard)/addon-services/{page.tsx,new/page.tsx,[id]/edit/page.tsx}`
- `apps/store-admin/src/features/category-form/ui/category-form.tsx` — embed the picker
- `apps/store-admin/src/shared/config/dictionary.ts`
- Admin sidebar config file

---

### TASK-174-I: store-admin — product-delta panel

**Type:** feat · **Scope:** store-admin · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** TASK-174-H (shares dictionary/patterns established there)

**Acceptance Criteria:**

- [ ] `features/product-addon-delta-panel` embedded in the existing product-form: resolved list
      with `шаблон`/`перевизначено`/`ексклюзив` badges per entry; inline "прибрати"/"власна
      ціна"/"скасувати" actions wired to `PUT`/`DELETE /addon-services/deltas/product/:id/:addonId`;
      separate picker to ADD a new exclusive add-on
- [ ] Rule 2b guard applied (seeded from async resolved-list data)
- [ ] RTL specs: badge rendering per source, REMOVE/OVERRIDE/ADD/clear actions each call the right
      endpoint with the right payload
- [ ] `npm run test -w apps/store-admin` green
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/features/product-addon-delta-panel/`
- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — embed the panel
- `apps/store-admin/src/shared/config/dictionary.ts` — `products` section additions

---

### TASK-174-J: manual QA / smoke pass

**Type:** test · **Scope:** shared · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-174-G, TASK-174-I

**Acceptance Criteria:**

- [ ] On a running stack: admin sets a category template on a parent category; a product in a
      subcategory with no own template shows the inherited add-ons in its cart line; admin adds an
      exclusive (ADD) add-on to one product — only that product shows it; admin overrides an
      inherited add-on's price on one product — cart shows the overridden price for that product
      only, unchanged elsewhere; admin removes an inherited add-on from one product — it disappears
      from that product's cart line only; toggling add-ons on/off persists across reload and guest→
      user merge; placing an order with a coupon + a selected add-on shows the discount reducing
      only the product subtotal, not the add-on line; changing the category template afterwards
      does not change the already-placed order
- [ ] Result appended to `docs/manual-qa-pending.md` as a `### TASK-174` block

**Files to create/modify:**

- `docs/manual-qa-pending.md` — append-only `### TASK-174` block

## Migration Steps

1. TASK-174-A — schema + `CategoryRepository` extension.
2. TASK-174-B — resolver, TDD.
3. TASK-174-C — catalog + template/delta admin endpoints.
4. TASK-174-D — cart persistence + TDD money logic.
5. TASK-174-E — order snapshot persistence + TDD money logic (incl. the discount invariant).
6. TASK-174-F — Orval regeneration.
7. TASK-174-G ∥ TASK-174-H ∥ TASK-174-I — storefront rewiring and the two admin panels (H before I
   — I reuses dictionary/patterns H establishes; G is fully independent of both).
8. TASK-174-J — manual smoke pass.
9. Full gates on `develop` after merge: typecheck/lint/build all workspaces; store-api unit + e2e
   (`--runInBand`) + `test:int` against `store_test`; store-client/store-admin unit tests;
   Playwright against `store_test` (cart/checkout flows now touch add-ons).

## Risks & Mitigations

| Risk                                                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope size** — this plan grew from a flat M2M (rev. 1) to a resolver + two admin panels (rev. 2); TASK-174-B through 174-I is substantially more than a typical single-sitting task                              | Flagged here per the owner's instruction, not acted on unilaterally: if a single worktree/agent session proves impractical, the natural split point is TASK-174-A/B (schema + resolver, the load-bearing core) landing first, with 174-C…J following in a continuation of the same branch — still one BACKLOG row, just spread over more than one working session. No new BACKLOG task ID is proposed |
| A dangling `AddonServiceDelta` (REMOVE/OVERRIDE targeting a service no longer in the resolved template) could be mistaken for a bug rather than the intentional no-op it is                                        | Explicitly covered by resolver cases 7 and 9, and documented in the resolver's TSDoc; the admin product-delta panel should visually distinguish "this override/removal is currently inert" (a possible follow-up polish item, not blocking this plan)                                                                                                                                                 |
| `resolveForProducts`' batching (group-by-category, one CTE over the distinct id set) is more complex than a naive per-product loop, risking a subtle correctness gap between batched and single-product resolution | Resolver case 14 pins exact parity between `resolveForProduct` and `resolveForProducts` for a mixed batch — any batching bug fails that test before it reaches the cart                                                                                                                                                                                                                               |
| Guest-cart merge collision rule for `CartItemAddon` (two carts select different add-ons for "the same" line) is unspecified in detail                                                                              | Default to **union**, filtered through the resolver post-merge (an add-on that's no longer resolvable for the merged line's product is dropped, not carried over blindly) — document the chosen rule in `CartService.mergeGuestCart`'s TSDoc once implemented                                                                                                                                         |
| Deleting `widgets/cart/model/addon-services.ts` before every import is migrated leaves a broken build                                                                                                              | TASK-174-G requires a repo-wide grep confirming zero imports before deletion, sequenced last within that task                                                                                                                                                                                                                                                                                         |
| Embedding the template/delta panels inside the existing `category-form`/`product-form` risks bloating already-large form components                                                                                | Each panel is its own `features/*` component, imported and rendered as a section/tab — the host form only gains one import + one render call, not inline logic                                                                                                                                                                                                                                        |

## Notes

- `AddonService` and `Product` remain **separate, joined** entities (via `AddonServiceDelta`/
  `CategoryAddonTemplate`), not pseudo-products in the `Product` table — a `Product` carries stock/
  images/categories/SEO/device-compat/specs that don't apply to a warranty certificate.
- The stub's price-threshold heuristic (`price >= 2000`) is fully replaced by the resolver — no
  automatic price-based rule is kept, per the owner's per-product/per-category-only decision.
- `dict.cart.addonServicesLine` (the totals-line label) may or may not need a wording change once
  real data drives the line — verify against `cart-summary.test.tsx` at implementation time.
- TASK-286 (owner-parked, "discounts on add-on services") is out of this plan's scope entirely;
  nothing here should be built in a way that makes that future task harder, but nothing here
  implements it either.
