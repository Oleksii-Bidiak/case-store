# Plan 158 — Admin category tree (TASK-291)

> **Status:** ✅ Done (TASK-291 shipped 2026-07-12; follow-ups TASK-293/294/295 ✅ — live drag/drop, keyboard reorder and screen-reader audit → manual QA)
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog)
> **Created:** 2026-07-12
> **BACKLOG task:** TASK-291 (single task, internal work breakdown TASK-291-A…M below, mirrors
> the plan-154 convention for a large single-task feature)
> **Parent memo:** `docs/plans/157-admin-datatable-rescope.md` — this plan implements memo
> **Option C** (§4/§5/§6): "Category-management rethink" was re-scoped out of TASK-140 into its
> own task because it is the one piece of that memo's scope with genuine un-delivered user value,
> and it does not need a TanStack Table migration (that half of TASK-140 was closed as superseded
> by TASK-147/192/258/276; a TanStack pilot was separately parked as TASK-292, gated on a real
> bulk-selection requirement — see BACKLOG "Parked").

## 1. Goal / Non-Goals

### Goal

Replace the flat, paginated admin category table (`apps/store-admin/src/widgets/category-list/`)
with a **tree UI** that lets an operator see the category hierarchy at a glance and reorder /
reparent nodes without hand-typing a `sortOrder` integer or picking a parent from a flat,
100-row-capped `<Select>`. Concretely:

- Tree view with expand/collapse, replacing the paginated flat list.
- Drag-to-reorder among siblings, replacing the manual `sortOrder` number input in
  `category-form.tsx`.
- Drag-to-reparent across the tree, replacing the flat parent `<Select>` **as the primary reparent
  affordance**, guarded server-side by the TASK-238-hardened
  `CategoryRepository.findDescendantIds` cycle detector. **Declared deviation from the task
  wording:** the `<Select>` itself is RETAINED (not deleted) — it is the WCAG 2.2 SC 2.5.7
  non-dragging alternative and the no-JS / hydration-failure fallback, and it is the control the
  "Перемістити до…" dialog reuses (§7.6.3). It is hardened to exclude SELF **and all descendants**
  and is re-fed from the complete admin tree instead of the 100-row-capped flat list (§3.11). The
  owner may override this and require its deletion; the plan states the trade-off rather than
  resolving it silently.
- A **new** batch reorder/reparent write endpoint (`PATCH /api/admin/categories/reorder`) — no
  such endpoint exists today; the closest precedents (`AttributeDefinitionRepository.reorder`,
  `ProductImageRepository.updateMany`) only ever touch `sortOrder`, never `parentId` + `sortOrder`
  together across multiple sibling buckets in one transaction.
- Full WCAG-conformant drag-and-drop accessibility: keyboard-only reorder AND reparent, a
  non-dragging pointer alternative (per-row menu + a "Move to…" dialog — required by WCAG 2.2
  SC 2.5.7, not optional polish), `aria-live` announcements in Ukrainian, and an Undo action.
- A blast-radius warning when deactivating a category that has active descendants (a real,
  pre-existing correctness gap that the new tree UI makes more visible, not less — see
  §3.11 "Bulk activate/deactivate").

### Non-Goals (explicit)

- **No TanStack Table migration.** That half of the original TASK-140 scope was closed as
  superseded (memo 157 §2–§3: sorting/pagination/filtering are already server-side, there is no
  row-selection requirement anywhere in the admin, and a `columns[]`-def abstraction would have
  to re-thread the freshly-shipped card-mode + a11y plumbing from TASK-258/276 for zero
  user-visible gain). The narrow TanStack pilot idea is separately parked as **TASK-292**, gated
  on a confirmed bulk-selection need — this plan does not touch it.
- **No Prisma schema change.** `Category.parentId` + `sortOrder Int @default(0)` + `isActive` are
  sufficient (owner hard constraint). No new columns (no `depth` cache, no `version` optimistic-
  lock column), no new tables, no migration, no `prisma migrate dev`. See §3.1 for the full
  verified rationale (there is no `@@unique` touching `sortOrder` anywhere in the schema).
- **No reorder wiring for banners, blog-categories, device-brands, or product-groups in THIS
  task.** These four admins share the exact same read-only-`sortOrder`-edited-by-hand pattern
  (`widgets/banner-list`, `widgets/blog-category-list`, `widgets/device-brand-list`,
  `widgets/product-group-list`), and the backend DTO/util plus the frontend DnD primitive are
  **designed reusable** for them (see §6), but only categories get an actual endpoint and an
  actual wired widget in this task. Wiring the other four is filed as TWO follow-up BACKLOG rows,
  allocated at implementation time from the next free monotonic id (currently **TASK-293**):
  (a) banners + blog-categories + device-brands — flat sortable lists; (b) product-groups — already
  index-positional via `useFieldArray`, needs only a move affordance, no endpoint. See §12.
- **No bulk selection / `aria-multiselectable` treegrid.** The optional inline bulk
  activate/deactivate is deferred to a NEW follow-up BACKLOG row (next free id, filed at
  implementation time; working title «Дерево категорій: множинний вибір + масова активація/
  деактивація») — rationale in §3.11, tracked in §12. It is NOT TASK-292 (the parked TanStack
  pilot, unrelated). The per-row status toggle (`features/category-status-toggle`) is carried into
  the tree with one mandatory addition that ships NOW: the blast-radius confirmation (§3.11). The
  checkbox-column multi-select bulk action does not ship here.
- **No storefront ISR revalidation wiring.** Categories implement no `PublishablePort` and there
  is no `categories` cache tag on the storefront today; adding one needs a `categories-server.ts`
  shim in `store-client` (following `faq-server.ts`) and is filed as a follow-up BACKLOG row
  (working title «Storefront ISR-ревалідація для категорій», §3.13, §12).
- **No NEW admin pointer-DnD Playwright spec.** jsdom has no layout
  (`getBoundingClientRect()` returns zeros), so dnd-kit's collision detection cannot run there, and
  Playwright does not boot `store-admin` today (no `webServer` entry, no admin seed user in
  `seed-e2e.ts`). Pointer DnD correctness rests on sharing one `applyMove()` reducer with the
  keyboard path (proven by the projection→insertion-point unit test, §3.2/TASK-291-G) plus a
  manual QA pass (§11). This non-goal scopes ONLY the new admin spec — the EXISTING Playwright
  suite (`e2e/cart-flow.spec.ts`, `e2e/auth-flow.spec.ts`) is a mandatory gate (§9), because this
  plan regenerates the store-client Orval client and changes the public category read order.
- **No isolation-level change and no new Prisma driver-adapter dependency.** Concurrency safety
  comes from Postgres transaction-scoped advisory locks at READ COMMITTED, not from
  `Serializable` + retry plumbing (§3.6).

## 2. Current State

### 2.1 Backend — what already exists

- **Prisma model** (`apps/store-api/prisma/schema.prisma:121-161`): `Category` has `parentId`
  (`self`-relation, `ON DELETE SET NULL`), `sortOrder Int @default(0)`, `isActive Boolean
@default(true)`. The **only** unique constraint on the model is `slug`; `parentId` and
  `sortOrder` are backed by plain `@@index`, never `@@unique`. No DB trigger, no stored function,
  no `AuditLog` model anywhere in the schema.
- **Read side — public**: `GET /categories/tree` → `CategoryRepository.findCategoryTree()`
  (`category.repository.ts:236-270`) — `where: { parentId: null, isActive: true }`, three nested
  `include: { children: { where: { isActive: true } } }` levels (root + 3 nested tiers, hard
  structural cap), `orderBy: { sortOrder: 'asc' }` with **no tiebreaker**. Entity
  `CategoryTreeNodeEntity` (`entities/category-tree-node.entity.ts`) carries `id, name, slug,
description, image, isActive, sortOrder, metaTitle, metaDescription, updatedAt, children[]` —
  **no `parentId`, no `productCount`** (hierarchy is expressed only via nesting).
- **Read side — admin (today)**: `GET /categories/admin/tree` (per-route `AdminGuard`,
  `category.controller.ts:116-131`, `operationId: categoryControllerGetAdminTree`, declared
  before `@Get(':slug')`) → `findCategoryTreeForAdmin()` (`category.repository.ts:279-309`) —
  identical to the public tree minus the `isActive` filters, same 3-level nested `include` cap,
  same `CategoryTreeNodeEntity` shape. Already consumed today by `product-form.tsx` and
  `carousel-form.tsx` (both import `useCategoryControllerGetAdminTree` directly from
  `@/shared/api`, bypassing the `entities/category` barrel, and both hand-roll their own
  tree-flattening helper for a leaf-only or all-nodes `<Select>`).
- **Cycle guard**: `CategoryRepository.findDescendantIds(categoryId)`
  (`category.repository.ts:506-520`) — a raw `$queryRaw` recursive CTE over the physical
  snake_case tables (`categories`, `parent_id` — the TASK-238 fix), `UNION` (not `UNION ALL`) so
  it terminates even on an existing cycle, returns **strict descendants excluding self**. Runs on
  `this.prisma`, not a `tx` client — **cannot see uncommitted writes of an in-flight
  transaction**, which is exactly the gap this plan's `applyTreeMoves` closes (§3.5). Hardened
  and verified by TASK-238's own integration tests: `apps/store-api/test/category.repository.int-spec.ts:133-160`,
  11/11 green on real Postgres.
- **Admin write surface**: `apps/store-api/src/category/admin-category.controller.ts` —
  `@Controller('admin/categories')` with class-level `@UseGuards(AdminGuard)` — `GET /`, `GET
/:id`, `POST /`, `PUT /:id`, `PATCH /:id/deactivate`, `PATCH /:id/activate`. `CategoryService.update`'s
  parent-change guard (`category.service.ts:212-230`) only runs when `parentId` actually changes,
  short-circuits on `null` (root is always valid), and — a real latent gap — **never checks
  `parentId === id`** (`findDescendantIds` excludes self, so a self-loop is writable today; only
  the frontend's `excludeParentId` prop currently prevents it). There is also **no depth cap**
  anywhere: nothing stops a chain deeper than the 4 levels `findCategoryTree`'s three nested
  `include`s can represent (root + 3 nested tiers — level 4 IS returned, level 5 is the first
  invisible one), so an over-deep node silently vanishes from both the public and (today's nested)
  admin tree.
- **`sortOrder` is a hand-typed integer everywhere**: `CreateCategoryDto`/`UpdateCategoryDto` both
  carry `@IsInt @Min(0) sortOrder`; `CategoryRepository.create()` defaults it to a hard `0`
  (`category.repository.ts:427`) — every new category is created at the top of (or arbitrarily
  within) its siblings. No auto-append, no per-parent renumbering, no collision handling anywhere.
- **No cache eviction, no search re-index, no revalidation on any category write.**
  `CategoryService`'s constructor takes only `CategoryRepository` — no `CacheService`, no
  `RevalidationNotifier`, no search indexer injected. `ProductService` caches category-filtered
  product lists under `PRODUCT_LIST_PREFIX` keyed off `findSubtreeIds`
  (`product.service.ts:235`), so a reparent already silently staleness-leaks today; Meilisearch
  product documents carry `categoryIds` computed once at product-index time
  (`search.service.ts:243`), so a reparent already silently desyncs storefront category-filtered
  search today. Both gaps are pre-existing but become materially worse once reparenting is a
  one-second drag gesture instead of a rare hand-edit — this plan closes both (§3.13).

### 2.2 Frontend — what renders today

- `apps/store-admin/src/app/(dashboard)/categories/page.tsx` renders
  `<Suspense><AdminCategoryTable/></Suspense>`.
- `widgets/category-list/ui/admin-category-table.tsx` (183 lines) — a flat, **paginated** table
  (`page`/`limit=20`/`search` in the URL), fixed `sortBy: "sortOrder", sortOrder: "asc"`, 7
  columns (Назва | Slug | Батьківська | Товари | Порядок | Статус | Дії). Its parent-name
  resolution is a `Map` built **only from the current page** — a parent on another page renders
  `—`. `sortOrder` is a read-only `<TableCell>`. No test file exists for this widget.
- `features/category-form/ui/category-form.tsx` — the two controls this plan deletes: a flat
  parent `<Select>` (options from a 100-row-capped admin list query, self-excluded but **not**
  descendant-excluded, carries the TASK-201 Radix bubble-input guard) and a bare `sortOrder`
  number `<Input>`. `features/category-form/ui/category-form.test.tsx` (460 lines) has ~15 cases
  built around `getByRole("combobox")`/`findByRole("option")` on that `<Select>` — every one of
  them needs updating once the control changes shape.
- `features/category-status-toggle/` — Badge-in-ghost-Button, invalidates the admin list query
  key on success, no toast, no blast-radius awareness. Carried into the tree unchanged except for
  the blast-radius addition (§3.11).
- **No DnD dependency exists anywhere in the monorepo** (`grep` across all `package.json` +
  `package-lock.json` for dnd-kit/react-beautiful-dnd/@hello-pangea/react-arborist/
  react-complex-tree/sortablejs/react-dnd → zero hits). The two existing reorder UIs
  (`product-image-manager`, `carousel-item-picker`) deliberately use accessible move-up/move-down
  buttons instead, precisely to avoid a DnD dependency — this plan is the first to introduce one.
- **No `aria-live` region exists anywhere in `store-admin`** — only 151 static `role="alert"`
  paragraphs and 2 `role="status"` usages (a skeleton and a working-hours editor), neither of
  which is a real live-announcer. The announcer primitive this plan needs is greenfield.
- **No optimistic mutation exists anywhere in `store-admin`** — every mutation today is
  invalidate-on-success (`grep` for `onMutate|setQueryData|cancelQueries` → zero hits). The
  pending-override + rollback + refocus lifecycle this plan needs (§3.9) is the first of its kind
  in this app.

## 3. Design Decisions

Each decision below is binding — it was independently reviewed and is not re-opened here.

### 3.1 Prisma schema (hard constraint) — NO schema change

**Decision.** `Category.parentId` + `sortOrder Int @default(0)` + `isActive` are sufficient; no
new columns, no new tables, no migration, no `prisma migrate dev`. Verified against
`apps/store-api/prisma/schema.prisma:121-161`: the only unique on `Category` is `slug`; there is
**no `@@unique` anywhere** touching `sortOrder` (every composite involving it is a plain
`@@index`). Two invariants are recorded as a doc-comment on `CategoryRepository.applyTreeMoves`
and here: **(a)** the full-sibling-list rewrite writes rows one `updateMany` at a time inside one
transaction, so intermediate states DO contain duplicate `(parentId, sortOrder)` pairs — adding
`@@unique([parentId, sortOrder])` later would break every reorder and would force a two-phase
negative-offset write; **(b)** cycles are NOT DB-constrained (self-referential FK only), so
`findDescendantIds` + the in-memory post-batch check are the ONLY cycle guards.

**Rationale.** The owner's hard constraint is satisfiable as-is, and this was independently
verified: the absence of a `sortOrder` unique constraint is exactly what makes the naive full-list
rewrite safe. Writing the invariant down converts an undocumented accident into a stated
dependency future schema authors must respect.

**Rejected alternatives.** `@@unique([parentId, sortOrder])` for integrity (forbidden by the
owner AND would force negative-offset two-phase writes). A `version Int` optimistic-locking
column (forbidden; the full-bucket payload gives staleness detection for free — see §3.5/§3.6). A
`depth` cache column (forbidden; depth is cheaply derivable from the in-memory adjacency map).

### 3.2 DnD library — `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0`

**Decision.** Exact pins (no `^`): `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`,
`@dnd-kit/utilities@3.2.2`, `@dnd-kit/modifiers@9.0.0`, added to
`apps/store-admin/package.json` dependencies.

**dnd-kit is POINTER-ONLY. This is binding.** The keyboard model of §7.2 is NOT routed through
dnd-kit:

- **No `KeyboardSensor`**, and **`sortableTreeKeyboardCoordinates` is NOT vendored.** Both are
  driven by measured `droppableRects` + `delta.x`; in jsdom `getBoundingClientRect()` returns all
  zeros, so ANY dnd-kit-sensor-driven move — pointer _or_ keyboard — is untestable there. Since
  Playwright does not boot `store-admin` (§1), routing the keyboard through dnd-kit would leave the
  entire keyboard/a11y acceptance criterion with no automated coverage at all. Only `PointerSensor`
  (`activationConstraint: { distance: 4 }`) is registered.
- **The single source of truth is a pure reducer** in `shared/lib/sortable-tree/`:
  `applyMove(items, movingId, { targetParentId, targetIndex })` — an _insertion-point_ signature,
  zero dependence on measurement. Keyboard move mode (§7.2), the row "Дії" menu (§7.6.1) and the
  "Перемістити до…" dialog (§7.6.2) all call it directly from plain `onKeyDown` / `onClick`
  handlers.
- **The pointer path is a thin adapter**: dnd-kit's `getProjection(over, offsetLeft)` output is
  converted to the SAME `{ targetParentId, targetIndex }` insertion point and fed to the SAME
  reducer. A unit test (TASK-291-G) asserts that conversion over a table of `(overId, offsetLeft)`
  fixtures — that test is what makes the claim "pointer correctness rests on sharing one
  `applyMove()`" (§1 Non-Goals) actually true rather than aspirational.
- **dnd-kit's built-in a11y layer is DISABLED**; `shared/ui/live-announcer` (§7.3) is the single
  source of truth. `DndContext` unconditionally renders its own `LiveRegion` (`role="status"
aria-live="assertive"`) plus a `screenReaderInstructions` node, and `useSortable().attributes`
  injects `aria-roledescription="sortable"`, `aria-describedby="DndContext-N"`, `role="button"` and
  `tabIndex`. Left alone, that means three live regions double-speaking English defaults, an
  unaccounted `aria-describedby`, and an `aria-roledescription` §7.1 forbids. Mandatory:
  `accessibility={{ announcements: { onDragStart: () => undefined, onDragOver: () => undefined,
onDragEnd: () => undefined, onDragCancel: () => undefined }, screenReaderInstructions: {
draggable: '' } }}`, and `attributes` is DESTRUCTURED before spreading onto the grip handle —
  `aria-roledescription`, `aria-describedby` and `role` are dropped. RTL invariant (TASK-291-J):
  the widget renders EXACTLY two live regions and each action produces EXACTLY one announcement.

Other mandatory config: `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` (row
indents change mid-drag, so collision rects go stale otherwise); `{...listeners}` (+ the sanitized
`attributes`) spread on the grip-handle button ONLY, never the row (so the row's other buttons —
twisty, status toggle, edit link, actions menu — stay independently clickable);
`restrictToVerticalAxis` (from `modifiers`) applied ONLY when the primitive runs in flat mode
(`maxDepth: 1`) — never in the tree, where `delta.x` IS the reparent signal. The vendored set from
the MIT dnd-kit SortableTree example is exactly `flattenTree`, `buildTree`, `getProjection`,
`removeChildrenOf` (MIT license header retained verbatim) in
`apps/store-admin/src/shared/lib/sortable-tree/`.

**Rationale.** dnd-kit is the best available POINTER engine for a nested, indent-aware drag:
headless (no renderer fight with Tailwind 4 / `radix-ui` 1.4.3), ~18-20 kB gz, MIT, its
`getProjection` model is the published solution to depth-from-horizontal-offset, and the SAME
dependency serves the flat sibling lists (banners/blog-categories/device-brands), which is what
makes the reuse mandate honest. React 19.2.4 is fine (v6 ids come from React `useId`). What it is
NOT used for is keyboard and announcements — those are owned in-repo precisely so they are
testable in jsdom and localizable into Ukrainian. Accepted cost: the 6.x line is frozen (last
publish 2024-12-05); mitigated by exact pins and by the fact that the tree logic is vendored code
owned regardless — a future swap to `@dnd-kit/react` (same `getProjection` model) is confined to
`shared/{lib,ui}/sortable-tree` and touches no keyboard or announcement code at all.

**Rejected alternatives.** `@hello-pangea/dnd` — best flat-list a11y but nesting is explicitly
unsupported and the drop payload has no horizontal/depth channel, so drag-to-reparent literally
cannot be expressed. `react-arborist` — depends transitively on `react-dnd@^14` (last released
2022, open React-19 issue) whose HTML5 backend is keyboard-inoperable by design; fails the hard
a11y constraint. `react-complex-tree` — genuinely accessible, but it is a state-owning environment
with its own renderer model, useless for the four flat sibling admins (fails the reuse mandate);
kept as documented Plan B only if a real React-19 defect appears. `@dnd-kit/react@0.5.x` — active
but 0.x, ~2x bundle, and its `getProjection` story is still in flux; no gain over the frozen 6.x
line for a pointer-only integration. Native HTML5 `draggable` — unstyleable drag image,
inconsistent `dragover`/`drop` semantics, broken on touch. Hand-rolled pointer engine — would own
sensors, collision detection and auto-scroll (the expensive part) for no gain, now that keyboard
and announcements are owned in-repo anyway.

### 3.3 Admin tree data-loading strategy (read side)

**Decision.** The admin tree does NOT use `findCategoryTree` (isActive-filtered at every level,
fixed 3-level nested `include`). Instead: rewrite `CategoryRepository.findCategoryTreeForAdmin()`
as a SINGLE FLAT `findMany` — no nested includes — selecting `id, name, slug, description, image,
parentId, isActive, sortOrder, metaTitle, metaDescription, updatedAt` plus `_count: { select: {
products: { where: { isActive: true } } } }`,
`orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]`, assembled into a tree in the repository. New
entity `apps/store-api/src/category/entities/admin-category-tree-node.entity.ts`
(`AdminCategoryTreeNodeEntity`): adds `parentId: string | null`, `productCount: number`, `depth:
number` on top of the existing tree-node fields; `children: AdminCategoryTreeNodeEntity[]`. The
existing route `GET /api/categories/admin/tree` (`category.controller.ts:116-131`, per-route
`AdminGuard`, `operationId: categoryControllerGetAdminTree`) is upgraded to return `{ data:
AdminCategoryTreeNodeEntity[] }` — additive (new fields; existing consumers `product-form.tsx`
and `carousel-form.tsx` keep compiling). NO second admin-tree route is added. The PUBLIC
`CategoryTreeNodeEntity` and `findCategoryTree` are NOT touched, except `findCategoryTree`'s
sibling `orderBy` gains the `{ id: 'asc' }` tiebreaker (§3.7).

**Rationale.** A flat query removes the structural 3-level cap from the admin read, so a
pre-existing (or concurrently created) level-4 orphan is at least VISIBLE to the admin who has to
drag it back — with nested includes it would be invisible and unfixable. It also gives sibling
order a deterministic tiebreaker while legacy all-zero `sortOrder` rows still exist. `parentId` is
required because the DnD payload is built from parent buckets; `productCount` is required to keep
the Товари column operators use today. A separate ADMIN entity keeps the public storefront
contract (which feeds the sitemap via `updatedAt`) free of permanently-undefined admin-only
fields.

> **Shipped-code note (TASK-291-C).** The `select` list above is the FULL public tree-node field
> set (`description`, `image`, `metaTitle`, `metaDescription` included), not a narrower one: §6 is
> the binding contract and requires `AdminCategoryTreeNodeEntity` to stay a strict SUPERSET of the
> public `CategoryTreeNodeEntity`, so the existing consumers (`product-form.tsx`,
> `carousel-form.tsx`) keep compiling. An earlier draft of this section listed only the
> tree-specific columns; the code follows §6.

**Rejected alternatives.** Adding `productCount?` to the PUBLIC `CategoryTreeNodeEntity` and
leaving it undefined in the public mapper — pollutes the storefront's generated Orval model on an
entity whose comment says its shape is deliberately minimal. Minting a NEW
`GET /api/admin/categories/tree` alongside the existing `GET /categories/admin/tree` — two
routes, two Orval hooks, same data, permanent drift. Keeping the nested 3-level `include` — cannot
represent or surface an over-deep node.

### 3.4 Batch write endpoint shape

**Decision.** ONE new route: `PATCH /api/admin/categories/reorder` on the existing
`AdminCategoryController`, declared BEFORE the `:id` routes. `@HttpCode(200)`,
`@ApiBearerAuth('access-token')`, explicit `operationId: 'adminCategoryControllerReorder'`,
`@ApiResponse` 200/400/403/404/409, response envelope class `AdminCategoryTreeResponse`
declared in the controller file and registered in the existing `@ApiExtraModels(...)`.

Body, hoisted to `apps/store-api/src/common/dto/reorder.dto.ts` so the flat consumers can share
it later (§6):

```ts
export class ReorderGroupDto {
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((o) => o.parentId !== null)
  @IsUUID("4")
  parentId!: string | null; // null = root bucket

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  orderedIds!: string[]; // MAY BE EMPTY — a parent can lose its last child
}

export class ReorderTreeDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReorderGroupDto)
  groups!: ReorderGroupDto[];
}

export class ReorderFlatDto {
  @IsArray()
  @IsUUID("4", { each: true })
  orderedIds!: string[];
}
```

`apps/store-api/src/category/dto/reorder-categories.dto.ts` extends `ReorderTreeDto`.

**Semantics.** The client sends the COMPLETE, FINAL child list of every parent bucket it touched
(1 group for a plain reorder; 2 for a reparent — source + destination). Array index becomes
`sortOrder` (0..n-1, contiguous); every listed id gets that group's `parentId`. Declarative,
idempotent, self-healing. Response: `200 { data: AdminCategoryTreeNodeEntity[] }` — the full
refreshed admin tree re-read after the write, so the client resynchronises to server truth in one
round trip.

**CRITICAL — server-computed closure.** The server does NOT trust the payload's bucket set. It
computes the AFFECTED-PARENT CLOSURE itself inside the transaction = (every `group.parentId`) ∪
(the CURRENT `parentId` of every id named in any group, read in-tx). Any bucket in the closure the
client did NOT describe is (a) still locked and (b) still resequenced to contiguous 0..n-1 after
the moves are applied — so an incomplete payload can never leave a hole or race an unlocked
sibling list.

**Rationale.** `{ groups: [{ parentId, orderedIds }] }` generalises the closest in-repo precedent
(`AttributeDefinitionRepository.reorder`: `orderedIds`, index→sortOrder, `updateMany` with a scope
guard, `{data}` envelope). It is the minimum shape that expresses reorder AND reparent atomically,
forbids the client from inventing absolute `sortOrder` values (the collision source), and its
set-membership property gives optimistic concurrency with no version column. Allowing an EMPTY
`orderedIds` is non-negotiable: dragging the only child out of a parent is a day-one operator
action, and `@ArrayNotEmpty()` on the group would 400 it. Server-side closure computation closes
the hole where a buggy or forged client omits the source group. Returning the whole tree (not
`{success:true}`) keeps the AGENTS.md `{data}` envelope and makes rollback/resync a single state
replacement.

**Rejected alternatives.** `{ items: [{ id, parentId, sortOrder }] }` (the `ReorderImagesDto`
shape) — lets a stale client write absolute sortOrders, exactly the torn-order bug, no staleness
signal. `{ success: true }` response (the `product-image.controller.ts` deviation) — violates
AGENTS.md §5 and forces an extra refetch. POST — both existing reorder routes are PATCH. A
per-move `PUT /:id` loop — non-atomic, N transactions, N cache evictions, cannot express a
source-bucket re-densification.

### 3.5 Error contract (machine-readable codes for a11y announcements)

**Decision.** Follow the existing repo convention, not an invented one. New
`apps/store-api/src/category/category.errors.ts` mirroring `src/discount/discount.errors.ts`: a
`CategoryErrorCode` const (`CATEGORY_CYCLE`, `CATEGORY_MAX_DEPTH`, `CATEGORY_SELF_PARENT`,
`CATEGORY_DUPLICATE_ID`, `CATEGORY_NOT_FOUND`, `CATEGORY_TREE_STALE`) plus `badCategory(code,
message)` → `new BadRequestException({ error: code, message })`, `notFoundCategory(...)` →
`NotFoundException`, `conflictCategory(...)` → `ConflictException`. The stable code travels in the
envelope's **`error`** field. It must NOT be put in a custom `code`/`categoryId`/`targetParentId`
property: the global catch-all `HttpExceptionFilter`
(`src/common/filters/http-exception.filter.ts:31-40,61-67`, registered in `main.ts`) rebuilds
every response as `{ statusCode, error, message, timestamp, path }`, reading ONLY `resp.error` and
`resp.message` — any extra field is silently discarded and would never reach the announcement
layer. The client does not need ids in the body: the admin initiated the move, so it already knows
the moved node and the target and resolves both names from the tree it holds. The
`HttpExceptionFilter` is NOT modified.

**Rationale.** All three independent designs put the assertive announcement data on a structured
body the framework throws away — an e2e test asserting `code` on the wire would fail today. The
`discount.errors.ts` pattern is the project's answer to exactly this problem and is already
documented as such.

**Rejected alternatives.** Extending `HttpExceptionFilter` with a `details` passthrough — a global
change to every endpoint's error envelope to serve one screen, when the client already has the
ids. Free-text English messages (today's `'Cannot set parent to a descendant category (circular
reference)'`) — unannounceable to a Ukrainian operator and not switchable.

### 3.6 Layering — where the rules live (Clean Architecture deviation, stated explicitly)

**Decision.** Three-part split, so the repository emits no HTTP concerns and the service is not
forced to touch Prisma:

1. **`apps/store-api/src/category/category-reorder.rules.ts`** — PURE, no Prisma, no Nest DI.
   `MAX_CATEGORY_TREE_LEVELS = 4` (see §3.7 for the convention); `type CategorySnapshotRow = { id;
parentId; sortOrder }`;
   `validateAndResolveReorder(snapshot: CategorySnapshotRow[], groups): ResolvedWrite[]`. Builds
   the post-batch adjacency map, runs every guard, returns the exact `{ id, parentId, sortOrder }`
   writes (rows already at their target are OMITTED). Throws domain error classes
   (`CategoryCycleError`, `CategoryMaxDepthError`, `CategorySelfParentError`,
   `CategoryDuplicateIdError`, `CategoryNotFoundError`, `CategoryTreeStaleError`) declared
   alongside the code constants in `category.errors.ts`.
2. **`CategoryRepository.applyTreeMoves(groups)`** — owns the `$transaction`, the advisory locks,
   the in-tx snapshot read, the `findDescendantIds(id, tx)` re-check, the `updateMany` writes, and
   the post-write tree re-read. Calls the pure rules module; lets the domain errors propagate.
   NEVER constructs HTTP exceptions.
3. **`CategoryService.reorderTree(dto)`** — orchestration: calls `applyTreeMoves`, catches domain
   errors and MAPS them to `badCategory/notFoundCategory/conflictCategory` (HTTP), then runs the
   post-commit side effects (§3.13) and returns `{ data: tree }`.

This inversion — authoritative validation executing inside the repository transaction, for TOCTOU
reasons — is a deliberate, documented deviation from the AGENTS.md "services contain business
logic only" convention: the _rules_ live outside both layers (pure module), the repository merely
EXECUTES them under the lock, and the service still owns HTTP mapping and all side effects.

**Rationale.** A guard evaluated outside the transaction (as `CategoryService.update` does today
via `this.prisma`) cannot see the batch's own uncommitted moves and races a concurrent reparent.
Pulling the rules into a pure module makes them unit-testable in milliseconds (the TDD mandate),
keeps Prisma out of them, keeps HTTP out of the repository, and gives the deviation a reviewable
shape instead of smuggling business logic into the data layer.

**Rejected alternatives.** Rules inside the repository throwing `BadRequestException`/
`ConflictException` directly — data layer emits HTTP status decisions; also untestable without
Prisma. Rules in the service, validated before calling the repository — cannot see the tx
snapshot, reopens the TOCTOU window the advisory lock exists to close. A generic
`BaseReorderService` — the four future consumers differ in guards and scope keys; the abstraction
would cost more than it saves.

### 3.7 Cycle guard placement (including multi-move batches) and depth

**Depth convention (stated once, binding everywhere).** Levels are **1-based: a root category is
level 1**. `height(subtree(node))` counts LEVELS INCLUDING the node itself (a leaf has height 1).
The structural cap is **`MAX_CATEGORY_TREE_LEVELS = 4`**, because `findCategoryTree` /
`findCategoryTreeForAdmin` are `findMany(roots)` + **three** nested `include: { children }` —
i.e. they materialise FOUR tiers (root, child, grandchild, great-grandchild). Level 4 IS returned
today; level 5 is the first tier the public tree silently drops. The rule enforced for every moved
node is therefore:

> `level(node) + height(subtree(node)) − 1 ≤ 4`

This is deliberately pinned to the ACTUAL structural cap, not to a tighter "3 levels" product
rule: the same check is added to `CategoryService.update` (§3.10.3), and a tighter cap would start
rejecting parent changes on any pre-existing level-4 category — a regression on live data. If a
3-level product rule is ever wanted, it must be a separate decision that ALSO trims both tree reads
to two nested `include`s and migrates/flags existing level-4 rows first.

Inside the ONE interactive `$transaction`, AFTER the advisory locks:

1. **Snapshot**: `tx.category.findMany({ select: { id: true, parentId: true, sortOrder: true } })`
   — the WHOLE table, NO `where` clause. Load-bearing, commented as such: a filtered snapshot
   (payload ids + affected parents only) makes both the multi-move cycle walk and the depth check
   uncomputable, because a moved node's own descendants and intermediate ancestors are absent.
   Category is a taxonomy (tens–low hundreds of rows); the full read is trivially cheap.
2. `validateAndResolveReorder(snapshot, groups)` runs, in order:
   - duplicate id (across or within groups) → `CATEGORY_DUPLICATE_ID` (400)
   - unknown id or unknown non-null `parentId` → `CATEGORY_NOT_FOUND` (404)
   - `parentId` appears in its own `orderedIds` → `CATEGORY_SELF_PARENT` (400) — closes the hole
     `PUT /:id` has today, where `findDescendantIds` excludes self so `parentId === id` is
     writable
   - POST-BATCH CYCLE over the resulting adjacency map (committed parent map overlaid with the
     batch's assignments), walking each moved node's ancestor chain with a visited set →
     `CATEGORY_CYCLE` (400)
   - DEPTH — **`level(node) + height(subtree(node)) − 1 ≤ 4`** for every moved node (convention
     above) → `CATEGORY_MAX_DEPTH` (400)
   - STALENESS — for every bucket in the server-computed affected-parent closure that the CLIENT
     described, its `orderedIds` **set** must equal that bucket's post-batch child **set** →
     `CATEGORY_TREE_STALE` (409). NOTE the consequence, which §10 depends on: two concurrent PURE
     REORDERS of the same bucket have identical member sets, so staleness does NOT fire — they are
     last-writer-wins (serialised by the lock, each rewriting a complete 0..n-1 order, so no torn
     mix is possible). 409 fires only when a described bucket's MEMBERSHIP changed underneath the
     client — i.e. a concurrent reparent into or out of it.
3. **Owner-mandated authoritative DB re-check**: for every node whose `parentId` actually
   changes, `await this.findDescendantIds(id, tx)` must not contain the new parent.
   `findDescendantIds` is widened to `findDescendantIds(categoryId: string, client:
Prisma.TransactionClient | PrismaService = this.prisma)` — the raw CTE body stays
   byte-identical, so the TASK-238 hardening and its int-tests remain the single source of truth.

**Rationale.** The DB CTE reads COMMITTED state, so a two-move payload (`A → under B`, `B → under
A`) passes both individual pre-checks and would commit a cycle; only the in-memory post-batch walk
catches it. The `level + height` form is the only correct depth rule: capping only the moved node's
own level lets a 2-level subtree dragged under a level-3 node push its grandchildren to level 5,
where the tree reads make them silently invisible to the storefront AND to the admin who would
have to drag them back. Both guards are computable ONLY over the full-table snapshot — hence the
explicit prohibition on filtering it.

**Rejected alternatives.** Per-move `findDescendantIds` only (misses multi-move cycles). In-memory
only (drops the owner-mandated reuse of the TASK-238-hardened CTE and concurrent-admin authority).
`level(node) ≤ 4` alone (silently loses the moved subtree's grandchildren). A "3 levels" cap
(rejects configurations the storefront already renders today and would fail validation on any
existing level-4 row's parent change). A filtered in-tx snapshot "for efficiency" — makes the two
headline guards non-executable, an explicit anti-goal.

### 3.8 `sortOrder` rewrite + concurrency

**Decision.** No schema change, no `isolationLevel` bump (nothing in `store-api` sets one; the
`PrismaPg` driver-adapter path is unexercised for it — do not be first), no version column. Three
layers inside `CategoryRepository.applyTreeMoves`:

1. **Postgres transaction-scoped advisory locks, at a granularity that MATCHES the granularity of
   the invariant being protected.** Acquired BEFORE the snapshot read, in SORTED key order
   (deadlock-free), via `await tx.$executeRaw\`SELECT
   pg_advisory_xact_lock(hashtextextended(${key}::text, 0))\``:
   - **Pure same-parent reorder** (no group changes any node's `parentId`) → one lock per
     affected-parent-closure bucket: **`key = 'categories:' + (parentId ?? '__root__')`**. Order
     within a bucket is a bucket-local invariant, so bucket-local locks suffice.
   - **ANY reparent in the payload** (at least one node's `parentId` changes) → **one single
     TREE-SCOPED lock, `key = 'categories:__tree__'`**, taken INSTEAD of the per-bucket keys.
     This is load-bearing and non-negotiable: **cycle and depth are WHOLE-TREE invariants, and
     per-bucket locks do not serialise the operations that violate them.** Concretely, admin A
     moving X under Y locks `{oldParent(X), Y}` while admin B moving Y under X locks
     `{oldParent(Y), X}` — DISJOINT sets. Neither waits; both snapshot before the other commits;
     both in-memory post-batch walks and both in-tx `findDescendantIds` re-checks see only
     committed rows (READ COMMITTED, and nothing in `store-api` sets an isolation level); both
     commit → an `X → Y → X` cycle lands in the table. That is textbook write skew, and it defeats
     the guarantee below. The same hole lets two disjoint batches jointly violate
     `level + height` (B deepens the destination's ancestor chain while A drops a subtree under
     it). One tree-wide lock closes both. Cost is negligible at taxonomy scale (tens–low hundreds
     of rows, sub-millisecond transactions, a handful of admins).
   - `PUT /api/admin/categories/:id` takes the SAME locks when it changes `parentId` (§3.10.4) —
     otherwise it races `applyTreeMoves` outside every lock the design relies on.

   The `'categories:'` namespace prefix is MANDATORY: advisory locks are database-global, and the
   reusable recipe gives banners/blog-categories/device-brands the same `'__root__'` bucket —
   without the prefix a banner reorder would serialise against a root-category reorder.

2. **Full-bucket rewrite**: `sortOrder = index` over each complete `orderedIds` (0..n-1,
   contiguous), applied to every bucket in the affected closure — including buckets the client
   omitted, re-densified from the snapshot order. Writes go through `tx.category.updateMany({
where: { id }, data: { parentId, sortOrder } })` (so a concurrently vanished row is a no-op
   rather than a P2025 aborting a legal batch). Rows already at their target `(parentId,
sortOrder)` are SKIPPED — avoids gratuitous `@updatedAt` churn (carried into the storefront
   sitemap `lastModified` via `CategoryTreeNodeEntity.updatedAt`).
3. **Staleness → 409** (§3.7): a lost update becomes an explicit, recoverable, announced conflict
   instead of silent corruption.

**Guarantee, asserted by integration test**: after any interleaving of concurrent
`applyTreeMoves` calls (and of `applyTreeMoves` with a `PUT /:id` parent change), every touched
bucket has `sortOrder` exactly 0..n-1 — no duplicates, no gaps — the final order equals one
submitted ordering in its entirety (never a torn mix, never writer-A's `parentId` with writer-B's
slot), and **no cycle and no over-depth configuration can be committed by any interleaving**
(guaranteed by the tree-scoped lock on any reparenting batch, not by the per-bucket locks). Two
concurrent PURE reorders of the same bucket are last-writer-wins (no 409 — identical member sets,
see §3.7); a reorder racing a reparent into/out of one of its buckets yields
`CATEGORY_TREE_STALE` (409) to the loser.

**Rationale.** `sortOrder` has no unique constraint, `findCategoryTree` orders by `sortOrder`
alone, and every `$transaction` in this repo runs at READ COMMITTED — so two concurrent reorders
can silently produce duplicate/gapped orders. Advisory locks are the cheapest correct
serialisation with no schema and no isolation-level dependency; the declarative full-bucket
payload is what makes the loser of a race overwrite cleanly rather than interleave.

**Rejected alternatives.** `isolationLevel: 'Serializable'` + 40001 retry plumbing — zero
precedent in the repo, untested with the driver adapter, heavy for a taxonomy screen. `SELECT …
FOR UPDATE` on the sibling set — does not cover the root bucket (no parent row to lock) and does
not protect against a concurrently INSERTED sibling. Two-phase negative-offset writes —
unnecessary (no unique constraint), pure ceremony. Un-namespaced advisory keys — cross-resource
false contention once the primitive is reused.

### 3.9 Deterministic sibling ordering for legacy all-zero rows

**Decision.** Add `{ id: 'asc' }` as a tiebreaker to the sibling `orderBy` on BOTH read paths —
`findCategoryTree` (public) and the new flat admin read — i.e. `orderBy: [{ sortOrder: 'asc' },
{ id: 'asc' }]` at every level. Query change, NOT a schema change. Additionally, the batch
endpoint resequences every bucket in the affected closure, so buckets heal to 0..n-1 the first
time they are touched.

**Rationale.** Every existing row has `sortOrder = 0` and today's `orderBy: { sortOrder: 'asc' }`
has NO tiebreaker, so sibling order is DB-arbitrary and can change between requests — an
operator's drag can appear to move unrelated rows, and the storefront's category order is
nondeterministic today. Reordering only heals buckets the admin happens to touch; the tiebreaker
heals the rest for free.

**Rejected alternatives.** A one-shot "resequence every bucket" admin action or data migration —
larger blast radius, unnecessary once the tiebreaker exists. Leaving it alone — the exact bug
TASK-291 exists to kill would survive in every untouched bucket.

### 3.10 Aligning the other write paths (`PUT /:id`, `POST`)

**Decision.** In scope, required for the design to hold:

1. **Remove `sortOrder`** from `UpdateCategoryDto` and `CreateCategoryDto` — once the number input
   is gone, the only writer of `sortOrder` is the batch endpoint; leaving `@IsInt @Min(0)
sortOrder` on `PUT /:id` lets a stale/scripted call re-introduce a duplicate `0` into a bucket
   the batch just densified.
2. **`CategoryRepository.create()` appends to the end of its bucket** (`sortOrder = max(sortOrder
of siblings) + 1`) instead of the hard `0` — otherwise every newly created category
   materialises at the top of (or arbitrarily within) its siblings, with no input left to fix it.
3. **The `update` parent-change path gains the missing `parentId !== id` self-parent guard and the
   same `level + height − 1 ≤ 4` check**, reusing `category-reorder.rules.ts` helpers.
4. **`PUT /:id`'s parent change is routed through the SAME locked repository path as
   `applyTreeMoves`.** This is required, not optional: the parent `<Select>` is deliberately KEPT
   (§7.6.3) as the WCAG 2.5.7 fallback, and with `sortOrder` removed from the DTO the PUT path
   would otherwise write NO `sortOrder` at all — dropping the node into the destination bucket
   carrying its OLD integer (duplicate or gap) and leaving a hole in the source bucket, i.e.
   breaking the very invariant §3.8 guarantees. It would also race `applyTreeMoves` outside every
   advisory lock, re-opening the TOCTOU cycle window. Concretely, when `input.parentId` changes,
   `CategoryRepository.update` runs inside its existing interactive `$transaction` and must:
   take the SAME namespaced advisory lock(s) as a reparenting batch (the tree-scoped
   `'categories:__tree__'` key, §3.8), run the same self-parent / cycle / depth guards against an
   in-tx snapshot, assign `sortOrder = max(destination siblings) + 1` (the same append rule
   §3.10.2 gives `create()`), and **re-densify the source bucket to 0..n-1**. `create()` takes the
   destination bucket's lock for the same reason (its `max + 1` read must not race a concurrent
   append or resequence).

Existing unit/e2e tests for create/update are updated accordingly; an int-spec case covers a
concurrent `PUT`-reparent + `applyTreeMoves` on overlapping buckets (TASK-291-C/D).

**Rationale.** Deleting the hand-edited number input without closing the other write paths leaves
a back door that silently re-breaks the tiebreaker-less ordering the whole design depends on, and
leaves creation placement undefined. This is completion of the same invariant, not scope creep.

**Rejected alternatives.** Leaving `sortOrder` writable on `PUT` "for compatibility" — the admin
UI no longer sends it, so it exists only as a corruption vector. Leaving `create()` at `0` and
telling operators to drag afterwards — guaranteed day-one complaint with no recovery affordance
other than a drag.

### 3.11 Tree vs flat table (view decision) and bulk activate/deactivate

**Decision.** The tree REPLACES the flat paginated table.
`apps/store-admin/src/app/(dashboard)/categories/page.tsx` renders the new `<AdminCategoryTree/>`
widget; `widgets/category-list/` (`admin-category-table.tsx` + skeleton + barrel) is DELETED,
replaced by `widgets/category-tree/` with its own skeleton. Pagination is removed from the screen.
`GET /api/admin/categories` (paginated, with `productCount`) and its Orval hook are KEPT (route
unchanged, e2e coverage stays) but **no longer feed any UI**: the edit form's parent `<Select>`
and the "Перемістити до…" dialog's parent `<Select>` are BOTH re-fed from
`useCategoryControllerGetAdminTree` (the complete, uncapped admin tree, which after §3.3 carries
`parentId` + `depth`), and compute their self+descendant exclusion from that tree. Today's
`limit: 100` flat page is a partial graph: a descendant beyond the cap is simply absent from the
option list, so a descendant-exclusion computed over it silently UNDER-excludes, and a legitimate
parent may not be selectable at all — unacceptable for a control the plan deliberately keeps as
the WCAG 2.5.7 fallback (§7.6.3). Search survives as a CLIENT-SIDE filter over
the fully-loaded admin tree: `?search=` URL param and `<form role="search">` preserved; matches
shown WITH their full ancestor chain (ancestors auto-expanded, rendered dimmed as non-draggable
context), matching substring highlighted; empty result reuses `dict.categories.emptyMatch`. While
a filter is active, DnD and all move actions are DISABLED (handles `aria-disabled="true"`, a
visible hint, and a polite announcement «Пошук активний. Очистіть пошук, щоб змінювати порядок.»)
— the visible order is not the real sibling order and a "complete bucket" payload built from it
would be wrong. Expanded/collapsed ids persist per-admin in `localStorage` under
`admin:category-tree:expanded` (default: roots expanded, level 2 collapsed); a search
auto-expands the ancestors of every match and restores the prior state on clear. Columns kept:
Назва (indent + twisty + grip + name), Slug (`hideOnMobile`), Товари (`productCount`), Статус
(existing `CategoryStatusToggle`), Дії. The Батьківська and Порядок columns are deleted — that
information IS the tree now.

**Bulk activate/deactivate.** DEFERRED to a **new** follow-up task (filed at implementation time
as the next free BACKLOG id, working title «Дерево категорій: множинний вибір + масова активація/
деактивація»). NOT in TASK-291. The per-row `features/category-status-toggle` is carried into the
tree, but with ONE mandatory change shipped NOW: deactivating a node that has descendants must
state the blast radius **before the mutation fires**. **The mechanism is binding, not a choice: a
`window.confirm`**, following the existing TASK-285 precedent in
`widgets/category-form-view/ui/edit-category-view.tsx` (a toast is explicitly NOT acceptable — it
fires AFTER the write and therefore cannot satisfy "before it commits"). Copy:
«„{name}“ буде приховано разом із N підкатегоріями», N computed from the tree already in memory
(no extra request). Cancel → ZERO mutation calls and focus returns to that row's status-toggle
button (§7.5). A leaf node shows NO confirmation at all. Reason: `findCategoryTree` filters
`isActive` at EVERY
level, so deactivating a parent hides its still-ACTIVE children from the storefront — and the new
tree UI puts those children right on screen, making the operator MORE likely to believe they are
unaffected. The treegrid ships WITHOUT `aria-selected` / `aria-multiselectable` in v1; adding them
later is additive and touches no move logic.

**Rationale (view decision).** Coexistence means two truths about order and parentage. The flat
table is also actively broken: its parent-name `Map` is built from the CURRENT PAGE ONLY, so a
parent on another page renders «—». A tree over a paginated slice is incoherent (cannot drag onto
an unrendered row). Categories are a bounded taxonomy and every sibling admin list is already
unpaginated. Expanded-state persistence and ancestor context are what make the screen usable after
the tenth round trip to an edit page.

**Rationale (bulk deferral).** The task marks it optional, and it is orthogonal to DnD: it needs a
selection model (checkbox column, `aria-multiselectable`, Shift-range, a bulk-actions bar) whose
key contract collides with move-mode's `Space`, PLUS its own endpoint (none exists), PLUS an
unresolved product decision about cascade semantics on reactivation. Landing both in one task
guarantees the accessibility of DnD — the hard acceptance criterion — is what gets shortchanged.
Nothing regresses (single-row toggling still works); the blast-radius count is the one part that
is a live correctness/UX bug the new UI amplifies, so it ships now.

**Query-key invalidation (mandatory, easy to miss).** The tree reads
`useCategoryControllerGetAdminTree`, whose query key NOTHING invalidates today.
`features/category-status-toggle` currently invalidates only
`getAdminCategoryControllerFindAllWithProductCountQueryKey()`, and
`widgets/category-form-view/ui/edit-category-view.tsx` invalidates that key plus
`...FindByIdQueryKey`. All three (status toggle, edit view, create view) MUST additionally
invalidate `getCategoryControllerGetAdminTreeQueryKey()` (re-exported through the
`entities/category` barrel, TASK-291-H) — otherwise a status toggle, a rename, or a parent change
made through the kept `<Select>` leaves the tree showing stale data until a hard reload.

**Rejected alternatives.** Keeping the table and adding a tree tab — double maintenance, double
invalidation surface, preserves the parent-column bug. Keeping pagination and paging the roots —
cannot drop onto a row on another page. Deleting `GET /api/admin/categories` — kept for API
consumers and its existing e2e coverage, at zero cost. Building bulk toggle in TASK-291 (multiplies the ARIA surface exactly
where the risk is). Building it as a drag gesture (never — it is a selection action). Shipping the
per-row toggle unchanged (the subtree-invisibility trap becomes more misleading in a tree than in
a flat table).

### 3.12 A11y / keyboard / announcement model — see §7 for the full contract

Summarised here for the decision record; full detail (roles, keyboard table, announcement
strings, focus rules) is in §7 to avoid duplication.

**Decision.** `role="treegrid"` (not `tree`, not nested `<ul>`), flat DOM rows, hierarchy carried
by authored ARIA (`aria-level`/`aria-posinset`/`aria-setsize`/`aria-expanded` only on parent
rows), roving `tabindex`. Two permanently-mounted live regions (`role="status" aria-live="polite"`
for progress, `role="alert" aria-live="assertive"` for rejections). Navigation mode + move mode
(outline-editor style: ↑/↓ reorder within siblings, ←/→ indent/outdent), plus mode-free
`Alt+Shift+↑/↓` and `Alt+Shift+←/→` accelerators (NOT `Alt+←/→`, which are the browser's
Back/Forward shortcuts on Windows). Illegal targets are never offered (client-side `subtree(X)` exclusion
mirrors the server cycle guard) — server rejection is a defensive path for concurrent admins only.

**Rationale.** Rows carry action buttons (twisty, status toggle, grip, menu, edit), which the APG
`tree` pattern explicitly does not address, while the `treegrid` pattern is defined for exactly
that and specifies Tab-into-row-controls. The polite/assertive split prevents key-repeat from
stuttering over screen-reader row echo.

**Rejected alternatives.** `role="tree"` + one actions menu per node — documented Plan B only,
adopted ONLY if real screen-reader manual QA finds treegrid mode-switching intolerable. Nested
`<ul>/<li>` — no position/level/row semantics. dnd-kit's default single assertive region — too
shouty for a 40-row tree. Long instructions on every row — verbosity regression.

### 3.13 Cache, revalidation and Meilisearch on batch write

**Decision.** All side effects fire ONCE, in `CategoryService.reorderTree`, AFTER the transaction
commits — never inside the tx, never per move:

1. `await this.cache.delByPrefix(PRODUCT_LIST_PREFIX)` — a reparent changes `findSubtreeIds`
   membership, baked into the category-filtered product-list cache key rollup (TTL 300s).
   `CategoryService` gains a `CacheService` injection (`CacheModule` is `@Global()`). Same
   eviction added to `CategoryService.update`'s parent-change path (a pre-existing hole).
2. **Meilisearch subtree re-index — IN SCOPE, and its module wiring is specified here because the
   naive version does not compile.** Product documents carry `categoryIds` = the ancestor chain
   computed AT INDEX TIME (`search.service.ts:243`), and no category write re-indexes today. This
   plan turns reparenting from a rare hand-edit into a one-second gesture, so shipping the
   accelerator without the fix knowingly amplifies a correctness bug (category-filtered storefront
   search silently returns wrong products).

   **Wiring (binding).** `SearchModule` ALREADY imports `CategoryModule` (for
   `CategoryRepository.findAncestorIds`, `search.module.ts:27`), and its own doc-comment states the
   edge is kept one-directional to avoid a circular module reference. Injecting `SearchService`
   into `CategoryService` would therefore create exactly that cycle. Instead, mirror the existing
   `ProductIndexer` seam (`src/search/product-indexer.ts` — an abstract class provided + exported
   by `SearchModule`, consumed by `ProductModule`):
   - New abstract port **`CategorySubtreeIndexer`** in `src/common/ports/category-subtree-indexer.port.ts`
     (a neutral file with ZERO imports, so there is no file-level import cycle):
     `abstract reindexSubtrees(rootCategoryIds: string[]): Promise<void>` — best-effort, always
     resolves.
   - Concrete `SearchCategorySubtreeIndexer` in `src/search/`, provided + exported by
     `SearchModule`. It resolves the affected products with the module-local `ProductRepository`
     (SearchModule already provides its own instance) via a NEW
     `ProductRepository.findIdsByCategoryIds(categoryIds: string[]): Promise<string[]>` — this
     method does not exist today and is added in TASK-291-D — expanding each moved root through
     `CategoryRepository.findSubtreeIds`, then calling `SearchService.indexProduct` per id,
     log-and-continue on failure.
   - `CategoryModule` imports `forwardRef(() => SearchModule)` and `SearchModule`'s existing
     `CategoryModule` import becomes `forwardRef(() => CategoryModule)` — Nest requires the
     `forwardRef` on BOTH sides of a module cycle. `CategoryService` injects the port by its
     neutral token; unit tests inject a mock, exactly as `product.service.spec.ts` does for
     `ProductIndexer`.
   - `CategoryService.reorderTree` calls `reindexSubtrees(movedRootIds)` ONCE after commit
     (the moved-node set is already computed by the cycle guard), fired best-effort and
     NON-BLOCKING. A Meili outage must not fail the admin request.

3. A structured Pino line after commit: `{ event: 'category.reorder', groups, movedIds, actorId
}` — there is no audit logging anywhere in `store-api` and this is a destructive many-row
   write.
4. **Storefront ISR revalidation: OUT of scope**, filed as a follow-up BACKLOG row (next free id
   at implementation time; working title «Storefront ISR-ревалідація для категорій»). Categories
   implement no `PublishablePort`, inject no `RevalidationNotifier`, and the storefront's
   `categoryControllerGetCategoryTree()` call sites carry no `next: { tags }` — so there is no
   `categories` tag to purge. Adding one requires a `categories-server.ts` shim in `store-client`
   (following `faq-server.ts`) and touches the public read path. Recorded in
   `docs/manual-qa-pending.md` and BACKLOG, not silently skipped.

   > **Correction (2026-07-13, TASK-294 — closed as invalid).** The reasoning above stops one step
   > short. There is no `categories` tag to purge because **nothing caches category order**: every
   > storefront surface that renders it is a client component on react-query, and the two server
   > readers (`/categories/[slug]`, `/products`) `await searchParams` — which makes them dynamic —
   > and fetch through axios, which does not participate in Next's fetch cache. So the storefront
   > was never stale, and the follow-up had nothing to build. See §12.

**Rationale.** Firing per move would mean N Redis round-trips and N HTTP pings inside one admin
request. The Redis eviction is a one-line, precedented fix. Meilisearch is the one pre-existing
hole that must not be waved through: the feature being shipped is precisely what makes it fire
constantly. Revalidation genuinely needs new plumbing on the storefront and is a defensible
separate task.

**Rejected alternatives.** Declaring Meilisearch out of scope (ships a reparent accelerator that
knowingly corrupts search results until someone remembers a manual reindex). Blocking the reorder
on a Meili write (an indexing outage would break the admin panel). Doing revalidation inside
TASK-291 (needs a storefront tag + shim; genuinely separate).

### 3.14 Test strategy (bottom-up, Red before Green; batch endpoint is TDD-mandatory)

**Decision.** Full pyramid, detailed in §9. Headline point: a blocking spike (Test 0, §9) proves
`tx.$executeRaw` binds a text param into `pg_advisory_xact_lock(hashtextextended($1::text, 0))`
under Prisma 7 + the `PrismaPg` driver adapter, and that two interactive `$transaction`s fired
concurrently through one `PrismaService` do not deadlock or exhaust the pool — BEFORE the rest of
the concurrency design is trusted, because there is zero advisory-lock/isolation precedent
anywhere in `src/`.

**Rationale.** The pure rules module makes the decisive cycle/depth/staleness cases testable at
unit speed instead of hiding them in a 30s Postgres suite; the int-spec then proves the things
only a real DB can. The advisory-lock spike is promoted to a blocking step because the entire
concurrency design depends on raw SQL with no precedent in this codebase.

**Rejected alternatives.** Proving concurrency in e2e (repos are mocked there — cannot). Relying
on Playwright for pointer DnD (`store-admin` is not booted by `playwright.config.ts`, and
`seed-e2e.ts` seeds no admin user). Skipping the spike and discovering the `hashtextextended`
binding problem inside a hanging Red test.

## 4. Reusable primitive for banners / blog-categories / device-brands / product-groups

Reuse is delivered as SHARED CODE where cheap and as a DESIGNED CONTRACT where it is not — and
nothing unwired ships.

**Backend (shared code, built now):** `src/common/dto/reorder.dto.ts` (`ReorderGroupDto`,
`ReorderTreeDto`, `ReorderFlatDto` — §3.4) and `src/common/reorder/sibling-order.util.ts`
(`writeSiblingOrder(delegate, orderedIds, scope)` → the `updateMany({ where: { id, ...scope },
data: { sortOrder: index } })` ops, plus the namespaced advisory-lock helper). A flat resource's
endpoint is then ~15 lines: `PATCH /api/admin/<resource>/reorder` with `ReorderFlatDto` →
`$transaction(lock('<resource>:__root__') + writeSiblingOrder(...))`, no cycle/depth guards (flat
is the degenerate one-bucket, reparent-free case of the tree contract). Verified: no `@@unique`
touches `sortOrder` on `Banner` / `BlogCategory` / `DeviceBrand` / `ProductGroup` either, so the
same rewrite is safe there.

**Frontend (ONE primitive, built now):** `shared/lib/sortable-tree/` (pure: `flattenTree`,
`buildTree`, `getProjection`, `removeChildrenOf` [vendored, MIT header] + our measurement-free
`applyMove(items, movingId, { targetParentId, targetIndex })` reducer, the
`projectionToInsertionPoint()` pointer adapter, and `toReorderGroups(prev, next)`) and
`shared/ui/sortable-tree/`

- `shared/ui/live-announcer/` (the two `sr-only` regions + `useAnnouncer()`). Entity-agnostic:
  `{ items: {id, parentId, label, disabled?}[], maxDepth, renderRow, onMove(groups),
announcements?, disabled? }`. **`maxDepth: 1` collapses it into exactly the flat sortable list**
  (depth projection unreachable, ←/→ become no-ops, `restrictToVerticalAxis` applied, constant
  `aria-level`) — this is why there is ONE primitive and no separate `sortable-list`. `onMove` emits
  an ordered-id payload, NOT a mutation, so `product-groups` (whose RHF `useFieldArray` axes are
  already index-positional) can consume it with no endpoint at all.

**Follow-up rows (not built now):** a new task for banners + blog-categories + device-brands
(endpoint + wire the primitive + delete the `sortOrder` `<Input>`, its zod field and its
`errors.sortInt` dict key from each form) and a new task for product-groups (axis move affordance,
UI only). Both filed at implementation time (§12).

**Rationale.** The owner asked for the mechanics to be DESIGNED reusable, not for dead code.
Shipping an unwired `shared/ui/sortable-list/` would be speculative surface with no consumer and
no test; `maxDepth: 1` gives the same reuse for free. The backend DTO + util are cheap shared code
with an immediate use (the tree consumes them), so they are hoisted now.

**Rejected alternatives.** Building and shipping an unwired `shared/ui/sortable-list/` primitive.
A generic `BaseReorderController`/abstract repository base class — consumers differ in guard,
scope key and module wiring; Nest decorator inheritance would cost more than the ~15 lines it
saves. A prose-only "copy this recipe" plan with no shared DTO/util — leaves the four consumers to
re-derive the advisory-lock and resequencing rules and get them subtly wrong.

## 5. Task Breakdown (bottom-up, numbered)

All tasks share BACKLOG row **TASK-291**; the letters below are an internal work breakdown, not
separate BACKLOG rows (mirrors the plan-154 convention for a single large task).

---

### 1. TASK-291-A — Backend: pure reorder rules module + domain errors (TDD, RED first)

**Type:** feat · **Scope:** store-api · **Complexity:** M (2-4h) · **TDD Required:** Yes ·
**Depends on:** —

**Acceptance Criteria:**

- [ ] `category.errors.ts` created: `CategoryErrorCode` const + domain error classes
      (`CategoryCycleError`, `CategoryMaxDepthError`, `CategorySelfParentError`,
      `CategoryDuplicateIdError`, `CategoryNotFoundError`, `CategoryTreeStaleError`) + HTTP
      mapping helpers (`badCategory`, `notFoundCategory`, `conflictCategory`) mirroring
      `src/discount/discount.errors.ts`
- [ ] `category-reorder.rules.ts`: `MAX_CATEGORY_TREE_LEVELS = 4` (1-based levels, root = level 1
      — §3.7), `CategorySnapshotRow` type, `validateAndResolveReorder(snapshot, groups):
ResolvedWrite[]` — no Prisma import, no Nest DI import
- [ ] Unit spec `category-reorder.rules.spec.ts` (RED before implementation) covers: duplicate id
      (across/within groups); unknown id/parent; self-parent (`parentId ∈` its own `orderedIds`);
      single-move cycle; **multi-move cycle** (A→under B and B→under A in one payload, each
      individually legal against the pre-batch graph); **depth via `level + height − 1 ≤ 4`** (drag
      a 2-level subtree under a level-3 node → `CATEGORY_MAX_DEPTH`; the same subtree under a
      level-2 node → ACCEPTED, since level 4 is legal); stale bucket set (a described bucket's
      MEMBERSHIP changed) → `CATEGORY_TREE_STALE`; two concurrent same-bucket REORDERS have equal
      member sets → NOT stale (last-writer-wins, §3.7); empty `orderedIds` (last child leaves a
      parent) → ACCEPTED; affected-
      parent closure includes a source bucket the client omitted, re-densified; rows already at
      target omitted from the write list; happy paths (1-group reorder, 2-group reparent) produce
      contiguous 0..n-1
- [ ] Tests pass: `npm run test -w apps/store-api -- category-reorder.rules`
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/category/category.errors.ts`
- `apps/store-api/src/category/category-reorder.rules.ts`
- `apps/store-api/src/category/category-reorder.rules.spec.ts`

---

### 2. TASK-291-B — Backend: advisory-lock spike (BLOCKING, throwaway)

**Type:** test · **Scope:** store-api · **Complexity:** S (1-2h) · **TDD Required:** No (spike,
not shipped code) · **Depends on:** —

**Acceptance Criteria:**

- [ ] A throwaway `test/category-reorder-lock-spike.int-spec.ts` proves: (a) `tx.$executeRaw`
      binds a text param into `pg_advisory_xact_lock(hashtextextended($1::text, 0))` under Prisma
      7 + the `PrismaPg` driver adapter without a type error; (b) two interactive `$transaction`s
      fired via `Promise.all` through one `PrismaService`, each acquiring the SAME advisory-lock
      key, serialise correctly (second waits for the first to commit) and neither deadlocks nor
      exhausts the connection pool
- [ ] If the spike FAILS: fall back to a single table-scoped advisory lock (one lock for ALL
      category reorders, `'categories:__all__'`) — document the fallback decision inline before
      proceeding to TASK-291-C
- [ ] Spike file deleted (or clearly marked throwaway and excluded from `testRegex`) once
      TASK-291-C's real int-spec (§9) supersedes it — do not ship a stray spike file
- [ ] Run: `npm run test:int -w apps/store-api` (real Postgres, `store_test`, already
      `--runInBand` per the npm script)

**Files to create/modify:**

- `apps/store-api/test/category-reorder-lock-spike.int-spec.ts` (throwaway, deleted before
  merge)

---

### 3. TASK-291-C — Backend: repository — `applyTreeMoves`, admin tree rewrite, `findDescendantIds` tx-widening

**Type:** feat · **Scope:** store-api · **Complexity:** L (4-8h) · **TDD Required:** Yes ·
**Depends on:** TASK-291-A, TASK-291-B

**Acceptance Criteria:**

- [ ] `CategoryRepository.findCategoryTreeForAdmin()` rewritten as a single flat `findMany`
      (`select: id, name, slug, parentId, isActive, sortOrder, updatedAt` + `_count.products
(isActive: true)`, `orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]`), assembled into a tree
      in-repository; new `AdminCategoryTreeNodeEntity` (`parentId`, `productCount`, `depth` added
      to the existing tree-node fields)
- [ ] `findCategoryTree`'s sibling `orderBy` gains the `{ id: 'asc' }` tiebreaker at every nesting
      level (§3.9) — public entity/route untouched otherwise
- [ ] `findDescendantIds(categoryId, client: Prisma.TransactionClient | PrismaService =
this.prisma)` — signature widened, raw CTE body byte-identical; existing callers (
      `category.service.ts` non-tx path) unaffected; TASK-238's int-spec still passes unmodified
- [ ] `CategoryRepository.applyTreeMoves(groups: ReorderGroupDto[]): Promise<AdminCategoryTreeNodeEntity[]>`
      implemented per §3.6/§3.7/§3.8: one interactive `$transaction`, sorted-key advisory locks
      taken BEFORE the snapshot read — per-bucket keys (`'categories:' + (parentId ?? '__root__')`)
      for a pure same-parent reorder, the **single tree-scoped key `'categories:__tree__'` whenever
      ANY group changes a node's `parentId`** (§3.8, non-negotiable) — full-table snapshot read,
      calls `validateAndResolveReorder`, re-checks `findDescendantIds(id, tx)` for every actually-
      reparented node, writes via `updateMany` (skip rows already at target), returns the
      refreshed admin tree
- [ ] `CategoryRepository.create()` appends to end of sibling bucket
      (`sortOrder = max(siblingSortOrder) + 1`, defaulting to `0` for the first child) instead of
      hard `0` (§3.10), taking the destination bucket's advisory lock so the `max + 1` read cannot
      race a concurrent append or resequence
- [ ] `CategoryRepository.update()`'s parent-change path routed through the same locked path
      (§3.10.4): tree-scoped advisory lock, in-tx guards, `sortOrder = max(destination siblings)
  - 1`, source bucket re-densified to 0..n-1 — all inside its existing interactive
`$transaction` (which already writes the slug-redirect ledger)
- [ ] Integration tests (real Postgres, `test/category-reorder.repository.int-spec.ts`, bootstrap
      copied from `test/category.repository.int-spec.ts:45-76`): reorder within a parent;
      reparent across parents (source re-densified, no hole; `findDescendantIds(newAncestor)` now
      contains the subtree); ATOMICITY (a payload whose last group names a non-existent parent
      leaves EVERY row byte-identical); cycle on a real graph (`findDescendantIds(id, tx)` path);
      `level + height − 1 ≤ 4`; **concurrent collision** — `Promise.all` of two `applyTreeMoves` on
      the same parent with different orderings → no crash, final order equals exactly ONE submitted
      ordering, `sortOrder` exactly 0..n-1, no duplicates/gaps, no 409 (equal member sets = pure
      last-writer-wins, §3.7); **concurrent INVERSE reparents** — `Promise.all([applyTreeMoves(X
under Y), applyTreeMoves(Y under X)])` → exactly one succeeds, the other throws
      `CategoryCycleError`, and the committed table contains NO cycle (this test FAILS with
      per-bucket locks and passes only with the tree-scoped lock); concurrent reparent+reorder of
      the same node → never writer-A's `parentId` with writer-B's slot, and the reorder loser gets
      `CategoryTreeStaleError` (its bucket's membership changed); concurrent `update()`
      parent-change + `applyTreeMoves` on overlapping buckets → serialised, still 0..n-1, no cycle;
      idempotence (replaying the payload is a no-op, `updatedAt` unchanged)
- [ ] Tests pass: `npm run test:int -w apps/store-api` (already `--runInBand`)
- [ ] `npm run test -w apps/store-api -- category.repository` (existing unit specs stay green)
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/category/category.repository.ts`
- `apps/store-api/src/category/entities/admin-category-tree-node.entity.ts`
- `apps/store-api/src/category/category.repository.spec.ts` (existing unit specs updated)
- `apps/store-api/test/category-reorder.repository.int-spec.ts`
- `apps/store-api/test/category.repository.int-spec.ts` (verify still green, `findDescendantIds`
  signature widening)

---

### 4. TASK-291-D — Backend: service orchestration, side effects, PUT/POST alignment

**Type:** feat · **Scope:** store-api · **Complexity:** M (2-4h) · **TDD Required:** Yes ·
**Depends on:** TASK-291-C

**Acceptance Criteria:**

- [ ] `CategoryService.reorderTree(dto: ReorderTreeDto): Promise<{ data:
AdminCategoryTreeNodeEntity[] }>` — calls `applyTreeMoves`, catches each domain error class
      and maps to the matching HTTP helper from `category.errors.ts`, then runs post-commit side
      effects (§3.13): `cache.delByPrefix(PRODUCT_LIST_PREFIX)` exactly once; a single best-effort,
      non-blocking `categorySubtreeIndexer.reindexSubtrees(movedRootIds)` (log-and-continue on
      failure); one structured Pino line `{ event: 'category.reorder', groups, movedIds, actorId }`
- [ ] `CategoryService` gains `CacheService` injection (from the `@Global()` `CacheModule`, no
      module import needed)
- [ ] **Meilisearch wiring per §3.13.2** — new neutral port
      `src/common/ports/category-subtree-indexer.port.ts` (abstract class, zero imports); concrete
      `SearchCategorySubtreeIndexer` in `src/search/`, provided + exported by `SearchModule`; new
      `ProductRepository.findIdsByCategoryIds(categoryIds)`; `CategoryModule` imports
      `forwardRef(() => SearchModule)` and `SearchModule`'s `CategoryModule` import becomes
      `forwardRef(() => CategoryModule)` (Nest needs it on BOTH sides). Verify the app still boots:
      `npm run build -w apps/store-api` + at least one e2e suite that instantiates `AppModule`
- [ ] `CategoryService.update`'s parent-change path gains: the `parentId !== id` self-parent guard
      and the `level + height − 1 ≤ 4` check (reusing `category-reorder.rules.ts` helpers), PLUS the
      same `cache.delByPrefix(PRODUCT_LIST_PREFIX)` eviction and the same
      `reindexSubtrees([movedId])` call on its own parent-change path (pre-existing holes, §2.1)
  - **Accepted deviation (as shipped).** The DEPTH check is enforced ONCE, inside
    `CategoryRepository.prepareReparent`, against the in-transaction snapshot held under the
    tree advisory lock (§3.10.4); the service only maps the resulting `CategoryMaxDepthError`
    to its coded 400 via `toHttp`. Running `assertMoveDepth` in the service too would need a
    second, UNLOCKED full-table snapshot read whose verdict the repository would immediately
    re-take anyway. The self-parent guard IS in the service (a free fast-fail) and is also
    re-checked under the lock. Wire contract unchanged: 400 `CATEGORY_MAX_DEPTH`.
  - **Accepted deviation (as shipped).** The eviction/reindex are gated on the repository's
    AUTHORITATIVE in-transaction verdict — `CategoryRepository.update()` returns
    `{ category, reparented }` (the single-node twin of `TreeMovesResult.movedIds`) — NOT on
    the service's pre-lock `input.parentId !== category.parentId` comparison, which a
    concurrent reparent can invalidate (a full-object PUT re-sending the stale parent would
    look like "no change" while the repository legitimately moves the node back, silently
    rotting the cache and the indexed ancestor chains).
- [ ] `sortOrder` removed from `CreateCategoryDto` and `UpdateCategoryDto` (§3.10); existing
      create/update unit + e2e tests updated to drop `sortOrder` assertions
  - ⚠️ **Cross-app breaking change — the branch must land ATOMICALLY.** This narrows the
    generated Orval `CreateCategoryDto`/`UpdateCategoryDto`, and `store-admin`'s
    `features/category-form/model/category-schema.ts` still sends `sortOrder` until
    TASK-291-F/G delete that input. Between the two slices `npm run typecheck -w
apps/store-admin` FAILS (`TS2353 … 'sortOrder' does not exist`). Do NOT merge the
    backend-only slice into `develop` on its own.
- [ ] Unit tests (`category.service.spec.ts`): domain error → correct HTTP class AND the code
      lands in the envelope's `error` field; repository called EXACTLY ONCE per `reorderTree` call
      (one transaction, not N); `cache.delByPrefix` called exactly once, AFTER the repo call — for
      BOTH `reorderTree` and `update`'s parent-change path; `reindexSubtrees` called exactly once
      with the CORRECT moved-root ids (assert the argument, not just the call); a Meili failure does
      NOT fail the request; `update`'s new self-parent/depth guards each have a dedicated rejection
      case
- [ ] Tests pass: `npm run test -w apps/store-api -- category.service`
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/category/category.service.ts`
- `apps/store-api/src/category/category.service.spec.ts`
- `apps/store-api/src/category/category.module.ts` (`forwardRef(() => SearchModule)`)
- `apps/store-api/src/category/dto/create-category.dto.ts`
- `apps/store-api/src/category/dto/update-category.dto.ts`
- `apps/store-api/src/common/ports/category-subtree-indexer.port.ts`
- `apps/store-api/src/search/category-subtree-indexer.ts` (+ `search.module.ts` providers/exports/
  `forwardRef(() => CategoryModule)`)
- `apps/store-api/src/product/product.repository.ts` (`findIdsByCategoryIds`)

---

### 5. TASK-291-E — Backend: controller, shared DTO/util, Swagger, e2e

**Type:** feat · **Scope:** store-api · **Complexity:** M (2-4h) · **TDD Required:** Yes ·
**Depends on:** TASK-291-D

**Acceptance Criteria:**

- [ ] `src/common/dto/reorder.dto.ts` created: `ReorderGroupDto`, `ReorderTreeDto`,
      `ReorderFlatDto` per §3.4 (shared, hoisted for future flat-resource reuse — §4)
- [ ] `src/common/reorder/sibling-order.util.ts` created: `writeSiblingOrder(delegate, orderedIds,
scope)` + the namespaced advisory-lock helper (`lockKey(resource, parentId)`), extracted
      from `applyTreeMoves`'s lock logic so it's genuinely shared (§4)
- [ ] `apps/store-api/src/category/dto/reorder-categories.dto.ts` extends `ReorderTreeDto`
- [ ] `AdminCategoryController` gains `PATCH /admin/categories/reorder`, declared BEFORE the
      `:id` routes, `@HttpCode(200)`, `@ApiBearerAuth('access-token')`,
      `operationId: 'adminCategoryControllerReorder'`, `@ApiResponse` 200/400/403/404/409, new
      `AdminCategoryTreeResponse` envelope class registered in the existing `@ApiExtraModels(...)`
- [ ] e2e (`test/category.e2e-spec.ts`, repos mocked, extend `categoryRepositoryMock:57-73` with
      `applyTreeMoves` + the new admin tree method or the whole file breaks): 401/403 without an
      admin JWT; 400 on non-uuid / missing `groups` / extra property (`forbidNonWhitelisted`); an
      EMPTY `orderedIds` group is ACCEPTED (regression guard against re-adding
      `@ArrayNotEmpty()` at the group level); the 400 body's `error` field carries
      `CATEGORY_CYCLE` as it reaches the wire through `HttpExceptionFilter`; 200 → `{ data:
AdminCategoryTreeNodeEntity[] }`
- [ ] Tests pass: `npm run test:e2e -w apps/store-api -- --runInBand`
- [ ] `npm run lint -w apps/store-api` / `npm run typecheck -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/src/common/dto/reorder.dto.ts`
- `apps/store-api/src/common/reorder/sibling-order.util.ts`
- `apps/store-api/src/category/dto/reorder-categories.dto.ts`
- `apps/store-api/src/category/admin-category.controller.ts`
- `apps/store-api/test/category.e2e-spec.ts`

---

### 6. TASK-291-F — API contract regeneration

**Type:** chore · **Scope:** shared · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-291-E

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` succeeds
- [ ] `npm run generate:api` (root) regenerates Orval hooks in both `store-client` and
      `store-admin`
- [ ] Generated `useAdminCategoryControllerReorder`, `AdminCategoryTreeNodeEntity`,
      `ReorderGroupDto`/`ReorderTreeDto` (or whatever Orval names them) present in
      `store-admin`'s generated tree; `useCategoryControllerGetAdminTree`'s return type now
      includes `parentId`/`productCount`/`depth` in both apps (additive — `product-form.tsx` and
      `carousel-form.tsx` in `store-admin` keep compiling unmodified)
- [ ] No manual edits committed inside `shared/api/generated/` in either app

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/**` (gitignored)
- `apps/store-admin/src/shared/api/generated/**` (gitignored)

---

### 7. TASK-291-G — store-admin shared: dnd-kit dep, vendored tree lib, sortable-tree UI, live announcer, dictionary

**Type:** feat · **Scope:** store-admin · **Complexity:** L (4-8h) · **TDD Required:** No (pure-fn
unit tests required, not formal TDD) · **Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-admin/package.json` gains exact-pinned deps: `@dnd-kit/core@6.3.1`,
      `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `@dnd-kit/modifiers@9.0.0`
- [ ] `shared/lib/sortable-tree/` — vendored `flattenTree`, `buildTree`, `getProjection`,
      `removeChildrenOf` (MIT header retained verbatim). **`sortableTreeKeyboardCoordinates` is
      deliberately NOT vendored and no `KeyboardSensor` is registered** (§3.2 — dnd-kit is
      pointer-only). Plus our own measurement-free `applyMove(items, movingId, { targetParentId,
targetIndex })` reducer (the single path shared by keyboard/pointer/menu/dialog, §7),
      `projectionToInsertionPoint(projection, over)` (the pointer adapter), and
      `toReorderGroups(prev, next)` (diff → `ReorderGroupDto[]`)
- [ ] Pure unit tests (jsdom project, no DOM needed for these): `flattenTree`/`buildTree`
      round-trip; `getProjection` depth clamping (min/max) at various offsets; **`getProjection`
      output → `projectionToInsertionPoint` → `applyMove` over a fixture table of
      `(overId, offsetLeft)` pairs — the test that makes "pointer and keyboard share one reducer"
      (§1) literally true**; `applyMove` for each of ↑/↓/←/→/Home/End against a fixture tree, incl.
      boundary no-ops and the `level + height − 1 ≤ 4` refusal; `toReorderGroups` produces 1 group
      for a same-parent reorder and 2 groups (source + destination) for a reparent
- [ ] `shared/ui/sortable-tree/` — entity-agnostic primitive: `{ items: {id, parentId, label,
disabled?}[], maxDepth, renderRow, onMove(groups), announcements?, disabled? }`;
      `maxDepth: 1` collapses it to the flat sortable-list case (§4) — a unit test asserts
      `getProjection` never returns depth > 1 and `restrictToVerticalAxis` is applied when
      `maxDepth === 1`
- [ ] `shared/ui/live-announcer/` — two permanently-mounted, empty-on-mount `sr-only` regions
      (`role="status" aria-live="polite" data-testid="tree-live-polite"`, `role="alert"
aria-live="assertive" data-testid="tree-live-assertive"`, both `aria-atomic="true"`,
      clip-based `sr-only`, never `display:none`) + `useAnnouncer()` hook returning
      `{ announcePolite(msg), announceAssertive(msg) }`. **Announcement timing (precise):** emit
      IMMEDIATELY (leading edge) when `event.repeat === false`; when `event.repeat === true`,
      suppress the intermediate message and emit only the SETTLED position after a 150ms idle
      (`useDebouncedCallback`, direct import per `docs/conventions/forms.md`). A blanket trailing
      debounce is explicitly wrong — it would delay every single deliberate keypress by 150ms and
      force fake timers into every announcement assertion
- [ ] `dict.reorderTree` block appended to `shared/config/dictionary.ts` (generic, entity-agnostic
      DnD strings — `instructionsLong`, `instructionsShort`, `handleLabel(name)`, full announce
      set: grabbed/moved/indented/outdented/dropped/droppedNoop/cancelled/atTop/atBottom/
      cannotIndentNoSibling/cannotIndentMaxDepth/cannotOutdentRoot/autoExpanded/tabBlocked/
      searchLocked/saving/busyRefused/undone, plus an assertive string for EVERY error code
      (`CATEGORY_CYCLE`, `CATEGORY_MAX_DEPTH`, `CATEGORY_SELF_PARENT`, `CATEGORY_DUPLICATE_ID`,
      `CATEGORY_NOT_FOUND`, `CATEGORY_TREE_STALE`) plus `rejectedUnknown(name)` and
      `saveFailed(name)`) — all UA, per §7.3
- [ ] `npm run test -w apps/store-admin -- --runInBand sortable-tree` green
- [ ] `npm run lint -w apps/store-admin` / `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/package.json`
- `apps/store-admin/src/shared/lib/sortable-tree/*.ts` (+ `.test.ts`)
- `apps/store-admin/src/shared/ui/sortable-tree/*.tsx`
- `apps/store-admin/src/shared/ui/live-announcer/*.tsx`
- `apps/store-admin/src/shared/ui/index.ts` (append exports)
- `apps/store-admin/src/shared/config/dictionary.ts`

---

### 8. TASK-291-H — store-admin entities: admin category tree hooks/types

**Type:** feat · **Scope:** store-admin · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-291-F

**Acceptance Criteria:**

- [ ] `entities/category/index.ts` barrel extended to re-export
      `useCategoryControllerGetAdminTree`, **`getCategoryControllerGetAdminTreeQueryKey`** (needed
      by the status toggle / edit view / create view for the invalidation fix, §3.11), the new
      `useAdminCategoryControllerReorder` mutation hook, `AdminCategoryTreeNodeEntity`, and the
      reorder DTO types — the tree widget consumes
      the barrel, not `@/shared/api` directly (unlike today's `product-form`/`carousel-form`
      precedent, which is left alone)
- [ ] `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/entities/category/index.ts`

---

### 9. TASK-291-I — store-admin features: tree-reorder mutation lifecycle, row actions menu, "Move to…" dialog, blast-radius warning

**Type:** feat · **Scope:** store-admin · **Complexity:** L (4-8h) · **TDD Required:** No (RTL
coverage required per acceptance criteria, not formal Red→Green→Refactor — mirrors the plan-154
precedent for admin CRUD/content features) · **Depends on:** TASK-291-H, TASK-291-G

**Acceptance Criteria:**

- [ ] `features/category-tree-reorder/` — wraps `useAdminCategoryControllerReorder`; owns the
      client-side mutation lifecycle per §3's optimistic-state design (§7's focus rules depend on
      this): single in-flight PATCH (`aria-busy="true"` on the treegrid + polite «Зберігаю зміни…»
      while pending; a second move attempted while pending fires NO second request and emits the
      polite «Зачекайте, попереднє переміщення ще зберігається.»); `refetchOnWindowFocus: false` +
      no sibling-mutation invalidation while a move is active; `pendingTree` override (NOT
      `setQueryData` cache surgery) held only while in flight, dropped in `onSettled`; on success
      writes the server-returned tree into the cache and computes the inverse payload
      (`toReorderGroups(next, prev)`) for **a PERSISTENT Undo control** — a toolbar button above
      the treegrid («Скасувати останнє переміщення», enabled for a ~30s window, `aria-disabled`
      otherwise), NOT only a `sonner` toast action: a transient toast never receives focus, is not
      discoverable in the tab order and expires, so it cannot be the accessible entry point. The
      commit announcement names the control (§7.3) so a screen-reader user knows it exists. The
      toast action may ALSO be offered for sighted mouse users; the toolbar button is the binding
      one and the one the RTL case targets. Activating Undo replays the exact inverse payload,
      announces «Переміщення скасовано.» and refocuses the row; on error discards the
      override, re-focuses the moved row, announces the error-code-keyed assertive string
      (mirrored to `toast.error`); on `CATEGORY_TREE_STALE` (409) specifically: refetch, re-focus
      the operator's node, announce the new «позиція N з M, рівень L» politely after the
      assertive conflict message, visually flag rows whose parent/position differ from the
      pre-refetch snapshot for ~5s
- [ ] `features/category-tree-row-actions/` — per-row `DropdownMenu` («Дії: „{name}“»): Перемістити
      вгору (disabled at position 1) · Перемістити вниз (disabled at last) · Зробити підкатегорією
      «{попередня сусідня}» (disabled with no preceding sibling / at max depth) · Підняти на
      рівень вище (hidden at root) · Перемістити до… · separator · Редагувати ·
      Активувати/Деактивувати — every item routes through the SAME `applyMove()` reducer +
      the SAME mutation as keyboard/pointer (§7)
- [ ] `features/category-move-to-dialog/` — `Dialog` + parent `<Select>` fed from
      `useCategoryControllerGetAdminTree` (the COMPLETE admin tree, not the 100-row-capped flat
      list) and excluding SELF **and all descendants** + a «Позиція: N з M» `<Select>` derived from
      the chosen parent's children; submits through the same mutation; on success closes, focuses
      the moved row, announces per §7
- [ ] `features/category-status-toggle` gains the blast-radius **`window.confirm`** (§3.11 — the
      mechanism is binding; a toast fires after the write and cannot satisfy "before it commits"):
      «„{name}“ буде приховано разом із N підкатегоріями», N computed from the in-memory tree (no
      extra request). Cancel → focus returns to that row's status-toggle button. The toggle also
      invalidates `getCategoryControllerGetAdminTreeQueryKey()` (§3.11)
- [ ] RTL specs (feature-local): dialog excludes self AND descendants from its parent `<Select>`
      options; Undo — the PERSISTENT toolbar control is focusable and activating it fires the exact
      inverse payload; a second move while a PATCH is in flight fires NO second network call and
      emits the busy-refused announcement; blast-radius confirm — node WITH descendants + cancel →
      ZERO deactivate calls; node WITH descendants + accept → exactly ONE call with the correct
      count shown; leaf node → no confirmation at all; a status toggle refetches the admin tree
      (tree query key invalidated). _(The menu ⇄ keyboard parity case lives in TASK-291-J's widget
      spec — FSD forbids `features → widgets`, and the keyboard handler lives in the widget.)_
- [ ] `npm run test -w apps/store-admin -- --runInBand` green
- [ ] `npm run lint -w apps/store-admin` / `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/features/category-tree-reorder/`
- `apps/store-admin/src/features/category-tree-row-actions/`
- `apps/store-admin/src/features/category-move-to-dialog/`
- `apps/store-admin/src/features/category-status-toggle/ui/category-status-toggle.tsx`
- `apps/store-admin/src/features/category-form/ui/category-form.tsx` (parent `<Select>` re-fed
  from the admin tree + self/descendant exclusion back-port)
- `apps/store-admin/src/widgets/category-form-view/ui/{edit,create}-category-view.tsx` (add the
  admin-tree query-key invalidation, §3.11)

---

### 10. TASK-291-J — store-admin widgets: `AdminCategoryTree` (treegrid, keyboard, DnD, search, persistence)

**Type:** feat · **Scope:** store-admin · **Complexity:** L (4-8h) · **TDD Required:** No (RTL
coverage mandatory, per §9) · **Depends on:** TASK-291-I

**Acceptance Criteria:**

- [ ] `widgets/category-tree/ui/admin-category-tree.tsx` — full treegrid per §7: `role="treegrid"`,
      flat DOM rows, authored `aria-level`/`aria-posinset`/`aria-setsize`/`aria-expanded` (parent
      rows only), roving `tabindex` per §7.5's ownership rules, `data-grabbed`, `aria-busy` while a
      PATCH is in flight, the two live-announcer regions rendered as siblings before the `<table>`,
      and the TWO static instruction elements (`cat-tree-instructions-long` on the `<table>`,
      `cat-tree-instructions-short` on every `<tr>`, §7.4)
- [ ] Full keyboard contract implemented (§7.2), hand-rolled on `onKeyDown` over the pure
      `applyMove()` reducer — NOT via a dnd-kit `KeyboardSensor` (§3.2): navigation mode
      (↓/↑/→/←/Home/End/Enter/Tab/Space/Shift+F10) and move mode (↑/↓/←/→/Home/End/Space·Enter/
      Escape/Tab-swallowed/blur = auto-cancel) plus `Alt+Shift+↑/↓` / `Alt+Shift+←/→` mode-free
      accelerators (NOT `Alt+←/→` — browser Back/Forward on Windows); pointer drag via `dnd-kit`
      routes through `projectionToInsertionPoint` into the SAME `applyMove()` reducer; dnd-kit's
      own announcements/`screenReaderInstructions`/`aria-roledescription` are disabled and stripped
      (§3.2)
- [ ] Illegal targets (`subtree(moving) ∪ moving`, or any drop violating `level + height − 1 ≤ 4`)
      are never offered: `aria-disabled`, skipped by arrow navigation, not a valid drop target
      (§0/§7)
- [ ] Focus-follows-node (§7.5): `useLayoutEffect` re-focuses the moving row after every preview
      step; collapsing an ancestor of the focused row moves focus to that ancestor BEFORE
      unmounting descendants; mouse drop does NOT move focus
- [ ] Client-side search filter over the fully-loaded tree (§3.11): `?search=` URL param,
      `role="search"` form, ancestor auto-expand + dim + highlight, DnD disabled while filtered
      (`aria-disabled` + polite lock announcement)
- [ ] Expanded/collapsed state persisted to `localStorage` (`admin:category-tree:expanded`),
      default roots-expanded/level-2-collapsed, search auto-expand + restore-on-clear
- [ ] `prefers-reduced-motion` respected (§7.7): no transitions/lift/scale, instant auto-scroll,
      the drop-indicator line stays; coarse-pointer handling (§7.7): pointer dragging disabled on
      `pointer: coarse`, move controls always-visible (not hover-only), ≥44px targets
- [ ] `widgets/category-tree/ui/admin-category-tree-skeleton.tsx` — replaces
      `admin-category-table-skeleton.tsx`
- [ ] RTL specs (§9 test list E, jsdom + MSW — all keyboard-only, zero mouse events): keyboard
      reorder e2e (exact request body); keyboard reparent (both groups; `aria-level` 1→2,
      posinset/setsize recomputed on BOTH lists); **menu ⇄ keyboard PARITY** — the menu's
      «Перемістити вгору» produces the byte-identical request body that `Alt+Shift+↑` produces
      (this is the test that keeps the WCAG 2.5.7 fallback honest, §7.6; it lives here because both
      surfaces are only mounted together in the widget); ARIA-invariants helper run after EVERY
      case incl. after search and after collapse (level/posinset/setsize correct; leaves have NO
      `aria-expanded`; `getAllByRole('row').filter(r => r.tabIndex === 0).length === 1`); the widget
      renders EXACTLY TWO live regions, both EMPTY on mount, and each action produces EXACTLY ONE
      announcement (queried via `within(screen.getByTestId('tree-live-polite'|'tree-live-assertive'))`,
      never `getByRole('status'|'alert')` — `role="status"` is already used by `shared/ui/skeleton`
      and `role="alert"` appears 151× in store-admin); assertive rejection (MSW 400
      `error: CATEGORY_CYCLE`) → alert text + full rollback + focus back on the moved row; **error
      strings for every code** — MSW 400 `CATEGORY_NOT_FOUND` and an UNKNOWN code → the alert region
      carries the mapped string / the `rejectedUnknown` fallback (never empty, never English);
      409 → assertive + refetch + re-focus + new-position announcement; a second move while a PATCH
      is pending → no second network call + the busy-refused announcement + `aria-busy` on the
      treegrid; illegal targets `aria-disabled` and skipped by ↓; cancel → zero network calls, order
      restored, focus on the row; focus-follows-node after every move-mode ↓; collapse-with-focus-
      inside → ancestor focused, `document.body` not; search locks DnD; `Alt+Shift+←/→` is handled
      and `Alt+←/→` is NOT bound; row accessible description is the SHORT string, table description
      is the LONG one; key-repeat suppression is the ONE case using `jest.useFakeTimers()` (all
      other announcement assertions are synchronous — leading-edge emit, §7.3)
- [ ] `npm run test -w apps/store-admin -- --runInBand category-tree` green
- [ ] `npm run lint -w apps/store-admin` / `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/widgets/category-tree/ui/admin-category-tree.tsx`
- `apps/store-admin/src/widgets/category-tree/ui/admin-category-tree-skeleton.tsx`
- `apps/store-admin/src/widgets/category-tree/index.ts`
- `apps/store-admin/src/widgets/category-tree/ui/admin-category-tree.test.tsx`

---

### 11. TASK-291-K — store-admin app: page swap, old widget deletion, category-form cleanup

**Type:** feat · **Scope:** store-admin · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** TASK-291-J

**Acceptance Criteria:**

- [ ] `app/(dashboard)/categories/page.tsx` renders `<Suspense><AdminCategoryTree/></Suspense>`
      instead of `<AdminCategoryTable/>`; `loading.tsx` uses the new skeleton
- [ ] `widgets/category-list/` (`admin-category-table.tsx`, its skeleton, its barrel) DELETED
- [ ] `features/category-form/ui/category-form.tsx` — `sortOrder` number `<Input>` REMOVED; parent
      `<Select>` KEPT (WCAG 2.5.7 fallback + the "Move to…" dialog's reused control — a declared
      deviation from the task wording, §1), re-fed from `useCategoryControllerGetAdminTree` and
      excluding self + all descendants (TASK-291-I)
- [ ] `features/category-form/model/category-schema.ts` — `sortOrder` field removed from the zod
      schema and from `categoryFormValuesToDto`
- [ ] `features/category-form/ui/category-form.test.tsx` — `sortOrder`-input assertions deleted;
      every `combobox`/`option` assertion re-verified against the (unchanged-shape, now
      descendant-excluding) parent `<Select>`; the TASK-201 late-loading-options block (§2.2)
      still passes unmodified
- [ ] `widgets/category-form-view/ui/edit-category-view.test.tsx` (TASK-285 slug-rename guard) —
      re-verified; the view now ALSO invalidates `getCategoryControllerGetAdminTreeQueryKey()`
      (§3.11), covered by a case asserting the tree query is invalidated after a save
- [ ] `npm run test -w apps/store-admin -- --runInBand` green
- [ ] `npm run build -w apps/store-admin` / `lint` / `typecheck` clean

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/categories/page.tsx`
- `apps/store-admin/src/app/(dashboard)/categories/loading.tsx`
- `apps/store-admin/src/widgets/category-list/` (deleted)
- `apps/store-admin/src/features/category-form/ui/category-form.tsx`
- `apps/store-admin/src/features/category-form/model/category-schema.ts`
- `apps/store-admin/src/features/category-form/ui/category-form.test.tsx`

---

### 12. TASK-291-L — Full gate closure across all three workspaces

**Type:** test · **Scope:** shared · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** TASK-291-A…K

**Acceptance Criteria:** see §10 (Acceptance Criteria) and §9 (Test Gates) in full — this task is
the checkpoint that runs every gate listed there and confirms all are green before manual QA. Two
gates are called out here because they are easy to skip and this plan reaches into both apps:

- [ ] `npm run test -w apps/store-client -- --runInBand` green — the ROOT `generate:api`
      (TASK-291-F) regenerates `apps/store-client/src/shared/api/generated/**`, AND §3.9 changes the
      PUBLIC read order (`findCategoryTree`'s sibling `orderBy` gains `{ id: 'asc' }`)
- [ ] `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_test npm run test:e2e:pw`
      green on the EXISTING suite (`e2e/cart-flow.spec.ts`, `e2e/auth-flow.spec.ts`) — it boots
      store-client against the regenerated client and the reordered public tree. Preconditions: the
      explicit `DATABASE_URL` (globalSetup's seed otherwise loads `apps/store-api/.env` and seeds a
      DIFFERENT database than the API `webServer` uses), and nothing already listening on port 3001
      (`reuseExistingServer: !CI` silently reuses a stale dev API)

**Files to create/modify:** none (verification-only task).

---

### 13. TASK-291-M — Manual QA pass

**Type:** test · **Scope:** shared · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-291-L

**Acceptance Criteria:** see §11 (Manual QA) — result appended to `docs/manual-qa-pending.md` as
a `### TASK-291` block.

**Files to create/modify:**

- `docs/manual-qa-pending.md` — append-only `### TASK-291` block.

## 6. API Contract

| Method  | Path                                                             | Request Body                         | Response                                                                         |
| ------- | ---------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| `GET`   | `/api/categories/admin/tree` (existing route, upgraded response) | —                                    | `{ data: AdminCategoryTreeNodeEntity[] }`                                        |
| `PATCH` | `/api/admin/categories/reorder` (**new**)                        | `ReorderTreeDto`                     | `{ data: AdminCategoryTreeNodeEntity[] }`                                        |
| `GET`   | `/api/admin/categories` (unchanged)                              | — (query `CategoryListQueryDto`)     | `{ data: CategoryWithCountEntity[], meta }` (kept — backs the parent `<Select>`) |
| `PUT`   | `/api/admin/categories/:id` (unchanged path, DTO narrowed)       | `UpdateCategoryDto` (no `sortOrder`) | `{ data: CategoryEntity }`                                                       |
| `POST`  | `/api/admin/categories` (unchanged path, DTO narrowed)           | `CreateCategoryDto` (no `sortOrder`) | `{ data: CategoryEntity }`, 201                                                  |

### `PATCH /api/admin/categories/reorder` — full contract

- **Guard**: class-level `@UseGuards(AdminGuard)` (already on `AdminCategoryController`) — 401 no
  JWT, 403 non-admin role.
- **Declared BEFORE** `GET /:id` / `PUT /:id` / etc. so `reorder` is never captured as an `:id`
  path segment.
- **Decorators**: `@Patch('reorder')`, `@HttpCode(200)`, `@ApiOperation({ summary: … })`,
  `@ApiBearerAuth('access-token')`, `@ApiResponse({ status: 200, schema: { $ref:
getSchemaPath(AdminCategoryTreeResponse) } })`, `@ApiResponse({ status: 400, description:
'Validation error or a rejected move (cycle / max depth / self-parent / duplicate id)' })`,
  `@ApiResponse({ status: 403 })`, `@ApiResponse({ status: 404, description: 'Unknown category or
parent id' })`, `@ApiResponse({ status: 409, description: 'CATEGORY_TREE_STALE — another admin
changed the tree first' })`. `AdminCategoryTreeResponse` (envelope class, declared in the
  controller file, `data: AdminCategoryTreeNodeEntity[]`) added to the existing
  `@ApiExtraModels(...)` list so Orval generates a typed hook.
- **Request DTO** (`ReorderTreeDto`, extended by `apps/store-api/src/category/dto/
reorder-categories.dto.ts`):

  | Field                 | Type                | Validation                                                                                            | Notes                                                                                                                             |
  | --------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | `groups`              | `ReorderGroupDto[]` | `@IsArray @ArrayNotEmpty @ArrayMaxSize(20) @ValidateNested({each:true}) @Type(() => ReorderGroupDto)` | 1 group for a plain reorder, 2 for a reparent (source + destination); server computes the FULL affected closure regardless (§3.4) |
  | `groups[].parentId`   | `string \| null`    | `@ValidateIf(o => o.parentId !== null) @IsUUID('4')`                                                  | `null` = root bucket                                                                                                              |
  | `groups[].orderedIds` | `string[]`          | `@IsArray @ArrayMaxSize(500) @IsUUID('4', {each:true})`                                               | MAY be empty — a parent losing its last child is legal                                                                            |

  Global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true, transform: true`) rejects
  any extra property with a 400.

- **Response (200)**: `{ data: AdminCategoryTreeNodeEntity[] }` — the full refreshed admin tree,
  re-read after commit inside `applyTreeMoves`.
- **Error cases**:

  | Status | `error` code            | Trigger                                                                                                                                                                                                                                                                    |
  | ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 400    | `CATEGORY_DUPLICATE_ID` | Same id appears twice across/within groups                                                                                                                                                                                                                                 |
  | 404    | `CATEGORY_NOT_FOUND`    | Unknown category id or unknown non-null `parentId`                                                                                                                                                                                                                         |
  | 400    | `CATEGORY_SELF_PARENT`  | A group's `parentId` also appears in that group's `orderedIds`                                                                                                                                                                                                             |
  | 400    | `CATEGORY_CYCLE`        | Post-batch adjacency map contains a cycle (incl. multi-move cycles) OR the in-tx `findDescendantIds` re-check finds the new parent among the moved node's descendants                                                                                                      |
  | 400    | `CATEGORY_MAX_DEPTH`    | `level(node) + height(subtree(node)) − 1 > 4` for any moved node (1-based levels; the structural cap of both tree reads, §3.7)                                                                                                                                             |
  | 409    | `CATEGORY_TREE_STALE`   | A bucket in the server-computed affected-parent closure that the client DID describe no longer has the same child SET (another admin reparented something into/out of it). Two concurrent PURE reorders of one bucket have equal sets → NOT stale, last-writer-wins (§3.7) |

  Every error body is produced via `category.errors.ts`'s `badCategory`/`notFoundCategory`/
  `conflictCategory` helpers — `{ error: <code>, message: <human string> }` — which
  `HttpExceptionFilter` folds into the standard `{ statusCode, error, message, timestamp, path }`
  wire shape (§3.5). No `categoryId`/`targetParentId` on the wire; the client already knows both.

### `GET /api/categories/admin/tree` — upgraded (additive)

- Same route, same guard, same `operationId: 'categoryControllerGetAdminTree'`.
- New response shape: `{ data: AdminCategoryTreeNodeEntity[] }` — every existing field of
  `CategoryTreeNodeEntity` (`id, name, slug, description, image, isActive, sortOrder, metaTitle,
metaDescription, updatedAt, children[]`) plus `parentId: string | null`, `productCount: number`,
  `depth: number`. Existing consumers `product-form.tsx`/`carousel-form.tsx` (both in
  `store-admin`) keep compiling — additive fields only.
- Backed by the rewritten `findCategoryTreeForAdmin()` (§3.3) — flat query, no isActive filter, no
  3-level structural cap.

## 7. Accessibility Contract

### 7.1 ARIA model — `role="treegrid"`

Flat DOM rows (no DOM nesting), hierarchy carried entirely by authored ARIA:

```
<div class="sr-only" role="status" aria-live="polite"    aria-atomic="true" data-testid="tree-live-polite" />
<div class="sr-only" role="alert"  aria-live="assertive" aria-atomic="true" data-testid="tree-live-assertive" />

<div id="cat-tree-instructions-long"  class="sr-only">…§7.4 LONG text…</div>
<div id="cat-tree-instructions-short" class="sr-only">…§7.4 SHORT text…</div>

<table role="treegrid" aria-label="Дерево категорій"
       aria-describedby="cat-tree-instructions-long"
       aria-busy="true|false">        <!-- true while a reorder PATCH is in flight -->
  <thead><tr role="row"><th role="columnheader">Назва</th>…</tr></thead>
  <tbody>
    <tr role="row" id="cat-row-{id}"
        aria-describedby="cat-tree-instructions-short"
        aria-level="1" aria-posinset="2" aria-setsize="5"
        aria-expanded="true"          <!-- only on rows WITH children -->
        aria-disabled="true"          <!-- only while it is an illegal move target -->
        tabindex="0|-1"               <!-- roving; exactly one 0 in the grid -->
        data-grabbed="true|false">
      <td role="gridcell">…indent + twisty + grip + name…</td>
      <td role="gridcell">…slug…</td>
      <td role="gridcell">…products…</td>
      <td role="gridcell">…status toggle (button)…</td>
      <td role="gridcell">…drag handle + actions menu…</td>
    </tr>
  </tbody>
</table>
```

- `aria-level`/`aria-posinset`/`aria-setsize` are authored explicitly (browsers are not required
  to compute them for dynamically-loaded/flat content).
- `aria-expanded` only on rows WITH children (leaf rows must not have it).
- Roving `tabindex` on `<tr>` (not `aria-activedescendant`) so `element.focus()` restoration is
  trivial and jsdom-testable.
- `aria-grabbed`/`aria-dropeffect` are NEVER used (deprecated, poor AT support).
- No `aria-roledescription` on the row (would override the level/position semantics `treegrid`
  provides); an optional short one on the handle button only («кнопка переміщення») is low
  priority, may be skipped in v1.

**Why `treegrid`, not `tree`.** Rows carry action buttons (twisty, status toggle, grip, menu,
edit link) — the APG `tree` pattern has no defined behavior for a `treeitem` containing multiple
focusable elements. The `treegrid` pattern is defined for exactly that: "if the row containing
focus contains focusable elements, Tab moves focus to the next one; from the last, Tab leaves the
grid." That single rule is what makes rows-with-buttons tractable. Plan B (`role="tree"` + one
"Дії" menu per node) is documented but NOT built preemptively — see §12.

### 7.2 Keyboard contract

**Navigation mode** (focus on a `<tr>`, no move in progress):

| Key                           | Behaviour                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `↓` / `↑`                     | Focus next/previous VISIBLE row (does not expand/collapse)                                                                                               |
| `→`                           | Collapsed + has children → expand (focus stays). Expanded → focus first child. End node → no-op                                                          |
| `←`                           | Expanded → collapse. Collapsed/end node → focus parent. Root end node → no-op                                                                            |
| `Home` / `End`                | Focus first / last visible row                                                                                                                           |
| `Enter`                       | Open edit page for the row                                                                                                                               |
| `Tab` / `Shift+Tab`           | Move to next/previous focusable control WITHIN the row (twisty → status toggle → drag handle → actions menu → edit link); from the last, leaves the grid |
| `Space`                       | Enter move mode (pick up the focused row)                                                                                                                |
| `Shift+F10` / `ContextMenu`   | Open the row's actions menu                                                                                                                              |
| `Alt+Shift+↑` / `Alt+Shift+↓` | Accelerator (no mode): move one slot among siblings, commit immediately                                                                                  |
| `Alt+Shift+←` / `Alt+Shift+→` | Accelerator (no mode): outdent/indent, commit immediately                                                                                                |

The accelerators exist because JAWS users must switch modes to send raw arrows to the page. They
are `Alt+Shift`, **never bare `Alt+←`/`Alt+→`** — those are the browser's Back/Forward shortcuts in
Chrome, Edge and Firefox on Windows (the admin's target platform), and hijacking them would
navigate the operator off the page or force a hostile `preventDefault()` on a user-agent shortcut —
for exactly the users least able to recover from a surprise navigation. `Alt+Shift+arrow` has no
browser default. An RTL case asserts `Alt+←`/`Alt+→` are NOT bound.

**Move mode** (`data-grabbed="true"`, visible drop-indicator line, focus STAYS on the moving row):

| Key               | Behaviour                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `↓` / `↑`         | Move one slot within the CURRENT sibling list (level-preserving); no-op + polite boundary announcement at top/bottom                                                                |
| `→`               | INDENT — become last child of the immediately preceding sibling; auto-expand it if collapsed; refused (no-op + announce) if no preceding sibling or `level + height − 1 > 4` (§3.7) |
| `←`               | OUTDENT — become next sibling of the current parent; no-op at root                                                                                                                  |
| `Home` / `End`    | First / last position among current siblings                                                                                                                                        |
| `Space` / `Enter` | COMMIT — fire the batch mutation, exit move mode                                                                                                                                    |
| `Escape`          | CANCEL — restore original parent+position (and any auto-expanded state), exit move mode                                                                                             |
| `Tab`             | Swallowed (preventDefault) + announced once — leaving mid-move would strand an uncommitted preview                                                                                  |
| Blur              | AUTO-CANCEL — never a silent commit                                                                                                                                                 |

Every key above is handled by a plain `onKeyDown` on the `<tr>` calling the pure, measurement-free
`applyMove(items, movingId, { targetParentId, targetIndex })` reducer — NOT by a dnd-kit
`KeyboardSensor` (§3.2: dnd-kit is pointer-only, and its sensors need real layout, which jsdom does
not have). Pointer drag converts dnd-kit's `getProjection` output into the SAME insertion point via
`projectionToInsertionPoint()` and calls the SAME reducer (vertical = ↑/↓, horizontal past one
indent step = →/←, drop = commit, Escape mid-drag = cancel). That shared reducer — plus the
projection→insertion-point unit test (TASK-291-G) — is what makes the jsdom keyboard tests
meaningful for the mouse path too.

Illegal targets (`subtree(moving) ∪ moving`, or any drop violating `level + height − 1 ≤ 4`) are
never offered: skipped by arrow navigation, not a valid pointer drop target, `aria-disabled="true"`
for the duration of the move.

### 7.3 Live-region announcements (Ukrainian)

Two permanently mounted, empty-on-mount `sr-only` regions rendered as siblings BEFORE the
`<table>`: `role="status" aria-live="polite" data-testid="tree-live-polite"` (progress) and
`role="alert" aria-live="assertive" data-testid="tree-live-assertive"` (rejections only). These
two are the ONLY live regions in the widget — dnd-kit's built-in region and instructions node are
disabled (§3.2). Tests must query them by `data-testid`, never by role (`role="status"` is already
used by `shared/ui/skeleton.tsx` and `role="alert"` appears 151× across store-admin).

**Timing.** Announce IMMEDIATELY (leading edge) when `event.repeat === false`. When
`event.repeat === true` (a held arrow key), suppress the intermediate "moved" announcements and
emit only the SETTLED position after a 150ms idle. There is no blanket trailing debounce.

| Event                                   | Region    | Ukrainian string (template)                                                                                                                                                                                               |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picked up (has parent)                  | polite    | «Взято «{name}». Позиція {pos} з {size}, рівень {level}, у категорії «{parent}». Стрілки вгору й вниз — змінити позицію, вліво й вправо — змінити рівень, Enter — підтвердити, Escape — скасувати.»                       |
| Picked up (root)                        | polite    | «Взято «{name}». Позиція {pos} з {size}, кореневий рівень. Стрілки вгору й вниз — змінити позицію, вправо — зробити підкатегорією, Enter — підтвердити, Escape — скасувати.»                                              |
| Moved (same level)                      | polite    | «„{name}“ — позиція {pos} з {size}, у категорії „{parent}“.» (root: «…кореневий рівень.»)                                                                                                                                 |
| Indented                                | polite    | «„{name}“ тепер підкатегорія „{parent}“. Позиція {pos} з {size}, рівень {level}.»                                                                                                                                         |
| Outdented                               | polite    | «„{name}“ піднято на рівень вище — тепер підкатегорія „{parent}“. Позиція {pos} з {size}, рівень {level}.» (root: «„{name}“ піднято на кореневий рівень. Позиція {pos} з {size}.»)                                        |
| At top / bottom                         | polite    | «Це вже перша позиція.» / «Це вже остання позиція.»                                                                                                                                                                       |
| Cannot indent (no sibling)              | polite    | «Немає категорії, у яку можна вкласти — це перша серед сусідніх.»                                                                                                                                                         |
| Cannot indent (max depth)               | polite    | «Максимальна глибина — чотири рівні. Глибше вкласти не можна.»                                                                                                                                                            |
| Cannot outdent (root)                   | polite    | «Це вже кореневий рівень.»                                                                                                                                                                                                |
| Tab blocked                             | polite    | «Спершу завершіть переміщення: Enter — підтвердити, Escape — скасувати.»                                                                                                                                                  |
| Auto-expanded during move               | polite    | «„{parent}“ розгорнуто, підкатегорій: {count}.»                                                                                                                                                                           |
| Saving (PATCH in flight)                | polite    | «Зберігаю зміни…» (`aria-busy="true"` on the treegrid for the same window)                                                                                                                                                |
| Move refused while busy                 | polite    | «Зачекайте, попереднє переміщення ще зберігається.»                                                                                                                                                                       |
| Committed                               | polite    | «„{name}“ переміщено. Тепер: позиція {newPos} з {newSize} у категорії „{newParent}“. Було: позиція {oldPos} з {oldSize} у категорії „{oldParent}“. Щоб повернути, скористайтеся кнопкою „Скасувати останнє переміщення“.» |
| Committed (no-op)                       | polite    | «„{name}“ залишено на місці: позиція {pos} з {size} у категорії „{parent}“.»                                                                                                                                              |
| Cancelled                               | polite    | «Переміщення скасовано. „{name}“ повернуто на позицію {pos} з {size} у категорії „{parent}“.»                                                                                                                             |
| Search locks DnD                        | polite    | «Пошук активний. Очистіть пошук, щоб змінювати порядок.»                                                                                                                                                                  |
| Undo applied                            | polite    | «Переміщення скасовано.»                                                                                                                                                                                                  |
| Rejected — `CATEGORY_CYCLE`             | assertive | «Не можна перемістити „{name}“ всередину власної підкатегорії „{target}“. Позицію не змінено.»                                                                                                                            |
| Rejected — `CATEGORY_MAX_DEPTH`         | assertive | «Максимальна глибина дерева — чотири рівні. Переміщення скасовано.»                                                                                                                                                       |
| Rejected — `CATEGORY_SELF_PARENT`       | assertive | «Категорію „{name}“ не можна зробити батьківською для самої себе. Переміщення скасовано.»                                                                                                                                 |
| Rejected — `CATEGORY_DUPLICATE_ID`      | assertive | «Помилка запиту: категорія „{name}“ вказана двічі. Переміщення скасовано.»                                                                                                                                                |
| Rejected — `CATEGORY_NOT_FOUND`         | assertive | «Категорію „{name}“ або її нову батьківську категорію не знайдено — можливо, її щойно видалив інший адміністратор. Список оновлено.»                                                                                      |
| Rejected — `CATEGORY_TREE_STALE` (409)  | assertive | «Дерево категорій змінив інший адміністратор. Список оновлено — повторіть переміщення.» (followed politely by the re-focused row's new position)                                                                          |
| Rejected — unrecognised code (fallback) | assertive | «Не вдалося перемістити „{name}“. Дерево оновлено.» — `announce.rejectedUnknown(name)`; the client NEVER announces a raw backend string and NEVER leaves the region empty                                                 |
| Save failed (network/500)               | assertive | «Не вдалося зберегти переміщення „{name}“. Попередній порядок відновлено. Спробуйте ще раз.»                                                                                                                              |

All strings live in `dict.reorderTree` (generic, entity-agnostic — §4/§6 of the reuse design) plus
a small `dict.categories.tree` block for category-specific labels (heading, «підкатегорія», empty
state, blast-radius copy). The assertive save-failure string is ALSO mirrored to a `sonner`
`toast.error` for sighted users — verify during manual QA (§11) whether sonner's own region
double-speaks the `role="alert"` content; if so, render the toast with its text visually only
(`aria-hidden`), since the alert region is the actual a11y mechanism.

### 7.4 Screen-reader instructions

TWO static, visually hidden elements (one element cannot carry two texts):
`id="cat-tree-instructions-long"`, referenced by `aria-describedby` on the
`<table role="treegrid">`, and `id="cat-tree-instructions-short"`, referenced by
`aria-describedby` on every `<tr>`:

> **Long (table):** «Це дерево категорій. Стрілки вгору й вниз — переходити між рядками, вправо —
> розгорнути, вліво — згорнути. Щоб перемістити категорію, натисніть Пробіл: далі стрілки вгору й
> вниз змінюють позицію, вліво й вправо — рівень вкладеності, Enter підтверджує, Escape скасовує.
> Швидкі клавіші без режиму переміщення: Alt+Shift+стрілки вгору/вниз — позиція, Alt+Shift+стрілки
> вліво/вправо — рівень. Ті самі дії доступні в меню «Дії» кожного рядка.»

> **Short (every row):** «Пробіл — узяти для переміщення. Меню „Дії“ — перемістити без
> перетягування.»

The long form is repeated INSIDE the pick-up announcement itself (§7.3), because the description
is spoken on focus, which may have been many keystrokes ago. The drag-handle button gets its own
explicit `aria-label`: `dict.reorderTree.handleLabel(name)` → «Перемістити „{name}“».

### 7.5 Focus management

| Situation                                | Rule                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pick up (`Space`)                        | Focus stays on the moving `<tr>`                                                                                                                           |
| Each preview step                        | `useLayoutEffect` re-focuses the moving row if focus was lost — **focus follows the node, never the position**                                             |
| Commit                                   | Focus stays on the moved row at its NEW location (React key = category id preserves DOM node identity through the optimistic update)                       |
| Cancel / blur-auto-cancel                | Node returns to its original slot; focus returns with it                                                                                                   |
| Rejected — client pre-check              | Move mode stays open, preview snaps back, focus unchanged, assertive announce                                                                              |
| Rejected — server 400/409 after commit   | Move mode already closed; roll back optimistic tree, re-focus the row at its restored/refetched position, assertive announce — never move focus to a toast |
| Collapse an ancestor of the focused row  | Focus moves to the collapsing ancestor BEFORE the descendants unmount — never let focus fall to `document.body`                                            |
| Auto-expand during a move                | Focus stays on the moving row; on cancel, restore the previous expanded state of anything auto-expanded                                                    |
| Mouse drop                               | Does NOT move focus (only sets roving `tabindex`) — moving focus on a pointer drop would be disorienting for sighted mouse users                           |
| Actions menu / "Move to…" dialog success | Focus the MOVED ROW, not the (possibly re-rendered) trigger                                                                                                |
| Blast-radius `window.confirm` cancelled  | Focus returns to that row's status-toggle button; ZERO mutation calls (§3.11)                                                                              |
| Background refetch                       | Never re-focuses unless focus was lost to `document.body` during an in-flight move                                                                         |

**Roving-`tabindex` ownership (explicit — the §10 "exactly one `tabindex=0`" invariant is
otherwise nondeterministic):**

1. On mount, the FIRST visible row owns `tabindex="0"`.
2. Ownership is tracked by **category id**, never by index.
3. If the owner becomes invisible — collapsed under an ancestor, or filtered out by the search —
   ownership moves to its nearest VISIBLE ancestor; if there is none, to the first visible row.
4. The invariant (`exactly one row with tabIndex === 0`) holds after EVERY render, including after
   a search, a collapse, a commit, and a server-tree replacement; the RTL ARIA-invariants helper
   asserts it after every case (TASK-291-J).

### 7.6 Non-DnD escape hatches (mandatory — WCAG 2.2 SC 2.5.7)

Keyboard equivalence does **not** satisfy SC 2.5.7 (Dragging Movements, AA) on its own — a
clickable/tappable alternative is required. Four clickable surfaces ship:

1. **Per-row "Дії" menu** (§5, TASK-291-I) — every move a drag can do, a menu item can do too.
2. **"Перемістити до…" dialog** — parent `<Select>` (self + descendants excluded, options fed from
   the COMPLETE admin tree) + position `<Select>` — the direct replacement for the deleted
   `sortOrder` number input; the only affordance that moves a node ACROSS the tree in one action
   instead of N indent/outdent steps.
3. **The edit form's parent `<Select>`** — kept (not removed) — a **declared deviation from the
   task's "drag-to-reparent replaces the flat parent `<Select>`" wording** (§1), because it is the
   no-JS / hydration-failure fallback, it is the control the dialog reuses, and deleting it would
   leave the SC 2.5.7 alternative resting on a single surface. It is hardened in this task: options
   come from `useCategoryControllerGetAdminTree` (complete, uncapped, indented by `depth`) instead
   of the 100-row-capped flat list, and SELF **plus all descendants** are excluded.
4. **The persistent Undo control** (§5, TASK-291-I) — a toolbar button above the treegrid, not only
   a toast action, so the last move is reversible by keyboard and screen-reader users too.

### 7.7 Reduced motion & coarse pointer

- `prefers-reduced-motion: reduce` — no transform transitions, no lift/scale animation; rows jump
  instantly to their new slot; the drop-indicator line (2px, information not decoration) STAYS
  visible; instant (non-smooth) auto-scroll.
- `pointer: coarse` (touch) — pointer dragging DISABLED in v1; move controls (menu button, and
  optionally always-visible ↑/↓/⇤/⇥ icon buttons) rendered ALWAYS VISIBLE, never hover-only
  (`:focus-within` + `@media (pointer: coarse)` visible); handle/menu targets ≥ 44×44 CSS px.
- The twisty (expand/collapse) is a real `<button>` with `aria-label` («Розгорнути „{name}“» /
  «Згорнути „{name}“»), never a click handler on a bare `<span>`.

## 8. Frontend Architecture Summary

FSD placement (import direction `app → widgets → features → entities → shared`, all downward
only):

- `shared/lib/sortable-tree/` — pure algorithms (vendored + owned), zero React.
- `shared/ui/sortable-tree/` — the entity-agnostic DnD-list/tree render primitive.
- `shared/ui/live-announcer/` — the two `sr-only` regions + `useAnnouncer()`.
- `entities/category/` — barrel extended with the admin tree read hook + the new reorder mutation
  hook + types.
- `features/category-tree-reorder/` — mutation lifecycle (optimistic override, undo, refetch
  suspension, single-in-flight guard).
- `features/category-tree-row-actions/` — per-row "Дії" menu.
- `features/category-move-to-dialog/` — the "Перемістити до…" dialog.
- `features/category-status-toggle/` — carried forward, gains the blast-radius warning.
- `features/category-form/` — loses the `sortOrder` input, keeps (and hardens) the parent
  `<Select>`.
- `widgets/category-tree/` — composes the treegrid, row rendering, and the above features.
- `app/(dashboard)/categories/page.tsx` — swaps in the new widget.

## 9. Test Strategy & Gates

Bottom-up, Red before Green; the batch endpoint is TDD-mandatory.

**0. Blocking spike** (TASK-291-B) — proves the advisory-lock SQL binds correctly under Prisma 7

- `PrismaPg`, and that two concurrent interactive `$transaction`s don't deadlock. There is zero
  precedent for this in `src/`.

**A. Pure unit — `category-reorder.rules.spec.ts`** (no Prisma, no DI, milliseconds) — see
TASK-291-A's acceptance criteria for the full case list.

**B. Integration, real Postgres — `test/category-reorder.repository.int-spec.ts`** (bootstrap
copied from `test/category.repository.int-spec.ts:45-76`) — see TASK-291-C's acceptance criteria
for the full case list, including the concurrent-collision test that FAILS without the advisory
lock + full-bucket rewrite.

**C. Unit, mocked repo — `category.service.spec.ts`** — see TASK-291-D.

**D. e2e (supertest, repos mocked) — `test/category.e2e-spec.ts`** — see TASK-291-E.

**E. Frontend, jsdom RTL + MSW — `store-admin`** — see TASK-291-G (pure-fn tests) and TASK-291-J
(treegrid RTL suite).

**F. Manual QA** — see §11.

### Exact gate commands

| Gate                                        | Command                                                                                     | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (store-api)                            | `npm run test -w apps/store-api`                                                            | Prisma fully mocked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Integration (store-api)                     | `npm run test:int -w apps/store-api`                                                        | REAL Postgres (`store_test`), already hard-coded `--runInBand` in the npm script; this is where the advisory-lock concurrency guarantee is proven                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| e2e (store-api)                             | `npm run test:e2e -w apps/store-api -- --runInBand`                                         | **Must be `--runInBand`**: since the app got heavier, parallel supertest workers time out in `beforeAll` and produce mass spurious failures (project convention, confirmed across many prior plans); separately, `setup-e2e.ts` forces `REDIS_HOST=''` so parallel e2e workers don't share one real-Redis rate-limit counter (the shared-throttler bug that produces spurious 429s across unrelated suites)                                                                                                                                                                                                                         |
| Unit (store-admin)                          | `npm run test -w apps/store-admin -- --runInBand`                                           | Verify with `--runInBand`: the full `store-admin` (and `store-client`) suites are known to flake/time out under parallel load on this machine — serial is the arbiter of a real failure                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Unit (store-client) — **MANDATORY**         | `npm run test -w apps/store-client -- --runInBand`                                          | Not optional: the ROOT `generate:api` (TASK-291-F) regenerates `apps/store-client/src/shared/api/generated/**`, and §3.9 changes the PUBLIC category read order (`findCategoryTree` gains the `{ id: 'asc' }` tiebreaker). Serial is the arbiter here too                                                                                                                                                                                                                                                                                                                                                                           |
| Playwright — **MANDATORY** (existing suite) | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_test npm run test:e2e:pw` | Runs `e2e/cart-flow.spec.ts` + `e2e/auth-flow.spec.ts`, which boot store-client against the regenerated Orval client and the reordered public tree. Two preconditions: pass the explicit `DATABASE_URL=…/store_test` (globalSetup's seed otherwise loads `apps/store-api/.env` and seeds a DIFFERENT DB than the API `webServer` uses), and **verify nothing is already listening on port 3001** (`reuseExistingServer: !process.env.CI` silently reuses a stale dev API pointed at the wrong DB). No NEW admin pointer-DnD spec is added (§1 Non-Goals) — store-admin has no `webServer` entry and `seed-e2e.ts` has no admin user |
| Typecheck                                   | `npm run typecheck`                                                                         | all workspaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Lint                                        | `npm run lint`                                                                              | all workspaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Build                                       | `npm run build`                                                                             | all workspaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 10. Acceptance Criteria

Every criterion names what proves it. `MANUAL` means it is provable only by the §11 pass — no one
may later assume it is automated.

| #   | Criterion                                                                                                                                                                                                                                                                                                                                          | Proven by                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Prisma schema unchanged (`git diff apps/store-api/prisma/schema.prisma` shows zero lines)                                                                                                                                                                                                                                                          | Review / CI diff                                                                                                                        |
| 2   | `PATCH /api/admin/categories/reorder` exists, guarded by `AdminGuard`, returns `{ data: AdminCategoryTreeNodeEntity[] }`                                                                                                                                                                                                                           | `test/category.e2e-spec.ts`                                                                                                             |
| 3   | A same-parent reorder persists the exact submitted order (`sortOrder` 0..n-1, contiguous)                                                                                                                                                                                                                                                          | `test/category-reorder.repository.int-spec.ts`                                                                                          |
| 4   | A reparent moves the node AND re-densifies the source bucket to 0..n-1 with no hole                                                                                                                                                                                                                                                                | `test/category-reorder.repository.int-spec.ts`                                                                                          |
| 5   | A node can never be dropped onto itself or a descendant **by keyboard** (never offered) and is rejected `CATEGORY_CYCLE` if forced by a raw request                                                                                                                                                                                                | `admin-category-tree.test.tsx` (illegal-target skipping) + `category-reorder.rules.spec.ts` + `category-reorder.repository.int-spec.ts` |
| 5b  | …and never **by pointer** (illegal rows are not valid drop targets)                                                                                                                                                                                                                                                                                | **MANUAL (§11)** — jsdom has no layout; store-admin is not booted by Playwright                                                         |
| 6   | A multi-move payload that is legal per move but forms a cycle across moves is rejected `CATEGORY_CYCLE`                                                                                                                                                                                                                                            | `category-reorder.rules.spec.ts`                                                                                                        |
| 7   | Two concurrent INVERSE reparents (X under Y ‖ Y under X) commit no cycle — exactly one succeeds                                                                                                                                                                                                                                                    | `test/category-reorder.repository.int-spec.ts` (tree-scoped lock, §3.8)                                                                 |
| 8   | A move violating `level + height − 1 ≤ 4` (1-based levels, §3.7) is rejected `CATEGORY_MAX_DEPTH`; a move landing at level 4 is ACCEPTED                                                                                                                                                                                                           | `category-reorder.rules.spec.ts` + int-spec                                                                                             |
| 9   | Two concurrent reorders of the same parent never produce duplicate or gapped `sortOrder`; the final order equals exactly ONE submitted ordering (last-writer-wins — identical member sets, so no 409). `CATEGORY_TREE_STALE` (409) fires only when a described bucket's MEMBERSHIP changed under the client (a concurrent reparent into/out of it) | `test/category-reorder.repository.int-spec.ts` (both cases)                                                                             |
| 10  | `CreateCategoryDto`/`UpdateCategoryDto` no longer accept a client-supplied `sortOrder`; `create()` appends to the end of its bucket                                                                                                                                                                                                                | `category.service.spec.ts` + `test/category.e2e-spec.ts`                                                                                |
| 11  | A `PUT /:id` parent change assigns `sortOrder = max(destination) + 1`, re-densifies the source bucket, and takes the same locks (§3.10.4)                                                                                                                                                                                                          | `test/category-reorder.repository.int-spec.ts`                                                                                          |
| 12  | `CategoryService.update`'s parent-change path rejects `parentId === id` and depth-exceeding moves                                                                                                                                                                                                                                                  | `category.service.spec.ts`                                                                                                              |
| 13  | Every write that changes subtree membership (reorder AND `PUT :id` parent change) evicts `PRODUCT_LIST_PREFIX` exactly once                                                                                                                                                                                                                        | `category.service.spec.ts`                                                                                                              |
| 14  | A reparent enqueues a best-effort, non-blocking re-index of the **correct** moved-subtree root ids; a Meili outage does not fail the request                                                                                                                                                                                                       | `category.service.spec.ts` (asserts the `reindexSubtrees` ARGUMENT, not just the call)                                                  |
| 15  | The admin `/categories` screen renders a tree (expand/collapse), not a paginated flat table                                                                                                                                                                                                                                                        | `admin-category-tree.test.tsx`                                                                                                          |
| 16  | Reorder and reparent are fully achievable by KEYBOARD alone (navigation + move mode + `Alt+Shift` accelerators)                                                                                                                                                                                                                                    | `admin-category-tree.test.tsx`                                                                                                          |
| 16b | …and by MOUSE drag (reorder + reparent, indent threshold, drop indicator)                                                                                                                                                                                                                                                                          | **MANUAL (§11)**                                                                                                                        |
| 17  | Every drag action has a non-dragging equivalent — the per-row "Дії" menu and the "Перемістити до…" dialog produce byte-identical payloads (WCAG 2.5.7)                                                                                                                                                                                             | `admin-category-tree.test.tsx` (menu ⇄ keyboard parity) + `category-move-to-dialog` spec                                                |
| 18  | Deactivating a category with descendants shows a blast-radius `window.confirm` naming the count BEFORE the mutation fires; cancel = zero calls; leaf = no confirm                                                                                                                                                                                  | `category-status-toggle` RTL spec (TASK-291-I)                                                                                          |
| 19  | `aria-live` announcements fire for pick-up, move, indent/outdent, commit, cancel, saving, busy-refused and EVERY rejection code (incl. an unknown-code fallback), all UA, all from `dictionary.ts`; exactly TWO live regions exist, empty on mount, one announcement per action                                                                    | `admin-category-tree.test.tsx`                                                                                                          |
| 20  | Exactly one row has `tabindex="0"` after every render — incl. after search, collapse and server-tree replacement (§7.5 ownership rules)                                                                                                                                                                                                            | `admin-category-tree.test.tsx` ARIA-invariants helper                                                                                   |
| 21  | Focus follows the moving node through every step, and returns to the correct row on cancel, commit and rollback                                                                                                                                                                                                                                    | `admin-category-tree.test.tsx`                                                                                                          |
| 22  | A successful move offers a PERSISTENT Undo control (toolbar button, ~30s window, announced in the commit message) that replays the exact inverse payload                                                                                                                                                                                           | `category-tree-reorder` RTL spec (TASK-291-I) — targets the toolbar button, not the toast                                               |
| 23  | `prefers-reduced-motion` (no transitions, drop indicator retained) and coarse-pointer behaviour (drag disabled, controls always visible, ≥44px targets)                                                                                                                                                                                            | **MANUAL (§11)** — jsdom cannot evaluate media queries or hit-target size                                                               |
| 24  | Real screen-reader audit (NVDA/JAWS/VoiceOver), UA TTS pronunciation, contrast, 200% zoom, live 409 path                                                                                                                                                                                                                                           | **MANUAL (§11)**                                                                                                                        |
| 25  | `npm run lint`, `npm run typecheck`, `npm run build` green across all three workspaces                                                                                                                                                                                                                                                             | §9                                                                                                                                      |
| 26  | All test gates in §9 green — including the MANDATORY `store-client` unit gate and the MANDATORY existing Playwright suite                                                                                                                                                                                                                          | §9                                                                                                                                      |

## 11. Manual QA

Append to `docs/manual-qa-pending.md` as a `### TASK-291` block, covering exactly what automation
cannot reach:

- **Real pointer drag-and-drop** on a running stack: reorder within a parent, reparent across
  parents, drag onto an illegal target (own descendant / beyond level 4) and confirm it is never
  offered as a drop target, horizontal indent threshold feels correct, drop-indicator line
  position tracks the cursor.
- **Keyboard-only reorder and reparent** end-to-end on a real browser with a real screen reader
  off (sighted keyboard-only pass) — confirm no mouse is ever required.
- **Screen-reader announcement audit**, the full matrix, both the keyboard path and the menu path:
  - NVDA + Firefox, NVDA + Chrome — is `treegrid` forcing focus mode correctly? Are polite
    announcements spoken and not swallowed by the row's own echo?
  - **JAWS + Chrome** — the mode-switching concern that decides whether the `Alt+Shift+↑/↓`
    accelerators and the menu path are sufficient, or whether Plan B (`role="tree"` + one menu
    per node) needs to be built after all. Also confirm JAWS does not swallow the `Alt+Shift`
    chords.
  - VoiceOver + Safari (macOS) and VoiceOver + iOS (touch) — confirm the menu path is fully
    operable via the rotor/virtual cursor.
- **Ukrainian TTS pronunciation** of the announcement strings (guillemets «», "рівень N", the
  digit-heavy "позиція 3 з 5") — read aloud, adjust wording if it garbles.
- **Duplicate-announcement check** — does `sonner`'s toast region double-speak the error that
  `role="alert"` already announced? If so, render the error toast visually only.
- **Real touch device** — confirm drag is disabled, the menu path is reachable, targets are
  ≥44px.
- **`prefers-reduced-motion` on** — no animation, drop indicator still visible.
- **Contrast** — drop-indicator line + focus ring ≥ 3:1 in both light and dark admin themes.
- **200% zoom / 320px viewport** — the indented tree does not force horizontal page scroll.
- **Two admins moving the same subtree concurrently** — stage the real 409 path by hand (hard to
  automate reliably) and confirm the assertive announcement + refetch + re-focus behave as
  designed.
- **Meilisearch re-index timing** — reparent a subtree with several products, confirm
  category-filtered storefront search reflects the new membership within a reasonable window
  (best-effort, non-blocking per §3.13).
- **Storefront staleness note** — ~~confirm the storefront category tree/nav does NOT immediately
  reflect an admin reorder (no ISR tag exists yet)~~. **Wrong, corrected 2026-07-13 (TASK-294):**
  the storefront reflects a reorder immediately. Nothing there caches category order — every
  surface that renders it (`CategoryNav`, mega-menu, `/categories`, the catalog sidebar) is a
  client component on react-query, and the two server readers `await searchParams` (dynamic) and
  fetch through axios, which never enters Next's fetch cache. Verify the new order appears at
  once instead.

## 12. Open Questions / Follow-ups

- **Reusability rollout (parked, not built here).** Two follow-up BACKLOG rows, filed at
  implementation time from the BACKLOG's next free monotonic id (currently **TASK-293**; no ids are
  pre-allocated by this plan): (a) banners + blog-categories +
  device-brands — wire the shared `common/dto/reorder.dto.ts` (`ReorderFlatDto`) +
  `sibling-order.util.ts` into a `PATCH .../reorder` endpoint per resource, and swap each form's
  hand-typed `sortOrder` `<Input>` for `shared/ui/sortable-tree` in `maxDepth: 1` mode; (b)
  product-groups — wire the same primitive as a pure UI move affordance over the existing
  `useFieldArray` axes, no new endpoint needed.
- **Bulk activate/deactivate** (deferred per §3.11) — a new follow-up row, working title «Дерево
  категорій: множинний вибір + масова активація/деактивація» — needs a selection model
  (checkbox column, `aria-multiselectable`, Shift-range, bulk-actions bar), its own endpoint, and
  an owner decision on cascade-on-reactivation semantics before it can be scoped.
- **Storefront ISR revalidation** (deferred per §3.13, filed as **TASK-294**) — **closed as invalid
  on 2026-07-13, no code.** The premise was wrong: this plan assumed the storefront would serve a
  stale order until an ISR window elapsed, but no storefront surface caches category order at all,
  so there is nothing to revalidate and no `categories` tag to add. The shim + tag only become
  necessary if a category read ever moves onto a cached server `fetch`.
- **JAWS manual QA verdict** (§11) is the actual decision point for whether Plan B
  (`role="tree"` + one menu per node) is ever needed — do not build Plan B preemptively.
- **`@dnd-kit` 6.x line is frozen** (last publish 2024-12-05) — no upstream fix if a React 19
  defect surfaces; escape routes are `@dnd-kit/react` 0.5.x (same `getProjection` model, swap
  confined to `shared/{lib,ui}/sortable-tree`) or `react-complex-tree` (confined to the tree
  widget, would forfeit the flat-list reuse).
- **The admin tree is unvirtualised** — acceptable for a taxonomy-scale table; if it ever exceeds
  roughly 300 nodes, virtualisation is a follow-up. Do NOT pre-build it now — it interacts badly
  with `aria-posinset`/`aria-setsize` and with focus restoration, and there is no evidence it is
  needed yet.
- **This is the first optimistic mutation in `store-admin`** (§3's mutation lifecycle, §7.5's
  focus rules) — every other mutation in the app today is invalidate-on-success. This is the
  single most bug-prone new surface in the task; RTL coverage is mandatory (§9E) but a subtle bug
  surviving review here is a real risk worth flagging to whoever picks up TASK-291-I/J.
- **Scope is large.** New dependency + a TDD'd batch endpoint with advisory locks + a full WCAG
  2.2 treegrid + undo + serialisation + Meili re-index + PUT/POST alignment + form/dict cleanup.
  Deferring bulk toggle and revalidation (above) is what keeps this landable; if it still
  overruns, the next thing to cut is the "Перемістити до…" dialog's position `<Select>` (NOT the
  menu itself, which is the WCAG 2.5.7 requirement, and NOT Undo).
