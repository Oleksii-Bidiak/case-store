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
| Checkout end-to-end (UA form) + order-confirmation render | TASK-111 | needs running stack |

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
| TASK-100 | Add `npm run build` step to CI (`.github/workflows/ci.yml`) — catches Orval drift / tree-shake failures pre-merge | ⬜ | — |
| TASK-101 | Run the *Pending manual QA* list to closure (Redis int, dashboard int, JSON-LD live, admin CSRF smoke) | ⬜ | — |
| TASK-107 | **[CRITICAL BUG + REDESIGN]** Relax `AddressDto` — `phone` required, `country` optional (defaults 'UA'), `postalCode`/`state`/`address2`/`company` optional, raise `address1` limit; no Prisma migration | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-108 | Redesign checkout form for UA market — new zod schema (firstName/lastName/phone/city/deliveryAddress/notes), simplified `CheckoutAddressForm`, remove billing toggle, add `onInvalid` focus handler to fix silent dead submit | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-109 | Regenerate Orval API client after `AddressDto` relaxation (`npm run generate:api`) | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-110 | Update order e2e fixture — add `phone` to `validAddress`, add negative test for missing `phone` | ✅ | docs/plans/043-checkout-ua-redesign.md |
| TASK-111 | Smoke-verify order-confirmation page with new address shape; re-verify §A5/Режим A points 3–5 in manual-qa-master.md | ⬜ | docs/plans/043-checkout-ua-redesign.md |
| TASK-112 | **[BUG]** Fix store-admin logout-on-reload — mount-time silent refresh called `/auth/refresh` (missing `/api`); session lost on F5. One-line path fix (closes TASK-059-B) | ✅ | — |
| TASK-113 | Customer account — `/account` (profile view + edit via `/api/users/me`) + `/orders` history list; header "Мій акаунт" → link; `entities/user` slice; robots disallow private routes | ✅ | — |
| TASK-114 | Type the storefront order-list response on the backend so `OrderListResponseEnvelope.data` is `OrderEntity[]` (removes a frontend cast in order-history) | ⬜ | — |

### Phase B — Reliability & observability *(quality)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-048 | Sentry integration (frontend + backend) — `@sentry/nestjs` + `@sentry/nextjs`, wire to Pino error path | ⬜ | — |
| TASK-102 | Refresh-token cleanup — scheduled purge of revoked/expired `RefreshToken` rows (`@nestjs/schedule`) | ⬜ | — |
| TASK-103 | Mail reliability — replace fire-and-forget with transactional outbox + retry worker | ⬜ | — |
| TASK-104 | Soft deletes / audit — `deletedAt` on User/Product/Order; filter in repositories | ⬜ | — |
| TASK-105 | Frontend test harness — Playwright E2E (browse→cart→checkout, auth) + Jest setup for store-admin + cart/checkout component tests | ⬜ | — |
| TASK-106 | Reviews module backend — controller/service/repository over existing `Review` model (prereq for TASK-078) | ⬜ | — |

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

---

## How to Update This File

- **Start a task:** change ⬜ → 🔄.
- **Complete a task:** change 🔄 → ✅ once build/lint/typecheck + automated tests pass. If only
  manual visual QA remains, mark ✅ and add a line to *Pending manual QA*.
- **Block a task:** change to ❌ with a note. **Park a task:** 🅿️ with a one-line reason.
- **New task IDs:** use a single monotonic counter — next free integer above the current max
  (currently TASK-111; TASK-091 and below are historical). Never reuse an old ID.
- **Plans:** add the `docs/plans/NNN-*.md` path in the Plan column when one is written.
- **Finishing a parent:** move its detailed sub-tasks into `docs/backlog-archive.md` and leave a
  one-row summary under *Completed*.
