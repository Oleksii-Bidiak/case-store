# Plan: Cross-Cutting Forms State Sync Audit & Remediation — TASK-141

> **Status:** Done (code) — manual multi-tab QA of admin edit forms pending
> **Phase:** Phase A — Stabilize & close out
> **Created:** 2026-06-23
> **Last Updated:** 2026-06-24

## Overview

A manual-QA finding (`docs/manual-qa-master.md:236`) described "проблема усіх форм на сайті"
(a problem affecting all forms on the site). The root cause is a stale-local-state pattern that
appears in two distinct variants:

1. **Controlled-input variant** — a local `useState` is seeded from a prop once on mount and
   never re-synchronized when the prop changes after a server refetch. `CartItemRow` exhibited
   the confirmed active bug (fixed by TASK-116). `SearchInput` had a parent-managed `key`-remount
   strategy that caused focus loss on every keystroke (fixed by TASK-117 — the `key` was REMOVED
   and replaced with a controlled input + `lastPushedRef` guard).

2. **React Hook Form variant** — admin edit forms and the storefront profile form use bare
   `defaultValues` without pairing with RHF's `reset()` or the `values` option. Because the
   parent view guards rendering until the query resolves (`product ? <ProductForm ... /> : null`),
   these forms are currently lower-risk than variant 1 — they mount with the correct server data.
   They become vulnerable only if the underlying query is invalidated and refetched while the form
   is still open (e.g., background polling, another tab, stale-while-revalidate), at which point
   field values silently lag behind.

TASK-141 is the cross-cutting follow-on that:

- Produces a verified, grep-based inventory of every affected file across both apps.
- Standardizes the remediation patterns now that TASK-116 and TASK-117 have shipped reusable
  reference implementations.
- Adds a brief convention note to prevent regressions.

## Dependencies

**Both TASK-116 and TASK-117 are ✅ satisfied. TASK-141 may begin immediately.**

Reference implementations that TASK-141 auditors must point to when remediating other files:

- **P1 simple sync (no focus concern):** `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`
  — render-time guard `if (item.quantity !== syncedQuantity) { setSyncedQuantity(...); setQty(...); }`
  (React's recommended "adjusting state during render" pattern).
- **P1 focus-sensitive guarded sync:** `apps/store-client/src/features/product-filters/ui/search-input.tsx`
  — controlled value stays mounted; `lastPushedRef` guard in `useEffect([initialValue])` re-seeds
  local state only on genuine external changes, ignoring the component's own URL echo.
- **Canonical debounce hook:** `apps/store-client/src/shared/lib/use-debounced-callback.ts`

## Scope

### In Scope

- Full grep-based sweep of `apps/store-client` and `apps/store-admin` for:
  - `useState(` seeded from a prop or async data.
  - `defaultValues` passed to `useForm()` from an async source without `reset()` / `values`.
  - Inline ad-hoc debounce patterns (`setTimeout` inside `useEffect`, per-component
    `useRef<ReturnType<typeof setTimeout>>`).
- Risk classification of each finding (active bug / latent / not-affected).
- Remediation: apply render-time sync or guarded `useEffect` to all confirmed active-bug
  controlled inputs; apply `values` or `reset()` to RHF forms where the latent risk warrants it.
- Replace any remaining per-component ad-hoc debounce with `useDebouncedCallback`.
- Add a short convention note to `CLAUDE.md` (or a referenced `docs/conventions/forms.md`)
  documenting the agreed patterns so reviewers can catch regressions.
- Optional: add a custom ESLint rule or comment-based guardrail to detect bare
  `useState(prop)` without a sibling sync.

### Out of Scope

- TASK-116: point fix for `CartItemRow` (shipped ✅).
- TASK-117: point fix for `SearchInput` (shipped ✅).
- Backend or API changes — this audit is purely frontend.
- New forms or features — audit only existing code at the time TASK-116/117 landed.
- The broader checkout form (different pattern — controlled by RHF with values that come from the
  page-level query; verify but expect no change needed).

## User Stories

1. As a developer, I want a single verified inventory of every form/input that is seeded from
   async data, so that I know exactly which files carry active bugs or latent risk.
2. As an admin user, I want product and category edit forms to reflect the latest saved data
   even if the query refetches while I have the form open, so that I never submit stale values.
3. As a storefront customer, I want my profile form to stay in sync if my profile data is
   updated in another tab, so that I do not accidentally overwrite newer data with old values.
4. As a developer, I want a shared debounce utility (already in `shared/lib` after TASK-116)
   used consistently, so that I do not write yet another per-component `setTimeout`.
5. As a reviewer, I want a documented convention that makes the correct pattern obvious, so
   that new form implementations follow it without a separate code-review catch.

## Full Inventory of Affected Files

The following table is grounded in a real grep sweep performed at planning time. Each file is
classified against two anti-patterns: **P1** (controlled `useState` seeded from a prop) and
**P2** (RHF `useForm({ defaultValues })` from async data without `reset()`/`values`).

| #   | File                                                                        | Pattern           | Risk                                                                                                                                                            | Notes                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`                   | P1                | **Active bug** — `useState(item.quantity)` never re-synced; `commit()` compared against stale prop                                                              | Fixed by **TASK-116**. Reference implementation: render-time guard (`syncedQuantity` pattern).                                                                                                      |
| 2   | `apps/store-client/src/features/product-filters/ui/search-input.tsx`        | P1                | **Active bug** — parent previously remounted on every URL change via `key`; input lost focus                                                                    | Fixed by **TASK-117**. `key`-remount REMOVED. Reference implementation: controlled value + `lastPushedRef` guarded `useEffect([initialValue])`.                                                     |
| 3   | `apps/store-client/src/features/profile/ui/profile-form.tsx`                | P2                | **Latent** — `defaultValues: { firstName: user.firstName, … }` from `user` prop; no `reset()`; `user` comes from a query that can refetch                       | Parent mounts form only after `user` resolves, so initial values are correct. Becomes stale if query refetches while open. Low-frequency risk.                                                      |
| 4   | `apps/store-admin/src/features/product-form/ui/product-form.tsx`            | P2                | **Latent** — `defaultValues: { ...defaultValues }` spread from `product` data; no `reset()` or `values`                                                         | Same guard pattern as #3. Risk: background refetch while admin has form open during a long edit session.                                                                                            |
| 5   | `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`   | P2 (orchestrator) | **Latent** — renders `<ProductForm defaultValues={mapProductToFormValues(product)} />` only after `product` resolves; still vulnerable to mid-session refetch   | No direct form hook; risk is inherited from #4.                                                                                                                                                     |
| 6   | `apps/store-admin/src/features/category-form/ui/category-form.tsx`          | P2                | **Latent** — `defaultValues: { ...defaultValues }` from category data; no `reset()` or `values`                                                                 | Same pattern as #4.                                                                                                                                                                                 |
| 7   | `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx` | P2 (orchestrator) | **Latent** — renders `<CategoryForm defaultValues={mapCategoryToFormValues(category)} />` only after `category` resolves                                        | Same as #5.                                                                                                                                                                                         |
| 8   | `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx`              | P3 (debounce)     | **Debounce consolidation** — inline `setTimeout` inside `useEffect` (lines 75–83) to debounce `searchInput` → URL `?search=` param. Functionally correct.       | Not a stale-value bug. No focus issue (the input is not remounted). Qualifies for TASK-141-D: migrate to `useDebouncedCallback`.                                                                    |
| 9   | `apps/store-admin/src/widgets/product-list/ui/admin-product-table.tsx`      | P1 (latent, low)  | **Latent** — `useState(searchParam)` seeded from the URL `?search=`; no re-sync. Search is **submit-based** (form `onSubmit`), NOT debounced — no `setTimeout`. | Found during TASK-141-A sweep (not in the original inventory). Stale only on external URL change (browser back/forward shows old text). Low risk; manual submit. NOT a TASK-141-D debounce finding. |
| 10  | `apps/store-admin/src/widgets/category-list/ui/admin-category-table.tsx`    | P1 (latent, low)  | **Latent** — identical to #9: `useState(searchParam)` from URL, submit-based search, no debounce, no `setTimeout`.                                              | Found during TASK-141-A sweep. Same low-risk back/forward staleness as #9. NOT a TASK-141-D debounce finding.                                                                                       |

> **TASK-141-A sweep result (2026-06-24):** Rows #9 and #10 are the only findings not present at
> planning time. Both are submit-based admin search inputs — low-risk latent staleness on
> back/forward, no debounce involved. No remediation in this pass (documented for awareness; would
> follow Rule 1b — `lastPushedRef` guard — if a focus/sync issue is ever reported). The `setTimeout`
> sweep confirmed `AdminUserTable.tsx` (row #8) is the **only** ad-hoc debounce in either app; the
> sole other `setTimeout` is inside `use-debounced-callback.ts` itself (exempt). No new RHF
> `defaultValues` findings beyond rows #3–#7.

**Confirmed NOT affected (verified clean):**

| File                                                                        | Reason                                                                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/store-client/src/widgets/header/ui/header.tsx`                        | `useState(false)` for mobile menu — pure local UI state, no prop seed.                                                       |
| `apps/store-client/src/widgets/cart/ui/cart-summary.tsx`                    | `useState(false)` for confirm dialog — pure local UI state.                                                                  |
| `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx`   | `useState<string                                                                                                             | null>(null)` for selected variant — intentionally local; falls back to first active variant via derived value (no prop seed). |
| `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` | `useState(0)` for active thumbnail index; `useState({})` for failed-load map — both pure local UI, no prop seed.             |
| `apps/store-client/src/app/providers.tsx`                                   | `useState(() => new QueryClient())` — lazy initializer pattern; correct and idiomatic.                                       |
| `apps/store-client/src/entities/session/model/auth.context.tsx`             | Multiple `useState(null)` / `useState(true)` — initialized from constants, populated via `setTokens` callback; no prop seed. |

## Technical Design

### Remediation pattern A — Controlled input with prop seed (P1, no focus concern)

For any `useState(propValue)` where `propValue` comes from server data and the component is not
a text input where the user is actively typing:

```tsx
// Use React's "adjusting state during render" idiom (avoids an extra render cycle
// compared to useEffect). The reference implementation is cart-item-row.tsx.
const [value, setValue] = useState(item.someField);
const [syncedField, setSyncedField] = useState(item.someField);
if (item.someField !== syncedField) {
  setSyncedField(item.someField);
  setValue(item.someField);
}
```

The reference implementation for this pattern is `cart-item-row.tsx` (TASK-116).

### Remediation pattern A2 — Focus-sensitive controlled input (P1)

For text/search inputs where the user is actively typing (focus must be preserved across
URL round-trips):

```tsx
// The canonical P1 pattern for focus-sensitive inputs is the lastPushedRef guard.
// The key-remount approach is NOT acceptable — it unmounts the DOM element and
// destroys focus. Reference: search-input.tsx (TASK-117).
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

### Remediation pattern B — RHF form with async defaultValues (P2)

Option B-1: use RHF's `values` option (preferred for live-sync):

```tsx
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  values: mapEntityToFormValues(entity), // re-syncs on every render where entity changes
});
```

`values` re-syncs the entire form whenever the reference changes. Pair with `resetOptions`
to control whether dirty fields are overwritten:

```tsx
values: mapEntityToFormValues(entity),
resetOptions: {
  keepDirtyValues: true,   // keep the admin's edits; only update pristine fields
},
```

Option B-2: call `reset()` inside a `useEffect` keyed to the entity id:

```tsx
useEffect(() => {
  if (entity) {
    form.reset(mapEntityToFormValues(entity));
  }
}, [entity?.id]); // re-run only when the entity id changes (e.g., router param change)
```

For the admin edit forms (files #4, #6), option B-2 with `entity.id` dependency is
recommended because it avoids overwriting in-progress edits during background refetches —
only a truly new entity (navigating to a different product) triggers a full reset.

For the profile form (file #3), option B-1 with `keepDirtyValues: true` is preferred —
the user is always editing their own profile so the entity id never changes, but a background
refetch should still surface any server-side changes to fields the user has not touched.

### Shared debounce utility

The canonical hook is:

```
apps/store-client/src/shared/lib/use-debounced-callback.ts
```

**Important:** this hook is marked `"use client"` and is intentionally EXCLUDED from the
`shared/lib/index.ts` barrel. Adding a client module to the barrel (which server components
also import for utilities like `formatMoney`) splits the module graph and breaks React Query
context during SSR. Always import it directly:

```ts
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
```

If `store-admin` needs the hook (e.g., for TASK-141-D's `AdminUserTable` migration), copy the
hook file verbatim into `apps/store-admin/src/shared/lib/use-debounced-callback.ts` and apply
the same barrel-exclusion rule there. Do NOT import it across app boundaries.

### Convention note location

Add a new section **"Form State Sync Conventions"** to `CLAUDE.md` (under the Workflow
reminders block) or create `docs/conventions/forms.md` and reference it from `CLAUDE.md`.
The note must cover:

1. Never seed `useState` from a prop that reflects async server data without a sync guard
   (render-time or `useEffect` with `lastPushedRef`). Never use `key`-remount on focus-sensitive
   inputs — it destroys focus.
2. RHF edit forms: use `values` (for live-sync) or `reset(entity)` in a `useEffect` keyed
   to the entity id — never bare `defaultValues` alone when data is async.
3. Debounce: always use `useDebouncedCallback` from `shared/lib/use-debounced-callback` (direct
   import, not the barrel); do not write per-component `setTimeout` inside `useEffect`.

## Tasks

### TASK-141-A: Verified grep sweep + risk inventory

**Type:** refactor (planning/audit)
**Scope:** store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-116 ✅, TASK-117 ✅

**Acceptance Criteria:**

- [x] Run the following grep commands and record every hit with file + line number:
  - `grep -rn "useState(" apps/store-client/src apps/store-admin/src` — filter to
    occurrences where the argument is a prop or comes from a query result.
  - `grep -rn "defaultValues" apps/store-client/src apps/store-admin/src` — collect all RHF
    forms using async data as defaults.
  - `grep -rn "setTimeout" apps/store-client/src apps/store-admin/src` — identify any
    remaining ad-hoc debounce patterns.
- [x] Produce an updated inventory (amend this plan's inventory table) with any new findings
      not present at planning time. **New: rows #9, #10** (admin product/category tables —
      submit-based `useState(searchParam)`, low-risk latent). Known pre-existing finding:
      `AdminUserTable.tsx` line 78 (inline `setTimeout` debounce — P3, row #8).
- [x] Classify each as: active bug / latent / not affected, with a one-line rationale.
- [x] No code changes in this sub-task.

> **Done 2026-06-24.** Sweep ran across both apps (`.ts` + `.tsx`). Only new findings are rows
> #9/#10 (low-risk, no remediation this pass). `setTimeout` debounce confined to `AdminUserTable`
> (row #8) → TASK-141-D. No new RHF findings.

**Files to create/modify:**

- `docs/plans/050-forms-state-sync-audit.md` — update inventory table if new hits found

---

### TASK-141-B: Remediate P2 latent risk in admin edit forms

**Type:** fix
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-141-A

**Acceptance Criteria:**

- [x] `apps/store-admin/src/features/product-form/ui/product-form.tsx`: replaced bare
      `defaultValues` with the RHF `values` option (`values: defaultValues ? { ...EMPTY_VALUES,
    ...defaultValues } : undefined`) + `resetOptions: { keepDirtyValues: true }`. Create mode
      (`defaultValues` undefined) keeps `values` omitted and uses `defaultValues: EMPTY_VALUES`.
- [x] `apps/store-admin/src/features/category-form/ui/category-form.tsx`: same treatment.
- [x] `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`: **no change** —
      using the `values` option, so no orchestrator wiring needed (it already passes
      `mapProductToFormValues(product)`; RHF deep-compares so the inline object is safe).
- [x] `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx`: **no change**,
      same reason.
- [ ] Manual test: open an edit form, trigger a background refetch (e.g., focus another tab
      and return), confirm form fields reflect updated server data on pristine fields and preserve
      dirty user edits. → **Pending manual QA** (needs running app + DB).
- [x] `npm run lint -w apps/store-admin` clean.
- [x] `npm run typecheck -w apps/store-admin` passes.

> **Done 2026-06-24** (code). Used the `values` option (B-1) over `reset()`-keyed-to-id (B-2):
> `keepDirtyValues` achieves the same edit-preservation goal without plumbing the entity id into
> the reusable form or lifting `useForm` into the orchestrators. Manual multi-tab QA pending.

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — add `values` / `reset()` sync
- `apps/store-admin/src/features/category-form/ui/category-form.tsx` — add `values` / `reset()` sync
- `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx` — wire effect if needed
- `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx` — wire effect if needed

---

### TASK-141-C: Remediate P2 latent risk in storefront profile form

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-141-A

**Acceptance Criteria:**

- [x] `apps/store-client/src/features/profile/ui/profile-form.tsx`: switched to RHF `values`
      option with `resetOptions: { keepDirtyValues: true }` so background refetches update
      pristine fields without discarding in-progress edits.
- [x] `isDirty` guard on the Save button remains functional (dirty state is preserved by
      `keepDirtyValues`).
- [x] `npm run lint -w apps/store-client` clean.
- [x] `npm run typecheck -w apps/store-client` passes.

> **Done 2026-06-24.** All 56 store-client tests pass.

**Files to create/modify:**

- `apps/store-client/src/features/profile/ui/profile-form.tsx` — switch to `values` + `resetOptions`

---

### TASK-141-D: Consolidate remaining ad-hoc debounces

**Type:** refactor
**Scope:** store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-141-A, TASK-116 ✅ (provides `useDebouncedCallback`)

**Acceptance Criteria:**

- [x] `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx`: replaced the inline
      `setTimeout`/`clearTimeout` `useEffect` with `useDebouncedCallback` (called from the
      input's `onChange`); dropped the now-unused `useEffect` import and `eslint-disable`.
- [x] The `SEARCH_DEBOUNCE_MS` constant (300 ms) is preserved.
- [x] `apps/store-admin/src/shared/lib/use-debounced-callback.ts` created as a verbatim
      copy of the store-client hook (with a NOTE that the apps keep independent copies).
- [x] The new admin hook file is NOT re-exported from the `store-admin` `shared/lib` barrel —
      added the same SSR module-graph NOTE comment to `shared/lib/index.ts`.
- [x] No other `setTimeout` used for debouncing remains in either app (verified by sweep; the
      only `setTimeout` left is inside the two hook files, which is exempt).
- [x] `npm run lint` and `npm run typecheck` green across all workspaces.

> **Done 2026-06-24.** store-admin tests pass. Rows #9/#10 (admin product/category tables) are
> submit-based, not debounced — correctly out of scope for this task.

**Files to create/modify:**

- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx` — replace inline debounce
- `apps/store-admin/src/shared/lib/use-debounced-callback.ts` — new file (copy of store-client hook)

---

### TASK-141-E: Add form-state-sync convention note

**Type:** docs
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-141-B, TASK-141-C, TASK-141-D

**Acceptance Criteria:**

- [x] A "Form State Sync Conventions" section is added to `CLAUDE.md` (or to a new
      `docs/conventions/forms.md` referenced from `CLAUDE.md`) covering the three rules in the
      Technical Design section above. → `docs/conventions/forms.md`, referenced from `CLAUDE.md`
      Workflow reminders.
- [x] The note cites `cart-item-row.tsx` (P1 render-time sync reference) and `search-input.tsx`
      (P1 focus-sensitive guarded-sync reference) and one of the admin edit forms (P2 reference —
      `product-form.tsx` / `category-form.tsx`).
- [x] The note explicitly states that `key`-remount is NOT acceptable for focus-sensitive inputs.
- [x] The note references `useDebouncedCallback` from `shared/lib/use-debounced-callback`
      (direct import, not barrel) as the canonical debounce hook.
- [x] No application code changed in this sub-task.

> **Done 2026-06-24** (docs only). E landed first, then A→B→C→D followed in the same session, so
> the code now matches the documented rules. The convention doc cites the live references:
> `cart-item-row.tsx` (P1 render-time), `search-input.tsx` (P1 focus-sensitive), the admin
> product/category forms (P2), and `use-debounced-callback.ts` (debounce hook).

**Files to create/modify:**

- `CLAUDE.md` — add convention section, OR
- `docs/conventions/forms.md` — new file (referenced from `CLAUDE.md`)

---

## Migration Steps

1. TASK-116 ✅ and TASK-117 ✅ are both done — reference implementations exist.
2. **TASK-141-A** — Run the grep sweep and produce the updated inventory. No code changes.
3. **TASK-141-B** and **TASK-141-C** — Can be done in parallel. Remediate the RHF latent-risk
   forms in admin and storefront respectively.
4. **TASK-141-D** — Consolidate remaining ad-hoc debounces. Confirmed pre-existing finding:
   `AdminUserTable.tsx` inline `setTimeout`. Copy hook to store-admin `shared/lib`.
5. **TASK-141-E** — Document the conventions so the fixes don't regress.

## Risks & Mitigations

| Risk                                                                                        | Mitigation                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RHF `values` option re-syncs on every render, potentially discarding in-progress user edits | Use `resetOptions: { keepDirtyValues: true }` for forms where the entity id is stable (profile). Use `reset()` keyed to entity id for admin edit forms so only navigation to a new entity triggers a full reset. |
| Using `key`-remount as a fallback for any other input that loses sync                       | The plan explicitly prohibits `key`-remount on focus-sensitive inputs. The canonical pattern is `lastPushedRef` guard (search-input.tsx). Document this in TASK-141-E.                                           |
| Admin forms are currently lower-risk because they mount only after data loads               | Do not rush TASK-141-B — the latent risk is real but does not produce visible broken behaviour in the MVP traffic volume. It should land before any admin multi-tab UX improvement.                              |
| New forms added during Phase B/C could re-introduce the pattern                             | TASK-141-E convention doc + optional ESLint rule (custom rule or `eslint-plugin-react-hooks` annotation) acts as the guardrail.                                                                                  |
| TASK-141-D may find additional inline debounces beyond `AdminUserTable.tsx`                 | If TASK-141-A sweep finds more, add them to the inventory table and extend TASK-141-D's file list.                                                                                                               |
| `useDebouncedCallback` copy in store-admin diverges from store-client over time             | The hook is deliberately kept simple (no external dependencies). Copy + NOTE comment in the barrel is the intentional architecture — do not share across apps.                                                   |

## Notes

### Why the CartItemRow uses render-time guard instead of useEffect

The shipped TASK-116 implementation uses the "adjusting state during render" idiom
(`if (prop !== synced) { setSynced(prop); setValue(prop); }`) rather than a `useEffect`.
This is React's recommended pattern for this case — it avoids the extra render cycle that a
`useEffect` would cause. The `useEffect(() => setValue(prop), [prop])` form is also
acceptable for simpler cases (it was in the original plan draft), but the render-time guard
is what actually shipped and should be referenced.

### Why the SearchInput does NOT use key-remount

The original draft incorrectly described `SearchInput` as using a `key`-based remount strategy
or framed key-remount as "also acceptable." That framing is wrong. The shipped TASK-117
implementation (commit `26cffca`) did the opposite: it REMOVED the `key` prop from the parent
`product-filters.tsx`, making `SearchInput` stay mounted permanently. The `lastPushedRef` guard
in a `useEffect` keyed on `[initialValue]` distinguishes the component's own URL echo from a
genuine external change (e.g., "Clear filters", browser back/forward). Key-remount destroys DOM
focus and is not an acceptable strategy for any text input.

### Why "latent" and not "active bug" for the RHF forms

The admin product and category edit forms use a load-gate: the parent view renders
`product ? <ProductForm defaultValues={...} /> : null`. This means `useForm()` is called
exactly once per mount, and at mount time the entity data is already available. There is no
"second mount with new prop" that would trigger the bug — the form is unmounted and remounted
when navigating between products. The risk materializes only if:

- React Query's stale-while-revalidate triggers a background refetch while the form is open.
- The admin has the same product open in two tabs simultaneously.
- A future polling interval is added to the query.

None of these currently cause visible breakage in the MVP, but the pattern is fragile and
should be standardized before the admin panel sees heavier production use.

### AdminUserTable setTimeout classification

`apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx` lines 75–83: an inline
`setTimeout` inside a `useEffect` keyed on `[searchInput]` that debounces the search box value
before it updates `?search=` in the URL. This is **not** a stale-value bug and does not cause
focus loss (the component is not remounted). It is a P3 debounce-consolidation finding:
functionally correct today, but violates the project convention that all debounces go through
`useDebouncedCallback`. Addressed in TASK-141-D.

### Relationship to TASK-116 and TASK-117

This plan does not re-implement or override TASK-116/TASK-117. It uses their output:

- The `useDebouncedCallback` hook from TASK-116-A is the canonical debounce for all future use.
- The render-time guard from TASK-116 is the canonical P1 fix for non-focus-sensitive inputs.
- The `lastPushedRef` guarded-`useEffect` pattern from TASK-117 is the canonical P1 fix for
  focus-sensitive inputs. TASK-141 audits the remaining codebase and applies consistent patterns.

### No Prisma or API changes

This entire plan is a frontend-only refactor. No schema changes, no migrations, no Orval
regeneration. All tasks are `fix`, `refactor`, or `docs` typed.
