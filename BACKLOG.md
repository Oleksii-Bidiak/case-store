# Project Backlog

> **Single source of truth** for task status. Rows are one-liners: `ID | summary | status | plan`.
> Detail lives elsewhere — implementation narratives in the linked `docs/plans/NNN-*.md`,
> archived sub-task history in [`docs/backlog-archive.md`](docs/backlog-archive.md),
> outstanding manual checks in [`docs/manual-qa-pending.md`](docs/manual-qa-pending.md).
> When you don't know what to do: pick the first ⬜/🔄 in the lowest-numbered open Етап below.
> The full program of work (context, architecture decisions) is summarized per-Етап headers;
> each task gets a `docs/plans/NNN-*.md` via `/planer` before implementation starts.

## Status Legend

| Symbol | Meaning |
| --- | --- |
| ⬜ | To Do |
| 🔄 | In Progress |
| ✅ | Done — build/lint/typecheck + automated tests green (manual-only checks go to `manual-qa-pending.md`) |
| ❌ | Blocked |
| 🅿️ | Parked — intentionally out of the active sequence |

---

## Completed (Phases 1–6) — summary

> One row per area. Full sub-task history: [`docs/backlog-archive.md`](docs/backlog-archive.md).

| Area | Tasks | Plans |
| --- | --- | --- |
| **Phase 1 — Foundation** | TASK-001…018 (infra, DB, auth/user/product/category, API contract, frontend scaffolds) | 001–008, 013 |
| **Phase 2 — Storefront & Cart** | TASK-021…032, 051, 052 (cart backend, storefront pages, guest cart, auth) | 009–019 |
| **Phase 3 — Checkout & Orders** | TASK-033…037, 053…060 (orders, checkout, confirmation, emails) | 020, 022–024 |
| **Phase 4 — Admin Panel** | TASK-038…043, 061…067 (RBAC, product/category/order/user mgmt, dashboard) | 025–031 |
| **Phase 5 — Polish & Production** | TASK-044…047, 068, 069 (Redis cache, SEO, security hardening, Pino, redesign, UA/UAH) | 032–035, 039–040 |
| **Tech debt & architecture** | TASK-054, 058, 059, 071, 072, 100, 102, 104, 105(A/B/C/E), 141, 157, 159, 160 | 036–038, 044–048, 050 |
| **Phase A QA close-out** | TASK-107…126, 128 (UA checkout, cart/checkout/auth sync bugs, order×stock, admin fixes) | 043, 045–059, 061 |
| **Variant-as-product epic** | TASK-142 (A–G) — variants promoted to first-class positions via `ProductGroup` | 060 |
| **Tier 0–2 bug waves** | TASK-143…152 (cart validate-before-write, stock guards, PDP isActive leak, admin sorting/filters/status decoupling, dashboard) | 062–066, 069–074 |
| **Tier 3 polish & content** | TASK-127, 129…138, 148, 153…156, 158 (skeletons, status labels, stock hiding, images/links, Pages CMS, contacts, previews) | 065–067, 075–088 |
| **Tier 4 commerce features** | TASK-074…079, 091, 048, 103, 106 (reviews, coupons, Meilisearch, wishlist, image pipeline, Sentry, mail outbox) | 041–042, 089–095 |
| **Phase 6 — Design import** | TASK-162, 163, 167 (A–Q), 171 — full storefront redesign from the Claude Design import; TASK-087/089 delivered en route | 096 |

---

## Roadmap (Open)

> Program approved 2026-07-03 (see `docs/plans` as tasks get picked up). Order: Етап 0 → 1 → 2 → 3 → 4 → review gates.
> New task IDs use the single monotonic counter — **next plain ID: TASK-195**.

### Етап 0 — Config & docs cleanup

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-180 | Fix `.claude/skills` BOM-broken frontmatter, refresh frontend-testing skill, tighten permissions (`PowerShell(*)` removed, local allow-list pruned) | ✅ | — |
| TASK-181 | Slim BACKLOG.md to one-line rows; extract `docs/manual-qa-pending.md`; archive narrative rows | 🔄 | — |
| TASK-182 | Consolidate docs: AGENTS.md = single source of rules; requirements.md → short UA product vision; README fix (OpenCode→Claude Code, drop dup architecture); archive stale docs | ⬜ | — |
| TASK-183 | De-duplicate `.claude/agents` + `commands` (trim re-embedded rules, drop trivial npm-wrapper commands) | ⬜ | — |

### Етап 1 — Стабілізація наявної логіки

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-101 | Run [`docs/manual-qa-pending.md`](docs/manual-qa-pending.md) to closure on a running stack; triage breakage into `fix/NNN` tasks (critical: data/security/checkout fixed immediately) | ⬜ | — |
| TASK-105-D | Run Playwright E2E (`npm run test:e2e:pw`) — needs DB + `npx playwright install chromium` + booted API/client | 🔄 | 048 |
| TASK-184 | Nav tails: footer «Інформація» links → `/info` + `/legal` (now point at `/products`); admin sidebar dead `Settings` link → `/settings/contact` | ⬜ | — |

### Етап 2 — Контент-платформа CRM

> Architecture: admin writes via API → storefront serves static HTML (ISR + on-demand
> revalidation via a secret-protected `POST /api/revalidate` route handler). Publishing
> pattern: `status DRAFT|SCHEDULED|PUBLISHED` + `publishedAt`, cron worker flips
> SCHEDULED→PUBLISHED (MailOutbox pattern). Public endpoints serve only PUBLISHED.
> TASK-187 + TASK-185 first; then blog / banners / forms can run in parallel.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-187 | Publishing foundation: shared publish-status pattern + cron publisher + storefront on-demand revalidation (`revalidateTag`) + retrofit onto `Page` | ⬜ | — |
| TASK-185 | Server-side HTML sanitization (`sanitize-html`) for rich-text content (`Page.content`, future blog/banners) — required before TASK-170 | ⬜ | — |
| TASK-170 | Blog backend: `BlogPost` model (+category taxonomy) with publishing fields; public `GET /api/blog` (filter/search/pagination) + `/:slug`; Orval regen | ⬜ | — |
| TASK-172 | Blog admin CMS: CRUD with `RichTextEditor`, draft/schedule/publish, featured, category; `/blog*` admin routes + sidebar. Depends on TASK-170 | ⬜ | — |
| TASK-173 | Blog storefront wiring: replace static seed with real data (ISR+revalidation), server-side filter/search/pagination, `/blog` in header+footer nav | ⬜ | — |
| TASK-186 | Admin-managed homepage content: `Banner` model with `placement` (HERO_SLIDE / PROMO_TILE / PROMO_BANNER / ANNOUNCEMENT_BAR) + publishing fields; admin CRUD; storefront reads via ISR with static fallback. Absorbs the banner part of TASK-166 | ⬜ | — |
| TASK-177 | Contact messages: `ContactMessage` model + rate-limited `POST /api/contact` + admin inbox `/messages`; wire `/contact` + `/info` forms | ⬜ | — |
| TASK-188 | Newsletter subscriptions: `NewsletterSubscription` model + public subscribe endpoint + admin list/export; wire homepage/promo/blog newsletter blocks. Absorbs the newsletter part of TASK-166/173/179 | ⬜ | — |

### Етап 3 — Фундамент каталогу (ніша: мультибрендові аксесуари + Apple техніка)

> Sequence 189 → 190 → 191 (each builds on the previous). Schema is generic, not Apple-only.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-189 | `Brand` model + `Product.brandId` + `GET /products` brand filter + Meilisearch + admin CRUD + storefront «Виробник» filter and «Популярні бренди» strip. Absorbs TASK-176 | ⬜ | — |
| TASK-190 | Device compatibility («Сумісні товари»): `DeviceBrand`/`DeviceModel` taxonomy + M2M product compatibility + catalog filter; wires homepage ModelPicker + PDP cross-sell. Absorbs TASK-165 + the compat part of TASK-178 | ⬜ | — |
| TASK-191 | Structured specs: per-category `AttributeDefinition` + product values (variant-axis JSON stays separate); PDP «Характеристики» tab + highlights; basic facet filters. Absorbs the specs part of TASK-178 | ⬜ | — |
| TASK-164 | Bestseller signal: aggregate sold qty over PAID orders → sort/filter on `GET /products` → PopularRail «Хіти» tab | ⬜ | — |

### Етап 4 — Адмінка: локалізація + рестайл

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-115 | Finish store-admin UA localization (~60 hardcoded strings in products/categories/orders/users CRUD: tables, forms, toasts, zod messages) | 🔄 | — |
| TASK-192 | Restyle store-admin to the storefront design language (tokens per `docs/design-system.md`): shell → tables/forms → dashboard. After TASK-115 | ⬜ | — |

### Review gates (обов'язкові, послідовні)

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-193 | Consolidated post-stabilization review across all 3 apps: cleanliness (dead code, FSD/Clean Architecture), optimization (N+1, caches, indexes, bundle, ISR), security (`/security-review`), scalability. After Етапи 2–3; criticals block Етап 4 | ⬜ | — |
| TASK-194 | Pre-deploy gate: full security review + prod-config audit (env/CORS/Helmet/Swagger-off/Sentry), prod builds, Playwright on prod build, Lighthouse/SEO pass | ⬜ | — |

### Пізніша хвиля

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-174 | Add-on services / protection plans: catalog + per-product applicability + cart/order persistence + admin (cart UI stub exists) | ⬜ | — |
| TASK-175 | Loyalty & account extras: points/cashback model + accrual/redeem API + purchases feed + persisted notification prefs (account UI stubs exist) | ⬜ | — |
| TASK-169 | Password reset: request endpoint + emailed token + reset form (auth slide-out stub; uses mail-outbox) | 🅿️ | — |
| TASK-168 | Social sign-in (Google/Apple OAuth): backend OAuth module + account linking (auth slide-out stubs) | 🅿️ | — |
| TASK-178 | «Купити в 1 клік» express order (name+phone quick-order backend) — remaining slice; specs + compat parts moved to TASK-191/190 | ⬜ | — |
| TASK-179 | Promo page logic: public active-discounts feed + `onSale` server filter (pairs with TASK-164); newsletter part moved to TASK-188 | ⬜ | — |
| TASK-080-E | Admin-configurable NP dispatch origin (`DeliverySetting`) — deferred until real NP API key + running DB (owner decision 2026-06-27) | 🅿️ | 068 |

### Parked

| Task ID | Description | Reason |
| --- | --- | --- |
| TASK-034 / 081 | Real payments (LiqPay/Fondy/Mono) | After first real purchase validates demand; draft in plan 021 |
| TASK-049 | Abandoned-cart emails | Marketing later; reuses mail outbox |
| TASK-050 | GA4 + Facebook Pixel | Needs TASK-090 consent first |
| TASK-090 | Cookie consent + compliant marketing signup | Bundled with marketing push |
| TASK-082 | Deep mega-menu subcategory tree | Root-category dropdown shipped (167-A) |
| TASK-083 | Category tile images (`Category.image`) | Pairs with TASK-186/189 when picked up |
| TASK-084 | Mobile filter drawer polish deferrals | Behind UI rewrite |
| TASK-085 | Product comparison | PDP/account stubs reference it |
| TASK-086 | Quick-view modal | Behind UI rewrite |
| TASK-139 | Admin-managed recommendation carousels | Needs discovery |
| TASK-140 | Admin tables UX rethink | Superseded largely by TASK-147/192 |

---

## How to Update This File

- **Start a task:** ⬜ → 🔄. **Complete:** → ✅ once build/lint/typecheck + automated tests pass;
  manual-only leftovers go to [`docs/manual-qa-pending.md`](docs/manual-qa-pending.md).
- **Keep rows one line.** Root causes, sub-tasks and "Done/Verified" notes belong in the task's
  `docs/plans/NNN-*.md` (link it in the Plan column) — never in this file.
- **New task IDs:** single monotonic counter; next plain ID **TASK-195**. Never reuse an ID.
- **Finishing an Етап:** collapse its table into one summary row under *Completed* and move the
  detailed rows to `docs/backlog-archive.md`.
