# 104 — Publishing foundation (TASK-185, TASK-187)

FOUNDATION wave of Етап 2 (content-platform CRM). Defines the SHARED, reusable
publishing contract that the blog (TASK-170) and banners (TASK-186) will consume
verbatim, plus server-side rich-text sanitization. Retrofits `Page` as the first
consumer.

Status: implemented + unit-tested (store-api 730 unit green; store-client &
store-admin typecheck + lint + targeted tests green). Migration + Orval regen are
run by the orchestrator.

---

## TASK-185 — Server-side HTML sanitization

`sanitizeRichText(html: string): string` — pure, framework-agnostic util.

- **Import:** `import { sanitizeRichText } from '../common/sanitize';`
  (barrel: `apps/store-api/src/common/sanitize/index.ts`)
- Allow-list (Tiptap-tuned): `h1–h4, p, br, hr, strong, b, em, i, u, s, ul, ol,
li, blockquote, code, pre, a, img, table, thead, tbody, tr, th, td`. Anchors are
  forced to `rel="noopener noreferrer nofollow"`, schemes limited to
  `http/https/mailto` (links) and `http/https/data` (img). `script`/`style`/
  `iframe`/`on*` stripped (contents dropped for `script`/`style`).
- Applied to `Page.content` on **create and update** in `PageService`
  (`content: sanitizeRichText(dto.content)`; update only sanitizes when content
  is present so a partial update never blanks the body).
- **Reuse:** blog/banner write paths MUST call `sanitizeRichText` on any
  Tiptap HTML field before persisting.

Package added: `sanitize-html` + `@types/sanitize-html` in `apps/store-api`.

---

## TASK-187 — Publishing contract

### Exact shared symbols (import from `../publishing` unless noted)

| Symbol                                       | Kind                                                                                                | Import                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `PublishStatus`                              | Prisma enum (`DRAFT`/`SCHEDULED`/`PUBLISHED`)                                                       | `import { PublishStatus } from '@prisma/client'` |
| `PUBLISHABLE_REPOSITORY`                     | DI token (Symbol)                                                                                   | `../publishing`                                  |
| `PublishablePort`                            | port interface `{ publishDue(now): Promise<number>; readonly revalidateTarget?: RevalidateTarget }` | `../publishing`                                  |
| `RevalidateTarget`                           | `{ tags: string[]; paths?: string[] }`                                                              | `../publishing`                                  |
| `PublishingScheduler`                        | cron worker (public `tick()`)                                                                       | `../publishing`                                  |
| `RevalidationNotifier`                       | `revalidate(target): Promise<void>` (best-effort)                                                   | `../publishing`                                  |
| `PublishingModule`                           | `@Global()` module (register in `app.module.ts`)                                                    | `../publishing`                                  |
| `resolvePublishState`                        | pure helper (semantic core)                                                                         | `../publishing`                                  |
| `PublishStateInput` / `ResolvedPublishState` | helper I/O types                                                                                    | `../publishing`                                  |
| `PublishFieldsDto`                           | `@IsOptional @IsEnum(PublishStatus) status?` + `@IsOptional @IsDateString() scheduledAt?`           | `../publishing`                                  |

`resolvePublishState({ status, scheduledAt? }, now)` rules:
`PUBLISHED` → `publishedAt=now, scheduledAt=null`; `SCHEDULED` with **future**
`scheduledAt` → keep it, `publishedAt=null`; `SCHEDULED` with past/absent date →
collapse to `PUBLISHED`; `DRAFT` → both null. (Callers preserve an existing
`publishedAt` for a re-saved already-published row — see `PageService.update`.)

### DI note — there is no Angular-style `multi` in NestJS

The task spec said `{ provide: PUBLISHABLE_REPOSITORY, useExisting: X, multi: true }`.
NestJS has **no** `multi` (it is not on the provider types and is ignored). The
mechanism that actually works: each content module registers **one**
`{ provide: PUBLISHABLE_REPOSITORY, useExisting: XxxRepository }` alias, and
`PublishingScheduler` collects every module's token provider via
`DiscoveryService` (`@nestjs/core`). This keeps content modules fully decoupled —
no edit to `PublishingModule`, no import cycle. Verified by
`publishing.wiring.spec.ts`.

`PublishingModule` is `@Global()` and **exports `RevalidationNotifier`** so a
content module can inject it for its admin-write revalidation WITHOUT importing
`PublishingModule` (which would create a cycle, since the scheduler discovers the
content module).

### Revalidate route contract (storefront)

`POST /api/revalidate` (`apps/store-client/src/app/api/revalidate/route.ts`)

- Header `x-revalidate-secret: <REVALIDATE_SECRET>` (401 on mismatch/absent;
  503 in production when `REVALIDATE_SECRET` unset; dev no-op 200).
- Body `{ tags?: string[]; paths?: string[] }` → `revalidateTag(t)` /
  `revalidatePath(p)` each. Response `{ data: { revalidated: true, tags, paths, now } }`.
- `RevalidationNotifier` POSTs here using `STOREFRONT_REVALIDATE_URL` +
  `REVALIDATE_SECRET`; never throws into the caller.

### Storefront ISR fetchers

`apps/store-client/src/shared/api/pages-server.ts` — server-only tagged `fetch`
helpers (see caveat below):

- `fetchPublishedPage(slug): Promise<PageEntity | null>` — tags
  `['pages', 'page:'+slug]`; null on 404.
- `fetchPublishedPages(): Promise<PageEntity[]>` — tag `['pages']`.
- Tag helpers: `PAGES_COLLECTION_TAG = 'pages'`, `pageDetailTag(slug)`.

---

## How a NEW content model (blog / banner) plugs in

1. **Schema:** add `status PublishStatus @default(DRAFT)`, `publishedAt DateTime?`,
   `scheduledAt DateTime?` and `@@index([status])`. Do **not** add `isActive`
   (Page keeps it only as a legacy mirror — see below).
2. **DTOs:** `extends PublishFieldsDto` on create/update DTOs.
3. **Repository:** implement `PublishablePort` —
   `publishDue(now)` = `updateMany({ where: { status: SCHEDULED, scheduledAt: { lte: now } }, data: { status: PUBLISHED, publishedAt: now, scheduledAt: null } })` returning `count`; expose
   `readonly revalidateTarget = { tags: ['<model>'], paths: ['<hub-path>'] }`.
4. **Module:** provide `{ provide: PUBLISHABLE_REPOSITORY, useExisting: XxxRepository }`
   (no `multi`). No `PublishingModule` edit — the scheduler auto-discovers it.
5. **Service:** on create/update use `resolvePublishState(...)` to derive
   `status/publishedAt/scheduledAt`; sanitize rich text; inject
   `RevalidationNotifier` and call `revalidate({ tags: ['<model>', '<model>:'+slug], paths: [...] })`
   after any publish/unpublish/update-of-published.
6. **Reads:** public queries gate on `status = PUBLISHED`; admin sees all (optional
   `status` filter).
7. **Storefront:** read affected routes through a tagged `fetch` (tags matching the
   notifier) and/or rely on `revalidatePath`.

---

## Decisions & caveats

### `isActive` on `Page`

Kept **only as a derived, read-only mirror** of `status === PUBLISHED`, synced by
the repository on every write (create/update/publish/unpublish/`publishDue`). The
**single** public-visibility gate is `status = PUBLISHED`; `isActive` is never a
gate. Rationale: keeps the existing admin page-list badge/toggle working with zero
churn while satisfying "exactly one gate". New models omit `isActive` entirely.

The admin list filter changed from `isActive` (boolean) to `status`
(`PublishStatus`) — `AdminPageListQueryDto.status`.

### Storefront ISR caveat (why raw `fetch`, not Orval)

The Orval client uses **Axios**, which cannot carry Next.js cache tags
(`next: { tags }`). So `revalidateTag` cannot target Orval reads. The Page-driven
server components (`/legal`, `/legal/[slug]`) were switched to tagged `fetch`
helpers (`pages-server.ts`) — the same server-side raw-fetch/ISR pattern already
used for site-contact on `/info` and `/contact`. `RevalidationNotifier` also sends
`paths` (`/legal`, `/legal/<slug>`) so `revalidatePath` covers rendering
regardless. Draft/scheduled pages still 404 (API filters `status = PUBLISHED`).
`sitemap.ts` continues to use the Orval-based `fetchAllPublishedPages` (untagged —
sitemaps do not need on-demand purge). `/info` reads only site-contact (no Page
data), so no change there.

### Honeypot note

The vendored `next@16` types declare `revalidateTag(tag, profile)` (two args) —
that is **not** the real runtime API (`revalidateTag(tag)`); the route casts to the
real one-arg signature. (See MEMORY: next bundled-docs honeypot.)

### Seed

`prisma/seed.ts` seeds **no** `Page` rows, so there is nothing to backfill there.
Existing DB rows: the migration must backfill `status = PUBLISHED WHERE is_active`
before/while adding the column default (orchestrator concern — migrations are
gitignored; `schema.prisma` is source of truth).

### Env vars (add to `.env.example` files — hook blocks editing them directly)

- store-api: `PUBLISHING_CRON` (default `* * * * *`), `STOREFRONT_REVALIDATE_URL`,
  `REVALIDATE_SECRET`.
- store-client: `REVALIDATE_SECRET` (must match the API's).

### Contract change → Orval regen required

`Page` DTOs now expose `status` + `scheduledAt` (dropped `isActive` from write
DTOs); `PageEntity` adds `status`, `publishedAt`, `scheduledAt`. The orchestrator
must regenerate Orval hooks for both frontends.
