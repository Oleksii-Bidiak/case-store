# Project Backlog

> **Single source of truth** for task status.
> Completed phases are summarized below (one row per parent); full sub-task history lives
> in [`docs/backlog-archive.md`](docs/backlog-archive.md). Open work is in **Roadmap (Open)**.
> When you don't know what to do, ask: "What's next?" — pick the first ⬜ in Phase A, then B, C, D.

## Status Legend

| Symbol | Meaning |
| --- | --- |
| ⬜ | To Do — not started |
| 🔄 | In Progress — actively being worked on |
| ✅ | Done — build/lint/typecheck + automated tests green |
| ❌ | Blocked |
| 🅿️ | Parked — tracked but intentionally not in the active sequence |

> A task is **✅** once build/lint/typecheck and automated tests pass. "Manual visual QA on
> a running stack" does **not** hold a task open — those few items live in *Pending manual QA*.

---

## Pending manual QA

> Code shipped and automated gates green; these need a one-off check on a running stack.

| Item | From | Note |
| --- | --- | --- |
| Real-Redis cache hit/miss/invalidation int run | TASK-044-I | needs Docker Redis up |
| Dashboard raw-SQL real-DB int-spec run | TASK-066 | needs `test:int` DB |
| JSON-LD present in product HTML | TASK-045-I | needs live API |
| Admin login + silent refresh + CSRF path smoke | TASK-059-B / TASK-112 | refresh-path bug now fixed; live smoke still pending a running stack |
| Checkout end-to-end (UA form) + order-confirmation render | TASK-111 → TASK-119 | QA on HEAD `296b498` shows order created but redirect lands on empty `/cart`; reopened as bug TASK-119 |
| Apply `add_soft_delete_audit` migration + Swagger DELETE smoke (product hidden from list, order history keeps name; email freed for re-registration) | TASK-104-J | migration authored but not applied — needs a running DB |
| Run Playwright E2E (`npm run test:e2e:pw`) — 4 specs discovered; need DB + `npx playwright install chromium` + booted API/client to execute | TASK-105-D | scaffold complete; not yet run locally/CI |
| Admin product/category edit forms reflect a background refetch on pristine fields while preserving in-progress edits (open form → focus another tab → return) | TASK-141-B | `values`+`keepDirtyValues` shipped; needs running stack to observe refetch behaviour |
| Guest→user cart merge: guest adds items → login/register → items present without reload; reload while logged in keeps cart non-empty (the TASK-118 path) | TASK-118 | `isInitializing` query-gate + post-refresh cart invalidation shipped; needs running stack |

---

## Completed (Phases 1–5)

> One row per parent task. Full sub-task breakdowns: [`docs/backlog-archive.md`](docs/backlog-archive.md).
> Historical duplicate IDs (`TASK-054/058/059` reused; `TASK-051-O` merged) are annotated there.

| Area | Tasks | Status | Plans |
| --- | --- | --- | --- |
| **Phase 1 — Foundation** | TASK-001…005 infra · 006…008 DB · 009…013 backend core (auth/user/product/category) · 014…016 API contract · 017…018 frontend scaffold | ✅ | plans 001–008, 013 |
| **Phase 2 — Storefront & Cart** | TASK-021…027 cart backend · 028…032 storefront pages + add-to-cart · 051 guest cart · 052 storefront auth | ✅ | plans 009–019 |
| **Phase 3 — Checkout & Orders** | TASK-033 order module · 035 checkout · 036 confirmation page · 037 confirmation emails · 053…060 review follow-ups | ✅ | plans 020, 022–024 |
| **Phase 4 — Admin Panel** | TASK-038 RBAC · 039 product mgmt · 040 category mgmt · 041 order mgmt · 042 user mgmt · 043 dashboard · 061…067 review follow-ups | ✅ | plans 025–031 |
| **Phase 5 — Polish & Production** | TASK-044 Redis caching · 045 SEO sitemap/JSON-LD · 046 Helmet/CSRF/rate-limit · 047 Pino logging · 068 UI/UX redesign (core) · 069 UA/UAH localization | ✅ | plans 032–035, 039–040 |
| **Tech Debt & Architecture** | TASK-054 monorepo review · 058 orval-config consolidation · 059 baseURL alignment · 071/072 QA bugfixes | ✅ | plans 036–038, manual-qa-master |
| **Product Images** | TASK-073 images (backend + admin upload + storefront display) | ✅ | plan 041 |

---

## Roadmap (Open)

> The active sequence is **Phase A → B → C → D**. Each row is a one-liner; full design goes
> into a `docs/plans/NNN-*.md` when picked up. New tasks use a single monotonic counter
> starting at **TASK-100** (historical IDs ≤ 091 retained where a plan already references them).

### Phase A — Stabilize & close out *(do first)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-100 | Add `npm run build` step to CI (`.github/workflows/ci.yml`) — catches Orval drift / tree-shake failures pre-merge | ✅ | docs/plans/044-ci-build-step.md |
| TASK-101 | Run the *Pending manual QA* list to closure (Redis int, dashboard int, JSON-LD live, admin CSRF smoke) | ⬜ | — |
| TASK-107 | **[CRITICAL BUG + REDESIGN]** Relax `AddressDto` — `phone` required, `country` optional (defaults 'UA'), `postalCode`/`state`/`address2`/`company` optional, raise `address1` limit; no Prisma migration | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-108 | Redesign checkout form for UA market — new zod schema (firstName/lastName/phone/city/deliveryAddress/notes), simplified `CheckoutAddressForm`, remove billing toggle, add `onInvalid` focus handler to fix silent dead submit | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-109 | Regenerate Orval API client after `AddressDto` relaxation (`npm run generate:api`) | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-110 | Update order e2e fixture — add `phone` to `validAddress`, add negative test for missing `phone` | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-111 | Smoke-verify order-confirmation page with new address shape; re-verify §A5/Режим A points 3–5 in manual-qa-master.md | ⬜ | docs/plans/043-checkout-ua-redesign.md |
| TASK-112 | **[BUG]** Fix store-admin logout-on-reload — mount-time silent refresh called `/auth/refresh` (missing `/api`); session lost on F5. One-line path fix (closes TASK-059-B) | ✅ | — |
| TASK-113 | Customer account — `/account` (profile view + edit via `/api/users/me`) + `/orders` history list; header "Мій акаунт" → link; `entities/user` slice; robots disallow private routes | ✅ | — |
| TASK-114 | Type the storefront order-list response on the backend so `OrderListResponseEnvelope.data` is `OrderEntity[]` (removes a frontend cast in order-history) | ✅ | docs/plans/045-order-list-response-typing.md |
| TASK-115 | Localize store-admin to Ukrainian — typed dictionary + `lang="uk"`. **Done:** shell/nav, header, login, dashboard (stats/charts/low-stock, UAH). **Remaining:** products, categories, orders, users CRUD (tables, forms, detail views, toggles, toasts, validation) | 🔄 | — |

#### QA pass triage — bugs (from `docs/manual-qa-master.md`, tested on HEAD `296b498`)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-116 | **[CRITICAL BUG]** Cart qty stepper updates the counter only on the 2nd click — local `qty` state in `cart-item-row.tsx` never re-syncs after the success refetch and `commit()` compares against the stale prop. Add optimistic `setQty` + sync, debounce server writes via a shared `useDebouncedCallback` (`shared/lib`) | ✅ | docs/plans/049-cart-qty-stepper-sync.md |
| TASK-117 | **[CRITICAL BUG]** Product search loses focus on every keystroke (URL-param refilter remounts the input) — keep field controlled + focused, debounce the query update (reuse `useDebouncedCallback` from TASK-116; depends on TASK-116-A). Sub-tasks: **TASK-117-A** remove key-remount + refactor SearchInput (fix, S, depends TASK-116-A ✅); **TASK-117-B** folded into A; **TASK-117-C** add search-input.test.tsx with 4 regression scenarios (test, S, depends TASK-117-A) | ✅ | docs/plans/051-product-search-focus-sync.md |
| TASK-141 | **[TECH DEBT]** Cross-cutting forms state-sync audit & remediation — grep-based sweep of both apps for `useState` seeded from props and RHF `defaultValues` without `reset()`/`values`; remediate latent risk in admin product/category edit forms and storefront profile form; consolidate ad-hoc debounces to `useDebouncedCallback`; add convention doc. **TASK-116 ✅ + TASK-117 ✅ — gate satisfied; references: `cart-item-row.tsx` (P1), `search-input.tsx` (P1 focus), `use-debounced-callback.ts` (hook).** Sub-tasks: **TASK-141-A** grep sweep + inventory (audit, S); **TASK-141-B** admin edit forms P2 fix — `values`/`reset()` (fix, M, after A); **TASK-141-C** profile form P2 fix — `values`+`keepDirtyValues` (fix, S, after A); **TASK-141-D** migrate `AdminUserTable` inline `setTimeout` + copy hook to store-admin (refactor, S, after A); **TASK-141-E** convention doc in `CLAUDE.md` (docs, S, after B+C+D). **All sub-tasks A–E ✅ (2026-06-24): doc `docs/conventions/forms.md` + CLAUDE.md ref; admin forms use `values`+`keepDirtyValues`; profile form same; `AdminUserTable` debounce → shared hook copied to store-admin. Sweep found 2 new low-risk submit-based search inputs (#9/#10), no remediation needed. lint+typecheck+tests green. Pending: manual multi-tab refetch QA of admin edit forms.** | ✅ | docs/plans/050-forms-state-sync-audit.md |
| TASK-118 | **[CRITICAL BUG]** Guest→user cart merge broken — guest cart shows from stale cache until reload, then vanishes (user cart empty). Root cause: `useGetCart` fires before auth bootstrap completes on reload (creates new empty guest cart); fix: gate query on `isInitializing` + invalidate cart after silent refresh. Backend merge already correct. Sub-tasks: **TASK-118-A** gate `CartView` query on `isInitializing` (fix, S); **TASK-118-B** same guard in `header-cart-badge` (fix, S, after A); **TASK-118-C** invalidate cart in `AuthProvider` after successful silent refresh (fix, S); **TASK-118-D** regression tests — CartView init guard + AuthProvider post-refresh cart fetch (test, M, TDD, after A+C). **All sub-tasks A–D ✅ (2026-06-24): root cause was frontend — `useGetCart` fired during the auth-bootstrap window as a guest and cached an empty cart. Gated `CartView` + `header-cart-badge` on `!isInitializing`; `AuthProvider` invalidates the cart after a successful silent refresh (required swapping `providers.tsx` so `QueryClientProvider` wraps `AuthProvider`). +4 RTL/MSW tests, 60 green; lint+typecheck clean. Backend untouched. Pending: manual reload/login QA.** | ✅ | docs/plans/052-guest-cart-merge.md |
| TASK-119 | **[CRITICAL BUG]** Checkout creates the order but redirects to the empty `/cart` instead of `/orders/{id}/confirmation` — verify create-order envelope (`res.data.id`) + confirmation route guard in `use-checkout.ts`; rebuild clean to rule out stale `.next`. Absorbs TASK-111 | ⬜ | — |
| TASK-120 | **[PRIORITY BUG]** Restored-tab queries never resolve — `/products` skeletons spin forever after reopening the browser; reload fixes (Chrome+Edge). Likely a query stuck on auth/CSRF bootstrap on session-restore (`app/providers.tsx` + axios interceptor / `entities/session`) | ⬜ | — |
| TASK-121 | **[BUG]** Post-registration: no redirect to `/` and header stays in guest state — align `register-form.tsx` success path with login | ⬜ | — |
| TASK-122 | **[BUG]** store-admin still logs out on reload despite TASK-112 — re-investigate mount-time silent refresh | ⬜ | — |
| TASK-123 | **[BUG]** Payment stays `PENDING` after order status changes — fix status/`paymentStatus` coupling and confirm-payment path (backend) | ⬜ | — |
| TASK-124 | **[BUG]** Order status → CONFIRMED not reflected in storefront stock — confirm expected behavior (stock decremented at creation) then fix stale product cache eviction on status change | ⬜ | — |
| TASK-125 | **[BUG]** Admin order detail/list missing customer email + contact data — extend admin order response + `store-admin` views | ⬜ | — |
| TASK-126 | **[BUG]** Product card opens the wrong variant + thumbnails missing — investigate card→PDP linking, variant resolution (suspected SKU shared across products), single-image gallery render | ⬜ | — |

### Phase B — Reliability & observability *(quality)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-048 | Sentry integration (frontend + backend) — `@sentry/nestjs` + `@sentry/nextjs`, wire to Pino error path | ⬜ | — |
| TASK-102 | Refresh-token cleanup — scheduled purge of revoked/expired `RefreshToken` rows (`@nestjs/schedule`) | ✅ | docs/plans/046-refresh-token-cleanup.md |
| TASK-103 | Mail reliability — replace fire-and-forget with transactional outbox + retry worker | ⬜ | — |
| TASK-104 | Soft deletes / audit — `deletedAt` on User/Product/Order; filter in repositories | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-A | Update CLAUDE.md `prisma-migration` note: remove "no soft deletes", document `isActive` vs `deletedAt` distinction | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-B | Prisma schema + migration — add `deletedAt DateTime?` + `@@index([deletedAt])` to User/Product/Order; add `originalEmail` to User | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-C | ProductRepository — add `deletedAt: null` filters to all read paths; add `softDelete(id, mangledSlug, mangledSku)` method (TDD) | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-D | UserRepository — add `deletedAt: null` filters; add `softDelete(id, mangledEmail, originalEmail)` method (TDD) | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-E | OrderRepository — add `deletedAt: null` filters; add `softDelete(id)` method; tombstoned orders unreachable via service `findById` guard (TDD) | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-F | Service layer — `ProductService.delete` + `UserService.deleteUser` with email/slug mangle, cache eviction, token revocation (TDD) | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-G | Controller layer — `DELETE /api/products/:id` and `DELETE /api/users/:id` (AdminGuard, 204 No Content, Swagger decorators) | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-H | Entity audit — `deletedAt`/`originalEmail` already excluded by whitelisting `fromPrisma` mappers (no change needed) | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-I | Regenerate Orval API client (`npm run generate:api`); confirmed `useDeleteProduct`/`useDeleteUser` hooks, no `deletedAt` in generated types | ✅ | docs/plans/047-soft-deletes-audit.md |
| TASK-104-J | Integration/verification — full test+lint+typecheck+build gate green. **Pending:** migration apply + manual Swagger smoke on a running DB | 🔄 | docs/plans/047-soft-deletes-audit.md |
| TASK-105 | Frontend test harness — Playwright E2E (browse→cart→checkout, auth) + Jest setup for store-admin + cart/checkout component tests | 🔄 | docs/plans/048-frontend-test-harness.md |
| TASK-105-A | RTL + MSW + jsdom foundation in store-client: install deps, split Jest into `unit`+`component` projects, create `src/shared/test/` (setup, msw-server, msw-handlers, render helper) | ✅ | docs/plans/048-frontend-test-harness.md |
| TASK-105-B | Cart and checkout component tests: `CartItemRow`, `CartSummary`, `CartView`, `CheckoutAddressForm`, `CheckoutView` — all via MSW, no hand-mocked hooks (37 component tests) | ✅ | docs/plans/048-frontend-test-harness.md |
| TASK-105-C | store-admin Jest + RTL scaffold: mirror store-client component-test setup, update `"test"` script from no-op to `jest`, add smoke component test | ✅ | docs/plans/048-frontend-test-harness.md |
| TASK-105-D | Playwright E2E scaffold: `@playwright/test` at root, `playwright.config.ts` with webServer array, `e2e/cart-flow.spec.ts` + `e2e/auth-flow.spec.ts`, seed fixture (4 tests discovered). **Pending:** local/CI run needs DB + browsers | 🔄 | docs/plans/048-frontend-test-harness.md |
| TASK-105-E | CI wiring: `test-unit` already covers all 3 workspaces (root `npm run test`); added `test-e2e-playwright` job (continue-on-error: true) with Postgres service + Playwright browser install | ✅ | docs/plans/048-frontend-test-harness.md |
| TASK-106 | Reviews module backend — controller/service/repository over existing `Review` model (prereq for TASK-078) | ⬜ | — |

#### QA pass triage — UX, data & admin polish (from `docs/manual-qa-master.md`)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-127 | Loading states / skeletons across storefront + admin — give feedback on slow actions ("немає лоадерів") | ⬜ | — |
| TASK-128 | Seed overhaul — enough products for pagination, an out-of-stock variant, real descriptions + characteristics, sale items; document re-seed after migrations; fix `npm run db:studio` (prisma:studio script) | ⬜ | — |
| TASK-129 | User-facing order status labels — replace raw `PENDING`/etc. with adequate UA wording for customers | ⬜ | — |
| TASK-130 | Header account → user icon + dropdown; ensure the customer cabinet link is visible | ⬜ | — |
| TASK-131 | Storefront user order cancellation — cancel button for PENDING orders (backend cancel already exists) | ⬜ | — |
| TASK-132 | Hide raw stock quantity from customers on the storefront | ⬜ | — |
| TASK-133 | Cart line images + product links — replace `ProductThumb` placeholder with the real image and link to the PDP | ⬜ | — |
| TASK-134 | Order-details page — fix layout + link items to their products | ⬜ | — |
| TASK-135 | Checkout prefill for logged-in users + phone input mask | ⬜ | — |
| TASK-136 | Admin — generate slug on the fly on product create; remove or implement the dead header search | ⬜ | — |
| TASK-137 | Admin revenue calc audit — count only earned revenue; show unrealized-but-ordered separately | ⬜ | — |
| TASK-138 | a11y / console-warning cleanup — `DialogContent` missing `aria-describedby` (sheet.tsx), link-preload warning; add the "Mail disabled — skipping…" log line | ⬜ | — |

### Phase C — Revenue-critical commerce *(features; payments parked)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-078 | Product reviews — write flow + moderation (auth'd submission, verified-purchase, PDP list, admin approval queue) | ⬜ | — |
| TASK-079 | Coupons / promo codes — `Discount` model (percent/fixed, min-spend, expiry, usage caps), apply in cart/checkout, admin CRUD | ⬜ | — |
| TASK-080 | Delivery + Nova Poshta — courier/branch options, city+branch autocomplete, cost + ETA in checkout | ⬜ | — |

### Phase D — Discovery & conversion *(features + performance)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-075 | Full-text search + header autocomplete — Meilisearch (typo-tolerant) behind `/search`; inline header dropdown | ⬜ | — |
| TASK-076 | Wishlist / favorites — guest-via-cookie + merge-on-login (mirrors guest-cart pattern) | ⬜ | — |
| TASK-077 | Variant dots + quick-add — surface variant summary on list API; color dots + hover ATC overlay | ⬜ | — |
| TASK-074 | Image optimization — `next/image` remotePatterns + shimmer placeholder | ⬜ | docs/plans/042-image-optimization.md |
| TASK-091 | Origin-side image pre-optimization — `sharp` WebP renditions + per-image LQIP `blurDataUrl` on upload | ⬜ | — |

---

## Parked / Later

> Tracked but intentionally outside the active A–D sequence.

| Task ID | Description | Status | Reason |
| --- | --- | --- | --- |
| TASK-034 / TASK-081 | Real payments — Stripe stub → UA providers (LiqPay/Fondy/Mono "оплата частинами") | 🅿️ | Deferred until after the first real purchase validates demand. Plan drafted: docs/plans/021-payment-integration.md |
| TASK-049 | Abandoned-cart detection + follow-up emails | 🅿️ | Marketing not a priority yet; reuses Phase B mail-outbox infra when started |
| TASK-050 | GA4 e-commerce events (+ Facebook Pixel) | 🅿️ | Needs discovery; gated behind cookie consent (TASK-090) |
| TASK-090 | Cookie consent banner + newsletter signup | 🅿️ | Prerequisite for compliant analytics; bundled with marketing push |
| TASK-082 | Mega-menu / full catalog tree in header | 🅿️ | Behind planned storefront UI rewrite |
| TASK-083 | Category tile images on homepage (needs `Category.image` field) | 🅿️ | Behind UI rewrite |
| TASK-084 | Mobile filter drawer + sort relocation (TASK-068-E deferral) | 🅿️ | Behind UI rewrite |
| TASK-085 | Product comparison ("Порівняння") | 🅿️ | Behind UI rewrite |
| TASK-086 | Quick-view modal from product cards | 🅿️ | Behind UI rewrite |
| TASK-087 | Recently-viewed products strip (localStorage) | 🅿️ | Behind UI rewrite |
| TASK-088 | Bestseller / "Хіт продажу" badge (sales-driven) | 🅿️ | Behind UI rewrite |
| TASK-089 | Contact & social bar (phone, hours, Viber/Telegram/Instagram) | 🅿️ | Behind UI rewrite |
| TASK-068 deferrals | Remaining redesign polish (sticky ATC bar, focus-ring audit, error→toast, primitive swaps) | 🅿️ | Behind UI rewrite |
| TASK-139 | Recommended-products carousels, admin-managed (prioritization + marketing rules) | 🅿️ | Explicit future note in QA pass; needs discovery |
| TASK-140 | Admin tables UX (shadcn sortable/filterable) + category management/visualization rethink | 🅿️ | Behind admin UI rewrite; pairs with TASK-115 |

---

## How to Update This File

- **Start a task:** change ⬜ → 🔄.
- **Complete a task:** change 🔄 → ✅ once build/lint/typecheck + automated tests pass. If only
  manual visual QA remains, mark ✅ and add a line to *Pending manual QA*.
- **Block a task:** change to ❌ with a note. **Park a task:** 🅿️ with a one-line reason.
- **New task IDs:** use a single monotonic counter — next free integer above the current max
  (currently TASK-141; TASK-091 and below are historical). Never reuse an old ID.
- **Plans:** add the `docs/plans/NNN-*.md` path in the Plan column when one is written.
- **Finishing a parent:** move its detailed sub-tasks into `docs/backlog-archive.md` and leave a
  one-row summary under *Completed*.
