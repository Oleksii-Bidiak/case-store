# Plan 071 — Admin Category Parent Persistence (TASK-149)

**Status:** ✅ Done
**Phase:** Phase 4 — Admin Panel (Tier 2 — Critical functional bug)
**Created:** 2026-06-28
**BACKLOG ref:** TASK-149
**QA origin:** manual-qa-master.md §B3 — "B3. Керування категоріями"

---

## Problem Statement

When an admin user selects a parent category in the create or edit form and clicks Save, the
selection is not persisted to the database. The parent select reverts to "Root (no parent)" in
the UI immediately after saving, and the category list shows "—" in the Parent column for the
affected entry.

QA note (manual-qa-master.md:366):

> "вибір категорії не зберігається, ні при створенні ні при редагуванні. при обиранні і збереженні
> на ui все скидається"
> ("category selection is not saved, neither on create nor on edit. when choosing and saving, the
> UI resets entirely")

---

## Root-Cause Analysis (Confirmed by Code Review)

### Layer 1 — Frontend: `category-form.tsx` violates forms.md Rule 2b (PRIMARY)

**File:** `apps/store-admin/src/features/category-form/ui/category-form.tsx:65–74`

```tsx
const { ... } = useForm<CategoryFormInput, unknown, CategoryFormValues>({
  resolver: zodResolver(categorySchema),
  defaultValues: EMPTY_VALUES,
  // ← RULE 2A: values live-sync, but forms.md explicitly recommends Rule 2b for this form
  values: defaultValues ? { ...EMPTY_VALUES, ...defaultValues } : undefined,
  resetOptions: { keepDirtyValues: true },
});
```

The form uses RHF's `values` live-sync option (Rule 2a). `docs/conventions/forms.md` at line 97
explicitly states that Rule 2b (`reset()` keyed to entity id) is the **recommended pattern** for
`apps/store-admin/src/features/category-form/ui/category-form.tsx`.

**Mechanism of failure:**

1. The `values` object `{ ...EMPTY_VALUES, ...defaultValues }` is re-created on every render
   via the inline spread, producing a new object reference each time.
2. `store-admin` uses React 19.2.4 with concurrent rendering. TanStack Query v5 performs
   background refetches on window focus and on query invalidation.
3. When the user clicks a parent category in the Select (firing `field.onChange("uuid-A")`),
   React schedules an internal state update. In concurrent mode, a concurrent background
   refetch update (for either `findAllWithProductCount` inside `CategoryForm` or `findById` in
   `EditCategoryView`) can be processed in the same React flush before RHF commits the
   `field.onChange` result to its internal `dirtyFields` map.
4. When the background render processes the new `values` object (same values, new reference),
   RHF's `useEffect` fires and calls `reset(values, { keepDirtyValues: true })`.
5. `keepDirtyValues: true` only protects fields already registered as dirty in RHF's internal
   state. If `parentId`'s dirty flag has not yet been committed (step 3), the reset clobbers it.
6. `parentId` is reset to `""` (from `EMPTY_VALUES`).
7. `categoryFormValuesToDto(values)` at line 68 of `category-schema.ts` maps `parentId: ""` →
   `parentId: undefined` (falsy guard: `parentId ? parentId : undefined`).
8. The mutation payload omits `parentId` entirely. For CREATE, `CategoryRepository.create()`
   at line 359 does `parentId: data.parentId ?? null` → stored as `null`. For UPDATE, Prisma
   ignores `undefined` fields and leaves the existing value unchanged.
9. The subsequent cache invalidation + `findById` refetch returns the entity with `parentId: null`
   → `mapCategoryToFormValues` → `parentId: ""` → Select re-renders showing "Root (no parent)".

**Confirms forms.md Rule 2b violation:** The convention doc (`docs/conventions/forms.md:97–101`)
explicitly calls out `category-form.tsx` as a Rule 2b target, yet TASK-141 implemented Rule 2a.

---

### Layer 2 — Frontend: No mechanism to clear an existing parent (SECONDARY)

**File:** `apps/store-admin/src/features/category-form/model/category-schema.ts:62–79`

`categoryFormValuesToDto` always maps `parentId: ""` → `undefined`:

```ts
const parentId = values.parentId?.trim();
return {
  parentId: parentId ? parentId : undefined, // ← "" → undefined for both create AND update
};
```

For CREATE, `undefined` is correct (backend maps `parentId: data.parentId ?? null` → null).

For UPDATE, `parentId: undefined` is a "no-change" signal — Prisma ignores it. This means once
a category has a parent, the admin cannot clear it through the form (the parent would silently
persist). The DTO must send `null` explicitly to clear.

**File:** `apps/store-api/src/category/dto/update-category.dto.ts:75`

```ts
@IsOptional()
@IsUUID(4, { message: 'Parent ID must be a valid UUID' })
parentId?: string;           // ← no null allowed; cannot represent "clear parent"
```

The NestJS `ValidationPipe` with `whitelist: true` strips undecorated properties. `parentId`
has `@IsOptional()` and `@IsUUID(4)`. With `null` not accepted by `@IsUUID(4)`, there is no
valid API contract for "make this category a root category".

---

### Layer 3 — Frontend display: in-page parent name lookup (DISPLAY SYMPTOM)

**File:** `apps/store-admin/src/widgets/category-list/ui/admin-category-table.tsx:52–54`

```tsx
const nameById = new Map(
  categories.map((category) => [category.id, category.name]),
);
```

`categories` is the CURRENT PAGE only (`limit: PAGE_SIZE = 20`). If the parent category is on
a different page, `nameById.get(category.parentId)` returns `undefined` → displays `"—"`, even
when the parent IS correctly saved in the DB. This amplifies the perception of "not persisted"
in QA testing.

---

### Backend layers: NO BUGS FOUND

- `CreateCategoryDto.parentId` (`create-category.dto.ts:70`): `@IsOptional() @IsUUID(4)` ✓
- `CategoryService.create()` (`category.service.ts:158`): validates parent exists, passes to repo ✓
- `CategoryService.update()` (`category.service.ts:199`): handles `null` explicitly for cycle
  detection skip; passes to repo ✓
- `CategoryRepository.create()` (`category.repository.ts:359`): `parentId: data.parentId ?? null` ✓
- `CategoryRepository.update()` (`category.repository.ts:371`): passes `data` directly to
  Prisma; Prisma maps `parentId: "uuid"` → update; `parentId: null` → set null (correct
  behaviour once null is exposed in the DTO) ✓
- Prisma schema (`schema.prisma:77`): `parentId String? @map("parent_id")` scalar field, no
  nested `connect` required ✓
- `ValidationPipe` (`main.ts:62–69`): `whitelist: true` + `forbidNonWhitelisted: true` — no
  stripping of `parentId` because it is decorated ✓

---

## Fix Summary

| Layer    | File                       | Change                                                                                                   |
| -------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| Frontend | `category-form.tsx`        | Replace `values` + `keepDirtyValues` (Rule 2a) with `useEffect` + `reset()` keyed to `id` prop (Rule 2b) |
| Frontend | `category-schema.ts`       | `categoryFormValuesToDto` accepts `isUpdate` flag; maps `""` → `null` in update path                     |
| Frontend | `edit-category-view.tsx`   | Pass `categoryId` as `id` prop; call `categoryFormValuesToDto(values, true)`                             |
| Backend  | `update-category.dto.ts`   | Add `@IsNull()` / nullable union; allow `parentId: null`                                                 |
| Backend  | `category.service.ts`      | Confirmed no change needed (already handles null)                                                        |
| Display  | `admin-category-table.tsx` | Expand nameById to include all categories from the response OR switch to server-side parent name join    |
| Tests    | all layers                 | See TASK-149-D                                                                                           |

---

## FSD / Clean Architecture Compliance

- All changes are within the correct FSD layers: `features/category-form` → form logic,
  `widgets/category-form-view` → orchestration, `shared/api/generated` → API contract.
- Backend changes stay in the DTO layer; no service/repository logic changes are needed.
- No cross-layer import violations introduced.
- Orval regeneration is required after the `UpdateCategoryDto` change.

---

## forms.md Compliance Notes

`docs/conventions/forms.md` Rule 2b (lines 92–101):

> **2b. `reset()` in a `useEffect` keyed to the entity id**
> Best for the admin product / category edit forms… only navigation to a new entity triggers a
> full reset, so a mid-session background refetch won't clobber the admin's edits.

The fix moves `category-form.tsx` from Rule 2a to Rule 2b exactly as the convention document
specifies. The key change:

```tsx
// REMOVE (Rule 2a — incorrect for this form):
values: defaultValues ? { ...EMPTY_VALUES, ...defaultValues } : undefined,
resetOptions: { keepDirtyValues: true },

// ADD (Rule 2b — correct per forms.md:97):
useEffect(() => {
  if (id && defaultValues) {
    form.reset({ ...EMPTY_VALUES, ...defaultValues });
  }
}, [id]); // only re-run when navigating to a different entity
```

The `id` prop is the category UUID passed from `edit-category-view.tsx`. Create mode does not
pass `id`, so the effect only fires in edit mode. The `defaultValues: EMPTY_VALUES` baseline
in `useForm` ensures the create form starts clean.

---

## TDD / Test Plan

### Existing tests that must remain green

- `apps/store-api/src/category/category.service.spec.ts` — all 419 tests (no backend change for
  primary fix; TASK-149-A adds new specs)
- `apps/store-admin/src/shared/test/smoke.test.tsx` — smoke test must pass

### New tests — TASK-149-A (backend)

**File:** `apps/store-api/src/category/category.service.spec.ts`

- `update() — clears parentId when input.parentId === null`: mock `findById` returning a
  category with `parentId = "cat-uuid-1"`, mock `update` returning `{ parentId: null }`;
  assert the returned entity has `parentId: null`.
- `update() — rejects null DTO that fails @IsUUID validation`: integration-level guard
  (confirm the DTO class itself serializes correctly via `class-validator`).

### New tests — TASK-149-D (frontend RTL)

**File (new):** `apps/store-admin/src/features/category-form/ui/category-form.test.tsx`

Test scenarios (MSW for the categories list, RHF form):

1. **CREATE: parent selection persists through submit**
   - Render `<CategoryForm onSubmit={mockSubmit} isPending={false} />`
   - Mock `GET /api/admin/categories` returning `[{ id: "uuid-A", name: "Category A" }]`
   - Simulate user selecting "Category A" from the parent Select
   - Simulate form submit
   - Assert `mockSubmit` called with `values.parentId = "uuid-A"`

2. **CREATE: parent visible during isPending**
   - After selecting parent and firing submit handler (setting `isPending: true`),
     assert the Select trigger still shows "Category A" (not the placeholder)

3. **EDIT: parent pre-filled from defaultValues**
   - Render `<CategoryForm id="cat-1" defaultValues={{ parentId: "uuid-A", name: "Sub" }} ... />`
   - Assert Select shows "Category A"

4. **EDIT: parent selection NOT reset by changing id**
   - Render with `id="cat-1"` and `defaultValues={{ parentId: "uuid-A" }}`
   - Simulate user changing Select to "Category B" (uuid-B)
   - Re-render with same `id="cat-1"` → assert parentId still "uuid-B" (not reset)

5. **EDIT: changing id prop resets form (Rule 2b)**
   - Render with `id="cat-1"` and `defaultValues={{ parentId: "uuid-A" }}`
   - Re-render with `id="cat-2"` and `defaultValues={{ parentId: "uuid-B" }}`
   - Assert Select now shows "Category B"

6. **UPDATE path sends null for root selection**
   - Render in edit mode, call `categoryFormValuesToDto(values, true)` when `parentId = ""`
   - Assert returned DTO has `parentId: null`

---

## Task Breakdown

### TASK-149-A: Backend — Allow `parentId: null` in `UpdateCategoryDto`

**Type:** fix
**Scope:** store-api
**Complexity:** S (1–2h)
**TDD Required:** Yes
**Depends on:** none

**Acceptance Criteria:**

- [ ] `UpdateCategoryDto.parentId` accepts `string | null` (add `@IsNull()` or use `@ValidateIf` + nullable union)
- [ ] `class-validator` passes when `parentId: null` is sent in the request body
- [ ] `class-validator` still rejects non-UUID strings for `parentId`
- [ ] `ValidationPipe` with `whitelist: true` does not strip `parentId: null`
- [ ] `CategoryService.update()` test for "clear parent" (parentId null → stored as null) passes
- [ ] Orval client regenerated after backend DTO change (`npm run generate:api -w apps/store-admin`)
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/category/dto/update-category.dto.ts` — add null to `parentId` type + validators
- `apps/store-api/src/category/category.service.spec.ts` — add "clear parent" test case

---

### TASK-149-B: Frontend — Fix `CategoryForm` state-sync (Rule 2b)

**Type:** fix
**Scope:** store-admin
**Complexity:** M (2–4h)
**TDD Required:** No (tests in TASK-149-D)
**Depends on:** none (independent of TASK-149-A)

**Acceptance Criteria:**

- [ ] `CategoryForm` accepts an optional `id?: string` prop
- [ ] `useForm` in `CategoryForm` no longer uses the `values` option or `resetOptions`
- [ ] `useForm` uses only `defaultValues: EMPTY_VALUES` as the stable baseline
- [ ] A `useEffect(() => { form.reset({ ...EMPTY_VALUES, ...defaultValues }) }, [id])` is added;
      it only fires when `id` changes (edit navigation), not on background refetches
- [ ] In CREATE mode (`id` not provided), the `useEffect` does not fire; the form starts clean
      with `EMPTY_VALUES` and the user's selections are never clobbered by refetches
- [ ] In EDIT mode, the form resets to server data when the admin navigates to a different
      category (id changes) but NOT on background refetches
- [ ] `edit-category-view.tsx` passes `id={categoryId}` to `<CategoryForm>`
- [ ] Build, lint, typecheck clean: `npm run build -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/features/category-form/ui/category-form.tsx` — Rule 2b refactor
- `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx` — pass `id` prop

---

### TASK-149-C: Frontend — Fix `categoryFormValuesToDto` null mapping for UPDATE

**Type:** fix
**Scope:** store-admin
**Complexity:** S (1–2h)
**TDD Required:** No (tests in TASK-149-D)
**Depends on:** TASK-149-A (backend must accept null before frontend sends it)

**Acceptance Criteria:**

- [ ] `categoryFormValuesToDto` accepts a second parameter `options?: { isUpdate?: boolean }`
- [ ] In UPDATE path (`isUpdate: true`): `parentId: ""` maps to `null` (explicit clear)
- [ ] In CREATE path (`isUpdate: false` / default): `parentId: ""` maps to `undefined` (unchanged behaviour)
- [ ] `edit-category-view.tsx` calls `categoryFormValuesToDto(values, { isUpdate: true })`
- [ ] `create-category-view.tsx` still calls `categoryFormValuesToDto(values)` (no second arg)
- [ ] TypeScript type: return type is `CreateCategoryDto | UpdateCategoryDto` (or a union that
      satisfies both call sites)
- [ ] Lint + typecheck clean

**Files to create/modify:**

- `apps/store-admin/src/features/category-form/model/category-schema.ts` — add `isUpdate` param
- `apps/store-admin/src/widgets/category-form-view/ui/edit-category-view.tsx` — pass `{ isUpdate: true }`
- `apps/store-admin/src/features/category-form/index.ts` — re-export if signature changes

---

### TASK-149-D: Tests — RTL + backend specs

**Type:** test
**Scope:** store-api + store-admin
**Complexity:** M (2–4h)
**TDD Required:** Yes
**Depends on:** TASK-149-A, TASK-149-B, TASK-149-C

**Acceptance Criteria:**

- [ ] New test file `apps/store-admin/src/features/category-form/ui/category-form.test.tsx`
      containing all 6 scenarios from the TDD / Test Plan section above
- [ ] The `CategoryForm` create test asserts `onSubmit` is called with `parentId: "uuid-A"`
      after the user selects that category from the Select
- [ ] The `CategoryForm` edit test asserts the parent is NOT reset by a concurrent refetch
      (simulated by re-rendering the form without changing `id`)
- [ ] The `categoryFormValuesToDto` unit test asserts `parentId: null` is returned when
      `isUpdate: true` and `parentId: ""`
- [ ] Backend: `category.service.spec.ts` includes "clear parent (null)" test for `update()`
- [ ] All 419 + N store-api tests green; all N + 6 store-admin tests green
- [ ] Tests pass: `npm run test -w apps/store-api && npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/features/category-form/ui/category-form.test.tsx` — NEW
- `apps/store-admin/src/shared/test/msw-handlers.ts` — add admin categories MSW handler if not present
- `apps/store-api/src/category/category.service.spec.ts` — add "clear parent" test

---

## Out of Scope

- **`admin-category-table.tsx` nameById cross-page lookup:** the in-page lookup limitation
  (`admin-category-table.tsx:52–54`) contributes to the "looks not saved" symptom but is a
  separate display issue. The correct fix (enriched API response with parent name, or a separate
  "fetch all" for name resolution) is scope for a follow-up task under TASK-140.
- **Category self-relation cycle detection:** already tested and works in
  `category.service.ts:209–213`.
- **Any Prisma schema changes:** the `parentId String?` scalar field is already correct.
- **Storefront category navigation:** unaffected by this fix.
