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

| Task ID    | Description                                                 | Status | Plan                           |
| ---------- | ----------------------------------------------------------- | ------ | ------------------------------ |
| TASK-009   | Set up NestJS project structure (Clean Architecture)        | ✅     | docs/plans/001-nestjs-setup.md |
| TASK-010   | Implement Auth module (register, login, refresh tokens)     | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-A | Add RefreshToken model to Prisma schema + migration         | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-B | Install missing auth dependencies (passport, cookie-parser) | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-C | Configure cookie-parser middleware in main.ts               | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-D | Create Auth DTOs (RegisterDto, LoginDto)                    | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-E | Create AuthTokens entity                                    | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-F | Implement AuthRepository                                    | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-G | Write unit tests for AuthService (TDD — Red)                | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-H | Implement AuthService (TDD — Green)                         | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-I | Implement JWT strategies (access + refresh)                 | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-J | Implement guards (JwtAuth, JwtRefresh, Roles)               | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-K | Implement decorators (CurrentUser, Roles)                   | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-L | Implement AuthController (register, login, refresh, logout) | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-M | Register AuthModule in AppModule                            | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-N | Write E2E tests for auth endpoints                          | ✅     | docs/plans/003-auth-module.md  |
| TASK-010-O | Update .env with JWT_REFRESH_SECRET                         | ✅     | docs/plans/003-auth-module.md  |
| TASK-011   | Implement User module (CRUD, profile)                       | ⬜     | —                              |
| TASK-012   | Implement Product module (CRUD, filtering)                  | ⬜     | —                              |
| TASK-013   | Implement Category module (CRUD, hierarchy)                 | ⬜     | —                              |

### API Contract

| Task ID  | Description                                 | Status | Plan |
| -------- | ------------------------------------------- | ------ | ---- |
| TASK-014 | Configure Swagger/OpenAPI decorators        | ⬜     | —    |
| TASK-015 | Set up Orval configuration for store-client | ⬜     | —    |
| TASK-016 | Set up Orval configuration for store-admin  | ⬜     | —    |

### Frontend Scaffold

| Task ID  | Description                                                 | Status | Plan |
| -------- | ----------------------------------------------------------- | ------ | ---- |
| TASK-017 | Set up Next.js App Router (store-client) with FSD structure | ⬜     | —    |
| TASK-018 | Set up Next.js App Router (store-admin) with FSD structure  | ⬜     | —    |
| TASK-019 | Configure Tailwind CSS with semantic design tokens          | ⬜     | —    |
| TASK-020 | Set up shadcn/ui base components (store-admin)              | ⬜     | —    |

---

## Phase 2: Storefront & Cart

| Task ID  | Description                                     | Status | Plan |
| -------- | ----------------------------------------------- | ------ | ---- |
| TASK-021 | Implement Cart module (backend) — TDD           | ⬜     | —    |
| TASK-022 | Implement CartRepository                        | ⬜     | —    |
| TASK-023 | Implement CartService with discount logic — TDD | ⬜     | —    |
| TASK-024 | Implement CartController                        | ⬜     | —    |
| TASK-025 | Generate Orval hooks for Cart API               | ⬜     | —    |
| TASK-026 | Build HomePage (store-client)                   | ⬜     | —    |
| TASK-027 | Build ProductListPage with filtering            | ⬜     | —    |
| TASK-028 | Build ProductDetailPage                         | ⬜     | —    |
| TASK-029 | Build CartPage with quantity management         | ⬜     | —    |
| TASK-030 | Implement AddToCart feature (frontend)          | ⬜     | —    |

---

## Phase 3: Checkout & Orders

| Task ID  | Description                                 | Status | Plan |
| -------- | ------------------------------------------- | ------ | ---- |
| TASK-031 | Implement Order module (backend) — TDD      | ⬜     | —    |
| TASK-032 | Implement Payment integration (Stripe stub) | ⬜     | —    |
| TASK-033 | Implement Checkout feature (frontend)       | ⬜     | —    |
| TASK-034 | Build OrderConfirmationPage                 | ⬜     | —    |
| TASK-035 | Set up order confirmation emails            | ⬜     | —    |

---

## Phase 4: Admin Panel

| Task ID  | Description                             | Status | Plan |
| -------- | --------------------------------------- | ------ | ---- |
| TASK-036 | Implement RBAC (admin roles)            | ⬜     | —    |
| TASK-037 | Admin Product management (CRUD)         | ⬜     | —    |
| TASK-038 | Admin Category management (CRUD)        | ⬜     | —    |
| TASK-039 | Admin Order management (status updates) | ⬜     | —    |
| TASK-040 | Admin User management (view, ban)       | ⬜     | —    |
| TASK-041 | Admin Dashboard (metrics, charts)       | ⬜     | —    |

---

## Phase 5: Polish & Production

| Task ID  | Description                                | Status | Plan |
| -------- | ------------------------------------------ | ------ | ---- |
| TASK-042 | Redis caching for product listings         | ⬜     | —    |
| TASK-043 | Dynamic sitemap.xml + Schema.org microdata | ⬜     | —    |
| TASK-044 | Rate limiting + Helmet + CSRF protection   | ⬜     | —    |
| TASK-045 | Pino structured logging                    | ⬜     | —    |
| TASK-046 | Sentry integration (frontend + backend)    | ⬜     | —    |
| TASK-047 | Abandoned cart detection + email follow-up | ⬜     | —    |
| TASK-048 | GA4 e-commerce events                      | ⬜     | —    |

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
