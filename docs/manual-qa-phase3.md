# Manual QA Checklist — Phase 3 (Checkout & Orders)

> Covers TASK-033 (Order module backend), TASK-035 (Checkout feature),
> TASK-036 (Order confirmation page), TASK-037 (Order confirmation emails).
> TASK-034 (Stripe payment integration) is **not yet implemented** — payment is
> confirmed manually by an admin via `PATCH /api/orders/{id}/confirm-payment`.
> Run through this after the Phase 2 migration is applied. Tick each box as you verify.
>
> **Exit criterion (roadmap):** _User can complete a purchase and receive an order confirmation._

## 0. Prerequisites (do these first)

- [ ] Start infrastructure: `docker compose up -d` (PostgreSQL + Redis)
- [ ] Apply migrations: `npm run prisma:migrate -w apps/store-api`
- [ ] Seed dev data: `npm run db:seed` (need ≥1 active product with a variant that has a
      known finite stock count)
- [ ] Run the API: `npm run start:dev -w apps/store-api` (expect `http://localhost:3001`)
- [ ] Run the storefront: `npm run dev -w apps/store-client` (expect `http://localhost:3000`)
- [ ] Confirm `apps/store-client/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3001`
- [ ] Run the order e2e: `npm run test:e2e -w apps/store-api` — all green
- [ ] Test accounts ready: **User A** (customer), **User B** (customer), **Admin** (ADMIN role)
- [ ] Note: `MAIL_ENABLED` defaults to `false` (no SMTP attempted)

---

## 1. Happy-path purchase (core exit criterion) — TASK-035/036

- [ ] Log in as **User A**, add an in-stock variant to cart, open `/cart`, click **Proceed to Checkout**
- [ ] On `/checkout`, fill the shipping address, leave "Billing same as shipping" checked,
      optionally add notes, click **Place order**
- [ ] Redirected to `/orders/{id}/confirmation`
- [ ] Confirmation shows: order number (first 8 chars, uppercased), order date, status `PENDING`,
      payment `PENDING`, line items with correct unit price + line total, subtotal = total,
      shipping address
- [ ] Cart is now empty (header badge + `/cart` page)
- [ ] **DB check:** `orders` row created; `order_items` snapshot prices match what was shown;
      the variant `stock` decreased by the ordered quantity; the cart's items were deleted

## 2. Auth-gate redirects — TASK-035

- [ ] Log out, navigate directly to `/checkout` → redirected to `/login?redirect=/checkout`;
      after logging in you land back on `/checkout` (not `/`)
- [ ] Log out, navigate directly to a known `/orders/{id}/confirmation` →
      redirected to `/login?redirect=/orders/{id}/confirmation`

## 3. Cart guards — TASK-033/035

- [ ] Log in as a user with an **empty cart**, go to `/checkout` → redirected to `/cart`
      (no checkout form)
- [ ] `POST /api/orders` (Swagger) with an empty cart → **400** "Cart is empty"
- [ ] Brand-new user who never created a cart → `POST /api/orders` → **404** "Cart not found"

## 4. Insufficient stock — TASK-033

- [ ] Add quantity _N_ of a variant to cart, then (as admin/DB) reduce that variant's `stock`
      below _N_, then place the order
- [ ] Expected: **400** "Insufficient stock for …"; no order created; stock unchanged
- [ ] Frontend shows the inline "Some items may no longer be available…" error and the cart is
      **not** emptied

## 5. Concurrent oversell (stress — CRITICAL fix, TASK-053)

- [ ] Set a variant's `stock` to **1**. From two sessions (User A and User B), each with that
      variant (qty 1) in cart, fire two `POST /api/orders` as close to simultaneously as possible
- [ ] Expected (fixed): exactly one **201** and one **409** "Insufficient stock"; `stock` ends at 0,
      **never negative**. The losing transaction rolls back entirely (no order, cart not cleared)

## 6. IDOR / ownership — TASK-033

- [ ] As **User A**, note an order id. Log in as **User B**, call `GET /api/orders/{A's id}`
      and visit `/orders/{A's id}/confirmation`
- [ ] Expected: **404** from the API; the confirmation page shows "We couldn't find that order"
      (no leak about existence/ownership)

## 7. List own orders — TASK-033

- [ ] `GET /api/orders` as User A then User B → each sees only their own orders, newest first,
      with `{ data, meta }` pagination
- [ ] `?status=PENDING` filters; `?page=2&limit=5` paginates
- [ ] `?status=FOO` → **400**; `?limit=500` → **400** (max 100)

## 8. Cancel a PENDING order — TASK-033

- [ ] Place an order (note the variant's `stock` dropped), then `PATCH /api/orders/{id}/cancel`
      as the owner → **200**, status `CANCELLED`
- [ ] Stock is **restored** to its pre-order value (TASK-054 — `cancelAndRestock`); verify in DB
- [ ] Cancel again / cancel a non-PENDING order → **409**
- [ ] Cancel another user's order → **404**

## 9. Confirm payment as admin (manual stand-in for TASK-034)

- [ ] Place an order as User A. As **Admin**, `PATCH /api/orders/{id}/confirm-payment` →
      **200**, status `CONFIRMED`, payment `PAID`
- [ ] Repeat → **409** (not PENDING)
- [ ] As a non-admin customer → **403**
- [ ] Unknown id → **404**; no token → **401**

## 10. Order confirmation email — TASK-037

- [ ] `MAIL_ENABLED=false` (default): place an order → succeeds; logs show
      "Mail disabled — skipping…"; no SMTP attempt
- [ ] `MAIL_ENABLED=true` with valid [Ethereal](https://ethereal.email/) SMTP creds
      (`SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`), restart API, place an order →
      confirmation email arrives; subject contains the order number; body lists items, totals,
      and shipping address
- [ ] **HTML-injection escaping:** use a product/address value containing `<` and `&` →
      rendered escaped in the email, not as markup
- [ ] **Fault isolation:** `MAIL_ENABLED=true` with deliberately **broken** SMTP creds →
      the order **still succeeds** (201, confirmation page renders); an error is logged but no
      HTTP error is returned and the order is not rolled back

## 11. Billing-address-differs path — TASK-035/036

- [ ] At checkout, uncheck "Billing address same as shipping", fill a distinct billing address,
      place the order → confirmation page shows both **Shipping** and **Billing** blocks
- [ ] Place another order with the box checked → only a **Shipping** block is shown

## 12. Validation & a11y spot checks — TASK-035

- [ ] Submit the checkout form empty → inline field errors with `role="alert"`
- [ ] Keyboard-only: Tab through all fields, toggle the billing checkbox with Space, submit with Enter
- [ ] Notes field counter updates and is capped at 500 chars; sending >500 via API → **400**
- [ ] Send a malformed nested address via API (e.g. unknown extra field, or `country` length 3)
      → **400** (nested DTO validation)

## 13. Frontend resilience — TASK-036

- [ ] On the confirmation page, simulate an API failure (stop the API / block the request) →
      the "couldn't find that order" alert renders rather than a crash
      (note: per review it cannot currently distinguish a transient error from a true 404)

---

## Known issues surfaced by code review (Phase 3)

These come from the `/review` pass over `b42f12c..HEAD`. Track them as follow-up tasks; they do
**not** block the happy-path demo but should be understood before production.

### CRITICAL

- ✅ **FIXED (TASK-053) — Stock can oversell under concurrency.** `createFromCart` now decrements via
  a conditional `updateMany({ where: { id, stock: { gte: qty } }, data: { decrement } })` and throws
  `ConflictException` (→ transaction rollback) when `count === 0`, so stock can never go negative.
  Covered by `order.repository.spec.ts` and manual scenario **5**. _Still open:_ TASK-055 adds a
  `CHECK (stock >= 0)` DB constraint as defence in depth.

### WARNING

- ✅ **FIXED (TASK-054) — Stock decremented at PENDING, never restocked on cancel.** `cancelOrder`
  now calls `OrderRepository.cancelAndRestock`, which atomically flips the order to `CANCELLED` and
  returns the reserved stock to inventory. This is the manual counterpart to admin `confirm-payment`
  (which keeps the stock) while Stripe/TASK-034 is unimplemented. Covered by tests + scenario **8**.
- **No endpoint-specific rate limit on `POST /api/orders`** (and confirm-payment) — only the global
  100/60s applies. Add a tighter `@Throttle`.
- **`subtotal` computed from a parallel pass over cart prices**, not from the persisted `order_items`
  rows — risk of subtotal vs. summed-line-total drift. Derive subtotal from the rows actually written.
- **`OrderRepository.createFromCart` has no unit/integration test** — the most correctness-critical
  code (snapshotting, cents math, stock decrement, transaction atomicity) is only exercised through
  mocked specs. Add a repository test against a test DB.
- **FSD lateral import** — `widgets/checkout/CheckoutView` imports `CartSkeleton` from `widgets/cart`.
  Move the skeleton to `shared/ui` or give checkout its own.

### SUGGESTION

- Email error logged with `String(err)` only (loses stack); prefer structured Pino `{ err, orderId }`.
- `main.ts` Swagger `addTag` list omits an "Orders" description (cosmetic).
- Make `total = subtotal - discount + shipping + tax` explicit once discounts/TASK-034 land.
- Confirmation page can't distinguish a 404 from a transient error — branch on
  `error.response?.status === 404`.
- Add an e2e case for an **invalid nested address** (current e2e only covers a missing one).

### Verified good (no action needed)

Clean Architecture boundaries (thin controllers, no PrismaClient in services, domain entities
returned); IDOR/ownership returns 404 and is e2e-covered; admin guard on confirm-payment; exhaustive
status-transition guards; email fault-isolation; `MAIL_ENABLED` opt-in no-op; Decimal/cents money
handling; HTML-escaped email template; atomic create+clear+decrement transaction; env validation +
Helmet + explicit CORS + global ValidationPipe; consistent `{ data, meta? }` envelope; Orval-only
hooks, semantic design tokens, solid loading/empty/error/redirect states and a11y on the frontend.
