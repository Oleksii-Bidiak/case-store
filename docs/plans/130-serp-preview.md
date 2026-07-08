# Plan 130 — SERP Preview for Meta Fields

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 3** (Функціональні прогалини + SEO-зручність), Block G
> **Created:** 2026-07-08
> **Last Updated:** 2026-07-08
> **BACKLOG task:** TASK-268

## Overview

The owner has no SEO experience and cannot picture what a typed `metaTitle`/`metaDescription`
will actually look like in a Google search result, nor how the _absence_ of one behaves (the
storefront's `resolveSeo()` silently falls back to a derived or global-default value, per plan 116).
This plan adds a small, reusable "SERP preview" — a live Google-snippet mock (title / green URL /
description) plus character counters (~60 for title, ~155 for description, matching
`SEO_TITLE_MAX`/`SEO_DESCRIPTION_MAX` in `apps/store-client/src/shared/lib/seo/resolveSeo.ts`) and
a "blank field = auto-generated" hint — under the meta fields of every admin form that owns them:
product, category, page, and the global `/settings/seo` defaults form. One shared, purely
presentational `seo-snippet-preview` component in `apps/store-admin/src/shared/ui` backs all four.

**No backend change, no Prisma migration, no Orval regen.** Every input the preview needs (the
form's own live field values + the global `SeoSettings` singleton) is already available via
existing Orval hooks. This plan is `store-admin`-only.

## Scope

### In Scope

- One new presentational component, `apps/store-admin/src/shared/ui/seo-snippet-preview/`, rendered
  under the meta-title/meta-description fields in `ProductForm`, `CategoryForm`, `PageForm`, and
  `SeoSettingsForm`.
- A small mirrored pure-logic module, `apps/store-admin/src/shared/lib/seo/resolve-seo-preview.ts`,
  that ports the storefront's `resolveSeo()` precedence chain (tier 1 entity override → tier 2
  `SeoSettings` defaults → tier 3 content-derived + title-template branding) so the preview matches
  production exactly, including `stripFormatting`/`truncateAtWord` and the `%s` title-template
  application logic.
- Char counters against `SEO_TITLE_MAX = 60` / `SEO_DESCRIPTION_MAX = 155` on the _raw typed value_
  of each form's own `metaTitle`/`metaDescription` field (advisory only — independent of the
  existing 255/500 `class-validator`/zod max-length validation, which is unchanged).
- A "blank = auto" hint that reflects which tier actually resolved (own override / global default /
  derived-from-name) so the owner understands _why_ the preview shows what it shows even when they
  typed nothing.
- All four entity/settings forms fetch the `SeoSettings` singleton (already Orval-generated,
  `useSeoSettingsControllerGetSettings`) to source tier-2 defaults + the title template — reusing
  the one shared TanStack Query cache entry the `/settings/seo` page already populates, not four
  separate network round-trips in practice.
- New dictionary strings under `dict.seoSnippetPreview` (or nested per-form as needed) for the
  counters, the "auto" hint variants, and any static SERP-mock labels.

### Out of Scope

- Any backend change, Prisma column, DTO change, or Orval regen — every input already exists on the
  client (form fields + the already-Orval-generated `SeoSettingsEntity`).
- SEO-health signals (missing-metaTitle counts across the catalog, global noindex warning,
  sitemap/robots/llms.txt links) — that is TASK-269 (`docs/plans/131-seo-health.md`), sequenced
  right after this plan in the same worktree; this plan touches only the _live-typing_ preview under
  a single form's own fields, never an aggregate across entities.
- Rich SERP extras real Google sometimes renders (star ratings, breadcrumbs beyond the URL segment,
  sitelinks, rich snippets from Schema.org) — the preview is the plain title/URL/description
  three-line mock only, which is what 95%+ of this store's result snippets actually look like.
- Editing the resolved SEO values from the preview itself — it is read-only, reflecting the form's
  own inputs; the owner edits the real fields above it as today.
- A generic cross-app `packages/` SEO library shared between `store-admin` and `store-client` — FSD
  forbids `store-admin` importing from `store-client` (a sibling app), and there is no existing
  shared-domain package in this monorepo (`packages/` currently holds only `eslint-config`).
  Duplicating the small, stable precedence/truncation logic into a mirrored, unit-tested
  `store-admin` module is the pragmatic choice for this size of logic (see Design Decision 1)
  rather than a net-new cross-app package for ~40 lines of pure functions.

## User Stories

1. As the store owner, when I type a meta title/description on a product/category/page, I want to
   see immediately what it will look like in a Google search result (bold title, green URL, grey
   description) so I don't have to guess whether it's too long or reads awkwardly.
2. As the store owner, when I leave the meta title/description blank, I want the preview to show me
   exactly what will be shown instead (my own product/category/page name, or the site-wide default)
   so "blank" doesn't feel like a black box.
3. As the store owner, I want a simple counter next to each field ("42/60", turning red past the
   limit) so I know at a glance whether my text will get cut off in search results.
4. As the store owner, when I edit the global SEO defaults on `/settings/seo`, I want the same live
   preview so I understand what a page with no of its own title/description will show site-wide.

## Technical Design

### Design Decision 1 — mirrored pure-logic module, not a re-export from `store-client`

`apps/store-client/src/shared/lib/seo/resolveSeo.ts` cannot be imported from `store-admin` — the two
are separate Next.js apps/workspaces, and FSD/AGENTS.md forbid one app reaching into another's
source tree (there is no shared `packages/` domain library today; `packages/` holds only
`eslint-config`). This plan ports the parts of `resolveSeo()` the _preview_ needs into a new,
independently unit-tested module:

`apps/store-admin/src/shared/lib/seo/resolve-seo-preview.ts`:

```ts
/** Mirrors apps/store-client/src/shared/lib/seo/resolveSeo.ts SEO_TITLE_MAX/SEO_DESCRIPTION_MAX.
 *  Kept as a literal duplicate (not imported) — store-admin cannot import from the sibling
 *  store-client app. Any future change to the storefront's limits must be mirrored here by hand;
 *  a code comment in both files cross-references the other. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

// Ported verbatim from resolveSeo.ts (same regex/logic, same JSDoc intent):
export function stripFormatting(text: string): string {
  /* … */
}
export function truncateAtWord(text: string, max: number): string {
  /* … */
}

export interface SeoPreviewTitleInput {
  /** Tier 1 — the form's own metaTitle field, live-watched. */
  entityTitle?: string;
  /** Tier 2 — SeoSettings.defaultMetaTitle. */
  defaultTitle?: string;
  /** Tier 3 — the entity's display name/title (product name, category name, page title). */
  contentName?: string;
  /** Effective `%s`-template (SeoSettings.titleTemplate if valid, else `%s | ${brand}`). */
  titleTemplate: string;
}
export interface SeoPreviewTitleResult {
  /** Fully resolved, template-applied display title, exactly as `<title>` would render. */
  text: string;
  /** Which tier resolved: 'own' | 'default' | 'derived' | 'empty' — drives the hint copy. */
  tier: "own" | "default" | "derived" | "empty";
}
export function resolveSeoPreviewTitle(
  input: SeoPreviewTitleInput,
): SeoPreviewTitleResult {
  /* … */
}

export interface SeoPreviewDescriptionInput {
  entityDescription?: string;
  defaultDescription?: string;
  contentDescription?: string;
}
export interface SeoPreviewDescriptionResult {
  text: string;
  tier: "own" | "default" | "derived" | "empty";
}
export function resolveSeoPreviewDescription(
  input: SeoPreviewDescriptionInput,
): SeoPreviewDescriptionResult {
  /* … */
}

/** Effective template mirrors resolveTitleTemplate(): settings.titleTemplate if it contains
 *  exactly one `%s`, else `%s | ${brand}`. `brand` defaults to `dict.brand` ("MobileStore"),
 *  the store-admin mirror of store-client's SITE_NAME. */
export function resolveEffectiveTitleTemplate(
  titleTemplate: string | null | undefined,
  brand: string,
): string;

export function applyTitleTemplate(template: string, title: string): string;
```

This is the _only_ file in this plan that duplicates cross-app logic, and it is small (~90 lines
including the ported helpers), pure, and fully unit-tested against the same cases `resolveSeo.spec`
already covers in `store-client` (see Task A), so drift is caught immediately if either side's tests
fail after a manual edit.

### Design Decision 2 — the component stays purely presentational

`SeoSnippetPreview` (`apps/store-admin/src/shared/ui/seo-snippet-preview/`) takes only resolved,
primitive props — no Orval hooks, no `useWatch`, no knowledge of react-hook-form. This keeps it a
true `shared/ui` citizen (same tier as `RichTextEditor`, which is likewise a dumb, controlled
component) and reusable from all four forms without any form-shape coupling:

```ts
export interface SeoSnippetPreviewProps {
  /** Fully resolved, template-applied display title (from resolveSeoPreviewTitle().text). */
  title: string;
  /** Which tier produced `title` — drives the hint line under the snippet. */
  titleTier: "own" | "default" | "derived" | "empty";
  /** Fully resolved description (from resolveSeoPreviewDescription().text), or undefined. */
  description?: string;
  descriptionTier: "own" | "default" | "derived" | "empty";
  /** Display URL for the green breadcrumb line, e.g. "mobilestore.ua › products › chohol-iphone". */
  url: string;
  /** Raw length of what's actually typed in the entity's own metaTitle field (0 if blank) —
   *  independent of the resolved/templated `title` length, used only for the counter. */
  rawTitleLength: number;
  rawDescriptionLength: number;
}
```

Rendering: a bordered `bg-card` mock card (title in `text-primary`/blue-link styling truncated
visually at the pixel-equivalent width, a `text-success`/green URL breadcrumb line, a grey
description line truncated to `SEO_DESCRIPTION_MAX`), two counters (`{n}/{max}`, `text-destructive`
when `n > max`, `text-muted-foreground` otherwise), and one hint line whose copy is picked by
`titleTier`/`descriptionTier` (`dict.seoSnippetPreview.hintOwn/hintDefault/hintDerived/hintEmpty`).
`title`/`description` passed in are already truncated by the resolver (mirrors what production
actually renders), so the component does no truncation math itself — it only renders and colors.

### Design Decision 3 — sourcing `SeoSettings` in the three entity forms

`ProductForm`, `CategoryForm`, and `PageForm` don't otherwise need the global `SeoSettings`
singleton — but the preview does, for tier 2 (`defaultMetaTitle`/`defaultMetaDescription`) and the
title template. Each of the three forms adds one `useSeoSettingsControllerGetSettings()` call
(same zero-arg hook `SeoSettingsForm`/`SeoSettingsView` already use). Because the hook's query key is
identical across all four call sites (no params), TanStack Query serves all of them from **one**
cached entry (5-minute `staleTime`, per `apps/store-admin/src/app/providers.tsx`) — visiting
`/products/new` after having visited `/settings/seo` in the same session issues zero extra requests;
a cold visit issues exactly one. This is advisory UX (the preview, not the real submit), so a
loading/error state for this extra fetch degrades gracefully: while loading or on error, the preview
still renders using `brand = dict.brand` and `titleTemplate = "%s | ${dict.brand}"` (the documented
zero-config default), simply without a tier-2 default-value fallback until the settings arrive —
never blocking the form or hiding the field's own live typing.

### Design Decision 4 — `SeoSettingsForm`'s self-referential preview

`SeoSettingsForm` edits the _defaults themselves_, so there is no separate "entity" to preview
against — `defaultMetaTitle`/`defaultMetaDescription` are simultaneously "the input" and "tier 2".
The preview here demonstrates the **template application** using a representative placeholder
content name (`dict.seoSnippetPreview.samplePageName`, e.g. "Чохол для iPhone 15" — an illustrative
example page title, not real data) so the owner can see how `titleTemplate` brands a page that has
no title of its own:

- `defaultMetaTitle` filled → preview shows it verbatim (tier "own" from the preview's point of
  view — the settings form has no tier-1 concept, it edits tier 2 directly).
- `defaultMetaTitle` blank → preview shows `applyTitleTemplate(effectiveTemplate, samplePageName)`,
  i.e. what an untitled real page would render, tier `"derived"`.
- Same logic for `defaultMetaDescription` vs. a `dict.seoSnippetPreview.samplePageDescription`
  placeholder.
- The URL breadcrumb here is a generic `mobilestore.ua › …` placeholder, not tied to any real slug.

This is called out as a distinct, explicit case in the Tasks below (Task F) rather than silently
reusing the entity-form wiring, since the input shape differs (no `entityTitle`/`content.name`
tier 1/3 — only tier 2 plus the illustrative placeholder standing in for tier 3).

### Frontend (Next.js — FSD)

#### shared/lib

- `shared/lib/seo/resolve-seo-preview.ts` — **new**: ported pure functions per Design Decision 1.
- `shared/lib/seo/resolve-seo-preview.test.ts` — **new**: unit tests.
- `shared/lib/seo/index.ts` — **new**: barrel (`export * from "./resolve-seo-preview"`).

#### shared/ui

- `shared/ui/seo-snippet-preview/seo-snippet-preview.tsx` — **new**: presentational component per
  Design Decision 2.
- `shared/ui/seo-snippet-preview/index.ts` — **new**: barrel.
- `shared/ui/seo-snippet-preview/seo-snippet-preview.test.tsx` — **new**: RTL — renders title/URL/
  description, counter turns `text-destructive` past the max, all four hint variants render their
  matching copy.
- `shared/ui/index.ts` — **modified**: re-export `SeoSnippetPreview`.

#### features (form wiring — no new files beyond the forms themselves)

- `features/product-form/ui/product-form.tsx` — **modified**: `SeoSnippetPreview` inserted after the
  existing metaTitle/metaDescription fields (~L496–531); `useWatch` on `name`/`metaTitle`/
  `metaDescription`/`slug`; `useSeoSettingsControllerGetSettings()`.
- `features/category-form/ui/category-form.tsx` — **modified**: same shape after ~L229–260; needs a
  new `useWatch` on `name` (not currently watched) alongside `metaTitle`/`metaDescription`.
- `features/page-form/ui/page-form.tsx` — **modified**: same shape after ~L155–179; reuses the
  already-watched `titleValue`/`slugValue`, adds `useWatch` on `metaTitle`/`metaDescription`.
- `features/seo-settings-form/ui/seo-settings-form.tsx` — **modified**: per Design Decision 4; needs
  `useWatch`-equivalent live values — since this form uses plain `register()` with no `control`
  destructured for watching today, add `const values = useWatch({ control })` (RHF's whole-form
  watch overload) or switch the two relevant fields to `useWatch({ control, name: [...] })`.

#### shared/config

- `dictionary.ts` — new `dict.seoSnippetPreview` section: `titleCounterLabel`, `descriptionCounterLabel`
  (or inline `{n}/{max}` formatter functions, consistent with existing `dict.*.slugPreview(name)`
  function-value pattern), `hintOwn`, `hintDefault`, `hintDerived`, `hintEmpty`, `samplePageName`,
  `samplePageDescription`, `urlAriaLabel`. Exact key list at implementer discretion; structural
  requirement is no hardcoded UA copy inlined in `.tsx` files (matches the file-wide dictionary
  convention already followed by every other admin form).

### API Contract

No changes. `store-api` is untouched by this plan; no Orval regen needed.

## Tasks

### TASK-268-A: Mirrored `resolve-seo-preview` pure-logic module

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — pure ported utility functions, not cart/discount/inventory/auth; unit-tested
per the acceptance criteria below.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `resolve-seo-preview.ts` exports `SEO_TITLE_MAX = 60`, `SEO_DESCRIPTION_MAX = 155`,
      `stripFormatting`, `truncateAtWord`, `resolveEffectiveTitleTemplate`, `applyTitleTemplate`,
      `resolveSeoPreviewTitle`, `resolveSeoPreviewDescription` per the Technical Design signatures
- [ ] `resolveSeoPreviewTitle`: own (`entityTitle` set) → verbatim, `tier: "own"`; blank own +
      `defaultTitle` set → verbatim, `tier: "default"`; both blank + `contentName` set →
      `applyTitleTemplate(effectiveTemplate, truncateAtWord(stripFormatting(contentName), 60))`,
      `tier: "derived"`; all three blank → `text: ""`, `tier: "empty"`
- [ ] `resolveSeoPreviewDescription`: same three-tier precedence (own → default → derived from
      `contentDescription` via `stripFormatting` + `truncateAtWord(…, 155)`), no template applied to
      descriptions (matches `resolveSeo()` — only titles get the `%s` template)
- [ ] `resolveEffectiveTitleTemplate`: returns `titleTemplate` unchanged when it contains exactly one
      `%s`; returns `` `%s | ${brand}` `` otherwise (null/undefined/no-token/blank input)
- [ ] Unit tests port the representative cases from
      `apps/store-client/src/shared/lib/seo/resolveSeo.spec.ts` (HTML-stripping, markdown-link
      unwrapping, word-boundary truncation with ellipsis, whitespace-only input collapsing to
      `undefined`/`"empty"` tier) so behavior parity with the storefront is pinned, not just
      independently re-derived
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/shared/lib/seo/resolve-seo-preview.ts` — new
- `apps/store-admin/src/shared/lib/seo/resolve-seo-preview.test.ts` — new
- `apps/store-admin/src/shared/lib/seo/index.ts` — new

---

### TASK-268-B: `SeoSnippetPreview` shared/ui component

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — presentational component, covered by RTL per the acceptance criteria below.
**Depends on:** TASK-268-A (uses its `SEO_TITLE_MAX`/`SEO_DESCRIPTION_MAX` constants for the counter
threshold, though the component itself takes pre-resolved strings so it does not import the
resolver functions — only the two numeric constants, re-exported or duplicated as component-local
`defaultMax` props with the same values to avoid an unnecessary cross-folder import inside
`shared/ui`; implementer's call, documented inline either way)

**Acceptance Criteria:**

- [ ] `seo-snippet-preview.tsx` renders a bordered `bg-card` mock: title line, green/`text-success`
      URL breadcrumb line (`props.url`), grey description line — matching the visual grammar of a
      real Google result closely enough to be recognizable (not pixel-perfect)
- [ ] Title counter renders `{rawTitleLength}/60`; description counter renders
      `{rawDescriptionLength}/155`; either counter switches to `text-destructive` when its raw
      length exceeds the max, `text-muted-foreground` otherwise
- [ ] One hint line renders under the mock, its copy selected by `titleTier` (own/default/derived/
      empty) via `dict.seoSnippetPreview.hintOwn/hintDefault/hintDerived/hintEmpty`
- [ ] Empty `description` prop (undefined) renders no description line (not an empty `<p>`) — a page
      with truly no resolvable description (all three tiers empty) is a real, renderable state
- [ ] `seo-snippet-preview.test.tsx`: asserts title/url/description render from props; counter color
      flips at the boundary (59/60 muted, 61/60 destructive — exact boundary at implementer's
      discretion as long as `> max` is destructive and `<= max` is not); all four `titleTier` values
      render distinguishable hint text
- [ ] `shared/ui/index.ts` re-exports `SeoSnippetPreview`
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/shared/ui/seo-snippet-preview/seo-snippet-preview.tsx` — new
- `apps/store-admin/src/shared/ui/seo-snippet-preview/index.ts` — new
- `apps/store-admin/src/shared/ui/seo-snippet-preview/seo-snippet-preview.test.tsx` — new
- `apps/store-admin/src/shared/ui/index.ts` — export `SeoSnippetPreview`
- `apps/store-admin/src/shared/config/dictionary.ts` — new `dict.seoSnippetPreview` section (hint
  copy + counter/URL aria labels; sample-page copy used by Task F lands here too so the section is
  authored once)

---

### TASK-268-C: Wire `SeoSnippetPreview` into `ProductForm`

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — form wiring, covered by RTL per the acceptance criteria below.
**Depends on:** TASK-268-A, TASK-268-B

**Acceptance Criteria:**

- [ ] `product-form.tsx` calls `useSeoSettingsControllerGetSettings()` and `useWatch({ control, name:
  "metaTitle" })` / `"metaDescription"` (the existing `nameValue`/`slugValue` watches are reused
      for tier-3 content + the URL breadcrumb)
- [ ] `SeoSnippetPreview` renders directly under the existing metaTitle/metaDescription fields, fed
      `resolveSeoPreviewTitle({ entityTitle: metaTitleValue, defaultTitle: settings?.defaultMetaTitle,
  contentName: nameValue, titleTemplate: resolveEffectiveTitleTemplate(settings?.titleTemplate,
  dict.brand) })` (and the description equivalent); `url` built from `slugValue` (fallback to the
      live `slugify(nameValue)` preview already computed for the slug field) as
      `` `mobilestore.ua › products › ${slug}` `` (or the implementer's equivalent breadcrumb format —
      structural requirement is that it reflects the product's real PDP path, `/products/[slug]`)
- [ ] Preview renders correctly (own → verbatim; blank + settings default → default shown; blank +
      no default → derived from `name`, template-branded) in both create mode (no `defaultValues`)
      and edit mode (seeded `defaultValues`)
- [ ] `product-form.test.tsx` (existing suite): new cases — typing into `metaTitle` updates the
      preview title live; clearing it falls back through the tier chain; counter reflects the typed
      length
- [ ] `npm run typecheck`/`lint`/`build` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/features/product-form/ui/product-form.tsx` — modified
- `apps/store-admin/src/features/product-form/ui/product-form.test.tsx` — new cases

---

### TASK-268-D: Wire `SeoSnippetPreview` into `CategoryForm`

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — form wiring, covered by RTL per the acceptance criteria below.
**Depends on:** TASK-268-A, TASK-268-B

**Acceptance Criteria:**

- [ ] `category-form.tsx` gains a `useWatch({ control, name: "name" })` (not currently watched) plus
      `metaTitle`/`metaDescription` watches, and `useSeoSettingsControllerGetSettings()`
- [ ] `SeoSnippetPreview` renders directly under the existing metaTitle/metaDescription fields
      (~L229–260), same resolution wiring as Task C, `contentName` = the watched category `name`
- [ ] URL breadcrumb reflects the real category route, `/products?categoryId=…` — since the category
      being edited has a real `id` only in edit mode, the create-mode breadcrumb shows a generic
      `mobilestore.ua › products › (нова категорія)` placeholder (or equivalent — structural
      requirement: edit mode shows the real filtered-listing path, create mode degrades gracefully,
      never renders `undefined` in the URL string)
- [ ] `category-form.test.tsx`: same shape of cases as Task C (live typing, tier fallback, counter)
- [ ] `npm run typecheck`/`lint`/`build` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/features/category-form/ui/category-form.tsx` — modified
- `apps/store-admin/src/features/category-form/ui/category-form.test.tsx` — new cases

---

### TASK-268-E: Wire `SeoSnippetPreview` into `PageForm`

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — form wiring, covered by RTL per the acceptance criteria below.
**Depends on:** TASK-268-A, TASK-268-B

**Acceptance Criteria:**

- [ ] `page-form.tsx` reuses the already-watched `titleValue`/`slugValue`, adds `useWatch` on
      `metaTitle`/`metaDescription`, and `useSeoSettingsControllerGetSettings()`
- [ ] `SeoSnippetPreview` renders directly under the existing metaTitle/metaDescription fields
      (~L155–179), `contentName` = `titleValue`, URL breadcrumb reflects the real
      `/legal/[slug]` route
- [ ] `page-form.test.tsx`: same shape of cases as Task C
- [ ] `npm run typecheck`/`lint`/`build` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/features/page-form/ui/page-form.tsx` — modified
- `apps/store-admin/src/features/page-form/ui/page-form.test.tsx` — new cases

---

### TASK-268-F: Wire `SeoSnippetPreview` into `SeoSettingsForm` (self-referential defaults preview)

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — form wiring, covered by RTL per the acceptance criteria below.
**Depends on:** TASK-268-A, TASK-268-B

**Acceptance Criteria:**

- [ ] `seo-settings-form.tsx` gains live watches on `defaultMetaTitle`/`defaultMetaDescription`/
      `titleTemplate` (via `useWatch({ control, name: [...] })` since `control` isn't currently
      destructured from `useForm` here — only `register`/`handleSubmit`/`reset`/`formState` are)
- [ ] `SeoSnippetPreview` renders under the `defaultMetaTitle`/`defaultMetaDescription` fields per
      Design Decision 4: filled → verbatim (`tier: "own"` from the preview's perspective); blank →
      `applyTitleTemplate(effectiveTemplate, dict.seoSnippetPreview.samplePageName)` /
      `dict.seoSnippetPreview.samplePageDescription`, `tier: "derived"`
- [ ] A short inline note (`dict.seoSnippetPreview.sampleNote` or reused hint copy) clarifies this
      preview illustrates an example page, not a real one — avoids the owner mistaking the sample
      title/URL for real site content
- [ ] `seo-settings-form.test.tsx`: typing `titleTemplate` while `defaultMetaTitle` is blank updates
      the previewed sample title live; filling `defaultMetaTitle` switches the preview to verbatim
- [ ] `npm run typecheck`/`lint`/`build` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/features/seo-settings-form/ui/seo-settings-form.tsx` — modified
- `apps/store-admin/src/features/seo-settings-form/ui/seo-settings-form.test.tsx` — new cases (create
  if the form has no existing test file yet — check before assuming)

## Dependencies & Sequencing

- **Internal:** TASK-268-A → TASK-268-B (component needs the resolver's constants/shape settled) →
  {TASK-268-C, D, E, F} in any order (all four wiring tasks are independent of each other; the plan
  lists them C→D→E→F only because that mirrors the file-touch order in the grounding brief, not a
  real dependency). All four depend on A and B.
- **External / shared-worktree:** Per the cross-task note (both TASK-268 and TASK-269 land in the
  same worktree, branch `feature/268-269-seo-ux`, 268 first): TASK-268 touches
  `seo-settings-form.tsx` and `dictionary.ts`; TASK-269 (`docs/plans/131-seo-health.md`) also touches
  `dictionary.ts` and adds a new section to `seo-settings-view.tsx` (the _parent_ of
  `seo-settings-form.tsx`, not the same file). No direct file collision between the two plans'
  `.tsx` edits; `dictionary.ts` is append-only in both (new top-level sections), so sequencing 268
  fully before 269 avoids any merge friction inside the same branch. TASK-269 does **not** depend on
  268 functionally — the ordering is purely a worktree-sequencing convenience, not a code
  dependency; either could ship first without the other in principle.
- No shared files with TASK-264 (content-map — different widget entirely) or any other open
  Хвиля-3/4/5 task. Fully parallel-safe with everything outside this worktree's own two-task
  sequence.
- Feeds nothing forward directly.

## Risks & Mitigations

| Risk                                                                                                                                                                                        | Mitigation                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mirrored `resolve-seo-preview.ts` logic silently drifts from `resolveSeo.ts` after a future storefront change (e.g. `SEO_DESCRIPTION_MAX` tuned to 160)                                 | Both constants are annotated with an explicit cross-reference comment pointing at the sibling file; unit tests in Task A pin the exact values (155/60) so a mismatched manual edit fails CI immediately, not silently                                                                                                                                                   |
| Four extra `useSeoSettingsControllerGetSettings()` call sites (product/category/page forms) look like "N more network requests" at a glance                                                 | All four share one TanStack Query cache entry (identical zero-arg query key, 5-minute app-wide `staleTime`) — Design Decision 3 documents the actual request count is 0–1 per session, not 4                                                                                                                                                                            |
| Preview mismatch: the owner sees one thing in the admin preview and something subtly different on the real storefront (e.g. a future edit to `resolveSeo()`'s tier logic not mirrored here) | Called out explicitly as advisory UX in Scope/Overview — the preview's purpose is directional guidance ("about this long," "this is what auto-fill means"), not a pixel-perfect production oracle; the acceptance criteria pin behavior parity at today's `resolveSeo()` shape via ported unit tests, not a runtime dependency that would auto-heal a future divergence |
| `SeoSettingsForm` currently has no `control` destructured / possibly no existing test file, adding friction to Task F                                                                       | Called out explicitly in Task F's acceptance criteria ("check before assuming") so the implementer doesn't silently skip test coverage if the file doesn't exist yet                                                                                                                                                                                                    |

## Notes

- This plan deliberately does not attempt pixel-perfect Google SERP fidelity (real result rendering
  varies by device, locale, and Google experiment) — "close enough to be recognizable, with correct
  truncation math" is the bar, matching the BACKLOG row's own framing ("live Google-SERP snippet").
- The mirrored-logic approach (Design Decision 1) is a deliberate, documented trade-off given this
  monorepo's current structure (no shared cross-app domain package). If a third consumer of this
  precedence logic ever appears, promoting it to a `packages/seo-shared` workspace becomes the
  obviously-correct move at that point — not before, per YAGNI.
- TASK-269's SEO-health section (`docs/plans/131-seo-health.md`) is a natural complement — this plan
  answers "what will THIS page's snippet look like," TASK-269 answers "how many pages don't have
  one set yet." Neither duplicates the other's remit.
