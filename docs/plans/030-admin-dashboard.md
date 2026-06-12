# Plan 030 — Admin Dashboard (metrics, charts) (TASK-043)

> **Status:** Implemented — automated gate green (230 unit + 160 e2e); manual smoke pending (running app + live DB for raw-SQL aggregations)
> **Phase:** Phase 4 — Admin Panel
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-13
>
> **Implementation note:** Used `recharts@^3.8` instead of the planned `^2.12` —
> recharts 3 declares a `react >=16.8` peer, so it installs cleanly against
> React 19 with no `--legacy-peer-deps` workaround (risk #4 resolved at the
> source rather than worked around). The dashboard orchestrator (`DashboardView`)
> lives in the app layer next to `page.tsx` rather than as a widget, to avoid a
> widget→widget lateral import when composing the three dashboard widgets.

## Overview

TASK-043 replaces the static placeholder dashboard page in `store-admin` with a live
metrics dashboard. The dashboard will surface key business indicators in real time:
total revenue, order counts by status, new users registered over time, top-selling
products by revenue, and low-stock variant alerts. A dedicated `DashboardModule` is
added to the backend exposing a single read-only `GET /api/admin/dashboard/summary`
endpoint backed by Prisma aggregate/groupBy queries. The frontend wires the data into
stat cards and charts using `recharts` (shadcn/ui's recommended charting library,
which is not yet installed in `store-admin`).

This plan completes Phase 4 — Admin Panel. After TASK-043 all four management
sections (Products, Categories, Orders, Users) plus the Dashboard are fully
implemented.

---

## Scope

### In Scope

- New `DashboardModule` (repository → service → controller) in `store-api` at prefix
  `admin/dashboard`, protected by `AdminGuard`.
- A single `GET /api/admin/dashboard/summary` endpoint that returns all metrics
  in one payload (avoids waterfall fetches on page load).
- Metrics returned by the endpoint:
  - **Revenue:** total lifetime revenue (sum of `Order.total` for non-CANCELLED /
    non-REFUNDED orders), revenue for the last 30 days, and daily revenue series
    for the last 30 days (for the revenue trend chart).
  - **Orders:** total order count, order count per status, orders per day for the
    last 30 days (for the order trend chart).
  - **Users:** total registered user count, new users per day for the last 30 days.
  - **Products:** total product count, active product count, top 5 products by
    total revenue earned from shipped/delivered orders.
  - **Inventory:** up to 10 product variants with the lowest stock (stock > 0 but
    below a configurable low-stock threshold; default 5).
- Swagger `@ApiProperty` decorators on every response class so Orval generates
  fully-typed hooks — following the same nullable/type discipline documented in
  plans 028 and 029.
- Orval regeneration for `store-admin` to produce a typed
  `useAdminDashboardControllerGetSummary` hook.
- `entities/dashboard` FSD barrel in `store-admin`.
- `widgets/dashboard-stats` (stat cards row).
- `widgets/dashboard-charts` (revenue trend line chart + order-by-status bar chart).
- `widgets/dashboard-low-stock` (low-stock variants table).
- Rewrite of `app/(dashboard)/page.tsx` to compose the three widgets and display
  live data.
- Install `recharts` as a production dependency in `apps/store-admin`.
- Backend e2e tests for the new endpoint (401/403/200 guards + response shape).
- Full build / lint / typecheck / test verification gate.

### Out of Scope

- Date-range picker to let the admin choose an arbitrary window (hard-coded 30-day
  window for MVP; a future task can add query params).
- CSV export of metrics.
- Real-time auto-refresh / WebSocket push — polling via `refetchInterval` on the
  React Query hook is acceptable but not required for MVP.
- Revenue breakdown by category or payment method.
- Funnel analytics (cart abandonment rate) — this belongs to Phase 5 (TASK-049).
- GA4 event forwarding — Phase 5 (TASK-050).
- Caching the summary endpoint with Redis — Phase 5 (TASK-044) can add
  `CacheInterceptor` later without touching this plan's controller.

---

## User Stories

1. As an admin, I want to see total revenue and revenue for the last 30 days at a
   glance so that I can assess store performance without running SQL queries.
2. As an admin, I want to see a revenue trend line chart for the last 30 days so
   that I can spot peaks and troughs quickly.
3. As an admin, I want to see total order counts by status so that I can identify
   how many orders are awaiting fulfillment.
4. As an admin, I want to see new user registrations over the last 30 days so that
   I can monitor customer acquisition.
5. As an admin, I want to see the top 5 best-selling products so that I can
   understand which items drive the most revenue.
6. As an admin, I want to see a low-stock alert table so that I can restock before
   items sell out.

---

## Technical Design

### Data Model

No Prisma migration is required. All metrics are derived from existing models:
`Order`, `OrderItem`, `User`, `Product`, `ProductVariant`. All queries are
read-only aggregations — no new columns, tables, or relations are needed.

### Backend (store-api)

#### DashboardRepository

Location: `apps/store-api/src/dashboard/dashboard.repository.ts`

All methods accept an optional `windowDays: number` parameter (defaulting to 30)
that defines the rolling window for time-series data.

Key Prisma query patterns:

| Method                                  | Prisma operation                                                                                                                                                                   | Notes                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `getTotalRevenue()`                     | `aggregate({ _sum: { total: true } })`                                                                                                                                             | Excludes CANCELLED and REFUNDED orders                                                                   |
| `getRevenueLast30Days()`                | Same aggregate with `createdAt >= windowStart` filter                                                                                                                              |                                                                                                          |
| `getRevenueByDay(days)`                 | Raw `groupBy` on `createdAt` date truncated to day                                                                                                                                 | Prisma `$queryRaw` using `DATE_TRUNC('day', created_at)` — returns `[{ date: string; revenue: number }]` |
| `getOrderCountByStatus()`               | `groupBy(['status'])` with `_count: true`                                                                                                                                          | Returns `OrderStatus` enum values as keys                                                                |
| `getOrdersByDay(days)`                  | Raw `$queryRaw` with `DATE_TRUNC('day', created_at)` and `COUNT(*)`                                                                                                                |                                                                                                          |
| `getTotalUsers()`                       | `user.count()`                                                                                                                                                                     | All users                                                                                                |
| `getNewUsersByDay(days)`                | Raw `$queryRaw` with `DATE_TRUNC('day', created_at)` on users                                                                                                                      |                                                                                                          |
| `getTotalProducts()`                    | `product.count()`                                                                                                                                                                  | All products                                                                                             |
| `getActiveProducts()`                   | `product.count({ where: { isActive: true } })`                                                                                                                                     |                                                                                                          |
| `getTopProducts(limit)`                 | `orderItem.groupBy(['productId'])` with `_sum: { price: true }`, sorted desc, take `limit`, then resolve product names                                                             | Join product data via a second query after groupBy                                                       |
| `getLowStockVariants(threshold, limit)` | `productVariant.findMany({ where: { stock: { gt: 0, lte: threshold }, isActive: true }, orderBy: { stock: 'asc' }, take: limit, include: { product: { select: { id, name } } } })` |                                                                                                          |

The `getRevenueByDay` and `getOrdersByDay` raw queries use `$queryRaw` tagged
template literals and return typed arrays. The `getNewUsersByDay` query follows the
same pattern against the `users` table.

The repository collects results from all the above into a single `getSummary()`
method that runs them in parallel using `Promise.all` and returns a typed
`DashboardSummary` interface (defined in `dashboard.types.ts`).

#### DashboardService

Location: `apps/store-api/src/dashboard/dashboard.service.ts`

A thin pass-through service with a single public method:

```typescript
getSummary(): Promise<DashboardSummaryDto>
```

Delegates entirely to `DashboardRepository.getSummary()`. The service layer exists
to honour Clean Architecture (controllers never import repositories) and to provide
the injection boundary needed for unit testing and future caching middleware.

No TDD cycle required — there is no complex business logic; all computation is
delegated to Prisma.

#### DashboardController

Location: `apps/store-api/src/dashboard/dashboard.controller.ts`

```
GET  /api/admin/dashboard/summary
```

Protected by `AdminGuard`. Returns `DashboardSummaryResponse` (a fully-decorated
Swagger class). All nested types are fully decorated with `@ApiProperty` so Orval
generates typed models — this is the same discipline applied in plans 028 and 029
to avoid `{ [key: string]: unknown }` in generated code.

`operationId`: `adminDashboardControllerGetSummary`

Response envelope follows the same pattern as `AdminOrderListResponse`: a flat
`DashboardSummaryResponse` class (no `{ data }` wrapper, since there is only one
object — no pagination needed). This matches the pattern used for single-item
endpoints in the codebase.

#### Response Shape

```typescript
// apps/store-api/src/dashboard/dto/dashboard-summary.dto.ts

class DailyDataPointDto {
  @ApiProperty({ type: String }) date!: string; // "YYYY-MM-DD"
  @ApiProperty({ type: Number }) value!: number;
}

class RevenueMetricsDto {
  @ApiProperty({ type: Number }) totalRevenue!: number;
  @ApiProperty({ type: Number }) revenueLast30Days!: number;
  @ApiProperty({ type: [DailyDataPointDto] })
  revenueByDay!: DailyDataPointDto[];
}

class OrderStatusCountDto {
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: Number }) count!: number;
}

class OrderMetricsDto {
  @ApiProperty({ type: Number }) totalOrders!: number;
  @ApiProperty({ type: [OrderStatusCountDto] })
  ordersByStatus!: OrderStatusCountDto[];
  @ApiProperty({ type: [DailyDataPointDto] }) ordersByDay!: DailyDataPointDto[];
}

class UserMetricsDto {
  @ApiProperty({ type: Number }) totalUsers!: number;
  @ApiProperty({ type: [DailyDataPointDto] })
  newUsersByDay!: DailyDataPointDto[];
}

class TopProductDto {
  @ApiProperty({ type: String }) productId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number }) totalRevenue!: number;
}

class ProductMetricsDto {
  @ApiProperty({ type: Number }) totalProducts!: number;
  @ApiProperty({ type: Number }) activeProducts!: number;
  @ApiProperty({ type: [TopProductDto] }) topProducts!: TopProductDto[];
}

class LowStockVariantDto {
  @ApiProperty({ type: String }) variantId!: string;
  @ApiProperty({ type: String }) variantName!: string;
  @ApiProperty({ type: String }) productId!: string;
  @ApiProperty({ type: String }) productName!: string;
  @ApiProperty({ type: Number }) stock!: number;
}

class InventoryMetricsDto {
  @ApiProperty({ type: [LowStockVariantDto] })
  lowStockVariants!: LowStockVariantDto[];
}

export class DashboardSummaryResponse {
  @ApiProperty({ type: RevenueMetricsDto }) revenue!: RevenueMetricsDto;
  @ApiProperty({ type: OrderMetricsDto }) orders!: OrderMetricsDto;
  @ApiProperty({ type: UserMetricsDto }) users!: UserMetricsDto;
  @ApiProperty({ type: ProductMetricsDto }) products!: ProductMetricsDto;
  @ApiProperty({ type: InventoryMetricsDto }) inventory!: InventoryMetricsDto;
}
```

#### DashboardModule

Location: `apps/store-api/src/dashboard/dashboard.module.ts`

Imports `PrismaModule`. Providers: `DashboardRepository`, `DashboardService`.
Controllers: `DashboardController`. Registered in `AppModule.imports`.

### Frontend (store-admin — FSD)

#### Charting Library Decision

`recharts` is not currently installed in `apps/store-admin`. shadcn/ui's chart
components are built on `recharts` — when shadcn/ui chart primitives are added the
dependency is pulled in automatically, but the project uses radix-ui primitives
directly and has not installed recharts yet. The plan installs `recharts` as an
explicit production dependency (TASK-043-D). No shadcn/ui chart primitive wrapper is
added — the widgets use `recharts` components directly wrapped in "use client" wrappers
for maximum control and minimal boilerplate.

#### entities/dashboard

`apps/store-admin/src/entities/dashboard/index.ts` — barrel re-exporting the Orval-
generated hook (`useAdminDashboardControllerGetSummary`) and all generated response
types (`DashboardSummaryResponse`, `RevenueMetricsDto`, `OrderMetricsDto`,
`UserMetricsDto`, `ProductMetricsDto`, `InventoryMetricsDto`, `DailyDataPointDto`,
`TopProductDto`, `LowStockVariantDto`, `OrderStatusCountDto`) from `@/shared/api`.

#### widgets/dashboard-stats

`AdminDashboardStats` — a "use client" component that accepts the summary data as
props (not a data-fetching component itself — data fetching is done at the page level
and passed down). Renders four stat cards in a responsive grid (2×2 on mobile, 4×1
on lg):

| Card              | Metric                                            | Sub-text                              |
| ----------------- | ------------------------------------------------- | ------------------------------------- |
| Total Revenue     | `revenue.totalRevenue` formatted as currency      | "Lifetime (excl. cancelled/refunded)" |
| Revenue (30 days) | `revenue.revenueLast30Days` formatted as currency | "Last 30 days"                        |
| Total Orders      | `orders.totalOrders`                              | Breakdown: N pending, N confirmed     |
| Total Users       | `users.totalUsers`                                | "Registered customers"                |

Each card uses the same `rounded-lg border border-border bg-card p-6` pattern from
the existing static dashboard, replacing the `—` placeholder with real data.

#### widgets/dashboard-charts

Two sub-components, both "use client":

1. `RevenueTrendChart` — a `recharts` `LineChart` plotting `revenue.revenueByDay`
   (x-axis: date label; y-axis: revenue value). Renders inside a `ResponsiveContainer`
   with `width="100%"` and a fixed height of 240px. Includes `Tooltip`, `CartesianGrid`,
   `XAxis`, `YAxis`.

2. `OrdersByStatusChart` — a `recharts` `BarChart` plotting `orders.ordersByStatus`
   (x-axis: status label; y-axis: count). Same `ResponsiveContainer` setup.

Both charts are wrapped in a card `<div>` with heading. The widgets index exports
`DashboardCharts` as a convenience wrapper that renders both charts side by side on
`lg:` screens (CSS grid `grid-cols-1 lg:grid-cols-2 gap-6`).

#### widgets/dashboard-low-stock

`DashboardLowStockTable` — a "use client" component that renders a `shadcn/ui`
`Table` of `inventory.lowStockVariants`. Columns: Product Name, Variant Name, Stock.
Renders a stock badge: `stock <= 2` = `"destructive"`, `stock <= 5` = `"outline"` (yellow).
Shows an empty state "No low-stock variants." when the array is empty.

#### app/(dashboard)/page.tsx (rewrite)

The page becomes a "use client" component (or delegates to a client orchestrator
widget). It fetches the summary via `useAdminDashboardControllerGetSummary` from
`@/entities/dashboard`. While loading, shows `DashboardSkeleton`. On success, renders:

1. Page heading "Dashboard" with last-updated timestamp.
2. `<AdminDashboardStats summary={data} />` — stat cards.
3. `<Separator />` — visual break.
4. `<DashboardCharts summary={data} />` — two charts side by side.
5. `<Separator />` — visual break.
6. `<DashboardLowStockTable variants={data.inventory.lowStockVariants} />` — low-stock
   table.
7. Quick Actions section (existing buttons, updated hrefs).

The existing static content (hardcoded `—` values) is replaced entirely. The Quick
Actions buttons already exist; their `href` props point to live routes.

---

## Tasks

### TASK-043-A: Create DashboardModule backend (repository + service + controller + DTO)

**Type:** feat
**Scope:** store-api
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/src/dashboard/` directory created with the following files:
      `dashboard.repository.ts`, `dashboard.service.ts`, `dashboard.controller.ts`,
      `dashboard.module.ts`, `dashboard.types.ts`,
      `dto/dashboard-summary.dto.ts`, `dto/index.ts`, `index.ts`.
- [ ] `DashboardRepository.getSummary()` runs all metric queries in parallel via
      `Promise.all` and returns a typed `DashboardSummary` object. Specifically:
  - `getTotalRevenue()` — `prisma.order.aggregate({ _sum: { total: true }, where: { status: { notIn: [CANCELLED, REFUNDED] } } })`. Returns `number` (converts `Decimal` to `number` via `.toNumber()`).
  - `getRevenueLast30Days()` — same aggregate with `createdAt: { gte: windowStart }` filter.
  - `getRevenueByDay(30)` — `$queryRaw` using `DATE_TRUNC('day', created_at)`, grouped by day, ordered asc, returns `DailyDataPointDto[]` where `value` is the daily revenue sum.
  - `getOrderCountByStatus()` — `prisma.order.groupBy({ by: ['status'], _count: { id: true } })`. Returns `OrderStatusCountDto[]`.
  - `getOrdersByDay(30)` — `$queryRaw` counting orders per day for the last 30 days. Returns `DailyDataPointDto[]`.
  - `getTotalUsers()` — `prisma.user.count()`.
  - `getNewUsersByDay(30)` — `$queryRaw` counting new user registrations per day for the last 30 days. Returns `DailyDataPointDto[]`.
  - `getTotalProducts()` — `prisma.product.count()`.
  - `getActiveProducts()` — `prisma.product.count({ where: { isActive: true } })`.
  - `getTopProducts(5)` — `prisma.orderItem.groupBy({ by: ['productId'], _sum: { price: true }, orderBy: { _sum: { price: 'desc' } }, take: 5 })` then resolves product names via `prisma.product.findMany({ where: { id: { in: productIds } }, select: { id, name } })`. Returns `TopProductDto[]`.
  - `getLowStockVariants(5, 10)` — `prisma.productVariant.findMany({ where: { stock: { gt: 0, lte: threshold }, isActive: true }, orderBy: { stock: 'asc' }, take: limit, include: { product: { select: { id, name } } } })`. Returns `LowStockVariantDto[]`.
- [ ] `DashboardService.getSummary()` delegates to `dashboardRepository.getSummary()` and returns a `DashboardSummaryResponse` DTO (maps raw types to the DTO classes).
- [ ] `DashboardController` at prefix `admin/dashboard`:
  - Decorated with `@ApiTags('Admin Dashboard')`, `@ApiBearerAuth('access-token')`, `@UseGuards(AdminGuard)`.
  - `@ApiExtraModels(DashboardSummaryResponse, RevenueMetricsDto, OrderMetricsDto, UserMetricsDto, ProductMetricsDto, InventoryMetricsDto, DailyDataPointDto, TopProductDto, LowStockVariantDto, OrderStatusCountDto)` on the class.
  - `GET /` — `@ApiOperation({ operationId: 'adminDashboardControllerGetSummary' })`, `@ApiResponse({ status: 200, type: DashboardSummaryResponse })`, `@ApiResponse({ status: 403 })`. Handler calls `dashboardService.getSummary()` and returns the result.
- [ ] All DTO classes in `dto/dashboard-summary.dto.ts` have `@ApiProperty` with an explicit `type` on every field (no bare interface — every class must be `@ApiProperty`-decorated so Orval resolves types). Arrays use `type: [ClassName]`. No `nullable` fields in this DTO (all metric fields are always present, defaulting to 0 / [] if no data).
- [ ] `DashboardModule` registers `DashboardRepository` and `DashboardService` as providers, `DashboardController` as controller, and imports `PrismaModule`.
- [ ] `apps/store-api/src/app.module.ts` imports `DashboardModule`.
- [ ] `apps/store-api/src/dashboard/index.ts` barrel exports `DashboardModule`.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run test -w apps/store-api` passes (existing specs unaffected).
- [ ] `npm run swagger:export -w apps/store-api` produces `swagger.json` containing the `GET /api/admin/dashboard/summary` endpoint with a fully-typed `DashboardSummaryResponse` schema (no `additionalProperties: true`, no unresolved `oneOf`).

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.types.ts` — internal TypeScript interfaces (not Swagger DTOs)
- `apps/store-api/src/dashboard/dashboard.repository.ts` — all Prisma aggregation methods
- `apps/store-api/src/dashboard/dashboard.service.ts` — thin pass-through service
- `apps/store-api/src/dashboard/dto/dashboard-summary.dto.ts` — all Swagger-decorated DTO classes
- `apps/store-api/src/dashboard/dto/index.ts` — DTO barrel
- `apps/store-api/src/dashboard/dashboard.controller.ts` — admin GET endpoint
- `apps/store-api/src/dashboard/dashboard.module.ts` — module registration
- `apps/store-api/src/dashboard/index.ts` — module barrel
- `apps/store-api/src/app.module.ts` — add `DashboardModule` to imports

---

### TASK-043-B: Add backend e2e tests for the dashboard endpoint

**Type:** test
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-043-A

**Acceptance Criteria:**

- [ ] `apps/store-api/test/dashboard.e2e-spec.ts` created with a
      `describe('Admin Dashboard — GET /api/admin/dashboard/summary')` block:
  - `GET /api/admin/dashboard/summary` returns `401` without a token.
  - `GET /api/admin/dashboard/summary` returns `403` with a non-admin (CUSTOMER)
    token.
  - `GET /api/admin/dashboard/summary` returns `200` with an admin token.
  - Response body matches the shape of `DashboardSummaryResponse`:
    - `revenue` has numeric `totalRevenue`, `revenueLast30Days`, and array
      `revenueByDay` (each element has `date: string` and `value: number`).
    - `orders` has numeric `totalOrders`, array `ordersByStatus` (each element has
      `status: string` and `count: number`), and array `ordersByDay`.
    - `users` has numeric `totalUsers` and array `newUsersByDay`.
    - `products` has numeric `totalProducts`, `activeProducts`, and array
      `topProducts` (each element has `productId`, `name`, `totalRevenue`).
    - `inventory` has array `lowStockVariants` (each element has `variantId`,
      `variantName`, `productId`, `productName`, `stock`).
  - All numeric fields are `>= 0` (no negative values; no null/undefined).
  - All array fields are arrays (may be empty when test DB has no orders/users).
- [ ] `npm run test:e2e -w apps/store-api` passes with all new specs green.
- [ ] `npm run test -w apps/store-api` passes (existing unit specs unaffected).

**Files to create/modify:**

- `apps/store-api/test/dashboard.e2e-spec.ts` — new e2e spec file

---

### TASK-043-C: Regenerate Orval API hooks for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-043-A

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error.
- [ ] `npm run generate:api -w apps/store-admin` runs without error.
- [ ] `apps/store-admin/src/shared/api/generated/admin-dashboard/` directory
      created (or equivalent tag-based path determined by Orval) containing
      `admin-dashboard.ts` with:
  - `useAdminDashboardControllerGetSummary` — a `useQuery` hook returning the
    fully-typed `DashboardSummaryResponse`.
  - `getAdminDashboardControllerGetSummaryQueryKey` — query key getter.
- [ ] `apps/store-admin/src/shared/api/generated/models/` contains new model files
      for all DTO classes: `DashboardSummaryResponse`, `RevenueMetricsDto`,
      `OrderMetricsDto`, `UserMetricsDto`, `ProductMetricsDto`, `InventoryMetricsDto`,
      `DailyDataPointDto`, `TopProductDto`, `LowStockVariantDto`, `OrderStatusCountDto`
      (exact filenames determined by Orval's camelCase→kebab conversion).
- [ ] `apps/store-admin/src/shared/api/index.ts` updated to add
      `export * from "./generated/admin-dashboard/admin-dashboard"` (or whatever the
      actual path is after generation).
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration.
- [ ] Generated files are NOT hand-edited.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)
- `apps/store-admin/src/shared/api/index.ts` — add admin-dashboard re-export

---

### TASK-043-D: Install recharts in store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (< 0.5h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `recharts` added as a production dependency in
      `apps/store-admin/package.json`. Recommended version: `^2.12` (latest stable
      2.x series; compatible with React 19 and Next.js 16).
- [ ] `@types/recharts` is NOT needed — recharts ships its own TypeScript types.
- [ ] `npm install` (workspace root) completes without peer-dependency warnings
      for recharts. If React 19 peer-dependency warnings appear (recharts 2.x declares
      `peerDependencies: react@^18`), use `--legacy-peer-deps` flag and document the
      decision in a comment in `package.json` (e.g., `// recharts 2.x peer: react@18,
works with 19`).
- [ ] `import { LineChart } from 'recharts'` compiles without TypeScript error in
      a test import in `apps/store-admin`.
- [ ] `npm run build -w apps/store-admin` passes (Next.js can bundle recharts
      client-only components when they are inside "use client" boundaries).

**Files to create/modify:**

- `apps/store-admin/package.json` — add `"recharts": "^2.12"` to dependencies

---

### TASK-043-E: Create entities/dashboard barrel slice in store-admin

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-043-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/dashboard/index.ts` created, re-exporting
      from `@/shared/api`:
  - Types: `DashboardSummaryResponse`, `RevenueMetricsDto`, `OrderMetricsDto`,
    `UserMetricsDto`, `ProductMetricsDto`, `InventoryMetricsDto`,
    `DailyDataPointDto`, `TopProductDto`, `LowStockVariantDto`,
    `OrderStatusCountDto`
  - Hook: `useAdminDashboardControllerGetSummary`
  - Query key getter: `getAdminDashboardControllerGetSummaryQueryKey`
- [ ] `apps/store-admin/src/entities/index.ts` updated to add
      `export * from './dashboard'`.
- [ ] FSD import rule satisfied: `entities` layer imports only from `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/entities/dashboard/index.ts` — new barrel
- `apps/store-admin/src/entities/index.ts` — add `export * from './dashboard'`

---

### TASK-043-F: Create widgets/dashboard-stats slice (stat cards)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-043-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx`
      created:
  - Props: `{ summary: DashboardSummaryResponse }`
  - A pure presentational component (no "use client" directive needed — no hooks,
    no browser APIs; can be rendered in a parent client component).
  - Renders four stat cards in a responsive CSS grid:
    `grid grid-cols-2 gap-4 lg:grid-cols-4`.
  - Each card uses the existing `rounded-lg border border-border bg-card p-6`
    Tailwind pattern from the current static page.
  - Card 1: "Total Revenue" — displays `summary.revenue.totalRevenue` formatted
    as `$X,XXX.XX` using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
    Sub-text: "Lifetime (excl. cancelled / refunded)".
  - Card 2: "Revenue (30 days)" — `summary.revenue.revenueLast30Days` formatted
    same way. Sub-text: "Last 30 days".
  - Card 3: "Total Orders" — `summary.orders.totalOrders`. Sub-text: shows
    `PENDING` count from `ordersByStatus` as "N awaiting fulfilment".
  - Card 4: "Total Users" — `summary.users.totalUsers`. Sub-text: "Registered
    customers".
- [ ] `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStatsSkeleton.tsx`
      created — four animated skeleton cards matching the stat card layout.
- [ ] `apps/store-admin/src/widgets/dashboard-stats/index.ts` exports
      `AdminDashboardStats` and `AdminDashboardStatsSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add both exports.
- [ ] FSD: `widgets` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx` — new file
- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStatsSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/dashboard-stats/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-043-G: Create widgets/dashboard-charts slice (trend charts)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-043-D, TASK-043-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/dashboard-charts/ui/RevenueTrendChart.tsx`
      created:
  - `"use client"` directive at top (recharts requires browser environment).
  - Props: `{ data: DailyDataPointDto[] }`
  - Renders a `recharts` `LineChart` wrapped in `ResponsiveContainer width="100%" height={240}`.
  - `Line dataKey="value"` (solid, `stroke` uses the CSS variable for `--primary`
    via inline style or a Tailwind color token).
  - `XAxis dataKey="date"` — uses last 4 chars of date string (MM-DD) as tick
    label to avoid crowding.
  - `YAxis tickFormatter={(v) => '$' + v.toFixed(0)}`.
  - `CartesianGrid strokeDasharray="3 3"`.
  - `Tooltip formatter={(v: number) => ['$' + v.toFixed(2), 'Revenue']}`.
  - Wrapped in a card `<div>` with heading "Revenue (30 days)".
- [ ] `apps/store-admin/src/widgets/dashboard-charts/ui/OrdersByStatusChart.tsx`
      created:
  - `"use client"` directive.
  - Props: `{ data: OrderStatusCountDto[] }`
  - Renders a `recharts` `BarChart` with `Bar dataKey="count"` and `XAxis dataKey="status"`.
  - `Tooltip`, `CartesianGrid`, `ResponsiveContainer width="100%" height={240}`.
  - Wrapped in a card `<div>` with heading "Orders by Status".
- [ ] `apps/store-admin/src/widgets/dashboard-charts/ui/DashboardCharts.tsx`
      created:
  - `"use client"` directive.
  - Props: `{ summary: DashboardSummaryResponse }`
  - Renders `<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">` containing
    `<RevenueTrendChart>` and `<OrdersByStatusChart>`.
- [ ] `apps/store-admin/src/widgets/dashboard-charts/index.ts` exports
      `DashboardCharts`, `RevenueTrendChart`, `OrdersByStatusChart`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add re-exports.
- [ ] FSD: `widgets` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.
- [ ] `npm run build -w apps/store-admin` passes (Next.js client boundary is
      correct — recharts components are not imported in Server Components).

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-charts/ui/RevenueTrendChart.tsx` — new file
- `apps/store-admin/src/widgets/dashboard-charts/ui/OrdersByStatusChart.tsx` — new file
- `apps/store-admin/src/widgets/dashboard-charts/ui/DashboardCharts.tsx` — new file
- `apps/store-admin/src/widgets/dashboard-charts/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-043-H: Create widgets/dashboard-low-stock slice (low-stock table)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-043-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.tsx`
      created:
  - Props: `{ variants: LowStockVariantDto[] }`
  - A pure presentational component (no hooks, no "use client" required).
  - Renders a `shadcn/ui` `Table` with heading "Low Stock Alerts".
  - Columns: Product Name, Variant Name, Stock (right-aligned).
  - Stock cell renders a `Badge`:
    - `variant="destructive"` when `stock <= 2`.
    - `variant="outline"` with Tailwind `text-yellow-600` class when `stock <= 5`.
  - If `variants` array is empty, renders a single empty-state row with text "No
    low-stock variants." spanning all columns.
- [ ] `apps/store-admin/src/widgets/dashboard-low-stock/index.ts` exports
      `DashboardLowStockTable`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add re-export.
- [ ] FSD: `widgets` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.tsx` — new file
- `apps/store-admin/src/widgets/dashboard-low-stock/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-export

---

### TASK-043-I: Rewrite app/(dashboard)/page.tsx with live dashboard data

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-043-F, TASK-043-G, TASK-043-H

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/app/(dashboard)/page.tsx` rewritten:
  - Introduces a `DashboardView` client component (in
    `widgets/dashboard-stats/ui/DashboardView.tsx` or inline in the page as an
    inner "use client" component — either approach is acceptable). The reason: the
    route itself can remain a Server Component for metadata, but data fetching via
    `useAdminDashboardControllerGetSummary` requires a client component.
    Recommended pattern: the page is a Server Component that exports `metadata`
    and renders `<Suspense fallback={<DashboardSkeleton />}><DashboardView /></Suspense>`.
    `DashboardView` is a "use client" component that calls the hook and renders the
    three widgets.
  - `export const metadata = { title: 'Dashboard — Admin' }` on the page.
  - `DashboardView` calls `useAdminDashboardControllerGetSummary()` from
    `@/entities/dashboard`. While `isLoading` is true, renders
    `AdminDashboardStatsSkeleton`.
  - On success, renders:
    1. Page heading: `<h1 className="text-2xl font-bold text-foreground">Dashboard</h1>`
       with a sub-text showing the last-updated time (`new Date().toLocaleTimeString()`
       or the query `dataUpdatedAt`).
    2. `<AdminDashboardStats summary={data} />`.
    3. `<Separator className="my-6" />`.
    4. `<DashboardCharts summary={data} />`.
    5. `<Separator className="my-6" />`.
    6. `<DashboardLowStockTable variants={data.inventory.lowStockVariants} />`.
    7. `<Separator className="my-6" />`.
    8. Quick Actions section with `<Link href="/products/new">` "Add Product",
       `<Link href="/orders">` "View Orders", `<Link href="/users">` "Manage Users".
  - All existing static `—` placeholders removed.
  - Quick Actions buttons use `<Button asChild>` with nested `<Link>` (not
    `<Button>` with `onClick(() => router.push(...))`) to stay SSR-compatible.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/page.tsx` — rewrite
- (Optional) `apps/store-admin/src/widgets/dashboard-stats/ui/DashboardView.tsx` — new client orchestrator if separated

---

### TASK-043-J: Build, lint, typecheck, test verification gate

**Type:** chore
**Scope:** store-api, store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-043-A through TASK-043-I

**Acceptance Criteria:**

- [ ] `npm run build` (all workspaces) completes without error.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test -w apps/store-api` passes — all existing unit specs green;
      no regressions from `DashboardModule` registration in `AppModule`.
- [ ] `npm run test:e2e -w apps/store-api` passes — new `dashboard.e2e-spec.ts`
      specs green (TASK-043-B).
- [ ] Manual smoke test (running app):
  - Navigate to `/` (Dashboard) in `store-admin` — page loads without `—`
    placeholders; stat cards show real numbers from seeded data.
  - Revenue trend `LineChart` renders with a line plot for the last 30 days (may
    be flat if all seeded orders are older; no JavaScript error).
  - Orders by Status `BarChart` renders bars for each `OrderStatus` that has at
    least one order in the seed data.
  - Low-stock table renders seeded `ProductVariant` rows with `stock <= 5` (or
    "No low-stock variants." if none match).
  - Quick Actions "Add Product" links to `/products/new`, "View Orders" to
    `/orders`, "Manage Users" to `/users`.
  - Dashboard sidebar link is active-highlighted on `/`.
  - `GET /api/admin/dashboard/summary` returns `200` with an admin JWT in
    Postman/curl; returns `403` without admin credentials.

---

## Migration Steps

No Prisma migration is required for this feature. All dashboard metrics are derived
from existing data using read-only aggregate queries.

Implementation order:

1. Create `DashboardModule` backend (TASK-043-A). This is the only purely backend
   step and has no frontend dependency.
2. Write backend e2e tests (TASK-043-B) — can be done in parallel with TASK-043-C
   through TASK-043-D.
3. Regenerate Orval hooks (TASK-043-C) — depends on TASK-043-A completing.
4. Install recharts (TASK-043-D) — independent; can be done any time.
5. Create `entities/dashboard` barrel (TASK-043-E) — depends on TASK-043-C.
6. Create `widgets/dashboard-stats` (TASK-043-F) and `widgets/dashboard-low-stock`
   (TASK-043-H) — both depend on TASK-043-E, can proceed in parallel.
7. Create `widgets/dashboard-charts` (TASK-043-G) — depends on TASK-043-D and
   TASK-043-E; can proceed in parallel with TASK-043-F and TASK-043-H.
8. Rewrite the dashboard page (TASK-043-I) — depends on TASK-043-F, TASK-043-G,
   TASK-043-H.
9. Run the full verification gate (TASK-043-J).

---

## Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                                         | Action                                      | Subtask |
| -------------------------------------------- | ------------------------------------------- | ------- |
| `src/dashboard/dashboard.types.ts`           | Create — internal TypeScript interfaces     | 043-A   |
| `src/dashboard/dto/dashboard-summary.dto.ts` | Create — all Swagger-decorated DTO classes  | 043-A   |
| `src/dashboard/dto/index.ts`                 | Create — DTO barrel                         | 043-A   |
| `src/dashboard/dashboard.repository.ts`      | Create — all Prisma aggregation methods     | 043-A   |
| `src/dashboard/dashboard.service.ts`         | Create — thin pass-through service          | 043-A   |
| `src/dashboard/dashboard.controller.ts`      | Create — `GET /api/admin/dashboard/summary` | 043-A   |
| `src/dashboard/dashboard.module.ts`          | Create — module registration                | 043-A   |
| `src/dashboard/index.ts`                     | Create — module barrel                      | 043-A   |
| `src/app.module.ts`                          | Modify — add `DashboardModule` to imports   | 043-A   |
| `test/dashboard.e2e-spec.ts`                 | Create — new e2e spec                       | 043-B   |

### Frontend (store-admin)

| File                                                             | Action                                       | Subtask             |
| ---------------------------------------------------------------- | -------------------------------------------- | ------------------- |
| `package.json`                                                   | Modify — add `recharts` dependency           | 043-D               |
| `src/shared/api/generated/`                                      | Regenerate (do not hand-edit)                | 043-C               |
| `src/shared/api/index.ts`                                        | Modify — add admin-dashboard re-export       | 043-C               |
| `src/entities/dashboard/index.ts`                                | Create — dashboard entity barrel             | 043-E               |
| `src/entities/index.ts`                                          | Modify — add `export * from './dashboard'`   | 043-E               |
| `src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx`         | Create                                       | 043-F               |
| `src/widgets/dashboard-stats/ui/AdminDashboardStatsSkeleton.tsx` | Create                                       | 043-F               |
| `src/widgets/dashboard-stats/index.ts`                           | Create — barrel                              | 043-F               |
| `src/widgets/dashboard-charts/ui/RevenueTrendChart.tsx`          | Create                                       | 043-G               |
| `src/widgets/dashboard-charts/ui/OrdersByStatusChart.tsx`        | Create                                       | 043-G               |
| `src/widgets/dashboard-charts/ui/DashboardCharts.tsx`            | Create                                       | 043-G               |
| `src/widgets/dashboard-charts/index.ts`                          | Create — barrel                              | 043-G               |
| `src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.tsx`  | Create                                       | 043-H               |
| `src/widgets/dashboard-low-stock/index.ts`                       | Create — barrel                              | 043-H               |
| `src/widgets/index.ts`                                           | Modify — add all three new widget re-exports | 043-F, 043-G, 043-H |
| `src/app/(dashboard)/page.tsx`                                   | Rewrite — live data, Suspense, DashboardView | 043-I               |

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$queryRaw` for `DATE_TRUNC` is PostgreSQL-specific — breaks if the test runner uses SQLite                                                                                                                                       | The project uses PostgreSQL via Docker Compose for all environments (e2e tests run against `store_test`). No SQLite fallback is needed. Confirm with `prisma.datasource.provider === "postgresql"` in `schema.prisma` before writing raw queries.                                |
| `getTopProducts` requires a second query to resolve product names from `groupBy` results — may cause N+1 if naively looped                                                                                                        | Use a single `prisma.product.findMany({ where: { id: { in: topProductIds } } })` lookup after `groupBy`, then join in-memory. The list is always limited to 5 items so the overhead is negligible.                                                                               |
| `recharts` 2.x declares `peerDependencies: react@^18` — npm may emit peer-dependency warnings with React 19                                                                                                                       | Use `--legacy-peer-deps` during install. Document the decision. recharts 2.x works with React 19 at runtime despite the declared peer range. Monitor recharts v3 (currently in RC) for a native React 19 peer declaration.                                                       |
| Orval may not generate a clean directory name for the `Admin Dashboard` tag — the directory could be `admin-dashboard` or `adminDashboard`                                                                                        | After running `generate:api`, check the actual generated path and update `shared/api/index.ts` accordingly. Document the actual path in the TASK-043-C sign-off.                                                                                                                 |
| `DashboardSummaryResponse` has deeply nested DTO classes — if any inner class is missing `@ApiProperty` decorators Orval will emit `{ [key: string]: unknown }` for that field                                                    | Follow the same explicit-type discipline from plan 029. After `swagger:export`, inspect the raw `swagger.json` for any `additionalProperties: true` nodes before proceeding to Orval generation.                                                                                 |
| Revenue aggregation includes orders in all statuses except CANCELLED/REFUNDED — a large number of PENDING orders (unpaid) will inflate the revenue figure                                                                         | This is intentional for MVP (revenue = committed orders). Add a note in the stat card sub-text: "Excl. cancelled/refunded". A future task can split into "paid revenue" (PAID orders only) once Stripe (TASK-034) is live.                                                       |
| `getDashboardSummary` aggregates many queries in parallel — on a cold DB with large datasets this could be slow                                                                                                                   | For MVP this is acceptable. When Phase 5 Redis caching (TASK-044) lands, a `CacheInterceptor` can be added to `DashboardController` without changing the controller logic.                                                                                                       |
| `recharts` `LineChart` and `BarChart` imported in a "use client" boundary but the file is inside a Next.js App Router layout — if imported without "use client" in parent Server Components, Next.js will throw a hydration error | All three chart components have explicit `"use client"` at the top. `DashboardView` (the orchestrator that composes them) is also "use client". The parent `page.tsx` is a Server Component that only imports `DashboardView` (client) — this is the correct App Router pattern. |

---

## Sequencing Diagram

```
TASK-043-A  (backend: DashboardModule — repository + service + controller + DTOs)
    ├── TASK-043-B  (e2e tests — can run in parallel with C-I after A completes)
    └── TASK-043-C  (Orval regen — typed DashboardSummaryResponse + hooks)
              └── TASK-043-E  (entities/dashboard barrel)
                        ├── TASK-043-F  (widgets/dashboard-stats)  ─────────────┐
                        │                                                        ├── TASK-043-I  (page.tsx rewrite)
                        ├── TASK-043-H  (widgets/dashboard-low-stock)  ─────────┤         └── TASK-043-J  (verify)
                        └── (TASK-043-D provides recharts)                       │
                                  └── TASK-043-G  (widgets/dashboard-charts) ────┘

TASK-043-D  (install recharts — independent; can run at any point before 043-G)
```

TASK-043-F, TASK-043-G, and TASK-043-H can be worked on in parallel after their
respective dependencies (TASK-043-E and TASK-043-D) complete.
TASK-043-B can be worked on in parallel with all frontend steps after TASK-043-A.

---

## Notes

- **Why a single `GET /summary` endpoint instead of separate endpoints per metric?**
  A single endpoint avoids multiple parallel waterfall fetches on page load, and the
  total data payload is small (primarily numeric values and short arrays). For MVP
  this is the simplest design. A future task can introduce granular endpoints
  (e.g., `GET /admin/dashboard/revenue?window=7d`) if filtering/granularity is
  needed.

- **Why `recharts` directly instead of shadcn/ui `Chart` primitives?**
  shadcn/ui's `<Chart>` component is a thin wrapper over `recharts` that was
  introduced later in the shadcn/ui ecosystem. The project uses radix-ui primitives
  copied directly (not the shadcn CLI). Installing and wiring the shadcn/ui Chart
  wrapper would require adding the `chart` component via the shadcn CLI or manually
  copying its source, which adds complexity for no functional benefit over using
  recharts directly. Using recharts directly is consistent with how the project uses
  radix-ui directly rather than via a higher-level shadcn CLI component.

- **`operationId` naming:** The controller uses
  `operationId: 'adminDashboardControllerGetSummary'` following the same camelCase
  `[controllerName]ControllerMethodName` convention used in `AdminOrderController`
  (`adminOrderControllerFindAll`) and `AdminCategoryController`. This ensures the
  Orval hook is named `useAdminDashboardControllerGetSummary`.

- **Low-stock threshold:** The default threshold of 5 is hard-coded in the
  repository method for MVP. A future task can make this configurable via
  `ConfigService` if the business needs it.

- **`DashboardSummaryResponse` vs `{ data: DashboardSummaryResponse }` envelope:**
  Single-object endpoints in this codebase use a `{ data: T }` envelope for detail
  views (e.g., `AdminOrderResponseEnvelope`). The dashboard summary is a read-only
  aggregate object with no resource identity (no ID, no `updatedAt` for the summary
  itself) — a bare flat response without the `{ data }` wrapper is cleaner and
  avoids adding a meaningless nesting level. This follows the `PaginationMeta` +
  `data[]` pattern used for list endpoints but inverted: the summary IS the data.

- **`getTopProducts` `orderItem.groupBy` behaviour:** Prisma `groupBy` on
  `OrderItem.productId` with `_sum: { price: true }` sums the line-item unit prices.
  Since `price` is the unit price (not `price * quantity`), this does not accurately
  reflect revenue when quantities > 1. The repository method should multiply by
  `quantity` in a `$queryRaw` or use `SUM(price * quantity)` directly. This is
  called out in the TASK-043-A acceptance criteria as a requirement to use
  `$queryRaw` for the top-products query rather than Prisma's `groupBy` API (which
  cannot express `SUM(price * quantity)` natively).
