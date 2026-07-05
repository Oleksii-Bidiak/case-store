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
> New task IDs use the single monotonic counter — **next plain ID: TASK-236**.

### Етап 0 — Config & docs cleanup

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-180 | Fix `.claude/skills` BOM-broken frontmatter, refresh frontend-testing skill, tighten permissions (`PowerShell(*)` removed, local allow-list pruned) | ✅ | — |
| TASK-181 | Slim BACKLOG.md to one-line rows; extract `docs/manual-qa-pending.md`; archive narrative rows | ✅ | — |
| TASK-182 | Consolidate docs: AGENTS.md = single source of rules; requirements.md → short UA product vision; README fix (OpenCode→Claude Code, drop dup architecture); archive stale docs | ✅ | — |
| TASK-183 | De-duplicate `.claude/agents` + `commands` (trim re-embedded rules, drop trivial npm-wrapper commands) | ✅ | — |

### Етап 1 — Стабілізація наявної логіки

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-101 | Run [`docs/manual-qa-pending.md`](docs/manual-qa-pending.md) to closure on a running stack; triage breakage into `fix/NNN` tasks. Owner pass 2026-07-03 → bugs TASK-195…212; **re-test 2026-07-04 green** (checkout/cancel/wishlist/coupons). TASK-124 matrix (§C2-a) run 2026-07-04 via API — all green; TASK-228/229/230 findings fixed same day; fix-wave 2026-07-05 closed TASK-199…212/227 (re-checks → manual-qa §6). Left: §4 (NP/SMTP/Sentry keys) + §6 | 🔄 | — |
| TASK-105-D | Playwright E2E green 4/4 (2026-07-04): seed-e2e fixed (pg driver adapter, no ProductVariant model), cart-flow CTA selector fixed («Додати до кошика»), local runs serial | ✅ | 048 |
| TASK-184 | Nav tails: footer «Інформація» links → `/info` + `/legal` (now point at `/products`); admin sidebar dead `Settings` link → `/settings/contact` | ⬜ | — |

#### Баги з QA-проходу 2026-07-03 *(порядок = пріоритет; спершу CRITICAL)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-195 | ~~Checkout «Далі» does nothing~~ — **root cause: stale client bundle in the owner's browser** (Turbopack dev chunk URLs are path-based → old cached chunk with the TASK-197 hydration crash killed interactivity). Clean-browser Playwright run on develop: login → add-to-cart → «Далі» → «Підтвердити» → `/orders/{id}/confirmation` all green. Owner to hard-reload (Ctrl+Shift+R) and confirm | ✅ | — |
| TASK-196 | Session-loss on F5: storefront part was the stale bundle (owner re-test ✅, incl. wishlist merge / Сценарій 1); **admin part was real** — `/auth/refresh` throttled 5/min while every page load calls it, so repeated F5 hit 429 and the app treated it as a dead session. Fixed: throttle → 30/min + both AuthProviders retry transient (non-401) bootstrap failures; verified 6×F5 green | ✅ | — |
| TASK-197 | Hydration mismatch «0 грн» vs «0 ₴» in every money render (header cart badge first) — `formatMoney` now formats the number via Intl and appends ₴ manually (SSR-stable across ICU versions) | ✅ | — |
| TASK-198 | ~~Promo fails on `/cart`~~ — same stale-bundle artifact as TASK-195 (`ApplyDiscount` is one shared component); clean-browser Playwright: TEST1 applies on `/cart`, −10% shown; owner re-test of TASK-079 ✅. Coupon test coverage rides on TASK-219 | ✅ | — |
| TASK-199 | Grouped-card advertised price — fixed: card advertises its **own** position price via shared `getCardPricing()` («від …» only on the group-cheapest position; sale-% from own `compareAtPrice`); quick-add twin spun off → TASK-233 | ✅ | — |
| TASK-200 | Search UA↔EN — Meili `synonyms` + Cyrillic `searchTerms` injected into documents so typo tolerance catches «афйон»; needs a reindex after deploy (boot/admin reindex); live check → manual-qa §6 | ✅ | — |
| TASK-201 | Admin category parent reset — root cause: Radix bubble-`<select>` bounces `""` through `onValueChange` while parent options still load (TASK-149 «jsdom-only» note was a misdiagnosis); guarded + 3 regression specs; same latent bug in product-form → TASK-232 | ✅ | — |
| TASK-202 | Login error mapping — 401 «Account is deactivated» now maps to «Обліковий запис деактивовано…» in both storefront and admin (envelope-reading helper); other 401s keep «Невірний email або пароль» | ✅ | — |
| TASK-203 | Playwright `globalSetup` crashed (`PrismaClientInitializationError`) — `seed-e2e.ts` now loads `apps/store-api/.env` **and** constructs PrismaClient with the pg driver adapter (bare constructor throws under driver-adapter setups); suite green under TASK-105-D | ✅ | — |
| TASK-204 | Cart line items — product name now links to the PDP (same href as the image); «image reload» was the mini-cart staying open over navigation — row exposes `onNavigate`, cart-sheet passes `close` | ✅ | — |
| TASK-205 | Cart API stock leak — `CartItemEntity.stock` → capped `maxQty` (shared `MAX_QUANTITY=99` server-side constant); stepper semantics unchanged; wishlist twin → TASK-231 | ✅ | — |
| TASK-206 | Checkout summary under sticky header — `lg:top-4` → `lg:top-24` (the existing 96px header-clearing convention used by catalog filters/wishlist/legal TOC); other offending asides → TASK-234 | ✅ | — |
| TASK-207 | Cart qty manual clear — blur now restores the previous quantity with **no server write** on empty/invalid input (pure `quantity-commit` resolver, TDD: 12 unit + 3 RTL) | ✅ | — |
| TASK-208 | Price slider ↔ inputs — single source of truth: controlled inputs (key-remount anti-pattern removed per forms.md), live mirror on drag, clamped commit on blur; 17 unit + 5 RTL | ✅ | — |
| TASK-209 | `/legal/[slug]` — no code bug: rendering is fully data-driven (sanitized `page.content`, 404 for draft/missing); QA saw the no-seeded-pages artifact (seed creates zero `Page` rows); publish-check → manual-qa §6 | ✅ | — |
| TASK-210 | Listing perf — non-priority images confirmed lazy; real fix was `sizes` (grid capped at 300px, fixed rail/list widths) + dropped `priority` from the below-hero rail; 3G prod profiling → manual-qa §6 | ✅ | — |
| TASK-211 | «Ви переглядали» — rebuilt on the PopularRail slider + current `ProductCard`/`ProductCardActions` via new `GET /products/cards?ids=`; storage slimmed to id-snapshot (prices self-heal by refetch) | ✅ | — |
| TASK-212 | Font-preload warnings — dev-only false positive (late HMR `@font-face` injection); prod build verified byte-for-byte: all three fonts used above the fold; documented in layout.tsx; prod re-check → manual-qa §6 | ✅ | — |
| TASK-227 | Password policy — shared `@IsStrongAppPassword()` (min 8 + lower+upper+digit, Unicode-aware so «Пароль123» passes) + mirrored zod `passwordSchema` with UA message; login deliberately unaffected | ✅ | — |
| TASK-228 | Stock double-credit on order revive (confirmed live §C2-a) — fixed via `Order.restockedAt` flag: cancel stamps it, revive re-reserves stock with the same `WHERE stock >= qty` guard as creation (409 if sold out, order stays terminal); verified live create→cancel→revive→re-cancel holds stock at S; unit 638 + e2e 259 green | ✅ | — |
| TASK-229 | Mail render crashed on missing optional `country` (outbox → FAILED) — template now tolerates absent optional address fields (heals old outbox rows) and AddressDto defaults `country: 'UA'` server-side; verified live (API order without country snapshots `"UA"`) | ✅ | — |
| TASK-230 | Public `GET /products` leaked **inactive** products (root cause of §B2 ❌) — public list now forces `isActive: true` (even with `?isActive=false`); new guarded `GET /products/admin/list` (all statuses, no cache) + admin table/toggle/forms moved to it; also fixed the boolean-DTO transform (`?isActive=false` coerced to `true`); verified live | ✅ | — |
| TASK-231 | Wishlist stock leak — `WishlistItemEntity.stock` → capped `maxQty` (shared `MAX_QUANTITY=99` moved to `common/constants`, cart re-exports); client filters/cards on `maxQty`; wishlist image `sizes` tuned (TASK-210 rider) | ✅ | — |
| TASK-232 | Admin product-form select bounce — `""` guard on `categoryId`/`groupId` (same as TASK-201, «Без групи» sentinel preserved); RED-confirmed regression specs; sweep: all other admin selects unaffected (static options / not async-seeded) | ✅ | — |
| TASK-233 | Product-card quick-add — now adds the card's **own** `product.id`, availability from own `inStock` (field already existed — frontend-only); `variantSummary.default*` left with zero runtime consumers → deprecation TASK-235 | ✅ | — |
| TASK-234 | Sticky asides — shared `STICKY_ASIDE_TOP`/`STICKY_HEADER_OFFSET` (96px) in `shared/config/layout.ts`; 6 offenders fixed + 3 hardcodes retrofitted + TOC scroll-spy/anchors aligned; convention documented in design-system §4 | ✅ | — |
| TASK-235 | Deprecated `variantSummary.default*` trio — `deprecated: true` in Swagger + TSDoc (propagates to generated models as `@deprecated`); still populated for contract stability; actual removal rides the next breaking contract rev | ✅ | — |

#### UX-покращення та discovery з QA-проходу *(виконувати після багів; частина живиться Етапами 2–3)*

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-213 | Product cards show a persistent «в кошику» state derived from the cart query (survives reload) | ⬜ | — |
| TASK-214 | PDP gallery: loading indicator while switching images + pixel-perfect PDP skeletons matching the mockup layout | ⬜ | — |
| TASK-215 | Colour variant axis → round colour **swatches** (map colour names to real colours) on PDP/card selectors | ⬜ | — |
| TASK-216 | Catalog listing UX: page-size selector / «показати більше» / infinite scroll with virtualization (also for rail sliders); rethink the «Категорія» filter placement; dynamic per-category filters ride on TASK-191 | ⬜ | — |
| TASK-217 | Move `/orders` into `/account` as a section — **waits for the owner's Claude Design mockup import** | 🅿️ | — |
| TASK-218 | Header search: mixed suggestions — products + up to 5 blog articles with a separator, independently scrollable. Depends on TASK-170 | ⬜ | — |
| TASK-219 | **[discovery]** Coupons v2: capability proposal (stacking, auto-apply, first-order, per-category/brand, personal codes, gift cards) + full automated coverage plan (owner request from QA) | ⬜ | — |
| TASK-220 | **[discovery]** Reviews v2: benchmark big-store mechanics (edit window, moderator reply, re-review, spam/rate-limits, photos, helpful votes) → proposal (owner request from QA) | ⬜ | — |
| TASK-221 | Admin contact-settings UX: structured working-hours editor (days/hours form) instead of free text | ⬜ | — |
| TASK-222 | **[discovery]** Category & variant architecture: modern hierarchy (ktc.ua-style) + admin authoring guide («як створювати і підвʼязувати категорії/групи/варіанти») — feeds Етап 3 (TASK-189…191) | ⬜ | — |
| TASK-223 | **[discovery]** Admin dashboard / CRM feature checklist (owner has no CRM background — propose metrics, widgets, workflows) — feeds TASK-192 | ⬜ | — |
| TASK-224 | **[discovery]** Inventory: available-vs-reserved stock («вільні залишки») concept for the order×stock matrix — pairs with TASK-124 semantics | ⬜ | — |
| TASK-225 | Storefront UI/UX audit: hover/cursor states, a11y, adaptivity; verify footer theming in dark mode — feeds TASK-193 | ⬜ | — |
| TASK-226 | **[discovery]** User stories for customer journeys (best-experience scenarios) — feeds TASK-193/194 and marketing | ⬜ | — |

### Етап 2 — Контент-платформа CRM

> Architecture: admin writes via API → storefront serves static HTML (ISR + on-demand
> revalidation via a secret-protected `POST /api/revalidate` route handler). Publishing
> pattern: `status DRAFT|SCHEDULED|PUBLISHED` + `publishedAt`, cron worker flips
> SCHEDULED→PUBLISHED (MailOutbox pattern). Public endpoints serve only PUBLISHED.
> TASK-187 + TASK-185 first; then blog / banners / forms can run in parallel.

| Task ID | Description | Status | Plan |
| --- | --- | --- | --- |
| TASK-187 | Publishing foundation: shared publish-status pattern + cron publisher + storefront on-demand revalidation (`revalidateTag`) + retrofit onto `Page`. Also fixes the QA finding «контакти на /info оновлюються лише після hard-reload» (ISR staleness) | ⬜ | — |
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
- **New task IDs:** single monotonic counter; next plain ID **TASK-236**. Never reuse an ID.
- **Finishing an Етап:** collapse its table into one summary row under *Completed* and move the
  detailed rows to `docs/backlog-archive.md`.
