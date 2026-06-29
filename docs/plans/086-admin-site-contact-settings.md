# Plan 086 — Admin-Managed Site Contact Settings

**Feature:** TASK-154
**Phase:** Phase 4 extension (Admin Panel) + Phase 5 surface (Storefront)
**Branch:** `feature/154-admin-site-contact-settings`
**Plan file:** `docs/plans/086-admin-site-contact-settings.md`
**Created:** 2026-06-29
**Status:** To Do
**Cross-references:** TASK-089 (contact & social bar — shares this data source); TASK-153 / Plan 085 (same layered-module + FSD pattern)

---

## User Story

As a site admin, I want to manage the store's contact information (support email, phone number,
working hours, and social links) through the admin panel, so that the storefront footer always
displays up-to-date contact details without requiring code changes or re-deployments.

---

## Decision 1 — Singleton Settings Pattern

### Problem

Contact information is a small, fixed set of typed fields — not a list of records. We need exactly
**one** row that the admin updates in place.

### Candidates evaluated

| Approach                      | Description                                                                                                         | Verdict              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Singleton row (fixed ID)**  | One `SiteContactSettings` row with a well-known constant ID. `GET` reads it (`findUnique`); admin `PUT` upserts it. | **Selected**         |
| Generic key-value table (EAV) | `{ key: string, value: string }` rows — one per field.                                                              | Rejected — see below |
| JSON column on a config table | Single row with all settings in a `Json` column.                                                                    | Rejected — see below |

### Why singleton row beats key-value (EAV)

1. **Type safety** — email is validated as `@IsEmail()`, URL fields as `@IsUrl()`, not as bare
   strings. A key-value table has no field-level validation in the NestJS layer.
2. **Orval generates a concrete typed hook** — `useSiteContactControllerGet` returns a
   `SiteContactSettingsEntity` with named, typed fields. A key-value response would require a
   custom schema wrapper.
3. **Explicit schema** — all supported fields are visible at a glance in the Prisma model and DTO.
   No runtime key discovery or documentation sprawl.
4. **Simpler queries** — one `prisma.siteContactSettings.findUnique({ where: { id: SINGLETON_ID } })`
   vs multiple EAV `findMany` calls.
5. **Trivial reset to defaults** — one `upsert` call to set all fields; EAV requires deleting and
   recreating rows.

### Why singleton row beats JSON column

1. **No custom JSON schema validation** at the NestJS layer — class-validator decorators work
   directly on DTO fields.
2. **Orval generates named-field types**, not `Record<string, unknown>`.
3. **Partial updates are trivial** — Prisma spreads only provided DTO fields; a JSON column
   requires a manual deep merge.

### Implementation: well-known fixed ID

A constant `SINGLETON_ID = '00000000-0000-0000-0000-000000000001'` lives in
`site-contact.repository.ts`. All reads use `prisma.siteContactSettings.findUnique({ where: { id: SINGLETON_ID } })`.
All writes use `prisma.siteContactSettings.upsert({ where: { id: SINGLETON_ID }, ... })`. The seed
creates/upserts this row so it always exists on a fresh database. The public `GET` endpoint never
returns 404 — it returns an entity with all null optional fields if the row is somehow absent.

---

## Decision 2 — Include Social Links Now (for TASK-089)

TASK-089 (contact & social bar — phone, hours, Viber/Telegram/Instagram) is parked behind the UI
rewrite but **explicitly pairs with TASK-154** (BACKLOG line note). Adding `viberLink`,
`telegramLink`, and `instagramLink` nullable columns to the model now means TASK-089 can consume
the same `GET /api/site-contact` endpoint without requiring a new DB migration when it becomes
active. The cost is three extra nullable `VARCHAR` columns that default to `null`; the benefit is
preventing a schema migration and Orval regen cycle just to add URL fields.

---

## Decision 3 — Storefront Fetch Strategy: Async Server Component + ISR

Contact information changes rarely (at most a few times per year). The storefront footer is
currently a **pure Server Component** — it imports no hooks and has no `"use client"` boundary.

Recommended approach:

- Convert `Footer` to an `async` Server Component.
- Call the Orval-generated `siteContactControllerGet()` base function (not the React hook)
  server-side inside the component body.
- Configure the underlying `fetch` with `{ next: { revalidate: 3600 } }` — 1-hour ISR cache.
  Next.js serves the cached shell on subsequent requests and revalidates in the background after
  the TTL expires.
- **Graceful fallback**: if the fetch throws or any field is `null`, the component falls back to
  the hardcoded `dict.footer.contactEmail / contactPhone / contactHours` strings. These dictionary
  values are kept as fallbacks, not removed.

Alternative (fetch in root layout, pass props) was rejected because App Router Server Components
cannot pass arbitrary server-fetched data from layout to child components without a `"use client"`
context provider — which would unnecessarily bundle the footer and pollute the client component
tree.

---

## Prisma Model

Add to `apps/store-api/prisma/schema.prisma`:

```prisma
/// Singleton row storing admin-managed contact information displayed in the
/// storefront footer and contacts page. There is EXACTLY ONE row, always
/// identified by SINGLETON_ID = '00000000-0000-0000-0000-000000000001'.
/// The id is a plain String (not @default(uuid())) — the value is always the
/// well-known constant set by the repository and seed. No isActive / deletedAt:
/// the singleton is always active and is never deleted.
model SiteContactSettings {
  id            String   @id
  email         String?
  phone         String?
  workingHours  String?  @map("working_hours")
  viberLink     String?  @map("viber_link")
  telegramLink  String?  @map("telegram_link")
  instagramLink String?  @map("instagram_link")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt      @map("updated_at")

  @@map("site_contact_settings")
}
```

**No `isActive`** — the singleton cannot be hidden; it is always surfaced.
**No `deletedAt`** — singleton settings are never deleted; this is not user-generated data (the
prisma-migration skill tombstone convention applies to User/Product/Order only).
**No `@@index`** — single-row table; indices add no value over the `@id` primary key lookup.

Migration command:

```bash
npx prisma migrate dev --name add_site_contact_settings -w apps/store-api
```

---

## Backend Module Layout

Mirrors `apps/store-api/src/category/` exactly: separate public controller and admin controller,
service and repository in the same module, DTOs and entities in sub-directories.

```
apps/store-api/src/site-contact/
  site-contact.module.ts
  site-contact.controller.ts             — Public: GET /api/site-contact
  admin-site-contact.controller.ts       — Admin: PUT /api/admin/site-contact
  site-contact.service.ts
  site-contact.repository.ts
  site-contact.service.spec.ts
  site-contact.repository.spec.ts
  dto/
    update-site-contact.dto.ts
    index.ts
  entities/
    site-contact-settings.entity.ts
    index.ts
  index.ts
```

### Public endpoint

| Method | Path                | Description                                                                                                                                                            |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/site-contact` | Returns the contact block. Always returns `{ data: SiteContactSettingsEntity }` — all optional fields are `null` if the row has not been seeded yet. No auth required. |

### Admin endpoint (`@UseGuards(AdminGuard)` at controller level)

| Method | Path                      | Description                                                                                                                                                                                                                  |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT`  | `/api/admin/site-contact` | Upserts the singleton row with the provided fields. All fields are optional — send only the fields you want to change. Returns `{ data: SiteContactSettingsEntity }`. Requires admin JWT (`@ApiBearerAuth('access-token')`). |

Response envelopes are **decorated classes** (not bare interfaces) so Orval generates typed hooks:

```ts
class SiteContactResponseEnvelope {
  @ApiProperty({ type: SiteContactSettingsEntity })
  data!: SiteContactSettingsEntity;
}
```

Mirrors `CategoryResponseEnvelope` in `apps/store-api/src/category/admin-category.controller.ts`.

---

## Admin FSD Layout

```
store-admin/src/
  entities/site-contact/
    index.ts                                   — barrel: SiteContactSettingsEntity type + useSiteContactControllerGet hook
  features/site-contact-form/
    model/site-contact-schema.ts               — zod schema + RHF types + form→DTO mapper
    ui/site-contact-form.tsx                   — RHF form for all contact fields
    index.ts
  widgets/site-contact-settings-view/
    ui/site-contact-settings-view.tsx          — fetches settings, renders form
    ui/site-contact-settings-view.test.tsx     — RTL test
    index.ts
  app/(dashboard)/settings/contact/
    page.tsx                                   — route: /settings/contact
    loading.tsx                                — AdminFormSkeleton fallback
```

Nav entry added to `bottomNavItems` in `admin-sidebar.tsx`:

```ts
{ label: dict.nav.siteContact, href: '/settings/contact', icon: Phone }
```

`Phone` is already available from `lucide-react` (imported by the sidebar file). `dict.nav.siteContact`
value: `"Контакти"`.

---

## Task Breakdown

### TASK-154-A: Prisma `SiteContactSettings` model + migration

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `SiteContactSettings` model added to `apps/store-api/prisma/schema.prisma` per the spec above
- [ ] `npx prisma migrate dev --name add_site_contact_settings -w apps/store-api` generates and
      applies the migration without errors
- [ ] `npx prisma generate -w apps/store-api` succeeds; Prisma Client includes
      `prisma.siteContactSettings`
- [ ] `npm run build -w apps/store-api` compiles without type errors
- [ ] Tests pass: `npm run build -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — add `SiteContactSettings` model
- `apps/store-api/prisma/migrations/<timestamp>_add_site_contact_settings/migration.sql` — auto-generated

---

### TASK-154-B: `SiteContactRepository` (TDD Red → Green)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** TASK-154-A

**Acceptance Criteria:**

- [ ] **Red:** failing unit specs written before implementation covering:
      `findSettings()` returns `null` when `prisma.siteContactSettings.findUnique` mock returns
      `null`; `findSettings()` returns the Prisma row when it exists; `upsertSettings(dto)` calls
      `prisma.siteContactSettings.upsert` with `where: { id: SINGLETON_ID }` and the correct
      `create`/`update` payloads
- [ ] **Green:** repository implemented; all specs pass
- [ ] `SINGLETON_ID = '00000000-0000-0000-0000-000000000001'` exported constant in
      `site-contact.repository.ts`; the same constant is used in the seed (TASK-154-F)
- [ ] `findSettings()` — `prisma.siteContactSettings.findUnique({ where: { id: SINGLETON_ID } })`;
      returns `SiteContactSettings | null`
- [ ] `upsertSettings(dto)` — `prisma.siteContactSettings.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID, ...dto }, update: { ...dto } })`; returns `SiteContactSettings`
- [ ] `PrismaService` is the only Prisma import — `PrismaClient` is never imported directly
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/site-contact/site-contact.repository.ts`
- `apps/store-api/src/site-contact/site-contact.repository.spec.ts`

---

### TASK-154-C: `SiteContactService` (TDD Red → Green)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes
**Depends on:** TASK-154-B

**Acceptance Criteria:**

- [ ] **Red:** failing service specs before implementation covering:
      `getSettings()` returns `SiteContactSettingsEntity.empty()` when repository returns `null`;
      `getSettings()` returns a mapped entity when repository returns a Prisma row;
      `updateSettings(dto)` calls `repository.upsertSettings(dto)` and maps the result to a
      `SiteContactSettingsEntity`
- [ ] **Green:** service implemented; all specs pass
- [ ] `SiteContactService` imports `SiteContactRepository` only — never imports `PrismaService`
      or `PrismaClient`
- [ ] `getSettings()` — calls `this.repository.findSettings()`: - Row present: `return SiteContactSettingsEntity.fromPrisma(row)` - Row absent: `return SiteContactSettingsEntity.empty()` (all nullable fields `null`)
- [ ] `updateSettings(dto)` — calls `this.repository.upsertSettings(dto)`, returns
      `SiteContactSettingsEntity.fromPrisma(row)`; no business-logic guards needed (all fields
      optional, no conflicts possible for a singleton)
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/site-contact/site-contact.service.ts`
- `apps/store-api/src/site-contact/site-contact.service.spec.ts`

---

### TASK-154-D: Controllers + DTO + entity + module registration

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-154-C

**Acceptance Criteria:**

- [ ] `SiteContactSettingsEntity` class with `@ApiProperty` / `@ApiPropertyOptional` decorators on
      all fields; static `fromPrisma(row: SiteContactSettings): SiteContactSettingsEntity` and
      static `empty(): SiteContactSettingsEntity` factory methods — mirrors the `CategoryEntity`
      pattern at `apps/store-api/src/category/entities/category.entity.ts`
- [ ] `UpdateSiteContactDto` — all fields decorated with `@ApiPropertyOptional()`:
  - `email?: string` — `@IsEmail() @IsOptional()`
  - `phone?: string` — `@IsString() @IsOptional()`
  - `workingHours?: string` — `@IsString() @IsOptional()`
  - `viberLink?: string` — `@IsUrl({ protocols: ['http', 'https'] }) @IsOptional()`
  - `telegramLink?: string` — `@IsUrl({ protocols: ['http', 'https'] }) @IsOptional()`
  - `instagramLink?: string` — `@IsUrl({ protocols: ['http', 'https'] }) @IsOptional()`
- [ ] `SiteContactResponseEnvelope` decorated class: `@ApiProperty({ type: SiteContactSettingsEntity }) data!: SiteContactSettingsEntity` — Orval generates a typed hook from this decorated class, not a bare interface
- [ ] `SiteContactController` at `@Controller('site-contact')`:
  - `@Get()` handler, no auth guard, calls `service.getSettings()`, returns `{ data: entity }`
  - `@ApiTags('SiteContact')`, `@ApiOperation`, `@ApiResponse({ status: 200, type: SiteContactResponseEnvelope })`
- [ ] `AdminSiteContactController` at `@Controller('admin/site-contact')`:
  - `@UseGuards(AdminGuard)` at **controller** level (same pattern as `AdminCategoryController`)
  - `@Put()` handler, `@ApiBearerAuth('access-token')` on the method, `@Body() dto: UpdateSiteContactDto`, calls `service.updateSettings(dto)`, returns `{ data: entity }`
  - `@ApiResponse({ status: 200, type: SiteContactResponseEnvelope })`, `@ApiResponse({ status: 401, ... })`, `@ApiResponse({ status: 403, ... })`
- [ ] `SiteContactModule` declared: `controllers: [SiteContactController, AdminSiteContactController]`, `providers: [SiteContactService, SiteContactRepository]`
- [ ] `SiteContactModule` imported in `apps/store-api/src/app.module.ts` with comment `// Admin-managed site contact settings (TASK-154)`
- [ ] `npm run build -w apps/store-api` clean
- [ ] `npm run lint -w apps/store-api` clean
- [ ] Tests pass: `npm run test -w apps/store-api`

**Files to create/modify:**

- `apps/store-api/src/site-contact/entities/site-contact-settings.entity.ts`
- `apps/store-api/src/site-contact/entities/index.ts`
- `apps/store-api/src/site-contact/dto/update-site-contact.dto.ts`
- `apps/store-api/src/site-contact/dto/index.ts`
- `apps/store-api/src/site-contact/site-contact.controller.ts`
- `apps/store-api/src/site-contact/admin-site-contact.controller.ts`
- `apps/store-api/src/site-contact/site-contact.module.ts`
- `apps/store-api/src/site-contact/index.ts`
- `apps/store-api/src/app.module.ts` — add `SiteContactModule` to `imports`

---

### TASK-154-E: Orval regeneration (store-admin + store-client)

**Type:** chore
**Scope:** store-admin, store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-154-D

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` produces an updated OpenAPI JSON
- [ ] `npm run generate:api -w apps/store-admin` regenerates `apps/store-admin/src/shared/api/generated/` without errors
- [ ] `npm run generate:api -w apps/store-client` regenerates `apps/store-client/src/shared/api/generated/` without errors
- [ ] Generated output includes: `SiteContactSettingsEntity` model, `UpdateSiteContactDto`; hooks
      `useSiteContactControllerGet` (read hook for both apps), `useAdminSiteContactControllerUpdate`
      (mutation hook for admin); base function `siteContactControllerGet` (used for server-side
      ISR fetch in the storefront footer)
- [ ] `npm run typecheck -w apps/store-admin` clean after regen
- [ ] `npm run typecheck -w apps/store-client` clean after regen
- [ ] Generated files are NOT hand-edited (pre-commit hook enforces this)
- [ ] Tests pass: `npm run build -w apps/store-admin && npm run build -w apps/store-client`

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (never hand-edited)
- `apps/store-client/src/shared/api/generated/` — regenerated (never hand-edited)
- `apps/store-admin/src/shared/api/index.ts` — add `SiteContactSettingsEntity` and new hooks to barrel export if the existing barrel pattern requires it

---

### TASK-154-F: Seed default contact row

**Type:** chore
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-154-A

> This task is independent of TASK-154-B through TASK-154-E and can run in parallel with them.

**Acceptance Criteria:**

- [ ] `seedSiteContactSettings(prisma: PrismaClient)` function added to
      `apps/store-api/prisma/seed.ts`
- [ ] Uses `prisma.siteContactSettings.upsert({ where: { id: SINGLETON_ID }, ... })` with
      `SINGLETON_ID = '00000000-0000-0000-0000-000000000001'` (same constant as the repository)
- [ ] Seed data provides realistic defaults matching the existing hardcoded footer values:
  - `email: 'support@mobilestore.ua'`
  - `phone: '+380 44 000 0000'`
  - `workingHours: 'Пн–Нд: 9:00 – 20:00'`
  - `viberLink: null`, `telegramLink: null`, `instagramLink: null`
- [ ] Called from `main()` in `seed.ts` after `seedUsers` and before `seedCategories`; the call is
      independent of categories/products
- [ ] Running the seed twice (`npm run db:seed`) is idempotent — the `upsert` never duplicates the row
- [ ] Console output: `console.log('  ✓ SiteContactSettings: singleton row upserted')` (matches seed style)
- [ ] `npm run build -w apps/store-api` clean

**Files to create/modify:**

- `apps/store-api/prisma/seed.ts` — add `seedSiteContactSettings` function and call in `main()`

---

### TASK-154-G: Admin UI — FSD entity + feature + widget + route + nav

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No (RTL test in TASK-154-I)
**Depends on:** TASK-154-E

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/site-contact/index.ts` barrel re-exports `SiteContactSettingsEntity`
      type and the `useSiteContactControllerGet` Orval hook
- [ ] `apps/store-admin/src/features/site-contact-form/model/site-contact-schema.ts`:
  - Zod schema with all six contact fields (all optional strings)
  - `email` validated with `z.string().email()` when non-empty; `z.literal('').or(z.string().email())` pattern for blank-to-clear semantics
  - `viberLink`, `telegramLink`, `instagramLink` validated with `z.string().url()` when non-empty; same blank-to-clear pattern
  - `siteContactFormValuesToDto(values)` mapper that converts blank strings to `undefined` so they are omitted from the API body (not sent as empty strings that would fail `@IsUrl()`)
  - `mapSettingsToFormValues(entity)` mapper that converts `null` fields to `''` so the controlled inputs remain uncontrolled-safe
- [ ] `apps/store-admin/src/features/site-contact-form/ui/site-contact-form.tsx` — RHF form:
  - `useEffect(() => { if (settings) form.reset(mapSettingsToFormValues(settings)); }, [settings?.id ?? 'singleton'])` — per forms.md Rule 2b; dependency is `settings?.id` which is always the same `SINGLETON_ID` constant, ensuring the reset fires once on first data arrival and never on background refetches; an in-progress edit is never clobbered
  - Fields: `email`, `phone`, `workingHours`, `viberLink`, `telegramLink`, `instagramLink` — all optional `<Input>` fields with labels from `dict.siteContactForm`
  - Submit calls `useAdminSiteContactControllerUpdate` mutation with `siteContactFormValuesToDto(values)`
  - On success: `toast.success(dict.siteContact.toastUpdated)` + `queryClient.invalidateQueries({ queryKey: ['site-contact'] })` to refresh the form
  - On error: `toast.error(dict.siteContact.toastUpdateFailed)`
  - Submit button: `dict.siteContactForm.submit` / `dict.common.saving` (disabled while submitting)
- [ ] `apps/store-admin/src/widgets/site-contact-settings-view/ui/site-contact-settings-view.tsx`:
  - Calls `useSiteContactControllerGet()` from the `entities/site-contact` barrel
  - Shows `<AdminFormSkeleton />` while `isLoading`
  - Shows error message if `isError`
  - Renders `<SiteContactForm settings={data.data} />` on success
- [ ] UA dictionary keys added to `apps/store-admin/src/shared/config/dictionary.ts`:
  - `nav.siteContact: "Контакти"` — new key in the existing `nav` object
  - New `siteContact` namespace: `metaTitle: "Контакти — Адмін"`, `heading: "Налаштування контактів"`, `subheading: "Ці дані відображаються у футері та на сторінці контактів."`, `toastUpdated: "Контакти оновлено"`, `toastUpdateFailed: "Не вдалося оновити контакти"`
  - New `siteContactForm` namespace: `email: "Електронна пошта підтримки"`, `emailPlaceholder: "support@example.ua"`, `phone: "Телефон"`, `phonePlaceholder: "+380 44 000 0000"`, `workingHours: "Години роботи"`, `workingHoursPlaceholder: "Пн–Нд: 9:00 – 20:00"`, `viberLink: "Viber"`, `viberLinkPlaceholder: "https://viber.me/…"`, `telegramLink: "Telegram"`, `telegramLinkPlaceholder: "https://t.me/…"`, `instagramLink: "Instagram"`, `instagramLinkPlaceholder: "https://instagram.com/…"`, `submit: "Зберегти контакти"`, `errors.emailInvalid: "Вкажіть коректну електронну пошту"`, `errors.urlInvalid: "Вкажіть коректний URL (https://…)"`
- [ ] Nav entry added to `bottomNavItems` in `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx`:
      `{ label: dict.nav.siteContact, href: '/settings/contact', icon: Phone }` — add `Phone` to the
      existing `lucide-react` import list; insert before the existing `Settings` item
- [ ] Route at `apps/store-admin/src/app/(dashboard)/settings/contact/page.tsx`:
  - `export const metadata: Metadata = { title: dict.siteContact.metaTitle }`
  - Renders `<SiteContactSettingsView />` from the widget barrel
- [ ] `apps/store-admin/src/app/(dashboard)/settings/contact/loading.tsx` — renders `<AdminFormSkeleton />`
- [ ] `npm run build -w apps/store-admin` + `npm run typecheck -w apps/store-admin` clean

**Files to create/modify:**

- `apps/store-admin/src/entities/site-contact/index.ts`
- `apps/store-admin/src/entities/index.ts` — add `site-contact` export
- `apps/store-admin/src/features/site-contact-form/model/site-contact-schema.ts`
- `apps/store-admin/src/features/site-contact-form/ui/site-contact-form.tsx`
- `apps/store-admin/src/features/site-contact-form/index.ts`
- `apps/store-admin/src/features/index.ts` — add `site-contact-form` re-export
- `apps/store-admin/src/widgets/site-contact-settings-view/ui/site-contact-settings-view.tsx`
- `apps/store-admin/src/widgets/site-contact-settings-view/index.ts`
- `apps/store-admin/src/widgets/index.ts` — add `site-contact-settings-view` export
- `apps/store-admin/src/shared/config/dictionary.ts` — add `nav.siteContact`, `siteContact`, `siteContactForm` namespaces
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — add `Phone` to lucide import + new `bottomNavItems` entry
- `apps/store-admin/src/app/(dashboard)/settings/contact/page.tsx`
- `apps/store-admin/src/app/(dashboard)/settings/contact/loading.tsx`

---

### TASK-154-H: Storefront footer integration

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-154-E

**Acceptance Criteria:**

- [ ] `Footer` in `apps/store-client/src/widgets/footer/ui/footer.tsx` converted to an `async`
      Server Component (add `async` keyword; remove `"use client"` if present — it is currently a
      pure server component)
- [ ] Server-side fetch:
  ```ts
  let contactSettings: SiteContactSettingsEntity | null = null;
  try {
    const result = await siteContactControllerGet();
    contactSettings = result.data ?? null;
  } catch {
    // silent — falls back to dict.footer values below
  }
  ```
  The underlying `fetch` inside the Orval-generated function must carry `{ next: { revalidate: 3600 } }`
  for ISR. If the Orval client uses axios (not native `fetch`), wrap in a direct `fetch` call to
  `${process.env.NEXT_PUBLIC_API_URL}/site-contact` with `{ next: { revalidate: 3600 } }` and
  parse the JSON manually; the implementation detail is left to the build agent who can inspect the
  Orval client configuration.
- [ ] Fallback resolution (per field):
  - `const email = contactSettings?.email ?? dict.footer.contactEmail`
  - `const phone = contactSettings?.phone ?? dict.footer.contactPhone`
  - `const hours = contactSettings?.workingHours ?? dict.footer.contactHours`
- [ ] Social links (Viber/Telegram/Instagram): if the respective field is non-null, render as an
      `<a href={link} target="_blank" rel="noopener noreferrer">` text link in the contact column;
      if null, render nothing. Social-icon library installation is optional and deferred to TASK-089
      — text links are sufficient for TASK-154.
- [ ] The hardcoded strings `dict.footer.contactEmail`, `dict.footer.contactPhone`,
      `dict.footer.contactHours` in `apps/store-client/src/shared/config/dictionary.ts` are
      **kept as fallbacks** and are NOT removed
- [ ] `npm run build -w apps/store-client` + `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/widgets/footer/ui/footer.tsx` — convert to async, add server-side fetch + fallback logic + optional social links

---

### TASK-154-I: Tests (repository + service unit + e2e + admin RTL)

**Type:** test
**Scope:** store-api, store-admin
**Complexity:** M (2-4h)
**TDD Required:** Yes (for repository and service specs — written in TASK-154-B/C)
**Depends on:** TASK-154-D, TASK-154-G

**Acceptance Criteria:**

- [ ] `SiteContactRepository` unit specs from TASK-154-B are green:
  - `findSettings()` returns `null` when mock returns `null`
  - `findSettings()` returns the row when mock returns it
  - `upsertSettings(dto)` calls `prisma.siteContactSettings.upsert` with `where: { id: SINGLETON_ID }`
- [ ] `SiteContactService` unit specs from TASK-154-C are green:
  - `getSettings()` returns entity with all null fields when repository returns `null`
  - `getSettings()` returns mapped entity when repository returns a row
  - `updateSettings(dto)` calls `repository.upsertSettings` and maps the result
- [ ] E2E spec at `apps/store-api/test/site-contact.e2e-spec.ts`:
  - `GET /api/site-contact` returns `200` with `{ data: { email: null, phone: null, ... } }` when
    the row has not been inserted (empty-state: `findUnique` mock returns `null`)
  - `GET /api/site-contact` returns `200` with the stored values after a PUT
  - `PUT /api/admin/site-contact` without auth token returns `401`
  - `PUT /api/admin/site-contact` with a customer-role token returns `403`
  - `PUT /api/admin/site-contact` with admin token + valid body `{ email: 'hello@test.ua', phone: '+380 67 000 0000', workingHours: 'Пн–Пт 10–18' }` returns `200` with `{ data: SiteContactSettingsEntity }` containing the submitted values
  - `PUT /api/admin/site-contact` with an invalid email (e.g. `"not-an-email"`) returns `400`
  - `PUT /api/admin/site-contact` with an invalid URL for `viberLink` (e.g. `"not-a-url"`) returns `400`
  - Repeated `PUT` calls are idempotent — the second PUT returns the latest values (upsert, not
    insert)
- [ ] Admin RTL test at `apps/store-admin/src/widgets/site-contact-settings-view/ui/site-contact-settings-view.test.tsx`:
  - MSW handler returns `{ data: { id: SINGLETON_ID, email: 'test@store.ua', phone: '+380 50 000 0000', workingHours: 'Пн–Нд 9–20', viberLink: null, telegramLink: null, instagramLink: null } }` for `GET /api/site-contact`
  - Rendered component shows the email input populated with `'test@store.ua'`
  - Rendered component shows the phone input populated with `'+380 50 000 0000'`
  - Submit button is present with label matching `dict.siteContactForm.submit`
  - Skeleton is shown while the query is in loading state
- [ ] `npm run test -w apps/store-api` green
- [ ] `npm run test -w apps/store-admin` green

**Files to create/modify:**

- `apps/store-api/test/site-contact.e2e-spec.ts`
- `apps/store-admin/src/widgets/site-contact-settings-view/ui/site-contact-settings-view.test.tsx`

---

## Implementation Order

```
TASK-154-F (Seed — independent, parallel with A–D)
    +-- runs concurrently with the backend chain

TASK-154-A (Prisma schema)
    |
TASK-154-B (SiteContactRepository TDD)
    |
TASK-154-C (SiteContactService TDD)
    |
TASK-154-D (Controllers + module)
    |
TASK-154-E (Orval regen)
    |
    +-- TASK-154-G (Admin UI)    — depends on E
    |
    +-- TASK-154-H (Footer)      — depends on E
    |
TASK-154-I (Tests — final verification sweep)
```

---

## Security Checklist

- [ ] `@UseGuards(AdminGuard)` at **controller** level on `AdminSiteContactController` — enforced
      before `@ApiBearerAuth` check; unauthenticated requests return 401, non-admin tokens 403
- [ ] `email` validated as `@IsEmail()` in `UpdateSiteContactDto` — never stored as arbitrary text
- [ ] Social link URLs validated as `@IsUrl({ protocols: ['http', 'https'] })` — prevents
      `javascript:` injection; the `viber://` deep-link protocol is not supported intentionally
      (admins should use the viber.me web URL)
- [ ] Public `GET /api/site-contact` is intentionally unauthenticated — it exposes only
      admin-entered contact info (no user PII, no internal state)
- [ ] Rate limiting: inherits the global `ThrottlerGuard` from `AppModule`; no special overrides
      needed (read-only public endpoint + very-low-write admin endpoint)
- [ ] Storefront footer renders email as `<a href="mailto:...">`, phone as `<a href="tel:...">`,
      social links as `<a href={url} rel="noopener noreferrer">` — Next.js escapes `href`
      attributes automatically; no `dangerouslySetInnerHTML` used; XSS risk is negligible
- [ ] No Prisma unique-constraint conflict possible for a singleton (fixed ID + upsert pattern) —
      no `ConflictException` handling needed in the service

---

## Cross-references

- **Plan 085 / TASK-153** — Admin-managed static pages. Same architecture pattern: separate public
  and admin controllers, TDD for repository and service, decorated response envelope classes for
  Orval, ISR-cached server-side fetch in the storefront. Quote from Plan 085 cross-references:
  "Same PagesModule pattern can inspire the SiteSettingsModule."
- **TASK-089** — Contact & social bar (phone, hours, Viber/Telegram/Instagram). Parked (🅿️) behind
  the UI rewrite. When activated, TASK-089 consumes the same `GET /api/site-contact` endpoint and
  Orval hooks — no new backend work or DB migration required. The social-link fields are already
  present in the `SiteContactSettings` model because of Decision 2 above.
- **TASK-080-E (DEFERRED)** — `DeliverySetting` singleton. A future reference: when that task
  ships, it follows the same fixed-ID upsert singleton pattern as this plan.
