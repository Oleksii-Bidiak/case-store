# Plan 116 — SEO Platform + Admin Onboarding (Етап 5)

> **Status:** 🔄 Not started (planning only)
> **Phase:** Roadmap Етап 5 — SEO-платформа + admin onboarding (sequenced after the Review
> gates: TASK-193 ✅, TASK-194 ✅)
> **Design source:** `docs/geo-audit-report.md` (TASK-194 §5 GEO/SEO audit findings),
> `requirements.md` §2.1 ("Адмінка → CRM"), `AGENTS.md` (Clean Architecture / FSD rules)
> **Created:** 2026-07-06
> **Last Updated:** 2026-07-06
> **BACKLOG tasks:** TASK-239, TASK-240, TASK-241, TASK-242, TASK-243, TASK-244

## Overview

**Core framing:** the store owner does not understand SEO at all. Every task in this plan is
judged against two bars, both mandatory:

1. **Zero-config, out of the box.** An untouched install must already produce good SEO —
   titles, descriptions, canonical URLs, OG previews, structured data — derived automatically
   from content that already exists (product/category/page/blog names, descriptions, images).
2. **Overridable by a non-expert.** Every admin-facing SEO field ships with a plain-language UA
   hint explaining _what it does and why it matters_, following the `xxxHint` dictionary
   convention already used elsewhere in store-admin (`dict.productForm.attributesHint`,
   `dict.deviceCompat.hint`, `dict.categoryForm.metaTitlePlaceholder`, etc.).

### Already done this session (do not re-plan)

- `apps/store-client/src/app/llms.txt/route.ts` — static curated `llms.txt` (verified 200).
- `apps/store-client/src/shared/lib/schema/buildProductSchema.ts` — emits `aggregateRating` from
  `ratingAverage`/`ratingCount`.
- `apps/store-client/src/shared/lib/schema/buildOrganizationSchema.ts` — emits `sameAs` from
  `fetchSiteContactSettings()` (`apps/store-client/src/shared/api/site-contact-server.ts`), wired
  into `apps/store-client/src/app/page.tsx`.

### Existing patterns this plan reuses (cited, not re-derived)

| Pattern                                                                                                           | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Singleton admin settings** (`SiteContactSettings`) — the exact template for `SeoSettings`                       | `apps/store-api/src/site-contact/{site-contact.repository,site-contact.service,site-contact.controller,admin-site-contact.controller}.ts`, `entities/site-contact-settings.entity.ts`; admin `apps/store-admin/src/widgets/site-contact-settings-view/`, `features/site-contact-form/`, route `apps/store-admin/src/app/(dashboard)/settings/contact/page.tsx`; prior art fully documented in `docs/plans/086-admin-site-contact-settings.md` (Decisions 1–3)                                                |
| **Per-entity SEO meta already exists** on `Category`/`Page` (`metaTitle`/`metaDescription`), **Product has none** | `apps/store-api/prisma/schema.prisma:119-120` (Category, comment: _"rendering them into storefront `<head>` metadata is deferred to Phase D"_ — **still true today, closed by TASK-240**), `schema.prisma:418-419` (Page, **already wired** in `apps/store-client/src/app/legal/[slug]/page.tsx:41-53`); admin form pattern in `apps/store-admin/src/features/category-form/ui/category-form.tsx:229-260`                                                                                                    |
| **Storefront schema lib** (pure, unit-tested JSON-LD builders)                                                    | `apps/store-client/src/shared/lib/schema/{buildProductSchema,buildOrganizationSchema,buildWebSiteSchema,buildBreadcrumbSchema,buildBlogPostingSchema}.ts` + `shared/ui/json-ld.tsx`; root metadata in `app/layout.tsx`; `robots.ts` / `sitemap.ts` are code routes; `SITE_NAME`/`SITE_URL`/`CURRENCY` in `shared/config/site.ts`; `dict.meta.*` in `shared/config/dictionary.ts`                                                                                                                             |
| **Publishing / on-demand revalidation**                                                                           | `apps/store-api/src/publishing/{revalidation.notifier,publishing.scheduler,resolve-publish-state}.ts` (`RevalidationNotifier.revalidate({tags, paths})`, called from `blog.service.ts`, `pages.service.ts`, `banners.service.ts`); storefront `apps/store-client/src/app/api/revalidate/route.ts` (`revalidateTag`/`revalidatePath`); ISR-tagged server fetch pattern in `apps/store-client/src/shared/api/{site-contact-server,banners-server}.ts` (`next: { revalidate: 3600 }` / `next: { tags: [...] }`) |

### Gaps found while scoping this plan (each closed by a task below)

1. `Category.metaTitle`/`metaDescription` are collected in the admin form but **never rendered**
   into storefront `<head>` metadata — the schema comment literally says "deferred to Phase D".
   Closed by **TASK-240-D**.
2. `Product` has **zero** SEO meta columns — every other content type (Category, Page) has them.
   Closed by **TASK-241**.
3. Geo-audit finding: homepage `<title>` renders `"Головна"` without the brand
   (`apps/store-client/src/shared/config/dictionary.ts:1249`, `dict.meta.homeTitle`) — the
   `%s | ${SITE_NAME}` template in `app/layout.tsx:50` should already apply to a plain-string
   child title; verify the actual resolved `<title>` during implementation and fix whatever
   breaks the template application. Closed by **TASK-240-C**.
4. A **static, hardcoded, non-admin-editable FAQ already exists**
   (`apps/store-client/src/widgets/info-support/model/info-content.ts`, `INFO_FAQS`, 6 Q&A on
   delivery/returns/warranty/inspection/bonuses) but is never emitted as `FAQPage` JSON-LD and
   requires a code deploy to change one word. This is the seed content for **TASK-242**.
5. `SiteContactService.updateSettings()` never calls `RevalidationNotifier` — the footer / homepage
   Organization `sameAs` can lag up to the 1h ISR window after an edit. **Pre-existing gap, out of
   scope here** (not part of this plan's tasks); noted so the new `SeoSettings` module does **not**
   repeat the same mistake (TASK-239 wires revalidation from day one).
6. `BlogPost` has no `metaTitle`/`metaDescription` override — PDP-equivalent metadata is derived
   directly from `title`/`excerpt` (`apps/store-client/src/app/blog/[slug]/page.tsx:21-42`), which
   is already a form of "content-derived fallback" with no admin override tier. **Out of scope**
   here (not requested); flagged in Notes as a cheap, obvious follow-up once this plan ships.

## Scope

### In Scope

- `SeoSettings` singleton (global defaults, title template, default OG image, site-wide noindex
  toggle, editable `llms.txt` intro, additional `sameAs` links) — admin-manageable, zero-config
  defaults.
- Shared `resolveSeo()` precedence-chain helper (entity meta → `SeoSettings` defaults →
  content-derived fallback) and wiring it into root layout, homepage, category-filtered catalog
  listing, `robots.ts`, `llms.txt`.
- `Product.metaTitle`/`metaDescription` + admin form fields + PDP `generateMetadata` wiring.
- Global, admin-editable FAQ list (`FaqItem`) + `FAQPage` JSON-LD on `/info` and PDP.
- A Ukrainian admin onboarding guide covering every admin section, for a non-technical
  owner/employee, landing **before any deploy** (including a dev/staging deploy).

### Out of Scope

- Making `SITE_NAME`/brand identity itself DB-driven (still a `shared/config/site.ts` constant) —
  too invasive for this plan; `titleTemplate` lets the admin _reposition_ the brand in the title,
  not rename it store-wide.
- Per-product FAQ (see Decision 3) — a global reusable list is recommended instead.
- `BlogPost.metaTitle`/`metaDescription` columns (gap 6 above) — cheap follow-up, not requested.
- Fixing the pre-existing `SiteContactSettings` revalidation gap (gap 5 above) — noted only.
- In-app tooltips / empty-state hints beyond the dictionary `xxxHint` strings already planned —
  the brief calls this an optional follow-up, not part of this wave.
- Brand landing pages, screenshot capture automation for the onboarding guide (placeholders only).
- Any application code changes — **this session is planning only.**

## User Stories

1. As the store owner with no SEO knowledge, I want every product/category/page I publish to
   automatically get a decent title, description, and social preview without touching any SEO
   field, so my site is discoverable from day one.
2. As a non-expert admin/manager, I want to override the site's default SEO title/description,
   brand image, and social links from a settings screen with plain-language explanations, so I can
   fine-tune things without asking a developer.
3. As a shopper (or an AI assistant answering on my behalf), I want quick answers to
   delivery/warranty/compatibility questions to show up directly in search/AI results, so I can
   decide to buy without extra clicks.
4. As a new employee (or the owner) opening the admin panel for the first time, I want a
   Ukrainian guide covering every section, so I can do my job without breaking anything or
   waiting for a developer.

## Design Decisions

### Decision 1 — `SeoSettings` as a singleton row (same pattern as `SiteContactSettings`)

Reuses the fixed-ID upsert pattern documented in `docs/plans/086-admin-site-contact-settings.md`
Decision 1 (singleton row beats EAV / JSON column: type safety, Orval-typed hooks, explicit
schema, trivial reset-to-defaults). `SeoSettings` gets its **own** well-known constant —
`'00000000-0000-0000-0000-000000000002'` — a different table's PK namespace than
`SiteContactSettings`'s `...0001`, but minted distinctly to avoid any confusion between the two
singletons in logs/seed output.

### Decision 2 — `resolveSeo()` precedence chain, single shared pure helper

```
entity meta (Product/Category/Page.metaTitle|metaDescription)
  → SeoSettings defaults (defaultMetaTitle/defaultMetaDescription/titleTemplate/defaultOgImage)
    → content-derived fallback (name + description/excerpt + brand/category, truncated)
```

Lives once in `apps/store-client/src/shared/lib/seo/resolveSeo.ts` (store-client only — the admin
panel does not render public SEO surfaces). Every `generateMetadata()` call site composes the same
three tiers instead of ad hoc `??` chains duplicated per route (the current state in
`legal/[slug]/page.tsx` and `products/[slug]/page.tsx`).

### Decision 3 — FAQ: one global reusable list, not per-product

The brief's candidate questions (delivery, warranty, compatibility) are **store-wide policies**,
not product-specific facts. A per-product FAQ would force the admin to re-answer "what's your
return policy?" on every SKU — a combinatorial content-maintenance burden for a non-expert owner.
**Recommendation: a single global `FaqItem` list**, reused verbatim on `/info` and (a curated
subset or the same list) on the PDP. The one product-flavored question ("Чи підійде цей аксесуар
до мого пристрою?") stays **generic** in the global list ("Уточніть сумісність на сторінці
товару — там показано перелік підтримуваних моделей") rather than becoming N per-product rows —
it points at the existing per-product `DeviceModel` compatibility feature (TASK-190) instead of
duplicating it.

### Decision 4 — `additionalSameAsLinks` as a `String[]` + one-URL-per-line textarea

`SiteContactSettings` already covers Viber/Telegram/Instagram (support channels, already wired to
`sameAs`). `SeoSettings.additionalSameAsLinks` covers broader brand-authority profiles (Facebook,
YouTube, LinkedIn, X, Google Business, Wikipedia, ...) that don't fit the "contact" model. Rather
than minting N nullable columns (`facebookUrl`, `youtubeUrl`, ...) or building a new
repeatable-field admin widget (none exists in store-admin today), store it as a single
`String[]` column and render **one `<Textarea>`, one URL per line** — the zod schema splits on
newline, trims, drops blanks, validates each as a URL. Simplest implementation that stays
consistent with "keep it simple for a non-technical admin."

### Decision 5 — `llmsTxtSummary` overrides only the intro paragraph

The current `llms.txt` is a curated markdown map whose **links must stay in sync with real
routes** (code-owned). Only the intro blockquote (the one-paragraph business description right
under the `# ${SITE_NAME}` heading) is admin-editable via `SeoSettings.llmsTxtSummary`; the rest
of the document structure is untouched. This gives the admin control over how AI assistants
describe the business without letting a typo break the link map.

## Technical Design

### Data Model (Prisma additions)

```prisma
/// Singleton row for global/default SEO configuration (TASK-239). Feeds the root
/// layout metadata, robots.ts (site-wide noindex), llms.txt (intro override), and
/// the Organization JSON-LD `sameAs` (merged with SiteContactSettings' social
/// links). Distinct SINGLETON_ID from SiteContactSettings — see Decision 1.
model SeoSettings {
  id                      String   @id
  defaultMetaTitle        String?  @map("default_meta_title")
  defaultMetaDescription  String?  @map("default_meta_description")
  /// Must contain exactly one `%s` token when set, e.g. "%s | MobileStore".
  /// Null → falls back to the current hardcoded `%s | ${SITE_NAME}` template.
  titleTemplate           String?  @map("title_template")
  defaultOgImage          String?  @map("default_og_image")
  /// Site-wide noindex kill switch (staging vs prod) — see Decision-adjacent note
  /// in TASK-240-E. Default false (assume production once this ships).
  noindexSite             Boolean  @default(false) @map("noindex_site")
  /// Overrides only the intro paragraph of /llms.txt — see Decision 5.
  llmsTxtSummary          String?  @map("llms_txt_summary") @db.Text
  /// One-per-line brand-authority profile URLs (Facebook/YouTube/LinkedIn/X/
  /// Google Business/Wikipedia, ...) — merged into Organization `sameAs`
  /// alongside SiteContactSettings' viber/telegram/instagram. See Decision 4.
  additionalSameAsLinks   String[] @default([]) @map("additional_sameas_links")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt      @map("updated_at")

  @@map("seo_settings")
}
```

```prisma
// Added to `model Product` (mirrors Category/Page — TASK-241-A):
metaTitle       String? @map("meta_title")
metaDescription String? @map("meta_description")
```

```prisma
/// Global, admin-editable FAQ entries (TASK-242). Reused on /info and the PDP;
/// emitted as FAQPage JSON-LD. No publish lifecycle (simpler than Page/Banner) —
/// just isActive + sortOrder, mirroring the Brand module's CRUD shape.
model FaqItem {
  id        String   @id @default(uuid())
  question  String
  answer    String   @db.Text
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  @@index([isActive])
  @@map("faq_items")
}
```

### Backend (NestJS — Clean Architecture)

- `apps/store-api/src/seo-settings/` — mirrors `site-contact/` file-for-file (repository with
  `SINGLETON_ID`, service `empty()`/`fromPrisma()`, public `GET /api/seo-settings` + admin
  `PUT /api/admin/seo-settings`, DTO, entity, module). **Difference from `site-contact`:**
  `SeoService.updateSettings()` calls `RevalidationNotifier.revalidate({ tags: ['seo-settings'] })`
  after every write (closing gap 5 for this module specifically).
- `apps/store-api/src/faq/` — mirrors the `Brand` module's simple-CRUD shape (`isActive` +
  `sortOrder`, no `PublishStatus`): repository → service → public controller
  (`GET /api/faq`, all-active ordered by `sortOrder`) → admin controller (full CRUD +
  reorder) → module. Calls `RevalidationNotifier.revalidate({ tags: ['faq'] })` on every write.
- `Product` module: extend `create-product.dto.ts` / `update-product.dto.ts` (new optional
  `metaTitle`/`metaDescription`, `@MaxLength(255)`/`@MaxLength(500)` — same limits as
  Category/Page) and both `product.entity.ts` (admin) / `public-product.entity.ts` (storefront) —
  no new module.

### Frontend (store-client)

- `shared/lib/seo/resolveSeo.ts` — pure precedence-chain helper + text-truncation utils (unit
  tested).
- `shared/api/seo-settings-server.ts` — ISR-tagged fetch (`next: { tags: ['seo-settings'] }`),
  mirroring `site-contact-server.ts`; returns `null` on any failure (never throws).
- `shared/lib/schema/buildFaqPageSchema.ts` — new pure JSON-LD builder (`@type: "FAQPage"`).
- Wiring: `app/layout.tsx` (title template + description + noindex meta), `app/page.tsx` (home
  title — closes gap 3), `app/products/page.tsx` (category meta when `?categoryId=` present —
  closes gap 1), `app/products/[slug]/page.tsx` (product meta via `resolveSeo()`),
  `app/robots.ts` (site-wide noindex toggle, becomes async), `app/llms.txt/route.ts` (summary
  override, becomes a tagged fetch instead of pure-static), `app/info/page.tsx` +
  `widgets/info-support` (FAQ from the API instead of `INFO_FAQS`, with `INFO_FAQS` kept as the
  offline/error fallback), PDP (small FAQ block + `FAQPage` JSON-LD).

### Frontend (store-admin)

- `entities/seo-settings/`, `features/seo-settings-form/`, `widgets/seo-settings-view/`, route
  `apps/store-admin/src/app/(dashboard)/settings/seo/page.tsx` — mirrors the site-contact FSD
  layout 1:1 (see plan 086 Decision-adjacent file tree).
- `entities/faq/`, `features/faq-form/`, `widgets/faq-list/`, routes
  `apps/store-admin/src/app/(dashboard)/faq/{page.tsx,new/page.tsx,[id]/edit/page.tsx}` — mirrors
  the `Brand` admin CRUD shape (list + create + edit, `sortOrder` drag-or-number reorder like the
  existing admin list patterns).
- `features/product-form` extended with `metaTitle`/`metaDescription` fields (same
  `Input`/`Textarea` + `errors` pattern as `category-form.tsx:229-260`).
- New sidebar nav entries in `admin-sidebar.tsx`'s `bottomNavItems`:
  `{ label: dict.nav.seoSettings, href: '/settings/seo', icon: Search }` and
  `{ label: dict.nav.faq, href: '/faq', icon: HelpCircle }` (both from `lucide-react`, already a
  project dependency).
- Every new field gets a `dict.*Hint` string in plain UA, following the existing convention
  (`attributesHint`, `deviceCompat.hint`, `axesHint`, `scheduledAtHint`).

### API Contract

| Method | Path                                     | Auth  | Request Body                                  | Response                               |
| ------ | ---------------------------------------- | ----- | --------------------------------------------- | -------------------------------------- |
| GET    | `/api/seo-settings`                      | none  | —                                             | `{ data: SeoSettingsEntity }`          |
| PUT    | `/api/admin/seo-settings`                | Admin | `UpdateSeoSettingsDto` (partial)              | `{ data: SeoSettingsEntity }`          |
| GET    | `/api/faq`                               | none  | —                                             | `{ data: FaqItemEntity[] }`            |
| GET    | `/api/admin/faq`                         | Admin | —                                             | `{ data: FaqItemEntity[] }` (all rows) |
| POST   | `/api/admin/faq`                         | Admin | `CreateFaqItemDto`                            | `{ data: FaqItemEntity }`              |
| PUT    | `/api/admin/faq/:id`                     | Admin | `UpdateFaqItemDto` (partial)                  | `{ data: FaqItemEntity }`              |
| DELETE | `/api/admin/faq/:id`                     | Admin | —                                             | `{ data: { id } }`                     |
| —      | `PUT /api/admin/products/:id` (existing) | Admin | extended with `metaTitle?`/`metaDescription?` | `{ data: ProductEntity }` (existing)   |

## Tasks

### TASK-239: `SeoSettings` admin singleton (foundation)

**Type:** feat
**Scope:** store-api, store-admin, store-client, shared
**Complexity:** L (4-8h, multi-layer)
**TDD Required:** No (settings CRUD, not cart/discount/inventory/auth) — repository/service still
unit-tested per the existing `SiteContactRepository`/`SiteContactService` spec convention.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `SeoSettings` Prisma model added exactly as specified in Technical Design; migration
      generated via `npx prisma migrate dev --name add_seo_settings -w apps/store-api`
- [ ] `SeoSettingsRepository` (`findSettings()`/`upsertSettings()`) with its own
      `SINGLETON_ID = '00000000-0000-0000-0000-000000000002'`, mirroring
      `SiteContactRepository` 1:1; unit specs for both methods
- [ ] `SeoSettingsService.getSettings()` returns `SeoSettingsEntity.empty()` (all nullable fields
      null, `noindexSite: false`, `additionalSameAsLinks: []`) when unseeded — public GET never
      404s; `updateSettings()` upserts **and** calls
      `this.revalidation.revalidate({ tags: ['seo-settings'] })` (closes gap 5 for this module)
- [ ] `titleTemplate` write validated server-side: when provided and non-empty, must contain
      exactly one `%s` token (`@Matches(/^[^%]*%s[^%]*$/)` or equivalent) — 400 otherwise
- [ ] `SeoSettingsController` (`GET /api/seo-settings`, public) + `AdminSeoSettingsController`
      (`PUT /api/admin/seo-settings`, `@UseGuards(AdminGuard)`) + `UpdateSeoSettingsDto` (all
      fields optional) + `SeoSettingsEntity` (decorated, `fromPrisma`/`empty` statics) +
      `SeoSettingsModule` registered in `app.module.ts`
- [ ] Seed: `seedSeoSettings(prisma)` upserts sensible zero-config defaults —
      `defaultMetaTitle: null` (let content-derived fallback handle it),
      `defaultMetaDescription`: a generic one-liner about the store, `titleTemplate: null`
      (use code default), `noindexSite: false`, `additionalSameAsLinks: []`; idempotent, called
      from `seed.ts main()`
- [ ] Orval regen (`npm run generate:api` in both store-admin and store-client) produces
      `SeoSettingsEntity`/`UpdateSeoSettingsDto` models + `useSeoSettingsControllerGetSettings` /
      `useAdminSeoSettingsControllerUpdate` hooks; both apps typecheck clean
- [ ] Admin UI: `entities/seo-settings`, `features/seo-settings-form` (RHF + zod, forms.md Rule 2b
      reset keyed to the constant singleton id — same pattern as `site-contact-form.tsx`),
      `widgets/seo-settings-view`, route `/settings/seo` + `loading.tsx`; nav entry added
      (`dict.nav.seoSettings` → `/settings/seo`, `Search` icon)
- [ ] Every field has a `dict.seoSettingsForm.xHint` plain-UA explainer, e.g.
      `titleTemplateHint: "Шаблон заголовка сторінки. %s буде замінено на назву конкретної
    сторінки. Залиште порожнім — і будемо використовувати назву магазину."`
- [ ] `additionalSameAsLinks` rendered as one `<Textarea>` (one URL per line); zod splits/trims/
      drops blanks/validates each as a URL (Decision 4)
- [ ] `npm run build`/`lint`/`typecheck` clean across all three workspaces
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `SeoSettings` model
- `apps/store-api/src/seo-settings/{seo-settings.repository,seo-settings.service,seo-settings.controller,admin-seo-settings.controller,seo-settings.module}.ts` + `entities/`, `dto/`, `index.ts` (mirrors `site-contact/`)
- `apps/store-api/prisma/seed.ts` — `seedSeoSettings`
- `apps/store-api/src/app.module.ts` — register `SeoSettingsModule`
- `apps/store-admin/src/entities/seo-settings/index.ts`
- `apps/store-admin/src/features/seo-settings-form/{model/seo-settings-schema.ts,ui/seo-settings-form.tsx,index.ts}`
- `apps/store-admin/src/widgets/seo-settings-view/ui/seo-settings-view.tsx`
- `apps/store-admin/src/app/(dashboard)/settings/seo/{page.tsx,loading.tsx}`
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — nav entry
- `apps/store-admin/src/shared/config/dictionary.ts` — `nav.seoSettings`, `seoSettings`, `seoSettingsForm` namespaces incl. hints
- `apps/store-admin/src/shared/api/generated/` + `apps/store-client/src/shared/api/generated/` — regenerated

---

### TASK-240: `resolveSeo()` auto-SEO helper + wiring (zero-config layer)

**Type:** feat
**Scope:** store-client, shared
**Complexity:** L (4-8h)
**TDD Required:** No — unit-tested regardless (pure function, high-value coverage)
**Depends on:** TASK-239 (needs `SeoSettings` to exist for tier 2 of the chain)

**Acceptance Criteria:**

- [ ] `resolveSeo(input)` in `shared/lib/seo/resolveSeo.ts` implements the precedence chain from
      Decision 2: entity `metaTitle`/`metaDescription` → `SeoSettings` defaults
      (`defaultMetaTitle`/`defaultMetaDescription`, `titleTemplate` applied when the entity has no
      own title) → content-derived fallback (built from `name`/`description`/`brand`/`category`,
      truncated to ~60 chars title / ~155 chars description at a word boundary, HTML/markdown
      stripped)
- [ ] Unit tests cover all three tiers independently and the fallthrough order (entity meta wins
      even when `SeoSettings` and content are both present; content-derived only fires when both
      higher tiers are absent)
- [ ] `shared/api/seo-settings-server.ts` — ISR-tagged fetch (`next: { tags: ['seo-settings'] }`),
      returns `null` on any error, mirrors `site-contact-server.ts`
- [ ] `app/layout.tsx` root metadata: `title.template` uses `SeoSettings.titleTemplate` when set
      (validated to contain `%s`), else the current `%s | ${SITE_NAME}`; `description` uses
      `SeoSettings.defaultMetaDescription` when set, else the current `dict.meta.rootDescription`
      (kept as fallback, not removed); `openGraph.images` seeded from `SeoSettings.defaultOgImage`
      when set
- [ ] Homepage `<title>` verified to resolve to `"{title} | {SITE_NAME}"` in a prod build (closes
      gap 3 / the geo-audit "Головна" finding) — if the template genuinely fails to apply to a
      plain-string page title under Next 16, the page sets an explicit
      `title: { absolute: resolveSeo(...).title }` instead; either way the rendered `<title>`
      includes the brand
- [ ] `app/products/page.tsx generateMetadata`: when `?categoryId=` is present, fetches the
      category and resolves its meta via `resolveSeo()` (entity `Category.metaTitle`/
      `metaDescription` → SeoSettings defaults → `"{category.name} — купити в {SITE_NAME}"`
      fallback) — **closes gap 1**, the schema.prisma "deferred to Phase D" comment is updated to
      point at this task instead of "Phase D"
- [ ] `app/robots.ts` becomes `async`, fetches `SeoSettings` (same tagged pattern), and when
      `noindexSite` is `true` emits `{ rules: { userAgent: '*', disallow: '/' } }` (no sitemap
      link) instead of the current allow-all rules; falls back to today's rules on fetch failure
- [ ] `app/llms.txt/route.ts` fetches `SeoSettings` (tagged `next: { tags: ['seo-settings'] }`,
      replacing `force-static`) and substitutes `llmsTxtSummary` for the intro blockquote when set;
      keeps the current curated paragraph as the fallback; rest of the document unchanged
      (Decision 5)
- [ ] `npm run build`/`lint`/`typecheck` clean; `npm run test -w apps/store-client` green
      (new `resolveSeo.test.ts` + updated route/page tests)

**Files to create/modify:**

- `apps/store-client/src/shared/lib/seo/{resolveSeo.ts,resolveSeo.test.ts,index.ts}`
- `apps/store-client/src/shared/api/seo-settings-server.ts`
- `apps/store-client/src/app/layout.tsx`
- `apps/store-client/src/app/page.tsx`
- `apps/store-client/src/app/products/page.tsx`
- `apps/store-client/src/app/robots.ts`
- `apps/store-client/src/app/llms.txt/route.ts`
- `apps/store-api/prisma/schema.prisma` — update the Category comment (gap 1 closure note)

---

### TASK-241: Product-level SEO meta

**Type:** feat
**Scope:** store-api, store-admin, store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-240 (PDP wiring consumes `resolveSeo()`)

**Acceptance Criteria:**

- [ ] `Product.metaTitle`/`metaDescription` columns added (mirrors Category/Page exactly,
      `@map("meta_title")`/`@map("meta_description")`); migration
      `npx prisma migrate dev --name add_product_seo_meta -w apps/store-api`
- [ ] `CreateProductDto`/`UpdateProductDto` — optional `metaTitle` (`@MaxLength(255)`),
      `metaDescription` (`@MaxLength(500)`) — same limits as `PageSchema`/`CategorySchema`
- [ ] Admin `ProductEntity` and storefront `PublicProductEntity` both expose the two fields
      (`@ApiProperty({ nullable: true, required: false })`)
- [ ] Repository/service pass the fields through untouched (no business logic — same shape as
      `description`)
- [ ] Orval regen — both apps typecheck clean
- [ ] Admin `product-form.tsx` gets two new fields (`Input` for title, `Textarea` for description)
      placed after `description`, before the `active` checkbox — same layout convention as
      `category-form.tsx:229-260` — with `dict.productForm.metaTitleHint`/`metaDescriptionHint`
      plain-UA explainers (e.g. _"Залиште порожнім — заголовок для пошукових систем згенерується
      автоматично з назви товару."_)
- [ ] PDP `generateMetadata` (`app/products/[slug]/page.tsx`) replaced with
      `resolveSeo({ entityTitle: product.metaTitle, entityDescription: product.metaDescription,
    fallback: { name: product.name, description: product.description, brand: brandName } })` —
      entity meta wins, else `SeoSettings` defaults, else the current
      `dict.meta.productFallbackDescription`-based derivation (kept as the innermost fallback)
- [ ] Admin RTL test: fields render, submit includes trimmed values, blank submits `undefined`
      (omitted, not empty string) per the existing category-form mapper convention
- [ ] `npm run build`/`lint`/`typecheck` clean; `npm run test -w apps/store-api` +
      `npm run test -w apps/store-admin` + `npm run test -w apps/store-client` green

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `Product.metaTitle`/`metaDescription`
- `apps/store-api/src/product/dto/{create-product.dto,update-product.dto}.ts`
- `apps/store-api/src/product/entities/{product.entity,public-product.entity}.ts`
- `apps/store-admin/src/features/product-form/{model/product-schema.ts,ui/product-form.tsx}`
- `apps/store-admin/src/shared/config/dictionary.ts` — `productForm.metaTitle*`/`metaDescription*` + hints
- `apps/store-client/src/app/products/[slug]/page.tsx`

---

### TASK-242: `FAQPage` schema + admin-editable global FAQ

**Type:** feat
**Scope:** store-api, store-admin, store-client
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-239 (shares the `RevalidationNotifier`/tagged-fetch plumbing pattern; not a
hard schema dependency, safe to build in parallel once TASK-239's module skeleton exists as a
reference)

**Acceptance Criteria:**

- [ ] `FaqItem` Prisma model added exactly as specified; migration
      `npx prisma migrate dev --name add_faq_items -w apps/store-api`
- [ ] Seed: the 6 existing `INFO_FAQS` entries (`apps/store-client/.../info-content.ts`) are
      migrated into the seed as the initial `FaqItem` rows (same Q&A text, `sortOrder` 0-5,
      `isActive: true`), so the admin sees real content on first load instead of an empty list
- [ ] `FaqRepository`/`FaqService` (CRUD + list-all-active-ordered) mirroring the `Brand` module's
      simple-CRUD shape; unit specs for repository and service
- [ ] `FaqController` (`GET /api/faq` — public, active rows ordered by `sortOrder`) +
      `AdminFaqController` (`GET /api/admin/faq` all rows, `POST`, `PUT /:id`, `DELETE /:id`,
      `@UseGuards(AdminGuard)`) + `CreateFaqItemDto`/`UpdateFaqItemDto` + `FaqItemEntity` +
      `FaqModule` registered in `app.module.ts`; every write calls
      `this.revalidation.revalidate({ tags: ['faq'] })`
- [ ] Orval regen — both apps typecheck clean
- [ ] `shared/lib/schema/buildFaqPageSchema.ts` — pure builder,
      `{ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } }] }`;
      unit tested
- [ ] Admin UI: `entities/faq`, `features/faq-form` (question `Input`, answer `Textarea`,
      `sortOrder` number input, `isActive` checkbox — same shape as other admin forms),
      `widgets/faq-list` (ordered list + edit/delete, mirrors the `Brand` or `AttributeDefinition`
      admin list), routes `/faq`, `/faq/new`, `/faq/[id]/edit`; nav entry
      (`dict.nav.faq` → `/faq`, `HelpCircle` icon)
- [ ] `app/info/page.tsx` + `widgets/info-support`: FAQ section now renders from
      `GET /api/faq` (ISR-tagged `fetch`, tag `faq`) instead of the static `INFO_FAQS` import;
      `INFO_FAQS` is **kept** as the fallback constant when the API call fails (never a blank FAQ
      section)
- [ ] `<JsonLd schema={buildFaqPageSchema(faqs)} />` emitted on `/info`
- [ ] PDP gets a small FAQ block (reusing the same global list, or a curated top-N subset — build
      agent's call, document the choice in the PR) + its own `FAQPage` JSON-LD
- [ ] `npm run build`/`lint`/`typecheck` clean; e2e spec for admin FAQ CRUD +
      RTL test for the admin FAQ list + unit test for `buildFaqPageSchema`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `FaqItem` model
- `apps/store-api/src/faq/{faq.repository,faq.service,faq.controller,admin-faq.controller,faq.module}.ts` + `entities/`, `dto/`, `index.ts`
- `apps/store-api/prisma/seed.ts` — seed the 6 migrated FAQ rows
- `apps/store-api/src/app.module.ts` — register `FaqModule`
- `apps/store-client/src/shared/lib/schema/{buildFaqPageSchema.ts,index.ts}`
- `apps/store-client/src/shared/api/faq-server.ts`
- `apps/store-client/src/widgets/info-support/model/info-content.ts` — keep `INFO_FAQS` as fallback
- `apps/store-client/src/app/info/page.tsx`
- `apps/store-client/src/app/products/[slug]/page.tsx` + PDP widget — FAQ block
- `apps/store-admin/src/entities/faq/index.ts`
- `apps/store-admin/src/features/faq-form/{model/faq-schema.ts,ui/faq-form.tsx,index.ts}`
- `apps/store-admin/src/widgets/faq-list/ui/faq-list.tsx`
- `apps/store-admin/src/app/(dashboard)/faq/{page.tsx,new/page.tsx,[id]/edit/page.tsx}`
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — nav entry
- `apps/store-admin/src/shared/config/dictionary.ts` — `nav.faq`, `faq`, `faqForm` namespaces

---

### TASK-243: Admin onboarding guide — catalog & commerce sections

**Type:** docs
**Scope:** shared (docs)
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** — (pure documentation of already-shipped admin features; does not block or get
blocked by TASK-239…242)

> **Flagged: needed BEFORE any deploy — even a dev/staging deploy.** The owner (non-technical)
> must be able to operate the admin panel unassisted from day one.

**Acceptance Criteria:**

- [ ] `docs/admin-guide.md` created (or `docs/onboarding/` if the build agent finds a
      multi-file split clearer — single-file is the default recommendation for a first pass)
- [ ] Intro section: who this is for (owner + future non-technical employees), how to log in,
      where to get help, a short glossary (SEO, meta title/description, isActive vs deletedAt in
      plain language, "чернетка/заплановано/опубліковано" for publish status)
- [ ] One section per area below, each with: **what it does**, **how to do the 2-3 most common
      tasks** (numbered steps, plain UA), **a `[СКРІНШОТ: ...]` placeholder** per major screen, and
      a **"Типові помилки" (gotchas)** callout:
  - Товари (products) — create/edit, images, price vs compareAtPrice, stock, isActive vs delete
  - Категорії (categories) — tree/parent, sortOrder, SEO fields (from TASK-240's now-wired
    Category meta)
  - Групи товарів (product-groups) — what a "group" is (variants/siblings), axes
  - Бренди (brands) — CRUD, linking to products
  - Пристрої (device brands/models) — the compatibility taxonomy, how it differs from Бренди
  - Структуровані характеристики (structured specs) — per-category attribute definitions
  - Замовлення (orders) — statuses, cancel/revive, stock guard behavior
  - Користувачі (users) — roles, ban/deactivate vs delete
  - Знижки (discounts) — coupon types, redemption limits
- [ ] Cross-references the relevant BACKLOG task IDs / plan files so a future contributor can find
      the implementation detail behind any described behavior
- [ ] Linked from `AGENTS.md` §Useful Context Files (one new bullet)
- [ ] Reviewed for plain language — no unexplained jargon (a term used once must be defined once)

**Files to create/modify:**

- `docs/admin-guide.md` (new)
- `AGENTS.md` — add the new doc to §Useful Context Files

---

### TASK-244: Admin onboarding guide — content/CRM, SEO & dashboard sections

**Type:** docs
**Scope:** shared (docs)
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-239, TASK-241, TASK-242 (the SEO-settings and FAQ sections need the real
shipped UI to document accurately — draft against the plan in the meantime and correct fields
post-ship if it lands first)

> Same "before any deploy" urgency as TASK-243; split from it purely for atomicity (one sitting
> per task) — both are part of the single onboarding-guide deliverable.

**Acceptance Criteria:**

- [ ] Continues `docs/admin-guide.md` (same file/structure as TASK-243) with one section each for:
  - Сторінки (pages) — draft/schedule/publish, rich-text editor basics, sanitization note
  - Блог (blog + blog categories) — same publish lifecycle, featured post, reading time
  - Банери (banners) — placements explained (hero/tile/promo/announcement), what happens when a
    slot is empty (static fallback)
  - Повідомлення (contact messages) — inbox, unread badge, no reply-from-admin capability (note
    this limitation explicitly)
  - Підписники (newsletter subscribers) — list, CSV export
  - Контакти (site-contact settings) — phone/email/hours/social; how it feeds the footer AND the
    Organization `sameAs` schema (plain-language: "це показує пошуковим системам, що це офіційні
    сторінки вашого магазину")
  - **SEO-налаштування (new, TASK-239)** — every field explained in owner language: what a "meta
    title/description" is, why the title template matters, what "noindex" does and **why to
    leave it off in production** (a big warning callout — flipping it hides the whole site from
    Google), what the FAQ feeds, what `llms.txt` is ("файл для AI-асистентів на кшталт ChatGPT")
  - **FAQ (new, TASK-242)** — how to add/reorder/deactivate a question, where it's shown
  - Дашборд (dashboard) — what each widget/metric means (AOV, low-stock, "потребує дії"), what to
    check daily/weekly
- [ ] A final "Порядок дій перед запуском" (pre-launch checklist) section: seed default
      SEO/contact/FAQ content, verify site-wide `noindex` is OFF, verify `SITE_URL`/env vars, spot
      check one product/category/page's rendered `<title>`
- [ ] Same gotchas/screenshot-placeholder/jargon-defined bar as TASK-243
- [ ] `docs/admin-guide.md` is now a complete, self-contained cover-to-cover guide (TASK-243 +
      TASK-244 sections read as one document, consistent tone/structure)

**Files to create/modify:**

- `docs/admin-guide.md` (continued from TASK-243)

## Sequencing / Implementation Order

```
TASK-239 (SeoSettings foundation)
    |
TASK-240 (resolveSeo() + wiring — depends on 239 for tier-2 defaults)
    |
    +-- TASK-241 (Product SEO meta — PDP wiring needs resolveSeo())
    |
    +-- TASK-242 (FAQPage + admin FAQ — parallel-safe with 241; only shares
    |             the revalidation/tagged-fetch pattern with 239, not a hard
    |             schema dependency)

TASK-243 (onboarding, catalog & commerce) -- parallel-safe with everything above
    |
TASK-244 (onboarding, content/CRM + SEO + dashboard) -- best sequenced AFTER
          239/241/242 ship so the SEO-settings/FAQ sections describe the real
          shipped UI, not the plan
```

- **Foundation first:** TASK-239 then TASK-240 — every other SEO task reads from `SeoSettings`
  or `resolveSeo()`.
- **Parallel-safe:** TASK-241 and TASK-242 can run concurrently once TASK-240 lands (241 needs
  `resolveSeo()`; 242 only borrows the module-skeleton pattern, not a schema dependency on 239/240).
- **Onboarding runs independently:** TASK-243 can start any time (documents already-shipped
  features) and must land before any deploy per the brief. TASK-244 is best done last so its
  SEO/FAQ sections are accurate, but is not a hard blocker on the others — a draft-then-fix
  approach is acceptable if time pressure requires shipping the guide early.

## Risks & Mitigations

| Risk                                                                                         | Mitigation                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `titleTemplate` without a `%s` token silently breaks every page title                        | Server-side validation rejects the write (400) if `%s` is missing when the field is non-empty                                                                           |
| `noindexSite` accidentally left `true` in production hides the entire site from Google       | Seed default is `false`; TASK-244's onboarding doc carries an explicit warning callout; TASK-244's pre-launch checklist has an explicit "verify noindex is OFF" step    |
| Content-derived fallback titles/descriptions read as generic/spammy                          | Truncation + word-boundary trimming in `resolveSeo()`; unit tests assert readable output for short/long/missing inputs                                                  |
| FAQ content duplicated between `/info` and PDP drifts if not the same data source            | Both surfaces read the same `GET /api/faq` list (or a stable slice of it) — single source of truth, no copy-paste                                                       |
| Migrating `INFO_FAQS` into seed data introduces a text mismatch with the current static copy | Seed task explicitly requires verbatim copy of the existing 6 Q&A pairs                                                                                                 |
| Onboarding doc goes stale as admin features evolve                                           | Cross-references BACKLOG task IDs / plan files so future changes have an obvious doc to update; not a blocking gate on future tasks, just a strong convention to follow |

## Notes

- Cross-reference: `apps/store-api/prisma/schema.prisma:117-118`'s "deferred to Phase D" comment
  on `Category.metaTitle`/`metaDescription` is the origin of gap 1 — TASK-240-D is that deferred
  work, finally scheduled.
- Cross-reference: BACKLOG `TASK-184` (⬜, still open — "admin sidebar dead `Settings` link →
  `/settings/contact`") touches the same `bottomNavItems` array this plan extends twice (SEO
  settings + FAQ). Whoever picks up TASK-184 may want to fold `/settings/contact` + `/settings/seo`
  under one `/settings` hub page instead of two flat sidebar entries — left as that task's call,
  not redefined here.
- Cross-reference: `docs/geo-audit-report.md` "Medium" and "Quick Wins" sections are the direct
  source of the FAQPage (TASK-242) and homepage-title (TASK-240-C) items; this plan is the
  "planned" follow-through the audit report already points at.
- Cross-reference: `docs/plans/104-publishing-foundation.md` (or equivalent — the `PublishablePort`/
  `RevalidationNotifier` plan) is the pattern TASK-239/242 wire into from day one, unlike the
  pre-existing `SiteContactSettings` gap (gap 5).
- The `BlogPost` meta-override gap (gap 6) and the `SiteContactSettings` revalidation gap (gap 5)
  are both **noted, not scheduled** — flag as candidate follow-up tasks the next time this area is
  revisited, but do not block this plan's six tasks.
