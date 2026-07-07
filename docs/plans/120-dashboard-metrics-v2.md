# Plan 120 — Dashboard Metrics v2

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 1 (CRM-ядро + quick-win контент-мапа
>
> - мобільний доступ)
>   **Origin:** `docs/handoff-2026-07-07.md` Блок A · discovery plan 100 (`docs/plans/100-admin-crm-dashboard-checklist.md`) §2–3
>   **Created:** 2026-07-07
>   **Last Updated:** 2026-07-07
>   **BACKLOG task:** TASK-249
>   **Depends on:** TASK-248 (✅, merged — dashboard needs-action widget + `getSummary()` baseline
>   this plan extends)

## Overview

TASK-249 asks for four things on the admin dashboard: (1) unreceived "in-transit" revenue as a
second figure beside received revenue, (2) average order value (AOV) over the last 30 days,
(3) repeat-buyer % (all-time and last 90 days), and (4) a last-5-orders table. Revenue ground
truth stays `paymentStatus = PAID`; formulas must be unit-tested; every metric needs a plain-UA
tooltip; loading states need skeletons.

**Key finding — item (1) is already fully shipped.** TASK-137 (`docs/plans/083-revenue-audit-unrealized.md`)
landed before TASK-248 and is already live on `develop`:

- `DashboardRepository.getUnrealizedRevenue()` / `getUnrealizedRevenueSince()` (private methods,
  `apps/store-api/src/dashboard/dashboard.repository.ts` L173–188) sum `Order.total` where
  `paymentStatus != PAID AND status NOT IN (CANCELLED, REFUNDED)` — the exact "in-transit"
  predicate the handoff describes. The predicate itself is centralized in a private
  `unrealizedOrderWhere()` helper (L160–165) shared with TASK-248's `unpaidInTransit`
  needs-action counter, so both numbers can never drift apart.
- `RevenueMetricsDto.unrealizedRevenue` / `unrealizedRevenueLast30Days`
  (`apps/store-api/src/dashboard/dto/dashboard-summary.dto.ts` L39–52) are already part of the
  `GET /api/admin/dashboard/summary` response contract.
- `AdminDashboardStats.tsx` already renders both as amber (`tone="warning"`) `StatCard`s
  labeled "Очікувана виручка" / "Очікувана (30 днів)", right beside the green (`tone="success"`)
  earned-revenue pair.

This closes the in-transit-revenue portion of TASK-249 with **zero new backend/frontend code** —
it is a "confirm and cross-reference" item, not a build item (see Task 249-0 below, which only
updates a code comment so future readers see the explicit link between TASK-137/TASK-249 rather
than wondering why this plan doesn't touch unrealized revenue).

**Design decision — no narrower "shipped-but-unpaid" figure.** The handoff floats a possible
distinct, narrower metric (`paymentStatus != PAID AND status = SHIPPED`) as an alternative. This
plan rejects it: Nova Poshta cash-on-delivery orders can sit unpaid at CONFIRMED, PROCESSING, _or_
SHIPPED — the owner's actual question is "how much money am I still owed, across the whole active
pipeline", not "how much is specifically in a courier's van right now". Splitting the same
receivable pool into two dashboard numbers would fragment one signal for no operational benefit
and risks the owner double-counting or under-counting when reconciling with Nova Poshta's own
cash-collection reports. The existing all-active-unpaid figure is kept as the single source of
truth; TASK-137/plan 083 is absorbed as-is.

The genuinely new work in this plan: AOV (30d), repeat-buyer % (all-time + 90d) with their pure
formulas unit-tested, the last-5-orders table widget, and plain-UA tooltips on the new cards (plus
a light retrofit onto the two existing unrealized-revenue cards, since those are nominally "this
task's metric" per the BACKLOG cell wording — see Design Decisions below for the exact tooltip
scope).

## Scope

### In Scope

- `DashboardRepository`: new pure formula module (`dashboard.formulas.ts`) with
  `computeAverageOrderValue()` and `computeRepeatBuyerRate()`, unit-tested in isolation (no DB, no
  mocks — true unit tests per AGENTS.md TDD guidance).
- `DashboardRepository`: new private query methods (`getPaidOrderCountSince`,
  `getRepeatBuyerRate`) wired into `getSummary()`'s existing `Promise.all` (no N+1).
- `RevenueMetricsDto.averageOrderValueLast30Days` (new field) + new `CustomerMetricsDto`
  (`repeatBuyerRate`, `repeatBuyerRateLast90Days`) surfaced as `DashboardSummaryResponse.customers`.
- `dashboard.e2e-spec.ts` (contract-shape assertions) + `dashboard.repository.int-spec.ts`
  (real-Postgres formula assertions) extended to cover the three new fields.
- Orval regen in `store-admin` for the extended `DashboardSummaryResponse`.
- New shared `Tooltip` primitive (`shared/ui/tooltip.tsx`, built on the `radix-ui` package already
  a dependency — no new npm install) + `formatPercent` util (`shared/lib/format`).
- `AdminDashboardStats.tsx`: three new stat cards (AOV 30d, repeat-buyer all-time, repeat-buyer
  90d), each with a plain-UA tooltip; tooltip retrofit onto the two existing unrealized-revenue
  cards.
- New self-fetching widget `DashboardLastOrdersTable` (mirrors `DashboardTopProductsTable`'s
  shape) sourcing `useAdminOrderControllerFindAll({ limit: 5, sortBy: 'createdAt', sortOrder:
'desc' })` — no new endpoint — with rows linking to `/orders/[id]`; wired into
  `dashboard-view.tsx`.
- Confirming/documenting the in-transit-revenue absorption (code-comment only, no behavior change).

### Out of Scope

- Any new "shipped-but-unpaid" narrower revenue figure (see Design Decision above — rejected).
- `OrderStatusHistory` + processing-speed metric (TASK-251, separate plan).
- Customer card v1 on `/users/[id]` (TASK-252, separate plan).
- Coupons-in-30-days / top-wishlist dashboard widgets (plan 100 §5 "Пізніше", unscheduled).
- A 7/30/90-day period selector for the whole dashboard (plan 100 §5 "Пізніше", explicitly
  out-of-scope; the new repeat-buyer metric introduces its _own_ fixed 90-day window, which is not
  the same as a global selector).
- Retrofitting a tooltip onto the four pre-existing, non-revenue-family cards (totalRevenue,
  revenue30, totalOrders, totalUsers) — see Design Decisions below.
- Any change to `/orders` (TASK-250, separate plan, parallel-safe — no shared files with this plan).
- Any change to the admin mobile shell (TASK-257) or content-map (TASK-264) — different files.

## User Stories

1. As the store owner, I want to see my average order value over the last 30 days, so I know
   whether customers are buying more per visit and whether a free-shipping threshold is worth
   adjusting.
2. As the store owner, I want to see what share of my customers come back to order again — both
   over the store's whole history and just recently — so I can tell whether the business is
   building real repeat loyalty or if every sale is a one-off.
3. As the store owner, I want to see my 5 most recent orders directly on the dashboard with a
   link to each, so I don't have to open the full orders list every time I check in.

## Technical Design

### Data Model

No Prisma schema changes. Every new metric is a read aggregate over existing `Order` columns
(`userId`, `status`, `paymentStatus`, `total`, `createdAt`) already indexed
(`@@index([userId])`, `@@index([status])`, `@@index([createdAt(sort: Desc)])`).

### Design Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                | Rationale                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | In-transit revenue: absorb TASK-137 as-is, no narrower "shipped-only" figure                                                                                                                                                                                                                                                            | See Overview — a courier-stage split would fragment one receivable-pipeline number into two for no operational benefit                                                                                                                                      |
| 2   | Repeat-buyer rate is **windowed** for the 90-day figure — only orders with `createdAt` inside the last 90 days count toward both numerator and denominator, not "all-time repeat buyers who also ordered recently"                                                                                                                      | Matches plan 100 §2's literal formula (`GROUP BY Order.userId`, filtered by the same `createdAt` window the rest of the dashboard uses); gives an actionable "is repeat-buying trending up or down lately" signal, not one contaminated by very old history |
| 3   | Repeat-buyer rate excludes only `CANCELLED` orders (not `REFUNDED`, unlike the unrealized-revenue predicate which excludes both)                                                                                                                                                                                                        | Mirrors plan 100 §2 and the BACKLOG acceptance criterion verbatim ("repeat-rate excludes CANCELLED"); a `REFUNDED` order still represents a real completed transaction and relationship with that customer, unlike a `CANCELLED` order which never happened |
| 4   | Both rates are returned as a `0..1` fraction (e.g. `0.24`), not pre-multiplied by 100                                                                                                                                                                                                                                                   | Consistent with leaving presentation formatting to the frontend, same principle as money being returned as a plain `number` and formatted client-side                                                                                                       |
| 5   | Tooltip scope: the 3 brand-new cards (AOV, repeat-buyer ×2) get tooltips; the 2 existing unrealized-revenue cards get a tooltip retrofit (nominally "this task's metric" per the BACKLOG wording); the 4 other pre-existing cards (earned revenue ×2, total orders, total users) are left as-is with their existing `subText` one-liner | Keeps this plan's frontend surface bounded to the metrics TASK-249 is actually about; full tooltip coverage of every dashboard card is reasonable future tech debt, not blocking                                                                            |
| 6   | AOV divide-by-zero and empty-repeat-buyer-set guards return `0`, not `null`/`NaN`                                                                                                                                                                                                                                                       | Matches the existing `?? 0` convention already used throughout `dashboard.repository.ts` for empty aggregates                                                                                                                                               |

### API Contract changes

| Field                                                       | Location                   | Status                                     | Description                                                                   |
| ----------------------------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `revenue.unrealizedRevenue` / `unrealizedRevenueLast30Days` | `RevenueMetricsDto`        | **Already shipped (TASK-137)** — no change | In-transit revenue, absorbed as-is                                            |
| `revenue.averageOrderValueLast30Days`                       | `RevenueMetricsDto`        | **New field**                              | `revenueLast30Days ÷ COUNT(PAID orders in last 30d)`, `0` if the count is `0` |
| `customers` (new top-level slice)                           | `DashboardSummaryResponse` | **New field**                              | `CustomerMetricsDto { repeatBuyerRate, repeatBuyerRateLast90Days }`           |
| `customers.repeatBuyerRate`                                 | `CustomerMetricsDto`       | **New field**                              | All-time share (0..1) of customers with ≥2 non-CANCELLED orders               |
| `customers.repeatBuyerRateLast90Days`                       | `CustomerMetricsDto`       | **New field**                              | Same share, restricted to orders created in the last 90 days                  |

No new endpoint for the last-5-orders table — it reuses the existing
`GET /api/admin/orders?limit=5&sortBy=createdAt&sortOrder=desc` via
`useAdminOrderControllerFindAll`. This IS an API-changing plan for the summary endpoint (new DTO
fields) → **Orval regen required in `store-admin`** once the backend lands.

### Backend (NestJS — Clean Architecture)

#### `dashboard.formulas.ts` (new file — pure functions, no I/O)

```ts
export function computeAverageOrderValue(
  revenue: number,
  paidOrderCount: number,
): number {
  return paidOrderCount === 0 ? 0 : revenue / paidOrderCount;
}

export interface UserOrderCount {
  userId: string;
  count: number;
}

export function computeRepeatBuyerRate(
  userOrderCounts: UserOrderCount[],
): number {
  if (userOrderCounts.length === 0) return 0;
  const repeatBuyers = userOrderCounts.filter((u) => u.count >= 2).length;
  return repeatBuyers / userOrderCounts.length;
}
```

Kept separate from `DashboardRepository` deliberately: these are the two formulas the BACKLOG row
explicitly asks to unit-test, and extracting them as pure functions lets them be tested with plain
Jest — no Prisma mock, no DB — a genuine Red→Green→Refactor unit-test target (the existing
`dashboard.repository.int-spec.ts` / `dashboard.e2e-spec.ts` pair validates the _wiring_ against a
real DB / mocked HTTP layer respectively; neither is a fast, isolated unit test of the arithmetic
itself, which is the gap this file closes).

#### `DashboardRepository` — new private methods

- `getPaidOrderCountSince(since: Date): Promise<number>` — `prisma.order.count({ where: {
paymentStatus: PAID, createdAt: { gte: since } } })`.
- `getRepeatBuyerRate(since?: Date): Promise<number>` — `prisma.order.groupBy({ by: ['userId'],
where: { status: { not: CANCELLED }, ...(since ? { createdAt: { gte: since } } : {}) }, _count:
{ id: true } })`, then `computeRepeatBuyerRate(grouped.map((row) => ({ userId: row.userId, count:
row._count.id })))`.

`getSummary()`'s `Promise.all` gains three entries: `paidOrderCountLast30Days`, `repeatBuyerRate`
(no `since` — all-time), `repeatBuyerRateLast90Days` (`this.windowStart(REPEAT_BUYER_WINDOW_DAYS)`
— reuses the existing `windowStart()` helper, now called with `90` as well as `30`). The assembled
payload adds `revenue.averageOrderValueLast30Days: computeAverageOrderValue(revenueLast30Days,
paidOrderCountLast30Days)` and a new top-level `customers: { repeatBuyerRate,
repeatBuyerRateLast90Days }`.

New constant in `dashboard.types.ts`: `export const REPEAT_BUYER_WINDOW_DAYS = 90;`.

#### DTO / type changes

- `dashboard.types.ts`: `RevenueMetrics` gains `averageOrderValueLast30Days: number`; new
  `CustomerMetrics { repeatBuyerRate: number; repeatBuyerRateLast90Days: number }`;
  `DashboardSummary` gains `customers: CustomerMetrics`.
- `dto/dashboard-summary.dto.ts`: `RevenueMetricsDto` gains `averageOrderValueLast30Days` (with
  `@ApiProperty`); new `CustomerMetricsDto` class; `DashboardSummaryResponse` gains `customers:
CustomerMetricsDto`.
- `dashboard.controller.ts`: add `CustomerMetricsDto` to the `@ApiExtraModels(...)` list so Orval
  resolves it as a named model.
- `DashboardService` — no code change needed (already a thin pass-through; the repository's return
  shape stays structurally identical to `DashboardSummaryResponse`).

### Frontend (Next.js — FSD)

#### shared/ui

- New `tooltip.tsx` — `Tooltip`, `TooltipTrigger`, `TooltipContent` (+ `TooltipProvider` exported
  for symmetry), built on `radix-ui`'s `Tooltip` namespace exactly like `dialog.tsx` wraps
  `Dialog as DialogPrimitive` (`import { Tooltip as TooltipPrimitive } from "radix-ui"`). The
  `Tooltip` root wraps itself in a local `TooltipPrimitive.Provider` so call sites don't need a
  global provider mounted in `app/providers.tsx` — this task stays self-contained.
- Registered in `shared/ui/index.ts`.

#### shared/lib

- New `format/formatPercent.ts` — mirrors `formatCurrency.ts` exactly: `Intl.NumberFormat("uk-UA",
{ style: "percent", maximumFractionDigits: 1 })`. Input is a `0..1` fraction (e.g. `0.24` →
  `"24%"`). Exported from `format/index.ts` and the `shared/lib` barrel.

#### entities/dashboard

- Re-export the new generated `CustomerMetricsDto` type alongside the existing dashboard DTO
  type re-exports (Orval produces the model automatically once the backend DTO exists; this file
  just adds the one export line).

#### widgets

- `AdminDashboardStats.tsx`:
  - `StatCard` gains an optional `tooltip?: string` prop. When present, render a small
    inline info-affordance (`lucide-react`'s `Info` icon, already a project dependency) next to the
    label, wrapped in the new `Tooltip`/`TooltipTrigger`/`TooltipContent`, with an
    `aria-label={dict.dashboard.metricInfoAria(label)}` on the trigger button for a11y.
  - Card order (existing `grid-cols-2 lg:grid-cols-3` grid, 6 → 9 cards): totalRevenue, revenue30,
    unrealizedRevenue _(+ tooltip)_, unrealizedRevenue30 _(+ tooltip)_, **averageOrderValue30
    (new, + tooltip)**, totalOrders, totalUsers, **repeatBuyerRate (new, + tooltip)**,
    **repeatBuyerRateLast90Days (new, + tooltip)**. Revenue-family metrics stay grouped together;
    the two repeat-buyer cards sit next to totalUsers (both are customer-base signals).
  - New cards use `tone="default"` (neither is a directly "earned" or "owed" money signal).
- New widget folder `widgets/dashboard-last-orders/`:
  - `ui/DashboardLastOrdersTable.tsx` — self-fetching (own
    `useAdminOrderControllerFindAll({ limit: 5, sortBy: "createdAt", sortOrder: "desc" })` call,
    same "independent of the summary query" pattern as `NeedsActionWidget`). Columns: Order (id,
    truncated, mono — mirrors `AdminOrderTable`), Customer (email + name, same cell shape as
    `AdminOrderTable`), Status (badge via `orderStatusBadgeVariant`/`orderStatusLabel`), Total
    (`formatCurrency`), Date (mirrors `AdminOrderTable`'s existing `dateFormatter`), Actions
    ("Переглянути" button → `Link href={/orders/${order.id}}`, reusing `dict.common.view`).
    `isLoading` → `DashboardLastOrdersTableSkeleton`; `isError || !data` → inline alert paragraph;
    empty (`data.data.length === 0`) → `dict.dashboard.noLastOrders` row, mirroring
    `DashboardTopProductsTable`'s empty state.
  - `ui/DashboardLastOrdersTableSkeleton.tsx` — mirrors the shape of `DashboardSectionSkeleton`
    (or reuses it directly with a `rows={5}` prop — build agent's call, whichever keeps the diff
    smaller).
  - `index.ts` barrel; registered in `widgets/index.ts`.
- `dashboard-view.tsx`: insert `<DashboardLastOrdersTable />` after `<DashboardTopProductsTable
products={data.products.topProducts} />` and before `<DashboardLowStockTable ... />` (keeps the
  "sales activity" trio — top products, recent orders, low stock — in one visual block). Since the
  widget is self-fetching, it is **not** gated by the outer `isLoading` ternary (same placement
  logic as `<NeedsActionWidget />` above it) — it manages its own loading/error state.

#### app (pages)

- No new routes. `dashboard-view.tsx` is the only `app/` file touched (widget wiring, see above).

### dict additions (`apps/store-admin/src/shared/config/dictionary.ts`, `dashboard` section)

```
averageOrderValue30: "Середній чек (30 днів)"
averageOrderValue30Sub: "Виручка ÷ кількість оплачених замовлень"
averageOrderValue30Tooltip: "Скільки в середньому витрачає покупець за одне оплачене замовлення
  за останні 30 днів. Допомагає зрозуміти, чи варто піднімати поріг безкоштовної доставки."
repeatBuyerRate: "Повторні покупці (весь час)"
repeatBuyerRateSub: "Частка клієнтів із 2+ замовленнями"
repeatBuyerRateTooltip: "Частка клієнтів, які оформили 2 і більше замовлень (скасовані не
  рахуються) за весь час роботи магазину. Показує, чи повертаються покупці."
repeatBuyerRate90: "Повторні покупці (90 днів)"
repeatBuyerRate90Sub: "Серед замовлень за останні 90 днів"
repeatBuyerRate90Tooltip: "Те саме, але лише серед замовлень за останні 90 днів — показує свіжу
  динаміку повернення покупців, а не історію за весь час."
unrealizedRevenueTooltip: "Сума активних замовлень, які покупець ще не оплатив (наприклад,
  накладений платіж Нової Пошти, який ще не інкасовано)."
unrealizedRevenue30Tooltip: "Те саме, але лише замовлення за останні 30 днів."
metricInfoAria: (label: string) => `Що означає «${label}»`
lastOrders: "Останні замовлення"
noLastOrders: "Замовлень ще немає."
```

`lastOrders`' table columns reuse the existing `dict.orders.colOrder` / `colCustomer` /
`colStatus` / `colTotal` / `colCreated` and `dict.common.view` — no duplicate column-label keys.

## Tasks

### TASK-249-0: Document the in-transit-revenue absorption

**Type:** docs
**Scope:** store-api
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `dashboard.repository.ts`'s top-of-file doc comment (the block explaining
      `getUnrealizedRevenue`/`getUnrealizedRevenueSince`, TASK-137) gets one sentence noting that
      TASK-249 (dashboard metrics v2) absorbs this metric as-is with no further changes, and links
      to this plan for the "why no narrower shipped-only figure" rationale.
- [ ] No behavior change; no test changes required for this task alone.

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.repository.ts` — doc-comment addition only

---

### TASK-249-A: Pure AOV + repeat-buyer-rate formulas, unit-tested

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes — the BACKLOG row explicitly requires unit-tested formulas; these are pure,
isolated functions, an ideal Red→Green→Refactor target even though revenue-reporting math isn't
one of AGENTS.md's four named critical modules (cart/discounts/inventory/auth).
**Depends on:** —

**Acceptance Criteria:**

- [ ] New `dashboard.formulas.ts` exports `computeAverageOrderValue(revenue, paidOrderCount)` and
      `computeRepeatBuyerRate(userOrderCounts: UserOrderCount[])` exactly as specified in Technical
      Design (pure functions, no Prisma import, no I/O).
- [ ] `computeAverageOrderValue`: unit tests cover `0` paid orders → `0` (no `NaN`/`Infinity`), a
      normal division case, and a case where revenue is `0` but count is non-zero → `0`.
- [ ] `computeRepeatBuyerRate`: unit tests cover an empty array → `0`; a single-order buyer only
      (`count: 1`) → `0` (single-order buyers excluded); a mix (`[{count:2},{count:1}]`) → `0.5`;
      all-repeat (`[{count:2},{count:3}]`) → `1`.
- [ ] `npm run typecheck`/`lint` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- dashboard.formulas`.

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.formulas.ts` — new
- `apps/store-api/src/dashboard/dashboard.formulas.spec.ts` — new

---

### TASK-249-B: Wire AOV + repeat-buyer rate into `DashboardRepository`/DTO/controller

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (integration wiring around already-unit-tested formulas) — covered by the
existing e2e-spec (mocked) and int-spec (real Postgres) conventions for this module.
**Depends on:** TASK-249-A

**Acceptance Criteria:**

- [ ] `DashboardRepository` gains `getPaidOrderCountSince(since)` and `getRepeatBuyerRate(since?)`
      exactly as specified in Technical Design; both added to `getSummary()`'s `Promise.all` (still
      a single parallel batch, no new N+1).
- [ ] `getSummary()`'s returned object gains `revenue.averageOrderValueLast30Days` and a new
      `customers: { repeatBuyerRate, repeatBuyerRateLast90Days }` slice.
- [ ] `dashboard.types.ts`: `RevenueMetrics.averageOrderValueLast30Days`, new `CustomerMetrics`
      interface, `DashboardSummary.customers`, new `REPEAT_BUYER_WINDOW_DAYS = 90` constant.
- [ ] `dto/dashboard-summary.dto.ts`: `RevenueMetricsDto.averageOrderValueLast30Days` (with
      `@ApiProperty`); new `CustomerMetricsDto` class; `DashboardSummaryResponse.customers`.
- [ ] `dashboard.controller.ts`: `CustomerMetricsDto` added to `@ApiExtraModels(...)`.
- [ ] `dashboard.e2e-spec.ts`: `summaryFixture` gains `averageOrderValueLast30Days` and a
      `customers` object; the "full summary shape" test asserts
      `typeof body.revenue.averageOrderValueLast30Days === 'number'` and
      `typeof body.customers.repeatBuyerRate === 'number'` /
      `typeof body.customers.repeatBuyerRateLast90Days === 'number'`; the "empty store" test's
      zeroed fixture includes the new fields at `0`.
- [ ] `dashboard.repository.int-spec.ts`: new `describe` blocks against real Postgres — - `getSummary — average order value`: seeds ≥2 PAID orders inside the 30-day window with
      known totals, asserts `averageOrderValueLast30Days === expectedSum / expectedCount`; a
      `0`-paid-orders case asserts `0` (no divide-by-zero). - `getSummary — repeat buyer rate`: seeds a user with 2 non-CANCELLED orders (repeat), a
      user with 1 non-CANCELLED + 1 CANCELLED order (must NOT count as repeat — the CANCELLED
      one is excluded, leaving only 1 real order), and a user with exactly 1 order (not repeat);
      asserts `repeatBuyerRate` matches the expected fraction. A second case backdates one
      repeat-user's second order's `createdAt` to > 90 days ago (Prisma `create({ data: {
      createdAt: <explicit past Date> } })` — allowed since `createdAt` has no `@updatedAt`
      auto-touch) to assert `repeatBuyerRateLast90Days` excludes it while `repeatBuyerRate`
      (all-time) still counts it.
- [ ] `npm run typecheck`/`lint`/`build` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test:e2e -w apps/store-api`
      (dashboard specs), `npm run test:int -w apps/store-api` (dashboard int-spec, DB up +
      migrated).

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.repository.ts` — new methods, `getSummary()` wiring
- `apps/store-api/src/dashboard/dashboard.types.ts` — new interface fields + constant
- `apps/store-api/src/dashboard/dto/dashboard-summary.dto.ts` — new DTO fields/class
- `apps/store-api/src/dashboard/dashboard.controller.ts` — `@ApiExtraModels` addition
- `apps/store-api/test/dashboard.e2e-spec.ts` — fixture + assertions
- `apps/store-api/test/dashboard.repository.int-spec.ts` — new describe blocks

---

### TASK-249-C: Orval regen for the extended dashboard summary contract

**Type:** chore
**Scope:** store-admin
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-249-B

**Acceptance Criteria:**

- [ ] `npm run generate:api` (or the store-admin equivalent script) run against the updated
      OpenAPI spec; generated `DashboardSummaryResponse`/`RevenueMetricsDto` models gain
      `averageOrderValueLast30Days` and `customers` (new `CustomerMetricsDto` model generated).
- [ ] Generated files under `apps/store-admin/src/shared/api/generated/` are not hand-edited (per
      project convention — PreToolUse hook already blocks this).
- [ ] `apps/store-admin/src/entities/dashboard/index.ts` re-exports the new `CustomerMetricsDto`
      type.
- [ ] `npm run typecheck -w apps/store-admin` clean (confirms the generated types actually match
      what the frontend tasks below will consume).

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/**` — regenerated (Orval)
- `apps/store-admin/src/entities/dashboard/index.ts` — new type re-export

---

### TASK-249-D: Shared `Tooltip` primitive + `formatPercent` util

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** — (parallel-safe with A/B/C — pure shared/ui + shared/lib addition, no dependency
on the backend contract)

**Acceptance Criteria:**

- [ ] `shared/ui/tooltip.tsx` — `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`
      built on `radix-ui`'s `Tooltip` namespace exactly as specified in Technical Design (mirrors
      `dialog.tsx`'s `import { X as XPrimitive } from "radix-ui"` pattern); `Tooltip` wraps itself
      in a local `TooltipPrimitive.Provider` so no global provider needs mounting; styled per
      `docs/design-system.md` conventions (border/bg/shadow tokens, not raw hex).
- [ ] Exported from `shared/ui/index.ts`.
- [ ] `shared/lib/format/formatPercent.ts` — mirrors `formatCurrency.ts` exactly (`Intl.NumberFormat("uk-UA",
    { style: "percent", maximumFractionDigits: 1 })`); input is a `0..1` fraction. Exported from
      `format/index.ts`.
- [ ] Unit test for `formatPercent`: `0.24` → a string containing `"24"` and `"%"` (whitespace/NBSP-tolerant
      assertion, mirrors the `noSpace()` helper pattern in `AdminDashboardStats.test.tsx`); `0` →
      `"0%"`.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- formatPercent`.

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/tooltip.tsx` — new
- `apps/store-admin/src/shared/ui/index.ts` — export addition
- `apps/store-admin/src/shared/lib/format/formatPercent.ts` — new
- `apps/store-admin/src/shared/lib/format/formatPercent.test.ts` — new
- `apps/store-admin/src/shared/lib/format/index.ts` — export addition

---

### TASK-249-E: AOV + repeat-buyer stat cards with tooltips

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-249-C, TASK-249-D

**Acceptance Criteria:**

- [ ] `StatCard` (inside `AdminDashboardStats.tsx`) gains an optional `tooltip?: string` prop,
      rendering an `Info`-icon trigger (accessible via `aria-label={dict.dashboard.metricInfoAria(label)}`)
      next to the label when present, using the new `Tooltip`/`TooltipTrigger`/`TooltipContent`.
- [ ] Three new cards added in the order specified in Technical Design: `averageOrderValue30`
      (currency via `formatCurrency`), `repeatBuyerRate` and `repeatBuyerRate90` (both via the new
      `formatPercent`), each `tone="default"`, each with its `dict.dashboard.*Tooltip` copy.
- [ ] The two existing `unrealizedRevenue`/`unrealizedRevenue30` `StatCard` usages gain
      `tooltip={dict.dashboard.unrealizedRevenueTooltip}` / `unrealizedRevenue30Tooltip`
      respectively — no other change to those two cards (tone/value stay `warning`).
- [ ] `apps/store-admin/src/shared/config/dictionary.ts` — all new keys listed in Technical Design
      added under `dashboard`.
- [ ] `AdminDashboardStats.test.tsx`'s existing `summary` fixture updated to include
      `averageOrderValueLast30Days` and `customers` (required by the now-extended
      `DashboardSummaryResponse` type) — existing assertions stay green unmodified.
- [ ] New test case(s) in the same file (or a focused new file) assert the three new cards render
      their label + formatted value, and that hovering/focusing an info trigger surfaces its
      tooltip text (Radix Tooltip — test via `userEvent.hover`/`fireEvent.focus` + `findByText` on
      the tooltip content, following existing RTL conventions in this app).
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- AdminDashboardStats`.

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx` — new cards + tooltip
  prop
- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.test.tsx` — fixture update +
  new assertions
- `apps/store-admin/src/shared/config/dictionary.ts` — new `dashboard` keys

---

### TASK-249-F: Last-5-orders dashboard widget

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-249-C (Orval regen not strictly required for this widget since it reuses the
existing order-list contract, but sequenced after C for a clean single frontend integration pass)

**Acceptance Criteria:**

- [ ] New `widgets/dashboard-last-orders/ui/DashboardLastOrdersTable.tsx` — self-fetching via
      `useAdminOrderControllerFindAll({ limit: 5, sortBy: "createdAt", sortOrder: "desc" })`;
      columns and states exactly as specified in Technical Design (Order/Customer/Status/Total/Date/Actions;
      loading → skeleton; error → alert; empty → `dict.dashboard.noLastOrders`).
- [ ] Each row's "Переглянути" action links to `/orders/${order.id}` (`Link` from `next/link`).
- [ ] `ui/DashboardLastOrdersTableSkeleton.tsx` — new skeleton (or a direct reuse of
      `DashboardSectionSkeleton` with an appropriate `rows`/`className` — build agent's call,
      whichever keeps the diff smaller and visually matches the loaded table's height).
- [ ] `index.ts` barrel; registered in `widgets/index.ts` (mirrors the existing
      `dashboard-top-products` entry).
- [ ] `dashboard-view.tsx`: `<DashboardLastOrdersTable />` inserted after
      `<DashboardTopProductsTable ... />` and before `<DashboardLowStockTable ... />`, rendered
      unconditionally (not gated by the outer summary `isLoading`), same placement pattern as
      `<NeedsActionWidget />`.
- [ ] New `DashboardLastOrdersTable.test.tsx` (MSW-mocked, following the
      `NeedsActionWidget.test.tsx` / `renderWithProviders` + `server.use(http.get(...))` pattern):
      asserts the 5 rows render with correct status badges and a working "Переглянути" link
      `href`; asserts the empty-state copy when the mocked response has zero orders.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- DashboardLastOrdersTable`, full
      `npm run test -w apps/store-admin` green (per the store-client Jest parallel-flake note,
      run `--runInBand` if the full suite times out under parallel load).

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-last-orders/ui/DashboardLastOrdersTable.tsx` — new
- `apps/store-admin/src/widgets/dashboard-last-orders/ui/DashboardLastOrdersTableSkeleton.tsx` —
  new
- `apps/store-admin/src/widgets/dashboard-last-orders/ui/DashboardLastOrdersTable.test.tsx` — new
- `apps/store-admin/src/widgets/dashboard-last-orders/index.ts` — new
- `apps/store-admin/src/widgets/index.ts` — barrel registration
- `apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` — widget wiring

## Migration Steps

1. TASK-249-0 (doc comment, no code) — can run any time, first for cleanliness.
2. TASK-249-A (pure formulas + unit tests) — Red→Green→Refactor, no dependencies.
3. TASK-249-B (repository/DTO/controller wiring + e2e/int-spec coverage) — depends on A.
4. TASK-249-C (Orval regen in store-admin) — depends on B.
5. TASK-249-D (Tooltip primitive + formatPercent) — parallel-safe with A/B/C, no backend
   dependency; can start immediately.
6. TASK-249-E (stat cards) — depends on C (typed fields) and D (Tooltip/formatPercent).
7. TASK-249-F (last-5-orders widget) — depends on C (clean single frontend pass); functionally
   only needs the pre-existing order-list contract, so could start in parallel with E if desired.

## Dependencies & Sequencing

- **Hard dependency:** TASK-248 (✅, merged) — this plan extends the same `getSummary()` /
  `AdminDashboardStats.tsx` / `dashboard-view.tsx` files TASK-248 last touched.
- **No conflict with TASK-250** (order lifecycle tabs, ✅ merged separately) — TASK-250 only
  touches `admin-order-table.tsx` / the `/orders` page; this plan's last-5-orders widget is a new,
  separate file that merely calls the same already-CSV-capable `status` param contract, unchanged.
- **No conflict with TASK-257** (admin mobile shell, concurrent Wave 1 item) — TASK-257 only
  touches `AdminSidebar`/`AdminHeader`/the shell layout; this plan touches dashboard widgets and
  `dashboard-view.tsx` content only, not the shell chrome.
- **No conflict with TASK-264** (content-map) — entirely separate new page/widget.
- Feeds forward into TASK-251 (`OrderStatusHistory` + processing-speed stat) and TASK-252
  (customer card v1) — both listed as "решта A" later in Wave 1/4, but neither depends on this
  plan's specific fields; they read different tables (`OrderStatusHistory`, per-user
  order/review/coupon joins).

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Divide-by-zero on AOV (no PAID orders in the last 30 days) or an empty repeat-buyer set (brand-new store, zero orders)                                                                                                                       | Both pure formulas explicitly guard the zero-denominator case and return `0`; unit-tested directly (TASK-249-A)                                                                                                                                                                                   |
| The windowed repeat-buyer definition (Decision 2) could be misread by the owner as "all customers who have ever repeat-bought, filtered to recent activity"                                                                                  | Plain-UA tooltip copy makes the exact definition explicit ("серед замовлень за останні 90 днів"); the Design Decision is documented here for any future engineer revisiting the formula                                                                                                           |
| Adding `customers` as a new top-level `DashboardSummaryResponse` key is additive but still requires an Orval regen before the frontend can compile against the new fields                                                                    | Explicit task ordering (A → B → C → D/E/F) with C's acceptance criteria gating on a clean `typecheck`                                                                                                                                                                                             |
| Retrofitting a `tooltip` prop onto the existing `unrealizedRevenue`/`unrealizedRevenue30` `StatCard` usages regresses the pre-existing `AdminDashboardStats.test.tsx` assertions (TASK-137)                                                  | TASK-249-E's acceptance criteria explicitly require the existing assertions to stay green unmodified; the new `tooltip` prop is additive (optional, opt-in) and does not change existing DOM structure that the current test queries                                                              |
| `DashboardLastOrdersTable`'s independent `useAdminOrderControllerFindAll({ limit: 5, ... })` call is a second network request beyond the summary fetch, on top of the existing `AdminOrderTable`'s own fetch when `/orders` is later visited | Acceptable and explicitly directed by the BACKLOG row ("переюзати `GET /admin/orders?limit=5`", no new endpoint); the payload is tiny (5 rows) and TanStack Query caches by params, so this is not a performance concern — same pattern already proven by `NeedsActionWidget`'s independent fetch |
| Radix Tooltip's hover/focus interaction timing can be flaky in RTL/jsdom tests                                                                                                                                                               | Follow the project's established async-query patterns (`findByText`, `await` on `userEvent`) rather than synchronous assertions immediately after a hover/focus event                                                                                                                             |

## Notes

- This plan deliberately does **not** touch `dashboard.module.ts` — no new providers are needed;
  `DashboardService`/`DashboardController` are extended in place.
- The `DashboardLastOrdersTable` widget intentionally mirrors `AdminOrderTable`'s cell shapes
  (truncated mono order id, customer email/name stack, status badge) rather than
  `DashboardTopProductsTable`'s leaner 3-column shape, since orders carry richer per-row identity
  than a bare product-revenue ranking.
- Per plan 100 §6 sequencing ("Зараз, без нового бекенду даних: AOV, repeat-rate, «Останні
  замовлення»... усе на існуючих полях"), this plan confirms none of the new work requires a
  Prisma migration — the discovery plan's own recommendation from 2026-07-05 holds.
- A possible follow-up (not scheduled): retrofit tooltips onto the four remaining pre-existing
  stat cards (`totalRevenue`, `revenue30`, `totalOrders`, `totalUsers`) for full dashboard tooltip
  coverage — deliberately left out of this plan's scope (Design Decision 5).
