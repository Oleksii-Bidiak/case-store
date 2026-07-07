# Plan 122 — Content Map (`/content-map`)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 1** (CRM-ядро + quick-win контент-мапа + мобільний доступ)
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-264

## Overview

The owner has zero e-commerce admin experience. Content that shows up on the storefront (hero
slider, promo tiles, the top announcement strip, FAQ, legal pages, footer contacts, SEO defaults)
is managed across several admin sections (`/banners`, `/faq`, `/pages`, `/blog`,
`/settings/contact`, `/settings/seo`) whose names don't obviously map to "the thing I saw on the
website." TASK-264 adds a single orientation page, `/content-map` ("Де що на сайті"), that shows a
static schematic of the storefront's pages and cross-cutting regions, each with an arrow to the
admin section that edits it, a live active-item count, and a "показується / приховано" marker.

This is explicitly the **cheap** tier of Block F (per the 2026-07-07 handoff): "карта контенту —
дешево (робимо), live-прев'ю — помірно (робимо поетапно... TASK-265/266), редагування з вітрини —
дорого (НЕ робимо)." Nothing here previews actual banner/page content — it only answers "where do
I go to change this" and "is it currently visible."

**No backend work, no Prisma migration, no Orval regen.** Every count is derived from Orval hooks
that already exist and are already used elsewhere in store-admin (banners, FAQ, pages, blog list
endpoints). This plan is `store-admin`-only.

## Scope

### In Scope

- New route `/content-map`, sidebar entry "Де що на сайті" (`dict.nav.contentMap`).
- A static, hardcoded zone→admin-section config (placements are code enums; no new API).
- Nine content zones (see Technical Design §Zone config) grouped into storefront page/area
  "frames" rendered as simple CSS boxes with an arrow glyph from the storefront region label to
  the admin-section link — no screenshots, no SVG art, no imported storefront components.
- Each list-backed zone (banners ×4 placements, FAQ, legal/static pages, blog) shows a live active
  count + a "Показується" / "Приховано" marker derived from that count.
- The two singleton-settings zones (site-contact, SEO settings) render as plain links with no
  count/marker (see Design Decision 4 below) — they are not itemized collections.
- One small, additive, frontend-only rider to `AdminBannerTable`: read an optional `?placement=`
  URL param so a content-map banner-zone link can deep-link straight to that one placement's
  section instead of the full grouped table (Design Decision 2).
- A short static note (not a clickable zone, no new count wiring) acknowledging that catalog/PDP
  product content is edited via the already-obvious "Товари"/"Категорії" top-nav items — included
  so the schematic visually accounts for all the page types named in the BACKLOG row (home /
  catalog / PDP / info / contact / blog / legal / footer) without inventing redundant zone-cards
  for sections that are not actually ambiguous.

### Out of Scope

- Live preview of banner/page/blog content in its real storefront placement — that is TASK-265
  (banner live preview) and TASK-266 (page/blog preview), explicitly the "moderate cost" tier of
  Block F, deliberately not bundled into this "cheap" quick-win.
- Editing any content from the content-map page itself — it is read-only navigation + counts,
  never a form.
- SEO-health signals (global noindex warning, "X products missing their own metaTitle", etc.) —
  that is TASK-269 ("SEO-здоров'я"); this plan's SEO zone is a plain link to `/settings/seo`, not
  a health checklist. Duplicating that logic here would collide with TASK-269's remit.
- Any new backend endpoint, DTO, Prisma column, or Orval regeneration — every count is derived
  client-side from list endpoints that already exist and are already consumed elsewhere in
  store-admin.
- Pre-filtering `/pages`, `/blog`, or `/faq` by a URL param — unlike banners, none of those admin
  tables group rows by any dimension today (they're flat, unfiltered, low-volume lists already
  shown in full), so there is nothing meaningful to pre-select; a plain link is already the
  simplest and only sensible target (see Design Decision 2).
- Reordering or restructuring the existing `navItems`/`bottomNavItems` beyond adding one entry.

## User Stories

1. As the store owner with no admin experience, I want a single page that shows me, in plain
   language, "the top strip on my site → Банери," "the FAQ on the info page → FAQ," "the contact
   info in the footer → Налаштування → Контакти," so I don't have to guess which of a dozen
   sidebar sections controls what I saw on the live site.
2. As the store owner, I want each of those map entries to show me how many active items are
   behind it and whether that spot is currently showing something or empty, so I know at a glance
   whether I need to add content before pointing customers at the site.
3. As the store owner, I want clicking a map entry to take me straight to (or as close as possible
   to) the right admin section in one click, so finding-and-fixing something takes at most two
   clicks total from anywhere in the panel (sidebar → content map → target section).

## Technical Design

### Zone config (`model/content-map-zones.ts`)

A single hardcoded array is the source of truth — no runtime config, no admin form to manage it
(placements are Prisma/TypeScript enums baked into the codebase, so a new placement always needs a
code change anyway, at which point this array is updated in the same PR):

```ts
export type ContentMapZoneId =
  | "announcement-bar"
  | "hero-slide"
  | "promo-tile"
  | "promo-banner"
  | "faq"
  | "legal-pages"
  | "blog"
  | "site-contact"
  | "seo-settings";

/** How a zone's active count is derived — `null` for singleton-settings zones. */
export type ContentMapZoneCount =
  | { kind: "banner"; placement: BannerEntityPlacement }
  | { kind: "faq" }
  | { kind: "pages" }
  | { kind: "blog" }
  | null;

export interface ContentMapZone {
  id: ContentMapZoneId;
  /** Plain-UA label for what the owner sees on the storefront. */
  sourceLabel: string;
  /** Plain-UA label for the admin section this zone edits. */
  targetLabel: string;
  /** Admin route to link to (may include a pre-filter query param). */
  targetHref: string;
  count: ContentMapZoneCount;
}

/** One storefront "page frame" in the schematic, holding an ordered list of zones. */
export interface ContentMapPageGroup {
  id: string;
  /** Plain-UA heading for the page/area this frame represents. */
  heading: string;
  zoneIds: ContentMapZoneId[];
}
```

Pure helper (unit-tested, no hooks):

```ts
export function resolveZoneVisibility(count: number): "shown" | "hidden" {
  return count > 0 ? "shown" : "hidden";
}
```

### The nine zones

| Zone id            | Storefront region (`sourceLabel`)      | Applies to (page context)                            | Admin target (`targetHref`)           | Count source                              |
| ------------------ | -------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| `announcement-bar` | Стрічка оголошень зверху               | Кожна сторінка (шапка)                               | `/banners?placement=ANNOUNCEMENT_BAR` | banners, `placement === ANNOUNCEMENT_BAR` |
| `hero-slide`       | Hero-слайдер                           | Головна                                              | `/banners?placement=HERO_SLIDE`       | banners, `placement === HERO_SLIDE`       |
| `promo-tile`       | Промо-плитки                           | Головна                                              | `/banners?placement=PROMO_TILE`       | banners, `placement === PROMO_TILE`       |
| `promo-banner`     | Широкий промо-банер                    | Головна                                              | `/banners?placement=PROMO_BANNER`     | banners, `placement === PROMO_BANNER`     |
| `faq`              | FAQ-блок                               | `/info` та кожна картка товару (PDP)                 | `/faq`                                | faq, `isActive === true`                  |
| `legal-pages`      | Правові та інші статичні сторінки      | `/legal` (hub + кожен документ)                      | `/pages`                              | pages, `status === PUBLISHED`             |
| `blog`             | Стрічка блогу                          | `/blog`                                              | `/blog`                               | blog, `status === PUBLISHED`              |
| `site-contact`     | Контакти (телефон, адреса, соцмережі)  | Футер (кожна сторінка) + `/contact`                  | `/settings/contact`                   | — (singleton, no count)                   |
| `seo-settings`     | Meta-заголовки та SEO за замовчуванням | Кожна сторінка (невидимо: `<title>`, meta, `robots`) | `/settings/seo`                       | — (singleton, no count)                   |

Grouped into page frames (`CONTENT_MAP_PAGE_GROUPS`), in visual top-to-bottom storefront order:

1. **Глобально — на кожній сторінці** — `announcement-bar`, `site-contact`, `seo-settings`
   (rendered first since it's the "applies everywhere" frame, matching how `ANNOUNCEMENT_BAR`
   renders in `layout.tsx`/`header.tsx` on every route and `SiteContactSettings`/`SeoSettings` are
   site-wide singletons, not page-specific).
2. **Головна сторінка** — `hero-slide`, `promo-tile`, `promo-banner` (all three render only on
   `apps/store-client/src/app/page.tsx`).
3. **«Інформація» та картка товару (PDP)** — `faq` (the FAQ list is global; it is rendered on both
   `/info` and every PDP per TASK-242, so one zone entry with a two-page `appliesTo` note is
   correct — it is not two separate zones).
4. **Блог** — `blog`.
5. **Правові та інші сторінки (`/legal`)** — `legal-pages`.

A final, non-zone **static note** (not part of the config array, just a rendered sentence in the
widget) covers Catalog/PDP product content: _"Назви, ціни, зображення й категорії товарів
редагуються в розділах «Товари» та «Категорії» у верхньому меню."_ No hook, no link-card, no new
count — those two sections are already the 2nd/4th items in the main nav and are not the kind of
"which section controls this" confusion Block F targets.

### Count-fetching strategy (minimizing hook calls)

- **Banners: one query, not four.** `useAdminBannerControllerFindAll({ status: "PUBLISHED" })` is
  called **once** in `ContentMapView`; the four banner-zone counts (`announcement-bar`,
  `hero-slide`, `promo-tile`, `promo-banner`) are all derived client-side from that single
  response via `.filter((b) => b.placement === zone.count.placement).length` — mirroring how
  `AdminBannerTable` already groups one fetched list by placement in-memory. This avoids issuing
  four separate placement-filtered requests (and four separate cache entries) for what is a single
  low-volume list.
- **FAQ:** `useAdminFaqControllerFindAll()` (no params — same call `AdminFaqTable`/`/faq` already
  makes) → count = `data.data.filter((f) => f.isActive).length`.
- **Pages:** `useAdminPageControllerFindAll({ status: "PUBLISHED", limit: 1 })` → count =
  `data.meta.total`. `limit: 1` keeps the response body tiny; only `meta.total` is read, not
  `data`. This is a **different** query key than `AdminPageTable`'s `{ limit: 100 }` (no status
  filter) call, so it does not share/corrupt that cache entry — it is its own small, cheap request.
- **Blog:** `useAdminBlogControllerFindAll({ status: "PUBLISHED", limit: 1 })` → count =
  `data.meta.total`, same reasoning as Pages.
- **Site-contact / SEO settings:** no hook call at all — these two zones render as plain links,
  no count is fetched (see Design Decision 4).

Total network requests from `/content-map`: **4** (banners-published, faq, pages-published-count,
blog-published-count) — not 9. All four already inherit the app-wide 5-minute `staleTime` /
`retry: 1` from `apps/store-admin/src/app/providers.tsx`'s `QueryClient` default, so no per-query
override is needed.

### Design Decision 1 — no new API (confirmed feasible for every zone)

Every zone's count is served by an admin list endpoint that already exists and is already
Orval-generated:

- `GET /api/admin/banners?status=PUBLISHED` (existing `AdminBannerListQueryDto` already supports
  `placement` + `status`; the frontend simply doesn't pass `placement` here since it derives all
  four placement counts from one fetch — see above).
- `GET /api/admin/faq` (existing, no query params — returns all items, `isActive` already on the
  entity).
- `GET /api/admin/pages?status=PUBLISHED&limit=1` (existing `AdminPageControllerFindAllParams`
  already supports both; `AdminPagePaginationMeta.total` already exists).
- `GET /api/admin/blog?status=PUBLISHED&limit=1` (existing `AdminBlogControllerFindAllParams`
  already supports both; `AdminBlogPaginationMeta.total` already exists).

No zone needed the "show without a count" fallback in practice — it is kept as the documented
fallback rule (per the grounding brief) for any _future_ zone added to this config that doesn't
have a backing list endpoint, but is not exercised by any of the nine zones shipped in this plan.
The two singleton-settings zones don't need it either — they're not missing an endpoint, they're
just not a _collection_, so "count" doesn't semantically apply (see Decision 4).

### Design Decision 2 — pre-filtered links: banners only, via an additive `?placement=` param

`AdminBannerTable` currently calls `useAdminBannerControllerFindAll()` with no params, fetching
every banner and grouping it into four `<section>`s in-memory (`PLACEMENT_ORDER.map(...)`,
`apps/store-admin/src/widgets/banner-list/ui/admin-banner-table.tsx` L42–153). There is real
precedent in this codebase for admin tables reading filter state from the URL via
`useSearchParams()` (`admin-category-table.tsx`, `admin-order-table.tsx`, `admin-product-table.tsx`,
`admin-review-table.tsx`, `AdminUserTable.tsx`, `AdminSubscriberTable.tsx`, `message-inbox.tsx`,
`device-model-table.tsx`, `admin-brand-table.tsx` all already do this), so extending
`AdminBannerTable` to read an optional `?placement=` param is idiomatic, not a new pattern.

**Decision: implement (b) — teach `AdminBannerTable` to read `?placement=` from the URL.** This is
cheap (an additive ~10-line change, no new component) and consistent with the established
convention above, so the "only if cheap" bar from the grounding brief is met:

- `const searchParams = useSearchParams(); const placementParam = searchParams.get("placement");`
- The banner **query itself** stays `useAdminBannerControllerFindAll({ status: undefined })` (all
  statuses, as today — a manager pre-filtering from the content map should still see drafts, not
  just published) — only the **rendering** narrows: `PLACEMENT_ORDER` becomes
  `placementParam && isValidPlacement(placementParam) ? [placementParam] : PLACEMENT_ORDER`, so an
  invalid/unknown param value falls back to the current full-grouped view rather than rendering
  nothing.
- `/banners` (no param) renders exactly as today — zero behavior change for the existing nav entry
  and for every existing test that doesn't seed the param.
- `/banners?placement=HERO_SLIDE` renders **only** the Hero-слайдер section — this is the link
  every banner-zone in the content map uses.

**Why not for Pages/Blog/FAQ:** none of those three admin tables group rows by any dimension today
— `AdminPageTable`/`BlogPostTable` load up to 100 rows flat with no status filter UI at all, and
`AdminFaqTable` is a single flat list. There is nothing to pre-select; a plain `/pages`, `/blog`,
or `/faq` link is already the simplest and only sensible target, and is exactly what the map uses.

### Design Decision 3 — static schema, no storefront imports

The zone/page-group config is a hardcoded TypeScript array in
`apps/store-admin/src/widgets/content-map/model/content-map-zones.ts` — placements are the
existing `BannerEntityPlacement` enum (re-exported from `@/entities/banner`), not a hand-copied
string union, so a future backend enum change surfaces as a TypeScript error here rather than
silently drifting. **No component, hook, or type from `apps/store-client` is imported anywhere in
this plan** — FSD forbids `store-admin` reaching into a sibling app, and the "CSS diagrams, no
screenshots" requirement means the page-frame boxes are original `store-admin` markup (bordered
`div`s with a heading + stacked zone rows), not a re-render of any real storefront component.

### Design Decision 4 — the "показується/приховано" marker only applies to list-backed zones

The marker is `resolveZoneVisibility(count)` — `count > 0` → "Показується" (reusing the exact
wording already used for the identical DRAFT/isActive style status elsewhere, e.g.
`dict.faq.statusActive` = "Показується" / `dict.faq.statusInactive` = "Приховано") — for the seven
list-backed zones only. The two singleton-settings zones (`site-contact`, `seo-settings`) render
as a plain link with **no** count and **no** shown/hidden badge: there is no "N active items" for a
single settings row, and inventing a proxy signal (e.g., "is the phone field non-empty," "is
`noindexSite` off") would (a) require reading response fields not otherwise needed on this page,
and (b) duplicate TASK-269's dedicated SEO-health checklist, which is explicitly out of scope here
(see Scope). A zone with `count: null` in the config simply skips rendering the count/marker
block in the shared zone-card component — this is a rendering branch, not two different card
components.

### Frontend (Next.js — FSD)

#### shared/config

- `dictionary.ts` — new `dict.nav.contentMap` ("Де що на сайті") + a new `dict.contentMap` section
  (heading, subheading, group headings, per-zone labels, status labels, load-error copy, the
  catalog/PDP static note, aria labels for counts). Exact key list in Tasks below; exact UA copy
  may be refined during implementation as long as the structure (one key per zone/group/status) is
  followed.

#### entities

- No changes. Reuses `@/entities/banner` (`useAdminBannerControllerFindAll`,
  `BannerEntityPlacement`), `@/entities/faq` (`useAdminFaqControllerFindAll`), `@/entities/page`
  (`useAdminPageControllerFindAll`), `@/entities/blog` (`useAdminBlogControllerFindAll`) exactly as
  already exported.

#### widgets

- `content-map/model/content-map-zones.ts` — **new**: `ContentMapZone`/`ContentMapPageGroup`
  types, `CONTENT_MAP_ZONES`, `CONTENT_MAP_PAGE_GROUPS`, `resolveZoneVisibility()`.
- `content-map/model/content-map-zones.test.ts` — **new**: pins config invariants (every
  `zoneIds` entry in every page group resolves to a real zone in `CONTENT_MAP_ZONES`, no duplicate
  zone ids, no duplicate `targetHref`+query-string pairs) + `resolveZoneVisibility()` unit cases
  (`0` → `"hidden"`, `1`/`5` → `"shown"`).
- `content-map/ui/content-map-zone-card.tsx` — **new**: one zone's rendered row — `sourceLabel`
  → (arrow) → `Link` to `targetHref` showing `targetLabel`, plus (only when `count !== null`) a
  count badge and the shown/hidden marker.
- `content-map/ui/content-map-page-group.tsx` — **new**: one page-frame box — bordered `div`
  with a heading and its ordered `ContentMapZoneCard`s stacked inside.
- `content-map/ui/content-map-view.tsx` — **new**: the widget's root — issues the four count
  queries described above, resolves each zone's `count` field from the fetched data, renders the
  page-group grid + the static catalog/PDP note + a load-error fallback (per-query, not a single
  blocking error — see Tasks).
- `content-map/ui/content-map-view.test.tsx` — **new**: RTL + MSW, asserts counts render and the
  shown/hidden marker flips correctly per stubbed data.
- `content-map/index.ts` — **new**: barrel-exports `ContentMapView`.
- `apps/store-admin/src/widgets/index.ts` — **modified**: `export { ContentMapView } from
"./content-map";`.
- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` — **modified**: one new entry in
  `bottomNavItems` (first position, ahead of «Контакти»): `{ label: dict.nav.contentMap, href:
"/content-map", icon: Map }` (new `Map` import from `lucide-react`).
- `apps/store-admin/src/widgets/banner-list/ui/admin-banner-table.tsx` — **modified**: additive
  `?placement=` read (Design Decision 2); `admin-banner-table.test.tsx` gains a case seeding the
  param and asserting only that one section renders.

#### app (pages)

- `apps/store-admin/src/app/(dashboard)/content-map/page.tsx` — **new**: thin server component,
  mirrors `orders/page.tsx` — sets `metadata.title = dict.contentMap.metaTitle`, renders a heading
  - `<Suspense fallback={...}><ContentMapView /></Suspense>`.

### API Contract

No changes. No new endpoint, no DTO change, no Orval regen in any app — every count is read from
an admin list endpoint that already exists and is already Orval-generated. `store-api` is
untouched by this plan.

## Tasks

### TASK-264-A: Zone-config model (`content-map-zones.ts`) — pure data, unit-tested

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — static config + one pure helper function, not cart/discount/inventory/auth;
still unit-tested per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/content-map/model/content-map-zones.ts` exports
      `ContentMapZoneId`, `ContentMapZoneCount`, `ContentMapZone`, `ContentMapPageGroup`,
      `CONTENT_MAP_ZONES` (9 entries per the Technical Design table), `CONTENT_MAP_PAGE_GROUPS` (5
      groups per the Technical Design grouping), and `resolveZoneVisibility(count: number):
    "shown" | "hidden"`
- [ ] `ContentMapZone.count`'s `{ kind: "banner"; placement: BannerEntityPlacement }` variant uses
      the real `BannerEntityPlacement` enum imported from `@/entities/banner` (not a hand-copied
      string union), so a future placement addition/rename in the backend enum surfaces as a
      TypeScript compile error here
- [ ] `content-map-zones.test.ts`: every `zoneIds` entry across all `CONTENT_MAP_PAGE_GROUPS`
      resolves to an id present in `CONTENT_MAP_ZONES` (no dangling reference); no duplicate zone
      `id`; `resolveZoneVisibility(0)` → `"hidden"`, `resolveZoneVisibility(1)` and `(5)` →
      `"shown"`
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/content-map/model/content-map-zones.ts` — new
- `apps/store-admin/src/widgets/content-map/model/content-map-zones.test.ts` — new

---

### TASK-264-B: `ContentMapView` widget + `/content-map` route + sidebar nav entry

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — UI/data-wiring widget, covered by RTL+MSW tests per the acceptance criteria
below.
**Depends on:** TASK-264-A (needs the zone config to exist)

**Acceptance Criteria:**

- [ ] `content-map-zone-card.tsx`: renders `sourceLabel` → (arrow glyph/icon) → a `Link` to
      `targetHref` showing `targetLabel`; when `zone.count !== null`, additionally renders the
      resolved count and the `resolveZoneVisibility()`-derived badge (`dict.contentMap.statusShown`
      / `statusHidden`, reusing the "Показується"/"Приховано" wording already established by
      `dict.faq.statusActive`/`statusInactive`); when `zone.count === null` (site-contact,
      seo-settings), renders the link with no count/marker block at all (not a "—" placeholder —
      the block is simply absent)
- [ ] `content-map-page-group.tsx`: renders one bordered "page frame" box (heading + stacked
      `ContentMapZoneCard`s for that group's `zoneIds`, in array order)
- [ ] `content-map-view.tsx`:
  - issues exactly the four queries described in Technical Design §Count-fetching strategy
    (`useAdminBannerControllerFindAll({ status: "PUBLISHED" })`,
    `useAdminFaqControllerFindAll()`, `useAdminPageControllerFindAll({ status: "PUBLISHED", limit:
1 })`, `useAdminBlogControllerFindAll({ status: "PUBLISHED", limit: 1 })`)
  - derives all nine zones' resolved counts from those four responses (banner counts via
    client-side `.filter(...).length` per placement from the one banner response; faq via
    `.filter((f) => f.isActive).length`; pages/blog via `meta.total`) and feeds each into its
    `ContentMapZoneCard`
  - renders the five `CONTENT_MAP_PAGE_GROUPS` frames in order, followed by the static catalog/PDP
    note sentence (`dict.contentMap.groupCatalogNote`) as plain text, not a zone card
  - handles each query's `isLoading`/`isError` **independently** (a zone's count area shows a
    small loading indicator or a load-error notice **local to that zone's card** —
    `dict.contentMap.loadError` — rather than the whole page failing if, say, only the blog
    endpoint errors); the target `Link` itself always renders regardless of query state, so
    navigation never blocks on a slow/failed count
- [ ] `apps/store-admin/src/app/(dashboard)/content-map/page.tsx`: thin server page mirroring
      `orders/page.tsx` — `metadata.title = dict.contentMap.metaTitle`, heading
      `dict.contentMap.heading` + subheading `dict.contentMap.subheading`, wraps `<ContentMapView
    />` in `<Suspense>`
- [ ] `dictionary.ts`: `dict.nav.contentMap` = `"Де що на сайті"`; new `dict.contentMap` section
      with (at minimum) `metaTitle`, `heading`, `subheading`, `loadError`, `statusShown`,
      `statusHidden`, `groupCatalogNote`, and per-zone/per-group label keys covering all nine zones
      and five groups from the Technical Design table (exact key names at the implementer's
      discretion; the structural requirement is one label per zone and one heading per group, no
      hardcoded UA strings inlined directly in the `.tsx` files)
- [ ] `admin-nav-list.tsx`: new `Map` icon import from `lucide-react`; `bottomNavItems` gains `{
    label: dict.nav.contentMap, href: "/content-map", icon: Map }` as its first entry (ahead of
      «Контакти»); `isNavItemActive` needs no change (already generic over any `href`)
- [ ] `apps/store-admin/src/widgets/index.ts`: barrel-exports `ContentMapView` from
      `./content-map`
- [ ] `content-map-view.test.tsx` (MSW-stubbed banners/faq/pages/blog responses): asserts (a) all
      four banner-placement counts render correctly from one stubbed banner response; (b) the FAQ
      count only counts `isActive: true` rows; (c) the pages/blog counts read `meta.total`; (d) a
      zone with a zero count shows "Приховано"; a zone with a positive count shows "Показується";
      (e) `site-contact`/`seo-settings` zone cards render their link with no count/marker element
      present
- [ ] `admin-nav-list.test.tsx` (existing, TASK-257-A): extended with one assertion that the new
      "Де що на сайті" entry renders and links to `/content-map`
- [ ] Manual check: from any admin page, clicking the sidebar's «Де що на сайті» (1 click) then any
      zone's target link (1 click) lands on the correct admin section — total ≤2 clicks, matching
      the BACKLOG acceptance bar
- [ ] `npm run build`/`lint`/`typecheck` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/content-map/ui/content-map-zone-card.tsx` — new
- `apps/store-admin/src/widgets/content-map/ui/content-map-page-group.tsx` — new
- `apps/store-admin/src/widgets/content-map/ui/content-map-view.tsx` — new
- `apps/store-admin/src/widgets/content-map/ui/content-map-view.test.tsx` — new
- `apps/store-admin/src/widgets/content-map/index.ts` — new
- `apps/store-admin/src/app/(dashboard)/content-map/page.tsx` — new
- `apps/store-admin/src/widgets/index.ts` — export `ContentMapView`
- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` — new nav entry + `Map` icon import
- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.test.tsx` — new assertion
- `apps/store-admin/src/shared/config/dictionary.ts` — `dict.nav.contentMap` + `dict.contentMap`

---

### TASK-264-C: `AdminBannerTable` optional `?placement=` deep-link filter

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — additive URL-param read, covered by RTL tests per the acceptance criteria
below.
**Depends on:** — (independent of TASK-264-A/B; the content-map's banner-zone links degrade
gracefully to "show all four groups" if this task hasn't landed yet, so it can be sequenced in any
order relative to A/B, including in parallel)

**Acceptance Criteria:**

- [ ] `admin-banner-table.tsx` reads `useSearchParams().get("placement")`; when it is a valid
      `BannerEntityPlacement` value, `PLACEMENT_ORDER`'s render loop is narrowed to just that one
      placement (still the existing section heading + table markup, just one section instead of
      up to four); when absent or not a recognized placement value, behavior is **byte-for-byte
      identical** to today (all groups render, in the existing `PLACEMENT_ORDER`)
- [ ] The underlying `useAdminBannerControllerFindAll(...)` query itself is **not** narrowed by
      `placement` (still fetches all statuses/placements, as today) — only which section(s) render
      is affected, so a manager arriving via `?placement=` still sees drafts for that placement,
      not just published rows
- [ ] `admin-banner-table.test.tsx`: existing "no param" tests pass unmodified; new case seeds
      `mockSearchParams = new URLSearchParams("placement=HERO_SLIDE")` (mirroring the
      `jest.mock("next/navigation", ...)` pattern already used in `admin-order-table.test.tsx`) and
      asserts only the Hero-слайдер section renders (other placement headings absent) even when
      the stubbed response includes banners of other placements; a second case seeds an invalid
      value (`placement=NOT_REAL`) and asserts it falls back to the full grouped view
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/banner-list/ui/admin-banner-table.tsx` — additive `?placement=`
  read + narrowed render loop
- `apps/store-admin/src/widgets/banner-list/ui/admin-banner-table.test.tsx` — two new cases
  (valid param narrows; invalid param falls back)

## Dependencies & Sequencing

- **Internal:** TASK-264-A → TASK-264-B (B needs the zone config to render). TASK-264-C is fully
  independent and can run before, after, or in parallel with A/B — the four banner-zone hrefs in
  the config are literally `/banners?placement=X` regardless of whether C has shipped; without C,
  that link simply lands on the full grouped `/banners` view (still 1 click, just without the
  extra convenience of only seeing that one section).
- **External:** Needs `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` to exist, which
  TASK-257 already extracted (merged into `develop`). Per plan 121's own dependency note, the only
  possible friction is a trivial merge collision on the `bottomNavItems` array if this plan and
  TASK-257 were both mid-flight at once — moot here since TASK-257 is already merged.
- No shared files with TASK-248/249/250/253 (dashboard/order-workflow tasks — different
  widgets/routes entirely) or with TASK-265/266 (banner/page preview — those touch the _form_
  widgets `banner-form-view`/`page-form-view`/`blog-post-form-view`, not `banner-list` or a new
  `content-map` widget). Fully parallel-safe with every other open Wave-1/Wave-5 task.
- Feeds nothing forward directly, but TASK-265/266 (live preview) are the natural next step for an
  owner who used the content map to find a section and now wants to see the change before saving —
  not a hard dependency, just the intended user journey across this Block F trio.

## Risks & Mitigations

| Risk                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Many list-hooks firing on one page slows `/content-map` or hammers the API                                                                                                              | Reduced to exactly 4 requests (not 9) by deriving all four banner-placement counts from one shared banner fetch instead of four placement-scoped fetches; all four inherit the app-wide 5-minute `staleTime`/`retry: 1` default (`app/providers.tsx`), so repeat visits within 5 minutes serve from cache                                                                                                                                                                                                                                                                                                 |
| The zone/page-group config silently drifts from reality if a new `BannerPlacement` value or admin section is added later and this file isn't updated                                    | The `count.placement` field is typed against the real `BannerEntityPlacement` enum (not a copied string union), so an added/renamed enum value that isn't reflected here doesn't silently miscount — TypeScript's exhaustiveness on the `ContentMapZoneCount` discriminated union catches an unhandled `kind` in the count-resolution `switch`; a brand-new _admin section_ (e.g. a hypothetical future content type) is not auto-detected by any mechanism and would need a manual config update — accepted as inherent to a "static config" design, called out explicitly rather than silently accepted |
| A zone's count query errors (network blip, endpoint down) blocks the whole page or hides the navigation link                                                                            | Each of the four queries is handled independently — a failed query only degrades that zone's count/marker area to a small inline error, never removes or blocks the `Link` itself, so navigation always works even with zero live data                                                                                                                                                                                                                                                                                                                                                                    |
| `AdminBannerTable`'s new `?placement=` param regresses the existing (no-param) `/banners` behavior used by the main sidebar nav entry                                                   | Explicit acceptance criterion requires the no-param path to be byte-for-byte identical to today; existing `admin-banner-table.test.tsx` cases run unmodified as a regression guard before the two new cases are added                                                                                                                                                                                                                                                                                                                                                                                     |
| Owner expectation mismatch: the map's shown/hidden marker could be misread as "this exact banner/FAQ is visible right now" when it's really "N ≥ 1 active items exist in this category" | `dict.contentMap` copy is written at the category level ("Показується" next to the zone as a whole, count shown alongside it), matching the same convention already used by `dict.faq.statusActive` for a single FAQ row — not a new UX pattern to learn, and the count number sitting right next to the badge disambiguates "how many" from "any at all"                                                                                                                                                                                                                                                 |

## Notes

- This plan is deliberately **quick-win scoped**: no live preview (TASK-265/266), no SEO-health
  logic (TASK-269), no new backend surface at all. If a future Block F follow-up wants richer
  signals (e.g., "3 of these 5 banners are scheduled, not yet live"), that is a config/UI extension
  of this same zone-card component, not a redesign — the `count`/marker rendering branch already
  isolates that concern per zone.
- The "Каталог"/PDP static note is intentionally NOT a zone with a link+count — Товари/Категорії
  are already the 2nd/4th main-nav items, so restating them here as a full zone card would dilute
  rather than clarify the map. If the owner later says this is confusing, promoting it to a real
  zone is a small, isolated follow-up (add one `ContentMapZone` entry with `count: null`, same as
  the two singleton-settings zones), not a redesign.
- `BannerPlacement` has exactly four values (`HERO_SLIDE`, `PROMO_TILE`, `PROMO_BANNER`,
  `ANNOUNCEMENT_BAR`); all four get a zone even though the BACKLOG row's prose only names three
  ("Hero-слайдер," "Промо-плитки," "Стрічка зверху") plus an "і т.д." — `PROMO_BANNER` (the wide
  homepage banner rendered by `apps/store-client/src/widgets/promo-banner`) is the fourth,
  included for completeness since the admin `/banners` table already groups by all four and
  leaving one out would make the map incomplete for that section.
