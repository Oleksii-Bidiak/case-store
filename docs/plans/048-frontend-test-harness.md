# Plan: Frontend Test Harness

> **Status:** In Progress
> **Phase:** Phase B — Reliability & Observability
> **Roadmap task:** TASK-105
> **Created:** 2026-06-22
> **Last Updated:** 2026-06-22

---

## Overview

The frontend has thin, logic-only test coverage today. `apps/store-client` runs
Jest + ts-jest in a `node` environment and only matches `*.test.ts` files — no JSX, no
DOM, no component rendering. `apps/store-admin` has zero test infrastructure. Neither
app has MSW, RTL, or any E2E tooling wired up.

This plan wires up the full target stack in five independently-shippable sub-tasks:

1. **105-A** — Install RTL + MSW + jsdom in store-client; create a render helper and
   a base set of MSW handlers; configure a second Jest project that runs component tests.
2. **105-B** — Write component tests for the two highest-risk areas: the cart widget
   (`CartItemRow`, `CartSummary`, `CartView`) and the checkout form
   (`CheckoutAddressForm`, `CheckoutView`), using MSW to intercept the Orval-generated hooks.
3. **105-C** — Mirror the store-client component-test setup in store-admin (install
   Jest + RTL + MSW + jsdom, author a config, add scripts) and write one smoke
   component test so the pipeline is proven green.
4. **105-D** — Scaffold Playwright E2E: install `@playwright/test`, write
   `playwright.config.ts` with `webServer` for the API server + Next.js client, and
   author the two core spec files (browse→add-to-cart→checkout, auth login/register).
   Run locally first; full CI gating is deferred.
5. **105-E** — CI integration: add a `test-unit-frontend` job to `.github/workflows/ci.yml`
   that runs store-client + store-admin Jest suites; add a separate `test-e2e-playwright`
   job that is non-blocking (continue-on-error or manual trigger) until the test DB
   seeding and web-server startup are proven stable.

Work happens on branch `feature/105-frontend-test-harness` off `develop`.

---

## Scope

### In Scope

- Adding RTL, jest-dom, @testing-library/user-event, msw, jest-environment-jsdom to
  store-client as devDependencies.
- A second Jest "project" inside `jest.config.cjs` (or a `jest.config.component.cjs`)
  for component tests so the existing `*.test.ts` node-env logic tests are not disrupted.
- MSW handlers that cover the cart, orders (create), and auth endpoints used in the
  component tests — keyed to the Orval-generated URL patterns.
- A `src/shared/test/` directory (following FSD shared-layer convention) for the render
  helper, MSW server bootstrapper, and MSW handlers.
- Cart and checkout component tests in store-client.
- Jest scaffold + one smoke test in store-admin.
- Playwright scaffold: `playwright.config.ts`, `e2e/` directory at monorepo root,
  two spec files (cart flow, auth flow).
- CI jobs: one for Jest unit + component tests, one scaffolded Playwright job.

### Out of Scope

- Migrating existing `*.test.ts` logic tests to a different runner — they stay in
  place and continue running exactly as today.
- RTL tests for server components (Next.js App Router server components cannot be
  rendered in jsdom — only client components tagged with `"use client"` are in scope).
- Replacing Orval-generated files or altering the API contract.
- Full Playwright CI green gate (deferred until web-server boot is proven stable).
- Sentry or observability changes (TASK-048).
- MSW browser-mode service-worker setup (node-mode MSW is sufficient for Jest).

---

## User Stories

1. As a developer, I want component tests for the cart and checkout features so that I
   catch regressions in quantity-update/remove mutations and form validation before they
   reach staging.
2. As a developer, I want a working Jest harness in store-admin so that future admin UI
   work can be component-tested from day one.
3. As a developer, I want Playwright E2E specs for the browse→cart→checkout and auth
   flows so that I can smoke-test the full stack locally before a release.
4. As a CI pipeline, I want frontend unit + component tests to run on every push/PR so
   that the `test-unit` job covers all three apps (API, store-client, store-admin).

---

## Existing Test Infrastructure — Audit Findings

### store-client

**Jest config:** `apps/store-client/jest.config.cjs`

```js
module.exports = {
  rootDir: "src",
  testEnvironment: "node",           // node — no DOM
  testMatch: ["**/*.test.ts"],       // .ts only — no .tsx
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  transform: { "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true, ... }] },
};
```

**Existing test files (all pure logic, no React rendering):**

| File                                                          | What it tests                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/checkout/model/checkout-schema.test.ts`         | zod `checkoutSchema` — 6 cases covering valid payloads, missing fields, invalid phone, notes max                                   |
| `src/shared/lib/format/formatMoney.test.ts`                   | `formatMoney` utility — 5 cases: thousands sep, fractional, zero, trailing zeros, non-numeric                                      |
| `src/shared/lib/schema/schema.test.ts`                        | JSON-LD schema builders (`buildOrganizationSchema`, `buildWebSiteSchema`, `buildBreadcrumbSchema`, `buildProductSchema`) — 7 cases |
| `src/widgets/product-detail/ui/product-image-gallery.test.ts` | Pure helper `altText` — 3 cases; mocks `@/shared/ui` barrel                                                                        |

**Installed testing devDeps:**

- `jest`, `ts-jest` — present (inferred; `jest.config.cjs` exists and references ts-jest).
- `@testing-library/*`, `msw`, `jest-environment-jsdom` — **NOT installed** (confirmed:
  no entries in `apps/store-client/package.json` devDependencies).
- `playwright` `^1.61.0` — installed as a devDep **but `@playwright/test` is absent**; this
  is the Playwright core library without the test runner. No `playwright.config.*` exists.
  No `e2e/` directory exists.

**Test script:** `"test": "jest"` (runs all `*.test.ts` in node env).

### store-admin

- **No jest config** — confirmed by Glob returning no results.
- **Test script:** `"test": "echo 'No tests yet' && exit 0"` — exits 0 (CI passes vacuously).
- **No testing devDeps** — no `jest`, `ts-jest`, `@testing-library/*`, `msw`.
- **tsconfig:** identical FSD path alias setup to store-client (`@/*` → `./src/*`, FSD
  layer paths); same `@store/typescript-config/next` base.
- **Dev port:** `next dev -p 3002`.

### Playwright

- `playwright ^1.61.0` is in `apps/store-client` devDependencies (Playwright browser library).
- `@playwright/test` is **not installed** anywhere.
- No `playwright.config.*` file exists anywhere in the monorepo.
- No `e2e/` directory exists.

### CI

`.github/workflows/ci.yml` current jobs:

| Job         | Trigger                | Notes                                                |
| ----------- | ---------------------- | ---------------------------------------------------- |
| `typecheck` | all pushes             | `npm run typecheck`                                  |
| `lint`      | all pushes             | `npm run lint`                                       |
| `build`     | after typecheck + lint | Prisma generate + `npm run build`                    |
| `test-unit` | after typecheck + lint | `npm run test` (runs only store-api Jest)            |
| `test-e2e`  | after test-unit        | store-api Supertest E2E against Postgres service     |
| `test-int`  | after test-unit        | store-api integration tests against Postgres service |

The root `"test"` script currently delegates only to store-api tests. Frontend unit
tests for store-client do not run in CI today.

---

## Component Test Targets

### Cart widgets (store-client)

| Component     | File                                    | Orval hooks used                                               | Test focus                                                                                                |
| ------------- | --------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CartItemRow` | `src/widgets/cart/ui/cart-item-row.tsx` | `useUpdateCartItem`, `useRemoveCartItem`, `getGetCartQueryKey` | Qty stepper increments/decrements, remove button triggers `removeItem.mutate`, error alert on API failure |
| `CartSummary` | `src/widgets/cart/ui/cart-summary.tsx`  | `useClearCart`, `getGetCartQueryKey`                           | Totals displayed, clear-cart dialog confirm path, error alert                                             |
| `CartView`    | `src/widgets/cart/ui/cart-view.tsx`     | `useGetCart`                                                   | Loading skeleton, error state + retry, empty cart state, populated state renders `CartItemRow` list       |

### Checkout (store-client)

| Component             | File                                                 | Orval hooks / schema                                | Test focus                                                                                          |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `CheckoutAddressForm` | `src/features/checkout/ui/checkout-address-form.tsx` | `CheckoutFormValues` zod schema                     | Required fields render, aria-invalid set on error, error messages appear in `role="alert"` elements |
| `CheckoutView`        | `src/widgets/checkout/ui/checkout-view.tsx`          | `useGetCart`, `useCreateOrder`, `useAuth` (context) | Unauthenticated redirect, empty cart redirect, form submit calls mutation, error message on 400     |

### Auth (store-client — for Playwright; RTL test is optional)

| Component      | File                                     | Orval hooks                 |
| -------------- | ---------------------------------------- | --------------------------- |
| `LoginForm`    | `src/features/auth/ui/login-form.tsx`    | `useAuthControllerLogin`    |
| `RegisterForm` | `src/features/auth/ui/register-form.tsx` | `useAuthControllerRegister` |

`useAuth` is a React context (`entities/session/model/auth.context.tsx`). Component tests
that involve `CheckoutView` or `LoginForm` must provide an `AuthProvider` wrapper (or mock
the context value directly).

### MSW URL patterns (Orval-generated base URLs)

All Orval hooks call through `src/shared/api/instance.ts` (`customInstance`). The
base URL in tests defaults to `http://localhost:3001`. MSW handlers should use
`http.get("*/api/cart", ...)` glob patterns (the `*` prefix absorbs the origin) or
explicit `http://localhost:3001/api/cart` paths. Key patterns:

| Hook                        | Method | URL pattern                |
| --------------------------- | ------ | -------------------------- |
| `useGetCart`                | GET    | `*/api/cart`               |
| `useAddToCart`              | POST   | `*/api/cart/items`         |
| `useUpdateCartItem`         | PATCH  | `*/api/cart/items/:itemId` |
| `useRemoveCartItem`         | DELETE | `*/api/cart/items/:itemId` |
| `useClearCart`              | DELETE | `*/api/cart`               |
| `useCreateOrder`            | POST   | `*/api/orders`             |
| `useAuthControllerLogin`    | POST   | `*/api/auth/login`         |
| `useAuthControllerRegister` | POST   | `*/api/auth/register`      |

---

## Technical Design

### Component test architecture decision

**Decision: two Jest projects in one config (not two separate config files).**

`jest.config.cjs` uses the `projects` array to define two test suites that share the
same runner process:

- **`unit`** — existing behaviour: `testEnvironment: "node"`, `testMatch: ["**/*.test.ts"]`,
  no setup file. Keeps all four existing tests running without change.
- **`component`** — new: `testEnvironment: "jsdom"` (via `jest-environment-jsdom`),
  `testMatch: ["**/*.test.tsx"]`, `setupFilesAfterEnv: ["<rootDir>/shared/test/setup.ts"]`.

This avoids breaking the existing suite while adding component tests. Running
`npm run test -w apps/store-client` executes both projects.

### ts-jest vs @swc/jest

**Decision: keep ts-jest, add `@swc/jest` only in the component project.**

`ts-jest` with `isolatedModules: true` is fast enough for the four existing node-env
tests. For the component project, `@swc/jest` (Rust-based) is materially faster when
rendering React trees. Install `@swc/jest` and `@swc/core` as devDeps in store-client
and use them in the `component` project transform only.

Alternatively, the entire config can switch to `@swc/jest` uniformly — the plan
records this as an option but defaults to the split approach to minimize risk to
existing tests.

### MSW recommendation

Use **MSW v2 node mode** (`msw/node`) for all Jest component tests. This intercepts
actual HTTP requests made by the Orval hooks (via axios `customInstance`) at the
network layer, exercising the real hooks rather than mocking them. The alternative
— mocking the generated hook modules with `jest.mock()` — would bypass the hook
entirely and miss integration regressions. MSW is the stated target in the
`frontend-testing` skill.

### Render helper location

Place all test infrastructure in `src/shared/test/` (FSD shared-layer convention):

```
src/shared/test/
  setup.ts             — jest setupFilesAfterEnv: imports jest-dom, starts MSW server
  msw-server.ts        — setupServer(...handlers)
  msw-handlers.ts      — default handler set (cart, orders, auth endpoints)
  render.tsx           — renderWithProviders(ui, options?) wrapping QueryClientProvider
                         + AuthProvider (with a configurable mock session)
```

This directory is imported with `@/shared/test/...` using the existing `@/*` alias.
It is excluded from production builds via `tsconfig.json`'s exclude (no prod import
path should ever reach `shared/test/`).

### jsdom + Next.js App Router caveat

`jsdom` cannot execute Next.js server components (files without `"use client"`). The
four component test targets above are all Client Components (`"use client"` at the top
of each file). Do not attempt to render page-level server components in RTL tests.

For `CheckoutView` specifically: the component reads from `AuthProvider` context and
calls `useRouter` / `useSearchParams`. Mock these Next.js navigation hooks with:

```ts
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
```

### Playwright web server strategy

The E2E spec files need three running services:

1. PostgreSQL — seeded with at least one product and one registered user.
2. `apps/store-api` on port 3001.
3. `apps/store-client` on port 3000.

`playwright.config.ts` uses the `webServer` array to spin up the API and client before
tests run. The DB must be started manually (or via Docker Compose) before running
Playwright locally. A `test:e2e:pw` script in the root `package.json` is added as the
entry point.

For CI, the Playwright job is scaffolded but marked `continue-on-error: true` until
seeding and startup are proven reliable. This avoids blocking PRs on flaky browser
tests while the harness matures.

### Playwright test DB strategy

Reuse the existing `store_test` PostgreSQL database pattern from `ci.yml` (Postgres 17
service container). Playwright E2E requires:

1. `npx prisma migrate deploy` against `store_test`.
2. A seed script that inserts a test product and a test user — either the existing
   `prisma/seed.ts` or a minimal dedicated E2E seed. Recommend extending the existing
   seed with `NODE_ENV=test` guard to insert predictable fixtures (product slug, user
   email/password) that the Playwright specs can rely on.

---

## Tasks

### TASK-105-A: RTL + MSW + jsdom foundation in store-client

**Type:** chore (test infrastructure)
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** nothing

**Acceptance Criteria:**

- [ ] `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`,
      `jest-environment-jsdom`, `msw`, `@swc/jest`, `@swc/core` added to
      `apps/store-client/package.json` devDependencies.
- [ ] `jest.config.cjs` updated to use `projects` array: `unit` project unchanged (node env,
      `*.test.ts`); `component` project added (jsdom env, `*.test.tsx`, setupFilesAfterEnv,
      @swc/jest transform).
- [ ] `src/shared/test/setup.ts` created — imports `@testing-library/jest-dom`, bootstraps
      MSW server lifecycle (`beforeAll`/`afterEach`/`afterAll`).
- [ ] `src/shared/test/msw-server.ts` created — `setupServer(...handlers)`.
- [ ] `src/shared/test/msw-handlers.ts` created — baseline handlers for cart GET, cart
      item PATCH/DELETE, clear cart DELETE, create order POST, auth login POST,
      auth register POST; all return well-formed `{ data: ... }` envelopes matching
      the generated model types.
- [ ] `src/shared/test/render.tsx` created — `renderWithProviders(ui, options?)` wrapping
      `QueryClientProvider` (retry: 0) and `AuthProvider` with a configurable mock session.
- [ ] `npm run test -w apps/store-client` runs all six existing `*.test.ts` files green
      (no regressions in the unit project).
- [ ] `npm run lint -w apps/store-client` and `npm run typecheck -w apps/store-client` pass.

**Files to create/modify:**

- `apps/store-client/package.json` — add devDependencies
- `apps/store-client/jest.config.cjs` — add `projects` array
- `apps/store-client/src/shared/test/setup.ts` — new
- `apps/store-client/src/shared/test/msw-server.ts` — new
- `apps/store-client/src/shared/test/msw-handlers.ts` — new
- `apps/store-client/src/shared/test/render.tsx` — new

---

### TASK-105-B: Cart and checkout component tests in store-client

**Type:** test
**Scope:** store-client
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-105-A

**Acceptance Criteria:**

- [ ] `CartItemRow` test file created (`cart-item-row.test.tsx`):
  - Renders product name, price, and qty stepper.
  - Clicking "+" fires `useUpdateCartItem` mutation (MSW PATCH handler called).
  - Clicking "-" when qty is 1 fires `useRemoveCartItem` (MSW DELETE handler called).
  - Remove button fires `useRemoveCartItem`.
  - Error alert (`role="alert"`) appears when the MSW handler returns 500.
- [ ] `CartSummary` test file created (`cart-summary.test.tsx`):
  - Renders subtotal and total from the `totals` prop (formatted with `formatMoney`).
  - "Checkout" link is present with correct `href="/checkout"`.
  - Clear-cart dialog: clicking "Clear cart" button opens dialog; confirming calls
    `useClearCart` mutation; on success dialog closes.
- [ ] `CartView` test file created (`cart-view.test.tsx`):
  - Loading state: renders `CartSkeleton` (MSW handler deferred/pending).
  - Error state: renders error alert and retry button; clicking retry calls `refetch`.
  - Empty state: renders empty heading and "Shop now" link.
  - Populated state: renders list of `CartItemRow` elements and `CartSummary`.
- [ ] `CheckoutAddressForm` test file created (`checkout-address-form.test.tsx`):
  - All six fields render with correct labels (firstName, lastName, phone, city,
    deliveryAddress, notes area).
  - `aria-invalid` is set on fields that have `errors` passed.
  - Error messages appear in `role="alert"` elements.
  - Delivery hint text appears below deliveryAddress when no error.
- [ ] `CheckoutView` test file created (`checkout-view.test.tsx`):
  - Unauthenticated (isAuthenticated: false, isInitializing: false): `router.replace`
    called with `/login?redirect=/checkout`.
  - Empty cart (authenticated, cart items = []): `router.replace` called with `/cart`.
  - Populated cart + authenticated: renders form heading and submit button.
  - Submit with valid data: calls MSW POST `/api/orders` handler; on success redirects
    to confirmation page.
  - Submit with 400 from API: renders error message from `dict.checkout.error400`.
- [ ] `npm run test -w apps/store-client` runs all new `*.test.tsx` component tests green.
- [ ] No hand-edits to files under `src/shared/api/generated/`.

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-item-row.test.tsx` — new
- `apps/store-client/src/widgets/cart/ui/cart-summary.test.tsx` — new
- `apps/store-client/src/widgets/cart/ui/cart-view.test.tsx` — new
- `apps/store-client/src/features/checkout/ui/checkout-address-form.test.tsx` — new
- `apps/store-client/src/widgets/checkout/ui/checkout-view.test.tsx` — new
- `apps/store-client/src/shared/test/msw-handlers.ts` — extend as needed for new scenarios

---

### TASK-105-C: Jest + RTL scaffold in store-admin

**Type:** chore (test infrastructure) + test (smoke)
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-105-A (mirrors the pattern)

**Acceptance Criteria:**

- [ ] `jest`, `ts-jest` (or `@swc/jest`), `@testing-library/react`, `@testing-library/jest-dom`,
      `@testing-library/user-event`, `jest-environment-jsdom`, `msw` added to
      `apps/store-admin/package.json` devDependencies.
- [ ] `apps/store-admin/jest.config.cjs` created — mirrors store-client component project
      structure: jsdom env, `testMatch: ["**/*.test.{ts,tsx}"]`, `@/*` alias, @swc/jest
      transform, `setupFilesAfterEnv` pointing at `src/shared/test/setup.ts`.
- [ ] `apps/store-admin/src/shared/test/setup.ts`, `msw-server.ts`, `msw-handlers.ts`,
      `render.tsx` created (analogous to store-client; handlers cover admin-specific
      endpoints like `GET /api/admin/products`).
- [ ] `apps/store-admin/package.json` `"test"` script updated from the echo no-op to `"jest"`.
- [ ] One smoke component test written (e.g., the login page form or the dashboard stats
      card) that renders successfully with MSW and asserts at least one visible element.
- [ ] `npm run test -w apps/store-admin` runs the smoke test green and exits 0.
- [ ] `npm run lint -w apps/store-admin` and `npm run typecheck -w apps/store-admin` pass.

**Files to create/modify:**

- `apps/store-admin/package.json` — add devDependencies, update `"test"` script
- `apps/store-admin/jest.config.cjs` — new
- `apps/store-admin/src/shared/test/setup.ts` — new
- `apps/store-admin/src/shared/test/msw-server.ts` — new
- `apps/store-admin/src/shared/test/msw-handlers.ts` — new
- `apps/store-admin/src/shared/test/render.tsx` — new
- `apps/store-admin/src/[chosen-smoke-target].test.tsx` — new

---

### TASK-105-D: Playwright E2E scaffold — two core specs

**Type:** test (E2E)
**Scope:** store-client + store-api (monorepo root)
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-105-A (RTL toolchain demonstrates test infra is stable)

**Acceptance Criteria:**

- [ ] `@playwright/test` installed at the **monorepo root** `package.json` devDependencies
      (not inside store-client, where only the `playwright` core lib currently lives).
- [ ] `playwright.config.ts` created at the monorepo root with:
  - `testDir: "./e2e"`.
  - `baseURL: "http://localhost:3000"`.
  - `webServer` array: entry 1 boots the API (`npm run start:dev -w apps/store-api`,
    port 3001, env `DATABASE_URL` from env), entry 2 boots the client
    (`npm run dev -w apps/store-client`, port 3000, `NEXT_PUBLIC_API_URL=http://localhost:3001`).
  - Browser projects: Chromium only for MVP; Firefox and WebKit marked as optional.
  - `use: { trace: "on-first-retry" }`.
- [ ] `e2e/` directory created at monorepo root.
- [ ] `e2e/cart-flow.spec.ts` created:
  - Navigates to `/products`.
  - Clicks into a product (relies on seeded product with known slug).
  - Clicks "Add to cart" — asserts cart badge count increments.
  - Navigates to `/cart` — asserts product name appears and qty stepper is visible.
  - (Guest flow — no login required per the guest-cart-cookie architecture.)
  - Navigates to `/checkout` — asserts redirect to `/login?redirect=/checkout`
    (unauthenticated guard).
- [ ] `e2e/auth-flow.spec.ts` created:
  - Navigates to `/login` — fills email + password fields — submits — asserts
    redirect to home page and header shows logged-in state.
  - Navigates to `/register` — fills registration form — submits — asserts
    redirect and auth state.
  - After login, navigates to `/checkout` — asserts checkout form is shown (not redirected).
- [ ] `e2e/fixtures/seed-e2e.ts` (or similar) created — a minimal script that inserts
      a known product (slug `test-product`) and a test user
      (`e2e@test.com` / `E2ePassword1!`) using Prisma client directly, callable via
      `node e2e/fixtures/seed-e2e.ts` or as a `globalSetup` in `playwright.config.ts`.
- [ ] `"test:e2e:pw": "playwright test"` script added to root `package.json`.
- [ ] Running `npx playwright test --headed` locally (with Docker Compose DB + manually
      started API + client) produces both specs passing or informative failure messages.
- [ ] `npm run lint` and `npm run typecheck` stay green (e2e files excluded from app
      tsconfig or covered by a minimal `e2e/tsconfig.json`).

**Files to create/modify:**

- `package.json` (root) — add `@playwright/test` devDep, add `test:e2e:pw` script
- `playwright.config.ts` — new (monorepo root)
- `e2e/cart-flow.spec.ts` — new
- `e2e/auth-flow.spec.ts` — new
- `e2e/fixtures/seed-e2e.ts` — new (or extend `apps/store-api/prisma/seed.ts` with
  `NODE_ENV=test` guard for deterministic test fixtures)
- `e2e/tsconfig.json` — new (minimal, extends root tsconfig, includes only `e2e/**/*.ts`)

---

### TASK-105-E: CI wiring — frontend unit tests job + scaffolded Playwright job

**Type:** ci
**Scope:** monorepo (.github/workflows)
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-105-A, TASK-105-C (both Jest setups must be green), TASK-105-D (Playwright scaffold must exist)

**Acceptance Criteria:**

- [ ] `.github/workflows/ci.yml` updated:
  - The existing `test-unit` job updated to run `npm run test -w apps/store-api`,
    `npm run test -w apps/store-client`, `npm run test -w apps/store-admin` explicitly
    (or the root script is updated to delegate to all three).
  - A new `test-e2e-playwright` job added that:
    - Runs after `test-unit`.
    - Sets up a Postgres 17 service container (same pattern as existing `test-e2e`).
    - Installs Playwright browsers (`npx playwright install --with-deps chromium`).
    - Runs `npx prisma migrate deploy` + the E2E seed script.
    - Starts API + Next.js client via `playwright test` (the `webServer` config handles
      startup).
    - Has `continue-on-error: true` so flaky Playwright failures do not block the PR
      merge gate while the harness is being stabilized.
  - All existing jobs (`typecheck`, `lint`, `build`, `test-e2e` for store-api,
    `test-int`) remain unchanged.
- [ ] The `test-unit` job passes in CI with store-client and store-admin tests included.
- [ ] `npm run lint` and `npm run typecheck` pass with the updated CI file.

**Files to create/modify:**

- `.github/workflows/ci.yml` — update `test-unit` job; add `test-e2e-playwright` job

---

## Migration Steps (implementation order)

1. Branch: `git checkout -b feature/105-frontend-test-harness develop`.
2. Complete **TASK-105-A** — install deps, wire up Jest projects, create `src/shared/test/`.
3. Verify: `npm run test -w apps/store-client` — all existing tests pass; confirm
   component project is reachable by writing a trivial `smoke.test.tsx` in `src/shared/test/`.
4. Complete **TASK-105-B** — write cart and checkout component tests one component at a time.
5. Complete **TASK-105-C** — mirror infrastructure in store-admin, write smoke test.
6. Complete **TASK-105-D** — scaffold Playwright; run locally first; iterate until both
   specs pass locally.
7. Complete **TASK-105-E** — update CI; push branch; watch CI results; adjust if needed.
8. Open PR to `develop` once all Jest jobs are green in CI; Playwright job can remain
   `continue-on-error: true` at merge time.

---

## Decision Log

| Decision                                                       | Recommendation                                                           | Rationale                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock API at network layer (MSW) vs mock generated hook modules | **MSW**                                                                  | Exercises the real Orval hooks and their retry/error handling; hook mocks bypass the integration and can drift silently from the contract    |
| RTL render helper location                                     | `src/shared/test/` (FSD shared layer)                                    | Shared-layer convention; imported via `@/shared/test/` alias; not polluting feature layers                                                   |
| ts-jest vs @swc/jest for component project                     | **@swc/jest** for component project, ts-jest retained for unit project   | @swc/jest is significantly faster for JSX-heavy component test runs; keeping ts-jest for unit project avoids disrupting existing tests       |
| Playwright CI gate                                             | **continue-on-error: true** initially                                    | Browser tests are heavier and more flaky than Jest; full gating should be enabled only after the harness has been stable for several CI runs |
| Playwright browsers                                            | **Chromium only** for MVP                                                | Minimal installation time in CI; Firefox/WebKit can be added when coverage justifies the cost                                                |
| E2E test DB                                                    | Reuse Postgres service container pattern from existing `test-e2e` job    | Consistent with established CI pattern; seed via `globalSetup` or a pre-test script                                                          |
| `"use client"` component scope                                 | Only Client Components tagged `"use client"` are rendered in jsdom tests | Server Components cannot run in jsdom; all five targeted components are already `"use client"`                                               |

---

## Risks & Mitigations

| Risk                                                             | Likelihood     | Mitigation                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MSW handler drift from OpenAPI contract                          | Medium         | Handlers are keyed to the same URL patterns Orval generates; add a comment in `msw-handlers.ts` linking each handler to its generated type. Future improvement: generate MSW handlers from the OpenAPI spec via `orval` (Orval supports MSW handler generation)                                                                   |
| jsdom limitations: Radix UI Dialog/Portal rendering              | Medium         | Some Radix components use `document.body` portals — RTL's `screen` queries search the full document including portals; configure `container: document.body` in `render()` if needed                                                                                                                                               |
| Playwright flakiness — web server startup race                   | High initially | `webServer.reuseExistingServer: true` for local dev; `waitForPort` or `url` ping in config; `continue-on-error: true` in CI as safety net                                                                                                                                                                                         |
| CSRF protection on cart mutations in E2E                         | Medium         | The API mounts CSRF protection on `/api/cart` and `/api/auth/refresh`. Playwright E2E must first call `GET /api/csrf-token` and forward the token header on state-changing requests. The `AddToCartButton` component does this via the Axios instance — verify the `customInstance` CSRF flow works end-to-end in the E2E context |
| `next/navigation` hooks not available in jsdom                   | High           | Mock `useRouter`, `useSearchParams`, `usePathname` via `jest.mock("next/navigation", ...)` in each test file or in the global setup. Document the required mock in `render.tsx`                                                                                                                                                   |
| `AuthProvider` requires real context in CheckoutView tests       | Medium         | Provide a mock `AuthProvider` in `renderWithProviders` that accepts `{ isAuthenticated, isInitializing }` props as options                                                                                                                                                                                                        |
| Seeded test data coupling (E2E depends on specific slugs/emails) | Medium         | Document the E2E fixture data contract in `e2e/fixtures/seed-e2e.ts`; use a clearly namespaced prefix (`e2e-*`) for all inserted rows to avoid collision with manual test data                                                                                                                                                    |

---

## Notes

- The `playwright` package already in `apps/store-client` devDependencies is the Playwright
  library (browser automation), not the `@playwright/test` runner. Installing
  `@playwright/test` at the monorepo root avoids duplication and matches the monorepo
  pattern (Playwright E2E is a cross-app concern, not specific to store-client).
- The root `"test"` script in the monorepo `package.json` currently delegates via
  workspaces. Review whether `npm run test` calls all workspaces or just store-api;
  update TASK-105-E if the root script needs to be broadened.
- The guest-cart architecture (cookie-based `cartToken`, no auth required for cart
  operations) is already confirmed in project memory. The E2E cart-flow spec exploits
  this: browse and add-to-cart as a guest, assert unauthenticated redirect when
  reaching checkout.
- Once the Playwright harness is stable (TASK-105-E `continue-on-error` removed), the
  existing store-api E2E job and the Playwright job can share infrastructure via a
  reusable workflow to reduce duplication.
- Orval has native MSW handler generation support (`mode: "msw"` in `orval.config.ts`).
  This is a future improvement: generating MSW handlers automatically from the OpenAPI
  spec would keep handlers in sync with the contract without manual maintenance.
