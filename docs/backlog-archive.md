# Backlog Archive — Completed Work (Phases 1–5)

> Detailed audit trail of shipped tasks, moved out of `BACKLOG.md` to keep the live
> backlog scannable. Every row here is **✅ Done**. The live `BACKLOG.md` keeps a
> one-row-per-parent summary that links back to the same `docs/plans/NNN-*.md`.
>
> **Note on historical ID collisions:** early phases reused some IDs. They are preserved
> as-shipped and annotated inline. Going forward, all new IDs are a single monotonic
> counter (see `BACKLOG.md` → "How to Update"). Known collisions:
>
> - `TASK-054` = "restock variant lines on cancel" (Phase 3 review) **and** "monorepo
>   architecture review" (Tech Debt).
> - `TASK-058` = "OrderRepository.createFromCart coverage" (Phase 3 review) **and**
>   "consolidate orval.config" (Tech Debt).
> - `TASK-059` = "FSD move CheckoutView skeleton" (Phase 3 review) **and** "instance
>   baseURL alignment" (Tech Debt).
> - `TASK-051-O` appeared as two rows in the source; merged into one below.
> - `TASK-069/070` were renumbered to `TASK-071/072` for the bugfix set to avoid colliding
>   with the localization plan (`TASK-069`) and redesign (`TASK-068`); `docs/manual-qa-master.md`
>   still references the original 069/070 labels.
> - `TASK-019`/`TASK-020` were superseded by `TASK-018-B`/`TASK-018-C` and dropped.

## Status Legend

| Symbol | Meaning                     |
| ------ | --------------------------- |
| ✅     | Done — completed and tested |
| 🔄     | In Progress                 |
| ⬜     | To Do                       |

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

| Task ID  | Description                                 | Status | Plan                                                           |
| -------- | ------------------------------------------- | ------ | -------------------------------------------------------------- |
| TASK-014 | Configure Swagger/OpenAPI decorators        | ✅     | — (done in main.ts; via TASK-009/010/025)                      |
| TASK-015 | Set up Orval configuration for store-client | ✅     | docs/plans/007-store-client-setup.md (completed as TASK-017-E) |
| TASK-016 | Set up Orval configuration for store-admin  | ✅     | docs/plans/013-store-admin-orval.md                            |

### Frontend Scaffold

| Task ID    | Description                                                                    | Status | Plan                                 |
| ---------- | ------------------------------------------------------------------------------ | ------ | ------------------------------------ |
| TASK-017   | Set up Next.js App Router (store-client) with FSD structure                    | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-A | Scaffold Next.js project with TypeScript, path aliases, workspace config       | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-B | Configure Tailwind CSS with semantic design tokens                             | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-C | Set up FSD folder structure (widgets, features, entities, shared)              | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-D | Configure TanStack Query provider                                              | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-E | Configure Orval API client generation                                          | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-F | Configure ESLint + import rules for FSD layer boundaries                       | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-G | Create root layout with global providers                                       | ✅     | docs/plans/007-store-client-setup.md |
| TASK-017-H | Verify full build pipeline (build, lint, typecheck, generate:api)              | ✅     | docs/plans/007-store-client-setup.md |
| TASK-018   | Set up Next.js App Router (store-admin) with FSD structure                     | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-A | Scaffold Next.js admin project with TypeScript, path aliases, workspace config | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-B | Configure Tailwind CSS with semantic design tokens (admin theme)               | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-C | Initialize shadcn/ui base components                                           | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-D | Set up FSD folder structure (widgets, features, entities, shared)              | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-E | Configure TanStack Query provider                                              | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-F | Configure Orval API client generation                                          | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-G | Configure ESLint + import rules for FSD layer boundaries                       | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-H | Create root layout with admin shell (sidebar + header + main)                  | ✅     | docs/plans/008-store-admin-setup.md  |
| TASK-018-I | Verify full build pipeline (build, lint, typecheck, generate:api)              | ✅     | docs/plans/008-store-admin-setup.md  |

> `TASK-019` (Tailwind tokens) and `TASK-020` (shadcn/ui base) were **superseded** by
> `TASK-018-B` and `TASK-018-C` respectively and dropped from the active backlog.

---

## Phase 2: Storefront & Cart

### Cart Backend

| Task ID    | Description                                                                          | Status | Plan                               |
| ---------- | ------------------------------------------------------------------------------------ | ------ | ---------------------------------- |
| TASK-021   | Create Cart domain entities and DTOs                                                 | ✅     | docs/plans/009-cart-module.md      |
| TASK-022   | Implement CartRepository                                                             | ✅     | docs/plans/009-cart-module.md      |
| TASK-023   | Write failing unit tests for CartService (TDD — Red)                                 | ✅     | docs/plans/009-cart-module.md      |
| TASK-024   | Implement CartService (TDD — Green)                                                  | ✅     | docs/plans/009-cart-module.md      |
| TASK-025   | Implement CartController and CartModule                                              | ✅     | docs/plans/009-cart-module.md      |
| TASK-026   | Write E2E tests for Cart endpoints                                                   | ✅     | docs/plans/010-cart-e2e-tests.md   |
| TASK-027   | Generate Orval hooks for Cart API                                                    | ✅     | docs/plans/011-cart-orval-hooks.md |
| TASK-027-A | Add swagger:export script to store-api (writes swagger.json without starting server) | ✅     | docs/plans/011-cart-orval-hooks.md |
| TASK-027-B | Update store-client orval.config.ts to use static swagger.json as input              | ✅     | docs/plans/011-cart-orval-hooks.md |
| TASK-027-C | Add explicit operationId to Cart controller @ApiOperation decorators                 | ✅     | docs/plans/011-cart-orval-hooks.md |
| TASK-027-D | Run npm run generate:api and verify all Cart hooks and types                         | ✅     | docs/plans/011-cart-orval-hooks.md |
| TASK-027-E | Update shared/api/index.ts to re-export generated Cart hooks and model types         | ✅     | docs/plans/011-cart-orval-hooks.md |

### Storefront Pages

| Task ID    | Description                                                                    | Status | Plan                                          |
| ---------- | ------------------------------------------------------------------------------ | ------ | --------------------------------------------- |
| TASK-028   | Build HomePage (store-client)                                                  | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-A | Scaffold FSD entity layers for Product and Category                            | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-B | Create shared/ui Skeleton primitive                                            | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-C | Create shared/ui ProductCard base component                                    | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-D | Create HeroBanner widget (static Server Component)                             | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-E | Create CategoryNav widget with skeleton                                        | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-F | Create ProductGrid widget with skeleton                                        | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-028-G | Wire up app/page.tsx and verify full build                                     | ✅     | docs/plans/012-store-client-homepage.md       |
| TASK-029   | Build ProductListPage with filtering                                           | ✅     | docs/plans/014-store-client-product-list.md   |
| TASK-029-A | Create features/product-filters slice (controls + debounced search)            | ✅     | docs/plans/014-store-client-product-list.md   |
| TASK-029-B | Create widgets/product-list slice (ProductList, Pagination, Skeleton)          | ✅     | docs/plans/014-store-client-product-list.md   |
| TASK-029-C | Create widgets/product-list/ProductListView (URL-state orchestrator)           | ✅     | docs/plans/014-store-client-product-list.md   |
| TASK-029-D | Create app/products/page.tsx and wire full build                               | ✅     | docs/plans/014-store-client-product-list.md   |
| TASK-030   | Build ProductDetailPage                                                        | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-030-A | Update entities/product barrel with detail types and hook                      | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-030-B | Create widgets/product-detail/ProductDetailSkeleton                            | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-030-C | Create widgets/product-detail/ProductImageGallery                              | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-030-D | Create widgets/product-detail/ProductVariantSelector                           | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-030-E | Create widgets/product-detail/ProductDetailView (orchestrator)                 | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-030-F | Create app/products/[slug]/page.tsx and wire full build                        | ✅     | docs/plans/015-store-client-product-detail.md |
| TASK-031   | Build CartPage with quantity management (guest + user)                         | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-031-A | Create entities/cart barrel slice                                              | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-031-B | Create widgets/cart/CartSkeleton                                               | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-031-C | Create widgets/cart/CartItemRow                                                | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-031-D | Create widgets/cart/CartSummary                                                | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-031-E | Create widgets/cart/CartView (orchestrator; guest cart always works)           | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-031-F | Create app/cart/page.tsx and verify full build                                 | ✅     | docs/plans/016-store-client-cart-page.md      |
| TASK-032   | Implement AddToCart feature (frontend)                                         | ✅     | docs/plans/019-add-to-cart-feature.md         |
| TASK-032-A | Create features/add-to-cart/AddToCartButton (useAddToCart + cart invalidation) | ✅     | docs/plans/019-add-to-cart-feature.md         |
| TASK-032-B | Integrate AddToCartButton into ProductDetailView                               | ✅     | docs/plans/019-add-to-cart-feature.md         |
| TASK-032-C | Build verification (build + typecheck + lint)                                  | ✅     | docs/plans/019-add-to-cart-feature.md         |

### Guest Cart Backend (Plan 017)

| Task ID    | Description                                                                                                                                                         | Status | Plan                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------ |
| TASK-051   | Guest cart backend — nullable userId, cartToken cookie, optional-auth, merge on login                                                                               | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-A | Prisma migration: nullable Cart.userId + unique token column                                                                                                        | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-B | Implement OptionalJwtAuthGuard (no throw on missing JWT)                                                                                                            | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-C | Implement CartIdentityInterceptor + @CartIdentity() decorator                                                                                                       | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-D | Update CartRepository: findByToken, findOrCreate(identity), assignCartToUser, addItem by cartId                                                                     | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-E | Update CartService: dual-identity signatures + mergeGuestCart() (TDD)                                                                                               | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-F | Update CartController: OptionalJwtAuthGuard + CartIdentityInterceptor                                                                                               | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-G | Update CartModule: register new providers                                                                                                                           | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-H | Wire cart-merge into AuthController login + register                                                                                                                | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-I | E2E tests: guest cart, authenticated cart, merge on login, quantity clamp, merge failure                                                                            | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-J | Regenerate Orval API hooks (store-client + store-admin) after cart controller changes                                                                               | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-K | Review WARN#1: transactional mergeGuestCart; clear cartToken cookie only on success                                                                                 | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-L | Review WARN#2: handle findOrCreate vs assignCartToUser race (P2002)                                                                                                 | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-M | Review: unit tests for guard/interceptor/merge-failure + mixed merge case                                                                                           | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-N | Review WARN#4: migration applied + guest/merge e2e done                                                                                                             | ✅     | docs/plans/017-guest-cart-backend.md |
| TASK-051-O | Real-DB integration harness (test:int vs isolated store_test) + CI job; caught & fixed null-variant cart-line upsert (Prisma rejects null in compound-unique where) | ✅     | docs/plans/017-guest-cart-backend.md |

### Storefront Auth — store-client (Plan 018)

| Task ID    | Description                                                                                   | Status | Plan                              |
| ---------- | --------------------------------------------------------------------------------------------- | ------ | --------------------------------- |
| TASK-052   | Storefront auth: login/register/logout + JWT in-memory + 401 interceptor + header auth widget | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-A | Update shared/api/instance.ts: Authorization interceptor + 401→refresh retry                  | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-B | Create entities/session slice: AuthContext, useAuth, AuthProvider                             | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-C | Install form dependencies: react-hook-form, @hookform/resolvers, zod                          | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-D | Create features/auth/LoginForm                                                                | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-E | Create features/auth/RegisterForm                                                             | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-F | Create features/auth/LogoutButton                                                             | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-G | Create widgets/header/HeaderAuth + wire into Header                                           | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-H | Create app/(auth)/login/page.tsx route                                                        | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-I | Create app/(auth)/register/page.tsx route                                                     | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-J | Update CartView to remove 401 sign-in state                                                   | ✅     | docs/plans/018-storefront-auth.md |
| TASK-052-K | Full integration verification (build + lint + typecheck)                                      | ✅     | docs/plans/018-storefront-auth.md |

---

## Phase 3: Checkout & Orders

| Task ID    | Description                                                                                        | Status | Plan                                        |
| ---------- | -------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| TASK-033   | Implement Order module (backend) — TDD                                                             | ✅     | docs/plans/020-order-module.md              |
| TASK-033-A | Confirm no migration needed for Order/OrderItem/enums                                              | ✅     | docs/plans/020-order-module.md              |
| TASK-033-B | Export CartRepository from CartModule                                                              | ✅     | docs/plans/020-order-module.md              |
| TASK-033-C | Create Order domain entities                                                                       | ✅     | docs/plans/020-order-module.md              |
| TASK-033-D | Create Order DTOs                                                                                  | ✅     | docs/plans/020-order-module.md              |
| TASK-033-E | Implement OrderRepository (createFromCart tx, findByUserId, findById, updateStatus, updatePayment) | ✅     | docs/plans/020-order-module.md              |
| TASK-033-F | Write failing unit tests for OrderService (TDD — Red)                                              | ✅     | docs/plans/020-order-module.md              |
| TASK-033-G | Implement OrderService (TDD — Green)                                                               | ✅     | docs/plans/020-order-module.md              |
| TASK-033-H | Implement OrderController + OrderModule + register in AppModule                                    | ✅     | docs/plans/020-order-module.md              |
| TASK-033-I | Write E2E tests for Order endpoints                                                                | ✅     | docs/plans/020-order-module.md              |
| TASK-033-J | Regenerate Orval API hooks for Orders                                                              | ✅     | docs/plans/020-order-module.md              |
| TASK-035   | Implement Checkout feature (frontend)                                                              | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-A | Create entities/order barrel slice                                                                 | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-B | Create checkout zod schema + unit tests (TDD)                                                      | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-C | Create features/checkout/model/useCheckout hook                                                    | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-D | Update LoginForm to honour ?redirect= ; wrap login page in Suspense                                | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-E | Create features/checkout/ui/CheckoutAddressForm                                                    | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-F | Create widgets/checkout/CheckoutOrderSummary                                                       | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-G | Create widgets/checkout/CheckoutView orchestrator                                                  | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-H | Create features/checkout barrel                                                                    | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-I | Create app/checkout/page.tsx route                                                                 | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-J | Create app/orders/[id]/confirmation/page.tsx stub                                                  | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-K | Update CartSummary — active Link to /checkout                                                      | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-035-L | Build / lint / typecheck / smoke verification gate                                                 | ✅     | docs/plans/022-checkout-feature.md          |
| TASK-036   | Build OrderConfirmationPage                                                                        | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-A | Verify entities/order barrel re-exports                                                            | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-B | Create OrderConfirmationSkeleton                                                                   | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-C | Create OrderConfirmationHeader                                                                     | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-D | Create OrderItemList                                                                               | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-E | Create OrderAddressSummary                                                                         | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-F | Create OrderTotalsBreakdown                                                                        | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-G | Create OrderConfirmationView orchestrator                                                          | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-H | Create widgets/order-confirmation/index.ts barrel                                                  | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-I | Rewrite app/orders/[id]/confirmation/page.tsx                                                      | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-036-J | Build / lint / typecheck (manual smoke pending → tracked separately)                               | ✅     | docs/plans/023-order-confirmation-page.md   |
| TASK-037   | Set up order confirmation emails                                                                   | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-A | Install nodemailer; add optional mail env vars; create .env.example                                | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-B | Create pure order-confirmation template builder (TDD)                                              | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-C | Implement MailService + unit tests                                                                 | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-D | Create global MailModule; register in AppModule                                                    | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-E | Export UserRepository; add UserModule + MailModule to OrderModule imports                          | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-F | Hook dispatch into OrderService.createOrder (fault-isolated) + tests                               | ✅     | docs/plans/024-order-confirmation-emails.md |
| TASK-037-H | Build / lint / typecheck / unit + e2e verification gate                                            | ✅     | docs/plans/024-order-confirmation-emails.md |

### Phase 3 — code-review follow-ups (`docs/manual-qa-phase3.md`)

| Task ID  | Description                                                                                                                                        | Status | Plan                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------- |
| TASK-053 | **CRITICAL** — Prevent stock oversell: conditional `updateMany` decrement (`WHERE stock >= qty`) in OrderRepository.createFromCart                 | ✅     | review b42f12c..HEAD |
| TASK-054 | **WARNING** — Restock variant lines on order cancel: OrderRepository.cancelAndRestock _(NB: ID also reused in Tech Debt for monorepo-arch-review)_ | ✅     | review b42f12c..HEAD |
| TASK-055 | **WARNING** — Add `CHECK (stock >= 0)` DB constraint on ProductVariant.stock                                                                       | ✅     | review b42f12c..HEAD |
| TASK-056 | **WARNING** — Endpoint-specific `@Throttle` on POST /api/orders                                                                                    | ✅     | review b42f12c..HEAD |
| TASK-057 | **WARNING** — Derive order subtotal by summing persisted order_items rows                                                                          | ✅     | review b42f12c..HEAD |
| TASK-058 | **WARNING** — Add OrderRepository.createFromCart unit/integration coverage _(NB: ID also reused in Tech Debt for orval-config consolidation)_      | ✅     | review b42f12c..HEAD |
| TASK-059 | **WARNING** — FSD: move CheckoutView skeleton into shared/ui _(NB: ID also reused in Tech Debt for baseURL alignment)_                             | ✅     | review b42f12c..HEAD |
| TASK-060 | **SUGGESTION** — Structured Pino email-failure log; Swagger Orders tag; explicit total formula; 404-vs-transient                                   | ✅     | review b42f12c..HEAD |

---

## Phase 4: Admin Panel

| Task ID    | Description                                                                             | Status | Plan                                        |
| ---------- | --------------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| TASK-038   | Implement RBAC (admin roles)                                                            | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-A | Harden RolesGuard and Roles decorator with UserRole enum + unit tests                   | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-B | Create AdminGuard convenience guard + unit tests + refactor controllers                 | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-C | Add e2e guard-behaviour tests (401 vs 403)                                              | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-D | Add admin seed data and document admin provisioning                                     | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-E | Implement store-admin entities/session                                                  | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-F | Implement store-admin Axios Bearer interceptor + 401 refresh retry                      | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-G | Implement store-admin features/admin-auth                                               | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-H | Add store-admin login page route and AdminShellGuard                                    | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-I | Update AdminHeader with user identity and LogoutButton                                  | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-J | Regenerate Orval API hooks for store-admin                                              | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-038-K | Build / lint / typecheck / unit + e2e verification gate                                 | ✅     | docs/plans/025-rbac-admin-roles.md          |
| TASK-039   | Admin Product management (CRUD)                                                         | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-A | Add GET /api/products/admin/:id admin endpoint                                          | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-B | Regenerate Orval hooks for store-admin (findById)                                       | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-C | Create entities/product barrel slice in store-admin                                     | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-D | Create features/product-form slice                                                      | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-E | Create features/product-status-toggle slice                                             | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-F | Create widgets/product-list slice                                                       | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-G | Create widgets/product-form-view slice                                                  | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-H | Create app route pages (list, new, [id]/edit)                                           | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-I | Update AdminSidebar Products link + active highlighting                                 | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-039-J | Build / lint / typecheck (manual smoke pending → tracked separately)                    | ✅     | docs/plans/026-admin-product-management.md  |
| TASK-040   | Admin Category management (CRUD)                                                        | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-A | Fix admin category Swagger types                                                        | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-B | Regenerate Orval hooks (typed AdminCategoryListResponse)                                | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-C | Create entities/category barrel slice                                                   | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-D | Create features/category-form slice                                                     | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-E | Create features/category-status-toggle slice                                            | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-F | Create widgets/category-list slice                                                      | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-G | Create widgets/category-form-view slice                                                 | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-H | Create app route pages (list, new, [id]/edit)                                           | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-I | Add Categories entry to AdminSidebar                                                    | ✅     | docs/plans/027-admin-category-management.md |
| TASK-040-J | Build / lint / typecheck (manual smoke pending → tracked separately)                    | ✅     | docs/plans/027-admin-category-management.md |
| TASK-041   | Admin Order management (status updates)                                                 | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-A | Add AdminOrderController + findAll + admin service methods                              | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-B | Regenerate Orval hooks (admin-orders module)                                            | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-C | Create entities/order barrel slice in store-admin                                       | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-D | Create features/order-status-update slice                                               | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-E | Create widgets/order-list slice                                                         | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-F | Create widgets/order-detail slice                                                       | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-G | Create app route pages (list, [id] detail)                                              | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-H | Fix AdminSidebar Orders link                                                            | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-041-I | Build / lint / typecheck / unit + e2e gate (manual smoke pending → tracked separately)  | ✅     | docs/plans/028-admin-order-management.md    |
| TASK-042   | Admin User management (view, ban)                                                       | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-A | Fix Swagger types on UserEntity + UserController envelopes                              | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-B | Regenerate Orval hooks (typed UserListResponseEnvelope)                                 | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-C | Create entities/user barrel slice                                                       | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-D | Create features/user-ban-toggle slice                                                   | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-E | Create widgets/user-list slice                                                          | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-F | Create widgets/user-detail slice                                                        | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-G | Create app route pages (list + [id] detail)                                             | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-H | Fix AdminSidebar Users link                                                             | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-I | Add e2e tests for admin user endpoints                                                  | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-042-J | Build / lint / typecheck (manual smoke pending → tracked separately)                    | ✅     | docs/plans/029-admin-user-management.md     |
| TASK-043   | Admin Dashboard (metrics, charts)                                                       | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-A | Create DashboardModule backend (repo + service + controller + DTOs; raw-SQL day-series) | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-B | Add backend e2e tests for dashboard endpoint                                            | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-C | Regenerate Orval hooks (DashboardSummaryResponse)                                       | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-D | Install recharts in apps/store-admin                                                    | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-E | Create entities/dashboard barrel slice                                                  | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-F | Create widgets/dashboard-stats slice                                                    | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-G | Create widgets/dashboard-charts slice                                                   | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-H | Create widgets/dashboard-low-stock slice                                                | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-I | Rewrite app/(dashboard)/page.tsx with live data + DashboardView orchestrator            | ✅     | docs/plans/030-admin-dashboard.md           |
| TASK-043-J | Build / lint / typecheck (manual smoke + live-DB pending → tracked separately)          | ✅     | docs/plans/030-admin-dashboard.md           |

### Phase 4 — code-review follow-ups (`docs/plans/031-phase4-review-followups.md`)

| Task ID  | Description                                                                           | Status | Plan                                      |
| -------- | ------------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| TASK-061 | **HIGH** — Enforce `isActive` in login() and refreshToken() (throw 401 when inactive) | ✅     | docs/plans/031-phase4-review-followups.md |
| TASK-062 | **HIGH** — Revoke sessions on ban (deactivateUser → revokeAllUserTokens)              | ✅     | docs/plans/031-phase4-review-followups.md |
| TASK-063 | **HIGH** — E2E coverage: banned user cannot authenticate                              | ✅     | docs/plans/031-phase4-review-followups.md |
| TASK-064 | **MEDIUM** — Fix top-products revenue (INNER JOIN orders, exclude CANCELLED/REFUNDED) | ✅     | docs/plans/031-phase4-review-followups.md |
| TASK-065 | **MEDIUM** — Backend self-ban prevention (adminId === targetId → 403)                 | ✅     | docs/plans/031-phase4-review-followups.md |
| TASK-066 | **MEDIUM** — Dashboard raw-SQL real-DB integration spec (test:int)                    | ✅     | docs/plans/031-phase4-review-followups.md |
| TASK-067 | **LOW** — Consistency cleanup (AdminGuard migration + timezone comment)               | ✅     | docs/plans/031-phase4-review-followups.md |

---

## Phase 5: Polish & Production

### Production Features

| Task ID    | Description                                                                         | Status | Plan                                      |
| ---------- | ----------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| TASK-044   | Redis caching for product listings                                                  | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-A | Install @nestjs/cache-manager + cache-manager-ioredis-yet                           | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-B | Extend env.validation.ts with Redis env vars                                        | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-C | Implement cache-key builder utility (TDD)                                           | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-D | Implement CacheService wrapper (TDD; graceful degradation)                          | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-E | Create global RedisCacheModule; conditional ioredis vs in-memory                    | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-F | Integrate cache-aside reads into ProductService                                     | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-G | Add cache invalidation on product writes                                            | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-H | Add cache invalidation in OrderRepository for stock mutations                       | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-I | Real-Redis integration spec under test:int (spec written; run pending Docker Redis) | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-044-J | Verification gate                                                                   | ✅     | docs/plans/032-redis-product-caching.md   |
| TASK-045   | Dynamic sitemap.xml + Schema.org microdata                                          | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-A | Add site URL/currency env vars; create shared/config/site.ts                        | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-B | Create shared/lib/schema builders + unit tests (TDD)                                | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-C | Create shared/ui/JsonLd XSS-safe Server Component                                   | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-D | Create fetchAllProducts.ts server-side paginator                                    | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-E | Add app/robots.ts                                                                   | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-F | Add app/sitemap.ts (force-dynamic; graceful fallback)                               | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-G | Update app/layout.tsx (metadataBase + title template + OG)                          | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-H | Inject JSON-LD into product detail/list/home                                        | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-045-I | Verification gate (JSON-LD in product HTML pending live API → tracked separately)   | ✅     | docs/plans/033-seo-sitemap-schema.md      |
| TASK-046   | Rate limiting + Helmet + CSRF protection                                            | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-A | Install ioredis; custom signed double-submit CSRF + Redis throttler storage         | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-B | Extend env.validation.ts with CSRF_SECRET                                           | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-C | Harden Helmet (prod CSP + HSTS + referrer-policy) + unit test                       | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-D | Tune throttler (custom RedisThrottlerStorage, Lua, fail-open) + unit tests          | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-E | Manual signed double-submit CSRF + CsrfModule; 19 unit tests (TDD)                  | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-F | Wire CsrfService.protect to /api/auth/refresh + /api/cart; FE CSRF token            | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-046-G | Input audit (@MaxLength); security.e2e-spec.ts; full gate                           | ✅     | docs/plans/034-security-hardening-csrf.md |
| TASK-047   | Pino structured logging — production hardening                                      | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-A | Add LOG_LEVEL; migrate LoggerModule to forRootAsync                                 | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-B | Extract buildPinoHttpOptions; redact 9 sensitive paths (TDD)                        | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-C | Add genReqId (X-Request-Id) + custom serializers (TDD)                              | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-D | Resolve double-logging; autoLogging.ignore /health; interceptor unit tests          | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-E | Convert service logs to structured events; inject PinoLogger into auth.service      | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-F | Migrate CacheService + MailService to injected PinoLogger                           | ✅     | docs/plans/035-pino-structured-logging.md |
| TASK-047-G | Verification gate (X-Request-Id present, password redacted)                         | ✅     | docs/plans/035-pino-structured-logging.md |

### Localization (UA / UAH) — Plan 040

| Task ID    | Description                                                                       | Status | Plan                                           |
| ---------- | --------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| TASK-069   | Central money formatter formatMoney (uk-UA / UAH, TDD) + NEXT_PUBLIC_CURRENCY=UAH | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-A | Replace 8 scattered en-US/USD priceFormatter duplicates with formatMoney          | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-B | Ukrainian typed string dictionary shared/config/dictionary.ts                     | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-C | Translate header / nav / footer / root layout; <html lang="uk">; OG locale        | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-D | Translate homepage                                                                | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-E | Translate product catalog + filter panel + product card                           | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-F | Translate product detail page                                                     | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-G | Translate cart page                                                               | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-H | Translate checkout + zod validation messages (TDD)                                | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-I | Translate order confirmation + locale dates                                       | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-J | Translate auth forms + zod messages + metadata                                    | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-K | SEO metadata audit + CURRENCY default → UAH                                       | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-L | Ukrainianize order-confirmation email (TDD)                                       | ✅     | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-M | Verification gate (manual visual pass pending → tracked separately)               | ✅     | docs/plans/040-uk-localization-uah-currency.md |

### UI/UX Redesign — Plan 039 _(core delivered; some per-task polish deferred to roadmap "Parked/Later")_

| Task ID    | Description                                                                                           | Status | Plan                                        |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| TASK-068   | Storefront UI/UX redesign — parent (core delivered)                                                   | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-A | Design-token refresh + shadcn/ui bootstrap                                                            | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-B | Header redesign (sticky, cart-count badge, mobile Sheet). Deferred: inline header search              | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-C | Product card (badges, hover elevation, sale styling). Deferred: real image overlay (needs API fields) | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-D | Homepage (gradient hero, trust strip). Deferred: category-tile images                                 | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-E | Filters (shadcn primitives + active-filter chips). Deferred: mobile filter drawer                     | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-F | PDP (stock indicator, trust strip, tabs, related row). Deferred: next/image, sticky ATC bar           | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-G | Cart (accessible Dialog, trust lines). Deferred: cart-item-row primitive swap                         | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-H | Checkout (3-step stepper, shadcn primitives). Deferred: (auth) layout card polish                     | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-I | Footer redesign (multi-column, trust strip, payment icons)                                            | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-J | Toast provider + AddToCart toast + skip-nav. Deferred: focus-ring audit, error→toast                  | ✅     | docs/plans/039-storefront-ui-ux-redesign.md |

---

## Tech Debt & Architecture Review

| Task ID    | Description                                                                                                                        | Status | Plan                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| TASK-054   | Monorepo architecture review (script conventions, TS config consolidation, @nestjs/cli bump) _(NB: ID reused from Phase 3 review)_ | ✅     | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-A | Standardize package.json scripts (root db:\* + generate:api proxies)                                                               | ✅     | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-B | Consolidate TypeScript configs (base.json moduleResolution → node16)                                                               | ✅     | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-C | Bump @nestjs/cli + @nestjs/schematics to ^11 (clear DEP0190)                                                                       | ✅     | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-D | Directory layout + workspace boundary audit                                                                                        | ✅     | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-E | Verification gate                                                                                                                  | ✅     | docs/plans/036-monorepo-architecture-review.md |
| TASK-058   | Consolidate orval.config.ts into shared @store/orval-config factory _(NB: ID reused from Phase 3 review)_                          | ✅     | docs/plans/037-orval-config-consolidation.md   |
| TASK-058-A | Create packages/orval-config workspace package                                                                                     | ✅     | docs/plans/037-orval-config-consolidation.md   |
| TASK-058-B | Add @store/orval-config devDependency to both frontends                                                                            | ✅     | docs/plans/037-orval-config-consolidation.md   |
| TASK-058-C | Rewrite both orval.config.ts to call factory                                                                                       | ✅     | docs/plans/037-orval-config-consolidation.md   |
| TASK-058-D | Verification gate (zero diff in generated/)                                                                                        | ✅     | docs/plans/037-orval-config-consolidation.md   |
| TASK-059   | Align /api baseURL convention between store-client and store-admin instance.ts _(NB: ID reused from Phase 3 review)_               | ✅     | docs/plans/038-instance-baseurl-alignment.md   |
| TASK-059-A | Zero-diff gate after generate:api                                                                                                  | ✅     | docs/plans/038-instance-baseurl-alignment.md   |
| TASK-059-B | Manual verification: admin login, silent refresh, CSRF path (pending running stack → tracked separately)                           | 🔄     | docs/plans/038-instance-baseurl-alignment.md   |

### Bugfixes (from 2026-06-20 manual QA pass — `docs/manual-qa-master.md`)

> Renumbered from TASK-069/070 → TASK-071/072 to avoid colliding with the localization
> plan (TASK-069) and redesign (TASK-068). `docs/manual-qa-master.md` still references the
> original 069/070 labels for these two fixes.

| Task ID  | Description                                                                                     | Status | Plan                     |
| -------- | ----------------------------------------------------------------------------------------------- | ------ | ------------------------ |
| TASK-071 | **HIGH (SEO)** — sitemap fetchAllProducts PAGE_SIZE 200 → 100 (API caps limit at 100)           | ✅     | docs/manual-qa-master.md |
| TASK-072 | **MEDIUM (DevOps)** — docker-compose redis `--requirepass` crash-loop when REDIS_PASSWORD unset | ✅     | docs/manual-qa-master.md |

---

## Product Images — Plan 041 (`TASK-073`)

| Task ID    | Description                                                                                    | Status | Plan                             |
| ---------- | ---------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| TASK-073   | Product images (backend + frontend) — ProductImage model, admin upload, list+detail API, Orval | ✅     | docs/plans/041-product-images.md |
| TASK-073-A | Prisma migration — isPrimary + (productId, sortOrder) index                                    | ✅     | docs/plans/041-product-images.md |
| TASK-073-B | StorageService abstraction + LocalDiskStorageService + env vars                                | ✅     | docs/plans/041-product-images.md |
| TASK-073-C | ProductImageRepository + entity isPrimary + ProductRepository joins primary image              | ✅     | docs/plans/041-product-images.md |
| TASK-073-D | ProductImageService (TDD) — upload/reorder/delete                                              | ✅     | docs/plans/041-product-images.md |
| TASK-073-E | ProductImageController + multer + ServeStaticModule (/uploads)                                 | ✅     | docs/plans/041-product-images.md |
| TASK-073-F | E2E tests — upload/reorder/delete guards + validation                                          | ✅     | docs/plans/041-product-images.md |
| TASK-073-G | Regenerate Orval hooks (image endpoints + primaryImage)                                        | ✅     | docs/plans/041-product-images.md |
| TASK-073-H | Storefront ProductCard — render primary image with fallback                                    | ✅     | docs/plans/041-product-images.md |
| TASK-073-I | Storefront ProductImageGallery — verification + altText unit test                              | ✅     | docs/plans/041-product-images.md |
| TASK-073-J | Admin features/product-image-manager (upload, grid, drag-reorder, toasts)                      | ✅     | docs/plans/041-product-images.md |
| TASK-073-K | Admin EditProductView — wire ProductImageManager                                               | ✅     | docs/plans/041-product-images.md |
| TASK-073-L | Seed data — ProductImage rows for first 6 products                                             | ✅     | docs/plans/041-product-images.md |
| TASK-073-M | Verification gate                                                                              | ✅     | docs/plans/041-product-images.md |
