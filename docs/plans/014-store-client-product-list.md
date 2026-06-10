# Plan: Build ProductListPage with filtering (store-client)

> **Status:** In Progress
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-10
> **Last Updated:** 2026-06-10

## Overview

Build the `/products` route in `apps/store-client` — the main product catalogue page.
Visitors can reach this page directly (e.g. from the HeroBanner "Shop Now" link) or with a
pre-selected category (e.g. from a CategoryNav tile that appends `?categoryId=<uuid>`).

The page exposes five filter controls — category, minimum price, maximum price, keyword
search, and sort order — all persisted in the URL query string so that browser history,
bookmarking, and deep-linking work out of the box. A paginated product grid reuses the
`shared/ui/ProductCard` component established in TASK-028.

No backend changes are required. All filtering is driven by the existing
`GET /api/products` endpoint via `useProductControllerFindAll` (Orval-generated hook).

## Scope

### In Scope

- Route `app/products/page.tsx` (new file, no such route exists today)
- Filter controls: category selector, min/max price inputs, keyword search input, sort
  dropdown — each mapped to a real `ProductControllerFindAllParams` field
- URL-as-state: all active filters live in the URL query string; changing a filter performs
  a `router.replace` so TanStack Query refetches automatically
- Debounced search input (300 ms) to avoid a request on every keystroke
- Paginated product grid driven by `meta.totalPages` / `meta.page` from the API response
- Reuse of `shared/ui/ProductCard` (unchanged from TASK-028)
- Loading skeleton states (reuses `shared/ui/Skeleton` and a new `ProductListSkeleton`)
- Empty state ("No products found" with a reset-filters link)
- Error state (inline `role="alert"` message)
- Responsive layout: filter sidebar on `lg:` breakpoint, collapsible/stacked on mobile
- a11y: labelled form controls, `<fieldset>`/`<legend>` for filter groups, `<nav>`
  landmark for pagination, `aria-live` region for result count
- Design tokens only — no raw hex values in any `.tsx` file
- Export of page-level `metadata` (`"Products | MobileStore"`)

### Out of Scope

- Product detail page (TASK-030)
- AddToCart on the product list cards (TASK-032); cards link to detail page only
- Admin product management (TASK-039)
- Backend changes — no new endpoints or DTO fields needed
- Full-text search engine (Elasticsearch / Meilisearch — Phase 5)
- Stock / inventory filtering (`inStock` — no such param on `ProductListQueryDto`)
- Brand or tag filtering (not in current schema)
- `loading.tsx` route-level file (per-component `<Suspense>` is used instead, as per the
  homepage convention established in TASK-028)

## User Stories

1. As a visitor, I want to browse all active products on a dedicated listing page, so that I
   can discover what the store sells.
2. As a visitor, I want to filter products by category, so that I can narrow my search to
   the type of accessory I need.
3. As a visitor, I want to filter by price range, so that I can find products within my
   budget.
4. As a visitor, I want to search by keyword, so that I can quickly find a specific product.
5. As a visitor, I want to sort products by price or newest, so that I can find the best
   deal or the latest arrivals.
6. As a visitor, I want to navigate between pages of results, so that I can browse more
   products than fit on a single screen.
7. As a visitor arriving from a category tile on the homepage, I want the category filter
   to be pre-selected from the URL, so that I land directly on the right category.

## Technical Design

### Next.js 16 Conventions — Critical Notes

**Confirmed from `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`:**

1. `searchParams` is a **`Promise`** in Next.js 15+/16. The page Server Component must be
   `async` and call `await searchParams` before reading query values. Synchronous access is
   deprecated. TypeScript type: `Promise<{ [key: string]: string | string[] | undefined }>`.

2. Using `searchParams` (a request-time API) opts the page into **dynamic rendering** on
   every request. This is intentional and correct for a filtered listing page.

3. Client Components that need to read the current URL filters use `useSearchParams()` from
   `next/navigation`. This hook returns a read-only `URLSearchParams` instance. It must be
   wrapped in a `<Suspense>` boundary to allow the rest of the page to prerender without
   being blocked.

4. To update filters, Client Components use `useRouter().replace()` from `next/navigation`
   with a newly constructed query string. `router.replace` does NOT add a history entry
   (prevents the back button filling up with every keystroke); callers that want back-button
   support for full filter changes can use `router.push` instead.

5. `usePathname()` from `next/navigation` provides the current path (`/products`) so Client
   Components can build a full URL string for `router.replace`.

### Server vs Client Split

The architecture uses a **thin Server Component page shell** that reads `await searchParams`
and passes the resolved initial values down as props to a single Client Component wrapper
(`ProductListView`). All interactivity (filter controls, pagination, live grid) lives inside
that Client Component tree.

| File / Component                                    | Type                       | Rationale                                                                                                                    |
| --------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `app/products/page.tsx`                             | Server Component (`async`) | Reads `await searchParams`, exports `metadata`. No hooks or browser APIs. Passes resolved params to `<ProductListView>`.     |
| `widgets/product-list/ui/product-list-view.tsx`     | Client Component           | Root of the interactive subtree. Reads live URL state via `useSearchParams()`. Renders `<ProductFilters>` + `<ProductList>`. |
| `features/product-filters/ui/product-filters.tsx`   | Client Component           | Category selector, price inputs, search input, sort dropdown. Writes filter changes to URL via `useRouter().replace()`.      |
| `features/product-filters/ui/search-input.tsx`      | Client Component           | Controlled search `<input>` with 300 ms debounce; calls `onSearch` callback.                                                 |
| `widgets/product-list/ui/product-list.tsx`          | Client Component           | Calls `useProductControllerFindAll(params)` keyed on all active filter params. Renders grid or empty/error/loading states.   |
| `widgets/product-list/ui/product-list-skeleton.tsx` | Server-compatible          | Static skeleton grid — 20 placeholder cards. Used as `<Suspense>` fallback.                                                  |
| `widgets/product-list/ui/pagination.tsx`            | Client Component           | Renders page number links; updates `?page=` param via `<Link>` components (no JS required for basic navigation).             |
| `shared/ui/ProductCard`                             | Client Component (exists)  | Unchanged from TASK-028. Renders product name, price, sale badge, links to `/products/[slug]`.                               |
| `shared/ui/Skeleton`                                | Server-compatible (exists) | Unchanged from TASK-028.                                                                                                     |

**Why a new `widgets/product-list` instead of reusing `widgets/product-grid`:**
The existing `widgets/product-grid/ui/product-grid.tsx` hardcodes `{ sortBy: 'createdAt', sortOrder: 'desc', limit: 8, isActive: true }`. The product list page requires
all filter parameters to be dynamic and driven by URL state. Modifying the homepage
`ProductGrid` to accept optional params would add conditional complexity and break its
simple, single-responsibility design. Creating a separate `widgets/product-list` is
therefore the correct approach — the two widgets coexist independently.

### URL-as-State Strategy

**Filter params in the URL:**

```
/products?categoryId=<uuid>&search=case&sortBy=price&sortOrder=asc&minPrice=5&maxPrice=50&page=2
```

**Reading state (Client Components):**

```ts
// Inside ProductListView or ProductFilters:
const searchParams = useSearchParams();
const categoryId = searchParams.get("categoryId") ?? undefined;
const search = searchParams.get("search") ?? undefined;
const sortBy = searchParams.get("sortBy") ?? "createdAt";
const sortOrder = searchParams.get("sortOrder") ?? "desc";
const minPrice = searchParams.get("minPrice")
  ? Number(searchParams.get("minPrice"))
  : undefined;
const maxPrice = searchParams.get("maxPrice")
  ? Number(searchParams.get("maxPrice"))
  : undefined;
const page = searchParams.get("page") ? Number(searchParams.get("page")) : 1;
```

**Updating state (filter change):**

```ts
const router = useRouter();
const pathname = usePathname();

function applyFilter(key: string, value: string | undefined) {
  const next = new URLSearchParams(searchParams.toString());
  if (value) {
    next.set(key, value);
  } else {
    next.delete(key);
  }
  next.set("page", "1"); // reset to page 1 on any filter change
  router.replace(`${pathname}?${next.toString()}`);
}
```

Resetting page to 1 on any filter change prevents stale pagination.

**Search debounce** (inside `SearchInput`):
A `useEffect` with a 300 ms `setTimeout` clears and re-schedules the `router.replace` call
on every keystroke. The input's controlled `value` state updates immediately (for responsive
typing), while the URL update (and therefore the API call) is debounced.

**Pagination** (inside `Pagination`):
Each page number renders as a `<Link href={`/products?...&page=${n}`}>` — pure
navigation, no JavaScript mutation needed. The `<Link>` components use `router.push`
semantics so the user can navigate back through pages.

**TanStack Query key:**

```ts
useProductControllerFindAll({
  categoryId,
  search,
  sortBy,
  sortOrder,
  minPrice,
  maxPrice,
  page,
  limit: 20,
  isActive: true,
});
```

The Orval-generated `getProductControllerFindAllQueryKey(params)` already includes all params
as part of the key, so changing any filter param automatically triggers a refetch.

### Data Model

No Prisma schema changes required.

### Backend API — Endpoint Used

| Method | Path                     | Hook                                     | Response type                 |
| ------ | ------------------------ | ---------------------------------------- | ----------------------------- |
| GET    | `/api/products`          | `useProductControllerFindAll`            | `ProductListResponseEnvelope` |
| GET    | `/api/categories` (root) | `useCategoryControllerGetRootCategories` | `CategoryListResponse`        |

`ProductListResponseEnvelope`:

```ts
{ data: ProductEntity[]; meta: PaginationMeta }
// PaginationMeta: { total, page, limit, totalPages }
```

### Filter Controls — Exact Param Mapping

Every filter maps to a real field on `ProductControllerFindAllParams` (confirmed against
`apps/store-api/src/product/dto/product-list-query.dto.ts`):

| UI Control          | URL param key | `ProductControllerFindAllParams` field | Allowed values / constraints           | Default       |
| ------------------- | ------------- | -------------------------------------- | -------------------------------------- | ------------- |
| Category selector   | `categoryId`  | `categoryId?: string`                  | Valid UUID v4 (from categories API)    | none (all)    |
| Minimum price input | `minPrice`    | `minPrice?: number`                    | `>= 0`, float                          | none          |
| Maximum price input | `maxPrice`    | `maxPrice?: number`                    | `>= 0`, float                          | none          |
| Search text input   | `search`      | `search?: string`                      | Max 200 chars, free text               | none          |
| Sort dropdown       | `sortBy`      | `sortBy?: string`                      | `'createdAt'` \| `'price'` \| `'name'` | `'createdAt'` |
| Sort direction      | `sortOrder`   | `sortOrder?: string`                   | `'asc'` \| `'desc'`                    | `'desc'`      |
| Page number         | `page`        | `page?: number`                        | Integer `>= 1`                         | `1`           |
| Items per page      | `limit`       | `limit?: number`                       | Integer `1-100`                        | `20` (fixed)  |
| Active filter       | (not exposed) | `isActive?: boolean`                   | Always `true` on public storefront     | `true`        |

`limit` is fixed at 20 for the public storefront (sensible page size, within API max of 100).
`isActive` is always `true` — not exposed as a user control.
There is **no** `inStock` param on the DTO, so no stock filter is built.

### Frontend (Next.js — FSD)

#### shared/ui

No new base components needed. `Skeleton` and `ProductCard` from TASK-028 are reused as-is.

#### entities

No new entity barrel files needed. `entities/product` and `entities/category` already
re-export everything required:

- `useProductControllerFindAll`, `getProductControllerFindAllQueryKey`, `ProductEntity`,
  `ProductListResponseEnvelope`, `ProductControllerFindAllParams` from `entities/product`
- `useCategoryControllerGetRootCategories`, `CategoryEntity`, `CategoryListResponse` from
  `entities/category`

`entities/product/index.ts` must also export `ProductControllerFindAllParams` if it does not
already (confirmed: it does export it). No changes needed.

#### features

New feature slice: `features/product-filters`

- `features/product-filters/ui/product-filters.tsx` — Client Component; renders the full
  filter panel (category, price range, search, sort); calls `applyFilter` on change.
- `features/product-filters/ui/search-input.tsx` — Client Component; debounced search
  input, isolated so debounce logic does not affect the rest of the filter panel.
- `features/product-filters/index.ts` — barrel; exports `ProductFilters`.

Update `features/index.ts` to export `ProductFilters`.

#### widgets

New widget slice: `widgets/product-list`

- `widgets/product-list/ui/product-list-view.tsx` — Client Component; root of the
  interactive product list page subtree. Reads `useSearchParams()`, derives filter params,
  renders `<ProductFilters>` in a sidebar and `<ProductList>` + `<Pagination>` in the main
  area.
- `widgets/product-list/ui/product-list.tsx` — Client Component; calls
  `useProductControllerFindAll(params)`. Handles loading, error, empty, and success states.
- `widgets/product-list/ui/product-list-skeleton.tsx` — static skeleton; 20 placeholder
  cards in a responsive grid. Used as the `<Suspense>` fallback for `<ProductListView>`.
- `widgets/product-list/ui/pagination.tsx` — Client Component; renders prev/next buttons
  and numbered page links built from `meta.totalPages` and `meta.page`.
- `widgets/product-list/index.ts` — barrel; exports `ProductListView`,
  `ProductListSkeleton`.

Update `widgets/index.ts` to export `ProductListView`, `ProductListSkeleton`.

#### app (pages)

- `src/app/products/page.tsx` — new file. Async Server Component. Awaits `searchParams`,
  extracts initial filter values, exports `metadata`, renders:
  ```tsx
  <Suspense fallback={<ProductListSkeleton />}>
    <ProductListView initialParams={initialParams} />
  </Suspense>
  ```
  The `initialParams` prop passes the server-resolved search params so `ProductListView`
  can render with correct initial state before `useSearchParams` resolves on the client.

### API Contract

No new backend endpoints. Public `GET /api/products` is used with all its existing params.

## Tasks

### TASK-029-A: Create features/product-filters slice

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-028 (entities/category and entities/product exist)

**Acceptance Criteria:**

- [ ] `src/features/product-filters/ui/product-filters.tsx` is a `'use client'` component
- [ ] Accepts props:
  - `categories: CategoryEntity[]` — list to populate the category `<select>`
  - `onFilterChange: (key: string, value: string | undefined) => void` — called on every filter interaction
  - `currentParams: ProductControllerFindAllParams` — used to set controlled values
- [ ] Renders a `<fieldset>` with `<legend>Filters</legend>` containing:
  - Category `<select>` with an "All categories" default option; value is `categoryId`
  - Min price `<input type="number" min="0" step="0.01">` with `<label>`
  - Max price `<input type="number" min="0" step="0.01">` with `<label>`
  - Sort `<select>` with options: "Newest" (`createdAt/desc`), "Price: Low to High" (`price/asc`), "Price: High to Low" (`price/desc`), "Name A-Z" (`name/asc`); maps to `sortBy` + `sortOrder` combined
  - `<SearchInput>` for keyword search (delegated to `search-input.tsx`)
- [ ] All `<label>` elements are associated to their `<input>`/`<select>` via `htmlFor`/`id`
- [ ] "Clear filters" `<button>` resets all filter params; visible only when any filter is active
- [ ] All colours use design tokens; no raw hex values
- [ ] No manual `fetch`/`axios` calls
- [ ] `src/features/product-filters/ui/search-input.tsx` is a `'use client'` component
  - [ ] Debounces the `onSearch` callback by 300 ms using `useEffect` + `clearTimeout`
  - [ ] Input value is controlled; immediate visual feedback on every keystroke
  - [ ] Has `<label>` for a11y; `aria-label="Search products"` fallback
- [ ] `src/features/product-filters/index.ts` exports `ProductFilters`
- [ ] `src/features/index.ts` updated to export `ProductFilters`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/product-filters.tsx` — new
- `apps/store-client/src/features/product-filters/ui/search-input.tsx` — new
- `apps/store-client/src/features/product-filters/index.ts` — new barrel
- `apps/store-client/src/features/index.ts` — add `ProductFilters` export

---

### TASK-029-B: Create widgets/product-list slice (ProductList + Pagination + Skeleton)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-029-A (ProductFilters exists), TASK-028 (ProductCard, Skeleton exist)

**Acceptance Criteria:**

- [ ] `src/widgets/product-list/ui/product-list.tsx` is a `'use client'` component
  - [ ] Accepts `params: ProductControllerFindAllParams` (all active filter params)
  - [ ] Calls `useProductControllerFindAll(params)` imported from `@/entities/product`
  - [ ] Loading state: renders `<ProductListSkeleton />`
  - [ ] Error state: renders a `<p role="alert">` with `text-destructive`
  - [ ] Empty state: renders a descriptive message ("No products match your filters.") with a "Clear filters" link to `/products`
  - [ ] Success state: renders a responsive grid of `<ProductCard>` components — 1 col mobile, 2 on `sm:`, 3 on `md:`, 4 on `lg:`
  - [ ] Renders `<p aria-live="polite">` showing result count (e.g. "24 products found")
  - [ ] Renders `<Pagination>` component below the grid when `meta.totalPages > 1`
- [ ] `src/widgets/product-list/ui/pagination.tsx` is a `'use client'` component
  - [ ] Accepts `currentPage: number`, `totalPages: number`, `buildHref: (page: number) => string`
  - [ ] Renders a `<nav aria-label="Pagination">` with `<ul>` of page links
  - [ ] Shows "Previous" and "Next" links; they are `aria-disabled` when at first/last page
  - [ ] Shows page number links; the current page has `aria-current="page"`
  - [ ] For large page counts (> 7 pages), truncates with an ellipsis in the middle
  - [ ] All pagination items are `<Link>` components — no `router.push` mutation needed
- [ ] `src/widgets/product-list/ui/product-list-skeleton.tsx` renders 20 skeleton cards in the same grid layout; uses `<Skeleton>` from `@/shared/ui`; `aria-hidden="true"`
- [ ] `src/widgets/product-list/index.ts` exports `ProductListView`, `ProductListSkeleton`
- [ ] No raw hex; no manual `fetch`/`axios`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — new
- `apps/store-client/src/widgets/product-list/ui/pagination.tsx` — new
- `apps/store-client/src/widgets/product-list/ui/product-list-skeleton.tsx` — new
- `apps/store-client/src/widgets/product-list/index.ts` — new barrel

---

### TASK-029-C: Create widgets/product-list/ProductListView (URL state orchestrator)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-029-B, TASK-029-A

**Acceptance Criteria:**

- [ ] `src/widgets/product-list/ui/product-list-view.tsx` is a `'use client'` component
- [ ] Accepts `initialParams: ProductControllerFindAllParams` as a prop (passed down from the
      Server Component page after awaiting `searchParams`)
- [ ] Reads live URL state using `useSearchParams()` from `next/navigation`
  - [ ] `categoryId` from `searchParams.get('categoryId') ?? undefined`
  - [ ] `search` from `searchParams.get('search') ?? undefined`
  - [ ] `sortBy` from `searchParams.get('sortBy') ?? 'createdAt'`
  - [ ] `sortOrder` from `searchParams.get('sortOrder') ?? 'desc'`
  - [ ] `minPrice` from `Number(searchParams.get('minPrice'))` or `undefined`
  - [ ] `maxPrice` from `Number(searchParams.get('maxPrice'))` or `undefined`
  - [ ] `page` from `Number(searchParams.get('page')) || 1`
- [ ] Uses `useRouter()` and `usePathname()` from `next/navigation` to construct the `applyFilter` helper
- [ ] `applyFilter(key, value)` builds a new `URLSearchParams` from current params, sets/deletes the key, resets `page` to `'1'`, and calls `router.replace(pathname + '?' + next.toString())`
- [ ] `buildPageHref(page)` returns a full URL string for a given page number, preserving all other params
- [ ] Fetches root categories once via `useCategoryControllerGetRootCategories({ isActive: true, sortBy: 'sortOrder', sortOrder: 'asc' })` imported from `@/entities/category`; passes result to `<ProductFilters>`
- [ ] Layout: two-column grid on `lg:` (narrow sidebar left, wide main area right); single column stacked on smaller screens
- [ ] Renders `<ProductFilters categories={...} currentParams={...} onFilterChange={applyFilter} />`
- [ ] Renders `<ProductList params={...} />` (params object derived from URL state)
- [ ] The `<Pagination>` receives `buildHref={buildPageHref}` so it generates `<Link>` hrefs without needing access to URL state itself
- [ ] Wrapped in `<Suspense>` in the page (the `<Suspense>` lives in the Server Component; `useSearchParams` inside triggers client-only rendering of this subtree)
- [ ] `src/widgets/product-list/index.ts` exports `ProductListView` and `ProductListSkeleton`
- [ ] `src/widgets/index.ts` updated to export `ProductListView`, `ProductListSkeleton`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — new
- `apps/store-client/src/widgets/product-list/index.ts` — update barrel
- `apps/store-client/src/widgets/index.ts` — add `ProductListView`, `ProductListSkeleton` exports

---

### TASK-029-D: Create app/products/page.tsx and wire full build

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-029-C

**Acceptance Criteria:**

- [ ] `src/app/products/page.tsx` does NOT exist before this task; it is created here
- [ ] The page component is `async` (required to `await searchParams`)
- [ ] TypeScript signature:
  ```ts
  export default async function ProductsPage({
    searchParams,
  }: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  });
  ```
- [ ] Calls `const resolvedParams = await searchParams` and extracts:
  - `categoryId`, `search`, `sortBy`, `sortOrder`, `minPrice`, `maxPrice`, `page` — each
    coerced to the correct type (`string | undefined`, `number | undefined`) from
    `resolvedParams[key]` (noting that values may be `string | string[] | undefined`; use
    the first string value if the type is `string[]`)
- [ ] Constructs `initialParams: ProductControllerFindAllParams` from resolved values and
      passes it to `<ProductListView>`
- [ ] Exports `metadata: Metadata` with `title: 'Products | MobileStore'` and a description
- [ ] Renders:
  ```tsx
  <div className="mx-auto w-full max-w-7xl px-4 py-8">
    <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
      All Products
    </h1>
    <Suspense fallback={<ProductListSkeleton />}>
      <ProductListView initialParams={initialParams} />
    </Suspense>
  </div>
  ```
- [ ] Page does NOT add a second `<main>` — the layout already wraps content in `<main>`
- [ ] Visiting `/products` without params shows all products (default sort: newest first)
- [ ] Visiting `/products?categoryId=<uuid>` shows only products in that category
      (this is the link target from `widgets/category-nav`)
- [ ] `npm run build -w apps/store-client` exits 0
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes
- [ ] No raw hex values in any file created in TASK-029
- [ ] No manual `fetch`/`axios` calls anywhere in the new component tree
- [ ] FSD import direction respected: `app` → `widgets` → `features` → `entities` → `shared`

**Files to create/modify:**

- `apps/store-client/src/app/products/page.tsx` — new file (route)

---

## Migration Steps

1. Build `features/product-filters` (TASK-029-A) first — it has no widget dependencies and
   can be developed and typechecked independently.
2. Build the `widgets/product-list` rendering components: `ProductList`, `Pagination`, and
   `ProductListSkeleton` (TASK-029-B) — depends on TASK-029-A for the `ProductFilters` type
   signature, and on TASK-028 for `ProductCard` and `Skeleton`.
3. Build `ProductListView` (TASK-029-C) — the URL state orchestrator; requires
   TASK-029-A and TASK-029-B to be complete.
4. Wire the route `app/products/page.tsx` (TASK-029-D) and run the full build verification.

## Risks & Mitigations

| Risk                                                                                                                                                                                                       | Mitigation                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSearchParams()` requires a `<Suspense>` boundary to allow the rest of the page to prerender. If the boundary is missing, Next.js 16 will error at build time.                                          | Ensure the Server Component page wraps `<ProductListView>` in `<Suspense fallback={<ProductListSkeleton />}>`. This is explicitly in the TASK-029-D acceptance criteria.                              |
| `searchParams` value can be `string \| string[] \| undefined`. Taking `Number(value)` on an array would produce `NaN`.                                                                                     | Extract only the first element: `const raw = resolvedParams.minPrice; const str = Array.isArray(raw) ? raw[0] : raw;` before parsing.                                                                 |
| `router.replace` on every debounced keystroke causes rapid navigation events; the browser may batch or drop some.                                                                                          | 300 ms debounce is sufficient. TanStack Query's `staleTime: 5 min` prevents redundant refetches for identical param sets.                                                                             |
| The `CategoryListResponse` hook (`useCategoryControllerGetRootCategories`) is typed as returning `void` in the generated client (known gap from TASK-028). `ProductListView` accesses `data?.data ?? []`.  | Cast the result: `const cats = (data as unknown as CategoryListResponse)?.data ?? []`. Do not edit the generated file. If the OpenAPI annotation is fixed in a future task, the cast becomes a no-op. |
| `ProductEntity` has no `images` field; `ProductCard` renders a `bg-muted` placeholder. Visitors see grey boxes.                                                                                            | This is a known gap (noted in plan 012). The product list page inherits the same limitation. A follow-up task to add a `thumbnailUrl` field to `ProductEntity` is noted in the Notes section below.   |
| FSD import direction: `features/product-filters` must not import from `widgets/`.                                                                                                                          | Enforced by existing ESLint `import/no-restricted-paths` rules. Run `npm run lint -w apps/store-client` after each task.                                                                              |
| Pagination for very large result sets (hundreds of pages) generates a long list of `<Link>` elements, hurting accessibility and performance.                                                               | Truncate to at most 7 page items with ellipsis: `[1] ... [currentPage-1] [currentPage] [currentPage+1] ... [lastPage]`. Specified in TASK-029-B acceptance criteria.                                  |
| TypeScript: `sortBy` and `sortOrder` are typed as `string` in `ProductControllerFindAllParams` (not a union), so no literal type narrowing is needed — but passing an invalid value silently does nothing. | Document the allowed values clearly in `ProductFilters` (the `<select>` options are the only valid values, so invalid values cannot be submitted via UI).                                             |

## Notes

### Design Tokens Available

All Tailwind classes used must reference tokens defined in `src/app/globals.css`:

| Token                        | Utility classes                                | Usage                                       |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------- |
| `--color-background`         | `bg-background`                                | Page background                             |
| `--color-foreground`         | `text-foreground`                              | Headings, body text                         |
| `--color-primary`            | `bg-primary`, `text-primary`, `border-primary` | Active filter highlight, CTA                |
| `--color-primary-foreground` | `text-primary-foreground`                      | Text on primary bg                          |
| `--color-muted`              | `bg-muted`                                     | Filter panel background, image placeholders |
| `--color-muted-foreground`   | `text-muted-foreground`                        | Secondary text, placeholder                 |
| `--color-destructive`        | `text-destructive`                             | Error messages                              |
| `--color-card`               | `bg-card`                                      | Product card surface                        |
| `--color-card-foreground`    | `text-card-foreground`                         | Product card text                           |
| `--color-border`             | `border-border`                                | Input borders, card borders                 |
| `--color-ring`               | `ring-ring`                                    | Focus ring                                  |
| `--radius-lg`                | `rounded-lg`                                   | Card and input border radius                |

### Existing Infrastructure Notes

- `src/shared/api/instance.ts` is the Axios custom instance — do not touch.
- `src/widgets/category-nav/ui/category-nav.tsx` already generates links to
  `/products?categoryId=${category.id}`. The new `ProductsPage` must honour that param —
  confirmed by the `initialParams` propagation in TASK-029-D.
- `src/widgets/hero-banner/ui/hero-banner.tsx` links to `/products` (no params). That page
  load should show all products with default sorting.
- `src/app/layout.tsx` already provides `<main className="flex-1">` — the page root element
  must be a `<div>`, not another `<main>`.

### Future Dependencies / Known Gaps

1. **`ProductEntity` has no image field** on the list endpoint. `ProductCard` shows a grey
   placeholder. To display real product images on the listing page, either:
   - Add a `thumbnailUrl?: string` field to the `ProductEntity` (backend change + Orval
     regeneration), or
   - Expose the first image from `ProductImageEntity[]` on the list response.
     This is a Phase 5 enhancement; track alongside TASK-045.

2. **Category hook returns `void` type** in the generated client (known from TASK-028 plan).
   A future task should add `@ApiResponse({ type: CategoryListResponse })` to
   `CategoryController.getRootCategories` in `apps/store-api` and regenerate.

3. **No stock/inventory filter** (`inStock`). The `ProductListQueryDto` does not have this
   field. If stock management is added in Phase 3-4, a corresponding filter can be added to
   this page at that time.
