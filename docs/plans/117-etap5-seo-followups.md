# Plan 117 — Етап 5 SEO Follow-ups (Tech Debt)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 5 — SEO-платформа + admin onboarding (tech-debt follow-up, filed
> after the plan shipped)
> **Origin:** `docs/plans/116-seo-platform-onboarding.md` (TASK-239…244, all ✅) — three loose
> ends noted during that plan's review/implementation but deliberately not blocked on it
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG tasks:** TASK-245, TASK-246, TASK-247

## Overview

Plan 116 shipped the `SeoSettings` singleton, the `resolveSeo()` precedence-chain helper,
product-level SEO meta, the FAQ/`FAQPage` module, and a two-part admin onboarding guide (all six
tasks ✅). While scoping and implementing that plan, three small, independent gaps were
identified and deliberately deferred as non-blocking tech debt rather than expanding plan 116's
scope further:

1. **TASK-245** — the product SEO-override admin form can set a value but not clear it back to
   auto-derived.
2. **TASK-246** — a pre-existing gap in `SiteContactSettings` (predates plan 116; explicitly
   flagged in plan 116 gap 5 as "note only, not part of this plan") where writes never trigger
   revalidation.
3. **TASK-247** — the category admin SEO override columns (added by TASK-240) are not yet
   surfaced on the public category tree, so `resolveSeo()`'s tier-1 (entity meta) never lights up
   for the category-filtered `/products` listing — it currently only reaches tier 3
   (content-derived from name/description), as the code comment in
   `apps/store-client/src/app/products/page.tsx` (~L48–51) says explicitly.

All three approaches are already fully scoped (see the brief that produced this document); this
plan **documents the approved approach**, it does not re-derive it. No Prisma schema change is
required for any of the three — the `metaTitle`/`metaDescription` columns already exist on
`Product` (TASK-241) and `Category` (TASK-240/pre-existing).

## Scope

### In Scope

- TASK-245: admin product-form "clear SEO override" mapping + `UpdateProductDto` nullable fields.
- TASK-246: `SiteContactSettings` write-path revalidation + storefront tagged fetch.
- TASK-247: expose `Category.metaTitle`/`metaDescription` on the public tree read and wire them
  into the category-filtered `/products` `generateMetadata()` as tier 1.

### Out of Scope

- Any other Етап 5 gap already closed by plan 116 (nothing here reopens TASK-239…244).
- The `BlogPost.metaTitle`/`metaDescription` gap (plan 116 gap 6) — still a separate, unscheduled
  follow-up, not part of this plan.
- Any new Prisma migration — all backing columns already exist.
- Re-scoping the approach for any of the three tasks — see "already fully scoped" note above.

## User Stories

1. As a store manager, I want to blank out a product's SEO title/description in the admin form
   and have it actually revert to the auto-generated one, so I can undo an override without
   asking a developer to touch the database.
2. As the store owner, I want an edit to my contact info (phone/hours/social links) to show up on
   the live site footer and Organization schema without waiting for the next scheduled rebuild.
3. As a shopper (or a search engine crawler) browsing a category-filtered listing, I want the
   page title/description to reflect the category's admin-authored SEO override when one exists,
   not just an auto-derived string from the category name.

## Technical Design

No new Prisma models or columns. Each task mirrors an existing, already-shipped reference
pattern in the same codebase — see each task's "Reference pattern" below.

### API Contract changes

| Task     | Contract change                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------- |
| TASK-245 | `UpdateProductDto.metaTitle`/`metaDescription`: `string` → `string \| null` (admin-only write DTO) |
| TASK-246 | None — response/request shapes unchanged, only side-effect (revalidation) added                    |
| TASK-247 | `CategoryTreeNodeEntity` (public, storefront-consumed) gains `metaTitle`/`metaDescription` fields  |

TASK-245 and TASK-247 both require an Orval regen (`npm run generate:api`) in the affected app(s)
after the backend change lands.

## Tasks

### TASK-245: Product SEO override cannot be cleared back to auto

**Type:** fix
**Scope:** store-admin, store-api
**Complexity:** S (1-2h)
**TDD Required:** No (form-mapping + DTO fix, not cart/discount/inventory/auth) — still covered by
existing/added unit tests per the acceptance criteria below.
**Depends on:** —

**Problem statement:** In `productFormValuesToDto()`, a blanked `metaTitle`/`metaDescription`
maps to `undefined`, which is _omitted_ from the DTO payload rather than sent as an explicit
clear. On `PUT /api/admin/products/:id`, an omitted field means "leave unchanged" (standard
partial-update semantics), so once a manager sets an override there is no way to blank it back to
the auto-derived value from the admin UI — the only escape hatch today is a direct DB edit.

**Reference pattern to mirror:** `Category` already solved this exact problem (TASK-236/240).
`categoryFormValuesToDto()` in
`apps/store-admin/src/features/category-form/model/category-schema.ts` (L84–119) is an
overloaded function: the 2-argument form (`values`) returns `CreateCategoryDto` for the create
flow (blank → `undefined`, omitted); the 3-argument form (`values, { isUpdate: true }`) returns
`UpdateCategoryDto` and maps blank → explicit `null` (L112–118). `edit-category-view.tsx:56`
calls the 3-argument form. On the backend, `UpdateCategoryDto.metaTitle`/`metaDescription`
(`apps/store-api/src/category/dto/update-category.dto.ts` L102–128) are typed `string | null` and
gated with `@ValidateIf((o: UpdateCategoryDto) => o.metaTitle !== null)` so `@IsString()` only
runs when a real value is present, letting `null` through untouched to Prisma (which writes
`NULL`, clearing the column).

**Acceptance Criteria:**

- [ ] `productFormValuesToDto()` in
      `apps/store-admin/src/features/product-form/model/product-schema.ts` becomes an overloaded
      function exactly like `categoryFormValuesToDto()`: 2-arg form → `CreateProductDto` (blank →
      `undefined`, unchanged create-flow behavior); 3-arg form (`values, { isUpdate: true }`) →
      `UpdateProductDto` (blank `metaTitle`/`metaDescription` → explicit `null`)
- [ ] `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx:55` passes
      `{ isUpdate: true }` to `productFormValuesToDto(values, { isUpdate: true })`, matching
      `edit-category-view.tsx:56`
- [ ] `apps/store-api/src/product/dto/update-product.dto.ts` (~L160–178): `metaTitle`/
      `metaDescription` retyped `string | null`, `@ApiProperty` gets `nullable: true, type: String`,
      each gated with `@ValidateIf((o) => o.metaTitle !== null)` / `@ValidateIf((o) => o.metaDescription !== null)`
      before the existing `@IsString()`/`@MaxLength(...)` — same shape as
      `update-category.dto.ts` L109–128
- [ ] Product repository/service pass the (now nullable) fields through untouched — no new
      business logic, same as the `description` field today
- [ ] Orval regen (`npm run generate:api` in store-admin) — `UpdateProductDto` typed
      `metaTitle?: string | null` in the generated model; store-admin typechecks clean
- [ ] `apps/store-admin/src/features/product-form/ui/product-form.test.tsx` "SEO meta mapping"
      describe block (~L306) gets a new case: calling `productFormValuesToDto(values, { isUpdate: true })`
      with blank `metaTitle`/`metaDescription` asserts both resolve to `null` (not `undefined`);
      the existing create-flow case (blank → `undefined`, no second argument) stays green
      unmodified
- [ ] A non-blank value still round-trips as a trimmed string in both create and update calls (no
      regression on the "set an override" path)
- [ ] Manual/e2e check: editing a product that already has a `metaTitle`, blanking the field, and
      saving results in `product.metaTitle === null` in the DB (PDP `generateMetadata` then falls
      through to `resolveSeo()` tier 2/3 as expected)
- [ ] `npm run typecheck`/`lint` clean for store-admin and store-api
- [ ] Tests pass: `npm run test -w apps/store-admin`, `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/model/product-schema.ts` — overloaded
  `productFormValuesToDto()`, `isUpdate` → `null` mapping (mirrors `category-schema.ts` L84–119)
- `apps/store-admin/src/widgets/product-form-view/ui/edit-product-view.tsx` — pass
  `{ isUpdate: true }` at the `update.mutate(...)` call site (~L55)
- `apps/store-api/src/product/dto/update-product.dto.ts` — `metaTitle`/`metaDescription` →
  `string | null` + `@ValidateIf` (~L160–178)
- `apps/store-admin/src/features/product-form/ui/product-form.test.tsx` — new "clear on update"
  test case (~L306 describe block)
- `apps/store-admin/src/shared/api/generated/` — regenerated (Orval)

---

### TASK-246: `SiteContactSettings` writes don't revalidate the storefront

**Type:** fix
**Scope:** store-api, store-client
**Complexity:** S (1-2h)
**TDD Required:** No — covered by an added unit-test assertion on the existing service spec.
**Depends on:** —

**Problem statement:** `SiteContactService.updateSettings()`
(`apps/store-api/src/site-contact/site-contact.service.ts` L25–29) upserts the row and returns
the entity but never calls `RevalidationNotifier`. The storefront's `site-contact-server.ts` fetch
is only time-based (`next: { revalidate: 3600 }`, no tag), so an admin edit to phone/hours/social
links can take up to an hour to reach the live footer and the homepage Organization `sameAs`
JSON-LD — this was flagged as a pre-existing gap in plan 116 (gap 5) and explicitly called out
there as _not_ part of that plan's scope, since the new `SeoSettings`/`FaqItem` modules were built
to wire revalidation from day one instead of repeating the same mistake.

**Reference pattern to mirror:** `SeoSettingsService`
(`apps/store-api/src/seo-settings/seo-settings.service.ts`) is the sibling singleton-settings
service built correctly: constructor-injects `RevalidationNotifier` from `../publishing`
(L16–19), and `updateSettings()` (L38–44) calls
`await this.revalidation.revalidate({ tags: [SEO_SETTINGS_TAG] })` after the upsert, before
returning the entity. `PublishingModule` is declared `@Global()`
(`apps/store-api/src/publishing/publishing.module.ts`), so `RevalidationNotifier` is already
injectable anywhere without an explicit module import — `SiteContactModule` likely needs no
change, but must be verified.

**Acceptance Criteria:**

- [ ] `SiteContactService` constructor-injects `RevalidationNotifier` (from `../publishing`),
      same shape as `SeoSettingsService`'s constructor
- [ ] `updateSettings()` calls `await this.revalidation.revalidate({ tags: ['site-contact'] })`
      after `this.repository.upsertSettings(input)` and before returning the entity (mirrors
      `SeoSettingsService.updateSettings()` L38–44)
- [ ] `SiteContactModule` verified to resolve the dependency correctly (no import change expected
      since `PublishingModule` is `@Global()`; add the import only if DI actually fails)
- [ ] `apps/store-client/src/shared/api/site-contact-server.ts:17` fetch gains
      `next: { tags: ['site-contact'] }` alongside the existing `revalidate: 3600` (belt-and-braces:
      time-based refresh stays as the floor, tag-based revalidation makes edits near-instant)
- [ ] `site-contact.service.spec.ts` gets a new assertion: `updateSettings()` calls
      `revalidation.revalidate` with `{ tags: ['site-contact'] }` exactly once (mock the notifier
      the same way `seo-settings.service.spec.ts` does)
- [ ] Manual check: editing site-contact settings in admin and hitting
      `POST /api/revalidate` (or observing the tag purge) refreshes the footer/homepage without
      waiting for the 1h ISR window
- [ ] `npm run typecheck`/`lint` clean for store-api and store-client
- [ ] Tests pass: `npm run test -w apps/store-api` (site-contact spec), no store-client test
      regressions

**Files to create/modify:**

- `apps/store-api/src/site-contact/site-contact.service.ts` — inject `RevalidationNotifier`, call
  `revalidate({ tags: ['site-contact'] })` in `updateSettings()` (~L25–29)
- `apps/store-api/src/site-contact/site-contact.module.ts` — verify DI resolves (no import change
  expected; `PublishingModule` is `@Global()`)
- `apps/store-api/src/site-contact/site-contact.service.spec.ts` — new revalidation-call
  assertion
- `apps/store-client/src/shared/api/site-contact-server.ts` — add `next: { tags: ['site-contact'] }`
  to the fetch (~L17)

---

### TASK-247: Category admin SEO override not exposed to public category read

**Type:** feat
**Scope:** store-api, store-client
**Complexity:** S (1-2h)
**TDD Required:** No — covered by repository/service unit tests + a storefront test update.
**Depends on:** —

**Problem statement:** `Category.metaTitle`/`metaDescription` (added by TASK-240, already
editable in the admin category form) are not returned by the public category-tree read
(`GET /api/categories/tree`), so `resolveSeo()` in the category-filtered `/products` listing can
never reach its tier-1 (entity meta) — it only ever falls through to tier 2 (`SeoSettings`
defaults) or tier 3 (content-derived from `name`/`description`). The gap is explicitly
called out in a code comment in `apps/store-client/src/app/products/page.tsx` (~L48–51): _"The
category's own `metaTitle`/`metaDescription` admin overrides (tier 1) are not surfaced on the
public category tree/detail endpoints yet... the entity tier lights up once those columns are
exposed publicly."_

Note: `CategoryRepository.findCategoryTree()`
(`apps/store-api/src/category/category.repository.ts` L212–246) already uses a full Prisma
`include` (no narrow `select`), so the raw query result already contains `metaTitle`/
`metaDescription` on every level — the gap is entirely in `CategoryTreeNodeEntity`, which drops
the fields when mapping from the Prisma row.

**Reference pattern to mirror:** the flat `CategoryEntity`
(`apps/store-api/src/category/entities/category.entity.ts` L60–76) already exposes both fields
with the exact `@ApiProperty` shape to copy (`type: String, nullable: true, required: false`,
same descriptions/examples as the category admin form uses).

**Acceptance Criteria:**

- [ ] `CategoryTreeNodeEntity`
      (`apps/store-api/src/category/entities/category-tree-node.entity.ts`) gains `metaTitle`/
      `metaDescription: string | null` fields with `@ApiProperty({ type: String, nullable: true, required: false })`,
      matching `CategoryEntity` L60–76
- [ ] `CategoryTreeNodeEntity.fromPrisma()` — both the top-level and the recursive `children`
      parameter type — reads and assigns `metaTitle`/`metaDescription` from the Prisma row (present
      in both `findCategoryTree()` and `findCategoryTreeForAdmin()` results already, since both use
      a full `include` with no narrowing `select`)
- [ ] Confirm (do not need to change, just verify in a repository test) that
      `CategoryRepository.findCategoryTree()`/`findCategoryTreeForAdmin()` continue to return the
      two columns at every nesting level — no `select` clause needs adding since `include` already
      returns full rows
- [ ] Orval regen (`npm run generate:api` in store-client) — generated `CategoryTreeNodeEntity`
      model gains the two nullable fields; store-client typechecks clean
- [ ] `apps/store-client/src/app/products/page.tsx` `generateMetadata()` (~L45–79): the
      `resolveSeo({...})` call for the category-filtered view passes
      `entityTitle: node.metaTitle, entityDescription: node.metaDescription` as tier 1, ahead of
      the existing `content: { name: node.name, description: node.description }` tier-3 fallback;
      the "not surfaced yet" code comment (~L48–51) is removed/updated to reflect the closed gap
- [ ] `category.repository.spec.ts` — assert `fromPrisma`/tree-fetch round-trips `metaTitle`/
      `metaDescription` at both a root and a nested-child level
- [ ] `category.service.spec.ts` — assert the service-level tree read surfaces the two fields
      unchanged
- [ ] Storefront test: `products/page` (or `resolveSeo` call-site) test updated/added to assert a
      category with a `metaTitle` set produces that exact title in `generateMetadata()`'s result,
      taking precedence over the content-derived fallback
- [ ] `npm run build`/`lint`/`typecheck` clean for store-api and store-client
- [ ] Tests pass: `npm run test -w apps/store-api`, `npm run test -w apps/store-client`

**Files to create/modify:**

- `apps/store-api/src/category/entities/category-tree-node.entity.ts` — add `metaTitle`/
  `metaDescription` fields + `fromPrisma` mapping (both levels)
- `apps/store-api/src/category/category.repository.spec.ts` — round-trip assertions
- `apps/store-api/src/category/category.service.spec.ts` — pass-through assertion
- `apps/store-client/src/app/products/page.tsx` — pass `node.metaTitle`/`metaDescription` into
  `resolveSeo()` as tier 1, remove the stale "not surfaced yet" comment (~L45–79)
- `apps/store-client/src/shared/api/generated/` — regenerated (Orval)
- (storefront test file covering `products/page` `generateMetadata` or `resolveSeo` call-site —
  build agent's call on exact file per existing test layout)

## Dependencies & Sequencing

All three tasks are **independent** and **parallel-safe**:

- Different modules (product-form/product DTO vs. site-contact vs. category), no shared files,
  no ordering constraint between them.
- None requires a Prisma schema change — all backing columns already exist
  (`Product.metaTitle`/`metaDescription` from TASK-241, `Category.metaTitle`/`metaDescription`
  from TASK-240/pre-existing).
- None blocks or is blocked by any other open BACKLOG task.
- Each can be picked up in any order; TASK-245 and TASK-247 each require one Orval regen in their
  respective consuming app after the backend change, TASK-246 requires no contract regen.

## Risks & Mitigations

| Risk                                                                                      | Mitigation                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-245's `@ValidateIf` gate is misapplied and rejects legitimate blank-to-clear updates | Copy the exact `update-category.dto.ts` L109–128 predicate (`o.metaTitle !== null`) rather than reinventing it                                                                                  |
| TASK-246's added revalidation call throws and breaks the settings-save request path       | `RevalidationNotifier.revalidate()` already used elsewhere (`SeoSettingsService`, `blog.service.ts`, etc.) without special error handling — follow the same call shape, no new try/catch needed |
| TASK-247's recursive `fromPrisma` mapping misses a nesting level (3 levels supported)     | Test asserts at both a root and a nested-child level, not just the top; the recursive call already threads the full child object through, so adding two fields to the type is low-risk          |

## Notes

- These three tasks were identified while scoping/implementing plan 116 but deliberately kept out
  of that plan's scope to avoid re-opening an already-reviewed, already-shipped plan; see plan 116
  gap 5 (TASK-246) and its "Follow-ups from Етап 5" BACKLOG section (all three).
- The `BlogPost.metaTitle`/`metaDescription` gap (plan 116 gap 6) remains a separate, unscheduled
  follow-up — not part of this plan, no BACKLOG task filed for it yet.
