# Plan: Auth Module (Register, Login, Refresh Tokens)

> **Status:** 🔄 In Progress
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-05-04
> **Last Updated:** 2026-05-04

## Overview

Implement the complete authentication module for the NestJS backend. This includes user registration, login with JWT access tokens, refresh token rotation with HttpOnly cookies, logout, and JWT guards for protecting future endpoints. The auth module is the foundation for all role-based access control in the application.

## Scope

### In Scope

- Prisma `RefreshToken` model for persistent refresh token tracking
- AuthRepository — database operations for users and refresh tokens
- AuthService — registration, login, token generation, refresh token rotation, logout
- AuthController — register, login, refresh, logout endpoints
- JWT Strategy + Refresh Token Strategy (Passport)
- JwtAuthGuard — protects endpoints requiring authentication
- RolesGuard — protects admin-only endpoints
- `@CurrentUser()` decorator — extract authenticated user from request
- `@Roles()` decorator — declare required roles on endpoints
- Password hashing with argon2 (already installed)
- HttpOnly cookie-based refresh tokens with rotation
- Rate limiting on auth endpoints (stricter than global)
- Unit tests for AuthService (TDD approach for token logic)

### Out of Scope

- Email verification / password reset — Phase 5
- OAuth / social login — future phase
- Frontend auth UI (login/register forms) — Phase 2
- Swagger/OpenAPI decorators — TASK-014 (will be added later)
- Two-factor authentication — future phase

## User Stories

1. **As a new customer**, I want to register with my email and password, so that I can create an account and start shopping.
2. **As a registered customer**, I want to log in with my credentials, so that I can access my account and cart.
3. **As a logged-in user**, I want my session to persist across page refreshes, so that I don't have to re-login constantly.
4. **As a user**, I want to log out securely, so that my session is invalidated on the server.
5. **As a system**, I want to protect admin endpoints from regular users, so that only authorized admins can manage the store.

## Technical Design

### Data Model

The `User` model already exists in the Prisma schema. We need to add a `RefreshToken` model for persistent token tracking and rotation:

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime @map("expires_at")
  isRevoked Boolean  @default(false) @map("is_revoked")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
```

The existing `User` model already has the required fields:

- `passwordHash` — argon2 hashed password
- `role` — `CUSTOMER` or `ADMIN`
- `isActive` — soft-disable accounts

### Backend (NestJS — Clean Architecture)

#### Module Structure

```
apps/store-api/src/auth/
  auth.module.ts
  auth.controller.ts
  auth.service.ts
  auth.repository.ts
  dto/
    register.dto.ts
    login.dto.ts
  entities/
    auth-tokens.entity.ts
  guards/
    jwt-auth.guard.ts
    jwt-refresh.guard.ts
    roles.guard.ts
  decorators/
    current-user.decorator.ts
    roles.decorator.ts
  strategies/
    jwt-access.strategy.ts
    jwt-refresh.strategy.ts
  index.ts
```

#### AuthRepository

```typescript
// Key methods:
findByEmail(email: string): Promise<User | null>
findById(id: string): Promise<User | null>
createUser(data: CreateUserInput): Promise<User>
findRefreshToken(token: string): Promise<RefreshTokenWithUser | null>
saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken>
revokeToken(id: string): Promise<void>
revokeAllUserTokens(userId: string): Promise<void>
revokeExpiredTokens(): Promise<void>
```

#### AuthService

```typescript
// Key methods:
register(dto: RegisterDto): Promise<AuthTokens>
  — Check email uniqueness, hash password, create user, generate token pair
login(dto: LoginDto): Promise<AuthTokens>
  — Find user by email, verify password with argon2, generate token pair
refreshToken(oldToken: string): Promise<AuthTokens>
  — Validate stored token, check not revoked/expired, REVOKE old, issue new pair (rotation)
logout(userId: string, token?: string): Promise<void>
  — Revoke all user's refresh tokens
generateTokenPair(userId: string, role: UserRole): AuthTokens
  — Sign access token (15m) + refresh token (7d), persist refresh token
```

**TDD Note:** The `generateTokenPair` and `refreshToken` methods contain critical security logic. Tests must verify:

- Token payload contains correct `sub` and `role`
- Refresh token is persisted before being returned
- Old refresh token is revoked during rotation
- Expired/revoked tokens are rejected

#### AuthController

| Method | Path             | Guard             | Request Body  | Response                                             |
| ------ | ---------------- | ----------------- | ------------- | ---------------------------------------------------- |
| POST   | `/auth/register` | —                 | `RegisterDto` | `{ data: { accessToken } }` + set refresh cookie     |
| POST   | `/auth/login`    | —                 | `LoginDto`    | `{ data: { accessToken } }` + set refresh cookie     |
| POST   | `/auth/refresh`  | `JwtRefreshGuard` | — (cookie)    | `{ data: { accessToken } }` + set new refresh cookie |
| POST   | `/auth/logout`   | `JwtAuthGuard`    | —             | `{ data: { message: 'Logged out' } }` + clear cookie |

#### Guards

- **JwtAuthGuard** — extends `AuthGuard('jwt-access')`, validates Bearer token in `Authorization` header
- **JwtRefreshGuard** — extends `AuthGuard('jwt-refresh')`, validates refresh token from cookie
- **RolesGuard** — checks `@Roles()` metadata against `user.role` from request

#### Decorators

- **`@CurrentUser()`** — extracts `{ id, role }` from `request.user`
- **`@Roles('ADMIN')`** — sets metadata for `RolesGuard`

### Missing Dependencies

The following packages need to be installed:

| Package                | Purpose                     |
| ---------------------- | --------------------------- |
| `passport`             | Passport.js base library    |
| `passport-jwt`         | JWT strategy for Passport   |
| `@types/passport-jwt`  | TypeScript types            |
| `cookie-parser`        | Parse cookies from requests |
| `@types/cookie-parser` | TypeScript types            |

### API Contract

#### Register

```
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongP@ss123",
  "firstName": "John",    // optional
  "lastName": "Doe"       // optional
}

Response 201:
{
  "data": {
    "accessToken": "eyJ..."
  }
}
Set-Cookie: refreshToken=eyJ...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
```

#### Login

```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongP@ss123"
}

Response 200:
{
  "data": {
    "accessToken": "eyJ..."
  }
}
Set-Cookie: refreshToken=eyJ...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
```

#### Refresh Token

```
POST /auth/refresh
Cookie: refreshToken=eyJ...

Response 200:
{
  "data": {
    "accessToken": "eyJ..."
  }
}
Set-Cookie: refreshToken=eyJ...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
```

#### Logout

```
POST /auth/logout
Authorization: Bearer eyJ...
Cookie: refreshToken=eyJ...

Response 200:
{
  "data": {
    "message": "Logged out"
  }
}
Set-Cookie: refreshToken=; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=0
```

### Environment Variables

Already present in `.env`, but need to add `JWT_REFRESH_SECRET` for separate signing:

```
JWT_SECRET=dev-secret-change-in-production        # For access tokens
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production  # For refresh tokens (separate secret)
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
BCRYPT_SALT_ROUNDS=12                             # For argon2, this is timeCost
```

## Tasks

### TASK-010-A: Add RefreshToken Model to Prisma Schema

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**

- [ ] `RefreshToken` model added to `schema.prisma` with fields: `id`, `token`, `userId`, `expiresAt`, `isRevoked`, `createdAt`
- [ ] Relation to `User` model configured with `onDelete: Cascade`
- [ ] Indexes on `userId` and `expiresAt`
- [ ] `npx prisma migrate dev` creates migration successfully
- [ ] `npx prisma generate` succeeds without errors

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — Add RefreshToken model and update User relation
- `apps/store-api/prisma/migrations/` — New migration folder created by Prisma

---

### TASK-010-B: Install Missing Auth Dependencies

**Type:** chore
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**

- [ ] `passport` installed
- [ ] `passport-jwt` installed
- [ ] `@types/passport-jwt` installed as dev dependency
- [ ] `cookie-parser` installed
- [ ] `@types/cookie-parser` installed as dev dependency
- [ ] `npm run build -w apps/store-api` succeeds after installation

**Files to create/modify:**

- `apps/store-api/package.json` — Add dependencies

---

### TASK-010-C: Configure Cookie Parser in main.ts

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-010-B

**Acceptance Criteria:**

- [ ] `cookie-parser` middleware registered in `main.ts`
- [ ] Cookies are accessible via `req.cookies` in controllers
- [ ] Existing functionality (health check, CORS, Helmet) still works

**Files to create/modify:**

- `apps/store-api/src/main.ts` — Add `app.use(cookieParser())`

---

### TASK-010-D: Create Auth DTOs (RegisterDto, LoginDto)

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**

- [ ] `RegisterDto` with `email` (valid email), `password` (min 8 chars), optional `firstName`, `lastName`
- [ ] `LoginDto` with `email` (valid email), `password`
- [ ] All fields decorated with `class-validator` decorators
- [ ] Validation rejects invalid emails, short passwords, extra fields
- [ ] `ApiProperty` decorators ready for Swagger (TASK-014)

**Files to create/modify:**

- `apps/store-api/src/auth/dto/register.dto.ts` — Registration input validation
- `apps/store-api/src/auth/dto/login.dto.ts` — Login input validation
- `apps/store-api/src/auth/dto/index.ts` — Barrel export

---

### TASK-010-E: Create Auth Entity (AuthTokens)

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**

- [ ] `AuthTokens` entity class with `accessToken` and `refreshToken` fields
- [ ] Clean separation from Prisma models (domain entity)
- [ ] Exported from `entities/index.ts`

**Files to create/modify:**

- `apps/store-api/src/auth/entities/auth-tokens.entity.ts` — Token pair domain entity
- `apps/store-api/src/auth/entities/index.ts` — Barrel export

---

### TASK-010-F: Implement AuthRepository

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-010-A

**Acceptance Criteria:**

- [ ] `findByEmail(email)` returns user or null
- [ ] `findById(id)` returns user or null
- [ ] `createUser(data)` creates and returns new user
- [ ] `findRefreshToken(token)` returns token with user relation or null
- [ ] `saveRefreshToken(userId, token, expiresAt)` persists refresh token
- [ ] `revokeToken(id)` sets `isRevoked = true`
- [ ] `revokeAllUserTokens(userId)` revokes all tokens for a user
- [ ] All methods use Prisma through `PrismaService`
- [ ] No business logic — only database operations

**Files to create/modify:**

- `apps/store-api/src/auth/auth.repository.ts` — Database access layer
- `apps/store-api/src/auth/auth.module.ts` — Register repository provider

---

### TASK-010-G: Write Unit Tests for AuthService (TDD — Red Phase)

**Type:** test
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes
**Depends on:** TASK-010-D, TASK-010-E, TASK-010-F

**Acceptance Criteria:**

- [ ] Test file `auth.service.spec.ts` created with failing tests
- [ ] Test: `register` throws `ConflictException` when email exists
- [ ] Test: `register` creates user and returns tokens when email is new
- [ ] Test: `login` throws `UnauthorizedException` when email not found
- [ ] Test: `login` throws `UnauthorizedException` when password is wrong
- [ ] Test: `login` returns tokens when credentials are valid
- [ ] Test: `refreshToken` throws `UnauthorizedException` when token is invalid
- [ ] Test: `refreshToken` throws `UnauthorizedException` when token is revoked
- [ ] Test: `refreshToken` throws `UnauthorizedException` when token is expired
- [ ] Test: `refreshToken` revokes old token and returns new pair (rotation)
- [ ] Test: `logout` revokes all user tokens
- [ ] Tests use mocked `AuthRepository` and `JwtService`

**Files to create/modify:**

- `apps/store-api/src/auth/auth.service.spec.ts` — Unit tests (failing first)

---

### TASK-010-H: Implement AuthService (TDD — Green Phase)

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** Yes
**Depends on:** TASK-010-G

**Acceptance Criteria:**

- [ ] All tests from TASK-010-G pass (green)
- [ ] `register` checks email uniqueness, hashes password with argon2, creates user, returns tokens
- [ ] `login` finds user, verifies password with argon2, returns tokens
- [ ] `refreshToken` validates, revokes old token, issues new pair (rotation)
- [ ] `logout` revokes all user refresh tokens
- [ ] `generateTokenPair` uses `JWT_SECRET` for access, `JWT_REFRESH_SECRET` for refresh
- [ ] Access token payload: `{ sub: userId, role, iat, exp }`
- [ ] Refresh token payload: `{ sub: userId, type: 'refresh', iat, exp }`
- [ ] No passwords or hashes in returned data

**Files to create/modify:**

- `apps/store-api/src/auth/auth.service.ts` — Business logic
- `apps/store-api/src/auth/auth.module.ts` — Register service, JwtModule config

---

### TASK-010-I: Implement JWT Strategies (Access + Refresh)

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-010-H

**Acceptance Criteria:**

- [ ] `JwtAccessStrategy` extracts token from `Authorization: Bearer` header
- [ ] `JwtAccessStrategy` validates payload and returns `{ id, role }`
- [ ] `JwtRefreshStrategy` extracts token from `refreshToken` cookie
- [ ] `JwtRefreshStrategy` validates payload (checks `type: 'refresh'`)
- [ ] Both strategies use correct secrets from `ConfigService`
- [ ] Strategies registered as providers in `AuthModule`

**Files to create/modify:**

- `apps/store-api/src/auth/strategies/jwt-access.strategy.ts` — Access token strategy
- `apps/store-api/src/auth/strategies/jwt-refresh.strategy.ts` — Refresh token strategy
- `apps/store-api/src/auth/strategies/index.ts` — Barrel export
- `apps/store-api/src/auth/auth.module.ts` — Register strategies

---

### TASK-010-J: Implement Guards (JwtAuth, JwtRefresh, Roles)

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-010-I

**Acceptance Criteria:**

- [ ] `JwtAuthGuard` extends `AuthGuard('jwt-access')`
- [ ] `JwtRefreshGuard` extends `AuthGuard('jwt-refresh')`
- [ ] `RolesGuard` reads `@Roles()` metadata and checks against `user.role`
- [ ] `RolesGuard` returns `true` if no roles required (public endpoints)
- [ ] `RolesGuard` returns `false` (throws 403) if user role doesn't match
- [ ] All guards exported from `guards/index.ts`

**Files to create/modify:**

- `apps/store-api/src/auth/guards/jwt-auth.guard.ts` — JWT access guard
- `apps/store-api/src/auth/guards/jwt-refresh.guard.ts` — JWT refresh guard
- `apps/store-api/src/auth/guards/roles.guard.ts` — Role-based access guard
- `apps/store-api/src/auth/guards/index.ts` — Barrel export

---

### TASK-010-K: Implement Decorators (CurrentUser, Roles)

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-010-J

**Acceptance Criteria:**

- [ ] `@CurrentUser()` returns full user object from request
- [ ] `@CurrentUser('id')` returns only the user ID
- [ ] `@Roles('ADMIN')` sets metadata readable by `RolesGuard`
- [ ] `@Roles('ADMIN', 'CUSTOMER')` supports multiple roles
- [ ] Decorators exported from `decorators/index.ts`

**Files to create/modify:**

- `apps/store-api/src/auth/decorators/current-user.decorator.ts` — Extract user from request
- `apps/store-api/src/auth/decorators/roles.decorator.ts` — Role metadata decorator
- `apps/store-api/src/auth/decorators/index.ts` — Barrel export

---

### TASK-010-L: Implement AuthController

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-010-H, TASK-010-J, TASK-010-K

**Acceptance Criteria:**

- [ ] `POST /auth/register` — creates user, returns access token, sets refresh cookie
- [ ] `POST /auth/login` — validates credentials, returns access token, sets refresh cookie
- [ ] `POST /auth/refresh` — guarded by `JwtRefreshGuard`, rotates token, sets new refresh cookie
- [ ] `POST /auth/logout` — guarded by `JwtAuthGuard`, revokes tokens, clears cookie
- [ ] Refresh cookie: `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: 'strict'`, `path: '/auth/refresh'`
- [ ] Rate limiting applied: max 5 requests per minute on login/register
- [ ] Response envelope: `{ data: { accessToken } }` for register/login/refresh
- [ ] Response envelope: `{ data: { message: 'Logged out' } }` for logout
- [ ] Controller registered in `AuthModule`

**Files to create/modify:**

- `apps/store-api/src/auth/auth.controller.ts` — HTTP routes
- `apps/store-api/src/auth/auth.module.ts` — Register controller, finalize module
- `apps/store-api/src/auth/index.ts` — Barrel export

---

### TASK-010-M: Register AuthModule in AppModule

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-010-L

**Acceptance Criteria:**

- [ ] `AuthModule` imported in `AppModule`
- [ ] `JwtModule` configured globally with async factory reading from `ConfigService`
- [ ] Application starts without errors: `npm run start:dev -w apps/store-api`
- [ ] All endpoints accessible at `/auth/*` prefix

**Files to create/modify:**

- `apps/store-api/src/app.module.ts` — Import AuthModule, configure JwtModule globally

---

### TASK-010-N: Write E2E Tests for Auth Endpoints

**Type:** test
**Scope:** store-api
**Complexity:** L
**TDD Required:** No
**Depends on:** TASK-010-L, TASK-010-M

**Acceptance Criteria:**

- [ ] E2E test: Register new user → returns 201 with access token
- [ ] E2E test: Register duplicate email → returns 409 Conflict
- [ ] E2E test: Login with valid credentials → returns 200 with access token + refresh cookie
- [ ] E2E test: Login with wrong password → returns 401
- [ ] E2E test: Refresh with valid token → returns new access token + new refresh cookie
- [ ] E2E test: Refresh with revoked token → returns 401
- [ ] E2E test: Logout → revokes tokens, clears cookie
- [ ] E2E test: Access protected endpoint without token → returns 401
- [ ] E2E test: Access protected endpoint with valid token → returns 200
- [ ] Tests use isolated test database (or mock Prisma)
- [ ] `npm run test:e2e -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/test/auth.e2e-spec.ts` — E2E tests for auth flow
- `apps/store-api/test/jest-e2e.json` — Update if needed for test DB config

---

### TASK-010-O: Update .env with JWT_REFRESH_SECRET

**Type:** chore
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-010-H

**Acceptance Criteria:**

- [ ] `JWT_REFRESH_SECRET` added to `.env` with a value different from `JWT_SECRET`
- [ ] `.env.example` updated with all auth-related variables
- [ ] `ConfigService` reads both secrets in `AuthModule`

**Files to create/modify:**

- `apps/store-api/.env` — Add JWT_REFRESH_SECRET
- `apps/store-api/.env.example` — Create template with all variables

## Migration Steps

1. **Install dependencies** (TASK-010-B) — `passport`, `passport-jwt`, `cookie-parser`, types
2. **Add Prisma model** (TASK-010-A) — Add `RefreshToken` model, run `prisma migrate dev`
3. **Configure cookie parser** (TASK-010-C) — Add middleware to `main.ts`
4. **Create DTOs and entities** (TASK-010-D, TASK-010-E) — Input validation and domain types
5. **Implement repository** (TASK-010-F) — Database access layer
6. **Write failing tests** (TASK-010-G) — TDD Red phase for AuthService
7. **Implement service** (TASK-010-H) — TDD Green phase, make tests pass
8. **Implement strategies** (TASK-010-I) — JWT access + refresh Passport strategies
9. **Implement guards** (TASK-010-J) — JwtAuth, JwtRefresh, Roles guards
10. **Implement decorators** (TASK-010-K) — CurrentUser, Roles decorators
11. **Implement controller** (TASK-010-L) — Register, login, refresh, logout endpoints
12. **Register module** (TASK-010-M) — Import AuthModule in AppModule
13. **Write e2e tests** (TASK-010-N) — Full auth flow integration tests
14. **Update environment** (TASK-010-O) — Add JWT_REFRESH_SECRET to .env

## Risks & Mitigations

| Risk                                                        | Mitigation                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| argon2 native bindings fail on Windows                      | Pre-built binaries available for Windows; if issues, fallback to bcrypt (install `bcrypt` + `@types/bcrypt`) |
| Refresh token cookie not sent in cross-origin requests      | CORS configured with `credentials: true`; cookie `sameSite: 'strict'` with correct `path`                    |
| JWT_SECRET too short causes security warnings               | Enforce minimum 32 characters in validation; document in .env.example                                        |
| Token rotation race condition (concurrent refresh requests) | Use Prisma transactions for revoke + create; document that clients should serialize refresh calls            |
| Test database state leaking between e2e tests               | Clean up refresh tokens between tests; use unique test emails per test                                       |
| Passport strategy not found by name                         | Ensure strategy names (`'jwt-access'`, `'jwt-refresh'`) match guard `AuthGuard()` arguments                  |

## Notes

- **Password hashing:** The project uses `argon2` (already in package.json). Use `argon2.hash()` and `argon2.verify()` instead of bcrypt.
- **Separate JWT secrets:** Access tokens and refresh tokens should use different signing secrets for defense in depth.
- **Token rotation:** Every refresh invalidates the old token and issues a new pair. This limits the window of token theft.
- **Cookie path:** Refresh cookie is scoped to `/auth/refresh` path so it's only sent on refresh requests, not every API call.
- **Swagger decorators:** Will be added in TASK-014. DTOs are structured with `ApiProperty` placeholders ready for that task.
- **Frontend auth:** Login/register UI will be built in Phase 2. The frontend will use the generated Orval hooks from TASK-015/016.
- **Existing .env:** Already has `JWT_SECRET`, `JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`. Only `JWT_REFRESH_SECRET` needs to be added.
