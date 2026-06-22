# Plan 045 — Order List Response Typing

**Phase:** Phase A — Stabilize & close out
**TASK:** TASK-114
**Branch:** `feature/114-order-list-response-typing` off `develop`
**Complexity:** S (1–2 h total)
**TDD Required:** No (pure Swagger/type annotation change; no business logic altered)

---

## Context

TASK-113 introduced the storefront `/orders` history page. The `GET /api/orders` endpoint
returns a paginated envelope `{ data: OrderEntity[], meta: PaginationMeta }`, but the
storefront `OrderController`'s `OrderListResponseEnvelope` class has no `@ApiProperty`
decorators on its fields and its `@ApiResponse` uses a raw `schema: { $ref: ... }` instead
of `type: OrderListResponseEnvelope`. As a result, Swagger emits a structurally incomplete
schema and Orval generates the envelope as an index signature:

```ts
// apps/store-client/src/shared/api/generated/models/orderListResponseEnvelope.ts
export interface OrderListResponseEnvelope {
  [key: string]: unknown;
}
```

The `data` field is therefore untyped, forcing an explicit cast in the order-history widget:

```ts
// apps/store-client/src/widgets/order-history/ui/order-history-view.tsx  line 62
const orders = (data?.data as OrderEntity[] | undefined) ?? [];
```

The comment in that file explicitly marks this as a TODO pending a backend fix.

---

## Problem Statement

`OrderListResponseEnvelope.data` is not declared as `OrderEntity[]` in the OpenAPI spec
because the envelope class lacks `@ApiProperty` decorators. This causes Orval to produce a
loosely-typed `{ [key: string]: unknown }` interface, forcing a runtime cast on the frontend
that defeats TypeScript's safety guarantees.

---

## Goal

1. Add `@ApiProperty` decorators to `OrderListResponseEnvelope` (and the inline
   `OrderResponseEnvelope` / storefront `PaginationMeta` sibling class used only in this
   controller) in `apps/store-api/src/order/order.controller.ts`, following the exact same
   pattern already used in `AdminOrderController` and `ProductController`.
2. Switch the `GET /api/orders` `@ApiResponse` from the raw `schema: { $ref }` form to
   `type: OrderListResponseEnvelope` so Swagger resolves the full schema.
3. Regenerate the OpenAPI spec and Orval hooks so the generated
   `OrderListResponseEnvelope` gains correctly-typed `data` and `meta` fields.
4. Remove the `as OrderEntity[]` cast in `order-history-view.tsx`.

No Prisma migration, no service/repository changes, no new tests are required.

---

## Root Cause Analysis

### Why the cast exists

The storefront `OrderController` (unlike `AdminOrderController` and `ProductController`)
declares its response envelope classes without `@ApiProperty`:

```ts
// apps/store-api/src/order/order.controller.ts
class OrderListResponseEnvelope {
  data!: OrderEntity[]; // no @ApiProperty — Swagger cannot see this field
  meta!: PaginationMeta; // no @ApiProperty — same issue
}
```

And the `GET /api/orders` endpoint uses:

```ts
@ApiResponse({
  status: 200,
  description: 'Paginated list of orders',
  schema: { $ref: getSchemaPath(OrderListResponseEnvelope) },
})
```

Because `OrderListResponseEnvelope` has no decorated properties, the `$ref` resolves to an
empty schema. Orval falls back to `{ [key: string]: unknown }`.

### Correct pattern (already working in this codebase)

`AdminOrderController` (`apps/store-api/src/order/admin-order.controller.ts`) and
`ProductController` (`apps/store-api/src/product/product.controller.ts`) both use:

```ts
class SomeListResponseEnvelope {
  @ApiProperty({ type: [SomeEntity] })
  data!: SomeEntity[];

  @ApiProperty({ type: SomePaginationMeta })
  meta!: SomePaginationMeta;
}
// ...
@ApiResponse({ status: 200, type: SomeListResponseEnvelope })
```

This produces fully-typed generated models.

---

## Implementation Steps

### Step 1 — Add `@ApiProperty` decorators to envelope classes in `order.controller.ts`

**File:** `apps/store-api/src/order/order.controller.ts`

Add `ApiProperty` to the import list from `@nestjs/swagger`. Then decorate the three
classes that currently lack it:

1. **`OrderResponseEnvelope`** — add `@ApiProperty({ type: OrderEntity })` on `data`.
2. **A local `StorefrontPaginationMeta` class** — the controller currently imports
   `PaginationMeta` as an interface from `order.service.ts`. Since an interface cannot carry
   `@ApiProperty`, introduce a local decorated class (mirroring `AdminOrderPaginationMeta` in
   `admin-order.controller.ts`) to replace it for Swagger purposes only. The runtime shape is
   identical.
3. **`OrderListResponseEnvelope`** — add `@ApiProperty({ type: [OrderEntity] })` on `data`
   and `@ApiProperty({ type: StorefrontPaginationMeta })` on `meta`.

Switch the `GET /api/orders` `@ApiResponse` from `schema: { $ref: ... }` to
`type: OrderListResponseEnvelope`. Optionally do the same for the single-order responses
(`OrderResponseEnvelope`) so those envelopes are also fully declared.

Remove now-redundant `getSchemaPath` and `ApiExtraModels` entries for
`OrderListResponseEnvelope` / `OrderResponseEnvelope` if they become redundant (Swagger
will pick them up via `type:` automatically). Keep `ApiExtraModels` only for models that
are referenced but not used as a direct `type:` in an `@ApiResponse`.

**Acceptance criteria for this step:**

- `apps/store-api/src/order/order.controller.ts` compiles without errors.
- The `PaginationMeta` import from `order.service.ts` may be removed if replaced by the
  local decorated class, or kept alongside it — either is fine; choose whichever keeps the
  code cleanest.

### Step 2 — Regenerate OpenAPI spec

**Command (run from monorepo root, requires a running DB):**

```bash
npm run swagger:export -w apps/store-api
```

**Verify** that the emitted `swagger.json` now contains a `components.schemas.OrderListResponseEnvelope`
entry with:

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/OrderEntity" }
    },
    "meta": { "$ref": "#/components/schemas/StorefrontPaginationMeta" }
  }
}
```

(The exact class name used for the meta schema may differ if you reuse the existing class.)

### Step 3 — Regenerate Orval hooks

**Command (run from monorepo root):**

```bash
npm run generate:api
```

Which internally runs:

```bash
npm run generate:api -w apps/store-client -w apps/store-admin
```

**Verify** that the generated file at
`apps/store-client/src/shared/api/generated/models/orderListResponseEnvelope.ts` now reads:

```ts
export interface OrderListResponseEnvelope {
  data: OrderEntity[];
  meta: StorefrontPaginationMeta; // (or whatever the meta schema name resolves to)
}
```

Do not hand-edit anything under `**/shared/api/generated/` — these files are auto-generated
and protected by pre-commit hooks.

### Step 4 — Remove the frontend cast

**File:** `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx`

**Current (lines 58–62):**

```ts
// The generated `OrderListResponseEnvelope.data` is loosely typed ({[key]:
// unknown}) because the backend list endpoint's Swagger schema doesn't declare
// the array item type. The runtime payload is OrderEntity[] — cast here.
// TODO: type the list envelope on the backend so this cast can be removed.
const orders = (data?.data as OrderEntity[] | undefined) ?? [];
```

**Replace with:**

```ts
const orders = data?.data ?? [];
```

The comment and the `as OrderEntity[]` cast are both removed. If `data?.data` is now
correctly typed as `OrderEntity[] | undefined`, TypeScript will accept this without casting.
Remove the `OrderEntity` type import from this file only if it is no longer used elsewhere
in the component (it is also used in the `STATUS_BADGE` key type and `orders.map` callback,
so it may remain — only remove the import if TypeScript flags it as unused).

---

## File Map

| Action                         | File                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Modify                         | `apps/store-api/src/order/order.controller.ts`                                             |
| Auto-regenerated (do not edit) | `apps/store-api/swagger.json`                                                              |
| Auto-regenerated (do not edit) | `apps/store-client/src/shared/api/generated/models/orderListResponseEnvelope.ts`           |
| Auto-regenerated (do not edit) | `apps/store-client/src/shared/api/generated/models/index.ts` (if new model added for meta) |
| Modify                         | `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx`                    |

---

## Acceptance Criteria

- [ ] `OrderListResponseEnvelope` class in `order.controller.ts` has `@ApiProperty`
      decorators on both `data` (`type: [OrderEntity]`) and `meta`.
- [ ] The `GET /api/orders` `@ApiResponse` uses `type: OrderListResponseEnvelope` (not a raw
      `schema: { $ref }` expression).
- [ ] `swagger.json` contains a fully-typed `OrderListResponseEnvelope` schema with `data`
      as an array of `OrderEntity` refs.
- [ ] Generated `orderListResponseEnvelope.ts` no longer uses `{ [key: string]: unknown }`.
- [ ] `apps/store-client/src/widgets/order-history/ui/order-history-view.tsx` line 62 has
      no `as OrderEntity[]` cast and no TODO comment about backend typing.
- [ ] `npm run typecheck` passes across the monorepo (no new type errors introduced).
- [ ] `npm run lint` passes across the monorepo.
- [ ] `npm run test -w apps/store-api` stays green (no business logic changed).
- [ ] Storefront `/orders` page renders order history correctly on a running stack (no
      regression; this can be deferred to _Pending manual QA_ if stack is not available).

---

## Risks

| Risk                                                                                                                                            | Likelihood | Mitigation                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| Orval generates a new schema name for the meta class that conflicts with an existing generated name                                             | Low        | Check `swagger.json` after export; rename the local class if needed |
| `getSchemaPath` / `ApiExtraModels` removal causes a missing-schema error in a different `@ApiResponse` that still uses a `$ref` to these models | Low        | Leave `ApiExtraModels` entries in place unless verified unnecessary |
| `OrderEntity` import in `order-history-view.tsx` becomes unused after cast removal                                                              | Very low   | TypeScript will flag it; remove the import only if unused           |

---

## Verification Steps

1. `npm run build -w apps/store-api` — backend compiles clean.
2. `npm run swagger:export -w apps/store-api` — `swagger.json` updated (requires DB).
3. `npm run generate:api` — Orval hooks regenerated.
4. `npm run typecheck` — no type errors in any workspace.
5. `npm run lint` — ESLint clean.
6. `npm run test -w apps/store-api` — unit + e2e tests still green.
7. Manual: visit `/orders` on a running storefront, confirm order list renders.

---

## Notes

- Work happens on branch `feature/114-order-list-response-typing`, branched from `develop`.
- Do NOT modify any application logic (no service, repository, or Prisma changes).
- Generated files under `**/shared/api/generated/` must not be hand-edited; they are
  regenerated in Step 3.
- The pre-commit hook blocks direct edits to generated API files — this is intentional;
  commit only the source change in `order.controller.ts` and the frontend cast removal.
- The `swagger.json` file itself is committed (it is the source consumed by Orval in CI);
  commit it after `swagger:export` succeeds.
