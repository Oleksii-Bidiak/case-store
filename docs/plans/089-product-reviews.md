# Plan 089 — Product Reviews (TASK-106 + TASK-078)

**Phase:** Phase 4 extension (Admin Panel — moderation) + Tier 4 Commerce feature (storefront write flow + PDP list)
**Roadmap context:** Reviews are a Tier 4 commerce feature. TASK-106 (backend module) is a pure
prerequisite of TASK-078 (storefront + admin UI); they are planned together here and decomposed
into sequential sub-tasks: backend first (TASK-106 scope), then storefront + admin UI (TASK-078
scope). No backend work is needed after TASK-106-C; the frontend consumes Orval-generated hooks
from TASK-106-D.
**Branch:** `feat/078-product-reviews` (branched from `develop`)
**Created:** 2026-06-29
**Status:** To Do
**Agent:** `build` (backend sub-tasks) then `build` (frontend sub-tasks); service logic marked TDD
(use `tdd-agent` or follow **tdd** skill Red → Green → Refactor)

---

## User Story

As a logged-in customer, I want to leave a rating and optional comment on a product I have purchased,
so that other shoppers can make informed decisions. As an admin, I want to review pending submissions
and approve or reject them before they appear on the storefront, so that the published reviews remain
relevant and trustworthy.

---

## Problem Statement

The `Review` Prisma model exists in the schema (`@@map("reviews")`) with `isActive @default(false)`
as the moderation gate, but there is no NestJS module, no controller, no service, and no repository
for it. The storefront PDP has a "Reviews" tab that is explicitly `disabled` in
`apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx`. The admin panel has no
review queue. This plan wires everything up end-to-end without any schema migration.

---

## Investigation Findings

### 1. Review model — no migration needed

`apps/store-api/prisma/schema.prisma` lines 274–290. The model is complete and sufficient for the
MVP. Key fields:

| Field                              | Purpose                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| `id UUID`                          | Primary key                                                       |
| `userId`                           | FK → User (from JWT, never body)                                  |
| `productId`                        | FK → Product                                                      |
| `rating Int`                       | 1–5                                                               |
| `comment String?`                  | Optional text                                                     |
| `isActive Boolean @default(false)` | Moderation gate — false until admin approves                      |
| `@@unique([userId, productId])`    | One review per user per product; maps to Prisma error P2002 → 409 |
| `@@index([productId])`             | Powers the PDP list query                                         |
| `@@index([isActive])`              | Powers the admin moderation queue filter                          |

### 2. ProductRating aggregate already used in product.repository.ts

`apps/store-api/src/product/product.repository.ts` — `getRatingsByProductId` already calls
`prisma.review.groupBy({ where: { isActive: true }, _avg, _count })` to enrich product list cards
with star ratings. The `ProductRating` interface (`ratingAverage: number | null`, `ratingCount:
number`) is already typed. The `ReviewRepository` must **not** duplicate this; it provides its own
`aggregate(productId)` method returning the same shape for the standalone reviews endpoint.

### 3. Verified-purchase check

**Decision: badge approach** (not a hard submission requirement). Any authenticated user may submit
a review. If the user has at least one `OrderItem` linked to this `productId` in any of their
orders, the returned `ReviewEntity` carries `verifiedPurchase: true`.

Query in `ReviewRepository`:

```ts
prisma.orderItem.findFirst({
  where: {
    productId,
    order: { userId },
  },
  select: { id: true },
});
// truthy → verifiedPurchase = true
```

Rationale: restricting submission to verified buyers is a common punitive gate but discourages
legitimate first-impression reviews and is more complex to implement (users must wait for delivery).
A badge is the standard approach used by major e-commerce platforms; it rewards verified buyers
with a trust signal without blocking others.

### 4. Guard names (confirmed from source)

- **Authenticated submission:** `JwtAuthGuard` (`apps/store-api/src/auth/guards/jwt-auth.guard.ts`
  — `AuthGuard('jwt-access')`). User id extracted via `@CurrentUser('id')` decorator
  (`apps/store-api/src/auth/decorators/current-user.decorator.ts`).
- **Admin moderation:** `AdminGuard` (`apps/store-api/src/auth/guards/admin.guard.ts` — extends
  `JwtAuthGuard`, throws 403 when `role !== ADMIN`). Used on all admin endpoints.

### 5. Module registration pattern

`apps/store-api/src/app.module.ts` — imports from the feature module barrel. New `ReviewModule`
follows the same import pattern: add `ReviewModule` to the `imports` array alongside `OrderModule`,
`ProductModule`, etc.

Module structure mirrors `ProductModule`:

```
src/review/
  review.controller.ts         — public + auth routes
  admin-review.controller.ts   — admin-only moderation routes
  review.service.ts            — business logic (TDD)
  review.repository.ts         — Prisma queries only
  review.module.ts             — registers both controllers + providers
  dto/
    create-review.dto.ts
    review-list-query.dto.ts   — public list query (page, limit)
    admin-review-query.dto.ts  — admin filter (status=pending|approved)
  entities/
    review.entity.ts           — ReviewEntity (id, userId, productId, rating, comment,
                                   verifiedPurchase, createdAt)
    review-aggregate.entity.ts — ReviewAggregateEntity (ratingAverage, ratingCount)
  index.ts
```

### 6. Reject = hard delete

**Decision: approve → `isActive = true`; reject → hard delete the row.**

Rationale: the `Review` model has no `rejectedAt`, no `status` enum, and no `deletedAt` field.
Adding a status field would require a migration. For MVP, hard delete is the correct choice:

- The admin queue shows only `isActive = false` rows (pending).
- Approve flips `isActive` to `true` (published).
- Reject deletes the row — the unique slot `(userId, productId)` is freed, so the user may
  re-submit after addressing the issue.
- The admin sees the queue shrink on either action — no ambiguity between "pending" and
  "previously rejected" states.
- If a detailed audit trail becomes necessary later, a `status` enum migration can be added
  without breaking existing data (all approved rows have `isActive = true`; all pending rows
  have `isActive = false`).

### 7. Public product list — slug vs productId on the reviews endpoint

The reviews routes use `:productId` (UUID), not `:slug`. The storefront PDP client component
(`ProductDetailView`) fetches the product by slug first and has the product's UUID available in
`data.id`. Using the UUID avoids a slug-to-id lookup on every reviews fetch. The routes are:

```
POST   /api/products/:productId/reviews   — submit (JwtAuthGuard)
GET    /api/products/:productId/reviews   — public list + aggregate
GET    /api/admin/reviews                 — admin moderation queue (AdminGuard)
PATCH  /api/admin/reviews/:id/approve     — AdminGuard
DELETE /api/admin/reviews/:id             — AdminGuard (reject = hard delete)
```

`ReviewController` uses `@Controller('products/:productId/reviews')`. NestJS supports route params
in the `@Controller()` path prefix; `@Param('productId')` retrieves the value in every handler.
`AdminReviewController` uses `@Controller('admin/reviews')`.

### 8. Storefront PDP — disabled Reviews tab

`apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx` — the "Reviews" tab is
currently `disabled`. TASK-078-A enables it and populates it with the `ProductReviewsWidget`.

### 9. Admin list pattern

The admin reviews moderation queue follows the `AdminOrderTable` pattern:
`apps/store-admin/src/widgets/order-list/ui/admin-order-table.tsx`. It uses:

- `"use client"` component
- `useTableSort` + URL-synced `status` filter (`?status=pending|approved`, default `pending`)
- shadcn `Table` / `Badge` / `Button` from `@/shared/ui`
- `dict.*` for all Ukrainian strings
- Paginated via the generated hook; approve/reject via `useMutation` hooks with `queryClient.invalidateQueries`

### 10. API contract pipeline

Orval configuration already exists for both `store-client` and `store-admin`. After TASK-106-C
(Swagger decorators on both controllers), TASK-106-D runs the generate script to produce hooks in
`apps/store-client/src/shared/api/generated/` and `apps/store-admin/src/shared/api/generated/`.
Generated files are gitignored and must not be hand-edited.

---

## Migration / Schema Impact

**None.** The `Review` model is complete. No `prisma migrate dev` required for this plan.

The only addition worth considering for a future iteration is a `status` enum
(`PENDING | APPROVED | REJECTED`) to distinguish pending from rejected reviews without deleting
rows, but this is explicitly deferred. Reject = hard delete is the MVP choice.

---

## Tasks

### TASK-106-A: ReviewRepository — Prisma queries

**Type:** feat
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** No (repository methods are thin wrappers — the service specs mock them)
**Depends on:** — (schema already exists, PrismaService available globally)

**Acceptance Criteria:**

- [ ] `apps/store-api/src/review/review.repository.ts` created; class decorated `@Injectable()`.
- [ ] `PrismaService` injected (not `PrismaClient` directly) — Clean Architecture rule.
- [ ] Methods implemented:

  | Method                  | Signature                                                | Purpose                                                                            |
  | ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
  | `create`                | `(data: CreateReviewInput) → Promise<Review>`            | Insert review with `isActive: false`                                               |
  | `findApprovedByProduct` | `(productId, page, limit) → Promise<{ reviews, total }>` | `isActive: true` + pagination                                                      |
  | `aggregate`             | `(productId) → Promise<ReviewAggregateData>`             | `groupBy productId isActive:true` → avg + count                                    |
  | `findForModeration`     | `(status, page, limit) → Promise<{ reviews, total }>`    | `isActive: true/false` by `status` param                                           |
  | `findById`              | `(id) → Promise<Review \| null>`                         | Used by approve/reject                                                             |
  | `approve`               | `(id) → Promise<Review>`                                 | `update isActive = true`                                                           |
  | `delete`                | `(id) → Promise<void>`                                   | Hard delete (reject or future soft-delete)                                         |
  | `isVerifiedPurchase`    | `(userId, productId) → Promise<boolean>`                 | `orderItem.findFirst({ where: { productId, order: { userId } } })` — truthy → true |
  | `findExisting`          | `(userId, productId) → Promise<Review \| null>`          | Existence check for 409                                                            |

- [ ] `ReviewRepository` exported from `src/review/index.ts`.
- [ ] `npm run build -w apps/store-api` — compiles clean.

**Files to create/modify:**

- `apps/store-api/src/review/review.repository.ts` — new file
- `apps/store-api/src/review/index.ts` — new barrel export

---

### TASK-106-B: ReviewService + DTOs + Entities (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** L (4–8h)
**TDD Required:** Yes — follow the **tdd** skill (Red → Green → Refactor). Service encapsulates
all business logic: verified-purchase badge, one-per-user 409 guard, moderation gating for
public reads. Write Jest specs first.
**Depends on:** TASK-106-A

**Acceptance Criteria:**

**DTOs (`apps/store-api/src/review/dto/`):**

- [ ] `CreateReviewDto` — `rating: @IsInt() @Min(1) @Max(5)`, `comment: @IsOptional() @IsString()
    @MaxLength(1000)`. User id comes from JWT, never the body.
- [ ] `ReviewListQueryDto` — `page?: @IsOptional() @IsInt() @Min(1)`,
      `limit?: @IsOptional() @IsInt() @Min(1) @Max(50)`.
- [ ] `AdminReviewQueryDto` — `status?: 'pending' | 'approved'` with `@IsOptional() @IsEnum()`
      default `'pending'`, plus `page` / `limit`.

**Entities (`apps/store-api/src/review/entities/`):**

- [ ] `ReviewEntity` — `id`, `userId`, `productId`, `rating`, `comment: string | null`,
      `verifiedPurchase: boolean`, `isActive: boolean`, `createdAt`.
      `@ApiProperty` on every field.
- [ ] `ReviewAggregateEntity` — `ratingAverage: number | null`, `ratingCount: number`.
      `@ApiProperty` on every field.

**ReviewService spec (TDD Red → Green → Refactor):**

- [ ] **Red:** `review.service.spec.ts` has failing tests for:
  - `submitReview(userId, productId, dto)`:
    - If user already has a review for this product → throws `ConflictException` (409).
    - Creates review with `isActive = false`.
    - Returns `ReviewEntity` with `verifiedPurchase = true` if `isVerifiedPurchase` returns true.
    - Returns `ReviewEntity` with `verifiedPurchase = false` if `isVerifiedPurchase` returns false.
  - `getApprovedReviews(productId, query)`:
    - Returns paginated `ReviewEntity[]` with only `isActive = true` reviews.
    - Includes `aggregate` in response shape.
  - `approveReview(id)`:
    - Throws `NotFoundException` when id not found.
    - Calls `repository.approve(id)` and returns `ReviewEntity`.
  - `rejectReview(id)`:
    - Throws `NotFoundException` when id not found.
    - Calls `repository.delete(id)` and returns void.

- [ ] **Green:** `review.service.ts` written to make all specs pass with mocked repository.
- [ ] **Refactor:** JSDoc comments, clear variable names; all specs still green.

**Files to create/modify:**

- `apps/store-api/src/review/dto/create-review.dto.ts`
- `apps/store-api/src/review/dto/review-list-query.dto.ts`
- `apps/store-api/src/review/dto/admin-review-query.dto.ts`
- `apps/store-api/src/review/dto/index.ts`
- `apps/store-api/src/review/entities/review.entity.ts`
- `apps/store-api/src/review/entities/review-aggregate.entity.ts`
- `apps/store-api/src/review/entities/index.ts`
- `apps/store-api/src/review/review.service.ts`
- `apps/store-api/src/review/review.service.spec.ts`

---

### TASK-106-C: Controllers + Swagger decorators + ReviewModule + e2e

**Type:** feat
**Scope:** store-api
**Complexity:** M (2–4h)
**TDD Required:** No (e2e covers controller surface)
**Depends on:** TASK-106-B

**Acceptance Criteria:**

**`ReviewController` (`@Controller('products/:productId/reviews')`):**

- [ ] `POST /` (`@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth('access-token')`) — calls
      `reviewService.submitReview(@CurrentUser('id'), @Param('productId'), @Body() dto)`.
      Returns `{ data: ReviewEntity }`, HTTP 201.
- [ ] `GET /` (public, no guard) — calls `reviewService.getApprovedReviews(productId, query)`.
      Returns `{ data: ReviewEntity[], aggregate: ReviewAggregateEntity, meta: PaginationMeta }`.

**`AdminReviewController` (`@Controller('admin/reviews')`):**

- [ ] `GET /` (`@UseGuards(AdminGuard)`) — calls `reviewService.getReviewsForModeration(query)`.
      Returns `{ data: AdminReviewEntity[], meta: PaginationMeta }` where `AdminReviewEntity`
      extends `ReviewEntity` with `userEmail: string` and `productName: string` (needed for the
      admin table). `@ApiQuery` for `status`, `page`, `limit`.
- [ ] `PATCH /:id/approve` (`@UseGuards(AdminGuard)`) — calls `reviewService.approveReview(id)`.
      Returns `{ data: ReviewEntity }`, HTTP 200.
- [ ] `DELETE /:id` (`@UseGuards(AdminGuard)`, `@HttpCode(HttpStatus.NO_CONTENT)`) — calls
      `reviewService.rejectReview(id)`. Returns 204 No Content.

**Swagger (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiParam` on every handler).**

**`ReviewModule`:**

- [ ] `review.module.ts` — `controllers: [ReviewController, AdminReviewController]`,
      `providers: [ReviewRepository, ReviewService]`. No exports needed (service is consumed
      internally).
- [ ] Added to `apps/store-api/src/app.module.ts` `imports` array.

**e2e (`apps/store-api/test/review.e2e-spec.ts`):**

- [ ] Mocked `ReviewRepository`, `AuthRepository`, `UserRepository`, `PrismaService`
      (same pattern as `product.e2e-spec.ts`).
- [ ] Tests (minimum):
  - `POST /api/products/:productId/reviews` — 401 without token.
  - `POST /api/products/:productId/reviews` — 201 with valid auth token + valid body.
  - `POST /api/products/:productId/reviews` — 400 for `rating` out of range.
  - `POST /api/products/:productId/reviews` — 409 when review already exists (P2002 mapped).
  - `GET /api/products/:productId/reviews` — 200 public, returns `{ data, aggregate, meta }`.
  - `GET /api/admin/reviews` — 401 without token, 403 as CUSTOMER.
  - `GET /api/admin/reviews` — 200 as ADMIN, returns paginated list.
  - `PATCH /api/admin/reviews/:id/approve` — 200 as ADMIN; 404 on unknown id.
  - `DELETE /api/admin/reviews/:id` — 204 as ADMIN; 404 on unknown id.

**Files to create/modify:**

- `apps/store-api/src/review/review.controller.ts`
- `apps/store-api/src/review/admin-review.controller.ts`
- `apps/store-api/src/review/review.module.ts`
- `apps/store-api/src/app.module.ts` — add `ReviewModule` import
- `apps/store-api/test/review.e2e-spec.ts`
- `apps/store-api/src/review/index.ts` — update barrel

---

### TASK-106-D: Orval regen — store-client + store-admin

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-106-C (Swagger spec must be stable before generating)

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` — exports the updated OpenAPI JSON (or the
      equivalent configured Swagger export script).
- [ ] `npm run generate:api -w apps/store-client` — regenerates hooks in
      `apps/store-client/src/shared/api/generated/`. New files: hooks for `reviews/reviews.ts`
      and models for `ReviewEntity`, `ReviewAggregateEntity`, `CreateReviewDto`.
- [ ] `npm run generate:api -w apps/store-admin` — regenerates hooks in
      `apps/store-admin/src/shared/api/generated/`. New files: hooks for `reviews/reviews.ts`
      and `admin-reviews/admin-reviews.ts` (or similar, following Orval tag grouping from
      `@ApiTags`), plus `AdminReviewEntity`.
- [ ] Generated files are NOT committed to git (they are gitignored per project convention).
- [ ] `npm run typecheck -w apps/store-client` — clean.
- [ ] `npm run typecheck -w apps/store-admin` — clean.

**Files to create/modify (generated — do not hand-edit):**

- `apps/store-client/src/shared/api/generated/reviews/` — new directory
- `apps/store-admin/src/shared/api/generated/reviews/` — new directory
- `apps/store-admin/src/shared/api/generated/admin-reviews/` — new directory (or similar)

---

### TASK-078-A: Storefront — `entities/review` barrel + `ProductReviewsWidget` on PDP

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4h)
**TDD Required:** No (RTL assertion on render behaviour)
**Depends on:** TASK-106-D

**Acceptance Criteria:**

**`entities/review` FSD barrel (`apps/store-client/src/entities/review/index.ts`):**

- [ ] Re-exports generated types (`ReviewEntity`, `ReviewAggregateEntity`) and the
      read-only query hook (e.g. `useReviewControllerGetProductReviews` or the Orval-generated
      name) from `@/shared/api/generated`.
- [ ] Follows the same pattern as `apps/store-client/src/entities/product/index.ts` and
      `apps/store-client/src/entities/order/index.ts`.
- [ ] Added to `apps/store-client/src/entities/index.ts` barrel.

**`ProductReviewsWidget` (`apps/store-client/src/widgets/product-reviews/`):**

- [ ] `ui/product-reviews-widget.tsx` — `"use client"` component. Props: `{ productId: string }`.
- [ ] Calls the entity hook; shows:
  - Aggregate stars strip at top: `RatingStars` (already in `shared/ui`) + average (e.g.
    "4.3 / 5") + review count (e.g. "12 відгуків").
  - List of individual reviews: star rating, comment (or `dict.reviews.noComment`), author
    first name (truncated, e.g. "Олексій К."), "Підтверджена покупка" badge when
    `verifiedPurchase === true`, formatted date.
  - Empty state when no approved reviews: `dict.reviews.empty`.
  - Loading skeleton: 3 placeholder rows.
- [ ] All strings Ukrainian via `apps/store-client/src/shared/config/dictionary.ts` under a new
      `reviews:` block. New keys include: `reviews.title`, `reviews.empty`, `reviews.noComment`,
      `reviews.verifiedPurchase`, `reviews.ratingCount(n)`, `reviews.outOf`, etc.
- [ ] `index.ts` barrel exports `ProductReviewsWidget`.

**`ProductSpecsTabs` — enable Reviews tab:**

- [ ] `apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx` — remove the
      `disabled` prop from the Reviews `<TabsTrigger>`.
- [ ] Pass `productId: string` prop to `ProductSpecsTabs`.
- [ ] Render `<ProductReviewsWidget productId={productId} />` inside the Reviews `<TabsContent>`.
- [ ] `ProductDetailView` passes `data.id` as `productId` to `ProductSpecsTabs`.

**RTL test (`apps/store-client/src/widgets/product-reviews/ui/product-reviews-widget.test.tsx`):**

- [ ] MSW handler for `GET /api/products/:productId/reviews` returning a mock list.
- [ ] Test: aggregate stars and review count render.
- [ ] Test: "Підтверджена покупка" badge appears when `verifiedPurchase: true`.
- [ ] Test: empty-state string renders when `data: []`.

**Files to create/modify:**

- `apps/store-client/src/entities/review/index.ts` — new FSD entity barrel
- `apps/store-client/src/entities/index.ts` — add review export
- `apps/store-client/src/widgets/product-reviews/index.ts` — new barrel
- `apps/store-client/src/widgets/product-reviews/ui/product-reviews-widget.tsx` — new widget
- `apps/store-client/src/widgets/product-reviews/ui/product-reviews-widget.test.tsx` — RTL tests
- `apps/store-client/src/widgets/index.ts` — add `ProductReviewsWidget` export
- `apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx` — enable tab +
  render widget
- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — pass `data.id`
  to `ProductSpecsTabs`
- `apps/store-client/src/shared/config/dictionary.ts` — add `reviews:` block

---

### TASK-078-B: Storefront — `submit-review` feature (RHF + zod, auth-gated)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4h)
**TDD Required:** No (RTL assertion)
**Depends on:** TASK-078-A

**Acceptance Criteria:**

**`features/submit-review` FSD slice (`apps/store-client/src/features/submit-review/`):**

- [ ] `model/review-schema.ts` — zod schema: `{ rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional() }`.
- [ ] `ui/submit-review-form.tsx` — `"use client"` component. Props: `{ productId: string }`.
  - Uses `useSession()` (from `entities/session`) to check auth state.
  - If **not authenticated**: renders a `dict.reviews.loginToReview` message with a
    `/login` link (no form shown).
  - If **authenticated**: RHF `useForm` with zod resolver; `values` seeded from nothing
    (new form); `reset()` keyed to `productId` on mount so navigating between products
    clears the form (forms.md Rule 2b).
  - Star-rating input: 5 interactive star buttons (accessible, keyboard-navigable).
  - Optional comment `<Textarea>`.
  - Submit button: shows spinner during mutation; disabled while submitting.
  - On success: show `dict.reviews.submitSuccess` toast + reset form.
  - On 409 (already reviewed): show `dict.reviews.alreadyReviewed` message.
  - On error: show `dict.reviews.submitError` toast.
- [ ] Calls the Orval-generated mutation hook for `POST /api/products/:productId/reviews`.
      On success, invalidates the reviews list query key for `productId`.
- [ ] `index.ts` barrel exports `SubmitReviewForm`.

**Wire into `ProductReviewsWidget`:**

- [ ] `ProductReviewsWidget` renders `<SubmitReviewForm productId={productId} />` below the
      reviews list (or in a "Залишити відгук" collapsible section, at implementer's discretion).

**New dictionary keys** (under `reviews:`):

- [ ] `reviews.loginToReview`, `reviews.submitReview`, `reviews.submitSuccess`,
      `reviews.submitError`, `reviews.alreadyReviewed`, `reviews.ratingRequired`,
      `reviews.commentLabel`, `reviews.commentPlaceholder`.

**RTL test (`apps/store-client/src/features/submit-review/ui/submit-review-form.test.tsx`):**

- [ ] Unauthenticated: "login to review" message + `/login` link; form not visible.
- [ ] Authenticated: form renders; submit with rating = 4 calls the mutation.
- [ ] 409 response: `alreadyReviewed` message appears.

**Files to create/modify:**

- `apps/store-client/src/features/submit-review/model/review-schema.ts`
- `apps/store-client/src/features/submit-review/ui/submit-review-form.tsx`
- `apps/store-client/src/features/submit-review/ui/submit-review-form.test.tsx`
- `apps/store-client/src/features/submit-review/index.ts`
- `apps/store-client/src/features/index.ts` — add export
- `apps/store-client/src/widgets/product-reviews/ui/product-reviews-widget.tsx` — wire form
- `apps/store-client/src/shared/config/dictionary.ts` — add submit-related keys

---

### TASK-078-C: Admin — review moderation queue widget + page + dictionary

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2–4h)
**TDD Required:** No (RTL assertion)
**Depends on:** TASK-106-D

**Acceptance Criteria:**

**`entities/review` FSD barrel (`apps/store-admin/src/entities/review/index.ts`):**

- [ ] Re-exports generated types (`AdminReviewEntity`, `ReviewAggregateEntity`) and the
      admin query/mutation hooks from `@/shared/api/generated`.

**`AdminReviewTable` widget (`apps/store-admin/src/widgets/review-moderation/`):**

- [ ] `ui/admin-review-table.tsx` — `"use client"`. Mirrors `AdminOrderTable`:
  - URL-synced `?status=pending|approved` filter (default `pending`) via `useSearchParams` +
    `router.replace`.
  - URL-synced `?page=` pagination.
  - shadcn `Table` columns: Product name, Author (first name or email prefix), Rating (stars),
    Comment (truncated to 80 chars), Submitted date, Actions (Approve / Reject buttons when
    `status=pending`; no actions when `status=approved`).
  - Approve: calls `PATCH /api/admin/reviews/:id/approve`; invalidates the reviews query.
  - Reject: calls `DELETE /api/admin/reviews/:id`; invalidates the reviews query.
  - Both actions show a `Loader2` spinner and are disabled during mutation.
  - `isFetching` overlay (same `Loader2` + semi-transparent div pattern as `AdminOrderTable`).
  - Status filter `<Select>` with `dict.reviews.filterPending` and `dict.reviews.filterApproved`.
  - Empty state: `dict.reviews.emptyQueue` when no rows.
- [ ] `ui/admin-review-table-skeleton.tsx` — skeleton placeholder (3 rows).
- [ ] `index.ts` barrel.

**Admin route and page:**

- [ ] `apps/store-admin/src/app/(dashboard)/reviews/page.tsx` — server component, imports
      `AdminReviewTable`; uses `dict.reviews.heading` for the page `<h2>`.
      Metadata: `title: dict.reviews.metaTitle`.
- [ ] `apps/store-admin/src/app/(dashboard)/reviews/loading.tsx` — renders
      `<AdminReviewTableSkeleton />`.
- [ ] Add `reviews` entry to the sidebar nav (`dict.nav.reviews` = "Відгуки").

**Dictionary keys** (under `reviews:` in
`apps/store-admin/src/shared/config/dictionary.ts`):

- [ ] `reviews.metaTitle`, `reviews.heading`, `reviews.filterPending`,
      `reviews.filterApproved`, `reviews.colProduct`, `reviews.colAuthor`,
      `reviews.colRating`, `reviews.colComment`, `reviews.colDate`,
      `reviews.approve`, `reviews.reject`, `reviews.emptyQueue`,
      `reviews.approveSuccess`, `reviews.rejectSuccess`.
- [ ] `nav.reviews = "Відгуки"` added to `nav:` block.

**RTL test (`apps/store-admin/src/widgets/review-moderation/ui/admin-review-table.test.tsx`):**

- [ ] Mock Orval hook returns 2 pending reviews.
- [ ] Table renders product name, author, rating, truncated comment.
- [ ] Approve button calls the approve mutation hook.
- [ ] Reject button calls the reject (delete) mutation hook.
- [ ] Status filter change updates the URL param.

**Files to create/modify:**

- `apps/store-admin/src/entities/review/index.ts` — new entity barrel
- `apps/store-admin/src/entities/index.ts` — add review export
- `apps/store-admin/src/widgets/review-moderation/index.ts`
- `apps/store-admin/src/widgets/review-moderation/ui/admin-review-table.tsx`
- `apps/store-admin/src/widgets/review-moderation/ui/admin-review-table-skeleton.tsx`
- `apps/store-admin/src/widgets/review-moderation/ui/admin-review-table.test.tsx`
- `apps/store-admin/src/widgets/index.ts` — add exports
- `apps/store-admin/src/app/(dashboard)/reviews/page.tsx`
- `apps/store-admin/src/app/(dashboard)/reviews/loading.tsx`
- `apps/store-admin/src/shared/config/dictionary.ts` — add `reviews:` block + `nav.reviews`
- Admin sidebar nav component — add reviews link

---

### TASK-078-D: Tests + final verification gate

**Type:** test
**Scope:** store-api, store-client, store-admin
**Complexity:** S (1–2h)
**TDD Required:** No
**Depends on:** TASK-078-A, TASK-078-B, TASK-078-C

**Acceptance Criteria:**

- [ ] `npm run test -w apps/store-api` — all unit tests green (new: `review.service.spec.ts`).
- [ ] `npm run test:e2e -w apps/store-api` (or the project's e2e command) — new
      `review.e2e-spec.ts` passes all 9+ test cases.
- [ ] `npm run test -w apps/store-client` — all tests green (new: `product-reviews-widget.test.tsx`,
      `submit-review-form.test.tsx`).
- [ ] `npm run test -w apps/store-admin` — all tests green (new: `admin-review-table.test.tsx`).
- [ ] `npm run typecheck` (root or per workspace) — zero TypeScript errors across all three
      workspaces.
- [ ] `npm run lint` — zero ESLint warnings or errors.
- [ ] `npm run build` — clean build across all workspaces.

**Manual smoke (requires a running stack with real DB and seed data):**

- [ ] Logged-in customer submits a 5-star review → the review does not appear on the PDP (pending).
- [ ] Customer attempts to submit a second review for the same product → 409 toast appears.
- [ ] Admin opens `/reviews` in the admin panel → sees the pending review with product name,
      author, rating, and comment.
- [ ] Admin clicks Approve → review disappears from the `pending` queue; appears in `approved`
      queue; becomes visible on the PDP Reviews tab.
- [ ] Admin clicks Reject on a different pending review → row disappears; the customer can
      re-submit that product's review.
- [ ] Guest user sees the Reviews tab on the PDP with existing approved reviews + a
      "Увійдіть, щоб залишити відгук" prompt.
- [ ] Customer who has ordered the product sees a "Підтверджена покупка" badge on their review.

**Files to create/modify:**

- No new files — this task is a verification checklist; any gaps found are fixed here.

---

## Execution Order

```
TASK-106-A  ReviewRepository
     ↓
TASK-106-B  ReviewService (TDD) + DTOs + Entities
     ↓
TASK-106-C  Controllers + Swagger + ReviewModule + e2e
     ↓
TASK-106-D  Orval regen (store-client + store-admin)
     ↓                    ↓
TASK-078-A          TASK-078-C
(storefront list)   (admin queue)
     ↓
TASK-078-B
(storefront write form)
     ↓
TASK-078-D
(final verification gate)
```

TASK-078-A and TASK-078-C can be worked in parallel after TASK-106-D; both depend only on the
generated hooks. TASK-078-B depends on TASK-078-A (shares `ProductReviewsWidget`).

---

## Verification Gate (full, before PR)

Run in order — each must be green before merging:

```bash
npm run test -w apps/store-api          # unit tests (incl. review.service.spec.ts)
npm run test:e2e                        # review.e2e-spec.ts + existing suites
npm run test -w apps/store-client       # RTL (product-reviews-widget, submit-review-form)
npm run test -w apps/store-admin        # RTL (admin-review-table)
npm run typecheck -w apps/store-api
npm run typecheck -w apps/store-client
npm run typecheck -w apps/store-admin
npm run lint
npm run build
```

---

## Key Decisions Summary

| Decision          | Choice                                          | Rationale                                                                                                                      |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Verified-purchase | Badge only (not hard requirement)               | Common e-commerce pattern; less friction; trust signal without blocking legitimate reviews                                     |
| Reject action     | Hard delete                                     | No `status` enum in schema; keeps queue clean; frees `@@unique` slot for re-submission; no migration needed                    |
| Reviews route     | `/products/:productId/reviews` (UUID, not slug) | PDP client already has `data.id`; avoids extra slug→id lookup; controller prefix `products/:productId/reviews` is valid NestJS |
| Admin base path   | `/admin/reviews` via `AdminReviewController`    | Consistent with other admin controllers (admin-order.controller.ts); clean separation                                          |
| Schema migration  | None required                                   | `Review` model is complete; `isActive @default(false)` is the moderation gate                                                  |

---

## Completion Checklist

- [ ] TASK-106-A: `ReviewRepository` created; all 9 methods; compiles clean
- [ ] TASK-106-B: `ReviewService` TDD (Red → Green → Refactor); all service specs pass;
      `CreateReviewDto` / `ReviewListQueryDto` / `AdminReviewQueryDto` with class-validator;
      `ReviewEntity` + `ReviewAggregateEntity` with `@ApiProperty`
- [ ] TASK-106-C: `ReviewController` (public GET + auth POST) + `AdminReviewController`
      (admin GET / PATCH approve / DELETE reject) + `ReviewModule` registered in `AppModule`;
      `review.e2e-spec.ts` all cases pass
- [ ] TASK-106-D: Orval regen run for both `store-client` + `store-admin`; typecheck clean on
      both; generated files NOT committed
- [ ] TASK-078-A: `entities/review` barrel in store-client; `ProductReviewsWidget` renders
      approved reviews + aggregate + verified-purchase badge; Reviews tab enabled on PDP;
      RTL tests green
- [ ] TASK-078-B: `submit-review` feature slice; auth-gated form (login prompt for guests);
      RHF + zod; 409 handled; RTL tests green
- [ ] TASK-078-C: `AdminReviewTable` with approve/reject actions + URL-synced status filter;
      `/reviews` route in admin; sidebar nav entry; dictionary keys complete; RTL tests green
- [ ] TASK-078-D: full verification gate — all workspaces typecheck + lint + build + test green
- [ ] `BACKLOG.md` TASK-078 and TASK-106 rows updated: Plan column set to this file path
