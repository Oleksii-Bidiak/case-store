# Plan: Coupons / Promo Codes (Discounts)

> **Status:** ⬜ Not started
> **Phase:** Tier 4 — Commerce, discovery & reliability · **Wave 2 (Group B)**
> **Parent task:** TASK-079
> **Created:** 2026-06-30
> **Last Updated:** 2026-06-30

## Overview

Let customers redeem promo codes for an order discount, and let admins manage
those codes. The `Order.discount` Decimal column already exists
(`schema.prisma:215`) — this plan adds the `Discount` model behind it, the
validation + calculation logic (a **critical module → TDD**), the cart/checkout
apply path, and the admin CRUD.

## Scope

### In Scope

- `Discount` + `DiscountRedemption` Prisma models (+ migration `add_discount`).
- `DiscountService.computeDiscount` — pure, TDD'd amount calculation + eligibility.
- Storefront: apply/remove a code in the cart; the computed discount flows into
  the existing checkout totals and is persisted on the order (in its transaction).
- Admin: `/discounts` CRUD (list/create/edit/deactivate) mirroring the existing
  product/category admin modules.

### Out of Scope

- Automatic/stacked discounts, BOGO, category-scoped or product-scoped coupons
  (single order-level code only for MVP).
- Free-shipping coupons (discount applies to subtotal, not `shippingCost`).
- Abandoned-cart / marketing automation (TASK-049, parked).

## User Stories

1. As a customer, I enter a promo code in the cart and see the discount applied
   to my total before checkout, so I know my final price.
2. As a customer, I get a clear error when a code is invalid, expired, below the
   minimum spend, or already used up.
3. As an admin, I create/edit/deactivate codes (percent or fixed, with caps and
   expiry) and see how many times each was redeemed.

## Technical Design

### Data Model

```prisma
enum DiscountType {
  PERCENT
  FIXED
}

model Discount {
  id             String       @id @default(uuid())
  code           String       @unique            // stored UPPERCASE, matched case-insensitively
  type           DiscountType
  value          Decimal      @db.Decimal(10, 2) // PERCENT: 1–100; FIXED: UAH amount
  minSpend       Decimal?     @map("min_spend") @db.Decimal(10, 2)
  maxRedemptions Int?         @map("max_redemptions")        // global cap; null = unlimited
  redeemedCount  Int          @default(0) @map("redeemed_count")
  perUserLimit   Int?         @map("per_user_limit")         // per-user cap; null = unlimited
  startsAt       DateTime?    @map("starts_at")
  expiresAt      DateTime?    @map("expires_at")
  isActive       Boolean      @default(true) @map("is_active")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  redemptions    DiscountRedemption[]

  @@index([isActive])
  @@map("discounts")
}

model DiscountRedemption {
  id         String   @id @default(uuid())
  discountId String   @map("discount_id")
  discount   Discount @relation(fields: [discountId], references: [id], onDelete: Cascade)
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  orderId    String   @unique @map("order_id")   // one redemption per order (idempotency)
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([discountId])
  @@index([userId])
  @@map("discount_redemptions")
}
```

Add relation fields: `User.discountRedemptions DiscountRedemption[]`. (`Order.discount`
already exists; optionally add `Order.discountCode String?` to snapshot which code
was used — decided **yes**, for admin order detail readability.)

### Backend (NestJS — Clean Architecture)

**`DiscountRepository`** — `findByCode(code)`, `findById`, `findMany(params)`,
`create`, `update`, `softDeactivate`, `countUserRedemptions(discountId, userId)`,
`incrementRedeemed(discountId, tx?)`, `createRedemption(data, tx)`.

**`DiscountService`** (TDD — Red→Green→Refactor):

- `computeDiscount(code, subtotal, userId): Promise<{ discount: Discount; amount: string }>`
  — the **pure calculable core**: normalize code → load → assert `isActive`,
  `startsAt`/`expiresAt` window, `subtotal >= minSpend`, global `maxRedemptions`
  not hit, `perUserLimit` not hit; compute amount with **cents arithmetic** (mirror
  `OrderItemEntity.fromPrisma` / cart total pattern), clamp so `amount <= subtotal`
  (never negative total). Throws typed `BadRequest`/`Conflict` with stable codes.
- `redeem(discountId, userId, orderId, tx)` — inside the order-creation transaction:
  re-validate caps, `incrementRedeemed`, `createRedemption` (the `orderId` unique
  makes repeat-applies idempotent).

**`DiscountController`** (public) — `POST /api/cart/discount/preview { code }`
→ `{ data: { code, type, amount, newTotal } }` (auth required; validates against the
caller's current cart subtotal). Lives under cart or its own `discount` module —
**own module** (`DiscountModule`), imported by `OrderModule` for the redeem path.

**`AdminDiscountController`** (AdminGuard) — `GET /api/admin/discounts` (list+meta),
`POST`, `GET :id`, `PATCH :id`, `DELETE :id` (soft deactivate). DTOs via
class-validator; Swagger envelopes + stable `operationId`s.

**Order integration:** `OrderService.createOrder` accepts an optional `discountCode`;
when present it calls `DiscountService.computeDiscount` (authoritative re-check, never
trust a client-sent amount), writes `discount` + `discountCode` on the order, and
`redeem()`s inside the same `$transaction` that creates the order.

### Frontend (Next.js — FSD)

- **entities/discount** — Orval hooks (`useDiscountPreview`, admin CRUD hooks).
- **features/apply-discount** (store-client) — cart code input + apply/remove,
  zod-validated, shows computed discount or a typed error; updates cart summary.
- **store-admin**: `entities/discount`, `features/discount-form` (RHF + zod,
  `values`-keyed edit per forms convention), `widgets/discount-table`, routes
  `/discounts`, `/discounts/new`, `/discounts/[id]/edit`, sidebar nav entry +
  dictionary `discounts.*`.

### API Contract

| Method | Path                       | Body              | Response                                   |
| ------ | -------------------------- | ----------------- | ------------------------------------------ |
| POST   | /api/cart/discount/preview | { code }          | { data: { code, type, amount, newTotal } } |
| GET    | /api/admin/discounts       | —                 | { data: Discount[], meta }                 |
| POST   | /api/admin/discounts       | CreateDiscountDto | { data: Discount }                         |
| GET    | /api/admin/discounts/:id   | —                 | { data: Discount }                         |
| PATCH  | /api/admin/discounts/:id   | UpdateDiscountDto | { data: Discount }                         |
| DELETE | /api/admin/discounts/:id   | —                 | { data: { id } }                           |

## Tasks

### TASK-079-A: Prisma `Discount` + `DiscountRedemption` (+ migration)

**Type:** feat · **Scope:** store-api · **Complexity:** S · **TDD:** No
**Acceptance:** models + enum added; `User` relation added; migration
`add_discount` authored; `prisma generate` clean. **Files:** `schema.prisma`,
`prisma/migrations/*_add_discount/`.

### TASK-079-B: `DiscountRepository`

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** Yes (repo spec)
**Depends on:** 079-A. **Acceptance:** all methods; PrismaService injected (not
PrismaClient); tx-aware `incrementRedeemed`/`createRedemption`.

### TASK-079-C: `DiscountService.computeDiscount` (TDD core)

**Type:** feat · **Scope:** store-api · **Complexity:** L · **TDD:** **Yes**
**Depends on:** 079-B. **Acceptance:** Red→Green→Refactor covering percent/fixed
math (cents), min-spend, active/window gates, global + per-user caps, clamp-to-
subtotal, typed error codes. ≥ 12 spec cases.

### TASK-079-D: Discount + AdminDiscount controllers + module + DTOs

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** No
**Depends on:** 079-C. **Acceptance:** public preview + admin CRUD routes; AdminGuard;
Swagger envelopes; `DiscountModule` registered in `app.module.ts`; `Discounts` tag in
`export-swagger.ts`. e2e spec written (preview happy/invalid/expired/min-spend/cap;
admin CRUD + RBAC).

### TASK-079-E: Order redeem integration

**Type:** feat · **Scope:** store-api · **Complexity:** M · **TDD:** Yes
**Depends on:** 079-C. **Acceptance:** `createOrder` re-validates + persists
`discount`/`discountCode` + redeems in the order transaction; idempotent on
`orderId`; subtotal-relative totals correct; e2e covers order-with-discount.

### TASK-079-F: Orval regen + storefront apply-discount feature

**Type:** feat · **Scope:** store-client · **Complexity:** M · **TDD:** No
**Depends on:** 079-D. **Acceptance:** code input in cart, apply/remove, typed errors,
summary reflects discount; RTL tests; a11y.

### TASK-079-G: Admin discounts management UI

**Type:** feat · **Scope:** store-admin · **Complexity:** M · **TDD:** No
**Depends on:** 079-D. **Acceptance:** list/create/edit/deactivate; redeemedCount
shown; sidebar nav; dict keys; RTL tests.

## Execution Order

`079-A → 079-B → 079-C → { 079-D, 079-E } → regen → { 079-F, 079-G }`

## Verification Gate

- `npm run test -w apps/store-api` (incl. discount service/repo TDD specs)
- `npm run test:e2e -w apps/store-api -- --testPathPattern "discount|order" --forceExit`
- `npm run swagger:export -w apps/store-api && npm run generate:api`
- `npm run lint && npm run typecheck && npm run build && npm run test` (client + admin)

## Risks & Mitigations

| Risk                                          | Mitigation                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Client tampering with discount amount         | Server **always** recomputes in `createOrder`; preview is advisory only.                             |
| Race on `maxRedemptions` (oversell of a code) | Re-check + `incrementRedeemed` inside the order `$transaction`; `DiscountRedemption.orderId` unique. |
| Float rounding on percent codes               | Cents arithmetic, mirroring existing cart/line-total pattern.                                        |
| Negative/overshoot total                      | Clamp `amount <= subtotal`.                                                                          |

## Notes

- Critical module → 079-C and 079-E are TDD (CLAUDE.md: discounts).
- **Wave-2 migration is created schema-first on `develop` before parallel work** —
  see the Wave-2 orchestration note; agents do not touch `schema.prisma`/migrations.
- Related: [[091-wishlist-favorites]], [[092-mail-outbox]].
