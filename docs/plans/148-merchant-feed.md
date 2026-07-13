# Plan 148 — Google Merchant Center Feed (`merchant-feed.xml`)

> **Status:** ✅ Done (TASK-281 shipped; live curl + Merchant Center submission → manual QA)
> **Phase:** Roadmap Етап 7 — SEO/GEO (BACKLOG.md; source `docs/handoff-seo.md` §SEO-5)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-281 `[SEO/M]`

## Overview

`docs/handoff-seo.md` §SEO-5 flags a gap: the store has no product feed for Google Merchant
Center, which is a free listing channel (Google Shopping "free listings" tab) and typically the
fastest traffic source for a brand-new store — faster than organic ranking. This plan adds a
standalone RSS 2.0 + `g:`-namespace feed route, `app/merchant-feed.xml/route.ts`, listing every
active product (position, per TASK-142) with the fields Merchant Center requires, plus an
admin-guide runbook so the (non-technical) owner can register the feed.

Recommended handoff order: TASK-277 → TASK-278 ∥ TASK-279 → TASK-280; then TASK-285, **TASK-281**,
TASK-282. TASK-280 (plan 146, Search Console verification) lands before this plan and is expected
to have already added the admin-guide "Search Console" section (§23 at the time this plan was
written) — the runbook task below links to it, but the implementer MUST re-check the actual
section number in `docs/admin-guide.md` at implementation time, since parallel worktrees may shift
numbering.

## Scope

### In Scope

- Pure XML builder module (`shared/lib/merchant-feed/`): `escapeXml` helper + `buildMerchantFeedXml`
  that turns a list of active-product summaries into a complete RSS 2.0 + `g:` XML string.
- Route handler `app/merchant-feed.xml/route.ts`: fetches all active products via the existing
  `fetchAllActiveProducts()` (already paginates past the API's 100-item page cap — same helper
  `app/sitemap.ts` uses), maps them to the builder's narrow input shape, and returns the XML with
  a `Cache-Control` header mirroring the `llms.txt`/`indexnow.txt` ~1h pattern.
- Field mapping decisions (below) for `g:id`, `title`, `description`, `link`, `g:image_link`,
  `g:price`, `g:availability`, `g:condition`, `g:brand`, `g:identifier_exists`.
- Unit tests: `escapeXml` (all 5 XML-special characters), `buildMerchantFeedXml` (availability
  mapping, `identifier_exists` always `"false"`, missing-image/invalid-price exclusion, empty
  product list → valid empty-channel XML, escaping end-to-end) + a route test (mocks
  `fetchAllActiveProducts`, asserts headers + body shape + graceful fallback on fetch failure).
- `docs/admin-guide.md`: new section at the end of the file — registering the store in Merchant
  Center, verifying site ownership (linking to the Search Console section), submitting the feed
  URL, update cadence.

### Out of Scope

- Any backend/Prisma change — `PublicProductEntity` (via `productControllerFindAll`) already
  carries every field this feed needs (`id`, `name`, `slug`, `description`, `price`, `inStock`,
  `brand.name`, `primaryImage.url`); verified against `apps/store-api/src/product/entities/`
  (`public-product.entity.ts`, `product-brand.entity.ts`, `product-image.entity.ts`).
- `g:sale_price` (compareAtPrice-based promo pricing), `g:gtin`/`g:mpn` (schema has neither field
  anywhere — confirmed by grepping `schema.prisma`, hence `identifier_exists` is unconditionally
  `"false"`), `g:google_product_category`, `g:shipping` — none requested by the handoff; future
  follow-up if the owner wants richer listings.
- Wiring the feed URL into `robots.txt`/`sitemap.xml` — Merchant Center feeds are submitted
  directly in the Merchant dashboard, not discovered via crawling; no robots/sitemap change needed.
- Fixing `buildProductSchema.ts`'s JSON-LD `brand` (it currently hardcodes `SITE_NAME` instead of
  the real `Brand` relation, TASK-189) — noted as a pre-existing inconsistency in Notes, not fixed
  here (separate concern from this plan's scope, own follow-up if desired).

## User Stories

1. As the store owner, I want my active catalog to show up in Google's free Shopping listings
   without paying for ads, so the store gets organic product-search traffic from day one.
2. As a future maintainer, I want the feed to degrade gracefully (never 500) when the API is down
   or a product is missing required data, and to stay in sync with the live catalog via a short
   cache TTL instead of a manual export step.

## Technical Design

### Design Decision 1 — narrow input type, not the full `PublicProductEntity`

`buildMerchantFeedXml` takes a small local `MerchantFeedProduct` shape (`id`, `name`, `description`,
`slug`, `price`, `inStock`, `brand: { name } | null`, `primaryImage: { url } | null`) instead of the
generated `PublicProductEntity` (which also carries `specs`, `highlights`, `variantSummary`,
`compatibleDeviceModels`, rating fields, etc. — irrelevant here). This keeps the builder pure and
its unit tests trivial to set up (no need to construct a full, realistic `PublicProductEntity`
mock for every case). The route handler does the narrowing map at the call site.

### Design Decision 2 — description: strip, don't render as markdown/HTML

`ProductEntity.description` is documented as "markdown" in the DTO, but the PDP
(`product-specs-tabs.tsx`) renders it as plain text (`whitespace-pre-line`, no markdown parser is
wired up anywhere in the codebase) — so in practice it's operator-typed plain prose with line
breaks, occasionally containing stray markdown punctuation. Reuse the existing
`stripFormatting` + `truncateAtWord` pair from `shared/lib/seo` (already used by `resolveSeo()` for
exactly this "content → clean description" derivation) instead of writing new stripping logic.
Google's description max is 5000 characters — a local `DESCRIPTION_MAX = 5000` constant, distinct
from `SEO_DESCRIPTION_MAX` (155, meta-tag sized). When the stripped description is empty, fall back
to `dict.meta.productFallbackDescription` ("Переглянути деталі товару.") — the same fallback string
`app/products/[slug]/page.tsx` already uses for meta description, so no empty `<description>` tag
is ever emitted (Merchant Center flags/disapproves items with a blank description).

### Design Decision 3 — XML escaping: a dedicated `escapeXml` helper, not CDATA

Chosen: plain entity-escaping (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`, `'`→`&apos;`),
applied to `title`, `description`, and `g:brand` and `g:id` (id is a UUID so it's a no-op there, but
applying it everywhere text is interpolated is cheaper to reason about than remembering which
fields need it). Chosen over `<![CDATA[…]]>` because the content is already stripped to plain text
(Decision 2) — there's no HTML to preserve — and escaping avoids the CDATA edge case where the
source text itself could contain the literal sequence `]]>`. `link`/`g:image_link` are also passed
through `escapeXml` for defense-in-depth (a URL containing an unescaped `&` — e.g. a query string —
would otherwise break the XML), even though today's slugs/CDN URLs never contain `&`.

### Design Decision 4 — item exclusion: missing image or invalid price

Google Merchant requires both `g:image_link` and `g:price` on every item; a product missing either
would just get the item disapproved anyway. Rather than emit an invalid `<item>`, the builder skips
it entirely (mirrors the sitemap's "degrade rather than emit garbage" convention) and the count of
skipped items is available to the caller for a `console.warn` (does not fail the whole feed —
one bad product must never take down the other 500).

- No `primaryImage`/`primaryImage.url` → skip.
- `price` doesn't parse to a finite positive number (reuses the same
  `Number.isFinite`-style guard `buildProductSchema.ts`'s `resolvePrice` already uses) → skip.

### Design Decision 5 — `g:brand`: real `Brand` relation, `SITE_NAME` fallback

The handoff explicitly asks for "з Brand-relation, TASK-189" — unlike `buildProductSchema.ts`
(JSON-LD), which currently hardcodes `SITE_NAME` regardless of the product's actual brand (a
pre-existing inconsistency, see Notes). Here: `product.brand?.name ?? SITE_NAME`. `SITE_NAME` is a
reasonable fallback for the (currently common, brand is nullable) case of an unbranded product,
consistent with the store being a multi-brand reseller that still "backs" every listing.

### Design Decision 6 — `g:availability` / `g:condition` / `g:identifier_exists`

- `g:availability`: `product.inStock ? "in_stock" : "out_of_stock"` — uses the already-derived
  public boolean (`PublicProductEntity.inStock`), never re-derives from a raw stock count (which
  isn't even on the public entity — see `public-product.entity.ts`'s doc comment on why `stock` is
  intentionally omitted from public responses).
- `g:condition`: literal `"new"` for every item (store sells only new goods; no used/refurbished
  concept anywhere in the schema).
- `g:identifier_exists`: literal `"false"` for every item — `gtin`/`mpn` do not exist anywhere in
  `schema.prisma` (confirmed by search), so this is unconditional, not computed per-product.

### Design Decision 7 — caching: `Cache-Control` header, not `export const dynamic`

Follows the exact pattern `llms.txt`/`indexnow.txt` already use: no `export const dynamic`/
`revalidate`, just `"Cache-Control": "public, max-age=3600, s-maxage=86400"` on the `Response` (1h
browser cache, 24h CDN cache subject to revalidation) — this is the "~1h ISR" the handoff asks for,
achieved the same way the other two text/XML utility routes already do it, so there's one caching
idiom for this whole route family instead of a second, `sitemap.ts`-style `force-dynamic` one.

### Design Decision 8 — channel-level fields reuse existing dictionary strings

`<channel><title>` = `SITE_NAME`, `<link>` = `SITE_URL`, `<channel><description>` =
`dict.meta.rootDescription` (already exists, already Ukrainian, already describes the store) — no
new dictionary entries, no `SeoSettings` fetch (unlike `llms.txt`, which fetches `SeoSettings` for
an admin-editable intro paragraph — not warranted here since Merchant Center never surfaces the
channel-level text to shoppers, only the per-item fields matter). Keeps the route to a single
network call (`fetchAllActiveProducts`).

### The builder — `shared/lib/merchant-feed/buildMerchantFeedXml.ts`

```ts
export interface MerchantFeedProduct {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  price: string;
  inStock: boolean;
  brand: { name: string } | null;
  primaryImage: { url: string } | null;
}

export interface BuildMerchantFeedXmlInput {
  products: MerchantFeedProduct[];
  siteUrl: string;
  siteName: string;
  currency: string;
  channelDescription: string;
  fallbackDescription: string;
}

/** Pure. Returns a complete RSS 2.0 + g: XML document string (never throws). */
export function buildMerchantFeedXml(input: BuildMerchantFeedXmlInput): string;
```

### The route — `app/merchant-feed.xml/route.ts`

```ts
export async function GET(): Promise<Response> {
  let products: MerchantFeedProduct[] = [];
  try {
    const all = await fetchAllActiveProducts();
    products = all.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      slug: p.slug,
      price: p.price,
      inStock: p.inStock,
      brand: p.brand ? { name: p.brand.name } : null,
      primaryImage: p.primaryImage ? { url: p.primaryImage.url } : null,
    }));
  } catch (err) {
    console.error("[merchant-feed] Failed to fetch products:", err);
    // fall through with products = [] — a valid, empty-channel feed beats a 500
  }

  const xml = buildMerchantFeedXml({
    products,
    siteUrl: SITE_URL,
    siteName: SITE_NAME,
    currency: CURRENCY,
    channelDescription: dict.meta.rootDescription,
    fallbackDescription: dict.meta.productFallbackDescription,
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
```

### RSS shape produced

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>MobileStore</title>
    <link>https://mobilestore.com</link>
    <description>Ваш магазин аксесуарів для мобільних телефонів — ...</description>
    <item>
      <g:id>550e8400-e29b-41d4-a716-446655440000</g:id>
      <title>iPhone 15 Pro Case — Clear MagSafe</title>
      <description>Premium clear case...</description>
      <link>https://mobilestore.com/products/iphone-15-pro-case-clear-magsafe</link>
      <g:image_link>https://cdn.example.com/images/product-1.jpg</g:image_link>
      <g:price>29.99 UAH</g:price>
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:brand>Spigen</g:brand>
      <g:identifier_exists>false</g:identifier_exists>
    </item>
    <!-- one <item> per active, image+price-valid position -->
  </channel>
</rss>
```

## Tasks

### TASK-281-A: XML escape + feed builder (pure, unit-tested)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No (not on AGENTS.md's critical-module list) — still full unit coverage per the
acceptance criteria below; write the tests alongside the implementation.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `escapeXml(text)` escapes all 5 XML-special characters (`& < > " '`), `&` handled first so
      later replacements don't double-escape
- [ ] `buildMerchantFeedXml` emits a well-formed RSS 2.0 document with the `g:` namespace
      declared on `<rss>`, one `<channel>` with `title`/`link`/`description`, and one `<item>` per
      eligible product
- [ ] Per-item fields match Design Decisions 2–6: `g:id`=`product.id`, `title`=escaped name,
      `description`=stripped+truncated (≤5000 chars)+escaped, falls back to
      `fallbackDescription` when the stripped text is empty, `link`=`${siteUrl}/products/${slug}`,
      `g:image_link`=`primaryImage.url` verbatim, `g:price`=`"${price} ${currency}"`,
      `g:availability`=`in_stock`/`out_of_stock` from `inStock`, `g:condition`=`"new"`,
      `g:brand`=`brand?.name ?? siteName` (escaped), `g:identifier_exists`=`"false"` always
- [ ] Products with no `primaryImage` are excluded from the `<item>` list (Decision 4)
- [ ] Products whose `price` doesn't parse to a finite positive number are excluded (Decision 4)
- [ ] Empty `products: []` → valid XML with a `<channel>` and zero `<item>` elements (not an error)
- [ ] A product whose name/description contains `& < > " '` round-trips through escaping correctly
      (assert on the raw string output, not just "no throw")
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client` (new tests run under the `unit` project)

**Files to create/modify:**

- `apps/store-client/src/shared/lib/merchant-feed/escapeXml.ts` — new
- `apps/store-client/src/shared/lib/merchant-feed/escapeXml.test.ts` — new
- `apps/store-client/src/shared/lib/merchant-feed/buildMerchantFeedXml.ts` — new
- `apps/store-client/src/shared/lib/merchant-feed/buildMerchantFeedXml.test.ts` — new
- `apps/store-client/src/shared/lib/merchant-feed/index.ts` — new barrel
  (`escapeXml`, `buildMerchantFeedXml`, `MerchantFeedProduct`, `BuildMerchantFeedXmlInput`)

**Test cases (indicative, flesh out during implementation):**

| #   | Case                                         | Expected                                            |
| --- | -------------------------------------------- | --------------------------------------------------- |
| 1   | `escapeXml("A & B <tag> \"q\" 'q'")`         | all 5 chars escaped, order-safe                     |
| 2   | full product, all fields present             | one `<item>` with every tag populated per mapping   |
| 3   | `brand: null`                                | `<g:brand>` falls back to `siteName`                |
| 4   | `description: null`                          | `<description>` falls back to `fallbackDescription` |
| 5   | `description` very long (>5000 chars)        | truncated at word boundary, no mid-word cut         |
| 6   | `primaryImage: null`                         | item excluded entirely, other items unaffected      |
| 7   | `price: "abc"` / `price: "-5"` / `price: ""` | item excluded entirely                              |
| 8   | `inStock: false`                             | `<g:availability>out_of_stock</g:availability>`     |
| 9   | `products: []`                               | valid `<channel>` wrapper, zero `<item>` tags       |
| 10  | name/description containing `&`/`<`/`>`      | escaped in output, XML stays parseable              |

---

### TASK-281-B: Route handler `merchant-feed.xml/route.ts`

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-281-A

**Acceptance Criteria:**

- [ ] `GET` fetches all active products via `fetchAllActiveProducts()` (from
      `shared/lib/schema`, same helper `sitemap.ts` uses — no new pagination logic)
- [ ] Maps `PublicProductEntity[]` → `MerchantFeedProduct[]` per the narrow shape (Decision 1)
- [ ] On `fetchAllActiveProducts()` throwing, logs via `console.error("[merchant-feed] ...")` and
      falls through to an empty product list — response is still `200` with a valid empty-channel
      feed (mirrors `sitemap.ts`'s per-source try/catch convention), never a `500`
- [ ] Response headers: `Content-Type: application/xml; charset=utf-8`,
      `Cache-Control: public, max-age=3600, s-maxage=86400` (Decision 7)
- [ ] Route test (`route.test.ts`, `unit` project) mocking `fetchAllActiveProducts`:
  - [ ] happy path — asserts headers + that the body contains the expected `<item>` count and a
        known field value (e.g. one product's `g:id`)
  - [ ] `fetchAllActiveProducts` rejects → still `200`, body has zero `<item>` tags,
        `console.error` called
- [ ] `npm run typecheck`/`lint` clean for store-client
- [ ] Tests pass: `npm run test -w apps/store-client`
- [ ] Manual smoke: `curl -i localhost:3000/merchant-feed.xml` (dev, seeded DB) returns well-formed
      XML — pipe through `xmllint --noout -` or equivalent to confirm parseability

**Files to create/modify:**

- `apps/store-client/src/app/merchant-feed.xml/route.ts` — new
- `apps/store-client/src/app/merchant-feed.xml/route.test.ts` — new

---

### TASK-281-C: Admin-guide runbook

**Type:** docs
**Scope:** store-client (docs)
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-281-B (feed must exist to document); soft-depends on TASK-280/plan 146
(Search Console section) for an accurate section-number cross-link — re-verify the actual number
in `docs/admin-guide.md` before writing the link (see Overview).

**Acceptance Criteria:**

- [ ] New numbered section appended at the end of `docs/admin-guide.md` (after "22. Аналітика",
      or after whatever the last section is at implementation time — do not renumber existing
      sections), titled something like "23. Google Merchant Center" (or the next free number if
      TASK-280 already claimed 23), added to the `## Зміст` table of contents at the top of the
      file in the same style as the other entries
- [ ] Plain-UA, non-technical runbook covering, in order: (1) реєстрація магазину в Merchant
      Center (merchants.google.com), (2) підтвердження права власності на сайт — посилання на цей
      же admin-guide's Search Console section (verify actual number) since the same verification
      unblocks both Search Console and Merchant Center, (3) подача фіду за адресою
      `https://<домен>/merchant-feed.xml` (Products → Feeds → "Google Sheets/scheduled fetch" →
      URL), (4) періодичність оновлення — пояснити, що фід кешується на ~1 годину і Merchant сам
      періодично перечитує URL (не треба вручну перезавантажувати після кожної зміни товару, лише
      час від часу перевіряти статус у Merchant Center на предмет відхилених товарів)
- [ ] Cross-reference from the "18. SEO-налаштування" or "21. Порядок дій перед запуском" section
      (whichever fits better) pointing to the new section, matching the file's existing
      cross-referencing style (e.g. how §18 already references FAQ)
- [ ] No code changes in this task — pure documentation

**Files to create/modify:**

- `docs/admin-guide.md` — new section + `## Зміст` entry + one cross-reference

## Migration Steps

1. TASK-281-A (builder + tests) — no dependencies, start here.
2. TASK-281-B (route + route test) — depends on A's exported `buildMerchantFeedXml`.
3. TASK-281-C (admin-guide runbook) — after B (needs the real path to document) and ideally after
   TASK-280/plan 146 has landed on `develop` (for the Search Console section-number cross-link).
4. Manual verification (not an automated task): after deploy, submit
   `https://<real-domain>/merchant-feed.xml` in a real Merchant Center test/sandbox account and
   confirm at least one item is accepted with no policy errors — feed-format correctness is
   covered by unit tests, but Google's actual item-approval rules (image quality, price accuracy,
   category matching, etc.) can only be checked against the live Merchant Center UI.

## Risks & Mitigations

| Risk                                                                                                                                        | Mitigation                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A product's `description`/`name` contains characters that break XML if escaping is missed on one field                                      | `escapeXml` applied uniformly to every interpolated text field (Decision 3); dedicated escaping test cases                                                                         |
| Feed grows large (thousands of positions) and the per-request `fetchAllActiveProducts()` pagination loop gets slow                          | Same helper `sitemap.ts` already relies on at production catalog sizes; the 1h `Cache-Control` (Decision 7) means most requests are served from CDN/browser cache, not re-computed |
| Merchant Center disapproves items missing required fields (image/price)                                                                     | Builder pre-filters those items out before they're ever emitted (Decision 4), rather than shipping an invalid `<item>` and finding out from Merchant's UI                          |
| `g:brand` fallback (`SITE_NAME`) on unbranded products looks odd in Shopping ads for a clearly third-party product (e.g. an unbadged cable) | Accepted for v1 per the handoff's field list; if it becomes a real problem, the fix is populating `Brand` on more products via the admin (data quality), not a code change here    |
| Admin-guide section number drifts because TASK-280 (plan 146) lands with a different number than expected                                   | TASK-281-C explicitly re-verifies the actual current section number before linking (see its acceptance criteria) instead of hardcoding "23" blindly                                |

## Notes

- Google Merchant feed field reference used for this plan: `id`, `title`, `description`, `link`,
  `image_link`, `price`, `availability`, `condition`, `brand`, `identifier_exists` — the exact set
  the handoff (`docs/handoff-seo.md` §SEO-5) lists; no extra fields added speculatively.
- Pre-existing inconsistency spotted during research (not fixed by this plan, noted for a future
  follow-up): `shared/lib/schema/buildProductSchema.ts` (the PDP's Schema.org `Product` JSON-LD)
  hardcodes `brand: { name: SITE_NAME }` regardless of the product's actual `Brand` relation, even
  though `TASK-189` added that relation and it's populated on every product query. This plan's
  merchant feed does it correctly (`product.brand?.name ?? SITE_NAME`) per the handoff's explicit
  instruction — the JSON-LD file is a separate, unscoped fix if the owner wants Schema.org brand
  data to match reality too.
- `fetchAllActiveProducts()` (`shared/lib/schema/fetchAllProducts.ts`) already caps each page
  request at the API's max `limit` of 100 and loops over `meta.totalPages` — reused verbatim, no
  changes needed there.
