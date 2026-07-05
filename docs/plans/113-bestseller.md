# Plan 113 — TASK-164 Bestseller signal («Хіти»)

Status: ✅ Done (2026-07-06)

## Goal

Give the catalogue a real "bestselling" signal so the homepage PopularRail «Хіти»
tab shows genuinely top-selling products instead of a best-effort default listing.

## Scope

- Aggregate sold quantity per product from **PAID** orders (`OrderItem` joined to
  `Order.paymentStatus = PAID`, excluding soft-deleted orders). Matches the
  existing dashboard "top products" definition — `OrderStatus` has no `PAID`
  member; `paymentStatus` is the earned-revenue signal since the TASK-151
  decoupling.
- Add `sortBy=bestselling` to `GET /products` (public + admin listing share the
  repository path).
- Wire the storefront «Хіти» rail tab to the new sort.

Out of scope: a dedicated bestsellers endpoint, time-windowed trending, and
compat/inference — a single global "units sold" ranking is enough for the rail.

## Design

`bestselling` cannot be a scalar `orderBy`, so the repository takes a dedicated
ranking path that still composes with every existing filter (category rollup,
brand, device, specs, price, search, active):

1. Fetch the filtered candidate set (`id` + `createdAt` only).
2. Sum sold quantity per candidate from PAID, non-deleted orders
   (`orderItem.groupBy` scoped to the candidate ids so it never scans the whole
   order history).
3. Rank ids by units sold desc, tie-broken by newest `createdAt` first
   (`rankProductIdsBySales`, a pure helper — the critical logic, unit-tested).
   Zero-sales products stay in the list (newest-first tail) so the full catalogue
   remains browsable under this sort.
4. Page the ranked ids in memory (`total` = filtered candidate count, so
   pagination metadata is unaffected), then hydrate + enrich the page.

The list cache key already includes `sortBy`, so bestselling gets its own cache
entry; the default TTL self-heals as new orders are paid.

## Files

- `apps/store-api/src/product/bestseller-rank.util.ts` — pure ranking helper.
- `apps/store-api/src/product/bestseller-rank.util.spec.ts` — unit tests (Red→Green).
- `apps/store-api/src/product/product.repository.ts` — bestselling page path,
  `getUnitsSoldByProductId`, extracted `enrichProducts` / `findPageByColumn`.
- `apps/store-api/src/product/dto/product-list-query.dto.ts` — `bestselling` in
  the `sortBy` enum.
- `apps/store-api/test/product-bestselling.int-spec.ts` — real-DB aggregation test.
- `apps/store-client/src/widgets/product-grid/ui/product-grid.tsx` — «Хіти» tab
  → `sortBy=bestselling`.

## Acceptance criteria

- [x] `sortBy=bestselling` ranks by units sold across PAID orders; unpaid
      quantities do not count.
- [x] Zero-sales products remain listed (newest-first tail); pagination correct.
- [x] Storefront «Хіти» tab uses the bestselling sort.
- [x] Unit + integration tests green; typecheck + lint clean across workspaces.
