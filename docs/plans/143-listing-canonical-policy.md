# Plan 143 — Listing Canonical Policy + Noindex on Service Pages

> **Status:** ✅ Done (TASK-278 shipped)
> **Phase:** Roadmap Етап 7 — SEO/GEO (BACKLOG.md; source `docs/handoff-seo.md`)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-278 `[SEO/H]`

## Overview

`/products` and `/categories/[slug]` (TASK-277, plan 142, already merged on this branch) have no
unified rule for what happens to `<link rel="canonical">`/`robots` once filter, sort, or pagination
query params enter the URL. Left as-is, every `?minPrice=…&sortBy=…` combination is a fully
independent, indexable URL competing with its own listing for the same query — classic e-commerce
duplicate-content dilution. Three service pages (`/checkout`, `/orders/[id]/confirmation`) also lack
their own `robots` meta, relying solely on `robots.ts`'s path-prefix `disallow` as the only
signal — a single point of failure if a linked/shared URL is ever crawled outside that block list.

This plan introduces one shared, pure, unit-tested metadata helper
(`shared/lib/seo/listing-metadata.ts`) that both listing routes call to decide their
`alternates.canonical` and `robots` output, replacing the ad-hoc canonical logic TASK-277 left as a
placeholder in the `/products` category branch. It also closes the three noindex gaps identified in
`docs/handoff-seo.md` §SEO-2.

## Scope

### In Scope

- A new pure function `buildListingMetadata()` in a **new** file,
  `apps/store-client/src/shared/lib/seo/listing-metadata.ts` — deliberately **not** added to
  `resolveSeo.ts`, which is scoped to title/description precedence only (plan 116, Decision 2) and
  must stay unrelated to canonical/robots policy.
- Unit test suite for the helper (TDD, Red → Green → Refactor) covering the full test-case table in
  §TDD Test List.
- Wiring the helper into `app/products/page.tsx`'s `generateMetadata` (both the category branch and
  the unfiltered/search branch — collapsed into one call site instead of two independent returns) and
  `app/categories/[slug]/page.tsx`'s `generateMetadata`.
- Closing a pre-existing metadata gap as a rider: `products/page.tsx` and `categories/[slug]/page.tsx`
  currently only read `search`/`minPrice`/`maxPrice`/`specs`/`page` server-side for metadata purposes
  (brandId/deviceModelId/onSale are filtered client-side only, per `ProductControllerFindAllParams`) —
  this plan makes both routes read all seven filter params server-side so the noindex decision is
  complete, not partial.
- `app/robots.ts`: add `/search` to the existing `disallow` array (the `/search` route itself already
  returns `robots: { index: false, follow: true }` per `generateMetadata` — verify, don't touch).
- `app/checkout/page.tsx`: add `robots: { index: false, follow: false }` to the existing static
  `metadata` export.
- `app/orders/[id]/confirmation/page.tsx`: add `robots: { index: false, follow: false }` to the
  existing `generateMetadata` return.

### Out of Scope

- IndexNow ping / explicit AI-crawler `robots.ts` stanza (GPTBot/Google-Extended/PerplexityBot/
  ClaudeBot) — TASK-282, next task on this same track, **separate plan (144)**, touches `robots.ts`
  again after this plan lands (sequencing note: this plan only ever adds one array entry
  (`/search`) to `disallow`; TASK-282 appends a new `userAgent`-keyed rule block afterward — no
  overlapping lines expected).
- Any change to `resolveSeo()`, title/description precedence, or `SeoSettings` — this plan is
  canonical/robots only.
- Sitemap changes (categories already added by TASK-277/plan 142; pagination pages are deliberately
  **not** added to `sitemap.xml` — they stay reachable only via in-page pagination + their own
  self-canonical, per standard practice of sitemapping only page 1 of a paginated listing).
- `/legal/[slug]`, `/blog/[slug]`, PDP canonical — already correct (verified in `docs/handoff-seo.md`'s
  pre-check §"Верифікація репорту").
- `/orders` (the list page) and `/cart` — already `disallow`ed in `robots.ts` and carry no unique
  per-user content worth a defense-in-depth meta tag (out of this plan's two named gaps from
  §SEO-2: `/checkout` and `/orders/[id]/confirmation` specifically).

## User Stories

1. As a search engine crawler, I want a single canonical URL per distinct catalog view (base listing,
   base + page N) so I don't index a dozen near-duplicate URLs for the same product set under
   different filter/sort combinations.
2. As the store owner, I don't want `/checkout` or an order confirmation link (sometimes shared/
   bookmarked by a customer) ever appearing in search results, even if a crawler somehow reaches it
   outside the `robots.txt` block list.
3. As a future maintainer, I want one pure, exhaustively-tested function that encodes the canonical/
   noindex policy, so a new listing route (or a new filter param) is wired by calling it, not by
   re-deriving the rule ad hoc.

## Technical Design

### Design Decision 1 — sort params never enter the helper's input surface at all

The handoff wording is "self-canonical **without** filter/sort params." Per Design Decision 3
(canonical target), sort (`sortBy`/`sortOrder`) never changes the canonical path and never triggers
noindex — the helper simply has no parameter for it. Callers keep resolving `sortBy`/`sortOrder` for
the actual product query (unchanged), they just never pass them into `buildListingMetadata()`. This
is simpler and safer than accepting sort params and unconditionally ignoring them inside the
function — there's no "did I forget to exclude this" surface at all.

### Design Decision 2 — canonical is **omitted** (not self-referencing) when the view is noindexed

When a filter param is present, the resolved metadata sets `robots: { index: false, follow: true }`
and **does not** emit `alternates.canonical`. Rationale, fixed as house convention:

- `robots.ts`'s `noindexSite` kill switch and `/search/page.tsx`'s existing noindex both already
  follow this shape (`/search` sets `robots` only, no `alternates.canonical`) — precedent already
  live in this codebase.
- A `noindex` directive already tells the crawler "don't index this URL," which makes "index this
  other URL instead" (canonical) a redundant, occasionally conflicting second signal (Google's own
  guidance: canonical + noindex together is _tolerated_ but ambiguous — prefer one clear signal).
- Keeps `<head>` minimal and the helper's output shape simple: exactly one of `canonicalPath` /
  `robots` is meaningful per call (never both).

### Design Decision 3 — canonical target resolution order (absorbs the TASK-277 category branch)

For `/products`, the canonical **target path** (before the page-suffix and noindex checks above) is:

1. `categoryCanonicalPath` (`/categories/{slug}`) — when a `categoryId` is selected **and** no other
   filter param is present. This is exactly the TASK-277 category-redirect behaviour, now computed
   inside the shared helper instead of being hardcoded in the page's `generateMetadata` as a
   standalone `if (node)` branch.
2. `basePath` (`/products`) — otherwise (no category, or category + another filter → falls through
   to the noindex rule in Decision 2 before any path is even used).

For `/categories/[slug]`, there is no `categoryCanonicalPath` input at all — the category is already
the URL segment, so `basePath` (`/categories/{slug}`) is always the target when the view isn't
noindexed.

### Design Decision 4 — `filters` values are trusted, caller-normalized input, with two narrow safety nets

The helper does not re-implement `first(searchParams.x)` — callers already do that for the product
query itself and pass the same cleaned strings in. Two exceptions, defensive because they are easy to
get wrong at a call site and cheap to guard centrally:

- An empty string (`""`) filter value is treated as **absent** (guards a caller that forgot to
  `?.trim() || undefined` a param).
- `onSale` is boolean-shaped on the wire (`ProductControllerFindAllParams.onSale?: boolean`) but
  arrives as a raw query string; only the literal string `"true"` counts as a present filter —
  `"false"`, `undefined`, or anything else does not (an explicit `?onSale=false` is not "filtering
  by not-on-sale," it's a no-op that shouldn't noindex the page).

### Data Model

None — this plan touches only Next.js route metadata and a pure frontend helper.

### The helper — `shared/lib/seo/listing-metadata.ts`

```ts
export interface ListingFilterParams {
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  specs?: string;
  brandId?: string;
  deviceModelId?: string;
  /** Wire-level string; only "true" counts as a present filter (see Design Decision 4). */
  onSale?: string;
}

export interface ListingMetadataInput {
  /** Origin-relative path with no query string — this view's "home" when unfiltered. */
  basePath: string;
  /** Parsed 1-based page number; undefined/NaN/<=1 means "first page" (omitted from canonical). */
  page?: number;
  /** Any filter param present narrows the result set and forces noindex,follow (Decision 2). */
  filters?: ListingFilterParams;
  /**
   * `/products` only — when set AND no `filters` entry is present, the canonical
   * target becomes this path instead of `basePath` (Decision 3). Omit entirely on
   * `/categories/[slug]`, which is already category-scoped by its own segment.
   */
  categoryCanonicalPath?: string;
}

export interface ListingMetadataResult {
  /** Origin-relative canonical path (incl. "?page=N" when page > 1). Absent when noindexed. */
  canonicalPath?: string;
  /** Present only when the view is noindexed; absent (→ default index,follow) otherwise. */
  robots?: { index: boolean; follow: boolean };
}

export function buildListingMetadata(
  input: ListingMetadataInput,
): ListingMetadataResult;
```

Deliberately returns a **relative** `canonicalPath`, not a full URL — mirrors `resolveSeo()`'s own
SITE_URL-agnostic shape (plan 116 Decision 2: SITE_URL is a call-site concern). Callers do
`alternates: { canonical: `${SITE_URL}${meta.canonicalPath}` }` when `canonicalPath` is set.

The convention itself (Decisions 1–4 condensed) is written as the file's top-of-file doc comment,
mirroring `resolveSeo.ts`'s own header comment style — so it's discoverable without reading this plan.

## TDD Test List (Red-first — write these failing before implementation)

Per `AGENTS.md` §Testing Strategy this isn't a cart/discount/inventory/auth module, but the task is
explicitly assigned to `tdd-agent` (owner directive) because the canonical/noindex matrix has enough
combinatorial edge cases that Red-first pins every branch before any wiring touches a real route.

### `listing-metadata.test.ts` (new, co-located with `resolveSeo.test.ts`, `unit` Jest project)

| #   | Input (`ListingMetadataInput`)                                                                                       | Expected `ListingMetadataResult`                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `{ basePath: "/products" }` (nothing else)                                                                           | `{ canonicalPath: "/products" }`                                                                                    |
| 2   | `{ basePath: "/products", page: 2 }`                                                                                 | `{ canonicalPath: "/products?page=2" }`                                                                             |
| 3   | `{ basePath: "/products", page: 1 }`                                                                                 | `{ canonicalPath: "/products" }` (page 1 omitted)                                                                   |
| 4   | `{ basePath: "/products", page: 0 }`                                                                                 | `{ canonicalPath: "/products" }` (page ≤ 1 → omitted)                                                               |
| 5   | `{ basePath: "/products", page: NaN }`                                                                               | `{ canonicalPath: "/products" }` (invalid → treated as page 1)                                                      |
| 6   | `{ basePath: "/products", filters: { search: "чохол" } }`                                                            | `{ robots: { index: false, follow: true } }` (no `canonicalPath`)                                                   |
| 7   | `{ basePath: "/products", filters: { minPrice: "100" } }`                                                            | `{ robots: { index: false, follow: true } }`                                                                        |
| 8   | `{ basePath: "/products", filters: { minPrice: "100", maxPrice: "500" } }`                                           | `{ robots: { index: false, follow: true } }` (multiple filters, same output as one)                                 |
| 9   | `{ basePath: "/products", filters: { specs: "material:Силікон" } }`                                                  | `{ robots: { index: false, follow: true } }`                                                                        |
| 10  | `{ basePath: "/products", filters: { brandId: "b1" } }`                                                              | `{ robots: { index: false, follow: true } }`                                                                        |
| 11  | `{ basePath: "/products", filters: { deviceModelId: "m1" } }`                                                        | `{ robots: { index: false, follow: true } }`                                                                        |
| 12  | `{ basePath: "/products", filters: { onSale: "true" } }`                                                             | `{ robots: { index: false, follow: true } }`                                                                        |
| 13  | `{ basePath: "/products", filters: { onSale: "false" } }`                                                            | `{ canonicalPath: "/products" }` (`"false"` is not a present filter)                                                |
| 14  | `{ basePath: "/products", filters: { search: "" } }`                                                                 | `{ canonicalPath: "/products" }` (empty string treated as absent)                                                   |
| 15  | `{ basePath: "/products", filters: { search: undefined, minPrice: undefined } }`                                     | `{ canonicalPath: "/products" }`                                                                                    |
| 16  | `{ basePath: "/products", filters: { search: "чохол" }, page: 3 }`                                                   | `{ robots: { index: false, follow: true } }` (filter wins over page — no `canonicalPath`)                           |
| 17  | `{ basePath: "/categories/apple-cases" }`                                                                            | `{ canonicalPath: "/categories/apple-cases" }`                                                                      |
| 18  | `{ basePath: "/categories/apple-cases", page: 2 }`                                                                   | `{ canonicalPath: "/categories/apple-cases?page=2" }`                                                               |
| 19  | `{ basePath: "/categories/apple-cases", filters: { minPrice: "100" } }`                                              | `{ robots: { index: false, follow: true } }`                                                                        |
| 20  | `{ basePath: "/products", categoryCanonicalPath: "/categories/apple-cases" }`                                        | `{ canonicalPath: "/categories/apple-cases" }` (category redirect, no other filter)                                 |
| 21  | `{ basePath: "/products", categoryCanonicalPath: "/categories/apple-cases", page: 2 }`                               | `{ canonicalPath: "/categories/apple-cases?page=2" }`                                                               |
| 22  | `{ basePath: "/products", categoryCanonicalPath: "/categories/apple-cases", filters: { minPrice: "100" } }`          | `{ robots: { index: false, follow: true } }` (filter beats the category redirect — `categoryCanonicalPath` ignored) |
| 23  | `{ basePath: "/products", categoryCanonicalPath: "/categories/apple-cases", filters: { minPrice: "100" }, page: 3 }` | `{ robots: { index: false, follow: true } }` (filter + page + category all present → still just noindex,follow)     |
| 24  | `{ basePath: "/products", categoryCanonicalPath: undefined, filters: {} }` (empty filters object, no category)       | `{ canonicalPath: "/products" }` (empty object ≠ any filter present)                                                |

Write all 24 cases failing (Red) against a not-yet-implemented `buildListingMetadata`, implement the
minimum to go Green case by case (Decisions 1–4 map roughly 1:1 to groups of rows above), then
Refactor for readability (e.g. extract a private `hasAnyFilter()` / `normalizePage()` helper) with
the full suite staying green throughout.

## Tasks

### TASK-278-A: Core — `buildListingMetadata()` pure helper (TDD)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** Yes — Red → Green → Refactor per the 24-case table above.
**Depends on:** — (TASK-277 already merged on this branch; no code dependency, just shares the
`/categories/[slug]` route this plan wires next)

**Acceptance Criteria:**

- [ ] All 24 cases from §TDD Test List written first and confirmed Red, then implementation makes them
      Green one group at a time, per `docs/conventions` TDD discipline
- [ ] `buildListingMetadata()` never imports `SITE_URL`, Next's `Metadata` type, or anything
      route-specific — pure function, same purity bar as `resolveSeo()`
- [ ] Top-of-file doc comment states the canonical/noindex convention (Decisions 1–4, condensed) so it
      is discoverable without this plan
- [ ] `shared/lib/seo/index.ts` barrel exports `buildListingMetadata` + `ListingMetadataInput` /
      `ListingMetadataResult` / `ListingFilterParams` types
- [ ] `resolveSeo.ts` is **not** modified by this task
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client` (the new `listing-metadata.test.ts` runs under
      the `unit` Jest project, same as `resolveSeo.test.ts`)

**Files to create/modify:**

- `apps/store-client/src/shared/lib/seo/listing-metadata.ts` — new
- `apps/store-client/src/shared/lib/seo/listing-metadata.test.ts` — new
- `apps/store-client/src/shared/lib/seo/index.ts` — barrel export additions

---

### TASK-278-B: Wiring — `/products`, `/categories/[slug]`, `robots.ts`, `/checkout`, order confirmation

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No — thin route-level wiring around an already-tested pure helper; no existing
precedent in this codebase for testing App Router `generateMetadata` call sites directly (verified:
neither `/products` nor `/categories/[slug]` had page-level tests before this plan) — verified via
`npm run typecheck`/`lint`/`build` + the manual checks below.
**Depends on:** TASK-278-A

**Acceptance Criteria:**

- [ ] `app/products/page.tsx` `generateMetadata`: reads `brandId`/`deviceModelId`/`onSale` from
      `searchParams` in addition to the existing `search`/`minPrice`/`maxPrice`/`specs`/`page` (closes
      the partial-filter-coverage gap noted in Scope), builds one `filters` object, calls
      `buildListingMetadata({ basePath: "/products", page, filters, categoryCanonicalPath })` where
      `categoryCanonicalPath` is `` `/categories/${node.slug}` `` when a category node resolved, else
      `undefined` — **replaces** the current hardcoded `alternates: { canonical: ... } }` inside the
      `if (node)` branch and adds the same canonical/robots resolution to the previously-bare
      unfiltered/search branch
- [ ] Title/description resolution in `products/page.tsx` is **unchanged** — only the
      `alternates`/`robots` portion of the returned `Metadata` object is now sourced from
      `buildListingMetadata()`
- [ ] `app/categories/[slug]/page.tsx` `generateMetadata`: reads the same seven filter params (adds
      `brandId`/`deviceModelId`/`onSale` alongside the existing `minPrice`/`maxPrice`/`specs`/`page`/
      `search`), calls `buildListingMetadata({ basePath: `/categories/${node.slug}`, page, filters })`
      (no `categoryCanonicalPath` — already segment-scoped), replaces the current unconditional
      `alternates: { canonical: `${SITE_URL}/categories/${node.slug}` } }` with the helper's output
- [ ] Both routes translate `canonicalPath`/`robots` from the helper into the `Metadata` object only
      when present (`canonicalPath` → `alternates: { canonical: `${SITE_URL}${canonicalPath}` } }`;
      `robots` → `robots: meta.robots` verbatim) — neither key is emitted when the helper returns it
      absent
- [ ] `app/robots.ts`: `/search` added to the existing `disallow` array (alongside `/cart`,
      `/checkout`, `/orders`, `/account`, `/login`, `/register`); no other line changed
- [ ] `app/search/page.tsx` verified unchanged — its existing
      `robots: { index: false, follow: true }` in `generateMetadata` stays exactly as-is (this task
      does not touch the file; verification only)
- [ ] `app/checkout/page.tsx`: static `metadata` export gains `robots: { index: false, follow: false }`
      alongside the existing `title`/`description`
- [ ] `app/orders/[id]/confirmation/page.tsx`: `generateMetadata` return gains
      `robots: { index: false, follow: false }` alongside the existing `title`
- [ ] Manual smoke (dev server): `curl -s localhost:3000/products | grep canonical` → present, no
      query string; `.../products?search=x` → absent (or `noindex` present in a `<meta name="robots">`
      tag, no canonical link); `.../products?page=2` → canonical includes `?page=2`;
      `.../products?categoryId=<id>` → canonical points at `/categories/<slug>`;
      `.../categories/<slug>?minPrice=100` → noindex, no canonical; `/checkout` and
      `/orders/<id>/confirmation` → `<meta name="robots" content="noindex, nofollow">` present;
      `/robots.txt` → `Disallow: /search` present
- [ ] `npm run typecheck`/`lint`/`build` clean for store-client

**Files to create/modify:**

- `apps/store-client/src/app/products/page.tsx` — wire `buildListingMetadata`, add
  `brandId`/`deviceModelId`/`onSale` param reads
- `apps/store-client/src/app/categories/[slug]/page.tsx` — wire `buildListingMetadata`, add
  `brandId`/`deviceModelId`/`onSale` param reads
- `apps/store-client/src/app/robots.ts` — add `/search` to `disallow`
- `apps/store-client/src/app/checkout/page.tsx` — add `robots: { index: false, follow: false }`
- `apps/store-client/src/app/orders/[id]/confirmation/page.tsx` — add
  `robots: { index: false, follow: false }`

## Dependencies & Sequencing

- **Internal:** TASK-278-A → TASK-278-B (wiring needs the tested helper to exist first).
- **External:** TASK-277 (plan 142, categories landing pages) is already merged on this
  branch/worktree — this plan's `categories/[slug]/page.tsx` edit is a small diff on top of that
  existing file, not a new route.
- Per `docs/handoff-seo.md`'s recommended order, TASK-279 (brand title/OG/favicon) is parallel-safe
  with this plan — no shared files.
- TASK-282 (robots AI-crawler stanza + IndexNow, plan 144, next on this track) touches `app/robots.ts`
  again after this plan merges — sequenced strictly after per the owner's routing note; expected to
  append a new rule block, not touch the `disallow` array line this plan adds.
- Feeds forward: TASK-281 (Merchant Center feed) and the rest of the SEO/GEO track assume a stable
  canonical policy is already in place; no direct code dependency.

## Risks & Mitigations

| Risk                                                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A future new filter param is added to `ProductControllerFindAllParams` but never added to `ListingFilterParams` / the two page call sites, silently letting a new dimension escape the noindex rule | The helper's `ListingFilterParams` type is a closed, explicit list (not `Record<string, unknown>`) — adding a filter to the OpenAPI contract without touching this type is a visible, deliberate omission at review time, not a silent drift; the top-of-file convention comment calls this out |
| `categoryCanonicalPath` + `filters` interaction (Decision 3 vs 2) is the least intuitive branch and easy to get backwards during implementation                                                     | Pinned by 4 dedicated test cases (20–23) exercising every combination of category-redirect × filter-present × page, written Red-first                                                                                                                                                           |
| Manual curl smoke checks in TASK-278-B are the only verification for the wiring (no page-level automated test, per this codebase's existing convention)                                             | Acceptance criteria spell out the exact 6 curl/dev-server checks to run before marking the task done; the helper itself carries the real test coverage, so wiring bugs are limited to "did I call it with the right basePath/categoryCanonicalPath," which the smoke checks catch directly      |
| `robots: { index: false, follow: false }` on `/checkout`/confirmation duplicates the existing `robots.ts` `disallow` — could look redundant to a future reviewer and get "cleaned up" by mistake    | Scope section explicitly frames this as defense-in-depth (a directly-linked/shared URL bypasses `robots.txt`'s crawl-block but still respects an in-page `noindex` meta tag once fetched) — documented so it isn't mistaken for dead code                                                       |

## Notes

- The `alternates.canonical` vs `robots.noindex` mutual-exclusivity rule (Decision 2) is the one
  policy call this plan makes that wasn't explicit in `docs/handoff-seo.md` — it was already the
  de facto pattern on `/search`, so this plan formalizes existing precedent rather than inventing a
  new one.
- `onSale`, `brandId`, `deviceModelId` becoming noindex triggers is a scope addition beyond the
  handoff's literal wording ("filter/sort-параметрів" without enumerating which query keys count),
  justified by `ProductControllerFindAllParams`'s own doc comments explicitly labeling all three as
  "Filter by …" — treated as first-class filters for this policy, matching `search`/`minPrice`/
  `maxPrice`/`specs`.
