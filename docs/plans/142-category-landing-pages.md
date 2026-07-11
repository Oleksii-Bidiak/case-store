# Plan 142 — Category Landing Pages `/categories/[slug]`

> **Status:** 🔄 In Progress
> **Phase:** Roadmap Етап 7 — SEO/GEO (`docs/handoff-seo.md`, develop @ 847a1fb, 2026-07-07)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-277
> **Source:** `docs/handoff-seo.md` §SEO-1 — "Посадкові сторінки категорій `/categories/[slug]`
> — H (найбільша прогалина)"

## Overview

The storefront currently has no indexable per-category landing page: the `/categories` hub
lists categories but every "shop this category" link points at
`/products?categoryId=<uuid>` — a query-string view of the shared catalog page. For
e-commerce SEO this is the single biggest structural gap (per the GEO/SEO audit): category
pages are typically the highest-value organic entry points (mid-funnel keyword intent,
"чохли для iphone" / "кабелі lightning"), and a `?categoryId=<uuid>` URL is neither a clean,
memorable link nor a stable indexable target (the id is opaque, and TASK-278 will make the
`?categoryId=` view `noindex` once this plan lands, per the recommended order in the handoff).

The backend prerequisite (TASK-247) already surfaced `metaTitle`/`metaDescription` on the
public category tree (`GET /categories/tree` → `CategoryTreeNodeEntity`), so the SEO-meta
override chain is ready. This plan adds the actual SSR route: `app/categories/[slug]/page.tsx`
renders the category's H1/description/product grid (reusing the existing catalog widgets —
`ProductListView`, filters, pagination — exactly as `/products` does), emits
`BreadcrumbList` + `ItemList` JSON-LD, is included in `sitemap.xml`, and every internal link
that currently points at `/products?categoryId=<id>` (header mega-menu, homepage category
tiles, hero sidebar, `/categories` hub tiles, PDP breadcrumb) is repointed at the new
`/categories/<slug>` URL. The old `?categoryId=` form keeps working (nothing removes it —
`ProductListView`'s own category-chips switcher still writes it) but now sets a canonical
link to the new landing page, so search engines consolidate signal onto the clean URL.

One small, additive backend change is needed beyond what TASK-247 shipped: the public tree
entity (`CategoryTreeNodeEntity`) intentionally excludes timestamps ("hierarchy is expressed
through nesting" — see its own doc-comment), so it has no `updatedAt` for the sitemap's
`lastModified`. TASK-277-A adds that one field, mirroring exactly how TASK-247 added
`metaTitle`/`metaDescription` to the same entity for the same reason (SEO surface needs on
an otherwise navigation-shaped payload). No other backend change is required — the brief's
"no API changes needed" claim holds for everything except this one field.

## Scope

### In Scope

- SSR route `apps/store-client/src/app/categories/[slug]/page.tsx`: resolves the category by
  slug from the public tree (server-side), 404s via `notFound()` for an unknown/inactive
  slug, renders H1 (category name), body copy (the category's own `description` when set,
  else the existing `dict.catalog.categorySubtitle(name)` fallback used by the
  `?categoryId=` view today), a breadcrumb (`Головна → [батько →] категорія`, one crumb per
  tree ancestor — not the generic "Категорії" hub crumb the `?categoryId=` view uses), a
  subcategory-chip row (real navigation links to each direct child's own
  `/categories/<slug>` page, shown only when children exist), and the product grid via the
  existing `ProductListView` widget scoped to the category.
- `generateMetadata` through the shared `resolveSeo()` precedence chain (entity
  `metaTitle`/`metaDescription` → `SeoSettings` defaults → category name/description),
  self-canonical (`${SITE_URL}/categories/<slug>`, no query params — the filter/sort-param
  canonical policy is TASK-278's job, not duplicated here).
- JSON-LD: `BreadcrumbList` (reusing the existing `buildBreadcrumbSchema`) built from the
  resolved ancestor chain, and a new `ItemList` builder (`buildItemListSchema`) populated
  from a small server-side fetch of the category's first product page (mirrors how the PDP
  route already does its own server-side fetch for `Product`/`FAQPage` JSON-LD, independent
  of the client widget's own query).
- `sitemap.ts`: one entry per active category (root + every nested level — all are real,
  linkable routes), `lastModified` from the new `updatedAt` field.
- Internal relinking: every existing `/products?categoryId=<id>` link that is a plain
  "browse this category" link (header mega-menu, mobile nav, homepage `CategoryNav` tiles,
  `HeroCategorySidebar`, the `/categories` hub's own tile grid + "view all" CTA, the PDP
  breadcrumb's category crumb) is repointed at `/categories/<slug>`.
- The old `?categoryId=` form on `/products` keeps working unchanged (filters, chips,
  pagination) — its `generateMetadata` gains a canonical pointing at the new
  `/categories/<slug>` page when the id resolves to a known category, so the two URLs never
  compete for the same query in search results.
- One additive backend field: `CategoryTreeNodeEntity.updatedAt`.

### Out of Scope

- Canonical/`noindex` policy for filter/sort/pagination combinations on `/products` and
  `/categories/[slug]` (page-number canonical, `noindex,follow` when filter params are
  present) — TASK-278 (SEO-2), sequenced directly after this plan per the handoff's
  recommended order ("SEO-1 → SEO-2 — one track, both edit listing metadata").
- Removing or deprecating the `?categoryId=` query form — it stays fully functional
  (`CategoryChips`'s in-page category switcher, any bookmarked/external links keep working);
  only its indexability signal moves to the new canonical target.
- Category tile images, product counts on tiles, or any other `/categories` hub redesign —
  the hub page itself is untouched beyond its outbound link hrefs.
- Brand-scoped or device-model-scoped landing pages — out of this task's remit (category
  only, per the handoff).
- Admin-side slug-guard / redirect chain for renamed category slugs — that is TASK-285
  (SEO-10), which explicitly says "за наявності — Product/Category" for the same
  `SlugRedirect` mechanism; this plan does not add one (a renamed category slug 404s until
  285 lands, same as a renamed Page/BlogPost slug does today).
- `Category.parentId`/timestamps on the _tree_ response beyond the one additive
  `updatedAt` field — the ancestor chain for breadcrumbs is derived by walking the
  already-fetched tree (depth-first), not by adding `parentId` to the public payload.

## User Stories

1. As a shopper who searches "чохли для iphone" on Google, I want to land on a clean,
   readable category page (`/categories/chohly-dlya-iphone`) with a proper title/description
   and the actual products, so the search result looks trustworthy and the URL is
   shareable/bookmarkable.
2. As the store owner, I want every category to automatically appear in `sitemap.xml` and
   carry structured breadcrumb + product-list data, without having to configure anything
   per category beyond the SEO fields I already fill in on `/categories` admin forms
   (TASK-247's `metaTitle`/`metaDescription`).
3. As a shopper browsing a category page, I want to see its direct subcategories as a row of
   links (not a filter toggle) so I can drill down without losing the page I'm on.
4. As a shopper who still lands on an old `/products?categoryId=…` link (e.g. from a stale
   bookmark or an external site), I want the page to work exactly as before — the canonical
   change is invisible to me, it only affects how search engines index the page.

## Technical Design

### Design Decision 1 — `updatedAt` on `CategoryTreeNodeEntity` (small, additive backend change)

`CategoryTreeNodeEntity`'s own doc-comment says it "excludes parentId and timestamps since
the hierarchy is expressed through nesting" — true for `parentId` (ancestor chains come from
walking the tree, see Decision 2) but not usable for the sitemap's `lastModified`, which
needs a real timestamp. `CategoryRepository.findCategoryTree()` already uses Prisma
`include` (full rows, not a narrowed `select`), so `updatedAt` is already fetched — this is a
pure entity/mapper change, exactly mirroring how TASK-247 added `metaTitle`/`metaDescription`
to the same entity for the same reason (an SEO consumer needs a field the navigation-shaped
tree payload didn't originally carry). No repository, controller, or DTO change; no Prisma
migration (the column exists since the model was created). Additive field — zero risk to any
existing consumer (admin product-form category picker, storefront chips/nav, `CategoryChips`)
since none of them read or care about a new optional field.

### Design Decision 2 — ancestor breadcrumb via tree walk, not `parentId`

`GET /categories/tree` returns root categories with `children` nested up to 3 levels
(`findCategoryTree`'s `include` depth). A new pure function,
`findCategoryPathBySlug(nodes, slug): CategoryTreeNodeEntity[] | null`, does a depth-first
search that accumulates the ancestor chain as it descends, returning
`[root, ...intermediate, matched]` (or `null` if the slug isn't found anywhere in the — already
active-only — tree). This is a straightforward sibling to the existing `findCategoryNode`/
`findCategoryName` (by id) already in
`widgets/product-list/model/catalog-header.ts` — same file, same DFS shape, just by `slug`
and returning the whole path instead of the single matched node. Because the tree endpoint
only ever returns `isActive: true` categories, an inactive or unknown slug naturally resolves
to `null` with no extra `isActive` check needed — the page calls Next's `notFound()` in that
case, which (unlike the PDP's client-fetched soft-404 today) gives a real HTTP 404 status
since the category is resolved server-side before the response is built.

The breadcrumb trail built from the path is `[{ name: dict.product.breadcrumbHome, href: "/"
}, ...path.slice(0, -1).map(ancestor => ({ name: ancestor.name, href:
"/categories/${ancestor.slug}" })), { name: path.at(-1)!.name }]` — i.e. "Головна → [батько
→] категорія" exactly as specified, with **no** generic "Категорії" hub crumb (that mid-crumb
is specific to the `?categoryId=` view's `buildCatalogHeader`, which is untouched by this
plan and keeps its own trail shape).

### Design Decision 3 — reuse `ProductListView` with a new `lockedCategoryId` prop

The handoff explicitly asks to reuse the catalog widgets, not rebuild the grid. `ProductListView`
already drives category filtering through `?categoryId=` in the URL and a `CategoryChips` row
that lets the shopper switch categories in place. On a category _landing page_ the category is
fixed by the route segment, not a filter the shopper toggles — so:

- A new optional prop, `lockedCategoryId?: string`, when set: (a) the effective
  `params.categoryId` is always `lockedCategoryId`, regardless of what (if anything) is in the
  URL query — the route never carries a `?categoryId=` param itself; (b) the `CategoryChips`
  row is not rendered (its job — switching the active category — is superseded by the route's
  own subcategory-chip row, a plain navigation control, see Decision 4); (c) `CLEARABLE_FILTERS`
  (used by "скинути всі"/`clearFilters`) omits `categoryId`, so clearing every other filter
  never un-locks the category.
- Every other control — price range, brand, device, specs, sort, view toggle, pagination —
  is untouched: they still read/write their own query params on top of whatever the current
  pathname is (`usePathname()`), which on this route is `/categories/<slug>`, so "filters work
  as query on top of the page" falls out of the existing implementation for free.
- `/products` itself passes no `lockedCategoryId` (`undefined`), so its existing
  `?categoryId=`-driven behavior (chips visible, category switchable) is byte-for-byte
  unchanged — this is a strictly additive, opt-in prop.

### Design Decision 4 — `SubcategoryChips`: navigation, not a filter

The handoff calls for "підкатегорії-чіпи" distinct from `CategoryChips` (which mutates a
query param in place). A new small presentational widget, `SubcategoryChips` (new
`widgets/category-detail/`), renders the active category's direct `children` (already present
on the tree node — no extra request) as plain `<Link href={\`/categories/${child.slug}\`}>`pills, visually similar to`CategoryChips`'s idle-chip styling for consistency, but with zero
filter/query logic — clicking one navigates to that child's own landing page. Rendered only
when `children.length > 0`, mirroring the empty-guard convention already used by
`CategoriesView`'s brand strip and `CategoryChips` itself.

### Design Decision 5 — `ItemList` JSON-LD via one small server-side fetch

`ProductListView`'s product grid is client-fetched (same `"use client"` architecture as
`/products` today — the route's Server Component resolves category + metadata + JSON-LD,
the grid hydrates client-side, exactly matching the existing `/products` precedent, so this
plan does not change the SSR/CSR split of the storefront). For the `ItemList` JSON-LD (which
must exist in the initial HTML to be read by crawlers), the route does one small, independent
server-side fetch — `productControllerFindAll({ categoryId: node.id, isActive: true, page: 1,
limit: 20 })` — purely to build the schema, the same pattern `buildProductPageSchemas` already
uses on the PDP (its own server fetch for `Product`/`FAQPage` JSON-LD, separate from
`ProductDetailView`'s own client query). On any failure the `ItemList` block is simply
omitted (`try/catch → null`, same as every other schema builder call site in this codebase) —
it never blocks the page.

`buildItemListSchema(items: { name: string; url: string; image?: string }[]): Record<string,
unknown>` (new, `shared/lib/schema/buildItemListSchema.ts`) emits a `Schema.org` `ItemList`
with 1-based `position`s, mirroring `buildBreadcrumbSchema`'s exact shape/style.

### Design Decision 6 — old `?categoryId=` view canonicalizes to the new page

`app/products/page.tsx`'s `generateMetadata` already resolves the category node server-side
(`resolveCategoryNode`) for its title/description. This plan adds one line to that same
branch: when a node resolves, `alternates: { canonical: \`${SITE_URL}/categories/${node.slug}\`
}`. This directly implements the handoff's "стара форма `/products?categoryId=`лишається
робочою — з неї canonical на нову сторінку" and is the one line of`/products/page.tsx`this
plan and TASK-278 both need to reason about — noted explicitly in Dependencies & Sequencing
below so the two tracks don't fight over the same`generateMetadata` branch.

### Data Model

```prisma
// No migration. Category.updatedAt already exists (@updatedAt, since the model was
// created) — only the entity/mapper that reads it for the public tree response changes.
```

### Backend (NestJS — Clean Architecture)

#### `CategoryTreeNodeEntity` (modified)

- New field: `updatedAt!: Date` (`@ApiProperty`, mirrors `CategoryEntity.updatedAt`).
- `fromPrisma()` maps `category.updatedAt` at every nesting level (root + recursive
  children), same call-site shape TASK-247 used for `metaTitle`/`metaDescription`.

No `CategoryController`/`CategoryService`/`CategoryRepository` change — `findCategoryTree()`
already selects full rows.

### Frontend (Next.js — FSD)

#### shared/lib

- `shared/lib/schema/buildItemListSchema.ts` — **new**: pure `ItemList` builder (Decision 5).
- `shared/lib/schema/schema.test.ts` — **modified**: new `describe("buildItemListSchema")`.
- `shared/lib/schema/fetchAllCategories.ts` — **new**: `flattenActiveCategories(tree)` (pure,
  unit-tested — recursively flattens root + all nested active categories into
  `{ slug, updatedAt }[]`, every level included since every level is a real route) and
  `fetchAllActiveCategories()` (thin wrapper calling `categoryControllerGetCategoryTree()`
  once and flattening — matches the "one listing fetch, not N+1" shape of the sibling
  `fetchAllActiveProducts`/`fetchAllPublishedPages`, which stay untested wrappers by the
  same existing convention; only the pure `flattenActiveCategories` gets a unit test).
- `shared/lib/schema/fetchAllCategories.test.ts` — **new**: unit tests for
  `flattenActiveCategories` (3-level nested tree → flat list in the same order, inactive
  branches never present since the tree endpoint already filters them upstream — the flatten
  function trusts its input).
- `shared/lib/schema/index.ts` — **modified**: export `buildItemListSchema`,
  `fetchAllActiveCategories`.

#### widgets

- `widgets/product-list/model/catalog-header.ts` — **modified**: new
  `findCategoryPathBySlug(nodes, slug)` (Decision 2).
- `widgets/product-list/model/catalog-header.test.ts` — **modified**: new
  `describe("findCategoryPathBySlug")` cases (root match, nested match returns full
  ancestor chain in order, unknown slug → `null`).
- `widgets/product-list/ui/product-list-view.tsx` — **modified**: `lockedCategoryId` prop
  (Decision 3).
- `widgets/product-list/ui/product-list-view.test.tsx` — **new** (no existing test file for
  this widget today): locked mode hides `CategoryChips`, forces `categoryId` regardless of
  URL, "скинути всі" does not clear the lock, price/sort/pagination still work via query.
- `widgets/category-detail/ui/subcategory-chips.tsx` — **new**: Decision 4.
- `widgets/category-detail/ui/subcategory-chips.test.tsx` — **new**: renders one link per
  child with the right `href`, renders nothing when `children` is empty.
- `widgets/category-detail/index.ts` — **new**: barrel (`export { SubcategoryChips } from
"./ui/subcategory-chips"`).
- `widgets/index.ts` — **modified**: re-export `SubcategoryChips`.
- `widgets/header/ui/header.tsx` — **modified**: mobile-menu category links
  `/products?categoryId=${category.id}` → `/categories/${category.slug}`.
- `widgets/header/ui/header-search.tsx` — **modified**: desktop catalog-panel links, same
  swap.
- `widgets/category-nav/ui/category-nav.tsx` — **modified**: homepage tile links, same swap.
- `widgets/hero-banner/ui/hero-category-sidebar.tsx` — **modified**: hero rail links, same
  swap.
- `widgets/categories/ui/categories-view.tsx` — **modified**: child-tile links and the
  "view all in category" CTA, same swap (root-rail buttons stay `onClick`-based in-hub
  switches — unchanged, they don't navigate).
- `widgets/categories/ui/categories-view.test.tsx` — **modified**: update the two existing
  href assertions (`/products?categoryId=c1a` → `/categories/<slug>`, etc.) to match.
- `widgets/product-detail/ui/product-detail-view.tsx` — **modified**: PDP's visible
  breadcrumb category crumb, same swap (`category.slug` already present on
  `ProductCategoryEntity`).

#### app (pages)

- `app/categories/[slug]/page.tsx` — **new**: `generateMetadata` (resolveSeo + self-canonical)
  - the Server Component page (breadcrumb, H1, description, `SubcategoryChips`,
    `Suspense`-wrapped `ProductListView` with `lockedCategoryId`), `BreadcrumbList` +
    `ItemList` JSON-LD via a `buildCategoryPageSchemas` helper mirroring the PDP's
    `buildProductPageSchemas` shape (try/catch → `null`, page still renders without
    structured data on any failure). Calls `notFound()` when the slug doesn't resolve.
- `app/categories/[slug]/loading.tsx` — **new**: mirrors `app/products/loading.tsx`
  (`<ProductListSkeleton />` in the same page shell).
- `app/products/page.tsx` — **modified**: `generateMetadata`'s category-node branch gains
  `alternates: { canonical: \`${SITE_URL}/categories/${node.slug}\` }` (Decision 6).
- `app/products/[slug]/page.tsx` — **modified**: `buildProductPageSchemas`'s breadcrumb
  category crumb `item` URL, same swap (`category.slug` already available).
- `app/sitemap.ts` — **modified**: new `fetchCategoryRoutes()` (mirrors
  `fetchProductRoutes`/`fetchPageRoutes` exactly — try/catch, empty array on failure) added
  to the `Promise.all` + spread into the returned array; `changeFrequency: "weekly"`,
  `priority: 0.7` (between `/products` at 0.9 and the static `/categories` hub at 0.7 —
  matches the hub's existing priority since these are peer landing pages).

### API Contract

| Method | Path               | Change                                                                                                                          |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/categories/tree` | `CategoryTreeNodeEntity` (nested, every level) gains `updatedAt: Date` — additive, no breaking change to any existing consumer. |

No new endpoints. No DTO/request-shape change. `npm run generate:api` regenerates Orval
hooks/models for both `store-client` and `store-admin` (additive field flows through
automatically; no hand-written model edits needed in either app).

## Tasks

### TASK-277-A: Backend — `updatedAt` on the public category tree entity

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — additive entity field, not cart/discount/inventory/auth; pinned by
unit tests per the acceptance criteria below (same rigor TASK-247 used for its two new
fields on this entity).
**Depends on:** —

**Acceptance Criteria:**

- [ ] `CategoryTreeNodeEntity` gains `updatedAt!: Date` (`@ApiProperty`, mirrors
      `CategoryEntity.updatedAt`'s description/example)
- [ ] `CategoryTreeNodeEntity.fromPrisma()` maps `category.updatedAt` at every nesting level
      (root + recursive `children`), extending the existing `fromPrisma` input type shape
- [ ] `category.repository.spec.ts`: extend the existing `findCategoryTree — SEO meta
    columns` describe block (or a sibling one) with an assertion that `updatedAt` round-trips
      at both root and nested-child level (same fixture shape as the existing metaTitle test)
- [ ] `category.service.spec.ts`: extend the existing `getCategoryTree` describe block with an
      assertion that `updatedAt` is surfaced unchanged (same pattern as the existing
      metaTitle/metaDescription assertions at lines ~186-224)
- [ ] `npm run generate:api` regenerates `CategoryTreeNodeEntity` in both `store-client` and
      `store-admin` generated models with the new field (no hand-edits — generated files are
      not touched by hand per project rules)
- [ ] `npm run typecheck`/`lint` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/category/entities/category-tree-node.entity.ts` — modified
- `apps/store-api/src/category/category.repository.spec.ts` — modified
- `apps/store-api/src/category/category.service.spec.ts` — modified
- `apps/store-client/src/shared/api/generated/**` — regenerated (Orval, not hand-edited)
- `apps/store-admin/src/shared/api/generated/**` — regenerated (Orval, not hand-edited)

---

### TASK-277-B: Shared helpers — ancestor-path breadcrumb + `ItemList` JSON-LD builder

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — pure functions, covered by unit tests per the acceptance criteria
below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `findCategoryPathBySlug(nodes: CategoryTreeNodeEntity[], slug: string):
    CategoryTreeNodeEntity[] | null` added to `widgets/product-list/model/catalog-header.ts`
      — DFS returning `[root, ...ancestors, matched]` in root-to-leaf order; `null` when the
      slug is not found anywhere in the tree
- [ ] `catalog-header.test.ts`: new cases — root-level match returns a single-element array;
      a 2-and-3-level-deep match returns the full ancestor chain in order; an unknown slug
      returns `null`
- [ ] `buildItemListSchema(items: { name: string; url: string; image?: string }[]):
    Record<string, unknown>` added to `shared/lib/schema/buildItemListSchema.ts` — emits
      `{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: [...] }` with
      1-based `position`, each element `{ "@type": "ListItem", position, item: { "@type":
    "Product", name, url, image? } }` (image omitted per-item when absent); exported from
      `shared/lib/schema/index.ts`
- [ ] `schema.test.ts`: new `describe("buildItemListSchema")` — positions are 1-based and in
      input order; an item without `image` omits the field rather than emitting `undefined`;
      an empty input array yields an empty `itemListElement`
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/model/catalog-header.ts` — modified
- `apps/store-client/src/widgets/product-list/model/catalog-header.test.ts` — modified
- `apps/store-client/src/shared/lib/schema/buildItemListSchema.ts` — new
- `apps/store-client/src/shared/lib/schema/schema.test.ts` — modified
- `apps/store-client/src/shared/lib/schema/index.ts` — modified

---

### TASK-277-C: `SubcategoryChips` widget

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — presentational component, covered by RTL per the acceptance criteria
below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `SubcategoryChips` (`widgets/category-detail/ui/subcategory-chips.tsx`) renders one
      `<Link href={\`/categories/${child.slug}\`}>`chip per item in a`children:
      CategoryTreeNodeEntity[]`prop, visually consistent with`CategoryChips`'s idle chip
      styling (no active/toggle state — plain navigation, not a filter)
- [ ] Renders `null` (no wrapper element) when `children` is empty, matching the empty-guard
      convention already used by `CategoryChips`/`CategoriesView`'s brand strip
- [ ] `subcategory-chips.test.tsx`: renders the correct number of links with the correct
      `href`s and visible text from a fixture list; renders nothing for an empty list
- [ ] `widgets/category-detail/index.ts` barrel exports `SubcategoryChips`; re-exported from
      `widgets/index.ts`
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/category-detail/ui/subcategory-chips.tsx` — new
- `apps/store-client/src/widgets/category-detail/ui/subcategory-chips.test.tsx` — new
- `apps/store-client/src/widgets/category-detail/index.ts` — new
- `apps/store-client/src/widgets/index.ts` — modified

---

### TASK-277-D: `ProductListView` — `lockedCategoryId` support

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — widget wiring, covered by RTL per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] New optional prop `lockedCategoryId?: string` on `ProductListView`
- [ ] When set: `params.categoryId` is always `lockedCategoryId` regardless of the URL's
      `?categoryId=` (which this route never sets); `CategoryChips` is not rendered;
      `CLEARABLE_FILTERS`/`clearFilters` omit `categoryId` so "скинути всі" preserves the lock
- [ ] When unset (`/products`'s existing call site, unchanged): behavior is byte-for-byte
      identical to today — `CategoryChips` renders, category is switchable via `?categoryId=`
- [ ] All other controls (price, brand, device, specs, sort, view toggle, pagination) are
      unaffected in either mode — they already key off `usePathname()`, which is correct on
      both routes with no further change
- [ ] `product-list-view.test.tsx` (new): locked mode hides the category chips row; a filter
      change while locked keeps `categoryId` in the resulting query/params; "скинути всі"
      clears price/brand/etc. but the rendered grid still queries the locked category
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — modified
- `apps/store-client/src/widgets/product-list/ui/product-list-view.test.tsx` — new

---

### TASK-277-E: `app/categories/[slug]/page.tsx` route

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No — Server Component route composition; covered indirectly by the unit
tests on the pure helpers it calls (Tasks A/B/C/D) plus manual/E2E-adjacent verification per
the plan's acceptance criteria (no App-Router page-level unit-test precedent exists in this
codebase — `/products/page.tsx` and `/products/[slug]/page.tsx` are likewise untested as
Server Components; their extracted logic is what carries the test coverage).
**Depends on:** TASK-277-A, TASK-277-B, TASK-277-C, TASK-277-D

**Acceptance Criteria:**

- [ ] `generateMetadata({ params })` fetches the public tree once, resolves the node by slug
      via `findCategoryPathBySlug`, and on no match returns a minimal fallback (mirrors the
      PDP's `catch → { title: dict.meta.productFallbackTitle }` shape) — the page body's own
      `notFound()` call is what actually produces the 404, not `generateMetadata`
      (Next convention: a 404 route still needs _a_ metadata object)
- [ ] On a resolved node: title/description via `resolveSeo({ entityTitle: node.metaTitle,
    entityDescription: node.metaDescription, settings: seo, content: { name: node.name,
    description: node.description } })` + `toMetadataTitle(...)`; description fallback is
      `dict.catalog.categorySubtitle(node.name)` when `resolveSeo` yields no description
      (reuses the existing string — no new dictionary key needed for this)
- [ ] `alternates: { canonical: \`${SITE_URL}/categories/${node.slug}\` }` (no query params —
      TASK-278 owns the filter/page-param policy)
- [ ] The page component: fetches the tree again (mirrors the existing `/products/page.tsx`
      double-fetch precedent — same Axios-based Orval client has no request memoization, so
      this is a pre-existing, accepted pattern, not a regression), resolves
      `findCategoryPathBySlug`; calls `notFound()` (from `next/navigation`) when it returns
      `null` — a real HTTP 404, not a soft one
- [ ] Renders (in order): `BreadcrumbList` + `ItemList` JSON-LD via `<JsonLd>` (each omitted
      independently on its own build failure — try/catch → `null` per element, mirroring the
      PDP's `buildProductPageSchemas` null-safety), the breadcrumb nav (Decision 2 trail,
      `dict.product.breadcrumbAria`/`breadcrumbHome`), an `<h1>` with the category name, body
      copy (`node.description` when set, else `dict.catalog.categorySubtitle(node.name)`),
      `<SubcategoryChips children={node.children} />` (only rendered when non-empty — the
      component's own empty-guard makes the call site unconditional), and
      `<Suspense fallback={<ProductListSkeleton />}><ProductListView initialParams={{
    categoryId: node.id, ...restOfSearchParams }} lockedCategoryId={node.id} /></Suspense>`
      — `restOfSearchParams` parses `search`/`sortBy`/`sortOrder`/`minPrice`/`maxPrice`/
      `specs`/`page` exactly as `/products/page.tsx` does today (same `first()` helper,
      copy-pasted or extracted — implementer's call, no functional difference required)
- [ ] `app/categories/[slug]/loading.tsx` mirrors `app/products/loading.tsx` (same
      `<ProductListSkeleton />` shell)
- [ ] Manual/dev-server smoke: visiting `/categories/<a-real-slug>` renders the H1, a working
      breadcrumb, subcategory chips when the category has children, and the product grid
      filtered to that category and its subtree (subtree rollup already server-enforced by
      `?categoryId=` filtering, per TASK-236 — unchanged here); an unknown slug renders the
      Next.js not-found page with a 404 status (verify via `curl -I` or devtools Network tab)
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-client/src/app/categories/[slug]/page.tsx` — new
- `apps/store-client/src/app/categories/[slug]/loading.tsx` — new

---

### TASK-277-F: `sitemap.ts` — category routes

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — thin wiring over an already-unit-tested pure function (Task B is a
prerequisite in spirit, though this task only needs Task A's `updatedAt` field; sequenced
after A for a real field to consume).
**Depends on:** TASK-277-A

**Acceptance Criteria:**

- [ ] `fetchAllCategories.ts` (`shared/lib/schema/`): `flattenActiveCategories(tree)` (pure,
      unit-tested per Task B if landed first, else added here) + `fetchAllActiveCategories()`
      (calls `categoryControllerGetCategoryTree()` once, flattens); throws on HTTP error —
      caller wraps in try/catch, same contract as `fetchAllActiveProducts`/
      `fetchAllPublishedPages`
- [ ] `app/sitemap.ts`: new `fetchCategoryRoutes()` (try/catch → `[]` on failure, logs via
      `console.error` — same shape as `fetchProductRoutes`/`fetchPageRoutes`), added to the
      existing `Promise.all` and spread into the returned sitemap array; each entry
      `{ url: \`${SITE_URL}/categories/${slug}\`, lastModified: new Date(updatedAt),
      changeFrequency: "weekly", priority: 0.7 }`
- [ ] A sitemap fetch failure for categories never drops product/page/blog routes (same
      independence guarantee the existing three fetchers already have)
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`
- [ ] Manual smoke: `/sitemap.xml` on a running dev stack includes an entry per active
      category (root and nested) with the URL `/categories/<slug>`

**Files to create/modify:**

- `apps/store-client/src/shared/lib/schema/fetchAllCategories.ts` — new (if not already
  landed by Task B)
- `apps/store-client/src/shared/lib/schema/fetchAllCategories.test.ts` — new
- `apps/store-client/src/shared/lib/schema/index.ts` — modified (if not already done)
- `apps/store-client/src/app/sitemap.ts` — modified

---

### TASK-277-G: Internal relinking sweep + old-URL canonical

**Type:** refactor
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No — href swaps + one metadata line, covered by updating existing tests per
the acceptance criteria below.
**Depends on:** TASK-277-E (the target route must exist before anything links to it)

**Acceptance Criteria:**

- [ ] `widgets/header/ui/header.tsx` (mobile menu), `widgets/header/ui/header-search.tsx`
      (desktop catalog panel), `widgets/category-nav/ui/category-nav.tsx` (homepage tiles),
      `widgets/hero-banner/ui/hero-category-sidebar.tsx` (hero rail): every
      `/products?categoryId=${category.id}` link → `/categories/${category.slug}`
- [ ] `widgets/categories/ui/categories-view.tsx`: child-tile links and the "view all in
      category" CTA (both the multi-child and zero-child branches) → `/categories/<slug>`;
      the root rail's `onClick`-based in-hub group switcher is unchanged (not a navigation
      link)
- [ ] `widgets/categories/ui/categories-view.test.tsx`: existing href assertions
      (`/products?categoryId=c1a`, `/products?categoryId=c2a`) updated to the new
      `/categories/<slug>` form
- [ ] `widgets/product-detail/ui/product-detail-view.tsx`: the visible PDP breadcrumb's
      category crumb → `/categories/${category.slug}` (`ProductCategoryEntity` already
      carries `slug`, no backend change)
- [ ] `app/products/[slug]/page.tsx`: `buildProductPageSchemas`'s `BreadcrumbList` category
      crumb `item` URL → `\`${SITE_URL}/categories/${category.slug}\`` (JSON-LD, server-side —
      kept in sync with the visible breadcrumb above)
- [ ] `app/products/page.tsx`: `generateMetadata`'s category-node branch adds `alternates: {
    canonical: \`${SITE_URL}/categories/${node.slug}\` }` alongside the existing
      title/description resolution (Decision 6) — the unfiltered/keyword-search branch is
      untouched (no canonical added there; that is TASK-278's remit)
- [ ] `CategoryChips`'s own in-page category switcher on `/products` is untouched — it still
      writes `?categoryId=` and stays fully functional; this task only changes _outbound_
      "browse this category" entry points, not the catalog's own in-page filter UI
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`
- [ ] Manual smoke: header mega-menu, mobile nav, homepage category tiles, hero sidebar,
      `/categories` hub tiles, and a PDP breadcrumb crumb all land on
      `/categories/<slug>`; visiting `/products?categoryId=<a-known-id>` still renders the
      filtered catalog and its `<link rel="canonical">` points at `/categories/<slug>`
      (view-source or devtools)

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header.tsx` — modified
- `apps/store-client/src/widgets/header/ui/header-search.tsx` — modified
- `apps/store-client/src/widgets/category-nav/ui/category-nav.tsx` — modified
- `apps/store-client/src/widgets/hero-banner/ui/hero-category-sidebar.tsx` — modified
- `apps/store-client/src/widgets/categories/ui/categories-view.tsx` — modified
- `apps/store-client/src/widgets/categories/ui/categories-view.test.tsx` — modified
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — modified
- `apps/store-client/src/app/products/[slug]/page.tsx` — modified
- `apps/store-client/src/app/products/page.tsx` — modified

## Migration Steps

1. TASK-277-A (backend field) first — everything else either needs it (sitemap) or is
   independent of it, and it's the smallest, most isolated change (good first PR-sized chunk).
2. TASK-277-B, TASK-277-C, TASK-277-D can proceed in any order, in parallel — none of the
   three touches a file any of the others touches (`catalog-header.ts`/`buildItemListSchema.ts`
   vs. a new `widgets/category-detail/` folder vs. `product-list-view.tsx`).
3. TASK-277-E composes A–D into the actual route — must come after all four.
4. TASK-277-F (sitemap) only strictly needs A; sequenced after E in this list purely so a
   reviewer sees the route land before its sitemap entry, not a real code dependency.
5. TASK-277-G (relinking) last — every new href it writes must resolve to a route that
   already exists (E), or the sweep would introduce dead links for the duration of a partial
   merge.

## Dependencies & Sequencing

- **Internal:** A → {B, C, D} (parallel) → E → F ∥ G (G depends on E only, not F — the two
  can land in either order once E is merged; listed F-then-G above purely for reviewer
  narrative flow).
- **External — TASK-278 (SEO-2, `docs/handoff-seo.md` §SEO-2):** shares one file-level touch
  point with TASK-277-G — `app/products/page.tsx`'s `generateMetadata`. This plan adds the
  category-node branch's canonical (Decision 6); TASK-278 will separately add the
  unfiltered-view self-canonical and the filter-param `noindex,follow` branch. Both are
  additive to different branches of the same function, so there is no logical conflict, but
  the handoff's own recommended order ("SEO-1 → SEO-2 — one track") means TASK-278's plan
  should be written (and merged) after this plan lands, not in parallel in a sibling
  worktree, to avoid a real merge conflict on the same function body.
- **External — TASK-285 (SEO-10, admin slug-guard):** will eventually add a
  `SlugRedirect`-based 301 for renamed category slugs; this plan's `notFound()` on an unknown
  slug is the correct interim behavior (matches how `/legal/[slug]` and `/products/[slug]`
  already handle an unrecognized slug — this is not a regression, it is 285's explicit
  follow-up scope, called out in the handoff itself).
- **Feeds forward:** TASK-278 (canonical/noindex policy), TASK-281 (Merchant Center feed —
  independent, product-level, not affected by this plan).
- No shared files with any other currently-open Хвиля/Етап task outside the SEO/GEO track.

## Risks & Mitigations

| Risk                                                                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Axios-based Orval client has no request memoization, so `generateMetadata` and the page body both fetch the category tree — "double fetch per request"                                                 | Pre-existing, accepted pattern already shipped on `/products/page.tsx` (`resolveCategoryNode` called from both `generateMetadata` and the page body); this plan mirrors it rather than introducing a new inconsistency. A future perf pass could hoist a single `unstable_cache`/tag-based fetch shared across both — out of scope here, called out for later if traffic ever makes it matter. |
| `ProductListView`'s `lockedCategoryId` prop silently regresses the existing `/products?categoryId=` behavior if the prop's default isn't a true no-op                                                      | Acceptance criteria explicitly require "byte-for-byte identical to today" when the prop is unset, and the new `product-list-view.test.tsx` pins both modes side by side.                                                                                                                                                                                                                       |
| A category page with zero children renders an awkward gap where `SubcategoryChips` would have been                                                                                                         | Component returns `null` (not an empty wrapper) when `children` is empty — no layout gap, matches the empty-guard convention already used elsewhere in this widget family.                                                                                                                                                                                                                     |
| Renaming a category's slug in the admin silently breaks every inbound link/bookmark to its old `/categories/<old-slug>` (no redirect yet)                                                                  | Explicitly named as this plan's boundary with TASK-285 (SEO-10) in Scope/Dependencies — not solved here, same interim behavior other admin-slugged routes already have.                                                                                                                                                                                                                        |
| `ItemList` JSON-LD's server-side product fetch could drift from what the client grid actually shows first (different sort/filter defaults, or a race on stock changes between the two independent fetches) | Same accepted trade-off the PDP's server-side `Product` JSON-LD already makes relative to `ProductDetailView`'s own client query — structured data is a directional signal for crawlers, not a pixel-perfect mirror of live UI state; both fetches use the same default `isActive: true` + `page: 1` params so they agree in the overwhelmingly common case.                                   |

## Notes

- This plan deliberately keeps the `/products?categoryId=` URL fully alive rather than
  redirecting it — the handoff is explicit that it "лишається робочою" (stays working); only
  its canonical target moves. A hard redirect would be a bigger, riskier change (breaks
  in-page category-switching via `CategoryChips`, which relies on staying on `/products`) and
  is not what the brief asks for.
- The category page's product grid inherits the existing subtree-rollup behavior for
  `?categoryId=` filtering (TASK-236) automatically — a mid-level category's landing page
  shows its own products _and_ every descendant's, exactly like the `?categoryId=` view does
  today. No new backend filtering logic is needed for this.
- Dictionary: this plan is designed to need **zero new keys** — every string it needs
  (`dict.product.breadcrumbHome`/`breadcrumbAria`, `dict.catalog.categorySubtitle`,
  `dict.filters.subcategoryChipsAria` if reused for the new chip row's `aria-label`) already
  exists and is reused verbatim. If implementation surfaces a genuine gap (e.g. a distinct
  aria-label reads better than reusing `subcategoryChipsAria`'s filter-flavored wording), add
  it appended at the very end of the `meta:` section in `dictionary.ts` — not a new top-level
  section, not interleaved into `catalog`/`categories`/`filters` — to minimize merge friction
  with the parallel SEO-2 (TASK-278) track, which also touches this file.
- "SSR-рендер" in the acceptance bar (handoff §SEO-1) matches this codebase's existing
  `/products` precedent: the route's shell (metadata, breadcrumb, H1, JSON-LD) is a real
  Server Component resolved per-request; the product grid itself hydrates client-side behind
  a `Suspense` boundary, same split `/products` already ships. This plan does not attempt a
  fully server-rendered grid — that would be new architecture for this app, not what this
  task asks for.
