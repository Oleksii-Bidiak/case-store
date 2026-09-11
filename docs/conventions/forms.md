# Form State Sync Conventions

> **Why this exists:** A manual-QA finding (`docs/archive/manual-qa-master.md:236`) described "проблема
> усіх форм на сайті" — a stale-local-state pattern affecting forms across the storefront and
> admin. The root cause is local state (`useState` or RHF `defaultValues`) that is seeded once
> from async server data and never re-synchronised when that data changes after a refetch.
> These rules are the agreed remediation patterns. See `docs/plans/050-forms-state-sync-audit.md`
> (TASK-141) for the full inventory and rationale.

There are three rules. Reviewers should reject any new form/input that violates them.

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

**Placeholder — the rule itself is written by TASK-453.** TASK-407 fixed the instances that prompted
it and records them here so the eventual text has something concrete to generalise from:

- **Timing.** A multi-step RHF form advances through `handleSubmit(next)` on a `type="submit"`
  button, never a `type="button"` calling `trigger()` by hand. RHF arms `reValidateMode` on
  **submit**, and a manual `trigger` is not one — so errors raised that way appear at the right
  moment but never clear while the user fixes the field. Seen on
  `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx`, step 1.
- **Mask vs value.** Validate the **normalised** value, never the characters a display mask drew.
  `checkout-schema.ts` tested the phone against `/^\+?[\d\s()-]{10,20}$/`, which accepted a string of
  brackets and a number with digits missing out of the middle. The mask and the rule now live
  together in `apps/store-client/src/shared/lib/phone.ts`.
- **Defaults.** Every field the schema validates needs an entry in the form's default values, or an
  untouched field is `undefined` and zod reports its own English `"Required"` where the localized
  message belongs.

---

## Quick checklist for reviewers

- [ ] No `useState(prop)` seeded from async data without a render-time guard (Rule 1a) or
      `lastPushedRef` `useEffect` (Rule 1b).
- [ ] No `key`-remount on a text/search input.
- [ ] No RHF edit form using bare `defaultValues` from async data — `values` or `reset()` present.
- [ ] No inline `setTimeout` debounce — `useDebouncedCallback` used instead.
- [ ] No multi-step form advancing via a hand-rolled `trigger()` on a `type="button"` (Rule 4).
- [ ] No schema validating a masked string instead of the normalised value (Rule 4).
