# Plan 082 — Admin slug live preview and dead header search removal (TASK-136)

**Phase:** Phase 4 — Admin Panel (UX polish follow-up)
**Roadmap context:** Tier 3 — UX, data & admin polish
**Branch:** `feat/136-admin-slug-and-search` (Wave 1, per the parallel plan at
`C:\Users\jioii\.claude\plans\eventual-launching-glacier.md` — independent, starts concurrently
with Wave-0 prep; no backend work)
**Created:** 2026-06-29
**Status:** ⬜ To Do

---

## User Story

As an admin, when I create a product I want to see the slug that will be auto-generated from
the name I type, so I know exactly what URL the product will have before I submit — and can
override it if needed. I also do not want to see a search input in the header that does nothing.

---

## Problem Statement

Two independent UX problems in `apps/store-admin`:

### Problem 1 — Slug field has no live preview on create

`features/product-form/ui/product-form.tsx` renders a slug `<Input>` in both create and edit
modes. In create mode the field is empty and the placeholder reads "Залиште порожнім для
авто-генерації з назви". The admin types a product name, submits the form, and only after
navigating to the product list or detail page sees what slug was actually generated. There is no
in-form feedback.

The backend already auto-generates slugs: `apps/store-api/src/product/product.service.ts:178`
calls `const slug = input.slug ?? generateSlug(input.name)` where `generateSlug` lives in
`apps/store-api/src/common/utils/slug.util.ts`. The frontend sends an empty string → `undefined`
(via `productFormValuesToDto`) → the backend derives the slug. No backend change is needed; the
frontend simply lacks a visual preview of the computation.

**Confirmed today:** the slug field is already optional in `product-schema.ts` (`.optional().or(z.literal(""))`) and `EMPTY_VALUES.slug = ""`. The DTO mapper maps a blank slug to `undefined`. The wiring is correct; only the UX feedback is missing.

### Problem 2 — Admin header contains a dead search input

`widgets/admin-shell/admin-header.tsx` renders a `<div className="relative hidden sm:block">`
containing a `<Search>` icon and an `<Input placeholder={dict.header.searchPlaceholder}>` (lines
28-35 of the component). There is no `onChange`, no state, no query and no connected feature. It
looks functional to the admin but does nothing. TASK-075 (full-text search with Meilisearch) is
Tier-4 / parked.

---

## Decisions

### Sub-problem 1 — UX approach

**Recommendation: Option (b) — keep the optional slug field, add a live preview auto-derived from
the name.**

Rationale:

- Dropping the field entirely (option a) removes the ability to set a custom slug at create time —
  a legitimate admin use case (e.g., shortening a very long product name for SEO).
- The schema, DTO mapper, and backend are already correct; only the display feedback is missing.
- A live preview gives the admin a clear expectation of the auto-generated value without requiring
  knowledge of the slugification rules.
- The preview disappears as soon as the admin types into the slug field, signaling that the manual
  value takes precedence.
- Edit mode: slug already shows the saved value. The same `!slugValue && nonEmptyName` condition
  works correctly there — the preview only reappears if the admin explicitly clears the slug field,
  which is the exact moment when "what would be auto-generated?" becomes relevant.

**Implementation:** `useWatch` on the `name` and `slug` fields (same `control` instance already
present); derive `slugify(nameValue)` when slug is empty; render as a `<p>` hint line. Pure
display — no form field, no state, no side effects.

### Sub-problem 2 — Header search

**Recommendation: REMOVE the dead search input.** TASK-075 is parked. A non-functional input
misleads the admin. Removal is 8 lines + 2 unused imports. A note in the component JSDoc points
to TASK-075 for when a real admin search is desired.

---

## Backend context

No backend changes needed. Slug auto-generation is already implemented and works correctly when
`slug` is absent from the `CreateProductDto`. The admin frontend's `slugify` helper must produce
output identical to the backend's `generateSlug` so the preview matches exactly what the server
will derive.

---

## slugify algorithm (mirror of backend's `generateSlug`)

No external npm package. Four-step regex chain — direct port of
`apps/store-api/src/common/utils/slug.util.ts`:

```ts
// "iPhone 15 Pro Max!"  →  "iphone-15-pro-max"
// "Samsung Galaxy S24 Ultra"  →  "samsung-galaxy-s24-ultra"
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // strip special characters
    .replace(/[\s_]+/g, "-") // spaces and underscores → hyphen
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
```

This is a pure utility (no side effects, no browser API) → safe to barrel-export from
`shared/lib/index.ts`.

---

## forms.md compliance

| Rule                                                                      | Applicability                                                                                                                                                                                                                                                                  | Assessment          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| **Rule 1** — never seed `useState` from async-server data without a guard | Not triggered. The preview uses `useWatch` to read from RHF's internal store — synchronous reactive state, not seeded from async data.                                                                                                                                         | No guard needed.    |
| **Rule 2** — RHF edit forms: use `values` or `reset()`                    | The existing pattern (`values: { ...EMPTY_VALUES, ...defaultValues }` + `resetOptions: { keepDirtyValues: true }`) is unchanged (Rule 2a, correct for product-form). The new `useWatch` calls are read-only observers on the same `control` — they do not interfere with sync. | No change required. |
| **Rule 3** — debounce only through `useDebouncedCallback`                 | Not triggered. The preview is a pure synchronous computation in the render body — no side effects, no server calls, no `setTimeout`.                                                                                                                                           | No debounce needed. |

---

## dictionary.ts coordination with TASK-137

The parallel-execution plan (`eventual-launching-glacier.md`, Wave 1) identifies
`apps/store-admin/src/shared/config/dictionary.ts` as a trivial-append hotspot shared by TASK-136
and TASK-137. The two tasks touch distinct top-level keys:

- TASK-136 appends to `productForm` and removes one key from `header`.
- TASK-137 appends to `dashboard`.

Git will auto-merge both on rebase. Rebase on latest `develop` before opening the PR.

---

## Tasks

### TASK-136-A: Add `slugify` helper to `store-admin/src/shared/lib/`

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** nothing

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/shared/lib/slug.ts` created; exports `slugify(name: string): string`
      using the exact 4-step regex chain from the backend's `generateSlug`
- [ ] `apps/store-admin/src/shared/lib/slug.test.ts` created with at least 5 unit cases mirroring
      the backend spec (from `slug.util.spec.ts`):
  - `"Hello World"` → `"hello-world"`
  - `"iPhone 15 Pro Max!"` → `"iphone-15-pro-max"`
  - `"my_category_name"` → `"my-category-name"`
  - `""` → `""`
  - `"--hello world--"` → `"hello-world"`
- [ ] `apps/store-admin/src/shared/lib/index.ts` updated:
      add `export { slugify } from "./slug";` (pure utility — safe in the barrel, not a client hook)
- [ ] `npm run test -w apps/store-admin` green (no new failures)
- [ ] `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/shared/lib/slug.ts` — new helper (port of backend `generateSlug`)
- `apps/store-admin/src/shared/lib/slug.test.ts` — new unit tests
- `apps/store-admin/src/shared/lib/index.ts` — add barrel export for `slugify`

---

### TASK-136-B: Live slug preview in `product-form.tsx` + dict key

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-136-A

**Acceptance Criteria:**

- [ ] `useWatch` imported from `react-hook-form` (added to the existing import line alongside
      `Controller`, `useFieldArray`, `useForm`)
- [ ] `slugify` imported from `@/shared/lib`
- [ ] Two `useWatch` calls inside `ProductForm` (using the same `control` already wired):
  ```ts
  const nameValue = useWatch({ control, name: "name" });
  const slugValue = useWatch({ control, name: "slug" });
  ```
- [ ] A preview element rendered immediately below the slug `<Input>` and above the slug error
      `<p role="alert">`:
  ```tsx
  {
    !slugValue && nameValue.trim().length > 0 && (
      <p className="text-sm text-muted-foreground" data-testid="slug-preview">
        {dict.productForm.slugPreview(slugify(nameValue))}
      </p>
    );
  }
  ```
- [ ] `dict.productForm.slugPreview` added to `dictionary.ts`:
      `slugPreview: (slug: string) => \`Буде згенеровано: ${slug}\``
- [ ] Behavioural contract verified (covered by TASK-136-D tests):
  - Preview appears in CREATE mode when `name` is non-empty and `slug` field is empty
  - Preview disappears when the admin types into the slug field
  - Preview is absent in EDIT mode when the entity slug is pre-populated (slug non-empty)
  - Preview reappears in EDIT mode if the admin explicitly clears the slug field
- [ ] No existing test failures; `npm run typecheck -w apps/store-admin` clean; lint clean

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — add `useWatch` imports +
  two watch calls + conditional preview element inside the slug field section
- `apps/store-admin/src/shared/config/dictionary.ts` — add `slugPreview` function to
  `productForm` block

---

### TASK-136-C: Remove dead search from `admin-header.tsx` + dict cleanup

**Type:** fix
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** nothing (independent of TASK-136-A/B)

**Acceptance Criteria:**

- [ ] The entire `<div className="relative hidden sm:block">…</div>` block (the `<Search>` icon +
      `<Input>`) removed from `AdminHeader`
- [ ] `Search` import from `lucide-react` removed (it becomes unused after the block is deleted)
- [ ] `Input` import from `@/shared/ui/input` removed (it becomes unused after the block is deleted)
- [ ] JSDoc on `AdminHeader` updated to note the removal:
  ```
  * Global admin search is deferred to TASK-075 (Meilisearch, Tier-4);
  * the placeholder input from plan 025 has been removed.
  ```
- [ ] `header.searchPlaceholder` key removed from `dictionary.ts` (no remaining reference after
      the block is gone); `AdminDictionary` type auto-updates (it derives from the const object)
- [ ] `npm run typecheck -w apps/store-admin` clean — no TS error from the removed dict key
- [ ] `npm run lint -w apps/store-admin` clean — no unused-import warnings
- [ ] Visual: the admin header no longer renders a search input at any viewport width

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-header.tsx` — remove dead search block;
  remove `Search` and `Input` imports; update JSDoc
- `apps/store-admin/src/shared/config/dictionary.ts` — remove `header.searchPlaceholder` key

---

### TASK-136-D: RTL tests for slug preview behaviour

**Type:** test
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-136-B, TASK-136-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/product-form/ui/product-form.test.tsx` created (file does not
      currently exist) using `renderWithProviders`, `userEvent`, MSW stubs for both queries the form
      triggers (`GET /api/admin/categories` and `GET /api/admin/product-groups` — empty arrays
      sufficient for the slug-preview tests)
- [ ] Five test cases in the file:
  1. **CREATE — preview appears:** render `<ProductForm>` without `defaultValues`; type
     `"iPhone 15 Pro Max"` in the name field → element with `data-testid="slug-preview"` is
     present in the document and contains `"iphone-15-pro-max"`
  2. **CREATE — preview disappears on manual slug:** after typing the name above, also type
     `"custom-slug"` into the slug field → `data-testid="slug-preview"` is no longer in the
     document
  3. **CREATE — empty name, no preview:** render with no `defaultValues`; name is `""` (default) →
     no preview element rendered
  4. **EDIT — slug pre-set, no preview on mount:** render `<ProductForm defaultValues={{ name:
"Existing", slug: "existing-slug", price: "99", stock: "10", categoryId: UUID, isActive:
true, ... }}>` → `data-testid="slug-preview"` is absent
  5. **EDIT — clear slug field, preview reappears:** same EDIT render; clear the slug input →
     `data-testid="slug-preview"` becomes present and contains `slugify("Existing")` =
     `"existing"`
- [ ] Note on MSW stubs: use the same `http.get("*/api/admin/categories", ...)` +
      `http.get("*/api/admin/product-groups", ...)` pattern from `category-form.test.tsx`. Stub
      both at the `server` level in a `beforeEach`.
- [ ] Note on Radix Select: `categoryId` is required by the schema (`z.string().uuid()`). Tests
      that need to submit the form should either stub a real category and pick it, or test the
      preview in isolation without submitting (recommended for tests 1–5 above — they only assert
      the preview element, not form submission).
- [ ] Existing 52 store-admin tests remain unbroken
- [ ] `npm run test -w apps/store-admin` green
- [ ] `npm run typecheck -w apps/store-admin` clean

Note: the dead-search removal (TASK-136-C) needs no dedicated test. The existing
`smoke.test.tsx` confirms the admin shell renders without crashing; a non-functional element
removal has no observable side effect to assert.

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/ui/product-form.test.tsx` — new RTL test file with
  5 slug-preview cases

---

## Execution order

```
TASK-136-A  (slugify helper + unit tests)
    ↓
TASK-136-B  (live preview wiring in product-form.tsx + dict key)
    ↓
TASK-136-D  (RTL tests — needs B done)

TASK-136-C  (dead search removal — independent, can run in parallel with A/B)
    ↓ (must land before TASK-136-D which checks final header state)
TASK-136-D
```

Simplest sequential order: A → B → C → D.

---

## Verification (pre-PR gate)

| Check            | Command                                 |
| ---------------- | --------------------------------------- |
| Unit + RTL tests | `npm run test -w apps/store-admin`      |
| TypeScript       | `npm run typecheck -w apps/store-admin` |
| Lint             | `npm run lint -w apps/store-admin`      |
| Build            | `npm run build -w apps/store-admin`     |

Manual checks on a running stack:

- Navigate to `/products/new` → type a name, leave slug blank → preview "Буде згенеровано:
  iphone-15-pro-max" appears below the slug input
- Type into the slug input → preview disappears immediately
- Submit the form with slug blank → navigate to the product detail; the slug matches the preview
- Navigate to `/products/[id]/edit` → slug field shows the saved value, no preview; clear the
  slug field → preview reappears derived from the name currently in the form
- Admin header shows no search input at any viewport width (resize to `< sm` and `≥ sm`)

---

## Completion checklist

- [ ] TASK-136-A: `slugify` helper created, unit tests green
- [ ] TASK-136-B: live preview wired, `dict.productForm.slugPreview` added, no test failures
- [ ] TASK-136-C: dead search removed, imports clean, `header.searchPlaceholder` removed from dict
- [ ] TASK-136-D: RTL test file created, all 5 cases passing, existing 52 tests unbroken
- [ ] `BACKLOG.md` updated: TASK-136 → ✅ with plan link `docs/plans/082-admin-slug-and-dead-search.md`
