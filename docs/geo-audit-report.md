# GEO Audit Report: MobileStore (store-client)

**Audit Date:** 2026-07-06
**URL:** http://localhost:3000 (prod build, `next start`)
**Business Type:** E-commerce (multi-brand phone/Apple accessories, UA market)
**Tool:** `geo-seo-claude` skill (`/geo audit`), run against the local prod build
**Pages analyzed:** homepage, `/products`, PDP, sitemap surface

> **Framing:** this is a **pre-launch** audit. Two GEO categories — **Brand
> Authority** and **Platform Optimization** — measure _external_ presence
> (Reddit / YouTube / Wikipedia mentions, AI-platform citations). A site that is
> not yet publicly live structurally scores ~0 there, which drags the weighted
> composite down. The meaningful, controllable signal before launch is the
> **on-page + technical** half — and that is strong.

---

## Executive Summary

**Overall GEO Score: ~58/100 (Fair)** — but that number is dominated by the two
pre-launch-N/A categories. **On-page GEO (Technical + Schema + on-page
citability) is Good→Strong (~80/100).** The storefront already ships SSR,
comprehensive structured data, clean robots/sitemap, localized OG/meta and
strict security headers. The single real on-page gap — a missing **llms.txt** —
was fixed during this pass.

### Score Breakdown

| Category                 | Score  | Weight | Weighted    | Note                                                                  |
| ------------------------ | ------ | ------ | ----------- | --------------------------------------------------------------------- |
| AI Citability            | 60/100 | 25%    | 15.0        | Product + blog content; no FAQ blocks yet                             |
| Brand Authority          | 30/100 | 20%    | 6.0         | **Pre-launch — N/A** (no external mentions yet)                       |
| Content E-E-A-T          | 60/100 | 20%    | 12.0        | Blog + about/contact/legal present                                    |
| Technical GEO            | 90/100 | 15%    | 13.5        | SSR, robots, sitemap, headers, **+llms.txt (fixed)**                  |
| Schema & Structured Data | 85/100 | 10%    | 8.5         | Organization, WebSite/SearchAction, Product, Offer, Brand, Breadcrumb |
| Platform Optimization    | 30/100 | 10%    | 3.0         | **Pre-launch — N/A**                                                  |
| **Overall**              |        |        | **~58/100** | On-page-only ≈ **80/100**                                             |

---

## Findings by severity

### High — fixed this pass ✅

- **No `llms.txt`** (`/llms.txt` returned 404). This is the emerging
  AI-discoverability standard (llmstxt.org). **Fixed:** added a static route
  handler `app/llms.txt/route.ts` that serves a curated UA markdown map (catalog,
  categories, blog, promo, info, legal, contact + sitemap pointer). Takes effect
  on the next build.

### Medium (post-launch / next iteration)

- **No `AggregateRating` / `Review` schema on PDP.** Product schema is present
  (Offer, Brand, Breadcrumb) but review stars aren't exposed as structured data —
  a strong e-commerce GEO/rich-result signal once reviews exist.
- **No `FAQPage` schema.** Adding a short FAQ block (delivery, warranty,
  compatibility) with FAQPage markup on PDP/info pages is high-citability content
  AI assistants quote directly.
- **Homepage `<title>` is `Головна`** without the brand — the `%s | MobileStore`
  template should surface the brand on the home route for entity clarity.

### Low

- No explicit `Google-Extended` / AI-crawler stanza in robots (all bots are
  currently allowed via `*`, which is fine — this is only an explicitness nicety).
- OG image not verified in this pass (add a branded default `og:image` if absent).

---

## What is already strong (keep)

- **Structured data:** homepage carries `Organization` + `WebSite` +
  `SearchAction`/`EntryPoint` (sitelinks searchbox); PDP carries `Product`
  (`name`, `Offer`/`price`, `Brand`) + `BreadcrumbList`. Above-average for
  e-commerce.
- **Technical:** server-side rendered (Next.js App Router), `robots.txt` allows
  public content and disallows private routes (`/cart`, `/checkout`, `/orders`,
  `/account`, auth) and points to the sitemap; `sitemap.xml` is dynamic +
  resilient; strict prod security headers (CSP, HSTS) — all AI crawlers allowed.
- **On-page meta:** localized `<title>`, meta description, and full Open Graph
  set (`og:title/description/url/site_name`, `og:locale=uk_UA`, `og:type`).

---

## Quick Wins

1. ✅ **Add `llms.txt`** — done (`app/llms.txt/route.ts`).
2. ✅ **`AggregateRating` in Product JSON-LD** — done; emitted from
   `ratingAverage`/`ratingCount` when a product has approved reviews.
3. ✅ **`sameAs` in Organization JSON-LD** — done; wired from the admin-managed
   social links (Viber/Telegram/Instagram) so the brand entity links to its
   profiles.
4. **Add a small `FAQPage` block** on PDP + `/info` (delivery, warranty,
   compatibility) — highly quotable by AI answer engines. _(planned)_
5. **Brand the home `<title>`** (`Головна | MobileStore`) + a default branded
   `og:image`. _(planned — rolls into the admin SeoSettings work)_

## Post-launch (Brand Authority & Platform — the N/A half)

Once live: seed brand entity presence (Google Business/Knowledge, a few
authoritative mentions), then re-run `/geo audit <public-url>` — Brand Authority
and Platform categories become measurable and the composite rises sharply.

---

## Appendix: evidence

- `GET /llms.txt` → 404 (before fix) → served after rebuild.
- `GET /robots.txt` → `User-Agent: *` Allow `/`, disallows private routes, sitemap ref.
- `GET /sitemap.xml` → valid urlset (home, products, categories, blog, legal, info, promo, contact + dynamic entries).
- Homepage JSON-LD `@type`: `Organization`, `WebSite`, `SearchAction`, `EntryPoint`.
- PDP JSON-LD `@type`: `Product`, `Offer`, `Brand`, `BreadcrumbList`.
