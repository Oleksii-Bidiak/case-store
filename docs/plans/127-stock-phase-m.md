# Plan 127 — Stock Phase M: derived reserved/physical stock (admin contract only)

> **Status:** ✅ Done (2026-07-08)
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 3** (Функціональні прогалини + SEO-зручність), **Block B**
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-254

## Overview

This is **Phase M** ("derived reserved в адмін-API + UI") of the available/reserved inventory
discovery in [`docs/plans/101-inventory-available-reserved.md`](101-inventory-available-reserved.md)
§6, following **Phase S** (TASK-253, `docs/plans/126-stock-phase-s.md`) which shipped the "Вільний
залишок" terminology rename this plan's UI builds on top of.

Discovery §3 settled the core design question — **derived (variant a) over stored (variant b)**:
`reservedQty` is computed on read via one `OrderItem.groupBy` aggregate, never written or migrated
onto `Product`. The winning argument: reserved is a purely informational admin-panel number (sales
are still gated by `stock`, never by `reservedQty`), so paying the denormalization-drift risk of a
stored counter — which would need every current _and future_ order-status transition to remember to
maintain it, exactly the kind of bug TASK-228 already proved this codebase can ship — buys nothing.

**Reserved** = Σ `OrderItem.quantity` across an order's items, for orders whose `status IN
(PENDING, CONFIRMED, PROCESSING)` (the same `PRE_SHIPMENT_STATUSES` set `order.service.ts` already
uses for auto-restock) and `deletedAt IS NULL`. **Physical** = `stock + reservedQty` (derived
arithmetic, not a second query). This plan surfaces both numbers in the **admin contract only** —
the public storefront contract (`PublicProductEntity`) is untouched, exactly as it already hides
raw `stock` today.

A grounding pass on the current admin product-list code path surfaced a real gap this plan must
close to deliver the UI the discovery calls for: **the admin product LIST does not currently return
the full `ProductEntity`** (with raw `stock`) at all — `adminFindAll` → `listFromDb` maps every row
to `PublicProductEntity` (no `stock`, only booleans), the _same_ private helper the public `findAll`
uses. Only `findById` (edit form) and `findBySlugForAdminPreview` (staff preview) return
`ProductEntity`. So the "Вільно/Резерв/Фізично" list column cannot be built by reading fields off
what the list endpoint returns today — Task A/B below fix that as part of delivering the derivation.

## User Stories

1. As the store owner, when I open the products table, I want to see at a glance how much of each
   product is free to sell vs. tied up in unshipped orders vs. physically on the shelf, so I know
   whether "low stock" means "reorder now" or "actually fine, it's just reserved."
2. As the store owner, when I open a single product to edit it, I want the same breakdown next to
   the stock field, so editing the number doesn't require me to first go check the order list.
3. As the store owner, when I look at an order that's still PENDING/CONFIRMED/PROCESSING, I want to
   see that it's holding stock (and, once it's been auto-cancelled and restocked, when that
   happened), so the numbers on the product page make sense when I cross-reference them.

## Scope

### In Scope

- A shared `PRE_SHIPMENT_STATUSES` constant (extracted from `order.service.ts` into a new
  `order.constants.ts`) reused by both the existing auto-restock logic and this plan's new
  derivation query — single source of truth for "which order statuses still hold stock."
- `ProductRepository.getReservedQtyByProductId(productIds)` — one `OrderItem.groupBy` aggregate,
  filtered to pre-shipment, non-deleted orders. **TDD required** (critical inventory module):
  Red→Green→Refactor on the repository spec, with explicit unit coverage for the three edge cases
  discovery §5 names — revive, soft-deleted orders, SHIPPED exclusion.
- `ProductEntity` gains `reservedQty`/`physicalQty` (derived, always-present numbers — mirrors the
  existing `ratingAverage`/`ratingCount` optional-input-defaulting pattern already on this entity).
- The admin product **list** endpoint (`GET /products/admin/list` / `adminFindAll`) switches from
  building `PublicProductEntity[]` to building `ProductEntity[]` (closing the gap above), enriched
  with the derived `reservedQty`/`physicalQty` for the page. New Swagger envelope
  (`AdminProductListResponseEnvelope`) + a `stock` sort option added to the existing
  `sortBy` allow-list (discovery §4: "сортовану за «Вільно»").
- The admin product **detail** (`findById`, used by the edit form) and **preview**
  (`findBySlugForAdminPreview`) paths are enriched the same way — same derivation call, one product
  id.
- `OrderEntity` gains `restockedAt` (the column already exists on `Order` and is already selected
  by every Prisma read via `ORDERS_INCLUDE`/`ADMIN_ORDERS_INCLUDE` — `OrderEntity.fromPrisma` simply
  never copied it onto the entity until now).
- Admin UI: «Вільно / Резерв / Фізично» composite column in `admin-product-table.tsx`
  (sortable on "Вільно"/`stock`); a dynamic breakdown line in `product-form.tsx` under the stock
  field (edit mode only); the same three numbers in `admin-product-preview-view.tsx`.
- Admin UI: `/orders/[id]` gains a "Тримає залишок: N шт" badge while the order is pre-shipment
  (holds computed **client-side** from `order.items` — no new backend field needed for the count
  itself, only `restockedAt` is new on the wire) and a "Залишок повернуто HH:MM" badge once
  `restockedAt` is set.
- Orval regen (both `store-admin` consumers) for the widened `ProductEntity`/`OrderEntity` and the
  new `AdminProductListResponseEnvelope` — performed **once**, by the orchestrator, after both
  TASK-253 and TASK-254 merge to `develop` (see Dependencies & Sequencing — implementers run
  `npm run generate-api` locally to develop/test against the new fields but do not commit the
  regenerated files themselves).

### Out of Scope

- Any `Product.reservedQty` (or similar) **stored** column, or any migration — this is discovery
  §3's explicitly rejected variant (b). If a future need for a hot public read path or
  million-row reporting appears, that migration's backfill query _is_ this plan's derivation query
  (discovery §3), so nothing here is wasted if that day comes.
- An `OrderItem(productId)` index. Discovery §3 flags it as a cheap _optional_ future addition "за
  потреби" (if the derivation query is ever observed to be slow) — this store's scale (single shop,
  admin-only reads, tens/hundreds of orders) does not need it today, and the BACKLOG task title is
  explicit: **"no schema change."** Left as a documented, easy follow-up (see Risks).
- Any storefront (`store-client`) change. `PublicProductEntity` is not touched by this plan at all —
  it never exposed raw `stock` and still exposes none of `reservedQty`/`physicalQty` either.
- A `StockMovement` ledger (who/when/how much, including manual adjustments) — that is discovery
  §6's explicitly deferred **Phase L**, parked pending real need.
- Changing any order-status-transition business logic (`shouldAutoRestock`, `cancelAndRestock`,
  `reviveAndReserve`). This plan only _reads_ the consequences of that logic (via the derived
  aggregate and the already-existing `restockedAt` column); TASK-228's fix is untouched.
- Renaming any further dictionary copy beyond what's needed for the new fields — TASK-253 already
  did the "Запас"→"Вільний залишок" rename this plan's UI builds on.

## Technical Design

### Design Decision 1 — derived aggregate, shared status set (discovery §3, confirmed)

```ts
// order.constants.ts (NEW — extracted from order.service.ts)
export const PRE_SHIPMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
]);
```

`order.service.ts` imports this instead of declaring its own local (unexported) copy — the
auto-restock guard (`shouldAutoRestock`) and this plan's reserved-derivation query now read from
one place, closing the drift risk discovery §3 names as variant (b)'s core weakness (had this
project chosen the stored-column approach). `product.repository.ts`:

```ts
async getReservedQtyByProductId(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await this.prisma.orderItem.groupBy({
    by: ['productId'],
    where: {
      productId: { in: productIds },
      order: { status: { in: [...PRE_SHIPMENT_STATUSES] }, deletedAt: null },
    },
    _sum: { quantity: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.productId, row._sum.quantity ?? 0);
  return map;
}
```

This is a direct sibling of the existing `getUnitsSoldByProductId` (TASK-164, same file) — same
shape, same empty-input short-circuit, same "absent from the map = zero" contract. `physicalQty` is
never a second query: `physicalQty = stock + (reservedQty ?? 0)`, computed once the two numbers are
in hand (entity-level arithmetic, see Design Decision 2).

Why a live pre-shipment order is always correctly counted regardless of the `restockedAt` flag
(TASK-228): a _live_ PENDING/CONFIRMED/PROCESSING order **never** has `restockedAt` set — only a
CANCELLED order (excluded from `PRE_SHIPMENT_STATUSES` regardless) can carry it, and `revive`
clears it back to `null` the moment the order returns to a live status. So this query correctly
needs **no** `restockedAt` filter at all — a revived order is, to this query, indistinguishable
from any other live pre-shipment order, which is exactly correct. The TDD task below pins this as
an explicit test rather than leaving it as an implicit assumption.

### Design Decision 2 — `ProductEntity` enrichment mirrors the existing `ratingAverage`/`ratingCount` pattern

`ProductEntity` already documents that `ratingAverage`/`ratingCount` are "optional on the input,
always present on the output" — enriched by list/detail reads, defaulted (`null`/`0`) by
mutation-echo reads (create/update/activate/deactivate/delete) that don't bother re-querying an
aggregate for a value the mutation itself didn't change. `reservedQty`/`physicalQty` follow the
identical shape, extending the same docstring:

```ts
// ProductEntity.fromPrisma input gains:
reservedQty?: number;
// assignment:
entity.reservedQty = product.reservedQty ?? 0;
entity.physicalQty = entity.stock + entity.reservedQty;
```

Both fields are **non-optional** on the class (`reservedQty!: number; physicalQty!: number;`) —
consistent with `ratingAverage`/`ratingCount`, this keeps the Swagger schema and the generated Orval
type simple (`number`, never `number | undefined`) rather than introducing a new optionality
pattern the codebase doesn't otherwise use on this entity. Call sites that don't pass `reservedQty`
(create/update/activate/deactivate/delete — none of which changed the order book) get `reservedQty:
0, physicalQty: stock` — accurate in the overwhelming majority of cases (a product rarely has active
reservations at the moment it's being created/toggled) and, where it's momentarily stale (an admin
edits a product's other fields while it has live reservations), self-heals on the next list/detail
read, exactly like `ratingAverage` already does today for the same class of call site.

### Design Decision 3 — closing the admin-list gap: `adminFindAll` returns `ProductEntity[]`, not `PublicProductEntity[]`

`listFromDb` (the private helper both `findAll` and `adminFindAll` currently share) is **not**
touched — the public path keeps building `PublicProductEntity[]` exactly as today. A new private
`listFromDbForAdmin(params)` is added instead, used **only** by `adminFindAll`:

```ts
private async listFromDbForAdmin(params: FindAllParams): Promise<AdminPaginatedProductsResponse> {
  const { products, total } = await this.productRepository.findAll(params);
  const reservedByProductId = await this.productRepository.getReservedQtyByProductId(
    products.map((p) => p.id),
  );
  return {
    data: products.map((product) =>
      ProductEntity.fromPrisma({
        ...product,
        reservedQty: reservedByProductId.get(product.id) ?? 0,
      }),
    ),
    meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) },
  };
}
```

`productRepository.findAll` itself is **unchanged** — both list paths keep sharing the exact same
paginated query/filter/sort logic (category rollup, brand filter, spec facet, bestselling ranking);
only the _entity-building_ step diverges, and only for the admin path. This was confirmed safe by
checking every current consumer of `useProductControllerAdminFindAll` in `store-admin`:
`admin-product-table.tsx` is the **only** place that reads `.data` items (name/categoryId/price/
isActive/createdAt — none of which change shape); every other call site
(`product-status-toggle.tsx`, `edit-product-view.tsx`, `create-product-view.tsx`) only reads the
query **key** for cache invalidation and never touches `.data`, so switching the item shape from
`PublicProductEntity` (with `variantSummary`, `inStock`, `lowStock`) to `ProductEntity` (with raw
`stock`, `isActive`, `reservedQty`, `physicalQty`) is a safe, additive-for-admin-consumers change.

New response envelope, sibling to the existing `ProductListResponseEnvelope`:

```ts
class AdminProductListResponseEnvelope {
  @ApiProperty({
    type: [ProductEntity],
    description: "Products for the current page (admin, all statuses)",
  })
  data!: ProductEntity[];
  @ApiProperty({ type: PaginationMeta })
  meta!: PaginationMeta;
}
type AdminProductListResponse = { data: ProductEntity[]; meta: PaginationMeta };
```

`GET /products/admin/list`'s `operationId` (`productControllerAdminFindAll`) is **unchanged**, so
the Orval hook name in `store-admin` stays `useProductControllerAdminFindAll` — only its generated
response type widens (additively) after the regen. Sort: `ProductListQueryDto.sortBy`'s `@IsIn`
allow-list gains `'stock'`; `product.repository.ts`'s `findPageByColumn` allow-list gains
`stock: 'stock'`, so `?sortBy=stock&sortOrder=asc` sorts the admin list by available stock — the
"Вільно" sort discovery §4 asks for. (The public `findAll` DTO shares `ProductListQueryDto`, so
`stock` becomes a technically-valid sort value there too; harmless — the public list already omits
raw `stock` from its response, and sorting by an unexposed field is a no-op UX-wise, not a leak,
since `PublicProductEntity` still derives only `inStock`/`lowStock` booleans.)

### Design Decision 4 — `restockedAt` needed on the wire; "holds N units" is not

`Order.restockedAt` is already selected on every repository read (it's a plain scalar column, not
excluded by any `select`) — `OrderEntity.fromPrisma` is the only place it was being dropped. Adding
`entity.restockedAt = order.restockedAt;` is the entire backend change for Task C. The "Тримає
залишок: N шт" **count**, by contrast, needs no new backend field at all: `OrderEntity.items`
already carries every line's `quantity`, so the admin widget computes
`items.reduce((sum, i) => sum + i.quantity, 0)` client-side, gated on
`isPreShipmentStatus(order.status) && order.restockedAt == null`. A small pure
`isPreShipmentStatus()` helper is added to `entities/order` (frontend mirror of the backend
`PRE_SHIPMENT_STATUSES` set, unit-tested) rather than duplicating the sum-and-gate logic inline in
the widget.

## Tasks

### TASK-254-A: Shared pre-shipment status set + derived `reservedQty` repository method (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** **Yes** — critical inventory-derivation logic. Red→Green→Refactor on
`product.repository.spec.ts`.
**Depends on:** —

**TDD sequence:**

1. **Red:** add a new `describe('getReservedQtyByProductId')` block to `product.repository.spec.ts`
   with the failing assertions below (method doesn't exist yet).
2. **Green:** extract `order.constants.ts`, implement `getReservedQtyByProductId` exactly per
   Design Decision 1, make the new tests pass.
3. **Refactor:** confirm `order.service.ts`'s existing `updateStatus`/`shouldAutoRestock` tests
   (`order.service.spec.ts`) still pass unmodified after switching to the imported constant (pure
   mechanical extraction, no behavior change) — this is the safety net proving the extraction didn't
   regress TASK-228's auto-restock/revive logic.

**Acceptance Criteria:**

- [ ] `apps/store-api/src/order/order.constants.ts` (new): exports `PRE_SHIPMENT_STATUSES` (moved
      verbatim from `order.service.ts`, including its doc comment)
- [ ] `order.service.ts` imports `PRE_SHIPMENT_STATUSES` from `./order.constants` instead of
      declaring its own local copy; `shouldAutoRestock` unchanged otherwise
- [ ] `ProductRepository.getReservedQtyByProductId(productIds: string[]): Promise<Map<string, number>>`
      added, mirroring `getUnitsSoldByProductId`'s shape (empty-input short-circuit returns `new
  Map()` without touching Prisma)
- [ ] Unit test: empty `productIds` array returns an empty `Map` without calling
      `prismaMock.orderItem.groupBy`
- [ ] Unit test: asserts the exact `groupBy` call shape —
      `where.order.status.in` equals `[PENDING, CONFIRMED, PROCESSING]` (not `SHIPPED`/`DELIVERED`/
      `CANCELLED`/`REFUNDED` — pins the "SHIPPED виключено" edge case from discovery §5) and
      `where.order.deletedAt === null` (pins "soft-deleted" exclusion)
- [ ] Unit test: asserts the `where` clause has **no** `restockedAt` key at all — pins the "revive"
      edge case from discovery §5 (a revived order counts identically to any other live
      pre-shipment order; there is nothing revive-specific to filter on)
- [ ] Unit test: given mocked `groupBy` rows `[{ productId: 'a', _sum: { quantity: 3 } }, { productId:
  'b', _sum: { quantity: null } }]`, the returned `Map` has `a → 3` and `b → 0` (defensive
      `_sum.quantity ?? 0`, mirroring `getUnitsSoldByProductId`) and a requested `productId` absent
      from the rows is simply absent from the map (not `0`)
- [ ] `apps/store-api/src/product/product.repository.spec.ts`: `prismaMock` gains
      `orderItem: { groupBy: jest.fn() }`
- [ ] `apps/store-api/src/order/order.service.spec.ts`: full suite green unmodified (proves the
      constant extraction is behavior-neutral)
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/order/order.constants.ts` — new
- `apps/store-api/src/order/order.service.ts` — import the extracted constant, remove local copy
- `apps/store-api/src/product/product.repository.ts` — new `getReservedQtyByProductId`
- `apps/store-api/src/product/product.repository.spec.ts` — new describe block + `prismaMock`
  extension

---

### TASK-254-B: `ProductEntity` enrichment + admin list/detail/preview wiring + Swagger contract

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No — entity/service wiring around an already-TDD'd repository method; covered by
unit specs per the acceptance criteria below.
**Depends on:** TASK-254-A (needs `getReservedQtyByProductId`)

**Acceptance Criteria:**

- [ ] `ProductEntity` gains `reservedQty!: number` and `physicalQty!: number` `@ApiProperty` fields
      (per Design Decision 2); `fromPrisma`'s input type gains optional `reservedQty?: number`;
      docstring extended to describe the same optional-input/always-present-output contract already
      documented for `ratingAverage`/`ratingCount`
- [ ] New `apps/store-api/src/product/entities/product.entity.spec.ts` (none exists today): asserts
      `fromPrisma({ ...base, reservedQty: 3, stock: 5 })` → `reservedQty: 3, physicalQty: 8`, and
      `fromPrisma({ ...base, stock: 5 })` (no `reservedQty` in the input) → `reservedQty: 0,
  physicalQty: 5`
- [ ] `product.service.ts` `findById`: after `productRepository.findById(id)`, calls
      `getReservedQtyByProductId([product.id])` and passes the resolved value into
      `ProductEntity.fromPrisma`
- [ ] `product.service.ts` `findBySlugForAdminPreview`: same enrichment, one product id
- [ ] `product.service.ts`: new private `listFromDbForAdmin(params)` per Design Decision 3;
      `adminFindAll` calls it instead of the shared `listFromDb`; return type changes from
      `PaginatedProductsResponse` (alias) to a new `AdminPaginatedProductsResponse { data:
  ProductEntity[]; meta: PaginationMeta }`
- [ ] `product.controller.ts`: new `AdminProductListResponseEnvelope` (`data: [ProductEntity]`);
      `adminFindAll`'s `@ApiResponse({ type: ... })` and return type
      (`Promise<AdminProductListResponse>`) updated; `operationId` (`productControllerAdminFindAll`)
      **unchanged**
- [ ] `ProductListQueryDto.sortBy`'s `@IsIn([...])` allow-list gains `'stock'`;
      `product.repository.ts`'s `findPageByColumn` `allowedSortFields` map gains `stock: 'stock'`
- [ ] `product.service.spec.ts` `adminFindAll` describe block: extended with a mock for
      `productRepositoryMock.getReservedQtyByProductId` (mirrors the existing
      `productRepositoryMock.findAll` mock pattern already in this file); new assertions that (a)
      `result.data[0]` is an instance of `ProductEntity` (not `PublicProductEntity` — pins the gap
      fix), (b) `result.data[0].reservedQty`/`physicalQty` reflect the mocked aggregate
- [ ] `product.service.spec.ts` `findById`/`findBySlugForAdminPreview` describe blocks: extended
      with the same mock + assertion pattern
- [ ] **Do not** commit `apps/store-admin/src/shared/api/generated/**` diffs from this task — run
      `npm run generate-api` locally only to develop/verify types against; the orchestrator performs
      one consolidated regen commit after TASK-253 + TASK-254 both merge to `develop` (see plan
      Dependencies)
- [ ] `npm run typecheck`/`lint` + `npm run build` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/product/entities/product.entity.ts` — `reservedQty`/`physicalQty`
- `apps/store-api/src/product/entities/product.entity.spec.ts` — new
- `apps/store-api/src/product/product.service.ts` — `findById`, `findBySlugForAdminPreview`,
  new `listFromDbForAdmin`, `adminFindAll` return type
- `apps/store-api/src/product/product.service.spec.ts` — mock + assertion extensions
- `apps/store-api/src/product/product.controller.ts` — `AdminProductListResponseEnvelope`,
  `adminFindAll` response type
- `apps/store-api/src/product/dto/product-list-query.dto.ts` — `sortBy` allow-list gains `'stock'`
- `apps/store-api/src/product/product.repository.ts` — `findPageByColumn` sort-field map gains
  `stock`

---

### TASK-254-C: `OrderEntity.restockedAt`

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — a single field pass-through of an already-selected column; covered by a unit
spec.
**Depends on:** — (independent of A/B; can run in parallel)

**Acceptance Criteria:**

- [ ] `OrderEntity` gains `restockedAt!: Date | null` with a descriptive `@ApiProperty`
      (`nullable: true`) referencing TASK-228
- [ ] `OrderEntity.fromPrisma`: `entity.restockedAt = order.restockedAt;` (the field is already
      present on every `OrderWithItems` row via `ORDERS_INCLUDE`/`ADMIN_ORDERS_INCLUDE` — no
      repository query change needed)
- [ ] `order.entity.spec.ts` (or the nearest existing entity-mapping spec if one covers
      `OrderEntity.fromPrisma` already — extend it rather than duplicating a new file if so):
      asserts `restockedAt` round-trips both when `null` and when a `Date`
- [ ] **Do not** commit `apps/store-admin/src/shared/api/generated/**` diffs from this task (see
      TASK-254-B's note — same consolidated-regen rule applies)
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/order/entities/order.entity.ts` — `restockedAt` field + mapping
- `apps/store-api/src/order/entities/order.entity.spec.ts` — new, or extend nearest existing spec

---

### TASK-254-D: Admin product UI — list column, product-form breakdown, preview

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — presentational wiring around an already-tested backend contract; covered by
RTL specs per the acceptance criteria below.
**Depends on:** TASK-254-B (needs the widened `ProductEntity` contract — see the Orval-regen note
in Dependencies & Sequencing), TASK-253-A (shares `product-form.tsx`'s stock-field region and the
"Вільний залишок" dictionary key established there — see plan 126 §Dependencies)

**Acceptance Criteria:**

- [ ] `admin-product-table.tsx`: new column "Вільно / Резерв / Фізично" (dictionary key, e.g.
      `dict.products.colStock`), rendered as a compact `N / M / K` cell (available / reserved /
      physical); the column header uses `SortableColumnHeader field="stock"` wired through the
      existing `useTableSort` hook (same pattern as the `name`/`price`/`createdAt` columns already
      in this table) — no new sort-state plumbing needed, `sortBy=stock` is already a valid backend
      value per TASK-254-B
- [ ] `product-form.tsx`: in edit mode only (`stockInfo` prop present), a second, dynamic hint line
      rendered under the existing static `stockHint` (TASK-253) reading e.g. "Фізично на складі: {N}
      шт (з них у {M} замовленнях на обробці)" — new `ProductFormProps.stockInfo?: { reservedQty:
  number; physicalQty: number }` prop, passed from `edit-product-view.tsx` off the fetched
      `product`; **omitted** in create mode (`create-product-view.tsx` passes no `stockInfo` — a
      brand-new product always has `reservedQty: 0`, so the line would be a no-op / clutter)
- [ ] `admin-product-preview-view.tsx`: two new `dl` rows next to the existing "Запас"→"Вільний
      залишок" row (TASK-253) — "Резерв" (`product.reservedQty`) and "Фізично"
      (`product.physicalQty`)
- [ ] New dictionary keys added to `dictionary.ts` (`dict.products.colStock`,
      `dict.productForm.stockBreakdownHint` as a template function, `dict.products.previewReserved`,
      `dict.products.previewPhysical`) — placed adjacent to the TASK-253 keys they extend, not
      duplicating that plan's `stockHint`
- [ ] `admin-product-table.test.tsx`: new/extended case asserting the composite column renders
      `available / reserved / physical` from a stubbed admin-list response, and that clicking the
      column header issues `?sortBy=stock`
- [ ] `product-form.test.tsx` (or nearest existing spec): new case asserting the dynamic breakdown
      line renders when `stockInfo` is passed and is absent when it isn't
- [ ] `admin-product-preview-view.test.tsx` (or nearest existing spec): new case asserting the
      "Резерв"/"Фізично" rows render from a stubbed preview response
- [ ] **Do not** commit `apps/store-admin/src/shared/api/generated/**` diffs from this task — see
      TASK-254-B's consolidated-regen note; run `npm run generate-api` locally to develop/test
      against
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx` — new column
- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.test.tsx` — new/extended case
- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — `stockInfo` prop + dynamic hint
- `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx` — passes `stockInfo`
- `apps/store-admin/src/widgets/admin-product-preview/ui/admin-product-preview-view.tsx` — two new
  `dl` rows
- `apps/store-admin/src/shared/config/dictionary.ts` — new keys (adjacent to TASK-253's)

---

### TASK-254-E: Admin order UI — holds-stock badge + `restockedAt` badge

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — presentational, client-computed from already-fetched data; covered by RTL
specs per the acceptance criteria below.
**Depends on:** TASK-254-C (needs `restockedAt` on the wire — see the Orval-regen note in
Dependencies & Sequencing)

**Acceptance Criteria:**

- [ ] New `apps/store-admin/src/entities/order/is-pre-shipment-status.ts` (pure, unit-tested):
      `isPreShipmentStatus(status: OrderEntityStatus): boolean`, mirroring the backend
      `PRE_SHIPMENT_STATUSES` set (`PENDING`/`CONFIRMED`/`PROCESSING`); re-exported from
      `entities/order/index.ts`
- [ ] `order-detail-view.tsx`: renders a "Тримає залишок: N шт" badge
      (`dict.orders.holdsStock(n)`) when `isPreShipmentStatus(order.status) && order.restockedAt ==
  null`, where `N = order.items.reduce((sum, i) => sum + i.quantity, 0)` (computed inline or via
      a tiny local helper — no new backend field for the count)
- [ ] `order-detail-view.tsx`: renders a "Залишок повернуто HH:MM" badge (`dict.orders.restockedAt(time)`)
      when `order.restockedAt != null`, formatted with the same `dateFormatter`/time-only variant
      already used elsewhere in this file
- [ ] The two badges are mutually exclusive (an order either currently holds stock, or has had it
      returned — never both) and both are absent for post-shipment/never-reserved orders
      (SHIPPED/DELIVERED/CANCELLED-without-restock/REFUNDED-without-restock)
- [ ] New dictionary keys: `dict.orders.holdsStock: (n: number) => string`,
      `dict.orders.restockedAt: (time: string) => string`
- [ ] `is-pre-shipment-status.test.ts`: table-driven over all 7 `OrderEntityStatus` values
- [ ] `order-detail-view.test.tsx` (or nearest existing spec): new cases for (a) PENDING order, no
      `restockedAt` → holds-stock badge with the correct summed quantity; (b) CANCELLED order with
      `restockedAt` set → restocked-at badge with formatted time; (c) DELIVERED order → neither badge
- [ ] **Do not** commit `apps/store-admin/src/shared/api/generated/**` diffs from this task — see
      TASK-254-B's consolidated-regen note
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/entities/order/is-pre-shipment-status.ts` — new
- `apps/store-admin/src/entities/order/is-pre-shipment-status.test.ts` — new
- `apps/store-admin/src/entities/order/index.ts` — export the new helper
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — two new badges
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.test.tsx` (or nearest existing
  spec) — new cases
- `apps/store-admin/src/shared/config/dictionary.ts` — `dict.orders.holdsStock`/`restockedAt`

## Dependencies & Sequencing

- **Internal:** A → B (B needs `getReservedQtyByProductId`) → D (D needs B's widened admin
  contract). C is independent of A/B and can run any time; C → E (E needs `restockedAt` on the
  wire). Suggested order: A → B → C → D → E, or A → B ∥ C → D ∥ E once B/C are both done.
- **Cross-plan (TASK-253 / plan 126):** implemented **sequentially in the same worktree**, branch
  `feature/253-254-stock` — **TASK-253 first** (establishes the "Вільний залишок" label + static
  `stockHint`), **then TASK-254**. TASK-254-D's dynamic breakdown line is written as a _second_
  line alongside TASK-253's static hint in the same region of `product-form.tsx`, and TASK-254-D
  reuses TASK-253's "Вільний залишок" label rather than reintroducing "Запас" anywhere. If TASK-253
  hasn't landed first, TASK-254-D's acceptance criteria (referencing the already-renamed label) will
  not hold.
- **API contract / Orval regen:** this plan changes the admin API contract in three places
  (`ProductEntity`, `OrderEntity`, the new `AdminProductListResponseEnvelope`). Per the
  worktree-orchestration convention for this branch pair, **individual task commits do not include
  regenerated `apps/store-admin/src/shared/api/generated/**`files** — each frontend task (D, E) runs`npm run generate-api`(the`/generate-api`command) locally against the already-landed backend
tasks (A/B/C) to develop and typecheck/test against the new fields, but the orchestrator performs
**one** consolidated regen + commit after both TASK-253 and TASK-254 are merged to`develop`. This
means D/E's local dev loop requires B/C's backend code to already be running (via `npm run dev -w
  apps/store-api`or an equivalent local server) before`npm run generate-api` can pick up the new
  Swagger schema — not merely B/C's source landed in git.
- **External:** No other in-flight plan touches `product.entity.ts`, `product.service.ts`,
  `product.controller.ts`, `order.entity.ts`, `admin-product-table.tsx`, `product-form.tsx`, or
  `order-detail-view.tsx` as of 2026-07-08.

## Risks & Mitigations

| Risk                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrderItem.groupBy` with no index on `productId` is slow at scale                                                                                                              | Discovery §3 sizes this as negligible at current scale (single shop, admin-only reads); the query is bounded to the current page's product ids (10–20), never the whole catalog. `@@index([productId])` on `OrderItem` is a documented, trivially-added future migration if this ever shows up in profiling — deliberately deferred (BACKLOG task title: "no schema change") |
| Switching `adminFindAll`'s item shape from `PublicProductEntity` to `ProductEntity` silently breaks a consumer that reads `.data[i].variantSummary`/`inStock`/`lowStock`       | Confirmed via a full-codebase grep (Design Decision 3) that `admin-product-table.tsx` is the only `.data`-reading consumer of this hook, and it doesn't touch those fields; every other call site only reads the query key                                                                                                                                                   |
| `reservedQty`/`physicalQty` momentarily stale (`0`/`= stock`) on mutation-echo responses (create/update/toggle) when a product actually has live reservations                  | Documented in Design Decision 2 as an accepted, self-healing staleness window (mirrors the pre-existing `ratingAverage`/`ratingCount` behavior on the same entity) — the next list/detail read is always correct; no mutation path needs a second aggregate query                                                                                                            |
| Frontend tasks (D, E) can't typecheck against fields that don't exist in the generated Orval client until the orchestrator's consolidated regen lands                          | Each frontend task's acceptance criteria explicitly requires a **local** `npm run generate-api` run against the already-implemented backend (A/B/C) before building/testing, while excluding the regenerated files from that task's own commit — documented per-task and centrally here so no implementer is surprised by a "missing field" TypeScript error                 |
| The new `sortBy=stock` value is technically also valid on the **public** `GET /products` (shared DTO) even though the public entity never exposes raw `stock`                  | Explicitly called out in Design Decision 3 as harmless — sorting by an field the response never surfaces has no information-leak, it's just a UX no-op on the public path; not worth forking the DTO into two separate `sortBy` enums for this                                                                                                                               |
| `order-detail-view.tsx`'s holds-stock count (summed client-side from `order.items`) could drift from the backend's derivation if the two ever diverge in status-set definition | `isPreShipmentStatus()` is a small, unit-tested, table-driven helper mirroring the backend `PRE_SHIPMENT_STATUSES` set one-for-one (both ultimately enumerate the same 3-of-7 `OrderStatus` values) — a future status added to one side without the other is the kind of drift caught by extending the unit test's table, not a runtime risk                                 |

## Notes

- This plan intentionally reuses the exact `groupBy` idiom already established by
  `getUnitsSoldByProductId` (TASK-164) rather than introducing a new aggregation pattern —
  `product.repository.ts` now has two sibling per-product `OrderItem` aggregates (sold-units,
  reserved-units), both following the same empty-input-short-circuits / absent-means-zero contract.
- The admin-list contract change (Design Decision 3) is the direct fix for the "critical gap" this
  plan's grounding pass found: prior to this plan, **no** admin endpoint returning a _list_ of
  products ever carried raw `stock` — only single-product reads did. That gap predates this plan
  (it's inherited from TASK-230's `adminFindAll`/`listFromDb` sharing decision) and would have
  blocked the discovery §4 list-column UI regardless of the reserved/physical work, so fixing it
  here (rather than as a separate, unplanned task) keeps the whole "make stock visible in the admin
  list" feature landing in one coherent contract change.
- Discovery §6 Phase L (explicit `reservedQty` column backfilled from this plan's query, or a full
  `StockMovement` ledger) remains parked, pending a real need this plan's derived approach can't
  serve — not scheduled by this plan.
