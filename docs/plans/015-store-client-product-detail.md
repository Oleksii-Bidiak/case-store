# Plan: Build ProductDetailPage (store-client)

> **Status:** Done
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-10
> **Last Updated:** 2026-06-10

## Overview

Build the `/products/[slug]` route in `apps/store-client` — the product detail page for the
Mobile Accessories storefront. When a visitor clicks a `<ProductCard>` from the HomePage grid
or the ProductListPage, they land on this page and see the full product presentation: image
gallery, name, description, price (with optional sale price), variant selector, category
breadcrumb, and a placeholder "Add to Cart" CTA area reserved for TASK-032.

The backend endpoint `GET /api/products/:slug` already exists and is fully annotated in
Swagger. The Orval-generated hook `useProductControllerFindBySlug` is already present in
`shared/api/generated/products/products.ts` and returns a `ProductDetailResponseEnvelope`
containing `{ data: ProductEntity, category: ProductCategoryEntity, variants:
ProductVariantEntity[], images: ProductImageEntity[] }`. There is no blocker on the API side —
the generated hook is ready to use as-is.

## No API Blockers

Verification against the generated client confirms:

- `useProductControllerFindBySlug(slug)` — present, typed, enabled when `slug` is truthy.
- `getProductControllerFindBySlugQueryKey(slug)` — present.
- Return type `ProductDetailResponseEnvelope` — fully typed with all four fields.
- The route param is a **slug** (`GET /products/:slug`), not an ID. The Next.js dynamic
  segment must therefore be `[slug]` (i.e. `app/products/[slug]/page.tsx`), consistent with
  the existing `ProductCard` link `href={'/products/' + product.slug}` in `shared/ui/product-card.tsx`.

## Scope

### In Scope

- Route `app/products/[slug]/page.tsx` (new dynamic segment inside the existing `app/products/` directory)
- `entities/product` barrel update — add `useProductControllerFindBySlug`, `getProductControllerFindBySlugQueryKey`, `ProductDetailResponseEnvelope`, `ProductCategoryEntity`, `ProductVariantEntity`, `ProductImageEntity` re-exports
- `widgets/product-detail` new widget slice containing:
  - `ProductDetailView` — Client Component; fetches data, orchestrates all sub-components
  - `ProductImageGallery` — Client Component; displays product images with active-image selection
  - `ProductVariantSelector` — Client Component; renders variant selection (name, price, stock)
  - `ProductDetailSkeleton` — skeleton fallback for the full detail view
- Breadcrumb navigation: Home > Products > Category Name > Product Name
- Page-level `metadata` with dynamic `title` (product name) and `description` (product description)
- Not-found handling: when the API returns 404, render Next.js `notFound()` so the standard 404 page is shown
- Skeleton loading state wrapped in `<Suspense>` from the Server Component page
- Error state (inline `role="alert"` fallback inside the Client Component)
- Responsive layout (single-column mobile, two-column image+info on `md:` and above)
- Accessibility: `<article>`, `<h1>` for product name, `<nav aria-label="Breadcrumb">`, image `alt` from `ProductImageEntity.alt`, focus management on variant selection, `aria-pressed` on active variant
- Design tokens only — no raw hex values in any `.tsx` file
- "Add to Cart" CTA placeholder button (disabled, labelled "Add to Cart — coming soon") to reserve the slot for TASK-032 without blocking this task

### Out of Scope

- Actual AddToCart mutation (TASK-032 — the button is a placeholder only)
- Product reviews / ratings (not in the current Prisma schema)
- Related products section (no API for this yet)
- Image upload or CDN optimisation (Phase 5)
- `loading.tsx` route-level file (per-component `<Suspense>` is used, as per homepage convention)
- `error.tsx` route-level file (inline error states are sufficient for MVP)
- Zoom / lightbox on product images (Phase 5 polish)
- Inventory-level messaging beyond variant stock count (no warehouse/location data)
- Admin edit shortcut from the detail page (Phase 4)

## User Stories

1. As a visitor, I want to see a full-page view of a product with images, description, and
   price, so that I can make an informed purchase decision.
2. As a visitor, I want to see all available variants (colour, size) for a product, so that
   I can choose the one I want before adding it to my cart.
3. As a visitor, I want to see the sale price alongside the original price when a product is
   on sale, so that I know how much I am saving.
4. As a visitor, I want to know the stock quantity of a variant, so that I can tell whether
   the product is available.
5. As a visitor, I want to navigate back to the product category via a breadcrumb, so that I
   can continue browsing related products.
6. As a visitor with a search engine bookmark, I want the page URL to be the product slug,
   so that the link remains human-readable and stable.

## Technical Design

### Next.js 16 Conventions — Critical Notes

Confirmed from `apps/store-client/node_modules/next/dist/docs/`:

1. **`params` is a `Promise`** in Next.js 15+/16. Dynamic route page components must be
   `async` and call `const { slug } = await params` before using the value. The TypeScript
   signature is `params: Promise<{ slug: string }>`.

2. **`generateMetadata`** is the correct mechanism for per-page dynamic `<title>` and
   `<description>` on dynamic routes. It receives the same `{ params }` argument as the page
   component, is `async`, and can call the API to retrieve the product name and description.
   Because `generateMetadata` runs on the server, it must use the raw fetcher
   (`productControllerFindBySlug`) directly, not the React hook.

3. **`notFound()`** from `next/navigation` is the correct way to render a 404 response from
   a Server Component when the API returns a 404. It throws an error caught by the nearest
   `not-found.tsx` (or the default Next.js 404 page if none exists).

4. Dynamic routes that use `params` opt into **dynamic rendering** per request. This is
   intentional and correct — product data changes frequently enough that per-request rendering
   is appropriate for MVP. Server-side caching (`use cache`) can be layered on in Phase 5.

5. **Turbopack** is the default bundler. `next.config.ts` has no custom webpack config, so
   no bundler changes are needed.

### Data Model

No Prisma schema changes required. All necessary data is returned by the existing
`GET /api/products/:slug` endpoint.

### Backend API — Endpoint Used

| Method | Path                  | Hook / Function                                                             | Response type                   |
| ------ | --------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| GET    | `/api/products/:slug` | `useProductControllerFindBySlug(slug)` (Client Component)                   | `ProductDetailResponseEnvelope` |
| GET    | `/api/products/:slug` | `productControllerFindBySlug(slug)` (Server Component — `generateMetadata`) | `ProductDetailResponseEnvelope` |

`ProductDetailResponseEnvelope` shape (confirmed from generated model):

```ts
interface ProductDetailResponseEnvelope {
  data: ProductEntity; // id, name, slug, description, price, compareAtPrice, sku, categoryId, isActive, createdAt, updatedAt
  category: ProductCategoryEntity; // id, name, slug
  variants: ProductVariantEntity[]; // id, name, sku, price, stock, attributes, isActive
  images: ProductImageEntity[]; // id, url, alt, sortOrder
}
```

**Note on `images`:** Unlike the product list endpoint (which has no image field),
`ProductDetailResponseEnvelope` includes a full `images: ProductImageEntity[]` array where
each item has a `url: string` and `alt: string | null`. The gallery can therefore display real
product images on the detail page. Images are sorted by `sortOrder` (ascending).

**Note on `variants`:** If the `variants` array is empty (a product has no variants), the
page displays the base `ProductEntity.price` directly and hides the variant selector. A
product with variants uses the selected variant's `price` and `stock` for display.

### Frontend (Next.js — FSD)

#### Server vs Client split

| File / Component                                         | Type                              | Rationale                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/products/[slug]/page.tsx`                           | Server Component (`async`)        | Awaits `params` to get slug. Calls `notFound()` if product not found. Exports page-level `metadata` and delegates to `generateMetadata`. Renders `<Suspense fallback={<ProductDetailSkeleton />}><ProductDetailView slug={slug} /></Suspense>`. |
| `generateMetadata` in `app/products/[slug]/page.tsx`     | Server-only async function        | Fetches product data server-side to produce dynamic `<title>` and `<description>`. Falls back to generic title on error.                                                                                                                        |
| `widgets/product-detail/ui/product-detail-view.tsx`      | Client Component (`'use client'`) | Root of interactive subtree. Calls `useProductControllerFindBySlug`. Handles loading/error/success states. Orchestrates all sub-components.                                                                                                     |
| `widgets/product-detail/ui/product-image-gallery.tsx`    | Client Component (`'use client'`) | Manages active image index state. Renders main image + thumbnail strip. Requires `onClick` interactivity.                                                                                                                                       |
| `widgets/product-detail/ui/product-variant-selector.tsx` | Client Component (`'use client'`) | Manages selected variant state. Renders variant buttons with `aria-pressed`. Calls `onVariantChange` callback.                                                                                                                                  |
| `widgets/product-detail/ui/product-detail-skeleton.tsx`  | Server-compatible                 | Static skeleton markup. Used as `<Suspense>` fallback.                                                                                                                                                                                          |
| `shared/ui/Skeleton`                                     | Server-compatible (exists)        | Reused unchanged.                                                                                                                                                                                                                               |
| `shared/ui/ProductCard`                                  | Client Component (exists)         | Not directly used on the detail page, but part of any "related products" future expansion.                                                                                                                                                      |

**Hydration strategy:** The root layout `<Providers>` already provides `QueryClientProvider`.
`ProductDetailView` calls `useProductControllerFindBySlug` directly as a Client Component.
No `HydrationBoundary` / `dehydrate` is needed for MVP. If SSR prefetching is added in Phase 5
for SEO/performance, the `getQueryClient` + `HydrationBoundary` pattern can be layered on.

#### entities/product — updates required

The `entities/product/index.ts` barrel currently only exports types and hooks for the product
list. It must be updated to also export:

- Types: `ProductDetailResponseEnvelope`, `ProductCategoryEntity`, `ProductVariantEntity`,
  `ProductImageEntity` from `@/shared/api/generated/models`
- Hooks: `useProductControllerFindBySlug`, `getProductControllerFindBySlugQueryKey` from
  `@/shared/api/generated/products/products`

Upper-layer components (widgets) import these from `@/entities/product`, never from the
generated path directly. This upholds the FSD layer boundary convention.

#### shared/ui — no changes required

`Skeleton` and `ProductCard` from TASK-028 are reused as-is. No new base UI components are
needed for the detail page.

#### features — no new feature slices in this task

No new `features/` slices are introduced. The "Add to Cart" placeholder button is a UI
element inside `widgets/product-detail`. The real `AddToCart` feature (TASK-032) will be a
separate `features/add-to-cart` slice injected into the detail page at that time.

#### widgets/product-detail

New widget slice: `widgets/product-detail`

- `widgets/product-detail/ui/product-detail-view.tsx` — Client Component; root orchestrator
  for the detail page's interactive subtree.
- `widgets/product-detail/ui/product-image-gallery.tsx` — Client Component; image display
  and thumbnail navigation.
- `widgets/product-detail/ui/product-variant-selector.tsx` — Client Component; variant
  selection UI.
- `widgets/product-detail/ui/product-detail-skeleton.tsx` — static skeleton matching the
  two-column layout.
- `widgets/product-detail/index.ts` — barrel; exports `ProductDetailView` and
  `ProductDetailSkeleton`.

Update `widgets/index.ts` to export `ProductDetailView` and `ProductDetailSkeleton`.

#### app (pages)

- `src/app/products/[slug]/page.tsx` — new dynamic route. Async Server Component. Awaits
  `params`, passes `slug` to `<ProductDetailView>` inside a `<Suspense>` boundary.
  Exports `generateMetadata`.

### API Contract

No new backend endpoints or DTO changes are needed.

| Method | Path                  | Auth   | Response type                   |
| ------ | --------------------- | ------ | ------------------------------- |
| GET    | `/api/products/:slug` | Public | `ProductDetailResponseEnvelope` |

## Tasks

### TASK-030-A: Update entities/product barrel with detail types and hook

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-029 (entities/product barrel already exists)

**Acceptance Criteria:**

- [ ] `src/entities/product/index.ts` additionally exports:
  - `ProductDetailResponseEnvelope`, `ProductCategoryEntity`, `ProductVariantEntity`,
    `ProductImageEntity` (re-exported as `type` from `@/shared/api/generated/models`)
  - `useProductControllerFindBySlug`, `getProductControllerFindBySlugQueryKey` (re-exported
    from `@/shared/api/generated/products/products`)
- [ ] Existing exports (`ProductEntity`, `ProductListResponseEnvelope`,
      `ProductControllerFindAllParams`, `useProductControllerFindAll`,
      `getProductControllerFindAllQueryKey`) remain untouched
- [ ] `npm run typecheck -w apps/store-client` passes with no errors
- [ ] `npm run lint -w apps/store-client` passes with no errors

**Files to create/modify:**

- `apps/store-client/src/entities/product/index.ts` — add new type and hook re-exports

---

### TASK-030-B: Create widgets/product-detail/ProductDetailSkeleton

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-030-A

**Acceptance Criteria:**

- [ ] `src/widgets/product-detail/ui/product-detail-skeleton.tsx` is a Server-compatible
      component (no `'use client'` directive)
- [ ] Matches the two-column layout structure of `ProductDetailView`:
  - Left column: tall rectangular skeleton for the main image area + a row of 4 small thumbnail skeletons
  - Right column: skeleton for product name (wide), price (narrow), variant section (3 button-sized skeletons), description (3 lines), and CTA button (full-width)
- [ ] Uses `<Skeleton>` from `@/shared/ui` — no raw `animate-pulse` inline
- [ ] Sets `aria-hidden="true"` on the top-level wrapper to hide from screen readers during loading
- [ ] Single-column layout on mobile (`flex-col`), two-column on `md:` (`grid grid-cols-2`)
- [ ] `src/widgets/product-detail/index.ts` barrel exports `ProductDetailSkeleton`
- [ ] `src/widgets/index.ts` updated to export `ProductDetailSkeleton`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-detail-skeleton.tsx` — new file
- `apps/store-client/src/widgets/product-detail/index.ts` — new barrel
- `apps/store-client/src/widgets/index.ts` — add `ProductDetailSkeleton` export

---

### TASK-030-C: Create widgets/product-detail/ProductImageGallery

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-030-A

**Acceptance Criteria:**

- [ ] `src/widgets/product-detail/ui/product-image-gallery.tsx` is a `'use client'` component
- [ ] Accepts `images: ProductImageEntity[]` as prop (imported type from `@/entities/product`)
- [ ] Manages `activeIndex: number` local state (default `0`)
- [ ] Renders a main image area:
  - When `images` is non-empty: renders `<img>` with `src={images[activeIndex].url}` and
    `alt={images[activeIndex].alt ?? product.name}` (product name passed as fallback `altFallback: string` prop)
  - When `images` is empty: renders a `bg-muted` placeholder rectangle with `aria-label="No image available"`
- [ ] Renders a thumbnail strip below the main image:
  - One `<button>` per image; clicking sets `activeIndex`
  - Active thumbnail has `aria-pressed="true"` and a visible border (`border-primary`)
  - Inactive thumbnails have `aria-pressed="false"`
  - Each thumbnail `<img>` has appropriate `alt` text
- [ ] The thumbnail strip is scrollable horizontally on narrow viewports (`overflow-x-auto`)
- [ ] When there is only one image (or zero images), the thumbnail strip is not rendered
- [ ] No raw hex values; only design tokens
- [ ] No manual `fetch`/`axios`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` — new file

---

### TASK-030-D: Create widgets/product-detail/ProductVariantSelector

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-030-A

**Acceptance Criteria:**

- [ ] `src/widgets/product-detail/ui/product-variant-selector.tsx` is a `'use client'` component
- [ ] Accepts:
  - `variants: ProductVariantEntity[]`
  - `selectedVariantId: string | null`
  - `onVariantChange: (variantId: string) => void`
- [ ] When `variants` is empty, renders nothing (the parent handles no-variant display)
- [ ] Renders a labelled group: `<fieldset>` with `<legend>Choose a variant</legend>`
- [ ] Each active variant (`isActive === true`) renders as a `<button>`:
  - Displays `variant.name`
  - `aria-pressed={variant.id === selectedVariantId}`
  - Calls `onVariantChange(variant.id)` on click
  - Shows variant price when it differs from the base product price
  - Shows stock status: `"In stock (${variant.stock})"` when `stock > 0`; `"Out of stock"` when `stock === 0` with `text-destructive` colour and `disabled` attribute
- [ ] Inactive variants (`isActive === false`) are not rendered
- [ ] The selected variant button has a distinct visual style: `border-primary`, `bg-primary/10`
- [ ] The first active variant is auto-selected on mount (managed by parent via `onVariantChange` called in `useEffect`)
- [ ] No raw hex values; only design tokens
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-variant-selector.tsx` — new file

---

### TASK-030-E: Create widgets/product-detail/ProductDetailView (orchestrator)

**Type:** feat
**Scope:** store-client
**Complexity:** L (4-6h)
**TDD Required:** No
**Depends on:** TASK-030-B, TASK-030-C, TASK-030-D

**Acceptance Criteria:**

- [ ] `src/widgets/product-detail/ui/product-detail-view.tsx` is a `'use client'` component
- [ ] Accepts `slug: string` as a prop
- [ ] Calls `useProductControllerFindBySlug(slug)` imported from `@/entities/product`
- [ ] Manages `selectedVariantId: string | null` local state
- [ ] When `isLoading` is `true`, renders `<ProductDetailSkeleton />`
- [ ] When `isError` is `true`, renders a `<p role="alert" className="text-destructive">` error message with a "Go back to products" `<Link href="/products">` fallback
- [ ] When data is available, renders the full detail layout:
  - **Breadcrumb navigation** (`<nav aria-label="Breadcrumb">`):
    - `Home` → `Products` → `[category.name]` → `[product.name]` (truncated to 30 chars with ellipsis)
    - All items are `<Link>` elements except the final (current) item which uses `aria-current="page"`
    - Category link: `/products?categoryId=${category.id}`
  - **Two-column layout** (single column on mobile, `md:grid md:grid-cols-2 md:gap-8` on tablet+):
    - Left: `<ProductImageGallery images={sortedImages} altFallback={product.name} />`
    - Right (product info panel):
      - `<h1 className="text-2xl font-bold text-foreground">` with `product.name`
      - Price display:
        - Active variant selected: display `selectedVariant.price`; show `product.compareAtPrice` as strikethrough if set and higher than variant price
        - No variant selected (no variants or loading): display `product.price`; show `product.compareAtPrice` if set
        - Price formatted as USD currency via `Intl.NumberFormat`
        - Sale badge: `<span>` with `bg-destructive text-destructive-foreground` when a sale price is shown
      - SKU display: `<p className="text-sm text-muted-foreground">SKU: {sku}</p>` when `sku` is not null
      - `<ProductVariantSelector variants={variants} selectedVariantId={selectedVariantId} onVariantChange={setSelectedVariantId} />`
      - Description area: when `product.description` is non-null, renders `<section aria-labelledby="product-description-heading">` with a `<h2 id="product-description-heading">Description</h2>` and the description text in a `<p>` (markdown is rendered as plain text for MVP; no `dangerouslySetInnerHTML`)
      - Add to Cart placeholder CTA: `<button disabled className="w-full ...">Add to Cart — coming soon</button>`; must be visually prominent (`bg-primary text-primary-foreground`) but clearly marked as disabled (`opacity-50 cursor-not-allowed`); includes `aria-label="Add to Cart feature coming soon"` for screen readers
- [ ] Images are sorted by `sortOrder` ascending before passing to `ProductImageGallery`
- [ ] `src/widgets/product-detail/index.ts` barrel exports `ProductDetailView`
- [ ] `src/widgets/index.ts` updated to export `ProductDetailView`
- [ ] No raw hex values anywhere in the component tree
- [ ] No manual `fetch`/`axios` calls
- [ ] FSD import direction respected: `widgets` may import from `entities` and `shared`, but NOT from `app` or `features`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — new file
- `apps/store-client/src/widgets/product-detail/index.ts` — update barrel to add `ProductDetailView`
- `apps/store-client/src/widgets/index.ts` — add `ProductDetailView` export

---

### TASK-030-F: Create app/products/[slug]/page.tsx and wire full build

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-030-E

**Acceptance Criteria:**

- [ ] `src/app/products/[slug]/page.tsx` does not exist before this task — it is created here
- [ ] The page component is `async` (required to `await params`)
- [ ] TypeScript signature:
  ```ts
  export default async function ProductDetailPage({
    params,
  }: {
    params: Promise<{ slug: string }>;
  });
  ```
- [ ] Calls `const { slug } = await params` before any usage
- [ ] Does NOT call `notFound()` directly in the page component body — not-found handling is
      delegated to `ProductDetailView` which renders an inline error state for MVP (a dedicated
      `not-found.tsx` can be added in Phase 5 for proper HTTP 404 semantics if needed for SEO)
- [ ] Renders:
  ```tsx
  <div className="mx-auto w-full max-w-7xl px-4 py-8">
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductDetailView slug={slug} />
    </Suspense>
  </div>
  ```
- [ ] Exports `generateMetadata` function:
  - Async, receives `{ params: Promise<{ slug: string }> }`
  - Awaits params to get slug
  - Calls `productControllerFindBySlug(slug)` (raw fetcher, not the hook) from
    `@/shared/api/generated/products/products`
  - On success: returns `{ title: "${product.data.name} | MobileStore", description: product.data.description ?? "View product details." }`
  - On error (any exception, including 404): returns `{ title: "Product | MobileStore" }` as a safe fallback
- [ ] The page does NOT add a second `<main>` element — the root layout already provides `<main className="flex-1">`
- [ ] Visiting `/products/iphone-15-pro-case-clear-magsafe` (or any valid slug) renders the full product detail page in the browser
- [ ] Visiting `/products/non-existent-slug` renders the inline error state (not a white page crash)
- [ ] `npm run build -w apps/store-client` exits with code 0
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes
- [ ] No raw hex values in any new `.tsx` file
- [ ] No manual `fetch`/`axios` in any new file (raw `productControllerFindBySlug` fetcher in `generateMetadata` is Orval-generated and acceptable — it is not a hand-written `fetch`/`axios` call)
- [ ] FSD import direction respected: `app` imports from `widgets` and `shared` only

**Files to create/modify:**

- `apps/store-client/src/app/products/[slug]/page.tsx` — new dynamic route file

---

## Migration Steps

1. Update `entities/product` barrel (TASK-030-A) — prerequisite for all widgets; no UI risk.
2. Build `ProductDetailSkeleton` (TASK-030-B) — depends only on `Skeleton`; establishes the
   layout structure early so the page renders immediately with the correct skeleton shape.
3. Build `ProductImageGallery` (TASK-030-C) — can be developed in parallel with TASK-030-D
   as both only depend on TASK-030-A.
4. Build `ProductVariantSelector` (TASK-030-D) — can be developed in parallel with TASK-030-C.
5. Build `ProductDetailView` orchestrator (TASK-030-E) — requires all three widget
   sub-components (B, C, D) to be complete.
6. Create `app/products/[slug]/page.tsx` and verify full build (TASK-030-F) — final integration
   step; run `npm run build`, `npm run typecheck`, and `npm run lint` here.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                                                                                        | Mitigation                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `params` is a `Promise` in Next.js 16 — forgetting `await` causes a type error and runtime failure                                                                                                                                                                                                                          | Enforced in acceptance criteria: page must be `async` and call `const { slug } = await params`. TypeScript will flag synchronous access.                                                                                                                                                                                                                       |
| `generateMetadata` calls `productControllerFindBySlug` (the raw Orval fetcher) server-side. The Axios instance may not have the correct `baseURL` for server-side calls if the API URL is not configured for SSR.                                                                                                           | Verify that `NEXT_PUBLIC_API_URL` (or the equivalent env var in `shared/api/instance.ts`) resolves correctly from the Next.js server process. If the API is only reachable from the browser (e.g. `http://localhost:3001`), `generateMetadata` must use an absolute URL or fall back gracefully on error (the fallback is already in the acceptance criteria). |
| `variants` array may be empty for simple products — `ProductVariantSelector` must not crash                                                                                                                                                                                                                                 | Acceptance criteria specifies: when `variants` is empty, render nothing; parent uses `product.price` directly.                                                                                                                                                                                                                                                 |
| `images` array may be empty — gallery must handle zero images without rendering a broken `<img>`                                                                                                                                                                                                                            | Acceptance criteria specifies a `bg-muted` placeholder when `images.length === 0`.                                                                                                                                                                                                                                                                             |
| `product.description` is `string                                                                                                                                                                                                                                                                                            | null`— rendering`null` would show "null" text                                                                                                                                                                                                                                                                                                                  | Acceptance criteria specifies rendering the description section only when `product.description` is non-null. |
| The existing `app/products/page.tsx` already occupies `app/products/`. The new dynamic route `app/products/[slug]/page.tsx` must coexist. In Next.js App Router, static segments take precedence over dynamic ones, so `/products` (static `page.tsx`) and `/products/[slug]` (dynamic) coexist correctly without conflict. | No code change required. Confirm by running `npm run build` and verifying both routes compile.                                                                                                                                                                                                                                                                 |
| FSD import direction: `ProductDetailView` (widget) must not import from `features/` until TASK-032 adds `AddToCart`. The placeholder button is plain JSX inside the widget.                                                                                                                                                 | No `features/` imports in TASK-030-E. TASK-032 will refactor the placeholder into a real feature import.                                                                                                                                                                                                                                                       |
| `productControllerFindBySlug` raw fetcher used in `generateMetadata` is in the auto-generated file (`shared/api/generated/`). The pre-commit hook blocks editing generated files, but importing from them is allowed.                                                                                                       | Only import, never edit. This is consistent with all other Orval usage in the codebase.                                                                                                                                                                                                                                                                        |

## Notes

### Design Tokens Available

All Tailwind classes must reference tokens defined in `src/app/globals.css`:

| Token                            | Utility classes                                                 | Usage                                          |
| -------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `--color-background`             | `bg-background`                                                 | Page background                                |
| `--color-foreground`             | `text-foreground`                                               | Headings, body text                            |
| `--color-primary`                | `bg-primary`, `text-primary`, `border-primary`, `bg-primary/10` | Active variant, CTA button, breadcrumb hover   |
| `--color-primary-foreground`     | `text-primary-foreground`                                       | Text on primary bg                             |
| `--color-muted`                  | `bg-muted`                                                      | Image placeholder, skeleton                    |
| `--color-muted-foreground`       | `text-muted-foreground`                                         | Secondary text, SKU, category breadcrumb       |
| `--color-destructive`            | `bg-destructive`, `text-destructive`                            | Sale badge, out-of-stock label, error messages |
| `--color-destructive-foreground` | `text-destructive-foreground`                                   | Text on destructive bg                         |
| `--color-card`                   | `bg-card`                                                       | Detail panel card surface                      |
| `--color-card-foreground`        | `text-card-foreground`                                          | Detail panel card text                         |
| `--color-border`                 | `border-border`                                                 | Borders on gallery thumbnail, variant buttons  |
| `--color-ring`                   | `ring-ring`                                                     | Focus ring on interactive elements             |
| `--radius-lg`                    | `rounded-lg`                                                    | Gallery image, variant buttons                 |

### Existing Infrastructure Notes

- `src/shared/api/instance.ts` is the Axios custom instance — do not touch.
- `src/shared/ui/product-card.tsx` already links to `/products/${product.slug}`. This plan
  creates the target route for those links.
- The root `src/app/layout.tsx` provides `<main className="flex-1">`. The detail page root
  must be a `<div>`, not `<main>`.
- `src/widgets/product-list/ui/product-list-view.tsx` contains `buildPageHref` logic for URL
  construction — reviewed for patterns but not modified.
- `src/entities/product/index.ts` already exports `ProductEntity`. The update in TASK-030-A
  adds to this file; no existing exports are changed.

### Connection to TASK-032 (AddToCart)

TASK-032 will add an `AddToCart` feature slice (`features/add-to-cart`) and refactor the
placeholder CTA button in `ProductDetailView` into a real `<AddToCartButton variantId={selectedVariantId} />` component. The plan for that task should reference this file and
the exact placeholder location.

### Future Enhancements (Out of Scope)

- **`not-found.tsx`** in `app/products/[slug]/` — proper HTTP 404 page for SEO (Phase 5).
- **SSR prefetch** via `getQueryClient` + `HydrationBoundary` in the page Server Component —
  eliminates the client-side loading spinner for SEO and LCP improvement (Phase 5).
- **Image optimisation** — replace `<img>` with Next.js `<Image>` once image dimensions are
  known and a CDN is configured (Phase 5, TASK-045).
- **Markdown rendering** for `product.description` — add a lightweight Markdown renderer
  (e.g. `react-markdown`) when rich text is needed (Phase 4/5).
- **Related products** section — requires a backend endpoint or a client-side filter
  (`categoryId`-based) call (Phase 5).
- **Schema.org microdata** — `<script type="application/ld+json">` with Product structured
  data for rich Google snippets (Phase 5, TASK-045).
