# Plan 085 — Admin-Managed Static Pages with Rich-Text Editor

**Feature:** TASK-153
**Phase:** Phase 4 extension (Admin Panel) + Phase 5 surface (Storefront / SEO)
**Branch:** `feature/153-admin-static-pages-rich-text`
**Plan file:** `docs/plans/085-admin-static-pages-rich-text.md`
**Created:** 2026-06-29
**Status:** To Do
**Cross-references:** TASK-154 (admin-managed contact block — shares RichTextEditor component)

---

## User Story

As a site admin, I want to create and manage service pages (Privacy Policy, FAQ, Returns &
Exchanges, …) through a rich-text editor in the admin panel, so that customers can read
up-to-date legal and informational content on the storefront without requiring developer
deployments.

> **Key nuance (from source requirement):** The rich-text editor is needed not only for static
> pages but also as the future editor for product descriptions and characteristics. The
> `RichTextEditor` component is placed in `store-admin/src/shared/ui/` from the start so it can
> be reused across all admin forms.

---

## Decision 1 — Editor Library: Tiptap

### Candidates evaluated

| Library        | React 18              | Next.js App Router     | RHF integration                     | Output             | Bundle (gz) | a11y                                | Verdict                               |
| -------------- | --------------------- | ---------------------- | ----------------------------------- | ------------------ | ----------- | ----------------------------------- | ------------------------------------- |
| **Tiptap**     | Yes                   | `dynamic`, `ssr:false` | `editor.getHTML()` + `setContent()` | HTML or JSON       | ~85 KB      | ProseMirror ARIA (`role="textbox"`) | **Selected**                          |
| Lexical (Meta) | Yes                   | Needs SSR guard        | Complex EditorState serialisation   | EditorState / JSON | ~95 KB      | Good                                | Higher integration cost               |
| react-quill    | No (class components) | Broken in App Router   | `onChange`                          | HTML / Delta       | ~50 KB      | Poor                                | Rejected: React 18 incompatible       |
| BlockNote      | Yes                   | `ssr:false`            | Workable                            | JSON               | ~200 KB     | Good                                | Too opinionated (Notion-style blocks) |
| CKEditor 5     | Yes                   | Poor SSR story         | Complex                             | HTML               | ~150 KB     | Good                                | Commercial licence complexity         |

### Why Tiptap

1. **shadcn/ui ecosystem fit** — headless / unstyled; the toolbar is plain HTML; no CSS conflicts
   with the admin's Tailwind / shadcn theme.
2. **React 18 / Next.js App Router** — ProseMirror is DOM-dependent; the component is wrapped
   with `dynamic(() => import('…'), { ssr: false })` and `"use client"`. No hydration issues.
3. **RHF integration (forms.md Rule 2b)** — `Controller` wraps the editor; `field.onChange`
   receives `editor.getHTML()` on every `onUpdate`; value is seeded in a `useEffect` keyed to the
   entity id (`editor.commands.setContent(value)`) so a background refetch never clobbers an
   in-progress edit.
4. **Storefront rendering** — stored HTML is sanitized server-side via `isomorphic-dompurify`
   before `dangerouslySetInnerHTML`. No Tiptap runtime shipped to the storefront.
5. **Reusability** — extension-based: start with `StarterKit`; add `Image`, `Table`, custom
   extensions later when product descriptions migrate to rich text. The component API stays stable.
6. **a11y** — ProseMirror provides `role="textbox"`, `aria-multiline`, keyboard navigation, and
   screen-reader support out of the box.

### Storage format: HTML

Content is stored as `TEXT` in PostgreSQL. Tiptap outputs HTML via `editor.getHTML()`. The
storefront renders it via sanitized `dangerouslySetInnerHTML`, styled with Tailwind
`@tailwindcss/typography` prose classes.

Alternative (JSON) was considered: `editor.getJSON()` preserves the document tree for
re-hydration into the editor without parsing, but requires Tiptap on the storefront for rendering.
HTML is simpler, more portable, and sufficient for static pages.

### XSS mitigation

- **Storefront SSR** — sanitize with `isomorphic-dompurify` (allow-list: default DOMPurify
  config; ensure `target="_blank"` links get `rel="noopener noreferrer"`).
- **Backend** — no HTML sanitization at the API layer (trusted admin input); validate `content`
  is a non-empty string only.
- **Admin editor** — Tiptap is the sole origin of the HTML; no untrusted raw HTML enters the
  editor directly.

---

## Decision 2 — Storefront URL Scheme: `/info/[slug]`

**Recommended:** `apps/store-client/src/app/info/[slug]/page.tsx`

Rationale:

- `/info/` is a semantically clear, short namespace for service / legal content.
- No conflict with existing segments: `/products/`, `/orders/`, `/cart/`, `/(auth)/`, `/account/`.
- Short, memorable URLs: `/info/privacy-policy`, `/info/faq`, `/info/returns`.
- Consistent with UA e-commerce conventions; `/pages/` is more framework-specific (Shopify),
  `/info/` reads as content to the user.

---

## Decision 3 — Prisma `Page` model

New model to add to `apps/store-api/prisma/schema.prisma`:

```prisma
model Page {
  id              String   @id @default(uuid())
  slug            String   @unique
  title           String
  /// Tiptap-generated HTML; sanitized before display on the storefront.
  content         String   @db.Text
  excerpt         String?
  metaTitle       String?  @map("meta_title")
  metaDescription String?  @map("meta_description")
  /// isActive = reversible visibility toggle (admin-only, re-enabled any time).
  /// false = draft / unpublished; true = published and visible on the storefront.
  isActive        Boolean  @default(false) @map("is_active")
  sortOrder       Int      @default(0)     @map("sort_order")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt      @map("updated_at")

  @@index([slug])
  @@index([isActive])
  @@map("pages")
}
```

**No `deletedAt`** — pages are admin-managed content (not user-generated data). Hard DELETE is
appropriate; the `deletedAt` tombstone convention applies to User/Product/Order only (see
`CLAUDE.md` prisma-migration skill). `isActive = false` serves as "draft / unpublished" state
before hard deletion.

Migration command:

```bash
npx prisma migrate dev --name add_page_model -w apps/store-api
```

---

## Backend Module Layout

Mirrors the `category` module (`apps/store-api/src/category/`) exactly:

```
apps/store-api/src/pages/
  pages.module.ts
  pages.controller.ts           — Public: GET /api/pages + GET /api/pages/:slug
  admin-pages.controller.ts     — Admin CRUD: @UseGuards(AdminGuard)
  pages.service.ts
  pages.repository.ts
  pages.service.spec.ts
  pages.repository.spec.ts
  dto/
    create-page.dto.ts
    update-page.dto.ts
    page-list-query.dto.ts
    index.ts
  entities/
    page.entity.ts
    index.ts
  index.ts
```

### Public endpoints

| Method | Path               | Description                                                    |
| ------ | ------------------ | -------------------------------------------------------------- |
| `GET`  | `/api/pages`       | List published pages (`isActive=true`), ordered by `sortOrder` |
| `GET`  | `/api/pages/:slug` | Single published page by slug (404 if draft / missing)         |

### Admin endpoints (`@UseGuards(AdminGuard)` on all)

| Method   | Path                             | Description                                                        |
| -------- | -------------------------------- | ------------------------------------------------------------------ |
| `GET`    | `/api/admin/pages`               | List all pages (published + drafts), paginated + `isActive` filter |
| `GET`    | `/api/admin/pages/:id`           | Page by ID                                                         |
| `POST`   | `/api/admin/pages`               | Create page                                                        |
| `PUT`    | `/api/admin/pages/:id`           | Full update                                                        |
| `PATCH`  | `/api/admin/pages/:id/publish`   | Set `isActive = true`                                              |
| `PATCH`  | `/api/admin/pages/:id/unpublish` | Set `isActive = false`                                             |
| `DELETE` | `/api/admin/pages/:id`           | Hard delete                                                        |

Response envelopes match the project standard: `{ data: PageEntity }` and
`{ data: PageEntity[], meta: PaginationMeta }`.

---

## Admin FSD Layout

```
store-admin/src/
  entities/page/
    index.ts                       — barrel: PageEntity type + Orval read hooks
  features/page-form/
    model/page-schema.ts           — zod schema + RHF types + form→DTO mapper
    ui/page-form.tsx               — form with RichTextEditor (Controller), slug preview
    index.ts
  widgets/page-list/
    ui/admin-page-table.tsx        — table: Title / Slug / Status badge / Actions
    ui/admin-page-table.test.tsx
    index.ts
  widgets/page-form-view/
    ui/create-page-view.tsx
    ui/edit-page-view.tsx
    index.ts
  app/(dashboard)/pages/
    page.tsx                       — list route
    loading.tsx
    new/
      page.tsx                     — create route
      loading.tsx
    [id]/edit/
      page.tsx                     — edit route
      loading.tsx
```

---

## Task Breakdown

### TASK-153-A: Prisma `Page` model + migration

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `Page` model added to `apps/store-api/prisma/schema.prisma` per spec above
- [ ] `npx prisma migrate dev --name add_page_model -w apps/store-api` generates and applies the
      migration without errors
- [ ] `npx prisma generate -w apps/store-api` succeeds; Prisma Client includes `prisma.page`
- [ ] `npm run build -w apps/store-api` compiles without type errors
- [ ] Tests pass: `npm run build -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add `Page` model
- `apps/store-api/prisma/migrations/<timestamp>_add_page_model/migration.sql` — auto-generated

---

### TASK-153-B: `PageRepository` (TDD Red → Green)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes
**Depends on:** TASK-153-A

**Acceptance Criteria:**

- [ ] **Red:** failing unit specs written before implementation covering:
      `findAll(params)`, `findBySlug(slug)`, `findById(id)`, `findAllAdmin(params)`,
      `create(data)`, `update(id, data)`, `publish(id)`, `unpublish(id)`, `delete(id)`
- [ ] **Green:** repository implemented; all specs pass
- [ ] `PrismaService` is the only Prisma import — `PrismaClient` is never imported in the repository
- [ ] `findAll` and `findBySlug` filter `isActive: true`; `findAllAdmin` does not (returns all)
- [ ] `findAllAdmin` supports optional `isActive?: boolean` filter and `page`/`limit` pagination
- [ ] `create` does not catch the Prisma unique constraint error (service layer handles it via
      `ConflictException`)
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/pages/pages.repository.ts`
- `apps/store-api/src/pages/pages.repository.spec.ts`

---

### TASK-153-C: `PageService` (TDD Red → Green)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** Yes
**Depends on:** TASK-153-B

**Acceptance Criteria:**

- [ ] **Red:** failing service specs before implementation covering:
      `findAll`, `findPublishedBySlug`, `findAllAdmin`, `findByIdAdmin`, `create`,
      `update`, `publish`, `unpublish`, `delete`
- [ ] **Green:** service implemented; all specs pass
- [ ] `PageService` imports `PageRepository` only — never imports `PrismaService`
- [ ] `findPublishedBySlug` throws `NotFoundException` when page is absent or `isActive = false`
- [ ] `findByIdAdmin` throws `NotFoundException` when page is not found
- [ ] `create` auto-generates `slug` from `title` via `generateSlug` (same utility used by
      `CategoryService` at `apps/store-api/src/common/utils/slug.util.ts`) when `slug` is
      omitted from the DTO
- [ ] Slug uniqueness conflict from Prisma is caught and re-thrown as `ConflictException`
      with message `'Slug is already taken'`
- [ ] `update` does not allow changing slug to one that is already taken (same `ConflictException`)
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/pages/pages.service.ts`
- `apps/store-api/src/pages/pages.service.spec.ts`

---

### TASK-153-D: Controllers + DTOs + entities + module registration

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-153-C

**Acceptance Criteria:**

- [ ] `PageEntity` class with `@ApiProperty` decorators on all fields; static `fromPrisma()`
      factory — mirrors `CategoryEntity` at
      `apps/store-api/src/category/entities/category.entity.ts`
- [ ] `CreatePageDto` — `@IsString()` on `title` and `content`; `slug` is optional
      `@IsString() @Matches(/^[a-z0-9-]+$/)` (kebab-case guard); `metaTitle`, `metaDescription`,
      `excerpt` optional strings; `isActive` optional boolean; `sortOrder` optional number
- [ ] `UpdatePageDto` — same fields, all optional (no `PartialType` footgun with `slug`)
- [ ] `PageListQueryDto` — `page`, `limit` with defaults; admin variant adds optional `isActive`
- [ ] `PageController` at `/api/pages` — public, no guard, full Swagger decorators
- [ ] `AdminPageController` at `/api/admin/pages` — `@UseGuards(AdminGuard)` at controller level + `@ApiBearerAuth('access-token')` per `apps/store-api/src/category/admin-category.controller.ts`
- [ ] Response envelopes as decorated classes (not bare interfaces) so Orval generates typed hooks
- [ ] `PagesModule` declared; `CategoryModule` pattern used for `controllers`/`providers`/`exports`
- [ ] `PagesModule` imported in `apps/store-api/src/app.module.ts`
- [ ] `npm run build -w apps/store-api` clean
- [ ] `npm run lint -w apps/store-api` clean
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/pages/entities/page.entity.ts`
- `apps/store-api/src/pages/entities/index.ts`
- `apps/store-api/src/pages/dto/create-page.dto.ts`
- `apps/store-api/src/pages/dto/update-page.dto.ts`
- `apps/store-api/src/pages/dto/page-list-query.dto.ts`
- `apps/store-api/src/pages/dto/index.ts`
- `apps/store-api/src/pages/pages.controller.ts`
- `apps/store-api/src/pages/admin-pages.controller.ts`
- `apps/store-api/src/pages/pages.module.ts`
- `apps/store-api/src/pages/index.ts`
- `apps/store-api/src/app.module.ts` — add `PagesModule` to `imports`

---

### TASK-153-E: Orval regeneration (store-admin + store-client)

**Type:** chore
**Scope:** store-admin, store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-153-D

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` produces an updated OpenAPI JSON
- [ ] `npm run generate:api -w apps/store-admin` regenerates
      `apps/store-admin/src/shared/api/generated/` without errors
- [ ] `npm run generate:api -w apps/store-client` regenerates
      `apps/store-client/src/shared/api/generated/` without errors
- [ ] Generated output includes: `PageEntity` model, `CreatePageDto`, `UpdatePageDto`,
      `AdminPageListResponse` models; hooks `usePageControllerFindAll`,
      `usePageControllerFindBySlug`, `useAdminPageControllerFindAll`,
      `useAdminPageControllerFindById`, `useAdminPageControllerCreate`,
      `useAdminPageControllerUpdate`, `useAdminPageControllerPublish`,
      `useAdminPageControllerUnpublish`, `useAdminPageControllerDelete`
- [ ] `npm run typecheck -w apps/store-admin` clean after regen
- [ ] `npm run typecheck -w apps/store-client` clean after regen
- [ ] Generated files are NOT hand-edited (pre-commit hook enforces this)
- [ ] Tests pass: `npm run build -w apps/store-admin && npm run build -w apps/store-client`

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (never hand-edited)
- `apps/store-client/src/shared/api/generated/` — regenerated (never hand-edited)

---

### TASK-153-F: `RichTextEditor` shared/ui component (store-admin)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

> This task is independent and can be started in parallel with TASK-153-A through TASK-153-E.

**Acceptance Criteria:**

- [ ] `@tiptap/react` and `@tiptap/starter-kit` added to `apps/store-admin/package.json`
- [ ] `RichTextEditor` component at
      `apps/store-admin/src/shared/ui/rich-text-editor/rich-text-editor.tsx`
- [ ] Props interface: `value: string` (HTML), `onChange: (html: string) => void`,
      `disabled?: boolean`, `placeholder?: string`, `className?: string`
- [ ] Barrel at `apps/store-admin/src/shared/ui/rich-text-editor/index.ts` exports a
      `dynamic()`-wrapped default so every import site is SSR-safe automatically
- [ ] Toolbar buttons (using Lucide icons already present in the admin): Bold, Italic,
      Underline, Strikethrough | Heading 2, Heading 3 | Bullet list, Ordered list |
      Blockquote | Code block | Horizontal rule | Clear formatting
- [ ] `onUpdate` callback calls `onChange(editor.getHTML())`
- [ ] The component does NOT call `setContent` internally on prop changes — that
      responsibility belongs to the form layer (see TASK-153-G); the editor is initialized
      with `content: value` on mount only
- [ ] Styled with Tailwind: border (`border border-input`), min-height (`min-h-48`),
      focus ring, rounded corners — consistent with other admin `Input`/`Textarea` components
- [ ] Re-exported from `apps/store-admin/src/shared/ui/index.ts`
- [ ] `npm run build -w apps/store-admin` clean
- [ ] Tests pass: `npm run build -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/package.json` — add `@tiptap/react`, `@tiptap/starter-kit`
- `apps/store-admin/src/shared/ui/rich-text-editor/rich-text-editor.tsx`
- `apps/store-admin/src/shared/ui/rich-text-editor/index.ts`
- `apps/store-admin/src/shared/ui/index.ts` — add `RichTextEditor` export

---

### TASK-153-G: Admin pages management UI (FSD: entity + feature + widgets)

**Type:** feat
**Scope:** store-admin
**Complexity:** L (4-8h)
**TDD Required:** No (RTL tests in TASK-153-J)
**Depends on:** TASK-153-E, TASK-153-F

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/page/index.ts` barrel re-exports `PageEntity` type and
      the Orval read hooks (`useAdminPageControllerFindAll`, `useAdminPageControllerFindById`)
- [ ] `apps/store-admin/src/features/page-form/model/page-schema.ts` — zod schema for all
      page form fields; `pageFormValuesToCreateDto` and `pageFormValuesToUpdateDto` mappers
- [ ] `apps/store-admin/src/features/page-form/ui/page-form.tsx` — RHF form:
  - `useEffect(() => { if (page) form.reset(mapPageToFormValues(page)); }, [page?.id])`
    per forms.md Rule 2b; the `page?.id` dependency ensures a full reset only on entity
    navigation, not on background refetches
  - `slug` field auto-generates from `title` via `slugify`
    (`apps/store-admin/src/shared/lib/slug.ts`) when the slug field is untouched
  - `RichTextEditor` wrapped in `<Controller>` — `field.onChange` receives `editor.getHTML()`;
    form seed uses `form.reset()` (Rule 2b path above), not a `setContent` inside the editor
  - Fields: `title` (required), `slug` (auto or manual), `content` (RichTextEditor),
    `excerpt`, `metaTitle`, `metaDescription`, `isActive` toggle, `sortOrder`
  - Submit calls the appropriate mutation (create or update)
- [ ] `apps/store-admin/src/widgets/page-list/ui/admin-page-table.tsx` — columns:
      Title (link to edit), Slug, Status badge (Published / Draft), Sort order,
      Created at, Actions (Edit button / Publish or Unpublish toggle / Delete with confirm)
- [ ] `apps/store-admin/src/widgets/page-form-view/ui/create-page-view.tsx` — calls
      `useAdminPageControllerCreate`; on success redirects to the edit route
- [ ] `apps/store-admin/src/widgets/page-form-view/ui/edit-page-view.tsx` — fetches page
      by ID via `useAdminPageControllerFindById(id)`; calls `useAdminPageControllerUpdate`;
      on 404 redirects to `/pages`; cache invalidated on success — mirrors
      `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`
- [ ] UA dictionary keys added to `apps/store-admin/src/shared/config/dictionary.ts` under
      a new `pages` namespace (headings, form labels, toasts, table column names, etc.)
- [ ] Nav entry `{ label: dict.nav.pages, href: '/pages', icon: FileText }` added to the
      `navItems` array in `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx`;
      `dict.nav.pages` value: `"Сторінки"`
- [ ] `npm run build -w apps/store-admin` + `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/entities/page/index.ts`
- `apps/store-admin/src/entities/index.ts` — add `page` export
- `apps/store-admin/src/features/page-form/model/page-schema.ts`
- `apps/store-admin/src/features/page-form/ui/page-form.tsx`
- `apps/store-admin/src/features/page-form/index.ts`
- `apps/store-admin/src/features/index.ts` — add `page-form` re-export
- `apps/store-admin/src/widgets/page-list/ui/admin-page-table.tsx`
- `apps/store-admin/src/widgets/page-list/index.ts`
- `apps/store-admin/src/widgets/page-form-view/ui/create-page-view.tsx`
- `apps/store-admin/src/widgets/page-form-view/ui/edit-page-view.tsx`
- `apps/store-admin/src/widgets/page-form-view/index.ts`
- `apps/store-admin/src/widgets/index.ts` — add page widget exports
- `apps/store-admin/src/shared/config/dictionary.ts` — add `pages` and `nav.pages`
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — add "Сторінки" nav item

---

### TASK-153-H: Admin app routes for the pages section

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-153-G

**Acceptance Criteria:**

- [ ] Route files created under `apps/store-admin/src/app/(dashboard)/pages/`:
  - `page.tsx` — list view; imports `AdminPageTable` from widgets; `metadata.title` set
  - `loading.tsx` — skeleton fallback (reuse `AdminFormSkeleton` or table skeleton)
  - `new/page.tsx` — create view; imports `CreatePageView`; `metadata.title` set
  - `new/loading.tsx`
  - `[id]/edit/page.tsx` — edit view; `params: Promise<{ id: string }>`; imports `EditPageView`
  - `[id]/edit/loading.tsx`
- [ ] Route pages follow the async `params: Promise<…>` pattern used in
      `apps/store-admin/src/app/(dashboard)/products/[id]/edit/page.tsx`
- [ ] `npm run build -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/pages/page.tsx`
- `apps/store-admin/src/app/(dashboard)/pages/loading.tsx`
- `apps/store-admin/src/app/(dashboard)/pages/new/page.tsx`
- `apps/store-admin/src/app/(dashboard)/pages/new/loading.tsx`
- `apps/store-admin/src/app/(dashboard)/pages/[id]/edit/page.tsx`
- `apps/store-admin/src/app/(dashboard)/pages/[id]/edit/loading.tsx`

---

### TASK-153-I: Storefront `/info/[slug]` dynamic route

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-153-E

**Acceptance Criteria:**

- [ ] `isomorphic-dompurify` added to `apps/store-client/package.json`
- [ ] Server component at `apps/store-client/src/app/info/[slug]/page.tsx`:
  - Calls `pageControllerFindBySlug(slug)` (Orval-generated, server-side)
  - On `404` / any API error: calls `notFound()` — Next.js renders the 404 page
  - Sanitizes content server-side: `DOMPurify.sanitize(page.content)` via
    `isomorphic-dompurify`; store in a local variable; never trust raw `page.content`
    in `dangerouslySetInnerHTML`
  - Content rendered in a `<div className="prose max-w-none" dangerouslySetInnerHTML=...>`
  - `@tailwindcss/typography` installed in `apps/store-client` (if not already) for
    readable prose styling
- [ ] `generateMetadata` function:
  - `title`: `page.metaTitle ?? page.title`
  - `description`: `page.metaDescription ?? page.excerpt ?? undefined`
  - `alternates.canonical`: `${SITE_URL}/info/${page.slug}`
  - Falls back to generic metadata on fetch failure
- [ ] `loading.tsx` at `apps/store-client/src/app/info/[slug]/loading.tsx` — skeleton with
      title bar + content placeholder lines
- [ ] `apps/store-client/src/app/sitemap.ts` extended to fetch and include published pages:
      entries with `url: "${SITE_URL}/info/${page.slug}"`, `lastModified: page.updatedAt`
- [ ] `npm run build -w apps/store-client` + `npm run typecheck -w apps/store-client` clean

**Security note:** DOMPurify must run server-side via `isomorphic-dompurify`; confirm that
`createDOMPurify` is invoked with the `jsdom` JSDOM instance when running in Node (see the
`isomorphic-dompurify` README for the server-side usage pattern). Verify `target="_blank"` in
admin-authored links receives `rel="noopener noreferrer"` via a post-sanitize hook:
`DOMPurify.addHook('afterSanitizeAttributes', ...)`.

**Files to create/modify:**

- `apps/store-client/src/app/info/[slug]/page.tsx`
- `apps/store-client/src/app/info/[slug]/loading.tsx`
- `apps/store-client/src/app/sitemap.ts` — add `Page[]` entries under `/info/`
- `apps/store-client/package.json` — add `isomorphic-dompurify`

---

### TASK-153-J: Tests (service unit + e2e + admin RTL)

**Type:** test
**Scope:** store-api, store-admin
**Complexity:** M (2-4h)
**TDD Required:** Yes (for the service/repository unit tests — written in TASK-153-B/C)
**Depends on:** TASK-153-D, TASK-153-G

**Acceptance Criteria:**

- [ ] `PageRepository` unit specs from TASK-153-B are green
- [ ] `PageService` unit specs from TASK-153-C are green
- [ ] E2E spec at `apps/store-api/test/pages.e2e-spec.ts`:
  - `GET /api/pages` returns only pages where `isActive = true`
  - `GET /api/pages/:slug` returns 404 when page is a draft (`isActive = false`)
  - `GET /api/pages/:slug` returns 404 for an unknown slug
  - `POST /api/admin/pages` without auth token returns 401
  - `POST /api/admin/pages` with a customer token returns 403
  - `POST /api/admin/pages` with admin token creates a page and returns `{ data: PageEntity }`
  - `PUT /api/admin/pages/:id` updates title and content; response reflects changes
  - `PATCH /api/admin/pages/:id/publish` sets `isActive = true`
  - `PATCH /api/admin/pages/:id/unpublish` sets `isActive = false`
  - `DELETE /api/admin/pages/:id` removes the page; subsequent GET returns 404
  - Duplicate slug on create returns 409
- [ ] `AdminPageTable` RTL test at
      `apps/store-admin/src/widgets/page-list/ui/admin-page-table.test.tsx`:
  - Renders page rows with title, slug, and status badge
  - "Опубліковано" badge shown for `isActive = true`; "Чернетка" badge for `false`
  - Edit action button is present
- [ ] `npm run test -w apps/store-api` green
- [ ] `npm run test -w apps/store-admin` green

**Files to create/modify:**

- `apps/store-api/test/pages.e2e-spec.ts`
- `apps/store-admin/src/widgets/page-list/ui/admin-page-table.test.tsx`

---

## Implementation Order

```
TASK-153-F (RichTextEditor — independent)
    |
    +-- can run in parallel with TASK-153-A

TASK-153-A (Prisma schema)
    |
TASK-153-B (PageRepository TDD)
    |
TASK-153-C (PageService TDD)
    |
TASK-153-D (Controllers + module)
    |
TASK-153-E (Orval regen)
    |
    +-- TASK-153-G (Admin UI) — depends on E + F
    |       |
    |   TASK-153-H (Admin routes)
    |
    +-- TASK-153-I (Storefront route) — depends on E only
    |
TASK-153-J (Tests — final verification sweep)
```

---

## Security Checklist

- [ ] `@UseGuards(AdminGuard)` at controller level on `AdminPageController` (enforced 401 before 403)
- [ ] Slug validated as `@Matches(/^[a-z0-9-]+$/)` in DTO; Prisma `@unique` as DB safety net
- [ ] Storefront HTML sanitized via `isomorphic-dompurify` server-side before
      `dangerouslySetInnerHTML`
- [ ] DOMPurify `afterSanitizeAttributes` hook adds `rel="noopener noreferrer"` to links
      with `target="_blank"`
- [ ] Rate limiting: inherits global `ThrottlerGuard` from `AppModule`; no special overrides
      needed for low-traffic admin content endpoints
- [ ] Content field validated as non-empty string only at the API layer — no server-side HTML
      sanitization (trusted admin source)

---

## Cross-references

- **TASK-154** — Admin-managed site contact block (footer). Shares the `RichTextEditor`
  component if a rich text description field is needed. Same `PagesModule` pattern can inspire
  the `SiteSettingsModule`.
- **Product descriptions (future)** — When product `description` migrates from plain text to
  Tiptap HTML, the `RichTextEditor` component from `store-admin/src/shared/ui/` is already
  available. Only the product form needs updating.
