# Project Backlog

> **Single source of truth** for task status across the project.
> Use this file to track what's done, what's in progress, and what's next.
> When you don't know what to do, just ask: "What's next?"

## Status Legend

| Symbol | Meaning |
| --- | --- |
| ⬜ | To Do — not started |
| 🔄 | In Progress — currently being worked on |
| ✅ | Done — completed and tested |
| ❌ | Blocked — cannot proceed |
| ⏭️ | Skipped — deferred to later phase |

---

## Phase 1: Foundation (MVP Core)

### Infrastructure

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-001 | Set up monorepo with npm workspaces (package.json + .gitignore) | ✅ | — |
| TASK-002 | Configure Docker Compose (PostgreSQL, Redis) | ✅ | — |
| TASK-003 | Set up ESLint + Prettier + Husky pre-commit hooks | ✅ | — |
| TASK-004 | Configure shared TypeScript settings | ✅ | — |
| TASK-005 | Set up CI/CD pipeline (GitHub Actions) | ✅ | — |

### Database

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-006 | Design and create Prisma schema (User, Product, Category, Cart, Order, Address, Review) | ✅ | docs/plans/002-prisma-schema.md |
| TASK-007 | Create initial Prisma migration | ✅ | docs/plans/002-prisma-schema.md |
| TASK-008 | Set up seed data for development | ✅ | docs/plans/002-prisma-schema.md |

### Backend Core

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-009 | Set up NestJS project structure (Clean Architecture) | ✅ | docs/plans/001-nestjs-setup.md |
| TASK-010 | Implement Auth module (register, login, refresh tokens) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-A | Add RefreshToken model to Prisma schema + migration | ✅ | docs/plans/003-auth-module.md |
| TASK-010-B | Install missing auth dependencies (passport, cookie-parser) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-C | Configure cookie-parser middleware in main.ts | ✅ | docs/plans/003-auth-module.md |
| TASK-010-D | Create Auth DTOs (RegisterDto, LoginDto) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-E | Create AuthTokens entity | ✅ | docs/plans/003-auth-module.md |
| TASK-010-F | Implement AuthRepository | ✅ | docs/plans/003-auth-module.md |
| TASK-010-G | Write unit tests for AuthService (TDD — Red) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-H | Implement AuthService (TDD — Green) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-I | Implement JWT strategies (access + refresh) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-J | Implement guards (JwtAuth, JwtRefresh, Roles) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-K | Implement decorators (CurrentUser, Roles) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-L | Implement AuthController (register, login, refresh, logout) | ✅ | docs/plans/003-auth-module.md |
| TASK-010-M | Register AuthModule in AppModule | ✅ | docs/plans/003-auth-module.md |
| TASK-010-N | Write E2E tests for auth endpoints | ✅ | docs/plans/003-auth-module.md |
| TASK-010-O | Update .env with JWT_REFRESH_SECRET | ✅ | docs/plans/003-auth-module.md |
| TASK-011 | Implement User module (CRUD, profile) | ✅ | docs/plans/004-user-module.md |
| TASK-012 | Implement Product module (CRUD, filtering) | ✅ | docs/plans/005-product-module.md |
| TASK-013 | Implement Category module (CRUD, hierarchy) | ✅ | docs/plans/006-category-module.md |
| TASK-013-A | Create Category DTOs (CreateCategoryDto, UpdateCategoryDto, CategoryListQueryDto) | ✅ | docs/plans/006-category-module.md |
| TASK-013-B | Create CategoryEntity with fromPrisma() and tree mapping | ✅ | docs/plans/006-category-module.md |
| TASK-013-C | Implement CategoryRepository with CRUD + hierarchy queries | ✅ | docs/plans/006-category-module.md |
| TASK-013-D | Write failing unit tests for CategoryService (TDD — Red) | ✅ | docs/plans/006-category-module.md |
| TASK-013-E | Implement CategoryService (TDD — Green) | ✅ | docs/plans/006-category-module.md |
| TASK-013-F | Implement CategoryController with public + admin endpoints | ✅ | docs/plans/006-category-module.md |
| TASK-013-G | Create CategoryModule and register in AppModule | ✅ | docs/plans/006-category-module.md |
| TASK-013-H | Write E2E tests for Category endpoints | ✅ | docs/plans/006-category-module.md |

### API Contract

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-014 | Configure Swagger/OpenAPI decorators | ✅ | — (done in main.ts; completed via TASK-009/TASK-010/TASK-025 work) |
| TASK-015 | Set up Orval configuration for store-client | ✅ | docs/plans/007-store-client-setup.md (completed as TASK-017-E) |
| TASK-016 | Set up Orval configuration for store-admin | ✅ | docs/plans/013-store-admin-orval.md |

### Frontend Scaffold

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-017 | Set up Next.js App Router (store-client) with FSD structure | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-A | Scaffold Next.js project with TypeScript, path aliases, and workspace config | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-B | Configure Tailwind CSS with semantic design tokens | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-C | Set up FSD folder structure (widgets, features, entities, shared) | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-D | Configure TanStack Query provider | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-E | Configure Orval API client generation | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-F | Configure ESLint + import rules for FSD layer boundaries | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-G | Create root layout with global providers | ✅ | docs/plans/007-store-client-setup.md |
| TASK-017-H | Verify full build pipeline (build, lint, typecheck, generate:api) | ✅ | docs/plans/007-store-client-setup.md |
| TASK-018 | Set up Next.js App Router (store-admin) with FSD structure | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-A | Scaffold Next.js admin project with TypeScript, path aliases, workspace config | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-B | Configure Tailwind CSS with semantic design tokens (admin theme) | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-C | Initialize shadcn/ui base components | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-D | Set up FSD folder structure (widgets, features, entities, shared) | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-E | Configure TanStack Query provider | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-F | Configure Orval API client generation | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-G | Configure ESLint + import rules for FSD layer boundaries | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-H | Create root layout with admin shell (sidebar + header + main) | ✅ | docs/plans/008-store-admin-setup.md |
| TASK-018-I | Verify full build pipeline (build, lint, typecheck, generate:api) | ✅ | docs/plans/008-store-admin-setup.md |
| ~~TASK-019~~ | ~~Configure Tailwind CSS with semantic design tokens~~ | ~~⬜~~ | docs/plans/008-store-admin-setup.md (covered by TASK-018-B) |
| ~~TASK-020~~ | ~~Set up shadcn/ui base components (store-admin)~~ | ~~⬜~~ | docs/plans/008-store-admin-setup.md (covered by TASK-018-C) |

---

## Phase 2: Storefront & Cart

### Cart Backend

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-021 | Create Cart domain entities and DTOs | ✅ | docs/plans/009-cart-module.md |
| TASK-022 | Implement CartRepository | ✅ | docs/plans/009-cart-module.md |
| TASK-023 | Write failing unit tests for CartService (TDD — Red) | ✅ | docs/plans/009-cart-module.md |
| TASK-024 | Implement CartService (TDD — Green) | ✅ | docs/plans/009-cart-module.md |
| TASK-025 | Implement CartController and CartModule | ✅ | docs/plans/009-cart-module.md |
| TASK-026 | Write E2E tests for Cart endpoints | ✅ | docs/plans/010-cart-e2e-tests.md |
| TASK-027 | Generate Orval hooks for Cart API | ✅ | docs/plans/011-cart-orval-hooks.md |
| TASK-027-A | Add swagger:export script to store-api (writes swagger.json without starting server) | ✅ | docs/plans/011-cart-orval-hooks.md |
| TASK-027-B | Update store-client orval.config.ts to use static swagger.json as input | ✅ | docs/plans/011-cart-orval-hooks.md |
| TASK-027-C | Add explicit operationId to Cart controller @ApiOperation decorators | ✅ | docs/plans/011-cart-orval-hooks.md |
| TASK-027-D | Run npm run generate:api and verify all Cart hooks and types are generated | ✅ | docs/plans/011-cart-orval-hooks.md |
| TASK-027-E | Update shared/api/index.ts to re-export generated Cart hooks and model types | ✅ | docs/plans/011-cart-orval-hooks.md |

### Storefront Pages

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-028 | Build HomePage (store-client) | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-A | Scaffold FSD entity layers for Product and Category | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-B | Create shared/ui Skeleton primitive | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-C | Create shared/ui ProductCard base component | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-D | Create HeroBanner widget (static Server Component) | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-E | Create CategoryNav widget with skeleton | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-F | Create ProductGrid widget with skeleton | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-028-G | Wire up app/page.tsx and verify full build | ✅ | docs/plans/012-store-client-homepage.md |
| TASK-029 | Build ProductListPage with filtering | ✅ | docs/plans/014-store-client-product-list.md |
| TASK-029-A | Create features/product-filters slice (controls + debounced search) | ✅ | docs/plans/014-store-client-product-list.md |
| TASK-029-B | Create widgets/product-list slice (ProductList, Pagination, Skeleton) | ✅ | docs/plans/014-store-client-product-list.md |
| TASK-029-C | Create widgets/product-list/ProductListView (URL-state orchestrator) | ✅ | docs/plans/014-store-client-product-list.md |
| TASK-029-D | Create app/products/page.tsx and wire full build | ✅ | docs/plans/014-store-client-product-list.md |
| TASK-030 | Build ProductDetailPage | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-030-A | Update entities/product barrel with detail types and hook | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-030-B | Create widgets/product-detail/ProductDetailSkeleton | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-030-C | Create widgets/product-detail/ProductImageGallery | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-030-D | Create widgets/product-detail/ProductVariantSelector | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-030-E | Create widgets/product-detail/ProductDetailView (orchestrator) | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-030-F | Create app/products/[slug]/page.tsx and wire full build | ✅ | docs/plans/015-store-client-product-detail.md |
| TASK-031 | Build CartPage with quantity management (guest + user; depends on TASK-051-J) | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-031-A | Create entities/cart barrel slice (depends on TASK-051-J Orval regen) | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-031-B | Create widgets/cart/CartSkeleton | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-031-C | Create widgets/cart/CartItemRow | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-031-D | Create widgets/cart/CartSummary | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-031-E | Create widgets/cart/CartView (orchestrator; no 401 state — guest cart always works) | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-031-F | Create app/cart/page.tsx and verify full build | ✅ | docs/plans/016-store-client-cart-page.md |
| TASK-032 | Implement AddToCart feature (frontend) | ✅ | docs/plans/019-add-to-cart-feature.md |
| TASK-032-A | Create features/add-to-cart/AddToCartButton (useAddToCart + cart invalidation) | ✅ | docs/plans/019-add-to-cart-feature.md |
| TASK-032-B | Integrate AddToCartButton into ProductDetailView (replace placeholder) | ✅ | docs/plans/019-add-to-cart-feature.md |
| TASK-032-C | Build verification (build + typecheck + lint) | ✅ | docs/plans/019-add-to-cart-feature.md |

### Guest Cart Backend (Plan 017)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-051 | Guest cart backend — nullable userId, cartToken cookie, optional-auth, merge on login | 🔄 | docs/plans/017-guest-cart-backend.md |
| TASK-051-A | Prisma migration: nullable Cart.userId + unique token column (applied — migrate status clean) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-B | Implement OptionalJwtAuthGuard (AuthGuard extension — no throw on missing JWT) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-C | Implement CartIdentityInterceptor + @CartIdentity() decorator (resolves userId or token) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-D | Update CartRepository: findByToken, findOrCreate(identity), assignCartToUser, addItem by cartId | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-E | Update CartService: dual-identity signatures + mergeGuestCart() (TDD) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-F | Update CartController: remove JwtAuthGuard, add OptionalJwtAuthGuard + CartIdentityInterceptor | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-G | Update CartModule: register new providers (CartIdentityInterceptor, ConfigModule) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-H | Wire cart-merge into AuthController login + register (import CartModule into AuthModule) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-I | E2E tests: guest cart, authenticated cart, merge on login, quantity clamp, merge failure (DB) | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-J | Regenerate Orval API hooks (store-client + store-admin) after cart controller changes | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-K | Review WARN#1: make mergeGuestCart transactional; clear cartToken cookie only on success | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-L | Review WARN#2: handle findOrCreate vs assignCartToUser race (P2002) in the merge transaction | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-M | Review: unit tests for guard/interceptor/merge-failure + mixed overlap/new/delete merge case | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-N | Review WARN#4: migration applied + guest/merge e2e done; manual QA pending (docs/manual-qa-phase2) | 🔄 | docs/plans/017-guest-cart-backend.md |
| TASK-051-O | Real-DB integration harness (test:int vs isolated store_test) + CI job; caught & fixed null-variant | ✅ | docs/plans/017-guest-cart-backend.md |
| TASK-051-O | cart-line upsert (Prisma rejects null in compound-unique where) |  | docs/plans/017-guest-cart-backend.md |

### Storefront Auth — store-client (Plan 018)

> **Depends on:** TASK-051-J (Orval regeneration) must be complete before this section begins.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-052 | Storefront auth: login/register/logout + JWT in-memory + 401 interceptor + header auth widget | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-A | Update shared/api/instance.ts: add Authorization interceptor + 401→refresh retry | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-B | Create entities/session slice: AuthContext, useAuth, AuthProvider (in-memory token + silent refresh) | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-C | Install form dependencies: react-hook-form, @hookform/resolvers, zod | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-D | Create features/auth/LoginForm (zod + react-hook-form + useAuthControllerLogin + cart invalidation) | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-E | Create features/auth/RegisterForm (zod + react-hook-form + useAuthControllerRegister + cart invalidation) | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-F | Create features/auth/LogoutButton (useAuthControllerLogout + clearTokens + queryClient.clear) | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-G | Create widgets/header/HeaderAuth + wire into existing Header widget | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-H | Create app/(auth)/login/page.tsx route | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-I | Create app/(auth)/register/page.tsx route | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-J | Update CartView to remove 401 sign-in state (built guest-first — no 401 branch existed) | ✅ | docs/plans/018-storefront-auth.md |
| TASK-052-K | Full integration verification (build + lint + typecheck ✅; manual smoke tests pending running app) | ✅ | docs/plans/018-storefront-auth.md |

---

## Phase 3: Checkout & Orders

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-033 | Implement Order module (backend) — TDD | ✅ | docs/plans/020-order-module.md |
| TASK-033-A | Review Prisma schema — confirm no migration needed for Order/OrderItem/enums | ✅ | docs/plans/020-order-module.md |
| TASK-033-B | Export CartRepository from CartModule (required by OrderModule) | ✅ | docs/plans/020-order-module.md |
| TASK-033-C | Create Order domain entities (OrderEntity, OrderItemEntity, OrderWithItems interface) | ✅ | docs/plans/020-order-module.md |
| TASK-033-D | Create Order DTOs (CreateOrderDto, AddressDto, UpdateOrderStatusDto, OrderListQueryDto) | ✅ | docs/plans/020-order-module.md |
| TASK-033-E | Implement OrderRepository (createFromCart tx, findByUserId, findById, updateStatus, updatePayment) | ✅ | docs/plans/020-order-module.md |
| TASK-033-F | Write failing unit tests for OrderService (TDD — Red) | ✅ | docs/plans/020-order-module.md |
| TASK-033-G | Implement OrderService (TDD — Green): createOrder, getOrders, getOrder, cancelOrder, updateStatus | ✅ | docs/plans/020-order-module.md |
| TASK-033-H | Implement OrderController + OrderModule + register in AppModule | ✅ | docs/plans/020-order-module.md |
| TASK-033-I | Write E2E tests for Order endpoints (Supertest, mocked repository) | ✅ | docs/plans/020-order-module.md |
| TASK-033-J | Regenerate Orval API hooks for Orders (store-client + store-admin) | ✅ | docs/plans/020-order-module.md |
| TASK-034 | Implement Payment integration (Stripe stub) | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-A | Prisma migration — add Payment model and PaymentIntentStatus enum | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-B | Update env.validation.ts with Stripe/payment env vars | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-C | Create Payment domain types, entities, and DTOs | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-D | Implement StubPaymentProvider | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-E | Implement PaymentRepository | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-F | Write failing unit tests for PaymentService (TDD — Red) | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-G | Implement PaymentService (TDD — Green) | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-H | Implement PaymentController, raw body middleware, and PaymentModule | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-I | Write E2E tests for Payment endpoints | ⬜ | docs/plans/021-payment-integration.md |
| TASK-034-J | Regenerate Orval API hooks for Payments (store-client + store-admin) | ⬜ | docs/plans/021-payment-integration.md |
| TASK-035 | Implement Checkout feature (frontend) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-A | Create entities/order barrel slice (re-export useCreateOrder + Order types) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-B | Create checkout zod schema (checkoutSchema + CheckoutFormValues) and unit tests (TDD) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-C | Create features/checkout/model/useCheckout hook (mutation + cart invalidation + redirect) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-D | Update LoginForm to honour ?redirect= query param; wrap login page in Suspense | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-E | Create features/checkout/ui/CheckoutAddressForm (react-hook-form + zod; reusable fieldset) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-F | Create widgets/checkout/CheckoutOrderSummary (read-only cart summary via useGetCart) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-G | Create widgets/checkout/CheckoutView orchestrator (auth-gate + empty-cart guard + layout) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-H | Create features/checkout barrel (index.ts) and update features/index.ts | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-I | Create app/checkout/page.tsx route (Server Component; metadata; Suspense wrapper) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-J | Create app/orders/[id]/confirmation/page.tsx stub (TASK-036 redirect target) | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-K | Update CartSummary — replace disabled button with active Link to /checkout | ✅ | docs/plans/022-checkout-feature.md |
| TASK-035-L | Build / lint / typecheck / smoke verification gate | ✅ | docs/plans/022-checkout-feature.md |
| TASK-036 | Build OrderConfirmationPage | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-A | Verify entities/order barrel — added Status/PaymentStatus/Address type re-exports | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-B | Create widgets/order-confirmation/OrderConfirmationSkeleton | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-C | Create widgets/order-confirmation/OrderConfirmationHeader (order number, dates, status badges) | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-D | Create widgets/order-confirmation/OrderItemList (line-item rows with snapshotted prices) | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-E | Create widgets/order-confirmation/OrderAddressSummary (shipping + optional billing blocks) | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-F | Create widgets/order-confirmation/OrderTotalsBreakdown (conditional discount/shipping/tax rows) | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-G | Create widgets/order-confirmation/OrderConfirmationView orchestrator (auth-gate + query + layout) | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-H | Create widgets/order-confirmation/index.ts barrel + update widgets/index.ts | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-I | Rewrite app/orders/[id]/confirmation/page.tsx (Server Component; generateMetadata; Suspense wrap) | ✅ | docs/plans/023-order-confirmation-page.md |
| TASK-036-J | Build / lint / typecheck ✅; manual smoke test pending running app | 🔄 | docs/plans/023-order-confirmation-page.md |
| TASK-037 | Set up order confirmation emails | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-A | Install `nodemailer` + `@types/nodemailer`; add optional mail env vars to `env.validation.ts`; create `.env.example` | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-B | Create pure order-confirmation template builder `{ subject, html, text }` with TDD (Red → Green) | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-C | Implement `MailService` (nodemailer transport from config; `sendOrderConfirmation`; no-op path; logging) + unit tests | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-D | Create global `MailModule` + barrel `index.ts`; register in `AppModule` | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-E | Export `UserRepository` from `UserModule`; add `UserModule` (+ `MailModule`) to `OrderModule` imports | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-F | Hook dispatch into `OrderService.createOrder` (fetch recipient, fault-isolated try/catch); extend `order.service.spec.ts` (dispatch-called + failure-does-not-break-order + null-user cases) | ✅ | docs/plans/024-order-confirmation-emails.md |
| TASK-037-H | Build / lint / typecheck / unit + e2e verification gate (mock `MailService` in e2e; dev SMTP note) | ✅ | docs/plans/024-order-confirmation-emails.md |

### Phase 3 — code-review follow-ups (`docs/manual-qa-phase3.md`)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-053 | **CRITICAL** — Prevent stock oversell: conditional `updateMany` decrement (`WHERE stock >= qty`) in `OrderRepository.createFromCart`; throw `ConflictException`→rollback when no row affected | ✅ | review b42f12c..HEAD |
| TASK-054 | **WARNING** — Restock variant lines on order cancel: `OrderRepository.cancelAndRestock` (atomic CANCELLED + stock increment); `OrderService.cancelOrder` uses it (manual flow, no Stripe) | ✅ | review b42f12c..HEAD |
| TASK-055 | **WARNING** — Add `CHECK (stock >= 0)` DB constraint on `ProductVariant.stock` via Prisma migration (defence in depth behind TASK-053) | ✅ | review b42f12c..HEAD |
| TASK-056 | **WARNING** — Endpoint-specific `@Throttle` on `POST /api/orders` (and `confirm-payment`) tighter than the global 100/60s | ✅ | review b42f12c..HEAD |
| TASK-057 | **WARNING** — Derive order `subtotal` by summing the persisted `order_items` rows (single source of truth) instead of a parallel pass over cart prices | ✅ | review b42f12c..HEAD |
| TASK-058 | **WARNING** — Add `OrderRepository.createFromCart` unit/integration coverage (snapshot, cents math, conditional decrement, transaction rollback) | ✅ | review b42f12c..HEAD |
| TASK-059 | **WARNING** — FSD: move `CheckoutView`'s skeleton out of `widgets/cart` into `shared/ui` (remove widget→widget lateral import) | ✅ | review b42f12c..HEAD |
| TASK-060 | **SUGGESTION** — Structured Pino email-failure log (`{ err, orderId }`); Swagger `Orders` tag; explicit `total` formula; 404-vs-transient on confirmation page; e2e for invalid nested address | ✅ | review b42f12c..HEAD |

---

## Phase 4: Admin Panel

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-038 | Implement RBAC (admin roles) | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-A | Harden RolesGuard and Roles decorator with UserRole enum + unit tests | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-B | Create AdminGuard convenience guard + unit tests + refactor two controllers | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-C | Add e2e guard-behaviour tests (401 vs 403 on admin endpoints) | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-D | Add admin seed data and document admin provisioning in .env.example | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-E | Implement store-admin entities/session (AuthProvider, useAuth, useAdminAuth) | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-F | Implement store-admin Axios Bearer interceptor + 401 refresh retry | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-G | Implement store-admin features/admin-auth (LoginForm + LogoutButton) | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-H | Add store-admin login page route and AdminShellGuard auth gate in root layout | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-I | Update AdminHeader with user identity and LogoutButton | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-J | Regenerate Orval API hooks for store-admin | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-038-K | Build / lint / typecheck / unit + e2e verification gate | ✅ | docs/plans/025-rbac-admin-roles.md |
| TASK-039 | Admin Product management (CRUD) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-A | Add GET /api/products/admin/:id admin endpoint (`admin/` prefix avoids `:slug` route collision) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-B | Regenerate Orval hooks for store-admin (new findById hook) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-C | Create entities/product barrel slice in store-admin | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-D | Create features/product-form slice (zod schema + ProductForm component) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-E | Create features/product-status-toggle slice (activate/deactivate button) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-F | Create widgets/product-list slice (AdminProductTable + Skeleton + pagination) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-G | Create widgets/product-form-view slice (CreateProductView + EditProductView) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-H | Create app route pages for product management (list, new, [id]/edit) | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-I | Update AdminSidebar Products link and add active-link highlighting | ✅ | docs/plans/026-admin-product-management.md |
| TASK-039-J | Build / lint / typecheck ✅ (api+admin build, 224 unit + 22 product e2e green); manual smoke pending running app | 🔄 | docs/plans/026-admin-product-management.md |
| TASK-040 | Admin Category management (CRUD) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-A | Fix admin category Swagger types: typed AdminCategoryListResponse on list + CategoryResponseEnvelope on single-item endpoints (was untyped `void` / flat CategoryEntity) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-B | Regenerate Orval hooks for store-admin (typed AdminCategoryListResponse + envelope) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-C | Create entities/category barrel slice in store-admin | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-D | Create features/category-form slice (zod schema + CategoryForm with parent selector + self-exclusion) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-E | Create features/category-status-toggle slice (activate/deactivate badge button) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-F | Create widgets/category-list slice (AdminCategoryTable + Skeleton + pagination) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-G | Create widgets/category-form-view slice (CreateCategoryView + EditCategoryView orchestrators) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-H | Create app route pages for category management (list, new, [id]/edit) | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-I | Add Categories entry to AdminSidebar nav array | ✅ | docs/plans/027-admin-category-management.md |
| TASK-040-J | Build / lint / typecheck ✅ (api+admin build, 224 unit + 33 category e2e green); manual smoke pending running app | 🔄 | docs/plans/027-admin-category-management.md |
| TASK-041 | Admin Order management (status updates) | 🔄 | docs/plans/028-admin-order-management.md |
| TASK-041-A | Add AdminOrderController + AdminOrderListQueryDto + findAll repository method + adminGetAllOrders/adminGetOrder service methods | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-B | Regenerate Orval hooks for store-admin (new admin-orders module) | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-C | Create entities/order barrel slice in store-admin | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-D | Create features/order-status-update slice (OrderStatusSelect with transition map) | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-E | Create widgets/order-list slice (AdminOrderTable + Skeleton + status filter) | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-F | Create widgets/order-detail slice (OrderDetailView + Skeleton + status-update control) | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-G | Create app route pages for order management (list, [id] detail) | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-H | Fix AdminSidebar Orders link from `#` to `/orders` | ✅ | docs/plans/028-admin-order-management.md |
| TASK-041-I | Build / lint / typecheck / unit + e2e verification gate (manual smoke pending) | 🔄 | docs/plans/028-admin-order-management.md |
| TASK-042 | Admin User management (view, ban) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-A | Fix Swagger @ApiProperty types on UserEntity nullable fields + UserController envelopes; export swagger.json with typed UserListResponseEnvelope | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-B | Regenerate Orval hooks for store-admin (typed UserListResponseEnvelope + corrected nullable string fields) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-C | Create entities/user barrel slice in store-admin | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-D | Create features/user-ban-toggle slice (activate/deactivate button + sonner toast + query invalidation + self-ban UI guard) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-E | Create widgets/user-list slice (AdminUserTable + search/role/status filters + pagination + skeleton) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-F | Create widgets/user-detail slice (UserDetailView + UserDetailSkeleton + 404→redirect) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-G | Create app route pages for user management (list + [id] detail, Next.js 15 await params) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-H | Fix AdminSidebar Users link from `#` to `/users` | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-I | Add e2e tests for admin user endpoints (401/403/200 guards, search/filter, ban/unban, 404) | ✅ | docs/plans/029-admin-user-management.md |
| TASK-042-J | Build / lint / typecheck ✅ (api+admin build, 230 unit + 156 e2e green); manual smoke pending running app | 🔄 | docs/plans/029-admin-user-management.md |
| TASK-043 | Admin Dashboard (metrics, charts) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-A | Create DashboardModule backend (repository + service + controller + all Swagger-decorated DTOs; `GET /api/admin/dashboard/summary` protected by AdminGuard; revenue/orders/users day-series via `$queryRaw` + `generate_series` gap-fill; top-products via `SUM(price*quantity)`) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-B | Add backend e2e tests for the dashboard endpoint (401/403/200 guards + response shape + empty-store case) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-C | Regenerate Orval API hooks for store-admin (typed DashboardSummaryResponse + useAdminDashboardControllerGetSummary hook; generated dir `admin-dashboard`) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-D | Install recharts as a production dependency in apps/store-admin (used **recharts ^3.8** — native React 19 support, no `--legacy-peer-deps` needed; plan assumed 2.x) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-E | Create entities/dashboard barrel slice in store-admin | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-F | Create widgets/dashboard-stats slice (AdminDashboardStats stat cards + Skeleton) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-G | Create widgets/dashboard-charts slice (RevenueTrendChart + OrdersByStatusChart + DashboardCharts wrapper) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-H | Create widgets/dashboard-low-stock slice (DashboardLowStockTable with stock-level badges) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-I | Rewrite app/(dashboard)/page.tsx with live data + app-layer DashboardView client orchestrator (avoids widget→widget lateral import) | ✅ | docs/plans/030-admin-dashboard.md |
| TASK-043-J | Build / lint / typecheck ✅ (all workspaces; 230 unit + 160 e2e green); manual smoke pending running app + live DB (raw-SQL aggregations) | 🔄 | docs/plans/030-admin-dashboard.md |

### Phase 4 — code-review follow-ups (`docs/plans/031-phase4-review-followups.md`)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-061 | **HIGH** — Enforce `isActive` in authentication: `AuthService.login()` and `AuthService.refreshToken()` must throw `UnauthorizedException` when the resolved user has `isActive === false`. TDD: extend `auth.service.spec.ts` first. | ✅ | docs/plans/031-phase4-review-followups.md |
| TASK-062 | **HIGH** — Revoke sessions on ban: `UserService.deactivateUser()` must call `authRepository.revokeAllUserTokens(userId)` after deactivation. Wire by importing `AuthModule` into `UserModule` (AuthModule already exports AuthRepository). TDD: unit-test revocation call. | ✅ | docs/plans/031-phase4-review-followups.md |
| TASK-063 | **HIGH** — E2E coverage — banned user cannot authenticate: extend `auth.e2e-spec.ts` with specs asserting login-with-deactivated-user → 401 and refresh-with-deactivated-user-token → 401. Mirror existing mocked-repository e2e pattern. | ✅ | docs/plans/031-phase4-review-followups.md |
| TASK-064 | **MEDIUM** — Fix top-products revenue: `DashboardRepository.getTopProducts` raw SQL must `INNER JOIN orders` and exclude `CANCELLED`/`REFUNDED` so product revenue is consistent with the revenue metric definition. | ✅ | docs/plans/031-phase4-review-followups.md |
| TASK-065 | **MEDIUM** — Backend self-ban prevention: `UserController`/`UserService.deactivateUser` must accept `adminId` (via `@CurrentUser('id')`) and throw `ForbiddenException` when `adminId === targetId`. TDD + e2e (admin deactivates self → 403). | ✅ | docs/plans/031-phase4-review-followups.md |
| TASK-066 | **MEDIUM** — Dashboard raw-SQL real-DB integration spec: add `test/dashboard.repository.int-spec.ts` under the `test:int` harness asserting `generate_series` gap-fill, `SUM(price*quantity)` top-products with CANCELLED exclusion, and low-stock query. | 🔄 | docs/plans/031-phase4-review-followups.md |
| TASK-067 | **LOW** — Consistency cleanup: (a) migrate `UserController` admin endpoints from `JwtAuthGuard + RolesGuard + @Roles(ADMIN)` to `@UseGuards(AdminGuard)`; (b) add explicit timezone alignment comment to `DashboardRepository.windowStart` documenting UTC assumption. | ✅ | docs/plans/031-phase4-review-followups.md |

---

## Phase 5: Polish & Production

### Production Features

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-044 | Redis caching for product listings | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-A | Install @nestjs/cache-manager + cache-manager-ioredis-yet dependencies | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-B | Extend env.validation.ts with Redis env vars (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_CACHE_TTL_SECONDS) | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-C | Implement cache-key builder utility (TDD) — buildProductListKey pure function + spec | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-D | Implement CacheService wrapper (TDD) — get/set/del/delByPrefix with graceful degradation + spec | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-E | Create global RedisCacheModule; register in AppModule; conditional ioredis vs in-memory store | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-F | Integrate cache-aside reads into ProductService (findAll, findBySlug, findById) + extend product.service.spec.ts | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-G | Add cache invalidation on product writes (create, update, deactivate, activate) + extend spec | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-H | Add cache invalidation in OrderRepository for stock mutations (createFromCart, cancelAndRestock) + extend spec | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-044-I | Real-Redis integration spec under test:int harness (hit/miss/invalidation/degradation) — spec written; ▶ run pending Docker Redis up | 🔄 | docs/plans/032-redis-product-caching.md |
| TASK-044-J | Verification gate — build / lint / typecheck ✅; 268 unit + 163 e2e green; api+client+admin builds ✅; no Orval files modified | ✅ | docs/plans/032-redis-product-caching.md |
| TASK-045 | Dynamic sitemap.xml + Schema.org microdata | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-A | Add NEXT_PUBLIC_SITE_URL + NEXT_PUBLIC_CURRENCY env vars; create shared/config/site.ts (SITE_URL, CURRENCY, SITE_NAME constants) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-B | Create shared/lib/schema builder functions (buildProductSchema, buildBreadcrumbSchema, buildOrganizationSchema, buildWebSiteSchema) + unit tests (TDD Red→Green) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-C | Create shared/ui/JsonLd dumb Server Component (XSS-safe dangerouslySetInnerHTML — escapes `<`/`>`/`&` to unicode) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-D | Create shared/lib/schema/fetchAllProducts.ts server-side paginator using Orval plain fetcher (no hooks, no manual axios) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-E | Add app/robots.ts (MetadataRoute.Robots — disallow cart/checkout/orders/login/register, point to sitemap) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-F | Add app/sitemap.ts (MetadataRoute.Sitemap — force-dynamic; static routes + dynamic product pages; graceful fallback on fetch error) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-G | Update app/layout.tsx — add metadataBase + title template + OpenGraph defaults | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-H | Inject JSON-LD into product detail page (Product + BreadcrumbList + extended generateMetadata with canonical/OG), product list page (BreadcrumbList), and home page (Organization + WebSite) | ✅ | docs/plans/033-seo-sitemap-schema.md |
| TASK-045-I | Verification gate — build / lint / typecheck / unit tests ✅; robots.txt + sitemap.xml fallback verified via running server; JSON-LD in product HTML pending running API | 🔄 | docs/plans/033-seo-sitemap-schema.md |
| TASK-046 | Rate limiting + Helmet + CSRF protection | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-A | Install dependencies — `ioredis` (direct); `csrf-csrf` rejected (ESM-only, CJS-incompatible) → manual signed double-submit; `@nestjs/throttler-storage-redis` does not exist + canonical pkg deprecated → custom Redis throttler storage | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-B | Extend env.validation.ts with `CSRF_SECRET` (@IsOptional @MinLength(32)); .env.example blocked by .env* permission guard — documented in env.validation.ts comments | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-C | Harden Helmet (extracted to config/security.config.ts) — prod CSP + HSTS 1y + referrer-policy; Swagger UI CSP exception in dev; + unit test | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-D | Tune throttler — ThrottlerModule.forRootAsync with custom RedisThrottlerStorage (Lua, fail-open) when REDIS_HOST set; @Throttle on POST /api/auth/refresh; + unit tests | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-E | Manual signed double-submit CSRF — csrf.util + CsrfService.protect middleware + GET /api/csrf-token + CsrfModule; Bearer-auth requests exempt; 19 unit tests (TDD) | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-F | Wire CsrfService.protect to /api/auth/refresh + /api/cart in main.ts + import CsrfModule; store-client + store-admin instance.ts add lazy CSRF token + X-Requested-With (no Orval files touched) | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-046-G | Input audit — @MaxLength added to RegisterDto + AddressDto free-text fields (product/category already capped); security.e2e-spec.ts (CSRF 403/pass, Bearer exempt, Helmet headers, live 429); full gate: 296 unit + 170 e2e ✅, api+client+admin build/lint/typecheck ✅, no Orval files modified | ✅ | docs/plans/034-security-hardening-csrf.md |
| TASK-047 | Pino structured logging — production-grade hardening (redaction, correlation IDs, serializers, async config, structured events) | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-A | Extend `env.validation.ts` with `LOG_LEVEL`; migrate `LoggerModule.forRoot` to `forRootAsync` reading config from `ConfigService` | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-B | Extract `buildPinoHttpOptions` factory to `pino.config.ts`; add `pino redact` for 9 sensitive paths (TDD Red→Green) | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-C | Add `genReqId` (reuse `X-Request-Id` header or UUID; reflects ID on response via `res.setHeader`); add custom `req`/`res`/`err` serializers (TDD Red→Green) | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-D | Resolve double-logging — retire success-path `logger.info` from `LoggingInterceptor`; add `autoLogging.ignore` for `/health`; write interceptor unit tests | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-E | Convert string-interpolated service logs to structured `{ event, ...fields }` form in `order.service.ts`; inject `PinoLogger` into `auth.service.ts` + add `user.registered` event log | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-F | Migrate `CacheService` and `MailService` from built-in `new Logger(...)` to injected `PinoLogger` (+ `setContext`, matching the repo convention) for consistent JSON output | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-047-G | Verification gate — build / lint / typecheck / unit + e2e green; no Orval files modified; manual smoke: `X-Request-Id` header present, password redacted in logs | ✅ | docs/plans/035-pino-structured-logging.md |
| TASK-048 | Sentry integration (frontend + backend) | ⬜ | — |
| TASK-049 | Abandoned cart detection + email follow-up | ⬜ | — |
| TASK-050 | GA4 e-commerce events | ⬜ | — |

### Localization (UA / UAH) — Plan 040

> **Critical / sequenced first:** completes before the UI/UX Redesign (TASK-068) so the redesign consumes Ukrainian strings from the start.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-069 | Central money formatter `formatMoney` (uk-UA / UAH, TDD) + `shared/lib` barrel; `NEXT_PUBLIC_CURRENCY=UAH` (`.env*` blocked by guard — `site.ts` default covers it) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-A | Replace 8 scattered `en-US`/`USD` `priceFormatter` duplicates with `formatMoney` | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-B | Ukrainian typed string dictionary `shared/config/dictionary.ts` (+ barrel re-export) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-C | Translate header / nav / footer / root layout; `<html lang="uk">`; OG `locale: uk_UA` | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-D | Translate homepage (hero, category-nav, section headings, metadata) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-E | Translate product catalog + filter panel + product card | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-F | Translate product detail page (breadcrumb, variants, stock, add-to-cart) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-G | Translate cart page (view, item row, summary; neutral plural phrasing) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-H | Translate checkout + zod validation messages (TDD) + address form | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-I | Translate order confirmation + locale dates (`uk-UA`) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-J | Translate auth forms (login/register) + zod messages + page metadata | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-K | SEO metadata audit + `site.ts` `CURRENCY` default → `UAH`; schema test fixture → UAH | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-L | Ukrainianize order-confirmation email (store-api, ₴ formatter, `lang="uk"`, TDD) | ✅ | docs/plans/040-uk-localization-uah-currency.md |
| TASK-069-M | Verification gate — typecheck / lint / build all 3 workspaces; store-api 328 unit + store-client 21 unit + email 15 specs green; manual visual pass pending running stack | 🔄 | docs/plans/040-uk-localization-uah-currency.md |

### UI/UX Redesign — Plan 039

> **Depends on:** TASK-069 (localization) must be ✅ before starting — redesigned components are built with Ukrainian copy.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-068 | Storefront UI/UX redesign — parent (core delivered; some per-task polish deferred) | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-A | Design-token refresh (sale/success/warning/secondary, indigo primary, radius, shadows) + shadcn/ui bootstrap (Button/Badge/Input/Label/Textarea/Select/Dialog/Sheet/Tabs/Sonner/Separator copied from store-admin; `components.json`; deps added) | ✅ | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-B | Header redesign — sticky + backdrop, live cart-count badge, mobile Sheet menu, Button-based auth. Deferred: inline header search input | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-C | Product card — Sale/New badge chips, hover elevation, sale-priced styling, image-ready placeholder. **Blocked:** real image + hover-ATC overlay need API fields (ProductEntity has no image/variant data) | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-D | Homepage — gradient hero w/ badge + dual CTA, 4-item trust strip, "Featured" rename. Deferred: category-tile images (no category image field) | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-E | Filters — shadcn Select/Input/Label primitives + active-filter chips strip above grid. Deferred: mobile filter drawer (Sheet), sort relocation above grid | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-F | PDP — stock indicator (in/low/out via tokens), trust-badge strip, Description/Specs/Reviews Tabs, related-products row. Deferred: `next/image` swap (image host not configured), mobile sticky ATC bar | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-G | Cart — accessible Dialog replaces `window.confirm`, secure-checkout + shipping trust lines, continue-shopping link. Deferred: cart-item-row Button/Input primitive swap | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-H | Checkout — 3-step visual stepper, shadcn Input/Label + Button, delivery-ETA line. Deferred: (auth) layout card polish | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-I | Footer redesign — multi-column (Shop/Support/Contact), trust-icon strip, payment icons, responsive | ✅ | docs/plans/039-storefront-ui-ux-redesign.md |
| TASK-068-J | Toast (Sonner) provider mounted + AddToCart success toast + skip-nav link + `id=main-content`. Deferred: full focus-ring audit, error→toast migration | 🔄 | docs/plans/039-storefront-ui-ux-redesign.md |

---

## Tech Debt & Architecture Review

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-054 | Review repository & folder architecture across the monorepo: root vs workspace `package.json` script conventions (standardize `db:*`/`prisma:*` naming, add missing root proxies + `db:seed`, align with `/db-*` slash commands), workspace boundaries, shared config placement, and overall directory layout consistency. Also consolidate the duplicated/divergent TypeScript configs: `packages/typescript-config/base.json` still declares the deprecated `moduleResolution: "node"` (node10) while `nest.json` now overrides to `node16` and `test/tsconfig.e2e.json` re-declares the same compiler options by hand — pick one source of truth and remove the drift. Consider bumping `@nestjs/cli` to clear the `DEP0190` child-process shell warning. Produce a findings doc + cleanup task breakdown. | ✅ | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-A | Standardize `package.json` scripts: add root `db:push`, `db:migrate`, `db:seed`, `db:studio`, `db:generate`, `generate:api` proxy scripts; add `prisma:push` to `store-api`; add `test` stub to `store-admin`; align `/db-*` and `/generate-api` slash command bodies with new root script names | ✅ | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-B | Consolidate TypeScript configs: change `base.json` `moduleResolution` from `"node"` to `"node16"`; remove redundant overrides from `nest.json`; strip hand-re-declared options from `test/tsconfig.e2e.json`; optionally clean up `store-client`/`store-admin` tsconfigs | ✅ | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-C | Bump `@nestjs/cli` to `^11.0.0` and `@nestjs/schematics` to `^11.0.0` (devDependencies only) to clear `DEP0190` child-process shell warning; verify `nest build` and `start:dev` are warning-free | ✅ | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-D | Directory layout and workspace boundary audit: assess shared config placement, Orval config duplication across frontends, Docker Compose path dependencies; document findings; add new BACKLOG entries for any actionable items | ✅ | docs/plans/036-monorepo-architecture-review.md |
| TASK-054-E | Verification gate: `typecheck` / `build` / `lint` / `test` / `test:e2e` all green after A–D; smoke-test new root `db:*` and `generate:api` scripts; confirm no Orval-generated files changed; confirm no `DEP0190` warning | ✅ | docs/plans/036-monorepo-architecture-review.md |
| TASK-058 | (from TASK-054-D) Consolidate the near-identical `orval.config.ts` files (differ only by project key) into a shared `@store/orval-config` factory under `packages/`; low priority | ✅ | docs/plans/037-orval-config-consolidation.md |
| TASK-058-A | Create `packages/orval-config` workspace package with `createOrvalConfig` factory (hand-authored CJS `index.js` + `index.d.ts`, no build step — matches `@store/eslint-config` convention) | ✅ | docs/plans/037-orval-config-consolidation.md |
| TASK-058-B | Add `@store/orval-config` as devDependency to `apps/store-client` and `apps/store-admin`; verify workspace symlink | ✅ | docs/plans/037-orval-config-consolidation.md |
| TASK-058-C | Rewrite both `orval.config.ts` files to call `createOrvalConfig({ name })` factory | ✅ | docs/plans/037-orval-config-consolidation.md |
| TASK-058-D | Verification gate: zero diff in `**/shared/api/generated/**` after `npm run generate:api`; typecheck / build / lint green | ✅ | docs/plans/037-orval-config-consolidation.md |
| TASK-059 | (from TASK-054-D) Align the divergent `/api` baseURL convention between `store-client` and `store-admin` `shared/api/instance.ts` — store-admin `baseURL` must drop `/api` suffix; hand-written CSRF and refresh paths must carry `/api` prefix; low priority but security-sensitive (CSRF + auth refresh correctness) | ✅ | docs/plans/038-instance-baseurl-alignment.md |
| TASK-059-A | Zero-diff gate — run `npm run generate:api` after TASK-059 and assert `git diff -- "**/shared/api/generated/**"` is empty in both apps before committing | ✅ | docs/plans/038-instance-baseurl-alignment.md |
| TASK-059-B | Manual verification — confirm store-admin admin login, silent auth refresh on 401, CSRF token fetch to correct `/api/csrf-token` path, and protected mutation succeeds (requires running stack) | ⬜ (pending — needs running stack; Docker Desktop offline at impl time) | docs/plans/038-instance-baseurl-alignment.md |

### Bugfixes (from 2026-06-20 manual QA pass — `docs/manual-qa-master.md`)

> Renumbered from TASK-069/070 → TASK-071/072 to avoid collision with the
> localization plan (TASK-069) and redesign (TASK-068). `docs/manual-qa-master.md`
> still references the original 069/070 labels for these two fixes.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-071 | **HIGH (SEO)** — `sitemap.xml` contains zero product routes against a live API. `apps/store-client/src/shared/lib/schema/fetchAllProducts.ts` used `PAGE_SIZE = 200`, but `GET /api/products` caps `limit` at 100, so the first page request returns `400 "Limit must be at most 100"`; `fetchAllActiveProducts` throws and the sitemap silently falls back to static-only routes. Fix: `PAGE_SIZE = 100`. Verified via curl: API live with 13 active products, yet sitemap emitted only `/` + `/products`. | ✅ | docs/manual-qa-master.md |
| TASK-072 | **MEDIUM (DevOps)** — `docker compose up -d redis` crash-loops with `FATAL CONFIG FILE ERROR ... 'requirepass' wrong number of arguments`. `docker-compose.yml` used `--requirepass ${REDIS_PASSWORD:-}`, which passes a bare `--requirepass` flag with no value when `REDIS_PASSWORD` is unset (the default). Blocks §C5 Redis QA out of the box. Fix: pass `REDIS_PASSWORD` into the container env and only append `--requirepass` when non-empty (shell `${VAR:+…}`), plus matching auth-aware healthcheck. | ✅ | docs/manual-qa-master.md |

---

## Storefront Commerce Gaps — feature-parity audit (2026-06-21)

> Checklist of what the storefront is **missing vs the Ukrainian benchmark shops**
> (ivan-chohol.ua, ktc.ua, ash-mobile.com.ua). The architecture/backend is ahead of
> these shops; the gaps are conversion-driving **commerce features and visual depth**.
> Design work should go through the new `designer` agent + `docs/design-system.md`, and
> verify visually via `npm run screenshots -w apps/store-client`.
> Items already tracked elsewhere are cross-referenced, not duplicated.

### 🔴 Critical — blocks premium look & conversion

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-073 | **Product images (backend + frontend).** `ProductEntity` exposes no image data, so cards/PDP show placeholders and `next/image` can't be wired. Add `ProductImage` model (url, alt, sortOrder, isPrimary) + variant images, admin upload, expose on list + detail API, regen Orval. **Unblocks TASK-068-C/-F.** Highest-impact gap for an accessories store. | ⬜ | — |
| TASK-074 | **Image hosting + `next/image` optimization.** Configure remote image host/CDN (`next.config` `images.remotePatterns`), responsive `sizes`, blur placeholder; swap all `<img>`/`bg` placeholders to `next/image`. Depends on TASK-073. | ⬜ | — |
| TASK-075 | **Header search with autocomplete.** Inline search in header (deferred in TASK-068-B) + suggestions dropdown (product/category hits, debounced) backed by a search endpoint. Consider Meilisearch later (typo-tolerance, per requirements.md). | ⬜ | — |

### 🟠 High — expected commerce features users look for

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-076 | **Wishlist / favorites ("Список бажань").** Heart toggle on cards + PDP, dedicated page, header count badge. Backend Wishlist model (guest via cookie, merge on login — mirror guest-cart pattern) + Orval. | ⬜ | — |
| TASK-077 | **Variant/color dots on product card + quick-add.** Surface variant (color/model) summary on the list API so cards show selectable color dots and a hover "add to cart" overlay (the other half of deferred TASK-068-C). | ⬜ | — |
| TASK-078 | **Product reviews — write flow + moderation.** Ratings are aggregated/read-only today; add authenticated review submission (rating + text + verified-purchase check), display list with pagination on PDP, and admin moderation queue (approve/reject). | ⬜ | — |
| TASK-079 | **Promo codes / coupons at checkout.** Discount-code model + validation (percent/fixed, min-spend, expiry, usage caps), apply field in cart/checkout, reflected in totals; admin CRUD. | ⬜ | — |
| TASK-080 | **Delivery method + Nova Poshta selector.** Delivery options (courier / branch pickup) with city + branch autocomplete, delivery cost + ETA shown in checkout and as "Відправимо завтра"-style hints on cards. | ⬜ | — |
| TASK-081 | **Payment integration (real).** Already tracked as **TASK-034** (Stripe stub ⬜). For UA market also plan card/installment providers (LiqPay/Fondy/Mono "оплата частинами"). | ⬜ | docs/plans/021-payment-integration.md |

### 🟡 Medium — polish, discovery & trust

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-082 | **Mega-menu / full catalog tree in header.** Hover/click catalog panel with category hierarchy + featured links (benchmark shops lead with this). | ⬜ | — |
| TASK-083 | **Category tile images** on homepage (deferred in TASK-068-D — needs a `Category.image` field + admin upload). | ⬜ | — |
| TASK-084 | **Mobile filter drawer + sort relocation** (deferred in TASK-068-E): filters in a `Sheet` on mobile, sort control moved above the grid. | ⬜ | — |
| TASK-085 | **Product comparison ("Порівняння").** Compare toggle on cards + side-by-side specs page. | ⬜ | — |
| TASK-086 | **Quick-view modal** from product cards (Dialog with gallery + key info + add-to-cart) to shorten path to purchase. | ⬜ | — |
| TASK-087 | **Recently viewed products** strip (localStorage-backed) on PDP/home. | ⬜ | — |
| TASK-088 | **Bestseller / "Хіт продажу" badge** driven by sales data (extends existing Sale/New badges). | ⬜ | — |
| TASK-089 | **Contact & social bar.** Top bar with phone + working hours + Viber/Telegram/Instagram links; reinforces trust like the benchmark shops. | ⬜ | — |
| TASK-090 | **Newsletter signup** (footer) + **cookie-consent banner** (UA/GDPR) — also a prerequisite for compliant GA4 (TASK-050) and Pixel. | ⬜ | — |

### Already tracked (analytics / errors / marketing)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-048 | Sentry integration (frontend + backend) | ⬜ | — |
| TASK-049 | Abandoned cart detection + email follow-up | ⬜ | — |
| TASK-050 | GA4 e-commerce events (depends on cookie consent — TASK-090) | ⬜ | — |

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
