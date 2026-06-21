# Plan: Checkout Redesign for the Ukrainian Market + Silent-Submit Bug Fix

> **Status:** In Progress
> **Phase:** Phase A — Stabilize & close out (critical bug fix) + Phase 3 continuation (redesign)
> **Created:** 2026-06-21
> **Last Updated:** 2026-06-21

## Overview

Manual QA (§A5, Режим A, point 3 of `docs/manual-qa-master.md`) confirmed that the `/checkout`
page submit button **does nothing on a seemingly valid form and sends no `POST /api/orders`**. The
root cause is a silent zod-validation failure: `handleSubmit(submitOrder)` is called without an
`onInvalid` handler, so when zod rejects the form the user sees no feedback and the mutation is
never fired.

The prime culprit is the `country` field: it is validated as `z.string().length(2)` (exact
2-letter ISO-3166-1 code, e.g. "UA"), carries no default, and shows only the placeholder
"напр. UA". Any Ukrainian user who types "Україна" or "Ukraine" silently fails validation while
appearing to have filled in all fields.

The fix is combined with a full redesign of the checkout form to match Ukrainian market
conventions. The current form exposes non-Ukrainian fields (Address line 1/2, ISO country code,
postal code, company, state) plus a billing-address toggle. All of these are replaced with a
simple, Ukraine-appropriate set: name, phone, city, delivery address (free text, e.g. "Нова
Пошта №14"), and optional notes. Nova Poshta API integration is explicitly out of scope — delivery
is processed manually, so we only collect the fields needed by the operator to dispatch the order.

## Scope

### In Scope

- Fix the silent-submit bug by adding an `onInvalid` handler that surfaces the first error.
- Replace the checkout zod schema with a UA-specific field set (remove ISO country / postal code /
  company / state / address2 / billing section / `superRefine`).
- Rebuild `CheckoutAddressForm` and `CheckoutView` to render the simplified form and drop the
  billing toggle entirely for MVP.
- Relax `AddressDto` on the backend so `country` defaults to 'UA' (optional), `phone` is
  required, and `postalCode`/`state`/`address2`/`company` are optional — no Prisma migration
  needed because `shippingAddress` is stored as a JSON snapshot.
- Regenerate Orval types after the DTO change.
- Update `dict.checkout.*` keys in the dictionary for the new Ukrainian field labels.
- Verify the order-confirmation `OrderAddressSummary` widget still renders correctly with the new
  field shape (billing block absent).
- Update the e2e order test (`validAddress` fixture) to match the relaxed `AddressDto` shape.

### Out of Scope

- Nova Poshta API integration (city/branch autocomplete, cost, ETA) — tracked under TASK-080.
- Real payment processing — tracked as parked TASK-034 / TASK-081.
- Any Prisma schema migration (no new columns or tables).
- Changes to `store-admin` order management views.

## User Stories

1. As a Ukrainian customer, I want a checkout form that uses familiar fields (phone, city, Nova
   Poshta branch or address), so that I can complete an order without being confused by
   international fields like "ISO country code" or "postal code".
2. As any customer, I want visible error messages that focus the first invalid field when I click
   "Підтвердити замовлення", so that I always understand why my submission did not go through.
3. As an operator, I want to receive phone, city, and a delivery address with each order, so that
   I can arrange manual shipment via Nova Poshta without additional follow-up.

## Root Cause Analysis

| Layer           | Location                          | Problem                                                                                                                                           |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend schema | `checkout-schema.ts:18`           | `country` is `z.string().length(2)` with no default; user input fails silently                                                                    |
| Frontend form   | `checkout-view.tsx:88`            | `handleSubmit(submitOrder)` — missing second `onInvalid` argument                                                                                 |
| Frontend form   | `checkout-address-form.tsx:69-76` | `country` field rendered with placeholder "напр. UA" only; error shown only in the field row, which is easy to miss in a two-column 10-field form |
| Backend DTO     | `address.dto.ts:63`               | `@Length(2, 2)` on `country`; `phone` is `@IsOptional()`                                                                                          |

## Technical Design

### Data Model

No Prisma schema changes. `shippingAddress` and `billingAddress` on `Order` are `Json` columns
(snapshot) — field relaxation is transparent.

### Backend (NestJS — Clean Architecture)

#### AddressDto (`apps/store-api/src/order/dto/address.dto.ts`)

New contract after the fix:

- `firstName` — required, `@MaxLength(100)`
- `lastName` — required, `@MaxLength(100)`
- `phone` — **required** (was optional), `@MaxLength(30)` — operator needs it for Nova Poshta
- `city` — required, `@MaxLength(100)`
- `address1` — required, `@MaxLength(500)` (holds delivery address or branch; increase limit)
- `country` — **optional**, `@IsOptional()`, defaults to `'UA'` in the DTO via `@Transform`
  or a class property default; remove `@Length(2,2)` constraint
- `company`, `address2`, `state`, `postalCode` — all `@IsOptional()`, no functional change,
  keep for backwards compatibility with any admin tooling that may send them

No other backend files need editing (service and repository treat `shippingAddress` as opaque JSON).

#### No controller / service / repository changes needed.

#### API Contract

`POST /api/orders` request body — `shippingAddress` shape changes:

| Field                          | Before                  | After                                     |
| ------------------------------ | ----------------------- | ----------------------------------------- |
| `phone`                        | optional                | required                                  |
| `country`                      | required, `Length(2,2)` | optional, defaults to 'UA'                |
| `postalCode`                   | required                | optional                                  |
| `address1`                     | required                | required (now carries full delivery text) |
| `company`, `address2`, `state` | optional                | optional (unchanged)                      |

The response shape is unchanged.

### Frontend (Next.js — FSD)

#### `features/checkout/model/checkout-schema.ts`

Replace `addressSchema` and `checkoutSchema` entirely:

```typescript
export const checkoutSchema = z.object({
  firstName: z.string().min(1, dict.checkout.validation.firstName),
  lastName: z.string().min(1, dict.checkout.validation.lastName),
  phone: z.string().min(10, dict.checkout.validation.phone),
  city: z.string().min(1, dict.checkout.validation.city),
  deliveryAddress: z.string().min(1, dict.checkout.validation.deliveryAddress),
  notes: z.string().max(500, dict.checkout.validation.notesMax).optional(),
});

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
```

Remove: `addressSchema`, `billingSameAsShipping`, `billingAddress`, `superRefine`.

#### `features/checkout/model/use-checkout.ts`

Map the new flat `CheckoutFormValues` onto `CreateOrderDto`:

```typescript
const dto: CreateOrderDto = {
  shippingAddress: {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    city: values.city,
    address1: values.deliveryAddress,
    country: "UA", // always UA; backend also defaults to 'UA'
  },
  notes: values.notes || undefined,
  // billingAddress omitted — backend accepts null/undefined (same-as-shipping)
};
```

#### `features/checkout/ui/checkout-address-form.tsx`

Rebuild as a flat list of 5 named inputs (firstName, lastName, phone, city, deliveryAddress).
Remove the `AddressFieldConfig` array approach and the `prefix` abstraction — the billing form no
longer exists. Pass `register` and `errors` directly from `CheckoutFormValues`.

#### `widgets/checkout/ui/checkout-view.tsx`

Key changes:

1. Replace `<CheckoutAddressForm prefix="shippingAddress" ...>` with the new simplified component.
2. Remove `useWatch` for `billingSameAsShipping` and the billing toggle / conditional billing block.
3. Wire `onSubmit`:
   ```typescript
   const onInvalid = (errors: FieldErrors<CheckoutFormValues>) => {
     const firstKey = Object.keys(errors)[0] as keyof CheckoutFormValues;
     if (firstKey) {
       document.getElementById(`checkout-${firstKey}`)?.focus();
     }
   };
   // ...
   <form onSubmit={handleSubmit(submitOrder, onInvalid)} ...>
   ```
4. Update `defaultValues` (remove `billingSameAsShipping: true`).

#### `shared/config/dictionary.ts` (`dict.checkout`)

Add/update keys:

- `fields.phone` — "Номер телефону"
- `fields.deliveryAddress` — "Адреса доставки / відділення Нової Пошти"
- Remove: `fields.company`, `fields.address2`, `fields.state`, `fields.postalCode`,
  `fields.country`, `countryPlaceholder`
- Remove: `billingAddress`, `billingSame`
- `validation.phone` — "Введіть коректний номер телефону (мінімум 10 цифр)"
- `validation.deliveryAddress` — "Адреса доставки є обов'язковою"
- Remove: `validation.country`, `validation.postalCode`, `validation.billingRequired`
- Add: `phonePlaceholder` — "+380XXXXXXXXX"
- Add: `deliveryAddressPlaceholder` — "напр. Нова Пошта №14 або вул. Хрещатик 1"

#### `widgets/order-confirmation/ui/order-address-summary.tsx`

No structural change required. The component already reads optional fields defensively via `?.`
and renders `address1` (which now holds the delivery text), `city`, and `phone`. The `address2`,
`state`, `postalCode`, `country`, `company` blocks only render when their value is present, so
they simply won't appear for new orders. No dict keys used here for field names — renders raw
snapshot values. Verify by manual inspection that the confirmation page looks correct after
TASK-108 lands.

### Orval Regen

After the backend DTO change:

1. Run `npm run generate:api` (or the project alias — see `generate-api` command).
2. Confirm that only the `AddressDto` shape in `**/shared/api/generated/` changes.
3. Never hand-edit generated files.

## Tasks

### TASK-107: Fix silent-submit + relax AddressDto for Ukrainian market

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `phone` is `@IsNotEmpty()` / `@IsString()` / `@MaxLength(30)` — not `@IsOptional()`
- [ ] `country` is `@IsOptional()` with a class-level default `country = 'UA'` or a `@Transform`
      default; the `@Length(2,2)` constraint is removed
- [ ] `postalCode`, `state`, `address2`, `company` remain `@IsOptional()` (no regression)
- [ ] `address1` `@MaxLength` raised to 500
- [ ] The Swagger spec reflects the new contract (visible in `/api/docs`)
- [ ] Existing passing e2e tests still pass: `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/order/dto/address.dto.ts` — relax `country`, make `phone` required, raise `address1` limit

---

### TASK-108: Redesign checkout schema + form for the Ukrainian market

**Type:** fix
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-107

**Acceptance Criteria:**

- [ ] `checkoutSchema` in `checkout-schema.ts` has exactly 6 fields: `firstName`, `lastName`,
      `phone`, `city`, `deliveryAddress`, `notes`; no `addressSchema`, no `superRefine`, no
      `billingSameAsShipping` / `billingAddress`
- [ ] `phone` validated as `z.string().min(10, ...)` with a Ukrainian-readable message
- [ ] `deliveryAddress` required with a Ukrainian-readable message
- [ ] `use-checkout.ts` maps the flat `CheckoutFormValues` onto `CreateOrderDto.shippingAddress`
      correctly (phone, city, address1=deliveryAddress, country='UA'); no `billingAddress`
- [ ] `checkout-address-form.tsx` renders only the 5 required fields plus phone;
      no billing section; field IDs are `checkout-{fieldName}` for the `onInvalid` focus handler
- [ ] `checkout-view.tsx` uses `handleSubmit(submitOrder, onInvalid)`;
      `onInvalid` focuses the first invalid field
- [ ] Billing toggle and billing fieldset are fully removed from `checkout-view.tsx`
- [ ] `dict.checkout` keys are updated: new field labels and placeholders in Ukrainian,
      removed obsolete keys (`countryPlaceholder`, `billingAddress`, `billingSame`,
      `validation.country`, `validation.postalCode`, `validation.billingRequired`)
- [ ] `npm run typecheck` passes across the workspace
- [ ] `npm run lint` passes across the workspace
- [ ] `npm run build` passes for `store-client`

**Files to create/modify:**

- `apps/store-client/src/features/checkout/model/checkout-schema.ts` — replace with UA schema
- `apps/store-client/src/features/checkout/model/use-checkout.ts` — remap fields to DTO
- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` — simplified UA form
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — add `onInvalid`, remove billing
- `apps/store-client/src/shared/config/dictionary.ts` — update `dict.checkout` keys

---

### TASK-109: Regenerate Orval API client after DTO relaxation

**Type:** chore
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-107

**Acceptance Criteria:**

- [ ] `npm run generate:api` runs without error
- [ ] Generated `AddressDto` type in `apps/store-client/src/shared/api/generated/` reflects
      the new optional `country`, required `phone`, raised `address1` length
- [ ] No hand-edits made to any file under `**/shared/api/generated/`
- [ ] `npm run typecheck` passes for `store-client` with the new generated types

**Files to create/modify:**

- `apps/store-client/src/shared/api/generated/**` — auto-generated; do not hand-edit

---

### TASK-110: Update order e2e test fixture to match relaxed AddressDto

**Type:** test
**Scope:** store-api
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-107

**Acceptance Criteria:**

- [ ] `validAddress` fixture in `apps/store-api/test/order.e2e-spec.ts` includes `phone` and
      omits `postalCode`/`country` (now optional) — or keeps them; both are valid
- [ ] The "incomplete nested shippingAddress" test at line 294 still verifies that `firstName`
      alone (without `phone`, `city`, `address1`, `lastName`) is rejected with 400
- [ ] A new negative test case asserts that missing `phone` in `shippingAddress` returns 400
- [ ] All existing order e2e tests remain green: `npm run test:e2e -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/test/order.e2e-spec.ts` — update `validAddress` fixture; add `phone`-required test

---

### TASK-111: Smoke-verify order-confirmation page with new address shape

**Type:** test
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** TASK-108, TASK-109

**Acceptance Criteria:**

- [ ] `OrderAddressSummary` correctly renders `firstName`, `lastName`, `phone`, `city`,
      `address1` (delivery address/branch) from the order snapshot; optional fields
      (`address2`, `state`, `postalCode`, `country`, `company`) absent from new orders
      do not cause rendering errors or empty lines
- [ ] The billing-address block never appears for orders created after the redesign
      (backend stores `null` for `billingAddress` when not supplied)
- [ ] Manual QA on a running stack: complete a new order end-to-end and confirm the
      confirmation page at `/orders/{id}/confirmation` renders the new fields correctly
- [ ] `npm run typecheck` passes
- [ ] Manual QA item §A5 / Режим A point 3 in `docs/manual-qa-master.md` should be
      re-verified and its ❌ items updated to ✅ upon success

**Files to create/modify:**

- `apps/store-client/src/widgets/order-confirmation/ui/order-address-summary.tsx` — inspect
  only; modify `AddressSnapshot` interface if needed to add `phone`/drop unused optional fields
  for clearer code (defensive rendering already in place)

---

## Migration Steps

1. Implement TASK-107 (backend DTO) first — it is the contract source.
2. Run TASK-109 (Orval regen) immediately after TASK-107 so frontend types are in sync.
3. Implement TASK-108 (frontend schema + form + view + dictionary) using the updated generated types.
4. Implement TASK-110 (e2e fixture update) in parallel with or after TASK-108.
5. Implement TASK-111 (smoke/confirmation page) last, once the full flow compiles.
6. After all automated gates pass, re-run the manual QA checklist for §A5.

## Risks & Mitigations

| Risk                                                                                         | Mitigation                                                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Admin order-detail view may show empty billing/address fields after the change               | `OrderAddressSummary` already renders fields conditionally — no regression expected. Verify in manual QA.           |
| Existing orders in the DB have the old address shape (with `country`, `postalCode`)          | Snapshot is read defensively via `?.` — old orders display correctly; no migration needed.                          |
| Orval regen may break unrelated generated types if the API spec drift is large               | Run `git diff` on generated files after regen; check only `AddressDto`-related types changed.                       |
| Making `phone` required on the backend breaks the existing e2e `validAddress` fixture        | Covered explicitly by TASK-110.                                                                                     |
| `forbidNonWhitelisted: true` in `ValidationPipe` may reject old fields sent by admin tooling | `company`, `address2`, `state`, `postalCode` are kept on `AddressDto` as `@IsOptional()` — they pass the whitelist. |

## Notes

- This plan is a combined `fix/` branch (broken submit) + feature-sized redesign (UA form). The
  branch name should be `fix/107-checkout-ua-redesign`.
- The `deliveryAddress` frontend field maps to `address1` in `AddressDto` and in the DB snapshot.
  This mapping is intentional: `address1` is the general-purpose "primary address line" that
  backends and admin panels already know how to display.
- Nova Poshta API integration (TASK-080) will replace `deliveryAddress` free-text with a
  structured city+branch picker when it is implemented. The `address1` field name remains
  compatible with that future shape.
- Manual QA checklist cross-reference: `docs/manual-qa-master.md` §A5 / Режим A points 3–5
  (currently marked ❌) and the user-comment at line 517 ("для доставки треба зробити оформлення
  із api нової пошти... на цьому етапі доставка буде оформлятись вручну") both map to this task.
  Mark those items ✅ after successful end-to-end smoke test.
