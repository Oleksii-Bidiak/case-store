# Plan: UAH Currency Localization — Admin Panel & Storefront Audit

> **Status:** Done
> **Phase:** Phase 5 — Polish & Production (Tier-1 UA Localization)
> **Created:** 2026-06-26
> **Last Updated:** 2026-06-26
> **BACKLOG task:** TASK-148

---

## Overview

Several admin panel widgets still format monetary amounts using
`Intl.NumberFormat("en-US", { currency: "USD" })`, producing `$1,299.00` instead
of the expected `1 299 ₴`. This plan replaces every `en-US`/`USD` formatter in
the admin panel with a single shared `formatCurrency` utility that uses
`Intl.NumberFormat("uk-UA", { currency: "UAH" })`, producing the correct
Ukrainian format (`1 299 ₴`, space thousands separator, comma decimal).

Additionally, `RevenueTrendChart` uses ad-hoc `₴${value.toFixed(0)}` string
interpolation that produces no thousands separators (`₴47500` instead of
`47 500 ₴`). This is also replaced.

**Storefront note:** The `store-client` storefront was already fully fixed by
TASK-069 (plan 040). All storefront price-displaying components
(`order-history-view`, `order-item-list`, `order-totals-breakdown`, product
cards, cart, checkout, PDP) import `formatMoney` from `@/shared/lib`. No
storefront code changes are needed — TASK-148 is admin-only.

---

## Scope

### In Scope

- Create a shared `formatCurrency(value: string | number): string` utility in
  `apps/store-admin/src/shared/lib/format/` (mirrors the storefront's
  `formatMoney` pattern).
- Replace `en-US`/`USD` inline formatters in:
  - `widgets/order-list/ui/admin-order-table.tsx` — order total column
  - `widgets/product-list/ui/admin-product-table.tsx` — product price column
  - `widgets/order-detail/ui/order-detail-view.tsx` — all 7 money call sites
- Fix `widgets/dashboard-charts/ui/RevenueTrendChart.tsx` — Y-axis tick and
  tooltip formatter (currently raw `toFixed`, no thousands separator).
- Consolidate `widgets/dashboard-stats/ui/AdminDashboardStats.tsx` inline
  formatter (already `uk-UA`/`UAH`; migrate to shared utility for consistency).
- Verify storefront coverage: confirm `order-history-view.tsx`,
  `order-item-list.tsx`, and `order-totals-breakdown.tsx` already use
  `formatMoney`.

### Out of Scope

- **Storefront `store-client`**: all price displays already use `formatMoney`
  from `@/shared/lib` — completed by TASK-069. No changes needed.
- Backend / Prisma / schema / migration changes — none required.
- Orval regeneration — the API contract is unchanged.
- String / label translations — covered by TASK-115 and TASK-129.
- Date locale fixes in `admin-order-table.tsx` and `order-detail-view.tsx`
  (both use `Intl.DateTimeFormat("en-US", ...)`). Date localization is a
  separate concern, scoped to TASK-115.

---

## User Stories

1. As an admin reviewing the order list, I want order totals shown as
   `1 299 ₴` instead of `$1,299.00`, so currency matches the Ukrainian store.
2. As an admin reviewing an order detail, I want all line-item and summary
   amounts (unit price, line total, subtotal, discount, shipping, tax, total)
   displayed in UAH format, so I can reconcile orders without confusion.
3. As an admin viewing the product table, I want product prices displayed in
   UAH format matching the storefront.
4. As an admin viewing the dashboard revenue chart, I want Y-axis ticks and
   tooltip amounts to show proper UAH formatting with thousands separators
   (`47 500 ₴` not `₴47500`).

---

## Current-State Findings

### Admin `en-US`/`USD` call-site inventory

| File                                                 | Formatter variable                                                               | Call sites                                                                                                                                                                                                                    | Fix                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `widgets/order-list/ui/admin-order-table.tsx`        | `moneyFormatter = Intl.NumberFormat("en-US", USD)`                               | `moneyFormatter.format(Number(order.total))` line 192                                                                                                                                                                         | Replace with `formatCurrency(order.total)`               |
| `widgets/product-list/ui/admin-product-table.tsx`    | `priceFormatter = Intl.NumberFormat("en-US", USD)`                               | `priceFormatter.format(Number(product.price))` line 136                                                                                                                                                                       | Replace with `formatCurrency(product.price)`             |
| `widgets/order-detail/ui/order-detail-view.tsx`      | `moneyFormatter = Intl.NumberFormat("en-US", USD)` + local `formatMoney` wrapper | `formatMoney(item.price)`, `formatMoney(item.lineTotal)` × 2, `formatMoney(order.subtotal)`, `formatMoney(order.discount)`, `formatMoney(order.shippingCost)`, `formatMoney(order.tax)`, `formatMoney(order.total)` — 7 total | Remove local pair; import `formatCurrency` from shared   |
| `widgets/dashboard-stats/ui/AdminDashboardStats.tsx` | `currencyFormatter = Intl.NumberFormat("uk-UA", UAH)` inline                     | `currencyFormatter.format(summary.revenue.totalRevenue)`, `currencyFormatter.format(summary.revenue.revenueLast30Days)`                                                                                                       | Already `uk-UA`/`UAH`; migrate to shared for consistency |
| `widgets/dashboard-charts/ui/RevenueTrendChart.tsx`  | None — raw string interpolation                                                  | `\`₴${value.toFixed(0)}\`` in YAxis `tickFormatter`, `\`₴${Number(value).toFixed(2)}\``in Tooltip`formatter`                                                                                                                  | Replace with `formatCurrency(...)`                       |

### Storefront audit results (read-only)

All three previously unformatted storefront pages are already fixed by TASK-069:

| File                                                       | Import present                               | Status          |
| ---------------------------------------------------------- | -------------------------------------------- | --------------- |
| `widgets/order-history/ui/order-history-view.tsx`          | `import { formatMoney } from "@/shared/lib"` | Done (TASK-069) |
| `widgets/order-confirmation/ui/order-item-list.tsx`        | `import { formatMoney } from "@/shared/lib"` | Done (TASK-069) |
| `widgets/order-confirmation/ui/order-totals-breakdown.tsx` | `import { formatMoney } from "@/shared/lib"` | Done (TASK-069) |

No storefront file contains `Intl.NumberFormat("en-US"` or `currency: "USD"` in any
price-rendering context.

---

## Technical Design

### Presentation-only change — no data model or API contract modifications

Amounts are stored in PostgreSQL as `Decimal(10,2)` in major currency units
(`1299.00` = 1 299 hryvnias). They were always UAH-denominated; the `en-US`/`USD`
formatter was a display-only labelling error. No migration, no Prisma change, no
Orval regeneration is needed.

### FSD placement — shared formatter in `store-admin`

The formatter lives at
`apps/store-admin/src/shared/lib/format/formatCurrency.ts`. This mirrors the
storefront pattern (`apps/store-client/src/shared/lib/format/formatMoney.ts`
from TASK-069). Placing it in `shared/lib` is correct per FSD: it is a pure
utility with no business logic and no entity-layer imports. Widgets import
downward from `shared/` — no import-direction violation.

The admin already has `shared/lib/index.ts` (re-exports `cn` from `utils.ts`).
The format sub-directory is added alongside `utils.ts`.

### Formatter specification

```ts
// apps/store-admin/src/shared/lib/format/formatCurrency.ts
const formatter = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(amount) ? formatter.format(amount) : String(value);
}
```

`minimumFractionDigits: 0` — whole-hryvnia amounts display without decimal
(`1 299 ₴` not `1 299,00 ₴`). `maximumFractionDigits: 2` — kopeck amounts
display correctly (`29,99 ₴`). Identical spec to the storefront `formatMoney`.

The `AdminDashboardStats.tsx` previously used `maximumFractionDigits: 0`
(always rounded). Revenue totals from the backend raw-SQL aggregation are
integers (e.g., `47500`), so `minimumFractionDigits: 0` is equivalent in
practice — no visible change.

### `RevenueTrendChart` type narrowing

The Recharts `tickFormatter` prop already types its argument as `number` in the
existing code. The `Tooltip` `formatter` prop receives `ValueType` which is
`string | number | Array<string | number>`; the existing code casts with
`Number(value)` — use `formatCurrency(Number(value))` as a drop-in replacement.

### Precedent consistency

- TASK-129 (plan 065): status label maps split per-app (storefront dict vs.
  admin `entities/order/status-label.ts`). This plan follows the same
  per-app pattern for formatters — each app owns its own `shared/lib`
  formatter rather than sharing a monorepo package.
- TASK-069 (plan 040): storefront created `shared/lib/format/formatMoney.ts`
  with the same `uk-UA`/`UAH` spec. The admin utility name is `formatCurrency`
  (not `formatMoney`) to avoid import confusion when reading admin code, but
  the output is identical.

---

## Tasks

### TASK-148-A: Create shared `formatCurrency` helper in `store-admin`

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1 h)
**TDD Required:** No (pure display utility; no critical business logic)
**Depends on:** none

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/lib/format/formatCurrency.ts` exists and
      exports `formatCurrency(value: string | number): string`
- [ ] Formatter uses
      `Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0, maximumFractionDigits: 2 })`
- [ ] `formatCurrency("1299")` returns a string containing `₴` and `1 299`
      (space-separated thousands; note: the separator is a non-breaking space
      U+00A0 in Node.js `Intl` — tests must use flexible matching, e.g.
      `result.includes("1")` and `result.includes("₴")`, not exact equality)
- [ ] `formatCurrency("29.99")` returns a string containing `29,99` and `₴`
      (comma decimal, Ukrainian convention)
- [ ] `formatCurrency("0")` returns a string containing `0` and `₴`
- [ ] `formatCurrency("not-a-number")` returns `"not-a-number"` (passthrough
      for invalid input — defensive guard)
- [ ] `formatCurrency(1299)` (number input) works correctly
- [ ] `apps/store-admin/src/shared/lib/format/index.ts` created and exports
      `formatCurrency`
- [ ] `apps/store-admin/src/shared/lib/index.ts` adds
      `export * from "./format"` re-export (alongside the existing `cn` export)
- [ ] `npm run typecheck -w apps/store-admin` passes
- [ ] `npm run build -w apps/store-admin` passes

**Files to create/modify:**

- `apps/store-admin/src/shared/lib/format/formatCurrency.ts` — CREATE: canonical
  `uk-UA`/`UAH` formatter function
- `apps/store-admin/src/shared/lib/format/index.ts` — CREATE: barrel re-export
- `apps/store-admin/src/shared/lib/index.ts` — ADD `export * from "./format"`

---

### TASK-148-B: Replace `en-US`/`USD` formatters in order table, product table, and order detail

**Type:** refactor
**Scope:** store-admin
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** TASK-148-A

**Acceptance Criteria:**

- [ ] `admin-order-table.tsx`: module-level `moneyFormatter` constant removed;
      `formatCurrency` imported from `@/shared/lib`;
      `moneyFormatter.format(Number(order.total))` replaced with
      `formatCurrency(order.total)` (string overload — no `Number()` cast needed)
- [ ] `admin-product-table.tsx`: module-level `priceFormatter` constant removed;
      `formatCurrency` imported from `@/shared/lib`;
      `priceFormatter.format(Number(product.price))` replaced with
      `formatCurrency(product.price)`
- [ ] `order-detail-view.tsx`: module-level `moneyFormatter` constant removed;
      local `formatMoney` wrapper function removed; `formatCurrency` imported
      from `@/shared/lib`; all 7 `formatMoney(...)` call sites replaced with
      `formatCurrency(...)`
- [ ] Zero occurrences of `Intl.NumberFormat("en-US"` remain in
      `apps/store-admin/src/**/*.tsx` (excluding date formatters which are out
      of scope)
- [ ] Zero occurrences of `currency: "USD"` remain in
      `apps/store-admin/src/**/*.tsx`
- [ ] The admin order list total column renders e.g. `1 299 ₴` not `$1,299.00`
- [ ] The admin product list price column renders e.g. `299 ₴` not `$299.00`
- [ ] All money amounts in the admin order detail (unit price, line total,
      subtotal, discount, shipping, tax, grand total) render in UAH format
- [ ] `npm run typecheck -w apps/store-admin` passes
- [ ] `npm run lint -w apps/store-admin` passes
- [ ] `npm run test -w apps/store-admin` passes (no regressions in existing
      component tests)

**Files to modify:**

- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx` — remove
  inline `moneyFormatter`; import and use `formatCurrency`
- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx` —
  remove inline `priceFormatter`; import and use `formatCurrency`
- `apps/store-admin/src/widgets/order-detail/ui/order-detail-view.tsx` — remove
  inline `moneyFormatter` + local `formatMoney` wrapper; import and use
  `formatCurrency`

---

### TASK-148-C: Fix `RevenueTrendChart` ad-hoc formatters; consolidate `AdminDashboardStats`

**Type:** refactor
**Scope:** store-admin
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-148-A

**Acceptance Criteria:**

- [ ] `RevenueTrendChart.tsx` YAxis `tickFormatter` changed from
      `(value: number) => \`₴${value.toFixed(0)}\``to
   `(value: number) => formatCurrency(value)`
- [ ] `RevenueTrendChart.tsx` Tooltip `formatter` changed from
      `(value) => [\`₴${Number(value).toFixed(2)}\`, dict.dashboard.revenueTooltip]`     to
    `(value) => [formatCurrency(Number(value)), dict.dashboard.revenueTooltip]`
- [ ] Revenue chart Y-axis ticks now display thousands separator (e.g.
      `47 500 ₴` not `₴47500`)
- [ ] Revenue chart tooltip displays correct UAH format with comma decimal where
      applicable
- [ ] `AdminDashboardStats.tsx` inline `currencyFormatter` constant removed;
      `formatCurrency` imported from `@/shared/lib`; both `currencyFormatter.format(...)`
      call sites replaced with `formatCurrency(...)`
- [ ] Dashboard stat cards still display UAH amounts correctly — visual output
      unchanged (revenue totals are whole-number values so `maximumFractionDigits: 2`
      with `minimumFractionDigits: 0` produces the same integer display as the
      previous `maximumFractionDigits: 0`)
- [ ] `npm run typecheck -w apps/store-admin` passes
- [ ] `npm run lint -w apps/store-admin` passes
- [ ] `npm run test -w apps/store-admin` passes

**Files to modify:**

- `apps/store-admin/src/widgets/dashboard-charts/ui/RevenueTrendChart.tsx` —
  import `formatCurrency`; replace both inline `toFixed` formatter expressions
- `apps/store-admin/src/widgets/dashboard-stats/ui/AdminDashboardStats.tsx` —
  remove inline `currencyFormatter`; import and use `formatCurrency`

---

### TASK-148-D: Storefront verification — confirm order history/confirmation already complete

**Type:** chore
**Scope:** store-client
**Complexity:** S (0.5 h — read-only audit)
**TDD Required:** No
**Depends on:** none (parallel with A, B, C)

**Acceptance Criteria:**

- [ ] Confirm `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx`
      imports `formatMoney` from `@/shared/lib` and uses it for `order.total` — no
      raw currency string present
- [ ] Confirm `apps/store-client/src/widgets/order-confirmation/ui/order-item-list.tsx`
      imports `formatMoney` from `@/shared/lib` and uses it for `item.price` and
      `item.lineTotal`
- [ ] Confirm `apps/store-client/src/widgets/order-confirmation/ui/order-totals-breakdown.tsx`
      imports `formatMoney` from `@/shared/lib` and uses it for all five amount fields
- [ ] Zero occurrences of `Intl.NumberFormat("en-US"` in `apps/store-client/src/**/*.tsx`
- [ ] Zero occurrences of `currency: "USD"` in `apps/store-client/src/**/*.tsx`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run test -w apps/store-client` passes (83–84 tests green, no
      regressions)
- [ ] Finding documented: storefront currency formatting is complete via TASK-069
      and requires no code changes in TASK-148

**Files to modify:**

- None (read-only verification; no application code changes)

---

## Migration Steps

1. **TASK-148-A** — create the shared `formatCurrency` utility first; no
   dependencies
2. **TASK-148-B** and **TASK-148-C** — can run in parallel once A is done;
   both depend only on the shared utility
3. **TASK-148-D** — read-only audit; can be completed at any point in parallel

Full verification gate after all sub-tasks are complete:

```bash
# Admin
npm run build -w apps/store-admin
npm run typecheck -w apps/store-admin
npm run lint -w apps/store-admin
npm run test -w apps/store-admin

# Storefront (no code changes; verify no regression)
npm run typecheck -w apps/store-client
npm run test -w apps/store-client

# Root (optional — catches cross-workspace issues)
npm run lint
```

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intl.NumberFormat('uk-UA')` thousands separator is a non-breaking space (U+00A0) in Node.js `Intl`, not a regular ASCII space. Exact string equality in tests will fail.                                                                                    | Write any formatter tests (or update existing snapshot tests) using `.includes('₴')` and `.includes('299')` rather than full string equality. Alternatively: `result.replace(/\s/g, ' ')` to normalise whitespace before asserting.                                                                              |
| `AdminDashboardStats.tsx` previously used `maximumFractionDigits: 0` (always rounds to whole hryvnia). Switching to the shared formatter with `maximumFractionDigits: 2` could expose decimal rendering if the API ever returns a non-integer revenue total. | Revenue totals come from a raw SQL `SUM()` on `Decimal(10,2)` columns. Values like `47500.00` have `minimumFractionDigits: 0` so they display as `47 500 ₴` — visually identical. If in the future cents appear (e.g., `47500.50`), they will correctly display as `47 500,50 ₴`. This is the desired behaviour. |
| `RevenueTrendChart` Tooltip `formatter` receives `ValueType = string \| number \| Array<string \| number>`. The `Number(value)` cast in the existing code handles this; the replacement `formatCurrency(Number(value))` is a safe drop-in.                   | Verify typecheck passes — if the Recharts version has stricter types, add an explicit narrowing guard: `typeof value === 'number' ? formatCurrency(value) : String(value)`.                                                                                                                                      |
| Pre-commit hook auto-formats `.ts`/`.tsx` on stage — potential unintended whitespace changes in untouched lines.                                                                                                                                             | Stage only the specific files from each sub-task. Review the git diff before committing.                                                                                                                                                                                                                         |

---

## Notes

- **Presentation-only**: no Prisma schema changes, no new migrations, no API
  contract modifications, no Orval regeneration. All amounts are already
  UAH-denominated in the database — the `en-US`/`USD` label was a display error
  only.
- **Storefront already complete**: The BACKLOG description for TASK-148 noted
  "amounts currently render without a currency" in the storefront. This was
  accurate when the task was authored but TASK-069 (plan 040) has since resolved
  it. Every storefront price component uses `formatMoney` from
  `apps/store-client/src/shared/lib/format/formatMoney.ts`.
- **Date formatters**: `admin-order-table.tsx` and `order-detail-view.tsx` also
  contain `dateFormatter = new Intl.DateTimeFormat("en-US", ...)`. Date
  localization is a separate concern; it belongs in TASK-115 (admin UA
  localization). TASK-148 does not touch date formatters.
- **`AdminDashboardStats.tsx`**: already displays `uk-UA`/`UAH`. TASK-148-C
  migrates it to the shared utility for code consistency, not to fix a user-
  visible bug.
- **Commit scope**: this feature branch should produce 3 commits matching the
  sub-task grouping (A → B → C; D is no-code and noted in the PR description).
  Example commit messages:
  - `feat(admin): add shared formatCurrency utility (TASK-148-A)`
  - `refactor(admin): replace en-US/USD formatters in order and product tables (TASK-148-B)`
  - `refactor(admin): fix RevenueTrendChart and consolidate DashboardStats formatter (TASK-148-C)`
