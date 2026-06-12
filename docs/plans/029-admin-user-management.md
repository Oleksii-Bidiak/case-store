# Plan 029 — Admin User Management (TASK-042)

> **Status:** Implemented — automated gate green (230 unit + 156 e2e); manual smoke pending
> **Phase:** Phase 4 — Admin Panel
> **Created:** 2026-06-12
> **Last Updated:** 2026-06-13

## Overview

TASK-042 delivers the Admin User Management section of the admin panel. Admins can
view a paginated, searchable user list, inspect individual user profiles, and
ban/unban accounts (toggle `isActive`). This completes all four Phase 4 Admin Panel
CRUD/management modules (Products → Categories → Orders → Users).

---

## Scope

### In Scope

- Fix Swagger `@ApiProperty` type annotations on `UserEntity` (nullable fields lack
  explicit `type`, causing Orval to emit `{ [key: string]: unknown }` for
  `firstName`, `lastName`, `phone` and an untyped `UserListResponseEnvelope`).
- Regenerate Orval API hooks after the Swagger fix (no new controller needed —
  `UserController` at `/api/users` already exposes all required admin endpoints).
- Create `entities/user` FSD barrel slice in `store-admin`.
- Create `features/user-ban-toggle` FSD slice (activate/deactivate button with
  sonner toast + React Query invalidation).
- Create `widgets/user-list` FSD slice (paginated table, search filter, skeleton).
- Create `widgets/user-detail` FSD slice (profile view + ban/unban control).
- Create app route pages: `/users` (list) and `/users/[id]` (detail).
- Fix the AdminSidebar Users link from `href: "#"` to `href: "/users"`.
- Build, lint, typecheck, and manual smoke verification gate.

### Out of Scope

- Role promotion/demotion (changing `role` from CUSTOMER to ADMIN) — requires a
  separate admin endpoint and deliberate security review.
- User creation by admin — users are created through the storefront registration flow.
- User deletion — `User` records are immutable audit references; soft-delete via
  `isActive` is the only supported action.
- Profile editing by admin (email, name, phone) — out of scope for MVP admin panel.
- Sending password-reset or notification emails on ban — a Phase 5 marketing
  automation task.
- Settings sidebar link (still `href: "#"`) — out of scope for this task.

---

## User Stories

1. As an admin, I want to view a paginated list of all registered users so that I
   can monitor the customer base.
2. As an admin, I want to filter users by role (CUSTOMER / ADMIN), active status,
   and search by email or name so that I can find a specific user quickly.
3. As an admin, I want to view the full profile of an individual user including their
   registration date, role, and account status so that I can make informed decisions.
4. As an admin, I want to ban (deactivate) an active user account so that the user
   can no longer log in.
5. As an admin, I want to unban (reactivate) a deactivated user account so that the
   user regains access.

---

## Technical Design

### Data Model

No Prisma migration is required. The `User` model already has `isActive`, `role`,
`email`, `firstName`, `lastName`, `phone`, `createdAt`, `updatedAt` fields that fully
satisfy the UI requirements.

### Backend (store-api)

#### Current State — What Already Exists

The `UserController` at `apps/store-api/src/user/user.controller.ts` already
implements every endpoint needed:

| Method  | Path                        | Guard                            | Purpose                      |
| ------- | --------------------------- | -------------------------------- | ---------------------------- |
| `GET`   | `/api/users/me`             | `JwtAuthGuard`                   | Current user's own profile   |
| `PUT`   | `/api/users/me`             | `JwtAuthGuard`                   | Current user updates profile |
| `GET`   | `/api/users`                | `JwtAuthGuard` + `@Roles(ADMIN)` | **Admin:** List all users    |
| `GET`   | `/api/users/:id`            | `JwtAuthGuard` + `@Roles(ADMIN)` | **Admin:** Get user by ID    |
| `PATCH` | `/api/users/:id/deactivate` | `JwtAuthGuard` + `@Roles(ADMIN)` | **Admin:** Ban user          |
| `PATCH` | `/api/users/:id/activate`   | `JwtAuthGuard` + `@Roles(ADMIN)` | **Admin:** Unban user        |

`UserRepository` and `UserService` already implement `findAll`, `findById`,
`deactivateUser`, and `activateUser`. No new backend controller, service method, or
repository method is required.

**No new Prisma migration is needed.**

#### Swagger Gap — Critical Fix (TASK-042-A)

`UserEntity` declares three nullable fields without an explicit `type` in their
`@ApiProperty` decorator. The pattern that triggers the Orval bug is:

```typescript
// BROKEN — nullable without type causes Orval to emit { [key: string]: unknown }
@ApiProperty({ description: '...', required: false })
firstName!: string | null;

// FIXED — explicit type resolves the nullable schema correctly
@ApiProperty({ description: '...', required: false, nullable: true, type: String })
firstName!: string | null;
```

Affected fields:

| Field       | Current decorator                           | Fix needed                         |
| ----------- | ------------------------------------------- | ---------------------------------- |
| `firstName` | `{ description, example, required: false }` | Add `nullable: true, type: String` |
| `lastName`  | `{ description, example, required: false }` | Add `nullable: true, type: String` |
| `phone`     | `{ description, example, required: true }`  | Add `nullable: true, type: String` |

Additionally, the file-local `UserListResponseEnvelope` class in `user.controller.ts`
has no `@ApiProperty` decorators on its `data` and `meta` fields:

```typescript
// BROKEN — undecorated fields cause Orval to emit { [key: string]: unknown }
class UserListResponseEnvelope {
  data!: UserEntity[];
  meta!: PaginationMeta;
}

// FIXED — decorated fields give Orval the type information it needs
class UserListResponseEnvelope {
  @ApiProperty({ type: [UserEntity] }) data!: UserEntity[];
  @ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta;
}
```

The same `PaginationMeta` class in `user.controller.ts` also lacks `@ApiProperty`
decorators on its four fields. All four fields must be decorated.

After this fix and Orval regeneration, `UserListResponseEnvelope` will be a typed
`{ data: UserEntity[]; meta: PaginationMeta }` interface instead of the current
`{ [key: string]: unknown }`.

#### Orval Hook Availability (Post TASK-042-A Fix)

After regeneration the following hooks from `generated/users/users.ts` become
properly typed and usable in the frontend:

| Hook                              | Endpoint                          | Type                        |
| --------------------------------- | --------------------------------- | --------------------------- |
| `useUserControllerFindAll`        | `GET /api/users`                  | `UserListResponseEnvelope`  |
| `useUserControllerFindById`       | `GET /api/users/:id`              | `UserControllerFindById200` |
| `useUserControllerDeactivateUser` | `PATCH /api/users/:id/deactivate` | mutation                    |
| `useUserControllerActivateUser`   | `PATCH /api/users/:id/activate`   | mutation                    |

`useUserControllerGetProfile` and `useUserControllerUpdateProfile` are customer-facing
and are not used by the admin panel.

### Frontend (store-admin — FSD)

#### entities/user

Barrel re-exports user hooks and types from `@/shared/api`.

#### features/user-ban-toggle

A single `UserBanToggle` component that receives `userId` and `isActive`. Renders
either a "Deactivate" button (when `isActive` is `true`) or an "Activate" button
(when `isActive` is `false`). Uses `useUserControllerDeactivateUser` /
`useUserControllerActivateUser` mutations. On success: invalidates the user list
query key and the specific user detail key; shows a sonner toast. On error: shows an
error toast. Button is disabled while mutation is pending.

#### widgets/user-list

`AdminUserTable` — "use client" component that reads `?search=`, `?role=`, `?isActive=`,
and `?page=` URL params. Renders filters (search input, role select, active-status
select) and a `shadcn/ui` `Table` with columns: Avatar/initials, Email, Name, Role
(badge), Status (badge), Joined, Actions (View link). Includes skeleton and empty state.

#### widgets/user-detail

`UserDetailView` — "use client" component, fetches by ID, shows full profile, renders
`UserBanToggle`. On 404, redirects to `/users`.

#### app pages

`app/(dashboard)/users/page.tsx` and `app/(dashboard)/users/[id]/page.tsx` — Server
Components with Suspense boundaries, following the exact Next.js 15 async params
pattern (`await params`) used by `orders/[id]/page.tsx`.

---

## Tasks

### TASK-042-A: Fix Swagger @ApiProperty types on UserEntity and UserController envelopes

**Type:** fix
**Scope:** store-api
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/src/user/entities/user.entity.ts` updated — every nullable
      field (`firstName`, `lastName`, `phone`) has both `nullable: true` AND
      `type: String` in its `@ApiProperty` decorator. The existing `required: false` is
      retained. Example:
  ```typescript
  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
    nullable: true,
    type: String,
  })
  firstName!: string | null;
  ```
- [ ] `apps/store-api/src/user/user.controller.ts` updated — the file-local
      `PaginationMeta` class has `@ApiProperty` decorators on all four fields:
      `total` (`Number`), `page` (`Number`), `limit` (`Number`), `totalPages` (`Number`).
- [ ] `apps/store-api/src/user/user.controller.ts` updated — the file-local
      `UserListResponseEnvelope` class has:
  - `@ApiProperty({ type: [UserEntity] }) data!: UserEntity[]`
  - `@ApiProperty({ type: PaginationMeta }) meta!: PaginationMeta`
- [ ] `apps/store-api/src/user/user.controller.ts` updated — `UserResponseEnvelope`
      class has `@ApiProperty({ type: UserEntity }) data!: UserEntity`.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run swagger:export -w apps/store-api` produces `swagger.json` where
      `UserEntity.firstName`, `UserEntity.lastName`, and `UserEntity.phone` resolve to
      `{ type: 'string', nullable: true }` (not `oneOf` / `anyOf` unresolved union).
- [ ] `swagger.json` shows `UserListResponseEnvelope` with typed `data` array and
      `meta` object (not `{ additionalProperties: true }`).
- [ ] `npm run test -w apps/store-api` passes (existing user service specs
      unaffected — entity shape is unchanged, only decorator metadata changed).

**Files to create/modify:**

- `apps/store-api/src/user/entities/user.entity.ts` — add `nullable: true, type: String` to `firstName`, `lastName`, `phone`
- `apps/store-api/src/user/user.controller.ts` — add `@ApiProperty` decorators to `PaginationMeta`, `UserListResponseEnvelope`, `UserResponseEnvelope`

---

### TASK-042-B: Regenerate Orval hooks for store-admin

**Type:** chore
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-042-A

**Acceptance Criteria:**

- [ ] `npm run swagger:export -w apps/store-api` runs without error.
- [ ] `npm run generate:api -w apps/store-admin` runs without error.
- [ ] `apps/store-admin/src/shared/api/generated/models/userEntityFirstName.ts`
      regenerated — no longer exports `{ [key: string]: unknown }`, instead exports
      `type UserEntityFirstName = string | null` (or the equivalent nullable string type
      that Orval produces).
- [ ] `apps/store-admin/src/shared/api/generated/models/userEntityLastName.ts`
      regenerated — same fix as `firstName`.
- [ ] `apps/store-admin/src/shared/api/generated/models/userEntityPhone.ts`
      regenerated — same fix.
- [ ] `apps/store-admin/src/shared/api/generated/models/userListResponseEnvelope.ts`
      regenerated — no longer exports `{ [key: string]: unknown }`, instead exports a
      typed interface `{ data: UserEntity[]; meta: PaginationMeta }` (or the equivalent
      Orval-generated named interface).
- [ ] `apps/store-admin/src/shared/api/generated/users/users.ts` regenerated —
      `useUserControllerFindAll` return type resolves to the newly typed envelope.
- [ ] Generated files are NOT hand-edited.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/generated/` — regenerated (do not hand-edit)

---

### TASK-042-C: Create entities/user barrel slice in store-admin

**Type:** feat
**Scope:** store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** TASK-042-B

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/entities/user/index.ts` created, re-exporting from
      `@/shared/api`:
  - Types: `UserEntity`, `UserListResponseEnvelope`, `UserControllerFindAllParams`
    (generated params type), `UserControllerFindById200` (generated single-user
    response type if Orval generates it as a model)
  - Hooks: `useUserControllerFindAll`, `useUserControllerFindById`,
    `useUserControllerDeactivateUser`, `useUserControllerActivateUser`
  - Query key getters: `getUserControllerFindAllQueryKey`,
    `getUserControllerFindByIdQueryKey`
- [ ] `apps/store-admin/src/entities/index.ts` updated to add
      `export * from './user'`.
- [ ] FSD import rule satisfied: `entities` layer imports only from `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/entities/user/index.ts` — new barrel
- `apps/store-admin/src/entities/index.ts` — add `export * from './user'`

---

### TASK-042-D: Create features/user-ban-toggle slice

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-042-C

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/features/user-ban-toggle/ui/UserBanToggle.tsx` created:
  - Props: `{ userId: string; isActive: boolean }`
  - A "use client" component.
  - When `isActive` is `true`: renders a `Button` variant `"destructive"` with label
    "Deactivate" — calls `useUserControllerDeactivateUser` mutation on click.
  - When `isActive` is `false`: renders a `Button` variant `"default"` (or `"outline"`)
    with label "Activate" — calls `useUserControllerActivateUser` mutation on click.
  - On success: invalidates `getUserControllerFindAllQueryKey()` and
    `getUserControllerFindByIdQueryKey(userId)` via `useQueryClient()`; shows a
    sonner success toast: "User deactivated." / "User activated.".
  - On error: shows a sonner error toast: "Failed to update user status.".
  - Button is disabled while either mutation is pending.
  - `aria-label` reflects the action: "Deactivate user" / "Activate user".
- [ ] `apps/store-admin/src/features/user-ban-toggle/index.ts` barrel exports
      `UserBanToggle`.
- [ ] `apps/store-admin/src/features/index.ts` updated to add
      `export * from './user-ban-toggle'`.
- [ ] FSD: `features` layer imports only from `entities` and `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/features/user-ban-toggle/ui/UserBanToggle.tsx` — new file
- `apps/store-admin/src/features/user-ban-toggle/index.ts` — new barrel
- `apps/store-admin/src/features/index.ts` — add re-export

---

### TASK-042-E: Create widgets/user-list slice (AdminUserTable + Skeleton)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-042-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/user-list/ui/AdminUserTableSkeleton.tsx` created
      — 5 animated skeleton rows matching the user table column structure (6 columns).
- [ ] `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx` created:
  - A "use client" component.
  - Reads `?search=`, `?role=`, `?isActive=`, and `?page=` URL query params via
    `useSearchParams()` for list state.
  - Provides three filters above the table:
    - Search `<Input>` (debounced 300 ms) that sets `?search=` param via
      `router.replace`.
    - Role `<Select>` (options: All, CUSTOMER, ADMIN) sets `?role=` param.
    - Status `<Select>` (options: All, Active, Inactive) sets `?isActive=` param.
  - Fetches users via `useUserControllerFindAll` with params mapped from URL state.
  - Renders a `shadcn/ui` `Table` with columns: Initials (avatar-like `<div>` with
    first letter of email), Email, Name (firstName + lastName or "—"), Role (`Badge`),
    Status (`Badge`), Joined (formatted `createdAt`), Actions.
  - Role badge colors: `ADMIN` = `"default"` (blue), `CUSTOMER` = `"secondary"`.
  - Status badge colors: active = `"default"` (green), inactive = `"destructive"`.
  - Actions column: `View` link (`<Link href={`/users/${user.id}`}>`) as a `Button`
    variant `"outline"` size `"sm"`.
  - Shows `AdminUserTableSkeleton` while loading.
  - Shows empty-state message when no users match the current filters.
  - Pagination controls (Previous / page N of M / Next) using `Button` components;
    disables Previous on page 1, Next on last page. Sets `?page=` param on click.
- [ ] `apps/store-admin/src/widgets/user-list/index.ts` exports `AdminUserTable`
      and `AdminUserTableSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add `AdminUserTable` and
      `AdminUserTableSkeleton` exports.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/user-list/ui/AdminUserTableSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/user-list/ui/AdminUserTable.tsx` — new file
- `apps/store-admin/src/widgets/user-list/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-042-F: Create widgets/user-detail slice (UserDetailView + Skeleton)

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-042-D

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/user-detail/ui/UserDetailSkeleton.tsx` created
      — animated placeholder for the full detail layout.
- [ ] `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.tsx` created:
  - Props: `{ userId: string }`
  - A "use client" component.
  - Fetches user via `useUserControllerFindById(userId)` from `@/entities/user`.
  - While loading: renders `UserDetailSkeleton`.
  - On 404 (`error?.response?.status === 404`): redirects to `/users` via
    `router.replace('/users')`.
  - On load success, renders a two-column layout:
    - **Left / main column:**
      - Page header: user email as title + `<Link>` "Back to Users" → `/users`.
      - Profile card: large initials avatar (`<div>`), email, full name (or "—"),
        phone (or "—"), role `Badge`, status `Badge` (Active / Inactive), member
        since date.
      - `UserBanToggle` component (from `features/user-ban-toggle`), passing
        `userId` and `isActive`.
    - **Right / sidebar column:**
      - Account metadata card: User ID (monospace), `createdAt`, `updatedAt`.
- [ ] `apps/store-admin/src/widgets/user-detail/index.ts` exports `UserDetailView`
      and `UserDetailSkeleton`.
- [ ] `apps/store-admin/src/widgets/index.ts` updated to add `UserDetailView` and
      `UserDetailSkeleton` exports.
- [ ] FSD: `widgets` layer imports only from `features`, `entities`, `shared`.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/user-detail/ui/UserDetailSkeleton.tsx` — new file
- `apps/store-admin/src/widgets/user-detail/ui/UserDetailView.tsx` — new file
- `apps/store-admin/src/widgets/user-detail/index.ts` — new barrel
- `apps/store-admin/src/widgets/index.ts` — add re-exports

---

### TASK-042-G: Create app route pages for user management

**Type:** feat
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-042-E, TASK-042-F

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/app/(dashboard)/users/page.tsx` created:
  - Server Component with `export const metadata = { title: 'Users — Admin' }`.
  - Renders a page header: heading "Users".
  - Renders `<Suspense fallback={<AdminUserTableSkeleton />}><AdminUserTable /></Suspense>`.
  - Filter and pagination state are driven by URL query params consumed inside
    `AdminUserTable` (client component) — no server-side params needed.
- [ ] `apps/store-admin/src/app/(dashboard)/users/[id]/page.tsx` created:
  - Server Component.
  - `generateMetadata`: returns `{ title: 'User [id] — Admin' }` (show truncated ID).
  - Accepts `{ params: Promise<{ id: string }> }` and uses `await params`
    (Next.js 15 async params pattern — mirrors `orders/[id]/page.tsx`).
  - Renders `<Suspense fallback={<UserDetailSkeleton />}><UserDetailView userId={id} /></Suspense>`.
- [ ] All pages are gated by the existing `(dashboard)/layout.tsx`
      `AdminShellGuard` — no additional guard needed.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/app/(dashboard)/users/page.tsx` — new file
- `apps/store-admin/src/app/(dashboard)/users/[id]/page.tsx` — new file

---

### TASK-042-H: Fix AdminSidebar Users link

**Type:** fix
**Scope:** store-admin
**Complexity:** S (< 0.5h)
**TDD Required:** No
**Depends on:** TASK-042-G

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` updated:
      `href: '#'` for the Users nav item changed to `href: '/users'`.
- [ ] Active-link logic (`isNavItemActive`) works for `/users` and `/users/[id]`
      without code change (existing `pathname.startsWith(`${href}/`)` covers sub-routes).
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run typecheck -w apps/store-admin` passes.

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — change Users `href` from `#` to `/users`

---

### TASK-042-I: Add backend e2e tests for admin user endpoints

**Type:** test
**Scope:** store-api
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-042-A

**Acceptance Criteria:**

- [ ] `apps/store-api/test/user.e2e-spec.ts` (or a new dedicated
      `user-admin.e2e-spec.ts`) extended with a `describe('Admin User Management')` block:
  - `GET /api/users` returns `401` without token.
  - `GET /api/users` returns `403` with a non-admin (CUSTOMER) token.
  - `GET /api/users` returns `200` with an admin token — body matches `UserListResponseEnvelope`:
    `{ data: UserEntity[], meta: { total, page, limit, totalPages } }`.
  - `GET /api/users?search=…` returns filtered results.
  - `GET /api/users?role=CUSTOMER` returns only CUSTOMER users.
  - `GET /api/users/:id` returns `404` for non-existent UUID.
  - `GET /api/users/:id` returns `200` with the user's `UserEntity` (no `passwordHash`).
  - `PATCH /api/users/:id/deactivate` returns `403` for non-admin; `200` + `isActive: false` for admin.
  - `PATCH /api/users/:id/activate` returns `200` + `isActive: true` for admin on a previously deactivated user.
  - `PATCH /api/users/:id/deactivate` returns `404` for non-existent UUID.
- [ ] `npm run test:e2e -w apps/store-api` passes with all new specs green.
- [ ] `npm run test -w apps/store-api` passes (existing unit specs unaffected).

**Files to create/modify:**

- `apps/store-api/test/user.e2e-spec.ts` — extend existing file with admin scenarios (or create `user-admin.e2e-spec.ts`)

---

### TASK-042-J: Build, lint, typecheck, test verification gate

**Type:** chore
**Scope:** store-api, store-admin
**Complexity:** S (0.5-1h)
**TDD Required:** No
**Depends on:** All previous TASK-042-\* subtasks

**Acceptance Criteria:**

- [ ] `npm run build` (all workspaces) completes without error.
- [ ] `npm run lint` passes across all workspaces.
- [ ] `npm run typecheck` passes across all workspaces.
- [ ] `npm run test -w apps/store-api` passes — all existing unit specs green;
      user service and repository specs unaffected by Swagger decorator changes.
- [ ] `npm run test:e2e -w apps/store-api` passes — new admin user e2e specs green
      (TASK-042-I).
- [ ] Manual smoke test (running app):
  - Navigate to `/users` in `store-admin` — user table loads with all users from
    seeded data.
  - Search input filters table by email / name; `?search=` appears in the URL.
  - Role select filters to CUSTOMER or ADMIN users; `?role=` appears in the URL.
  - Active-status select filters to active or inactive users; `?isActive=` appears.
  - Pagination controls navigate between pages when there are more than 20 users.
  - Click "View" on a user row → `/users/[id]` detail page renders profile, role
    badge, and status badge.
  - "Deactivate" button on an active user calls the endpoint, user status badge
    updates to Inactive, and a success toast appears.
  - "Activate" button on an inactive user re-activates the account, status badge
    updates, toast appears.
  - Users sidebar link is active-highlighted on `/users` and `/users/[id]` routes.

---

## Migration Steps

No Prisma migration is required for this feature.

1. Fix Swagger `@ApiProperty` types on `UserEntity` and `UserController` envelope
   classes (TASK-042-A).
2. Regenerate Orval API hooks (TASK-042-B).
3. Create the `entities/user` barrel slice (TASK-042-C).
4. Implement the `features/user-ban-toggle` slice (TASK-042-D).
5. Implement `widgets/user-list` and `widgets/user-detail` in parallel (TASK-042-E,
   TASK-042-F).
6. Create the app route pages once both widgets are ready (TASK-042-G).
7. Fix the AdminSidebar Users link (TASK-042-H).
8. Extend e2e tests for admin user endpoints (TASK-042-I, can be done in parallel
   with frontend steps after TASK-042-A).
9. Run the full verification gate (TASK-042-J).

---

## Affected Files — Full Bottom-Up List

### Backend (store-api)

| File                               | Action                                                                                              | Subtask |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| `src/user/entities/user.entity.ts` | Modify — add `nullable: true, type: String` to `firstName`, `lastName`, `phone` decorators          | 042-A   |
| `src/user/user.controller.ts`      | Modify — add `@ApiProperty` to `PaginationMeta`, `UserListResponseEnvelope`, `UserResponseEnvelope` | 042-A   |
| `test/user.e2e-spec.ts`            | Modify — add admin-endpoint scenarios                                                               | 042-I   |

### Frontend (store-admin)

| File                                                  | Action                                            | Subtask      |
| ----------------------------------------------------- | ------------------------------------------------- | ------------ |
| `src/shared/api/generated/`                           | Regenerate (do not hand-edit)                     | 042-B        |
| `src/entities/user/index.ts`                          | Create — user entity barrel                       | 042-C        |
| `src/entities/index.ts`                               | Modify — add `export * from './user'`             | 042-C        |
| `src/features/user-ban-toggle/ui/UserBanToggle.tsx`   | Create                                            | 042-D        |
| `src/features/user-ban-toggle/index.ts`               | Create — barrel                                   | 042-D        |
| `src/features/index.ts`                               | Modify — add `export * from './user-ban-toggle'`  | 042-D        |
| `src/widgets/user-list/ui/AdminUserTableSkeleton.tsx` | Create                                            | 042-E        |
| `src/widgets/user-list/ui/AdminUserTable.tsx`         | Create                                            | 042-E        |
| `src/widgets/user-list/index.ts`                      | Create — barrel                                   | 042-E        |
| `src/widgets/user-detail/ui/UserDetailSkeleton.tsx`   | Create                                            | 042-F        |
| `src/widgets/user-detail/ui/UserDetailView.tsx`       | Create                                            | 042-F        |
| `src/widgets/user-detail/index.ts`                    | Create — barrel                                   | 042-F        |
| `src/widgets/index.ts`                                | Modify — add user-list + user-detail re-exports   | 042-E, 042-F |
| `src/app/(dashboard)/users/page.tsx`                  | Create — user list route                          | 042-G        |
| `src/app/(dashboard)/users/[id]/page.tsx`             | Create — user detail route                        | 042-G        |
| `src/widgets/admin-shell/admin-sidebar.tsx`           | Modify — change Users `href` from `#` to `/users` | 042-H        |

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                        | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UserListResponseEnvelope` stays untyped after Orval regen if swagger.json still emits unresolved `oneOf` for nullable fields                                                                                                                               | Verify the fix in TASK-042-A by inspecting the generated swagger.json directly for `UserEntity.firstName` schema before proceeding to TASK-042-B.                                                                                                                                                                                                                                                                                                |
| `useUserControllerFindAll` already exists in `generated/users/users.ts` — adding it to `entities/user` barrel may cause a re-export name collision with the existing `shared/api/index.ts`                                                                  | The `shared/api/index.ts` already `export *`s from `generated/users/users`. The `entities/user` barrel re-exports named items from `@/shared/api` (not from the generated file directly), so there is no circular dependency. The `entities/index.ts` re-export does not conflict because it uses `export * from './user'` which re-exports the same names as already available via `shared`. Widgets import from `@/entities/user` for clarity. |
| Admin can ban themselves (the currently logged-in ADMIN user)                                                                                                                                                                                               | The `UserBanToggle` component should disable the ban action when `userId` matches the currently authenticated user's ID. The current admin's ID is available from `useAuth()` in `@/entities/session`. Add a `disabled` prop check: if `userId === currentUser?.id`, render a disabled button with tooltip "Cannot deactivate your own account." This guards against accidental self-ban without requiring a backend change.                     |
| `UserController` at `/api/users` mixes customer endpoints (`/me`) and admin endpoints — the current `JwtAuthGuard + RolesGuard` pattern (not `AdminGuard`) means the controller structure slightly differs from the category/order admin controller pattern | This is intentional — `UserController` predates `AdminGuard` (introduced in TASK-038-B) and was designed with mixed customer+admin endpoints. The existing guard combination (`JwtAuthGuard` + `@Roles(ADMIN)` via `RolesGuard`) is functionally equivalent to `AdminGuard` (which itself wraps `JwtAuthGuard + RolesGuard`). No controller refactor is needed for this task; a future cleanup task can migrate to `AdminGuard` uniformly.       |
| `await params` pattern required for Next.js 15                                                                                                                                                                                                              | Explicitly called out in TASK-042-G. Mirror the exact pattern from `orders/[id]/page.tsx`.                                                                                                                                                                                                                                                                                                                                                       |

---

## Sequencing Diagram

```
TASK-042-A  (backend: fix Swagger @ApiProperty on UserEntity + envelopes)
    └── TASK-042-B  (Orval regen — typed UserListResponseEnvelope + correct nullable fields)
    │         └── TASK-042-C  (entities/user barrel)
    │                   └── TASK-042-D  (features/user-ban-toggle)
    │                             ├── TASK-042-E  (widgets/user-list)
    │                             │         └── TASK-042-G  (app route pages)
    │                             │                   └── TASK-042-H  (sidebar link)
    │                             │                             └── TASK-042-J  (verify)
    │                             └── TASK-042-F  (widgets/user-detail)
    │                                       └── TASK-042-G  (app route pages)
    └── TASK-042-I  (e2e tests — can run in parallel with frontend after 042-A)
```

TASK-042-E and TASK-042-F can be worked on in parallel after TASK-042-D completes.
TASK-042-G gates on both TASK-042-E and TASK-042-F.
TASK-042-I can start as soon as TASK-042-A is complete (backend fix only; no frontend dependency).

---

## Notes

- **Why no dedicated `AdminUserController`?** Unlike `AdminOrderController` and
  `AdminCategoryController`, there are no customer-facing user list or single-user
  lookup endpoints. All non-profile user endpoints (`GET /api/users`,
  `GET /api/users/:id`, `PATCH .../deactivate`, `PATCH .../activate`) are already
  admin-only. A separate `admin/users` prefix controller would create endpoint
  duplication without benefit. The backend is complete; only the Swagger decorator
  fix is needed.

- **Self-ban prevention** is a UI-only guard (see Risks). The backend does not
  prevent an admin from deactivating their own account. For MVP this UI guard
  is sufficient; a future task can add a backend check
  (`if (req.user.id === id) throw new ForbiddenException(...)`).

- **Orval-generated hook names:** All hooks in `generated/users/users.ts` already
  use the `userController*` prefix (not `adminUserController*`). This is because
  the controller class is `UserController` (not `AdminUserController`). The barrel
  in `entities/user` simply re-exports them — no name aliasing needed.

- **`UserControllerFindById200` vs. a named envelope:** The `GET /api/users/:id`
  endpoint uses the inline `schema: { allOf: [...] }` pattern in its `@ApiResponse`
  (not `type: UserResponseEnvelope`). This means Orval may generate an opaque
  `UserControllerFindById200` type. TASK-042-A switches the single-user response
  decorators to `type: UserResponseEnvelope` (with `UserResponseEnvelope` being a
  properly decorated class), resolving this to a clean typed model. This is covered
  in the TASK-042-A acceptance criteria for `UserResponseEnvelope`.
