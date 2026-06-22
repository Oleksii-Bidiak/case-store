# Plan 047 — Soft Deletes / Audit Trail (`deletedAt` on User, Product, Order)

**Phase:** B — Reliability & observability
**Roadmap reference:** Phase B — Reliability & observability
**BACKLOG task:** TASK-104
**Branch:** `feature/104-soft-deletes-audit` (off `develop`)
**Status:** To Do (⬜)
**Created:** 2026-06-22

---

## 1. Context and Problem Statement

The codebase currently relies on hard deletes for the few places where rows are removed, and on an `isActive` boolean toggle for reversible visibility. Historical audit data is not preserved when a row is hard-deleted. There is also no tombstone to block re-use of unique fields (e.g., `User.email`) by a new registration after a deletion. For an e-commerce platform this creates two concrete risks:

1. **Order history breakage.** `OrderItem` rows reference `Product` by FK with no `ON DELETE CASCADE`. If a product were hard-deleted, historical order items would lose their reference, breaking order history pages and reports.
2. **No audit trail.** There is no record of who was deleted, when, or by what process — required for GDPR deletion logs, fraud investigation, and general observability.

### Goal

Add a nullable `deletedAt DateTime?` column to `User`, `Product`, and `Order`. Every read path must filter `deletedAt IS NULL`. Every delete operation must set `deletedAt = now()` instead of issuing a physical DELETE. Order history must continue to resolve soft-deleted products. `deletedAt` must not be exposed in public storefront API responses.

---

## 2. `isActive` vs `deletedAt` — Semantics and Recommendation

### Existing `isActive` usage

| Model            | `isActive` meaning                                                                                                                                                                                       | Who sets it                | Reversible? |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------- |
| `User`           | Account enabled/banned. `auth.service.ts` rejects login when `isActive = false`. Admin can toggle via `PATCH /users/:id/deactivate` and `PATCH /users/:id/activate`.                                     | Admin only                 | Yes         |
| `Product`        | Visible to storefront. Cart validation rejects inactive products. Admin can toggle via `PATCH /products/:id/deactivate` and `PATCH /products/:id/activate`. Dashboard counts `isActive = true` products. | Admin only                 | Yes         |
| `ProductVariant` | Variant included in detail page. Cart validation checks variant `isActive`.                                                                                                                              | Admin (via product update) | Yes         |
| `Category`       | Visible in nav tree. Public endpoints filter `isActive = true`.                                                                                                                                          | Admin only                 | Yes         |
| `Review`         | Requires admin approval (`isActive = false` by default).                                                                                                                                                 | Admin approval flow        | Yes         |

### What `deletedAt` adds

`deletedAt` is a **tombstone** that records when a row was permanently removed from active use. It is:

- Set once (when a record is "deleted") and never cleared.
- Filtered out of every read path (`WHERE deleted_at IS NULL`).
- Kept forever (or until a GDPR-mandated purge job, which is out of scope here).
- Not the same as "hidden from storefront" — that is `isActive`.

### Recommendation: Keep Both, with Clear Rules

Do not collapse `isActive` into `deletedAt`. They serve distinct purposes:

| Concern                                        | Mechanism   | Example                                                                     |
| ---------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| Visibility toggle (reversible, admin workflow) | `isActive`  | Admin hides a product for restocking; re-enables it next day                |
| Permanent removal / audit tombstone            | `deletedAt` | Admin deletes a fraudulent account; the email is freed after a grace period |

**Invariant to enforce in all repositories:** any row where `deletedAt IS NOT NULL` must be treated as non-existent by all read paths, regardless of `isActive`. The two flags are independent. A soft-deleted row should never be reactivated — it is gone from the system's perspective.

### Scope

Add `deletedAt` only to the three models named in TASK-104: **User**, **Product**, **Order**. Do not add it to `ProductVariant`, `Category`, `Review`, `CartItem`, `OrderItem`, `RefreshToken`, etc. — these are either child rows (CASCADE-handled), operational rows, or do not benefit from audit tombstones in the MVP.

---

## 3. Hard-Delete Call Sites Inventory

The following `prisma.<model>.delete` / `prisma.<model>.deleteMany` calls were found in the codebase. Only those on the three target models are in scope for conversion.

| File                                                         | Call                                  | Target model                    | In scope? | Action                                                                      |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------- | --------- | --------------------------------------------------------------------------- |
| `apps/store-api/src/auth/auth.repository.ts:118`             | `prisma.refreshToken.deleteMany(...)` | `RefreshToken`                  | No        | No change — purge of expired/revoked tokens is intentional physical removal |
| `apps/store-api/src/cart/cart.repository.ts:218`             | `tx.cart.delete(...)`                 | `Cart` (guest cart after merge) | No        | No change — guest cart cleanup, not a business entity                       |
| `apps/store-api/src/cart/cart.repository.ts:300`             | `prisma.cartItem.delete(...)`         | `CartItem`                      | No        | No change — removing a single line from a cart                              |
| `apps/store-api/src/cart/cart.repository.ts:309`             | `prisma.cartItem.deleteMany(...)`     | `CartItem`                      | No        | No change — clearing the cart after order creation                          |
| `apps/store-api/src/order/order.repository.ts:109`           | `tx.cartItem.deleteMany(...)`         | `CartItem`                      | No        | No change — clearing cart after order creation                              |
| `apps/store-api/src/product/product-image.repository.ts:117` | `prisma.productImage.delete(...)`     | `ProductImage`                  | No        | No change — image deletion is physical by design (S3/disk also cleaned)     |

**Conclusion: there are no existing hard-delete call sites on `User`, `Product`, or `Order`.** The current admin delete flows use `isActive` toggling only. This means the conversion work for TASK-104 is additive (adding the `deletedAt` path) rather than replacing existing hard-delete calls. Future delete endpoints (if added) must use the soft-delete path from the start.

---

## 4. Decision Points

### 4.1 Which models get `deletedAt`

User, Product, Order — as specified in TASK-104.

### 4.2 Additional audit columns (e.g., `deletedBy`)

Deferred for MVP. Adding `deletedBy String?` alongside `deletedAt` requires passing the acting admin's ID into every delete call, which touches more layers. The tombstone timestamp is sufficient for Phase B audit observability. `deletedBy` can be added in a follow-on task when admin action logging (event sourcing / audit log table) is planned.

### 4.3 Unique-constraint collision under soft delete

**Problem:** `User.email` has a `@unique` constraint. If a user account is soft-deleted, the email remains in the `users` table and blocks re-registration with the same address.

**Recommendation:** On soft-delete of a User, the service must **mangle the email** to free the unique slot while preserving the original for audit. A deterministic mangle pattern is safe and reversible for lookup:

```
deleted+{userId}+{originalEmail}  →  e.g. deleted+550e8400+user@example.com
```

Store the original email in a separate `originalEmail String? @map("original_email")` column added in the same migration, or alternatively accept a less elegant approach of storing the original in a `deletedEmail` JSON audit field. The simplest MVP approach: rename the email to `deleted:<uuid>:<original>` so the unique index is unblocked and the original is still recoverable. The auth service already rejects login for `isActive = false` users so they cannot log in regardless, but the email field collision is the hard technical constraint.

`Product.slug` and `Product.sku` are also `@unique`. The same mangle strategy applies to slug/sku on Product soft-delete: prefix with `deleted:<uuid>:`.

`Order` has no unique constraint beyond `id`, so no mangle is needed.

### 4.4 Cascade behavior for soft-deleting a parent

- **Soft-delete a Product:** `OrderItem` rows referencing that product must be preserved (order history). The FK `OrderItem.productId → Product.id` has no `ON DELETE CASCADE` in the schema, so the product row staying in the DB is already correct — the `deletedAt` tombstone just hides it from reads. The `ORDERS_INCLUDE` select in `order.repository.ts` does `product: { select: { id, name, slug } }` — this continue to work because the product row still exists (just tombstoned).
- **Soft-delete a User:** `Order` rows for that user are preserved (order history). `Cart`, `Address`, `Review`, `RefreshToken` rows can remain — they are not visible to any storefront path once the user is tombstoned.
- **Soft-delete an Order:** No cascades needed — `OrderItem` rows have `ON DELETE CASCADE` from the migration but since the `Order` row stays, they are untouched.

### 4.5 Sequencing across the three models

Implement in this order: **Product → User → Order**. Product is the most referenced entity, has the unique-slug constraint that must be handled, and has active test coverage to validate the pattern. User adds the email-mangle complexity. Order is the simplest (no unique constraints, no complex deactivation side-effects).

### 4.6 API exposure of `deletedAt`

`deletedAt` must NOT appear in any entity class exposed to the storefront (`ProductEntity`, `UserEntity`, `OrderEntity`). It is an internal audit field. Admin API may expose it in admin-specific entity shapes if needed in a future plan. For now: excluded from all `fromPrisma` mappers and all Swagger entity classes.

---

## 5. Sub-tasks

### TASK-104-A: Update `prisma-migration` skill doc and CLAUDE.md note

**Type:** docs
**Scope:** store-api (docs layer)
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** nothing

The current `CLAUDE.md` line in `prisma-migration` skill says: "note: `isActive` deactivation, no soft deletes". This contradicts TASK-104. Update both the CLAUDE.md reference and the skill description to reflect the new policy.

**Acceptance Criteria:**

- [ ] `CLAUDE.md` skill entry for `prisma-migration` updated to remove "no soft deletes" and note: "`isActive` = reversible visibility; `deletedAt` = audit tombstone on User/Product/Order"
- [ ] No application code changed in this sub-task

**Files to create/modify:**

- `CLAUDE.md` — update the `prisma-migration` skill description line

---

### TASK-104-B: Prisma schema + migration — add `deletedAt` columns and indexes

**Type:** chore
**Scope:** store-api
**Complexity:** M (2h)
**TDD Required:** No
**Depends on:** TASK-104-A

Add `deletedAt DateTime? @map("deleted_at")` to `User`, `Product`, and `Order` models in the Prisma schema. Add a `@@index([deletedAt])` on each (for efficient `WHERE deleted_at IS NULL` filtering). Also add `originalEmail String? @map("original_email")` to `User` to store the pre-mangle email on soft-delete. Generate a named migration.

**Prisma schema changes:**

`User` model — add after `isActive`:

```prisma
originalEmail String?   @map("original_email")
deletedAt     DateTime? @map("deleted_at")
```

And add to `@@map("users")` block:

```prisma
@@index([deletedAt])
```

`Product` model — add after `isActive`:

```prisma
deletedAt DateTime? @map("deleted_at")
```

Add:

```prisma
@@index([deletedAt])
```

`Order` model — add after `updatedAt`:

```prisma
deletedAt DateTime? @map("deleted_at")
```

Add:

```prisma
@@index([deletedAt])
```

Migration command:

```bash
cd apps/store-api && npx prisma migrate dev --name add_soft_delete_audit
```

No data backfill required — all existing rows default to `deletedAt = NULL` (not deleted).

**Acceptance Criteria:**

- [ ] `apps/store-api/prisma/schema.prisma` has `deletedAt DateTime?` on User, Product, Order
- [ ] `User` has `originalEmail String?` column
- [ ] Each model has `@@index([deletedAt])`
- [ ] Migration SQL file created under `apps/store-api/prisma/migrations/`
- [ ] `npx prisma generate` succeeds (Prisma client regenerated)
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add columns and indexes
- `apps/store-api/prisma/migrations/<timestamp>_add_soft_delete_audit/migration.sql` — generated

---

### TASK-104-C: Repository layer — Product soft-delete filter and tombstone

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** Yes
**Depends on:** TASK-104-B

Update `ProductRepository` to:

1. Add `deletedAt: null` to every read `where` clause that does not explicitly need to read tombstoned rows.
2. Add a new `softDelete(id: string): Promise<Product>` method that sets `deletedAt = now()`, mangles the slug (prefix `deleted:<id>:`) and sku (if set) to free unique constraints, and sets `isActive = false`.
3. Do not modify `deactivate`/`activate` methods — they remain the reversible visibility toggle.

Read paths that need the `deletedAt: null` filter added:

- `findById(id)` — `prisma.product.findUnique({ where: { id } })` → add `deletedAt: null` guard (use `findFirst({ where: { id, deletedAt: null } })`; `findUnique` does not accept extra where fields without a compound unique index)
- `findBySlug(slug)` — same approach
- `findBySku(sku)` — same approach
- `findBySlugWithRelations(slug)` — same approach
- `findAll(params)` — add `where.deletedAt = null` unconditionally (soft-deleted products must never appear in any listing)
- `getRatingsByProductId` (private) — review groupBy already filters by `productId IN (...)`, so products excluded from `findAll` will not generate rating queries; no direct change needed here
- `getPrimaryImagesByProductId` (private) — same reasoning; no direct filter needed

New method:

```typescript
async softDelete(id: string): Promise<Product> {
  const now = new Date();
  const mangled = `deleted:${id}:`;
  return this.prisma.product.update({
    where: { id },
    data: {
      deletedAt: now,
      isActive: false,
      slug: { set: /* mangled + original */ },
      sku: /* mangle if not null */,
    },
  });
}
```

The actual mangle requires a read-then-update (or a raw query with string concat). Use a two-step approach in the service (read product, build mangled values, call softDelete with explicit values) keeping the repository method simple: `softDelete(id: string, mangledSlug: string, mangledSku: string | null): Promise<Product>`.

**Acceptance Criteria:**

- [ ] `findById`, `findBySlug`, `findBySku`, `findBySlugWithRelations`, `findAll` all exclude `deletedAt IS NOT NULL` rows
- [ ] `softDelete` method sets `deletedAt`, `isActive = false`, and applies slug/sku mangle
- [ ] Unit tests in `apps/store-api/src/product/product.repository.spec.ts` (create if not existing) cover: (a) `findAll` excludes tombstoned products; (b) `findById` returns `null` for tombstoned product; (c) `softDelete` sets `deletedAt` and mangles slug
- [ ] `npm run test -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/product/product.repository.ts` — add `deletedAt: null` filters; add `softDelete` method; update `FindAllParams`, `FindBySlugParams` if needed

---

### TASK-104-D: Repository layer — User soft-delete filter and tombstone

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** Yes
**Depends on:** TASK-104-B

Update `UserRepository` to:

1. Add `deletedAt: null` guards to `findById` and `findByEmail` (use `findFirst`).
2. Add `deletedAt: null` to the `findAll` where clause unconditionally.
3. Add `softDelete(id: string, mangledEmail: string, originalEmail: string): Promise<User>` that sets `deletedAt = now()`, `isActive = false`, `email = mangledEmail`, `originalEmail = originalEmail`.

Email mangle pattern (deterministic, reversible): `deleted:<userId>:<originalEmail>` — e.g. `deleted:550e8400-...:user@example.com`. This is 256+ chars max (UUIDs are 36 chars + prefix + email up to ~254); email column is `TEXT` so no length limit concern.

**Important:** `auth.service.ts:83` checks `if (!user.isActive)` and `auth.service.ts:121` checks `if (!storedToken.user.isActive)`. After soft-delete, `isActive` is set to `false`, so both guards already block login for soft-deleted users. No auth.service change is required.

**Acceptance Criteria:**

- [ ] `findById` and `findByEmail` exclude tombstoned users
- [ ] `findAll` excludes tombstoned users
- [ ] `softDelete` sets `deletedAt`, mangles email, sets `originalEmail`, sets `isActive = false`
- [ ] Unit tests cover: `findAll` excludes tombstoned users; `findByEmail` returns `null` for tombstoned email; `softDelete` sets the expected fields
- [ ] `npm run test -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/user/user.repository.ts` — add `deletedAt: null` filters; add `softDelete` method; add `originalEmail` to `UpdateUserInput` or new `SoftDeleteInput` interface

---

### TASK-104-E: Repository layer — Order soft-delete filter and tombstone

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** TASK-104-B

Update `OrderRepository` to:

1. Add `deletedAt: null` to `findByUserId` and `findAll` where clauses.
2. `findById` — add `deletedAt: null` guard (use `findFirst` instead of `findUnique`).
3. Add `softDelete(id: string): Promise<OrderWithItems>` that sets `deletedAt = now()`.

Note: `cancelAndRestock` and `updateStatus` should check `deletedAt IS NULL` before operating — throwing `NotFoundException` if the order is tombstoned.

**Order history and soft-deleted products:** The `ORDERS_INCLUDE` select in `order.repository.ts` fetches `product: { select: { id, name, slug } }` for each `OrderItem`. Since soft-deleting a product leaves the row in place (with a mangled slug), the `name` field is intact and the `id` is preserved. The order history page renders the product name from `OrderItem.product.name`, which is the snapshotted product name — this continues to work. The mangled slug means any "go to product page" link on the order history page would 404, which is acceptable behavior for a deleted product.

**Acceptance Criteria:**

- [ ] `findByUserId` and `findAll` exclude tombstoned orders
- [ ] `findById` returns `null` for a tombstoned order
- [ ] `softDelete` sets `deletedAt`
- [ ] `cancelAndRestock` and `updateStatus` throw `NotFoundException` for tombstoned orders
- [ ] Order history for a user with soft-deleted products resolves correctly (product name still present)
- [ ] Unit tests in `apps/store-api/src/order/order.repository.spec.ts` cover the above
- [ ] `npm run test -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/order/order.repository.ts` — add `deletedAt: null` filters; add `softDelete` method; guard `cancelAndRestock` and `updateStatus`

---

### TASK-104-F: Service layer — wire soft-delete for Product and User

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3h)
**TDD Required:** Yes
**Depends on:** TASK-104-C, TASK-104-D, TASK-104-E

Add service methods that orchestrate soft-delete for Product and User. Order soft-delete (admin delete) is not yet exposed via a controller endpoint; add the service method but no controller endpoint for Order in this task.

**ProductService** — add `delete(id: string): Promise<ProductEntity>`:

1. `findById` to confirm exists and not already deleted.
2. Build mangled slug: `deleted:${product.id}:${product.slug}`.
3. Build mangled sku: `product.sku ? deleted:${product.id}:${product.sku} : null`.
4. Call `repository.softDelete(id, mangledSlug, mangledSku)`.
5. Evict product caches (`delByPrefix(PRODUCT_LIST_PREFIX)` + `evictProductDetail`).
6. Return `ProductEntity.fromPrisma(result)` — `deletedAt` must NOT be added to `ProductEntity`.

**UserService** — add `deleteUser(id: string, adminId: string): Promise<UserEntity>`:

1. Self-delete guard (cannot delete own account).
2. `findById` to confirm exists.
3. Build mangled email: `deleted:${user.id}:${user.email}`.
4. Call `repository.softDelete(id, mangledEmail, user.email)`.
5. Revoke all refresh tokens (`authRepository.revokeAllUserTokens(id)`) — same as `deactivateUser`.
6. Return `UserEntity.fromPrisma(result)` — `deletedAt`/`originalEmail` must NOT be in `UserEntity`.

**Acceptance Criteria:**

- [ ] `ProductService.delete` soft-deletes product, evicts caches, returns entity without `deletedAt`
- [ ] `UserService.deleteUser` soft-deletes user, revokes tokens, returns entity without `deletedAt`/`originalEmail`
- [ ] Unit tests for both service methods (mock repository + cache)
- [ ] `npm run test -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/product/product.service.ts` — add `delete` method
- `apps/store-api/src/product/product.service.spec.ts` — add delete test cases
- `apps/store-api/src/user/user.service.ts` — add `deleteUser` method
- `apps/store-api/src/user/user.service.spec.ts` — add deleteUser test cases

---

### TASK-104-G: Controller layer — expose soft-delete endpoints for Product and User

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-104-F

Add `DELETE /api/products/:id` (AdminGuard) and `DELETE /api/users/:id` (AdminGuard) endpoints. These call the service soft-delete methods and return `204 No Content`.

Note: No `DELETE /api/orders/:id` endpoint is added in this plan. Order soft-delete via the admin is out of scope for the MVP (admin-facing order deletion is a rare operation; cancel workflow via `PATCH /orders/:id/cancel` is the normal path).

**Acceptance Criteria:**

- [ ] `DELETE /api/products/:id` requires AdminGuard, calls `productService.delete(id)`, returns 204
- [ ] `DELETE /api/users/:id` requires AdminGuard, calls `userService.deleteUser(id, adminId)`, returns 204
- [ ] Both endpoints have Swagger `@ApiOperation`, `@ApiResponse` (204, 404, 403) decorators
- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run lint -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/product/product.controller.ts` — add `@Delete(':id')` method
- `apps/store-api/src/user/user.controller.ts` — add `@Delete(':id')` method

---

### TASK-104-H: Entity classes — verify `deletedAt` exclusion from public API shapes

**Type:** chore
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-104-B

Confirm and document that `deletedAt` and `originalEmail` are NOT included in any entity class used in API responses. Review `fromPrisma` static methods in:

- `apps/store-api/src/user/entities/user.entity.ts`
- `apps/store-api/src/product/entities/product.entity.ts`
- `apps/store-api/src/order/entities/order.entity.ts` (if it exists — check)

These classes must not have `deletedAt` as a property and must not map it from the Prisma result. If Prisma now includes `deletedAt` in the returned object (because it's in the schema), the `fromPrisma` mapper must simply not assign it.

**Acceptance Criteria:**

- [ ] `UserEntity.fromPrisma` does not include `deletedAt` or `originalEmail`
- [ ] `ProductEntity.fromPrisma` does not include `deletedAt`
- [ ] Order entity (if present) does not include `deletedAt`
- [ ] `npm run build -w apps/store-api` passes (no leaked types)

**Files to create/modify:**

- `apps/store-api/src/user/entities/user.entity.ts` — verify/confirm exclusion (no change needed if already correct)
- `apps/store-api/src/product/entities/product.entity.ts` — verify/confirm exclusion
- Order entity path — verify

---

### TASK-104-I: Regenerate Orval API client

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-104-G

Run `npm run generate:api` to regenerate Orval hooks after the new `DELETE` endpoints are added to the OpenAPI spec. Verify the generated client has the new delete hooks (`useDeleteProduct`, `useDeleteUser`). Confirm no `deletedAt` field appears in generated types.

**Acceptance Criteria:**

- [ ] `npm run generate:api` exits cleanly
- [ ] Generated files in `apps/store-client/src/shared/api/generated/` and `apps/store-admin/src/shared/api/generated/` updated
- [ ] No `deletedAt` in generated entity types
- [ ] `npm run typecheck` across all workspaces passes

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/` — auto-generated, do not hand-edit
- `apps/store-admin/src/shared/api/generated/` — auto-generated, do not hand-edit

---

### TASK-104-J: Integration / verification pass

**Type:** test
**Scope:** store-api
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-104-A through TASK-104-I

Run the full backend test and lint gate, confirm migration applies cleanly, and do a brief manual verification on a running stack.

**Acceptance Criteria:**

- [ ] `npx prisma migrate dev` applies without errors on a clean DB
- [ ] `npm run test -w apps/store-api` — all unit tests green
- [ ] `npm run lint -w apps/store-api` — no lint errors
- [ ] `npm run typecheck` across all workspaces — no type errors
- [ ] `npm run build -w apps/store-api` — build succeeds
- [ ] Manual: `DELETE /api/products/:id` via Swagger UI → product disappears from listing, order history still resolves its name
- [ ] Manual: `DELETE /api/users/:id` via Swagger UI → user not returned in admin list, email unblocked for new registration

---

## 6. Implementation Order Summary

```
TASK-104-A  (docs update — 30 min)
    ↓
TASK-104-B  (Prisma schema + migration — 2h)
    ↓
TASK-104-C  (ProductRepository — 2-3h, TDD)
TASK-104-D  (UserRepository — 2-3h, TDD)      ← run in parallel with 104-C
TASK-104-E  (OrderRepository — 1-2h, TDD)     ← run in parallel with 104-C/D
    ↓
TASK-104-F  (Service layer — 2-3h, TDD)
    ↓
TASK-104-G  (Controller layer — 1-2h)
TASK-104-H  (Entity class audit — 30 min)      ← run in parallel with 104-G
    ↓
TASK-104-I  (Orval regeneration — 30 min)
    ↓
TASK-104-J  (Integration/verification — 1h)
```

Estimated total: **~14-16 hours** of focused development.

---

## 7. Risks and Mitigations

| Risk                                                               | Likelihood       | Mitigation                                                                            |
| ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| Unique-constraint collision on soft-deleted User email             | High (by design) | Email mangle in service before calling softDelete; covered by tests                   |
| Unique-constraint collision on soft-deleted Product slug/sku       | High (by design) | Same mangle pattern; covered by tests                                                 |
| Read path misses `deletedAt: null` filter (tombstoned rows leak)   | Medium           | Systematic review in TASK-104-C/D/E; unit tests prove exclusion                       |
| Order history breaks for orders referencing a soft-deleted product | Low              | Product row stays in DB; `name` field preserved; covered by tests in TASK-104-E       |
| Auth guard bypassed for soft-deleted users                         | Very low         | `isActive = false` is set on soft-delete; existing `auth.service.ts` guard catches it |
| Orval-generated types expose `deletedAt` to frontend               | Low              | Entity `fromPrisma` mappers never assign `deletedAt`; TASK-104-H audits this          |
| Contradiction with documented "no soft deletes" convention         | Resolved         | TASK-104-A updates the docs before implementation begins                              |
| `findUnique` cannot add extra where filters in Prisma              | Medium (known)   | Use `findFirst({ where: { id, deletedAt: null } })` everywhere — documented in plan   |

---

## 8. Files Inventory (all paths relative to repo root)

**Modified:**

- `CLAUDE.md` — skill note update (TASK-104-A)
- `apps/store-api/prisma/schema.prisma` — add `deletedAt` columns and indexes (TASK-104-B)
- `apps/store-api/src/product/product.repository.ts` — filters + softDelete (TASK-104-C)
- `apps/store-api/src/user/user.repository.ts` — filters + softDelete (TASK-104-D)
- `apps/store-api/src/order/order.repository.ts` — filters + softDelete (TASK-104-E)
- `apps/store-api/src/product/product.service.ts` — `delete` method (TASK-104-F)
- `apps/store-api/src/product/product.service.spec.ts` — delete test cases (TASK-104-F)
- `apps/store-api/src/user/user.service.ts` — `deleteUser` method (TASK-104-F)
- `apps/store-api/src/user/user.service.spec.ts` — deleteUser test cases (TASK-104-F)
- `apps/store-api/src/product/product.controller.ts` — `@Delete(':id')` (TASK-104-G)
- `apps/store-api/src/user/user.controller.ts` — `@Delete(':id')` (TASK-104-G)
- `apps/store-api/src/user/entities/user.entity.ts` — verify exclusion (TASK-104-H)
- `apps/store-api/src/product/entities/product.entity.ts` — verify exclusion (TASK-104-H)

**Created:**

- `apps/store-api/prisma/migrations/<timestamp>_add_soft_delete_audit/migration.sql` — generated (TASK-104-B)
- `apps/store-api/src/product/product.repository.spec.ts` — new unit test file (TASK-104-C)
- `apps/store-api/src/order/order.repository.spec.ts` — already exists; add soft-delete cases (TASK-104-E)

**Auto-generated (do not hand-edit):**

- `apps/store-client/src/shared/api/generated/` — Orval output (TASK-104-I)
- `apps/store-admin/src/shared/api/generated/` — Orval output (TASK-104-I)
