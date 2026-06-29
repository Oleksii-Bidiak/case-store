# Plan 083 — Revenue audit: "unrealized" pending-payment metric (TASK-137)

**Phase:** Phase 4 follow-up — Admin Dashboard
**Roadmap context:** Tier 3 — Admin polish / financial visibility
**Branch:** `feat/137-revenue-audit` (Wave 1, self-contained dashboard module)
**Created:** 2026-06-29
**Status:** Planned

> **Pre-requisite:** TASK-152 (plan 074) is complete — the three revenue aggregates
> (`getTotalRevenue`, `getRevenueSince`, `getRevenueByDay`) and `getTopProducts` already
> filter `paymentStatus = 'PAID'` (earned revenue ground truth). This plan builds directly
> on top of that baseline without touching it.

---

## Problem Statement

The admin dashboard shows a single revenue figure that represents money the store has
actually received (PAID orders, fixed in TASK-152). There is no way to see how much
money is _expected but not yet received_ — orders that are accepted and active but where
the customer has not yet paid (e.g. cash-on-delivery awaiting collection, or a payment
that failed and needs a retry).

The owner needs two distinct numbers side by side:

- **Earned revenue** — what has been collected (`paymentStatus = PAID`). Already shown.
- **Unrealized revenue** — what is ordered but not yet paid. Currently invisible.

Without the second figure, an admin approving COD orders cannot see their pipeline value
and cannot distinguish between a slow day (few orders) and a healthy-pipeline day (many
orders waiting for collection).

---

## Background

### What TASK-152 already delivers

| Method                        | Condition                                       | Status          |
| ----------------------------- | ----------------------------------------------- | --------------- |
| `getTotalRevenue()`           | `paymentStatus = PAID`                          | Done (TASK-152) |
| `getRevenueSince(since)`      | `paymentStatus = PAID` AND `createdAt >= since` | Done (TASK-152) |
| `getRevenueByDay(windowDays)` | raw SQL `payment_status = 'PAID'`               | Done (TASK-152) |
| `getTopProducts(limit)`       | `INNER JOIN ... payment_status = 'PAID'`        | Done (TASK-152) |

The dashboard types (`RevenueMetrics`) and DTO (`RevenueMetricsDto`) currently expose only
`totalRevenue`, `revenueLast30Days`, and `revenueByDay`. No unrealized fields exist yet.

### What TASK-137 adds

Two new scalar metrics appended to the existing `revenue` sub-object — no new endpoints,
no new DTO classes, no new query parameters. The payload shape grows by two number fields.

---

## "Unrealized revenue" definition

An order is **unrealized** if:

1. `paymentStatus NOT IN ('PAID')` — the admin has **not** marked it paid
   (`PENDING` = awaiting payment / COD; `FAILED` = payment attempt bounced)
2. `status NOT IN ('CANCELLED', 'REFUNDED')` — the order is **still active**
   (cancelled and refunded orders represent lost/reversed demand, not a pipeline)

Combined (Prisma where-clause):

```typescript
{
  paymentStatus: { not: PaymentStatus.PAID },
  status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
}
```

This excludes:

- `PaymentStatus.PAID` — already counted as earned revenue
- `OrderStatus.CANCELLED` — the customer or admin cancelled; money was never expected
- `OrderStatus.REFUNDED` — payment was returned; no longer a valid receivable

Note: `PaymentStatus.REFUNDED` + active order status is logically contradictory (if
payment was refunded the order should be REFUNDED too), but filtering on both axes means
this edge case is safely excluded.

---

## Migration impact

None. `payment_status` and `status` columns already exist. All changes are query logic,
type interfaces, and DTO decorators only.

---

## Enum reference (from `prisma/schema.prisma`)

```
enum OrderStatus   { PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED }
enum PaymentStatus { PENDING PAID FAILED REFUNDED }
```

"Unrealized" order: `paymentStatus IN (PENDING, FAILED)` AND `status IN (PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED)`.

---

## Existing test seed (dashboard.repository.int-spec.ts)

The TASK-152 int-spec already seeds exactly the orders needed. No changes to `beforeAll`
are required:

| Order                         | `status`  | `paymentStatus` | `total` | Expected in            |
| ----------------------------- | --------- | --------------- | ------- | ---------------------- |
| PAID order (qty 3 × $10)      | DELIVERED | PAID            | $30     | Earned revenue         |
| Unpaid order (qty 2 × $20)    | CONFIRMED | PENDING         | $40     | **Unrealized revenue** |
| Cancelled order (qty 5 × $20) | CANCELLED | PENDING         | $100    | Neither                |

The CONFIRMED+PENDING $40 order is exactly what the new unrealized methods must capture.

---

## File-by-file impact summary

### Backend (`apps/store-api`)

| File                                         | Change                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/dashboard/dashboard.types.ts`           | Add `unrealizedRevenue` + `unrealizedRevenueLast30Days` to `RevenueMetrics` interface                                                           |
| `src/dashboard/dashboard.repository.ts`      | Add `getUnrealizedRevenue()` + `getUnrealizedRevenueSince(since)` private methods; wire into `getSummary()` `Promise.all`; import `OrderStatus` |
| `src/dashboard/dto/dashboard-summary.dto.ts` | Add two `@ApiProperty` fields to `RevenueMetricsDto`; update stale `description` strings on existing fields                                     |
| `src/dashboard/dashboard.service.ts`         | No change — thin pass-through                                                                                                                   |
| `src/dashboard/dashboard.controller.ts`      | No change — returns `DashboardSummaryResponse` already                                                                                          |
| `test/dashboard.repository.int-spec.ts`      | Extend: assert `unrealizedRevenue` and `unrealizedRevenueLast30Days` on the existing seed (TASK-137-A Red, then Green)                          |
| `test/dashboard.e2e-spec.ts`                 | Extend `summaryFixture.revenue` with the two new fields; add assertions on the 200-response shape                                               |

### API contract

| Step                | Command                                    |
| ------------------- | ------------------------------------------ |
| Export OpenAPI spec | `npm run swagger:export -w apps/store-api` |
| Regenerate hooks    | `npm run generate:api -w apps/store-admin` |

### Frontend (`apps/store-admin`)

| File                                                          | Change                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx`      | Add two `StatCard` entries for unrealized metrics; adjust grid layout to 6 cards                                      |
| `src/shared/config/dictionary.ts`                             | Add `unrealizedRevenue`, `unrealizedRevenueLast30Days`, `unrealizedNote` keys; update stale `revenueLifetime` subtext |
| `src/widgets/dashboard-stats/ui/AdminDashboardStats.test.tsx` | New RTL test file asserting the two new stat cards render with formatted UAH amounts                                  |

---

## Tasks

### TASK-137-A: TDD Red — extend int-spec to assert unrealized revenue fields

**Type:** test
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes (this IS the Red step)
**Depends on:** nothing — the int-spec already compiles and the seed already has the
right orders

**Acceptance Criteria:**

- [ ] A new `describe` block `'getSummary — unrealized revenue'` added to
      `dashboard.repository.int-spec.ts`
- [ ] Test: `summary.revenue.unrealizedRevenue` equals 40 (the CONFIRMED+PENDING order
      total only; cancelled order excluded)
- [ ] Test: `summary.revenue.unrealizedRevenueLast30Days` equals 40 (the seed order was
      created today — it falls in the 30-day window)
- [ ] Test: `summary.revenue.totalRevenue` is unchanged at 30 (earned revenue not
      polluted by unrealized)
- [ ] Running the int-spec produces a **TypeScript compile error** (Red) because
      `summary.revenue.unrealizedRevenue` does not yet exist on `RevenueMetrics` —
      confirming the gap before any implementation
- [ ] No changes to `beforeAll`/`afterAll` (seed is sufficient)
- [ ] Tests pass: `npm run test:int -w apps/store-api` (expected: Red — compile/type
      error on the new fields)

**Files to create/modify:**

- `apps/store-api/test/dashboard.repository.int-spec.ts` — add `describe` block for
  unrealized revenue; no seed changes

---

### TASK-137-B: TDD Green — types, repository methods, DTO extension

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes (this IS the Green step)
**Depends on:** TASK-137-A

**Acceptance Criteria:**

- [ ] `RevenueMetrics` interface extended with:
  ```typescript
  unrealizedRevenue: number;
  unrealizedRevenueLast30Days: number;
  ```
- [ ] `DashboardRepository` has two new private methods:
  - `getUnrealizedRevenue(): Promise<number>` — `prisma.order.aggregate` with
    `_sum: { total: true }` where `paymentStatus: { not: PaymentStatus.PAID }` AND
    `status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] }`
  - `getUnrealizedRevenueSince(since: Date): Promise<number>` — same filter plus
    `createdAt: { gte: since }`
- [ ] Both methods are added to the `getSummary()` `Promise.all` array; the assembled
      `revenue` object includes `unrealizedRevenue` and `unrealizedRevenueLast30Days`
- [ ] `OrderStatus` imported from `@prisma/client` (already `PaymentStatus` is imported)
- [ ] `RevenueMetricsDto` extended with:

  ```typescript
  @ApiProperty({ type: Number, description: 'Unrealized revenue: sum of Order.total where paymentStatus != PAID and status not in (CANCELLED, REFUNDED)', example: 12400.0 })
  unrealizedRevenue!: number;

  @ApiProperty({ type: Number, description: 'Unrealized revenue in the last 30 days', example: 3800.0 })
  unrealizedRevenueLast30Days!: number;
  ```

- [ ] Existing `@ApiProperty` `description` on `totalRevenue` updated from
      `'Lifetime revenue (excl. cancelled/refunded)'` to
      `'Lifetime earned revenue (paymentStatus = PAID orders only)'`
- [ ] All TASK-137-A int-spec assertions pass Green:
      `unrealizedRevenue = 40`, `unrealizedRevenueLast30Days = 40`,
      `totalRevenue = 30` (unchanged)
- [ ] All existing unit tests unaffected: `npm run test -w apps/store-api`
- [ ] TypeScript compiles cleanly: `npm run typecheck -w apps/store-api`
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.types.ts` — extend `RevenueMetrics`
- `apps/store-api/src/dashboard/dashboard.repository.ts` — two new private methods +
  `Promise.all` wiring + `OrderStatus` import
- `apps/store-api/src/dashboard/dto/dashboard-summary.dto.ts` — two new `@ApiProperty`
  fields on `RevenueMetricsDto`; update stale description on `totalRevenue`

---

### TASK-137-C: TDD Refactor — e2e fixture, JSDoc, dict subtext

**Type:** refactor
**Scope:** store-api + store-admin
**Complexity:** S (1-2h)
**TDD Required:** No (cleanup only)
**Depends on:** TASK-137-B

**Acceptance Criteria:**

- [ ] `dashboard.e2e-spec.ts` `summaryFixture.revenue` extended with:
  ```typescript
  unrealizedRevenue: 12400.0,
  unrealizedRevenueLast30Days: 3800.0,
  ```
  (realistic non-zero fixture values so the assertion exercises the fields)
- [ ] The 200-response assertion block adds:
  ```typescript
  expect(typeof body.revenue.unrealizedRevenue).toBe("number");
  expect(typeof body.revenue.unrealizedRevenueLast30Days).toBe("number");
  ```
- [ ] Empty-store mock updated to include
      `unrealizedRevenue: 0, unrealizedRevenueLast30Days: 0`
- [ ] Repository JSDoc comment block updated to describe both earned and unrealized
      methods and cite this task
- [ ] `dictionary.ts` `dashboard.revenueLifetime` subtext updated from
      `"За весь час (без скасованих / повернених)"` (old order-status wording) to
      `"За весь час (лише оплачені замовлення)"` (accurate post-TASK-152)
- [ ] `npm run test:e2e -w apps/store-api` green — no TypeScript errors in fixture
- [ ] `npm run test -w apps/store-api` green (all 436+ unit tests)

**Files to create/modify:**

- `apps/store-api/test/dashboard.e2e-spec.ts` — extend fixture + 200-response assertions
- `apps/store-api/src/dashboard/dashboard.repository.ts` — JSDoc only (no logic change)
- `apps/store-admin/src/shared/config/dictionary.ts` — update `revenueLifetime` subtext

---

### TASK-137-D: API contract — Orval regen

**Type:** chore
**Scope:** store-api + store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-137-B (DTO must exist before export)

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` succeeds and updates the OpenAPI JSON
      (the spec file includes `unrealizedRevenue` and `unrealizedRevenueLast30Days` under
      `RevenueMetricsDto`)
- [ ] `npm run generate:api -w apps/store-admin` regenerates the Orval hooks and models
      in `apps/store-admin/src/shared/api/generated/`
- [ ] Generated `RevenueMetricsDto` type in the admin client includes both new fields
- [ ] Pre-commit hook does not fire on generated files (they are gitignored); the export
      command and generation command are run manually before committing
- [ ] `npm run typecheck -w apps/store-admin` passes after regen (the frontend code that
      reads `data.revenue.unrealizedRevenue` typed correctly)
- [ ] `npm run build -w apps/store-admin` green (no module-not-found, no unused-import)

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (gitignored, not committed)

---

### TASK-137-E: Frontend — unrealized stat cards in AdminDashboardStats

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-137-C (dict keys), TASK-137-D (Orval types)

**Acceptance Criteria:**

- [ ] `AdminDashboardStats` renders two additional `StatCard` entries:
  - Label: `dict.dashboard.unrealizedRevenue` — "Очікувана виручка"
  - Value: `formatCurrency(summary.revenue.unrealizedRevenue)`
  - SubText: `dict.dashboard.unrealizedRevenueNote` — "Замовлено, але не оплачено"
  - Label: `dict.dashboard.unrealizedRevenue30` — "Очікувана виручка (30 днів)"
  - Value: `formatCurrency(summary.revenue.unrealizedRevenueLast30Days)`
  - SubText: `dict.dashboard.last30` (reuse existing key)
- [ ] Grid layout adjusted to accommodate 6 cards:
      `grid-cols-2 lg:grid-cols-3` (two rows of three on large screens;
      two columns everywhere else — identical to the current small-screen behaviour)
- [ ] New dict keys added to `dashboard` section of `dictionary.ts`:
  - `unrealizedRevenue: "Очікувана виручка"`
  - `unrealizedRevenue30: "Очікувана виручка (30 днів)"`
  - `unrealizedRevenueNote: "Замовлено, але не оплачено"`
- [ ] `AdminDashboardStats.test.tsx` created under
      `apps/store-admin/src/widgets/dashboard-stats/ui/`:
  - Renders a fixture `DashboardSummaryResponse` that includes
    `unrealizedRevenue: 12400` and `unrealizedRevenueLast30Days: 3800`
  - Asserts label `"Очікувана виручка"` is visible
  - Asserts value is formatted as UAH (not raw number `12400`)
  - Asserts label `"Очікувана виручка (30 днів)"` is visible
  - Asserts the `"Лише оплачені замовлення"` (or updated revenueLifetime text) subtext
    appears for the earned revenue card
- [ ] All store-admin tests pass: `npm run test -w apps/store-admin`
- [ ] TypeScript, lint, build clean:
      `npm run typecheck && npm run lint && npm run build -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx` — add two
  `StatCard` entries; adjust grid class
- `apps/store-admin/src/shared/config/dictionary.ts` — three new `dashboard.*` keys
- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.test.tsx` — new
  RTL test file

---

## Execution order

```
TASK-137-A  (Red)   →  TASK-137-B  (Green)  →  TASK-137-C  (Refactor)  — sequential
                                               ↓
                                          TASK-137-D  (Orval regen)
                                               ↓
                                          TASK-137-E  (Frontend)
```

All five sub-tasks are in a strict dependency chain. The backend TDD track (A→B→C) must
complete before Orval regen (D) and the frontend (E).

---

## Agents and skills

| Sub-task   | Agent       | Skill                                |
| ---------- | ----------- | ------------------------------------ |
| TASK-137-A | `tdd-agent` | `tdd` (Red step)                     |
| TASK-137-B | `tdd-agent` | `tdd` (Green step) + `nestjs-module` |
| TASK-137-C | `tdd-agent` | `tdd` (Refactor step)                |
| TASK-137-D | `build`     | `api-contract`                       |
| TASK-137-E | `build`     | `fsd-component`                      |

---

## Verification gates

| Gate               | Command                                 | When             |
| ------------------ | --------------------------------------- | ---------------- |
| Backend unit tests | `npm run test -w apps/store-api`        | After TASK-137-B |
| Backend e2e tests  | `npm run test:e2e -w apps/store-api`    | After TASK-137-C |
| Backend typecheck  | `npm run typecheck -w apps/store-api`   | After TASK-137-B |
| Backend lint       | `npm run lint -w apps/store-api`        | After TASK-137-C |
| Admin typecheck    | `npm run typecheck -w apps/store-admin` | After TASK-137-D |
| Admin tests        | `npm run test -w apps/store-admin`      | After TASK-137-E |
| Admin build        | `npm run build -w apps/store-admin`     | After TASK-137-E |

---

## Pending manual QA (post-ship)

> Add to the `Pending manual QA` table in `BACKLOG.md` after this task ships:

Dashboard revenue audit (TASK-137): on a running stack with COD orders in CONFIRMED+PENDING
state, the "Очікувана виручка" card shows the sum of their `total` fields; the "Загальна
виручка" (earned) card is unchanged from before. Verify: a PAID order increments only earned
revenue; a newly-created (PENDING/PENDING) order increments only unrealized revenue; a
CANCELLED order increments neither. Also run `npm run test:int -w apps/store-api` against
the `store_test` DB to confirm the new unrealized int-spec assertions pass end-to-end
(pending a running DB, same constraint as the TASK-152 row above).

---

## Completion checklist

- [ ] TASK-137-A: int-spec Red confirmed (TypeScript compile error on new fields)
- [ ] TASK-137-B: repository methods + types + DTO added; int-spec Green
- [ ] TASK-137-C: e2e fixture extended; JSDoc updated; dict subtext corrected
- [ ] TASK-137-D: Orval regen complete; admin typecheck green
- [ ] TASK-137-E: two unrealized stat cards rendered; RTL test green; build clean
- [ ] `BACKLOG.md` TASK-137 row updated → ✅ with plan link
- [ ] "Dashboard revenue audit" added to _Pending manual QA_ table
