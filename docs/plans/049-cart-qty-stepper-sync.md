# Plan: Cart Qty Stepper Sync — TASK-116

> **Status:** Done
> **Phase:** Phase A — Stabilize & close out
> **Created:** 2026-06-23
> **Last Updated:** 2026-06-23

## Overview

The quantity stepper in `CartItemRow` exhibits a "one-click-behind" bug: pressing + or −
visually updates the server's value immediately (the mutation fires), but the counter itself
only reflects the new value on the **second** click. The root cause is a stale local `qty`
state that is never re-synchronized after the cart refetch completes. Additionally, every
stepper click fires a server write with zero debounce, so rapid tapping dispatches multiple
redundant mutations.

A new, general-purpose `useDebouncedCallback` hook will be placed in `shared/lib/` so that
TASK-117 (product search re-mount bug) can reuse it without duplication.

## Scope

### In Scope

- Fix the stale-`qty` desync in `CartItemRow` (optimistic update + prop-to-state sync).
- Extract the inline debounce from `SearchInput` into a typed `useDebouncedCallback` hook in
  `apps/store-client/src/shared/lib/`.
- Debounce server writes in `CartItemRow` using the new hook.
- Unit test for `useDebouncedCallback`.
- Update/extend the existing `CartItemRow` component tests (`.test.tsx`) to assert the
  first-click counter update.

### Out of Scope

- TASK-117: refactoring `SearchInput` to use `useDebouncedCallback` (different component,
  tracked separately; the hook signature is designed with that reuse in mind).
- The broader "all forms" stale-state audit referenced in `manual-qa-master.md:236`. This
  plan notes the pattern but does not remediate other forms — those are follow-up tasks.
- Backend changes — `useUpdateCartItem` is Orval-generated and correct; no API changes needed.
- Stock validation on the backend (already enforced; this plan only preserves the client cap).

## User Stories

1. As a customer, I want the quantity counter to reflect my click immediately (on the first
   press), so that I can see the updated count and line total without clicking twice.
2. As a customer, I want rapid tapping of +/− not to flood the server with duplicate writes,
   so that the cart state stays consistent.

## Root Cause Analysis

### Stale local state (`qty` never re-syncs from the refetched prop)

```tsx
// apps/store-client/src/widgets/cart/ui/cart-item-row.tsx  (current, lines 29 & 54-65)

const [qty, setQty] = useState(item.quantity); // seeded once on mount

const commit = (next: number) => {
  const clamped = Math.max(0, Math.min(maxQty, next));
  if (clamped === item.quantity) {
    // compares against the PROP, not local qty
    setQty(item.quantity);
    return;
  }
  // ...mutate
};
```

The flow on first click (+):

1. `commit(qty + 1)` runs — `clamped` (e.g., 3) !== `item.quantity` (2) → mutation fires.
2. `onSuccess` calls `invalidateQueries`, React Query refetches the cart.
3. The parent re-renders `CartItemRow` with a new `item` prop (quantity = 3).
4. **`useState` does not re-run on a prop change once the component is mounted.**
   `qty` is still 2 locally.
5. User presses + again → `commit(qty + 1)` = `commit(3)`. `clamped` (3) === `item.quantity`
   (3, the newly-arrived prop) → early return, `setQty(3)` called, visual update happens.
   The mutation does **not** fire a second time, which is why QA sees "counter only updates
   on the second click."

### No debounce on server writes

Each button press triggers an immediate `mutate()`. Rapid double-clicking sends two separate
PATCH requests, the second of which may arrive before the first is processed (race).

## Technical Design

### New shared hook: `useDebouncedCallback`

**File:** `apps/store-client/src/shared/lib/use-debounced-callback.ts`

```typescript
import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced version of `fn` that fires only after `delay` ms of
 * inactivity. Any in-flight timer is cancelled on unmount.
 *
 * @param fn     - The callback to debounce. Captured in a ref so the returned
 *                 handle is stable across renders (safe as a useEffect dep).
 * @param delay  - Debounce delay in milliseconds (default 300 ms).
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay = 300,
): (...args: Args) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the ref current without invalidating the stable callback.
  useEffect(() => {
    fnRef.current = fn;
  });

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delay);
    },
    [delay],
  );
}
```

The returned callback is **stable** (identity preserved across renders unless `delay` changes),
which makes it safe to pass as a `useEffect` dependency — the exact property `SearchInput`
needs for TASK-117.

### `CartItemRow` fix

**File:** `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`

Two changes:

**1. Optimistic `setQty` inside `commit`, plus prop-to-state sync via `useEffect`:**

```tsx
// Replace the useState initializer with the same value — no change there.
const [qty, setQty] = useState(item.quantity);

// Sync local state whenever the server-authoritative prop changes
// (i.e., after a successful refetch or when the parent re-renders with
// updated data from the query cache).
useEffect(() => {
  setQty(item.quantity);
}, [item.quantity]);

const commit = (next: number) => {
  const clamped = Math.max(0, Math.min(maxQty, next));
  if (clamped === qty) return; // compare against LOCAL state, not the prop
  setQty(clamped); // optimistic update — counter reflects on 1st click
  if (clamped <= 0) {
    removeItem.mutate({ itemId: item.id });
  } else {
    debouncedUpdate(clamped); // debounced server write
  }
};
```

**2. Debounced server write using the new hook:**

```tsx
import { useDebouncedCallback } from "@/shared/lib";

const debouncedUpdate = useDebouncedCallback((clamped: number) => {
  updateItem.mutate({ itemId: item.id, data: { quantity: clamped } });
}, 300);
```

The `revert` callback on mutation error sets `qty` back to `item.quantity` (unchanged from
current behaviour — it still uses the prop, which is correct as the revert target).

### Export from `shared/lib`

Add to `apps/store-client/src/shared/lib/index.ts`:

```ts
export * from "./use-debounced-callback";
```

## Tasks

### TASK-116-A: Create `useDebouncedCallback` hook in `shared/lib`

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-client/src/shared/lib/use-debounced-callback.ts` created with the
      signature shown in Technical Design.
- [ ] `apps/store-client/src/shared/lib/use-debounced-callback.test.ts` written and green
      (pure-logic unit test, `unit` Jest project).
- [ ] Tests cover: callback fires after delay; intermediate calls are cancelled (only last
      fires); delay reset on each call; cleanup on unmount does not call the callback.
- [ ] Hook exported from `apps/store-client/src/shared/lib/index.ts`.
- [ ] `npm run test -w apps/store-client` green.

**Files to create/modify:**

- `apps/store-client/src/shared/lib/use-debounced-callback.ts` — new hook (implementation)
- `apps/store-client/src/shared/lib/use-debounced-callback.test.ts` — unit tests
- `apps/store-client/src/shared/lib/index.ts` — add re-export

---

### TASK-116-B: Fix stale-state and debounce in `CartItemRow`

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-116-A

**Acceptance Criteria:**

- [ ] `useEffect(() => { setQty(item.quantity); }, [item.quantity])` added so local state
      syncs after every server-authoritative refetch.
- [ ] `commit()` calls `setQty(clamped)` **before** dispatching the mutation (optimistic
      update).
- [ ] `commit()` guards against `clamped === qty` (local state) — not `item.quantity` — to
      prevent no-op mutations.
- [ ] Server write uses `debouncedUpdate` (300 ms) from `useDebouncedCallback`.
- [ ] Stock cap (`maxQty = Math.min(MAX_QUANTITY, item.stock)`) and `MAX_QUANTITY = 99` cap
      preserved — no regression.
- [ ] `revert` on mutation error still restores `item.quantity` (server-authoritative value).
- [ ] `npm run lint -w apps/store-client` clean; `npm run typecheck -w apps/store-client`
      passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` — apply both fixes (useEffect
  sync + optimistic setQty + debouncedUpdate)

---

### TASK-116-C: Update `CartItemRow` component tests

**Type:** test
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-116-B

**Acceptance Criteria:**

- [ ] Existing tests in `cart-item-row.test.tsx` remain green (no regression).
- [ ] New test: "counter updates to the new value immediately on the first + click" — after
      one `userEvent.click` on the increase button, the input value equals `item.quantity + 1`
      **before** the MSW response resolves (asserts the optimistic update, not the server round
      trip).
- [ ] New test: "rapid clicks send only one PATCH request" — `userEvent.click` the + button
      3 times in quick succession; MSW handler is called exactly once (debounce collapses the
      calls). Use `jest.useFakeTimers` + `act` to advance time by 300 ms.
- [ ] `npm run test -w apps/store-client` green (both `unit` and `component` Jest projects).

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-item-row.test.tsx` — add two new test cases

---

## Migration Steps

1. **TASK-116-A** — Create the hook and its unit tests first (TDD: write tests, then
   implement). Run `npm run test -w apps/store-client` to confirm the `unit` project is green.
2. **TASK-116-B** — Apply the two-line fix in `cart-item-row.tsx`. Run lint + typecheck.
3. **TASK-116-C** — Extend the component test suite. Run the full test command to confirm
   both `unit` and `component` Jest projects pass.

## Risks & Mitigations

| Risk                                                                                 | Mitigation                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useEffect` sync loop if `item.quantity` and `qty` diverge in a cycle                | The effect only depends on `item.quantity` (a primitive); React will not loop — `setQty` with the same value is a no-op                                                         |
| Debounce swallows the last user intent when the user types manually then clicks away | `onBlur` fires `commit(qty)` synchronously (unchanged); debounce only applies to button clicks via `debouncedUpdate` inside `commit` — manual-entry blur path remains immediate |
| Timer leak if the component unmounts mid-debounce                                    | `useDebouncedCallback` clears `timerRef` in its unmount `useEffect` cleanup                                                                                                     |
| TASK-117 `SearchInput` still uses inline `setTimeout`                                | Out of scope; flagged for TASK-117 to adopt `useDebouncedCallback` once available                                                                                               |

## Notes

### The "all forms" stale-state pattern

`manual-qa-master.md:236` notes this is "проблема усіх форм на сайті" (a problem of all
forms on the site). The same root cause — a local `useState` seeded from a prop but never
re-synced — can appear in any controlled input that accepts server data as an initial value.
This plan fixes only `CartItemRow`. A follow-up audit of other forms (checkout, product edit
in admin, etc.) is warranted but is intentionally out of scope here to keep the change atomic.

### TASK-117 dependency on the new hook

`SearchInput` (`apps/store-client/src/features/product-filters/ui/search-input.tsx`) already
contains an inline debounce (`setTimeout` in a `useEffect`). TASK-117 will replace that
inline logic with a call to `useDebouncedCallback` once TASK-116-A ships the hook. The hook
signature is designed with that exact call pattern in mind.

### No Orval regeneration needed

`useUpdateCartItem` and `useRemoveCartItem` are already generated and correct. This fix is
entirely within the widget layer — no backend or API contract changes.

### Jest project awareness

`apps/store-client` has two Jest projects (`unit` — `.test.ts`, node env; `component` —
`.test.tsx`, jsdom env). TASK-116-A tests live in the `unit` project (pure-logic, no DOM).
TASK-116-C tests live in the `component` project (RTL + MSW). Both are run by
`npm run test -w apps/store-client`.
