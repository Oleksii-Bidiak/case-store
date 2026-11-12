# Form State Sync Conventions

> **Why this exists:** A manual-QA finding (`docs/archive/manual-qa-master.md:236`) described "проблема
> усіх форм на сайті" — a stale-local-state pattern affecting forms across the storefront and
> admin. The root cause is local state (`useState` or RHF `defaultValues`) that is seeded once
> from async server data and never re-synchronised when that data changes after a refetch.
> These rules are the agreed remediation patterns. See `docs/plans/050-forms-state-sync-audit.md`
> (TASK-141) for the full inventory and rationale.

There are seven rules. Reviewers should reject any new form/input that violates them.

---

## Rule 1 — Never seed `useState` from async-server data without a sync guard

A `useState(prop)` only runs its initializer on mount. If `prop` reflects server data that can
change after the component has mounted (an optimistic cache write, a background refetch,
stale-while-revalidate), the local state silently lags behind. **Always pair the seed with a
sync guard.**

### 1a. Non-focus-sensitive input → render-time guard (preferred)

Use React's "adjusting state during render" idiom. It re-syncs without the extra render cycle a
`useEffect` would cause.

```tsx
const [qty, setQty] = useState(item.quantity);
const [syncedQuantity, setSyncedQuantity] = useState(item.quantity);
if (item.quantity !== syncedQuantity) {
  setSyncedQuantity(item.quantity);
  setQty(item.quantity);
}
```

**Reference implementation:** `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`
(TASK-116) — the cart quantity stepper.

### 1b. Focus-sensitive input (text/search) → `lastPushedRef` guarded `useEffect`

For inputs where the user is actively typing, focus **must** survive URL/query round-trips. Keep
the field controlled and permanently mounted, and re-seed local state only on a genuine _external_
change — distinguished from the component's own echo by a `lastPushedRef`.

```tsx
const [value, setValue] = useState(initialValue);
const lastPushedRef = useRef<string | undefined>(normalise(initialValue));

useEffect(() => {
  const next = normalise(initialValue);
  if (next !== lastPushedRef.current) {
    setValue(initialValue);
    lastPushedRef.current = next;
  }
}, [initialValue]);
```

**Reference implementation:** `apps/store-client/src/features/product-filters/ui/search-input.tsx`
(TASK-117) — the product search box.

> **🚫 `key`-remount is NOT acceptable for focus-sensitive inputs.** Forcing a remount via a
> changing `key` prop unmounts the DOM element and destroys focus on every keystroke — this was
> the exact bug TASK-117 removed. Never reach for `key`-remount to "fix" an input that loses sync;
> use the `lastPushedRef` guard above.

---

## Rule 2 — RHF edit forms: use `values` or `reset()`, never bare `defaultValues` alone

`useForm({ defaultValues })` applies the defaults **once** when the form mounts. An edit form
whose defaults come from an async query is fine at mount (the parent typically gates rendering
until the query resolves), but goes stale if the query refetches while the form is open. Pair the
async source with one of:

### 2a. `values` option — live-sync (preferred when the entity id is stable)

```tsx
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  values: mapEntityToFormValues(entity),
  resetOptions: {
    keepDirtyValues: true, // keep the user's edits; only refresh pristine fields
  },
});
```

Best for forms where the user always edits the same entity (e.g. the storefront **profile form**,
`apps/store-client/src/features/profile/ui/profile-form.tsx`): a background refetch surfaces
server-side changes to untouched fields without discarding in-progress edits.

> **Not for a whole-list `useFieldArray` form.** `keepDirtyValues` merges per array INDEX, not
> per list: a refetch that adds, removes or reorders rows while the user edits mixes the two
> lists, and the next save sends a list nobody wrote (measured on RHF 7.83 in TASK-559 — an
> edited row kept, the server's new third row dropped, a removed row resurrected). It also
> leaks into every later `reset()`, so the form's own post-save reset keeps un-normalised input.
> For such forms re-seed only while pristine — `useEffect` on the query data calling
> `reset(mapped)` when `!formState.isDirty` (see `features/search-synonyms-form`).

### 2b. `reset()` in a `useEffect` keyed to the entity id

```tsx
useEffect(() => {
  if (entity) form.reset(mapEntityToFormValues(entity));
}, [entity?.id]); // full reset only when navigating to a different entity
```

Best for the admin **product / category edit forms**
(`apps/store-admin/src/features/product-form/ui/product-form.tsx`,
`apps/store-admin/src/features/category-form/ui/category-form.tsx`): only navigation to a new
entity triggers a full reset, so a mid-session background refetch won't clobber the admin's edits.

---

## Rule 3 — Debounce only through `useDebouncedCallback`

Never write a per-component `setTimeout` inside a `useEffect` to debounce. Use the shared hook:

```ts
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";

const debouncedSearch = useDebouncedCallback((value: string) => {
  onSearch(value);
}, 300);
```

**Canonical hook:** `apps/store-client/src/shared/lib/use-debounced-callback.ts`.

> **Import it directly — not via the `shared/lib` barrel.** The hook is `"use client"` and is
> intentionally excluded from `shared/lib/index.ts`. Adding a client module to the barrel (which
> server components also import for utilities like `formatMoney`) splits the module graph and
> breaks the React Query context during SSR.

`store-admin` keeps its **own verbatim copy** at
`apps/store-admin/src/shared/lib/use-debounced-callback.ts` (same barrel-exclusion rule). Do **not**
import the hook across app boundaries.

---

## Rule 4 — Validation timing, and validating the value rather than the mask

> Written by TASK-453 from the instances TASK-407 fixed on the storefront checkout.

### 4a. Timing: say nothing before the first submit, then clear each message as it is fixed

The timing every form here wants is RHF's **default** pair — `mode: "onSubmit"` (no error before
the user first presses the button) and `reValidateMode: "onChange"` (after that, each field
re-validates as it is edited, so a fixed field's message disappears immediately). No form in either
app overrides them today; **do not set `mode: "onChange"` / `"all"`** (the user is told off for an
email they have not finished typing), and if a form genuinely needs another mode, say why in a
comment next to `useForm`.

The trap is that RHF arms `reValidateMode` only **after a real submit**. A manual `trigger()` is not
one: errors it raises appear on time but then **stick** while the user fixes the field. Hence:

- **A step is a submit.** A multi-step form advances through `handleSubmit(next)` on a
  `type="submit"` button — never a `type="button"` whose `onClick` calls `trigger([...fields])`. See
  the step-1 «Далі» in `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx`
  (`onStepSubmit`) and why `apps/store-client/src/features/checkout/model/use-checkout-steps.ts`
  no longer validates. A side benefit: no hand-kept second list of "which fields are on this step".
- **Values set from code re-validate explicitly.** A field filled by a picker rather than by typing
  (`setValue("npCityRef", …)`) passes `{ shouldValidate: true }`, so its "required" message clears
  the moment a value lands (`np-city-field.tsx`, `np-warehouse-field.tsx`).
- **Blocked submit moves focus.** Pass an `onInvalid` to `handleSubmit` that focuses the first
  invalid field (`focusFirstError` in `checkout-view.tsx`) — otherwise a submit that does nothing is
  indistinguishable from a broken button.

### 4b. Validate the normalised value, never the mask

A display mask is for the eye. The schema must judge the **normalised** value — the thing the
backend will store — never the characters the mask drew.

- `checkout-schema.ts` once tested the phone against `/^\+?[\d\s()-]{10,20}$/`: a string of
  brackets passed, and so did a number with two digits missing out of the middle. It now does
  `.refine(isValidUAPhone, …)`, which normalises to `380XXXXXXXXX` first.
- **The mask and the rule live together**, in `apps/store-client/src/shared/lib/phone.ts`:
  `formatUAPhone` (display, may truncate), `normalizeUAPhone` (never truncates) and `isValidUAPhone`
  (`normalize` → pattern). A mask in the component and a regex in the schema is exactly how the
  two drifted apart.
- **The input emits the raw string.** `apps/store-client/src/shared/ui/phone-input.tsx` shows
  `formatUAPhone(value)` but hands RHF what the user typed; whoever consumes it normalises before
  deciding anything. Never validate the output of a function that can truncate.
- **The server also counts digits, not mask characters.** The contact form's rule runs server-side
  as `@IsUaPhone()` (`apps/store-api/src/common/validators/is-ua-phone.decorator.ts`); the order
  address deliberately uses the looser, country-agnostic `@IsInternationalPhone()` (an operator may
  take a foreign number by phone — see the comment in `apps/store-api/src/order/dto/address.dto.ts`).
  Either way the server never trusts the mask. A new masked field (EDRPOU, IBAN…) gets its
  normaliser + validator pair in `shared/lib` the same way.

### 4c. Every validated field has a default

Every field the schema validates needs an entry in the form's default values (e.g.
`CHECKOUT_DEFAULT_VALUES`, where `phone: ""` is there on purpose), or an untouched field is
`undefined` and zod reports its own English `"Required"` where the localized message belongs.

---

## Rule 5 — One rule per field, on both ends of the wire

> Written by TASK-1984 from the forms audit `docs/reviews/2026-11-12-forms-audit.md` (73 forms).
> The defect it closes: `050 111 2233 ccc` passed the storefront profile schema and came back as a
> generic toast, because the client stripped the letters before judging the number while the API
> refused them (SF-ACC-36).

The client rule for a field is the server rule for that field. It may be **stricter** only with a
written reason in a comment next to it (Rule 5f); it is **never looser** — every value the form
accepts must be a value the DTO accepts.

### 5a. Phone — two rules, the DTO decides which

Both rules are built from the same two parts, in the same order:

1. **Shape** — `PHONE_SHAPE = /^\+?[\d\s().-]+$/`: a leading `+`, digits and the usual separators.
   Letters, a second `+` or an extension make the value refused, never "cleaned".
2. **Digits**, counted on the normalised value (`normalizeUAPhone` → `380XXXXXXXXX` for any UA
   spelling, bare digits otherwise):
   - **UA** — `/^380\d{9}$/`. Server: `@IsUaPhone()`. Used where the number belongs to a shopper:
     checkout contact on the client, contact forms, the storefront profile (`UpdateProfileDto.phone`).
   - **International** — 9 to 15 digits. Server: `@IsInternationalPhone()`. Used where an operator may
     legitimately type a foreign number (order endpoints, TASK-338) and for the shop's own numbers
     (pickup points, site contacts — stored as typed, so a `0 800` line dials as written).

Before putting a phone rule on a field, open the DTO behind it and use the client rule with the same
name. The constants are spelled **identically** in three files —
`apps/store-api/src/common/validators/` (`is-ua-phone` / `is-international-phone`),
`apps/store-client/src/shared/lib/phone.ts`, `apps/store-admin/src/shared/lib/phone.ts` — and
`apps/store-api/src/common/validators/phone-parity.spec.ts` reads both client files and fails when a
pattern or a case in its shared table (`050 111 2233 ccc` → refused, `+48 123 456 789` → intl only…)
drifts. The apps cannot import each other, so the parity test is what keeps the copies honest.

### 5b. Schema helper and mask

- **Schema:** `phoneField({ rule: "ua" | "international", optional? })` from `shared/lib/phone.ts` —
  never a hand-written `.refine` or regex in a form schema. `optional: true` accepts `""` (the form
  then sends `null` / omits the key, as the DTO expects).
- **Input:** `PhoneInput` from `shared/ui/phone-input.tsx` (both apps):
  - `rule="ua"` draws the `+380 NN NNN NNNN` mask;
  - `rule="international"` draws nothing and only drops characters outside `PHONE_SHAPE`.
    Either way it emits the **sanitised raw** string — never the truncating mask (Rule 4b).

### 5c. Email

`emailField()` from `shared/lib/form-fields.ts`: `trim()` → `max(254)` → `email()`, localized messages.
Server counterpart: `@IsEmail() @MaxLength(254)` + `@Transform(normalizeEmail)`. No local email regex.

### 5d. Length and presence

- Every `@MaxLength(n)` in the DTO has `.max(n)` in the schema **and** `maxLength={n}` on the input
  (the TASK-794 pattern: a blocking rule without a rendered error is a silent button).
- A field the server requires (`@IsNotEmpty`, or a trimmed `@MinLength(1)`) is `trim().min(1)` on the
  client — `"   "` must not pass.
- Keep the limit in a named client constant with a comment pointing to the DTO file it mirrors.

### 5e. Money and dates

Amounts are parsed through the app's money helper (`parseMoneyInput` / `parseKop` in the admin),
never `Number(x)` alone: non-finite values (`Infinity`, `1e999`) are refused, and the bounds are the
DTO's `@Min` / `@Max`. Dates follow the DTO's bound too (e.g. a schedule date the server ignores when
it is in the past is refused on the client with a message, not silently replaced).

### 5f. Stricter on purpose

When the client is stricter than the server, say why next to the rule (e.g. storefront checkout is
UA-only while `AddressDto` is international — TASK-338). An undocumented stricter rule is a defect.

---

## Rule 6 — Where an error appears

### 6a. A field error lives under its field

`<p id="<field>-error" role="alert">` under the input, `aria-invalid` on the input and
`aria-describedby` pointing at the error (next to any hint id).

### 6b. A server 400 lands on the field it is about

The API returns, next to `message`, a machine-readable list built by the global `ValidationPipe`'s
`exceptionFactory` and passed through by `HttpExceptionFilter`:

```json
{
  "statusCode": 400,
  "message": "…",
  "fieldErrors": [
    { "field": "shippingAddress.phone", "constraint": "isInternationalPhone" }
  ]
}
```

On the client, `applyServerFieldErrors(error, setError, fieldMap)` from `shared/lib/form-errors.ts`
(both apps) puts a localized message (by `constraint`) under each mapped field and returns what it
could not map; only that remainder may become a banner or toast. `fieldMap` translates DTO paths to
form field names (`{ "shippingAddress.phone": "phone" }`). **Never match English server messages
with a regex** to find the field.

Coded business refusals that are about one field — email already registered, slug / SKU / discount
code taken — also go through `setError` on that field. Reference implementation:
`apps/store-admin/src/features/product-restore/ui/product-restore-dialog.tsx`.

### 6c. A toast only for an error with no field

Network failure, 5xx, a 409 stale-data conflict, a permission refusal, an action button with no
input. **One error is shown once**: never under the field _and_ in a toast.

### 6d. Written exceptions

Login, forgot-password and the public order lookup keep one generic banner on purpose — saying which
field was wrong would tell an attacker which accounts or orders exist.

---

## Rule 7 — Browser autofill keeps the design tokens

Chrome / Safari paint autofilled inputs with their own background and text colour. Each app's
`globals.css` overrides `input:-webkit-autofill` (and `:hover` / `:focus`, `textarea`, `select`)
with the input background token as an inset `box-shadow`, `-webkit-text-fill-color` and
`caret-color` from the foreground token, in both themes. Do not restyle autofill per component.

---

## Quick checklist for reviewers

- [ ] No `useState(prop)` seeded from async data without a render-time guard (Rule 1a) or
      `lastPushedRef` `useEffect` (Rule 1b).
- [ ] No `key`-remount on a text/search input.
- [ ] No RHF edit form using bare `defaultValues` from async data — `values` or `reset()` present.
- [ ] No inline `setTimeout` debounce — `useDebouncedCallback` used instead.
- [ ] No multi-step form advancing via a hand-rolled `trigger()` on a `type="button"` (Rule 4).
- [ ] No schema validating a masked string instead of the normalised value (Rule 4).
- [ ] No `useForm({ mode: "onChange" | "all" })` without a comment saying why (Rule 4a).
- [ ] A field set from code (`setValue`) passes `shouldValidate: true`; a blocked submit focuses
      the first invalid field (Rule 4a).
- [ ] Every schema-validated field has a default value (Rule 4c).
- [ ] Phone fields use `phoneField` + `PhoneInput` with the rule named by the DTO's decorator; email
      fields use `emailField` (Rule 5a–5c).
- [ ] Every DTO `@MaxLength` has a matching `.max()` and `maxLength`; server-required text is
      `trim().min(1)` (Rule 5d). Money is parsed by the money helper, bounds match the DTO (Rule 5e).
- [ ] The client is never looser than the DTO; a stricter rule has a comment saying why (Rule 5f).
- [ ] A server 400 goes through `applyServerFieldErrors`; field-specific coded refusals use
      `setError`; no regex over English server messages (Rule 6b).
- [ ] A toast only for an error without a field, and never in addition to a field error (Rule 6c).
