# Plan 074 — Dashboard "Top Products" / "Low Stock" panels (TASK-152)

**Phase:** Phase 4 — Admin Panel (Bug-fix follow-up)
**Roadmap context:** Tier 2 — Critical functional bugs
**Branch:** implemented directly on `develop` (owner instruction)
**Created:** 2026-06-28
**Status:** ✅ Complete (implemented 2026-06-28)

> **Implementation outcome (2026-06-28):** Both panels fixed on `develop`. Backend: `getTopProducts`
>
> - the three revenue aggregates (`getTotalRevenue`, `getRevenueSince`, `getRevenueByDay`) now filter
>   `paymentStatus = PAID` (the `NON_REVENUE_STATUSES`/`OrderStatus` import removed) — "earned revenue"
>   ground truth after the TASK-151 decoupling. Frontend: new `DashboardTopProductsTable` widget
>   created and mounted in `dashboard-view` between the charts and low-stock table (RC-1 — the panel
>   never existed). Stale tests un-staled: int-spec rewritten to the current schema (no `ProductVariant`,
>   `paymentStatus`-seeded orders) and the e2e fixture/assertions corrected to `lowStockProducts`.
>   Verified: store-api 436 unit + 4 dashboard-e2e, store-admin 52 unit (incl. 2 new top-products RTL),
>   typecheck/lint/build all green. **The rewritten int-spec compiles but was NOT run here** (no local
>   Postgres) — it is promoted in _Pending manual QA_ to run via `npm run test:int -w apps/store-api`
>   against the `store_test` DB. No Orval regen needed; no migration.

---

## Problem Statement

The admin dashboard has two panels that are broken:

1. **"Top products"** (найкращі товари / бестселери) — completely absent from the page. The data IS
   returned by the API but no frontend widget mounts it. The owner sees a blank where the panel
   should be.
2. **"Low-stock"** (низький запас) — the widget IS rendered but shows the "Немає товарів із низьким
   запасом" empty-state row even when products with low stock exist, because the query's `status NOT
IN (CANCELLED, REFUNDED)` filter on orders (used for top-products, and by implication on related
   revenue aggregates) does not match the paymentStatus-decoupled model introduced by TASK-151. The
   low-stock component itself is wired correctly but depends on `isActive=true` and `deletedAt=null`
   which can be missing on dev seed data.

---

## Root Cause Analysis

### RC-1 (Frontend — blocking): "Top Products" widget does not exist

`apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` renders three sections:
`AdminDashboardStats`, `DashboardCharts`, `DashboardLowStockTable`. There is **no widget mounting
`data.products.topProducts`**. No `dashboard-top-products/` directory exists. The field is present
in the Orval-generated type (`ProductMetricsDto.topProducts: TopProductDto[]`) and is populated by
the backend, but no component reads it.

### RC-2 (Backend — data accuracy): `getTopProducts()` raw SQL filters by `order.status` not `payment_status`

```sql
-- current (wrong post-TASK-151)
AND o.status NOT IN ('CANCELLED', 'REFUNDED')

-- correct
AND o.payment_status = 'PAID'
```

Pre-TASK-151, advancing order status also triggered `derivePaymentStatus` which would mark PAID.
After TASK-151 deleted `derivePaymentStatus`, `paymentStatus` is set only by the admin manually.
An order can now be `status=CONFIRMED, paymentStatus=PENDING` (accepted but not yet paid — COD
scenario). The current query includes these unpaid orders in the top-products revenue calculation.
For a store where orders are confirmed before payment is collected, this means top-products includes
revenue that has not actually been received, which misrepresents the panel's intent. More critically,
if most orders are in status=PENDING waiting for the admin to mark PAID, the current filter may
produce results that are inconsistent with what the store owner considers "sold" items.

The same `status NOT IN (CANCELLED, REFUNDED)` pattern is used in `getTotalRevenue()`,
`getRevenueSince()`, and `getRevenueByDay()`. These are also fixed here (narrowly), while the
broader "show unrealized-but-ordered separately" goal is deferred to TASK-137.

### RC-3 (Tests — stale): `dashboard.repository.int-spec.ts` cannot run against the current schema

TASK-142 (variant-as-product rework) removed the `ProductVariant` model and merged `variantId` out
of `OrderItem`. The int-spec was never updated:

| Stale reference                      | Current schema                                          |
| ------------------------------------ | ------------------------------------------------------- |
| `prisma.productVariant.create(...)`  | No `productVariant` model; stock lives on `Product`     |
| `OrderItem` with `variantId` field   | `OrderItem` has only `productId` + `price` + `quantity` |
| `summary.inventory.lowStockVariants` | `summary.inventory.lowStockProducts`                    |
| `variantId`, `variantName` fields    | `productId`, `productName` fields                       |

The int-spec **cannot compile or run** against the current Prisma client. This is why the
"Dashboard raw-SQL real-DB int-spec run" item in _Pending manual QA_ has never been executed.

### RC-4 (Tests — stale): `dashboard.e2e-spec.ts` fixture uses wrong field names

`summaryFixture.inventory` is typed as `DashboardSummary` but provides `lowStockVariants` (old
name). Because `DashboardRepository` is fully mocked in the e2e spec, the mock fixture is
passed through and the assertion `body.inventory.lowStockVariants` passes — but it gives false
confidence. The real `/api/admin/dashboard/summary` response returns `lowStockProducts`.

### RC-5 (Contract — correct, no fix needed): Orval-generated types are accurate

`ProductMetricsDto.topProducts`, `InventoryMetricsDto.lowStockProducts`, `TopProductDto`, and
`LowStockProductDto` are all correctly generated and match the backend DTO. No Orval regen is
required for this task.

---

## Relationship to TASK-137

TASK-137 is the broader "admin revenue calc audit — count only earned revenue; show
unrealized-but-ordered separately." TASK-152 overlaps narrowly:

- TASK-152 fixes the `getTopProducts()` SQL (and three revenue-aggregate methods) to filter
  `payment_status = 'PAID'`, establishing the "earned = PAID" ground truth in the dashboard
  queries. This is the minimum needed to show a trustworthy top-products list.
- TASK-137 adds a new UI concept — a separate "unrealized / ordered-but-unpaid" metric — which
  requires additional backend fields, DTO changes, and frontend display work. That is out of scope
  here.

These tasks are complementary. TASK-152 should be completed first; TASK-137 builds on its
corrected query semantics.

---

## Migration impact

None. `payment_status` column already exists on the `orders` table (added earlier; confirmed in
`schema.prisma` line 213: `paymentStatus PaymentStatus @default(PENDING) @map("payment_status")`).
All fixes are in query logic only.

---

## Seed / data state for tests

### Automated tests (int-spec, runs against `store_test` DB)

`beforeAll` seeds everything the spec needs:

- A `Product` with `stock = LOW_STOCK_THRESHOLD - 2` (e.g. 3) — triggers low-stock query
- A `Product` with `stock = LOW_STOCK_THRESHOLD + 50` — should NOT appear in low-stock
- An `Order` with `paymentStatus=PAID`, containing items of the first product — must appear in
  top-products
- An `Order` with `paymentStatus=PENDING` (status=CONFIRMED) — must NOT appear in top-products
- An `Order` with `status=CANCELLED` (and any paymentStatus) — must not appear

No persistent seed data needed; the spec is self-contained.

### Manual QA (running stack)

After TASK-152 ships, run against a real DB to verify:

- Dashboard page shows the "Top products" table
- Low-stock table shows positions with 1-5 stock and `isActive=true`
- "Top products" list contains only products from orders where `paymentStatus=PAID`
- (Promotes the "Dashboard raw-SQL real-DB int-spec run" QA item to green once the int-spec is
  un-staled and can be run with `npm run test:int -w apps/store-api`)

---

## Tasks

### TASK-152-A: TDD Red — rewrite int-spec to current schema + assert paymentStatus=PAID semantics

**Type:** test
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes (this IS the Red step)
**Depends on:** nothing (standalone test change)

**Acceptance Criteria:**

- [ ] `dashboard.repository.int-spec.ts` compiles cleanly against the current Prisma client (no
      `productVariant`, no `variantId` on OrderItem)
- [ ] `beforeAll` seeds:
  - Two `Product` rows with stock inside and outside the low-stock range (no ProductVariant)
  - An `Order` with `paymentStatus=PAID` containing items of the target product
  - An `Order` with `paymentStatus=PENDING` and `status=CONFIRMED` (unpaid-but-confirmed)
  - An `Order` with `status=CANCELLED` (should never appear)
- [ ] `getSummary — top products` test asserts:
  - The PAID order's product appears in `topProducts` with correct `SUM(price * quantity)` revenue
  - The CONFIRMED+UNPAID order's product does NOT appear in `topProducts`
  - The CANCELLED order's product does NOT appear
- [ ] `getSummary — low stock` test asserts using `summary.inventory.lowStockProducts` (not
      `lowStockVariants`), with `productId` and `productName` (not variantId/variantName)
- [ ] Running `npm run test:int -w apps/store-api` produces a FAILING result on the "top products"
      paymentStatus assertion (Red) — confirming the current SQL bug
- [ ] Tests pass: `npm run test:int -w apps/store-api` (expected: fail on paymentStatus assertion)

**Files to create/modify:**

- `apps/store-api/test/dashboard.repository.int-spec.ts` — full rewrite to remove stale ProductVariant
  references; add paymentStatus-seeded orders; assert on `lowStockProducts` keys

---

### TASK-152-B: TDD Green — fix repository SQL to filter `payment_status = 'PAID'`

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes (this IS the Green step)
**Depends on:** TASK-152-A

**Acceptance Criteria:**

- [ ] `getTopProducts()` raw SQL changed: `AND o.status NOT IN ('CANCELLED', 'REFUNDED')` →
      `AND o.payment_status = 'PAID'`
- [ ] `getTotalRevenue()` Prisma aggregate changed: `where: { status: { notIn: NON_REVENUE_STATUSES } }` →
      `where: { paymentStatus: PaymentStatus.PAID }`
- [ ] `getRevenueSince()` Prisma aggregate changed similarly
- [ ] `getRevenueByDay()` raw SQL changed: `AND o.status NOT IN ('CANCELLED', 'REFUNDED')` →
      `AND o.payment_status = 'PAID'`
- [ ] `NON_REVENUE_STATUSES` constant and `OrderStatus` import removed (or updated to note it is
      superseded; import dropped if unused)
- [ ] `PaymentStatus` imported from `@prisma/client` for use in Prisma aggregate where-clauses
- [ ] All TASK-152-A int-spec assertions pass green
- [ ] All existing e2e tests unaffected: `npm run test:e2e -w apps/store-api` green (DashboardRepository
      is mocked in e2e, so SQL changes don't reach it)
- [ ] Tests pass: `npm run test -w apps/store-api` + `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.repository.ts` — update four query methods; swap import;
  update JSDoc comments

---

### TASK-152-C: TDD Refactor — fix stale e2e fixture and update JSDoc

**Type:** refactor
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (cleanup only)
**Depends on:** TASK-152-B

**Acceptance Criteria:**

- [ ] `dashboard.e2e-spec.ts` `summaryFixture.inventory` key renamed from `lowStockVariants` →
      `lowStockProducts`; `variantId`/`variantName` fields replaced with `productId`/`productName`
- [ ] `dashboard.e2e-spec.ts` assertion at `body.inventory.lowStockVariants` corrected to
      `body.inventory.lowStockProducts`; assertion shape updated to match `LowStockProductDto`
      (`productId`, `productName`, `stock`)
- [ ] Empty-store mock updated: `inventory: { lowStockVariants: [] }` → `inventory: { lowStockProducts: [] }`
- [ ] `dashboard.repository.ts` JSDoc updated: `NON_REVENUE_STATUSES` references removed from comments;
      `paymentStatus = PAID` semantics documented; note added explaining TASK-151 decoupling
- [ ] `npm run test:e2e -w apps/store-api` green with no TypeScript errors in the e2e test file

**Files to create/modify:**

- `apps/store-api/test/dashboard.e2e-spec.ts` — update fixture and assertions to match current
  `InventoryMetrics` / `LowStockProduct` shape
- `apps/store-api/src/dashboard/dashboard.repository.ts` — JSDoc cleanup only (no logic change)

---

### TASK-152-D: Frontend — create `DashboardTopProductsTable` widget

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** nothing (pure frontend; data shape already correct in Orval types)

**Acceptance Criteria:**

- [ ] `DashboardTopProductsTable` widget created under `widgets/dashboard-top-products/`
- [ ] Props: `products: TopProductDto[]` (type imported from `@/entities/dashboard`)
- [ ] Table columns: rank (1, 2, 3…), product name, total revenue (formatted via `formatCurrency`)
- [ ] Empty-state row rendered when `products.length === 0` with `dict.dashboard.noTopProducts` text
- [ ] Uses shadcn/ui `Table` / `TableBody` / `TableRow` / `TableCell` primitives (matching the
      pattern in `DashboardLowStockTable`)
- [ ] New dict keys added to `apps/store-admin/src/shared/config/dictionary.ts`:
  - `dashboard.topProducts` — "Топ товари за виручкою"
  - `dashboard.rank` — "#"
  - `dashboard.noTopProducts` — "Немає даних про продажі."
- [ ] Widget exported from `widgets/dashboard-top-products/index.ts`
- [ ] TypeScript, lint, build pass: `npm run typecheck && npm run lint && npm run build -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-top-products/ui/DashboardTopProductsTable.tsx` — new widget
- `apps/store-admin/src/widgets/dashboard-top-products/index.ts` — barrel export
- `apps/store-admin/src/shared/config/dictionary.ts` — add `topProducts`, `rank`, `noTopProducts`

---

### TASK-152-E: Frontend — wire widget into dashboard-view, export from barrel, add RTL test

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-152-D

**Acceptance Criteria:**

- [ ] `DashboardTopProductsTable` exported from `apps/store-admin/src/widgets/index.ts`
- [ ] `dashboard-view.tsx` renders `<DashboardTopProductsTable products={data.products.topProducts} />`
      after `DashboardCharts` and before `DashboardLowStockTable`, separated by a `<Separator />`
- [ ] When API returns an empty `topProducts: []`, the empty-state row is visible (not blank)
- [ ] RTL test for `DashboardTopProductsTable`:
  - Renders ranked rows from a `TopProductDto[]` fixture (three products, checks name + revenue)
  - Renders the empty-state row when `products=[]`
- [ ] All store-admin tests pass: `npm run test -w apps/store-admin`
- [ ] Typecheck + lint + build clean: `npm run typecheck && npm run lint && npm run build -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/index.ts` — add `DashboardTopProductsTable` export
- `apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` — mount the widget
- `apps/store-admin/src/widgets/dashboard-top-products/ui/DashboardTopProductsTable.test.tsx` — RTL tests

---

## Execution order

```
TASK-152-A  →  TASK-152-B  →  TASK-152-C  (backend TDD Red→Green→Refactor, sequential)
TASK-152-D  →  TASK-152-E                  (frontend, can start in parallel with backend)
```

Both tracks can proceed concurrently; they converge at the final build/lint/test gate.

---

## Pending manual QA (post-ship)

Add to the `Pending manual QA` table in `BACKLOG.md`:

> Dashboard top-products + low-stock panels: on a running stack, top-products table shows products
> from `paymentStatus=PAID` orders only; low-stock table shows products with `0 < stock <= 5` and
> `isActive=true`; both panels visible on the dashboard. Promotes the existing "Dashboard raw-SQL
> real-DB int-spec run" QA item: run `npm run test:int -w apps/store-api` against the `store_test`
> DB to confirm the rewritten int-spec passes end-to-end.

---

## Completion checklist

- [ ] TASK-152-A: int-spec rewritten, Red confirmed
- [ ] TASK-152-B: repository SQL fixed, int-spec Green
- [ ] TASK-152-C: e2e fixture un-staled, refactor clean
- [ ] TASK-152-D: `DashboardTopProductsTable` widget built
- [ ] TASK-152-E: widget wired, RTL tests pass, build clean
- [ ] `BACKLOG.md` updated: TASK-152 → ✅, sub-tasks listed, plan link added
- [ ] "Dashboard raw-SQL real-DB int-spec run" QA item promoted in `BACKLOG.md`
