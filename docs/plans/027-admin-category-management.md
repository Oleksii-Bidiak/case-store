# Plan 027 — Admin Category Management CRUD (TASK-040)

**Roadmap Phase:** Phase 4 — Admin Panel
**Feature:** Admin Category management CRUD — category list, create, edit, and activate/deactivate in `apps/store-admin`.
**Status:** Done (automated gate ✅; manual smoke test pending running app)
**Created:** 2026-06-12
**Completed:** 2026-06-12

> **Implementation note (scope of TASK-040-A — wider than planned):** Beyond the
> planned list-endpoint fix, the admin category **single-item** endpoints
> (`findById`, `create`, `update`, `deactivate`, `activate`) were also mis-typed:
> they returned `{ data: CategoryEntity }` at runtime but annotated
> `@ApiResponse({ type: CategoryEntity })` (flat). Orval therefore typed the
> hooks as flat `CategoryEntity`, so `EditCategoryView`'s `data.data` access
> failed typecheck. Fixed by adding a decorated `CategoryResponseEnvelope`
> (`{ data: CategoryEntity }`) and applying it to all five single-item endpoints,
> matching the product controller's `ProductResponseEnvelope` convention.
>
> **Implementation note (Swagger typing gap):** The backend endpoint
> `GET /api/admin/categories` has `@ApiResponse({ status: 200, description: '...' })`
> with no `type:` property. Orval therefore generates `customInstance<void>` for
> `adminCategoryControllerFindAllWithProductCount`, making the entire admin category
> list response untyped on the frontend. TASK-040-A fixes this by adding a typed
> response envelope class and annotating the endpoint, then TASK-040-B regenerates
> Orval. This mirrors the `GET /api/products/admin/:id` gap fixed in TASK-039-A.
>
> The `GET /api/admin/categories/:id` endpoint IS already typed (`type: CategoryEntity`)
> and Orval correctly produces `customInstance<CategoryEntity>` for it. All mutations
> (create, update, activate, deactivate) are also correctly typed. Only the list
> endpoint needs a backend fix.
>
> **Implementation note (form numerics):** `sortOrder` is an integer stored as a number.
> Model it as `z.string()` on the RHF input side (text input) with `.transform(Number)`
> on the output side, consistent with the TASK-039 numeric field pattern for `price`.
>
> **Implementation note (parent selector):** The category form includes a `parentId`
> selector. When editing a category, the selector must exclude the category itself
> from the options list (a category cannot be its own parent). The parent selector
> is populated using `useAdminCategoryControllerFindAllWithProductCount` (the already
> available admin list hook) with a high `limit` to get all categories in one call
> — suitable for MVP where the total category count is small.

---

## 1. Problem Statement

TASK-039 delivered admin Product CRUD. The next parallel feature is category management. Currently `apps/store-admin` has no categories UI. The sidebar has no Categories link. Admins must use the database directly to create or rename categories, which blocks catalog organisation.

---

## 2. Goals

- Provide a paginated, searchable category list page at `/categories` inside the admin shell.
- Allow creating a new category via a form at `/categories/new`.
- Allow editing an existing category via a form at `/categories/[id]/edit`.
- Allow activating and deactivating categories directly from the list (one-click status toggle).
- Display product count per category in the list table (leveraging the `CategoryWithCountEntity` the admin endpoint already returns).
- Provide a parent-category selector in the form, with self-parent prevention on edit.
- Gate all pages behind the existing `AdminShellGuard` (applied at the `(dashboard)` route group level).
- Fix the one backend Swagger gap: `GET /api/admin/categories` needs a typed response envelope so Orval generates a typed hook.
- Add a Categories entry to the `AdminSidebar` nav array.

## 3. Non-Goals

- Image upload — `CreateCategoryDto.image` accepts a URL string; a file-picker widget is out of scope.
- Drag-and-drop reorder of categories — `sortOrder` is a numeric field editable via the form; drag-reorder is a Phase 5 enhancement.
- Nested tree UI — the list view is a flat paginated table with a "Parent" column showing the parent name (or "Root"). A tree-view widget is deferred.
- Deleting categories — the backend does not expose a delete endpoint (only activate/deactivate); deletion is out of scope.
- Inline child-category management — children are visible only as a count or future link.

---

## 4. Current State — What Already Exists

### 4.1 Backend (store-api) — Admin Category Endpoints

All admin write endpoints exist, are protected by `AdminGuard`, and are in `AdminCategoryController` at prefix `admin/categories`:

| Method  | Path                                   | Guard        | Response type (Swagger)          | Orval generated type             |
| ------- | -------------------------------------- | ------------ | -------------------------------- | -------------------------------- |
| `GET`   | `/api/admin/categories`                | `AdminGuard` | **No `type:` — gap**             | `customInstance<void>`           |
| `GET`   | `/api/admin/categories/:id`            | `AdminGuard` | `type: CategoryEntity` (correct) | `customInstance<CategoryEntity>` |
| `POST`  | `/api/admin/categories`                | `AdminGuard` | `type: CategoryEntity` (correct) | `customInstance<CategoryEntity>` |
| `PUT`   | `/api/admin/categories/:id`            | `AdminGuard` | `type: CategoryEntity` (correct) | `customInstance<CategoryEntity>` |
| `PATCH` | `/api/admin/categories/:id/deactivate` | `AdminGuard` | `type: CategoryEntity` (correct) | `customInstance<CategoryEntity>` |
| `PATCH` | `/api/admin/categories/:id/activate`   | `AdminGuard` | `type: CategoryEntity` (correct) | `customInstance<CategoryEntity>` |

**Gap:** `GET /api/admin/categories` returns `CategoryListWithCountResponse` (declared as a TypeScript `interface` in the controller file, not a decorated class) with no `type:` on `@ApiResponse`. Orval generates `void`. The fix is to convert the interface to a decorated class (or add a separate response class) and annotate `@ApiResponse` with `type:`.

The `CategoryWithCountEntity` class already exists and has full `@ApiProperty` decorators — it can be used as the `data` array item type. A new `AdminCategoryListResponse` class (analogous to `CategoryListResponse` on the public controller) is needed.

### 4.2 Orval-Generated Hooks (store-admin) — Already Available

| Hook                                                | Returns          | Status                                  |
| --------------------------------------------------- | ---------------- | --------------------------------------- |
| `useAdminCategoryControllerFindAllWithProductCount` | `void`           | **Untyped — needs backend fix + regen** |
| `useAdminCategoryControllerFindById`                | `CategoryEntity` | Available, typed                        |
| `useAdminCategoryControllerCreate`                  | `CategoryEntity` | Available, typed                        |
| `useAdminCategoryControllerUpdate`                  | `CategoryEntity` | Available, typed                        |
| `useAdminCategoryControllerDeactivate`              | `CategoryEntity` | Available, typed                        |
| `useAdminCategoryControllerActivate`                | `CategoryEntity` | Available, typed                        |

After TASK-040-A + TASK-040-B, `useAdminCategoryControllerFindAllWithProductCount` will return the correct typed envelope.

### 4.3 store-admin FSD Structure (Post TASK-039)

```
apps/store-admin/src/
  shared/
    api/
      instance.ts             — Axios + Bearer interceptor + 401 retry (done)
      index.ts                — re-exports all generated hooks + token helpers (done)
      generated/              — Orval output (do not hand-edit)
    ui/                       — shadcn/ui components present: Button, Input, Label,
                                Badge, Select, Table, Dialog, Sheet, Textarea, Separator
    lib/utils.ts              — cn() utility (done)
  entities/
    session/                  — AuthProvider, useAuth (done)
    product/                  — product barrel slice (done via TASK-039-C)
  features/
    admin-auth/               — AdminLoginForm, LogoutButton (done)
    product-form/             — ProductForm, productSchema (done via TASK-039-D)
    product-status-toggle/    — ProductStatusToggle (done via TASK-039-E)
  widgets/
    admin-shell/              — AdminSidebar (navItems array), AdminHeader (done)
    product-list/             — AdminProductTable, AdminProductTableSkeleton (done)
    product-form-view/        — CreateProductView, EditProductView (done)
  app/
    (dashboard)/
      layout.tsx              — AdminShellGuard wraps all children (done)
      page.tsx                — Static dashboard (done)
      products/               — Product CRUD pages (done via TASK-039-H)
    (auth)/login/page.tsx     — Admin login (done)
```

**Sidebar state:** `AdminSidebar` has `navItems` with Products pointing to `/products` (active). There is currently no Categories entry. A new entry `{ label: "Categories", href: "/categories", icon: Tag }` must be added — `Tag` is available from `lucide-react`.

### 4.4 Category Domain Specifics vs. Products

| Aspect                 | Products                                            | Categories                                                |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| List response type     | `ProductListResponseEnvelope` (typed)               | `void` (gap — fix in TASK-040-A)                          |
| List item type         | `ProductEntity`                                     | `CategoryWithCountEntity` (includes `productCount`)       |
| Find-by-ID return      | `ProductResponseEnvelope` (typed)                   | `CategoryEntity` (already typed)                          |
| Numeric fields         | `price`, `compareAtPrice` (string→number transform) | `sortOrder` (string→number transform)                     |
| Special relation field | `categoryId` (UUID selector → Category list)        | `parentId` (UUID selector → Category list; null = root)   |
| Self-parent guard      | N/A                                                 | Must filter current category from parent selector on edit |
| Status toggle          | activate / deactivate                               | activate / deactivate (identical pattern)                 |
| Extra display column   | Category name (currently UUID — resolved post-040)  | Parent name (resolved via same list data or "Root")       |

---

## 5. Architecture Decisions

### 5.1 Backend Fix: Add Typed Response Envelope for GET /api/admin/categories

The `CategoryListWithCountResponse` interface in `admin-category.controller.ts` is not decorated and cannot be seen by Swagger. Replace it with a decorated class `AdminCategoryListResponse` (defined in the controller file or a separate file) using `@ApiProperty({ type: [CategoryWithCountEntity] })` for the `data` array and a `@ApiProperty({ type: CategoryPaginationMeta })` for `meta`. Then annotate `@ApiResponse({ status: 200, type: AdminCategoryListResponse })` on the `findAllWithProductCount` handler. After Orval regeneration the hook will return the correct typed envelope.

### 5.2 No Route Collision

`GET /api/admin/categories` and `GET /api/admin/categories/:id` are already correctly ordered (the bare `GET` and the parameterised `GET :id` coexist without collision because NestJS matches the literal `/admin/categories` before `:id`). No routing fix is needed unlike the products `/:slug` vs `/:id` collision in TASK-039-A.

### 5.3 Route Structure (App Router)

All category management pages live inside the existing `(dashboard)` route group:

```
app/(dashboard)/
  categories/
    page.tsx          — Category list
    new/
      page.tsx        — Create category
    [id]/
      edit/
        page.tsx      — Edit category
```

No new layout files needed — `(dashboard)/layout.tsx` already wraps with the admin shell.

### 5.4 FSD Layer Assignments

| Layer                             | Slice                                                                        | Purpose                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities/category`               | `index.ts`                                                                   | Re-export `CategoryEntity`, `CategoryWithCountEntity`, `CreateCategoryDto`, `UpdateCategoryDto`, generated query/mutation hooks, query key getters                     |
| `features/category-form`          | `ui/CategoryForm.tsx`, `model/categorySchema.ts`                             | Reusable create/edit form (zod schema + react-hook-form); accepts `defaultValues` and `onSubmit` callback; includes parent-category Select with self-exclusion on edit |
| `features/category-status-toggle` | `ui/CategoryStatusToggle.tsx`                                                | Activate/deactivate badge-button with list-cache invalidation                                                                                                          |
| `widgets/category-list`           | `ui/AdminCategoryTable.tsx`, `ui/AdminCategoryTableSkeleton.tsx`, `index.ts` | Table with columns: Name, Slug, Parent, Products, Sort, Status, Actions; search bar; pagination; status-toggle column                                                  |
| `widgets/category-form-view`      | `ui/CreateCategoryView.tsx`, `ui/EditCategoryView.tsx`, `index.ts`           | Create/Edit orchestrators with sonner toasts, 404 redirect, query invalidation                                                                                         |
| `app/(dashboard)/categories/`     | `page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`                             | Route pages (Server Components; Suspense wrappers)                                                                                                                     |

Import direction strictly maintained: `app → widgets → features → entities → shared`.

### 5.5 Parent-Category Selector Strategy

The `CategoryForm` renders a `shadcn/ui` `Select` component for `parentId`. Options are loaded via `useAdminCategoryControllerFindAllWithProductCount` with `limit: 100` (safe for MVP catalog size). A "Root (no parent)" option maps to `undefined`/`null`. On edit mode, the form receives the current category's `id` as an `excludeId` prop, and the options are filtered to exclude that id before rendering. This prevents a category from being set as its own parent.

### 5.6 Flat Table Choice

The list view is a flat paginated table (not a tree), consistent with the Product list (TASK-039). Each row shows the parent's name by looking up the same response data (a `Map<id, name>` built from the list items). A nested tree view is a non-goal for MVP.

### 5.7 Invalidation Strategy

All mutations invalidate `getAdminCategoryControllerFindAllWithProductCountQueryKey()` on success. The edit mutation additionally invalidates `getAdminCategoryControllerFindByIdQueryKey(id)`. Cache invalidation also triggers a refetch of the product form's category dropdown (which uses the same admin list hook).

---

## 6. Tasks

### TASK-040-A: Fix GET /api/admin/categories Swagger response type (backend gap)

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] A decorated class `AdminCategoryListResponse` is defined in `apps/store-api/src/category/admin-category.controller.ts` (or extracted to a shared response file within the category module) with:
  - `@ApiProperty({ type: [CategoryWithCountEntity] }) data: CategoryWithCountEntity[]`
  - `@ApiProperty({ type: CategoryPaginationMeta }) meta: CategoryPaginationMeta` (reuse or duplicate the existing `CategoryPaginationMeta` class from the public controller, or move it to the entities barrel)
- [ ] `findAllWithProductCount` handler annotated with `@ApiResponse({ status: 200, description: '...', type: AdminCategoryListResponse })`.
- [ ] The controller method return type updated to `Promise<AdminCategoryListResponse>` (replacing the `interface`).
- [ ] `@ApiExtraModels(AdminCategoryListResponse, CategoryWithCountEntity)` added to the controller class decorator (if not already present).
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run test -w apps/store-api` passes (existing specs unaffected).
- [ ] `npm run swagger:export -w apps/store-api` produces a `swagger.json` where `GET /api/admin/categories` has a `200` response schema referencing `AdminCategoryListResponse`.

**Files to create/modify:**

- `apps/store-api/src/category/admin-category.controller.ts` — replace `CategoryListWithCountResponse` interface with decorated `AdminCategoryListResponse` class; annotate `@ApiResponse` with `type:`

---

### TASK-040-B: Regenerate Orval hooks for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-040-A

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error.
- [ ] `npm run generate:api -w apps/store-admin` runs without error.
- [ ] `apps/store-admin/src/shared/api/generated/categories/categories.ts` — `adminCategoryControllerFindAllWithProductCount` now returns `customInstance<AdminCategoryListResponse>` (not `void`).
- [ ] `apps/store-admin/src/shared/api/generated/models/` contains `adminCategoryListResponse.ts` (or equivalent generated model file).
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration.
- [ ] Generated files are NOT hand-edited.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)

---

### TASK-040-C: Create entities/category barrel slice (store-admin)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-040-B

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/category/index.ts` created, re-exporting from `@/shared/api`:
  - Types: `CategoryEntity`, `CategoryWithCountEntity`, `CreateCategoryDto`, `UpdateCategoryDto`, `AdminCategoryControllerFindAllWithProductCountParams`
  - Hooks: `useAdminCategoryControllerFindAllWithProductCount`, `useAdminCategoryControllerFindById`, `useAdminCategoryControllerCreate`, `useAdminCategoryControllerUpdate`, `useAdminCategoryControllerDeactivate`, `useAdminCategoryControllerActivate`
  - Query key getters: `getAdminCategoryControllerFindAllWithProductCountQueryKey`, `getAdminCategoryControllerFindByIdQueryKey`
- [ ] `apps/store-admin/src/entities/index.ts` updated to add `export * from './category'`.
- [ ] FSD import rule satisfied: `entities` layer imports only from `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/entities/category/index.ts` — new barrel
- `apps/store-admin/src/entities/index.ts` — add `export * from './category'`

---

### TASK-040-D: Create features/category-form slice (zod schema + CategoryForm component)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-040-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/category-form/model/categorySchema.ts` created with a `categorySchema` zod object matching `CreateCategoryDto`/`UpdateCategoryDto` constraints:
  - `name`: `z.string().min(1, 'Name is required').max(255)`
  - `slug`: `z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(255).optional().or(z.literal(''))`
  - `description`: `z.string().max(2000).optional().or(z.literal(''))`
  - `image`: `z.string().url('Must be a valid URL').optional().or(z.literal(''))`
  - `parentId`: `z.string().uuid('Must be a valid UUID').optional().or(z.literal(''))`
  - `sortOrder`: `z.string().transform(Number).pipe(z.number().int().min(0)).optional()` (string input, numeric output via transform, consistent with TASK-039 numeric pattern)
  - `isActive`: `z.boolean().optional()`
  - Type alias `CategoryFormValues = z.infer<typeof categorySchema>` exported.
- [ ] `apps/store-admin/src/features/category-form/ui/CategoryForm.tsx` created:
  - Props: `{ defaultValues?: Partial<CategoryFormValues>; onSubmit: (values: CategoryFormValues) => void; isPending: boolean; submitLabel?: string; excludeParentId?: string }` (`excludeParentId` is the current category's id used on edit to prevent self-parenting)
  - Uses `react-hook-form` with `zodResolver(categorySchema)`.
  - Fields rendered using `shadcn/ui` `Input`, `Label`, `Textarea`, `Button`.
  - Parent-category Select: populated via `useAdminCategoryControllerFindAllWithProductCount({ limit: 100 })` from `@/entities/category`; options filtered to exclude the item with id equal to `excludeParentId` (when set); includes a "Root (no parent)" option that maps to an empty string / undefined.
  - `sortOrder` field rendered as a text `Input` (default value rendered as a string; the zod transform handles conversion on submit).
  - All fields have `htmlFor`/`id` pairs; error messages displayed beneath each field with `role="alert"`.
  - Submit `Button` disabled while `isPending`.
  - Fully keyboard-navigable.
- [ ] `apps/store-admin/src/features/category-form/index.ts` barrel exports `CategoryForm` and `CategoryFormValues`.
- [ ] `apps/store-admin/src/features/index.ts` updated to add `export * from './category-form'`.
- [ ] FSD: `features` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/features/category-form/model/categorySchema.ts` — new file
- `apps/store-admin/src/features/category-form/ui/CategoryForm.tsx` — new file
- `apps/store-admin/src/features/category-form/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-040-E: Create features/category-status-toggle slice

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-040-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/category-status-toggle/ui/CategoryStatusToggle.tsx` created:
  - Props: `{ categoryId: string; isActive: boolean }`
  - Calls `useAdminCategoryControllerActivate` or `useAdminCategoryControllerDeactivate` depending on `isActive`.
  - On success, invalidates `getAdminCategoryControllerFindAllWithProductCountQueryKey()` via `useQueryClient()`.
  - Renders as a `shadcn/ui` `Badge` (variant `"default"` for active, `"secondary"` for inactive) wrapped in a `Button` (variant `"ghost"`, size `"sm"`).
  - Disabled while mutation is pending.
  - `aria-label` reflects current action: `"Activate category"` or `"Deactivate category"`.
- [ ] `apps/store-admin/src/features/category-status-toggle/index.ts` barrel exports `CategoryStatusToggle`.
- [ ] `apps/store-admin/src/features/index.ts` updated to add `export * from './category-status-toggle'`.
- [ ] FSD: `features` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/features/category-status-toggle/ui/CategoryStatusToggle.tsx` — new file
- `apps/store-admin/src/features/category-status-toggle/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-040-F: Create widgets/category-list slice (AdminCategoryTable + Skeleton + page controls)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-040-D, TASK-040-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/category-list/ui/AdminCategoryTableSkeleton.tsx` created — 5 animated skeleton rows matching the table column structure.
- [ ] `apps/store-admin/src/widgets/category-list/ui/AdminCategoryTable.tsx` created:
  - Props: `{ search?: string; page?: number; limit?: number; isActive?: boolean }`
  - Reads URL query params (`?search=`, `?page=`) via `useSearchParams()` when props are not supplied (client component with URL-driven state, consistent with products table pattern).
  - Fetches categories via `useAdminCategoryControllerFindAllWithProductCount` with the given params (passes `isActive: undefined` to show all categories by default in admin view).
  - Builds a `Map<id, name>` from the response `data` array for resolving parent names in the table.
  - Renders a `shadcn/ui` `Table` with columns: Name, Slug, Parent (resolved name or "Root"), Products (productCount), Sort, Status (via `CategoryStatusToggle`), Actions.
  - Actions column: `Edit` link (`<Link href={/categories/${category.id}/edit}>`) as a `Button` variant `"outline"` size `"sm"`.
  - Shows `AdminCategoryTableSkeleton` while loading.
  - Shows empty-state message when `data.data` is empty.
  - Pagination controls (Previous / page N of M / Next) using `Button` components; disables Previous on page 1, Next on last page.
- [ ] `apps/store-admin/src/widgets/category-list/index.ts` exports `AdminCategoryTable` and `AdminCategoryTableSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add `AdminCategoryTable` and `AdminCategoryTableSkeleton` exports.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/category-list/ui/AdminCategoryTableSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/category-list/ui/AdminCategoryTable.tsx` — new file
- `apps/store-admin/src/widgets/category-list/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-040-G: Create widgets/category-form-view slice (Create + Edit orchestrators)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-040-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/category-form-view/ui/CreateCategoryView.tsx` created:
  - Uses `useAdminCategoryControllerCreate` mutation.
  - On success: invalidates `getAdminCategoryControllerFindAllWithProductCountQueryKey()`; calls `router.push('/categories')` with a success sonner toast.
  - On error: shows an error sonner toast.
  - Renders a page section with heading "Create Category", a `Link` back to `/categories`, and the `CategoryForm` component (no `excludeParentId` — all categories are valid parents on create).
- [ ] `apps/store-admin/src/widgets/category-form-view/ui/EditCategoryView.tsx` created:
  - Props: `{ categoryId: string }`
  - Fetches category via `useAdminCategoryControllerFindById(categoryId)`.
  - While loading: renders an animated skeleton placeholder.
  - On 404 (`error?.response?.status === 404`): redirects to `/categories` via `router.replace`.
  - On load success: renders `CategoryForm` with `defaultValues` mapped from `CategoryEntity` fields and `excludeParentId={categoryId}` to prevent self-parenting.
  - Uses `useAdminCategoryControllerUpdate` mutation (takes `{ id: string; data: UpdateCategoryDto }`).
  - On success: invalidates both the list query key and `getAdminCategoryControllerFindByIdQueryKey(categoryId)`; navigates to `/categories` with a success toast.
  - Renders a page section with heading "Edit Category", a `Link` back to `/categories`.
- [ ] `apps/store-admin/src/widgets/category-form-view/index.ts` exports `CreateCategoryView` and `EditCategoryView`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add `CreateCategoryView` and `EditCategoryView` exports.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/category-form-view/ui/CreateCategoryView.tsx` — new file
- `apps/store-admin/src/widgets/category-form-view/ui/EditCategoryView.tsx` — new file
- `apps/store-admin/src/widgets/category-form-view/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-040-H: Create app route pages for category management

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-040-F, TASK-040-G

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/app/(dashboard)/categories/page.tsx` created:
  - Server Component with `export const metadata = { title: 'Categories — Admin' }`.
  - Renders a page header row: heading "Categories" + `Link` button "Add Category" pointing to `/categories/new`.
  - Renders `<Suspense fallback={<AdminCategoryTableSkeleton />}><AdminCategoryTable /></Suspense>`.
  - Search and page state driven by URL `?search=` and `?page=` query params (consumed inside `AdminCategoryTable` as a client component).
- [ ] `apps/store-admin/src/app/(dashboard)/categories/new/page.tsx` created:
  - Server Component with `export const metadata = { title: 'Create Category — Admin' }`.
  - Renders `<Suspense><CreateCategoryView /></Suspense>`.
- [ ] `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/page.tsx` created:
  - Server Component with `generateMetadata` returning `{ title: 'Edit Category — Admin' }`.
  - Accepts `{ params: { id: string } }` and renders `<EditCategoryView categoryId={params.id} />` wrapped in `Suspense`.
- [ ] All three pages are gated by the existing `(dashboard)/layout.tsx` `AdminShellGuard` — no additional guard needed.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/categories/page.tsx` — new file
- `apps/store-admin/src/app/(dashboard)/categories/new/page.tsx` — new file
- `apps/store-admin/src/app/(dashboard)/categories/[id]/edit/page.tsx` — new file

---

### TASK-040-I: Add Categories entry to AdminSidebar

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-040-H

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` updated: a new entry `{ label: "Categories", href: "/categories", icon: Tag }` added to `navItems`, inserted after the Products entry.
- [ ] `Tag` imported from `lucide-react` at the top of the file.
- [ ] Active-link logic (`isNavItemActive`) works for the new entry (the existing `startsWith` logic covers `/categories` and `/categories/new` and `/categories/[id]/edit` without change).
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — add Categories nav item + Tag import

---

### TASK-040-J: Build, lint, typecheck verification gate

**Type:** chore
**Scope:** store-api, store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** All previous TASK-040-\* subtasks

**Acceptance Criteria:**

- [ ] `npm run build` (all workspaces) completes without error.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test -w apps/store-api` passes (existing specs unaffected by the Swagger decorator fix).
- [ ] Manual smoke test (running app):
  - Navigate to `/categories` in `store-admin` — category table loads with data from seeded categories including product counts.
  - Categories sidebar link is active-highlighted when on `/categories` routes; Products link remains active on `/products` routes.
  - Click "Add Category" → `/categories/new` form renders; the parent selector shows existing categories; submit with valid data → row appears in table.
  - Click "Edit" on a row → `/categories/[id]/edit` form pre-populates; the parent selector does NOT include the current category in its options; save redirects to list.
  - Click the status badge on a category → toggles active/inactive; table refreshes.
  - Creating a product in the admin panel still shows categories in the category dropdown (verifies shared hook is unbroken by regen).

---

## 7. Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                                        | Action                                                                                 | Subtask |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| `src/category/admin-category.controller.ts` | Modify — add `AdminCategoryListResponse` class + `@ApiResponse type:` on list endpoint | 040-A   |

### Frontend (store-admin)

| File                                                              | Action                                                         | Subtask      |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| `src/shared/api/generated/`                                       | Regenerate (do not hand-edit)                                  | 040-B        |
| `src/entities/category/index.ts`                                  | Create — category entity barrel                                | 040-C        |
| `src/entities/index.ts`                                           | Modify — add `export * from './category'`                      | 040-C        |
| `src/features/category-form/model/categorySchema.ts`              | Create — zod schema                                            | 040-D        |
| `src/features/category-form/ui/CategoryForm.tsx`                  | Create — form component                                        | 040-D        |
| `src/features/category-form/index.ts`                             | Create — barrel                                                | 040-D        |
| `src/features/category-status-toggle/ui/CategoryStatusToggle.tsx` | Create                                                         | 040-E        |
| `src/features/category-status-toggle/index.ts`                    | Create — barrel                                                | 040-E        |
| `src/features/index.ts`                                           | Modify — add category-form + category-status-toggle re-exports | 040-D, 040-E |
| `src/widgets/category-list/ui/AdminCategoryTableSkeleton.tsx`     | Create                                                         | 040-F        |
| `src/widgets/category-list/ui/AdminCategoryTable.tsx`             | Create                                                         | 040-F        |
| `src/widgets/category-list/index.ts`                              | Create — barrel                                                | 040-F        |
| `src/widgets/category-form-view/ui/CreateCategoryView.tsx`        | Create                                                         | 040-G        |
| `src/widgets/category-form-view/ui/EditCategoryView.tsx`          | Create                                                         | 040-G        |
| `src/widgets/category-form-view/index.ts`                         | Create — barrel                                                | 040-G        |
| `src/widgets/index.ts`                                            | Modify — add category-list + category-form-view re-exports     | 040-F, 040-G |
| `src/app/(dashboard)/categories/page.tsx`                         | Create — category list route                                   | 040-H        |
| `src/app/(dashboard)/categories/new/page.tsx`                     | Create — create category route                                 | 040-H        |
| `src/app/(dashboard)/categories/[id]/edit/page.tsx`               | Create — edit category route                                   | 040-H        |
| `src/widgets/admin-shell/admin-sidebar.tsx`                       | Modify — add Categories nav item + Tag import                  | 040-I        |

---

## 8. Testing Strategy

### Backend Unit Tests

No new unit tests are required for TASK-040-A. The fix is purely declarative (adding Swagger decorators and a class wrapper). The `findAllWithProductCount` service method and its interaction with `CategoryRepository` are already covered by the existing category service spec (`category.service.spec.ts`). If the spec is found to be missing a `findAllWithProductCount` test case, one can be added in TASK-040-A without blocking.

### Frontend Tests

TDD is not required for this feature (no complex business logic). Recommended coverage points:

- `categorySchema` validation (edge cases: empty name, invalid slug format, non-UUID parentId, negative sortOrder string) — a unit test in `features/category-form/model/categorySchema.spec.ts` is recommended but not blocking for the gate task.
- `CategoryStatusToggle` mutation dispatch and cache invalidation are verified by the manual smoke test in TASK-040-J.

### E2E Tests (NestJS / Supertest)

No new e2e specs are required. The Swagger decorator fix does not change runtime behaviour. The existing guard e2e tests from TASK-038-C cover 401/403 behaviour for admin category endpoints.

### Manual Smoke Tests

Described in TASK-040-J acceptance criteria.

---

## 9. Sequencing Diagram

```
TASK-040-A  (backend: fix Swagger type on GET /api/admin/categories)
    └── TASK-040-B  (Orval regen — gets typed AdminCategoryListResponse)
              └── TASK-040-C  (entities/category barrel)
                        ├── TASK-040-D  (features/category-form)
                        │         └── TASK-040-G  (widgets/category-form-view)
                        │                   └── TASK-040-H  (app route pages)
                        │                             └── TASK-040-I  (sidebar entry)
                        │                                       └── TASK-040-J  (verify)
                        └── TASK-040-E  (features/category-status-toggle)
                                  └── TASK-040-F  (widgets/category-list)
                                            └── TASK-040-H  (app route pages)
```

TASK-040-D and TASK-040-E can be worked on in parallel after TASK-040-C completes.
TASK-040-F and TASK-040-G can also be worked in parallel.
TASK-040-H gates on both TASK-040-F and TASK-040-G.

---

## 10. Risks and Mitigations

| Risk                                                                                                   | Mitigation                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `AdminCategoryListResponse` class name conflicts with the existing public `CategoryListResponse`       | Use a distinct name `AdminCategoryListResponse` and register it via `@ApiExtraModels` on the controller              |
| Orval regen changes the generated model filename and breaks existing imports of `CategoryListResponse` | Run `typecheck` immediately after regen; any breakage will surface as a TS error before any application code changes |
| Parent name resolution requires a second API call or complex join                                      | Resolved in-memory from the same paginated list response using a `Map<id, name>` — acceptable for MVP page sizes     |
| Self-parent guard missed if `excludeParentId` prop is accidentally undefined on edit                   | Add a `data-testid` or defensive `??` guard in the options filter; document the prop contract in JSDoc               |

---

## 11. Open Questions

1. **Pagination scope for parent selector**: The parent selector loads up to `limit: 100` categories. If the catalog grows beyond 100 categories, the selector will be incomplete. A future improvement would be a searchable combobox with debounced search against the API.

2. **Orphaned child categories on deactivate**: If a root category is deactivated, its children remain active. Whether the UI should warn about this is a UX question left for a future iteration; the backend has no cascading deactivation logic.
