# Plan: Build HomePage (store-client)

> **Status:** In Progress
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-10
> **Last Updated:** 2026-06-10

## Overview

Replace the current placeholder `app/page.tsx` with a fully-functional, production-quality
HomePage for the Mobile Accessories storefront. The page serves as the primary entry point for
shoppers: it orients them with a hero banner, surfaces the category navigation so they can
drill into a product list, and showcases the latest active products to drive discovery.

All data-fetching is done with Orval-generated hooks (`useProductControllerFindAll`,
`useCategoryControllerGetRootCategories`) inside `'use client'` widgets wrapped in
`<Suspense>` boundaries — no manual `fetch`/`axios` calls allowed.

## Scope

### In Scope

- Hero / banner section (static, server-rendered)
- Category navigation tiles section (`useCategoryControllerGetRootCategories`)
- "Latest Products" grid section (`useProductControllerFindAll` with `sortBy=createdAt&sortOrder=desc&limit=8`)
- FSD scaffolding: `entities/product`, `entities/category`, `widgets/category-nav`, `widgets/product-grid`, and the updated `app/page.tsx`
- Skeleton loading states for each dynamic section
- Error boundary handling (inline fallbacks, no separate `error.tsx` yet)
- Responsive layout (mobile-first, Tailwind semantic tokens only)
- Accessibility: semantic landmarks (`<section>`, `<nav>`, `<h2>`, `<article>`), `alt` on images, keyboard-navigable links
- `metadata` export on `app/page.tsx` (page-level override of root title/description)
- `shared/ui` primitives: `Skeleton`, `ProductCard` base component

### Out of Scope

- Filtering, search, or pagination (deferred to TASK-029 ProductListPage)
- Product detail interactions (TASK-030)
- AddToCart feature on the homepage product grid (TASK-032 — the cards will link to the product detail page instead)
- Authentication / user-specific data
- Hero carousel / CMS-driven banners (Phase 5)
- `loading.tsx` route-level file (replaced by per-section `<Suspense>` boundaries for more granular UX)
- `error.tsx` route-level file (deferred — plain inline error states are sufficient for MVP)

## User Stories

1. As a visitor, I want to see a welcoming hero section when I land on the homepage, so that I
   understand what the store sells.
2. As a visitor, I want to browse category tiles on the homepage, so that I can quickly navigate
   to the product category I am interested in.
3. As a visitor, I want to see the latest products on the homepage, so that I can discover new
   arrivals without searching.

## Technical Design

### Next.js 16 Conventions — Critical Notes

The installed version is **Next.js 16.2.4** (confirmed in `node_modules/next/package.json`).
The `node_modules/next/dist/docs/` directory is present and was consulted. Key differences from
training-data assumptions:

1. **`params` is a `Promise`** (introduced in Next.js 15, carried forward to 16). Dynamic route
   page components must `await params`. `app/page.tsx` has no dynamic params so this does not
   affect the HomePage, but widgets passed to dynamic pages later must follow this convention.

2. **`fetch` is NOT cached by default** in Next.js 15+/16. The old automatic Request
   Memoization cache (`next: { revalidate }`) still works for `fetch`, but the **default
   behaviour for `fetch` is now uncached** — it will re-run on every request unless wrapped in
   `use cache` or given explicit `cache` options. Because the homepage sections use Axios-based
   Orval hooks (not native `fetch`), server-side prefetching via `queryClient.prefetchQuery` is
   the correct pattern. See Data Fetching below.

3. **Turbopack is the default bundler** (Webpack opt-out via `--webpack` flag). No custom
   webpack config is in `next.config.ts`, so Turbopack is used automatically.
   The `tailwindcss` v4 postcss plugin already exists; no additional bundler changes are needed.

4. **`'use cache'` directive** is a new Next.js 16 feature for explicit caching of Server
   Component data. It is **not used** in this plan because our data comes via Axios/Orval, not
   native `fetch`.

5. **Context providers** (TanStack Query `<Providers>`) are already correctly set up as a
   `'use client'` component in `app/providers.tsx` and wrapped in the root layout.

6. **`metadata` and `viewport` exports** work identically to Next.js 14/15 — export from
   Server Components only. `app/layout.tsx` already exports both; `app/page.tsx` can export
   a page-level `metadata` object to override title/description.

### Data Model

No Prisma or backend changes required. All data is available via existing endpoints.

### Backend API — Available Endpoints

| Endpoint              | Generated hook                           | Query params used on HomePage                                    |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/products`   | `useProductControllerFindAll`            | `sortBy=createdAt`, `sortOrder=desc`, `limit=8`, `isActive=true` |
| `GET /api/categories` | `useCategoryControllerGetRootCategories` | `isActive=true`, `sortBy=sortOrder`, `sortOrder=asc`             |

**Important gap — no "featured" flag on products:** The `ProductEntity` and
`ProductListQueryDto` have no `isFeatured` field. The homepage "latest products" section
therefore uses `sortBy=createdAt&sortOrder=desc` to show the 8 most recently added active
products. A genuine "Featured Products" section would require a backend change (adding a
`isFeatured: Boolean` field to the `Product` Prisma model and a corresponding query param).
This is explicitly **out of scope** for TASK-028 and logged as a future backend dependency
below.

**Note on `ProductListResponseEnvelope`:** The generated model is typed as
`{ [key: string]: unknown }` (the OpenAPI schema for the paginated envelope was not fully
annotated). Widget code must use runtime narrowing or a local interface for `{ data: ProductEntity[]; meta: { total, page, limit, totalPages } }`.

### Frontend (Next.js — FSD)

#### Server vs Client split

| Component / File                           | Type                                  | Rationale                                                                                                                 |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                             | Server Component (default)            | Renders static hero markup, composes `<Suspense>`-wrapped widgets, exports `metadata`. No state or browser API needed.    |
| `widgets/hero-banner/ui/hero-banner.tsx`   | Server Component                      | Fully static markup — no data or interactivity.                                                                           |
| `widgets/category-nav/ui/category-nav.tsx` | **Client Component** (`'use client'`) | Uses `useCategoryControllerGetRootCategories` (TanStack Query hook), which requires a client context.                     |
| `widgets/product-grid/ui/product-grid.tsx` | **Client Component** (`'use client'`) | Uses `useProductControllerFindAll` (TanStack Query hook).                                                                 |
| `shared/ui/skeleton.tsx`                   | Server Component                      | Pure markup, used as `<Suspense>` fallback.                                                                               |
| `shared/ui/product-card.tsx`               | **Client Component** (`'use client'`) | Will have an `onClick`/link interaction; marked client now to avoid re-classification when AddToCart is added (TASK-032). |

**Hydration strategy:** The `Providers` wrapper at the root layout already provides
`QueryClientProvider`. Client Component widgets call Orval hooks directly. There is no need for
`HydrationBoundary`/`dehydrate` for the homepage because the hero section is static and the two
dynamic sections are streamed in via `<Suspense>` with skeleton fallbacks. If SSR prefetching
is wanted in a future pass (TASK-029 or Phase 5), the `getQueryClient` + `HydrationBoundary`
pattern can be added at that point.

#### shared/ui

New base components to create:

- `src/shared/ui/skeleton.tsx` — reusable animated skeleton block (`animate-pulse`, semantic
  `aria-busy`)
- `src/shared/ui/product-card.tsx` — "dumb" card accepting a `ProductEntity`; renders image,
  name, price, optional sale badge; links to `/products/[slug]`

Update barrel:

- `src/shared/ui/index.ts` — export `Skeleton`, `ProductCard`

#### entities

- `src/entities/product/index.ts` — re-exports `ProductEntity`, `ProductListResponseEnvelope`,
  `useProductControllerFindAll`, `getProductControllerFindAllQueryKey` from `@/shared/api/generated`
- `src/entities/category/index.ts` — re-exports `CategoryEntity`,
  `useCategoryControllerGetRootCategories`, `getCategoryControllerGetRootCategoriesQueryKey`
- `src/entities/index.ts` — barrel re-exports both entity modules

#### features

No new features are introduced in TASK-028. The `features/index.ts` barrel remains a stub.
AddToCart (TASK-032) will populate this layer.

#### widgets

- `src/widgets/hero-banner/ui/hero-banner.tsx` — static Server Component: brand headline,
  sub-headline, CTA button linking to `/products`
- `src/widgets/hero-banner/index.ts` — barrel
- `src/widgets/category-nav/ui/category-nav.tsx` — Client Component; uses
  `useCategoryControllerGetRootCategories`; renders a responsive grid of category tiles (image,
  name, link to `/products?categoryId=[id]`)
- `src/widgets/category-nav/ui/category-nav-skeleton.tsx` — skeleton fallback (6 tiles)
- `src/widgets/category-nav/index.ts` — barrel
- `src/widgets/product-grid/ui/product-grid.tsx` — Client Component; uses
  `useProductControllerFindAll`; renders a responsive 4-column grid of `<ProductCard>`
- `src/widgets/product-grid/ui/product-grid-skeleton.tsx` — skeleton fallback (8 cards)
- `src/widgets/product-grid/index.ts` — barrel
- `src/widgets/index.ts` — barrel re-exports all three widgets

#### app (pages)

- `src/app/page.tsx` — replace placeholder; export `metadata` override; compose
  `<HeroBanner>` (server), `<Suspense fallback={<CategoryNavSkeleton />}><CategoryNav /></Suspense>`,
  `<Suspense fallback={<ProductGridSkeleton />}><ProductGrid /></Suspense>`

### API Contract

No new backend endpoints are needed for this task. The existing public endpoints are used as-is.

| Method | Path              | Params                                                  | Response                                                             |
| ------ | ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/products`   | `sortBy=createdAt&sortOrder=desc&limit=8&isActive=true` | `ProductListResponseEnvelope`                                        |
| GET    | `/api/categories` | `isActive=true&sortBy=sortOrder&sortOrder=asc`          | (root categories list, type `void` in generated hook — see gap note) |

**Type gap:** `categoryControllerGetRootCategories` and `categoryControllerGetCategoryTree` are
typed as returning `void` in the generated client (the OpenAPI decorator on the controller
endpoint does not specify a response type). The widget must cast the result appropriately. A
follow-up backend annotation task is noted in the Risks table below.

## Tasks

### TASK-028-A: Scaffold FSD entity layers for Product and Category

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-027 (Orval hooks already generated)

**Acceptance Criteria:**

- [ ] `src/entities/product/index.ts` re-exports `ProductEntity`, `ProductListResponseEnvelope`,
      `useProductControllerFindAll`, `getProductControllerFindAllQueryKey`
- [ ] `src/entities/category/index.ts` re-exports `CategoryEntity`,
      `useCategoryControllerGetRootCategories`, `getCategoryControllerGetRootCategoriesQueryKey`
- [ ] `src/entities/index.ts` re-exports from both modules
- [ ] `npm run typecheck -w apps/store-client` passes with no errors
- [ ] `npm run lint -w apps/store-client` passes with no errors

**Files to create/modify:**

- `apps/store-client/src/entities/product/index.ts` — product entity barrel
- `apps/store-client/src/entities/category/index.ts` — category entity barrel
- `apps/store-client/src/entities/index.ts` — top-level entities barrel

---

### TASK-028-B: Create shared/ui Skeleton primitive

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-028-A

**Acceptance Criteria:**

- [ ] `src/shared/ui/skeleton.tsx` exports a `Skeleton` component accepting `className?: string`
- [ ] Uses `animate-pulse`, `bg-muted`, `rounded-[var(--radius)]` — no raw hex values
- [ ] Adds `aria-busy="true"` and `role="status"` for a11y
- [ ] `src/shared/ui/index.ts` exports `Skeleton`
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/shared/ui/skeleton.tsx` — new file
- `apps/store-client/src/shared/ui/index.ts` — add `Skeleton` export

---

### TASK-028-C: Create shared/ui ProductCard base component

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-1.5h)
**TDD Required:** No
**Depends on:** TASK-028-B

**Acceptance Criteria:**

- [ ] `src/shared/ui/product-card.tsx` is a `'use client'` component
- [ ] Accepts `product: ProductEntity` as props
- [ ] Renders product name, formatted price (string from API, display as currency),
      sale badge when `compareAtPrice` is set, and a placeholder image area (no image URL
      on `ProductEntity` yet — uses a grey `bg-muted` placeholder until images are added)
- [ ] Wraps entire card in `<Link href={'/products/' + product.slug}>` from `next/link`
- [ ] Uses semantic markup: `<article>`, `<h3>` for name, `<p>` for price
- [ ] All colours use design tokens: `text-foreground`, `text-muted-foreground`,
      `text-primary`, `bg-muted`, `border-border` — no raw hex values
- [ ] `src/shared/ui/index.ts` exports `ProductCard`
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/shared/ui/product-card.tsx` — new file
- `apps/store-client/src/shared/ui/index.ts` — add `ProductCard` export

---

### TASK-028-D: Create HeroBanner widget (static Server Component)

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-028-A

**Acceptance Criteria:**

- [ ] `src/widgets/hero-banner/ui/hero-banner.tsx` is a Server Component (no `'use client'`)
- [ ] Renders a full-width `<section>` with `aria-labelledby` pointing to the `<h1>` id
- [ ] Contains: brand headline (`<h1>`), sub-headline (`<p>`), and a "Shop Now" CTA `<Link>`
      pointing to `/products`
- [ ] Fully responsive: stacks on mobile, side-by-side on `md:` breakpoint (or simple centred layout)
- [ ] Uses only semantic Tailwind tokens — `bg-primary`, `text-primary-foreground`,
      `bg-background`, `text-foreground`, etc. — no raw hex
- [ ] `src/widgets/hero-banner/index.ts` barrel exports `HeroBanner`
- [ ] `src/widgets/index.ts` exports `HeroBanner`
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/hero-banner/ui/hero-banner.tsx` — new file
- `apps/store-client/src/widgets/hero-banner/index.ts` — barrel
- `apps/store-client/src/widgets/index.ts` — add `HeroBanner` export

---

### TASK-028-E: Create CategoryNav widget with skeleton

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-028-B, TASK-028-A

**Acceptance Criteria:**

- [ ] `src/widgets/category-nav/ui/category-nav.tsx` is a `'use client'` component
- [ ] Calls `useCategoryControllerGetRootCategories({ isActive: true, sortBy: 'sortOrder', sortOrder: 'asc' })`
      imported from `@/entities/category`
- [ ] Handles three states: loading (renders `<CategoryNavSkeleton />`), error (renders a
      visible error message with `role="alert"`), and success (renders tiles)
- [ ] Each tile: category image (if present; otherwise grey placeholder), category name in `<p>`,
      wrapped in `<Link href={'/products?categoryId=' + category.id}>` — entire tile is keyboard-focusable
- [ ] Responsive grid: 2 cols on mobile, 3 on `sm:`, 4 on `lg:`, using Tailwind grid utilities
- [ ] Enclosing `<nav aria-label="Product categories">` landmark with `<h2>` heading
- [ ] `src/widgets/category-nav/ui/category-nav-skeleton.tsx` renders 6 skeleton tiles using `<Skeleton>`
- [ ] `src/widgets/category-nav/index.ts` barrel exports `CategoryNav`, `CategoryNavSkeleton`
- [ ] `src/widgets/index.ts` exports `CategoryNav`, `CategoryNavSkeleton`
- [ ] No raw hex values; no manual `fetch`/`axios`; only the Orval-generated hook
- [ ] `npm run typecheck -w apps/store-client` and `npm run lint -w apps/store-client` pass

**Files to create/modify:**

- `apps/store-client/src/widgets/category-nav/ui/category-nav.tsx` — new file
- `apps/store-client/src/widgets/category-nav/ui/category-nav-skeleton.tsx` — new file
- `apps/store-client/src/widgets/category-nav/index.ts` — barrel
- `apps/store-client/src/widgets/index.ts` — add `CategoryNav`, `CategoryNavSkeleton` exports

---

### TASK-028-F: Create ProductGrid widget with skeleton

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-028-C, TASK-028-A

**Acceptance Criteria:**

- [ ] `src/widgets/product-grid/ui/product-grid.tsx` is a `'use client'` component
- [ ] Calls `useProductControllerFindAll({ sortBy: 'createdAt', sortOrder: 'desc', limit: 8, isActive: true })`
      imported from `@/entities/product`
- [ ] Handles loading (renders `<ProductGridSkeleton />`), error (renders `role="alert"` error message),
      empty (renders "No products yet" text), and success (renders `<ProductCard>` grid) states
- [ ] Grid: 1 col mobile, 2 on `sm:`, 4 on `lg:` using Tailwind grid utilities
- [ ] Enclosing `<section aria-labelledby="latest-products-heading">` with `<h2 id="latest-products-heading">`
- [ ] `src/widgets/product-grid/ui/product-grid-skeleton.tsx` renders 8 skeleton cards using `<Skeleton>`
- [ ] `src/widgets/product-grid/index.ts` barrel exports `ProductGrid`, `ProductGridSkeleton`
- [ ] `src/widgets/index.ts` exports `ProductGrid`, `ProductGridSkeleton`
- [ ] No raw hex values; no manual `fetch`/`axios`
- [ ] `npm run typecheck -w apps/store-client` and `npm run lint -w apps/store-client` pass

**Files to create/modify:**

- `apps/store-client/src/widgets/product-grid/ui/product-grid.tsx` — new file
- `apps/store-client/src/widgets/product-grid/ui/product-grid-skeleton.tsx` — new file
- `apps/store-client/src/widgets/product-grid/index.ts` — barrel
- `apps/store-client/src/widgets/index.ts` — add `ProductGrid`, `ProductGridSkeleton` exports

---

### TASK-028-G: Wire up app/page.tsx and verify full build

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-028-D, TASK-028-E, TASK-028-F

**Acceptance Criteria:**

- [ ] `src/app/page.tsx` is a Server Component (no `'use client'`)
- [ ] Exports a `metadata: Metadata` constant overriding the page-level title
      (`"Home | MobileStore"`) and description
- [ ] Renders in order:
  1. `<HeroBanner />`
  2. `<section>` with a `<h2>` heading "Shop by Category" + `<Suspense fallback={<CategoryNavSkeleton />}><CategoryNav /></Suspense>`
  3. `<section>` with a `<h2>` heading "Latest Products" + `<Suspense fallback={<ProductGridSkeleton />}><ProductGrid /></Suspense>`
- [ ] The top-level page element is `<main>` (or a `<div>` inside the existing `<main>` from
      the root layout — do not nest two `<main>` elements)
- [ ] `npm run build -w apps/store-client` exits with code 0 (Turbopack default)
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes
- [ ] Visiting `http://localhost:3000/` in the browser shows all three sections; dynamic sections
      display skeletons briefly then data
- [ ] No manual `fetch` or `axios` calls anywhere in the HomePage component tree
- [ ] No raw hex colour values in any new `.tsx` file

**Files to create/modify:**

- `apps/store-client/src/app/page.tsx` — replace placeholder implementation

---

## Migration Steps

1. Create entity barrels (TASK-028-A) — no moving parts, safe starting point.
2. Add shared/ui `Skeleton` (TASK-028-B) — depends on nothing new.
3. Add shared/ui `ProductCard` (TASK-028-C) — depends on `Skeleton` for loading states in grid.
4. Build `HeroBanner` widget (TASK-028-D) — fully static, can be done in parallel with C.
5. Build `CategoryNav` widget + skeleton (TASK-028-E) — requires entity barrel + Skeleton.
6. Build `ProductGrid` widget + skeleton (TASK-028-F) — requires entity barrel + ProductCard.
7. Wire `app/page.tsx` and run full build verification (TASK-028-G) — final integration step.

## Risks & Mitigations

| Risk                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categoryControllerGetRootCategories` and `categoryControllerGetCategoryTree` hooks return `void` type (OpenAPI response not annotated on controller) | Cast response with a local type `type CategoryListResponse = { data: CategoryEntity[]; meta: { total: number; page: number; limit: number; totalPages: number } }`. Log a follow-up task to add `@ApiResponse` decorators to the Category controller endpoints. |
| `ProductListResponseEnvelope` is typed as `{ [key: string]: unknown }` in generated models                                                            | Define a local narrowed type in `entities/product/index.ts`; do not edit the generated file.                                                                                                                                                                    |
| No `isFeatured` flag on `Product` — homepage cannot show a curated "Featured Products" section                                                        | Use `sortBy=createdAt&sortOrder=desc` as a proxy for "latest". Add a BACKLOG item to add `isFeatured` to the Prisma schema in Phase 5.                                                                                                                          |
| Turbopack (Next.js 16 default) may surface different build errors than Webpack                                                                        | Run `npm run build -w apps/store-client` early (after TASK-028-D) to catch issues before the final integration task.                                                                                                                                            |
| `ProductEntity` has no `images` field — `ProductCard` cannot display a real product image                                                             | Use a `bg-muted` placeholder rectangle. Images are added to the API via `ProductImageEntity` in the detail endpoint; a separate task can add image support to the card once a list-level image URL is surfaced in the API.                                      |
| FSD import direction violation: widgets must not import from `app/`                                                                                   | Enforced by existing ESLint `import/no-restricted-paths` rules in `eslint.config.mjs`. Run lint after each new file.                                                                                                                                            |

## Notes

### Design Tokens Available

The following Tailwind utility classes are available via CSS custom properties defined in
`src/app/globals.css` (Tailwind v4 `@theme inline` block):

| Token                        | Utility classes                                        | Usage                            |
| ---------------------------- | ------------------------------------------------------ | -------------------------------- |
| `--color-background`         | `bg-background`, `text-background`                     | Page background                  |
| `--color-foreground`         | `text-foreground`                                      | Body text                        |
| `--color-primary`            | `bg-primary`, `text-primary`, `border-primary`         | Brand accent, CTAs               |
| `--color-primary-foreground` | `text-primary-foreground`                              | Text on primary backgrounds      |
| `--color-muted`              | `bg-muted`                                             | Subtle backgrounds, placeholders |
| `--color-muted-foreground`   | `text-muted-foreground`                                | Secondary text                   |
| `--color-accent`             | `bg-accent`, `text-accent`                             | Hover states                     |
| `--color-accent-foreground`  | `text-accent-foreground`                               | Text on accent                   |
| `--color-destructive`        | `bg-destructive`, `text-destructive`                   | Errors                           |
| `--color-card`               | `bg-card`                                              | Card surfaces                    |
| `--color-card-foreground`    | `text-card-foreground`                                 | Card text                        |
| `--color-border`             | `border-border`                                        | Borders                          |
| `--radius-sm/md/lg/xl`       | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` | Border radius                    |

Raw hex values (`#2563eb`, etc.) must NEVER appear in `.tsx` component files. The only
exception is `src/shared/config/theme.ts`, which exists specifically for APIs that cannot
consume CSS variables (e.g. `viewport.themeColor` in `layout.tsx`).

### Existing Infrastructure Notes

- `src/shared/api/index.ts` currently only re-exports Cart hooks and all generated models.
  The product and category hooks must be consumed directly from the generated path
  (`@/shared/api/generated/products/products` and `.../categories/categories`) at the entity
  layer, and then re-exported from `@/entities/product` and `@/entities/category`. Do NOT add
  product/category hooks to `src/shared/api/index.ts` yet — that barrel is intentionally
  focused on the Cart API for now; the entities layer is the right re-export point.

- `src/shared/ui/index.ts` currently exports nothing (`export {}`). New components added in
  this task should be exported from there and re-exported through the entities/widgets barrels
  as needed.

- `src/widgets/index.ts` and `src/entities/index.ts` currently export nothing. Both need to be
  populated as part of this task.

- The root `src/app/layout.tsx` already includes a minimal `<header>` with a "MobileStore" link
  and a `<footer>`. The HomePage's `<main>` content is rendered inside the layout's
  `<main className="flex-1">` — the HomePage `page.tsx` must NOT render a second `<main>`.
  Use a `<div>` or fragment as the page root.

### Future Backend Dependency

A `isFeatured: Boolean` field on the `Product` model (plus a corresponding `featured?: boolean`
query param in `ProductListQueryDto`) would enable a proper "Featured Products" section. This
should be tracked as a Phase 5 enhancement linked to TASK-045.
