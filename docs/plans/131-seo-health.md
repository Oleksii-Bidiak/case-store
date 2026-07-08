# Plan 131 — "SEO-здоров'я" Health Section on `/settings/seo`

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 3** (Функціональні прогалини + SEO-зручність), Block G
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-269

## Overview

The owner has no way to see, at a glance, whether the SEO foundation shipped in Етап 5 (plan 116) is
actually filled in: how many products/categories/pages are relying on auto-generated meta text
(fine, expected — not an error), whether the site-wide `SeoSettings` defaults are set, and — most
importantly — whether the site-wide `noindexSite` kill switch is accidentally left on (which would
silently deindex the entire live store). This plan adds a "SEO-здоров'я" (SEO health) checklist
section to `/settings/seo`, backed by one light COUNT endpoint for the three catalog aggregates, with
the settings-derived checks (defaults filled, noindex state) computed client-side from data the page
already fetches — no duplicate server-side logic for those two checks.

## Scope

### In Scope

- One new admin-only endpoint, `GET /api/admin/seo-settings/health`, returning six cheap COUNTs
  (products/categories/pages: how many lack their own `metaTitle`, and how many are "live" at all —
  the denominator) via a single `Promise.all`, mirroring the `DashboardRepository.getNeedsAction()`
  pattern.
- A new `SeoHealthSection` component rendered inside `SeoSettingsView` (above or below
  `SeoSettingsForm`, same page, no new route/tab shell), showing:
  - Products/categories/pages without their own `metaTitle` — framed as informational ("N із M …
    використовують автоматичний заголовок"), never as an error/red state.
  - Whether `SeoSettings.defaultMetaTitle`/`defaultMetaDescription` are filled — a soft, amber-toned
    nudge when empty (recommended, not required — the storefront still works via tier-3 derivation),
    computed client-side from the settings entity `SeoSettingsView` already fetches.
  - The global `noindexSite` state — a prominent **red** warning banner when `true` (this one _is_ a
    real problem: it hides the entire live site from search engines), computed from the same
    already-fetched settings entity.
  - Three outbound links (new tab): `/sitemap.xml`, `/robots.txt`, `/llms.txt` on the storefront
    origin, so the owner can eyeball what's actually being served without leaving the admin panel.
- New `NEXT_PUBLIC_SITE_URL` support in `store-admin`'s config (mirroring `store-client`'s
  `SITE_URL` pattern, falling back to the already-present `NEXT_PUBLIC_APP_URL`), since store-admin
  currently has no config constant pointing at the public storefront origin.
- New UA dictionary strings for every label/hint/warning above.
- Orval regen for the new endpoint (`useAdminSeoSettingsControllerGetHealth`) — **the implementing
  agent updates the OpenAPI spec/Swagger decorators but does not commit the regenerated client
  files** (gitignored per `AGENTS.md`); the orchestrator runs one repo-wide Orval regen pass on
  `develop` after this plan (and TASK-268, sequenced first in the same worktree) merge.

### Out of Scope

- Any live-preview of banner/page/blog content — TASK-265/266, unrelated to SEO.
- The SERP-snippet live preview under individual meta fields — that is TASK-268
  (`docs/plans/130-serp-preview.md`), sequenced immediately before this plan in the same worktree.
  This plan's checklist is an _aggregate_ health view, not a per-field live mock.
- Per-item drill-down (e.g. a filterable list of "the 12 products without a metaTitle") — the
  checklist shows counts + a plain link to the relevant admin list (`/products`, `/categories`,
  `/pages`), matching the existing "cheap tier" precedent set by `docs/plans/122-content-map.md`
  (deep-link, no server-side pre-filter, since none of those three admin tables currently support a
  "missing metaTitle" filter — adding one is a bigger change than this plan's remit).
- Any change to `resolveSeo()`, the storefront's actual SEO rendering, or the meaning of
  `metaTitle`/`metaDescription` being null (still "auto-derive," unchanged from plan 116/117).
- A generic "content health" dashboard covering non-SEO concerns (stock, pending reviews, etc.) —
  those already exist via the TASK-248 "Потребує дії" widget on the main dashboard; this section is
  SEO-scoped only, living on `/settings/seo` where the owner is already thinking about SEO.
- Historical trend/graph of the health counts — a live snapshot only, matching every other
  dashboard-style widget in this codebase (no time-series here).

## User Stories

1. As the store owner, I want to see on `/settings/seo` how many of my products/categories/pages
   don't have their own custom SEO title, so I understand the scale of what's running on
   auto-generated text (which is fine) versus what I've manually customized.
2. As the store owner, I want a clear, unmistakable red warning if I (or a past mistake) left "hide
   site from search engines" turned on, so I never accidentally keep my live store invisible to
   Google without noticing.
3. As the store owner, I want one-click links to see the actual `sitemap.xml`/`robots.txt`/`llms.txt`
   my site is serving, so I can sanity-check them without knowing what a URL bar is for beyond
   pasting a link I was given.

## Technical Design

### Data Model

No Prisma schema change. Existing nullable columns are read as-is:
`Product.metaTitle` (+ `isActive`, `deletedAt` for the "live" denominator),
`Category.metaTitle` (+ `isActive`), `Page.metaTitle` (+ `status`).

### Design Decision 1 — the new endpoint returns ONLY the three catalog COUNT pairs

`SeoSettings.defaultMetaTitle`/`defaultMetaDescription` filled? and `noindexSite` on/off? are both
already present on the `SeoSettingsEntity` that `SeoSettingsView` fetches today via
`useSeoSettingsControllerGetSettings()` (no new field, no new request needed — plan 116 shipped both
columns). Duplicating those two booleans into the new health endpoint's response would mean either
(a) the health service re-reads the settings row a second time (redundant DB round-trip + redundant
"is this filled" logic living in two places), or (b) the health endpoint takes the settings as
input, which an idempotent `GET` shouldn't. **Decision: the new endpoint is scoped to exactly the
three catalog COUNT pairs (six numbers total); the "defaults filled" and "noindex" checks are pure
client-side derivations from the settings entity `SeoSettingsView` already has in scope.** This keeps
the new endpoint genuinely light (six indexed COUNTs, zero joins) and avoids a second source of
truth for data the page already holds.

### Design Decision 2 — "live" denominator scoping mirrors each entity's canonical visibility gate

Per `docs/conventions/prisma-migration` conventions (`isActive` = reversible visibility toggle,
`status` = the Етап-2 publishing gate for `Page`):

- **Products:** `isActive: true, deletedAt: null` (the admin's own visibility toggle + the
  soft-delete tombstone — matches `NeedsAction`'s and the public product list's established
  `isActive`/`deletedAt` gating).
- **Categories:** `isActive: true` (Category has no soft-delete column).
- **Pages:** `status: PublishStatus.PUBLISHED` — **not** `isActive`, even though `Page.isActive` is a
  boolean that mirrors `status === PUBLISHED` today. Per the Етап-2 publishing-foundation convention
  (plan 104: "`status` is the single visibility gate, `isActive` a derived mirror"), every new query
  filters on `status` directly rather than the mirror column, so this endpoint stays correct even if
  a future change ever decouples the mirror.

Draft/scheduled/inactive/soft-deleted rows are excluded from both the numerator (missing-metaTitle
count) and the denominator (total count) — a draft page's missing meta title isn't a live SEO gap,
it's simply not published yet, so counting it would inflate the number in a way that scares the
owner over nothing.

### Backend (NestJS — Clean Architecture)

#### `SeoSettingsRepository` (new method)

```ts
export interface ContentSeoCounts {
  productsMissingMetaTitle: number;
  productsTotal: number;
  categoriesMissingMetaTitle: number;
  categoriesTotal: number;
  pagesMissingMetaTitle: number;
  pagesTotal: number;
}

getContentSeoCounts(): Promise<ContentSeoCounts> {
  // Six independent prisma.{product,category,page}.count({ where }) calls in one
  // Promise.all — mirrors DashboardRepository.getNeedsAction()'s four-count pattern.
}
```

- `productsMissingMetaTitle`: `product.count({ where: { metaTitle: null, isActive: true, deletedAt: null } })`
- `productsTotal`: `product.count({ where: { isActive: true, deletedAt: null } })`
- `categoriesMissingMetaTitle`: `category.count({ where: { metaTitle: null, isActive: true } })`
- `categoriesTotal`: `category.count({ where: { isActive: true } })`
- `pagesMissingMetaTitle`: `page.count({ where: { metaTitle: null, status: PublishStatus.PUBLISHED } })`
- `pagesTotal`: `page.count({ where: { status: PublishStatus.PUBLISHED } })`

This repository already lives in the SEO-settings module and already reads `PrismaService`
directly; querying `Product`/`Category`/`Page` tables from here mirrors the precedent set by
`DashboardRepository` reading `Order`/`Review`/`MailOutbox` from the _dashboard_ module — a
cross-entity aggregation repository is expected to touch tables outside its own "owning" module.

#### `SeoSettingsService`

- `getHealth(): Promise<SeoHealthEntity>` — calls `repository.getContentSeoCounts()`, maps to
  `SeoHealthEntity.fromCounts(counts)`. No caching beyond the standard TanStack Query client-side
  layer — six indexed COUNTs are cheap enough to compute fresh on every admin page load.

#### `AdminSeoSettingsController` (new endpoint on the existing controller)

```
GET /api/admin/seo-settings/health — AdminGuard, operationId 'adminSeoSettingsControllerGetHealth'
```

Added alongside the existing `PUT /api/admin/seo-settings` on the same `@Controller('admin/seo-settings')`
class — no new controller file, no new module registration.

#### New DTO/entity files (barrels updated)

- `entities/seo-health.entity.ts` — `SeoHealthEntity` (domain entity, `@ApiProperty`-decorated,
  six `number` fields per `ContentSeoCounts`, `static fromCounts(counts): SeoHealthEntity`).
- `dto/seo-health-response.dto.ts` — `SeoHealthResponseEnvelope` (`{ data: SeoHealthEntity }`,
  `@ApiProperty({ type: SeoHealthEntity })`), mirroring `NeedsActionResponse`'s
  DTO-folder-hosted-envelope pattern (distinct from the sibling `SeoSettingsResponseEnvelope`, which
  lives directly in `seo-settings.controller.ts` — the health envelope follows the dashboard
  module's more recent convention of a dedicated `dto/` file instead).
- `entities/index.ts` — barrel gains `export { SeoHealthEntity } from './seo-health.entity';`.
- `dto/index.ts` — barrel gains `export { SeoHealthResponseEnvelope } from './seo-health-response.dto';`.

### Frontend (Next.js — FSD)

#### shared/config

- `shared/config/site.ts` — **new**: `STOREFRONT_URL = process.env.NEXT_PUBLIC_SITE_URL ??
process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`, mirroring
  `apps/store-client/src/shared/config/site.ts`'s `SITE_URL` fallback chain exactly (same env-var
  names, same precedence) so a single `NEXT_PUBLIC_SITE_URL` set in one place, if ever added, works
  for both apps; today it silently falls back to the already-present `NEXT_PUBLIC_APP_URL`, which
  already points at the storefront in every existing `.env.example`.
- `.env.example` (store-admin) — add a commented `NEXT_PUBLIC_SITE_URL=` line documenting the
  optional override, next to the existing `NEXT_PUBLIC_APP_URL`.
- `shared/config/index.ts` — re-export `STOREFRONT_URL`.

#### entities

- `entities/seo-settings/index.ts` — re-export `useAdminSeoSettingsControllerGetHealth` and the
  `SeoHealthEntity` type from `@/shared/api` (generated by the Orval regen this plan's Task A
  requires, per the Notes on the two-app regen convention).

#### widgets

- `widgets/seo-settings-view/ui/seo-health-section.tsx` — **new**: fetches
  `useAdminSeoSettingsControllerGetHealth()`; renders three "missing metaTitle" rows (products,
  categories, pages) each as `N із M … (dict.seoHealth.autoHint)`, plain-text/muted tone (never
  `text-destructive` — explicitly not an error state per Scope), each row's label linking to its
  admin list (`/products`, `/categories`, `/pages`); a "SEO-налаштування за замовчуванням" row
  showing filled/empty state for `defaultMetaTitle`/`defaultMetaDescription` (derived from the
  `settings` prop passed down from `SeoSettingsView`, `text-warning` tone when empty, muted when
  filled — the amber tone here matches `NeedsActionCard`'s `count > 0 ? warning : muted` visual
  grammar, but the _polarity_ is inverted: empty is the "needs attention" state for this specific
  row, not a positive count); a **red** `noindexSite` banner rendered only when `true`
  (`text-destructive`, `border-destructive`/`bg-destructive/10` per the design-system's existing
  destructive-tone convention) with the exact warning copy from Task C's acceptance criteria; three
  `<a target="_blank" rel="noopener noreferrer">` links to `${STOREFRONT_URL}/sitemap.xml`,
  `${STOREFRONT_URL}/robots.txt`, `${STOREFRONT_URL}/llms.txt`.
- `widgets/seo-settings-view/ui/seo-health-section.test.tsx` — **new**: RTL + MSW.
- `widgets/seo-settings-view/ui/seo-settings-view.tsx` — **modified**: renders `<SeoHealthSection
settings={data.data} />` alongside `<SeoSettingsForm settings={data.data} />` in the existing
  `flex flex-col gap-6` column (recommend: health section first, since it's the "state of the
  world" summary, then the edit form below it — implementer's call on ordering, not load-bearing).

#### shared/config (dictionary)

- `dictionary.ts` — new `dict.seoHealth` section: `heading`, `subheading`, `productsAutoLabel`,
  `categoriesAutoLabel`, `pagesAutoLabel`, `autoHint` (a function-value `(missing: number, total:
number) => string` following the existing `dict.*.slugPreview(name)` function-value convention),
  `defaultsFilledLabel`, `defaultsFilledYes`, `defaultsFilledNo`, `noindexWarningTitle`,
  `noindexWarningBody`, `noindexOkLabel`, `linksHeading`, `sitemapLink`, `robotsLink`, `llmsLink`,
  `loadError`.

### API Contract

| Method | Path                             | Request Body | Response                                        | Auth         |
| ------ | -------------------------------- | ------------ | ----------------------------------------------- | ------------ |
| GET    | `/api/admin/seo-settings/health` | —            | `{ data: SeoHealthEntity }` (6 `number` fields) | `AdminGuard` |

## Tasks

### TASK-269-A: Backend — `GET /api/admin/seo-settings/health`

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No — read-only aggregation endpoint, not cart/discount/inventory/auth; covered by
unit + e2e tests per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `SeoSettingsRepository.getContentSeoCounts()` runs the six `count()` queries in Design
      Decision 2 inside one `Promise.all`, returns `ContentSeoCounts`
- [ ] `SeoHealthEntity` (`entities/seo-health.entity.ts`) — six `@ApiProperty({ type: Number })`
      fields (`productsMissingMetaTitle`, `productsTotal`, `categoriesMissingMetaTitle`,
      `categoriesTotal`, `pagesMissingMetaTitle`, `pagesTotal`) + `static fromCounts(counts:
  ContentSeoCounts): SeoHealthEntity`
- [ ] `SeoHealthResponseEnvelope` (`dto/seo-health-response.dto.ts`) — `{ data: SeoHealthEntity }`,
      `@ApiProperty({ type: SeoHealthEntity })`
- [ ] `entities/index.ts` and `dto/index.ts` barrels updated
- [ ] `SeoSettingsService.getHealth(): Promise<SeoHealthEntity>` calls the repository method and maps
      via `SeoHealthEntity.fromCounts`
- [ ] `AdminSeoSettingsController` gains `GET /health` (full route `GET /api/admin/seo-settings/health`)
      — `@UseGuards(AdminGuard)` (inherited from the class-level guard already on this controller),
      `@ApiBearerAuth('access-token')`, `@ApiOperation({ summary: 'Get SEO health checklist (admin)',
  operationId: 'adminSeoSettingsControllerGetHealth' })`, `@ApiResponse({ status: 200, type:
  SeoHealthResponseEnvelope })` + 401/403 responses matching the sibling `update()` method's style
- [ ] Draft/scheduled pages and inactive/soft-deleted products/categories are excluded from BOTH the
      numerator and the denominator of every count (per Design Decision 2) — pinned by a repository
      test seeding one draft page + one inactive product + one inactive category alongside published/
      active rows and asserting they're excluded from all six numbers
- [ ] `seo-settings.repository.spec.ts` (or a new file): unit-tests `getContentSeoCounts()` against a
      mocked `PrismaService` — asserts all six `count()` calls use the exact `where` clauses from
      Design Decision 2 (e.g. `pagesTotal` uses `status: 'PUBLISHED'`, never `isActive`)
- [ ] `seo-settings.service.spec.ts`: `getHealth()` maps repository output through
      `SeoHealthEntity.fromCounts` correctly
- [ ] A new or extended e2e spec (`seo-settings.e2e-spec.ts` or similar): `GET
  /api/admin/seo-settings/health` returns 401 unauthenticated, 403 as a non-admin user, and 200 with
      the expected shape as an admin, against seeded fixture data with a known mix of
      published/draft and active/inactive rows
- [ ] `npm run typecheck`/`lint`/`build` clean for store-api
- [ ] Tests pass: `npm run test -w apps/store-api` and `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/seo-settings/seo-settings.repository.ts` — `getContentSeoCounts()` +
  `ContentSeoCounts` interface
- `apps/store-api/src/seo-settings/seo-settings.repository.spec.ts` — new cases
- `apps/store-api/src/seo-settings/seo-settings.service.ts` — `getHealth()`
- `apps/store-api/src/seo-settings/seo-settings.service.spec.ts` — new cases
- `apps/store-api/src/seo-settings/admin-seo-settings.controller.ts` — new `GET /health` route
- `apps/store-api/src/seo-settings/entities/seo-health.entity.ts` — new
- `apps/store-api/src/seo-settings/entities/index.ts` — barrel export
- `apps/store-api/src/seo-settings/dto/seo-health-response.dto.ts` — new
- `apps/store-api/src/seo-settings/dto/index.ts` — barrel export
- `apps/store-api/test/*` (or wherever the existing SEO-settings e2e spec lives) — new health-endpoint
  cases

---

### TASK-269-B: Frontend — `SeoHealthSection` widget on `/settings/seo`

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — read-only UI widget, covered by RTL + MSW per the acceptance criteria below.
**Depends on:** TASK-269-A (needs the endpoint to exist; also needs one Orval regen pass run on
`develop` before this task can compile against a real generated hook — see Dependencies &
Sequencing and Notes)

**Acceptance Criteria:**

- [ ] `shared/config/site.ts` exports `STOREFRONT_URL` per the fallback chain in Technical Design;
      `.env.example` documents the optional `NEXT_PUBLIC_SITE_URL` override
- [ ] `entities/seo-settings/index.ts` re-exports `useAdminSeoSettingsControllerGetHealth` and
      `SeoHealthEntity`
- [ ] `SeoHealthSection` renders three "missing metaTitle" rows (products/categories/pages), each
      showing `dict.seoHealth.autoHint(missing, total)` copy, in a neutral/informational tone (no
      `text-destructive` anywhere in this row group), each linking to its admin list
- [ ] `SeoHealthSection` renders a "SEO-налаштування за замовчуванням" row reflecting whether
      `settings.defaultMetaTitle`/`defaultMetaDescription` are non-empty — `text-warning` tone when
      either is empty, muted/neutral when both are filled; no network call for this row (derived from
      the `settings` prop already passed in from `SeoSettingsView`)
- [ ] `SeoHealthSection` renders a **red** (`text-destructive`) warning banner **only** when
      `settings.noindexSite === true`, with copy explaining the site is currently hidden from search
      engines; renders a neutral/muted "сайт видимий для пошуку" line when `false` (not hidden, not
      an error state)
- [ ] Three outbound links render, each `target="_blank" rel="noopener noreferrer"`, pointing at
      `${STOREFRONT_URL}/sitemap.xml`, `${STOREFRONT_URL}/robots.txt`, `${STOREFRONT_URL}/llms.txt`
- [ ] Loading state (health query in flight) renders a lightweight skeleton/placeholder, not a
      layout-shifting blank; error state (health query failed) shows `dict.seoHealth.loadError`
      without blocking the rest of `/settings/seo` (the edit form below it still renders/functions
      even if the health endpoint is down)
- [ ] `seo-settings-view.tsx` renders `<SeoHealthSection settings={data.data} />` alongside the
      existing `<SeoSettingsForm settings={data.data} />`
- [ ] `seo-health-section.test.tsx` (MSW-stubbed health response + a settings fixture): asserts (a)
      the three auto-hint rows render the correct `N із M` numbers from stubbed counts; (b) a filled
      `defaultMetaTitle`/`defaultMetaDescription` fixture renders the neutral "filled" state, an
      empty one renders the `text-warning` nudge; (c) `noindexSite: true` renders the red banner,
      `false` renders the neutral line; (d) all three outbound links have the correct `href`s built
      from `STOREFRONT_URL`
- [ ] `dictionary.ts`: new `dict.seoHealth` section per Technical Design, no hardcoded UA strings
      inlined in `.tsx`
- [ ] `npm run typecheck`/`lint`/`build` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/shared/config/site.ts` — new
- `apps/store-admin/src/shared/config/index.ts` — export `STOREFRONT_URL`
- `apps/store-admin/.env.example` — document optional `NEXT_PUBLIC_SITE_URL`
- `apps/store-admin/src/entities/seo-settings/index.ts` — re-export the new hook/type
- `apps/store-admin/src/widgets/seo-settings-view/ui/seo-health-section.tsx` — new
- `apps/store-admin/src/widgets/seo-settings-view/ui/seo-health-section.test.tsx` — new
- `apps/store-admin/src/widgets/seo-settings-view/ui/seo-settings-view.tsx` — modified
- `apps/store-admin/src/shared/config/dictionary.ts` — new `dict.seoHealth` section

## Dependencies & Sequencing

- **Internal:** TASK-269-A → TASK-269-B (frontend needs the real endpoint + a regenerated Orval hook
  to compile against). Between A and B, run `npm run generate-api` (or the workspace-local
  equivalent) so the worktree has a working `useAdminSeoSettingsControllerGetHealth` hook to develop
  B against locally — the generated files are gitignored, so this local regen is not committed by the
  implementing agent; the orchestrator's one repo-wide regen pass on `develop` after both TASK-268
  and TASK-269 merge is what makes the hook available to everyone else (per the cross-task note in
  plan 130 and the root of this plan's header).
- **External / shared-worktree:** Same worktree as TASK-268 (`docs/plans/130-serp-preview.md`),
  branch `feature/268-269-seo-ux`, TASK-268 implemented first. Both plans touch
  `apps/store-admin/src/shared/config/dictionary.ts` (both append new top-level sections —
  `dict.seoSnippetPreview` from 268, `dict.seoHealth` from 269 — no line-level collision expected)
  and both touch the SEO admin area, but different files within it: 268 touches
  `features/seo-settings-form/ui/seo-settings-form.tsx`; 269 touches
  `widgets/seo-settings-view/ui/seo-settings-view.tsx` (the parent widget) plus a new sibling
  `seo-health-section.tsx` — no overlapping edits to the same file. Sequencing 268 fully before 269 in
  the same worktree (as directed) means 269's `seo-settings-view.tsx` edit lands after 268's
  `seo-settings-form.tsx` edit is already committed, so there is nothing to rebase.
- TASK-269 does **not** functionally depend on TASK-268 — either plan's endpoint/UI works standalone;
  the shared-worktree sequencing is a process convenience only (per the cross-task note), not a code
  dependency.
- No shared files with TASK-264 (content-map — explicitly deferred SEO-health logic to this plan, per
  plan 122's own Out-of-Scope note) or any other open task.
- Feeds nothing forward directly. Closes the "SEO-health signals" gap plan 122 explicitly deferred.

## Risks & Mitigations

| Risk                                                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner misreads "N products без metaTitle" as an error/bug report, causing unnecessary alarm or busywork manually filling in every field                                                                        | Copy is explicitly informational ("автоматично," not "помилка"/"проблема"); rendered in neutral/muted tone, never `text-destructive` or an alarming icon — this framing is a hard acceptance-criteria requirement, not a style suggestion                                                                                                                        |
| `noindexSite` warning gets lost among the other, lower-stakes checklist rows                                                                                                                                   | Rendered as a visually distinct, full-width red banner (not another checklist row) — the one state on this page that genuinely warrants urgency, matching the BACKLOG row's explicit "RED warning if ON" framing                                                                                                                                                 |
| The new health endpoint becomes a sixth `count()` call site that silently drifts from the "live" definition used elsewhere (e.g. public product list, dashboard `NeedsAction`) if either changes independently | Design Decision 2 explicitly documents and cross-references the canonical gating convention (`isActive`+`deletedAt` for Product, `isActive` for Category, `status` not `isActive` for Page) with a repository test pinning the exact `where` clauses, so a future drift is a visible, intentional code change rather than an accidental copy-paste inconsistency |
| Health-section network failure blocks the whole `/settings/seo` page, including the (unrelated) edit form below it                                                                                             | Explicit acceptance criterion: the health query's `isError` state degrades only its own section; `SeoSettingsForm` continues to render/function independently, since it depends on the separate `useSeoSettingsControllerGetSettings()` query, not the new health query                                                                                          |
| Orval-regen sequencing (agent can't commit generated files, but needs them to compile locally) causes confusion about "is this task actually done"                                                             | Called out explicitly in Dependencies & Sequencing and Task B's own Depends-on note: local regen is expected and necessary for development, commit of generated files is explicitly out of scope for the agent per repo convention, and the orchestrator's single post-merge regen pass is the actual "this is live for everyone" event                          |

## Notes

- This plan's health endpoint is intentionally narrow (six numbers) rather than a general
  "content audit" API — if a future task wants a richer per-item drill-down (e.g. "list the 12
  products missing a metaTitle"), that is a new, separate list-filter capability on the existing
  `/products`/`/categories`/`/pages` admin endpoints (an actual `metaTitle: null` filter param), not
  an extension of this health-summary endpoint.
- The `SeoHealthResponseEnvelope`-in-`dto/` vs. `SeoSettingsResponseEnvelope`-in-controller-file
  inconsistency within the same module is a deliberate, minor divergence — the dashboard module's
  more recent `dto/`-hosted-envelope convention (TASK-248, `NeedsActionResponse`) is treated as the
  current house style for _new_ response envelopes going forward; the original `SeoSettingsController`
  is left untouched (no refactor-for-consistency scope creep).
- `STOREFRONT_URL` in `store-admin` is new but trivial — `NEXT_PUBLIC_APP_URL` already existed in
  `.env.example` unused; this plan is the first thing in `store-admin` to actually read it.
