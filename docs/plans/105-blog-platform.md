# 105 — Blog platform (TASK-170, TASK-172, TASK-173)

BLOG vertical of Етап 2 (content-platform CRM). Ships the backend Blog module,
the admin blog CMS, and the storefront wiring on ONE branch
(`feature/170-blog-platform`, three commits). Builds directly on the publishing
foundation (`docs/plans/104-publishing-foundation.md`) — reused verbatim, no
edits to `PublishingModule`.

Status: implemented + unit-tested (store-api blog 38 green; store-admin blog 12
green; store-client blog 7 green). Migration + Orval regen are run by the
orchestrator (schema.prisma is the source of truth; generated hooks are
git-ignored).

---

## COMMIT 1 — TASK-170 backend (`apps/store-api/src/blog`)

### Schema (`prisma/schema.prisma`, appended)

- `model BlogCategory { id, slug @unique, name, sortOrder, createdAt, updatedAt, posts BlogPost[] }`.
- `model BlogPost { id, slug @unique, title, excerpt, content @db.Text,
coverImageUrl?, coverBlurDataUrl?, authorName, readingMinutes Int?,
featured @default(false), categoryId FK → BlogCategory, status
@default(DRAFT), publishedAt?, scheduledAt?, createdAt, updatedAt,
@@index([status]), @@index([slug]), @@index([categoryId]) }`.
- Reuses `enum PublishStatus`. **No `isActive`** (new content models omit the
  legacy mirror; `status = PUBLISHED` is the single visibility gate).

### Module wiring

- `BlogRepository implements PublishablePort`: `publishDue(now)` bulk-flips due
  SCHEDULED posts → PUBLISHED; `readonly revalidateTarget = { tags: ['blog'],
paths: ['/blog'] }`. Registered under `{ provide: PUBLISHABLE_REPOSITORY,
useExisting: BlogRepository }` — the scheduler auto-discovers it via
  DiscoveryService (no `PublishingModule` edit, no cycle).
- `BlogService` injects `RevalidationNotifier` (from the `@Global()`
  PublishingModule, imported WITHOUT importing the module). It calls
  `sanitizeRichText(content)` on create/update, `resolvePublishState(...)` for
  status/dates, validates the category exists, and revalidates
  `{ tags: ['blog', 'blog:'+slug], paths: ['/blog', '/blog/'+slug] }` after any
  publish / unpublish / update-of-published / delete-of-published; a slug rename
  purges both old and new slug. Category rename/delete revalidates `['blog']` /
  `['/blog']`. A category with posts cannot be deleted (409).

### Endpoints (Swagger tag `Blog`)

Public (`BlogController`, `/api/blog`):

- `GET /api/blog` — `category` slug + `q` (title/excerpt search) + `page`/`limit`
  → `{ data, meta }`. Ordered featured-first, then newest.
- `GET /api/blog/categories` — declared before `:slug` so it is not captured by
  the slug param.
- `GET /api/blog/:slug` — single PUBLISHED post; 404 when draft/scheduled/absent.

Admin (`AdminBlogController`, `/api/admin/blog`, `AdminGuard`):

- Posts: `GET/POST /posts`, `GET/PUT/DELETE /posts/:id`,
  `PATCH /posts/:id/publish|unpublish` (list is all-statuses with optional
  `status` filter, plus the same category/q/pagination).
- Categories: `GET/POST /categories`, `GET/PUT/DELETE /categories/:id`.

`BlogPostEntity` folds the raw `categoryId` FK into a nested `{ id, slug, name }`
category summary — it exposes only client-facing fields.

### Seed decision

`prisma/seed.ts` gains `seedBlog`: 5 categories (`reviews/guides/news/tips/
compare`, UA names matching the storefront chip labels) + the 12 posts that were
hardcoded in `store-client/.../blog/model/posts.ts` (title/excerpt/author/
reading-minutes/featured, `status = PUBLISHED`, `publishedAt` from the file's
dates at 09:00Z). The shared demo article body was **moved server-side** — one
sanitized HTML block reused as every seeded post's `content`. Idempotent upsert
by slug for both categories and posts.

---

## COMMIT 2 — TASK-172 admin CMS (`apps/store-admin`)

- Routes under `app/(dashboard)/blog/`: list, `new`, `[id]/edit`, plus
  `blog/categories/` (list, `new`, `[id]/edit`).
- `features/blog-post-form` — zod schema + RHF form: title, slug (auto from
  title, editable, live preview), category `<select>` (fetched from the admin
  categories endpoint), excerpt, RichTextEditor body, author, cover image URL,
  reading minutes, featured checkbox, and the `status` + `scheduledAt` publish
  contract (`scheduledAt` shown only for SCHEDULED). `features/blog-category-form`
  mirrors it (name, slug, sortOrder).
- `entities/blog` re-exports the generated admin blog hooks + types. Widgets:
  `blog-post-list`, `blog-post-form-view`, `blog-category-list`,
  `blog-category-form-view`. Edit forms use `reset()` keyed to the entity id and
  render-time slug previews per `docs/conventions/forms.md`.
- Sidebar gains a **Blog** entry; UA strings added under
  `dictionary.blogPosts` / `blogPostForm` / `blogCategories` / `blogCategoryForm`
  and `nav.blog`. The generated blog client is re-exported from the shared API
  barrel (`shared/api/index.ts`).

---

## COMMIT 3 — TASK-173 storefront wiring (`apps/store-client`)

- `shared/api/blog-server.ts` — server-only ISR-tagged `fetch` helpers mirroring
  `pages-server.ts`: `fetchPublishedPosts({category,q,page,limit})`,
  `fetchPublishedPost(slug)`, `fetchBlogCategories()`; tags `blog` /
  `blog:<slug>`. Raw `fetch` (not Orval) because Axios cannot carry
  `next:{tags}`; the API notifier purges these exact tags + `/blog` paths.
- The static `model/posts.ts` seed is replaced by a `BlogPostView` view-model +
  `toBlogPostView(entity)` mapper, UA date formatters (short + long),
  slug-derived placeholder hue, and `buildArticleToc(html)` (injects stable
  `<h2 id>`s + returns TOC sections, since the sanitizer strips ids). The
  existing `widgets/blog/ui/**` presentation components are **kept**, adapted to
  the view shape (category badge now renders `categoryName`).
- `/blog` (server) resolves the `?category=`/`?q=`/`?page=` URL contract:
  `BlogView` (client) is now props-driven — the search box debounces a
  `router.push` (`useDebouncedCallback` direct import), chips are `<Link>`s, and
  "load more" is a link that grows the fetched window (`limit = INITIAL +
(page-1)*STEP`, so the grid accumulates on navigation). The featured hero card
  shows only on the unfiltered first view.
- `/blog/[slug]` (server) renders the PUBLISHED post via the tagged fetcher (404
  otherwise), with same-category related reads and a heading-derived TOC.
  JSON-LD (`BlogPosting` + breadcrumb) preserved. `sitemap.ts` enumerates
  published posts via `fetchPublishedPosts({limit:100})`.
- Header primary nav + footer info column gain a **Blog** link (`nav.blog` /
  `footer.infoBlog`).

### Residual follow-up — blog newsletter

`widgets/blog/ui/blog-newsletter.tsx` is left AS-IS: its subscribe/social wiring
is owned by a separate vertical (TASK-166) and is intentionally not wired to any
endpoint here.

---

## Contract change → Orval regen required

New `Blog` Swagger tag with public + admin endpoints and the
`BlogPostEntity` / `BlogCategoryEntity` / DTO models. The orchestrator must
regenerate Orval hooks for both frontends (done locally to typecheck; generated
files are git-ignored and not committed).
