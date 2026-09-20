# Form State Sync Conventions

> **Why this exists:** A manual-QA finding (`docs/archive/manual-qa-master.md:236`) described "проблема
> усіх форм на сайті" — a stale-local-state pattern affecting forms across the storefront and
> admin. The root cause is local state (`useState` or RHF `defaultValues`) that is seeded once
> from async server data and never re-synchronised when that data changes after a refetch.
> These rules are the agreed remediation patterns. See `docs/plans/050-forms-state-sync-audit.md`
> (TASK-141) for the full inventory and rationale.

There are four rules. Reviewers should reject any new form/input that violates them.

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
