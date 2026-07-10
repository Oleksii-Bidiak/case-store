# Plan 140 — Mobile Admin Tables & Forms (TASK-258)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · **Хвиля 5** (Адаптив/дизайн + прев'ю
> контенту + хвости)
> **Origin:** `docs/handoff-2026-07-07.md` Блок D · discovery follow-on to TASK-257 (plan 121,
> admin mobile shell); intent parked as TASK-140 ("Admin tables UX rethink"), superseded here for
> the responsive-primitive slice only (see "Relationship to parked TASK-140" below)
> **Created:** 2026-07-10
> **Last Updated:** 2026-07-10
> **BACKLOG task:** TASK-258
> **Branch:** `feature/140-admin-mobile`
> **Merge order:** **LAST** of the Wave-5 parallel groups. This branch is the designated
> adapter — see "Merge & rebase protocol" below.

## Overview

`shared/ui/table.tsx` is a byte-for-byte shadcn wrapper: a `<table>` inside an
`overflow-x-auto` div, nothing else. Every one of the ~16 admin list tables (orders, products,
users, categories, brands, discounts, pages, blog posts, blog categories, banners, device
brands, device models, subscribers, FAQ, reviews, messages, plus 3 dashboard mini-tables) hand-
writes `TableHeader`/`TableBody`/`TableRow`/`TableCell` JSX directly — there is no data-array +
column-def abstraction anywhere in this codebase to build on. On a 360–430px phone, a 6–8 column
table only offers horizontal scroll, which is unusable for anything beyond a glance (confirmed
in the TASK-257 shell audit, which explicitly deferred this to TASK-258).

Forms (`features/*/ui/*-form.tsx`) are, encouragingly, **already effectively single-column on
mobile** — every field wrapper is `flex flex-col gap-1.5`, and the only `grid-cols-2` pairings
(price/compareAtPrice, sku/category, etc.) use the `sm:` breakpoint (640px), so they collapse to
one column on anything narrower. The real gap is that the submit button sits in normal document
flow at the very bottom of a form that can run to 15+ fields (`product-form.tsx` is the longest),
so on a phone the admin has to scroll all the way down — and back up to re-check a field — every
time they want to save. **Sticky submit bar** is the actual missing piece, not column
restructuring.

Dialogs (`shared/ui/dialog.tsx`) are a fixed, centered, `sm:max-w-lg` card — fine on desktop, but
on a 360px phone a dialog with real content (e.g. `MessageDetailDialog`, the structured-spec
`attribute-definition-editor`, `product-image-manager`) is cramped inside `max-w-[calc(100%-2rem)]`
with no explicit height management. Sheets (`shared/ui/sheet.tsx`) are already `h-full` for the
`left`/`right` variants (the only variant currently used, by TASK-257's `MobileNavDrawer`), so
they need at most a light audit, not a rewrite.

The dashboard (`app/(dashboard)/dashboard-view.tsx`) is already close: `DashboardCharts` is
`grid-cols-1 lg:grid-cols-2` (1-col below `lg`, which covers every phone width) and both charts
already use recharts' `ResponsiveContainer width="100%"`. The 3 dashboard mini-tables
(`DashboardTopProductsTable`, `DashboardLastOrdersTable`, `DashboardLowStockTable`) share the
same plain-`Table` shape as every other list table, so they ride the same column-priority pass
as the rest. The one piece that genuinely needs a fresh look post-merge is the new
«Відвідуваність» (Umami) card that a concurrent Wave-5 group (plan 138, TASK-262) is adding to
this same page — this plan's dashboard audit runs **after** rebasing onto develop with that
change absorbed (see "Merge & rebase protocol").

### Relationship to the parked TASK-140

TASK-140 ("Admin tables UX rethink — shadcn sortable/filterable DataTable + category
management/visualization rethink") stays parked. This plan does **not** build a shadcn
`DataTable` (TanStack Table + column-def + row-selection + column-visibility toggles — a
multi-day rewrite touching every table's data-fetching shape) and does **not** touch category
management/visualization. It only picks up the one piece of TASK-140's intent that the Wave-5
handoff explicitly calls out as a prerequisite for this task: **"спершу мінімальний спільний
примітив... узгодити з висновком TASK-140"** — i.e. build one small, additive responsive
primitive first, instead of hand-rolling 16 separate mobile layouts. Column sorting itself
already shipped independently as TASK-147 (plan 070) and is untouched here.

## HARD SCOPE EXCLUSIONS

**MUST NOT touch the internal layout of `features/banner-form`, `features/page-form`, or
`features/blog-post-form`.** A parallel Wave-5 group (plan 137, editor/live-preview work) owns
these three forms entirely, including their own mobile behavior (they likely gain a split
editor/preview layout that this plan's generic sticky-submit wrapper would fight with). If, after
this branch's final rebase (see below), adopting the shared `FormActionsBar` in those three forms
turns out to be trivially compatible with whatever plan 137 shipped, it MAY be applied then — but
never before, and never as a blind mechanical rollout alongside the other ~13 forms.

**Dashboard 1-col/recharts audit (Task H) runs against `develop` after the rebase**, once plan 138
(TASK-262, the Umami «Відвідуваність» traffic card) has merged — that card must be included in the
audit, not treated as a pre-existing element. Do not attempt Task H before the rebase step.

## Scope

### In Scope

- One new responsive primitive layered onto the existing `shared/ui/table.tsx` (`Table`,
  `TableHeader`, `TableRow`, `TableHead`, `TableCell`, plus `SortableColumnHeader` pass-through)
  — see "Technical Design" for the exact API. Zero behavior change for any table that doesn't
  opt in (`layout` defaults to today's `"scroll"`).
- Full card-layout rollout (`layout="card"`) for the top-4 highest-traffic tables, in priority
  order: `admin-order-table.tsx` → `admin-product-table.tsx` → `message-inbox.tsx` (inline table)
  → `admin-review-table.tsx`.
- Column-priority rollout (`hideOnMobile` on 1–2 lowest-value columns per table, no layout mode
  change) for the remaining ~14 list/mini tables (see Task D's file list).
- `FormActionsBar` — a new shared sticky-submit wrapper — rolled out to every admin create/edit
  form **except** the three excluded above.
- `DialogContent` mobile sizing pass (near-full-height/width below `md`) + a `SheetContent` audit
  (confirmed already adequate for the one variant in active use; documented, not rewritten,
  unless the audit finds a real gap).
- Dashboard: confirm/adjust 1-column collapse (already `grid-cols-1 lg:grid-cols-2` for charts —
  audit, not rebuild) + `ResponsiveContainer` sanity check + the new Umami card's mobile fit,
  **after** the final rebase.
- A final rebase of this branch onto `develop` once the other Wave-5 groups have merged, resolving
  conflicts in `dictionary.ts`, `dashboard-view.tsx`, `message-inbox.tsx` (see "Merge & rebase
  protocol").
- Unit/RTL tests for the shared primitive (`table.tsx`, card-mode + `hideOnMobile` rendering) and
  the top-4 tables (card-mode assertions at a narrow viewport via `window.matchMedia`/class
  assertions — see Task B/C acceptance criteria for the exact testing strategy, since jsdom has no
  real viewport).
- `docs/manual-qa-pending.md` — one **`## TASK-258`** section appended at the end of the file (not
  edited elsewhere), listing device-level checks that automated RTL cannot cover (real-viewport
  card-layout visual check, real-device sticky-bar behavior with the on-screen keyboard open,
  dialog full-height on an actual small phone).

### Out of Scope

- A shadcn/TanStack `DataTable` rewrite (column-def arrays, row selection, column-visibility
  toggles, virtualization) — remains parked as TASK-140.
- Category management/visualization rethink — the other half of parked TASK-140, unrelated to
  responsiveness.
- Any change to `features/banner-form`, `features/page-form`, `features/blog-post-form` internals
  — hard exclusion above.
- Any change to `widgets/admin-shell/*` (sidebar/drawer/header) — already shipped by TASK-257
  (plan 121); this plan only consumes that shell, it doesn't modify it.
- Visual/design-token changes unrelated to responsiveness (colors, radii, typography scale).
- A Playwright/e2e viewport-sweep harness — `store-admin` has none (same accepted gap TASK-257
  documented); this plan's viewport verification is RTL-level (class/attribute assertions) plus a
  manual `docs/manual-qa-pending.md` entry, matching that precedent.
- Pagination/sorting/filtering behavior changes — untouched; only the table's visual layout below
  `md` changes.

## User Stories

1. As the store owner checking new orders from my phone, I want the orders table to show each
   order as a readable card (status, customer, total, date, action) instead of a table I have to
   scroll sideways through, so I can actually triage orders on the go.
2. As the store owner editing a product from my phone, I want the save button to stay reachable
   without scrolling back down through 15 fields, so editing a product on mobile isn't a chore.
3. As the store owner opening a customer message or the structured-spec editor on my phone, I want
   the dialog to use the full screen instead of a cramped centered box, so I can actually read and
   act on it.
4. As the store owner checking the dashboard from my phone, I want the traffic/revenue/orders
   cards and charts to stack in one readable column with no sideways scroll, so the at-a-glance
   view works as well on mobile as it does on desktop.

## Technical Design

### The responsive table primitive

**Decision: extend `shared/ui/table.tsx` in place** (not a new parallel component) via one new
`layout` prop on `<Table>`, threaded to its children through a small `React.Context` (no prop
drilling through every `<TableRow>`/`<TableCell>` call site), plus two new **per-cell** props
(`label`, `hideOnMobile`) that work independently of `layout`. This keeps every existing
`<Table>`/`<TableRow>`/`<TableCell>` call site source-compatible — the prop is opt-in and
defaults to today's behavior.

```ts
// shared/ui/table.tsx

type TableLayout = "scroll" | "card";

const TableLayoutContext = React.createContext<TableLayout>("scroll");

interface TableProps extends React.ComponentProps<"table"> {
  /**
   * "scroll" (default, unchanged): today's behavior — horizontal scroll inside
   * the `overflow-x-auto` wrapper, table markup untouched at any width.
   * "card": below `md`, each `TableRow` renders as a bordered/shadowed block
   * ("card") and each `TableCell` stacks with its `label` as a left-aligned
   * caption; at `md` and above, renders as a normal `<table>` (identical to
   * "scroll" mode) — the card transform is a `max-md:` variant only.
   */
  layout?: TableLayout;
}

function Table({ layout = "scroll", className, ...props }: TableProps) {
  return (
    <TableLayoutContext.Provider value={layout}>
      <div data-slot="table-container" className="relative w-full overflow-x-auto">
        <table
          data-slot="table"
          className={cn(
            "w-full caption-bottom text-sm",
            layout === "card" && "max-md:block",
            className,
          )}
          {...props}
        />
      </div>
    </TableLayoutContext.Provider>
  );
}
```

- `TableHeader` reads the context and adds `max-md:hidden` when `layout === "card"` (column
  labels move onto each cell instead — see `TableCell` below — so the header row would be
  redundant/broken as a block element on mobile).
- `TableRow` reads the context and, when `layout === "card"`, adds the card treatment:
  `max-md:mb-3 max-md:flex max-md:flex-col max-md:gap-0 max-md:rounded-lg max-md:border
max-md:border-border max-md:p-4 max-md:shadow-card max-md:last:mb-0` (exact spacing/shadow
  values are the build agent's call — match `docs/design-system.md`'s existing card conventions,
  same `shadow-card`/`rounded-lg`/`border-border` tokens every other admin card already uses).
  `hover:bg-accent`/`data-[state=selected]:bg-muted` stay as-is (harmless no-ops as block cards,
  still useful at `md`+).
- `TableCell` gains two new optional props:
  - `label?: string` — when set **and** `layout === "card"`, the cell renders as
    `max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:border-b
max-md:border-border/60 max-md:px-0 max-md:py-1.5 max-md:last:border-b-0` with a
    `before:content-[attr(data-label)]` pseudo-element styled as a small uppercase muted caption
    (`max-md:before:shrink-0 max-md:before:text-xs max-md:before:font-medium
max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-muted-foreground`),
    fed by a plain `data-label={label}` attribute on the `<td>` (CSS `attr()` returns an empty
    string when the attribute is absent, so cells with no `label` never render bogus "undefined"
    captions).
  - `hideOnMobile?: boolean` — independent of `layout`: adds `hidden md:table-cell` regardless of
    "scroll" or "card" mode. This is the column-priority mechanism for tables that stay in
    `"scroll"` mode (Task D) — a plain visibility toggle needing no card markup at all.
  - A cell with **no** `label` in card mode (e.g. an avatar-only column, or an actions column that
    reads fine unlabeled) simply stacks without a caption — acceptable and expected, not an error
    state; call sites choose per-cell whether a label adds value.
- `TableHead` gains the same `hideOnMobile?: boolean` prop (`hidden md:table-cell`), used both by
  plain `<TableHead>` and threaded through `SortableColumnHeader` (new optional
  `hideOnMobile?: boolean` prop on `SortableColumnHeaderProps`, forwarded to the underlying
  `<TableHead>` — the sortable button's own markup is untouched).
- **No new dictionary strings are needed for the primitive itself** — every `label` passed to a
  migrated `TableCell` reuses the column's own existing header dict string (e.g.
  `label={dict.orders.colStatus}`, `label={dict.common.actions}`), the exact same value already
  passed to that column's `<TableHead>`/`<SortableColumnHeader>`. If a rollout task needs new copy
  it's called out explicitly in that task's acceptance criteria and appended as a **new**
  dictionary namespace block (per the constraint below), not interleaved into `orders`/`products`/
  etc. (other Wave-5 groups may be editing those same blocks concurrently).

### Rollout pattern (top-4, card layout)

For each of the 4 tables, the mechanical change per row is:

1. `<Table>` → `<Table layout="card">`.
2. Every `<TableCell>` in the body gains `label={<the same dict string used by that column's
TableHead>}`. Cells that are purely decorative/redundant in card view (e.g. `AdminUserTable`'s
   avatar-circle first cell) may omit `label` and rely on the unlabeled stack — build agent's call
   per cell, consistent with how `UserDetailView` (plan 135) left small markup decisions to
   implementation.
3. The trailing actions cell (`<TableCell className="text-right">` in every table today) keeps
   `label={dict.common.actions}` but its `text-right` alignment is desktop-only — add
   `max-md:text-left` (or drop `text-right` in favor of a card-mode-aware class) so the action
   button doesn't visually orphan itself against the right edge of a full-width card row; exact
   spacing is implementation's call.
4. No change to the `<TableHeader>`/`<TableHead>` row content — it already hides itself via the
   primitive's `layout="card"` handling; sortable headers keep working identically at `md`+.
5. `isFetching` overlay, pagination controls, empty/error states — untouched (already flex/block
   elements outside the `<table>`, unaffected by the card transform).

`message-inbox.tsx`'s inline table follows the exact same pattern (it already imports
`Table`/`TableBody`/etc. from `@/shared/ui` — no new import needed, just the `layout="card"` prop
and per-cell `label`s).

### Rollout pattern (remaining ~14, column-priority)

No `layout` prop change (stays `"scroll"`, i.e. today's `overflow-x-auto` fallback — a table
scrolling inside its own bounded container is explicitly acceptable per TASK-257's precedent).
Per table, add `hideOnMobile` to the **1–2 lowest-priority columns** (both the `<TableHead>`/
`<SortableColumnHeader>` and its matching `<TableCell>`) — the general heuristic: keep the primary
identifier (name/email/code), the primary status/badge column, and the actions column always
visible; hide secondary metadata (creation/join dates, redemption counts, SKU, category name where
a status badge already conveys the essential state). Exact column choice per table is the build
agent's call, applying this heuristic — not exhaustively prescribed here (matches this project's
established convention of leaving per-table markup judgment calls to implementation, e.g. plan 135
§"Stat row"/"Recent orders" wording).

### `FormActionsBar` (sticky submit)

New shared component, `shared/ui/form-actions-bar.tsx`:

```tsx
export function FormActionsBar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Below md: sticks to the bottom of the nearest scrolling ancestor
        // (admin-shell's `<main className="overflow-y-auto ...">`), with a
        // translucent/blurred background so content scrolling underneath it
        // doesn't visually collide with the button. At md+: reverts to a
        // plain static block — desktop's existing bottom-of-form appearance
        // is byte-for-byte unchanged.
        "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur supports-[backdrop-filter]:max-md:bg-background/80",
        className,
      )}
      {...props}
    />
  );
}
```

(`-mx-4` cancels `<main>`'s `p-4` mobile padding so the bar bleeds edge-to-edge, matching the
`admin-shell` `p-4 lg:p-6` convention from TASK-257 — the bar is only sticky below `md`, and
`<main>` is still `p-4` at every width below `lg`, so the cancel value is consistent across the
whole sticky range.) Exact Tailwind values (blur strength, z-index) are the build agent's call;
the load-bearing contract is: **sticky + bottom-0 below `md`, static above `md`, no visual change
to the desktop form at all**.

Every non-excluded form file gets exactly one mechanical change: the trailing
`<div><Button type="submit">...</Button></div>` block becomes
`<FormActionsBar><Button type="submit">...</Button></FormActionsBar>` (forms with an extra
"Cancel"/secondary button in that row, if any, are wrapped the same way — both buttons inside one
`FormActionsBar`). No column/grid restructuring anywhere in these files — as established in the
Overview, they are already single-column below `sm` (640px).

### Dialog mobile sizing

`DialogContent`'s base classes gain a `max-md:` block that turns the fixed centered card into a
near-full-screen sheet-like surface on phones, while leaving every class above `md:` (the existing
`sm:max-w-lg` etc.) untouched:

```
max-md:inset-4 max-md:top-4 max-md:left-4 max-md:h-[calc(100%-2rem)] max-md:w-[calc(100%-2rem)]
max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-y-auto
```

This is a base-component change (not per-call-site), so all three real dialog consumers
(`message-detail-dialog.tsx`, `attribute-definition-editor.tsx`, `product-image-manager.tsx`)
inherit it automatically — no per-file changes needed unless one of them has a hardcoded
`max-w-*`/`w-*` override on its own `DialogContent` that fights the new mobile sizing (audit and
fix if found).

`SheetContent`'s `left`/`right` variants are already `inset-y-0 ... h-full`
(edge-to-edge full height) — genuinely nothing to change there. `top`/`bottom` variants are
`h-auto` (content-sized, no current consumer) — leave as-is unless the audit finds a real
call site that needs full-height; document the finding either way.

### Dashboard (Task H — post-rebase only)

- `AdminDashboardStats`, `NeedsActionWidget`, `DashboardCharts`, the 3 dashboard mini-tables, and
  the quick-actions button row are audited at 360/390/768px for a single readable column and no
  page-level horizontal scroll (mirrors TASK-257-C's exact acceptance-criteria style).
- `RevenueTrendChart`/`OrdersByStatusChart` already use `ResponsiveContainer width="100%"
height={240}` — confirm the fixed `height={240}` still reads fine in a full-width single-column
  mobile card (it should — height is independent of the 1-col/2-col grid collapse); no code change
  expected unless the audit finds a real overflow.
- The new Umami «Відвідуваність» card (plan 138 / TASK-262, merged into `develop` before this task
  runs) is included in the 1-col audit and fixed the same way as any other dashboard element if it
  doesn't already collapse cleanly.

### Merge & rebase protocol

This branch is the **designated adapter** for Wave 5 — it is expected to finish last and absorb
whatever the sibling Wave-5 groups changed:

- **plan 136** (message-inbox profile link) — touches `message-inbox.tsx`. Expected conflict: this
  plan's Task C also touches that file (`layout="card"` + per-cell `label`s). Resolve by keeping
  both changes — the profile-link addition is presumably a new cell/action, not a structural
  rewrite of the table shape, so it should thread into the card-mode cells the same way any other
  cell does (add its own `label` if it becomes a labeled cell).
- **plan 137** (banner/page/blog editor previews) — touches `features/banner-form`,
  `features/page-form`, `features/blog-post-form`. This plan makes **zero** changes to those three
  files (hard exclusion above), so no conflict is expected; if plan 137's diff happens to touch
  `dictionary.ts` in a way that collides with this plan's additions, resolve by keeping both
  namespace blocks (see dictionary constraint below).
- **plan 138** (Umami traffic card, TASK-262) — touches `dashboard-view.tsx` (adds the new card)
  and possibly `entities/dashboard`. Task H (dashboard audit) explicitly waits for this to land in
  `develop` before running, so the rebase should pull plan 138's `dashboard-view.tsx` changes in
  cleanly (this plan's own `dashboard-view.tsx` touch, if any beyond the audit, is additive
  spacing/class tweaks, not a structural rewrite).
- **`dictionary.ts`** — near-certain conflict surface since Wave-5 siblings likely all append their
  own namespace blocks to the same file. This plan appends new strings (if any end up being
  needed — see "No new dictionary strings" note above; expected to be **zero or near-zero**) as
  their own new top-level block near the end of the object, never interleaved into per-page blocks
  (`orders`, `products`, `users`, etc.) that a sibling group might also be editing. Resolve
  conflicts by keeping every sibling's block — this is an append-only file for this kind of change.

**Sequencing:** Tasks A–F (primitive, top-4 rollout, remaining-tables rollout, forms, dialogs) can
all be implemented and tested against `develop` as it stood when this branch was cut — they touch
no file that a sibling Wave-5 group is expected to own structurally (message-inbox.tsx is the one
overlap, handled above). **Task G (the actual rebase)** runs once the other Wave-5 groups have
merged. **Task H (dashboard audit)** runs strictly after Task G, against the post-rebase tree.

## Tasks

### TASK-258-A: Responsive table primitive (`shared/ui/table.tsx`)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — a layout/markup primitive, not business logic; fully covered by the RTL
acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `Table` gains `layout?: "scroll" | "card"` (default `"scroll"`), provided to children via a
      new `TableLayoutContext`; `"scroll"` mode renders byte-for-byte identical markup/classes to
      today (no regression to any of the 16 existing call sites, none of which pass `layout` yet).
- [ ] `TableHeader` adds `max-md:hidden` only when `layout === "card"`.
- [ ] `TableRow` adds the card treatment (bordered/shadowed block, `flex flex-col`) only when
      `layout === "card"`; unaffected in `"scroll"` mode.
- [ ] `TableCell` gains `label?: string` (renders `data-label` + the `before:content-[attr(...)]`
      caption, active only when `layout === "card"` **and** `label` is set) and
      `hideOnMobile?: boolean` (`hidden md:table-cell`, works in **both** layout modes,
      independent of `layout`).
- [ ] `TableHead` gains `hideOnMobile?: boolean` (`hidden md:table-cell`).
- [ ] `SortableColumnHeader` gains `hideOnMobile?: boolean`, forwarded to its internal `TableHead`.
- [ ] A cell with no `label` in card mode renders with no caption artifact (no literal "undefined"
      text, no stray empty pseudo-element with visible padding/border) — asserted by a unit test.
- [ ] New `table.test.tsx` (or extends an existing one if present) covers: `layout="card"` renders
      the `max-md:` card classes on `TableRow`/hidden classes on `TableHeader`; a `label`ed
      `TableCell` renders `data-label` with the given text; `hideOnMobile` adds `hidden
md:table-cell` in both layout modes; default (`layout` omitted) matches the pre-change snapshot
      of classes on `Table`/`TableRow`/`TableCell` (regression guard for every un-migrated table).
- [ ] `dict.common.actions` reused as-is for actions-column labels — no new dictionary entries
      required by this task.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- table.test`.

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/table.tsx` — `layout` prop, context, `label`/`hideOnMobile`
- `apps/store-admin/src/shared/ui/sortable-column-header.tsx` — `hideOnMobile` pass-through
- `apps/store-admin/src/shared/ui/table.test.tsx` — new/extended

---

### TASK-258-B: Card-layout rollout — Orders + Products tables

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-258-A

**Acceptance Criteria:**

- [ ] `admin-order-table.tsx`: `<Table layout="card">`; every body `<TableCell>` gets a `label`
      reusing that column's existing header dict string (`dict.orders.colOrder`/`colCustomer`/
      `colStatus`/`colPayment`/`colTotal`/`colItems`/`colCreated`); actions cell keeps
      `label={dict.common.actions}`; tabs/status-filter/pagination controls untouched.
- [ ] `admin-product-table.tsx`: same pattern with `dict.products.col*` labels (name, category,
      price, status, stock, created); the stock cell's compound "free / reserved / physical"
      display (TASK-254) stays intact under its single label.
- [ ] Both files' existing tests (`admin-order-table.test.tsx`, `admin-product-table.test.tsx`)
      still pass unmodified in assertions (only render-target/markup changes, not query
      logic/behavior).
- [ ] New test coverage: at least one new assertion per file confirming `layout="card"` is passed
      (e.g. `container.querySelector('[data-slot="table"]')` has the card-mode class, or a
      shallower "renders with the new prop" smoke assertion) — exact assertion style matches
      whatever `table.test.tsx` (Task A) establishes as the convention.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- admin-order-table admin-product-table`.

**Files to create/modify:**

- `apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`
- `apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx`
- Their `.test.tsx` files as needed

---

### TASK-258-C: Card-layout rollout — Messages + Reviews tables

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-258-A

**Acceptance Criteria:**

- [ ] `message-inbox.tsx`'s inline table: `<Table layout="card">`; cells labeled with
      `dict.messages.col*` (name, topic, message, status, date); actions ("Open") cell labeled
      `dict.common.actions`. **This file is a documented rebase-conflict surface with plan 136**
      (see "Merge & rebase protocol") — keep this in mind while implementing, but do not defer the
      change; the conflict is resolved at Task G, not avoided here.
- [ ] `admin-review-table.tsx`: `<Table layout="card">`; cells labeled with `dict.reviews.col*`
      (product, author, rating, comment, date); the conditional actions column (approve/reject,
      pending-only) keeps `label={dict.common.actions}` when rendered.
- [ ] Existing tests for both files pass unmodified in assertions.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- message-inbox admin-review-table`.

**Files to create/modify:**

- `apps/store-admin/src/widgets/message-inbox/ui/message-inbox.tsx`
- `apps/store-admin/src/widgets/review-moderation/ui/admin-review-table.tsx`
- Their `.test.tsx` files as needed

---

### TASK-258-D: Column-priority rollout — remaining tables

**Type:** feat
**Scope:** store-admin
**Complexity:** L (4-8h) — mechanical but touches many files
**TDD Required:** No
**Depends on:** TASK-258-A

**Acceptance Criteria:**

- [ ] Every table below gets `hideOnMobile` added to its 1–2 lowest-priority column pairs
      (`TableHead`/`SortableColumnHeader` + matching `TableCell`), per the heuristic in Technical
      Design (keep primary identifier + status + actions visible; hide secondary metadata):
  - [ ] `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx`
  - [ ] `apps/store-admin/src/widgets/category-list/ui/admin-category-table.tsx`
  - [ ] `apps/store-admin/src/widgets/brand-list/ui/admin-brand-table.tsx`
  - [ ] `apps/store-admin/src/widgets/discount-list/ui/admin-discount-table.tsx`
  - [ ] `apps/store-admin/src/widgets/page-list/ui/admin-page-table.tsx`
  - [ ] `apps/store-admin/src/widgets/blog-post-list/ui/blog-post-table.tsx`
  - [ ] `apps/store-admin/src/widgets/blog-category-list/ui/blog-category-table.tsx`
  - [ ] `apps/store-admin/src/widgets/product-group-list/ui/admin-product-group-table.tsx`
  - [ ] `apps/store-admin/src/widgets/banner-list/ui/admin-banner-table.tsx`
  - [ ] `apps/store-admin/src/widgets/device-brand-list/ui/device-brand-table.tsx`
  - [ ] `apps/store-admin/src/widgets/device-model-list/ui/device-model-table.tsx`
  - [ ] `apps/store-admin/src/widgets/subscriber-list/ui/AdminSubscriberTable.tsx`
  - [ ] `apps/store-admin/src/widgets/faq-list/ui/faq-list.tsx`
  - [ ] `apps/store-admin/src/widgets/dashboard-top-products/ui/DashboardTopProductsTable.tsx`
  - [ ] `apps/store-admin/src/widgets/dashboard-last-orders/ui/DashboardLastOrdersTable.tsx`
  - [ ] `apps/store-admin/src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.tsx`
- [ ] None of these tables change `layout` (stay `"scroll"`, i.e. horizontal-scroll fallback
      preserved for anything still off-screen) — this task only adds `hideOnMobile`.
- [ ] Existing tests for all touched files pass unmodified in assertions (a `hideOnMobile` column
      is still rendered in jsdom, just visually hidden via CSS — RTL queries by role/text still
      find it, so no test should need to change unless it specifically asserts on class lists).
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin` (full suite — this task's blast radius is
      wide enough to warrant a full run rather than a scoped one).

**Files to create/modify:**

- The 16 files listed above (`hideOnMobile` additions only)

---

### TASK-258-E: `FormActionsBar` + rollout to admin forms

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** — (independent of A–D; can run in parallel within this branch)

**Acceptance Criteria:**

- [ ] New `apps/store-admin/src/shared/ui/form-actions-bar.tsx` exports `FormActionsBar` exactly
      as specified in Technical Design: sticky + `bottom-0` below `md`, static/no-op above `md`,
      zero visual change to the existing desktop form-submit row.
- [ ] `index.ts` barrel-exports `FormActionsBar`.
- [ ] Every admin form **except** `banner-form.tsx`, `page-form.tsx`, `blog-post-form.tsx`
      (hard exclusion) has its trailing submit-button `<div>` replaced with `<FormActionsBar>`:
  - [ ] `features/product-form/ui/product-form.tsx`
  - [ ] `features/seo-settings-form/ui/seo-settings-form.tsx`
  - [ ] `features/category-form/ui/category-form.tsx`
  - [ ] `features/faq-form/ui/faq-form.tsx`
  - [ ] `features/attribute-definition-editor/ui/attribute-definition-form.tsx`
  - [ ] `features/device-model-form/ui/device-model-form.tsx`
  - [ ] `features/device-brand-form/ui/device-brand-form.tsx`
  - [ ] `features/brand-form/ui/brand-form.tsx`
  - [ ] `features/blog-category-form/ui/blog-category-form.tsx`
  - [ ] `features/site-contact-form/ui/site-contact-form.tsx`
  - [ ] `features/discount-form/ui/discount-form.tsx`
  - [ ] `features/product-group-form/ui/product-group-form.tsx`
  - (`features/admin-auth/ui/login-form.tsx` is explicitly **excluded** too — a short,
    above-the-fold login form has no scroll-to-submit problem; wrapping it would be a no-op at
    best and a visual regression at worst if the login card itself isn't the scrolling ancestor.)
- [ ] No form's field layout (grid/flex column structure) changes — this task touches only the
      trailing action-button block in each file.
- [ ] Existing tests for every touched form pass unmodified in assertions (submit-button
      `getByRole("button", { name: ... })` queries are unaffected by the wrapping `<div>` swap).
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin`.

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/form-actions-bar.tsx` — new
- `apps/store-admin/src/shared/ui/index.ts` — export addition
- The 12 form files listed above

---

### TASK-258-F: Dialog mobile sizing + Sheet audit

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `DialogContent` base classes gain the `max-md:` block from Technical Design (near-full-height
      /width below `md`, untouched at `md`+).
- [ ] Audit `message-detail-dialog.tsx`, `attribute-definition-editor.tsx`,
      `product-image-manager.tsx` for any hardcoded `className` override on their own
      `DialogContent` that would fight the new mobile sizing (e.g. a fixed `max-w-*`/`w-*`) — fix
      any found so the mobile sizing actually takes effect; if none are found, note that in the
      PR/commit description, no code change needed for those three files beyond the base component.
- [ ] `SheetContent` audited: confirm `left`/`right` variants remain `h-full` (no change expected);
      document the `top`/`bottom` variants' current `h-auto` behavior as acceptable (no active
      consumer) rather than silently leaving it unverified.
- [ ] Existing dialog-related tests (`message-detail-dialog` tests, any dialog RTL specs) pass
      unmodified in assertions.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin`.

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/dialog.tsx`
- Any of the 3 dialog-consumer files, only if the audit finds a fighting override

---

### TASK-258-G: Final rebase onto `develop` (Wave-5 adapter)

**Type:** chore
**Scope:** store-admin
**Complexity:** M (2-4h) — conflict-resolution effort is unpredictable by nature
**TDD Required:** No
**Depends on:** TASK-258-A, -B, -C, -D, -E, -F (all in-branch work must be done first); externally
depends on the other Wave-5 parallel groups (message-inbox profile link, editor previews, Umami
traffic card) having already merged into `develop`.

**Acceptance Criteria:**

- [ ] `git fetch`/rebase (or merge, whichever this repo's actual Wave-5 integration convention
      turns out to be — coordinate with whoever is orchestrating the merge order) pulls in every
      other Wave-5 group's changes.
- [ ] Conflicts in `dictionary.ts` resolved by keeping every sibling block (append-only merge, no
      block deleted).
- [ ] Conflicts in `message-inbox.tsx` resolved by keeping both the profile-link addition and this
      plan's `layout="card"` + per-cell `label`s (see Technical Design's guidance on how to thread
      them together).
- [ ] Conflicts in `dashboard-view.tsx` resolved by keeping the new Umami card intact, ready for
      Task H's audit.
- [ ] `features/banner-form`, `features/page-form`, `features/blog-post-form` are confirmed
      untouched by this branch's own history (the hard exclusion held) — any conflict here belongs
      entirely to the other branch's changes and should resolve trivially (take theirs).
- [ ] Post-rebase: `npm run build`/`lint`/`typecheck` clean for store-admin; full
      `npm run test -w apps/store-admin` green.
- [ ] Post-rebase: a quick smoke pass confirms the top-4 card tables, the sticky form bar, and the
      full-height dialogs still render correctly against the now-merged `develop` (no visual
      regression from the merge itself).

**Files to create/modify:**

- Whatever the conflict resolution touches — not predictable in advance; this task is process, not
  a fixed file list.

---

### TASK-258-H: Dashboard 1-col + recharts audit (post-rebase)

**Type:** test
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-258-G

**Acceptance Criteria:**

- [ ] Manual smoke pass (same convention as TASK-257-C — no Playwright harness in store-admin) at
      360/390/768/1024px on `/` (dashboard): `NeedsActionWidget`, `AdminDashboardStats`, the new
      Umami «Відвідуваність» card (plan 138), `DashboardCharts` (both charts), the 3 dashboard
      mini-tables, and the quick-actions button row all render in a single readable column below
      `lg`, with **no page-level horizontal scroll**
      (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`) at any of
      those widths — a table scrolling inside its own bounded container remains acceptable.
- [ ] `RevenueTrendChart`/`OrdersByStatusChart` confirmed legible at 360px width (axis labels not
      overlapping/clipped) — if the audit finds a real overflow, a minimal fix (e.g. reducing
      `YAxis width` or `tick fontSize` at small viewports) is applied; if no issue is found, no
      code change, document the confirmation.
- [ ] Any residual finding genuinely out of this plan's scope is logged to
      `docs/manual-qa-pending.md`'s `## TASK-258` section (see below) rather than blocking this
      task.
- [ ] `npm run build` clean for store-admin (confirms no regression from any fix applied here).

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-charts/ui/RevenueTrendChart.tsx` — only if the audit
  finds a real overflow
- `apps/store-admin/src/widgets/dashboard-charts/ui/OrdersByStatusChart.tsx` — only if the audit
  finds a real overflow
- `docs/manual-qa-pending.md` — append findings under the `## TASK-258` section (see below)

## `docs/manual-qa-pending.md` entry

At the end of this plan's implementation, append **one** new section at the end of
`docs/manual-qa-pending.md` (do not edit any existing section):

```
## TASK-258

- [ ] Real-device check: card-layout tables (orders/products/messages/reviews) on an actual phone
      — jsdom/RTL confirms the markup and classes are correct, but not sub-pixel rendering.
- [ ] Real-device check: sticky FormActionsBar with the on-screen keyboard open (mobile Safari/
      Chrome keyboard can shift the visual viewport in ways jsdom cannot simulate).
- [ ] Real-device check: DialogContent full-height sizing on a small phone (safe-area insets,
      notch clearance).
- [ ] Any residual finding from TASK-258-H's dashboard audit that wasn't fixed inline.
```

(Exact wording/checklist items are the build agent's call — this is a template, not a literal
copy-paste requirement; keep it in the file's existing Ukrainian-checklist style, matching the
`## TASK-257`-style sections already in that file.)

## Migration Steps

1. TASK-258-A (primitive) — no dependencies, start immediately.
2. TASK-258-B, -C, -D can run in any order once A lands (all depend only on A); -E and -F are
   fully independent of A–D and of each other.
3. TASK-258-G (rebase) — gated externally on the other Wave-5 groups merging into `develop`; do
   not start until that has happened, regardless of how far ahead A–F are.
4. TASK-258-H (dashboard audit) — strictly after G.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout="card"`'s CSS-only card transform (no JS) means jsdom/RTL can assert _classes_ are present but not that the visual result actually looks like a card at a real 360px width                                                                      | Accepted, same gap TASK-257 already documented for the whole admin app (no Playwright harness); real-viewport verification moves to `docs/manual-qa-pending.md` per this plan's dedicated `## TASK-258` section                                                                                |
| 16-table column-priority rollout (Task D) is mechanically simple but touches many files in one task, raising merge-conflict surface with itself if the branch is long-lived                                                                             | Kept as a single task deliberately (all touches are additive `hideOnMobile` props, no structural rewrite per file) rather than splitting into 16 tiny tasks that would multiply plan overhead for no real benefit                                                                              |
| `message-inbox.tsx` is a genuine two-way conflict with the concurrent plan-136 group (both branches touch the same file)                                                                                                                                | Explicitly called out in Technical Design + Task C + Task G; resolved at the rebase step, not avoided                                                                                                                                                                                          |
| `FormActionsBar`'s `sticky bottom-0` relies on `<main>`'s `overflow-y-auto` (from TASK-257's `admin-shell.tsx`) being the nearest scrolling ancestor — if a future refactor changes that container's overflow behavior, the bar silently stops sticking | Documented in the component's own code comment (see Technical Design); no runtime guard is added since detecting "wrong scrolling ancestor" generically is not practical, and this project has no other scrolling container between `<main>` and a form today                                  |
| `DialogContent`'s new `max-md:` sizing is a base-component change affecting all current AND future dialog consumers project-wide, not just the 3 known ones                                                                                             | Deliberate — full-height mobile dialogs are the correct default for this app's dialog usage pattern (moderate-to-long content, not tiny confirm-prompts); the 3 known consumers are audited explicitly in Task F, and any future dialog inherits the same (desirable) mobile behavior for free |
| Task H (dashboard audit) depends on an external branch (plan 138) merging first — if that branch is delayed, this plan's completion is blocked on it                                                                                                    | Accepted, matches the explicit sequencing instruction from the orchestrating brief; Tasks A–G do not depend on plan 138 and can complete independently, so only the final task is exposed to that external dependency                                                                          |

## Notes

- **On BACKLOG's `[M]` complexity tag vs. this plan's 8 subtasks summing to noticeably more than
  one "M"** — the same pattern TASK-252 (also tagged `[M]` in BACKLOG, plan 135) followed: a single
  BACKLOG-level estimate covers the feature's _conceptual_ size, while the plan decomposes it into
  independently-completable, independently-testable subtasks whose complexities are estimated on
  their own terms. Not a discrepancy to "fix" — BACKLOG.md itself is not edited by this plan.
- **Reused dictionary strings, near-zero new copy** — deliberate design outcome, not an oversight:
  every card-mode `label` reuses an existing column-header string, and neither `FormActionsBar` nor
  the `DialogContent` mobile sizing introduce new visible copy. If implementation discovers a real
  need for new strings (e.g. a card-mode-only caption that has no existing header equivalent), add
  it as its own new dictionary namespace block per the constraint in "Merge & rebase protocol" —
  never interleaved into a per-page block a sibling group might be concurrently editing.
- **Parked TASK-140's category-management/visualization half remains fully open** — nothing in this
  plan advances it; a future task would need its own discovery pass.
