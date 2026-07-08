# Plan 126 — Stock Phase S: «Вільний залишок» terminology + low-stock sold-out visibility

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 3** (Функціональні прогалини + SEO-зручність), **Block B**
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-253

## Overview

This is **Phase S** ("термінологія і видимість — без схеми, без нових запитів") of the
available/reserved inventory discovery in
[`docs/plans/101-inventory-available-reserved.md`](101-inventory-available-reserved.md) §6. That
discovery established a key fact the admin UI does not currently communicate: **`Product.stock`
already IS the free-to-sell remainder** (available-to-sell), not the physical shelf count — units
tied up in a not-yet-shipped order are already subtracted from it at order creation. Two concrete
UX problems fall out of that:

1. **The word «Запас» is ambiguous.** An owner with no e-commerce background reads «Запас» as "how
   much is physically on the shelf." The system means "how much is left to sell." This is the root
   cause of the historical QA confusion documented in manual-qa-master.md §C2-a ("CONFIRMED didn't
   change stock" — correct behaviour, opaque wording).
2. **The low-stock dashboard widget hides the most critical positions.** `getLowStockProducts`
   filters `stock > 0`, so a fully sold-out product (`stock = 0` — the single most urgent restock
   signal) never appears in the "Низький запас" widget at all.

Phase S fixes both with **zero schema change and zero new queries**: a dictionary rename + one
`WHERE` clause edit that removes a filter (does not add one). The actual `reserved`/`physical`
derived numbers (Phase M — the columns/badges that make the "вільний залишок" framing concrete)
are **TASK-254**, a separate, larger plan (`docs/plans/127-stock-phase-m.md`) that extends the
admin API contract. This plan intentionally ships the terminology fix first and independently, so
the owner-facing wording is already correct by the time TASK-254's reserved/physical numbers land
next to it.

## User Stories

1. As the store owner, when I read the stock field on a product, I want the label to say what the
   number actually means ("available to sell right now"), so I stop being confused when a
   confirmed-but-unshipped order doesn't change the number I see.
2. As the store owner, I want the low-stock dashboard widget to show me sold-out products first
   (not hide them), so the positions that most urgently need restocking are the ones I see.

## Scope

### In Scope

- Rename every admin-dictionary occurrence of the raw literal **«Запас»** that labels
  `Product.stock` (and only those) to **«Вільний залишок»**:
  `apps/store-admin/src/shared/config/dictionary.ts` — `dashboard.stock` (low-stock table column
  header), `products.previewStock` (admin product preview), `productForm.stock` (the product-form
  field label), `productForm.errors.stockInt` (the zod validation message).
- One new static tooltip explaining the semantics, in two places that already have an established
  "explain this field" convention in this codebase (no new UI pattern):
  - `productForm.stockHint` — a plain hint paragraph under the stock field, matching the existing
    `metaTitleHint`/`metaDescriptionHint`/`attributesHint` convention already used elsewhere in
    `product-form.tsx`.
  - A `Tooltip`/`TooltipContent`/`Info`-icon affordance next to the `DashboardLowStockTable` column
    header, matching the existing `StatCard` tooltip convention already used on the same dashboard
    page (`AdminDashboardStats.tsx`).
- `dashboard.repository.ts` `getLowStockProducts`: drop the `stock: { gt: 0 }` half of the filter
  (keep `lte: threshold`), so sold-out (`stock = 0`) positions are included. The existing
  `orderBy: { stock: 'asc' }` already floats them to the very top with zero extra code — ascending
  order on `stock` puts `0` before `1`, `2`, … automatically.
- `DashboardLowStockTable.tsx`: when a row's `stock === 0`, render a distinct **«Розпродано»**
  badge instead of the numeric `destructive` badge the `stock <= 2` branch would otherwise produce
  (checked before that branch, since `0 <= 2` is also true).
- Automated test coverage for both changes (repository int-spec case + a new widget RTL spec — none
  exists for this widget yet).
- A wording refresh to the `docs/manual-qa-master.md` §C2-a preamble (the "Головне правило" /
  "Підготовка для кожного сценарію" callout at the top of the section) so it uses "вільний залишок"
  going forward. The already-checked historical scenario rows below it (`[✅] Зроби: …`) are **not**
  rewritten — they document what was verified at the time under the old label, and editing them
  would misrepresent the historical record.

### Out of Scope

- Any `reservedQty`/`physicalQty` derivation, admin API contract change, Orval regen, product-list
  stock column, or order-detail badge — all of that is **TASK-254** (Phase M, plan 127). This plan
  never queries `OrderItem`.
- Any `Product` schema change or migration. Phase S is dictionary + one query filter only.
- Renaming `dict.dashboard.lowStock` (the widget's own heading, "Низький запас" — a generic
  "low stock" concept name, not a mislabelled field) or `dict.dashboard.noLowStock`. The grounding
  audit for this plan named exactly four «Запас» occurrences tied to the `stock` field; this plan
  does not touch adjacent copy that isn't part of that set.
- Any storefront (`store-client`) change — `PublicProductEntity` never exposed raw `stock` and
  still doesn't; this plan is `store-admin` + `store-api` (one repository query) only.

## Technical Design

### Design Decision 1 — dictionary-only rename, zero component-logic change to the badge tiers

`DashboardLowStockTable`'s existing two-tier badge logic (`stock <= 2` → `destructive`,
else → `warning`) stays exactly as-is for `stock` in `(0, threshold]`. The only new branch is a
**third, higher-priority** check for `stock === 0` that renders the `destructive`-variant badge
with the literal text `dict.dashboard.soldOut` ("Розпродано") instead of the numeric `0`:

```tsx
{
  product.stock === 0 ? (
    <Badge variant="destructive">{dict.dashboard.soldOut}</Badge>
  ) : product.stock <= 2 ? (
    <Badge variant="destructive">{product.stock}</Badge>
  ) : (
    <Badge variant="warning">{product.stock}</Badge>
  );
}
```

No new `Badge` variant is introduced — `destructive` (already imported, already used) is the
correct severity color for "zero left to sell."

### Design Decision 2 — the low-stock query change is a filter _removal_, not a new query

`getLowStockProducts(threshold, limit)` currently is:

```ts
where: { stock: { gt: 0, lte: threshold }, isActive: true, deletedAt: null },
orderBy: { stock: 'asc' },
```

Becomes:

```ts
where: { stock: { lte: threshold }, isActive: true, deletedAt: null },
orderBy: { stock: 'asc' },
```

`lte: threshold` (5) already implies `stock <= 5`, which includes `0`; dropping `gt: 0` is the
entire change. Because `stock` can never be negative (`CHECK (stock >= 0)` constraint, TASK-142),
this can't accidentally admit garbage negative rows. The pre-existing `orderBy: { stock: 'asc' }`
already sorts `0` first among the returned rows — no new `ORDER BY` clause, no new index need
(the query already scans on `stock`/`isActive`/`deletedAt`, unchanged column set). The `DashboardSummaryResponse`
Swagger contract (`LowStockProductDto`) is **unchanged** — same three fields, same shape — so this
plan needs **no Orval regen** in either app.

### Design Decision 3 — two different "hint" UI conventions, matched to each file's existing local convention

The grounding brief's "+ tooltip" wording covers two different places that already have two
different established local hint patterns in this codebase; this plan follows each file's existing
convention rather than inventing a third:

- **`product-form.tsx`** already renders `metaTitleHint`/`metaDescriptionHint`/`attributesHint` as a
  plain `<p className="text-sm text-muted-foreground">{dict.productForm.xHint}</p>` directly under
  the field, with no icon/popover. `stockHint` follows that exact pattern — a static sentence (no
  dynamic numbers; the dynamic "фізично N / у замовленнях M" breakdown is TASK-254, a _second_,
  additional line added later in the same spot — this plan does not pre-build that line).
- **`AdminDashboardStats.tsx`** (same dashboard page as the low-stock widget) already renders an
  `Info`-icon `Tooltip`/`TooltipContent` next to a `StatCard` label, driven by
  `dict.dashboard.metricInfoAria(label)` for the trigger's `aria-label`. `DashboardLowStockTable`'s
  column header reuses this exact primitive (`Tooltip`, `TooltipContent`, `TooltipTrigger` from
  `@/shared/ui`, `Info` from `lucide-react`) and the existing `metricInfoAria` helper — no new
  tooltip component, no new aria-label helper.

### Design Decision 4 — the manual-QA wording update touches only the preamble, never the checked history

`docs/manual-qa-master.md` §C2-a opens with an explanatory callout ("Головне правило…",
"Підготовка для кожного сценарію…") that currently says "запас" throughout, followed by a long
list of already-executed, checkmarked (`[✅]`) scenario rows dated 2026-07-04 that also say "запас"
in their own text. This plan updates **only the callout** to use "вільний залишок" (matching the
new admin label) and adds one sentence noting the TASK-253 rename. The dated `[✅]` rows are frozen
historical QA evidence of what was verified under the old label — rewriting their prose would
misrepresent what was actually clicked and typed on 2026-07-04. A future re-run of the matrix
(if one is ever scheduled) is the correct place to re-word those rows, not this plan.

## Tasks

### TASK-253-A: Admin dictionary rename + `stockHint` tooltip copy

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — copy-only dictionary change; no business logic.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `dict.dashboard.stock` (low-stock table column header) reads "Вільний залишок" (was "Запас")
- [ ] `dict.products.previewStock` (admin product preview label) reads "Вільний залишок"
- [ ] `dict.productForm.stock` (product-form field label) reads "Вільний залишок"
- [ ] `dict.productForm.errors.stockInt` reads "Вільний залишок має бути цілим числом ≥ 0"
- [ ] New `dict.productForm.stockHint` added (placed immediately after `stock` in the
      `productForm` dictionary section, matching the `metaTitleHint`/`metaDescriptionHint`
      placement convention), explaining the derived-availability semantics in plain UA — e.g.
      "Скільки одиниць товару можна продати прямо зараз. Це число вже враховує товари з
      непідтверджених/необроблених замовлень — вони віднімаються одразу при оформленні
      замовлення, а не при відправці." (exact wording at implementer discretion; must not
      reference specific reserved/physical numbers — those are TASK-254)
- [ ] New `dict.dashboard.soldOut` = "Розпродано"
- [ ] New `dict.dashboard.stockHint` (or reuse `productForm.stockHint` if the implementer judges
      the copy identically applicable — either is acceptable) for the dashboard low-stock column
      tooltip; if a separate key is added, keep the same semantic explanation as `productForm.stockHint`
      so the two surfaces don't drift in meaning
- [ ] `dict.dashboard.lowStock` ("Низький запас", the widget heading) and `dict.dashboard.noLowStock`
      are left untouched — out of scope per this plan
- [ ] `productForm.stockHint` rendered in `product-form.tsx` immediately under the stock `Input`,
      in the same `<p className="text-sm text-muted-foreground">` style as the three existing hint
      paragraphs in that file
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/shared/config/dictionary.ts` — rename 4 existing `"Запас"` strings, add
  `dict.productForm.stockHint`, `dict.dashboard.soldOut`, `dict.dashboard.stockHint` (or reuse)
- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — render `stockHint` under the
  stock field

---

### TASK-253-B: Low-stock query includes sold-out positions

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — a one-line filter removal on an already-tested query; covered by the
updated int-spec below rather than a fresh red/green cycle.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `dashboard.repository.ts` `getLowStockProducts` drops `stock: { gt: 0 }` from the `where`
      clause, keeping `stock: { lte: threshold }, isActive: true, deletedAt: null` and the
      existing `orderBy: { stock: 'asc' }` (unchanged — already puts `0` first)
- [ ] `LowStockProduct`/`LowStockProductDto` shapes are **unchanged** — no new field, no Orval regen
      needed for this task
- [ ] `apps/store-api/test/dashboard.repository.int-spec.ts` `getSummary — low stock` describe block:
      seed one additional product at `stock: 0` (active, non-deleted, no PAID/PENDING order tie —
      reuse the existing fixture pattern in that file) and assert it now appears in
      `summary.inventory.lowStockProducts` and sorts before every `stock > 0` row (extending the
      existing ascending-order assertion, which already covers this once the `0` row exists)
- [ ] `apps/store-api/test/dashboard.e2e-spec.ts`: no shape change required (the mocked
      `DashboardRepository` fixture is unaffected by a `WHERE` clause change it never exercises) —
      confirm the existing `LowStockProductDto` shape assertions still pass unmodified
- [ ] Existing product-module low-stock threshold tests (if any reference `gt: 0` directly) updated
      to match
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api` and
      `npm run test -w apps/store-api -- dashboard.repository.int-spec` (real Postgres, `--runInBand`
      per the project's e2e/int-spec convention — see `store-api-e2e-serial` note)

**Files to create/modify:**

- `apps/store-api/src/dashboard/dashboard.repository.ts` — drop `gt: 0` from `getLowStockProducts`
- `apps/store-api/test/dashboard.repository.int-spec.ts` — new stock-0 fixture + assertion

---

### TASK-253-C: `DashboardLowStockTable` sold-out badge + widget test + manual-QA wording

**Type:** feat
**Scope:** store-admin, docs
**Complexity:** S (1-2h)
**TDD Required:** No — presentational branch, covered by a new RTL spec per the acceptance
criteria below.
**Depends on:** TASK-253-A (dictionary keys must exist), TASK-253-B (the real backend behaviour
this widget is now meaningfully testing end-to-end via manual QA — not a compile dependency, since
the widget is presentational and receives `products` as a prop either way)

**Acceptance Criteria:**

- [ ] `DashboardLowStockTable.tsx`: `stock === 0` renders a `destructive`-variant `Badge` with text
      `dict.dashboard.soldOut` ("Розпродано"), checked **before** the existing `stock <= 2` branch
      (order matters: `0 <= 2` is also true)
- [ ] Column header ("Вільний залишок") gains an `Info`-icon `Tooltip` (reusing
      `Tooltip`/`TooltipContent`/`TooltipTrigger` from `@/shared/ui` and the `metricInfoAria`
      dictionary helper for the trigger's `aria-label`), matching the `AdminDashboardStats.tsx`
      `StatCard` tooltip convention on the same page
- [ ] New `apps/store-admin/src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.test.tsx`
      (none exists today): renders with a fixture containing one `stock: 0`, one `stock: 2`, one
      `stock: 5` row and asserts (a) the `stock: 0` row shows "Розпродано" text (not "0"),
      (b) the `stock: 2` row still shows a numeric `destructive` badge, (c) the `stock: 5` row shows
      a numeric `warning` badge, (d) the tooltip trigger is present and its `aria-label` matches
      `dict.dashboard.metricInfoAria(dict.dashboard.stock)`
- [ ] `docs/manual-qa-master.md` §C2-a preamble ("Головне правило" / "Підготовка для кожного
      сценарію" callout, lines ~478–505): reword to say "вільний залишок" where it currently says
      "запас" referring to `Product.stock`, and add one sentence noting the TASK-253 rename with a
      pointer to plan 126. The dated `[✅]` scenario rows below the callout are **not** edited.
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`
- [ ] Manual check (per `docs/manual-qa-pending.md` convention): on a running stack, seed one
      sold-out product (`stock = 0`, active) at/under the low-stock threshold and confirm the
      dashboard widget shows it at the top with the "Розпродано" badge

**Files to create/modify:**

- `apps/store-admin/src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.tsx` — sold-out
  branch + header tooltip
- `apps/store-admin/src/widgets/dashboard-low-stock/ui/DashboardLowStockTable.test.tsx` — new
- `docs/manual-qa-master.md` — §C2-a preamble wording refresh

## Dependencies & Sequencing

- **Internal:** A (dictionary) → C (widget consumes the new dict keys); B (backend query) has no
  code dependency on A/C but should land before or alongside C so the manual-QA check in C is
  meaningful against real data. Suggested order: A → B → C (matches the numeric suffix).
- **Cross-plan (TASK-254 / plan 127):** TASK-253 and TASK-254 are implemented **sequentially in the
  same worktree**, branch `feature/253-254-stock` — **253 first**, establishing the "Вільний
  залишок" terminology, **then 254**. Both plans edit `dictionary.ts` (253 renames the label +
  adds a static hint; 254 later adds a _second_, dynamic reservedQty/physicalQty hint line next to
  it) and both edit `product-form.tsx`'s stock-field area — sequencing avoids the two changes
  fighting over the same lines. See plan 127 §Dependencies for the mirror of this note.
- **External:** None. No schema migration, no Orval regen, no other in-flight plan touches
  `dashboard.repository.ts`, `DashboardLowStockTable.tsx`, or the four renamed dictionary keys.

## Risks & Mitigations

| Risk                                                                                                                                                                        | Mitigation                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renaming a dictionary string that's asserted verbatim in an existing test breaks that test                                                                                  | Grep for `"Запас"` across `apps/store-admin/src` before landing; the four target keys were confirmed via a codebase read as the only occurrences tied to `Product.stock` (this plan's grounding pass)                                                                                     |
| Dropping `gt: 0` silently changes `LOW_STOCK_LIMIT = 10` behaviour if a store has >10 sold-out products, pushing some `stock > 0` low-stock rows out of the widget entirely | Accepted and intended — sold-out is strictly higher-priority than "still sellable but low"; the widget's job is triage, and 10 sold-out rows means the owner has a bigger problem than the widget's row cap. No code change needed; documented here so it isn't mistaken for a regression |
| The `Info`-icon tooltip pattern requires the `Tooltip` provider to be mounted higher in the tree (as `AdminDashboardStats` already assumes on the same page)                | Both widgets render on the same `/dashboard` page under the same layout, so the existing provider (already required for `AdminDashboardStats` to work today) covers `DashboardLowStockTable` too — no new provider wiring needed                                                          |
| Manual-QA wording edit accidentally touches a checked historical row, misrepresenting what was verified on 2026-07-04                                                       | Explicit acceptance criterion scopes the edit to the preamble only; the checked `[✅]` rows are enumerated as out-of-bounds in Design Decision 4                                                                                                                                          |

## Notes

- This plan intentionally does **not** touch `OrderItem`, does **not** add any repository method
  beyond the one-line `getLowStockProducts` filter edit, and requires **no** Orval regeneration —
  it is the "cheap" terminology-and-visibility half of the two-part stock work (S then M), matching
  the phasing plan 101 §6 laid out.
- The dynamic "фізично N (з них у замовленнях: M)" breakdown named in plan 101 §4 is deliberately
  **not** built here — it depends on the derived `reservedQty` aggregate, which is TASK-254's
  entire payload. `productForm.stockHint` in this plan is a static, number-free sentence; TASK-254
  adds a second, dynamic line alongside it.
- If a future manual-QA re-run of the full §C2-a matrix happens (not scheduled by this plan), that
  is the natural point to also reword the historical `[✅]` rows to "вільний залишок" — left as a
  natural follow-on, not a task here.
