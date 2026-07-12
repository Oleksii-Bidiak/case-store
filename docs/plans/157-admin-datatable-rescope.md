# План 157 — TASK-140 re-scope memo (discovery-only)

> **Discovery-only.** This is a MEMO, not an implementation plan. It contains no task
> breakdown and no acceptance criteria for code. Nothing here is approved work. Produced by
> the read-only architect during Late Wave 2 (see `docs/plans/152-late-wave-2-orchestration.md`).
> **The owner decides the disposition of TASK-140 after the wave.** No files were changed and
> no code was written to produce this memo.

## 0. TL;DR

TASK-140 ("Admin tables UX rethink") was written before TASK-147 (column sorting),
TASK-192 (admin redesign), TASK-258 (mobile card-mode tables) and TASK-276 (card-mode a11y
group semantics) shipped. Those four tasks delivered essentially everything the original
"rethink" was meant to achieve, in a shared primitive (`shared/ui/table.tsx`) that all the
tables already consume.

What nominally remains splits into two unrelated pieces:

1. **A TanStack Table / "DataTable" rewrite of the ~21 hand-written admin tables.** Assessed
   below as **negative ROI today**: sorting, pagination and filtering are all already
   server-side and URL-driven; there is no row-selection / bulk-actions requirement anywhere;
   and a column-def abstraction would have to re-implement the freshly-shipped card-mode +
   a11y plumbing (high regression risk on 258/276) for zero user-visible gain.
2. **A "rethink of category management/visualization."** This is the one piece with real,
   un-delivered user value — but it is a category-UX feature (tree view + drag
   reorder/reparent), not a table-library migration, and does not need TanStack.

**Recommendation:** split TASK-140 → **close** the DataTable-rewrite portion as superseded;
**re-scope** the category-management rethink into its own small, separately-prioritized task;
optionally **park** a narrow "TanStack pilot" idea that only unlocks if/when bulk selection
becomes a genuine requirement.

## 1. What actually shipped (why the original scope is stale)

- **TASK-147** — URL-driven column sorting via `shared/lib/use-table-sort.ts`
  (`useTableSort`) + a shared `SortableColumnHeader`. Sort state lives in the query string
  (`?sortBy=&sortOrder=`), survives refresh, is shareable, and is **server-side** (passed to
  the Orval hook, executed in Postgres).
- **TASK-192** — admin restyled to the storefront design language, including the shared
  `table`/`badge` primitives, semantic status/stock colors, `shadow-card`, tabular-nums.
- **TASK-258** — mobile card-mode: `Table` gained `layout="scroll" | "card"`, plus
  `hideOnMobile` on head/cell and a `label` caption on cells. Below `md` a card renders each
  row as a stacked block; at `md+` it is byte-identical to scroll mode (a pure `max-md:` CSS
  transform).
- **TASK-276** — card-mode a11y: `TableRow` gained `rowLabel`; card rows expose
  `role="group"` + `aria-label` gated on a live media query (because card mode is a CSS-only
  transform, a static role would clobber the native `<tr>` role at `md+`), plus sr-only cell
  labels.

Net: the shared primitive already solves the three things a "table UX rethink" normally
targets — sorting, responsive/mobile, and a11y. The BACKLOG row itself already says
"largely superseded by TASK-147/192".

## 2. Table survey (the concrete surface)

Every admin table consumes the shared primitive from `@/shared/ui` (re-exported from
`apps/store-admin/src/shared/ui/table.tsx`). No table bypasses it; there are no rogue raw
`<table>` renderers. Counts below are of production renderers (skeletons excluded).

**~21 list / data tables** (one `<Table>` render each):

| Widget                                                                            | Search    | Filters                                                          | Sort (server)                        | Pagination  | Card mode          | Per-row mutations / quirks                                                                 |
| --------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- | ------------------------------------ | ----------- | ------------------ | ------------------------------------------------------------------------------------------ |
| product-list (`admin-product-table`)                                              | yes       | —                                                                | **yes** (name/price/stock/createdAt) | yes         | **yes** + rowLabel | status toggle; compound stock "free/reserved/physical" cell                                |
| order-list (`admin-order-table`)                                                  | —         | status Select + lifecycle **Tabs** + `unpaidInTransit` deep-link | **yes** (status/total/createdAt)     | yes         | **yes** + rowLabel | badges; customer sub-lines; truncated ids                                                  |
| user-list (`AdminUserTable`)                                                      | debounced | role Select + isActive Select                                    | **yes** (email/createdAt)            | yes         | —                  | avatar cell; role/status badges                                                            |
| category-list (`admin-category-table`)                                            | yes       | —                                                                | fixed `sortOrder asc`                | yes         | —                  | in-memory parent-name Map; status toggle                                                   |
| review-moderation (`admin-review-table`)                                          | —         | —                                                                | —                                    | yes         | **yes** + rowLabel | moderation actions                                                                         |
| message-inbox                                                                     | —         | —                                                                | —                                    | yes         | **yes** + rowLabel | read/unread                                                                                |
| brand-list, device-model-list, discount-list, addon-service-list, subscriber-list | yes       | some                                                             | —                                    | yes         | —                  | bespoke cells                                                                              |
| blog-post-list, page-list                                                         | —         | —                                                                | —                                    | yes         | —                  | publish lifecycle                                                                          |
| banner-list, blog-category-list, device-brand-list, product-group-list            | —         | —                                                                | —                                    | mostly none | —                  | `sortOrder` shown **read-only**; reordering is done by editing the number in the edit form |
| faq-list                                                                          | —         | —                                                                | —                                    | **none**    | —                  | inline toggle + delete mutations; not paginated                                            |

**3 dashboard mini-tables** (read-only, no sort/filter/pagination):
`dashboard-last-orders`, `dashboard-low-stock`, `dashboard-top-products`.

**2 detail line-item tables** (not list tables): `order-detail-view`,
`user-detail/UserDetailView` — use table markup for an order's line items / a user's order
history.

Total `<Table>` render sites ≈ **26** (21 list + 3 dashboard + 2 detail). The original
"~16 handwritten tables" is a rough undercount of the list tables.

**Cross-cutting facts that decide the TanStack question:**

- **Sorting is server-side** and used by only **3** tables (product, order, user) via a
  single shared `useTableSort` + `SortableColumnHeader`. Client-side sorting (TanStack's
  headline feature) would be **wrong** for paginated data — it would only reorder the current
  page. So any TanStack adoption would run in `manualSorting` mode and gain nothing over the
  existing hook.
- **Pagination is server-side** (`page`/`limit` → `meta.totalPages`), identical Prev/Next
  block copy-pasted across tables. TanStack `manualPagination` would just wrap the same state.
- **Filtering is server-side and bespoke per table** (status tabs + CSV `status`, role/status
  Selects, `unpaidInTransit` deep-link, debounced search). These map to _server_ params, not
  to TanStack's generic column-filter model.
- **There is no row selection and no bulk action anywhere** in the admin. TanStack's genuine
  differentiator — its selection/row-model — would be **net-new feature work**, not a rewrite.
- **Cells are heavily bespoke**: badges, inline toggles (product/category status, faq
  activate/delete), avatars, compound stock display, customer sub-lines, truncated
  mono ids, per-row `Link` actions. A `columns[]`-def abstraction fights all of these.

## 3. What a TanStack rewrite would buy today — and cost

**Buys (today, with 147/192/258/276 shipped):**

- Nothing user-visible. Sorting, pagination, filtering already work.
- Marginal internal tidiness: header/sort wiring — but that is _already_ centralized in
  `useTableSort` + `SortableColumnHeader`, so the consolidation win is small.
- A _latent_ capability: if bulk selection / bulk actions are ever wanted, TanStack's
  row-selection model is the right tool. But that is a **future feature**, not this rewrite,
  and would land well on 1–2 tables rather than all 21.

**Costs / risks:**

- **Touch surface:** ~21 list tables, each with bespoke cell rendering and inline mutations,
  plus **11 table test files** (`*table*.test.tsx` / `*Table*.test.tsx`) that assert on the
  current markup and would churn.
- **Regression risk on freshly-shipped work:** card mode (258) and the media-query-gated
  `role="group"` / `aria-label` / sr-only labels (276) live _inside_ the shared primitive via
  context + `rowLabel` + `data-label`. A "DataTable" that auto-generates rows from column defs
  would have to re-thread all of that a11y/card plumbing per column — precisely the fragile
  surface just stabilized in code review. High risk, no reward.
- **Fights the grain:** headless TanStack still needs you to write the JSX; it does not remove
  the per-table cell code that is the actual bulk of these files.

Verdict: classic negative-ROI refactor. The problems TanStack solves are already solved
server-side; the problems it would introduce (a11y/card regressions, test churn) are real.

## 4. "Category management rethink" — what it would even mean

Current admin category surface (`app/(dashboard)/categories`, widget `category-list`,
feature `category-form`):

- A **flat, paginated** table sorted `sortOrder asc`, parent name resolved in-memory from the
  same page via a `Map<id,name>` (so cross-page parents show as "—").
- An edit form whose hierarchy controls are a **flat parent `<Select>`** (self excluded to
  prevent self-parenting) and a **manual `sortOrder` number input**. Reordering = typing
  numbers by hand. Reparenting = picking from a flat list. No visualization of the tree.
- Backend already exposes the read side: `GET /categories/tree` returns 3 levels of active
  children (`apps/store-api/src/category/category.repository.ts` → `findCategoryTree`,
  entity `category-tree-node.entity.ts`); cycle detection exists (`findDescendantIds`,
  hardened by TASK-238). There is an `admin-category.controller.ts` for the write side. There
  is a related `content-map` widget that already visualizes content _zones_ (not the category
  tree).

A real "rethink" here means an admin **tree UI** and would plausibly include:

- **Tree view** (expand/collapse) replacing / augmenting the flat paginated list, so operators
  see hierarchy instead of resolving parents by name.
- **Drag-to-reorder** replacing the manual `sortOrder` number field (the same read-only
  `sortOrder`-by-edit pattern also afflicts banners, blog-categories, device-brands,
  product-groups — a reusable win).
- **Drag-to-reparent** replacing the flat parent Select (needs the existing cycle guard).
- Optional **inline bulk activate/deactivate**.

This needs a batch reorder/reparent write endpoint (does not exist yet) and careful DnD a11y
(keyboard reorder, announcements) — but **no TanStack**. It is genuinely un-delivered value
and is the real remainder of TASK-140.

## 5. Options considered & rough cost

| Option                                              | What                                                                                           | Rough cost                                                                                                            | Verdict                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A. Full TanStack/DataTable rewrite (original scope) | Migrate ~21 tables to a shared DataTable                                                       | **High (L)** — 21 tables + 11 test files + re-thread card/a11y plumbing; high regression risk on 258/276              | **Reject** — ~zero user-visible benefit today               |
| B. TanStack pilot, selection-gated                  | Adopt TanStack on 1–2 tables (orders/products) **only** to enable row selection + bulk actions | **Medium (M)** — but only if a bulk-ops requirement is confirmed                                                      | **Park** until a real bulk-ops need exists                  |
| C. Category-management rethink                      | Admin tree view + drag reorder/reparent + batch write endpoint + DnD a11y                      | **Medium (M)** — new admin tree widget (dnd-kit or similar), backend batch endpoint reusing the cycle guard, DnD a11y | **Re-scope into its own task** — the real remaining value   |
| D. Close TASK-140 outright                          | Mark superseded; drop both remainders                                                          | **Zero**                                                                                                              | Reasonable for the DataTable half; loses the category value |

## 6. Recommendation

**Split TASK-140:**

1. **Close** the TanStack/DataTable-rewrite portion as superseded by TASK-147/192/258/276 —
   it is negative-ROI today and risks the a11y/card work just shipped.
2. **Re-scope** the category-management rethink (Option C) into its own small, separately
   prioritized task — this is the one piece with genuine un-delivered user value, and it does
   not require TanStack.
3. **Park** the TanStack idea narrowly (Option B): revisit only if/when bulk selection + bulk
   actions become a real requirement, and then only as a pilot on 1–2 high-traffic tables
   (orders, products), never as a mass rewrite.

The owner decides after the wave which of these to schedule. No implementation should begin
on the strength of this memo.
