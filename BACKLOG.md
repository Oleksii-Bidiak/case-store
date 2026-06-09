# Project Backlog

> **Single source of truth** for task status across the project.
> Use this file to track what's done, what's in progress, and what's next.
> When you don't know what to do, just ask: "What's next?"

## Status Legend

| Symbol | Meaning                                 |
| ------ | --------------------------------------- |
| ⬜     | To Do — not started                     |
| 🔄     | In Progress — currently being worked on |
| ✅     | Done — completed and tested             |
| ❌     | Blocked — cannot proceed                |
| ⏭️     | Skipped — deferred to later phase       |

---

## Phase 1: Foundation (MVP Core)

### Infrastructure

| Task ID  | Description                                                     | Status | Plan |
| -------- | --------------------------------------------------------------- | ------ | ---- |
| TASK-001 | Set up monorepo with npm workspaces (package.json + .gitignore) | ✅     | —    |
| TASK-002 | Configure Docker Compose (PostgreSQL, Redis)                    | ✅     | —    |
| TASK-003 | Set up ESLint + Prettier + Husky pre-commit hooks               | ✅     | —    |
| TASK-004 | Configure shared TypeScript settings                            | ✅     | —    |
| TASK-005 | Set up CI/CD pipeline (GitHub Actions)                          | ✅     | —    |

### Database

| Task ID  | Description                                                                             | Status | Plan                            |
| -------- | --------------------------------------------------------------------------------------- | ------ | ------------------------------- |
| TASK-006 | Design and create Prisma schema (User, Product, Category, Cart, Order, Address, Review) | ✅     | docs/plans/002-prisma-schema.md |
| TASK-007 | Create initial Prisma migration                                                         | ✅     | docs/plans/002-prisma-schema.md |
| TASK-008 | Set up seed data for development                                                        | ✅     | docs/plans/002-prisma-schema.md |

### Backend Core

| Task ID    | Description                                                                       | Status | Plan                              |
| ---------- | --------------------------------------------------------------------------------- | ------ | --------------------------------- |
| TASK-009   | Set up NestJS project structure (Clean Architecture)                              | ✅     | docs/plans/001-nestjs-setup.md    |
| TASK-010   | Implement Auth module (register, login, refresh tokens)                           | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-A | Add RefreshToken model to Prisma schema + migration                               | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-B | Install missing auth dependencies (passport, cookie-parser)                       | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-C | Configure cookie-parser middleware in main.ts                                     | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-D | Create Auth DTOs (RegisterDto, LoginDto)                                          | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-E | Create AuthTokens entity                                                          | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-F | Implement AuthRepository                                                          | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-G | Write unit tests for AuthService (TDD — Red)                                      | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-H | Implement AuthService (TDD — Green)                                               | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-I | Implement JWT strategies (access + refresh)                                       | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-J | Implement guards (JwtAuth, JwtRefresh, Roles)                                     | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-K | Implement decorators (CurrentUser, Roles)                                         | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-L | Implement AuthController (register, login, refresh, logout)                       | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-M | Register AuthModule in AppModule                                                  | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-N | Write E2E tests for auth endpoints                                                | ✅     | docs/plans/003-auth-module.md     |
| TASK-010-O | Update .env with JWT_REFRESH_SECRET                                               | ✅     | docs/plans/003-auth-module.md     |
| TASK-011   | Implement User module (CRUD, profile)                                             | ✅     | docs/plans/004-user-module.md     |
| TASK-012   | Implement Product module (CRUD, filtering)                                        | ✅     | docs/plans/005-product-module.md  |
| TASK-013   | Implement Category module (CRUD, hierarchy)                                       | ✅     | docs/plans/006-category-module.md |
| TASK-013-A | Create Category DTOs (CreateCategoryDto, UpdateCategoryDto, CategoryListQueryDto) | ✅     | docs/plans/006-category-module.md |
| TASK-013-B | Create CategoryEntity with fromPrisma() and tree mapping                          | ✅     | docs/plans/006-category-module.md |
| TASK-013-C | Implement CategoryRepository with CRUD + hierarchy queries                        | ✅     | docs/plans/006-category-module.md |
| TASK-013-D | Write failing unit tests for CategoryService (TDD — Red)                          | ✅     | docs/plans/006-category-module.md |
| TASK-013-E | Implement CategoryService (TDD — Green)                                           | ✅     | docs/plans/006-category-module.md |
| TASK-013-F | Implement CategoryController with public + admin endpoints                        | ✅     | docs/plans/006-category-module.md |
| TASK-013-G | Create CategoryModule and register in AppModule                                   | ✅     | docs/plans/006-category-module.md |
| TASK-013-H | Write E2E tests for Category endpoints                                            | ✅     | docs/plans/006-category-module.md |

### API Contract

| Task ID  | Description                                 | Status | Plan |
| -------- | ------------------------------------------- | ------ | ---- |
| TASK-014 | Configure Swagger/OpenAPI decorators        | ⬜     | —    |
| TASK-015 | Set up Orval configuration for store-client | ⬜     | —    |
| TASK-016 | Set up Orval configuration for store-admin  | ⬜     | —    |

### Frontend Scaffold

| Task ID      | Description                                                                    | Status | Plan                                                        |
| ------------ | ------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------- |
| TASK-017     | Set up Next.js App Router (store-client) with FSD structure                    | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-A   | Scaffold Next.js project with TypeScript, path aliases, and workspace config   | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-B   | Configure Tailwind CSS with semantic design tokens                             | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-C   | Set up FSD folder structure (widgets, features, entities, shared)              | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-D   | Configure TanStack Query provider                                              | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-E   | Configure Orval API client generation                                          | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-F   | Configure ESLint + import rules for FSD layer boundaries                       | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-G   | Create root layout with global providers                                       | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-017-H   | Verify full build pipeline (build, lint, typecheck, generate:api)              | ✅     | docs/plans/007-store-client-setup.md                        |
| TASK-018     | Set up Next.js App Router (store-admin) with FSD structure                     | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-A   | Scaffold Next.js admin project with TypeScript, path aliases, workspace config | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-B   | Configure Tailwind CSS with semantic design tokens (admin theme)               | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-C   | Initialize shadcn/ui base components                                           | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-D   | Set up FSD folder structure (widgets, features, entities, shared)              | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-E   | Configure TanStack Query provider                                              | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-F   | Configure Orval API client generation                                          | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-G   | Configure ESLint + import rules for FSD layer boundaries                       | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-H   | Create root layout with admin shell (sidebar + header + main)                  | ✅     | docs/plans/008-store-admin-setup.md                         |
| TASK-018-I   | Verify full build pipeline (build, lint, typecheck, generate:api)              | ✅     | docs/plans/008-store-admin-setup.md                         |
| ~~TASK-019~~ | ~~Configure Tailwind CSS with semantic design tokens~~                         | ~~⬜~~ | docs/plans/008-store-admin-setup.md (covered by TASK-018-B) |
| ~~TASK-020~~ | ~~Set up shadcn/ui base components (store-admin)~~                             | ~~⬜~~ | docs/plans/008-store-admin-setup.md (covered by TASK-018-C) |

---

## Phase 2: Storefront & Cart

### Cart Backend

| Task ID  | Description                                          | Status | Plan                          |
| -------- | ---------------------------------------------------- | ------ | ----------------------------- |
| TASK-021 | Create Cart domain entities and DTOs                 | ✅     | docs/plans/009-cart-module.md |
| TASK-022 | Implement CartRepository                             | ✅     | docs/plans/009-cart-module.md |
| TASK-023 | Write failing unit tests for CartService (TDD — Red) | ✅     | docs/plans/009-cart-module.md |
| TASK-024 | Implement CartService (TDD — Green)                  | ✅     | docs/plans/009-cart-module.md |
| TASK-025 | Implement CartController and CartModule              | ✅     | docs/plans/009-cart-module.md |
| TASK-026 | Write E2E tests for Cart endpoints                   | ⬜     | docs/plans/009-cart-module.md |
| TASK-027 | Generate Orval hooks for Cart API                    | ⬜     | docs/plans/009-cart-module.md |

### Storefront Pages

| Task ID  | Description                             | Status | Plan |
| -------- | --------------------------------------- | ------ | ---- |
| TASK-028 | Build HomePage (store-client)           | ⬜     | —    |
| TASK-029 | Build ProductListPage with filtering    | ⬜     | —    |
| TASK-030 | Build ProductDetailPage                 | ⬜     | —    |
| TASK-031 | Build CartPage with quantity management | ⬜     | —    |
| TASK-032 | Implement AddToCart feature (frontend)  | ⬜     | —    |

---

## Phase 3: Checkout & Orders

| Task ID  | Description                                 | Status | Plan |
| -------- | ------------------------------------------- | ------ | ---- |
| TASK-033 | Implement Order module (backend) — TDD      | ⬜     | —    |
| TASK-034 | Implement Payment integration (Stripe stub) | ⬜     | —    |
| TASK-035 | Implement Checkout feature (frontend)       | ⬜     | —    |
| TASK-036 | Build OrderConfirmationPage                 | ⬜     | —    |
| TASK-037 | Set up order confirmation emails            | ⬜     | —    |

---

## Phase 4: Admin Panel

| Task ID  | Description                             | Status | Plan |
| -------- | --------------------------------------- | ------ | ---- |
| TASK-038 | Implement RBAC (admin roles)            | ⬜     | —    |
| TASK-039 | Admin Product management (CRUD)         | ⬜     | —    |
| TASK-040 | Admin Category management (CRUD)        | ⬜     | —    |
| TASK-041 | Admin Order management (status updates) | ⬜     | —    |
| TASK-042 | Admin User management (view, ban)       | ⬜     | —    |
| TASK-043 | Admin Dashboard (metrics, charts)       | ⬜     | —    |

---

## Phase 5: Polish & Production

| Task ID  | Description                                | Status | Plan |
| -------- | ------------------------------------------ | ------ | ---- |
| TASK-044 | Redis caching for product listings         | ⬜     | —    |
| TASK-045 | Dynamic sitemap.xml + Schema.org microdata | ⬜     | —    |
| TASK-046 | Rate limiting + Helmet + CSRF protection   | ⬜     | —    |
| TASK-047 | Pino structured logging                    | ⬜     | —    |
| TASK-048 | Sentry integration (frontend + backend)    | ⬜     | —    |
| TASK-049 | Abandoned cart detection + email follow-up | ⬜     | —    |
| TASK-050 | GA4 e-commerce events                      | ⬜     | —    |

---

## How to Update This File

### When starting a task:

```
Change the status emoji from ⬜ to 🔄
```

### When completing a task:

```
Change the status emoji from 🔄 to ✅
```

### When blocking a task:

```
Change the status emoji to ❌ and add a note explaining why
```

### When generating a plan:

```
Add the plan file path to the "Plan" column, e.g.:
| TASK-021 | Cart module | 🔄 | docs/plans/001-cart.md |
```

### When you don't know what's next:

Just ask the build or task-planner agent: **"What's the next task?"**
It will read BACKLOG.md, find the first ⬜ task, and start working on it.
