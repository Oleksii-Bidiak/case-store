# Plan 118 — «Потребує дії» Dashboard Widget + Sidebar Count Badges

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 1** (CRM-ядро + quick-win контент-мапа + мобільний доступ)
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-248

## Overview

The admin currently has no single place that answers "what needs my attention right now?" —
the dashboard shows lagging metrics (revenue, order counts by status, low stock) and the
sidebar has exactly one live counter (`useAdminContactUnreadCount`, next to «Повідомлення»).
Discovery plan 100 (§3, widget #1; §5 "Мінімум") identified a «Потребує дії» ("needs action")
widget as the single highest-priority CRM gap: four action counters — new orders, reviews
awaiting moderation, unpaid-but-active ("in-transit") orders, and failed outbound mail — surfaced
both as a dashboard widget and as sidebar badges next to the relevant nav items, each one a
one-click deep link into the filtered section.

This plan documents the approved approach (per the brief that produced it) for TASK-248 — the
first task of Етап 6 Wave 1, and the hub the rest of the wave hangs off (see Dependencies &
Sequencing).

## Scope

### In Scope

- One new lightweight, cache-friendly `GET /api/admin/dashboard/needs-action` endpoint returning
  the four counts (design decision below).
- A minimal `unpaidInTransit` filter on the existing admin order list, so the "unpaid in-transit"
  counter has a real deep-link target (the compound `paymentStatus != PAID AND status NOT IN
(CANCELLED, REFUNDED)` condition has no existing single-query-param filter today).
- The dashboard `dashboard-needs-action` widget (four small stat/link cards) mounted above the
  existing `AdminDashboardStats`.
- Sidebar count badges next to «Замовлення» (new orders) and «Відгуки» (pending reviews),
  mirroring the existing `useAdminContactUnreadCount` → «Повідомлення» badge pattern exactly.
- Deep-links: new-orders → `/orders?status=PENDING`; pending-reviews → `/reviews?status=pending`;
  unpaid-in-transit → `/orders?unpaidInTransit=true`.
- Refetch-after-mutation wiring: invalidate the new needs-action query key from the three
  existing mutations that can change these counts (order status update, order payment-status
  update, review approve/reject).
- Orval regen in store-admin (new endpoint + the `unpaidInTransit` query param on the existing
  admin-order-list endpoint are both contract changes).

### Out of Scope

- Any UI for _acting on_ an item beyond navigating to its filtered section (no bulk-approve, no
  inline order-status change from the widget itself — the destination sections already have those
  controls).
- Review moderation itself (approve/reject UI) — already shipped, untouched here.
- A dedicated admin UI for `MailOutbox` (there is no `/mail`-style admin section and none is being
  added by this plan). The failed-mail counter therefore renders as a **non-clickable** info card
  — see Technical Design → Frontend for the reasoning. Building a mail-outbox admin view is a
  separate, unscheduled follow-up.
- `/orders` preset tabs (Нові / В обробці / Відправлені / Всі) — that is TASK-250, a separate
  Wave-1 task that builds a proper tabs UI on top of `?status=`; this plan only makes the
  `unpaidInTransit` counter's _link_ work, it does not redesign the order-list filter UI.
- `OrderStatusHistory` / "> 48h in PENDING" — TASK-251 (Wave 4), a different data model.
- Admin mobile shell (drawer sidebar) — TASK-257; that task's acceptance criteria explicitly
  require this plan's badges to already exist and remain visible in the drawer, but building the
  drawer itself is not part of this plan.

## User Stories

1. As the store owner, I want to see at a glance, right when I open the admin dashboard, how many
   new orders, pending reviews, and unpaid-in-transit orders are waiting on me, so I don't have to
   check three different pages every morning.
2. As the store owner browsing any admin page, I want to see a small count badge next to
   «Замовлення» and «Відгуки» in the sidebar (like the one that already exists for
   «Повідомлення»), so I know there's something to do without navigating away from what I'm doing.
3. As the store owner, I want clicking a counter to take me straight to the relevant section with
   the right filter already applied, so I don't have to re-apply the filter myself.

## Technical Design

### Design decision — dedicated endpoint vs. extending `summary`

Two options were considered for where the four counts live:

**(a) Extend `GET /admin/dashboard/summary`** with a `needsAction` sub-DTO. Simplest to wire (one
extra `Promise.all` entry, one extra field in the existing response), but `DashboardSummaryResponse`
is already a heavy payload (5 metric groups, two 30-day time series, top products, low stock) that
only the dashboard page itself fetches.

**(b) A dedicated `GET /api/admin/dashboard/needs-action` endpoint** — small, four-integer
payload, mirroring the already-shipped precedent `GET /api/contact/admin/unread-count` →
`{ data: { unread: number } }` consumed by `useAdminContactUnreadCount` in the sidebar.

**Recommendation: (b).** The sidebar (`AdminSidebar`) is mounted on **every** admin page, not just
the dashboard — it needs a small, cheap, frequently-refetched payload, not a slice of the heavy
summary endpoint that also runs two `generate_series` time-series queries and a raw top-products
join. Piggy-backing the sidebar badges on `summary` would mean either (i) the sidebar fetches the
entire heavy summary just to read two counters (wasteful, and couples an always-mounted shell
component to the dashboard-page's data shape), or (ii) `summary` is fetched twice with different
cache keys for different consumers, defeating its own purpose. A dedicated endpoint, by contrast,
is fetched once by both the dashboard widget and the sidebar (same TanStack Query cache key), and
its narrow four-field shape means an aggressive `refetchOnWindowFocus`-style freshness policy
(matching `useAdminContactUnreadCount`) is cheap. This is exactly the reasoning that already
produced `unread-count` as a sibling of the (also heavier) inbox-list endpoint — this plan applies
the same split to the dashboard.

No Prisma schema change is required — every count is a read over existing columns
(`Order.status`, `Order.paymentStatus`, `Review.isActive`, `MailOutbox.status`).

### API Contract changes

| Change                                          | Detail                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New** `GET /api/admin/dashboard/needs-action` | `AdminGuard`-protected (inherited from the existing `DashboardController` class-level guard); `operationId: adminDashboardControllerGetNeedsAction`; response `{ data: NeedsActionDto }` — `{ newOrders, pendingReviews, unpaidInTransit, failedMails }` (all `number`), mirroring `ContactUnreadResponse`'s envelope shape exactly |
| **Extend** `AdminOrderListQueryDto`             | New optional `unpaidInTransit?: boolean` filter (boolean-query-DTO gotcha applies — see Risks); when `true`, the admin order list applies the exact same compound condition as `DashboardRepository.getUnrealizedRevenue()`: `paymentStatus != PAID AND status NOT IN (CANCELLED, REFUNDED)`                                        |

Both changes require an Orval regen in `store-admin` (`npm run generate:api` or the project's
equivalent) — the new `needs-action` hook and model, and the new `unpaidInTransit` param on
`useAdminOrderControllerFindAll`.

### Backend (store-api)

#### `DashboardRepository` (extend)

- `getNeedsAction(): Promise<NeedsAction>` — four independent `count`/`aggregate`-free `count`
  queries run via a single `Promise.all` (no N+1, no joins, mirrors the existing `getSummary()`
  parallelization style):
  - `prisma.order.count({ where: { status: OrderStatus.PENDING, deletedAt: null } })` → `newOrders`
  - `prisma.review.count({ where: { isActive: false } })` → `pendingReviews` (mirrors
    `ReviewRepository.findForModeration('pending')`'s exact where-shape)
  - `prisma.order.count({ where: this.unrealizedOrderWhere() })` → `unpaidInTransit`
  - `prisma.mailOutbox.count({ where: { status: MailOutboxStatus.FAILED } })` → `failedMails`
- **Refactor**: extract the compound `{ paymentStatus: { not: PAID }, status: { notIn:
[CANCELLED, REFUNDED] } }` object (currently written out twice, in `getUnrealizedRevenue()` and
  `getUnrealizedRevenueSince()`) into one private `unrealizedOrderWhere(): Prisma.OrderWhereInput`
  helper, and have all three call sites (the two existing methods + the new count) use it. Purely
  internal to `DashboardRepository` — no cross-module export, so `OrderRepository`'s own
  `unpaidInTransit` filter (below) is written independently rather than importing this helper
  (Clean Architecture: `dashboard` and `order` have no existing dependency on each other; see
  Risks for the accepted, documented minor inconsistency this can cause).

#### `DashboardService` (extend)

- `getNeedsAction(): Promise<NeedsActionDto>` — thin pass-through to the repository, same shape as
  the existing `getSummary()`.

#### `DashboardController` (extend)

- `GET /admin/dashboard/needs-action` — new method on the already-`@UseGuards(AdminGuard)`-scoped
  controller class, so no additional guard decorator is needed on the method itself (matches how
  `getSummary()` relies on the class-level guard today). `@ApiBearerAuth('access-token')` +
  `@ApiOperation({ operationId: 'adminDashboardControllerGetNeedsAction' })` +
  `@ApiResponse({ status: 200, type: NeedsActionResponse })`.

#### `OrderRepository.findAll()` (extend)

- When `query.unpaidInTransit` is `true`, merge `{ paymentStatus: { not: PaymentStatus.PAID },
status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] } }` into the existing `where`
  object alongside the current `userId`/`status`/`dateFrom`/`dateTo` conditions (all remain
  composable — e.g. `?unpaidInTransit=true&dateFrom=...` still works). `deletedAt: null` is
  already applied unconditionally by this method.

#### `AdminOrderListQueryDto` (extend)

- New field `unpaidInTransit?: boolean`, decorated exactly like the existing `isActive` boolean
  filter on `ProductListQueryDto` (`apps/store-api/src/product/dto/product-list-query.dto.ts`
  L82-95): `@Transform(({ obj, key }) => { const raw = obj[key]; if (raw === true || raw ===
'true') return true; if (raw === false || raw === 'false') return false; return undefined; })`
  before `@IsBoolean()` — **not** a bare `@Type(() => Boolean)`, because the global
  `ValidationPipe`'s `enableImplicitConversion: true` coerces `?unpaidInTransit=false` to `true`
  otherwise (the exact gotcha TASK-230/TASK-150-B5 already fixed twice elsewhere).

### Frontend (store-admin)

#### entities

- `entities/dashboard/index.ts` — re-export the new Orval-generated
  `useAdminDashboardControllerGetNeedsAction` hook, `getAdminDashboardControllerGetNeedsActionQueryKey`,
  and the `NeedsActionDto`/`NeedsActionResponse` types (same re-export shape already used for
  `useAdminDashboardControllerGetSummary`).
- `entities/order/index.ts` — no new hook (reuses `useAdminOrderControllerFindAll`); the generated
  `AdminOrderControllerFindAllParams` type gains `unpaidInTransit?: boolean` automatically via
  regen — re-export unchanged.

#### widgets

- **New** `widgets/dashboard-needs-action/` — `NeedsActionWidget` (four small link-cards: label +
  count + destination href) and `NeedsActionWidgetSkeleton`, following the existing
  `dashboard-stats` widget's `StatCard` visual language (tone-colored count, `shadow-card`,
  `rounded-lg border`) but each card is an `<Link>` (via shadcn `Button asChild` or a plain
  `next/link`-wrapped card, consistent with how `dashboard-view.tsx`'s "Швидкі дії" buttons already
  link with `Button asChild`) — except the failed-mail card, which renders as a plain
  non-interactive stat (no `href`, no hover affordance) since there is no admin destination for it
  (see Out of Scope). A card with `count === 0` still renders (so the owner sees "all clear"), but
  visually de-emphasized (`tone="default"`/muted, vs. `tone="warning"` when count > 0) — mirrors
  the tone-carries-meaning convention already used by `AdminDashboardStats`.
- `widgets/admin-shell/admin-sidebar.tsx` (extend) — add the same `useAdminDashboardControllerGetNeedsAction()`
  read as the existing `useAdminContactUnreadCount()` call, and render a `Badge` (identical
  `className="ml-auto"` treatment) next to the `/orders` nav item (`newOrders` count) and the
  `/reviews` nav item (`pendingReviews` count), following the exact conditional-render shape
  already used for `item.href === "/messages"`.
- `widgets/order-list/ui/admin-order-table.tsx` (extend) — read a new `?unpaidInTransit=true` URL
  param (same `searchParams.get(...)` pattern already used for `status`/`page`) and pass it through
  to `useAdminOrderControllerFindAll(...)`. The existing status `<Select>` is left as-is (it has no
  option representing this compound filter) — landing on `/orders?unpaidInTransit=true` shows the
  correctly filtered table with the `<Select>` reading "Усі статуси"; reconciling the `<Select>`'s
  displayed value with this compound preset is deliberately deferred to TASK-250's tabs redesign
  (documented as a known, accepted gap, not a defect of this plan).
- `widgets/review-moderation/ui/admin-review-table.tsx` (extend) — after a successful
  approve/reject mutation, additionally invalidate the new needs-action query key alongside the
  existing `getAdminReviewControllerListQueryKey()` invalidation.
- `features/order-status-update/ui/order-status-select.tsx` and
  `features/order-payment-update/ui/payment-status-select.tsx` (extend) — after a successful
  status/payment-status update, additionally invalidate the needs-action query key alongside the
  two existing invalidations (`getAdminOrderControllerFindAllQueryKey()` /
  `getAdminOrderControllerFindByIdQueryKey(orderId)`).

#### app

- `app/(dashboard)/dashboard-view.tsx` (extend) — mount `NeedsActionWidget`/`NeedsActionWidgetSkeleton`
  above `AdminDashboardStats` (per plan 100 §3, widget #1 is meant to sit "at the top, in place of
  or above stats"). It fetches its own data via its own hook (does not reuse the `summary` fetch
  already in `DashboardView`), consistent with the endpoint split above.

#### shared/config

- `shared/config/dictionary.ts` — new `dict.dashboard.needsAction*` strings (heading + one label
  per counter + the "all clear" zero-state copy) and two new `aria-label` builder strings for the
  orders/reviews sidebar badges (mirrors `dict.messages.unreadBadgeAria(n)`).

## Tasks

### TASK-248-A: Backend — `needs-action` endpoint + unpaid-in-transit order filter

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (read-only COUNT aggregates + a query-DTO filter addition — not
cart/discount/inventory/auth — but still fully covered by the acceptance criteria below)
**Depends on:** —

**Acceptance Criteria:**

- [ ] `GET /api/admin/dashboard/needs-action` returns `{ data: { newOrders, pendingReviews,
    unpaidInTransit, failedMails } }` (all `number`), 401 with no token, 403 for a non-admin
      token, 200 for an admin token
- [ ] `NeedsActionDto`/`NeedsActionResponse` (`@ApiProperty`-typed) declared in
      `apps/store-api/src/dashboard/dto/dashboard-needs-action.dto.ts`, re-exported from
      `dashboard/dto/index.ts`, and added to the controller's `@ApiExtraModels(...)` list so Orval
      resolves them as named models (not inline schemas)
- [ ] `DashboardRepository.getNeedsAction()` runs exactly 4 queries via one `Promise.all` — no
      N+1, no unnecessary joins/includes
- [ ] `unrealizedOrderWhere()` private helper extracted and reused by `getUnrealizedRevenue()`,
      `getUnrealizedRevenueSince()`, and the new count query (no duplicated literal left in the
      class)
- [ ] `AdminOrderListQueryDto.unpaidInTransit?: boolean` added with the `@Transform(({ obj, key
    }) => ...)` boolean-coercion guard (not a bare implicit-conversion boolean) — mirrors
      `ProductListQueryDto.isActive` exactly
- [ ] `OrderRepository.findAll()` applies the compound `paymentStatus != PAID AND status NOT IN
    (CANCELLED, REFUNDED)` filter only when `unpaidInTransit === true`; composes correctly with
      the existing `userId`/`status`/date-range filters; unaffected (`undefined`) when the param is
      absent — no regression on the existing admin order list
- [ ] New `apps/store-api/src/order/dto/admin-order-list-query.dto.spec.ts` — a
      `plainToInstance(..., { enableImplicitConversion: true })` regression test asserting
      `?unpaidInTransit=false` resolves to `false` (not `true`), mirroring
      `product-list-query.dto.spec.ts`'s existing `isActive` case
- [ ] `order.repository.spec.ts` — new case(s) asserting the compound where-merge when
      `unpaidInTransit: true` is present vs. absent
- [ ] `test/dashboard.e2e-spec.ts` — new `describe('GET /admin/dashboard/needs-action')` block:
      guard behaviour (401/403/200) + response shape, `DashboardRepository` mocked as the existing
      suite already does
- [ ] `test/dashboard.repository.int-spec.ts` — new `describe('getNeedsAction')` block against
      real Postgres: seed one PENDING order, one CONFIRMED-but-unpaid order, one CANCELLED
      unpaid order (must be excluded), one `isActive: false` review, one approved (`isActive:
    true`) review (must be excluded), one `MailOutboxStatus.FAILED` row, one `SENT` row (must be
      excluded); assert all four counts are exact
- [ ] Orval regen (`store-admin`) — `NeedsActionDto`/`NeedsActionResponse` generated as named
      models; `AdminOrderControllerFindAllParams` gains `unpaidInTransit?: boolean`
- [ ] `npm run typecheck` / `npm run lint` clean for `store-api`
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test:e2e -w apps/store-api`,
      `npm run test:int -w apps/store-api` (requires the `store_test` DB up + migrated)

**Files to create/modify:**

- `apps/store-api/src/dashboard/dto/dashboard-needs-action.dto.ts` — new: `NeedsActionDto`,
  `NeedsActionResponse`
- `apps/store-api/src/dashboard/dto/index.ts` — export the new DTOs
- `apps/store-api/src/dashboard/dashboard.types.ts` — new plain `NeedsAction` interface mirror
- `apps/store-api/src/dashboard/dashboard.repository.ts` — `getNeedsAction()` + extracted
  `unrealizedOrderWhere()` helper
- `apps/store-api/src/dashboard/dashboard.service.ts` — `getNeedsAction()` pass-through
- `apps/store-api/src/dashboard/dashboard.controller.ts` — new `GET needs-action` route +
  `@ApiExtraModels` additions
- `apps/store-api/src/order/dto/admin-order-list-query.dto.ts` — `unpaidInTransit?: boolean`
- `apps/store-api/src/order/dto/admin-order-list-query.dto.spec.ts` — new: boolean-transform
  regression test
- `apps/store-api/src/order/order.repository.ts` — `findAll()` where-builder
- `apps/store-api/src/order/order.repository.spec.ts` — new `unpaidInTransit` cases
- `apps/store-api/test/dashboard.e2e-spec.ts` — new needs-action guard/shape tests
- `apps/store-api/test/dashboard.repository.int-spec.ts` — new needs-action real-DB assertions
- `apps/store-admin/src/shared/api/generated/` — regenerated (Orval)

---

### TASK-248-B: Frontend — needs-action widget + sidebar badges + deep-links + invalidation

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-248-A

**Acceptance Criteria:**

- [ ] `entities/dashboard/index.ts` re-exports `useAdminDashboardControllerGetNeedsAction`,
      `getAdminDashboardControllerGetNeedsActionQueryKey`, `NeedsActionDto`, `NeedsActionResponse`
- [ ] New `widgets/dashboard-needs-action/ui/NeedsActionWidget.tsx` renders 4 cards (new orders,
      pending reviews, unpaid-in-transit, failed mail); the first 3 are `Link`s to
      `/orders?status=PENDING`, `/reviews?status=pending`, `/orders?unpaidInTransit=true`
      respectively; the failed-mail card is non-interactive (no `href`)
- [ ] `NeedsActionWidgetSkeleton` matches the 4-card layout (same pattern as
      `AdminDashboardStatsSkeleton`)
- [ ] Both exported from `widgets/dashboard-needs-action/index.ts` and re-exported from
      `widgets/index.ts`
- [ ] `app/(dashboard)/dashboard-view.tsx` mounts `NeedsActionWidget`/`NeedsActionWidgetSkeleton`
      above `AdminDashboardStats`, fetching via its own hook call (independent of the `summary`
      fetch already on that page)
- [ ] `widgets/admin-shell/admin-sidebar.tsx` — `useAdminDashboardControllerGetNeedsAction()` read
      added; `Badge` rendered next to `/orders` (value = `newOrders`) and `/reviews` (value =
      `pendingReviews`) only when count > 0, identical `className="ml-auto"` treatment and
      `active ? "secondary" : "default"` variant logic as the existing `/messages` badge
- [ ] `widgets/order-list/ui/admin-order-table.tsx` reads `?unpaidInTransit=true` from
      `searchParams` and passes it to `useAdminOrderControllerFindAll(...)`; landing on that URL
      renders the correctly filtered table
- [ ] `widgets/review-moderation/ui/admin-review-table.tsx` — approve/reject success handlers
      additionally invalidate `getAdminDashboardControllerGetNeedsActionQueryKey()`
- [ ] `features/order-status-update/ui/order-status-select.tsx` and
      `features/order-payment-update/ui/payment-status-select.tsx` — success handlers additionally
      invalidate `getAdminDashboardControllerGetNeedsActionQueryKey()`
- [ ] `shared/config/dictionary.ts` — new UA strings added (no hardcoded English/inline strings in
      the new widget or badges)
- [ ] New widget has an RTL test (`NeedsActionWidget.test.tsx`) covering: renders 4 counts from a
      fixture summary, 3 cards are links with the correct `href`s, the mail card has no link role,
      zero-state (`count: 0`) renders the de-emphasized tone
- [ ] `admin-sidebar.test.tsx` (existing, if present) or a new test asserts the two new badges
      render only when their count is > 0 and link to the right `href`s — same assertion shape as
      the existing `/messages` badge test
- [ ] `npm run typecheck` / `npm run lint` clean for `store-admin`
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/entities/dashboard/index.ts` — new re-exports
- `apps/store-admin/src/widgets/dashboard-needs-action/ui/NeedsActionWidget.tsx` — new
- `apps/store-admin/src/widgets/dashboard-needs-action/ui/NeedsActionWidgetSkeleton.tsx` — new
- `apps/store-admin/src/widgets/dashboard-needs-action/ui/NeedsActionWidget.test.tsx` — new
- `apps/store-admin/src/widgets/dashboard-needs-action/index.ts` — new
- `apps/store-admin/src/widgets/index.ts` — barrel export
- `apps/store-admin/src/app/(dashboard)/dashboard-view.tsx` — mount the new widget
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — two new badges
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx` — read `unpaidInTransit` param
- `apps/store-admin/src/widgets/review-moderation/ui/admin-review-table.tsx` — invalidation
- `apps/store-admin/src/features/order-status-update/ui/order-status-select.tsx` — invalidation
- `apps/store-admin/src/features/order-payment-update/ui/payment-status-select.tsx` — invalidation
- `apps/store-admin/src/shared/config/dictionary.ts` — new strings

## Dependencies & Sequencing

- **TASK-248-A → TASK-248-B**: the frontend task consumes the regenerated Orval client from the
  backend task; strictly sequential.
- **This plan is the Round-1 hub for two other Wave-1 tasks**, per the handoff's recommended
  order:
  - **TASK-257** (admin mobile shell / drawer sidebar, H severity) explicitly requires "TASK-248
    count badges visible in drawer" as one of its own acceptance criteria — it should start after
    TASK-248-B lands so the badges it needs to preserve already exist in `AdminSidebar`.
  - **TASK-249** (dashboard metrics v2 — unrealized revenue stat card, AOV, repeat-buyer %,
    last-5-orders table) is independent data-wise but shares the same dashboard page
    (`dashboard-view.tsx`) and is expected to compose alongside this plan's `NeedsActionWidget` —
    doing 248 first avoids a merge collision in `dashboard-view.tsx`'s widget-mounting order.
- Everything else in Wave 1 (TASK-250 order-lifecycle tabs, TASK-264 content map) is independent
  of this plan and can run in parallel, except that TASK-250's eventual tabs redesign should be
  aware of the `unpaidInTransit` query param this plan introduces (see Out of Scope) so it doesn't
  reintroduce a second, incompatible way to express the same filter.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                                   | Mitigation                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `unpaidInTransit` boolean query param falls into the same `enableImplicitConversion` trap already hit twice before (TASK-150-B5, TASK-230)                                                                                                                         | Copy the exact `@Transform(({ obj, key }) => ...)` guard from `ProductListQueryDto.isActive` verbatim, pin with a dedicated DTO spec (see TASK-248-A acceptance criteria)                                                                                                                               |
| `DashboardRepository`'s `unrealizedOrderWhere()` and `OrderRepository.findAll()`'s independent `unpaidInTransit` filter drift apart over time (two literals expressing the same condition, deliberately not shared cross-module)                                       | Both are small (2-field) and directly test-pinned in their own suites; a future shared-kernel extraction is low-priority tech debt, not a correctness risk today                                                                                                                                        |
| The dashboard widget's `unpaidInTransit` count (no `deletedAt` filter, matching the existing `unrealizedRevenue` figure) can disagree by a handful with what `/orders?unpaidInTransit=true` displays (`OrderRepository.findAll()` always excludes soft-deleted orders) | Accepted, documented edge case — `Order.deletedAt` is an audit tombstone "set once, never cleared" (see CLAUDE.md conventions) and is rarely set at all today; not worth adding `deletedAt` filtering to the revenue-figure query and risking an unrelated behavior change to an already-shipped metric |
| Sidebar badges add a second always-mounted query (`useAdminDashboardControllerGetNeedsAction`) alongside the existing `useAdminContactUnreadCount`, doubling the shell's background polling                                                                            | Both are single-row COUNT-only payloads (cheap); no new behavior beyond what `unread-count` already established as acceptable                                                                                                                                                                           |
| Landing on `/orders?unpaidInTransit=true` leaves the status `<Select>` showing "Усі статуси" even though a filter is active, which could read as a bug                                                                                                                 | Documented explicitly in this plan (Frontend → `admin-order-table.tsx` bullet) as a deferred-to-TASK-250 gap, not a defect of this task                                                                                                                                                                 |

## Notes

- Source: `docs/plans/100-admin-crm-dashboard-checklist.md` §3 (widget #1) and §5 ("Мінімум"
  checklist item 1); the BACKLOG.md Хвиля-1 row cross-references `docs/handoff-2026-07-07.md`.
- `BACKLOG.md` currently carries a single `TASK-248` row; this plan splits the work into
  `TASK-248-A`/`TASK-248-B` sub-IDs for atomic, independently-testable tasks, following the
  existing project convention for letter-suffixed sub-tasks under one backlog row (e.g.
  `TASK-080-E`, `TASK-105-D`). `BACKLOG.md` itself is intentionally left unmodified by this
  planning pass per the task's own constraints — updating it (splitting the row, linking this
  plan) is the first step when implementation of TASK-248-A begins.
- The dashboard module's existing test convention is `test/dashboard.e2e-spec.ts` (mocked
  repository, HTTP-contract level) + `test/dashboard.repository.int-spec.ts` (real Postgres) —
  unlike most modules, there are no `src/dashboard/*.spec.ts` unit files today; this plan follows
  that existing convention rather than introducing a new one.
- No Prisma migration in this plan — every counter reads existing columns
  (`Order.status`/`paymentStatus`, `Review.isActive`, `MailOutbox.status`).
