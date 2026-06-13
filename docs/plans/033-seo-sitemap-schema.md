# Plan 033: Dynamic Sitemap + Schema.org Microdata (SEO)

> **Status:** To Do
> **Phase:** Phase 5 — Polish & Production
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-13
> **BACKLOG task:** TASK-045 (subtasks TASK-045-A through TASK-045-I)

---

## Overview

Search engines cannot index what they cannot discover. This plan adds three
mutually reinforcing SEO layers to the store-client Next.js storefront:

1. **`app/sitemap.ts`** — a Next.js App Router `MetadataRoute.Sitemap` route
   that dynamically generates sitemap.xml entries for all static pages and every
   active product detail page. The sitemap is served at `/sitemap.xml` and
   consumed by Google Search Console and other crawlers.

2. **`app/robots.ts`** — a `MetadataRoute.Robots` route that allows crawling of
   public content, points crawlers to the sitemap, and disallows private routes
   (`/cart`, `/checkout`, `/orders`, `/login`, `/register`).

3. **Schema.org JSON-LD structured data** — typed `<script type="application/ld+json">`
   blocks injected into product detail pages (`Product` + `BreadcrumbList`), the
   home page (`Organization` + `WebSite`), and the product listing page
   (`BreadcrumbList`). JSON-LD is the format Google recommends over inline
   microdata; it is decoupled from HTML markup, composable, and easy to validate
   with the Rich Results Test tool.

Additionally, this plan adds `metadataBase`, Open Graph defaults, and canonical
signals to the root layout, completing the meta-tag baseline that is currently
absent.

---

## Scope

### In Scope

- `app/sitemap.ts` using `MetadataRoute.Sitemap` (Next.js App Router convention).
- `app/robots.ts` using `MetadataRoute.Robots`.
- `metadataBase` + Open Graph template defaults in `app/layout.tsx`.
- Per-product canonical and Open Graph in existing `generateMetadata` in
  `app/products/[slug]/page.tsx`.
- A reusable `shared/ui/JsonLd` dumb component that serializes any typed
  JSON-LD graph safely (XSS-safe: escapes `</script>` in the payload).
- Pure JSON-LD builder functions in `shared/lib/schema/` (FSD `shared` layer):
  `buildProductSchema`, `buildBreadcrumbSchema`, `buildOrganizationSchema`,
  `buildWebSiteSchema`. Pure functions, no React dependency — unit-testable.
- Injection of JSON-LD scripts into `app/products/[slug]/page.tsx` (Product +
  BreadcrumbList), `app/products/page.tsx` (BreadcrumbList), and
  `app/page.tsx` (Organization + WebSite).
- Unit tests for the schema builder functions (Jest, `testEnvironment: node`,
  following the existing `jest.config.cjs` pattern in store-client).
- A `NEXT_PUBLIC_SITE_URL` env var (with fallback to `http://localhost:3000`) for
  canonical/sitemap origin. The var is already partially established by
  `NEXT_PUBLIC_APP_URL` in `next.config.ts` — this plan standardizes on
  `NEXT_PUBLIC_SITE_URL` and adds a `shared/config/site.ts` constant.
- A `NEXT_PUBLIC_CURRENCY` env var (defaulting to `USD`) for Schema.org
  `priceCurrency`. No backend change needed.
- Verification gate: build + lint + typecheck for store-client; manual fetch of
  `/sitemap.xml` and `/robots.txt`; validate JSON-LD output with Google's Rich
  Results Test.

### Out of Scope

- Backend (store-api) changes — no new endpoints, no Prisma changes, no Orval
  regeneration required (all needed data is already in current Orval types).
- Category listing pages at `/categories/[slug]` — no such route exists today;
  categories are embedded in the home page and product list filter. Sitemap
  covers the product list page (`/products`) as a single static entry.
- Review / rating data — the `ProductDetailResponseEnvelope` and `ProductEntity`
  types do not expose review counts or aggregate ratings; `aggregateRating` and
  `Review` nodes are deferred (noted in the Product schema builder with a
  commented-out placeholder).
- Sitemap index files / multiple sitemap files (current product catalogue is small
  enough for a single sitemap; split deferred).
- `generateStaticParams` / static pre-rendering of product pages — SSR via
  `generateMetadata` is already the pattern used; this plan does not change the
  rendering strategy.
- Store-admin SEO (admin panel intentionally not indexed).
- CDN / image optimization (separate Phase 5 task).
- i18n / `hreflang` (deferred).

---

## User Stories

1. As a Google Search crawler, I want to find `/sitemap.xml` listing all active
   product pages with their last-modified date, so that new and updated products
   are indexed promptly.
2. As a Googlebot, I want to read `/robots.txt` to know which routes to skip,
   so that private checkout and order pages are not indexed.
3. As a shopper searching on Google, I want to see rich product snippets (name,
   price, availability) in the SERP, so that I can judge relevance before
   clicking through.
4. As a developer, I want canonical `<link>` and Open Graph tags on all pages,
   so that social sharing cards display correctly and duplicate-content issues are
   avoided.
5. As a developer, I want JSON-LD builder functions tested in isolation (no
   browser, no React), so that I can confidently refactor the schema output
   without breaking structured data.

---

## Architecture Decisions

### A1: JSON-LD over inline microdata

Google's documentation and structured data guidelines favour JSON-LD because it:

- Is decoupled from HTML markup (no `itemscope`/`itemprop` attribute clutter).
- Can live in `<head>` without impacting page body rendering.
- Is easier to validate and maintain.
- Works identically with Next.js App Router Server Components.

**Decision: use `<script type="application/ld+json">` injected via a `JsonLd`
component.** Inline microdata is not implemented.

### A2: FSD layer for schema builder functions

Schema builders are pure functions with no React, no routing, and no API
dependency. They belong in `shared/lib/schema/` (the `shared` layer's `lib`
segment). This keeps them below `entities` in the import hierarchy, makes them
importable from any page/widget/feature without circular-dependency risk, and
allows Jest unit tests with `testEnvironment: node` (same as the existing
store-client test setup).

The `JsonLd` component itself belongs in `shared/ui` as a dumb UI primitive.

### A3: Server-side data fetching for sitemap.ts

`app/sitemap.ts` is a Next.js Route Handler that executes on the server. React
Query hooks (`useProductControllerFindAll`) are client-only and cannot be called
here. The generated Orval file (`shared/api/generated/products/products.ts`)
exports plain async fetcher functions (`productControllerFindAll`) alongside the
hooks — these are usable server-side. The same pattern is already established in
`app/products/[slug]/page.tsx` line 4 which directly imports
`productControllerFindBySlug` from the generated module.

`sitemap.ts` will call `productControllerFindAll` with `{ isActive: true, limit:
200, page: 1 }` and iterate pages until all products are collected.

**No manual fetch/axios.** No new fetcher written by hand.

### A4: Sitemap pagination

`ProductControllerFindAllParams` supports `page` + `limit`. The sitemap must
collect all active products. The plan specifies a paginator helper in
`shared/lib/schema/fetchAllProducts.ts` that loops through pages using the
generated fetcher. The helper is not exported as a component; it is a plain
async function callable from server-only contexts.

On any fetch error the sitemap returns the static routes only and logs the error
to `console.error`. The Next.js build must not fail due to a sitemap error.

### A5: NEXT_PUBLIC_SITE_URL

`next.config.ts` already defines `NEXT_PUBLIC_APP_URL` in the `env` block. This
plan renames the sitemap/canonical origin to `NEXT_PUBLIC_SITE_URL` for
conventional clarity, adds it to `next.config.ts` env block, and exports a
`SITE_URL` constant from `shared/config/site.ts` with a safe fallback of
`http://localhost:3000`. Canonical and Open Graph URLs are constructed from this
constant.

### A6: XSS safety in JsonLd component

The JSON-LD payload is serialized as `JSON.stringify(schema)`. An attacker who
controls product data could inject `</script>` inside a string field. The
`JsonLd` component applies the standard mitigation: replace `</` with `<\/`
before inserting the string into the `<script>` tag's `dangerouslySetInnerHTML`.
This is the approach used by Next.js's own `next/head` JSON-LD examples and by
popular SEO libraries (e.g., `next-seo`).

### A7: aggregateRating deferred

The current `ProductDetailResponseEnvelope` (Orval-generated) does not include
review counts or aggregate ratings. The `buildProductSchema` function includes a
commented-out `aggregateRating` block with a TODO note. No backend change is
needed for the current subtasks; a future review module (outside this plan) would
supply this data.

### A8: Currency

There is no explicit currency field on `ProductEntity`. The plan introduces
`NEXT_PUBLIC_CURRENCY` (default `USD`) as an env var. The `buildProductSchema`
function reads this from the `SITE_URL` config module. For a UA-market app the
operator sets `NEXT_PUBLIC_CURRENCY=UAH` in their `.env` and the schema emits
`"priceCurrency": "UAH"`. This is flagged as an assumption that the operator
must validate.

---

## Technical Design

### Environment variables

| Variable               | Purpose                                               | Default                 |
| ---------------------- | ----------------------------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for sitemap and JSON-LD URLs         | `http://localhost:3000` |
| `NEXT_PUBLIC_CURRENCY` | ISO 4217 currency code for Schema.org `priceCurrency` | `USD`                   |

Both are added to `next.config.ts` `env` block and `.env.example`.

### Existing API data available for sitemap / JSON-LD

From `ProductEntity` (Orval-generated, confirmed by reading the file):

| Field            | Sitemap              | JSON-LD               |
| ---------------- | -------------------- | --------------------- |
| `slug`           | URL path             | `@id` / canonical     |
| `name`           | —                    | `name`                |
| `description`    | —                    | `description`         |
| `price`          | —                    | `offers.price`        |
| `compareAtPrice` | —                    | (not used for schema) |
| `sku`            | —                    | `sku`                 |
| `updatedAt`      | `lastModified`       | —                     |
| `isActive`       | filter (only active) | —                     |

From `ProductDetailResponseEnvelope`:

| Field              | JSON-LD                                                    |
| ------------------ | ---------------------------------------------------------- |
| `images[0].url`    | `image`                                                    |
| `images[0].alt`    | (alt fallback)                                             |
| `variants[].stock` | `offers.availability` (InStock / OutOfStock)               |
| `variants[].price` | lowest offer price (used if product-level price is absent) |
| `category.name`    | `BreadcrumbList` item 2 label                              |
| `category.slug`    | `BreadcrumbList` item 2 URL                                |

Note: `ProductEntity.sku` is nullable. `ProductVariantEntity.sku` is also
nullable (`ProductVariantEntitySku` is `string | null`). The schema builder
omits `sku` when null.

Note: There is no `brand` field on `ProductEntity`. The `Organization` schema
on the home page doubles as the brand for the `Product` schema's `brand.name`
(hardcoded to site name or `NEXT_PUBLIC_SITE_NAME` if added). For now it
defaults to `"MobileStore"` — flagged as a future env var.

Note: `aggregateRating` is absent from the API response — deferred as documented
in A7.

### FSD file map

```
apps/store-client/src/
  shared/
    config/
      site.ts                     (new) — SITE_URL, CURRENCY, SITE_NAME constants
    lib/
      schema/
        index.ts                  (new) — barrel
        buildProductSchema.ts     (new) — pure fn, returns WithContext<Product>
        buildBreadcrumbSchema.ts  (new) — pure fn, returns WithContext<BreadcrumbList>
        buildOrganizationSchema.ts(new) — pure fn, returns WithContext<Organization>
        buildWebSiteSchema.ts     (new) — pure fn, returns WithContext<WebSite>
        fetchAllProducts.ts       (new) — async server-only paginator
        schema.test.ts            (new) — Jest unit tests for all four builders
    ui/
      json-ld.tsx                 (new) — <JsonLd schema={...} /> dumb component
      index.ts                    (modify) — export JsonLd
  app/
    sitemap.ts                    (new) — MetadataRoute.Sitemap
    robots.ts                     (new) — MetadataRoute.Robots
    layout.tsx                    (modify) — add metadataBase + OG defaults + WebSite/Org JSON-LD
    page.tsx                      (modify) — add Organization + WebSite JsonLd blocks
    products/
      page.tsx                    (modify) — add BreadcrumbList JsonLd
      [slug]/
        page.tsx                  (modify) — add canonical + OG + Product + Breadcrumb JsonLd
next.config.ts                    (modify) — add NEXT_PUBLIC_SITE_URL + NEXT_PUBLIC_CURRENCY
.env.example                      (modify) — document new vars
```

### Schema.org graph shapes

#### Organization (home page + layout)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "MobileStore",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png"
}
```

Note: `logo` is optional; included only when a logo URL is available from config.

#### WebSite (home page)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "MobileStore",
  "url": "https://example.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://example.com/products?search={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

#### Product (product detail page)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "iPhone 15 Case",
  "description": "...",
  "sku": "CASE-15-BLK",
  "image": ["https://cdn.example.com/images/case.jpg"],
  "brand": { "@type": "Brand", "name": "MobileStore" },
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/products/iphone-15-case",
    "priceCurrency": "USD",
    "price": "9.99",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition"
  }
}
```

`availability` is `InStock` if any active variant has `stock > 0`; otherwise
`OutOfStock`. `price` uses the lowest active-variant price if variants exist,
otherwise falls back to `ProductEntity.price`.

#### BreadcrumbList (product detail + product list)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://example.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Products",
      "item": "https://example.com/products"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "iPhone 15 Case",
      "item": "https://example.com/products/iphone-15-case"
    }
  ]
}
```

On the product list page the breadcrumb has only items 1 and 2 (no product).

### sitemap.ts design

```typescript
// app/sitemap.ts  (pseudo-code)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1.0 },
    { url: `${siteUrl}/products`, changeFrequency: "daily", priority: 0.9 },
  ];

  try {
    const products = await fetchAllActiveProducts(); // paginator
    const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${siteUrl}/products/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...staticRoutes, ...productRoutes];
  } catch (err) {
    console.error("[sitemap] Failed to fetch products:", err);
    return staticRoutes;
  }
}
```

`fetchAllActiveProducts` loops `productControllerFindAll` with increasing `page`
until `page >= totalPages`.

### robots.ts design

```typescript
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/cart", "/checkout", "/orders", "/login", "/register"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
```

### layout.tsx additions

```typescript
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "MobileStore",
    template: "%s | MobileStore",
  },
  description: "Your one-stop shop for mobile phone accessories.",
  openGraph: {
    type: "website",
    siteName: "MobileStore",
  },
};
```

### generateMetadata additions for product detail page

The existing `generateMetadata` in `app/products/[slug]/page.tsx` is extended:

```typescript
return {
  title: product.name, // template applies: "iPhone 15 Case | MobileStore"
  description: product.description ?? "View product details.",
  alternates: {
    canonical: `${SITE_URL}/products/${product.slug}`,
  },
  openGraph: {
    title: product.name,
    description: product.description ?? "",
    url: `${SITE_URL}/products/${product.slug}`,
    images: images[0]
      ? [{ url: images[0].url, alt: images[0].alt ?? product.name }]
      : [],
    type: "website",
  },
};
```

---

## Tasks

### TASK-045-A: Add NEXT_PUBLIC_SITE_URL + NEXT_PUBLIC_CURRENCY env vars and shared/config/site.ts

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_CURRENCY` added to `next.config.ts` `env` block.
- [ ] `apps/store-client/src/shared/config/site.ts` exports `SITE_URL: string` (reads `process.env.NEXT_PUBLIC_SITE_URL`, falls back to `'http://localhost:3000'`), `CURRENCY: string` (reads `NEXT_PUBLIC_CURRENCY`, falls back to `'USD'`), and `SITE_NAME = 'MobileStore'`.
- [ ] `shared/config/index.ts` re-exports from `site.ts`.
- [ ] Both vars documented with comments in `.env.example` (root of monorepo or store-client, whichever hosts the existing file).
- [ ] `npm run build -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/next.config.ts` — add two env entries
- `apps/store-client/src/shared/config/site.ts` — new file
- `apps/store-client/src/shared/config/index.ts` — add re-export
- `.env.example` — document vars

---

### TASK-045-B: Create shared/lib/schema builder functions + unit tests (TDD)

**Type:** feat
**Scope:** store-client
**Complexity:** M (3h)
**TDD Required:** Yes
**Depends on:** TASK-045-A

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/lib/schema/schema.test.ts` written first (Red phase) with tests for:
  - `buildOrganizationSchema(siteUrl, siteName)` — asserts `@type`, `name`, `url`.
  - `buildWebSiteSchema(siteUrl, siteName)` — asserts `@type`, `url`, `potentialAction.target.urlTemplate` contains `?search=`.
  - `buildBreadcrumbSchema(items)` — asserts `@type`, `itemListElement` length and each `position`/`name`/`item`.
  - `buildProductSchema(product, images, variants, siteUrl, currency)` — asserts `@type`, `name`, `sku` (null sku omitted), `offers.price`, `offers.priceCurrency`, `offers.availability` for in-stock and out-of-stock cases, `image` array.
- [ ] All four builder files created (Green phase).
- [ ] Barrel `shared/lib/schema/index.ts` exports all four builders and `fetchAllProducts`.
- [ ] `shared/lib/index.ts` re-exports from `schema/index.ts`.
- [ ] `npm run test -w apps/store-client` passes (all schema tests green).
- [ ] TypeScript compiles without errors (no `any` in builder return types — use `Record<string, unknown>` or a minimal inline type, not a full schema library dependency).

**Files to create/modify:**

- `apps/store-client/src/shared/lib/schema/schema.test.ts` — unit tests (written first)
- `apps/store-client/src/shared/lib/schema/buildOrganizationSchema.ts` — pure fn
- `apps/store-client/src/shared/lib/schema/buildWebSiteSchema.ts` — pure fn
- `apps/store-client/src/shared/lib/schema/buildBreadcrumbSchema.ts` — pure fn
- `apps/store-client/src/shared/lib/schema/buildProductSchema.ts` — pure fn
- `apps/store-client/src/shared/lib/schema/index.ts` — barrel
- `apps/store-client/src/shared/lib/index.ts` — add re-export

---

### TASK-045-C: Create shared/ui/JsonLd component

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-045-B

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/ui/json-ld.tsx` exports a React Server Component `JsonLd` that accepts a `schema: Record<string, unknown>` prop.
- [ ] Component renders `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(schema) }} />`.
- [ ] `safeJson` escapes `</` as `<\/` and `<!--` as `<\!--` before returning the serialized string (XSS prevention).
- [ ] `shared/ui/index.ts` exports `JsonLd`.
- [ ] `npm run build -w apps/store-client` passes (component is Server Component — no `"use client"` directive).
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/shared/ui/json-ld.tsx` — new component
- `apps/store-client/src/shared/ui/index.ts` — add `export { JsonLd }`

---

### TASK-045-D: Create fetchAllProducts server-side paginator

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-045-A

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/lib/schema/fetchAllProducts.ts` exports an async function `fetchAllActiveProducts(): Promise<ProductEntity[]>` that:
  - Calls `productControllerFindAll({ isActive: true, limit: 200, page: 1 })`.
  - Uses `meta.totalPages` to loop additional pages if needed.
  - Returns the merged `data` array from all pages.
  - Throws on HTTP error (caller wraps in try/catch).
- [ ] The function imports `productControllerFindAll` from `@/shared/api/generated/products/products` (Orval plain fetcher — not a hook).
- [ ] Return type is `Promise<ProductEntity[]>` using the existing Orval `ProductEntity` type.
- [ ] No manual `fetch`/`axios` used.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/shared/lib/schema/fetchAllProducts.ts` — new file

---

### TASK-045-E: Add app/robots.ts

**Type:** feat
**Scope:** store-client
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-045-A

**Acceptance Criteria:**

- [ ] `apps/store-client/src/app/robots.ts` exports a default function returning `MetadataRoute.Robots`.
- [ ] `rules[0].userAgent` is `'*'`.
- [ ] `rules[0].allow` is `'/'`.
- [ ] `rules[0].disallow` contains `/cart`, `/checkout`, `/orders`, `/login`, `/register`.
- [ ] `sitemap` field is `${SITE_URL}/sitemap.xml`.
- [ ] After `npm run build -w apps/store-client`, a GET to `/robots.txt` returns correct content (manual verification note).
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/app/robots.ts` — new file

---

### TASK-045-F: Add app/sitemap.ts (dynamic product routes)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2h)
**TDD Required:** No
**Depends on:** TASK-045-D, TASK-045-E

**Acceptance Criteria:**

- [ ] `apps/store-client/src/app/sitemap.ts` exports a default async function returning `MetadataRoute.Sitemap`.
- [ ] Static entries: `/` (priority 1.0, changeFrequency `daily`) and `/products` (priority 0.9, changeFrequency `daily`).
- [ ] Dynamic entries: one per active product with `url = ${SITE_URL}/products/${product.slug}`, `lastModified = new Date(product.updatedAt)`, `changeFrequency = 'weekly'`, `priority = 0.8`.
- [ ] If `fetchAllActiveProducts()` throws, function catches the error, logs to `console.error('[sitemap] ...')`, and returns only the static entries (no build/runtime crash).
- [ ] `npm run build -w apps/store-client` passes.
- [ ] After starting the dev server, `curl http://localhost:3000/sitemap.xml` returns XML with at least the two static URLs (manual verification note).

**Files to create/modify:**

- `apps/store-client/src/app/sitemap.ts` — new file

---

### TASK-045-G: Update root layout.tsx — metadataBase + OG defaults

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-045-A

**Acceptance Criteria:**

- [ ] `apps/store-client/src/app/layout.tsx` `metadata` export is updated to include:
  - `metadataBase: new URL(SITE_URL)` (imported from `shared/config/site.ts`).
  - `title: { default: SITE_NAME, template: '%s | MobileStore' }`.
  - `openGraph: { type: 'website', siteName: SITE_NAME }`.
- [ ] Existing `viewport` export and font setup are preserved unchanged.
- [ ] `npm run build -w apps/store-client` passes.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/app/layout.tsx` — update `metadata` export

---

### TASK-045-H: Inject JSON-LD into product detail, product list, and home pages

**Type:** feat
**Scope:** store-client
**Complexity:** M (3h)
**TDD Required:** No
**Depends on:** TASK-045-B, TASK-045-C, TASK-045-G

**Acceptance Criteria:**

**app/products/[slug]/page.tsx:**

- [ ] `generateMetadata` extended with `alternates.canonical`, `openGraph.url`, `openGraph.images` (first product image if available), and `openGraph.type = 'website'`.
- [ ] Page renders `<JsonLd schema={buildProductSchema(product, images, variants, SITE_URL, CURRENCY)} />` and `<JsonLd schema={buildBreadcrumbSchema([...])} />` as sibling Server Components.
- [ ] Product data for JSON-LD is fetched server-side once (reuse the `productControllerFindBySlug` call already present in `generateMetadata` — or fetch inside the Page component using the same plain fetcher and pass via props). Implementation note: the cleanest approach is to fetch inside the Page component itself (which already receives `slug`) and keep `generateMetadata` using its own fetch (Next.js request deduplication via `fetch` cache will merge the two calls into one network request in production).
- [ ] `availability` in Product schema is `InStock` when at least one variant has `stock > 0`; `OutOfStock` otherwise.

**app/products/page.tsx:**

- [ ] Page renders `<JsonLd schema={buildBreadcrumbSchema([{ name: 'Home', item: SITE_URL }, { name: 'Products', item: `${SITE_URL}/products` }])} />`.

**app/page.tsx (Home):**

- [ ] Home page renders `<JsonLd schema={buildOrganizationSchema(SITE_URL, SITE_NAME)} />` and `<JsonLd schema={buildWebSiteSchema(SITE_URL, SITE_NAME)} />`.

**All:**

- [ ] `npm run build -w apps/store-client` passes with no TypeScript errors.
- [ ] `npm run lint -w apps/store-client` passes.
- [ ] Manual verification: product detail page HTML source contains a `<script type="application/ld+json">` block with `"@type": "Product"` and correct price.

**Files to create/modify:**

- `apps/store-client/src/app/products/[slug]/page.tsx` — extend generateMetadata + add JsonLd
- `apps/store-client/src/app/products/page.tsx` — add BreadcrumbList JsonLd
- `apps/store-client/src/app/page.tsx` — add Organization + WebSite JsonLd

---

### TASK-045-I: Verification gate — build, lint, typecheck, and manual checks

**Type:** chore
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-045-A through TASK-045-H

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-client` exits 0 with no errors or warnings.
- [ ] `npm run lint -w apps/store-client` exits 0.
- [ ] `npm run typecheck -w apps/store-client` exits 0 (if a typecheck script exists; else `tsc --noEmit` from `apps/store-client`).
- [ ] `npm run test -w apps/store-client` exits 0 (schema unit tests green).
- [ ] Dev server running: `curl http://localhost:3000/robots.txt` returns `User-agent: *` and `Disallow: /cart`.
- [ ] Dev server running: `curl http://localhost:3000/sitemap.xml` returns valid XML with at least the home and products URLs.
- [ ] Dev server running: product detail page HTML (`curl http://localhost:3000/products/<slug>`) contains `"@type": "Product"`.
- [ ] No Orval-generated files are modified (pre-commit hook will block this; none should be touched by this plan).

**Files to create/modify:**

- No new files — this is a verification task. Add completion date to plan header.

---

## Migration Steps

1. TASK-045-A: add env vars and site config constant.
2. TASK-045-B: write schema builder unit tests (Red), then implement builders (Green). Run `npm run test -w apps/store-client`.
3. TASK-045-C: create `JsonLd` component.
4. TASK-045-D: create `fetchAllProducts` paginator (can run in parallel with C).
5. TASK-045-E: add `robots.ts` (can run in parallel with C/D).
6. TASK-045-F: add `sitemap.ts` (depends on D and E).
7. TASK-045-G: update root `layout.tsx` (can run in parallel with F).
8. TASK-045-H: inject JSON-LD into pages (depends on B, C, and G).
9. TASK-045-I: verification gate.

---

## Risks & Mitigations

| Risk                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productControllerFindAll` is called server-side in `sitemap.ts` during the Next.js build (`next build`), but the API server may not be running at build time | Sitemap route is a dynamic Next.js route (not `generateStaticParams`); it runs at request time, not build time. Confirm `sitemap.ts` does not use `export const dynamic = 'force-static'`.                                                                                                                                                                                                                          |
| Hundreds of product pages in the sitemap makes the XML large                                                                                                  | Sitemap spec allows 50,000 URLs per file. For MVP scale a single sitemap is fine. Split into sitemap index when product count exceeds ~5,000.                                                                                                                                                                                                                                                                       |
| `customInstance` in `shared/api/instance.ts` uses Axios with `withCredentials`, which may fail in a pure Node.js server context (no browser cookies)          | The plain fetcher functions call `customInstance` which uses `api` (the Axios instance). The `baseURL` reads `NEXT_PUBLIC_API_URL`. In the server context this will be the Node.js network call to the API — cookies are not relevant for a public GET endpoint. This is already working (see `app/products/[slug]/page.tsx` which calls `productControllerFindBySlug` server-side in `generateMetadata`). No risk. |
| JSON-LD `price` field: `ProductEntity.price` is a string (e.g. `"9.99"`), which is the correct Schema.org `offers.price` format (decimal string or float)     | No conversion needed. Pass as-is. Confirm the string is a valid decimal number before emitting — builder should guard against empty string.                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_SITE_URL` is not set in production and canonical URLs fall back to `localhost`                                                                   | Document the var as required in `.env.example` and in a comment in `site.ts`. CI/CD pipeline must set it.                                                                                                                                                                                                                                                                                                           |
| `aggregateRating` absence may limit rich snippet eligibility for products                                                                                     | Acknowledged. Flag as a dependency on a future Review module. Current implementation passes Google's structured data validation without it (aggregateRating is optional).                                                                                                                                                                                                                                           |
| Currency assumption (USD default) is wrong for a UA-market app                                                                                                | Document `NEXT_PUBLIC_CURRENCY=UAH` in `.env.example`. The operator sets it for their market.                                                                                                                                                                                                                                                                                                                       |

---

## Notes

- No backend changes are needed. No Orval regeneration is required.
- The `productControllerFindAll` plain fetcher (non-hook) is already used server-side in `app/products/[slug]/page.tsx`. This plan extends that established pattern.
- The `NEXT_PUBLIC_APP_URL` variable that already exists in `next.config.ts` is left in place for backward compatibility. `NEXT_PUBLIC_SITE_URL` is the canonical variable for SEO/sitemap purposes going forward. If the operator sets one but not the other, `shared/config/site.ts` should prefer `NEXT_PUBLIC_SITE_URL` and fall back to `NEXT_PUBLIC_APP_URL` as a secondary fallback before `localhost`.
- Google's Rich Results Test URL: https://search.google.com/test/rich-results — paste the product detail page URL or JSON-LD directly to validate.
- Schema.org validator: https://validator.schema.org/
- Next.js version: the codebase uses `Promise<{ slug: string }>` params (Next.js 15 App Router `async params` pattern), confirming this is Next.js 15. `MetadataRoute.Sitemap` and `MetadataRoute.Robots` are available since Next.js 13.3+ and are stable in Next.js 15.
