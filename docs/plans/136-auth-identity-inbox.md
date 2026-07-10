# Plan 136 — Auth Identity & Contact Inbox (TASK-255, TASK-256, TASK-273)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 5 (Адаптив/дизайн + прев'ю контенту + хвости)
> **Origin:** `docs/handoff-2026-07-07.md` Блок B/C + code-review follow-up to TASK-169
> **Created:** 2026-07-10
> **Last Updated:** 2026-07-10
> **BACKLOG tasks:** TASK-255, TASK-256, TASK-273
> **Implementation:** single `tdd-agent` worktree, branch `feature/136-auth-inbox`, all three tasks
> land on this one branch (independent of each other — see Migration Steps for suggested order).

## Overview

Three small-to-medium Wave-5 leftovers, grouped into one branch because they touch disjoint
files and are individually too small to justify separate worktrees:

- **TASK-255** — the admin header shows a generic "Адміністратор" label because the JWT only
  carries `{ sub, role }`. **Finding from this plan's investigation: no backend work is needed.**
  `GET /api/users/me` (`UserController.getProfile`) already exists and already returns the full
  authenticated profile (email, name, role, etc.), and its Orval-generated raw fetcher
  (`userControllerGetProfile`) is already generated and exported from `@/shared/api` — it was
  simply never wired into the admin session bootstrap. This task is frontend-only.
- **TASK-256** — the contact inbox (`ContactMessage`, TASK-177) needs a third workflow status
  (`IN_PROGRESS`, between `NEW` and `READ`) and a way for an admin reading a message (or the
  inbox list) to jump to the sending customer's profile when their email matches a registered
  `User`. The customer card itself (TASK-252, `UserDetailView`) already renders email-matched
  contact messages — that half of the original TASK-256 description already shipped as part of
  plan 135. What is left: the `IN_PROGRESS` status, and the **reverse** link (inbox → profile).
- **TASK-273** — a code-review follow-up to TASK-169 (password reset): `requestPasswordReset`'s
  no-user/inactive/soft-deleted branch returns near-instantly (one `findByEmail` and nothing
  else), while the found+active branch does two extra indexed Postgres writes and an outbox
  insert. That latency gap is a (minor, throttle-blunted) account-enumeration oracle. Fix: burn
  comparable time on the fast branch too.

## Scope

### In Scope

- **TASK-255**: wire a light `/api/users/me` profile fetch into `AuthProvider`'s existing session
  lifecycle (bootstrap restore + login + refresh-token rotation, all of which funnel through the
  same `accessToken` state); `AdminHeader` renders the fetched email, falling back to the existing
  generic label on any fetch failure or before the fetch resolves.
- **TASK-256**: `ContactMessageStatus` gains `IN_PROGRESS`; `ContactRepository` gains two
  read-only, cross-domain lookups (`findMatchingUserId` / `findMatchingUserIds`, querying
  `prisma.user` directly — the mirror image of the pattern TASK-252's `UserRepository` already
  uses to query `prisma.contactMessage` directly); `ContactMessageEntity` gains a nullable
  `matchedUserId`; the admin inbox list/detail/update responses populate it; `message-inbox.tsx`
  and `message-detail-dialog.tsx` render a profile link when it's present, plus the new status in
  the filter/badge/action-button surfaces; `UserDetailView`'s (already-shipped) contact-messages
  section gets the new status label so it doesn't fall through to a raw enum string.
- **TASK-273**: `AuthService.requestPasswordReset`'s early-return branch performs a fixed-cost
  dummy `argon2.hash` call before returning, so its latency is in the same order of magnitude as
  the found+active branch. TDD (auth is a critical module per AGENTS.md).

### Out of Scope

- Any change to the JWT payload shape (`{ sub, role }` stays as-is) — TASK-255 solves the header
  purely via a side-channel profile fetch, not by growing the token.
- A persisted `ContactMessage.userId` foreign key. Considered and rejected — see Design Decision
  "Live lookup, not a persisted FK" below. `UserDetailView`'s existing TASK-252 email-match logic
  is untouched (it already works and needs no FK either).
- Notes/tags on the customer card, pagination on the card's sub-lists, and anything else already
  marked out of scope by plan 135 — unaffected by this plan.
- Equalizing `login()`'s or `confirmPasswordReset()`'s own not-found timing — TASK-273 is scoped
  to `requestPasswordReset` only (the specific finding from the TASK-193 review); those two
  methods have their own, different shape of the same class of concern and are not part of this
  plan's brief.
- A coarse "assert response time X vs Y" e2e/integration test for TASK-273 — inherently flaky
  under CI/network jitter; the brief explicitly asks for testing the _mechanism_ (the dummy call
  happens) rather than measuring wall-clock time. See TASK-273's Acceptance Criteria.

## User Stories

1. As the store owner, I want to see my own name/email in the admin header instead of a generic
   "Адміністратор" label, so the panel feels personalized and I can tell at a glance which admin
   account I'm signed in as.
2. As the store owner, I want to mark a contact-inbox message as "в роботі" while I'm actively
   handling it (distinct from "just opened it" / "done with it"), so the inbox reflects real
   triage state, not just read/unread.
3. As the store owner, I want a one-click link from a contact message straight to the sender's
   customer profile when they're a registered user, so I don't have to manually search `/users`
   by email while I'm in the middle of answering a support message.
4. As a security reviewer, I want the password-reset request endpoint to respond in roughly the
   same time whether or not the email belongs to an account, so response timing can't be used to
   enumerate registered emails.

## Technical Design

### Design Decision — TASK-255: no backend change, reuse the existing `/users/me` endpoint

`GET /api/users/me` (`apps/store-api/src/user/user.controller.ts:123-137`, `JwtAuthGuard`) already
returns the caller's full `UserEntity` (id, email, firstName, lastName, phone, role, isActive,
createdAt, updatedAt) — it exists for the storefront's own account page and works identically for
an ADMIN-role token. Its Orval-generated raw fetcher, `userControllerGetProfile`
(`apps/store-admin/src/shared/api/generated/users/users.ts:40-48`), is already generated (Orval
generates every tag by default) and re-exported through the `@/shared/api` barrel
(`export * from "./generated/users/users"`, `shared/api/index.ts:13`) — it was simply never
called anywhere in store-admin. **No Swagger/DTO/entity change, no Orval regen, and no new
endpoint are needed for this task.** It is purely a matter of calling the fetcher from
`AuthProvider` and reading the result in `AdminHeader`.

FSD note: `AuthProvider` lives in `entities/session`. It will import `userControllerGetProfile`
directly from `@/shared/api` (same layer it already imports `api`/`setAccessToken` from) — **not**
from `entities/user` — so this stays a same-layer-and-below import (`entities → shared`), never a
cross-slice `entities/session → entities/user` import.

### Design Decision — TASK-256: live email lookup, not a persisted FK

Plan 135 (§ Notes) speculated TASK-256 "will add `ContactMessage.userId`". Having now looked at
both sides of the join, this plan chooses **not** to add that column:

- A persisted FK has to be backfilled at write time (public `POST /api/contact` submit) and would
  go stale the moment a user registers _after_ emailing support, or changes their email — exactly
  the two limitations plan 135 already documented as acceptable for the _read_ side (the customer
  card). A live lookup at read time has neither problem: it naturally "catches up" as new users
  register, with zero backfill/migration-of-data concern.
- There is already a proven precedent for this exact shape of cross-domain read: TASK-252's
  `UserRepository.getContactMessagesByEmail` (`apps/store-api/src/user/user.repository.ts:276-289`)
  queries `prisma.contactMessage` directly from inside the `user` module, with no module import,
  specifically to avoid FK/migration overhead. `ContactRepository.findMatchingUserId(s)` is the
  mirror image of that same pattern, querying `prisma.user` directly from inside the `contact`
  module. `PrismaService` is `@Global()`, so no new module wiring is needed either direction.
- Read-time cost is bounded: one indexed lookup per message-detail view, and one **batched**
  `email IN (...)` lookup per inbox page (≤ 100 rows per the existing `limit` cap) — not a
  per-row query.

If TASK-256 is ever revisited because the inbox grows large enough for this to matter, swapping to
a persisted FK is still possible without changing `ContactMessageEntity`'s shape (`matchedUserId`
stays a `string | null`) — only the repository query changes, exactly the same
forward-compatibility property plan 135 already established for the customer-card side.

### Design Decision — TASK-256: in-place dictionary edits are safe here

The group constraint for this plan is "new admin dictionary strings go in NEW namespace blocks...
to avoid merge conflicts with parallel groups." That rule exists to stop two _different_ Wave-5
worktrees from touching the same lines of `dictionary.ts`. This plan is explicitly assigned
ownership of the `messages` (contact-inbox) and `header` (identity) namespaces — no other Wave-5
task touches either. Editing in place (appending new keys at the _end_ of the existing `messages:
{...}` block, not the middle) is therefore conflict-safe and keeps the new keys grouped with their
siblings instead of scattered in an orphan top-level block. TASK-255 needs **zero** new dictionary
keys at all (see its Acceptance Criteria — it reuses the existing `dict.header.adminLabel` as the
fallback string, verbatim).

### Design Decision — TASK-273: dummy argon2 hash, not a matched real hash

`requestPasswordReset`'s found+active branch does **not** call `argon2.hash` at all today (no
password is touched — see `apps/store-api/src/auth/auth.service.ts:172-201`). Its cost is two
small indexed Postgres writes (`invalidateActivePasswordResetTokens`, `savePasswordResetToken`)
plus a mail-outbox insert. Running an idle-cost `argon2.hash` call on the _fast_ branch is an
intentionally imprecise heuristic — it will typically make the fast branch's total latency land in
the same tens-of-milliseconds ballpark as the found-branch's few small DB round-trips, closing the
"near-zero vs non-trivial" gap that makes the endpoint trivially timeable, without requiring the
found branch to be slowed down or requiring a wall-clock assertion in tests. This is the same
shape of mitigation Django's `PasswordResetForm` uses (hash a dummy password when no user is
found, precisely so the "user not found" branch isn't suspiciously fast) — it does not have to be
a _perfect_ time match to be worthwhile, and the existing 5/min throttle (`auth.controller.ts:160`)
already blunts practical exploitation regardless; this closes the gap the code-review flagged
without over-engineering a constant-time guarantee.

### Data Model

```prisma
enum ContactMessageStatus {
  NEW
  IN_PROGRESS   // new — TASK-256
  READ
  ARCHIVED
}
```

`apps/store-api/prisma/schema.prisma:768`. No other schema changes (no new column, no new
migration for a FK — see Design Decision above). Migrations are gitignored in this repo —
`schema.prisma` is the source of truth (`npx prisma generate` regenerates the TS client/enum from
it without needing a live DB; applying it to an actual Postgres instance, via `npx prisma db push`
or `migrate dev`, is a separate step — see Migration Steps and the Notes on verification).

### API Contract

| Method | Path                               | Change                                                                                                  |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/api/users/me`                    | **Unchanged.** Already returns the full profile — TASK-255 just starts calling it from admin.           |
| GET    | `/api/contact/admin`               | `ContactMessageEntity.status` now allows `IN_PROGRESS`; each row gains `matchedUserId: string \| null`. |
| GET    | `/api/contact/admin/:id`           | Same `matchedUserId` addition.                                                                          |
| PATCH  | `/api/contact/admin/:id`           | `status` DTO now allows `IN_PROGRESS`; response gains `matchedUserId`.                                  |
| POST   | `/api/auth/password-reset/request` | **Unchanged response.** Internal latency only — no contract change.                                     |

No new routes anywhere in this plan.

## TASK-255: Admin identity in header

**Type:** feat
**Scope:** store-admin
**Complexity:** L (4-8h) — frontend-only per the Design Decision above (backend already exists)
**TDD Required:** No (UI + a side-effect fetch; not one of the AGENTS.md-listed critical modules)
**Depends on:** —

### Backend

None. See "Design Decision — TASK-255" above.

### Frontend

- `apps/store-admin/src/entities/session/model/auth.context.tsx`:
  - `AuthContextValue` gains `email: string | null`.
  - New `email` state, reset to `null` inside `clearTokens`.
  - A `useEffect` keyed on `accessToken` (so it re-runs on bootstrap-restore, login, and every
    refresh-token rotation — all three funnel through the same state) that, when `accessToken` is
    non-null, calls `userControllerGetProfile()` (imported from `@/shared/api`, **not** through a
    React Query hook — this provider already does manual side effects the same way
    `bootstrapRefresh` does) and sets `email` from `res.data.email` on success. On any failure
    (network error, 401, whatever), `email` is left/set to `null` — the profile fetch must never
    tear down the session or otherwise affect `isAuthenticated`/`isAdmin`. When `accessToken`
    becomes `null` (logout), `email` resets to `null` too. Use the same `active` boolean-guard
    pattern the existing bootstrap effect uses to avoid a stale-closure state update after unmount.
  - `value` (`useMemo`) exposes `email`.
- `apps/store-admin/src/widgets/admin-shell/admin-header.tsx`:
  - Reads `email` from `useAuth()`.
  - Renders `email ?? dict.header.adminLabel` in place of the current always-generic
    `dict.header.adminLabel` — **no new dictionary key**, the existing fallback string is reused
    verbatim for the "no email yet / fetch failed" case.
  - `title={email ?? userId ?? undefined}` tooltip (was `userId` only).
  - JSDoc comment on the component updated — it currently states the identity is "deferred per
    plan 025 §11"; correct it to describe the new light-fetch-with-fallback behavior instead.
- `apps/store-admin/src/shared/test/msw-handlers.ts`: add a default handler,
  `http.get("*/api/users/me", () => HttpResponse.json({ data: { ...stub UserEntity shape,
email: "admin@example.com" } }))`, alongside the existing "Auth — admin session bootstrap"
  handlers — so every existing suite that renders the real `AuthProvider` through to an
  authenticated state stays off `onUnhandledRequest: "error"` (`shared/test/setup.ts:21`) once the
  provider starts calling this endpoint.

### Acceptance Criteria

- [ ] `AuthContextValue` exposes `email: string | null`; `clearTokens()` resets it to `null`.
- [ ] After a successful bootstrap restore or login (i.e. whenever `accessToken` transitions from
      `null` to a value), `AuthProvider` calls `userControllerGetProfile()` and sets `email` from
      the response on success.
- [ ] A failing profile fetch (mocked 500 or network error) leaves `email` as `null` and does
      **not** affect `isAuthenticated`/`isAdmin`/`isInitializing` — session state is independent
      of the profile fetch's outcome.
- [ ] `AdminHeader` renders `email` when present and falls back to the existing
      `dict.header.adminLabel` string when `email` is `null` — verified via a header test with the
      mocked `useAuth()` return value in both states.
- [ ] `apps/store-admin/src/shared/test/msw-handlers.ts` has a default `GET */api/users/me`
      handler; the full existing store-admin unit suite (which renders the real `AuthProvider` in
      several places — `admin-shell.test.tsx`, `auth.context.test.tsx`, login flows) stays green
      with no new `onUnhandledRequest` failures.
- [ ] `apps/store-admin/src/entities/session/model/auth.context.test.tsx` — new test(s) covering
      the happy-path email population and the failure-path fallback described above.
- [ ] `apps/store-admin/src/widgets/admin-shell/admin-header.test.tsx` — extended for both the
      `email` present and `email: null` cases.
- [ ] No FSD violation: `entities/session` imports `userControllerGetProfile` from `@/shared/api`
      directly, never from `entities/user`.
- [ ] `npm run typecheck`/`lint` clean for store-admin.
- [ ] Tests pass: `npm run test -w apps/store-admin -- auth.context admin-header` (fall back to
      `--runInBand` for the full suite per the store-client/store-admin Jest parallel-flake note if
      needed).

### Files to create/modify

- `apps/store-admin/src/entities/session/model/auth.context.tsx` — `email` state + fetch effect
- `apps/store-admin/src/entities/session/model/auth.context.test.tsx` — new test cases
- `apps/store-admin/src/widgets/admin-shell/admin-header.tsx` — render `email`, updated JSDoc
- `apps/store-admin/src/widgets/admin-shell/admin-header.test.tsx` — extended mock/assertions
- `apps/store-admin/src/shared/test/msw-handlers.ts` — new default `GET */api/users/me` handler

---

## TASK-256: Contact inbox — `IN_PROGRESS` status + profile link

**Type:** feat
**Scope:** store-api, store-admin
**Complexity:** L (4-8h)
**TDD Required:** No (read-enrichment + an enum addition — same classification TASK-252 used for
its analogous cross-domain reads; still fully unit-tested per Acceptance Criteria)
**Depends on:** —

### Backend

- `apps/store-api/prisma/schema.prisma` — add `IN_PROGRESS` to `ContactMessageStatus`, between
  `NEW` and `READ` (see Data Model above). Run `npx prisma generate` (schema-only, no live DB
  required) so `@prisma/client`'s TS enum picks it up.
- `apps/store-api/src/contact/contact.repository.ts` — two new read-only methods:
  - `findMatchingUserId(email: string): Promise<string | null>` —
    `prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } })`, mapped
    to `.id ?? null`.
  - `findMatchingUserIds(emails: string[]): Promise<Map<string, string>>` — batched version for
    list pages: `prisma.user.findMany({ where: { email: { in: emails }, deletedAt: null }, select:
{ id: true, email: true } })`, reduced into a `Map<email, id>`. Returns an empty `Map`
    immediately (no query) when `emails` is empty.
- `apps/store-api/src/contact/entities/contact-message.entity.ts`:
  - New field `matchedUserId!: string | null` (`@ApiProperty`, nullable, not required).
  - `fromPrisma(row, matchedUserId: string | null = null)` — second parameter added with a
    default, so the existing `fromPrisma(message)` call site in `create()` keeps compiling
    unchanged and simply never populates it (the public submit endpoint narrows its response to
    `{ id }` anyway, per `contact.controller.ts` — `matchedUserId` never reaches an unauthenticated
    caller regardless).
- `apps/store-api/src/contact/contact.service.ts`:
  - `findAllAdmin`: after `{ messages, total }` resolves, batch-resolve matches over the page's
    **distinct** emails via `findMatchingUserIds`, then map each row through
    `ContactMessageEntity.fromPrisma(row, matchMap.get(row.email) ?? null)`. One extra query per
    page load, not per row.
  - `findByIdAdmin`: resolve via `findMatchingUserId(message.email)` and pass it through.
  - `update`: resolve `matchedUserId` for the (unchanged) email of the message being updated and
    pass it through on the returned entity.
  - `create`: unchanged — still calls `fromPrisma(message)` with no second argument.
- `apps/store-api/src/contact/dto/*.ts` — **no changes needed.** Both
  `ContactMessageListQueryDto.status` and `UpdateContactMessageDto.status` validate via
  `@IsEnum(ContactMessageStatus, { message: ... Object.values(ContactMessageStatus) ... })`, which
  is derived dynamically from the (now four-value) Prisma enum — `IN_PROGRESS` is accepted
  automatically once the schema/client change lands.
- `apps/store-api/src/contact/admin-contact.controller.ts` — **no changes needed.** The existing
  `@ApiExtraModels(ContactMessageEntity, ...)` registration already covers the entity; Swagger
  picks up the new `matchedUserId` property and the new enum value automatically from the
  decorated entity/DTOs above.

### Frontend

- Orval regen (`npm run generate:api`, run once after the backend changes above) picks up:
  (a) the `IN_PROGRESS` value on the generated `ContactMessageEntityStatus` /
  `AdminContactListStatus` / `UpdateContactMessageDtoStatus` enums, and (b) the new
  `matchedUserId` field on the generated `ContactMessageEntity` model. Generated files under
  `apps/store-admin/src/shared/api/generated/**` are never hand-edited.
- `apps/store-admin/src/entities/contact/index.ts` — no changes needed; the existing
  `export type { ContactMessageEntity, ... }` and enum re-exports already cover the new members.
- `apps/store-admin/src/widgets/message-inbox/ui/status-meta.ts`:
  - `statusLabel` — add an `IN_PROGRESS` case → `dict.messages.statusInProgress`.
  - `statusBadgeVariant` — add an `IN_PROGRESS` case → `"warning"` (the `Badge` component's
    existing warning variant, already used elsewhere in this app for a "needs attention" state —
    e.g. `UserDetailView`'s pending-review badge).
- `apps/store-admin/src/widgets/message-inbox/ui/message-inbox.tsx`:
  - `parseStatus` accepts `AdminContactListStatus.IN_PROGRESS` as a valid URL value.
  - Status filter `<Select>` gains an `IN_PROGRESS` item (`dict.messages.filterInProgress`).
  - Table row: when `message.matchedUserId` is present, the sender-name cell links to
    `/users/${message.matchedUserId}` (mirrors the existing "product name links to the PDP"
    pattern from TASK-204) instead of rendering plain text; unchanged plain text when absent.
- `apps/store-admin/src/widgets/message-inbox/ui/message-detail-dialog.tsx`:
  - A 4th status action button, "Взяти в роботу" (`dict.messages.markInProgress`), shown whenever
    `message.status !== IN_PROGRESS` (same visibility pattern as the existing three buttons).
  - When `message.matchedUserId` is present, a `dict.messages.viewProfile` link/button to
    `/users/{matchedUserId}` — placed so it's reachable without scrolling (e.g. next to the
    `fieldEmail` `DetailRow`, or as a `DialogFooter` action ahead of the status buttons; build
    agent's call on exact placement).
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.tsx` — the local
  `CONTACT_STATUS_LABELS` map (already shipped by TASK-252, lines 38-42) gains
  `IN_PROGRESS: dict.messages.statusInProgress`, so the customer card's (already-shipped)
  contact-messages section renders the new status instead of falling through to the raw enum
  string. This is the only change this task makes to that file — the email-matched
  contact-messages section itself, and the rest of the customer card, are unaffected.
- `apps/store-admin/src/shared/config/dictionary.ts` — appended at the end of the existing
  `messages: {...}` block (see "Design Decision — in-place dictionary edits are safe here"):
  ```ts
  filterInProgress: "В роботі",
  statusInProgress: "В роботі",
  markInProgress: "Взяти в роботу",
  viewProfile: "Профіль клієнта",
  ```
  No `users.*` key is needed — `UserDetailView`'s status map reuses `dict.messages.statusInProgress`
  directly, same as it already does for the other three statuses.

### Tests

- `apps/store-api/src/contact/contact.repository.spec.ts` — `findMatchingUserId` (found /
  not-found / excludes a soft-deleted user) and `findMatchingUserIds` (batched match, partial
  match — some emails match and some don't, empty-array input short-circuits with no query).
- `apps/store-api/src/contact/contact.service.spec.ts` — `findAllAdmin` attaches `matchedUserId`
  per row from the batched map (including a mixed page); `findByIdAdmin` and `update` attach it via
  the single lookup; `create` still returns `matchedUserId: null` with zero extra repository calls
  (the write path must not gain latency from this feature).
- New `apps/store-api/test/contact.e2e-spec.ts` (this module currently has **no** e2e coverage —
  only unit specs; add a minimal one, following the mocked-repository pattern from
  `test/user.e2e-spec.ts`/`test/site-contact.e2e-spec.ts`, not a real DB): admin list filtered by
  `?status=IN_PROGRESS`; `PATCH .../admin/:id` accepting `{ status: 'IN_PROGRESS' }`; a
  `matchedUserId` present in the response when the mocked repository resolves a match, `null` when
  it doesn't; 403 for a non-admin JWT. This spec mocks `ContactRepository`/`PrismaService` — it may
  be run in isolation in this worktree (`npm run test:e2e -w apps/store-api -- contact.e2e-spec`);
  do **not** run the full `npm run test:e2e -w apps/store-api --runInBand` suite here (shared-DB
  contention — see the store-api-e2e-serial convention; that full run happens on `develop` after
  merge).
- `apps/store-admin/src/widgets/message-inbox/ui/message-inbox.test.tsx` — extended: the
  `IN_PROGRESS` filter option renders and round-trips through the URL; a row's sender name links to
  `/users/{id}` when `matchedUserId` is present, and renders as plain text when it isn't.
- New `apps/store-admin/src/widgets/message-inbox/ui/message-detail-dialog.test.tsx` (this file
  does not exist yet): the "Взяти в роботу" button appears/disappears correctly across all four
  statuses (extending the existing three-button coverage pattern this component already has, just
  never had a dedicated test file for); the profile link renders when `matchedUserId` is present
  and is absent when it's `null`; existing status-transition and admin-note-save behavior
  (mutation call shape) is covered too, since this is the first test file for the component.
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.test.tsx` — extend the existing
  contact-messages assertions (or add one) to cover an `IN_PROGRESS` message rendering
  `dict.messages.statusInProgress` instead of the raw string.

### Acceptance Criteria

- [ ] `ContactMessageStatus` in `schema.prisma` has four values in order `NEW, IN_PROGRESS, READ,
    ARCHIVED`; `npx prisma generate` run and `@prisma/client`'s TS enum reflects it.
- [ ] `ContactRepository.findMatchingUserId` and `findMatchingUserIds` implemented exactly as
      specified — both exclude soft-deleted users (`deletedAt: null`); the batched variant makes
      exactly one query regardless of page size and zero queries for an empty email list.
- [ ] `ContactMessageEntity` exposes `matchedUserId: string | null`; `fromPrisma`'s existing
      call site in `create()` is unaffected (compiles unchanged, defaults to `null`).
- [ ] `ContactService.findAllAdmin` resolves `matchedUserId` for every row via **one** batched
      lookup per page (not N+1); `findByIdAdmin` and `update` resolve it via the single-email
      lookup; `create` makes zero extra repository calls.
- [ ] No changes to `admin-contact.controller.ts`'s route signatures, guards, or
      `@ApiExtraModels` list beyond what already covers `ContactMessageEntity`.
- [ ] `ContactMessageListQueryDto`/`UpdateContactMessageDto` accept `IN_PROGRESS` with no DTO code
      change (confirmed dynamic from `Object.values(ContactMessageStatus)`).
- [ ] Orval regen (`npm run generate:api`) produces the four-value status enums and the
      `matchedUserId` field on the generated `ContactMessageEntity`; no hand-edits to
      `apps/store-admin/src/shared/api/generated/**`.
- [ ] `status-meta.ts` renders a label and a distinct (`warning`) badge variant for `IN_PROGRESS`.
- [ ] `message-inbox.tsx`: filter dropdown includes "В роботі"; a row's sender name is a working
      link to `/users/{matchedUserId}` exactly when that field is present.
- [ ] `message-detail-dialog.tsx`: a 4th status button moves a message into `IN_PROGRESS`; a
      profile link to `/users/{matchedUserId}` renders exactly when that field is present.
- [ ] `UserDetailView.tsx`'s `CONTACT_STATUS_LABELS` includes `IN_PROGRESS`; no other change to
      that file.
- [ ] `dictionary.ts` — the four new keys appended at the end of the `messages` block, verbatim
      Ukrainian strings as specified; no new `users.*` key added.
- [ ] `npm run typecheck`/`lint` clean for both store-api and store-admin.
- [ ] Tests pass: `npm run test -w apps/store-api -- contact`,
      `npm run test:e2e -w apps/store-api -- contact.e2e-spec` (isolated, not the full suite),
      `npm run test -w apps/store-admin -- message-inbox message-detail-dialog UserDetailView`.

### Files to create/modify

- `apps/store-api/prisma/schema.prisma` — `IN_PROGRESS` enum value
- `apps/store-api/src/contact/contact.repository.ts` — two new methods
- `apps/store-api/src/contact/contact.repository.spec.ts` — new test cases
- `apps/store-api/src/contact/entities/contact-message.entity.ts` — `matchedUserId` field
- `apps/store-api/src/contact/contact.service.ts` — resolve `matchedUserId` in three methods
- `apps/store-api/src/contact/contact.service.spec.ts` — new test cases
- `apps/store-api/test/contact.e2e-spec.ts` — new file
- `apps/store-admin/src/shared/api/generated/**` — regenerated (Orval)
- `apps/store-admin/src/widgets/message-inbox/ui/status-meta.ts` — `IN_PROGRESS` cases
- `apps/store-admin/src/widgets/message-inbox/ui/message-inbox.tsx` — filter + profile link
- `apps/store-admin/src/widgets/message-inbox/ui/message-inbox.test.tsx` — extended
- `apps/store-admin/src/widgets/message-inbox/ui/message-detail-dialog.tsx` — new button + link
- `apps/store-admin/src/widgets/message-inbox/ui/message-detail-dialog.test.tsx` — new file
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.tsx` — one label-map entry
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.test.tsx` — extended
- `apps/store-admin/src/shared/config/dictionary.ts` — four new keys under `messages`

---

## TASK-273: Password-reset timing hardening

**Type:** fix
**Scope:** store-api
**Complexity:** S (1-2h)
**TDD Required:** Yes — auth is a listed critical module (AGENTS.md § Testing Strategy); follow
Red → Green → Refactor.
**Depends on:** —

### Backend

- `apps/store-api/src/auth/auth.service.ts`:
  - New module-level constant, alongside the existing `PASSWORD_RESET_TOKEN_BYTES` /
    `INVALID_RESET_TOKEN_MESSAGE` constants: a fixed dummy string used only to drive the argon2
    cost function (not a real secret — its value is irrelevant, only the hash's cost matters).
  - `requestPasswordReset`'s early-return guard (`if (!user || !user.isActive || user.deletedAt)`,
    currently `auth.service.ts:176-178`) gains one line before the `return`: `await
argon2.hash(<the dummy constant>);` — its result is discarded.
  - A code comment at the call site explaining the rationale in one or two lines (cross-reference
    this plan / TASK-273), matching this file's existing comment density.
  - No change to the found+active branch, `confirmPasswordReset`, `login`, or any other method.

### TDD sequence

1. **RED** — in `apps/store-api/src/auth/auth.service.spec.ts`, under the existing
   `describe('requestPasswordReset', ...)` block (`auth.service.spec.ts:333-396`), add three
   assertions (one per existing no-op test — unknown email, deactivated user, soft-deleted user):
   `expect(argon2.hash).toHaveBeenCalledTimes(1)`. These fail against the current implementation
   (zero calls) — that is the RED phase.
2. **GREEN** — implement the dummy `argon2.hash` call as specified above; the three tests pass.
   The existing assertions in those same three tests (`savePasswordResetToken` /
   `enqueuePasswordReset` not called) must remain green — the dummy hash must not create a token
   or enqueue an email.
3. **REFACTOR** — optional: extract the shared no-op condition into a small private predicate if
   it improves readability; all `requestPasswordReset` tests (including the two below) must stay
   green throughout.

- Add a **new** assertion to the existing happy-path test
  (`'invalidates prior tokens, saves a fresh token and enqueues the email for an active user'`,
  `auth.service.spec.ts:361-384`): `expect(argon2.hash).not.toHaveBeenCalled()` — pins the
  intentional asymmetry from the Design Decision above (the found+active branch stays argon2-free)
  as a regression guard, so a future refactor can't silently make both branches call it (or
  neither).
- `argon2.hash` is already globally mocked at the top of this spec file
  (`jest.mock('argon2', ...)`, reset via `mockClear()` in the existing `beforeEach`
  `auth.service.spec.ts:83`) — no new mock setup needed.

### Acceptance Criteria

- [ ] RED: the three new/extended no-op-branch assertions fail against the pre-fix code (captured
      in the implementation commit history / PR description, not committed as a separate "failing"
      commit — standard TDD discipline for this repo, matching how other TDD tasks in this
      codebase are described).
- [ ] GREEN: `requestPasswordReset`'s three no-op branches (unknown email / inactive / soft-deleted)
      each call `argon2.hash` exactly once with the fixed dummy input before returning; none of
      them call `savePasswordResetToken`, `invalidateActivePasswordResetTokens`, or
      `mailOutboxService.enqueuePasswordReset`.
- [ ] The found+active happy-path test explicitly asserts `argon2.hash` is **not** called on that
      branch (regression guard for the documented asymmetry).
- [ ] No change to `requestPasswordReset`'s public behavior: response is still `void`/200 with the
      identical generic controller message for every input; `confirmPasswordReset`, `login`,
      `register`, `refreshToken`, `logout` are byte-for-byte unchanged.
- [ ] No controller/DTO/Swagger changes — `auth.controller.ts`'s
      `POST /api/auth/password-reset/request` route is untouched (internal latency only).
- [ ] `npm run typecheck`/`lint` clean for store-api.
- [ ] Tests pass: `npm run test -w apps/store-api -- auth.service`.

### Files to create/modify

- `apps/store-api/src/auth/auth.service.ts` — dummy-cost constant + one call in the no-op branch
- `apps/store-api/src/auth/auth.service.spec.ts` — 3 extended tests + 1 new regression assertion

## Migration Steps

Tasks are file-disjoint and independent of each other; suggested execution order minimizes the
number of Orval regens (only TASK-256 touches the API contract) and does the schema change early:

1. **TASK-273** — self-contained backend fix, no schema/contract change. Do this first (smallest,
   TDD, unblocks nothing else but is a clean isolated commit).
2. **TASK-255** — frontend-only, no schema/contract change. Independent of the other two.
3. **TASK-256** — schema change (`IN_PROGRESS`) → `npx prisma generate` → backend
   repository/service changes → **one** `npm run generate:api` regen at the end → frontend
   changes. Doing this last means the branch's single Orval regen reflects the final state of the
   only task that touches the contract.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-255's new `/users/me` call on every `accessToken` change (including every refresh-token rotation, which both frontends already trigger on every page load per fix/196) adds a request the admin panel didn't make before | Accepted — it's a single lightweight authenticated GET, same order of cost as the existing `/api/contact/admin/unread-count` badge poll already firing on every shell mount; not a performance concern at this app's scale                                                                                                                     |
| Existing store-admin test suites that render the real `AuthProvider` through to an authenticated state will now hit `/api/users/me` and fail under the strict `onUnhandledRequest: "error"` MSW config unless handled         | TASK-255's Acceptance Criteria explicitly require a default handler in the shared `msw-handlers.ts` before any other change lands                                                                                                                                                                                                              |
| TASK-256's batched `findMatchingUserIds` could regress into a per-row query if a future edit reintroduces a loop                                                                                                              | Repository unit test asserts exactly one `prisma.user.findMany` call per `findAllAdmin` invocation regardless of page size                                                                                                                                                                                                                     |
| Adding a 4th `ContactMessageStatus` value could silently break any code that exhaustively switches over the enum without a `default` case                                                                                     | Grep-verified during implementation: `status-meta.ts`'s two functions are the only exhaustive switches over this enum in the codebase, and both gain an explicit `IN_PROGRESS` case per this plan; `unreadCount`/dashboard badges filter on `NEW` specifically (unaffected — `IN_PROGRESS` messages are correctly _not_ counted as unread-new) |
| TASK-273's dummy `argon2.hash` call makes the no-user branch _slower_ than before (previously near-instant), which is a real, if minor, UX regression on the password-reset form for typo'd emails                            | Accepted per the brief — the security property (closing the enumeration oracle) is judged more valuable than shaving tens of milliseconds off a rare-path form submission; the response content was already identical either way                                                                                                               |
| This worktree's `IN_PROGRESS` enum value exists in `schema.prisma`/`@prisma/client` (via `prisma generate`) but not yet in any live Postgres database until a `db push`/`migrate dev` is run against it                       | Unit tests mock `PrismaService` entirely (no live DB dependency); the new isolated `contact.e2e-spec.ts` also mocks the repository. Applying the schema to the shared dev/`store_test` databases is a normal post-merge step — flag it to whoever runs the API against a live DB next, same as any other schema change in this repo            |

## Notes

- **TASK-255 backend finding.** The original BACKLOG description assumed a new `GET /auth/me` or
  `/users/me` endpoint would need to be built. It already exists and already returns everything
  needed. This plan's Complexity rating (L) is kept as assigned in BACKLOG despite the reduced
  backend scope, since the frontend-only work (session-lifecycle wiring across three entry points,
  MSW handler updates across the shared test suite, two test files) is still a real L-sized unit.
- **TASK-256 scope note.** Half of the original TASK-256 backlog description — "match messages to
  `User` by email → show in customer card" — already shipped inside plan 135 / TASK-252
  (`UserDetailView`'s contact-messages section). This plan only adds the `IN_PROGRESS` status and
  the reverse link (inbox → profile); it does not re-touch the customer-card side beyond the one
  status-label-map entry needed for consistency.
- **Manual QA.** No new manual-QA items are anticipated beyond the standard "smoke the feature on
  a running stack" pass already covered by the existing admin-guide/manual-qa conventions. If the
  implementing agent finds a live-stack gap (e.g. verifying the `IN_PROGRESS` enum value against a
  real Postgres instance after `db push`), append a `## TASK-256` entry to
  `docs/manual-qa-pending.md` at that time rather than pre-emptively here.
- **Post-merge Orval regen.** If another Wave-5 branch also extends the OpenAPI contract and merges
  around the same time as this one, follow the same "regen once on `develop` after both merge"
  pattern plan 135 documented for its own TASK-251/252 concurrency — this plan's own worktree regen
  (TASK-256's step) is sufficient for implementing and testing within this branch.
