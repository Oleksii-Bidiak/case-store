# Plan: Wishlist / Favorites

> **Status:** ⬜ Not started
> **Phase:** Tier 4 — Commerce, discovery & reliability · **Wave 2 (Group B)**
> **Parent task:** TASK-076
> **Created:** 2026-06-30
> **Last Updated:** 2026-06-30

## Overview

Let visitors save products to a wishlist that works for **guests via a cookie**
and **merges into the account on login/register** — a direct mirror of the
existing guest-cart architecture (`Cart.userId?` + `Cart.token?`,
`CartService.mergeGuestCart`, the `cartToken` HttpOnly cookie + CartIdentity
interceptor/decorator). Reusing that proven identity infra is the core of this
plan: copy the shape, don't reinvent it.

## Scope

### In Scope

- `Wishlist` + `WishlistItem` Prisma models (+ migration `add_wishlist`).
- Guest wishlist via a `wishlistToken` HttpOnly cookie; merge-on-login.
- Add/remove/toggle a product; list the wishlist; a heart toggle on `ProductCard`
  and the PDP; a `/wishlist` page.

### Out of Scope

- Wishlist sharing, multiple named lists, price-drop alerts, "move to cart" bulk ops
  (single default list, MVP).
- Admin visibility into user wishlists.

## User Stories

1. As a guest, I add products to my wishlist and they persist across reloads
   (cookie-backed), without logging in.
2. As a returning user, my guest wishlist merges into my account when I log in /
   register, with no duplicates.
3. As a user, I toggle the heart on a product card or PDP and visit `/wishlist`
   to see everything I saved.

## Technical Design

### Data Model

```prisma
model Wishlist {
  id        String   @id @default(uuid())
  userId    String?  @unique @map("user_id")
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String?  @unique @map("token")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items     WishlistItem[]

  @@index([token])
  @@map("wishlists")
}

model WishlistItem {
  id         String   @id @default(uuid())
  wishlistId String   @map("wishlist_id")
  wishlist   Wishlist @relation(fields: [wishlistId], references: [id], onDelete: Cascade)
  productId  String   @map("product_id")
  product    Product  @relation(fields: [productId], references: [id])
  createdAt  DateTime @default(now()) @map("created_at")

  @@unique([wishlistId, productId])
  @@index([wishlistId])
  @@map("wishlist_items")
}
```

Add relations: `User.wishlist Wishlist?`, `Product.wishlistItems WishlistItem[]`.
**Mirrors `Cart`/`CartItem` exactly** (nullable `userId`+`token`, unique
`[wishlistId, productId]`).

### Backend (NestJS — Clean Architecture)

Mirror the cart module structure (`src/cart/*`):

- **`WishlistRepository`** — `findByUser`, `findByToken`, `create`,
  `addItem(wishlistId, productId)` (upsert, idempotent on `@@unique`),
  `removeItem`, `assignToUser(wishlistId, userId)`, transactional
  `mergeGuestWishlist` helper (reassign-or-merge, then delete guest list).
- **`WishlistService`** — resolve identity (user | token), `getWishlist`,
  `toggle(productId)`, `add`, `remove`, `mergeGuestWishlist(token, userId)`
  (no-op when guest list missing/empty; **reuse the cart merge semantics** —
  reassign when no user list, else merge unique items then delete guest list).
- **`WishlistController`** — `GET /api/wishlist`, `POST /api/wishlist/items {productId}`,
  `DELETE /api/wishlist/items/:productId`, `POST /api/wishlist/toggle {productId}`.
- **Identity infra:** reuse the CartIdentity pattern. Either generalize the
  existing interceptor/decorator/cookie helper to a shared `guest-identity`
  primitive, **or** add a parallel `wishlistToken` (`WISHLIST_TOKEN_COOKIE`)
  copy. **Decision: parallel copy** (`wishlist-identity.types.ts` mirroring
  `cart-identity.types.ts`) to keep cart untouched during Wave 2; a later refactor
  can extract the shared primitive.
- **Merge trigger:** the auth login/register path already calls
  `mergeGuestCart`; add a sibling `mergeGuestWishlist` call there (same place,
  same `isInitializing` gating story on the client — TASK-118).

### Frontend (Next.js — FSD)

- **entities/wishlist** — Orval hooks (`useGetWishlist`, toggle/add/remove mutations).
- **features/toggle-wishlist** — heart button (filled when saved), optimistic
  toggle + query invalidation, a11y `aria-pressed`/label; injected into
  `ProductCard` (as another card slot, like `quickAdd`) and the PDP.
- **widgets/wishlist** + `app/wishlist/page.tsx` — the saved-products grid with
  empty state; reuse `ProductCard`.
- Header: a wishlist icon with a count badge (mirrors the cart badge).
- Client identity: `wishlistToken` cookie handled exactly like `cartToken`
  (gate `useGetWishlist` on `isInitializing`, invalidate after the post-login
  refresh — reuse the TASK-118 pattern).

### API Contract

| Method | Path                           | Body          | Response                 |
| ------ | ------------------------------ | ------------- | ------------------------ |
| GET    | /api/wishlist                  | —             | { data: WishlistEntity } |
| POST   | /api/wishlist/items            | { productId } | { data: WishlistEntity } |
| DELETE | /api/wishlist/items/:productId | —             | { data: WishlistEntity } |
| POST   | /api/wishlist/toggle           | { productId } | { data: WishlistEntity } |

## Tasks

### TASK-076-A: Prisma `Wishlist` + `WishlistItem` (+ migration)

**Type:** feat · **Scope:** store-api · **Complexity:** S · **TDD:** No
**Acceptance:** models + `User`/`Product` relations; migration `add_wishlist`;
`prisma generate` clean.

### TASK-076-B: `WishlistRepository`

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** Yes (repo spec)
**Depends on:** 076-A. **Acceptance:** add/remove/upsert idempotency, find-by-user/
token, transactional `mergeGuestWishlist`; PrismaService injected.

### TASK-076-C: `WishlistService` + identity + merge

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** Yes
**Depends on:** 076-B. **Acceptance:** resolve user|token identity; toggle/add/remove;
`mergeGuestWishlist` mirrors `mergeGuestCart` (reassign-or-merge, delete guest);
hooked into login/register; unit specs for merge edge-cases (no guest list, empty,
existing user list with overlap).

### TASK-076-D: Controller + module + `wishlist-identity` + cookie

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** No
**Depends on:** 076-C. **Acceptance:** routes + interceptor/decorator/cookie parallel
to cart; `WishlistModule` registered; `Wishlist` tag in `export-swagger.ts`; e2e
(guest add → merge on login → no dupes; toggle idempotency).

### TASK-076-E: Orval regen + storefront toggle feature + header badge

**Type:** feat · **Scope:** store-client · **Complexity:** M · **TDD:** No
**Depends on:** 076-D. **Acceptance:** heart toggle on ProductCard + PDP (optimistic,
a11y), header wishlist count, `isInitializing` gating; RTL tests.

### TASK-076-F: `/wishlist` page widget

**Type:** feat · **Scope:** store-client · **Complexity:** S · **TDD:** No
**Depends on:** 076-E. **Acceptance:** saved grid + empty state; remove from list;
dict keys; RTL test.

## Execution Order

`076-A → 076-B → 076-C → 076-D → regen → { 076-E → 076-F }`

## Verification Gate

- `npm run test -w apps/store-api` (wishlist repo/service specs)
- `npm run test:e2e -w apps/store-api -- --testPathPattern "wishlist" --forceExit`
- `npm run swagger:export -w apps/store-api && npm run generate:api`
- `npm run lint && npm run typecheck && npm run build && npm run test` (client)

## Risks & Mitigations

| Risk                            | Mitigation                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Duplicate items on merge        | `@@unique([wishlistId, productId])` + upsert; merge re-uses cart's clamp/dedupe shape.                               |
| Guest list orphaned after merge | Reassign-or-merge **then delete** inside one transaction (cart pattern).                                             |
| Cart/wishlist cookie confusion  | Distinct cookie name `wishlistToken`; same options helper shape.                                                     |
| ProductCard slot creep          | Inject the heart as a dedicated slot, like the existing `quickAdd`/`action` slots, keeping `shared/ui` feature-free. |

## Notes

- Memory: guest-cart works via cookie; auth only at checkout — wishlist follows the
  same identity model. See [[guest-cart-architecture]].
- **Wave-2 migration is created schema-first on `develop`** before parallel work.
- Related: [[090-coupons-discounts]], [[092-mail-outbox]].
