# Manual QA Checklist — Phase 2 (Storefront, Cart, Auth)

> Covers TASK-030 (ProductDetailPage), TASK-031 (CartPage), TASK-032 (AddToCart),
> TASK-051 (guest-cart backend), TASK-052 (storefront auth).
> Run through this after the database migration is applied. Tick each box as you verify.

## 0. Prerequisites (do these first)

- [x] Start infrastructure: `docker compose up -d` (PostgreSQL + Redis)
- [x] **Apply the guest-cart migration** (authored offline, not yet applied):
      `npm run prisma:migrate -w apps/store-api`
      → migration `prisma/migrations/20260611120000_guest_cart_token` makes `Cart.userId`
      nullable and adds the unique `token` column
- [x] Seed dev data: `npm run db:seed` (or `/db-seed`) so products/variants/images exist
- [x] Run the API: `npm run start:dev -w apps/store-api` (expect `http://localhost:3001`)
- [x] Run the storefront: `npm run dev -w apps/store-client` (expect `http://localhost:3000`)
- [x] Confirm `apps/store-client/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3001`
      (origin only — the generated client adds the `/api` prefix)
- [ ] Run the guest/merge e2e (TASK-051-I): `npm run test:e2e -w apps/store-api` — all green

---

## 1. Product browsing & detail (TASK-030)

- [ ] `/products` lists products; filters and pagination work
- [ ] Clicking a product card opens `/products/<slug>`
- [ ] Detail page shows: image gallery (thumbnails switch the main image), name, price,
      sale price (strikethrough) when on sale, SKU, description, breadcrumb
- [ ] Breadcrumb links work: Home → Products → Category → (current product)
- [ ] Variant selector: selecting a variant updates the displayed price; out-of-stock variant
      is disabled and shows "Out of stock"
- [ ] Browser tab title = product name (`generateMetadata`)
- [ ] Visiting a non-existent slug (`/products/does-not-exist`) shows the inline error state,
      not a crash

## 2. Add to cart (TASK-032) — as a GUEST (not logged in)

- [ ] On a product detail page, click **Add to Cart** → label flips to "Adding…" then "Added ✓"
- [ ] First add issues a `cartToken` cookie (DevTools → Application → Cookies → `cartToken`,
      HttpOnly, Path `/api`)
- [ ] Header **Cart** link → `/cart` shows the added item
- [ ] Add the same product+variant again → quantity increments (no duplicate line)
- [ ] Out-of-stock variant → Add to Cart button is disabled
- [ ] Add to cart error (e.g. API down) shows the inline `role="alert"` message

## 3. Cart management (TASK-031) — GUEST

- [ ] `/cart` lists each line: name, variant, unit price, line total
- [ ] Quantity stepper **+** / **−** updates quantity; subtotal & total recalculate
- [ ] Typing a quantity in the input and blurring commits the change
- [ ] Decrement at quantity 1 (or **Remove**) removes the line
- [ ] Quantity cannot exceed stock (variant) or 99
- [ ] **Clear cart** asks for confirmation, then empties the cart
- [ ] Empty cart shows "Your cart is empty" + working "Shop now" link to `/products`
- [ ] Reloading `/cart` keeps the same guest cart (cookie persists)

## 4. Registration (TASK-052)

- [ ] `/register` form validates: invalid email, empty names, password < 8 chars,
      mismatched "Confirm password" each show inline errors
- [ ] Registering a NEW email succeeds → redirected to `/`; header shows "My account" + "Sign out"
- [ ] Registering an EXISTING email shows "That email is already registered."
- [ ] **Guest → user cart merge:** add items as a guest, then register → `/cart` shows those
      items (merged into the new user's cart); `cartToken` cookie is cleared

## 5. Login / Logout / Session (TASK-052)

- [ ] `/login` with wrong password → "Invalid email or password."
- [ ] `/login` with correct credentials → redirect to `/`; header shows authenticated state
- [ ] **Merge on login:** as a guest add items, then log in to an account that already has a
      cart → quantities are summed (clamped to stock / 99)
- [ ] **Session persists on reload:** while logged in, refresh the page → still authenticated
      (silent `/api/auth/refresh` on load); brief skeleton in the header during init
- [ ] **Sign out** → header reverts to "Sign in / Register"; visiting `/cart` starts a fresh
      guest cart
- [ ] Visiting `/login` while already authenticated silently redirects to `/`

## 6. 401 refresh interceptor (TASK-052-A)

- [ ] While logged in, clear the in-memory token (or wait for access-token expiry) and trigger
      a cart action → the app transparently calls `/api/auth/refresh`, retries once, and the
      action succeeds without a visible error
- [ ] If the refresh cookie is also expired/invalid → the request fails gracefully (no infinite
      loop of refresh calls in the Network tab)

## 7. General / a11y / regressions

- [ ] No `console.error` in the browser during any flow above
- [ ] Keyboard: can tab to and operate the quantity stepper, Add to Cart, and auth forms
- [ ] `npm run build -w apps/store-client` and `npm run build -w apps/store-api` both exit 0
- [ ] `npm run test -w apps/store-api` (unit) and `npm run test:e2e -w apps/store-api` green

---

### Notes / known gaps (not bugs)

- No product images on cart line items (`CartItemEntity` has no image field) — placeholder only.
- "Proceed to Checkout" is intentionally disabled (checkout = Phase 3, TASK-035).
- No cart item-count badge in the header yet (future CartWidget task).
- No quick-add from product cards (variant must be chosen on the detail page).
