# Pending Manual QA

> Extracted from BACKLOG.md on 2026-07-03 (TASK-181). Code for every item shipped with
> automated gates green; each needs a one-off check on a running stack.
> Working through this list to closure is **TASK-101 (Етап 1 — стабілізація)**:
> verify each item, tick it off, and file anything broken as a `fix/NNN` task in BACKLOG.md.

## Інтеграційні прогони (потрібні контейнери / test DB)

- [ ] **TASK-044-I** — Real-Redis cache hit/miss/invalidation int run. _Needs Docker Redis up._
- [ ] **TASK-066 / TASK-152** — Dashboard raw-SQL int-spec (rewritten to current schema: `paymentStatus=PAID` revenue + top-products + low-stock): `npm run test:int -w apps/store-api` against `store_test`. Also visually confirm the dashboard shows the Top-products and low-stock tables. _Needs `test:int` DB._
- [ ] **TASK-137** — Dashboard shows earned vs unrealized (ordered-but-unpaid) revenue cards; run the unrealized int-spec against `store_test`. _Needs `test:int` DB._
- [ ] **TASK-105-D** — Run Playwright E2E (`npm run test:e2e:pw`, 4 specs). _Needs DB + `npx playwright install chromium` + booted API/client._

## Сторфронт — флоу

- [ ] **TASK-045-I** — JSON-LD present in product HTML. _Needs live API._
- [ ] **TASK-119** — Checkout submit → lands on `/orders/{uuid}/confirmation` (not empty `/cart`); confirmation shows UA address (city, delivery address, phone, «Україна») + items/totals; empty-cart and unauth guards still redirect. _Full checklist in plan 053._
- [ ] **TASK-118** — Guest→user cart merge: guest adds items → login/register → items present without reload; reload while logged in keeps cart non-empty.
- [ ] **TASK-126** — Product card → PDP: a sale card opens with the cheapest/advertised variant pre-selected (not alphabetically-first); price matches the card; variant override works. _Thumbnail strip needs the TASK-128 multi-image seed; see `manual-qa-master.md` A1._
- [ ] **TASK-120-E** — Tab freeze / bfcache restore: background the tab until the browser freezes it, then return → products/cart/header recover (no infinite skeleton); normal tab switch doesn't refetch-storm; F5 works. _Wedge guard proven via Playwright; real-browser bfcache pass still pending (headless Chromium disables true bfcache)._
- [ ] **TASK-132 / TASK-158** — Stock hiding: PDP + cart show only a status (В наявності / Закінчується / Немає), never a raw count; public `GET /products` + `/products/:slug` expose no `stock` (only `inStock`/`lowStock`); cart qty stepper still capped per `item.stock`.
- [ ] **TASK-133 / TASK-134** — Cart & order line items show the real product image (placeholder fallback) and link to the correct PDP `/products/{slug}`; order-details layout correct on desktop + mobile.
- [ ] **TASK-130** — Header: logged-in user sees the account icon + dropdown (cabinet / orders / logout), guest sees login/register; mobile Sheet sections; Esc + keyboard nav + focus-return.
- [ ] **TASK-131** — Order cancel: a PENDING order shows a Cancel button → confirm flips to CANCELLED, refetches list/detail, auto-returns stock (TASK-124 path); non-PENDING shows no button.
- [ ] **TASK-124** — Order stock×status matrix: stock drops at creation; forward transitions don't change it; pre-shipment cancel (PENDING/CONFIRMED/PROCESSING→CANCELLED) auto-restocks; SHIPPED/DELIVERED cancel + REFUNDED do NOT; no double-credit on repeat cancel. _Run the matrix in `manual-qa-master.md` §C2-a._
- [ ] **TASK-077** — Variant dots + quick-add: a grouped-product card shows colour dots + «from {price}»; hover/keyboard-focus reveals quick-add for the default (cheapest) variant; out-of-stock default disables it.
- [ ] **TASK-074** — Image optimization: images load via `next/image` (lazy, blur/shimmer placeholder); first above-the-fold row loads eagerly (no layout shift); remote `/uploads/**` host renders without a Next image-host error.
- [ ] **TASK-079** — Coupons: admin creates a percent + a fixed code (min-spend/expiry/caps); valid code in cart shows discount + updated total; invalid/expired/below-min/used-up shows the typed error; order persists `discount`/`discountCode` and increments `redeemedCount`; server recomputes (tampered client amount ignored).
- [ ] **TASK-076** — Wishlist: guest hearts persist across reload (`wishlistToken`); on login/register the guest list merges without duplicates; header badge updates; `/wishlist` lists items and remove works.
- [ ] **TASK-075** — Search UI (browser): header autocomplete as you type (debounced), keyboard up/down/enter/esc, suggestion opens the PDP, Enter opens `/search?q=`; results page renders cards + empty state; mobile Sheet hosts the box. _Needs the `meilisearch` container + `MEILI_HOST`/`MEILI_MASTER_KEY`; without them search falls back to Postgres. API path already live-verified._
- [ ] **TASK-078 / TASK-106** — Reviews end-to-end: logged-in user submits on the PDP → hidden until admin approves in `/reviews` → after approve it appears in the Reviews tab with the aggregate rating; verified-purchase badge for buyers; duplicate submit returns 409.

## Адмінка

- [ ] **TASK-059-B / TASK-112** — Admin login + silent refresh + CSRF path smoke. _Refresh-path bug already fixed; live smoke pending._
- [ ] **TASK-141-B** — Product/category edit forms reflect a background refetch on pristine fields while preserving in-progress edits (open form → focus another tab → return).
- [ ] **TASK-151** — Order detail (B4): status select offers every status; the separate payment-status select changes payment independently — CONFIRMED does NOT auto-mark PAID and vice versa; pre-shipment cancel still auto-restocks.
- [ ] **TASK-150** — Users filter + ban (B5): «Активний/Неактивний/Усі статуси» returns the correct set; a banned customer with a live access token gets `403` on `POST /api/orders` and cannot refresh. _Gap B (other authed endpoints during the ≤15-min token window) deferred by owner decision._
- [ ] **TASK-136** — Creating a product with an empty slug → backend derives it; live slug preview renders; dead header search removed.
- [ ] **TASK-155** — Staff preview of deactivated products: deactivate → «Переглянути» on the edit page opens `/products/preview/{slug}` (full detail + amber banner); the same slug still 404s on the storefront; non-admin token gets 403 on the preview API.
- [ ] **TASK-091** — Image pre-optimization: admin JPEG/PNG upload stores a smaller `.webp` + non-null `blurDataUrl`; storefront shows a real per-image blur-up (not the generic shimmer); animated GIF passes through (no `blurDataUrl`); old seed images still render via shimmer. _Optional backfill is a documented follow-up._

## Зовнішні інтеграції (потрібні ключі/ENV)

- [ ] **TASK-080-A…D** — Nova Poshta live: with a real `NP_API_KEY` — city search returns real settlements, warehouse list populates, checkout shows real cost + ETA, order persists NP refs + `shippingCost`. _Automated coverage mocks the NP client; this validates the live contract._
- [ ] **TASK-103** — Mail outbox: order returns immediately and writes a `mail_outbox` PENDING row in the same transaction; with `MAIL_ENABLED=true` the cron sends → SENT; forced SMTP failure retries with backoff → FAILED after maxAttempts; with mail disabled rows drain as no-op SENT. _Needs SMTP._
- [ ] **TASK-048** — Sentry: with DSNs set, a deliberate API 500 and a thrown storefront/admin render error land in Sentry tagged with the right `environment`; a 4xx is NOT sent; without DSN all three apps run as before. _CI source-map upload is a documented follow-up._
- [ ] **TASK-138** — No Radix `aria-describedby` warning opening the mobile-menu Sheet; «Mail disabled — skipping…» visible at info level; reproduce the link-preload warning in a browser then fix (best-effort).

## Дизайн-імпорт — візуальні проходи (light + dark)

- [ ] **TASK-167-A/B/C** — Chrome redesign (plan 096): search pill «Каталог ▾ / input / 🔍» with the catalog panel + typo-tolerant suggestions anchored to the pill and mutually exclusive; guest «Кабінет» opens the auth slide-out (Вхід/Реєстрація tabs, close-on-success, terms checkbox, forgot/Google/Apple stubs toast); header cart opens the mini-cart slide-out (qty stepper + remove reconcile with the cache; «Оформити» → /checkout, «Перейти в кошик» → /cart); dark footer: four columns + socials + payment pills; wishlist heart on recently-viewed + related cards. _Check footer contrast in both modes; verify slide-out login/register authenticates end-to-end; mini-cart changes reflect on /cart._
- [ ] **TASK-167-D** — Blog listing `/blog` pixel-close to `Blog.dc.html`: hero + search, category chips with counts, featured card, responsive grid, empty state, gated load-more, newsletter block; filter/search/load-more behave; breadcrumb renders. _Static seed; `/blog` not yet in nav (TASK-173)._
- [ ] **TASK-171** — Blog article `/blog/{slug}` pixel-close to `Article.dc.html`: head (badge/title/lead/author/share), cover, body + sticky TOC (smooth-scroll, hidden on narrow), tags, author-bio, «Читайте також» grid; copy-link fires the toast; Telegram/Facebook share windows open; every card opens its article (no 404). _Shared demo body until TASK-170._
- [ ] **TASK-167-E** — Legal document `/legal/{slug}` in the `Legal.dc.html` template: doc head («Чинна редакція від …», «Завантажити PDF»), sticky scroll-spy TOC (numbered, smooth-scroll), auto-numbered `<h2>`s, contact CTA, «Інші правові документи» grid; print produces a clean doc. _Needs a seeded `Page`._
- [ ] **TASK-167-F** — Legal hub `/legal` in the `LegalHub.dc.html` template: hero, a tile per published page (icon/title/excerpt/«Оновлено …»), support CTA; tiles open their document; the doc breadcrumb returns to the hub. _Needs seeded `Page`s._
- [ ] **TASK-167-G** — Cart `/cart` matches `Cart.dc.html`: two-column layout, line items (image/name/availability/trash/stepper/sale strikethrough), «Додати ще товари» + «Очистити кошик» (confirm), summary with promo + «До сплати», delivery/payment stub cards; qty/remove/optimistic totals behave, a real coupon applies, clear-cart empties, checkout → `/checkout`; add-on-services toggles update the summary. _Services are a stub, not persisted through checkout (TASK-174)._
- [ ] **TASK-167-H** — Account `/account` matches `Account.dc.html`: sticky sidebar (user card/nav/logout), «Особисті дані» saves name + phone (email read-only), «Історія замовлень»/«Обране» navigate, «Бонуси»/«Налаштування»/«Покупки»/«Історія перегляду»/«Порівняння» render their stubs, logout ends the session.
- [ ] **TASK-167-I** — Categories hub `/categories` matches `Categories.dc.html`: sticky root-category rail (active state), selected group shows title + description + subcategory tiles linking to `/products?categoryId=…`, «Популярні бренди» strip (stub); rail switches the group; tiles open the filtered catalog. _Needs seeded categories._
- [ ] **TASK-167-J** — Checkout `/checkout` matches `Checkout.dc.html`: step indicator (Доставка→Перевірка), contacts + NP delivery cards, payment stub, «Ваше замовлення» summary (avatars + qty, promo, subtotal / real NP estimate / total), «Далі» → review → «Підтвердити» creates the order → confirmation; prefill + phone mask + NP autocomplete work. _Payment radios / «списати бонуси» are inert stubs._
- [ ] **TASK-167-K** — Info & support `/info` matches `Info.dc.html`: side nav switches Доставка/Гарантія/FAQ/Про нас/Контакти (deep-links via `#hash`), FAQ accordion expands, Контакти shows the real `SiteContactSettings` + «Напишіть нам» demo form; the legal contact CTA lands on `/info#contacts`. _Needs a seeded `SiteContactSettings`; form is a stub (TASK-177)._
