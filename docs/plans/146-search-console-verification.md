# Plan 146 — Search Console Verification (`googleSiteVerification` / `bingSiteVerification`)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 7 — SEO/GEO (`docs/handoff-seo.md`) — доріжка B, task 2 of 3
> (SEO-3/TASK-279 → **SEO-4/TASK-280** → SEO-10/TASK-285)
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG task:** TASK-280
> **Source:** `docs/handoff-seo.md` §SEO-4 (Блок I — Класичне SEO-ядро)
> **Worktree:** `D:\projects\store-ai-wt-b`, branch `feature/279-seo-branding-verify-slugguard`
> (same branch as TASK-279/plan 145 — sequential tasks in one worktree, per the doріжка B
> convention already established there).

## Overview

`SeoSettings` has no field for search-engine ownership verification, and the storefront root
layout emits no `metadata.verification` at all. Today the only way for the owner to verify site
ownership in Google Search Console (or Bing Webmaster Tools) is the DNS-record method — which
requires domain-registrar access the owner may not be comfortable touching, or a developer's help.
The HTML-meta-tag method is the standard low-friction alternative for an owner-operated admin
panel: paste one code from the console into a form field, done.

This plan adds two nullable text columns to the `SeoSettings` singleton
(`googleSiteVerification`, `bingSiteVerification`), an admin `/settings/seo` sub-section to edit
them (with a soft normalizer so pasting the whole `<meta>` tag from the console's instructions
still works), storefront wiring into `generateMetadata().verification`, and a new admin-guide
section walking the non-technical owner through the exact Search Console click-path plus what to
check in the first month.

This is the **second of three** tasks on doріжка B of Етап 7 (`docs/handoff-seo.md` §SEO-3 →
§SEO-4 → §SEO-10). It follows the same file (`app/layout.tsx`) touched by TASK-279/plan 145 —
see §Dependencies & Sequencing for the exact non-overlapping edit.

## Scope

### In Scope

- Prisma: `SeoSettings.googleSiteVerification` / `SeoSettings.bingSiteVerification` — both
  nullable `String?`, mirroring the existing optional text columns on the same model
  (`defaultOgImage`, `llmsTxtSummary`).
- Backend `seo-settings` module (mirrors TASK-239's shape): DTO fields (`@IsOptional`,
  `@IsString`, `@MaxLength(255)`), a local `@Transform` normalizer (same file-local pattern as
  `CreateContactMessageDto`'s `trim` helper — no shared util module in this codebase), entity
  fields, repository pass-through (`UpsertSeoSettingsInput` — no repository logic change beyond
  the interface), service (`updateSettings` already generic — no change), seed defaults (`null`).
- Admin `/settings/seo`: two new inputs (Google, Bing) in `SeoSettingsForm`, plain-UA hints,
  soft normalization so a pasted full `<meta>` tag is cleaned to just the token value both on
  blur (visible immediately) and on submit (defense-in-depth). Does **not** touch
  `SeoHealthSection` (TASK-269) or `SeoSnippetPreview`/`resolve-seo-preview.ts` (TASK-268) —
  neither reads these two fields, both stay exactly as they are.
- Storefront `app/layout.tsx generateMetadata()`: `metadata.verification.google` /
  `metadata.verification.other['msvalidate.01']`, populated only when the corresponding
  `SeoSettings` field is non-empty; omitted entirely when both are empty (Next does not emit a
  `<meta name="google-site-verification">` tag for an `undefined`/absent key).
- `docs/admin-guide.md`: one new numbered section **appended at the very end** (§23, after
  §22 «Аналітика») — how to verify the site in Google Search Console via the HTML-tag method,
  how to submit `sitemap.xml`, what to check in Search Console during the first month. Optional
  short mention of Bing Webmaster Tools (same field, same click-path, lower priority). The
  existing TOC (`## Зміст`) and the "Частина 2 (розділи 12–22)" range note get the same
  one-line bump TASK-263 already did for §22 (see `git show 5316441` for the exact precedent);
  no other line in the file changes.
- Orval regen (both frontends) after the schema/DTO change — **not committed** (generated
  `shared/api/generated/**` is gitignored per each app's own `.gitignore`, confirmed:
  `git check-ignore` on `seoSettingsEntity.ts` returns a match); the implementing agent runs it
  locally so store-admin/store-client typecheck against the new fields, exactly as TASK-268/269
  documented in their own plans.

### Out of Scope

- DNS TXT-record verification method — HTML-tag method only (simplest for a non-technical owner
  operating purely through the admin panel; DNS requires registrar access this project has no
  UI for). Noted as a future option in the admin-guide section, not implemented.
- Any change to `resolveSeo.ts` / `resolve-seo-preview.ts` — verification codes are not part of
  the title/description/OG-image tiering chain those files own; they are independent metadata
  keys with no precedence logic (a field is either set or it isn't).
- `SeoHealthSection` (TASK-269) does **not** gain a "verification filled" check in this plan —
  it is scoped to content-metaTitle coverage + the noindex kill switch (plan 131 Decision 1);
  adding a third category of check there is a natural follow-up, not required by SEO-4's "M,
  легкий" sizing. Flagged in Notes for a future small plan if the owner wants it.
- IndexNow / other search-engine ping mechanisms — SEO-6 (`docs/handoff-seo.md`), separate task,
  not started.
- TASK-285 (SEO-10, slug-guard + `SlugRedirect`) — third and final task of doріжка B, own plan,
  not touched here (see §Dependencies & Sequencing).
- Google Merchant Center / Google Business Profile setup — SEO-5/SEO-8, unrelated owner
  runbooks, separate tasks.

## User Stories

1. As the store owner, I want to paste one code from Google Search Console into a plain form
   field in the admin panel, so that my site gets verified without me touching DNS records or
   asking a developer for help.
2. As the store owner, I want the admin-guide to walk me through the exact steps in Search
   Console (verify → submit sitemap → what to check weekly), so I know what to do after the
   field is filled in and saved.
3. As the store owner, if I accidentally paste the whole `<meta ...>` tag instead of just the
   code (a common mistake, since that's literally what Google's own instructions show me), I
   want the system to clean it up automatically instead of silently storing a broken value.

## Technical Design

### Data Model

```prisma
model SeoSettings {
  id                     String   @id
  defaultMetaTitle       String?  @map("default_meta_title")
  defaultMetaDescription String?  @map("default_meta_description")
  titleTemplate          String?  @map("title_template")
  defaultOgImage         String?  @map("default_og_image")
  /// Google Search Console ownership-verification token (HTML-tag method): the
  /// `content` attribute value of `<meta name="google-site-verification" content="…">`.
  /// Null → no `verification.google` key is emitted in the root layout's metadata
  /// (Next omits the tag entirely rather than rendering an empty one). See plan 146.
  googleSiteVerification String?  @map("google_site_verification")
  /// Bing Webmaster Tools ownership-verification token (HTML-tag method): the
  /// `content` attribute value of `<meta name="msvalidate.01" content="…">`.
  /// Null → no `verification.other['msvalidate.01']` key is emitted. See plan 146.
  bingSiteVerification   String?  @map("bing_site_verification")
  noindexSite            Boolean  @default(false) @map("noindex_site")
  llmsTxtSummary         String?  @map("llms_txt_summary") @db.Text
  additionalSameAsLinks  String[] @default([]) @map("additional_sameas_links")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  @@map("seo_settings")
}
```

Both columns inserted between `defaultOgImage` and `noindexSite` — grouped with the other
"rendered into `<head>`" fields, ahead of the site-wide visibility toggle. Per the project's
Prisma convention (memory: migrations gitignored, schema.prisma is the source of truth): apply
with `npx prisma db push` (dev DB + `store_test`), no migration SQL to hand-author.

### Design Decision 1 — normalize on the client (form), re-normalize on the server (DTO) — both, not either

The task brief raised a choice: store only the bare token, or accept the whole pasted `<meta>`
tag. Decision: **always store the bare token**; accept either input shape and normalize down to
the token at two independent layers:

1. **Admin form** (`seo-settings-schema.ts`) — normalizes on `onBlur` (so the input visibly
   shows the cleaned value before submit — the owner sees their paste was "understood") and
   again in the DTO mapper (`seoSettingsFormValuesToDto`) as a defense-in-depth pass for any
   value that reached submit without a blur event (e.g. paste-then-immediately-click-save).
2. **Backend DTO** (`UpdateSeoSettingsDto`) — a `@Transform` decorator runs the same extraction
   regardless of which client called the admin endpoint, so a stored value can never be a raw
   HTML tag even if some future client (script, Postman, a different admin UI) skips the
   frontend's normalization.

Both layers share the **same regex logic**, hand-duplicated (not import-shared — store-api and
store-admin are separate TypeScript projects with no shared-logic package for this; the same
duplication choice was already made for `resolve-seo-preview.ts` in TASK-268, documented there
as "store-admin can't import store-client"). The regex is intentionally generic (matches any
`content="…"` / `content='…'` attribute inside the pasted string), so the same function
normalizes both the Google tag (`name="google-site-verification"`) and the Bing tag
(`name="msvalidate.01"`) without needing to know which field it's normalizing:

```ts
/**
 * Accepts either a bare verification token or a full `<meta ...>` tag copy-pasted
 * from a search console's "HTML tag" instructions, and returns just the token (the
 * `content` attribute value). Falls back to a plain trim when no `content=` attribute
 * is found, so a bare token — the expected common case — passes through unchanged.
 */
function normalizeSiteVerificationValue(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/content=["']([^"']+)["']/i);
  return match ? match[1] : trimmed;
}
```

Backend wraps it as a `class-transformer` `@Transform`, local to `update-seo-settings.dto.ts`
(same file-local-helper convention as `CreateContactMessageDto`'s `trim`):

```ts
const normalizeVerification = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? normalizeSiteVerificationValue(value) : value;
```

An empty string after trimming still normalizes to `''`, which the mapper's existing `clean()`
helper (`v?.trim() ? trimmed : undefined`) already turns into `undefined` before it reaches the
DTO — consistent with how `defaultMetaTitle`/`defaultOgImage` already handle blanking.

### Design Decision 2 — `bingSiteVerification` maps to `metadata.verification.other['msvalidate.01']`, not a first-class `Metadata.verification` key

Next's `Verification` type (`node_modules/next/dist/lib/metadata/types/metadata-types.d.ts`)
has first-class `google` / `yahoo` / `yandex` / `me` keys plus a catch-all `other: Record<string,
string | string[]>`. There is no first-class `bing` key. Bing Webmaster Tools' documented
HTML-tag verification meta name is `msvalidate.01`, so it goes through `other`:

```ts
verification: {
  google: seo?.googleSiteVerification || undefined,
  other: seo?.bingSiteVerification
    ? { 'msvalidate.01': seo.bingSiteVerification }
    : undefined,
},
```

Both sub-keys independently omitted when empty (not stored as empty strings — an empty-string
`content=""` meta tag is still visible in page source and looks broken/unverified to Google's
crawler, worse than no tag at all).

### Frontend (Next.js — FSD)

#### store-admin

- `entities/seo-settings` — re-exports the regenerated `SeoSettingsEntity`/
  `UpdateSeoSettingsDto` types (Orval output — no manual edit, the barrel already re-exports the
  whole generated model, so no line changes needed there beyond the regen itself).
- `features/seo-settings-form/model/seo-settings-schema.ts` — two new zod fields (same
  blank-to-clear pattern as `defaultMetaTitle`: `z.string().trim().max(255, …).optional().or(z
.literal(""))`), `normalizeSiteVerificationValue` exported + used in the DTO mapper,
  `mapSettingsToFormValues` seeds both from `settings.googleSiteVerification ?? ""` /
  `settings.bingSiteVerification ?? ""`.
- `features/seo-settings-form/ui/seo-settings-form.tsx` — one new field group ("Верифікація
  власності сайта") with two `Input`s (Google, Bing), each with an `onBlur` handler that reads
  the current value, runs it through `normalizeSiteVerificationValue`, and calls
  `setValue(field, normalized, { shouldValidate: true })` if it changed — the visible-cleanup
  half of Design Decision 1. Placed after the "Default OG image" field group, before "llms.txt
  summary" (keeps the OG-image/verification "raw meta tag" fields adjacent).
- `shared/config/dictionary.ts` — new `seoSettingsForm.googleSiteVerification*` /
  `bingSiteVerification*` label/placeholder/hint strings (see exact copy below).

#### store-client

- `app/layout.tsx` — **append only**: the `verification` key inside the object returned by
  `generateMetadata()` (Design Decision 2). No other line touched — TASK-279/plan 145 already
  owns `openGraph.images` and `title` in the same function; this plan adds a sibling top-level
  key to the same returned `Metadata` object, not a restructure.
- `app/layout.test.ts` — extends the existing `describe("root layout generateMetadata …")`
  block (TASK-279's file) with new cases for the verification key — same mock/fixture
  scaffolding already in the file (`makeSettings()` helper gains
  `googleSiteVerification`/`bingSiteVerification` to its default-null shape).
- No `shared/lib/seo/resolveSeo.ts` change (Design Decision 2 / Out of Scope).

### API Contract

No new endpoints — `UpdateSeoSettingsDto` (`PUT /api/admin/seo-settings`) and
`SeoSettingsEntity` (`GET /api/seo-settings`, `GET /api/admin/seo-settings` response) both gain
two optional/nullable string fields. Swagger examples:

| Field                    | Example                                  |
| ------------------------ | ---------------------------------------- |
| `googleSiteVerification` | `"AbCdEfGhIjKlMnOpQrStUvWxYz1234567890"` |
| `bingSiteVerification`   | `"1234ABCD5678EFGH9012IJKL3456MNOP"`     |

## Tasks

### TASK-280-A: Prisma schema + backend `seo-settings` module

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No — plain nullable string pass-through fields, no business-rule branching;
covered by the unit-test additions below (not full Red→Green→Refactor).
**Depends on:** —

**Acceptance Criteria:**

- [ ] `SeoSettings.googleSiteVerification` / `SeoSettings.bingSiteVerification` added to
      `schema.prisma` (nullable `String?`, `@map` snake_case, doc comments per Data Model
      above), applied via `npx prisma db push` to both the dev DB and `store_test`, followed by
      `npx prisma generate`.
- [ ] `UpdateSeoSettingsDto`: two new optional fields, `@IsOptional() @IsString()
    @MaxLength(255)`, each with the shared local `normalizeVerification` `@Transform` (Design
      Decision 1), `@ApiPropertyOptional` with the examples from §API Contract.
- [ ] `SeoSettingsEntity`: two new `string | null` fields (`@ApiProperty({ nullable: true,
    required: false })`, mirroring `defaultOgImage`), mapped in both `fromPrisma()` and
      `empty()`.
- [ ] `UpsertSeoSettingsInput` (repository): two new optional fields — no other repository code
      change (the existing `upsert({ ...data })` pass-through already forwards any key present
      on the input object).
- [ ] `seed.ts` `seedSeoSettings()`: both new fields seeded as `null` (zero-config default,
      matching `defaultOgImage`/`llmsTxtSummary`), doc comment updated to list them.
- [ ] `seo-settings.repository.spec.ts` / `seo-settings.service.spec.ts`: `mockRow` fixtures
      extended with `googleSiteVerification: null, bingSiteVerification: null` (required for
      the fixture to satisfy the Prisma-generated type — TS will fail to compile otherwise,
      which is the intended forcing function).
- [ ] New unit tests: DTO normalizer (`update-seo-settings.dto.ts` or a co-located
      `.spec.ts`) — bare token passes through unchanged; a full `<meta name="google-site-
    verification" content="XYZ">` tag normalizes to `"XYZ"`; single- and double-quoted
      `content=` both handled; whitespace trimmed either way. `SeoSettingsEntity.fromPrisma`/
      `.empty()` — both new fields map through / default to `null`. `SeoSettingsService
    .updateSettings` — payload containing the two new fields passes through to
      `repository.upsertSettings` unchanged (repository already generically tested for
      arbitrary-field pass-through in TASK-239's spec).
- [ ] Tests pass: `npm run test -w apps/store-api` (seo-settings suite green, no regressions
      elsewhere).
- [ ] `npm run typecheck -w apps/store-api` / `npm run lint -w apps/store-api` clean.

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — `SeoSettings` model, two new columns
- `apps/store-api/prisma/seed.ts` — `seedSeoSettings()` defaults + doc comment
- `apps/store-api/src/seo-settings/dto/update-seo-settings.dto.ts` — two fields + normalizer
- `apps/store-api/src/seo-settings/entities/seo-settings.entity.ts` — two fields,
  `fromPrisma`/`empty`
- `apps/store-api/src/seo-settings/seo-settings.repository.ts` — `UpsertSeoSettingsInput`
  interface
- `apps/store-api/src/seo-settings/seo-settings.repository.spec.ts` — `mockRow` fixture
- `apps/store-api/src/seo-settings/seo-settings.service.spec.ts` — `mockRow` fixture (+ new
  pass-through assertion)
- `apps/store-api/src/seo-settings/dto/update-seo-settings.dto.spec.ts` — new, normalizer tests
  (new file — no existing DTO-level spec in this module; mirrors how other DTO transform helpers
  in the codebase get a small dedicated spec, e.g. `newsletter/dto`)

---

### TASK-280-B: Admin `/settings/seo` verification fields

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — form wiring over an already-tested schema helper; covered by the
component/schema unit tests below.
**Depends on:** TASK-280-A (needs the regenerated `SeoSettingsEntity`/`UpdateSeoSettingsDto`
Orval types to compile against).

**Acceptance Criteria:**

- [ ] `npm run generate:api -w apps/store-admin` run locally (after TASK-280-A's swagger export)
      so `SeoSettingsEntity`/`UpdateSeoSettingsDto` generated types include both new fields;
      regenerated files **not committed** (gitignored, confirmed via `git check-ignore`).
- [ ] `seo-settings-schema.ts`: two new zod fields (blank-to-clear pattern, `max(255)`),
      `normalizeSiteVerificationValue` exported (Design Decision 1, shared regex — hand-mirrors
      the backend's, documented as intentional duplication in a code comment), used in
      `seoSettingsFormValuesToDto`'s cleaning step; `mapSettingsToFormValues` seeds both fields
      from the entity (`?? ""`).
- [ ] `seo-settings-form.tsx`: new field group after "Default OG image" — two `Input`s (Google,
      Bing), each wired with `register(...)` **and** an `onBlur` that normalizes-and-`setValue`s
      the visible field (Design Decision 1's client-visible half); existing `errors.*` alert
      pattern reused for both.
- [ ] `dictionary.ts` (`seoSettingsForm`): new keys —
      `googleSiteVerification`, `googleSiteVerificationPlaceholder`,
      `googleSiteVerificationHint` (copy: заголовок «Код підтвердження Google Search Console»;
      підказка на кшталт «Вставте код підтвердження з Google Search Console — досить самого
      коду (значення content), але якщо вставите весь HTML-тег цілком, ми самі виріжемо з
      нього потрібну частину.»), `bingSiteVerification`, `bingSiteVerificationPlaceholder`,
      `bingSiteVerificationHint` (підказка: «Необов'язково. Те саме для Bing Webmaster Tools —
      альтернативної до Google пошукової системи. Можна залишити порожнім.»), and a
      `metaTitleTooLong`-style `errors.siteVerificationTooLong` reused by both fields' zod
      `.max()` message.
- [ ] `SeoHealthSection` and `SeoSnippetPreview` — verified unchanged (neither imports or reads
      the two new fields; no code edit needed, confirmed by reading both files before and after
      this task).
- [ ] `seo-settings-schema.test.ts`: new `describe("normalizeSiteVerificationValue")` block —
      bare token unchanged; full `<meta name="google-site-verification" content="XYZ">` tag →
      `"XYZ"`; full Bing `<meta name="msvalidate.01" content="ABC">` tag → `"ABC"` (proves the
      normalizer is name-agnostic); whitespace-only input → `""`.
- [ ] `seo-settings-form.test.tsx`: new cases — typing a bare token into the Google field and
      submitting sends it verbatim; pasting a full `<meta>` tag then blurring the field updates
      the visible input value to the extracted token; submitting with both fields blank omits
      them from the update payload (existing blank-to-clear pattern, same as
      `defaultMetaTitle`).
- [ ] Tests pass: `npm run test -w apps/store-admin` (seo-settings-form + seo-settings-schema +
      seo-settings-view suites green, no regressions).
- [ ] `npm run typecheck -w apps/store-admin` / `npm run lint -w apps/store-admin` clean; manual
      check: `/settings/seo` renders the two new fields, save round-trips through a real
      `PUT /api/admin/seo-settings` against a locally running store-api.

**Files to create/modify:**

- `apps/store-admin/src/features/seo-settings-form/model/seo-settings-schema.ts` — two zod
  fields, `normalizeSiteVerificationValue`, mapper updates
- `apps/store-admin/src/features/seo-settings-form/model/seo-settings-schema.test.ts` — new
  `describe` block
- `apps/store-admin/src/features/seo-settings-form/ui/seo-settings-form.tsx` — new field group
  - `onBlur` normalization
- `apps/store-admin/src/features/seo-settings-form/ui/seo-settings-form.test.tsx` — new cases
- `apps/store-admin/src/shared/config/dictionary.ts` — new `seoSettingsForm.*` keys

---

### TASK-280-C: Storefront `metadata.verification` wiring

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No — pure conditional object construction over an already-fetched entity;
covered by the unit tests below.
**Depends on:** TASK-280-A (needs `SeoSettingsEntity`'s two new fields on the wire; also depends
on TASK-279/plan 145's `generateMetadata()` — this task appends to that same function, so it
must land after plan 145 merges to avoid a diff conflict on the same file/function, per
§Dependencies & Sequencing below).

**Acceptance Criteria:**

- [ ] `npm run generate:api -w apps/store-client` run locally so `SeoSettingsEntity` includes
      both new fields (not committed, gitignored, same as store-admin).
- [ ] `app/layout.tsx generateMetadata()`: returned `Metadata` object gains a `verification` key
      (Design Decision 2) — `google` set only when `seo?.googleSiteVerification` is a non-empty
      string, `other['msvalidate.01']` set only when `seo?.bingSiteVerification` is non-empty;
      the whole `verification` object omitted (not `{}`) when both are empty/null/the
      `fetchSeoSettings()` call returned `null`.
- [ ] No other line of `generateMetadata()` touched (the `title`/`openGraph.images` logic from
      plan 145 is untouched — confirmed by a minimal diff).
- [ ] `app/layout.test.ts`: `makeSettings()` helper's default object gains
      `googleSiteVerification: null, bingSiteVerification: null`; new cases in the existing
      `describe("root layout generateMetadata (TASK-279)", …)` block (extended, not a new
      top-level describe, since it's the same function under test) —
  - [ ] both fields null/settings unavailable → `meta.verification` is `undefined`;
  - [ ] `googleSiteVerification` set, `bingSiteVerification` null → `meta.verification` equals
        `{ google: "<value>", other: undefined }` or the key is simply absent from `other`
        (assert via `meta.verification?.google` and `meta.verification?.other` separately, not
        a brittle full-object `toEqual`, so the test doesn't couple to `title`/`openGraph`
        assertions covered by other cases);
  - [ ] `bingSiteVerification` set, `googleSiteVerification` null → `meta.verification?.other`
        equals `{ 'msvalidate.01': "<value>" }`, `meta.verification?.google` is `undefined`;
  - [ ] both set → both keys present simultaneously.
- [ ] Manual check: `curl -s http://localhost:3000/ | grep -i 'site-verification\|msvalidate'`
      shows the expected `<meta>` tag(s) once `/settings/seo` has values saved (and shows
      neither tag when both fields are blank).
- [ ] Tests pass: `npm run test -w apps/store-client` (`layout.test.ts` green, no regressions
      elsewhere).
- [ ] `npm run typecheck -w apps/store-client` / `npm run lint -w apps/store-client` /
      `npm run build -w apps/store-client` clean.

**Files to create/modify:**

- `apps/store-client/src/app/layout.tsx` — `verification` key in `generateMetadata()`
- `apps/store-client/src/app/layout.test.ts` — `makeSettings()` fixture + new cases

---

### TASK-280-D: Admin-guide — Search Console verification & sitemap submission

**Type:** docs
**Scope:** shared (`docs/`)
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-280-B (the admin-guide walkthrough screenshots/field names must match the
shipped form copy).

**Acceptance Criteria:**

- [ ] New `## 23. Підтвердження сайту в Google (Search Console)` section **appended at the end**
      of `docs/admin-guide.md`, after the existing §22 «Аналітика» closing note (matching the
      established low-conflict append pattern used for §22 itself — see `git show 5316441` for
      precedent: numbered heading + `<a id="23-…">` anchor + TOC line + one-line bump of the
      "Частина 2 (розділи 12–…)" range in the intro; no other existing line touched).
      Sub-sections, plain UA, non-technical framing (mirrors §18 SEO-налаштування's tone):
  - [ ] **Навіщо це потрібно** — коротко: без підтвердження власник не бачить у Google, як сайт
        індексується, скільки людей приходить із пошуку, чи є помилки сканування.
  - [ ] **Крок 1 — реєстрація в Search Console** — `search.google.com/search-console` → «Додати
        ресурс» → тип **«Префікс URL-адреси»** (не «Домен» — той вимагає DNS) → ввести адресу
        магазину.
  - [ ] **Крок 2 — спосіб підтвердження «HTML-тег»** — Google покаже рядок на кшталт
        `<meta name="google-site-verification" content="…" />`; власнику треба скопіювати
        **весь цей рядок або лише значення `content`** — обидва варіанти працюють (посилання на
        поле «Код підтвердження Google Search Console» на `/settings/seo`, розділ [18](#18-seo))
        → зберегти форму → повернутись у Search Console і натиснути «Підтвердити».
  - [ ] **Крок 3 — надіслати sitemap.xml** — у Search Console: **Індексування → Файли Sitemap**
        → ввести `sitemap.xml` → «Надіслати» (посилання на живий `/sitemap.xml` вже є на
        `/settings/seo` в розділі «SEO-здоров'я», [18](#18-seo)).
  - [ ] **Що перевіряти перші 4 тижні** — Індексування сторінок (Покриття): чи ростуть
        «Проіндексовані» сторінки, чи є помилки; Ефективність: перші покази/кліки з'являються
        не миттєво (Google потрібен час); не панікувати через 0 у перший тиждень.
  - [ ] **Bing (опційно)** — коротко: той самий крок 2 повторюється на
        `www.bing.com/webmasters`, той самий метатег-метод, поле «Код підтвердження Bing
        Webmaster Tools» на тій самій формі; нижчий пріоритет, ніж Google, робити коли буде час.
  - [ ] Technical-detail footer line (matches §18's `> Технічні деталі: …` convention):
        `> Технічні деталі: TASK-280 (верифікація пошукових консолей), plan 146.`
- [ ] `## Зміст` gains `23. [Підтвердження сайту в Google (Search Console)](#23-search-console)`
      after the existing `22. [Аналітика](#22-analityka)` line.
- [ ] Intro block's "Частина 2 (розділи 12–22, нижче)" → "Частина 2 (розділи 12–23, нижче)"
      (one-word-boundary edit, same line TASK-263 already bumped once).
- [ ] §18 (SEO-налаштування) — cross-reference added: the "Поля — по одному" table gains two new
      rows (Google/Bing verification) OR a short pointer sentence to §23 is added right after
      the existing table (implementer's choice, whichever reads more naturally once the actual
      field copy from TASK-280-B is final) — **either way §18's existing rows/copy are not
      rewritten**, only appended to, keeping the diff additive.
- [ ] Proofread pass: no UA typos, consistent with the rest of the guide's tone (short
      sentences, bold for UI labels, no jargon without an inline explanation).

**Files to create/modify:**

- `docs/admin-guide.md` — new §23 (append), TOC line, intro range bump, §18 cross-reference

---

## Dependencies & Sequencing

- **Internal:** TASK-280-A → (TASK-280-B ∥ TASK-280-C, both need A's Orval-regenerated types but
  are otherwise independent — different apps, different files) → TASK-280-D (needs B's final
  field copy for the walkthrough to match the real UI).
- **External / доріжка B Етапу 7:** This is the second of three sequential tasks on doріжка B
  (`SEO-3/TASK-279 → SEO-4/TASK-280 → SEO-10/TASK-285`), all in the **same worktree/branch**
  (`feature/279-seo-branding-verify-slugguard`). It must land **after** TASK-279/plan 145 is
  implemented and committed in this worktree (already true per the task brief — "TASK-279 там
  уже закомічена"), because TASK-280-C edits the exact same function
  (`app/layout.tsx generateMetadata()`) that plan 145 just finished modifying — sequencing them
  in the same branch avoids a merge conflict entirely (there is nothing to merge; it's one
  linear history). The third task, **TASK-285** (SEO-10, slug-guard + `SlugRedirect`), is
  **not** included in this plan — separate `/planer` run, own plan file (147). TASK-285 does not
  depend on anything shipped here.
- **File overlap check against TASK-279/plan 145:** `app/layout.tsx` — plan 145 owns
  `title`/`openGraph.images`; this plan appends a sibling `verification` key to the same return
  object, no line from 145 is modified. `dictionary.ts` — plan 145 touched `meta.rootTitle`
  only; this plan touches `seoSettingsForm.*` only (different top-level key) — no overlap.
  `schema.prisma` — plan 145 made no schema change; this is the first schema touch on this
  worktree/branch since 279 started.
- Not blocked by and does not block TASK-268 (SERP preview) or TASK-269 (SEO health) — both
  ✅ already, different files, confirmed unread/unmodified by this plan (§Scope, In Scope).

## Risks & Mitigations

| Risk                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner pastes the verification code into the wrong field (Google code in the Bing field or vice versa) — both are opaque alphanumeric strings, easy to mix up                                      | Each field's hint names the specific console ("з Google Search Console" / "для Bing Webmaster Tools") right in the label text, not just a shared generic hint; low-severity failure mode anyway (verification simply won't succeed, no data corruption, easy to fix by re-pasting into the correct field) |
| The client-side and server-side `normalizeSiteVerificationValue` regexes drift apart over time (hand-duplicated per Design Decision 1) if only one is edited later                                | Both copies carry an identical doc-comment cross-referencing this plan and the other copy's file path, following the same pattern already established for `resolve-seo-preview.ts` (TASK-268); low risk in practice since the function is tiny and stable (unlikely to need future edits)                 |
| A malformed/malicious string in `content="…"` (e.g. someone pastes an unrelated `<meta>` tag by mistake) gets extracted and stored as if it were a real verification token                        | `@MaxLength(255)` bounds the stored value; the token is only ever rendered as a `<meta content>` attribute value (React/Next auto-escapes JSX attribute output), never as raw HTML or evaluated — no injection surface. Worst case is a harmless, non-functional verification tag, not a security issue   |
| Owner confuses this section with the unrelated DNS-verification method mentioned in generic "how to verify your site" tutorials found via a web search, and gets stuck trying to add a TXT record | admin-guide §23 explicitly says "тип «Префікс URL-адреси» (не «Домен» — той вимагає DNS)" up front, steering the owner away from the DNS path before they can get lost in it                                                                                                                              |

## Notes

- **Sequencing note (for the orchestrator):** this is the second of three doріжка-B tasks in
  worktree `store-ai-wt-b`. First — TASK-279 (SEO-3, brand OG/favicon, plan 145) — already
  committed. Third — **TASK-285** (SEO-10, slug-guard + `SlugRedirect`) — deliberately **not**
  described in this plan; a separate `/planer` run produces plan 147 for it, in the same
  worktree, after this plan's tasks land.
- A future small follow-up (not part of this plan, flagged for later): `SeoHealthSection`
  (TASK-269) could gain a third informational row — "верифікацію пошукових консолей не
  налаштовано" — mirroring the existing "defaults filled" soft nudge. Deliberately deferred:
  SEO-4 is sized "M, легкий" in the source handoff and adding a health-check row is a distinct,
  separately-testable UI change to a component this plan otherwise leaves untouched.
- Bing Webmaster Tools' meta-tag verification is intentionally the _lower-priority, optional_
  half of this task per the source handoff ("+опційно `bingSiteVerification`") — both fields
  ship in the same plan/PR because the marginal backend/DTO cost of a second nullable string
  column is negligible once the first is built, not because Bing is considered equally
  important to the owner's launch checklist.
