# Plan 026 — Admin Product Management CRUD (TASK-039)

**Roadmap Phase:** Phase 4 — Admin Panel
**Feature:** Admin Product management CRUD — product list, create, edit, and activate/deactivate in `apps/store-admin`.
**Status:** Done (automated gate ✅; manual smoke test pending running app)
**Created:** 2026-06-12
**Completed:** 2026-06-12

> **Implementation note (route path):** The backend endpoint was added as
> `GET /api/products/admin/:id` rather than `GET /api/products/:id`. A bare
> `:id` segment would collide with the existing public `GET /api/products/:slug`
> route (both are single dynamic segments, and whichever is declared first wins
> for _all_ single-segment GETs), breaking storefront detail pages. The `admin/`
> prefix makes it a distinct two-segment route. The Swagger `operationId`
> remains `productControllerFindById`, so the generated hook is still
> `useProductControllerFindById` as planned.
>
> **Implementation note (form numerics):** Numeric fields are modelled as
> strings on the zod _input_ side and transformed to numbers on the _output_
> side (`z.input` vs `z.output`), so `react-hook-form` text inputs need no
> `valueAsNumber`/`parseFloat` juggling — the edit form maps the already-string
> `ProductEntity.price` straight onto the field.

---

## 1. Problem Statement

TASK-038 delivered a fully authenticated admin shell (`AdminShellGuard`, `AuthProvider`, Bearer interceptor). Phase 4's first real content feature is the ability for an admin to manage the product catalog without touching the database directly.

Currently `apps/store-admin` has no product management UI. The dashboard shows a static "Add Product" button that links nowhere. The `Products` sidebar link points to `#`. Product data is read-only from the storefront.

---

## 2. Goals

- Provide a paginated, searchable product list page at `/products` inside the admin shell.
- Allow creating a new product via a form at `/products/new`.
- Allow editing an existing product via a form at `/products/[id]/edit`.
- Allow activating and deactivating products directly from the list (one-click status toggle).
- Gate all pages behind the existing `AdminShellGuard` (already applied at the `(dashboard)` route group level).
- Fix the one backend gap: a `GET /api/products/:id` endpoint (by UUID) needed to pre-populate the edit form.
- Update the `AdminSidebar` so the Products link navigates to `/products`.

## 3. Non-Goals

- Image upload / variant management — the current `CreateProductDto` / `UpdateProductDto` do not include images or variants; those require separate Prisma model work and are out of scope for this task.
- Category CRUD — TASK-040; however, the product form must be able to read the existing category list for a dropdown selector.
- Inline variant editing, bulk operations, or import/export — deferred to Phase 5.
- Pagination beyond simple page/limit controls — no infinite-scroll or complex filters beyond search + category.

---

## 4. Current State — What Already Exists

### 4.1 Backend (store-api) — Product Endpoints

All admin write endpoints already exist and are protected by `AdminGuard`:

| Method  | Path                           | Guard        | Notes                                                                        |
| ------- | ------------------------------ | ------------ | ---------------------------------------------------------------------------- |
| `GET`   | `/api/products`                | Public       | Paginated list with filtering (`isActive`, `categoryId`, `search`, `sortBy`) |
| `GET`   | `/api/products/:slug`          | Public       | Detail by slug with relations                                                |
| `POST`  | `/api/products`                | `AdminGuard` | Create product                                                               |
| `PUT`   | `/api/products/:id`            | `AdminGuard` | Update product by UUID                                                       |
| `PATCH` | `/api/products/:id/deactivate` | `AdminGuard` | Deactivate                                                                   |
| `PATCH` | `/api/products/:id/activate`   | `AdminGuard` | Activate                                                                     |

**Gap identified:** There is no `GET /api/products/:id` (by UUID) admin endpoint. The service method `findById(id)` exists in `ProductService` and `ProductRepository`, but no controller handler exposes it. The edit form needs to fetch a product by its UUID (the ID present in the route `/products/[id]/edit`). Fetching by slug is not suitable here — the admin routes are ID-based.

**Category read access:** `GET /api/categories` (public) and `GET /api/categories/tree` (public) are available and already have generated Orval hooks (`useCategoryControllerGetRootCategories`, `useCategoryControllerGetCategoryTree`). The product form can use these without any backend changes.

### 4.2 Orval-Generated Hooks (store-admin) — Already Available

The Orval generation from TASK-038-J (completed) has produced all required hooks except the one for the missing `GET /api/products/:id` endpoint:

| Hook                             | Source                               | Status                              |
| -------------------------------- | ------------------------------------ | ----------------------------------- |
| `useProductControllerFindAll`    | `GET /api/products`                  | Available                           |
| `useProductControllerCreate`     | `POST /api/products`                 | Available                           |
| `useProductControllerUpdate`     | `PUT /api/products/:id`              | Available                           |
| `useProductControllerDeactivate` | `PATCH /api/products/:id/deactivate` | Available                           |
| `useProductControllerActivate`   | `PATCH /api/products/:id/activate`   | Available                           |
| `useProductControllerFindById`   | `GET /api/products/:id`              | **Missing — needs backend + regen** |

### 4.3 store-admin FSD Structure (Post TASK-038)

```
apps/store-admin/src/
  shared/
    api/
      instance.ts           — Axios + Bearer interceptor + 401 retry (done)
      index.ts              — re-exports all generated hooks + token helpers (done)
      generated/            — Orval output (do not hand-edit)
    ui/                     — shadcn/ui: Button, Input, Label, Badge, Select,
                              Table, Dialog, Sheet, Textarea, DropdownMenu (all present)
    lib/utils.ts            — cn() utility (done)
  entities/
    session/                — AuthProvider, useAuth (done)
  features/
    admin-auth/             — AdminLoginForm, LogoutButton (done)
  widgets/
    admin-shell/            — AdminSidebar, AdminHeader, AdminShellGuard (done)
  app/
    (dashboard)/
      layout.tsx            — AdminShellGuard wraps all children (done)
      page.tsx              — Static dashboard (done)
    (auth)/login/page.tsx   — Admin login (done)
```

### 4.4 Forms Pattern

`store-admin` already uses `react-hook-form` + `@hookform/resolvers/zod` + `zod` in `features/admin-auth/ui/login-form.tsx`. The product form follows the same pattern.

Available shadcn/ui components for the form: `Button`, `Input`, `Label`, `Textarea`, `Select` (+ `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`), `Badge`, `Dialog`, `Sheet`.

---

## 5. Architecture Decisions

### 5.1 Single Backend Gap: GET /api/products/:id

Add a `GET /api/products/:id` endpoint in `ProductController` behind `AdminGuard`. This is a one-line controller method calling the already-implemented `ProductService.findById()`. Swagger decorators follow the existing admin endpoint pattern. After adding this endpoint, Orval is regenerated for `store-admin` to produce `useProductControllerFindById`.

### 5.2 Route Structure (App Router)

All product management pages live inside the existing `(dashboard)` route group, which already applies `AdminShellGuard`:

```
app/(dashboard)/
  products/
    page.tsx              — Product list
    new/
      page.tsx            — Create product
    [id]/
      edit/
        page.tsx          — Edit product
```

No new layout files are needed — the `(dashboard)/layout.tsx` already wraps everything in the admin shell.

### 5.3 FSD Layer Assignments

| Layer                            | Slice                                                                      | Purpose                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `entities/product`               | `index.ts`                                                                 | Re-export `ProductEntity`, `CreateProductDto`, `UpdateProductDto`, generated query/mutation hooks, query key getters |
| `features/product-form`          | `ui/ProductForm.tsx`, `model/productSchema.ts`                             | Reusable create/edit form (zod schema + react-hook-form); accepts `defaultValues` and an `onSubmit` callback         |
| `features/product-status-toggle` | `ui/ProductStatusToggle.tsx`                                               | Activate/deactivate button with optimistic UI                                                                        |
| `widgets/product-list`           | `ui/AdminProductTable.tsx`, `ui/AdminProductTableSkeleton.tsx`, `index.ts` | Table, search bar, pagination, status-toggle column                                                                  |
| `widgets/product-form-view`      | `ui/ProductFormView.tsx`, `index.ts`                                       | Wraps `ProductForm` with page header, back link, loading skeleton for edit pre-population                            |
| `app/(dashboard)/products/`      | `page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`                           | Route pages (Server Components; Suspense wrappers)                                                                   |

Import direction is strictly maintained: `app → widgets → features → entities → shared`.

### 5.4 Edit Form Pre-Population Strategy

The edit page (`/products/[id]/edit`) uses the Orval-generated `useProductControllerFindById(id)` hook to fetch the product by UUID and initialise the form's `defaultValues`. While loading, `ProductFormView` renders a skeleton. On 404 it redirects to `/products`.

The `id` comes from Next.js `params.id` (dynamic segment). The page is a Server Component that passes `id` to the `ProductFormView` client component.

### 5.5 Invalidation Strategy

All mutations (`create`, `update`, `activate`, `deactivate`) invalidate the product list query key (`/api/products`) on success, triggering a refetch of the table. The edit mutation also invalidates the single-product key (`/api/products/:id`).

---

## 6. Tasks

### TASK-039-A: Add GET /api/products/:id admin endpoint (backend gap)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `GET /api/products/:id` handler added to `ProductController`, protected by `@UseGuards(AdminGuard)`.
- [ ] Handler calls `this.productService.findById(id)` and returns `{ data: product }` using the existing `ProductResponseEnvelope` response class.
- [ ] `@ApiOperation({ summary: 'Get product by ID (admin)', operationId: 'productControllerFindById' })` added with `@ApiParam`, `@ApiResponse(200)`, `@ApiResponse(404)`, `@ApiResponse(403)`, `@ApiBearerAuth('access-token')`.
- [ ] Returns 404 (via `ProductService.findById` NotFoundException) when the product does not exist.
- [ ] `npm run test -w apps/store-api` passes (existing specs unaffected).
- [ ] `npm run build -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/product/product.controller.ts` — add `@Get(':id')` handler before the slug handler; use `@Param('id')` with UUID validation note

---

### TASK-039-B: Regenerate Orval hooks for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-039-A

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error.
- [ ] `npm run generate:api -w apps/store-admin` runs without error.
- [ ] `apps/store-admin/src/shared/api/generated/products/products.ts` contains `useProductControllerFindById` hook.
- [ ] `apps/store-admin/src/shared/api/generated/models/` contains any new model types from the new endpoint.
- [ ] `npm run typecheck -w apps/store-admin` passes after regeneration.
- [ ] Generated files are NOT hand-edited.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)

---

### TASK-039-C: Create entities/product barrel slice (store-admin)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-039-B

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/product/index.ts` created, re-exporting from `@/shared/api`:
  - Types: `ProductEntity`, `CreateProductDto`, `UpdateProductDto`, `ProductControllerFindAllParams`
  - Hooks: `useProductControllerFindAll`, `useProductControllerFindById`, `useProductControllerCreate`, `useProductControllerUpdate`, `useProductControllerDeactivate`, `useProductControllerActivate`
  - Query key getters: `getProductControllerFindAllQueryKey`, `getProductControllerFindByIdQueryKey`
- [ ] `apps/store-admin/src/entities/index.ts` updated to re-export `* from './product'`.
- [ ] FSD import rule satisfied: `entities` layer imports only from `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/entities/product/index.ts` — new barrel
- `apps/store-admin/src/entities/index.ts` — add `export * from './product'`

---

### TASK-039-D: Create features/product-form slice (zod schema + ProductForm component)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-039-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/product-form/model/productSchema.ts` created with a `productSchema` zod object matching `CreateProductDto`/`UpdateProductDto` field constraints:
  - `name`: `z.string().min(1).max(255)`
  - `slug`: `z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(255).optional().or(z.literal(''))`
  - `description`: `z.string().max(5000).optional().or(z.literal(''))`
  - `price`: `z.number({ invalid_type_error: 'Price must be a number' }).positive()`
  - `compareAtPrice`: `z.number().positive().optional().or(z.literal(undefined))`
  - `sku`: `z.string().max(50).optional().or(z.literal(''))`
  - `categoryId`: `z.string().uuid('Select a category')`
  - `isActive`: `z.boolean().optional()`
  - Type alias `ProductFormValues = z.infer<typeof productSchema>` exported.
- [ ] `apps/store-admin/src/features/product-form/ui/ProductForm.tsx` created:
  - Props: `{ defaultValues?: Partial<ProductFormValues>; onSubmit: (values: ProductFormValues) => void; isPending: boolean; submitLabel?: string }`
  - Uses `react-hook-form` with `zodResolver(productSchema)`.
  - Category dropdown populated via `useCategoryControllerGetRootCategories()` from `@/shared/api`; shows "Loading…" placeholder while fetching.
  - All fields use `shadcn/ui` components: `Input`, `Label`, `Textarea`, `Select`, `Button`.
  - Error messages displayed beneath each field with `role="alert"`.
  - Submit `Button` is `disabled` while `isPending`.
  - Fully keyboard-navigable; `htmlFor`/`id` pairs on all fields.
- [ ] `apps/store-admin/src/features/product-form/index.ts` barrel exports `ProductForm` and `ProductFormValues`.
- [ ] `apps/store-admin/src/features/index.ts` updated to re-export `* from './product-form'`.
- [ ] FSD: `features` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/model/productSchema.ts` — new file
- `apps/store-admin/src/features/product-form/ui/ProductForm.tsx` — new file
- `apps/store-admin/src/features/product-form/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-039-E: Create features/product-status-toggle slice

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-039-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/product-status-toggle/ui/ProductStatusToggle.tsx` created:
  - Props: `{ productId: string; isActive: boolean }`
  - Calls `useProductControllerActivate` or `useProductControllerDeactivate` depending on current `isActive`.
  - On success, invalidates `getProductControllerFindAllQueryKey()` using `useQueryClient()`.
  - Renders as a `shadcn/ui` `Badge` (variant `"default"` for active, `"secondary"` for inactive) wrapped in a `Button` (variant `"ghost"`, size `"sm"`).
  - Disabled while the mutation is pending.
  - `aria-label` reflects current action: `"Activate product"` or `"Deactivate product"`.
- [ ] `apps/store-admin/src/features/product-status-toggle/index.ts` barrel exports `ProductStatusToggle`.
- [ ] `apps/store-admin/src/features/index.ts` updated to re-export `* from './product-status-toggle'`.
- [ ] FSD: `features` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/features/product-status-toggle/ui/ProductStatusToggle.tsx` — new file
- `apps/store-admin/src/features/product-status-toggle/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-039-F: Create widgets/product-list slice (AdminProductTable + Skeleton + page controls)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-039-D, TASK-039-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/product-list/ui/AdminProductTableSkeleton.tsx` created — renders 5 skeleton rows matching the table's column structure using `animate-pulse` divs.
- [ ] `apps/store-admin/src/widgets/product-list/ui/AdminProductTable.tsx` created:
  - Props: `{ searchQuery?: string; categoryId?: string; isActive?: boolean; page?: number; limit?: number }`
  - Fetches products via `useProductControllerFindAll` with the given params (passes `isActive: undefined` to show all products by default in the admin view).
  - Renders a `shadcn/ui` `Table` with columns: Name, Category ID (text, not resolved), Price, Status (via `ProductStatusToggle`), Created At, Actions.
  - Actions column contains: `Edit` link (`<Link href={/products/${product.id}/edit}>`), with a small `Button` variant `"outline"` size `"sm"`.
  - Shows `AdminProductTableSkeleton` while loading.
  - Shows an empty-state message when `data.data` is empty.
  - Pagination controls (Previous / page N of M / Next) using `Button` components; disables Previous on page 1, Next on last page.
- [ ] `apps/store-admin/src/widgets/product-list/index.ts` exports `AdminProductTable` and `AdminProductTableSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to re-export `* from './product-list'`.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/product-list/ui/AdminProductTableSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/product-list/ui/AdminProductTable.tsx` — new file
- `apps/store-admin/src/widgets/product-list/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-export

---

### TASK-039-G: Create widgets/product-form-view slice (Create + Edit orchestrators)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-039-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/product-form-view/ui/CreateProductView.tsx` created:
  - Uses `useProductControllerCreate` mutation.
  - On success: invalidates `getProductControllerFindAllQueryKey()` and calls `router.push('/products')` with a success toast via `sonner`.
  - On error: shows an error toast.
  - Renders a page section with heading "Create Product", a `Link` back to `/products`, and the `ProductForm` component from `features/product-form`.
- [ ] `apps/store-admin/src/widgets/product-form-view/ui/EditProductView.tsx` created:
  - Props: `{ productId: string }`
  - Fetches product via `useProductControllerFindById(productId)`.
  - While loading: renders a skeleton (animated placeholder rows).
  - On 404 (`error?.response?.status === 404`): redirects to `/products` via `router.replace`.
  - On load success: renders `ProductForm` with `defaultValues` mapped from `ProductEntity` to `ProductFormValues` (price `string → number` conversion via `parseFloat`).
  - Uses `useProductControllerUpdate` mutation.
  - On success: invalidates both the list query key and `getProductControllerFindByIdQueryKey(productId)`; calls `router.push('/products')` with a success toast.
  - Renders a page section with heading "Edit Product", a `Link` back to `/products`.
- [ ] `apps/store-admin/src/widgets/product-form-view/index.ts` exports both components.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to re-export `* from './product-form-view'`.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/product-form-view/ui/CreateProductView.tsx` — new file
- `apps/store-admin/src/widgets/product-form-view/ui/EditProductView.tsx` — new file
- `apps/store-admin/src/widgets/product-form-view/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-export

---

### TASK-039-H: Create app route pages for product management

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-039-F, TASK-039-G

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/app/(dashboard)/products/page.tsx` created:
  - Server Component with `export const metadata = { title: 'Products — Admin' }`.
  - Renders a page header row: heading "Products" + `Link` button "Add Product" pointing to `/products/new`.
  - Renders `<Suspense fallback={<AdminProductTableSkeleton />}><AdminProductTable /></Suspense>`.
  - Search state driven by URL `?search=` and `?page=` query params read via `useSearchParams` inside `AdminProductTable` (client component).
- [ ] `apps/store-admin/src/app/(dashboard)/products/new/page.tsx` created:
  - Server Component with `export const metadata = { title: 'Create Product — Admin' }`.
  - Renders `<Suspense><CreateProductView /></Suspense>`.
- [ ] `apps/store-admin/src/app/(dashboard)/products/[id]/edit/page.tsx` created:
  - Server Component with `generateMetadata` that returns `{ title: 'Edit Product — Admin' }`.
  - Accepts `{ params: { id: string } }` and renders `<EditProductView productId={params.id} />` wrapped in `Suspense`.
- [ ] All three pages are gated by the existing `(dashboard)/layout.tsx` `AdminShellGuard` — no additional guard needed.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/products/page.tsx` — new file
- `apps/store-admin/src/app/(dashboard)/products/new/page.tsx` — new file
- `apps/store-admin/src/app/(dashboard)/products/[id]/edit/page.tsx` — new file

---

### TASK-039-I: Update AdminSidebar Products link

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-039-H

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` updated: `href: '#'` for the Products nav item changed to `href: '/products'`.
- [ ] Active link state: the current approach renders all items with the same style; add `usePathname()` comparison so the active item uses `bg-accent text-accent-foreground` instead of `text-muted-foreground`.
- [ ] `npm run build -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — update Products href + active state logic

---

### TASK-039-J: Build, lint, typecheck verification gate

**Type:** chore
**Scope:** store-api, store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** All previous TASK-039-\* subtasks

**Acceptance Criteria:**

- [ ] `npm run build` (all workspaces) completes without error.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test -w apps/store-api` passes (existing specs unaffected by `GET /api/products/:id` addition).
- [ ] Manual smoke test (running app):
  - Navigate to `/products` in `store-admin` — product table loads with data from seeded products.
  - Click "Add Product" → `/products/new` form renders; submit with valid data → row appears in table.
  - Click "Edit" on a row → `/products/:id/edit` form pre-populates with existing product data; save redirects back to list.
  - Click the status badge on a product → toggles active/inactive; table refreshes.
  - Products sidebar link is active-highlighted when on `/products` routes.

---

## 7. Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                                | Action                                              | Subtask |
| ----------------------------------- | --------------------------------------------------- | ------- |
| `src/product/product.controller.ts` | Modify — add `GET /api/products/:id` admin endpoint | 039-A   |

### Frontend (store-admin)

| File                                                            | Action                                                       | Subtask      |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ------------ |
| `src/shared/api/generated/`                                     | Regenerate (do not hand-edit)                                | 039-B        |
| `src/entities/product/index.ts`                                 | Create — product entity barrel                               | 039-C        |
| `src/entities/index.ts`                                         | Modify — add product re-export                               | 039-C        |
| `src/features/product-form/model/productSchema.ts`              | Create — zod schema                                          | 039-D        |
| `src/features/product-form/ui/ProductForm.tsx`                  | Create — form component                                      | 039-D        |
| `src/features/product-form/index.ts`                            | Create — barrel                                              | 039-D        |
| `src/features/product-status-toggle/ui/ProductStatusToggle.tsx` | Create                                                       | 039-E        |
| `src/features/product-status-toggle/index.ts`                   | Create — barrel                                              | 039-E        |
| `src/features/index.ts`                                         | Modify — add product-form + product-status-toggle re-exports | 039-D, 039-E |
| `src/widgets/product-list/ui/AdminProductTableSkeleton.tsx`     | Create                                                       | 039-F        |
| `src/widgets/product-list/ui/AdminProductTable.tsx`             | Create                                                       | 039-F        |
| `src/widgets/product-list/index.ts`                             | Create — barrel                                              | 039-F        |
| `src/widgets/product-form-view/ui/CreateProductView.tsx`        | Create                                                       | 039-G        |
| `src/widgets/product-form-view/ui/EditProductView.tsx`          | Create                                                       | 039-G        |
| `src/widgets/product-form-view/index.ts`                        | Create — barrel                                              | 039-G        |
| `src/widgets/index.ts`                                          | Modify — add product-list + product-form-view re-exports     | 039-F, 039-G |
| `src/app/(dashboard)/products/page.tsx`                         | Create — product list route                                  | 039-H        |
| `src/app/(dashboard)/products/new/page.tsx`                     | Create — create product route                                | 039-H        |
| `src/app/(dashboard)/products/[id]/edit/page.tsx`               | Create — edit product route                                  | 039-H        |
| `src/widgets/admin-shell/admin-sidebar.tsx`                     | Modify — fix Products href + active state                    | 039-I        |

---

## 8. Testing Strategy

### Backend Unit Tests

No new unit tests are required for the `GET /api/products/:id` endpoint — `ProductService.findById()` is already tested indirectly through the existing service spec and the method is trivial (calls repository, throws NotFoundException on null). If the service spec is found to be missing a `findById` unit test case, add one case in TASK-039-A.

### Frontend Tests

TDD is not required for this feature (no complex business logic). The critical coverage points are:

- `productSchema` validation (edge cases: empty slug, negative price, non-UUID categoryId) — unit test in `features/product-form/model/productSchema.spec.ts` is recommended but not blocking.
- `ProductStatusToggle` mutation dispatch and query invalidation are covered by the manual smoke test in TASK-039-J.

### E2E Tests (NestJS / Supertest)

No new e2e specs required. The `GET /api/products/:id` endpoint behaviour (200 with data, 404 on missing, 403 without admin token) is adequately covered by the existing guard e2e test pattern from TASK-038-C and the pattern can be extended at a later phase if needed.

### Manual Smoke Tests

Described in TASK-039-J acceptance criteria.

---

## 9. Sequencing Diagram

```
TASK-039-A  (backend: GET /api/products/:id)
    └── TASK-039-B  (Orval regen)
              └── TASK-039-C  (entities/product barrel)
                        ├── TASK-039-D  (features/product-form)
                        │         └── TASK-039-G  (widgets/product-form-view)
                        │                   └── TASK-039-H  (app route pages)
                        │                             └── TASK-039-I  (sidebar link)
                        │                                       └── TASK-039-J  (verify)
                        └── TASK-039-E  (features/product-status-toggle)
                                  └── TASK-039-F  (widgets/product-list)
                                            └── TASK-039-H  (app route pages)
```

TASK-039-D and TASK-039-E can be worked on in parallel after TASK-039-C completes. TASK-039-F and TASK-039-G can also be worked in parallel. TASK-039-H gates on both.

---

## 10. Open Questions

1. **Search and filter state**: Should the product list use URL search params (`?search=&page=`) for shareable/bookmarkable state, or React state only? The plan uses URL params (consistent with `store-client` `ProductListPage` pattern) but this can be simplified to React `useState` if preferred.

2. **Category name display**: The table shows `categoryId` (UUID) in the Category column. Resolving the category name would require either a join in the backend list endpoint or a separate lookup per row. For MVP this is acceptable; the full name display can be addressed when TASK-040 is complete and a category lookup hook is reliable.

3. **Variant/image management**: Currently excluded. If the product form needs at minimum a stock count or a primary image URL, those fields are not in `CreateProductDto`/`UpdateProductDto`. This should be validated against the seed data before TASK-039-D is implemented.
