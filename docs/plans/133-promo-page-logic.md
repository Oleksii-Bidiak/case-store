# Plan 133 — Promo Page Logic (Server `onSale` Filter + Public Active-Discounts Feed)

> **Status:** ✅ Done (TASK-179 shipped)
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 4** (Передзапускові фічі + решта CRM), Block C
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-179

## Overview

The storefront `/promo` page (`apps/store-client/src/widgets/promo`) currently fakes both of its
data-driven sections:

- **"Товари зі знижкою" (PromoDeals)** over-fetches `limit: 48` products and filters to on-sale
  positions **client-side** (`isOnSale()` in `promo-deals.tsx:11-16`) — there is no server-side
  `onSale` filter on `GET /api/products`, so pagination is fake (a client-side slice of one
  over-fetched page) and the filter can never compose correctly with real pagination or with the
  TASK-164 `bestselling` sort.
- **"Промокоди тижня" (PromoCoupons)** renders a hardcoded `PROMO_COUPONS` array
  (`widgets/promo/model/coupons.ts`) — copy-to-clipboard is real, but the codes are marketing copy
  that may not even exist in the `Discount` table; there is no public discount-list endpoint (only
  the authenticated per-code preview `POST /api/cart/discount/preview` and the `AdminGuard`-only
  CRUD).

This plan closes both gaps full-stack, **with no Prisma schema change**:

1. A server-side `onSale` filter on the existing public `GET /api/products` (`ProductListQueryDto` →
   `ProductService` → `ProductRepository`), composable with every other filter/sort already there
   (category rollup, brand, device, price range, search, specs facet, and — per the BACKLOG row's
   explicit note — the TASK-164 `bestselling` sort).
2. A new public, unauthenticated **active-discounts feed**, `GET /api/discounts/active`, returning a
   public-safe subset of currently redeemable `Discount` rows (mirrors the eligibility gates already
   coded in `DiscountService.computeDiscount`, minus the per-user/global cap **numbers** — only
   whether a code is still redeemable at all).
3. Storefront wiring: `PromoDeals` switches to the real `onSale` filter + real "Показати ще"
   pagination (the TASK-216 convention); `PromoCoupons`/`coupons.ts` switch from the static array to
   the new live feed.

**No Prisma migration is needed** — `onSale` is a derived predicate over two existing columns
(`Product.compareAtPrice`, `Product.price`), and "active" for discounts is a predicate over existing
`Discount` columns. The chosen implementation techniques for both (see Design Decisions 1 and 2) are
exactly what makes this deliverable without a schema change.

## Scope

### In Scope

- `onSale?: boolean` query param on `GET /api/products` (public listing only; the admin listing
  inherits it for free since both share `ProductListQueryDto`/`toListParams`, but the admin UI is not
  wired to it in this plan).
- `GET /api/discounts/active` — new public, unauthenticated endpoint; new `PublicDiscountEntity`.
- `PromoDeals` (`widgets/promo/ui/promo-deals.tsx`): drop the client-side `isOnSale()` filter and the
  `limit: 48` over-fetch; use `onSale: true` server-side with a real page size and a "Показати ще"
  load-more control (TASK-216 pattern, locally mirrored — see Design Decision 4).
- `PromoCoupons` (`widgets/promo/ui/promo-coupons.tsx`) + `widgets/promo/model/coupons.ts`: replace
  `PROMO_COUPONS` with the new `GET /api/discounts/active` feed.
- Unit tests for every new predicate (DTO transform, cache-key field, repository composition,
  discount eligibility) and RTL coverage for both storefront widgets.

### Out of Scope

- Any `Product`/`Discount` Prisma schema change (explicitly ruled out by the BACKLOG row; both
  predicates are expressible over existing columns — see Design Decisions 1–2).
- A UI control on `/promo` to sort deals by `bestselling` — this plan guarantees `onSale` +
  `bestselling` **compose correctly at the repository level** (unit-tested), but `PromoDeals` keeps
  its current `sortBy: 'createdAt'` default. Adding a "найпопулярніші" toggle is a trivial follow-up
  once real sales data exists, not part of this plan.
- Pagination/admin UI for the active-discounts feed, or any change to the existing
  `POST /api/cart/discount/preview` (authenticated preview) or `admin/discounts` CRUD — untouched.
- The newsletter block on `/promo` (`PromoNewsletter`) — already wired to the real subscribe endpoint
  by TASK-188.
- Rate limiting on the new public feed beyond the global `ThrottlerGuard` default — it is a
  read-only, cacheless, small-result-set GET with no user input, same risk class as
  `GET /api/faq`/`GET /api/categories`, neither of which carries a bespoke `@Throttle`.

## User Stories

1. As a shopper browsing `/promo`, I want the "Товари зі знижкою" grid to show **every** product
   currently on sale (not just the first 48 fetched), with a working "Показати ще" button, so I don't
   miss a deal that happens to sort past the first page.
2. As a shopper, I want the "Промокоди тижня" cards to show codes I can **actually use** at checkout,
   not marketing copy that may not exist in the system.
3. As the store owner, when I create/schedule/expire a `Discount` in the admin panel, I want it to
   automatically appear/disappear from the public promo feed with no code change per campaign.

## Technical Design

### Design Decision 1 — `onSale` as a raw-SQL id-prefetch, not a computed column

Prisma's fluent `where` builder can only compare a column to a **literal/variable** — it cannot
express a same-row **column-to-column** comparison (`compareAtPrice > price`) in a typed `where`
clause. Since a schema change (a generated/stored boolean column, maintained by a migration-added
trigger or a Prisma `@default(dbgenerated(...))`) is explicitly out of scope, this plan reuses the
exact pattern the codebase already established for a similar "can't express directly" case — the
TASK-164 `bestselling` sort's **candidate-then-filter** shape
(`ProductRepository.findPageByBestselling`, `product.repository.ts:531-553`):

1. A new private `ProductRepository.getOnSaleProductIds(): Promise<string[]>` runs one raw query
   against the actual (snake_case, per `schema.prisma:169`/`:222`) columns:

   ```sql
   SELECT id FROM products
   WHERE compare_at_price IS NOT NULL AND compare_at_price > price
   ```

   via `this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql\`...\`)`. No `deleted_at`/`is_active`filter is needed **here** — the outer`where` (below) already enforces both, so a soft-deleted or
   inactive on-sale row simply intersects to nothing.

2. `ProductRepository.findAll()` composes this id set into the **existing** `where` object (right
   after the `specFilter` block, before the `sortBy === 'bestselling'` branch at
   `product.repository.ts:478-484`):

   ```ts
   if (onSale) {
     const onSaleIds = await this.getOnSaleProductIds();
     where.id = { in: onSaleIds };
   }
   ```

   Because this single `where` object is what both `findPageByColumn` **and**
   `findPageByBestselling` receive, `onSale` composes for free with every existing filter
   (category rollup, brand, device, price range, search, specs facet) **and** with the
   `bestselling` sort — satisfying the BACKLOG row's explicit "pairs with bestsellers TASK-164" note
   without any change to the sort/pagination logic itself. Pagination/count stay correct because the
   id constraint is baked into `where` before `skip`/`take`/`count` run, unlike the bestselling
   path's own in-memory paging (which only reorders, never filters).

3. When `onSale` is absent/false, `getOnSaleProductIds()` is never called — zero added query cost for
   every other listing (catalog, search, PDP cross-sell, etc.).

This keeps the business rule (`compareAtPrice != null && compareAtPrice > price`) in exactly one
place server-side (mirroring the client's already-established `getCardPricing()` /
`PublicProductEntity` treatment of the same rule) while never touching the schema.

### Design Decision 2 — active-discounts feed: DB expresses what Prisma CAN, cap-check runs in JS

The "active" predicate has the same column-vs-column snag for the redemption cap
(`redeemedCount < maxRedemptions` — both are columns on the same `Discount` row). Unlike the product
catalog (thousands of rows, must stay paginated/indexed), the `Discount` table is small and
admin-curated — realistically dozens of rows, never thousands. So this plan does NOT reach for raw
SQL here; it splits the predicate:

- **In the DB** (plain Prisma `where`, every comparison is column-vs-literal so the fluent builder
  handles it natively):
  ```ts
  {
    isActive: true,
    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  }
  ```
- **In application code** (mirrors the existing style in `DiscountService.computeDiscount`/`redeem`,
  which already compares two already-loaded-row fields in plain JS rather than in SQL): filter the
  small candidate set down to `maxRedemptions === null || redeemedCount < maxRedemptions`.

This is a new repository method, `DiscountRepository.findActiveWindowCandidates(now: Date):
Promise<Discount[]>`, plus a new service method, `DiscountService.findActivePublic()`, that applies
the cap filter and maps to the public-safe entity (Design Decision 3). No pagination is added to this
feed — a curated promo list is not expected to grow into the hundreds; if it ever does, adding
`take`/pagination is a non-breaking follow-up (noted in Risks).

### Design Decision 3 — public-safe `PublicDiscountEntity` + a dedicated, ungated controller

Per the BACKLOG row's instruction, the public entity exposes **only** `code`, `type`, `value`,
`minSpend`, `expiresAt` — never `id`, `maxRedemptions`, `redeemedCount`, `perUserLimit`, `startsAt`,
`isActive`, or the timestamps, none of which a shopper needs and some of which (redemption counts,
caps) are competitively/operationally sensitive.

The existing `DiscountController` (`cart/discount/preview`) is class-decorated with
`@UseGuards(JwtAuthGuard, RolesGuard)` (`discount.controller.ts:31`) — bolting a public route onto it
would require a per-route guard override that doesn't exist anywhere else in this codebase. The
established convention for "one entity, one authenticated/admin surface, one public surface" is
**separate controllers** (see `FaqController` vs `AdminFaqController`, `ProductController` vs the
admin-only routes) — so this plan adds a third, small, guard-free controller:
`apps/store-api/src/discount/public-discount.controller.ts`, `@Controller('discounts')`, route
`GET /api/discounts/active`. This keeps the guarded preview controller's guard chain untouched and
needs no new decorator machinery (no `@Public()` exists in this codebase — confirmed, see Notes).

### Backend (NestJS — Clean Architecture)

#### `ProductListQueryDto` (`apps/store-api/src/product/dto/product-list-query.dto.ts`)

- New optional field:
  ```ts
  @ApiProperty({
    description:
      'Filter to products currently on sale (compareAtPrice set and greater than price). ' +
      'Composes with every other filter and with sortBy=bestselling (TASK-179).',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'onSale must be true or false' })
  onSale?: boolean;
  ```
  Copies the `isActive` `@Transform` pattern verbatim (lines 88-93) to avoid the
  `enableImplicitConversion` trap (`Boolean('false') === true`) — see
  `docs/../MEMORY` "Boolean query DTO gotcha".

#### `ProductService` (`apps/store-api/src/product/product.service.ts`)

- `toListParams()` (204-218): add `onSale: query.onSale`.
- `findAll()` (127-162): the `buildProductListKey(...)` call (133-143) must include
  `onSale: listParams.onSale` — **any new filter that is not in the cache key silently collides**
  (this is the exact bug class TASK-236/TASK-230 already had to fix elsewhere in this file's cache
  keying). `FindAllParams` passed to the repository (149-153) already spreads `...listParams`, so
  `onSale` flows through automatically once it's in `toListParams()`.
- `adminFindAll()` inherits `onSale` for free via the same `toListParams()` — no admin UI wiring in
  this plan, but nothing prevents an admin from using it via direct API call.

#### `cache-key.util.ts` (`apps/store-api/src/cache/cache-key.util.ts`)

- `ProductListKeyParams` (42-56): add `onSale?: boolean`.
- `KEY_FIELDS` (62-75): append `'onSale'` (order is a contract only with itself — pick the end of
  the list, right after `'specs'`, to match how `deviceModelId`/`specs` were appended incrementally
  in the past).

#### `ProductRepository` (`apps/store-api/src/product/product.repository.ts`)

- `FindAllParams` (10-44): add `onSale?: boolean`.
- `findAll()` (409-488): insert the composition from Design Decision 1 right after the `specFilter`
  block (470-476) and before the `sortBy === 'bestselling'` branch (481-484).
- New private method `getOnSaleProductIds(): Promise<string[]>` per Design Decision 1, using
  `Prisma.sql` + `this.prisma.$queryRaw`.

#### Discount module (`apps/store-api/src/discount/`)

- `discount.repository.ts`: new `findActiveWindowCandidates(now: Date): Promise<Discount[]>` (plain
  Prisma `where`, ordered `{ expiresAt: 'asc' }` — Postgres's default `NULLS LAST` on `ASC` means
  "never expires" codes trail the soonest-expiring ones, which is a reasonable promo-page default and
  not a hard contract).
- `discount.service.ts`: new `findActivePublic(): Promise<{ data: PublicDiscountEntity[] }>` per
  Design Decision 2 (DB window candidates → JS cap filter → map to the public entity).
- `entities/discount.entity.ts`: new `PublicDiscountEntity` class (`code`, `type`, `value`,
  `minSpend`, `expiresAt`, each `@ApiProperty`-decorated like the existing fields on `DiscountEntity`)
  - `static fromPrisma(discount: Discount): PublicDiscountEntity`.
- New file `public-discount.controller.ts` per Design Decision 3:
  - `@ApiTags('Discounts') @Controller('discounts')`, **no guards**.
  - `GET /discounts/active` → `@ApiOperation({ summary: '...', operationId: 'listActiveDiscounts' })`
    (explicit `operationId` is required so Orval generates a stable, readable hook name — see the
    `api-contract` skill).
  - Response envelope class `PublicActiveDiscountsResponseEnvelope { data: PublicDiscountEntity[] }`.
- `discount.module.ts`: register `PublicDiscountController` alongside the existing two controllers.

### Frontend (Next.js — FSD)

#### `entities/discount` (`apps/store-client/src/entities/discount/index.ts`)

- After the Orval regen (see Migration Steps), re-export the new hook and types alongside the
  existing `usePreviewDiscount` re-export:
  ```ts
  export type { PublicDiscountEntity } from "@/shared/api/generated/models";
  export { useListActiveDiscounts } from "@/shared/api/generated/discounts/discounts";
  ```
  (Exact generated hook name is whatever Orval derives from the `listActiveDiscounts` operationId —
  verify against the generated file rather than assuming; see Notes.)

#### `widgets/promo` (`apps/store-client/src/widgets/promo/`)

- `model/deals-pagination.ts` (**new**): small, LOCALLY-owned pure helpers mirroring
  `widgets/product-list/model/load-more.ts` (`accumulationKey`/`mergeProductPages`/`canLoadMore`/
  `nextLoadCount`) — deliberately duplicated rather than cross-imported, since FSD forbids one widget
  reaching into a sibling widget's `model/` (same precedent as plan 130 Design Decision 1's mirrored
  `resolve-seo-preview.ts`). Only the two functions `PromoDeals` actually needs:
  `mergeDealPages<T extends { id: string }>(pages: (T[] | undefined)[]): T[]` (dedup-by-id merge) and
  `nextDealsLoadCount(total: number, limit: number, loadedPages: number): number`. A category change
  resets pagination via the same render-time key guard already used by `ProductList`
  (`accum.key === key`, per `docs/conventions/forms.md`).
- `ui/promo-deals.tsx` (**modified**): drop `isOnSale()` (11-16) and the `limit: 48` over-fetch;
  `useProductControllerFindAll({ isActive: true, onSale: true, limit: 12, sortBy: 'createdAt',
sortOrder: 'desc', ...(categoryId ? { categoryId } : {}) })`; add a "Показати ще" button using
  `deals-pagination.ts` + `useQueries`/`getProductControllerFindAllQueryOptions` (same technique as
  `ProductList`, minus the URL-anchored base page — the promo grid has no query-string page anchor,
  only the category tabs, so pagination state is pure client `useState` keyed on `categoryId`).
- `model/coupons.ts` (**modified**): delete `PROMO_COUPONS` and the `PromoCoupon` interface (or keep
  the interface shape as the mapped view-model type fed by the live data, renamed e.g.
  `PromoCouponView`, built from `PublicDiscountEntity` — implementer's call; either way no more
  hardcoded array).
- `ui/promo-coupons.tsx` (**modified**): call `useListActiveDiscounts()`, map each
  `PublicDiscountEntity` to the existing ticket-card view-model (`amount`/`unit`/`title`/`condition`
  derived from `type`/`value`/`minSpend`/`expiresAt` — e.g. PERCENT → `−{value}%`/`"на все"`, FIXED →
  `−{value}`/`"гривень"`; `condition` from `minSpend` when set, else a generic "Діє обмежений час" /
  the `expiresAt` date), loading skeleton + empty state (no active codes → hide the section or show
  an empty-state message, matching the `dealsEmpty`/`dealsError` pattern already used by
  `PromoDeals`).

### API Contract

| Method | Path                    | Auth   | Request           | Response                                                                       |
| ------ | ----------------------- | ------ | ----------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/products`         | Public | `...&onSale=true` | `{ data: PublicProductEntity[], meta }` (unchanged shape, new optional filter) |
| GET    | `/api/discounts/active` | Public | —                 | `{ data: PublicDiscountEntity[] }`                                             |

`PublicDiscountEntity`:

```ts
{
  code: string; // e.g. "SUMMER10"
  type: DiscountType; // PERCENT | FIXED
  value: string; // decimal string, mirrors DiscountEntity.value
  minSpend: string | null;
  expiresAt: Date | null;
}
```

## Tasks

### TASK-179-A: `onSale` DTO field + cache-key plumbing

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — a boolean query-param transform, not cart/discount-money/inventory/auth
logic; covered by unit tests per the acceptance criteria below (same rigor as the existing `isActive`
transform test).
**Depends on:** —

**Acceptance Criteria:**

- [ ] `ProductListQueryDto.onSale?: boolean` added with the `obj[key]`-reading `@Transform` (NOT the
      naive `value`-reading form) so `?onSale=false` is not coerced to `true` under
      `enableImplicitConversion`
- [ ] `ProductListKeyParams`/`KEY_FIELDS` in `cache-key.util.ts` include `onSale`
- [ ] `ProductService.toListParams()` maps `query.onSale` through; the `buildProductListKey(...)`
      call inside `findAll()` includes `listParams.onSale` (public list still forces `isActive:
true` unconditionally — unchanged)
- [ ] New unit test file/suite `product-list-query.dto.spec.ts` — new `describe('onSale transform
(TASK-179)')` mirroring `user-list-query.dto.spec.ts` exactly: `'true'`→`true`, `'false'`→
      `false` (NOT the truthy-string trap), absent→`undefined`, garbage string→`undefined`, and a
      `class-validator` pass for all three recognized states
- [ ] `cache-key.util.spec.ts`: extend the "serializes all params in a fixed order" case and the
      "omits undefined" case to cover `onSale`; add an `onSale=false` case analogous to the existing
      `isActive=false` one (a meaningful filter, never silently omitted)
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/product/dto/product-list-query.dto.ts` — add `onSale`
- `apps/store-api/src/product/dto/product-list-query.dto.spec.ts` — new `describe` block
- `apps/store-api/src/cache/cache-key.util.ts` — add `onSale` to the key params/fields
- `apps/store-api/src/cache/cache-key.util.spec.ts` — extend existing cases
- `apps/store-api/src/product/product.service.ts` — `toListParams()` + cache-key call site

---

### TASK-179-B: `onSale` repository predicate (raw-SQL id-prefetch)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No — a read-only filter predicate, not a money calculation; covered by unit tests
per the acceptance criteria below.
**Depends on:** TASK-179-A

**Acceptance Criteria:**

- [ ] `FindAllParams.onSale?: boolean` added
- [ ] New private `ProductRepository.getOnSaleProductIds(): Promise<string[]>` runs
      `this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql\`SELECT id FROM products WHERE
      compare_at_price IS NOT NULL AND compare_at_price > price\`)` against the real snake_case
table/columns (`products`/`compare_at_price`/`price`, per `schema.prisma`) — mapped column
      names, not Prisma model names
- [ ] `findAll()` composes `where.id = { in: onSaleIds }` only when `onSale` is truthy, inserted
      before the `sortBy === 'bestselling'` branch so it applies identically to both the column-sort
      and bestselling-sort paths
- [ ] `onSale` composes correctly with `sortBy: 'bestselling'` (new test: mock `$queryRaw` to return
      a subset of ids, mock the bestselling candidate query, assert the candidate `where` includes
      `id: { in: [...] }`)
- [ ] `onSale` composes correctly with the category-rollup/brand/price/search/specs filters already
      in `where` (new test: assert `$queryRaw` result is ANDed alongside an existing filter, not
      replacing it)
- [ ] When `onSale` is absent/false, `$queryRaw` (and thus `getOnSaleProductIds`) is never called —
      zero added cost for every other listing (new test: assert `prismaMock.$queryRaw` not called)
- [ ] `prismaMock` in `product.repository.spec.ts` gains `$queryRaw: jest.fn()`
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.ts` — `FindAllParams`, `getOnSaleProductIds()`,
  `findAll()` composition
- `apps/store-api/src/product/product.repository.spec.ts` — new `describe('onSale filter
(TASK-179)')` + `$queryRaw` mock

---

### TASK-179-C: Public active-discounts feed (repository + service + entity + controller)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No — a read-only eligibility filter (mirrors the already-shipped, non-TDD
`computeDiscount`/`list` methods in the same service), not the discount **amount calculation** core
(`computeAmountCents`, which IS TDD'd); covered by unit tests per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `DiscountRepository.findActiveWindowCandidates(now: Date): Promise<Discount[]>` — plain Prisma
      `where` per Design Decision 2 (`isActive: true` AND null-or-past `startsAt` AND
      null-or-future `expiresAt`); unit test asserts the exact `where` shape passed to
      `prisma.discount.findMany`
- [ ] `DiscountService.findActivePublic(): Promise<{ data: PublicDiscountEntity[] }>` — calls the
      repository with `new Date()`, filters to `maxRedemptions === null || redeemedCount <
maxRedemptions`, maps survivors through `PublicDiscountEntity.fromPrisma`; unit tests: an
      exhausted-cap discount is excluded, a null-cap discount is included, an unbounded/no-window
      discount is included
- [ ] `PublicDiscountEntity` exposes exactly `code`, `type`, `value` (string), `minSpend` (string |
      null), `expiresAt` (Date | null) — unit test asserts the mapped object has none of `id`,
      `maxRedemptions`, `redeemedCount`, `perUserLimit`, `startsAt`, `isActive`, `createdAt`,
      `updatedAt`
- [ ] New `PublicDiscountController` (`@Controller('discounts')`, **no guards**) exposes
      `GET /discounts/active` with an explicit `operationId: 'listActiveDiscounts'` on
      `@ApiOperation`
- [ ] `DiscountModule.controllers` includes `PublicDiscountController`
- [ ] e2e smoke test (`test/discount.e2e-spec.ts`, mocked repository per the existing file's
      pattern — no real DB, per the `store-api-e2e-serial` convention): `GET /api/discounts/active`
      returns 200 with no `Authorization` header; an inactive/expired/exhausted-cap seeded discount
      is absent from the response; the response shape has no `redeemedCount`/`maxRedemptions`
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api` and `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/discount/discount.repository.ts` — `findActiveWindowCandidates`
- `apps/store-api/src/discount/discount.repository.spec.ts` — new tests
- `apps/store-api/src/discount/discount.service.ts` — `findActivePublic`
- `apps/store-api/src/discount/discount.service.spec.ts` — new tests
- `apps/store-api/src/discount/entities/discount.entity.ts` — `PublicDiscountEntity`
- `apps/store-api/src/discount/public-discount.controller.ts` — new
- `apps/store-api/src/discount/discount.module.ts` — register the new controller
- `apps/store-api/src/discount/index.ts` — re-export new symbols as needed
- `apps/store-api/test/discount.e2e-spec.ts` — new smoke cases

---

### ⚠ Regen checkpoint (not a task — a sequencing gate)

After TASK-179-A/B/C land on the feature branch, run the swagger→Orval pipeline **once** (both
`store-client` and `store-admin` regenerate from the same OpenAPI spec, per the `api-contract`
skill):

```bash
npm run swagger:generate -w apps/store-api
npm run generate-api
```

Commit the regenerated files. TASK-179-D/E/F below all assume the new `onSale` param on
`useProductControllerFindAll` and the new active-discounts hook already exist in
`shared/api/generated/`. Regenerating per-task in a parallel worktree risks the exact
`docs/../worktree-agent-orchestration` conflict pattern already documented — do this once, after both
backend tasks are done, not incrementally.

---

### TASK-179-D: `entities/discount` — wire the active-discounts hook

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-179-C, the regen checkpoint above

**Acceptance Criteria:**

- [ ] `entities/discount/index.ts` re-exports the generated active-discounts hook (verify its actual
      name in `shared/api/generated/discounts/discounts.ts` post-regen — do not assume
      `useListActiveDiscounts` without checking) and the `PublicDiscountEntity` type, alongside the
      existing `usePreviewDiscount` re-export
- [ ] No hand-written `fetch`/`axios` — the generated hook is the only data-access path (per
      AGENTS.md "API Contract")
- [ ] `npm run typecheck`/`lint` clean for store-client

**Files to create/modify:**

- `apps/store-client/src/entities/discount/index.ts` — add re-exports

---

### TASK-179-E: `PromoDeals` — server `onSale` filter + real pagination

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No.
**Depends on:** TASK-179-B, the regen checkpoint above

**Acceptance Criteria:**

- [ ] `isOnSale()` and the `limit: 48` over-fetch are removed; `useProductControllerFindAll` is
      called with `onSale: true` and a real page size (e.g. `limit: 12`)
- [ ] `deals-pagination.ts` (new, local to `widgets/promo/model/`) provides the merge/next-count
      helpers; category-tab changes reset accumulated pages via a render-time key guard (per
      `docs/conventions/forms.md` — no `key`-remount anti-pattern)
- [ ] A "Показати ще" control appends the next page (`useQueries` +
      `getProductControllerFindAllQueryOptions`, same technique as `ProductList`), with loading/error
      states mirroring `dict.catalog.loadMore*`/`shownOfTotal` (new promo-scoped dict keys, see
      below — do not reuse `dict.catalog` directly, keep `dict.promo` self-contained per its existing
      convention)
- [ ] New `dict.promo` keys: `dealsLoadMore(n)`, `dealsLoadMoreLoading`, `dealsLoadMoreError`,
      `dealsShownOfTotal(shown, total)`
- [ ] Empty state (`dealsEmpty`) and error state (`dealsError`) still render correctly when the
      server returns zero on-sale products / the request errors
- [ ] New `promo-deals.test.tsx` (RTL + MSW): asserts the request includes `onSale: true`; asserts
      "Показати ще" appends a second page and merges without duplicates; asserts switching category
      tabs resets to page 1
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/promo/model/deals-pagination.ts` — new
- `apps/store-client/src/widgets/promo/ui/promo-deals.tsx` — modified
- `apps/store-client/src/widgets/promo/ui/promo-deals.test.tsx` — new
- `apps/store-client/src/shared/config/dictionary.ts` — new `dict.promo.deals*` keys

---

### TASK-179-F: `PromoCoupons` — swap the static array for the live feed

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-179-D

**Acceptance Criteria:**

- [ ] `widgets/promo/model/coupons.ts`: `PROMO_COUPONS` hardcoded array removed; a pure mapping
      function turns a `PublicDiscountEntity` into the existing ticket-card view-model
      (`amount`/`unit`/`title`/`condition`) — PERCENT → `−{value}%`; FIXED → `−{value}`; `condition`
      derived from `minSpend`/`expiresAt` when present, a generic fallback copy otherwise
- [ ] `ui/promo-coupons.tsx` calls the entities/discount hook; renders a loading skeleton, an error
      state, and an empty state (no active codes — hide the section entirely, matching how
      `PromoDeals` degrades, since an empty ticket grid with a heading and nothing under it reads as
      broken)
- [ ] Copy-to-clipboard behavior (`navigator.clipboard`, toast) is unchanged
- [ ] `promo-view.test.tsx` updated: mocks `GET /api/discounts/active` returning one discount and
      asserts its code renders (the old literal `"MOBILE5"` assertion is replaced); the on-sale MSW
      product handler is updated to actually branch on the `onSale` query param (returning only the
      matching product) so the "shows only on-sale products" test still meaningfully exercises
      server-side filtering rather than a client-side artifact that no longer exists
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/promo/model/coupons.ts` — modified
- `apps/store-client/src/widgets/promo/ui/promo-coupons.tsx` — modified
- `apps/store-client/src/widgets/promo/ui/promo-view.test.tsx` — modified (MSW handlers + assertions)

## Dependencies & Sequencing

```
TASK-179-A ──▶ TASK-179-B ─┐
                            ├─▶ [regen checkpoint] ─▶ TASK-179-D ─▶ TASK-179-F
TASK-179-C ─────────────────┘                    └─▶ TASK-179-E
```

- A → B (B extends the `FindAllParams`/`findAll()` shape A's DTO/cache-key work assumes).
- C is independent of A/B (different module) — can run in parallel.
- The regen checkpoint gates every frontend task; it should run once, after A+B+C are all merged to
  the feature branch, not per-task.
- D → F (coupons needs the hook re-export). B → E (deals needs the repository predicate + the
  regenerated `onSale` param). E and F are otherwise independent of each other.
- Suggested single-worktree order: A, B, C (any interleaving) → regen → D, E, F (any interleaving).

## Risks & Mitigations

| Risk                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOnSaleProductIds()` is a full-table raw scan with no supporting index on `(compare_at_price, price)` — cost grows with catalog size                                           | Acceptable at current/expected catalog scale (hundreds–low thousands of rows); a schema change (partial index) is explicitly out of scope for this plan. If the catalog grows enough to matter, a follow-up migration adding `@@index([compareAtPrice])` (or a Postgres partial index `WHERE compare_at_price IS NOT NULL`) is the natural next step — noted here, not implemented |
| The active-discounts feed has no pagination — if an admin ever creates hundreds of promo codes, `/promo` renders an unbounded grid                                                | Realistically bounded by admin-curated content (dozens, not hundreds); adding `take`/pagination later is non-breaking (the response shape `{ data: [] }` has no `meta` to retrofit awkwardly, but adding one is additive)                                                                                                                                                          |
| `onSale` not being added to `buildProductListKey` would silently cache-collide `onSale=true` and `onSale` absent under the same key (the exact bug class TASK-236/230 hit before) | Task A's acceptance criteria explicitly require the cache-key test coverage before B/C land                                                                                                                                                                                                                                                                                        |
| Two backend tasks (A/B and C) touching different modules but both feeding one Orval regen could conflict if regenerated independently in parallel worktrees                       | Explicit single regen-checkpoint step in this plan, gating all frontend tasks — mirrors the `worktree-agent-orchestration` memory note                                                                                                                                                                                                                                             |
| `promo-view.test.tsx`'s existing on-sale assertion silently stops testing anything meaningful once the client-side filter is removed (MSW mock ignores query params today)        | Called out explicitly in Task F's acceptance criteria — the MSW handler must branch on `onSale`                                                                                                                                                                                                                                                                                    |

## Notes

- Confirmed there is no `@Public()`/`@SkipAuth()` decorator anywhere in `apps/store-api/src` (grepped
  for `@Public`, `IS_PUBLIC_KEY`, `SkipAuth` — no matches), so the "separate ungated controller"
  approach (Design Decision 3) is the established idiom, not a new one, matching
  `FaqController`/`AdminFaqController` and the public-vs-admin `ProductController` split.
- The `onSale` filter is deliberately **not** restricted to `isActive: true` products at the
  repository level — the public `findAll()` path already forces `isActive: true` unconditionally
  (`product.service.ts:142`/`:151`, TASK-230), so `onSale` only ever needs to compose with whatever
  `isActive` state the caller (public vs. admin) already applies.
- Per the task brief: swagger export + Orval regen happen **once** on `develop` after this feature
  merges (or once per feature-branch worktree, per the regen checkpoint above) — not per sub-task.
- `DiscountType` (`PERCENT`/`FIXED`) and the money-string convention (`Decimal.toString()`) on
  `PublicDiscountEntity` deliberately mirror `DiscountEntity`/`DiscountPreviewEntity` exactly, so the
  storefront's existing `−{value}%` / `−{value}` ticket-card formatting logic
  (`promo-coupons.tsx`) needs no new money-parsing logic beyond what it already has for the static
  array.
