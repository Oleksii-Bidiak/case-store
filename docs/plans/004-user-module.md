# Plan: User Module (CRUD, Profile)

> **Status:** 🔄 In Progress
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-05-05
> **Last Updated:** 2026-05-05

## Overview

Implement the User module for the NestJS backend following Clean Architecture. This module provides user profile management (view/update profile) and admin user management (list users, view details, deactivate/activate). User creation is handled by the Auth module during registration, so the User module focuses on read and update operations.

## Scope

### In Scope

- UserRepository — database operations for user queries and updates
- UserService — business logic for profile management and admin user management
- UserController — REST endpoints for user profile and admin operations
- DTOs — UpdateProfileDto, UserListQueryDto, UserResponseDto
- Entity — UserEntity (domain entity, excludes sensitive fields)
- Module — UserModule registration with proper exports
- Unit tests for UserService (TDD for profile update logic)
- E2E tests for user endpoints

### Out of Scope

- User registration (handled by Auth module)
- Password change/reset (future phase — Phase 5)
- Email verification (future phase)
- Address management (separate module in future phase)
- Admin panel UI (Phase 4)
- Swagger/OpenAPI decorators (TASK-014 — will be added later)

## User Stories

1. **As an authenticated user**, I want to view my profile, so that I can see my account details.
2. **As an authenticated user**, I want to update my profile (name, phone), so that I can keep my information current.
3. **As an admin**, I want to view a paginated list of all users, so that I can manage the user base.
4. **As an admin**, I want to view a specific user's details, so that I can review their account.
5. **As an admin**, I want to deactivate/activate user accounts, so that I can block malicious users without deleting data.

## Technical Design

### Data Model

No Prisma schema changes needed. The `User` model already exists with all required fields:

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  firstName     String?   @map("first_name")
  lastName      String?   @map("last_name")
  phone         String?
  role          UserRole  @default(CUSTOMER)
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  cart          Cart?
  orders        Order[]
  addresses     Address[]
  reviews       Review[]
  refreshTokens RefreshToken[]

  @@map("users")
}
```

### Backend (NestJS — Clean Architecture)

#### Module Structure

```
apps/store-api/src/user/
  user.module.ts
  user.controller.ts
  user.service.ts
  user.repository.ts
  user.service.spec.ts
  dto/
    update-profile.dto.ts
    user-list-query.dto.ts
    index.ts
  entities/
    user.entity.ts
    index.ts
  index.ts
```

#### UserRepository

```typescript
// Key methods:
findById(id: string): Promise<User | null>
findByEmail(email: string): Promise<User | null>
findAll(params: FindAllParams): Promise<{ users: User[]; total: number }>
update(id: string, data: UpdateUserInput): Promise<User>
deactivate(id: string): Promise<User>
activate(id: string): Promise<User>
```

**Note:** `findByEmail` is also in `AuthRepository`, but the User module needs its own for profile operations (e.g., checking email uniqueness on update). The repositories serve different purposes: Auth uses it for authentication, User uses it for profile management.

#### UserService

```typescript
// Key methods:
getProfile(userId: string): Promise<UserEntity>
  — Find user by ID, throw NotFoundException if not found
  — Return UserEntity (excludes passwordHash, refreshTokens)

updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserEntity>
  — Validate email uniqueness if email is being changed
  — Update allowed fields (firstName, lastName, phone, email)
  — Return updated UserEntity

findAll(query: UserListQueryDto): Promise<{ data: UserEntity[]; meta: PaginationMeta }>
  — Paginated list with optional filtering by role, isActive status
  — Admin-only endpoint

findById(id: string): Promise<UserEntity>
  — Find user by ID for admin view
  — Throw NotFoundException if not found

deactivateUser(id: string): Promise<UserEntity>
  — Set isActive = false
  — Admin-only endpoint
  — Throw NotFoundException if user not found

activateUser(id: string): Promise<UserEntity>
  — Set isActive = true
  — Admin-only endpoint
  — Throw NotFoundException if user not found
```

**TDD Note:** The `updateProfile` method contains business logic that should be tested:

- Email uniqueness validation when changing email
- Only allowed fields can be updated (no role changes through profile update)
- Returns UserEntity without sensitive fields

#### UserController

| Method | Path                    | Guard                     | Request Body       | Response                                       |
| ------ | ----------------------- | ------------------------- | ------------------ | ---------------------------------------------- |
| GET    | `/users/me`             | JwtAuthGuard              | —                  | `{ data: UserEntity }`                         |
| PUT    | `/users/me`             | JwtAuthGuard              | `UpdateProfileDto` | `{ data: UserEntity }`                         |
| GET    | `/users`                | JwtAuthGuard + RolesGuard | — (query params)   | `{ data: UserEntity[], meta: PaginationMeta }` |
| GET    | `/users/:id`            | JwtAuthGuard + RolesGuard | —                  | `{ data: UserEntity }`                         |
| PATCH  | `/users/:id/deactivate` | JwtAuthGuard + RolesGuard | —                  | `{ data: UserEntity }`                         |
| PATCH  | `/users/:id/activate`   | JwtAuthGuard + RolesGuard | —                  | `{ data: UserEntity }`                         |

#### UserEntity

Domain entity that strips sensitive fields from the Prisma `User` model:

```typescript
export class UserEntity {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Note: passwordHash and refreshTokens are EXCLUDED
}
```

#### DTOs

**UpdateProfileDto:**

```typescript
export class UpdateProfileDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsPhoneNumber() // or custom validation
  phone?: string;
}
```

**UserListQueryDto:**

```typescript
export class UserListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string; // Search by email, firstName, lastName
}
```

### API Contract

#### Get Current User Profile

```
GET /api/users/me
Authorization: Bearer eyJ...

Response 200:
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+380991234567",
    "role": "CUSTOMER",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

#### Update Profile

```
PUT /api/users/me
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "firstName": "Jane",
  "phone": "+380997654321"
}

Response 200:
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "phone": "+380997654321",
    "role": "CUSTOMER",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-05-05T12:00:00.000Z"
  }
}
```

#### List Users (Admin)

```
GET /api/users?page=1&limit=20&role=CUSTOMER&isActive=true&search=john
Authorization: Bearer eyJ... (admin)

Response 200:
{
  "data": [...],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

#### Get User by ID (Admin)

```
GET /api/users/:id
Authorization: Bearer eyJ... (admin)

Response 200:
{
  "data": { ... }
}

Response 404:
{
  "error": "Not Found",
  "message": "User not found",
  "statusCode": 404
}
```

#### Deactivate User (Admin)

```
PATCH /api/users/:id/deactivate
Authorization: Bearer eyJ... (admin)

Response 200:
{
  "data": { ..., "isActive": false }
}
```

#### Activate User (Admin)

```
PATCH /api/users/:id/activate
Authorization: Bearer eyJ... (admin)

Response 200:
{
  "data": { ..., "isActive": true }
}
```

## Tasks

### TASK-011-A: Create User DTOs (UpdateProfileDto, UserListQueryDto) ✅

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** None
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] `UpdateProfileDto` with optional `email`, `firstName`, `lastName`, `phone` fields
- [x] `UserListQueryDto` with `page`, `limit`, `role`, `isActive`, `search` fields
- [x] All fields decorated with `class-validator` decorators
- [x] `ApiProperty` decorators ready for Swagger (TASK-014)
- [x] `Transform` decorator on `isActive` for string-to-boolean conversion; `@Type(() => Number)` on `page` and `limit`
- [x] Barrel export from `dto/index.ts`

**Files to create/modify:**

- `apps/store-api/src/user/dto/update-profile.dto.ts` — Profile update input validation
- `apps/store-api/src/user/dto/user-list-query.dto.ts` — User list query params validation
- `apps/store-api/src/user/dto/index.ts` — Barrel export

---

### TASK-011-B: Create User Entity ✅

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** None
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] `UserEntity` class with fields: `id`, `email`, `firstName`, `lastName`, `phone`, `role`, `isActive`, `createdAt`, `updatedAt`
- [x] `passwordHash` and `refreshTokens` are EXCLUDED from the entity
- [x] Static method `fromPrisma(user)` to create entity from Prisma User model
- [x] Exported from `entities/index.ts`

**Files to create/modify:**

- `apps/store-api/src/user/entities/user.entity.ts` — User domain entity
- `apps/store-api/src/user/entities/index.ts` — Barrel export

---

### TASK-011-C: Implement UserRepository ✅

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** None
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] `findById(id)` returns user or null
- [x] `findByEmail(email)` returns user or null
- [x] `findAll(params)` returns paginated users with total count, supports filtering by `role`, `isActive`, and `search` (email/firstName/lastName)
- [x] `update(id, data)` updates user fields and returns updated user
- [x] `deactivate(id)` sets `isActive = false` and returns updated user
- [x] `activate(id)` sets `isActive = true` and returns updated user
- [x] All methods use Prisma through `PrismaService`
- [x] No business logic — only database operations
- [x] `FindAllParams` and `UpdateUserInput` interfaces defined

**Files to create/modify:**

- `apps/store-api/src/user/user.repository.ts` — Database access layer

---

### TASK-011-D: Write Unit Tests for UserService (TDD — Red Phase) ✅

**Type:** test
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes
**Depends on:** TASK-011-A, TASK-011-B, TASK-011-C
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] Test file `user.service.spec.ts` created with failing tests
- [x] Test: `getProfile` returns UserEntity when user found
- [x] Test: `getProfile` throws NotFoundException when user not found
- [x] Test: `updateProfile` updates allowed fields and returns UserEntity
- [x] Test: `updateProfile` throws ConflictException when email is already taken by another user
- [x] Test: `updateProfile` allows user to keep their own email without conflict
- [x] Test: `updateProfile` does not allow changing role through profile update
- [x] Test: `updateProfile` throws NotFoundException when user not found during update
- [x] Test: `findAll` returns paginated results with meta
- [x] Test: `findAll` calculates totalPages correctly for multiple pages
- [x] Test: `findAll` passes filter parameters to repository
- [x] Test: `findById` (admin) returns UserEntity when user found
- [x] Test: `findById` (admin) throws NotFoundException when user not found
- [x] Test: `deactivateUser` sets isActive to false
- [x] Test: `deactivateUser` throws NotFoundException when user not found
- [x] Test: `activateUser` sets isActive to true
- [x] Test: `activateUser` throws NotFoundException when user not found
- [x] Tests use mocked `UserRepository`
- [x] Tests fail (Red phase) — UserService does not exist yet

**Files to create/modify:**

- `apps/store-api/src/user/user.service.spec.ts` — Unit tests (failing first)

---

### TASK-011-E: Implement UserService (TDD — Green Phase) ✅

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes
**Depends on:** TASK-011-D
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] All tests from TASK-011-D pass (green)
- [x] `getProfile(userId)` finds user, throws NotFoundException if not found, returns UserEntity
- [x] `updateProfile(userId, dto)` validates email uniqueness if email changed, updates allowed fields, returns UserEntity
- [x] `updateProfile` does NOT allow changing `role` or `isActive` through profile update
- [x] `findAll(query)` returns paginated list with filtering and search
- [x] `findById(id)` (admin) returns UserEntity or throws NotFoundException
- [x] `deactivateUser(id)` sets `isActive = false`, throws NotFoundException if not found
- [x] `activateUser(id)` sets `isActive = true`, throws NotFoundException if not found
- [x] All methods return `UserEntity` (never expose `passwordHash`)

**Files to create/modify:**

- `apps/store-api/src/user/user.service.ts` — Business logic
- `apps/store-api/src/user/user.module.ts` — Register service and repository providers

---

### TASK-011-F: Implement UserController ✅

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-011-E
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] `GET /users/me` — returns current user profile (JwtAuthGuard)
- [x] `PUT /users/me` — updates current user profile (JwtAuthGuard)
- [x] `GET /users` — paginated user list, admin-only (JwtAuthGuard + RolesGuard)
- [x] `GET /users/:id` — user details, admin-only (JwtAuthGuard + RolesGuard)
- [x] `PATCH /users/:id/deactivate` — deactivate user, admin-only (JwtAuthGuard + RolesGuard)
- [x] `PATCH /users/:id/activate` — activate user, admin-only (JwtAuthGuard + RolesGuard)
- [x] Response envelope: `{ data }` for single items, `{ data, meta }` for lists
- [x] Error responses: `{ error, message, statusCode }` for 404, 409, 403
- [x] Controller registered in UserModule

**Files to create/modify:**

- `apps/store-api/src/user/user.controller.ts` — HTTP routes
- `apps/store-api/src/user/user.module.ts` — Register controller, finalize module

---

### TASK-011-G: Register UserModule in AppModule ✅

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-011-F
**Completed:** 2026-05-05

**Acceptance Criteria:**

- [x] `UserModule` imported in `AppModule`
- [x] Application builds without errors: `npm run build -w apps/store-api`
- [x] TypeScript type checking passes: `npm run typecheck -w apps/store-api`
- [x] All endpoints accessible at `/api/users/*` prefix

**Files to create/modify:**

- `apps/store-api/src/app.module.ts` — Import UserModule
- `apps/store-api/src/user/index.ts` — Barrel export

---

### TASK-011-H: Write E2E Tests for User Endpoints

**Type:** test
**Scope:** store-api
**Complexity:** L
**TDD Required:** No
**Depends on:** TASK-011-G

**Acceptance Criteria:**

- [ ] E2E test: `GET /users/me` returns 200 with user profile for authenticated user
- [ ] E2E test: `GET /users/me` returns 401 without auth token
- [ ] E2E test: `PUT /users/me` updates profile and returns updated data
- [ ] E2E test: `PUT /users/me` returns 409 when email is taken by another user
- [ ] E2E test: `GET /users` returns 200 with paginated list for admin
- [ ] E2E test: `GET /users` returns 403 for non-admin user
- [ ] E2E test: `GET /users/:id` returns 200 for admin
- [ ] E2E test: `GET /users/:id` returns 404 for non-existent user
- [ ] E2E test: `PATCH /users/:id/deactivate` deactivates user (admin)
- [ ] E2E test: `PATCH /users/:id/activate` activates user (admin)
- [ ] `npm run test:e2e -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/test/user.e2e-spec.ts` — E2E tests for user endpoints

## Migration Steps

1. **Create DTOs** (TASK-011-A) — Input validation classes
2. **Create Entity** (TASK-011-B) — Domain entity that excludes sensitive fields
3. **Implement Repository** (TASK-011-C) — Database access layer
4. **Write failing tests** (TASK-011-D) — TDD Red phase for UserService
5. **Implement Service** (TASK-011-E) — TDD Green phase, make tests pass
6. **Implement Controller** (TASK-011-F) — HTTP routes with guards
7. **Register Module** (TASK-011-G) — Import UserModule in AppModule
8. **Write E2E tests** (TASK-011-H) — Full user endpoint integration tests

## Risks & Mitigations

| Risk                                        | Mitigation                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Email uniqueness check race condition       | Use database unique constraint (already exists on `User.email`) as safety net; service checks first, DB constraint catches edge cases |
| Admin endpoints accessible to regular users | `RolesGuard` with `@Roles('ADMIN')` decorator ensures only admins can access                                                          |
| Sensitive fields leaked in responses        | `UserEntity.fromPrisma()` explicitly maps only safe fields; never returns `passwordHash` or `refreshTokens`                           |
| Profile update allows role escalation       | `UpdateProfileDto` does not include `role` field; service strips any `role` from input                                                |
| Pagination performance with large datasets  | Default `limit` of 20, max 100; Prisma `skip`/`take` with `count` for total                                                           |

## Notes

- **No Prisma migration needed:** The `User` model already exists with all required fields. The User module only reads and updates existing data.
- **Separation from Auth module:** The Auth module handles registration, login, and token management. The User module handles profile viewing/updating and admin user management. Both modules can query the `User` table through their respective repositories.
- **Admin endpoints:** The `GET /users`, `GET /users/:id`, `PATCH /users/:id/deactivate`, and `PATCH /users/:id/activate` endpoints are admin-only, protected by `@Roles('ADMIN')` and `RolesGuard`.
- **User profile endpoints:** `GET /users/me` and `PUT /users/me` are available to any authenticated user (CUSTOMER or ADMIN).
- **Password change:** Not included in this module. Will be added in a future phase with email verification.
- **Swagger decorators:** Will be added in TASK-014. DTOs are structured with `ApiProperty` placeholders ready for that task.
