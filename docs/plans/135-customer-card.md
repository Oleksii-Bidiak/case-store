# Plan 135 — Customer Card v1 (TASK-252)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 4 (Передзапускові фічі + решта CRM)
> **Origin:** `docs/handoff-2026-07-07.md` Блок A · discovery plan 100
> (`docs/plans/100-admin-crm-dashboard-checklist.md`) §4.2 "Картка клієнта"
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-252
> **Runs concurrently with:** TASK-251 (`OrderStatusHistory`, plan to be written separately) in
> a sibling worktree — see the parallelization constraint below. No shared files with that task.

## Overview

TASK-252 adds a single enriched admin endpoint that powers a "customer card" view on
`/users/[id]`: lifetime value (LTV), order count + a recent-orders list, the customer's
product reviews, their redeemed coupons, and any contact-inbox messages sent from their email
address. All of this data already exists via `User` relations (`orders`, `reviews`,
`discountRedemptions`) plus an email-matched join to `ContactMessage` — no Prisma migration is
needed. The work is genuinely full-stack: one new `GET /users/:id/admin-card` endpoint in
`store-api`'s `user` module, and a rebuilt `UserDetailView` widget in `store-admin`.

**Hard constraint for this plan.** TASK-252 is implemented in a worktree running _concurrently_
with TASK-251, which heavily edits the order module (new `OrderStatusHistory` model, order
timeline, status-change hooks). To stay file-disjoint from that work, every order-shaped read
this plan needs is queried **directly via `prisma.order`, from inside `UserRepository`** — the
exact same pattern `DashboardRepository` already uses for its own metrics
(`dashboard.repository.ts:154-160` `getTotalRevenue`, `:205-229`-equivalent shape for
`OrderRepository.findByUserId`). This plan **never imports, extends, or edits**
`order.repository.ts`, `order.service.ts`, `order.controller.ts`, `order.module.ts`, or any file
under `apps/store-api/src/order/`. See "Module wiring decision" below for the full rationale.

Notes/tags on the customer card (`CustomerNote` model — plan 100 §4.2 "Повна" tier) are
explicitly **deferred**, per the BACKLOG task description. This plan builds the "мінімум" tier
only: LTV, order history, reviews, redeemed coupons, contact messages.

## Scope

### In Scope

- New `GET /api/users/:id/admin-card` endpoint (admin-only), returning a single enriched
  `UserAdminCardEntity` payload: profile + LTV + order count + recent orders + reviews +
  redeemed coupons + contact-inbox messages matched by email.
- All new reads live in `UserRepository` (`apps/store-api/src/user/user.repository.ts`) via
  `PrismaService`, querying `prisma.order`, `prisma.review`, `prisma.discountRedemption`,
  `prisma.contactMessage` directly. Zero edits to the `order`, `review`, `discount`, or
  `contact` modules' own controller/service/repository files.
- `UserService.getAdminCard(id)` fans out five independent Prisma reads via a single
  `Promise.all` after one unavoidable `findById` lookup (needed for the 404 check and the
  user's email, which the contact-message join needs) — no waterfall of sequential dependent
  queries, mirroring `DashboardRepository.getSummary()`'s assembly style.
- New Swagger-decorated entities (`UserAdminCardEntity` + four row sub-entities) under
  `user/entities/`, wired into `@ApiExtraModels` for Orval.
- `store-admin` `UserDetailView` rebuilt to consume the new enriched hook exclusively (dropping
  the plain `useUserControllerFindById` call), adding LTV/order-count stat row, a recent-orders
  table (linking to the existing `/orders?userId=` admin filter for the full history), a reviews
  list, a redeemed-coupons list, and a contact-messages list. `UserDetailSkeleton` updated to
  match the new layout.
- Unit tests for every new repository method (mocked Prisma, argument-shape assertions, same
  style as the existing `user.repository.spec.ts`), the service's parallel-assembly + 404
  behavior, and an e2e spec extending `test/user.e2e-spec.ts`.
- Frontend RTL tests (MSW) for the new card sections in `UserDetailView`.

### Out of Scope

- `CustomerNote` (admin notes) / tags on the customer card — plan 100 §4.2 "Повна" tier,
  explicitly deferred per the BACKLOG task description. Left as an unscheduled follow-up in
  Notes below.
- Any change to `ContactMessage`'s schema (no `userId` FK added yet — TASK-256, parked in Wave 5,
  will add that FK + an `IN_PROGRESS` status + the reverse link from `/messages`). This plan's
  contact-message read is a best-effort **email-string match**, not a real relation — see the
  "Contact-message matching caveat" Design Decision.
- Any change to `order.repository.ts` / `order.service.ts` / `order.controller.ts` /
  `order.module.ts` — hard constraint, see Overview.
- Any change to `review.repository.ts`, `discount.repository.ts`, or `contact.repository.ts` —
  this plan reads the same tables directly from `UserRepository` instead of touching those
  modules (see Module wiring decision).
- Pagination on the card's sub-lists (recent orders / reviews / coupons / messages) — each list
  is capped at a fixed limit with no "load more"; the admin clicks through to the corresponding
  full section (`/orders?userId=`, etc.) for anything beyond the cap. A future task could add
  "view all" deep links for reviews/coupons/messages the same way orders already has one.
- Orval regen against the _combined_ develop spec (TASK-251 also extends the OpenAPI contract,
  in a different tag) — see the "Post-merge Orval regen note" at the end of this plan.

## User Stories

1. As the store owner, I want to open a customer's profile and immediately see how much they've
   spent, how many orders they've placed, and their most recent orders, so I don't have to cross
   reference the `/orders` list filtered by their name every time I need context for a
   conversation.
2. As the store owner, I want to see a customer's product reviews and redeemed coupons on their
   profile, so I can tell whether they're an engaged reviewer or a heavy discount-user without
   hunting through separate admin sections.
3. As the store owner, I want to see any contact-inbox messages sent from a customer's email
   address on their profile, so past support conversations are visible in context when I'm
   deciding how to handle a new one.

## Technical Design

### Data Model

No Prisma schema changes. Every field is a read aggregate/list over existing columns already
indexed for their primary use case:

| Source                           | Existing index used                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Order.userId`, `.paymentStatus` | `@@index([userId])` (`schema.prisma:333`)                                                                          |
| `Review.userId`                  | none dedicated — `userId` has no index today (only `productId`/`isActive` do); acceptable at this scale, see Risks |
| `DiscountRedemption.userId`      | `@@index([userId])` (`schema.prisma:555`)                                                                          |
| `ContactMessage.email`           | none — only `@@index([status, createdAt])`; see the matching caveat below                                          |

### Module wiring decision

The reusable-assets brief flagged this as the main backend design point: should `UserModule`
import `ReviewModule` / `DiscountModule` / `ContactModule` and delegate to their services, or
should `UserRepository` query `prisma.review` / `prisma.discountRedemption` / `prisma.contactMessage`
directly?

**Decision: query Prisma directly inside `UserRepository`. No new module imports.**

Rationale:

- **None of the three modules export a repository.** `ReviewModule` exports nothing at all
  (`review.module.ts` has no `exports` array); `DiscountModule` exports only `DiscountService`;
  `ContactModule` exports only `ContactService`. Importing them would only expose their
  _services_, whose methods are shaped for their own use cases (redemption, moderation,
  submission) — none of them has a "list everything for this user, joined with the parent
  entity's display fields" method, so a new method would have to be added to each of those
  services anyway, for a single caller. That's more cross-module coupling for no reuse benefit.
- **`OrderModule` exports only `OrderService`** (not `OrderRepository`) — and per the hard
  constraint above, this plan cannot touch the order module regardless. This alone rules out
  the "import sibling modules" approach for the order-shaped reads and sets the precedent for
  the rest.
- **Precedent already exists:** `DashboardRepository` queries `prisma.order`, `prisma.review`,
  `prisma.mailOutbox` directly from a repository that has nothing to do with those domains
  (`dashboard.repository.ts:257-264`, the `getNeedsAction()` counters). This plan follows the
  exact same, already-proven pattern.
- **No risk of a module import cycle.** `UserModule` already only imports `AuthModule`.
  `OrderModule` imports `UserModule` (for the recipient-email lookup) — if `UserModule` were to
  import `OrderModule` back, that would be a hard cycle. Direct-Prisma access sidesteps this
  entirely, and also sidesteps needing to reason about whether importing `DiscountModule` (which
  imports `CartModule`) into `UserModule` could someday create a cycle if `CartModule` ever grew
  a `UserModule` dependency.

Net effect: **`user.module.ts` needs zero changes.** `PrismaService` is already globally
provided (`prisma.module.ts` is `@Global()`), so `UserRepository`'s existing constructor
injection is sufficient for every new query.

### Contact-message matching caveat

`ContactMessage` has no `userId` foreign key (TASK-256, parked, will add one). This plan matches
by **exact string equality on `email`**. Known limitations, worth documenting for future
readers:

- If a customer emailed support _before_ registering, or under a different address than the one
  they later registered with, those messages won't surface here.
- If an admin later changes the user's email (`UserService.updateProfile`), old contact messages
  sent under the previous address stop matching (there is no address-history table).
- A soft-deleted user's email is mangled (`deleted:<id>:<email>`) on delete — but
  `UserRepository.findById` already excludes soft-deleted users (`deletedAt: null`), so the
  admin-card endpoint 404s for them the same as `GET /users/:id` does today; this caveat never
  surfaces for a reachable card.
- No index on `ContactMessage.email` — acceptable at current inbox volume (hundreds, not
  hundreds of thousands, of rows); flagged in Risks as a future add-an-index item if the inbox
  grows.

This is a deliberate, temporary trade-off: it delivers the feature today on the existing schema,
and is forward-compatible with TASK-256 later swapping this query for a real `userId` join
without changing the response shape.

### LTV — deliberately mirrors the dashboard's revenue definition, not the order list's

`ltv` is computed as `prisma.order.aggregate({ _sum: { total: true }, where: { userId,
paymentStatus: 'PAID' } })`, with **no `deletedAt: null` filter** — an exact mirror of
`DashboardRepository.getTotalRevenue()` (`dashboard.repository.ts:154-160`). `orderCount` and
`recentOrders`, by contrast, **do** filter `deletedAt: null` (mirroring
`OrderRepository.findByUserId`'s own filter, `order.repository.ts:211-215`, without importing
that file — the filter shape is simply replicated).

This is an intentional inconsistency, not an oversight: a soft-deleted order still represents
money the customer actually paid, and every revenue figure already shown elsewhere in the admin
(dashboard totals, top products) is computed the same deletedAt-agnostic way. Making LTV
deletedAt-agnostic keeps "how much has this customer paid us" consistent with "how much revenue
has this store earned" — summing per-customer LTV across all customers should trend toward the
dashboard's lifetime revenue figure. Filtering `recentOrders`/`orderCount` to non-deleted rows,
meanwhile, keeps the _visible order list_ on the card consistent with what the admin sees when
they click through to `/orders` (which also never shows soft-deleted rows). Documented here so a
future reader isn't confused by the two aggregates using different `where` shapes over the same
table.

### API Contract

| Method | Path                        | Auth         | Response                                                          |
| ------ | --------------------------- | ------------ | ----------------------------------------------------------------- |
| GET    | `/api/users/:id/admin-card` | `AdminGuard` | `{ data: UserAdminCardEntity }` (`UserAdminCardResponseEnvelope`) |

`UserAdminCardEntity` payload shape:

```ts
class UserAdminCardEntity {
  user: UserEntity; // existing entity, reused verbatim
  ltv: number; // SUM(Order.total) WHERE userId, paymentStatus=PAID
  orderCount: number; // COUNT(Order) WHERE userId, deletedAt: null
  recentOrders: CustomerCardOrderEntity[]; // newest first, capped
  reviews: CustomerCardReviewEntity[]; // newest first, capped
  redeemedCoupons: CustomerCardCouponEntity[]; // newest first, capped
  contactMessages: CustomerCardContactMessageEntity[]; // newest first, capped, matched by email
}

class CustomerCardOrderEntity {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  createdAt: Date;
}

class CustomerCardReviewEntity {
  id: string;
  productId: string;
  productName: string; // joined, avoids a second admin round-trip to resolve product names
  rating: number;
  comment: string | null;
  isActive: boolean; // moderation state — pending vs approved
  createdAt: Date;
}

class CustomerCardCouponEntity {
  id: string; // DiscountRedemption id
  code: string; // joined from Discount
  type: DiscountType; // joined from Discount
  value: number; // joined from Discount
  orderId: string;
  redeemedAt: Date; // DiscountRedemption.createdAt
}

class CustomerCardContactMessageEntity {
  id: string;
  topic: string | null;
  message: string;
  status: ContactMessageStatus;
  createdAt: Date;
}
```

`GET /api/users/:id` (existing `findById`) is left completely unchanged — the new endpoint is
additive, a separate route (`:id/admin-card`), not a modification of the existing one. This
matters because `useUserControllerFindById` is used elsewhere too (e.g. any future non-card
consumer); only `UserDetailView` switches to the new hook.

### Backend (NestJS — Clean Architecture)

#### New file: `user/user-admin-card.types.ts`

Mirrors `dashboard.types.ts`'s role exactly — plain TypeScript interfaces (no decorators) plus
the list-size constants, kept separate from the Swagger-decorated entities:

```ts
export const CUSTOMER_CARD_RECENT_ORDERS_LIMIT = 10;
export const CUSTOMER_CARD_REVIEWS_LIMIT = 20;
export const CUSTOMER_CARD_COUPONS_LIMIT = 20;
export const CUSTOMER_CARD_MESSAGES_LIMIT = 20;

export interface AdminCardOrderRow {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: Prisma.Decimal;
  createdAt: Date;
}

export interface AdminCardReviewRow {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  comment: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface AdminCardCouponRow {
  id: string;
  code: string;
  type: DiscountType;
  value: Prisma.Decimal;
  orderId: string;
  redeemedAt: Date;
}
```

(`ContactMessage` rows are returned as the plain Prisma model — no extra join needed.)

#### `UserRepository` — new methods (`user.repository.ts`)

All six added alongside the existing `findById`/`findAll`/etc., each a single Prisma call, no
raw SQL needed (unlike the dashboard's time-series methods):

- `getLtv(userId): Promise<number>` —
  `prisma.order.aggregate({ _sum: { total: true }, where: { userId, paymentStatus: 'PAID' } })`,
  `Number(result._sum.total ?? 0)`. Mirrors `DashboardRepository.getTotalRevenue`.
- `getOrderCount(userId): Promise<number>` —
  `prisma.order.count({ where: { userId, deletedAt: null } })`.
- `getRecentOrders(userId, limit): Promise<AdminCardOrderRow[]>` —
  `prisma.order.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'desc' },
take: limit, select: { id, status, paymentStatus, total, createdAt } })`.
- `getReviewsByUserId(userId, limit): Promise<AdminCardReviewRow[]>` —
  `prisma.review.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit,
include: { product: { select: { name: true } } } })`, flattened to `AdminCardReviewRow` (the
  same "no second lookup" join shape `ReviewRepository.findForModeration` already uses for its
  own admin-facing rows, `review.repository.ts:141-144` — replicated here, not imported).
- `getRedeemedCoupons(userId, limit): Promise<AdminCardCouponRow[]>` —
  `prisma.discountRedemption.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take:
limit, include: { discount: { select: { code: true, type: true, value: true } } } })`,
  flattened.
- `getContactMessagesByEmail(email, limit): Promise<ContactMessage[]>` —
  `prisma.contactMessage.findMany({ where: { email }, orderBy: { createdAt: 'desc' }, take:
limit })`.

No method here touches `order.repository.ts`, `review.repository.ts`, `discount.repository.ts`,
or `contact.repository.ts` — every one is a fresh Prisma call from inside `UserRepository`.

#### `UserService.getAdminCard(id)` (`user.service.ts`)

```ts
async getAdminCard(id: string): Promise<UserAdminCardEntity> {
  const user = await this.userRepository.findById(id);
  if (!user) {
    throw new NotFoundException('User not found');
  }

  const [ltv, orderCount, recentOrders, reviews, redeemedCoupons, contactMessages] =
    await Promise.all([
      this.userRepository.getLtv(id),
      this.userRepository.getOrderCount(id),
      this.userRepository.getRecentOrders(id, CUSTOMER_CARD_RECENT_ORDERS_LIMIT),
      this.userRepository.getReviewsByUserId(id, CUSTOMER_CARD_REVIEWS_LIMIT),
      this.userRepository.getRedeemedCoupons(id, CUSTOMER_CARD_COUPONS_LIMIT),
      this.userRepository.getContactMessagesByEmail(user.email, CUSTOMER_CARD_MESSAGES_LIMIT),
    ]);

  return UserAdminCardEntity.fromParts(user, {
    ltv, orderCount, recentOrders, reviews, redeemedCoupons, contactMessages,
  });
}
```

The single `findById` before the `Promise.all` is unavoidable (the contact-message read needs
`user.email`, and a 404 must be raised before doing any other work) — but it is one lookup, not a
chain of _dependent_ aggregate queries; everything after it runs as one parallel batch, exactly
matching `DashboardRepository.getSummary()`'s "no waterfall" shape.

#### `UserController` — new route (`user.controller.ts`)

```ts
@Get(':id/admin-card')
@UseGuards(AdminGuard)
@ApiBearerAuth('access-token')
@ApiOperation({
  summary: 'Get enriched customer card (LTV, orders, reviews, coupons, contact messages)',
  operationId: 'getUserAdminCard',
})
@ApiParam({ name: 'id', description: 'User UUID' })
@ApiResponse({ status: 200, description: 'Customer card retrieved', type: UserAdminCardResponseEnvelope })
@ApiResponse({ status: 404, description: 'User not found' })
@ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
async getAdminCard(@Param('id') id: string): Promise<UserAdminCardResponse> {
  const card = await this.userService.getAdminCard(id);
  return { data: card };
}
```

The explicit `operationId: 'getUserAdminCard'` matters for Orval hook naming — the project's
existing convention (confirmed via the `deleteUser` endpoint, the only other explicit
`operationId` in this controller) is that an explicit `operationId` produces a hook named
`use<PascalCase(operationId)>` (`useDeleteUser`), overriding Orval's default
`use<Controller><Method>` naming (`useUserControllerFindById` etc., derived from NestJS's
auto-generated operation ids when none is set). Setting it here yields a clean, predictable
`useGetUserAdminCard` hook name.

`UserAdminCardEntity`, `UserAdminCardResponseEnvelope`, and the four row entities are added to
the controller's `@ApiExtraModels(...)` list so Orval resolves every referenced model.

#### `user.module.ts`

**No changes.** See "Module wiring decision" above.

### Frontend (Next.js — FSD)

#### entities/user

- `apps/store-admin/src/entities/user/index.ts` re-exports the new generated
  `useGetUserAdminCard` hook and the `UserAdminCardEntity` / `CustomerCardOrderEntity` /
  `CustomerCardReviewEntity` / `CustomerCardCouponEntity` / `CustomerCardContactMessageEntity`
  types, alongside the existing re-exports (no removals — `useUserControllerFindById` may still
  be used by future non-card consumers).

#### widgets/user-detail

- `UserDetailView.tsx` — replace the `useUserControllerFindById(userId)` call with
  `useGetUserAdminCard(userId)`; `data?.data.user` replaces the old `data?.data` for every
  existing profile field (email, name, role badge, active badge, ban toggle, metadata sidebar —
  the 404 → redirect-to-list `useEffect` logic is unchanged, just reading from the new shape).
  New sections appended to the main column:
  - **Stat row** (LTV + order count) — two compact stat cells (reuse the existing
    `docs/design-system.md` card conventions; no new shared primitive needed, plain `<dl>`/`<div>`
    matching this file's existing `DetailField` style, or two small `StatCard`-shaped `<div>`s —
    build agent's call on the exact markup, keep it consistent with the rest of the page rather
    than importing the dashboard's `StatCard`).
  - **Recent orders** — table mirroring `DashboardLastOrdersTable`'s column set (id truncated
    mono, status badge via `orderStatusBadgeVariant`/`orderStatusLabel` from `@/entities/order`,
    total via `formatCurrency`, date via the file's existing `dateFormatter`), each row linking to
    `/orders/${order.id}`. A header-level "Переглянути всі" link to `/orders?userId=${user.id}`
    (the existing admin order-list `userId` filter, `admin-order-list-query.dto.ts:65` —
    unaffected by this plan since it's read-only navigation, not a new fetch) covers anything
    beyond the `CUSTOMER_CARD_RECENT_ORDERS_LIMIT` cap. Empty state: a plain "немає замовлень"
    row.
  - **Reviews** — a simple list (rating, comment, product name as a link to
    `/products/{productId}` if such an admin route exists / otherwise plain text, moderation-state
    badge for `isActive`, relative/absolute date). Empty state: "немає відгуків".
  - **Redeemed coupons** — a simple list (code, type/value formatted, linked order id, redemption
    date). Empty state: "немає використаних купонів".
  - **Contact messages** — a simple list (topic or "Без теми", truncated message preview, status,
    date); no status-badge component exists yet for `ContactMessageStatus` (TASK-256 will build
    proper inbox-status UI) — a plain text label is enough here. Empty state: "звернень немає".
- `UserDetailSkeleton.tsx` — extended with skeleton blocks for the four new sections (stat row +
  three/four list placeholders), matching the new layout's approximate height so there's no
  layout jump on load.

#### app (pages)

- No new routes — `/users/[id]/page.tsx` (wherever it currently lives) keeps rendering
  `UserDetailView`; no changes needed there.

#### dict additions (`apps/store-admin/src/shared/config/dictionary.ts`, `users` section)

```
cardLtv: "Сума покупок (LTV)"
cardOrderCount: "Кількість замовлень"
cardRecentOrders: "Останні замовлення"
cardViewAllOrders: "Переглянути всі"
cardNoOrders: "Замовлень ще немає."
cardReviews: "Відгуки"
cardNoReviews: "Відгуків ще немає."
cardReviewPending: "На модерації"
cardReviewApproved: "Опубліковано"
cardCoupons: "Використані купони"
cardNoCoupons: "Купони ще не використовувались."
cardMessages: "Звернення (за email)"
cardNoMessages: "Звернень ще немає."
cardMessageNoTopic: "Без теми"
```

## Tasks

### TASK-252-A: `UserRepository` enriched read queries

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No (pure Prisma pass-through reads, no arithmetic/business-rule branching to
Red→Green→Refactor — same classification as TASK-249-B's repository wiring) — still fully
unit-tested per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] New `apps/store-api/src/user/user-admin-card.types.ts` exports the four constants
      (`CUSTOMER_CARD_RECENT_ORDERS_LIMIT=10`, `CUSTOMER_CARD_REVIEWS_LIMIT=20`,
      `CUSTOMER_CARD_COUPONS_LIMIT=20`, `CUSTOMER_CARD_MESSAGES_LIMIT=20`) and the
      `AdminCardOrderRow` / `AdminCardReviewRow` / `AdminCardCouponRow` interfaces exactly as
      specified in Technical Design.
- [ ] `UserRepository` gains `getLtv`, `getOrderCount`, `getRecentOrders`, `getReviewsByUserId`,
      `getRedeemedCoupons`, `getContactMessagesByEmail` exactly as specified — each a single,
      independent Prisma call querying `prisma.order` / `prisma.review` /
      `prisma.discountRedemption` / `prisma.contactMessage` directly.
- [ ] `getLtv` has **no** `deletedAt` filter (mirrors `DashboardRepository.getTotalRevenue`);
      `getOrderCount` and `getRecentOrders` **do** filter `deletedAt: null` — both asserted by
      dedicated unit tests (guards the intentional asymmetry documented in Technical Design).
- [ ] **No import of anything from `apps/store-api/src/order/`** — grep-verifiable; this is the
      hard constraint from the Overview.
- [ ] **No changes to** `review.repository.ts`, `discount.repository.ts`, `contact.repository.ts`,
      or any file under `apps/store-api/src/review/`, `discount/`, `contact/`, `order/`.
- [ ] Unit tests (mirroring `user.repository.spec.ts`'s existing mocked-Prisma style) for all six
      methods: each asserts the exact `where`/`select`/`include`/`orderBy`/`take` shape passed to
      the mocked Prisma client; `getLtv` asserts `Number(0)` fallback when `_sum.total` is `null`.
- [ ] `npm run typecheck`/`lint` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- user.repository`.

**Files to create/modify:**

- `apps/store-api/src/user/user-admin-card.types.ts` — new
- `apps/store-api/src/user/user.repository.ts` — six new methods
- `apps/store-api/src/user/user.repository.spec.ts` — new test cases

---

### TASK-252-B: `UserAdminCardEntity` + `UserService.getAdminCard`

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-252-A

**Acceptance Criteria:**

- [ ] New `apps/store-api/src/user/entities/user-admin-card.entity.ts` exports
      `UserAdminCardEntity` + `CustomerCardOrderEntity` + `CustomerCardReviewEntity` +
      `CustomerCardCouponEntity` + `CustomerCardContactMessageEntity`, each fully `@ApiProperty`
      decorated, exactly matching the API Contract shape. `UserAdminCardEntity` exposes a static
      `fromParts(user, parts)` factory (mirrors `UserEntity.fromPrisma`'s static-factory
      convention) mapping the six raw repository results (plus the already-mapped `UserEntity`)
      into the decorated shape — `Prisma.Decimal` fields (`total`, `value`) converted to `number`
      via `Number(...)`.
- [ ] `apps/store-api/src/user/entities/index.ts` re-exports the five new entities.
- [ ] `UserService.getAdminCard(id: string): Promise<UserAdminCardEntity>` implemented exactly as
      specified in Technical Design: one `findById` (throws `NotFoundException` if absent) then a
      single `Promise.all` of the six enrichment reads.
- [ ] Unit test asserts the 404 path (repository returns `null` → `NotFoundException` before any
      of the six enrichment methods are called — i.e. they are asserted as `not.toHaveBeenCalled()`
      in that branch, proving no wasted parallel work on a 404).
- [ ] Unit test asserts the happy path calls all six enrichment repository methods with the
      correct `userId`/`email`/limit arguments and assembles them into the returned entity
      unchanged (field-for-field).
- [ ] Unit test asserts the six enrichment calls are **not sequentially awaited** — e.g. by having
      each mock return a differently-delayed `Promise` (via `jest.fn().mockImplementation(() =>
    new Promise(...))` with staggered `setTimeout`/microtask ordering, or more simply by
      asserting via `Promise.all` call-order semantics that all six mocks are invoked
      synchronously within the same tick, before any of them resolves) — this is the concrete,
      testable expression of the "no waterfall" requirement.
- [ ] `npm run typecheck`/`lint` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- user.service`.

**Files to create/modify:**

- `apps/store-api/src/user/entities/user-admin-card.entity.ts` — new
- `apps/store-api/src/user/entities/index.ts` — export additions
- `apps/store-api/src/user/user.service.ts` — new `getAdminCard` method
- `apps/store-api/src/user/user.service.spec.ts` — new test cases

---

### TASK-252-C: Controller route + Swagger contract + e2e

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-252-B

**Acceptance Criteria:**

- [ ] `GET /api/users/:id/admin-card` added to `UserController` exactly as specified in Technical
      Design (`AdminGuard`, explicit `operationId: 'getUserAdminCard'`, `@ApiParam`,
      `@ApiResponse` 200/404/403).
- [ ] `UserAdminCardResponseEnvelope` (new envelope class, mirrors the existing
      `UserResponseEnvelope` shape) added; both it and the five entities from TASK-252-B are added
      to the controller's `@ApiExtraModels(...)` list.
- [ ] `test/user.e2e-spec.ts` extended: `userRepositoryMock` gains the six new methods (mocked to
      return fixture data); new `describe('GET /users/:id/admin-card')` block asserts — - 200 with a fully-shaped body (`user`, `ltv`, `orderCount`, `recentOrders`, `reviews`,
      `redeemedCoupons`, `contactMessages` all present with the right primitive types). - 404 when the mocked `findById` resolves `null`. - 403 for a non-admin JWT (mirrors the existing pattern already used for the other
      `AdminGuard` routes in this spec file).
- [ ] `npm run typecheck`/`lint`/`build` clean for store-api.
- [ ] Tests pass: `npm run test:e2e -w apps/store-api -- user.e2e-spec` (run alongside the full
      `npm run test:e2e -w apps/store-api --runInBand` per the store-api e2e-serial note).

**Files to create/modify:**

- `apps/store-api/src/user/user.controller.ts` — new route + envelope class + `@ApiExtraModels`
- `apps/store-api/test/user.e2e-spec.ts` — mock additions + new describe block

---

### TASK-252-D: Orval regen (this worktree's own spec)

**Type:** chore
**Scope:** store-admin
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-252-C

**Acceptance Criteria:**

- [ ] `npm run generate:api` (or the store-admin equivalent script, run from this worktree, against
      this branch's own `swagger:export` output) regenerates `apps/store-admin/src/shared/api/generated/**`,
      producing a `useGetUserAdminCard` hook plus the `UserAdminCardEntity` /
      `CustomerCardOrderEntity` / `CustomerCardReviewEntity` / `CustomerCardCouponEntity` /
      `CustomerCardContactMessageEntity` / `UserAdminCardResponseEnvelope` models.
- [ ] Generated files are not hand-edited (PreToolUse hook already blocks this).
- [ ] `apps/store-admin/src/entities/user/index.ts` re-exports the new hook + all five new types
      alongside the existing re-exports.
- [ ] `npm run typecheck -w apps/store-admin` clean.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/**` — regenerated (Orval)
- `apps/store-admin/src/entities/user/index.ts` — new re-exports

---

### TASK-252-E: Customer-card sections in `UserDetailView`

**Type:** feat
**Scope:** store-admin
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-252-D

**Acceptance Criteria:**

- [ ] `UserDetailView.tsx` fetches via `useGetUserAdminCard(userId)` exclusively — the old
      `useUserControllerFindById` call is removed from this file (every existing profile field —
      email, name, role/active badges, ban toggle, metadata sidebar — reads from `data.data.user`
      instead of `data.data`, with **no visual regression** to the existing profile section).
      404-redirect-to-list behavior unchanged.
- [ ] New **stat row** rendering `ltv` (via `formatCurrency`) and `orderCount`, with
      `dict.users.cardLtv`/`cardOrderCount` labels.
- [ ] New **recent orders** table/list per Technical Design: status badge via
      `orderStatusBadgeVariant`/`orderStatusLabel` (`@/entities/order`), `formatCurrency` for
      total, existing `dateFormatter` for date, each row linking to `/orders/${id}`; a
      `dict.users.cardViewAllOrders` link to `/orders?userId=${user.id}`; empty state
      `dict.users.cardNoOrders`.
- [ ] New **reviews** list: rating, comment, moderation badge (`cardReviewPending` /
      `cardReviewApproved` based on `isActive`), product name; empty state `dict.users.cardNoReviews`.
- [ ] New **redeemed coupons** list: code, type/value, linked order id; empty state
      `dict.users.cardNoCoupons`.
- [ ] New **contact messages** list: topic (or `cardMessageNoTopic`), message preview, status,
      date; empty state `dict.users.cardNoMessages`.
- [ ] `UserDetailSkeleton.tsx` extended with placeholder blocks for all four new sections plus the
      stat row, sized to approximate the loaded layout's height.
- [ ] `apps/store-admin/src/shared/config/dictionary.ts` — all new keys under `users` from
      Technical Design added.
- [ ] New/updated RTL tests (MSW, following this app's `renderWithProviders` + `server.use(http.get(...))`
      convention) for `UserDetailView`: mocks a full `useGetUserAdminCard` response and asserts
      every new section renders its data; asserts each empty-state copy when the mocked sub-arrays
      are empty; asserts the existing profile-section assertions (email, ban toggle, badges) still
      pass reading from the new response shape.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- UserDetailView` (per the store-client Jest
      parallel-flake note, fall back to `--runInBand` if the full suite times out under parallel
      load).

**Files to create/modify:**

- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.tsx` — rewritten to consume the new
  hook + new sections
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailSkeleton.tsx` — extended
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.test.tsx` — new/updated (create if
  it does not already exist)
- `apps/store-admin/src/shared/config/dictionary.ts` — new `users.card*` keys

## Migration Steps

1. TASK-252-A (repository reads + unit tests) — no dependencies, can start immediately.
2. TASK-252-B (entity + service assembly + unit tests) — depends on A.
3. TASK-252-C (controller route + Swagger + e2e) — depends on B.
4. TASK-252-D (Orval regen, this worktree only) — depends on C.
5. TASK-252-E (frontend card sections) — depends on D.

## Risks & Mitigations

| Risk                                                                                                                                                                                    | Mitigation                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Review.userId` and `ContactMessage.email` have no dedicated index — a per-customer card open triggers a sequential scan on both tables                                                 | Acceptable at current data volume (dozens–hundreds of reviews/messages per store, not per customer); flagged here as a future add-an-index item if either table grows past a few thousand rows |
| Contact-message email matching breaks if a customer's email changes after they emailed support, or if they emailed before registering (see the matching caveat)                         | Documented as a known, deliberate limitation; forward-compatible with TASK-256 adding a real `userId` FK later, which would swap this one query without changing the response shape            |
| LTV (`deletedAt`-agnostic) and `orderCount`/`recentOrders` (`deletedAt: null`-filtered) use different `where` shapes over the same `Order` table, which could read as a bug at a glance | Explicit Design Decision + inline code comments explaining the asymmetry mirror the dashboard's own established precedent (see Technical Design "LTV" section)                                 |
| Concurrent TASK-251 worktree also extends the OpenAPI spec (different tag) — Orval regen in this worktree only reflects this branch's own changes                                       | See "Post-merge Orval regen note" below — a follow-up regen pass on `develop` after both branches merge reconciles the combined spec                                                           |
| Accidentally importing from `apps/store-api/src/order/` while wiring the recent-orders read, breaking the file-disjoint parallelization contract with TASK-251                          | TASK-252-A's acceptance criteria explicitly require a grep-verifiable "no import from `order/`" check; code review should double-check this before merge                                       |

## Notes

- **Deferred (plan 100 §4.2 "Повна" tier, not in this plan):** admin notes/tags on the customer
  card (`CustomerNote (userId, authorId, text, createdAt)` — a new model, a new migration, and a
  small CRUD slice). Left as a future task once the "мінімум" card here has been in use for a
  while and the owner has feedback on whether notes are actually needed day-to-day.
- **TASK-256** (parked, Wave 5) will add `ContactMessage.status = IN_PROGRESS` and a real
  `userId` FK, plus a reverse link from `/messages` back to the customer card. This plan's
  email-matched contact-messages section is written to be trivially swappable for that FK-based
  join later — the response shape (`CustomerCardContactMessageEntity`) does not need to change,
  only the repository query.
- **Post-merge Orval regen note.** This plan's own worktree runs Orval regen (TASK-252-D) against
  _its own_ branch's OpenAPI spec — this is sufficient for implementing and testing TASK-252-E
  within this worktree. However, TASK-251 (running concurrently in a sibling worktree) _also_
  extends the OpenAPI contract, in the `orders`/order-history tag. Since Orval regenerates the
  entire `generated/` tree from whatever spec it's pointed at, each worktree's local regen only
  ever reflects its own branch's additions — neither branch's generated-file diff "knows about"
  the other's new models/hooks. After **both** TASK-251 and TASK-252 have merged into `develop`,
  a further regen pass should be run once on `develop` (not inside either feature branch) so the
  final `generated/` tree reflects the full, combined spec. This is a small follow-up chore for
  whichever branch merges second (or a standalone `chore(api): regen after 251+252 merge` commit
  on `develop`), not a task either plan needs to carry on its own.
