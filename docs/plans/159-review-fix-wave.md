# Plan 159 — 2026-07-13 review fix wave: store logo, carousel placement, category withdrawal + code-review fixes

> **Status:** ✅ Done (shipped 2026-07-13 across `store-api` / `store-client` / `store-admin`; live-stack checks → manual QA)
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog) + follow-ups of `docs/reviews/2026-07-13-full-project-review.md`
> **Created:** 2026-07-13
> **Last Updated:** 2026-07-13
> **BACKLOG tasks:** TASK-288, TASK-289, TASK-297, TASK-298, TASK-299 (store logo — new), TASK-300 (backend/security review fixes — new), TASK-301 (frontend review fixes — new)
> **Source review:** `docs/reviews/2026-07-13-full-project-review.md` (four independent read-only reviews; CRITICAL findings re-verified against code)

## Overview

This plan records one coordinated wave of work run by parallel build agents in a single working
tree on `develop`. It bundles three feature strands the owner approved plus the code-defect
findings from the full-project review of 2026-07-13. Everything below is **already implemented and
tested** — this document is the decision record and task breakdown, not a forward-looking spec.

The three feature strands:

1. **Store logo** (TASK-299) — admin uploads one logo file (SVG or raster), stored as
   `SeoSettings.logoUrl`, rendered through a shared `<Logo/>` in the storefront header/footer and
   the admin sidebar, and emitted in the `Organization` JSON-LD.
2. **Carousel placement** (TASK-288) — the homepage «Популярне» tabs stop being three hardcoded
   source-enum tabs and are fed by admin-managed carousels tagged `placement=HOME_TABS`; the
   recommendation rails below are the `HOME_RAILS` bucket.
3. **Category withdrawal from sale** (TASK-297) — `isActive: false` on a `Category` now means
   «зняти з продажу», enforced on every public read/write path (listing, PDP, search, cart, order,
   wishlist), not merely «hide from nav».

Plus the review-fix strands: attribute-definition reorder migrated to the shared `common/reorder`
primitive (TASK-298), category tiles via `next/image` (TASK-289), and the batch of backend/security
(TASK-300) and frontend (TASK-301) defects from the review.

## Owner decisions (FINAL, 2026-07-13)

### (a) `isActive: false` on a category = WITHDRAW FROM SALE

The review found two CRITICAL access-control gaps (C1, C2): a deactivated category was still
reachable by direct slug and still leaked through the unfiltered `GET /api/categories`, and its
products stayed listable and addable to a cart. The owner's resolution: a deactivated category is
**withdrawn from sale**, not just hidden from the navigation. Concretely, on every public read the
category and its products disappear; a product from a deactivated category cannot be added to a
cart nor checked out.

**NO CASCADE onto descendants** (consistent with the TASK-293 bulk-status decision): the filters
look at a product's **own** category, not its ancestor chain. Deactivating a parent removes that
branch from the storefront nav (`findCategoryTree` filters `isActive` at every level), but an
**active** sub-category under a deactivated parent keeps selling. If the owner later wants
withdrawal to inherit down the tree, that is a separate decision (per-row cascade write, or an
ancestor-aware recursive-CTE filter) — recorded here, not silently assumed.

### (b) «Популярне» tabs stay, but are fed by `HOME_TABS` carousels

The three tabs (Хіти / Новинки / Акційні) map 1:1 onto the BESTSELLING / NEWEST / ON_SALE carousel
sources. Rather than delete the tabs, they are now **admin-managed**: each published carousel with
`placement=HOME_TABS` becomes a tab (label = carousel title, contents = the products the server
already resolved). The recommendation rails below the tabs are the `HOME_RAILS` bucket.

**Fallback = «як раніше», not «disappear».** If no `HOME_TABS` carousel exists (or the API is
briefly unreachable and returns `[]`), the rail renders the legacy three tabs via
`useProductControllerFindAll`. The «Популярне» section is core product-discovery on the homepage —
hiding it on a transient API blip would wipe half the homepage. So there is never an empty hole:
worst case the tabs run in the legacy source-enum mode (now with a server-side `onSale=true` filter
instead of the old client-side `isOnSale()` sweep).

### (c) Store logo — one file, no dark variant

- **One logo file only.** No separate light/dark variant. The single logo must read on both the
  light header/footer and the dark admin sidebar; the owner accepts a single mark.
- **Storage:** `SeoSettings.logoUrl` (nullable). The logo is written **only** through dedicated
  multipart routes (`POST`/`DELETE /api/admin/seo-settings/logo`) — `logoUrl` is deliberately
  **NOT** a field of `UpdateSeoSettingsDto`, so an admin cannot paste an arbitrary URL and bypass
  the upload/sanitize pipeline.
- **Shared `<Logo/>`** in the storefront header (brand link + mobile `SheetTitle`), footer, and a
  shared `AdminBrandMark` in the admin sidebar rail + mobile drawer. The monogram/wordmark fallback
  is derived from `SITE_NAME` — the hardcoded «M»/«MobileStore» is gone from header/footer.
- **Organization JSON-LD** emits `logo` as an absolute URL (relative paths resolve against
  `siteUrl`, omitted when empty).

## SVG logo security model

An admin-uploaded SVG is executable XML and a classic stored-XSS vector. The pipeline defends it on
write and on serve:

**On write** (`StoreLogoService`, `apps/store-api/src/seo-settings/store-logo.service.ts`):

1. **MIME gate** — Multer `fileFilter` rejects anything outside `ALLOWED_LOGO_MIME`
   (`image/svg+xml` + the raster set) before a byte hits disk.
2. **Size gate** — hard 1 MB (`MAX_LOGO_BYTES`) → 413; Multer's own ceiling is 5 MB
   (`LOGO_MULTER_MAX_BYTES`).
3. **Format-truth gate** — for raster uploads, `ImageProcessor.detectFormat(buffer)` reads the real
   format from the bytes via `sharp().metadata()` (not the client `Content-Type`) → 415 if the
   bytes lie. Raster is always re-encoded to WebP by `sharp` (which would itself reject a
   non-image).
4. **SVG sanitization** — SVG runs through a bespoke allow-list (`sanitizeSvg`,
   `apps/store-api/src/storage/sanitize-svg.ts`) built on `sanitize-html`: strips `<script>`,
   `on*=` handlers, `javascript:`/`xlink:href` script URIs, `<foreignObject>`, `<style>@import`,
   external `<image href>`, `<animate>`, `url(http://…)` fills, and `<!ENTITY>` (XXE). Because SVG
   is case-sensitive XML while `sanitize-html` parses HTML (and lowercases tags — which would kill
   `viewBox`/`linearGradient`), the parser is configured case-preserving and a custom
   `transformTags['*']` canonicalizes names so `<SCRIPT>`/`OnLoAd=` still collapse to blocked
   lowercase names. The output is re-checked structurally (`isRenderableSvg`) — an empty-after-sanitize
   file → 400.

**On serve** (`app.module.ts` ServeStatic `setHeaders` for `/uploads`):
`X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'; style-src
'unsafe-inline'; sandbox`. The logo renders via `<img src>` (unaffected by `sandbox`); an attempt to
embed it via `<object>`/`<iframe>` would be sandboxed.

The logo lands at `<UPLOAD_DEST>/branding/<uuid>.svg` (or `.webp` for raster), served at
`/uploads/branding/…`. The storage `save(buffer, ext, subdir)` third argument (`StorageSubdir =
'products' | 'branding'`) is now mandatory and the `delete()` path-traversal guard was hardened
(whitelist first segment + `subdirRoot + sep` containment, closing the sibling-`uploads-evil`
prefix hole).

## Scope

### In Scope

- `store-api` — `seo-settings` logo module (upload/delete + entity `logoUrl` + repository input);
  `storage` subdir parametrization + SVG sanitize + raster format-sniff; `carousels` `placement`
  field + public/admin `?placement=` filter; `category`/`product`/`search`/`cart`/`order`/`wishlist`
  category-`isActive` enforcement; `attribute-definition` reorder → `reorderBucket`; `discount`
  atomic redeem + boolean DTO; `csrf` fail-fast + wishlist coverage; `config` env validation;
  `prisma/seed.ts` prod-seed guard + `placement` seeding + single admin.
- `store-client` — shared `<Logo/>`; header/footer/layout/Organization-schema wiring; PopularRail
  fed by `HOME_TABS` carousels + `HOME_RAILS` rails; `carousels-server` grouping; category tiles via
  `next/image` + host allowlist + security headers; refresh via Orval; Sentry in sitemap /
  merchant-feed / indexnow; logo `failedUrl` render-time guard.
- `store-admin` — `SingleImageUpload` shared primitive + `store-logo-upload` feature +
  `AdminBrandMark`; carousel-form `placement` select + list column; security headers; refresh via
  Orval.
- Docs (this wave): plan 159, BACKLOG rows, `docs/manual-qa-pending.md` blocks, review
  «Статус виправлень» block.

### Out of Scope

- **Category-withdrawal cascade onto descendants** — see Owner decision (a); a deliberate future
  decision, not shipped.
- **`.env*` file edits** — blocked by the Claude Code PreToolUse hook; the review's C3 (README +
  `apps/store-api/.env.example` `PORT`) and the three stale env-comment fixes (`.env.production.example`
  CSRF wording, `ALLOW_PROD_SEED`, `NEXT_PUBLIC_IMAGE_HOSTS`) remain **manual** owner edits.
- **TASK-290** (wishlist-page parity — quick-view trigger on wishlist cards + collapsible filter-drawer
  sections) — shipped 2026-07-13. Reused the grids' `hoverAction` quick-view pattern and the catalog's
  native `<details>`/`<summary>` disclosure (TASK-084); the `ProductQuickViewTrigger` prop was narrowed
  to `Pick<PublicProductEntity, "name"|"slug">` so a wishlist item (name+slug only) can feed it. Note
  the wishlist-backend edits in this wave are a separate concern — the category-`isActive` parity (TASK-297).
- **Dark logo variant**, an image-upload endpoint for `Category.image` (stays a URL input), a
  `PATCH`-only placement endpoint (placement rides the existing `PUT /api/admin/carousels/:id`), and
  a Prisma migration (schema was already changed; migration SQL is gitignored — `schema.prisma` is
  source of truth).

## Tasks

### TASK-299: Store logo (SVG/raster upload → `SeoSettings.logoUrl` → shared `<Logo/>` + JSON-LD)

**Type:** feat · **Scope:** store-api + store-client + store-admin · **Complexity:** L · **TDD Required:** No (logo not a critical-money module; SVG sanitizer is exhaustively unit-tested regardless)

**What shipped:**

- **Backend:** `StoreLogoService` + `POST`/`DELETE /api/admin/seo-settings/logo` (multipart field
  `file`, under `AdminGuard`, envelope `{ data: SeoSettingsEntity }`); `SeoSettingsEntity.logoUrl`
  now exposed on the public `GET /api/seo-settings`; storage `save(buffer, ext, subdir)`
  parametrized with a `branding` subdir + SVG sanitize + raster format-sniff; `/uploads` served with
  `nosniff` + CSP `sandbox`. `logoUrl` deliberately absent from `UpdateSeoSettingsDto`.
- **Storefront:** shared `Logo({ logoUrl, className, markClassName })` in `shared/ui`; wired into
  header brand link + mobile `SheetTitle`, footer, and `buildOrganizationSchema(siteUrl, siteName,
sameAs?, logoUrl?)`. SVG renders via plain `<img>`; allow-listed raster via `next/image`
  (`isOptimizableImageSrc` pre-check avoids a render-time throw on a non-allowlisted host).
- **Admin:** shared `SingleImageUpload` dumb primitive + `features/store-logo-upload` (Orval
  upload/delete mutations + invalidate `getSeoSettingsControllerGetSettingsQueryKey()`); shared
  `AdminBrandMark` renders the logo (or `Package` + «MobileStore» fallback) in the sidebar rail +
  mobile drawer; error map 413/415/400 → UA messages.

**Acceptance:** upload SVG/PNG/WebP in admin → header/footer/mobile-menu + admin sidebar show it,
Organization JSON-LD carries `logo`; hostile SVG stripped on write; delete reverts to wordmark; the
1 MB / MIME / format-truth gates return 413/415/400 with UA copy.

### TASK-288: PopularRail tabs fed by `HOME_TABS` carousels (+ `HOME_RAILS` rails)

**Type:** feat · **Scope:** store-api + store-client + store-admin · **Complexity:** M · **TDD Required:** No

**What shipped:**

- **Backend:** `CarouselPlacement` (`HOME_TABS` | `HOME_RAILS`) on `CarouselEntity` /
  `PublicCarouselEntity` / `CreateCarouselDto` (default `HOME_RAILS`) / `UpdateCarouselDto`; public
  `GET /api/carousels?placement=` and admin `GET /api/admin/carousels?placement=&status=`; `sortOrder`
  is now scoped per placement.
- **Storefront:** `fetchPublishedCarouselsByPlacement()` groups one `/api/carousels` call;
  `<PopularRail carousels={HOME_TABS}>` (tab = carousel title, contents = server-resolved products,
  empty carousel dropped) with the legacy-three-tabs fallback described in Owner decision (b);
  `<RecommendationCarousels carousels={HOME_RAILS}>`.
- **Admin:** carousel-form `placement` select + hint (tab order = `sortOrder`); «Місце на сайті»
  column + badge (table 5→6 columns).
- **Seed:** three `HOME_TABS` carousels (Хіти/BESTSELLING, Новинки/NEWEST, Акційні/ON_SALE, all
  `itemLimit 12`, PUBLISHED) + two `HOME_RAILS` (Чохли/CATEGORY, Редакція обирає/MANUAL); the
  `bestsellers` deterministic-id carousel moved HOME_RAILS→HOME_TABS in place.

### TASK-297: Products of an INACTIVE category are withdrawn from sale

**Type:** fix · **Scope:** store-api · **Complexity:** M · **TDD Required:** No (touched cart/order — covered by unit + e2e)

**What shipped:** per Owner decision (a). `CategoryRepository.findBySlug(slug, { activeOnly })`
(default `true`, `findUnique`→`findFirst`); public category listing forces `isActive: true`;
`ProductRepository` gained an opt-in `categoryActiveOnly` composed into `findAll` /
`findBySlugWithRelations` / `findByIdsForCards` / index reads; public `product.findAll`, the Postgres
search fallback, and search `suggest()` (Meili path re-hydrates through `findByIdsForCards`) all pass
it; cart `validateAddition` blocks a product from a deactivated category (400, before-write);
`CartItemEntity.isActive` / `WishlistItemEntity.isActive` now mean `product.isActive &&
category.isActive`; `OrderService.createOrder` rejects a line whose product **or** category is
inactive (`BadRequestException`, before repo call — closes the older deactivated-product checkout
hole too); category boolean DTO fixed (`@Transform(({ obj, key }) => obj[key])`); a category PUT that
flips `isActive` now runs `afterStatusChange` (cache evict + reindex + audit log).

### TASK-298: `attribute-definition` reorder → shared `reorderBucket`

**Type:** refactor · **Scope:** store-api · **Complexity:** S · **TDD Required:** No

**What shipped:** `AttributeDefinitionRepository.reorder` moved off the naive
`$transaction([...updateMany])` onto `common/reorder`'s `reorderBucket` (advisory-lock on the
`categoryId` bucket + `assertFlatReorder` + refreshed list in one transaction); `create` now APPENDs
at `max+1` under the same lock. `PATCH /api/categories/:categoryId/attribute-definitions/reorder` now
requires the **full** ordered id list: incomplete → 409 `REORDER_STALE`, duplicate → 400
`REORDER_DUPLICATE_ID`, foreign id → 404 `REORDER_NOT_FOUND` (body unchanged, admin already sends the
full list — no regression).

### TASK-289: Category tiles via `next/image`

**Type:** feat · **Scope:** store-client · **Complexity:** S · **TDD Required:** No

**What shipped:** `shared/ui/category-tile-image.tsx` swapped plain `<img>`→`next/image`;
`next.config.ts` `images.remotePatterns` gains an env-driven host allowlist
(`NEXT_PUBLIC_IMAGE_HOSTS`, comma-separated bare https hostnames, exact match, wildcards refused as
an SSRF vector); new `isOptimizableImageSrc()` pre-check keeps a non-allowlisted admin-pasted
`Category.image` from throwing at render; icon/gradient fallback preserved.

### TASK-300: Backend / security code-review fixes (batch)

**Type:** fix · **Scope:** store-api · **Complexity:** M · **TDD Required:** Yes for the discount redeem (money path)

Groups the backend findings of `docs/reviews/2026-07-13-full-project-review.md` not owned by the
tasks above:

- **W1 — CSRF on wishlist.** `app.use('/api/wishlist', csrfService.protect)` (mirrors cart).
- **W4 — TOCTOU in discount redeem (TDD).** `incrementRedeemed` → `tryIncrementRedeemed(id, tx?):
Promise<number>` (conditional `updateMany` with `redeemedCount < maxRedemptions`, `count===0` →
  `MAX_REDEMPTIONS_REACHED`); the row-lock also fixes the `perUserLimit` race by ordering
  claim→count→insert. `redeem()` now goes only through the repository (also fixed a layer
  violation). Int-test with two parallel `$transaction`s.
- **W5 — boolean DTO (discount).** `discount-list-query.dto.ts` → `@Transform(({ obj, key }) =>
obj[key])` (the category DTO is fixed under TASK-297).
- **W2 — prod-seed guard.** `assertSeedAllowed()` throws under `NODE_ENV=production` without
  `ALLOW_PROD_SEED=true` (and requires `ADMIN_SEED_*`); removed the hardcoded second admin
  `manager@store.com`; one env-driven admin.
- **W3 — `CSRF_SECRET` fail-fast + JWT distinctness.** `CsrfService` throws in production when the
  secret is absent/<32; `validateEnv()` requires `CSRF_SECRET` in production and rejects
  `JWT_SECRET === JWT_REFRESH_SECRET`.
- **SUGGESTION — GIF magic-byte.** The GIF branch of `product-image.service.ts` now sniffs the
  buffer via `ImageProcessor.detectFormat` → 415 if the bytes are not a real GIF (all other formats
  already went through `sharp`).
- **SUGGESTION — N+1 in reviews.** `ReviewRepository.findVerifiedPurchaserIds(productId, userIds):
Promise<Set<string>>` batches the verified-purchase badge in `getApprovedReviews` (one
  `order.findMany` + `distinct` instead of `Promise.all` per review; predicate identical).

### TASK-301: Frontend code-review fixes (batch)

**Type:** fix · **Scope:** store-client + store-admin · **Complexity:** S · **TDD Required:** No

- **W8 — security headers.** Both `next.config.ts` add `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options` (`SAMEORIGIN` storefront,
  `DENY` admin) on `/:path*`. CSP deliberately deferred (needs a nonce middleware — Next injects
  inline styles/scripts whose hashes we don't control).
- **W6 — widget import cycle.** `ProductImageGallery` + `ProductStockIndicator` moved
  `widgets/product-detail` → `entities/product/ui`; both `product-detail` and `product-quick-view`
  now import them downward from `@/entities/product`, breaking the real bidirectional cycle. New
  arch-guard test `product-quick-view/ui/import-boundaries.test.ts`.
- **W7 — refresh via Orval.** `auth.context.tsx` in both apps replaced the raw
  `api.post("/api/auth/refresh")` with `authControllerRefresh()` (note: `customInstance` unwraps one
  axios level → `envelope.data?.accessToken`).
- **SUGGESTION — Sentry in server routes.** `app/sitemap.ts`, `app/merchant-feed.xml/route.ts`,
  `shared/lib/seo/indexnow.ts` now `Sentry.captureException`/`captureMessage` on failures (Node
  runtime does not auto-capture). Bonus: `Logo` tracks `failedUrl` (render-time) so a newly uploaded
  logo isn't masked by a prior `onError`.

## Data Model

No migration authored (schema already carried `SeoSettings.logoUrl` and `Carousel.placement`;
migration SQL is gitignored, `schema.prisma` is source of truth). Fields in play:

- `SeoSettings.logoUrl String?` — written only via the logo upload/delete routes.
- `Carousel.placement CarouselPlacement` (`HOME_TABS` | `HOME_RAILS`, default `HOME_RAILS`);
  `sortOrder` scoped per placement.

## API Contract

| Method   | Path                                                        | Body                                   | Response                                                                     |
| -------- | ----------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| POST     | `/api/admin/seo-settings/logo`                              | multipart `file`                       | `{ data: SeoSettingsEntity }` (201) — 400/413/415                            |
| DELETE   | `/api/admin/seo-settings/logo`                              | —                                      | `{ data: SeoSettingsEntity }` (200)                                          |
| GET      | `/api/seo-settings`                                         | —                                      | `{ data: SeoSettingsEntity }` — now carries `logoUrl: string \| null`        |
| GET      | `/api/carousels?placement=HOME_TABS\|HOME_RAILS`            | —                                      | `{ data: PublicCarouselEntity[] }` (param optional; omitted = all published) |
| GET      | `/api/admin/carousels?placement=&status=`                   | —                                      | `{ data: CarouselEntity[] }`                                                 |
| POST/PUT | `/api/admin/carousels(/:id)`                                | `…, placement?`                        | `{ data: CarouselEntity }` (create default `HOME_RAILS`)                     |
| PATCH    | `/api/categories/:categoryId/attribute-definitions/reorder` | `{ orderedIds: string[] }` (FULL list) | `{ data: AttributeDefinitionEntity[] }` — 409/400/404 on stale/dup/foreign   |

Orval regen ran on both frontends (spec was correct on first export — no Swagger-decorator fixes
needed). Generated trees are gitignored; after any `git clean`/checkout run
`npm run swagger:export -w apps/store-api && npm run generate:api` (needs Postgres up — AppModule
connects on init).

## Migration Steps (as executed)

1. Backend bottom-up per module (schema already present → repository → service → controller).
2. Seed updated (prod guard + placement + single admin).
3. Orval regen on both frontends.
4. Frontend storefront + admin wiring.
5. Full gates per workspace (see §Test summary).
6. Docs (this plan, BACKLOG, manual-qa, review status block).

## Test summary (as run by the build agents)

- **store-api unit:** 122 suites / 1624 passed (final, post-repair).
- **store-api e2e (`--runInBand`):** the touched suites green (carousels 10/10, seo-settings-logo +
  product-images + seo-settings 39/39, security 13/13, attribute-definition-reorder 8/8, order /
  search / wishlist-guest 92/92, discount-redeem int 4/4).
- **SVG sanitizer:** `sanitize-svg.spec.ts` 22/22 (script/handler/`javascript:`/foreignObject/style
  `@import`/external image/animate/`url()`/XXE/two-root vectors).
- **store-client:** full `--runInBand` green (logo 10/10 incl. `failedUrl` recovery; product-grid
  carousel tabs; footer seo-settings mock; carousels-server grouping); typecheck + lint clean.
- **store-admin:** full `--runInBand` 91 suites / 691 passed; typecheck + lint + build clean
  (security headers verified in `routes-manifest.json`; logo upload exercises a real multipart via
  MSW).

## Manual QA (appended to `docs/manual-qa-pending.md`)

Live-stack-only checks that automated tests cannot cover: real SVG/PNG logo upload rendering in
header/footer/mobile-menu/admin sidebar + Organization JSON-LD; «Популярне» tabs re-driven after
editing `HOME_TABS` carousels in admin (+ fallback with zero carousels); category deactivation →
products vanish from listing/PDP/search and cannot be added to cart/checkout; attribute-definition
drag-reorder with two admins (409 recovery); `/uploads/branding/*.svg` served under `nosniff` + CSP
`sandbox`; tall/square logo in the 64px admin rail.

## Risks & Mitigations

| Risk                                                                   | Mitigation                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored XSS via SVG logo                                                | Server-side allow-list sanitize + structural re-check + format-truth sniff for raster; `/uploads` served `nosniff` + CSP `sandbox`; `logoUrl` not settable via the plain settings DTO |
| Deactivating a category breaks checkout of an in-flight cart line      | `OrderService.createOrder` rejects the line before any write/stock/mail — no partial order; `CartItemEntity.isActive` surfaces it in the cart UI first                                |
| Homepage «Популярне» empties if carousels misconfigured or API blips   | Legacy three-tab fallback (now server-side `onSale`) — never an empty section                                                                                                         |
| `next/image` throws on a non-allowlisted admin-pasted `Category.image` | `isOptimizableImageSrc()` pre-check falls back to the icon/gradient tile; wildcard hosts refused in the allowlist (SSRF)                                                              |
| `tryIncrementRedeemed` breaks any DiscountRepository mock              | Documented breaking change — mocks must add `tryIncrementRedeemed` (default `mockResolvedValue(1)`); order in `redeem()` is load-bearing (int-test guards it)                         |

## Notes — breaking changes & new exports for later agents

- **Storage:** `IStorageService.save(buffer, ext, subdir)` — third arg **mandatory**
  (`StorageSubdir = 'products' | 'branding'`); any `ImageProcessor` mock must add `detectFormat`.
  New exports from `../storage`: `PRODUCTS_SUBDIR`, `BRANDING_SUBDIR`, `STORAGE_SUBDIRS`,
  `StorageSubdir`, `isStorageSubdir`, `sanitizeSvg`, `ImageProcessor.detectFormat()`. From
  `../seo-settings`: `StoreLogoService`, `ALLOWED_LOGO_MIME`, `ALLOWED_LOGO_RASTER_FORMATS`,
  `MAX_LOGO_BYTES` (1 MB), `LOGO_MULTER_MAX_BYTES` (5 MB), `SVG_MIME`.
- **Discount:** `DiscountRepository.incrementRedeemed` **removed** → `tryIncrementRedeemed(id, tx?):
Promise<number>` (0 = cap reached). `findById`/`countUserRedemptions` take an optional tx.
  New export `CSRF_SECRET_MIN_LENGTH` from `src/csrf/csrf.constants.ts`.
- **Category/product:** `CategoryRepository.findBySlug(slug, { activeOnly? })` default `true` — any
  slug-uniqueness check MUST pass `{ activeOnly: false }`. `ProductRepository` `FindAllParams`
  gains `categoryActiveOnly?: boolean` (opt-in; public reads set it). `CategoryService.update(id,
input, actorId?)` gained a third arg. `CartWithItems`/`WishlistWithItems` items now require
  `product.category.isActive` (fixtures must add it). `ReviewRepository.findVerifiedPurchaserIds` is
  the new batch API; `isVerifiedPurchase` remains only for single submit.
- **Attribute-definition:** `reorder(categoryId, orderedIds)` now returns
  `Promise<AttributeDefinition[]>` and throws `common/reorder` domain errors (not HTTP);
  `findByCategoryId(categoryId, client?)` takes a tx; `create` defaults `sortOrder = max+1`.
- **Boot fail-fast:** production now requires `CSRF_SECRET` (≥32) and `JWT_SECRET !==
JWT_REFRESH_SECRET`; `prisma db seed` under `NODE_ENV=production` needs `ALLOW_PROD_SEED=true`
  (breaks any release runbook that seeds in prod until it sets the flag — intentional).
- **Storefront:** new `Logo` from `@/shared/ui`; `Header` gains `logoUrl?: string | null`;
  `buildOrganizationSchema` gains a 4th `logoUrl` arg; `ProductImageGallery`/`ProductStockIndicator`
  now live in `@/entities/product` (removed from `@/widgets/product-detail`); `PopularRail` takes
  `carousels?: PublicCarouselEntity[]` (HOME_TABS), `RecommendationCarousels` must get ONLY
  HOME_RAILS; `CategoryTileImage` gains a `sizes` prop; new env `NEXT_PUBLIC_IMAGE_HOSTS`. Any test
  rendering `Footer()` must mock `GET */api/seo-settings`.
- **Admin:** new `SingleImageUpload` (`@/shared/ui`), `@/features/store-logo-upload`,
  `AdminBrandMark` (fetches `useSeoSettingsControllerGetSettings()` in the shell — any test mounting
  `AdminShell`/`AdminSidebar`/`MobileNavDrawer` needs the `GET /api/seo-settings` handler);
  `CarouselFormInput`/`CarouselFormValues` gain a required `placement`.

## Open items (NOT shipped — require manual owner action)

The `.env*` files are blocked by the PreToolUse hook, so these stay manual (tracked in the review
«Статус виправлень» block):

- **Review C3** — `README.md` `.env` copy instructions + `apps/store-api/.env.example` `PORT`
  4000→3001; drop the `OPENCODE_GO_API_KEY` rudiment from the root env example.
- `.env.production.example` — stale wording «CsrfService warns and falls back…» is now false
  (fail-fast); should read «REQUIRED — API does not start without it».
- Add `ALLOW_PROD_SEED=true` note to the API env example; add `NEXT_PUBLIC_IMAGE_HOSTS=` (comma-sep
  bare hostnames) to the storefront env example.
- **Category-withdrawal cascade** — owner decision pending (see Owner decision (a)).
