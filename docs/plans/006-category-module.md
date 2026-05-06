# Plan: Category Module (CRUD, Hierarchy)

> **Status:** ⬜ To Do
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-05-05
> **Last Updated:** 2026-05-05

## Overview

Implement the Category module following Clean Architecture (Controller → Service → Repository) with full CRUD operations and hierarchical category support (parent/children relationships). Categories are used to organize products and power the storefront navigation.

The Category model already exists in the Prisma schema with self-referential hierarchy support. This plan covers the backend implementation only — frontend integration will be addressed in later phases.

## Scope

### In Scope

- CategoryRepository with Prisma queries (CRUD + hierarchy)
- CategoryService with business logic (slug generation, hierarchy validation, cycle detection)
- CategoryController with public and admin endpoints
- DTOs for create, update, and list queries
- Domain entity with fromPrisma() mapping
- Unit tests for CategoryService
- Module registration in AppModule

### Out of Scope

- Frontend category navigation UI (Phase 2)
- Admin category management UI (Phase 4)
- Category image upload (deferred — image URL field exists but upload handling is separate)
- Orval hook generation (Phase 1 API Contract tasks)

## User Stories

1. As a **store admin**, I want to **create categories with parent-child relationships**, so that **I can organize products into a logical hierarchy** (e.g., "Phone Cases" → "iPhone Cases" → "iPhone 15 Pro Cases").
2. As a **store admin**, I want to **update category details** (name, slug, description, sort order), so that **I can keep the catalog organized**.
3. As a **store admin**, I want to **activate/deactivate categories**, so that **I can hide categories without deleting them and their products**.
4. As a **storefront user**, I want to **browse the category tree**, so that **I can navigate to products by category**.
5. As a **storefront user**, I want to **view a category's products**, so that **I can browse items in a specific category**.

## Technical Design

### Data Model

The Category model already exists in the Prisma schema:

```prisma
model Category {
  id          String     @id @default(uuid())
  name        String
  slug        String     @unique
  description String?
  image       String?
  parentId    String?    @map("parent_id")
  parent      Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryHierarchy")
  isActive    Boolean    @default(true) @map("is_active")
  sortOrder   Int        @default(0) @map("sort_order")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  products    Product[]

  @@index([slug])
  @@index([parentId])
  @@map("categories")
}
```

**No schema changes needed.** The model already supports:

- Self-referential hierarchy via `parentId` → `parent` / `children`
- Unique slugs for URL-friendly paths
- Sort order for display ordering
- Active/inactive toggle
- Product relation

### Backend (NestJS — Clean Architecture)

#### File Structure

```
apps/store-api/src/category/
  category.module.ts
  category.controller.ts
  category.service.ts
  category.repository.ts
  index.ts
  dto/
    create-category.dto.ts
    update-category.dto.ts
    category-list-query.dto.ts
    index.ts
  entities/
    category.entity.ts
    index.ts
```

#### CategoryRepository

| Method                                | Description                                                 |
| ------------------------------------- | ----------------------------------------------------------- |
| `findById(id: string)`                | Find category by ID                                         |
| `findBySlug(slug: string)`            | Find category by slug                                       |
| `findRootCategories(params)`          | Find top-level categories (parentId = null) with pagination |
| `findCategoryTree()`                  | Build full category tree (all levels)                       |
| `findWithProductCount(id: string)`    | Find category with product count                            |
| `findAllWithProductCount(params)`     | List all categories with product counts (admin)             |
| `create(data)`                        | Create a new category                                       |
| `update(id, data)`                    | Update category fields                                      |
| `deactivate(id)`                      | Set isActive = false                                        |
| `activate(id)`                        | Set isActive = true                                         |
| `findChildren(parentId: string)`      | Find direct children of a category                          |
| `findDescendants(categoryId: string)` | Find all descendants (recursive)                            |

#### CategoryService

| Method                           | Description                                            |
| -------------------------------- | ------------------------------------------------------ |
| `getRootCategories(query)`       | Public: paginated root categories                      |
| `getCategoryTree()`              | Public: full tree for navigation                       |
| `findBySlug(slug)`               | Public: get category by slug with product count        |
| `findById(id)`                   | Admin: get category by ID                              |
| `create(dto)`                    | Admin: create with slug generation + parent validation |
| `update(id, dto)`                | Admin: update with slug uniqueness + cycle detection   |
| `deactivate(id)`                 | Admin: deactivate (cascades to children)               |
| `activate(id)`                   | Admin: activate                                        |
| `findAllWithProductCount(query)` | Admin: list all categories with product counts         |

**Business Rules:**

1. **Slug auto-generation** — If slug not provided, generate from name (same algorithm as Product).
2. **Parent validation** — If parentId is provided, the parent category must exist.
3. **Cycle detection** — Cannot set a category's parent to one of its own descendants (prevents infinite loops).
4. **Slug uniqueness** — Slugs must be globally unique across all categories.
5. **Deactivate cascade** — When deactivating a parent, optionally deactivate all children (configurable).

#### CategoryController

**Public endpoints (no auth required):**

| Method | Route                   | Description                               |
| ------ | ----------------------- | ----------------------------------------- |
| GET    | `/api/categories/tree`  | Get full category tree for navigation     |
| GET    | `/api/categories`       | List root categories (paginated)          |
| GET    | `/api/categories/:slug` | Get category by slug (with product count) |

**Admin endpoints (ADMIN role required):**

| Method | Route                                  | Description                             |
| ------ | -------------------------------------- | --------------------------------------- |
| GET    | `/api/admin/categories`                | List all categories with product counts |
| GET    | `/api/admin/categories/:id`            | Get category by ID                      |
| POST   | `/api/admin/categories`                | Create a new category                   |
| PUT    | `/api/admin/categories/:id`            | Update a category                       |
| PATCH  | `/api/admin/categories/:id/deactivate` | Deactivate a category                   |
| PATCH  | `/api/admin/categories/:id/activate`   | Activate a category                     |

### API Contract

Key endpoints with request/response shapes:

| Method | Path                                   | Request Body        | Response                                         |
| ------ | -------------------------------------- | ------------------- | ------------------------------------------------ |
| GET    | `/api/categories/tree`                 | —                   | `{ data: CategoryTreeNode[] }`                   |
| GET    | `/api/categories`                      | Query params        | `{ data: CategoryEntity[], meta }`               |
| GET    | `/api/categories/:slug`                | —                   | `{ data: CategoryEntity, productCount: number }` |
| GET    | `/api/admin/categories`                | Query params        | `{ data: CategoryWithCount[], meta }`            |
| POST   | `/api/admin/categories`                | `CreateCategoryDto` | `{ data: CategoryEntity }`                       |
| PUT    | `/api/admin/categories/:id`            | `UpdateCategoryDto` | `{ data: CategoryEntity }`                       |
| PATCH  | `/api/admin/categories/:id/deactivate` | —                   | `{ data: CategoryEntity }`                       |
| PATCH  | `/api/admin/categories/:id/activate`   | —                   | `{ data: CategoryEntity }`                       |

### CategoryTreeNode Response Shape

```typescript
interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
  sortOrder: number;
  children: CategoryTreeNode[];
}
```

## Tasks

### TASK-013-A: Create Category DTOs

**Type:** feat
**Scope:** store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `CreateCategoryDto` with validation: name (required, string, max 255), slug (optional, validated format), description (optional, max 2000), image (optional, URL format), parentId (optional, UUID), sortOrder (optional, integer, default 0), isActive (optional, boolean, default true)
- [ ] `UpdateCategoryDto` with all fields optional, same validation rules
- [ ] `CategoryListQueryDto` with pagination (page, limit) and isActive filter
- [ ] All DTOs have `@ApiProperty` decorators for Swagger
- [ ] DTOs exported via `dto/index.ts` barrel file

**Files to create/modify:**

- `apps/store-api/src/category/dto/create-category.dto.ts` — Create validation DTO
- `apps/store-api/src/category/dto/update-category.dto.ts` — Update validation DTO
- `apps/store-api/src/category/dto/category-list-query.dto.ts` — Query params DTO
- `apps/store-api/src/category/dto/index.ts` — Barrel export

---

### TASK-013-B: Create CategoryEntity

**Type:** feat
**Scope:** store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `CategoryEntity` class with all fields from Prisma model
- [ ] Static `fromPrisma()` method that maps Prisma Category to CategoryEntity
- [ ] `CategoryTreeNodeEntity` for tree responses with nested children
- [ ] Static `fromPrismaTree()` method for tree mapping
- [ ] Entities exported via `entities/index.ts` barrel file

**Files to create/modify:**

- `apps/store-api/src/category/entities/category.entity.ts` — Domain entity
- `apps/store-api/src/category/entities/index.ts` — Barrel export

---

### TASK-013-C: Implement CategoryRepository

**Type:** feat
**Scope:** store-api
**Complexity:** M (3h)
**TDD Required:** No
**Depends on:** TASK-013-A, TASK-013-B

**Acceptance Criteria:**

- [ ] `findById(id)` — returns Category or null
- [ ] `findBySlug(slug)` — returns Category or null
- [ ] `findRootCategories(params)` — paginated root categories (parentId = null)
- [ ] `findCategoryTree()` — returns full nested tree structure using Prisma's recursive include
- [ ] `findWithProductCount(id)` — returns category with count of active products
- [ ] `findAllWithProductCount(params)` — paginated list with product counts
- [ ] `create(data)` — creates category, returns created record
- [ ] `update(id, data)` — updates category, returns updated record
- [ ] `deactivate(id)` — sets isActive = false
- [ ] `activate(id)` — sets isActive = true
- [ ] `findChildren(parentId)` — returns direct children
- [ ] `findDescendants(categoryId)` — returns all descendant IDs (for cycle detection)
- [ ] Repository uses PrismaService via constructor injection
- [ ] Repository has Logger for debug/warn messages

**Files to create/modify:**

- `apps/store-api/src/category/category.repository.ts` — All Prisma queries

---

### TASK-013-D: Write failing unit tests for CategoryService (TDD — Red)

**Type:** test
**Scope:** store-api
**Complexity:** M (3h)
**TDD Required:** Yes
**Depends on:** TASK-013-A, TASK-013-B, TASK-013-C

**Acceptance Criteria:**

- [ ] Test file `category.service.spec.ts` exists with describe blocks for each service method
- [ ] Mock repository with all methods defined
- [ ] Tests for `getRootCategories` — paginated results, meta calculation
- [ ] Tests for `findBySlug` — returns entity, throws NotFoundException
- [ ] Tests for `findById` — returns entity, throws NotFoundException
- [ ] Tests for `create` — creates successfully, auto-generates slug, throws ConflictException on duplicate slug, throws NotFoundException on invalid parentId
- [ ] Tests for `update` — updates successfully, throws on duplicate slug, throws NotFoundException
- [ ] Tests for cycle detection — throws BadRequestException when setting parent to descendant
- [ ] Tests for `deactivate` / `activate` — toggles isActive, throws NotFoundException
- [ ] All tests are written and FAILING (Red phase)

**Files to create/modify:**

- `apps/store-api/src/category/category.service.spec.ts` — Unit tests (Red)

---

### TASK-013-E: Implement CategoryService (TDD — Green)

**Type:** feat
**Scope:** store-api
**Complexity:** M (3h)
**TDD Required:** Yes
**Depends on:** TASK-013-D

**Acceptance Criteria:**

- [ ] `getRootCategories(query)` — delegates to repository, maps to entities, returns pagination meta
- [ ] `getCategoryTree()` — builds tree from repository data, maps to tree entities
- [ ] `findBySlug(slug)` — throws NotFoundException if not found
- [ ] `findById(id)` — throws NotFoundException if not found
- [ ] `create(dto)` — auto-generates slug, validates parent exists, checks slug uniqueness, creates via repository
- [ ] `update(id, dto)` — validates existence, checks slug uniqueness (if changed), detects cycles (if parentId changed), updates via repository
- [ ] `deactivate(id)` — validates existence, deactivates via repository
- [ ] `activate(id)` — validates existence, activates via repository
- [ ] `findAllWithProductCount(query)` — admin listing with product counts
- [ ] `generateSlug(name)` — private method, same algorithm as ProductService
- [ ] `detectCycle(categoryId, newParentId)` — private method, prevents circular references
- [ ] All unit tests from TASK-013-D pass (Green phase)

**Files to create/modify:**

- `apps/store-api/src/category/category.service.ts` — Business logic

---

### TASK-013-F: Implement CategoryController

**Type:** feat
**Scope:** store-api
**Complexity:** S (2h)
**TDD Required:** No
**Depends on:** TASK-013-E

**Acceptance Criteria:**

- [ ] Public endpoints: GET `/categories/tree`, GET `/categories`, GET `/categories/:slug`
- [ ] Admin endpoints: GET `/admin/categories`, GET `/admin/categories/:id`, POST `/admin/categories`, PUT `/admin/categories/:id`, PATCH `/admin/categories/:id/deactivate`, PATCH `/admin/categories/:id/activate`
- [ ] Admin endpoints protected with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('ADMIN')`
- [ ] Response envelopes match API contract (`{ data: ... }`, `{ data: ..., meta: ... }`)
- [ ] Proper HTTP status codes (200 for reads, 201 for create, 404 for not found, 409 for conflicts, 400 for bad requests)
- [ ] Swagger decorators on all endpoints

**Files to create/modify:**

- `apps/store-api/src/category/category.controller.ts` — HTTP routes

---

### TASK-013-G: Create CategoryModule and register in AppModule

**Type:** feat
**Scope:** store-api
**Complexity:** S (0.5h)
**TDD Required:** No
**Depends on:** TASK-013-F

**Acceptance Criteria:**

- [ ] `CategoryModule` created with controllers, providers, and exports
- [ ] `CategoryModule` imported in `AppModule`
- [ ] Module exports `CategoryService` for use by other modules (e.g., ProductModule may need it later)
- [ ] Barrel export in `index.ts`

**Files to create/modify:**

- `apps/store-api/src/category/category.module.ts` — Module registration
- `apps/store-api/src/category/index.ts` — Barrel export
- `apps/store-api/src/app.module.ts` — Add CategoryModule import

---

### TASK-013-H: Write E2E tests for Category endpoints

**Type:** test
**Scope:** store-api
**Complexity:** M (3h)
**TDD Required:** No
**Depends on:** TASK-013-G

**Acceptance Criteria:**

- [ ] E2E test file `category.e2e-spec.ts` exists
- [ ] Test module setup with TestApp, PrismaService, and auth mocks
- [ ] Tests for public endpoints: list categories, get by slug, get tree
- [ ] Tests for admin endpoints: create, update, deactivate, activate
- [ ] Tests for hierarchy: create parent → child → verify tree structure
- [ ] Tests for validation: duplicate slug, invalid parent, cycle detection
- [ ] Tests run against isolated test database
- [ ] All E2E tests pass: `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/test/category.e2e-spec.ts` — E2E tests

---

## Migration Steps

1. **No Prisma migration needed** — The Category model already exists in the schema.
2. Create DTOs (TASK-013-A)
3. Create Entity (TASK-013-B)
4. Implement Repository (TASK-013-C)
5. Write failing tests (TASK-013-D)
6. Implement Service (TASK-013-E) — make tests pass
7. Implement Controller (TASK-013-F)
8. Create Module and register (TASK-013-G)
9. Write E2E tests (TASK-013-H)

## Risks & Mitigations

| Risk                                                                                           | Mitigation                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Circular reference in hierarchy** — Admin sets Category A's parent to B, and B's parent to A | Implement `detectCycle()` in service that traverses descendants before allowing parentId change. Throws `BadRequestException`.                                         |
| **Deep nesting performance** — Tree queries with many levels could be slow                     | Use Prisma's recursive `include` with a reasonable depth limit (e.g., 5 levels). For very large catalogs, consider a materialized path or closure table in the future. |
| **Orphaned categories** — Deleting a parent leaves children with invalid parentId              | We use deactivate (not delete) for now. If delete is added later, implement cascade deactivation or reassignment.                                                      |
| **Slug conflicts during updates** — Changing slug to one that exists                           | Service checks slug uniqueness before update, excluding the current category's own slug.                                                                               |
| **Product count accuracy** — Count may be stale if products change                             | Count is computed on-demand via Prisma `count()`. For high-traffic scenarios, consider caching (Phase 5).                                                              |

## Notes

1. **No delete endpoint** — Categories are soft-deleted via `isActive` toggle. This prevents orphaned products and maintains referential integrity. Hard delete can be added later if needed.
2. **Tree depth** — The initial implementation supports unlimited depth via Prisma's recursive queries. If performance becomes an issue, we can limit to 3-5 levels (sufficient for most mobile accessory catalogs).
3. **Sort order** — `sortOrder` field allows admins to control display order within the same level. Default is 0 (newest first when tied).
4. **ProductModule dependency** — ProductModule already references `categoryId`. CategoryModule should be registered before ProductModule in AppModule to ensure proper dependency ordering (though Prisma handles this at the DB level).
5. **Future: breadcrumbs** — The tree structure enables easy breadcrumb generation on the frontend (find path from leaf to root).
