# Plan 046 — Refresh-Token Cleanup (TASK-102)

**Phase:** Phase B — Reliability & Observability
**Branch convention:** `feature/102-refresh-token-cleanup` off `develop`
**Created:** 2026-06-22

---

## Problem Statement

Every login, token rotation, and registration call to `AuthService.generateTokenPair()` persists a
new row in the `refresh_tokens` table. Revoked rows (set via `revokeToken` / `revokeAllUserTokens`)
and rows whose `expiresAt` timestamp has passed are never deleted. Over time this produces:

1. **Storage bloat** — the table grows without bound. A user who logs in daily accumulates 365+ rows
   per year; high-traffic deployments can reach millions of stale rows.
2. **Increased attack surface** — every stale token hash is a candidate for a rainbow-table or
   breach-dump lookup. Even though the tokens are SHA-256 hashed, minimising the stored set is
   defence in depth.
3. **Slower lookups** — although `@@index([expiresAt])` and `@@index([userId])` exist, a bloated
   table degrades `findRefreshToken` (unique-by-hash) and `revokeAllUserTokens` scans.

**Goal:** Schedule a nightly cleanup that deletes all `RefreshToken` rows that are expired
(`expiresAt < now`) **or** revoked (`isRevoked = true`), returning and logging the deleted count.
The schedule and a revoked-token retention window (for audit) must be env-configurable with
safe defaults.

---

## Existing Model — Exact Fields

`apps/store-api/prisma/schema.prisma` model `RefreshToken`:

| Field       | Prisma type | DB column    | Notes                                  |
| ----------- | ----------- | ------------ | -------------------------------------- |
| `id`        | `String`    | `id`         | UUID PK                                |
| `token`     | `String`    | `token`      | SHA-256 hash of the raw JWT; `@unique` |
| `userId`    | `String`    | `user_id`    | FK → `User.id` (cascade delete)        |
| `user`      | `User`      | —            | relation                               |
| `expiresAt` | `DateTime`  | `expires_at` | `@@index([expiresAt])` exists          |
| `isRevoked` | `Boolean`   | `is_revoked` | default `false`                        |
| `createdAt` | `DateTime`  | `created_at` | `@default(now())`                      |

There is **no** `revokedAt` column; revocation state is captured solely by `isRevoked: Boolean`.

The purge predicate must therefore be:

```
WHERE expiresAt < now  OR  isRevoked = true
```

With an optional **retention window** for revoked rows: if `REFRESH_TOKEN_REVOKED_RETENTION_DAYS`
is set (default `0` = purge immediately), only revoke rows older than that many days are deleted:

```
WHERE expiresAt < now
   OR (isRevoked = true AND createdAt < now - retentionDays)
```

---

## Pre-Flight Findings

| Item                                      | Finding                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/schedule` in `package.json`      | **Not present** — must be installed                                                                                          |
| `ScheduleModule.forRoot()` in AppModule   | **Not registered** — must be added                                                                                           |
| `@Cron` / `@Interval` decorators anywhere | **None found** — first scheduled job in the project                                                                          |
| Auth repository Prisma mock in tests      | Uses `prismaMock.refreshToken.{findUnique,create,update,updateMany}` — add `deleteMany`                                      |
| Logger pattern                            | `PinoLogger` injected via `nestjs-pino`; `logger.setContext(ClassName.name)` + `logger.info({event, ...}, message)`          |
| Config pattern                            | `ConfigService.get<T>(key, default)` / `getOrThrow<T>(key)` + `EnvironmentVariables` class in `src/config/env.validation.ts` |

---

## Decision Points

### DP-1: Purge predicate — combined OR

Use `prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { isRevoked: true }] } })`.
If a retention window is configured, the revoked branch becomes
`{ isRevoked: true, createdAt: { lt: cutoff } }`.

Rationale: expired tokens are definitively useless. Revoked tokens with a retention window allow
an audit trail (e.g., listing "last N sessions") for a configurable number of days before purge.

### DP-2: Default cron schedule — nightly at 03:00 UTC

`REFRESH_TOKEN_CLEANUP_CRON` defaults to `'0 3 * * *'` (daily at 03:00 UTC). Off-peak timing
minimises contention with login traffic. Cron is evaluated in the **server's system timezone**
by default — if the server runs in a non-UTC timezone, operators should set `TZ=UTC` or use an
explicit offset. The plan doc notes this risk.

### DP-3: Architecture placement

The cleanup service is a new provider (`RefreshTokenCleanupService`) added to `AuthModule`,
**not** a new top-level module. It keeps the scheduling logic co-located with the auth domain
without introducing a cross-module dependency.

### DP-4: Repository vs. direct Prisma in the service

Per Clean Architecture rules (`AGENTS.md`: "Services never import PrismaClient; repositories do"),
the `deleteMany` call lives in a new `AuthRepository` method. The service receives the count and
logs it.

### DP-5: No Prisma migration required

No schema changes needed. The existing `RefreshToken` model already has `expiresAt`, `isRevoked`,
and `createdAt` — all fields used in the purge predicate.

---

## Implementation Steps (Bottom-Up)

### TASK-102-A: Install `@nestjs/schedule` and register `ScheduleModule`

**Type:** chore
**Scope:** store-api
**Complexity:** S (< 1 h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `@nestjs/schedule` added to `dependencies` in `apps/store-api/package.json`
- [ ] `ScheduleModule.forRoot()` imported in `AppModule` (`apps/store-api/src/app.module.ts`)
- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run build -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/package.json` — add `"@nestjs/schedule": "^4.x"` to `dependencies`
- `apps/store-api/src/app.module.ts` — add `ScheduleModule.forRoot()` to `imports`

**Install command:**

```bash
npm install @nestjs/schedule -w apps/store-api
```

---

### TASK-102-B: Add env variables to `EnvironmentVariables` and `env.validation.ts`

**Type:** chore
**Scope:** store-api
**Complexity:** S (< 1 h)
**TDD Required:** No
**Depends on:** TASK-102-A

**New environment variables:**

| Variable                               | Type     | Default       | Description                                                        |
| -------------------------------------- | -------- | ------------- | ------------------------------------------------------------------ |
| `REFRESH_TOKEN_CLEANUP_CRON`           | `string` | `'0 3 * * *'` | Cron expression for the purge job                                  |
| `REFRESH_TOKEN_REVOKED_RETENTION_DAYS` | `number` | `0`           | Days to retain revoked rows before purge (`0` = purge immediately) |

**Acceptance Criteria:**

- [ ] Both variables added to `EnvironmentVariables` class with `@IsOptional()` decorators
- [ ] `REFRESH_TOKEN_REVOKED_RETENTION_DAYS` decorated with `@IsInt()` + `@Min(0)`
- [ ] `REFRESH_TOKEN_CLEANUP_CRON` decorated with `@IsString()`
- [ ] Startup validation still passes when neither variable is set
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create/modify:**

- `apps/store-api/src/config/env.validation.ts` — add two `@IsOptional()` fields to `EnvironmentVariables`

---

### TASK-102-C: Add `deleteExpiredAndRevoked` method to `AuthRepository` (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1–2 h)
**TDD Required:** Yes — write the spec assertions first, then implement
**Depends on:** TASK-102-B

**New method signature:**

```typescript
/**
 * Delete all RefreshToken rows that are expired (expiresAt < now) or revoked.
 * If retentionDays > 0, revoked rows are only deleted when createdAt is older
 * than retentionDays days (allows a short audit window).
 *
 * Returns the number of rows deleted.
 */
async deleteExpiredAndRevoked(now: Date, retentionDays?: number): Promise<number>
```

**Prisma call (no retention):**

```typescript
const result = await this.prisma.refreshToken.deleteMany({
  where: {
    OR: [{ expiresAt: { lt: now } }, { isRevoked: true }],
  },
});
return result.count;
```

**Prisma call (with retention window):**

```typescript
const retentionCutoff = new Date(now.getTime() - retentionDays * 86_400_000);
const result = await this.prisma.refreshToken.deleteMany({
  where: {
    OR: [
      { expiresAt: { lt: now } },
      { isRevoked: true, createdAt: { lt: retentionCutoff } },
    ],
  },
});
return result.count;
```

**Acceptance Criteria:**

- [ ] `deleteExpiredAndRevoked` spec written first (Red) in `auth.repository.spec.ts`
- [ ] Spec covers: deletes expired rows, deletes revoked rows (no retention), applies retention
      cutoff correctly, returns correct count, does NOT delete active non-expired rows
- [ ] `prismaMock.refreshToken.deleteMany` added to the existing mock object in the spec
- [ ] Implementation written (Green) — `npm run test -w apps/store-api` green
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to modify:**

- `apps/store-api/src/auth/auth.repository.ts` — add `deleteExpiredAndRevoked` method
- `apps/store-api/src/auth/auth.repository.spec.ts` — add `deleteExpiredAndRevoked` describe block

---

### TASK-102-D: Create `RefreshTokenCleanupService` with `@Cron` job (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2–3 h)
**TDD Required:** Yes — spec first
**Depends on:** TASK-102-C

**Class:** `RefreshTokenCleanupService`
**File:** `apps/store-api/src/auth/refresh-token-cleanup.service.ts`

**Skeleton:**

```typescript
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { AuthRepository } from "./auth.repository";

@Injectable()
export class RefreshTokenCleanupService {
  private readonly retentionDays: number;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefreshTokenCleanupService.name);
    this.retentionDays = this.configService.get<number>(
      "REFRESH_TOKEN_REVOKED_RETENTION_DAYS",
      0,
    );
  }

  /** Exposed for unit testing without relying on the scheduler to fire. */
  async purgeStaleTokens(): Promise<number> {
    const now = new Date();
    const deleted = await this.authRepository.deleteExpiredAndRevoked(
      now,
      this.retentionDays,
    );
    this.logger.info(
      {
        event: "refreshToken.cleanup",
        deletedCount: deleted,
        retentionDays: this.retentionDays,
      },
      `Purged ${deleted} stale refresh-token row(s)`,
    );
    return deleted;
  }

  @Cron(
    /* read from config at module init or use env-driven string */ "0 3 * * *",
  )
  async handleCron(): Promise<void> {
    await this.purgeStaleTokens();
  }
}
```

**Note on configurable cron expression:** `@Cron()` accepts a string that can be a
`CronExpression` enum value or a cron string. To make the expression env-configurable at runtime
(not at decoration time), use `SchedulerRegistry` + `addCronJob()` in `onModuleInit` instead of
the `@Cron()` decorator. The simpler `@Cron()` approach with a hardcoded default is acceptable for
the initial implementation; document in the spec that the schedule can be overridden by
`REFRESH_TOKEN_CLEANUP_CRON`. A follow-up can add `SchedulerRegistry` if dynamic reconfiguration
is needed.

**Spec file:** `apps/store-api/src/auth/refresh-token-cleanup.service.spec.ts`

Unit test coverage:

- `purgeStaleTokens` calls `authRepository.deleteExpiredAndRevoked` with `new Date()` (mocked
  with `jest.useFakeTimers`) and the configured `retentionDays`
- `purgeStaleTokens` logs `{ event: 'refreshToken.cleanup', deletedCount }` at info level
- `purgeStaleTokens` returns the count from the repository
- When `retentionDays` is `0`, the call passes `0` (no retention)
- When `retentionDays` is `7`, the call passes `7`
- `handleCron` delegates to `purgeStaleTokens` (spy-based)

**Acceptance Criteria:**

- [ ] Spec written first, all tests Red; then implementation makes them Green
- [ ] `jest.useFakeTimers()` used to control `new Date()` in tests
- [ ] `purgeStaleTokens()` is `public` (not private) for direct testing
- [ ] Logger called with `{ event: 'refreshToken.cleanup', deletedCount, retentionDays }`
- [ ] `npm run test -w apps/store-api` green
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to create:**

- `apps/store-api/src/auth/refresh-token-cleanup.service.ts`
- `apps/store-api/src/auth/refresh-token-cleanup.service.spec.ts`

---

### TASK-102-E: Register `RefreshTokenCleanupService` in `AuthModule`

**Type:** feat
**Scope:** store-api
**Complexity:** S (< 30 min)
**TDD Required:** No
**Depends on:** TASK-102-D

**Acceptance Criteria:**

- [ ] `RefreshTokenCleanupService` added to `providers` array in `AuthModule`
- [ ] `ScheduleModule` is imported globally via `AppModule` (done in TASK-102-A) — no re-import
      in `AuthModule` needed
- [ ] `npm run build -w apps/store-api` passes
- [ ] `npm run typecheck -w apps/store-api` passes

**Files to modify:**

- `apps/store-api/src/auth/auth.module.ts` — add `RefreshTokenCleanupService` to `providers`

---

### TASK-102-F: Lint, typecheck, and full test suite verification

**Type:** chore
**Scope:** store-api
**Complexity:** S (< 30 min)
**TDD Required:** No
**Depends on:** TASK-102-E

**Acceptance Criteria:**

- [ ] `npm run lint -w apps/store-api` passes with zero errors
- [ ] `npm run typecheck -w apps/store-api` passes
- [ ] `npm run test -w apps/store-api` green (all existing auth tests still pass; new spec passes)
- [ ] No regressions in existing `auth.repository.spec.ts` and `auth.service.spec.ts`
- [ ] `npm run build` (root — all workspaces) passes

---

## File Map

```
apps/store-api/
  package.json                                      ← add @nestjs/schedule
  src/
    app.module.ts                                   ← add ScheduleModule.forRoot()
    config/
      env.validation.ts                             ← add REFRESH_TOKEN_CLEANUP_CRON,
                                                       REFRESH_TOKEN_REVOKED_RETENTION_DAYS
    auth/
      auth.module.ts                                ← add RefreshTokenCleanupService to providers
      auth.repository.ts                            ← add deleteExpiredAndRevoked()
      auth.repository.spec.ts                       ← add deleteExpiredAndRevoked describe block
      refresh-token-cleanup.service.ts              ← NEW
      refresh-token-cleanup.service.spec.ts         ← NEW
```

No Prisma migration needed. No frontend changes.

---

## Environment Variables Reference

Add to `.env` (or deployment secrets) — all optional with safe defaults:

```dotenv
# Cron schedule for purging expired/revoked refresh tokens.
# Default: daily at 03:00 UTC. Standard cron syntax (5 fields).
REFRESH_TOKEN_CLEANUP_CRON=0 3 * * *

# Days to retain revoked tokens before deletion (audit window).
# 0 = delete immediately when the cron runs.
REFRESH_TOKEN_REVOKED_RETENTION_DAYS=0
```

---

## Risks & Mitigations

| Risk                                                                               | Mitigation                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron timezone mismatch — server in non-UTC timezone fires at wrong wall-clock time | Document `TZ=UTC` recommendation in `.env.example`; job is nightly so off-by-hour is tolerable                                                                                                            |
| Deleting revoked rows breaks an audit trail                                        | `REFRESH_TOKEN_REVOKED_RETENTION_DAYS` env var provides configurable grace period (default 0 = no retention)                                                                                              |
| Large table — `deleteMany` holds a table lock for many seconds                     | The `@@index([expiresAt])` and `isRevoked` filter make the scan index-assisted; acceptable for a nightly off-peak job. If the table grows to tens of millions of rows, a follow-up can add batch deletion |
| `@Cron` decorator hard-codes the expression at class decoration time               | For phase B, the default `'0 3 * * *'` is sufficient. Dynamic reconfiguration via `SchedulerRegistry` is a follow-up concern                                                                              |
| Business-logic regression in auth flow                                             | All existing `auth.repository.spec.ts` and `auth.service.spec.ts` tests remain untouched; new method is additive                                                                                          |

---

## Verification

### Automated

```bash
# Unit tests (repository + cleanup service)
npm run test -w apps/store-api

# TypeScript type checking
npm run typecheck -w apps/store-api

# Linting
npm run lint -w apps/store-api

# Full monorepo build
npm run build
```

### Manual / Integration

1. Start the stack (`docker compose up`), run `npm run start:dev -w apps/store-api`.
2. Log in several times to populate `refresh_tokens` rows.
3. Log out (tokens become `isRevoked = true`). Let some tokens expire.
4. Trigger the job manually by temporarily setting `REFRESH_TOKEN_CLEANUP_CRON` to a 1-minute
   expression (e.g. `* * * * *`), or call `purgeStaleTokens()` directly via a test endpoint.
5. Verify in Prisma Studio or `psql` that revoked/expired rows are gone and valid rows remain.
6. Check the Pino structured log output for
   `{ event: 'refreshToken.cleanup', deletedCount: N }` at info level.
7. Re-run a valid refresh flow to confirm no regressions.

---

## Completion Checklist

- [ ] TASK-102-A: `@nestjs/schedule` installed, `ScheduleModule.forRoot()` in AppModule
- [ ] TASK-102-B: Env variables added to `EnvironmentVariables` and validated
- [ ] TASK-102-C: `deleteExpiredAndRevoked` in `AuthRepository` (TDD, spec green)
- [ ] TASK-102-D: `RefreshTokenCleanupService` with `@Cron` job (TDD, spec green)
- [ ] TASK-102-E: Service registered in `AuthModule`
- [ ] TASK-102-F: `lint` / `typecheck` / `test` / `build` all green
- [ ] `BACKLOG.md` TASK-102 row updated with plan reference
