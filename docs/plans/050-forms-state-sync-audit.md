# Plan: Cross-Cutting Forms State Sync Audit & Remediation — TASK-141

> **Status:** To Do
> **Phase:** Phase A — Stabilize & close out
> **Created:** 2026-06-23
> **Last Updated:** 2026-06-23

## Overview

A manual-QA finding (`docs/manual-qa-master.md:236`) described "проблема усіх форм на сайті"
(a problem affecting all forms on the site). The root cause is a stale-local-state pattern that
appears in two distinct variants:

1. **Controlled-input variant** — a local `useState` is seeded from a prop once on mount and
   never re-synchronized when the prop changes after a server refetch. `CartItemRow` exhibits
   the confirmed active bug (fixed by TASK-116). `SearchInput` uses a `key`-based remount
   strategy that works but creates focus-loss UX (fixed by TASK-117).

2. **React Hook Form variant** — admin edit forms and the storefront profile form use bare
   `defaultValues` without pairing with RHF's `reset()` or the `values` option. Because the
   parent view guards rendering until the query resolves (`product ? <ProductForm ... />
: null`), these forms are currently lower-risk than variant 1 — they mount with the correct
   server data. They become vulnerable only if the underlying query is invalidated and refetched
   while the form is still open (e.g., background polling, another tab, stale-while-revalidate),
   at which point field values silently lag behind.

TASK-141 is the cross-cutting follow-on that:

- Produces a verified, grep-based inventory of every affected file across both apps.
- Standardizes the remediation patterns after TASK-116 and TASK-117 ship the reusable
  `useDebouncedCallback` hook and the prop-sync model.
- Adds a brief convention note to prevent regressions.

## Dependencies

**TASK-141 must not start until both TASK-116 and TASK-117 are ✅.**

TASK-116 ships `useDebouncedCallback` in `apps/store-client/src/shared/lib/` and the
`useEffect(()=>{ setQty(item.quantity); }, [item.quantity])` prop-sync pattern. TASK-117
extends the same hook to `SearchInput`. Both are the reference implementations that TASK-141
auditors should point to when remediating other files.

## Scope

### In Scope

- Full grep-based sweep of `apps/store-client` and `apps/store-admin` for:
  - `useState(` seeded from a prop or async data.
  - `defaultValues` passed to `useForm()` from an async source without `reset()` / `values`.
  - Inline ad-hoc debounce patterns (`setTimeout` inside `useEffect`, per-component
    `useRef<ReturnType<typeof setTimeout>>`).
- Risk classification of each finding (active bug / latent / not-affected).
- Remediation: apply `useEffect` prop-sync or `key`-remount to all confirmed active-bug
  controlled inputs; apply `values` or `reset()` to RHF forms where the latent risk warrants
  it.
- Replace any remaining per-component ad-hoc debounce with `useDebouncedCallback` from
  `apps/store-client/src/shared/lib/`.
- Add a short convention note to `CLAUDE.md` (or a referenced `docs/conventions/forms.md`)
  documenting the agreed patterns so reviewers can catch regressions.
- Optional: add a custom ESLint rule or comment-based guardrail to detect bare
  `useState(prop)` without a sibling `useEffect` sync.

### Out of Scope

- TASK-116: point fix for `CartItemRow` (tracked separately).
- TASK-117: point fix for `SearchInput` (tracked separately).
- Backend or API changes — this audit is purely frontend.
- New forms or features — audit only existing code at the time TASK-116/117 land.
- The broader checkout form (different pattern — controlled by RHF `values` that come
  from the page-level query; verify but expect no change needed).

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

| #   | File                                                                        | Pattern                | Risk                                                                                                                                                          | Notes                                                                                                                                          |
| --- | --------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`                   | P1                     | **Active bug** — `useState(item.quantity)` never re-syncs; `commit()` compared against stale prop                                                             | Fixed by **TASK-116** — reference implementation.                                                                                              |
| 2   | `apps/store-client/src/features/product-filters/ui/search-input.tsx`        | P1 (via `key`-remount) | **Active bug** — parent remounts on every URL change; input loses focus                                                                                       | Fixed by **TASK-117** — adopts `useDebouncedCallback`.                                                                                         |
| 3   | `apps/store-client/src/features/profile/ui/profile-form.tsx`                | P2                     | **Latent** — `defaultValues: { firstName: user.firstName, … }` from `user` prop; no `reset()`; `user` comes from a query that can refetch                     | Parent mounts form only after `user` resolves, so initial values are correct. Becomes stale if query refetches while open. Low-frequency risk. |
| 4   | `apps/store-admin/src/features/product-form/ui/product-form.tsx`            | P2                     | **Latent** — `defaultValues: { ...defaultValues }` spread from `product` data; no `reset()` or `values`                                                       | Same guard pattern as #3. Risk: background refetch while admin has form open during a long edit session.                                       |
| 5   | `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`   | P2 (orchestrator)      | **Latent** — renders `<ProductForm defaultValues={mapProductToFormValues(product)} />` only after `product` resolves; still vulnerable to mid-session refetch | No direct form hook; risk is inherited from #4.                                                                                                |
| 6   | `apps/store-admin/src/features/category-form/ui/category-form.tsx`          | P2                     | **Latent** — `defaultValues: { ...defaultValues }` from category data; no `reset()` or `values`                                                               | Same pattern as #4.                                                                                                                            |
| 7   | `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx` | P2 (orchestrator)      | **Latent** — renders `<CategoryForm defaultValues={mapCategoryToFormValues(category)} />` only after `category` resolves                                      | Same as #5.                                                                                                                                    |

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

### Remediation pattern A — Controlled input with prop seed (P1)

For any `useState(propValue)` where `propValue` comes from server data:

```tsx
// 1. Keep the useState initializer as-is (used only on first mount)
const [value, setValue] = useState(item.someField);

// 2. Add a sync effect that re-runs whenever the authoritative prop changes
useEffect(() => {
  setValue(item.someField);
}, [item.someField]);
```

The reference implementation for this pattern is `cart-item-row.tsx` after TASK-116.

For search-style inputs where the parent controls the URL param, the `key`-remount approach
is also acceptable — but prefer the `useEffect` sync if focus preservation matters.

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

After TASK-116-A lands, the canonical hook is:

```
apps/store-client/src/shared/lib/use-debounced-callback.ts
```

Any component that previously used an inline `setTimeout` in a `useEffect` for debouncing
MUST migrate to this hook. At the time of planning the only remaining inline debounce lives
in `search-input.tsx` (being fixed by TASK-117). If additional inline debounces are found
during the sweep, they must also be migrated.

### Convention note location

Add a new section **"Form State Sync Conventions"** to `CLAUDE.md` (under the Workflow
reminders block) or create `docs/conventions/forms.md` and reference it from `CLAUDE.md`.
The note must cover:

1. Never seed `useState` from a prop that reflects async server data without a sync
   `useEffect` or `key`-remount.
2. RHF edit forms: use `values` (for live-sync) or `reset(entity)` in a `useEffect` keyed
   to the entity id — never bare `defaultValues` alone when data is async.
3. Debounce: always use `useDebouncedCallback` from `shared/lib`; do not write per-component
   `setTimeout` inside `useEffect`.

## Tasks

### TASK-141-A: Verified grep sweep + risk inventory

**Type:** refactor (planning/audit)
**Scope:** store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-116 ✅, TASK-117 ✅

**Acceptance Criteria:**

- [ ] Run the following grep commands and record every hit with file + line number:
  - `grep -rn "useState(" apps/store-client/src apps/store-admin/src` — filter to
    occurrences where the argument is a prop or comes from a query result.
  - `grep -rn "defaultValues" apps/store-client/src apps/store-admin/src` — collect all RHF
    forms using async data as defaults.
  - `grep -rn "setTimeout" apps/store-client/src apps/store-admin/src` — identify any
    remaining ad-hoc debounce patterns.
- [ ] Produce an updated inventory (amend this plan's inventory table) with any new findings
      not present at planning time.
- [ ] Classify each as: active bug / latent / not affected, with a one-line rationale.
- [ ] No code changes in this sub-task.

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

- [ ] `apps/store-admin/src/features/product-form/ui/product-form.tsx`: replace bare
      `defaultValues` with `values: defaultValues ?? emptyDefaults` (RHF `values` option) OR
      the orchestrator calls `form.reset(mapped)` in a `useEffect` keyed to `productId`.
- [ ] `apps/store-admin/src/features/category-form/ui/category-form.tsx`: same treatment as
      product form.
- [ ] `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx`: if using
      `reset()` strategy, wire the effect here; if using `values` option, no orchestrator change
      needed.
- [ ] `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx`: same as
      edit-product-view.
- [ ] Manual test: open an edit form, trigger a background refetch (e.g., focus another tab
      and return), confirm form fields reflect updated server data on pristine fields and preserve
      dirty user edits.
- [ ] `npm run lint -w apps/store-admin` clean.
- [ ] `npm run typecheck -w apps/store-admin` passes.

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

- [ ] `apps/store-client/src/features/profile/ui/profile-form.tsx`: switch to RHF `values`
      option with `resetOptions: { keepDirtyValues: true }` so background refetches update
      pristine fields without discarding in-progress edits.
- [ ] `isDirty` guard on the Save button remains functional (dirty state is preserved).
- [ ] `npm run lint -w apps/store-client` clean.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/features/profile/ui/profile-form.tsx` — switch to `values` + `resetOptions`

---

### TASK-141-D: Consolidate any remaining ad-hoc debounces

**Type:** refactor
**Scope:** store-client, store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-141-A, TASK-116 ✅ (provides `useDebouncedCallback`)

**Acceptance Criteria:**

- [ ] No `setTimeout` call inside a `useEffect` used for debouncing remains in either app
      after this task (search-input.tsx is cleared by TASK-117).
- [ ] Any remaining inline debounce found during TASK-141-A sweep is replaced with
      `useDebouncedCallback` from `apps/store-client/src/shared/lib/`.
- [ ] If store-admin also needs a debounce utility, copy/re-export `useDebouncedCallback`
      into `apps/store-admin/src/shared/lib/` following the same pattern.
- [ ] `npm run lint` and `npm run typecheck` green across all workspaces.

**Files to create/modify:**

- Any files with inline ad-hoc debounce found in TASK-141-A sweep (unknown at planning time)
- `apps/store-admin/src/shared/lib/use-debounced-callback.ts` — created only if admin needs it

---

### TASK-141-E: Add form-state-sync convention note

**Type:** docs
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-141-B, TASK-141-C, TASK-141-D

**Acceptance Criteria:**

- [ ] A "Form State Sync Conventions" section is added to `CLAUDE.md` (or to a new
      `docs/conventions/forms.md` referenced from `CLAUDE.md`) covering the three rules in the
      Technical Design section above.
- [ ] The note cites `cart-item-row.tsx` (P1 reference) and one of the admin edit forms
      (P2 reference).
- [ ] The note references `useDebouncedCallback` from `shared/lib` as the canonical debounce
      hook.
- [ ] No application code changed in this sub-task.

**Files to create/modify:**

- `CLAUDE.md` — add convention section, OR
- `docs/conventions/forms.md` — new file (referenced from `CLAUDE.md`)

---

## Migration Steps

1. Wait for TASK-116 (✅) and TASK-117 (✅) — they establish the reference patterns and the
   shared `useDebouncedCallback` hook.
2. **TASK-141-A** — Run the grep sweep and produce the updated inventory. No code changes.
3. **TASK-141-B** and **TASK-141-C** — Can be done in parallel. Remediate the RHF latent-risk
   forms in admin and storefront respectively.
4. **TASK-141-D** — Consolidate any remaining ad-hoc debounce patterns found in step 2.
5. **TASK-141-E** — Document the conventions so the fixes don't regress.

## Risks & Mitigations

| Risk                                                                                            | Mitigation                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RHF `values` option re-syncs on every render, potentially discarding in-progress user edits     | Use `resetOptions: { keepDirtyValues: true }` for forms where the entity id is stable (profile). Use `reset()` keyed to entity id for admin edit forms so only navigation to a new entity triggers a full reset. |
| `key`-remount approach in SearchInput (TASK-117) will unmount/remount the input and clear focus | TASK-117 adopts `useDebouncedCallback` + controlled value instead of remount — this is the correct fix. If any other input still uses `key`-remount for focus reasons, document the tradeoff explicitly.         |
| Admin forms are currently lower-risk because they mount only after data loads                   | Do not rush TASK-141-B — the latent risk is real but does not produce visible broken behaviour in the MVP traffic volume. It should land before any admin multi-tab UX improvement.                              |
| New forms added during Phase B/C could re-introduce the pattern                                 | TASK-141-E convention doc + optional ESLint rule (custom rule or `eslint-plugin-react-hooks` annotation) acts as the guardrail.                                                                                  |
| TASK-141-D may find no remaining inline debounces (sweep result unknown)                        | If the sweep in TASK-141-A finds none, mark TASK-141-D ✅ immediately with a note that no changes were needed.                                                                                                   |

## Notes

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

### Relationship to TASK-116 and TASK-117

This plan does not re-implement or override TASK-116/TASK-117. It uses their output:

- The `useDebouncedCallback` hook from TASK-116-A is the canonical debounce for all future
  use.
- The `useEffect` prop-sync from TASK-116-B is the canonical P1 fix.
- The focus-preserving controlled approach from TASK-117 is the canonical SearchInput pattern.
  TASK-141 audits the remaining codebase and applies the same patterns consistently.

### No Prisma or API changes

This entire plan is a frontend-only refactor. No schema changes, no migrations, no Orval
regeneration. All tasks are `fix`, `refactor`, or `docs` typed.
