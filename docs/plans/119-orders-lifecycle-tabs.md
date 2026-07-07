# Plan 119 — Order Lifecycle Preset Tabs on `/orders`

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Wave 1 (`Хвиля 1 — CRM-ядро + quick-win контент-мапа + мобільний
доступ`), per `docs/handoff-2026-07-07.md`
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-250

## Overview

The admin `/orders` list currently exposes a single flat status filter — a shadcn `<Select>`
listing all 7 `OrderStatus` enum values plus "Усі статуси" — driven by `?status=` in the URL
(`apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`). This is precise but doesn't
match how an admin actually triages a queue: the day-to-day mental model is a handful of
lifecycle buckets ("what's new", "what's being worked", "what's shipped"), not 7 individual enum
values.

TASK-250 adds four **preset tabs** above the table — **Нові** (`PENDING`), **В обробці**
(`CONFIRMED`+`PROCESSING` combined), **Відправлені** (`SHIPPED`), **Всі** (no filter) — as a fast
quick-access layer on top of the existing `?status=` contract. No new endpoint is introduced
(per the source handoff: "без нового API"); the existing `GET /api/admin/orders` route gains a
backward-compatible parameter widening (see Key Design Decision below), and the tabs are purely
additive: the existing granular Select stays untouched so no admin capability is lost, and any
existing bookmarked/deep-linked URL (e.g. `?status=DELIVERED`) keeps working exactly as before.

## Scope

### In Scope

- Widen the admin order list's `status` query parameter to accept multiple values (CSV), scoped
  to the **admin** DTO only — the customer-facing `OrderListQueryDto`/`/api/orders` contract is
  untouched.
- `OrderRepository.findAll` (admin) maps the (possibly multi-value) status filter to a Prisma
  `status: { in: [...] }` clause.
- A small reusable `Tabs`/`TabsList`/`TabsTrigger` UI primitive added to `store-admin`'s
  `shared/ui` (mirroring the one that already exists in `store-client`), since none exists yet in
  `store-admin`.
- Four preset tabs wired into `AdminOrderTable`, reading/writing the same `?status=` URL param the
  existing Select already uses; `?page=` resets on every tab change (matches the existing Select's
  `handleStatusChange` behavior).
- Orval regen in `store-admin` (the admin order-list params type changes shape).
- Unit tests: DTO transform/validation, repository `where` clause, `AdminOrderTable` tab rendering
  - URL writes + deep-link restoration of the active tab.

### Out of Scope

- No new columns, bulk actions, or row-level actions on the orders table.
- No change to the customer-facing order history (`/api/orders`, store-client account orders) —
  its `status` filter stays single-value; no Orval regen needed in store-client.
- Removing or trimming the existing granular status Select — it stays exactly as-is (all 7
  statuses + "Усі статуси"); the tabs are an additive convenience layer, not a replacement (see
  Technical Design → Frontend for the reasoning).
- `OrderStatusHistory` / order timeline (TASK-251) and the "≥48h in PENDING" indicator — separate
  backlog task, not needed for this plan.
- Dashboard "Потребує дії" widget (TASK-248) — parallel, independent work; no shared files.

## User Stories

1. As an admin, I want one-click tabs for "Нові" / "В обробці" / "Відправлені" / "Всі" above the
   orders table, so I don't have to open a dropdown and remember which of the 7 raw statuses maps
   to "still needs my attention."
2. As an admin who bookmarked or shared a filtered URL (e.g. `/orders?status=CONFIRMED,PROCESSING`
   or the pre-existing `/orders?status=DELIVERED`), I want that link to render with the matching
   filter already applied (and the matching tab highlighted, when one exists), so deep links keep
   working exactly as they do today.
3. As an admin who needs a status the presets don't cover (e.g. only `CANCELLED` or `REFUNDED`
   orders), I want the existing detailed status dropdown still available, so I don't lose any
   filtering capability the tabs don't cover.

## Technical Design

### Key design decision — how "В обробці" (CONFIRMED + PROCESSING) is represented

The existing endpoint's `status` query param accepts exactly one `OrderStatus` value
(`OrderListQueryDto.status?: OrderStatus`, validated with `@IsEnum(OrderStatus)`,
`AdminOrderListQueryDto extends OrderListQueryDto`). The "В обробці" preset needs to represent an
**OR of two statuses**, which a single-value param cannot express.

**Decision: additive multi-status param, scoped to the admin DTO only (recommended).**

`AdminOrderListQueryDto` stops extending `OrderListQueryDto` directly for the `status` field and
instead extends `OmitType(OrderListQueryDto, ['status'] as const)`, then redeclares its own
`status?: OrderStatus[]` with a comma-string-or-array `@Transform` (identical shape to the
existing `ProductCardsQueryDto.ids` pattern — see reference below) and
`@IsEnum(OrderStatus, { each: true })`. This is necessary rather than simply widening the
inherited property in a subclass: TypeScript checks class-property overrides covariantly, and
`OrderStatus[]` is not a subtype of the base `OrderStatus`, so a naive override would fail to
compile (TS2416). `OmitType` (from `@nestjs/swagger`, same mapped-types family this codebase
already uses for `PartialType` in `update-attribute-definition.dto.ts` /
`update-discount.dto.ts`) sidesteps this cleanly: the admin DTO no longer inherits the narrow
`status` field at all, so redeclaring it with the wider type is a fresh declaration, not an
override.

Why scope it to the admin DTO instead of widening the shared `OrderListQueryDto.status` for both
routes: widening the shared base would also change the wire contract of the **customer-facing**
`/api/orders` route (`OrderController`, store-client), forcing an Orval regen in store-client too
for a capability the customer order-history UI doesn't need and this plan doesn't touch. Scoping
the change to `AdminOrderListQueryDto` alone keeps the blast radius — and the required Orval
regen — confined to `store-admin`.

**Wire format:** a single comma-separated string, e.g. `?status=CONFIRMED,PROCESSING` — not
repeated params (`?status=CONFIRMED&status=PROCESSING`) — mirroring `ProductCardsQueryDto.ids`
(TASK-211) exactly, including tolerating a repeated-param array if one ever arrives. A bare single
value (`?status=PENDING`, the existing shape) keeps working unchanged — this is what makes the
change backward-compatible. `@ApiProperty` stays `type: String` (not `enum + isArray`) so Orval
generates a plain `string` param type for the frontend, matching the actual CSV wire shape (an
`isArray`/`enum` Swagger shape would imply repeated-param serialization, which is not what this
endpoint expects).

**Alternative considered and rejected:** client-only tabs with no backend change (either mapping
"В обробці" to a single status, or issuing two parallel requests and merging client-side). Rejected
because it either drops one of the two statuses from the "В обробці" bucket (wrong data) or breaks
server-side pagination/sorting across the combined set (two independently-paginated result sets
can't be merged into one correct page). The additive param keeps single-request, server-side
pagination intact for every tab, including "В обробці".

**This makes TASK-250 API-changing** (existing endpoint, backward-compatible parameter widening —
not a new route) → requires an `store-admin`-only Orval regen (`npm run generate:api` from
`apps/store-admin`, or the repo-root equivalent). No store-client regen needed.

### API Contract changes

| Change                          | Detail                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminOrderListQueryDto.status` | `OrderStatus` (single, inherited) → `OrderStatus[]` (own field, CSV-or-array wire format, backward-compatible with a single value); `@ApiProperty` stays `type: String`, example `"CONFIRMED,PROCESSING"` |
| `GET /api/admin/orders`         | Same route, same response shape (`AdminOrderListResponse`) — only the `status` query param's accepted shape widens. Empty/absent `status` still means "all statuses" (unchanged)                          |
| Orval regen                     | `store-admin` only (`useAdminOrderControllerFindAll`'s params type). `store-client`'s `/api/orders` contract is untouched — no regen there                                                                |

### Backend (NestJS)

#### `AdminOrderListQueryDto` (`apps/store-api/src/order/dto/admin-order-list-query.dto.ts`)

- `extends OmitType(OrderListQueryDto, ['status'] as const)` instead of
  `extends OrderListQueryDto`
- Redeclares `status?: OrderStatus[]` with:
  - `@Transform(({ obj, key }) => { ... })` reading the raw `obj[key]` (not the coerced `value` —
    same defensive convention as `ProductCardsQueryDto.ids` / `ProductListQueryDto.isActive`,
    guarding against the global `ValidationPipe`'s `enableImplicitConversion`), splitting on `,`,
    trimming, dropping empties, tolerating a repeated-param array input too; returns `undefined`
    when nothing remains (so "no filter" still means "all statuses")
  - `@IsOptional() @IsArray() @ArrayMaxSize(7) @IsEnum(OrderStatus, { each: true })`
- All other admin-only fields (`userId`, `dateFrom`, `dateTo`, `sortBy`, `sortOrder`) are unchanged.

#### `OrderRepository.findAll` (`apps/store-api/src/order/order.repository.ts`, ~L237–278)

- `where` clause: `...(query.status ? { status: query.status } : {})` →
  `...(query.status?.length ? { status: { in: query.status } } : {})`. `status: { in: [x] }`
  behaves identically to `status: x` for a single-element array, so no special-casing is needed for
  the single-value case.
- `findByUserId` (customer route, ~L202–229) is **not touched** — it still consumes the
  unmodified, scalar `OrderListQueryDto.status`.

#### `OrderService.adminGetAllOrders` / `AdminOrderController.findAll`

- No changes needed — both already pass the DTO straight through; the widened type flows through
  unchanged call sites.

### Frontend (Next.js — FSD, `store-admin`)

#### `shared/ui`

- New `apps/store-admin/src/shared/ui/tabs.tsx` — `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`,
  copied from `apps/store-client/src/shared/ui/tabs.tsx` (same `radix-ui` package, already an
  `store-admin` dependency — zero new install). Barrel-exported from `shared/ui/index.ts` next to
  `Table`/`Select`.

#### widgets (no new widget — extends the existing one)

- `AdminOrderTable` (`apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`) gains a
  `<Tabs>` row **above** the existing filter row (which keeps its Select unchanged):
  - Four presets: `{ value: "PENDING", label: tabNew }`,
    `{ value: "CONFIRMED,PROCESSING", label: tabProcessing }`, `{ value: "SHIPPED", label: tabShipped }`,
    `{ value: "", label: tabAll }`.
  - `activeTab` = the preset whose `value` matches the current `statusParam` string exactly, or a
    non-matching sentinel (e.g. `"__custom__"`) when the current filter doesn't correspond to any
    preset (e.g. the Select is set to `DELIVERED`, or a deep-link to any other single status) — no
    tab renders as active in that case, which is the correct, honest state (a Radix
    `Tabs.Root value=` that matches no `TabsTrigger` simply activates none).
  - `onValueChange` reuses the widget's existing `updateParams` helper: `status: value || undefined,
page: undefined` — the same shape `handleStatusChange` already uses for the Select, so no new
    URL-writing logic is introduced.
  - The Select is left fully intact (still all 7 `STATUS_FILTER_OPTIONS` + "Усі статуси") — this is
    a deliberate **additive, non-replacing** layering: it guarantees zero regression on any
    single-status filter that isn't one of the 3 non-"all" presets (`DELIVERED`, `CANCELLED`,
    `REFUNDED`, and even `CONFIRMED`/`PROCESSING` individually), and any existing bookmarked
    `?status=` deep link keeps rendering exactly as it does today.
  - Generated param type: after the Orval regen, `AdminOrderControllerFindAllParams.status`
    becomes a plain `string` (matching the DTO's `type: String` Swagger shape) instead of the
    current generated enum union — the existing frontend cast
    `statusParam as (typeof OrderEntityStatus)[keyof typeof OrderEntityStatus]` is replaced by
    passing `statusParam || undefined` straight through (no cast needed).

#### app (pages)

- No changes — `apps/store-admin/src/app/(dashboard)/orders/page.tsx` stays a thin
  `<Suspense>` wrapper; the tabs live entirely inside `AdminOrderTable`.

#### shared/config (dictionary)

- New UA keys under `dict.orders`: `tabNew` ("Нові"), `tabProcessing` ("В обробці"),
  `tabShipped` ("Відправлені"), `tabAll` ("Всі"), `tabsAria` (e.g. "Швидкі фільтри за статусом").
  Existing `filterStatusAria`/`allStatuses` (Select) are unchanged.

## Tasks

### TASK-250-A: Admin order list accepts a multi-value `status` filter

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No (query-param widening + repository `where`-clause change, not
cart/discount/inventory/auth) — covered by unit tests per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `AdminOrderListQueryDto` extends `OmitType(OrderListQueryDto, ['status'] as const)` and
      redeclares `status?: OrderStatus[]` with the CSV-or-array `@Transform` (mirroring
      `ProductCardsQueryDto.ids`, reading `obj[key]` not `value`) + `@IsOptional() @IsArray()
    @ArrayMaxSize(7) @IsEnum(OrderStatus, { each: true })`
- [ ] A single value (`?status=PENDING`) still resolves to `['PENDING']` — no regression on the
      current single-status behavior any existing deep link relies on
- [ ] A CSV value (`?status=CONFIRMED,PROCESSING`) resolves to `['CONFIRMED', 'PROCESSING']`
- [ ] An invalid status value in the list (`?status=CONFIRMED,BOGUS`) fails validation (400) —
      `@IsEnum(..., { each: true })` rejects it
- [ ] Absent `status` still resolves to `undefined` (no filter — all statuses), unchanged from
      today
- [ ] `OrderRepository.findAll`'s `where` clause changes to
      `...(query.status?.length ? { status: { in: query.status } } : {})`; `findByUserId`
      (customer route) is untouched and keeps using the unmodified scalar `OrderListQueryDto.status`
- [ ] `order.repository.spec.ts` — new `describe('findAll — multi-status filter (TASK-250)')`
      asserting: (a) a single-status array produces `status: { in: ['PENDING'] }` in the `where`
      passed to `prisma.order.findMany`/`count`, (b) a two-status array produces
      `status: { in: ['CONFIRMED', 'PROCESSING'] }`, (c) an absent/empty `status` omits the `status`
      key from `where` entirely (mirrors the existing "constrains the where clause with
      deletedAt: null" test style at ~L366)
- [ ] A DTO-level unit test (new `admin-order-list-query.dto.spec.ts`, or extend an existing DTO
      transform test if the codebase has a precedent) covers the transform/validation cases above
      via `plainToInstance` + `validate()`
- [ ] Orval regen (`npm run generate:api` in `store-admin`) — `AdminOrderControllerFindAllParams.status`
      becomes `string` (CSV), matching the DTO's `type: String` Swagger annotation; store-admin
      typechecks clean
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api` (order module)

**Files to create/modify:**

- `apps/store-api/src/order/dto/admin-order-list-query.dto.ts` — `OmitType` + own `status`
  field/transform/validation
- `apps/store-api/src/order/order.repository.ts` — `findAll`'s `where.status` → `{ in: [...] }`
  (~L250)
- `apps/store-api/src/order/order.repository.spec.ts` — new multi-status `describe` block
- `apps/store-api/src/order/dto/admin-order-list-query.dto.spec.ts` — new (or extended) DTO
  transform/validation spec
- `apps/store-admin/src/shared/api/generated/` — regenerated (Orval)

---

### TASK-250-B: Preset lifecycle tabs on `/orders`

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — covered by RTL/MSW tests per the acceptance criteria below.
**Depends on:** TASK-250-A (needs the multi-status param + its Orval regen to make the "В обробці"
tab's `CONFIRMED,PROCESSING` value valid against the API; without it the tab would send a value
the (old) single-`OrderStatus` `@IsEnum` validator rejects with 400)

**Acceptance Criteria:**

- [ ] New `apps/store-admin/src/shared/ui/tabs.tsx` — `Tabs`/`TabsList`/`TabsTrigger`/
      `TabsContent`, copied from `apps/store-client/src/shared/ui/tabs.tsx` (same `radix-ui`
      import, no new dependency), barrel-exported from `shared/ui/index.ts`
- [ ] `AdminOrderTable` renders a `<Tabs>` row above the existing filter row with exactly 4
      triggers: Нові (`PENDING`) / В обробці (`CONFIRMED,PROCESSING`) / Відправлені (`SHIPPED`) /
      Всі (`""`)
- [ ] Clicking a tab calls the existing `updateParams` helper with `{ status: value || undefined,
    page: undefined }` — same shape/behavior as the current Select's `handleStatusChange`
      (page resets to 1, status set/cleared)
- [ ] The active tab is derived from the current `?status=` value: `PENDING` → Нові active,
      `CONFIRMED,PROCESSING` (in either comma order is out of scope — the tabs always write the
      canonical `CONFIRMED,PROCESSING` string, so only that exact string need match) → В обробці
      active, `SHIPPED` → Відправлені active, empty/absent → Всі active
- [ ] Deep-link restoration: loading `/orders?status=CONFIRMED,PROCESSING` directly (URL already
      set, no user click) renders with the В обробці tab active and the table already filtered —
      verifies the "deep-link to a tab works" contract from the BACKLOG description
- [ ] Deep-link non-regression: loading `/orders?status=DELIVERED` (not one of the 3 non-"all"
      presets) still filters the table correctly via the untouched Select value; no tab renders as
      active (expected, not a bug — documented in the widget's TSDoc comment)
- [ ] The existing Select is unchanged — still lists all 7 `STATUS_FILTER_OPTIONS` +
      "Усі статуси"; selecting one of the 3-presets-adjacent single statuses (e.g. `CONFIRMED`
      alone) still works and correctly shows no tab as active
- [ ] `?page=` resets to 1 (removed from the URL) on every tab click, matching the existing
      Select's behavior
- [ ] New dict keys added to `apps/store-admin/src/shared/config/dictionary.ts` under `orders`:
      `tabNew`, `tabProcessing`, `tabShipped`, `tabAll`, `tabsAria` — no hardcoded UA strings in
      the component
- [ ] `admin-order-table.tsx`'s param cast simplifies: `statusParam || undefined` passed directly
      to `useAdminOrderControllerFindAll({ status })` (the generated type is now a plain `string`,
      no enum cast needed)
- [ ] `admin-order-table.test.tsx` — new `describe('AdminOrderTable — lifecycle tabs (TASK-250)')`
      with MSW handlers for `*/api/admin/orders` covering: (a) clicking each of the 4 tabs writes
      the expected `status=` value via the mocked `router.replace`/`updateParams` call, (b) a
      pre-set `useSearchParams` mock of `status=CONFIRMED,PROCESSING` renders with В обробці as the
      active tab (`aria-selected`/`data-state=active`), (c) a pre-set `status=DELIVERED` renders
      with no tab active while the table still reflects the filter
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/tabs.tsx` — new (copied from store-client)
- `apps/store-admin/src/shared/ui/index.ts` — barrel-export `Tabs`/`TabsList`/`TabsTrigger`
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx` — preset tabs row, active-tab
  derivation, simplified `status` param cast
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx` — new tab-behavior
  `describe` block
- `apps/store-admin/src/shared/config/dictionary.ts` — new `orders.tab*`/`tabsAria` keys

## Dependencies & Sequencing

- TASK-250 is **independent of every other Wave-1 task** — it touches only `order` module files
  (backend) and the `order-list` widget + a new `shared/ui/tabs.tsx` primitive (frontend). It
  shares no files with TASK-248 (dashboard widget + sidebar badges), TASK-249 (dashboard metrics),
  TASK-264 (content map), or TASK-257 (admin mobile shell) — safe to run fully in parallel with all
  of them in Round 1.
- Internally, **TASK-250-A must land (and be Orval-regenerated) before TASK-250-B** — the frontend
  tab for "В обробці" is only valid once the backend accepts `CONFIRMED,PROCESSING` as a `status`
  value; building the frontend first would 400 on that one tab until the backend change merges.
  TASK-250-A alone is shippable/testable in isolation (no visible frontend change).

## Risks & Mitigations

| Risk                                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OmitType` mapped-type is new to this codebase (only `PartialType` used so far) and could be misapplied, accidentally dropping `page`/`limit` too                          | `OmitType(OrderListQueryDto, ['status'] as const)` only removes the named key; a DTO unit test asserting `page`/`limit`/`userId`/`dateFrom`/`dateTo`/`sortBy`/`sortOrder` still validate correctly closes the gap                                                                         |
| Widening the shared `OrderListQueryDto.status` (the rejected alternative) would have forced a store-client Orval regen for an unused capability                            | Avoided entirely by scoping the widened field to `AdminOrderListQueryDto` via `OmitType` — store-client is untouched, confirmed by the "no store-client regen" acceptance criterion                                                                                                       |
| Tabs + Select both writing `?status=` could visually desync (e.g., a tab looks active while the Select still shows a stale single-status label, or vice versa)             | Both derive their displayed value from the same `statusParam` on every render — no separate local state for either control, so they can't drift out of sync with the URL                                                                                                                  |
| `URLSearchParams` percent-encodes the comma in `CONFIRMED,PROCESSING` (`%2C`) — cosmetically noisy but not a functional risk                                               | Documented in Notes; `searchParams.get('status')` decodes it back to the literal comma-joined string on read, so deep-linking and the active-tab match still work correctly                                                                                                               |
| `@IsEnum(OrderStatus, { each: true })` combined with the global `ValidationPipe`'s `enableImplicitConversion` behaves differently for arrays than the known boolean gotcha | The `@Transform` reads `obj[key]` (the untouched raw value) before class-transformer's implicit conversion has a chance to run on it — same defensive pattern already proven correct for `ProductCardsQueryDto.ids` (an array field) and `ProductListQueryDto.isActive` (a boolean field) |

## Notes

- The brief explicitly frames this as "без нового API" (`docs/handoff-2026-07-07.md`) — the plan
  honors that: `GET /api/admin/orders` is the same route, only one query parameter's accepted
  shape widens, which is why this is described as "API-changing" (needs an Orval regen) rather
  than "a new API."
- The decision to **keep the existing Select untouched** rather than trim it to the 3
  non-preset-covered statuses was made specifically to avoid any regression risk and because the
  BACKLOG description itself calls the tabs "saved filters **layered over** the existing
  `?status=`" — i.e., an overlay/convenience, not a replacement. A future follow-up could revisit
  trimming the Select once real admin usage data shows the redundancy is more confusing than
  useful, but that is not part of this plan.
- `OrderStatusHistory` / order timeline (TASK-251) is a natural follow-on once this plan's tabs
  ship (e.g., a future "> 48h in PENDING" indicator could live inside the Нові tab), but is
  explicitly out of scope here and already tracked as its own BACKLOG task.
