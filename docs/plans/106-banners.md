# 106 — Homepage banners (TASK-186)

BANNERS vertical of Етап 2 (content-platform CRM). Admin-managed homepage
content: a `Banner` model with placement + publishing fields, admin CRUD, and
storefront rendering via ISR with a **static fallback** so the homepage always
renders even with zero banners or an unreachable API.

Built on the shared publishing foundation (see
[104-publishing-foundation.md](104-publishing-foundation.md)) — `PublishStatus`
lifecycle, `resolvePublishState`, `PublishablePort` + `PUBLISHABLE_REPOSITORY`
scheduler discovery, and `RevalidationNotifier`. Banners are STRUCTURED text
(title / subtitle / CTA), NOT Tiptap HTML — no `sanitizeRichText`; DTOs
validate + trim plain strings.

Status: implemented + unit-tested. store-api banner unit tests green (38);
store-admin banner tests green (14); store-client banner tests green (6);
lint + typecheck green across all three workspaces. Migration + Orval regen are
run by the orchestrator (schema.prisma is source of truth; generated hooks are
git-ignored).

---

## Schema (`schema.prisma`)

```prisma
enum BannerPlacement {
  HERO_SLIDE
  PROMO_TILE
  PROMO_BANNER
  ANNOUNCEMENT_BAR
}

model Banner {
  id               String          @id @default(uuid())
  placement        BannerPlacement
  title            String
  subtitle         String?
  imageUrl         String?         @map("image_url")
  imageBlurDataUrl String?         @map("image_blur_data_url")
  ctaLabel         String?         @map("cta_label")
  ctaHref          String?         @map("cta_href")
  theme            String?
  sortOrder        Int             @default(0) @map("sort_order")
  status           PublishStatus   @default(DRAFT)
  publishedAt      DateTime?       @map("published_at")
  scheduledAt      DateTime?       @map("scheduled_at")
  createdAt        DateTime        @default(now()) @map("created_at")
  updatedAt        DateTime        @updatedAt @map("updated_at")

  @@index([placement, status])
  @@index([status])
  @@map("banners")
}
```

No `isActive` — new content models omit the legacy mirror; `status = PUBLISHED`
is the single public-visibility gate.

## Placements

| Placement          | Storefront region                                  |
| ------------------ | -------------------------------------------------- |
| `HERO_SLIDE`       | Hero carousel slides (`hero-slider`)               |
| `PROMO_TILE`       | Promo tiles row under the hero (`promo-tiles`)     |
| `PROMO_BANNER`     | Wide promo banner near the bottom (`promo-banner`) |
| `ANNOUNCEMENT_BAR` | Slim announcement strip above the header           |

## Backend (`apps/store-api/src/banners`)

Clean-architecture module (controller → service → repository), registered in
`app.module.ts`; `'Banners'` Swagger tag added in `main.ts` + `export-swagger.ts`.

- **Repository** implements `PublishablePort`: `publishDue(now)` flips due
  SCHEDULED → PUBLISHED; `readonly revalidateTarget = { tags: ['banners'], paths: ['/'] }`.
  Registered `{ provide: PUBLISHABLE_REPOSITORY, useExisting: BannerRepository }`
  (no `multi`) — the scheduler auto-discovers it.
- **Service** uses `resolvePublishState` on create/update; preserves the original
  `publishedAt` when re-saving an already-published banner; injects
  `RevalidationNotifier` and calls `revalidate({ tags: ['banners'], paths: ['/'] })`
  after any publish / unpublish / update-of-published / delete-of-published.
- **DTOs** extend `PublishFieldsDto`; plain strings trimmed + length-validated
  (no HTML sanitization).

### Endpoints

| Method + path                            | Access | Purpose                                                                     |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `GET /api/banners`                       | public | PUBLISHED only, optional `?placement=`; ordered by placement then sortOrder |
| `GET /api/admin/banners`                 | admin  | all statuses; optional `?placement=` / `?status=`                           |
| `GET /api/admin/banners/:id`             | admin  | single banner                                                               |
| `POST /api/admin/banners`                | admin  | create                                                                      |
| `PUT /api/admin/banners/:id`             | admin  | update                                                                      |
| `PATCH /api/admin/banners/:id/publish`   | admin  | status → PUBLISHED                                                          |
| `PATCH /api/admin/banners/:id/unpublish` | admin  | status → DRAFT                                                              |
| `DELETE /api/admin/banners/:id`          | admin  | hard delete                                                                 |

All responses use the `{ data }` envelope (lists return `{ data: Banner[] }` —
banners are low-volume, so no pagination).

### Seed

`prisma/seed.ts` idempotently upserts a few PUBLISHED banners per placement
(deterministic id keyed on placement + slot). The storefront renders correctly
with ZERO banners, so this is a convenience, not a requirement.

## Admin (`apps/store-admin`)

Routes under `src/app/(dashboard)/banners/`: `page.tsx` (list grouped by
placement), `new/`, `[id]/edit/` (+ `loading.tsx` for each). FSD slices:

- `entities/banner` — re-exports the Orval banner hooks + types.
- `features/banner-form` — zod schema + DTO mappers + `BannerForm` (structured
  fields: placement select, title, subtitle, image URL, CTA label/href, theme,
  sort order + publish controls; NO rich-text editor). Follows `forms.md`
  (RHF `reset` keyed to entity id; `datetime-local` for `scheduledAt`).
- `widgets/banner-list` — placement-grouped table with publish/unpublish toggle
  (keyed on `status === 'PUBLISHED'`) + delete-with-confirm; skeleton.
- `widgets/banner-form-view` — create/edit view widgets (mutation + cache
  invalidation + toasts + redirect).

Sidebar entry added (`ImageIcon`), UA strings added to `shared/config/dictionary.ts`
(`nav.banners`, `banners`, `bannerForm`).

## Storefront ISR + static fallback (`apps/store-client`)

`src/shared/api/banners-server.ts` — `fetchPublishedBanners()`: a server-only,
`['banners']`-tagged `fetch` of `GET /api/banners` that groups the result by
placement (`BannersByPlacement`). **Resilient**: any error / non-OK / unreachable
API yields all-empty groups, so the page always renders. Mirrors
`pages-server.ts` (raw tagged `fetch`, because the Orval Axios client cannot
carry Next cache tags). The store-api notifier purges the `banners` tag and `/`
path on admin writes.

Wiring (data source swap only — visual design/tokens unchanged):

- **Homepage** (`app/page.tsx`, now `async`) fetches once and passes
  `heroSlides` / `promoTiles` to `HeroBanner`, and `banner` to `PromoBanner`.
- **`HeroBanner`** forwards to `HeroSlider` (HERO_SLIDE) and `PromoTiles`
  (PROMO_TILE).
- **`PromoBanner`** ← PROMO_BANNER (first banner).
- **Announcement bar** ← ANNOUNCEMENT_BAR: because it lives in the global
  (client) `Header`, the **root `layout.tsx`** (server, now `async`) fetches the
  same `banners` (deduped by Next — same URL + tag) and passes the announcement
  banner as a serializable prop through `Header` → `AnnouncementBar`.

**Static fallback:** every region renders its EXISTING hardcoded dictionary
content when its placement group is empty — the homepage never blanks. Optional
banner sub-fields (eyebrow/subtitle/CTA) render conditionally.

## Shared files touched (additive-merge awareness)

- store-api: `prisma/schema.prisma`, `prisma/seed.ts`, `src/app.module.ts`,
  `src/main.ts`, `src/export-swagger.ts`.
- store-admin: `src/shared/api/index.ts`, `src/shared/config/dictionary.ts`,
  `src/widgets/index.ts`, `src/widgets/admin-shell/admin-sidebar.tsx`.
- store-client: `src/app/page.tsx`, `src/app/layout.tsx`,
  `src/widgets/header/ui/header.tsx`, plus the four banner-region widgets.

## Contract change

Yes — new `Banners` tag and endpoints. Orval hooks must be regenerated for both
frontends (done offline via `swagger:export` + `generate:api`; generated files
are git-ignored and not committed).
