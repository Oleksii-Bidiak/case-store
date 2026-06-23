# Plan: Product Search Focus Sync — TASK-117

> **Status:** Done
> **Phase:** Phase A — Stabilize & close out
> **Created:** 2026-06-23
> **Last Updated:** 2026-06-23

## Overview

The product search input loses DOM focus on every keystroke. A user types a character, the
debounced `onSearch` fires after 300 ms, the parent calls `router.replace(...)`, the URL
`search` param changes, React sees a new `key` on `<SearchInput>`, unmounts the old element,
and mounts a fresh one — discarding focus in the process. The fix is to remove the `key`-based
remount entirely and make `SearchInput` self-syncing: the component stays mounted while the
URL evolves, retains focus across round-trips, and is still able to reflect external resets
(e.g. "Clear filters") by comparing the incoming `initialValue` against what the component
itself last pushed.

The `useDebouncedCallback` hook introduced by TASK-116-A is already available in
`apps/store-client/src/shared/lib/use-debounced-callback.ts` and is the canonical debounce
for this fix. The inline `setTimeout` inside `SearchInput`'s `useEffect` is replaced by a
call to that hook.

## Scope

### In Scope

- Remove the `key={`search-...`}` prop from `<SearchInput>` in `product-filters.tsx`.
- Refactor `SearchInput` to:
  - Replace the inline `setTimeout`/`useEffect` debounce with `useDebouncedCallback`.
  - Add a `lastPushedRef` guard so external `initialValue` changes (e.g. Clear) update the
    local controlled value without clobbering what the user is mid-typing.
  - Keep the `<Input>` fully controlled so the visible text updates on every keystroke.
  - Preserve the existing guard that prevents pushing when the new value equals the last
    pushed value (avoids redundant `router.replace` calls).
- Add `apps/store-client/src/features/product-filters/ui/search-input.test.tsx` covering the
  four regression scenarios described in the Technical Design.

### Out of Scope

- Backend changes — no API or schema work required.
- Orval regeneration — no generated files touched.
- Other forms that exhibit the stale-state pattern (`useState` seeded from props) — those are
  audited and fixed by TASK-141 (plan 050).
- The `minPrice`/`maxPrice` inputs in `product-filters.tsx` — they use `defaultValue` with
  `onBlur`, which is a different (uncontrolled) pattern and is out of scope here.
- Any store-admin forms — TASK-141 scope.

## User Stories

1. As a storefront customer, I want the search field to keep focus while I type a multi-word
   query, so that I do not have to click back into the field after every character.
2. As a storefront customer, I want the product list to update automatically as I finish
   typing (debounced), so that I get filtered results without pressing Enter.
3. As a storefront customer, I want the search field to clear when I click "Clear filters",
   so that the visible state matches the URL.
4. As a storefront customer, I want browser back/forward to restore the search field value
   correctly, so that navigation feels consistent.

## Root Cause Analysis

### The remount cycle

```tsx
// apps/store-client/src/features/product-filters/ui/product-filters.tsx (lines 59-63)
<SearchInput
  key={`search-${currentParams.search ?? ""}`} // <-- the culprit
  initialValue={currentParams.search ?? ""}
  onSearch={(value) => onFilterChange({ search: value })}
/>
```

The `key` prop is derived from `currentParams.search`, which comes from the URL. The full
cycle on a single keystroke:

1. User presses a key → `onChange` fires → `setValue(event.target.value)` (local state
   updates, input stays focused for now).
2. After 300 ms of inactivity, the inline `setTimeout` in the `useEffect` fires → calls
   `onSearch(trimmed)`.
3. `onSearch` → `onFilterChange({ search: value })` → `applyFilters` in
   `product-list-view.tsx` → `router.replace(...)` → URL `search` param changes.
4. Next render: `currentParams.search` equals the new value → `key` changes from
   `"search-iph"` to `"search-ipho"` → React treats this as a **different element**.
5. React **unmounts** the `SearchInput` with `id="filter-search"` and **mounts** a new
   one seeded with the new `initialValue`. The new DOM `<input>` is not focused — the old
   focused element was discarded.

The comment on line 8-11 of `search-input.tsx` even documents the remount approach as
intentional: "The parent remounts this component (via a `key`) when the URL value changes
externally, so local state is re-seeded without a sync effect." That is exactly the strategy
this plan removes.

### Why the existing inline debounce must also change

Even after removing the `key` prop, the inline debounce in `SearchInput` depends on
`initialValue` as a `useEffect` dependency:

```tsx
useEffect(() => {
  const handle = setTimeout(() => {
    const trimmed = value.trim();
    const next = trimmed === "" ? undefined : trimmed;
    const current =
      initialValue.trim() === "" ? undefined : initialValue.trim();
    if (next !== current) {
      onSearch(next);
    }
  }, 300);
  return () => clearTimeout(handle);
}, [value, initialValue, onSearch]);
```

With the remount removed, `initialValue` changes every time the URL echoes back the value
the component just pushed. Because `initialValue` is in the dependency array, the effect
re-runs and re-schedules a fresh 300 ms timer on every URL change — potentially firing a
second `onSearch` call even when the user has stopped typing. Replacing the whole block with
`useDebouncedCallback` eliminates this fragility.

## Technical Design

Three coordinated changes, all within `store-client` only.

### A) Remove the remount in `product-filters.tsx`

Drop the `key` prop from `<SearchInput>`. No other changes in this file.

**Before:**

```tsx
<SearchInput
  key={`search-${currentParams.search ?? ""}`}
  initialValue={currentParams.search ?? ""}
  onSearch={(value) => onFilterChange({ search: value })}
/>
```

**After:**

```tsx
<SearchInput
  initialValue={currentParams.search ?? ""}
  onSearch={(value) => onFilterChange({ search: value })}
/>
```

### B) Make `SearchInput` self-syncing with `useDebouncedCallback`

**File:** `apps/store-client/src/features/product-filters/ui/search-input.tsx`

The full replacement design:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import { dict } from "@/shared/config";
import { Input, Label } from "@/shared/ui";

interface SearchInputProps {
  /** Current search value from the URL (empty string when absent). */
  initialValue?: string;
  /** Called with the debounced, trimmed value (undefined when empty). */
  onSearch: (value: string | undefined) => void;
}

export function SearchInput({ initialValue = "", onSearch }: SearchInputProps) {
  const [value, setValue] = useState(initialValue);

  // Track the last value this component pushed to the URL so the sync effect
  // can distinguish our own echo from a genuine external change (e.g. Clear).
  // Normalisation: store as `undefined` when empty so it matches what `onSearch`
  // receives and what `initialValue` normalises to via `|| undefined`.
  const lastPushedRef = useRef<string | undefined>(
    initialValue.trim() === "" ? undefined : initialValue.trim(),
  );

  // Debounce the URL push — stable identity, so safe as a useEffect dep.
  const debouncedSearch = useDebouncedCallback((next: string | undefined) => {
    lastPushedRef.current = next;
    onSearch(next);
  }, 300);

  // Propagate external URL changes (e.g. Clear filters, browser back/forward)
  // back into local state — but only when the change did NOT come from this
  // component's own debounced push (which would clobber mid-typing input).
  useEffect(() => {
    const normalised =
      initialValue.trim() === "" ? undefined : initialValue.trim();
    if (normalised !== lastPushedRef.current) {
      setValue(initialValue);
      lastPushedRef.current = normalised;
    }
  }, [initialValue]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="filter-search">{dict.filters.searchLabel}</Label>
      <Input
        id="filter-search"
        type="search"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          const trimmed = next.trim();
          const normalised = trimmed === "" ? undefined : trimmed;
          // Only push when the value actually differs from the last pushed value
          // to prevent a redundant navigation loop.
          if (normalised !== lastPushedRef.current) {
            debouncedSearch(normalised);
          }
        }}
        placeholder={dict.filters.searchPlaceholder}
        aria-label={dict.filters.searchAria}
      />
    </div>
  );
}
```

#### The `lastPushedRef` guard explained

The guard prevents a mid-type clobber scenario:

1. User types "iphone" → `lastPushedRef.current = "iphone"` → URL becomes `?search=iphone`.
2. URL change → parent re-renders → `initialValue` prop = `"iphone"`.
3. Sync `useEffect` fires: `normalised = "iphone"`, `lastPushedRef.current = "iphone"` →
   `normalised === lastPushedRef.current` → **effect is a no-op**. User's focus is kept.
4. User types one more character before the echo: local `value` = `"iphone1"` (already ahead).
   When the echo arrives, the guard still fires at the previous `lastPushedRef` value, so no
   clobber occurs.
5. User clicks "Clear" → parent sets `initialValue = ""` → `normalised = undefined` →
   `lastPushedRef.current = "iphone"` → `undefined !== "iphone"` → **effect runs**,
   `setValue("")` clears the visible input.

#### Normalisation contract

Both sides of the comparison must use the same shape:

- `lastPushedRef.current`: `undefined` when empty, trimmed string when non-empty.
- `normalised` (from `initialValue`): same transformation applied symmetrically.
- `onSearch` already receives `undefined | trimmed-string` — no change to the prop contract.

#### Import path for `useDebouncedCallback`

Use the **direct** path, not the barrel:

```ts
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
```

Do NOT import from `@/shared/lib`. The barrel (`index.ts`) deliberately excludes
`use-debounced-callback` because the `"use client"` directive on that module would split the
SSR module graph when server components import the barrel for `formatMoney` or schema helpers,
breaking React Query's context. See the comment at the bottom of
`apps/store-client/src/shared/lib/index.ts`.

### C) New component test: `search-input.test.tsx`

**File:** `apps/store-client/src/features/product-filters/ui/search-input.test.tsx`

Runs in the `component` Jest project (jsdom + RTL + `@swc/jest`). No MSW handlers needed —
`SearchInput` has no direct API calls.

Four test cases:

**1. Controlled value updates immediately on keystroke**

Render `<SearchInput initialValue="" onSearch={jest.fn()} />`, use `userEvent.type` to type
`"a"`, assert `screen.getByRole("searchbox")` has `value === "a"` without advancing timers.

**2. `onSearch` fires once after 300 ms of inactivity (debounce collapses rapid input)**

Use `jest.useFakeTimers`. Type `"abc"` character by character (three separate `userEvent.type`
calls). Advance timers by 299 ms — `onSearch` not yet called. Advance 1 more ms — `onSearch`
called exactly once with `"abc"`.

**3. Focus retention across the URL round-trip (the regression test)**

This is the core regression guard. Render a stateful wrapper that:

- Holds `searchParam` in state (mirrors the URL value).
- Passes `searchParam` as `initialValue` and feeds the pushed value back via `onSearch`.

```tsx
function Harness() {
  const [searchParam, setSearchParam] = useState("");
  const onSearch = (v: string | undefined) => setSearchParam(v ?? "");
  return <SearchInput initialValue={searchParam} onSearch={onSearch} />;
}
```

Steps:

1. Render `<Harness />`.
2. `userEvent.click` on the input to focus it.
3. `userEvent.type` to type `"x"`.
4. Assert `document.activeElement` is the input (focus held during typing).
5. Advance timers by 300 ms (debounce fires → `onSearch("x")` → `searchParam = "x"` →
   React re-renders `Harness` → `initialValue = "x"`).
6. Assert `document.activeElement` is still the input (the URL echo did NOT remount it).

**4. External change resets the field**

Render with `initialValue="iphone"`. Then re-render (or use `rerender`) with
`initialValue=""` (simulating the Clear button). Assert the input value is `""`.

Specifically: `onSearch` must NOT have been called by the component itself during the reset
(the reset was external, not typed by the user).

## Tasks

### TASK-117-A: Remove key-remount and refactor `SearchInput` to use `useDebouncedCallback`

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-116-A (✅ Done — `useDebouncedCallback` is available)

**Acceptance Criteria:**

- [ ] `product-filters.tsx`: the `key` prop is removed from `<SearchInput>`.
- [ ] `search-input.tsx`: the inline `setTimeout`/`useEffect` block is removed.
- [ ] `search-input.tsx`: imports `useDebouncedCallback` from
      `@/shared/lib/use-debounced-callback` (direct path, NOT from `@/shared/lib`).
- [ ] `search-input.tsx`: a `lastPushedRef` (type `useRef<string | undefined>`) is added and
      initialised to the normalised `initialValue` (`undefined` when empty, trimmed string
      otherwise).
- [ ] `search-input.tsx`: the `onChange` handler calls `debouncedSearch(normalised)` only when
      `normalised !== lastPushedRef.current`.
- [ ] `search-input.tsx`: a `useEffect` keyed on `[initialValue]` syncs local state and
      `lastPushedRef` only when `normalised !== lastPushedRef.current` (external change).
- [ ] Typing in the search field does not lose focus between keystrokes (verified by the
      regression test in TASK-117-C).
- [ ] Clicking "Clear filters" empties the visible input field.
- [ ] Rapid typing sends only one `onSearch` call (the last value after 300 ms silence).
- [ ] `npm run lint -w apps/store-client` passes with no new warnings.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/product-filters.tsx` — remove `key` prop
- `apps/store-client/src/features/product-filters/ui/search-input.tsx` — full refactor

---

### TASK-117-B: (Folded into TASK-117-A)

The changes to `product-filters.tsx` and `search-input.tsx` are small enough to land in a
single atomic commit. TASK-117-B is folded into TASK-117-A. No separate sub-task needed.

---

### TASK-117-C: Add `search-input.test.tsx` covering the four regression scenarios

**Type:** test
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-117-A

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/product-filters/ui/search-input.test.tsx` is created.
- [ ] Test 1 — "updates visible value immediately": after `userEvent.type("a")`, the input
      `value` attribute is `"a"` without advancing fake timers.
- [ ] Test 2 — "collapses rapid keystrokes to one onSearch call": `onSearch` is called exactly
      once after 300 ms when three characters are typed in quick succession; the argument is
      the full typed string (not partial).
- [ ] Test 3 — "retains focus after the URL echo (regression test)": after typing `"x"`,
      advancing 300 ms, and the stateful `Harness` wrapper re-renders with
      `initialValue="x"`, `document.activeElement` is still the input element.
- [ ] Test 4 — "clears the field on external initialValue reset": after rendering with
      `initialValue="iphone"` then re-rendering with `initialValue=""`, the input value is
      `""` and `onSearch` was not called by the component's own debounce during the reset.
- [ ] All four tests pass in the `component` Jest project (jsdom + `@swc/jest`).
- [ ] No unhandled MSW requests (MSW server runs in `onUnhandledRequest: "error"` mode per
      `src/shared/test/setup.ts`; `SearchInput` makes no API calls, so no handlers needed).
- [ ] `npm run test -w apps/store-client` green (both `unit` and `component` projects).

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/search-input.test.tsx` — new test file

---

## Migration Steps

1. Confirm TASK-116-A is ✅ — it ships `useDebouncedCallback` at
   `apps/store-client/src/shared/lib/use-debounced-callback.ts`. (Already done.)
2. **TASK-117-A** — Apply the two-file change (remove `key` from `product-filters.tsx`,
   refactor `search-input.tsx`). Run `npm run lint -w apps/store-client` and
   `npm run typecheck -w apps/store-client` to verify.
3. **TASK-117-C** — Write `search-input.test.tsx`. Run
   `npm run test -w apps/store-client` to confirm both Jest projects are green.
4. Mark TASK-117 ✅ in `BACKLOG.md` once all three gates pass: lint, typecheck, test.
5. Unblock TASK-141 (plan 050) — it depends on both TASK-116 and TASK-117.

## Risks & Mitigations

| Risk                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mid-type clobber: the URL echo arrives while the user has already typed more characters, and the sync `useEffect` overwrites the newer local value                  | Prevented by `lastPushedRef`. The effect only runs when `normalised !== lastPushedRef.current`; an echo of our own push (`normalised === lastPushedRef.current`) is silently ignored.                                                                                                                              |
| Debounce swallowing the last keystroke: the user types and immediately blurs; the pending 300 ms timer fires after focus has moved away, but `onSearch` still fires | Acceptable and correct — the search should still apply. If the user moves focus away while typing, the debounce fires the final value. No focus is being managed here; the concern is only that the push happens.                                                                                                  |
| SSR barrel import mistake: developer imports `useDebouncedCallback` from `@/shared/lib` instead of the direct path, splitting the module graph                      | Documented in `shared/lib/index.ts` (comment already present). Calling out the correct import path explicitly in the task acceptance criteria and the code sketch above. The `component` project tests will fail if the hook is loaded server-side (mismatched React instance), providing an early signal.         |
| Focus race on slow refetch: React Query triggers a background refetch while the user is typing; a re-render with new `initialValue` could trigger the sync effect   | The guard compares against `lastPushedRef.current`. As long as the background refetch returns the same `search` value the component last pushed, the effect is a no-op. Only a refetch that changes the search param (e.g. admin clears from another tab) would update the field — which is the correct behaviour. |
| `onSearch` prop identity changes on every parent render, causing `debouncedSearch` to re-create via `useDebouncedCallback`                                          | `useDebouncedCallback` captures `onSearch` in a ref (`fnRef`) so the stable debounced callback always calls the latest closure. Re-creation happens only if `delay` changes (it does not — it is constant `300`).                                                                                                  |

## Notes

### Cross-references

- **TASK-116 / plan 049** — `useDebouncedCallback` was designed with this exact TASK-117
  reuse in mind. The hook's JSDoc comment explicitly mentions "the exact property
  `SearchInput` needs for TASK-117". The hook's stable-identity guarantee (identity changes
  only when `delay` changes) is the property that makes it safe to call from within an effect
  dependency array.
- **TASK-141 / plan 050** — The broader forms state-sync audit. TASK-141 depends on both
  TASK-116 and TASK-117 being ✅. After this plan lands, TASK-141 audits the remaining
  codebase (`apps/store-admin` edit forms, `apps/store-client` profile form) using the
  patterns established by TASK-116-B and TASK-117-A as reference implementations.

### No Orval regeneration needed

All changes are confined to the `features/product-filters` slice and `shared/lib` usage.
No backend endpoints, DTOs, or generated hooks are modified.

### Jest project for the new test

`search-input.test.tsx` (`.tsx` extension) targets the `component` Jest project
(`testMatch: ["**/*.test.tsx"]`, jsdom env, `@swc/jest` transform). The `unit` project only
matches `.test.ts`. The setup file `src/shared/test/setup.ts` (loaded via
`setupFilesAfterEnv`) starts the MSW server globally — no per-file setup needed.
`SearchInput` makes no HTTP calls, so no MSW handlers are required; the
`onUnhandledRequest: "error"` setting is not triggered.
