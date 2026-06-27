# Plan 070 — Admin Table Column Sorting

**Status:** 🔄 In Progress
**Phase:** Phase 4 — Admin Panel (Tier 2 — Critical functional bug)
**Created:** 2026-06-27
**BACKLOG ref:** TASK-147
**Related (parked):** TASK-140 (broader admin UX/shadcn rewrite — not in scope here)

---

## Overview

Admin users cannot sort the products, orders, or users tables by column. Column headers are plain text with no interactive affordance. The owner flagged this as **critical** because it makes day-to-day admin work impractical for any non-trivial catalog or order volume.

The products backend (`ProductListQueryDto` / `product.repository.ts`) already accepts `sortBy` and `sortOrder`. The orders and users backends do **not** — they hardcode `orderBy: { createdAt: 'desc' }`. This plan adds the missing backend support, then introduces a shared `SortableColumnHeader` + `useTableSort` in `shared/`, and wires all three admin tables.

---

## Scope

### In scope

- Add `sortBy`/`sortOrder` query params to `AdminOrderListQueryDto` and `UserListQueryDto`
- Extend `order.repository.ts` `findAll()` and `user.repository.ts` `findAll()` with an allow-listed `orderBy`
- Add `@ApiQuery` Swagger decorators for sort params on the admin order + admin user list endpoints
- Forward `sortBy`/`sortOrder` through `user.service.ts` `findAll()` (order service already passes the DTO straight through)
- Regenerate Orval client after backend DTO changes
- Shared `SortableColumnHeader` component in `store-admin/shared/ui/`
- Shared `useTableSort` hook in `store-admin/shared/lib/`
- Wire sortable headers in `AdminProductTable`, `AdminOrderTable`, `AdminUserTable`
- Dictionary keys for sort aria-labels
- RTL+MSW tests for the shared component + updated table tests; backend unit tests (TDD) for the new repo sort paths

### Out of scope

- TASK-140: the broader admin-tables UX rewrite (shadcn `DataTable`, column visibility, etc.) — parked
- Multi-column sorting
- Persistent sort preference (localStorage/cookie) — URL params are sufficient for MVP
- Storefront product listing sort (separate feature)
- Any Prisma schema changes (no new DB columns needed)

---

## User Stories

**As an admin**, I want to click a column header in the products table to sort by name, price, or created date, so that I can quickly find the most expensive or newest products.

**As an admin**, I want to click a column header in the orders table to sort by creation date or total, so that I can triage the largest or most recent orders first.

**As an admin**, I want to click a column header in the users table to sort by email or registration date, so that I can find recently registered users or scan accounts alphabetically.

---

## Current-State Findings

### Backend — sortBy/sortOrder support per resource

| Resource       | Endpoint                  | Allowed sortBy               | Default sortBy | Default sortOrder            | Supported? |
| -------------- | ------------------------- | ---------------------------- | -------------- | ---------------------------- | ---------- |
| Products       | `GET /api/admin/products` | `createdAt`, `price`, `name` | `createdAt`    | `desc`                       | YES        |
| Orders (admin) | `GET /api/admin/orders`   | —                            | —              | `createdAt desc` (hardcoded) | NO         |
| Users          | `GET /api/admin/users`    | —                            | —              | `createdAt desc` (hardcoded) | NO         |

**Products:** `ProductListQueryDto` (`apps/store-api/src/product/dto/product-list-query.dto.ts` lines 113–136) declares `@IsIn(['createdAt', 'price', 'name'])` for `sortBy` and `@IsIn(['asc', 'desc'])` for `sortOrder`. The repository `findAll()` (`apps/store-api/src/product/product.repository.ts` lines 284–335) maps the field via an allow-list and passes it to Prisma `orderBy`. The service forwards both params at lines 89–90 of `product.service.ts`. Full end-to-end support is confirmed.

**Orders:** `AdminOrderListQueryDto` (`apps/store-api/src/order/dto/admin-order-list-query.dto.ts`) extends `OrderListQueryDto` (`apps/store-api/src/order/dto/order-list-query.dto.ts`). Neither DTO contains `sortBy` or `sortOrder`. The repository `findAll()` (`apps/store-api/src/order/order.repository.ts` lines 204–215) hardcodes `orderBy: { createdAt: 'desc' }`. The admin order list controller (`apps/store-api/src/order/order.controller.ts` lines 125–127) has `@ApiQuery` only for `status`, `page`, and `limit` — no sort params.

**Users:** `UserListQueryDto` (`apps/store-api/src/user/dto/user-list-query.dto.ts` lines 1–80) has no `sortBy`/`sortOrder`. The repository `findAll()` (`apps/store-api/src/user/user.repository.ts` line 97) hardcodes `orderBy: { createdAt: 'desc' }`. The service `findAll()` (`apps/store-api/src/user/user.service.ts` lines 102–124) builds a `FindAllParams` struct that does not include sort fields. No `@ApiQuery` for sort on the user controller.

### Frontend — table structure and URL state

**`AdminProductTable`** (`apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx`):

- Rendered columns: Name, Category, Price, Status, Created, Actions
- Backend-sortable columns: Name (`name`), Price (`price`), Created (`createdAt`)
- Non-sortable (no backend field): Category, Status
- URL params currently: `search`, `page` — managed via `updateParams` / `router.push`
- Sort params are currently hardcoded: `sortBy: "createdAt"` and `sortOrder: "desc"` at line 46–47

**`AdminOrderTable`** (`apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`):

- Rendered columns: Order, Customer, Status, Payment, Total, Items, Created, Actions
- Backend-sortable columns (after TASK-147-A): Created (`createdAt`), Total (`total`), Status (`status`)
- Non-sortable: Order (UUID), Customer, Payment, Items
- URL params currently: `status`, `page` — managed via `updateParams` / `router.push`
- No sort params present

**`AdminUserTable`** (`apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx`):

- Rendered columns: (avatar), Email, Name, Role, Status, Joined, Actions
- Backend-sortable columns (after TASK-147-A): Email (`email`), Joined (`createdAt`)
- Non-sortable: Name (no DB index), Role, Status
- URL params currently: `search`, `role`, `isActive`, `page` — managed via `updateParams` / `router.replace`
- No sort params present

**URL pattern consistency note:** `AdminProductTable` and `AdminOrderTable` use `router.push` while `AdminUserTable` uses `router.replace`. For sort state, `router.replace` is preferred (sort changes should not pile up in browser history). The new `useTableSort` hook will call the table's own `updateParams` callback, which determines whether `push` or `replace` is used. Recommend standardising all three to `router.replace` as part of this work (see TASK-147-C).

**Shared table primitive:** `apps/store-admin/src/shared/ui/table.tsx` — `TableHead` is a plain `<th>` (lines 68–79) with no interactive affordance. It accepts arbitrary `className` and `...props`, so a new `SortableColumnHeader` can internally render a `TableHead` wrapping a `<button>`.

**Lucide icons:** Already available via `lucide-react ^1.14.0`. `ChevronUpIcon` and `ChevronDownIcon` are imported in `select.tsx`. `ChevronsUpDownIcon` is available from the same package and will serve as the "unsorted" indicator.

**Dictionary:** `apps/store-admin/src/shared/config/dictionary.ts` — `dict.common`, `dict.products`, `dict.orders`, `dict.users` sections cover existing column labels. New sort-related aria keys (`sortAsc`, `sortDesc`, `sortNone`, `sortByAria`) must be added to `dict.common` so they are available to `SortableColumnHeader`.

**Test harness:** `admin-order-table.test.tsx` (`apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx`) uses RTL + MSW via `renderWithProviders`/`server.use()` and mocks `next/navigation` via `jest.mock`. The same pattern is used in `order-detail-view.test.tsx` and `smoke.test.tsx`. All new tests must follow this pattern.

---

## Technical Design

### Recommended shared-component approach

**`SortableColumnHeader`** — a "dumb" UI component placed in `apps/store-admin/src/shared/ui/sortable-column-header.tsx`. It renders a `<TableHead>` with `aria-sort` and a `<button>` inside. The button shows the current sort indicator icon. No business logic, no API calls, no URL knowledge — purely presentational with a callback prop.

```
Props:
  field: string         — the backend sortBy key (e.g. "createdAt")
  label: string         — display text
  sortBy?: string       — current active sortBy from URL
  sortOrder?: 'asc' | 'desc'
  onSort: (field: string) => void  — called by the table's useTableSort.onSort
  className?: string
```

Sort cycle: clicking a column that is not currently sorted → sets it to `desc`. Clicking an already-sorted column → toggles between `asc` and `desc`. There is no "unsorted" third state for a column once it has been clicked; the `desc` default is equivalent to the initial server-side default.

**`useTableSort`** — a URL-state hook placed in `apps/store-admin/src/shared/lib/use-table-sort.ts`. Reads `sortBy` and `sortOrder` from `ReadonlyURLSearchParams`; writes via the table's own `updateParams` callback. Resets `page` to `undefined` on every sort change so the user lands on page 1.

```
Signature:
  useTableSort(
    searchParams: ReadonlyURLSearchParams,
    updateParams: (next: Record<string, string | undefined>) => void,
    defaultSortBy?: string,       // default: 'createdAt'
    defaultSortOrder?: 'asc' | 'desc'  // default: 'desc'
  ): { sortBy: string; sortOrder: 'asc' | 'desc'; onSort: (field: string) => void }
```

Note: `useTableSort` cannot be barrel-exported from `shared/lib/index.ts` for the same reason as `use-debounced-callback` (it is a `"use client"` hook). Import it directly from `@/shared/lib/use-table-sort`.

**FSD placement justification:**

- `SortableColumnHeader` has no business logic → `shared/ui/` (same layer as `Table`, `TableHead`)
- `useTableSort` is a generic URL-param utility with no domain knowledge → `shared/lib/` (same layer as `use-debounced-callback`)
- No `features/table-sort/` slice is needed; the feature is the sortable table itself, not a standalone business interaction

**a11y requirements:**

- `<th aria-sort="ascending|descending|none">` on each sortable column
- The inner `<button>` has `type="button"` (prevents accidental form submit) and `aria-label` from `dict.common.sortByAria(label)`
- Visible focus ring via `focus-visible:ring-2 focus-visible:ring-ring`
- `ChevronUpIcon` / `ChevronDownIcon` / `ChevronsUpDownIcon` are decorative (`aria-hidden="true"`)

**Only expose sortable columns whose field the backend allows.** Do not render `SortableColumnHeader` for Category, Customer, Payment, Name (users), Role, Status, Items columns.

---

## Tasks

### TASK-147-A: Backend sort support for orders and users

**Type:** feat
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** Yes — write failing unit tests for `OrderRepository.findAll` and `UserRepository.findAll` with sort params before adding the implementation
**Depends on:** none

**Acceptance Criteria:**

- [ ] `AdminOrderListQueryDto` gains optional `sortBy: string` (`@IsIn(['createdAt', 'total', 'status'])`, default `'createdAt'`) and `sortOrder: 'asc' | 'desc'` (`@IsIn(['asc', 'desc'])`, default `'desc'`) with `@ApiProperty` decorators
- [ ] `order.repository.ts` `findAll()` reads `sortBy`/`sortOrder` from `AdminOrderListQueryDto`, maps through an allow-list (`{ createdAt, total, status }`), and passes to Prisma `orderBy`; unrecognised field falls back to `createdAt` with a `logger.warn`
- [ ] `order.controller.ts` admin list action gains `@ApiQuery({ name: 'sortBy', required: false, ... })` and `@ApiQuery({ name: 'sortOrder', required: false, ... })` decorators
- [ ] `UserListQueryDto` gains the same `sortBy` (`@IsIn(['createdAt', 'email'])`, default `'createdAt'`) and `sortOrder` fields
- [ ] `user.repository.ts` `FindAllParams` interface gains optional `sortBy?: string` and `sortOrder?: 'asc' | 'desc'`; `findAll()` uses an allow-list (`{ createdAt, email }`) and passes to Prisma `orderBy`
- [ ] `user.service.ts` `findAll()` forwards `query.sortBy` and `query.sortOrder` into the `FindAllParams` struct
- [ ] `user.controller.ts` admin list action gains `@ApiQuery` decorators for `sortBy` and `sortOrder`
- [ ] Existing unit tests for both repositories remain green; new unit tests cover: sort by each allowed field asc + desc; invalid `sortBy` falls back to `createdAt` (order repo); `sortBy` not provided falls back to default
- [ ] `npm run test -w apps/store-api` passes
- [ ] `npm run build -w apps/store-api` and `npm run typecheck` pass
- [ ] Orval regen: `npm run swagger:export -w apps/store-api` + `npm run generate:api` (generated files gitignored; updated types flow into admin hooks automatically)

**Files to create/modify:**

- `apps/store-api/src/order/dto/admin-order-list-query.dto.ts` — add `sortBy`, `sortOrder` fields
- `apps/store-api/src/order/order.repository.ts` — extend `findAll()` with allow-listed `orderBy`
- `apps/store-api/src/order/order.controller.ts` — add two `@ApiQuery` decorators on admin list route
- `apps/store-api/src/user/dto/user-list-query.dto.ts` — add `sortBy`, `sortOrder` fields
- `apps/store-api/src/user/user.repository.ts` — extend `FindAllParams` interface + `findAll()` method
- `apps/store-api/src/user/user.service.ts` — forward sort params in `findAll()`
- `apps/store-api/src/user/user.controller.ts` — add two `@ApiQuery` decorators on admin list route
- `apps/store-api/src/order/order.repository.spec.ts` (or the existing spec file) — new sort-focused unit tests
- `apps/store-api/src/user/user.repository.spec.ts` — new sort-focused unit tests

---

### TASK-147-B: Shared `SortableColumnHeader` + `useTableSort`

**Type:** feat
**Scope:** store-admin / shared
**Complexity:** S (1–2h)
**TDD Required:** No (covered by TASK-147-D)
**Depends on:** none (can be parallelised with TASK-147-A)

**Acceptance Criteria:**

- [ ] `SortableColumnHeader` component renders a `<TableHead aria-sort="...">` containing a `<button type="button">` with the column label and a lucide sort icon
- [ ] When `sortBy === field`: active state — shows `ChevronUpIcon` (asc) or `ChevronDownIcon` (desc); `aria-sort` is `"ascending"` or `"descending"`
- [ ] When `sortBy !== field`: inactive state — shows `ChevronsUpDownIcon` with reduced opacity; `aria-sort` is `"none"`
- [ ] Icons are `aria-hidden="true"`; button has an `aria-label` from `dict.common.sortByAria(label)`
- [ ] `useTableSort` reads `sortBy`/`sortOrder` from `ReadonlyURLSearchParams`; clicking same field toggles asc/desc; clicking new field sets it to desc; always resets `page: undefined`
- [ ] `SortableColumnHeader` is exported from `apps/store-admin/src/shared/ui/index.ts`
- [ ] `useTableSort` must NOT be added to the `shared/lib/index.ts` barrel (same constraint as `use-debounced-callback`); exported only from its own file
- [ ] `dict.common` in `dictionary.ts` gains: `sortByAria: (col: string) => string`, `sortAsc: string`, `sortDesc: string`, `sortNone: string`
- [ ] `npm run typecheck` and `npm run lint` pass

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/sortable-column-header.tsx` — new component
- `apps/store-admin/src/shared/ui/index.ts` — add `SortableColumnHeader` export
- `apps/store-admin/src/shared/lib/use-table-sort.ts` — new hook
- `apps/store-admin/src/shared/config/dictionary.ts` — add sort aria keys to `dict.common`

---

### TASK-147-C: Wire sortable headers into all three admin tables

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2–4h)
**TDD Required:** No (covered by TASK-147-D)
**Depends on:** TASK-147-A, TASK-147-B

**Acceptance Criteria:**

- [ ] **Products table** — `AdminProductTable`: replaces `<TableHead>{dict.products.colName}</TableHead>` etc. with `<SortableColumnHeader>` for Name (`name`), Price (`price`), Created (`createdAt`); removes hardcoded `sortBy: "createdAt", sortOrder: "desc"` from line 46–47 of `admin-product-table.tsx`; reads `sortBy`/`sortOrder` from URL via `useTableSort`; passes them to the Orval hook; `updateParams` uses `router.replace` (standardise from current `push`)
- [ ] **Orders table** — `AdminOrderTable`: adds `<SortableColumnHeader>` for Created (`createdAt`), Total (`total`), Status (`status`); reads/writes sort state via URL; passes `sortBy`/`sortOrder` to `useAdminOrderControllerFindAll`; `updateParams` uses `router.replace`
- [ ] **Users table** — `AdminUserTable`: adds `<SortableColumnHeader>` for Email (`email`), Joined (`createdAt`); reads/writes sort state via URL; passes `sortBy`/`sortOrder` to `useUserControllerFindAll`; `updateParams` already uses `router.replace` (keep)
- [ ] Non-sortable columns (Category, Customer, Payment, Items, Name/users, Role, Status/users) remain plain `<TableHead>` with no affordance
- [ ] Changing sort resets page to 1 (done automatically by `useTableSort` resetting `page: undefined`)
- [ ] Sort state survives a page refresh (it lives in the URL)
- [ ] Existing filter/pagination params are preserved when sort changes (because `updateParams` merges into existing `URLSearchParams`)
- [ ] `npm run build -w apps/store-admin`, `npm run typecheck`, and `npm run lint` pass

**Files to modify:**

- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx`
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`
- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx`

---

### TASK-147-D: Tests

**Type:** test
**Scope:** store-admin / store-api
**Complexity:** M (2–4h)
**TDD Required:** Yes (backend tests written before TASK-147-A implementation; frontend tests written after TASK-147-C)
**Depends on:** TASK-147-C

**Acceptance Criteria:**

- [ ] `SortableColumnHeader` RTL tests (`sortable-column-header.test.tsx`):
  - Renders inactive state with `ChevronsUpDownIcon` and `aria-sort="none"` when field is not the current sort
  - Renders `ChevronUpIcon` and `aria-sort="ascending"` when active + asc
  - Renders `ChevronDownIcon` and `aria-sort="descending"` when active + desc
  - Calls `onSort(field)` on click
  - Button is keyboard-accessible (can be triggered with Enter/Space)
- [ ] `useTableSort` unit tests (`use-table-sort.test.ts`):
  - Returns default `sortBy`/`sortOrder` when URL params are absent
  - Toggles `sortOrder` when `onSort(currentField)` is called
  - Sets `sortBy` to new field and resets to `desc` when `onSort(differentField)` is called
  - Resets `page` to `undefined` in the `updateParams` call on every `onSort` call
- [ ] `admin-order-table.test.tsx` extended: at minimum one test verifying that a `SortableColumnHeader` renders for the Created column and that clicking it triggers the expected URL update
- [ ] `admin-product-table.test.tsx` (new or extended): verifies sort columns render and clicking a header updates the URL
- [ ] `AdminUserTable.test.tsx` (new file): verifies email and joined columns are sortable; existing filter behaviour still works
- [ ] Backend (written before TASK-147-A as Red step):
  - `OrderRepository.findAll` with `sortBy: 'total', sortOrder: 'asc'` passes `orderBy: { total: 'asc' }` to Prisma
  - `OrderRepository.findAll` with unknown `sortBy` falls back to `createdAt`
  - `UserRepository.findAll` with `sortBy: 'email', sortOrder: 'asc'` passes correct `orderBy`
  - `UserRepository.findAll` without `sortBy` defaults to `createdAt` desc
- [ ] `npm run test -w apps/store-api` and `npm run test -w apps/store-admin` pass (all tests green)

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/sortable-column-header.test.tsx` — new
- `apps/store-admin/src/shared/lib/use-table-sort.test.ts` — new
- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.test.tsx` — extend
- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.test.tsx` — new
- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.test.tsx` — new
- `apps/store-api/src/order/order.repository.spec.ts` — extend (or new if not present)
- `apps/store-api/src/user/user.repository.spec.ts` — extend (or new if not present)

---

## Migration Steps

No Prisma migrations are required — this change is purely query-parameter plumbing. No DB columns are added or changed.

The only deployment-time step is Orval regeneration, which is done as part of TASK-147-A:

```bash
npm run swagger:export -w apps/store-api
npm run generate:api
```

Generated files live in `apps/store-admin/src/shared/api/generated/` (gitignored). They must be regenerated locally before TASK-147-C begins so the TypeScript types for `useAdminOrderControllerFindAll` and `useUserControllerFindAll` include the new `sortBy`/`sortOrder` params.

---

## Cross-Task Dependencies

```
TASK-147-A (backend + Orval regen)
    ↓
TASK-147-C (wire tables)  ←  TASK-147-B (shared component — can be done in parallel with 147-A)
    ↓
TASK-147-D (tests — backend Red step precedes 147-A; frontend tests follow 147-C)
```

TASK-147-B and TASK-147-A can be developed in parallel because the shared component and hook require no backend knowledge. TASK-147-C is blocked on both being complete. The backend unit test Red step (part of TASK-147-D) must be written before the TASK-147-A implementation.

---

## Relationship to TASK-140 and TASK-115

**TASK-140** (parked) covers a broader admin-tables UX rewrite: shadcn `DataTable`, column visibility, advanced filtering, category management rethink. That work is explicitly out of scope here and remains parked. TASK-147 delivers only column sorting.

**TASK-115** (in progress) is the admin UA localization task. The new `dict.common` sort keys introduced in TASK-147-B must follow the Ukrainian string convention established there. Coordinate to avoid key conflicts if TASK-115 is actively adding keys in `dictionary.ts` at the same time.

---

## Risks and Mitigations

| Risk                                                                                                                                                    | Impact                                                              | Mitigation                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Orval regen generates TypeScript errors in existing admin code if the updated DTOs produce incompatible hook types                                      | Build breaks for store-admin                                        | Run typecheck immediately after regen (before TASK-147-C); fix any generated-type issues before wiring tables     |
| `status` sort on orders is alphabetical enum sort in Postgres (`CANCELLED < CONFIRMED < ...`), not semantic business order                              | Potentially confusing UX                                            | Document in code comment; acceptable for MVP; TASK-140 (future DataTable) can replace with a custom semantic sort |
| `router.push` → `router.replace` change in product and order tables (TASK-147-C) modifies existing navigation behaviour                                 | Could break browser back-button UX for existing search/filter flows | Only affects tables being actively reworked; apply `router.replace` consistently across all three tables          |
| Parallel development of TASK-147-A and TASK-147-B touches the same `dictionary.ts` file (TASK-147-B adds sort keys; TASK-115 may add localization keys) | Merge conflict                                                      | Communicate with whoever is working TASK-115; add sort keys at a dedicated `common.sort*` sub-namespace           |
| Backend fallback for invalid `sortBy` silently uses `createdAt` — a malformed URL param would go unnoticed in production                                | Low impact (graceful degradation)                                   | `logger.warn` is already the established pattern (mirrored from `product.repository.ts` line 326); acceptable     |
