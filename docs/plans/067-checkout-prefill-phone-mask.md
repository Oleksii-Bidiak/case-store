# Plan: Checkout Prefill for Logged-In Users + UA Phone Input Mask

> **Status:** Completed
> **Phase:** Phase 3 — Checkout & Orders (Tier-1 UA Business Practice)
> **Created:** 2026-06-26
> **BACKLOG task:** TASK-135

---

## Overview

Two closely related improvements to the `/checkout` page for logged-in users:

1. **Checkout prefill** — when a logged-in user opens the checkout page, their
   saved `firstName`, `lastName`, and `phone` from the profile (`GET /api/users/me`)
   are pre-populated into the shipping address form so they don't retype them on
   every order.

2. **UA phone input mask** — the phone field in the checkout form currently renders
   a plain `<Input type="tel">` with no formatting feedback. This task replaces it
   with a controlled `PhoneInput` component that:
   - Always displays the `+380` country prefix
   - Formats the local part as `+380 NN NNN NNNN` on every keystroke
   - Is a zero-dependency, reusable `shared/ui` component

Neither change requires a backend API modification, a new Prisma migration, or Orval
regeneration. The profile endpoint `GET /api/users/me` is already live (TASK-113)
and returns `firstName`, `lastName`, and `phone`.

---

## Scope

### In Scope

- Create `apps/store-client/src/features/checkout/model/use-checkout-prefill.ts` —
  the hook that fetches the profile and seeds the checkout form (TASK-135-A).
- Update `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` to call
  the prefill hook and pass `control` to `CheckoutAddressForm` (TASK-135-A).
- Create `apps/store-client/src/shared/ui/phone-input.tsx` — the `PhoneInput`
  component (TASK-135-B).
- Update `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx`
  to use `Controller` + `PhoneInput` for the phone field (TASK-135-B).
- Update `shared/ui/index.ts` to export `PhoneInput` (TASK-135-B).
- Update `features/checkout/index.ts` to export `useCheckoutPrefill` (TASK-135-A).
- Unit/RTL tests for `PhoneInput` formatting and the prefill behavior (TASK-135-C).
- Add `makeUser` factory to `apps/store-client/src/shared/test/msw-handlers.ts`
  and a default `GET /api/users/me` handler (TASK-135-C).

### Out of Scope

- **`city` and `deliveryAddress` prefill** — these fields have no profile source
  (`UserEntity` has no `city` or `address` fields). Persisting the last-used
  delivery city/branch is a Nova Poshta integration concern tracked in TASK-080.
  This task prefills only `firstName`, `lastName`, and `phone`.
- **Profile form phone masking** — `apps/store-client/src/features/profile/ui/profile-form.tsx`
  also has a bare phone input. Applying the mask there is a follow-on task.
- **Backend / Prisma / schema changes** — none. Profile data already exists.
- **Orval regeneration** — the API contract is unchanged.
- **Cursor-position management** — the `PhoneInput` reformats on every keystroke,
  which causes the cursor to jump to the end on mid-string edits. This is acceptable
  for an MVP phone field (users type linearly or select-all to replace). If precise
  cursor management becomes a UX requirement, adopt `react-imask` in a future task.
- **Checkout multi-step flow** — cosmetic step indicator bug is tracked in TASK-146.

---

## User Stories

1. As a logged-in user, I want the checkout form to pre-fill my name and phone
   from my account profile, so I don't have to re-enter contact details on every
   order.
2. As a logged-in user whose profile has no phone saved, I want the phone field to
   remain empty rather than crashing or showing `null`.
3. As a logged-in user who starts typing before the profile loads, I want my
   in-progress edits to be preserved when the profile data arrives.
4. As any user, I want the phone field to show a `+380` prefix and auto-format the
   digits into `+380 NN NNN NNNN` as I type, so I get clear visual feedback.

---

## Current-State Findings

### Profile field coverage

The `UserEntity` shape returned by `GET /api/users/me` is:

```ts
interface UserEntity {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: UserEntityRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Mapping to checkout fields:

| Checkout field    | Profile source   | Prefill status                         |
| ----------------- | ---------------- | -------------------------------------- |
| `firstName`       | `user.firstName` | Prefilled (may be null → empty string) |
| `lastName`        | `user.lastName`  | Prefilled (may be null → empty string) |
| `phone`           | `user.phone`     | Prefilled (may be null → empty string) |
| `city`            | —                | No source; remains empty (TASK-080)    |
| `deliveryAddress` | —                | No source; remains empty (TASK-080)    |
| `notes`           | —                | No source; remains empty               |

### Checkout form current RHF setup

`checkout-view.tsx` line 48 — `useForm` has no `defaultValues` and no `values` prop:

```tsx
const {
  register,
  handleSubmit,
  control, // already present (used by useWatch for notes character count)
  setFocus,
  formState: { errors },
} = useForm<CheckoutFormValues>({
  resolver: zodResolver(checkoutSchema),
});
```

`control` is already destructured. Adding `reset` to the destructuring is the only
change needed on the form call site.

### Checkout form existing phone field

In `checkout-address-form.tsx`, the phone field is in the `FIELDS` config array:

```ts
{
  name: "phone",
  label: dict.checkout.fields.phone,
  autoComplete: "tel",
  type: "tel",
  placeholder: dict.checkout.phonePlaceholder,  // "напр. +380 50 123 4567"
}
```

It renders as `<Input {...register("phone")} />` — a plain uncontrolled-by-RHF
input. No masking or formatting is applied. After TASK-135-B the phone row will
use `Controller` + `PhoneInput` instead.

### Checkout zod schema — phone regex compatibility

```ts
// checkout-schema.ts
const phoneRegex = /^\+?[\d\s()-]{10,20}$/;
```

The formatted output `+380 50 123 4567` is 17 characters, all of which match
`[\d\s]` (digits + spaces). The leading `+` is optional in the regex. This regex
is fully compatible with the masked format — **no schema changes needed**.

### No mask library installed

`apps/store-client/package.json` contains no `react-imask`, `react-input-mask`,
`cleave.js`, or equivalent. The `PhoneInput` component is implemented as a
zero-dependency controlled component using only React + the existing `<Input>`
primitive.

### Form sync analysis — forms.md compliance

The checkout form is a **create** form (not editing an existing saved entity). The
profile data is async. Per `docs/conventions/forms.md`:

- Rule 1 prohibits bare `useState(prop)` from async data — not used here.
- Rule 2b applies: use `reset()` in a `useEffect` keyed to `user?.id`. This resets
  only when the user identity changes (effectively once per checkout session), so
  in-progress edits are not clobbered by a background profile refetch.
- `reset()` is called with `{ keepDirtyValues: true }` — fields the user has
  already touched (marked dirty by RHF) are never overwritten by the prefill.
- `key`-remount is explicitly prohibited for focus-sensitive inputs.

The reference implementation in `docs/conventions/forms.md` §2b matches this use
case exactly.

---

## Technical Design

### TASK-135-A — `useCheckoutPrefill` hook

Location: `apps/store-client/src/features/checkout/model/use-checkout-prefill.ts`

The hook fetches the profile (gated on `isAuthenticated`) and calls `form.reset()`
inside a `useEffect` whose dependency is `user?.id`:

```ts
// Conceptual sketch — implementer adds full JSDoc and eslint-disable comment.
export function useCheckoutPrefill(
  form: UseFormReturn<CheckoutFormValues>,
  isAuthenticated: boolean,
) {
  const { data } = useUserControllerGetProfile({
    query: { enabled: isAuthenticated },
  });
  const user = data?.data;

  useEffect(() => {
    if (!user?.id) return;
    form.reset(
      {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        city: "",
        deliveryAddress: "",
        notes: "",
      },
      { keepDirtyValues: true },
    );
    // Only re-seed when the user identity changes (Rule 2b, forms.md).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
```

`CheckoutView` wires it in by adding `reset` to the form destructuring and calling:

```ts
useCheckoutPrefill(form, isAuthenticated);
```

The call goes after the auth/cart guards so `isAuthenticated` is already stable.

### TASK-135-B — `PhoneInput` component

Location: `apps/store-client/src/shared/ui/phone-input.tsx`

**Formatting algorithm** (`formatUAPhone`):

1. Extract all digits from the raw input: `raw.replace(/\D/g, "")`
2. Normalise country prefix:
   - starts with `380` → local = `digits.slice(3)`
   - starts with `80` → local = `digits.slice(2)` (edge case: typed `80...`)
   - starts with `0` → local = `digits.slice(1)` (domestic prefix)
   - otherwise → local = `digits` (user typed raw local part)
3. Trim local to 9 digits
4. Build formatted string progressively:
   - `+380` (always)
   - - ` ` + `local[0..2]` (operator code, 2 digits)
   - - ` ` + `local[2..5]` (3 digits)
   - - ` ` + `local[5..9]` (4 digits)
5. Result: `+380 50 123 4567` (when full), or partial like `+380 50 1` while typing.

The component is a `forwardRef` wrapper around `<Input>` so RHF `Controller` can
attach its `ref`:

```tsx
// Conceptual sketch.
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value = "", onChange, ...props }, ref) {
    const formatted = formatUAPhone(value);
    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={formatted}
        onChange={(e) => onChange?.(e.target.value)}
        {...props}
      />
    );
  },
);
```

`inputMode="numeric"` triggers the numeric soft keyboard on mobile while `type="tel"`
provides `tel:`-link semantics and correct autocomplete behaviour on desktop.

**Integration in `CheckoutAddressForm`:**

The `FIELDS` array and `register`-based rendering are retained for all fields
except `phone`. The phone field is extracted from the array and rendered separately
using RHF `Controller`:

```tsx
// CheckoutAddressForm receives a new `control` prop.
import { Controller } from "react-hook-form";
import { PhoneInput } from "@/shared/ui";

// In JSX, after the field grid:
<Controller
  name="phone"
  control={control}
  render={({ field, fieldState }) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="checkout-phone">{dict.checkout.fields.phone}</Label>
      <PhoneInput
        id="checkout-phone"
        autoComplete="tel"
        aria-invalid={fieldState.error ? true : undefined}
        {...field}
      />
      {fieldState.error && (
        <p role="alert" className="text-sm text-destructive">
          {fieldState.error.message}
        </p>
      )}
    </div>
  )}
/>;
```

`CheckoutView` already has `control` from `useForm` (used by `useWatch`). Passing it
as a new prop to `CheckoutAddressForm` is the only call-site change.

### FSD placement

| Artifact                   | Layer                     | Reason                                                                 |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `use-checkout-prefill.ts`  | `features/checkout/model` | Checkout-domain logic; imports `entities/user` (legal downward import) |
| `PhoneInput`               | `shared/ui`               | Dumb component with no business logic; reusable across features        |
| `CheckoutAddressForm` edit | `features/checkout/ui`    | Existing location; now accepts `control` for one field                 |
| `CheckoutView` edit        | `widgets/checkout/ui`     | Existing orchestrator; orchestrates the new hook + passes `control`    |

Import directions: `widgets → features → entities → shared` — no violations.

### Backend / API changes — none required

The profile endpoint `GET /api/users/me` returns `firstName`, `lastName`, `phone`.
These fields are already exposed in `UserEntity` and re-exported from
`apps/store-client/src/entities/user/index.ts` via `useUserControllerGetProfile`.
No Orval regeneration, no new DTO, no migration.

---

## Tasks

### TASK-135-A: Profile prefill wiring

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No (integration tested in TASK-135-C)
**Depends on:** none

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/checkout/model/use-checkout-prefill.ts`
      exists and exports `useCheckoutPrefill(form, isAuthenticated)`
- [ ] Hook fetches profile via `useUserControllerGetProfile` imported from
      `@/entities/user`, with `query: { enabled: isAuthenticated }`
- [ ] Hook calls `form.reset({ firstName, lastName, phone, city: "", deliveryAddress: "", notes: "" }, { keepDirtyValues: true })` inside a `useEffect` whose dependency array is `[user?.id]`
- [ ] Hook does NOT call `reset` when `user?.id` is undefined (profile still loading
      or user is a guest)
- [ ] `CheckoutView` adds `reset` to its `useForm` destructuring
- [ ] `CheckoutView` calls `useCheckoutPrefill(form, isAuthenticated)` after the
      existing auth/cart hooks
- [ ] `CheckoutAddressForm` receives a new `control: Control<CheckoutFormValues>`
      prop (passed from `CheckoutView`)
- [ ] `features/checkout/index.ts` exports `useCheckoutPrefill`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/checkout/model/use-checkout-prefill.ts` —
  CREATE: prefill hook
- `apps/store-client/src/features/checkout/index.ts` — ADD `useCheckoutPrefill`
  export
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — ADD `reset` to
  form destructuring; ADD `useCheckoutPrefill` call; PASS `control` to
  `CheckoutAddressForm`
- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` — ADD
  `control` to props interface; ACCEPT `control` (used in TASK-135-B)

---

### TASK-135-B: UA phone input mask component

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–3 h)
**TDD Required:** No (unit-tested in TASK-135-C)
**Depends on:** TASK-135-A (for the `control` prop already wired into `CheckoutAddressForm`)

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/ui/phone-input.tsx` exists and exports
      `PhoneInput` as a `forwardRef` component
- [ ] `PhoneInput` wraps the existing `<Input>` primitive from `shared/ui`
- [ ] `formatUAPhone("")` returns `"+380"` (prefix always present)
- [ ] `formatUAPhone("0501234567")` returns `"+380 50 123 4567"` (leading 0 stripped)
- [ ] `formatUAPhone("380501234567")` returns `"+380 50 123 4567"` (country prefix stripped)
- [ ] `formatUAPhone("+380501234567")` returns `"+380 50 123 4567"` (strips `+`, re-adds)
- [ ] `formatUAPhone("+380 50 123 4")` returns `"+380 50 123 4"` (partial input preserved)
- [ ] `formatUAPhone("12345678901")` caps at 9 local digits → `"+380 12 345 6789"`
- [ ] The component sets `type="tel"` and `inputMode="numeric"` for correct mobile keyboard
- [ ] The component passes `aria-invalid`, `id`, `autoComplete`, and all extra HTML
      input props through to `<Input>`
- [ ] `PhoneInput` is exported from `apps/store-client/src/shared/ui/index.ts`
- [ ] `CheckoutAddressForm` renders `PhoneInput` via `Controller` for the `phone`
      field, removing the phone entry from the `FIELDS` array
- [ ] The phone field's error message still renders in a `role="alert"` paragraph
      below the input (a11y unchanged)
- [ ] The delivery hint text below `deliveryAddress` is unaffected
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes
- [ ] `npm run build -w apps/store-client` passes

**Known limitation:**

Cursor position jumps to the end when the user edits mid-string. This is acceptable
for an MVP phone field. If cursor management becomes a requirement, adopt
`react-imask` in a follow-up task (no API/schema changes needed — just a rendering
improvement).

**Files to create/modify:**

- `apps/store-client/src/shared/ui/phone-input.tsx` — CREATE: `formatUAPhone`
  helper + `PhoneInput` component
- `apps/store-client/src/shared/ui/index.ts` — ADD `export { PhoneInput } from "./phone-input"`
- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` — REMOVE
  phone from `FIELDS` array; ADD `Controller` + `PhoneInput` render; ADD
  `control` import and usage

---

### TASK-135-C: Tests

**Type:** test
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No (green-after implementation)
**Depends on:** TASK-135-A, TASK-135-B

**Acceptance Criteria:**

#### `PhoneInput` unit tests

- [ ] `apps/store-client/src/shared/ui/phone-input.test.tsx` created
- [ ] Test: renders with `+380` prefix when `value=""` (empty initial state)
- [ ] Test: formats `"0501234567"` to `"+380 50 123 4567"` on render
- [ ] Test: formats `"+380501234567"` (no spaces, with country code) to `"+380 50 123 4567"`
- [ ] Test: partial input `"+380 50"` renders as-is (not padded or truncated)
- [ ] Test: `aria-invalid="true"` is present on the input when the prop is passed
- [ ] Test: `onChange` is called with the raw `e.target.value` (the formatting
      happens on the next render cycle, not before `onChange`)

#### Checkout address form tests (updated for `control` prop)

- [ ] `checkout-address-form.test.tsx` updated to supply `control` from a real
      `useForm` instance (the phone field now requires `Controller`)
- [ ] Existing tests ("renders all required UA delivery fields", "shows the delivery
      hint", "marks a field invalid") still pass
- [ ] New test: phone field renders with `type="tel"` and `inputMode="numeric"`

#### `CheckoutView` prefill integration tests

- [ ] `apps/store-client/src/shared/test/msw-handlers.ts` adds `makeUser` factory:
  ```ts
  export function makeUser(overrides: Partial<UserEntity> = {}): {
    data: UserEntity;
  };
  ```
  with defaults `{ firstName: "Олег", lastName: "Коваль", phone: "+380501234567", ... }`
- [ ] Default `GET /api/users/me` handler added to the `handlers` array in
      `msw-handlers.ts` (returns `makeUser()`)
- [ ] `checkout-view.test.tsx` new test: "pre-populates firstName, lastName, and
      phone from the profile for authenticated users"
  - Arrange: authenticated auth context + populated cart MSW handler + profile
    handler returning `makeUser()`
  - Assert: after render, `firstName` input has value `"Олег"`, `lastName` has
    `"Коваль"`, phone input has value `"+380 50 123 4567"` (formatted)
- [ ] `checkout-view.test.tsx` new test: "leaves city and deliveryAddress empty
      when profile has no address data"
  - Assert: `city` input value is `""`; `deliveryAddress` input value is `""`
- [ ] `checkout-view.test.tsx` new test: "does not overwrite a field the user has
      already typed into when the profile loads"
  - Arrange: profile handler delayed (use `delay` from MSW)
  - User types into `firstName` before profile resolves
  - Profile resolves; assert `firstName` still holds what the user typed
    (`keepDirtyValues: true` guard)
- [ ] `checkout-view.test.tsx` new test: "handles a profile with null phone
      gracefully — phone field remains empty"
  - MSW handler returns `makeUser({ phone: null })`
  - Assert phone input is `"+380"` (mask prefix with no local digits)
- [ ] All existing `CheckoutView` tests still pass (redirect-to-login,
      redirect-to-cart, form-renders, redirect-race)
- [ ] `npm run test -w apps/store-client` passes — ≥ 84 tests green (current
      baseline is 84), with new tests green
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/shared/ui/phone-input.test.tsx` — CREATE: `PhoneInput`
  unit tests
- `apps/store-client/src/features/checkout/ui/checkout-address-form.test.tsx` —
  MODIFY: supply `control` from `useForm`; add phone a11y assertion
- `apps/store-client/src/widgets/checkout/ui/checkout-view.test.tsx` — MODIFY:
  add prefill integration tests
- `apps/store-client/src/shared/test/msw-handlers.ts` — ADD `makeUser` factory
  and default `/api/users/me` handler

---

## Migration Steps

1. **TASK-135-A** — wire `useCheckoutPrefill` hook; add `control` prop to
   `CheckoutAddressForm`; verify typecheck passes.
2. **TASK-135-B** — create `PhoneInput`; replace phone field in `CheckoutAddressForm`;
   verify build and typecheck pass.
3. **TASK-135-C** — write tests; ensure the full test suite passes at `≥84` tests.

Verification gate after all sub-tasks:

```bash
npm run build -w apps/store-client
npm run typecheck -w apps/store-client
npm run lint -w apps/store-client
npm run test -w apps/store-client
```

---

## Cross-Task Dependencies

| Dependency                        | Direction              | Note                                                                                                                               |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TASK-080 (Nova Poshta)            | Future                 | City + delivery address will get a profile source only once NP branch selection is persisted. Prefill of those fields is deferred. |
| TASK-141 (forms state-sync audit) | Completed prerequisite | Established the `values`/`reset()`/`keepDirtyValues` conventions this plan follows.                                                |
| TASK-113 (customer `/account`)    | Completed prerequisite | Created `GET /api/users/me`, `useUserControllerGetProfile`, and `UserEntity` — all consumed here without changes.                  |
| TASK-107/108 (UA checkout form)   | Completed prerequisite | Established the `CheckoutFormValues` schema, `CheckoutAddressForm`, and `checkoutSchema` phone regex that this plan extends.       |
| Profile form phone mask           | Follow-up              | `profile-form.tsx` has the same bare phone input. Apply `PhoneInput` there after this task ships (out of scope).                   |

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keepDirtyValues: true` in `reset()` relies on RHF's dirty-field tracking. If the user opens checkout with the form already pre-filled via a different path, no fields are dirty and the prefill will overwrite them.        | This is acceptable behaviour: the prefill fires once (keyed to `user.id`), and the user's own edits are always preserved because any interaction marks a field dirty.                                                                                                                |
| `useUserControllerGetProfile` is enabled on mount (gated on `isAuthenticated`). On checkout load, `isAuthenticated` is `false` while `isInitializing` is `true`. The query must not fire too early.                          | Gate the query with `enabled: isAuthenticated` (not `!isInitializing`). Once `isInitializing` flips to `false` and `isAuthenticated` to `true`, TanStack Query automatically triggers the query. The reset `useEffect` runs only when `user?.id` becomes truthy — no race condition. |
| The `CheckoutAddressForm` component test uses a minimal `register` stub (see current test line 8–13). After TASK-135-B the phone field uses `Controller` which needs a real `control` object — the stub will break the test. | TASK-135-C explicitly requires updating the test to use a real `useForm` instance inside the test component, removing the stub pattern for `control`.                                                                                                                                |
| The `PhoneInput` `formatUAPhone` strips non-digits including the `+`. A value like `"+380501234567"` (already has `+` prefix stored in profile) should NOT be double-prefixed.                                               | The algorithm extracts raw digits → strips `380` prefix if present → builds `+380` fresh. There is no way to double the prefix. Covered by the unit test: `formatUAPhone("+380501234567") === "+380 50 123 4567"`.                                                                   |
| Pre-commit hook auto-formats `.ts`/`.tsx` on stage.                                                                                                                                                                          | Stage only the specific files from each sub-task. Review the diff before committing.                                                                                                                                                                                                 |
