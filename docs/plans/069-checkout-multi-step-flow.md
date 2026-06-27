# Plan: Checkout Multi-Step Flow

> **Status:** 🔄 In Progress
> **Phase:** Phase 3 — Checkout & Orders (Tier 2 — Critical Functional Bug)
> **Created:** 2026-06-27
> **BACKLOG task:** TASK-146

---

## Overview

The checkout page (`/checkout`) renders a `CheckoutStepIndicator` with three steps
("Доставка / Перевірка / Підтвердження") that are entirely cosmetic. The indicator is
hardcoded to `current={1}` at line 106 of `checkout-view.tsx` and never updates. The
single `<form>` submits the order directly on the first (and only) screen, bypassing
any review or confirm phase.

This plan implements Option A — a real two-screen multi-step flow within the checkout
page — so the UI matches what the step indicator promises.

The change is **frontend-only**: no Prisma migration, no new backend endpoint, no Orval
regeneration. The existing `useCheckout` hook and `POST /api/orders` are called
unchanged on the final confirm action.

---

## Scope

### In Scope

- New `useCheckoutSteps` hook (`features/checkout/model`) that manages the `step`
  state (`1 | 2`), exposes `goToReview()` (validates delivery fields via `form.trigger`
  before advancing) and `goToDelivery()` (goes back).
- Wire the hook into `CheckoutView` (`widgets/checkout/ui`): replace the hardcoded
  `current={1}` with the live `step` value.
- Step 1 (Доставка): shows the existing `CheckoutAddressForm`, the notes textarea,
  and a "Далі" button (`type="button"`).
- Step 2 (Перевірка): shows a new read-only `CheckoutReviewStep` component and two
  buttons — "Назад" (`type="button"`) and "Підтвердити замовлення" (`type="submit"`).
- New `CheckoutReviewStep` component (`features/checkout/ui`) that renders entered
  delivery data in read-only form using `useWatch`.
- Dictionary additions for "Далі", "Назад", and the review heading.
- Updated and new tests in `checkout-view.test.tsx`.
- Focus management when advancing to step 2.

### Out of Scope

- Option B (collapse to one honest step) — see the Design Considerations section for
  the reasoning behind rejecting it.
- Step 3 ("Підтвердження") as a distinct checkout-page screen: the existing
  `/orders/[id]/confirmation` page already serves as step 3. The `CheckoutStepIndicator`
  on the checkout page advances to `current={2}` at most; the confirmation page is a
  separate route.
- Backend, Prisma schema, or Orval changes — none required.
- Surfacing the `CheckoutStepIndicator` on the confirmation page with `current={3}` —
  that is a cosmetic improvement tracked separately.
- Payment step — payments are deferred (TASK-034/TASK-081 parked).
- Profile-form phone masking — out of scope (TASK-135 follow-on).

---

## User Stories

1. As a customer at checkout, I want to fill in my delivery details and then review a
   summary of my order before placing it, so I can catch mistakes before confirming.
2. As a customer on the review screen, I want to go back and correct a detail without
   losing my other entries, so I am not forced to re-type everything.
3. As a customer, I want the progress indicator to reflect which step I am actually on,
   so I can see where I am in the checkout process.
4. As a customer, I want the "Підтвердити замовлення" button to appear only when I am
   ready to place the order (not on the first screen), so an accidental tap does not
   create an unwanted order.

---

## Current-State Findings

### checkout-view.tsx

`apps/store-client/src/widgets/checkout/ui/checkout-view.tsx`

- **Line 51–53** — `useForm` destructures `register`, `handleSubmit`, `control`,
  `reset`, `setValue`, `setFocus`; `trigger` is NOT destructured (needed for per-step
  validation in TASK-146-A).
- **Line 56** — `useCheckoutPrefill(reset, isAuthenticated)` — prefill hook wired
  (TASK-135, already shipped).
- **Line 58** — `const notes = useWatch({ control, name: "notes" }) ?? ""` — drives
  the character count on the notes textarea.
- **Line 60** — `const npCityRef = useWatch({ control, name: "npCityRef" })` — drives
  the live NP shipping estimate in the aside; must stay on all steps.
- **Line 64–69** — `focusFirstError` callback: focuses the first invalid field on a
  failed submit. On the multi-step form this only fires on step 2's submit; the step-1
  "Далі" handler must handle its own validation errors separately (see Risk 2).
- **Line 106** — `<CheckoutStepIndicator current={1} />` — **the bug**. Hardcoded; must
  become `current={step}`.
- **Line 108** — `<form onSubmit={handleSubmit(submitOrder, focusFirstError)}>` — the
  single form. Retained across both steps; the submit handler fires only when the step-2
  "Підтвердити замовлення" button (`type="submit"`) is clicked.
- **Lines 113–119** — `<CheckoutAddressForm>` rendered unconditionally; must be wrapped
  in a step-1 guard.
- **Lines 121–145** — Notes textarea; belongs in step 1.
- **Lines 153–161** — `<Button type="submit">` "Підтвердити замовлення"; must be
  step-2 only.

### checkout-step-indicator.tsx

`apps/store-client/src/widgets/checkout/ui/checkout-step-indicator.tsx`

- **Line 5–9** — `STEPS` array reads from `dict.checkout.stepShipping`,
  `dict.checkout.stepReview`, `dict.checkout.stepConfirm` — all already in the
  dictionary. No dict changes needed for the indicator itself.
- **Line 15** — `current` prop defaults to `1`. Already fully functional: `isActive`
  (`step === current`), `isDone` (`step < current`), and `aria-current="step"` on the
  active circle are wired correctly.
- **Lines 26–30** — The three visual states (active, done, upcoming) are driven
  entirely by the `current` prop. Passing `step` from state instead of `1` is the only
  change required.

### checkout-address-form.tsx

`apps/store-client/src/features/checkout/ui/checkout-address-form.tsx`

- Lines 43–48 — accepts `legend`, `register`, `control`, `setValue`, `errors`.
- The five visible input groups are: `firstName`, `lastName`, `phone` (via
  `Controller` + `PhoneInput`), `NpCityField`, `NpWarehouseField`.
- This component is shown **only on step 1** and is unchanged by this plan.

### checkout-schema.ts

`apps/store-client/src/features/checkout/model/checkout-schema.ts`

Required fields (non-optional in the schema): `firstName`, `lastName`, `phone`,
`city`, `deliveryAddress`.

Optional fields (`.optional()`): `npCityRef`, `npWarehouseRef`, `notes` (with
`max(500)` constraint).

Fields that gate the Delivery → Review transition (the `trigger` argument in
`useCheckoutSteps`):

```ts
const DELIVERY_STEP_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "city",
  "deliveryAddress",
  "notes", // optional but has max(500) — validated to catch rare over-length values
] as const satisfies (keyof CheckoutFormValues)[];
```

`npCityRef` and `npWarehouseRef` are excluded: they are set automatically by the NP
autocomplete components and are never required (schema marks both `.optional()`).

### use-checkout.ts

`apps/store-client/src/features/checkout/model/use-checkout.ts`

- `submitOrder` maps form values → `CreateOrderDto` and calls `useCreateOrder`.
- On success: sets `isOrderSubmitted = true`, invalidates cart, pushes to
  `/orders/${orderId}/confirmation`.
- **No changes required**. `submitOrder` is only called from step 2's form submit.

### checkout-order-summary.tsx

`apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx`

- Pure read-only component in the `<aside>`. Accepts `npCityRef` for the live NP
  estimate.
- Shown on **both steps** (the aside is always visible). No changes needed.

### dictionary.ts — checkout section

`apps/store-client/src/shared/config/dictionary.ts`

Existing keys reused by the multi-step flow: `stepShipping`, `stepReview`,
`stepConfirm`, `placeOrder`, `placingOrder`, `orderNotes`, `fields.*`.

New keys required (added in TASK-146-A):

| Key                           | Ukrainian string                |
| ----------------------------- | ------------------------------- |
| `dict.checkout.nextStep`      | `"Далі"`                        |
| `dict.checkout.prevStep`      | `"Назад"`                       |
| `dict.checkout.reviewHeading` | `"Перевірте деталі замовлення"` |

### Tests that must change

`apps/store-client/src/widgets/checkout/ui/checkout-view.test.tsx`

Two tests break directly because they interact with the "Підтвердити замовлення"
button, which moves to step 2 only:

1. **`it("renders the checkout form for an authenticated user with a populated cart")`**
   (line 51–63) — currently asserts
   `getByRole("button", { name: dict.checkout.placeOrder })` in the initial render.
   After the change, step 1 shows "Далі", not "Підтвердити замовлення". The test
   must be updated to check for `dict.checkout.nextStep` ("Далі") and assert that
   the submit button is absent on step 1.

2. **`it("pushes to the confirmation page on success and does not redirect to /cart when the cart empties")`**
   (line 68–120) — fills all five delivery fields and immediately clicks "Підтвердити
   замовлення" (line 108–110). After the change, this button is not visible on step 1.
   The test must advance through step 1 first: after filling the fields, click "Далі",
   wait for step 2 to appear, then click "Підтвердити замовлення".

The remaining four tests (redirect-to-login, redirect-to-cart, prefill, null-phone)
do not interact with the submit button and are unaffected.

---

## Technical Design

### Option A vs Option B

**Option B (collapse to one honest step)** removes the `CheckoutStepIndicator` or
sets it to a single step, so the UI matches the one-shot submit. This requires minimal
code but discards a planned UX feature that users expect (they see three steps; hiding
them signals a regression).

**Option A (real multi-step flow)** is recommended for the following reasons:

- The three-step indicator already exists and the copy ("Доставка / Перевірка /
  Підтвердження") matches a conventional checkout UX that users of UA e-commerce
  platforms recognise.
- The implementation is frontend-only — no backend, Prisma, or Orval changes — making
  the scope tractable.
- It closes the QA report finding ("після кнопки «Підтвердити замовлення» одразу
  створюється ордер") by placing the order-creation mutation behind a Review screen.
- A single `useForm` instance is retained, so TASK-080 (NP autocomplete, live estimate)
  and TASK-135 (prefill, phone mask) are unaffected.

Option B is the fallback if the owner decides the Review screen is not worth the
complexity, but Option A is preferred.

### Step State Model

A new `useCheckoutSteps` hook manages the step state. It lives in
`features/checkout/model` to keep the orchestration logic independent of the widget:

```ts
// Conceptual sketch — full implementation in TASK-146-A.
const DELIVERY_STEP_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "city",
  "deliveryAddress",
  "notes",
] as const satisfies readonly (keyof CheckoutFormValues)[];

export function useCheckoutSteps(trigger: UseFormTrigger<CheckoutFormValues>): {
  step: 1 | 2;
  goToReview: () => Promise<void>;
  goToDelivery: () => void;
} {
  const [step, setStep] = useState<1 | 2>(1);

  const goToReview = useCallback(async () => {
    const valid = await trigger([...DELIVERY_STEP_FIELDS]);
    if (valid) setStep(2);
  }, [trigger]);

  const goToDelivery = useCallback(() => setStep(1), []);

  return { step, goToReview, goToDelivery };
}
```

`trigger` comes from the existing `useForm` destructuring in `CheckoutView` (it just
needs to be added — it is already part of the `UseFormReturn<T>` type returned by
`useForm`).

The hook is intentionally minimal: no URL query params, no `useReducer`, no context.
The step state lives in the widget's render tree, which is correct for a transient
UI state that resets when the user navigates away.

### CheckoutView Layout (post-change)

The `<form>` element continues to wrap both step panels. Only the content inside it
is conditionally rendered:

```tsx
<CheckoutStepIndicator current={step} />   {/* was current={1} */}

<form onSubmit={handleSubmit(submitOrder, focusFirstError)} noValidate>

  {/* ── Step 1: Delivery ─────────────────────────────── */}
  {step === 1 && (
    <>
      <CheckoutAddressForm ... />
      {/* notes textarea + character count (unchanged) */}
      <Button type="button" onClick={goToReview}>
        {dict.checkout.nextStep}
      </Button>
    </>
  )}

  {/* ── Step 2: Review ───────────────────────────────── */}
  {step === 2 && (
    <>
      <CheckoutReviewStep control={control} />
      {isError && errorMessage && <p role="alert">...</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={goToDelivery}>
          {dict.checkout.prevStep}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? dict.checkout.placingOrder : dict.checkout.placeOrder}
        </Button>
      </div>
    </>
  )}

</form>
```

Key invariants:

- "Далі" is `type="button"` — never triggers form submit.
- "Назад" is `type="button"` — never triggers form submit.
- "Підтвердити замовлення" is `type="submit"` — the only submit trigger.
- The `<form>` `onSubmit` is only reachable when `step === 2`.
- The error banner (`isError && errorMessage`) is rendered on step 2 only, where the
  mutation can fire.
- `focusFirstError` remains as the `handleSubmit` second argument; on step 2 it
  focuses the first invalid field, but since step 2 only shows `CheckoutReviewStep`
  (no editable inputs), a validation failure here is an edge case (e.g. a programmatic
  bypass). The defensive guard is acceptable for MVP.

### CheckoutReviewStep

Location: `apps/store-client/src/features/checkout/ui/checkout-review-step.tsx`

The component subscribes to the relevant form fields via `useWatch` so the display
updates correctly if the user returns to step 1 and edits a value:

```ts
interface CheckoutReviewStepProps {
  control: Control<CheckoutFormValues>;
}
```

Rendered sections:

| Section   | Fields displayed                           |
| --------- | ------------------------------------------ |
| Recipient | `firstName` + `lastName` (joined), `phone` |
| Delivery  | `city`, `deliveryAddress`                  |
| Notes     | `notes` (omitted when empty)               |

Labels reuse existing dict keys (`dict.checkout.fields.firstName`, etc.) where
available. The new `dict.checkout.reviewHeading` string serves as the section title.

The component is **read-only** — no `<input>` elements, no RHF registration. It is
purely presentational and contains no mutations.

FSD placement: `features/checkout/ui` is correct because the component is
checkout-domain-specific and reads form values (business data). It does not cross
the features→entities import boundary.

### Focus Management

When `goToReview()` succeeds and `setStep(2)` fires, a `useEffect` in `CheckoutView`
(keyed on `step`) should move browser focus to the review section heading:

```ts
const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

useEffect(() => {
  if (step === 2) reviewHeadingRef.current?.focus();
}, [step]);
```

The heading receives `tabIndex={-1}` to make it programmatically focusable without
appearing in the natural tab order. This satisfies WCAG 2.4.3 (Focus Order) for SPA
page transitions.

Similarly, when `goToDelivery()` fires (step 1 → 2 → 1), focus should return to the
address form's first field. `setFocus("firstName")` (already available from the form
destructuring) called in a `useEffect` keyed on `step === 1` achieves this.

### Single useForm Instance — No Regression Risk

One `useForm<CheckoutFormValues>` is kept in `CheckoutView`. All existing wiring is
preserved:

| Concern                     | Hook / prop                                  | Status                                  |
| --------------------------- | -------------------------------------------- | --------------------------------------- |
| TASK-135 prefill            | `useCheckoutPrefill(reset, isAuthenticated)` | Unchanged                               |
| TASK-080 NP city watch      | `useWatch({ control, name: "npCityRef" })`   | Unchanged (aside always visible)        |
| Notes character count       | `useWatch({ control, name: "notes" })`       | Unchanged (watch is harmless on step 2) |
| `CheckoutAddressForm` props | `register`, `control`, `setValue`, `errors`  | Unchanged                               |
| Order submission            | `handleSubmit(submitOrder, focusFirstError)` | Unchanged; only fires on step 2         |

### Deep-Step Guard (empty cart / auth change)

The existing guards in `CheckoutView` redirect away when the cart becomes empty or
the user loses auth:

```ts
useEffect(() => {
  if (!isInitializing && !isAuthenticated) {
    router.replace("/login?redirect=/checkout");
  }
}, [isInitializing, isAuthenticated, router]);

useEffect(() => {
  if (cartIsEmpty && !isOrderSubmitted) {
    router.replace("/cart");
  }
}, [cartIsEmpty, isOrderSubmitted, router]);
```

These effects fire regardless of which step the user is on, which is the correct
behaviour: if the cart empties while on step 2 (e.g. another tab removes items), the
user should be redirected. No changes to these guards are needed. The `step` state
resets automatically when the component unmounts on redirect.

---

## Tasks

### TASK-146-A: Step state + indicator wiring + Next/Back navigation

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No (integration-tested in TASK-146-C)
**Depends on:** none

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/checkout/model/use-checkout-steps.ts` created
      and exports `useCheckoutSteps(trigger)` returning `{ step: 1 | 2, goToReview, goToDelivery }`
- [ ] `DELIVERY_STEP_FIELDS` constant is defined in the hook file and contains
      `['firstName', 'lastName', 'phone', 'city', 'deliveryAddress', 'notes']`
- [ ] `goToReview()` calls `trigger([...DELIVERY_STEP_FIELDS])` and sets `step = 2`
      only if the result is `true`; it does nothing if validation fails
- [ ] `goToDelivery()` sets `step = 1` unconditionally
- [ ] `features/checkout/index.ts` exports `useCheckoutSteps`
- [ ] `CheckoutView` adds `trigger` to the `useForm` destructuring
- [ ] `CheckoutView` calls `useCheckoutSteps(trigger)` and destructures
      `{ step, goToReview, goToDelivery }`
- [ ] `<CheckoutStepIndicator current={step} />` replaces the hardcoded `current={1}`
- [ ] Step 1 content (address form + notes + "Далі" button) is visible only when
      `step === 1`
- [ ] Step 2 content (review + buttons) is visible only when `step === 2`
- [ ] "Далі" button has `type="button"` and calls `goToReview` via `onClick`
- [ ] "Назад" button has `type="button"`, variant `"outline"`, and calls `goToDelivery`
- [ ] "Підтвердити замовлення" button has `type="submit"` and is shown only on step 2
- [ ] `dict.checkout.nextStep = "Далі"` added to `dictionary.ts`
- [ ] `dict.checkout.prevStep = "Назад"` added to `dictionary.ts`
- [ ] `dict.checkout.reviewHeading` added to `dictionary.ts`
      (e.g. `"Перевірте деталі замовлення"`)
- [ ] Focus moves to `reviewHeadingRef` on step 2 entry and to `firstName` on step 1
      re-entry via `useEffect`s keyed on `step`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/model/use-checkout-steps.ts` — CREATE:
  `DELIVERY_STEP_FIELDS`, `useCheckoutSteps` hook
- `apps/store-client/src/features/checkout/index.ts` — ADD export `useCheckoutSteps`
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — ADD `trigger` to
  form destructuring; ADD `useCheckoutSteps` call; REPLACE hardcoded `current={1}`;
  WRAP step-1 and step-2 content in guards; ADD Next/Back buttons; ADD
  `reviewHeadingRef`; ADD `useEffect` for focus management
- `apps/store-client/src/shared/config/dictionary.ts` — ADD `nextStep`, `prevStep`,
  `reviewHeading` keys under `checkout`

---

### TASK-146-B: Review step UI component

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No (integration-tested in TASK-146-C)
**Depends on:** TASK-146-A (step state wired; `step === 2` guard in place)

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/checkout/ui/checkout-review-step.tsx` created
      and exports `CheckoutReviewStep({ control })`
- [ ] Component uses `useWatch({ control, names: [...] })` to read form values
- [ ] Renders the review heading using `dict.checkout.reviewHeading` in an `<h2>` with
      `tabIndex={-1}` and the `reviewHeadingRef` forwarded from `CheckoutView`
      (accept the ref via `forwardRef` or as a plain `ref` prop on the wrapper element)
- [ ] Displays recipient: `${firstName} ${lastName}` and `phone`
- [ ] Displays delivery: `city` and `deliveryAddress`
- [ ] Displays `notes` section only when `notes` is non-empty
- [ ] Contains no `<input>`, `<textarea>`, or `<select>` elements — purely read-only
- [ ] All displayed label strings are taken from `dict.*` (no hardcoded Ukrainian copy)
- [ ] `features/checkout/index.ts` exports `CheckoutReviewStep`
- [ ] `CheckoutView` renders `<CheckoutReviewStep control={control} />` inside the
      step-2 guard, passing `ref={reviewHeadingRef}` to the heading
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes
- [ ] `npm run build -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/ui/checkout-review-step.tsx` — CREATE:
  read-only summary component
- `apps/store-client/src/features/checkout/index.ts` — ADD export `CheckoutReviewStep`
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — IMPORT and RENDER
  `CheckoutReviewStep` in the step-2 block; pass `ref={reviewHeadingRef}` to the
  heading element

---

### TASK-146-C: Tests

**Type:** test
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No (tests written after implementation)
**Depends on:** TASK-146-A, TASK-146-B

**Acceptance Criteria:**

#### Updated existing tests in checkout-view.test.tsx

- [ ] `it("renders the checkout form for an authenticated user with a populated cart")`
      updated: asserts that `dict.checkout.nextStep` ("Далі") button is present on step 1
      and that `dict.checkout.placeOrder` ("Підтвердити замовлення") is NOT in the DOM
      on the initial render
- [ ] `it("pushes to the confirmation page on success and does not redirect to /cart when the cart empties")`
      updated: after filling all delivery fields, clicks the "Далі" button to advance
      to step 2, then clicks "Підтвердити замовлення"; all existing post-submit
      assertions remain unchanged

#### New tests in checkout-view.test.tsx

- [ ] New test: `it("shows the 'Далі' button on step 1 and 'Підтвердити замовлення' only on step 2")`
  - Render with authenticated user + populated cart
  - Assert step 1: "Далі" present, "Підтвердити замовлення" absent, "Назад" absent
  - Click "Далі" after filling required fields
  - Assert step 2: "Підтвердити замовлення" present, "Назад" present, "Далі" absent

- [ ] New test: `it("does not advance to step 2 when delivery fields are invalid")`
  - Render with authenticated user + populated cart
  - Click "Далі" without filling any fields
  - Assert the step indicator still shows step 1 (step 2 content not in DOM)
  - Assert at least one validation error message is present

- [ ] New test: `it("'Назад' button on step 2 returns to step 1")`
  - Fill required fields → click "Далі" → assert step 2 visible
  - Click "Назад"
  - Assert step 1 content (address form) is visible again
  - Assert "Далі" button is present

- [ ] New test: `it("CheckoutStepIndicator reflects the current step")`
  - On initial render: step 1 circle has `aria-current="step"`
  - After advancing: step 2 circle has `aria-current="step"`, step 1 shows the
    completed (check icon) state

- [ ] New test: `it("review step shows the delivery data entered in step 1")`
  - Fill firstName "Тарас", lastName "Шевченко", phone "050 123 4567", city "Харків",
    deliveryAddress "Відділення №5" on step 1
  - Click "Далі"
  - Assert the review panel contains "Тарас Шевченко", "Харків", "Відділення №5"

- [ ] All previously passing tests (redirect-to-login, redirect-to-cart, prefill
      tests) still pass without modification
- [ ] `npm run test -w apps/store-client` passes — the baseline of 103 tests
      (TASK-135 final count) remains green with the new tests added on top
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to modify:**

- `apps/store-client/src/widgets/checkout/ui/checkout-view.test.tsx` — MODIFY two
  existing tests; ADD five new tests

---

## Migration Steps

Execute sub-tasks in dependency order:

1. **TASK-146-A** — Create `useCheckoutSteps`, wire it into `CheckoutView`, add dict
   keys, verify `typecheck` + `lint` pass. At this point the checkout page advances
   to step 2 but step 2 shows no content yet (the guard renders nothing).

2. **TASK-146-B** — Create `CheckoutReviewStep`, render it inside the step-2 guard in
   `CheckoutView`, verify `build` + `typecheck` + `lint` pass. The full multi-step
   flow is now functionally complete.

3. **TASK-146-C** — Update the two broken tests in `checkout-view.test.tsx`, add the
   five new tests, verify the full test suite passes.

Verification gate after all sub-tasks:

```bash
npm run build -w apps/store-client
npm run typecheck -w apps/store-client
npm run lint -w apps/store-client
npm run test -w apps/store-client
```

---

## Cross-Task Dependencies

| Dependency                          | Direction              | Note                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-135 (prefill + phone mask)     | Completed prerequisite | `useCheckoutPrefill`, `PhoneInput`, `control` prop already in `CheckoutView`. Kept as-is; the multi-step wrapper does not touch prefill logic.                                                             |
| TASK-080 (Nova Poshta autocomplete) | Completed prerequisite | `npCityRef` watch and `CheckoutOrderSummary` live estimate continue to work on both steps (the aside is always visible). `NpCityField` + `NpWarehouseField` remain in step 1 inside `CheckoutAddressForm`. |
| TASK-141 (forms state-sync audit)   | Completed prerequisite | `keepDirtyValues: true` in `useCheckoutPrefill` means going back from step 2 to step 1 preserves all user edits — no extra guard needed.                                                                   |
| TASK-119 (redirect race)            | Completed prerequisite | `isOrderSubmitted` guard prevents the empty-cart redirect from firing after a successful order; unchanged by this plan.                                                                                    |
| Confirmation page step indicator    | Follow-up              | `/orders/[id]/confirmation` could surface `CheckoutStepIndicator current={3}` as a visual "you're done" signal. Out of scope here; tracked as a future cosmetic improvement.                               |

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `form.trigger(fields)` is async — if a component unmounts before the promise resolves (e.g. rapid double-click on "Далі") a stale state update could occur.                                                                                                   | Add an `isMounted` ref guard in `useCheckoutSteps` or debounce the button. For MVP, disabling the "Далі" button while the trigger is pending (local `isValidating` state) is sufficient.                                                                                                                                                                                           |
| On step 2, `handleSubmit` re-validates the full schema when the user clicks "Підтвердити замовлення". If only `notes` has a new error (e.g. it somehow exceeds 500 chars between steps), `focusFirstError` would try to focus a field not visible in the DOM. | `focusFirstError` calls `setFocus(first)` — RHF's `setFocus` scrolls to the field. Since the notes textarea is only rendered on step 1, `setFocus("notes")` will silently no-op on step 2. Add a guard: if the first error field is a delivery field, call `goToDelivery()` before `setFocus`. For MVP, the silent no-op is acceptable since this case is practically unreachable. |
| Focus management via `useEffect` keyed on `step` may fire before the DOM update is painted, focusing a node that is not yet visible.                                                                                                                          | Use `flushSync` or rely on React 18's automatic batching — the effect fires after the state update and React commit, so the heading is already in the DOM when the focus call runs. No special handling required.                                                                                                                                                                  |
| The prefill `reset()` (TASK-135, keyed to `user?.id`) could fire while the user is on step 2, resetting delivery fields the user already validated.                                                                                                           | `reset()` is called with `keepDirtyValues: true`, so fields the user interacted with (all of them, by the time they reach step 2) are preserved. The `user?.id` key means `reset` fires at most once per session. No regression.                                                                                                                                                   |
| The two existing tests that break are integration tests exercising the full submit flow — a risk of incorrect updates causing false-positive passes.                                                                                                          | The key assertion is `expect(mockPush).toHaveBeenCalledWith("/orders/order-1/confirmation")`. This can only pass if the `POST /api/orders` MSW handler was triggered, which requires the form to reach `handleSubmit`. Updating these tests to add the "Далі" step does not weaken the assertion.                                                                                  |
| `CheckoutReviewStep` re-renders on every form `useWatch` update. If the NP city autocomplete fires rapid updates, the review panel could flicker.                                                                                                             | The review step is only mounted when `step === 2`, at which point the delivery form (and the NP autocomplete) is unmounted. No rapid updates possible on step 2.                                                                                                                                                                                                                   |
