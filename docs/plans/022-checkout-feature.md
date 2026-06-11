# Plan 022: Checkout Feature (store-client)

> **Status:** Done
> **Phase:** Phase 3 — Checkout & Orders
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11

## Overview

Build the `/checkout` route in `apps/store-client` — the purchase flow that takes a
logged-in customer from a populated cart to a placed order. The feature collects a shipping
address (and optionally a separate billing address), an optional order note, then calls
`POST /api/orders` via the Orval-generated `useCreateOrder` mutation. On success the cart
query is invalidated (the backend empties the cart on order creation) and the user is
redirected to `/orders/[id]/confirmation` — a stub route created here that TASK-036
(OrderConfirmationPage) fills with the full confirmation UI.

**This plan covers the checkout form and flow only.** The full order-confirmation page UI
(order number display, item summary, estimated delivery, etc.) is TASK-036 and is explicitly
out of scope here.

**Auth gate:** `POST /api/orders` is protected by `JwtAuthGuard` on the backend; unauthenticated
users cannot place orders. The checkout route therefore requires login. An unauthenticated
visitor navigating to `/checkout` is redirected to `/login?redirect=/checkout`. After a
successful login, the LoginForm already calls `router.push("/")` — TASK-035-D updates
`LoginForm` to honour the `redirect` query parameter so the user lands back on `/checkout`.

## Scope

### In Scope

- `entities/order` barrel slice — re-exports `useCreateOrder`, `CreateOrderDto`, `AddressDto`,
  `OrderEntity`, and related generated types from the Orders Orval output
- `features/checkout/` slice:
  - `checkoutSchema` — zod schema mirroring the backend `CreateOrderDto` / `AddressDto`
    validation; includes a `billingSameAsShipping` boolean toggle
  - `CheckoutAddressForm` — `react-hook-form` + zod form component for shipping (and
    optionally billing) address fields
  - `useCheckout` — custom hook encapsulating `useCreateOrder`, cart invalidation, and
    redirect-after-success logic
- `widgets/checkout/` slice:
  - `CheckoutOrderSummary` — read-only cart summary displayed alongside the form
  - `CheckoutView` — client orchestrator: auth-gate, empty-cart guard, form + summary layout,
    submit + error handling
- `app/checkout/page.tsx` — Server Component route; exports `metadata`; wraps `CheckoutView`
  in `<Suspense>`
- `app/orders/[id]/confirmation/page.tsx` — minimal stub route (redirect target after order
  creation) rendering a "Thank you for your order" placeholder; full UI is TASK-036
- Update `widgets/cart/ui/cart-summary.tsx` — replace the disabled "Proceed to Checkout"
  placeholder button with an active `<Link href="/checkout">` CTA
- Update `features/auth/ui/login-form.tsx` — honour `?redirect=` query param so post-login
  navigation returns the user to `/checkout`
- Unit tests for `checkoutSchema` (zod — all validation rules)
- Build/lint/typecheck verification gate

### Out of Scope

- Full order-confirmation page UI: order number, item list, estimated delivery, print button
  (TASK-036 — OrderConfirmationPage)
- Payment integration: Stripe form, payment-intent creation, webhook handling (TASK-034)
- Coupon/discount input (no backend support in current CartTotals)
- Shipping cost calculation or method selection (Phase 3 stretch)
- Tax calculation
- Order history page (`/orders`)
- Admin order management (TASK-041, Phase 4)
- Email notifications (TASK-037)
- Optimistic updates (Phase 5)

### Boundary with TASK-036 (OrderConfirmationPage)

| Responsibility                          | TASK-035 (this plan) | TASK-036              |
| --------------------------------------- | -------------------- | --------------------- |
| `POST /api/orders` mutation             | Yes                  | No                    |
| Cart invalidation after order           | Yes                  | No                    |
| Redirect to `/orders/[id]/confirmation` | Yes (initiates)      | No                    |
| Stub confirmation route (page file)     | Yes (minimal)        | Replaces stub with UI |
| Order number, items, total display      | No                   | Yes                   |
| "Continue shopping" / print CTA         | No                   | Yes                   |

## User Stories

1. As a logged-in customer with items in my cart, I want to enter my shipping address and
   place an order, so that I can complete my purchase.
2. As a logged-in customer, I want to optionally provide a separate billing address or
   order notes, so that I can handle billing-address-differs and add delivery instructions.
3. As an unauthenticated visitor who navigates to `/checkout`, I want to be redirected to
   the login page (with a `redirect` query param) so that after signing in I return to
   checkout without having to navigate back manually.
4. As a logged-in customer with an empty cart who navigates to `/checkout`, I want to be
   sent back to `/cart` automatically, so that I cannot accidentally submit an empty order.
5. As a customer, I want inline field validation errors to appear as I fill in the form,
   so that I can correct mistakes before submitting.
6. As a customer, I want a read-only summary of my cart items and totals next to the form,
   so that I can confirm what I am paying before clicking "Place order".
7. As a customer, I want to see a friendly error message if the order fails (e.g. stock
   changed), so that I know what went wrong and can act accordingly.
8. As a customer on the cart page, I want the "Proceed to Checkout" button to be active and
   link to `/checkout`, so that I can proceed from the cart summary.

## Technical Design

### No Prisma Changes

This is a pure frontend task. No Prisma schema changes are required. The Order backend
(TASK-033) and the Orval regeneration (TASK-033-J) are already complete.

### API Contract

The checkout form submits to the existing Order endpoint:

| Method | Path          | Hook             | Auth     | Request Body     | Response                                    |
| ------ | ------------- | ---------------- | -------- | ---------------- | ------------------------------------------- |
| POST   | `/api/orders` | `useCreateOrder` | Required | `CreateOrderDto` | `CreateOrder201` (`{ data?: OrderEntity }`) |

The mutation variable shape (from `orders.ts`):

```ts
useCreateOrder.mutate({ data: CreateOrderDto });
```

`CreateOrderDto` (from generated model):

```ts
interface CreateOrderDto {
  shippingAddress: AddressDto;
  billingAddress?: AddressDto; // omit when same as shipping
  notes?: string; // maxLength 500
}

interface AddressDto {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string; // ISO-3166-1 alpha-2, e.g. "UA", "US"
  phone?: string;
}
```

On success the response is `CreateOrder201`:

```ts
type CreateOrder201 = OrderResponseEnvelope & { data?: OrderEntity };
// OrderEntity.id is the UUID used to navigate to /orders/[id]/confirmation
```

### Zod Schema Design

```ts
const addressSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string().optional(),
  address1: z.string().min(1, "Address line 1 is required"),
  address2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().length(2, "Country must be a 2-letter ISO code"),
  phone: z.string().optional(),
});

export const checkoutSchema = z
  .object({
    shippingAddress: addressSchema,
    billingSameAsShipping: z.boolean().default(true),
    billingAddress: addressSchema.optional(),
    notes: z
      .string()
      .max(500, "Notes must be 500 characters or fewer")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.billingSameAsShipping && !data.billingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingAddress"],
        message: "Billing address is required when it differs from shipping.",
      });
    }
  });

export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
```

### FSD Architecture

```
app/
  checkout/
    page.tsx                          — Server Component; exports metadata; wraps CheckoutView
  orders/
    [id]/
      confirmation/
        page.tsx                      — Stub Server Component (replaced by TASK-036)

widgets/
  checkout/
    ui/
      checkout-order-summary.tsx      — 'use client'; reads cart via useGetCart; read-only display
      checkout-view.tsx               — 'use client'; orchestrates auth-gate + form + summary
    index.ts                          — barrel

features/
  checkout/
    model/
      checkout-schema.ts             — zod schema + CheckoutFormValues type (no 'use client')
      use-checkout.ts                — 'use client'; encapsulates useCreateOrder + side-effects
    ui/
      checkout-address-form.tsx      — 'use client'; react-hook-form controlled section
    index.ts                          — barrel

entities/
  order/
    index.ts                          — barrel re-exporting Order types + hooks
```

### Server vs Client Split

| File                                             | Type    | Rationale                                                     |
| ------------------------------------------------ | ------- | ------------------------------------------------------------- |
| `app/checkout/page.tsx`                          | Server  | Static route; exports metadata; no data fetching              |
| `app/orders/[id]/confirmation/page.tsx`          | Server  | Dynamic route; no client state needed at stub level           |
| `widgets/checkout/ui/checkout-view.tsx`          | Client  | Calls `useGetCart`, `useAuth`; manages auth-gate redirect     |
| `widgets/checkout/ui/checkout-order-summary.tsx` | Client  | Calls `useGetCart`; reactively shows live cart totals + items |
| `features/checkout/model/checkout-schema.ts`     | Pure TS | Zod schemas; importable on server or client                   |
| `features/checkout/model/use-checkout.ts`        | Client  | Calls `useCreateOrder`, `useQueryClient`, `useRouter`         |
| `features/checkout/ui/checkout-address-form.tsx` | Client  | `useForm`; renders controlled address fieldset                |

### Auth-Gate Strategy

`CheckoutView` reads `{ isAuthenticated, isInitializing }` from `useAuth()`:

- While `isInitializing === true`: render a loading skeleton (the silent refresh is still
  in-flight; we cannot yet know the auth state).
- When `isInitializing === false && !isAuthenticated`: call
  `router.replace('/login?redirect=/checkout')` and render nothing (or a skeleton while
  the navigation completes). Uses `useEffect` — same pattern as `LoginForm`'s
  "already signed in" redirect.
- When `isAuthenticated === true`: proceed to the cart-emptiness check.

The `LoginForm` is updated (TASK-035-D) to read `searchParams.get('redirect')` and, if
present, navigate there instead of `"/"` on success.

### Empty-Cart Guard

After auth passes, `CheckoutView` reads the cart via `useGetCart`. If the cart has zero
items, it calls `router.replace('/cart')` and renders nothing. This prevents an
authenticated user from submitting an empty order (the backend would also reject with 400,
but the guard provides a better UX).

### useCheckout Hook

```ts
// features/checkout/model/use-checkout.ts
export function useCheckout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useCreateOrder({
    mutation: {
      onSuccess: (res) => {
        const orderId = res?.data?.id;
        // Invalidate cart — backend already emptied it; keep UI in sync
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        // Navigate to confirmation stub (TASK-036 fills this page)
        if (orderId) {
          router.push(`/orders/${orderId}/confirmation`);
        } else {
          router.push("/");
        }
      },
    },
  });

  const submitOrder = (values: CheckoutFormValues) => {
    const dto: CreateOrderDto = {
      shippingAddress: values.shippingAddress,
      billingAddress: values.billingSameAsShipping
        ? undefined
        : values.billingAddress,
      notes: values.notes || undefined,
    };
    mutation.mutate({ data: dto });
  };

  return {
    submitOrder,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
```

### CheckoutView Orchestrator

```
CheckoutView
  ├── [isInitializing]  → <CheckoutSkeleton /> (or CartSkeleton reused)
  ├── [!isAuthenticated] → router.replace('/login?redirect=/checkout')
  ├── [cart.items.length === 0] → router.replace('/cart')
  └── [ready]
        ├── <section> (form column, lg:col-span-2)
        │     <h1>Checkout</h1>
        │     <CheckoutAddressForm ... />  (shipping; conditionally billing)
        │     <notes textarea>
        │     [server error banner if mutation.isError]
        │     <button type="submit"> Place order / Placing…
        └── <aside> (summary column, lg:col-span-1)
              <CheckoutOrderSummary />
```

### CheckoutAddressForm Component

Receives `control`, `register`, `errors`, and a `prefix` prop (`"shippingAddress"` or
`"billingAddress"`) so it can be reused for both address sections without duplication.
The `billingSameAsShipping` checkbox toggles a second `<CheckoutAddressForm>` for the
billing address section.

### CheckoutOrderSummary Component

Calls `useGetCart()` — the same query already populated by `CartView` — so no extra
network round-trip is incurred (TanStack Query caches the result). Displays:

- List of `items[].productName`, `items[].variantName`, `items[].quantity x items[].price`
- Subtotal
- "Items may have changed since you last viewed your cart" note

### Testing Strategy

Following the **frontend-testing** skill and the `features/auth/` convention (LoginForm has
no unit test file — tests are deferred to integration/E2E in this project), the primary
automated test target for TASK-035 is the **zod schema** (`checkout-schema.ts`), which
contains all the pure validation logic and is trivially unit-testable without React.

Test file: `apps/store-client/src/features/checkout/model/checkout-schema.test.ts`

Test cases (all verifiable with `z.safeParse`):

1. Valid full payload (shipping + billing + notes) passes
2. Valid minimal payload (shipping only, `billingSameAsShipping: true`) passes
3. Missing required `shippingAddress.firstName` fails with correct message
4. `country` with length != 2 fails with "Country must be a 2-letter ISO code"
5. `notes` exceeding 500 characters fails
6. `billingSameAsShipping: false` with no `billingAddress` fails with custom message
7. `billingSameAsShipping: false` with a valid `billingAddress` passes
8. Optional fields (`company`, `address2`, `state`, `phone`) absent → passes

No React component tests are added for this plan (consistent with how `LoginForm` has no
test file). Full checkout flow coverage is deferred to a future E2E suite.

## Tasks

---

### TASK-035-A: Create entities/order barrel slice

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-033-J (Orval hooks for Orders already regenerated)

**Acceptance Criteria:**

- [ ] `src/entities/order/index.ts` created and exports the following as `type` re-exports
      from `@/shared/api/generated/models`:
  - `OrderEntity`, `OrderItemEntity`, `OrderListResponseEnvelope`, `OrderResponseEnvelope`
  - `CreateOrderDto`, `AddressDto`
  - `CreateOrder201`, `GetOrder200`, `CancelOrder200`
- [ ] `src/entities/order/index.ts` exports the following (value exports) from
      `@/shared/api/generated/orders/orders`:
  - `useCreateOrder`, `useGetOrders`, `useGetOrder`, `useCancelOrder`
  - `getGetOrdersQueryKey`, `getGetOrderQueryKey`
- [ ] `src/entities/index.ts` updated to add `export * from "./order"` alongside existing
      product, category, cart, and session exports
- [ ] No export naming conflicts with existing entity barrels (verify with typecheck)
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/entities/order/index.ts` — new file
- `apps/store-client/src/entities/index.ts` — add `export * from "./order"`

---

### TASK-035-B: Create checkout zod schema and unit tests

**Type:** feat + test
**Scope:** store-client
**Complexity:** M (2h)
**TDD Required:** Yes
**Depends on:** TASK-035-A

**Acceptance Criteria:**

- [ ] `src/features/checkout/model/checkout-schema.ts` created; no `'use client'` directive
      (pure TS, safe to import on server or client)
- [ ] File exports:
  - `addressSchema` — zod object with fields matching `AddressDto`; all optional fields
    declared with `.optional()`; `country` validated with `.length(2, ...)`
  - `checkoutSchema` — zod object with `shippingAddress`, `billingSameAsShipping` (default
    `true`), `billingAddress` (optional), `notes` (optional, max 500); `superRefine` rule
    requires `billingAddress` when `billingSameAsShipping === false`
  - `CheckoutFormValues` — type alias `z.infer<typeof checkoutSchema>`
- [ ] `src/features/checkout/model/checkout-schema.test.ts` created; all 8 test cases
      described in the Testing Strategy section pass using `z.safeParse`:
  1. Valid full payload passes
  2. Valid minimal payload (shipping only, `billingSameAsShipping: true`) passes
  3. Missing `shippingAddress.firstName` fails
  4. `country.length !== 2` fails with correct message
  5. `notes` > 500 chars fails
  6. `billingSameAsShipping: false` + no `billingAddress` fails with custom message
  7. `billingSameAsShipping: false` + valid `billingAddress` passes
  8. All optional address fields absent in an otherwise valid payload passes
- [ ] `npm test -- --testPathPattern=checkout-schema -w apps/store-client` exits 0
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/model/checkout-schema.ts` — new file
- `apps/store-client/src/features/checkout/model/checkout-schema.test.ts` — new file

---

### TASK-035-C: Create features/checkout/model/useCheckout hook

**Type:** feat
**Scope:** store-client
**Complexity:** M (2h)
**TDD Required:** No
**Depends on:** TASK-035-A, TASK-035-B

**Acceptance Criteria:**

- [ ] `src/features/checkout/model/use-checkout.ts` is a `'use client'` module
- [ ] Imports `useCreateOrder` from `@/entities/order` (not from the generated path directly)
- [ ] Imports `getGetCartQueryKey` from `@/entities/cart` for cache invalidation
- [ ] Imports `CreateOrderDto`, `CheckoutFormValues`, `checkoutSchema` types from the
      appropriate local / entity paths
- [ ] Exports `useCheckout()` hook returning:
  - `submitOrder(values: CheckoutFormValues): void` — builds `CreateOrderDto` from form values
    (omits `billingAddress` when `billingSameAsShipping === true`, omits `notes` when empty),
    then calls `mutation.mutate({ data: dto })`
  - `isPending: boolean`
  - `isError: boolean`
  - `errorMessage: string | null` — derived from `mutation.error`; surfaces `400` as
    "Some items may no longer be available. Please review your cart." and any other error as
    "Something went wrong. Please try again."
- [ ] On `onSuccess`: calls
      `queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` then
      `router.push('/orders/${orderId}/confirmation')` where `orderId = res?.data?.id`;
      falls back to `router.push('/')` if `orderId` is absent
- [ ] No direct Axios/fetch calls — uses Orval hook exclusively
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/model/use-checkout.ts` — new file

---

### TASK-035-D: Update LoginForm to honour redirect query param

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-052-H (login page already exists with `?redirect=` pattern implied)

**Acceptance Criteria:**

- [ ] `src/features/auth/ui/login-form.tsx` updated; the `onSuccess` callback reads the
      `redirect` query parameter from `useSearchParams()`
- [ ] When `redirect` is a non-empty string starting with `"/"` (basic safety check),
      `router.push(redirect)` is called instead of `router.push("/")`
- [ ] When no `redirect` param is present, behaviour is unchanged (`router.push("/")`)
- [ ] The component remains a `'use client'` component; `useSearchParams()` is imported
      from `"next/navigation"`
- [ ] `LoginPage` (`app/(auth)/login/page.tsx`) is wrapped in `<Suspense>` if it is not
      already, because `useSearchParams()` suspends during SSR — verify and add the wrapper
      if needed
- [ ] Navigating to `/login?redirect=/checkout` after login sends the user to `/checkout`
      (verifiable by manual smoke test)
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/login-form.tsx` — add `useSearchParams` + redirect logic
- `apps/store-client/src/app/(auth)/login/page.tsx` — wrap `LoginForm` in `<Suspense>` if needed

---

### TASK-035-E: Create features/checkout/ui/CheckoutAddressForm

**Type:** feat
**Scope:** store-client
**Complexity:** M (3h)
**TDD Required:** No
**Depends on:** TASK-035-B

**Acceptance Criteria:**

- [ ] `src/features/checkout/ui/checkout-address-form.tsx` is a `'use client'` component
- [ ] Props:
  - `control: Control<CheckoutFormValues>` — from `react-hook-form`
  - `register: UseFormRegister<CheckoutFormValues>`
  - `errors: FieldErrors<CheckoutFormValues>`
  - `prefix: "shippingAddress" | "billingAddress"` — used to scope field names e.g.
    `register(\`${prefix}.firstName\`)`
  - `legend: string` — e.g. "Shipping address" or "Billing address"; rendered as
    `<legend>` inside a `<fieldset>`
- [ ] Renders a `<fieldset>` with a `<legend>` for the address section; improves a11y
      and groups related fields semantically
- [ ] Renders labelled inputs for all 10 `AddressDto` fields:
  - `firstName` (required), `lastName` (required)
  - `company` (optional — label includes "(optional)")
  - `address1` (required), `address2` (optional)
  - `city` (required), `state` (optional), `postalCode` (required)
  - `country` (required — `<input>` with `placeholder="e.g. UA"`, max 2 chars)
  - `phone` (optional)
- [ ] Each required field shows a `<p role="alert" className="text-sm text-destructive">`
      when the corresponding zod error is present (same pattern as `LoginForm`)
- [ ] Each `<input>` has:
  - A matching `<label htmlFor={id}>`
  - An `id` derived from `prefix + field name` to avoid DOM id collisions when both
    shipping and billing forms are rendered simultaneously
  - Appropriate `autoComplete` attribute (`given-name`, `family-name`, `address-line1`,
    `address-line2`, `address-level2`, `address-level1`, `postal-code`, `country`, `tel`)
  - `className` using design tokens only (`border-border bg-background text-foreground
focus-visible:ring-ring` etc.) — same fieldClass pattern as `LoginForm`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` — new file

---

### TASK-035-F: Create widgets/checkout/CheckoutOrderSummary

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-035-A

**Acceptance Criteria:**

- [ ] `src/widgets/checkout/ui/checkout-order-summary.tsx` is a `'use client'` component
- [ ] Calls `useGetCart()` from `@/entities/cart` — no props needed (reuses the cached query)
- [ ] While `isLoading`: renders a `<Skeleton>` placeholder for the summary panel
- [ ] On `isError`: renders a `<p role="alert">` message "Could not load cart summary."
- [ ] When `data?.data?.items.length > 0`: renders:
  - Heading `"Order Summary"` as `<h2>`
  - For each `CartItemEntity` in `items`: one row with `productName`, optional
    `variantName`, `quantity x price` (both sides), and `lineTotal` formatted as USD
  - A `<hr>` separator
  - Subtotal row: "Subtotal" label + `totals.subtotal` formatted as USD
  - A note in `text-sm text-muted-foreground`:
    "Prices shown reflect your cart at this moment."
- [ ] No mutation calls — read-only display
- [ ] Design tokens only; no raw hex values
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx` — new file
- `apps/store-client/src/widgets/checkout/index.ts` — new barrel; exports
  `CheckoutOrderSummary`, `CheckoutView` (added in TASK-035-G)

---

### TASK-035-G: Create widgets/checkout/CheckoutView orchestrator

**Type:** feat
**Scope:** store-client
**Complexity:** L (4-6h)
**TDD Required:** No
**Depends on:** TASK-035-C, TASK-035-D, TASK-035-E, TASK-035-F

**Acceptance Criteria:**

- [ ] `src/widgets/checkout/ui/checkout-view.tsx` is a `'use client'` component
- [ ] Reads `{ isAuthenticated, isInitializing }` from `useAuth()` (imported from
      `@/entities/session`)

  **While `isInitializing`:**
  - Renders `<CartSkeleton />` from `@/widgets/cart` as a loading placeholder while the
    silent token refresh is in-flight (avoids a flash-redirect to login for users who are
    actually logged in)

  **When `!isAuthenticated` (after init):**
  - Calls `router.replace('/login?redirect=/checkout')` inside a `useEffect`
  - Renders `null` (or a minimal skeleton) while navigation completes

  **When `isAuthenticated`:**
  - Calls `useGetCart()` from `@/entities/cart`
  - While cart is loading: renders `<CartSkeleton />`
  - When cart has 0 items (after load): calls `router.replace('/cart')` and renders nothing
  - When cart is populated: renders the checkout layout (see below)

- [ ] Checkout layout (two-column on `lg:`, single-column on mobile):
  - Left column (`lg:col-span-2`):
    - `<h1 className="text-2xl font-bold text-foreground">Checkout</h1>`
    - A `<form onSubmit={handleSubmit(onSubmit)}>`
    - `<CheckoutAddressForm prefix="shippingAddress" legend="Shipping address" .../>`
    - A checkbox row: `<input type="checkbox" {...register("billingSameAsShipping")} />`
      with label "Billing address same as shipping"
    - When `billingSameAsShipping === false`: `<CheckoutAddressForm prefix="billingAddress"
legend="Billing address" .../>`
    - A `<textarea {...register("notes")} rows={3} maxLength={500} />` with label "Order
      notes (optional)" and a live character count `{notes.length}/500`
    - When `isError`: `<p role="alert" className="text-destructive">{errorMessage}</p>`
      rendered above the submit button
    - `<button type="submit" disabled={isPending}>` with label "Place order" (pending:
      "Placing order…"); styled `bg-primary text-primary-foreground rounded-lg px-6 py-3
font-semibold`; disabled and `opacity-50` when pending
  - Right column (`lg:col-span-1`):
    - `<CheckoutOrderSummary />`
- [ ] Uses `useCheckout()` from `@/features/checkout` for `submitOrder`, `isPending`,
      `isError`, `errorMessage`
- [ ] Uses `useForm<CheckoutFormValues>({ resolver: zodResolver(checkoutSchema) })` for
      form state management
- [ ] FSD respected: `widgets/checkout` imports from `features/checkout`, `entities/session`,
      `entities/cart`, and `shared`; never from `app`
- [ ] `src/widgets/checkout/index.ts` updated to export `CheckoutView`
- [ ] `src/widgets/index.ts` updated to export `CheckoutView` (and `CheckoutOrderSummary`
      if needed directly)
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — new file
- `apps/store-client/src/widgets/checkout/index.ts` — update barrel
- `apps/store-client/src/widgets/index.ts` — add `CheckoutView` export

---

### TASK-035-H: Create features/checkout barrel and update features/index.ts

**Type:** chore
**Scope:** store-client
**Complexity:** S (15min)
**TDD Required:** No
**Depends on:** TASK-035-E, TASK-035-C

**Acceptance Criteria:**

- [ ] `src/features/checkout/index.ts` created; exports:
  - `CheckoutAddressForm` from `./ui/checkout-address-form`
  - `useCheckout` from `./model/use-checkout`
  - `checkoutSchema`, `CheckoutFormValues` from `./model/checkout-schema`
- [ ] `src/features/index.ts` updated to add `CheckoutAddressForm` and `useCheckout` exports
      (following the existing named-export pattern, not wildcard)
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/index.ts` — new file
- `apps/store-client/src/features/index.ts` — add checkout exports

---

### TASK-035-I: Create app/checkout/page.tsx route

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-035-G, TASK-035-H

**Acceptance Criteria:**

- [ ] `src/app/checkout/page.tsx` created as a Server Component (no `'use client'`)
- [ ] Exports static `metadata`:
  ```ts
  export const metadata: Metadata = {
    title: "Checkout | MobileStore",
    description: "Complete your purchase.",
  };
  ```
- [ ] Renders:
  ```tsx
  <div className="mx-auto w-full max-w-7xl px-4 py-8">
    <Suspense fallback={<CartSkeleton />}>
      <CheckoutView />
    </Suspense>
  </div>
  ```
- [ ] `CheckoutView` imported from `@/widgets`; `CartSkeleton` imported from `@/widgets`
- [ ] Does NOT add a second `<main>` — root layout provides it
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/app/checkout/page.tsx` — new file

---

### TASK-035-J: Create app/orders/[id]/confirmation/page.tsx stub

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-035-I

**Acceptance Criteria:**

- [ ] `src/app/orders/[id]/confirmation/page.tsx` created as a Server Component
- [ ] Accepts `params: Promise<{ id: string }>` per Next.js App Router convention (params
      is a Promise in the version used by this project — see existing `[slug]` pattern)
- [ ] Exports `generateMetadata` returning `{ title: "Order Confirmed | MobileStore" }`
- [ ] Renders a minimal placeholder UI:
  - `<h1>Thank you for your order!</h1>`
  - `<p>Your order <strong>{id}</strong> has been placed.</p>`
  - `<p>Full order details coming soon.</p>` (TASK-036 replaces this content)
  - A `<Link href="/">Continue shopping</Link>` button
- [ ] This stub is the redirect target that `useCheckout.onSuccess` navigates to; it must
      render without crashing to validate the end-to-end redirect
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/app/orders/[id]/confirmation/page.tsx` — new file

---

### TASK-035-K: Update CartSummary — activate Proceed to Checkout button

**Type:** feat
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-035-I (checkout route must exist before linking to it)

**Acceptance Criteria:**

- [ ] `src/widgets/cart/ui/cart-summary.tsx` updated: the disabled `<button>` placeholder
      "Proceed to Checkout" is replaced with an active `<Link href="/checkout">` styled
      identically to the old button (`bg-primary text-primary-foreground rounded-lg w-full
    px-6 py-3 font-semibold text-center`) but no longer `disabled` or `cursor-not-allowed`
- [ ] The `Link` is imported from `next/link`
- [ ] The `aria-label="Checkout — coming in a future update"` is removed; replace with
      `aria-label="Proceed to checkout"`
- [ ] When the cart is empty, the checkout button should still appear but navigate to
      `/checkout` — `CheckoutView` redirects back to `/cart` for empty carts, so no extra
      guard is needed here
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-summary.tsx` — replace disabled button with Link

---

### TASK-035-L: Build / lint / typecheck verification

**Type:** test
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** TASK-035-A through TASK-035-K

**Acceptance Criteria:**

- [ ] `npm run test -- --testPathPattern=checkout-schema -w apps/store-client` exits 0
      (schema unit tests all pass)
- [ ] `npm run typecheck -w apps/store-client` exits 0 (no TypeScript errors)
- [ ] `npm run lint -w apps/store-client` exits 0 (no ESLint errors; FSD boundary rules
      satisfied)
- [ ] `npm run build -w apps/store-client` exits 0 (production build succeeds)
- [ ] Manual smoke test (requires running API + DB):
  - Guest visits `/checkout` → redirected to `/login?redirect=/checkout`
  - After login → lands on `/checkout`
  - Empty cart while on `/checkout` → redirected to `/cart`
  - Populated cart: form renders with shipping address section, billing-same-as-shipping
    checkbox checked, order notes textarea
  - Unchecking billing checkbox reveals billing address section
  - Submitting with missing required field shows inline zod error
  - Successful submit → navigates to `/orders/[id]/confirmation` stub page
  - Cart page "Proceed to Checkout" button is now a link to `/checkout`

**Files to create/modify:**

- No new files; verification only

---

## Migration Steps (implementation order)

1. **TASK-035-A** — entities/order barrel (no UI risk; enables all imports downstream)
2. **TASK-035-B** — zod schema + unit tests (TDD; pure TS; run tests immediately)
3. **TASK-035-C** — `useCheckout` hook (depends on A + B; no UI to render yet)
4. **TASK-035-D** — `LoginForm` redirect update (independent; small scope; low risk)
5. **TASK-035-E** — `CheckoutAddressForm` component (depends on B only)
6. **TASK-035-F** — `CheckoutOrderSummary` widget (depends on A; can be built in parallel
   with E)
7. **TASK-035-G** — `CheckoutView` orchestrator (depends on C, D, E, F)
8. **TASK-035-H** — `features/checkout` barrel update (depends on C, E)
9. **TASK-035-I** — `app/checkout/page.tsx` route (depends on G, H)
10. **TASK-035-J** — confirmation stub route (depends on I)
11. **TASK-035-K** — CartSummary link update (depends on I — route must exist)
12. **TASK-035-L** — full build/lint/typecheck/smoke gate

Steps 5 and 6 can be developed in parallel by two developers.

## Risks and Mitigations

| Risk                                                                                                                                                                                                                      | Mitigation                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isInitializing` flash: `AuthProvider` briefly shows loading state on every page load while the silent refresh fires. Without a guard, `CheckoutView` would redirect unauthenticated for ~200ms even for logged-in users. | Guard on `isInitializing`: render skeleton while `true`; only redirect when `isInitializing === false && !isAuthenticated`. Same pattern as documented in `auth.context.tsx`.           |
| `useSearchParams()` in `LoginForm` requires the component tree to be wrapped in `<Suspense>`. Without it, Next.js will throw in production builds.                                                                        | TASK-035-D explicitly checks for and adds a `<Suspense>` wrapper around `LoginForm` in the login page if absent.                                                                        |
| `CreateOrder201.data` may be `undefined` due to the weak `OrderResponseEnvelope` type. Accessing `.id` without narrowing crashes at runtime.                                                                              | `useCheckout` uses optional chaining `res?.data?.id` and falls back to `router.push('/')` when `orderId` is absent. Documented in TASK-035-C acceptance criteria.                       |
| Empty-cart race: cart may momentarily appear empty during the initial loading state before `useGetCart` resolves. Premature redirect to `/cart` would discard the checkout form.                                          | Only redirect to `/cart` when `isLoading === false && items.length === 0`. While `isLoading === true`, render the skeleton.                                                             |
| FSD boundary violation: `CheckoutView` in `widgets/` must not import from `app/`.                                                                                                                                         | ESLint `import/no-restricted-paths` rule is already configured. Verify with `npm run lint`.                                                                                             |
| Tailwind class collisions with the `fieldClass` string in `LoginForm`.                                                                                                                                                    | `CheckoutAddressForm` defines its own `fieldClass` const locally — same value, no shared module. Consistent with the existing pattern in `LoginForm` and `RegisterForm`.                |
| `billingSameAsShipping` default `true` means the billing address fields are hidden on initial render. Submitting without revealing them should produce a valid `CreateOrderDto` with no `billingAddress`.                 | `useCheckout.submitOrder` conditionally omits `billingAddress` when `billingSameAsShipping === true`. Unit-tested in `checkout-schema.test.ts` (case 2).                                |
| `country` field is a free text input — users may type "Ukraine" instead of "UA".                                                                                                                                          | Add `maxLength={2}` attribute, `placeholder="e.g. UA"`, and the zod `.length(2)` validator with a clear error message. A `<select>` with all ISO countries is a Phase 5 UX improvement. |
| The confirmation stub (`TASK-035-J`) may conflict with TASK-036 when that plan later creates the same file.                                                                                                               | The stub is intentionally a minimal placeholder. TASK-036 overwrites it with the full implementation. Document the stub nature clearly in the file header.                              |

## Notes

### Exact Generated Hook Names for Orders

From `apps/store-client/src/shared/api/generated/orders/orders.ts` (do not hand-edit):

| Export                 | Type              | Usage                                              |
| ---------------------- | ----------------- | -------------------------------------------------- |
| `useCreateOrder`       | mutation hook     | Creates order; variable `{ data: CreateOrderDto }` |
| `useGetOrders`         | query hook        | Lists user's orders                                |
| `useGetOrder`          | query hook        | Gets single order; requires `orderId: string`      |
| `useCancelOrder`       | mutation hook     | Cancels a pending order                            |
| `getGetOrdersQueryKey` | query key factory | For invalidating orders list                       |
| `getGetOrderQueryKey`  | query key factory | For invalidating single order                      |

`useCreateOrder` mutation variable shape (confirmed from generated code):

```ts
mutation.mutate({ data: createOrderDto });
// NOT mutation.mutate(createOrderDto) — the variable is { data: ... }
```

### Cart Invalidation Pattern

Following the established pattern in `LoginForm` (TASK-052-D), `useCheckout` must call:

```ts
queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
```

This ensures `CartView`, `CheckoutOrderSummary`, and the header cart badge (future) all
reflect the empty post-order state without a page reload.

### LoginForm Redirect Parameter Contract

The updated `LoginForm` reads `useSearchParams().get('redirect')`. The safety check
`redirect.startsWith('/')` prevents open-redirect attacks (never navigate to an external
URL from a query param). The value `/checkout` starts with `/`, so it passes.

### Scope Boundary Summary (TASK-035 vs TASK-036)

TASK-035 ends the moment the user's browser navigates to
`/orders/[id]/confirmation` — the stub renders "Thank you for your order" with the order
ID in plain text. TASK-036 replaces that stub with the full confirmation UI: formatted
order details, item list, totals breakdown, delivery estimate, and CTAs. No code written in
TASK-035 needs to change when TASK-036 is implemented — the stub page file is simply
overwritten.
