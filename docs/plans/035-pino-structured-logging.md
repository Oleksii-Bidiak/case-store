# Plan 035: Pino Structured Logging — Production-Grade Hardening

> **Status:** ✅ Done
> **Phase:** Phase 5 — Polish & Production
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-13
> **BACKLOG task:** TASK-047 (subtasks TASK-047-A through TASK-047-G)

---

## Overview

Phase 5 monitoring row in the roadmap reads: "Pino structured logging, Sentry error tracking, request duration logging." The `nestjs-pino` infrastructure is already wired and functional. This plan **does not** set up Pino from scratch — it closes the gap between the current minimal wiring and a production-grade structured logging setup per `requirements.md §6` (Logging & Observability) and `AGENTS.md "Logging & Monitoring"`.

### What already exists (do not duplicate)

| Item                                                                                                                                        | File                                                            | State                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `nestjs-pino` v4.2 + `pino-pretty` v13 installed                                                                                            | `apps/store-api/package.json`                                   | Done                                                      |
| `bufferLogs: true` + `app.useLogger(app.get(Logger))`                                                                                       | `apps/store-api/src/main.ts`                                    | Done                                                      |
| `LoggerModule.forRoot(...)` with `pino-pretty` in dev, level toggle by `process.env.NODE_ENV`                                               | `apps/store-api/src/app.module.ts:43–57`                        | Done (needs async migration)                              |
| `LoggingInterceptor` — logs `METHOD url status — duration ms`                                                                               | `apps/store-api/src/common/interceptors/logging.interceptor.ts` | Done (duplication risk)                                   |
| `HttpExceptionFilter` — logs unexpected errors with `{ err, path }`                                                                         | `apps/store-api/src/common/filters/http-exception.filter.ts`    | Done (partial)                                            |
| Both filter + interceptor registered as DI providers + applied globally in `main.ts`                                                        | `app.module.ts:94–99`, `main.ts:73–78`                          | Done                                                      |
| `PinoLogger` injected in `order.service.ts`, `auth.controller.ts`, `category.repository.ts`, `product.repository.ts`, `throttler/`, `csrf/` | 20+ files                                                       | Done (string-interpolation style, not structured objects) |
| `Logger` (NestJS built-in, not PinoLogger) injected in `cache.service.ts`, `mail.service.ts`                                                | Those files                                                     | Inconsistency                                             |

### What this plan delivers (the actual gap)

1. **Secret redaction** — `pino redact` paths for auth headers, cookies, and body credential/token fields. Security-critical.
2. **Request-ID correlation** — `genReqId` that reuses `X-Request-Id` or generates a UUID; expose on responses via `customProps`; every pino-http log line carries the ID.
3. **Custom req/res/err serializers** — control logged fields, trim noise, avoid dumping full objects.
4. **ConfigService-driven async config** — migrate `LoggerModule.forRoot` to `forRootAsync`; read `NODE_ENV` and new `LOG_LEVEL` from `ConfigService`; add `LOG_LEVEL` to `env.validation.ts`.
5. **Resolve request-log duplication** — `pino-http` `autoLogging` emits one log per request; `LoggingInterceptor` emits another. Pick a single source of truth.
6. **Critical business-event structured logs** — convert existing string-interpolated `logger.info(...)` calls in `order.service.ts` and add a structured log in `auth.service.ts` for user registration. Use `{ event, ... }` object form, not string concatenation.
7. **Health-check / noisy-route silencing** — configure `autoLogging.ignore` for `GET /health` to suppress the per-request log noise.
8. **Tests** — TDD unit tests for redaction and serializer shape; run the full verification gate as the final sub-task.

---

## Scope

### In Scope

- Migrate `LoggerModule.forRoot` to `LoggerModule.forRootAsync` in `app.module.ts`, reading config from `ConfigService`.
- Add `LOG_LEVEL` optional env var to `env.validation.ts`.
- Add `pino redact` configuration for the sensitive field paths listed in TASK-047-A.
- Add `genReqId` and `customProps` to `pinoHttp` options for per-request correlation ID.
- Add `req`/`res`/`err` serializers to `pinoHttp` options.
- Investigate and resolve double-logging between `pino-http` `autoLogging` and `LoggingInterceptor`. Document the chosen approach.
- Silence `GET /health` via `autoLogging.ignore`.
- Convert `order.service.ts` structured log calls from string interpolation to structured objects.
- Add a structured `user.registered` log to `auth.service.ts` in the `register()` method.
- Migrate `cache.service.ts` and `mail.service.ts` from NestJS built-in `Logger` to `PinoLogger` (for consistent JSON output in production).
- Unit tests (TDD): prove redaction replaces sensitive values with `[Redacted]`; prove serializers emit only the expected fields; prove request-id is present on log output.
- Verification gate: build, lint, typecheck, unit tests, e2e tests all green.

### Out of Scope

- Sentry integration (TASK-048).
- Frontend logging.
- Orval regeneration — this task is backend-only, no API shape changes.
- Prisma schema changes — no new tables.
- Log shipping / aggregation infrastructure (that is an ops concern; this plan only produces well-formed JSON logs).
- `pino-http` transport configuration change in production (the plan keeps `transport: undefined` in production so raw JSON is written to stdout for the log shipper to consume).

---

## User Stories

1. As a security engineer, I want sensitive values (JWT tokens, cookies, passwords) to never appear in log output, so that log aggregation systems (e.g., Datadog, Loki) cannot leak credentials.
2. As an on-call engineer, I want every log line for a single HTTP request to share the same `requestId`, so that I can search by ID and see the full trace of a request across all log lines.
3. As an ops engineer, I want log level to be configurable at runtime via a `LOG_LEVEL` env var, without a code change or redeploy of the config layer.
4. As a developer, I want `POST /api/orders` to emit a structured `{ event: 'order.created', orderId, userId }` log, so that business-event queries in the log aggregator are reliable and parseable.
5. As a developer, I want `GET /health` probe calls to not flood logs, so that high-frequency liveness probes do not obscure real request traffic.

---

## Architecture Decisions

### AD-1: Double-logging — autoLogging vs LoggingInterceptor

**Context:** `pino-http` (the Express middleware that `nestjs-pino`'s `LoggerModule` installs) has `autoLogging: true` by default. It emits one structured JSON log per completed HTTP request, including `method`, `url`, `statusCode`, `responseTime`, and `requestId`. The existing `LoggingInterceptor` also emits one log per request (`METHOD url status — duration ms`).

**Analysis:**

- `pino-http` autoLogging fires at the Express layer (after the response is sent). It captures `responseTime` from the http response `finish` event, includes serialized `req` and `res` objects, and automatically attaches the `requestId`.
- `LoggingInterceptor` fires inside the NestJS interceptor chain (before the response is sent for the `next()` branch, after for the `tap`). It formats a human-readable string that is redundant with autoLogging.
- Having both active produces two log entries per request — one at level `info` from autoLogging and one from the interceptor. This doubles log volume and adds confusion.

**Decision: keep `pino-http` autoLogging as the single source of truth for request-level logs; retire the `LoggingInterceptor` request-success line.**

Rationale:

- autoLogging is the canonical `pino-http` mechanism; it attaches `requestId` automatically via the shared child logger on `req.log`.
- The serializer defined in TASK-047-C will control exactly which fields appear, giving the same control as the interceptor — with less code.
- `LoggingInterceptor` still has value for **error logging**: the `error` branch logs `{ statusCode, duration, method, url }` plus the error message, which is richer than what autoLogging produces for error responses. Keep the interceptor but **remove the success-path `logger.info(...)` call** (the `next:` tap body). The error tap stays.
- `HttpExceptionFilter` logs unexpected errors (non-`HttpException`). This is complementary, not duplicative: it fires for 500s, while the interceptor error tap fires for all errors including 4xx thrown by services. Keep both but ensure they do not double-log the same error (the filter only logs when `!(exception instanceof HttpException)` — already guarded).

**Net result:** one request log from `pino-http`, one error log from the interceptor (only on error), one unhandled-exception log from the filter (only on 5xx non-HTTP errors). No double-logging.

### AD-2: Logger migration — NestJS Logger vs PinoLogger

`cache.service.ts` and `mail.service.ts` use `new Logger(ClassName)` (NestJS built-in). In production this produces NestJS's default human-readable format, not the Pino JSON format. When `app.useLogger(app.get(Logger))` is called in `main.ts`, the NestJS built-in `Logger` is replaced globally — so `new Logger(...)` instances already route through Pino at runtime. However, using `PinoLogger` directly enables structured object logging (first-arg object merged into the log line) which is not possible with the built-in `Logger` API.

**Decision:** Migrate `cache.service.ts` and `mail.service.ts` from `new Logger(...)` to injected `PinoLogger` for consistency. This is a small change with high value for log searchability (e.g., `cache.service.ts` already passes `{ err, key }` objects that would be better as structured fields).

### AD-3: genReqId strategy

Use an Express-compatible `genReqId` function that:

1. Reads the incoming `X-Request-Id` header (trusting an upstream reverse proxy or load balancer that already stamped it).
2. Falls back to `crypto.randomUUID()` when the header is absent.
3. Reflects the chosen ID back to the client via a `X-Request-Id` response header (set in `customProps` or a `onResFinished` hook).

The `requestId` field then appears on every `pino-http` child-logger log line automatically. `PinoLogger` instances in services log within the same Pino instance but as a separate child without the request context — they do not carry `requestId` unless explicitly passed as a log field.

For service-level logs that need correlation (e.g., `order.service.createOrder`), include `requestId` as an explicit field only when it is available from context. For Phase 5 scope, structured business-event logs pass domain IDs (`orderId`, `userId`) which are sufficient for correlation without needing the HTTP requestId.

---

## Technical Design

### pinoHttp options shape (target state in app.module.ts)

```ts
pinoHttp: {
  // ── Level ────────────────────────────────────────────────────────────────
  level: configService.get<string>('LOG_LEVEL', isProduction ? 'info' : 'debug'),

  // ── Request-ID correlation ───────────────────────────────────────────────
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },

  // ── Secret redaction ─────────────────────────────────────────────────────
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.passwordHash',
      'req.body.refreshToken',
      'req.body.accessToken',
      'req.body.token',
      'req.body.csrfToken',
    ],
    censor: '[Redacted]',
  },

  // ── Custom serializers ────────────────────────────────────────────────────
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: (err) => ({
      type: err.constructor?.name ?? 'Error',
      message: err.message,
      stack: err.stack,
      code: (err as NodeJS.ErrnoException).code,
    }),
  },

  // ── Suppress noisy health-check probes ────────────────────────────────────
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },

  // ── pino-pretty in development only ───────────────────────────────────────
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, singleLine: true },
      },
},
```

### LOG_LEVEL env var precedence

`LOG_LEVEL` allows operators to override the default level without changing `NODE_ENV`:

- If `LOG_LEVEL` is set, use it (e.g., `LOG_LEVEL=warn` in production to quieten verbose logs).
- If absent: `debug` in development, `info` in production (existing behaviour).

### Structured business-event log format

All business-event logs MUST use the structured object form:

```ts
// CORRECT — structured; searchable in log aggregator
this.logger.info(
  { event: "order.created", orderId: order.id, userId },
  "Order created",
);

// WRONG — string interpolation; not machine-parseable
this.logger.info(`Order ${order.id} created for user ${userId}`);
```

Target events per requirements.md §6:

| Event key              | Service method              | Fields                          |
| ---------------------- | --------------------------- | ------------------------------- |
| `order.created`        | `OrderService.createOrder`  | `orderId`, `userId`             |
| `order.cancelled`      | `OrderService.cancelOrder`  | `orderId`, `userId`             |
| `order.status_updated` | `OrderService.updateStatus` | `orderId`, `status`             |
| `user.registered`      | `AuthService.register`      | `userId`, `email` (no password) |

---

## Files to Create / Modify

### New files

| File                                                                 | Purpose                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/store-api/src/common/interceptors/logging.interceptor.spec.ts` | TDD unit tests for error-only interceptor behaviour                      |
| `apps/store-api/src/config/pino.config.spec.ts`                      | TDD unit tests: redaction, serializer output shape, requestId reflection |
| `apps/store-api/src/config/pino.config.ts`                           | Extracted `buildPinoHttpOptions` factory (keeps `app.module.ts` lean)    |

### Modified files

| File                                                            | Change                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/store-api/src/config/env.validation.ts`                   | Add `LOG_LEVEL` optional env var                                                  |
| `apps/store-api/src/app.module.ts`                              | Migrate `LoggerModule.forRoot` to `forRootAsync`; import `pino.config.ts` factory |
| `apps/store-api/src/common/interceptors/logging.interceptor.ts` | Remove success-path `logger.info(...)` (AD-1); keep error tap                     |
| `apps/store-api/src/order/order.service.ts`                     | Convert string-interpolated info logs to structured `{ event, ... }` form         |
| `apps/store-api/src/auth/auth.service.ts`                       | Inject `PinoLogger`; add `user.registered` structured info log in `register()`    |
| `apps/store-api/src/cache/cache.service.ts`                     | Replace `new Logger(...)` with injected `PinoLogger`                              |
| `apps/store-api/src/mail/mail.service.ts`                       | Replace `new Logger(...)` with injected `PinoLogger`                              |

---

## Ordered Sub-tasks

### TASK-047-A: Add `LOG_LEVEL` to `env.validation.ts` and migrate `LoggerModule` to `forRootAsync`

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `EnvironmentVariables` class in `apps/store-api/src/config/env.validation.ts` gains a `LOG_LEVEL` field under a `// ─── Logging ──────────────────────────────────────────────────────────────` comment section, decorated `@IsOptional()` and `@IsString()`.
- [ ] A comment above the field documents the accepted values (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) and the default behaviour (`debug` in development, `info` in production).
- [ ] `LoggerModule.forRoot({ ... })` in `apps/store-api/src/app.module.ts` is replaced with `LoggerModule.forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: ... })`.
- [ ] The `useFactory` reads `LOG_LEVEL` from `ConfigService` and falls back to `'debug'` / `'info'` by `NODE_ENV`. It NO LONGER reads `process.env.NODE_ENV` directly.
- [ ] `pino-pretty` transport still applies in non-production environments.
- [ ] `npm run build -w apps/store-api` exits 0.
- [ ] `npm run typecheck -w apps/store-api` exits 0.
- [ ] `npm run test -w apps/store-api` exits 0 (no regressions).

**Files to create/modify:**

- `apps/store-api/src/config/env.validation.ts` — add `LOG_LEVEL`
- `apps/store-api/src/app.module.ts` — `LoggerModule.forRootAsync`

---

### TASK-047-B: Extract `buildPinoHttpOptions` factory and add secret redaction (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** Yes
**Depends on:** TASK-047-A

**Acceptance Criteria:**

**Factory:**

- [ ] A new file `apps/store-api/src/config/pino.config.ts` exports `buildPinoHttpOptions(configService: ConfigService): Parameters<typeof LoggerModule.forRootAsync>[0]['useFactory']` — a pure function that returns the `pinoHttp` options object.
- [ ] The `redact` option includes all of the following paths with `censor: '[Redacted]'`:
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `res.headers["set-cookie"]`
  - `req.body.password`
  - `req.body.passwordHash`
  - `req.body.refreshToken`
  - `req.body.accessToken`
  - `req.body.token`
  - `req.body.csrfToken`
- [ ] The `autoLogging.ignore` function returns `true` for `req.url === '/health'` and `false` otherwise.

**Tests (TDD Red then Green):**

- [ ] `apps/store-api/src/config/pino.config.spec.ts` is created with at least the following test cases:
  - `redact.paths` array contains `'req.headers.authorization'`.
  - `redact.paths` array contains `'req.headers.cookie'`.
  - `redact.paths` array contains `'res.headers["set-cookie"]'`.
  - `redact.paths` array contains `'req.body.password'`.
  - `redact.censor` is `'[Redacted]'`.
  - `autoLogging.ignore({ url: '/health' })` returns `true`.
  - `autoLogging.ignore({ url: '/api/products' })` returns `false`.
- [ ] Tests are written Red first (asserting the options shape), then the factory is implemented to make them pass.
- [ ] `npm run test -w apps/store-api` exits 0 with all new specs green.
- [ ] `npm run typecheck -w apps/store-api` exits 0.

**Files to create/modify:**

- `apps/store-api/src/config/pino.config.ts` — factory function (new file)
- `apps/store-api/src/config/pino.config.spec.ts` — TDD unit tests (new file)
- `apps/store-api/src/app.module.ts` — use `buildPinoHttpOptions` in `forRootAsync` factory

---

### TASK-047-C: Add request-ID correlation and custom serializers (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** Yes
**Depends on:** TASK-047-B

**Acceptance Criteria:**

**`genReqId`:**

- [ ] When the incoming request has an `X-Request-Id` header, `genReqId` returns that value (reuses the upstream-stamped ID).
- [ ] When the header is absent, `genReqId` returns a `crypto.randomUUID()` value.
- [ ] The chosen ID is reflected on the HTTP response as the `X-Request-Id` header (set via `res.setHeader` inside `genReqId`).
- [ ] `randomUUID` import is sourced from the Node.js built-in `crypto` module — no new dependency.

**Serializers:**

- [ ] `serializers.req` emits only: `{ id, method, url, query, remoteAddress }`. It does NOT emit `headers` (which would leak cookies / authorization before redaction runs).
- [ ] `serializers.res` emits only: `{ statusCode }`.
- [ ] `serializers.err` emits: `{ type, message, stack, code }` (no full Error object dump).

**Tests (TDD Red then Green) — extend `pino.config.spec.ts`:**

- [ ] `genReqId` with `X-Request-Id: abc-123` in headers returns `'abc-123'` and sets `res.setHeader` with `'X-Request-Id', 'abc-123'`.
- [ ] `genReqId` with no `X-Request-Id` header returns a UUID-shaped string (validates format with `/^[0-9a-f-]{36}$/`).
- [ ] `serializers.req` called with a mock req object returns an object with exactly the keys `['id', 'method', 'url', 'query', 'remoteAddress']` and no `headers` key.
- [ ] `serializers.res` called with a mock res object returns an object with exactly the key `['statusCode']`.
- [ ] `serializers.err` called with a mock Error returns an object with key `message` equal to the Error message and key `type` equal to the constructor name.
- [ ] `npm run test -w apps/store-api` exits 0 with all specs green.

**Files to create/modify:**

- `apps/store-api/src/config/pino.config.ts` — add `genReqId` and serializers
- `apps/store-api/src/config/pino.config.spec.ts` — extend with correlation + serializer tests

---

### TASK-047-D: Resolve double-logging — retire success path from `LoggingInterceptor`

**Type:** refactor
**Scope:** store-api
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-047-B

**Acceptance Criteria:**

- [ ] `apps/store-api/src/common/interceptors/logging.interceptor.ts` is updated so the `tap` operator's `next:` callback **no longer calls `this.logger.info(...)`**. The `next:` handler is removed or left as a no-op (the latter is simpler for review clarity).
- [ ] The `error:` callback in the same `tap` is preserved unchanged (logs `{ statusCode, duration, method, url }` plus the error message).
- [ ] A code comment above the interceptor class documents the decision: "Request-level logging (method, url, statusCode, responseTime) is handled by pino-http autoLogging. This interceptor only provides richer error context (4xx/5xx) not available in the autoLogging line."
- [ ] `apps/store-api/src/common/interceptors/logging.interceptor.spec.ts` is created with TDD coverage:
  - When `next.handle()` resolves (success path): the interceptor returns the observable value and `logger.info` is NOT called.
  - When `next.handle()` throws (error path): `logger.error` IS called with an object containing `statusCode`, `duration`, `method`, and `url`.
- [ ] `npm run test -w apps/store-api` exits 0 with interceptor spec green.
- [ ] `npm run build -w apps/store-api` exits 0 (LoggingInterceptor is still registered in `AppModule` and `main.ts` — registration unchanged, only behaviour changes).

**Files to create/modify:**

- `apps/store-api/src/common/interceptors/logging.interceptor.ts` — remove success `logger.info`; add decision comment
- `apps/store-api/src/common/interceptors/logging.interceptor.spec.ts` — TDD unit tests (new file)

---

### TASK-047-E: Convert service logs to structured business-event form

**Type:** refactor
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** No
**Depends on:** TASK-047-A

**Acceptance Criteria:**

**`order.service.ts`:**

- [ ] `this.logger.info(`Order ${order.id} created for user ${userId}`)` (line 87) is replaced with:
  ```ts
  this.logger.info(
    { event: "order.created", orderId: order.id, userId },
    "Order created",
  );
  ```
- [ ] `this.logger.info(`Order confirmation email sent to ${user.email} for order ${order.id}`)` (line 104) is replaced with:
  ```ts
  this.logger.info(
    { event: "order.email_sent", orderId: order.id, to: user.email },
    "Order confirmation email sent",
  );
  ```
- [ ] `this.logger.info(`Order ${orderId} cancelled by user ${userId}; reserved stock released`)` (line 206) is replaced with:
  ```ts
  this.logger.info(
    { event: "order.cancelled", orderId, userId },
    "Order cancelled; stock released",
  );
  ```
- [ ] `this.logger.info(`Order ${orderId} marked PAID and CONFIRMED (admin)`)` (line 236) is replaced with:
  ```ts
  this.logger.info(
    { event: "order.status_updated", orderId, status: "CONFIRMED" },
    "Order marked PAID and CONFIRMED",
  );
  ```
- [ ] `this.logger.error({ err, orderId: order.id }, 'Failed to send order confirmation email')` (line 109) is already structured — verify and leave unchanged.

**`auth.service.ts`:**

- [ ] `PinoLogger` is injected into `AuthService` (add to constructor; `AuthModule` already imports `LoggerModule` transitively via `AppModule` global registration).
- [ ] `this.logger.setContext(AuthService.name)` is called in the constructor.
- [ ] A structured info log is added after `createUser` succeeds in `register()`:
  ```ts
  this.logger.info(
    { event: "user.registered", userId: user.id, email: dto.email },
    "User registered",
  );
  ```
- [ ] No password or passwordHash appears in the log object.

**General:**

- [ ] All modified log call sites use `this.logger.info({ event: '...', ...fields }, 'human message')` form.
- [ ] `npm run test -w apps/store-api` exits 0 (existing service specs still pass).
- [ ] `npm run typecheck -w apps/store-api` exits 0.

**Files to create/modify:**

- `apps/store-api/src/order/order.service.ts` — convert 4 log calls
- `apps/store-api/src/auth/auth.service.ts` — inject `PinoLogger`; add `user.registered` log

---

### TASK-047-F: Migrate `CacheService` and `MailService` from built-in Logger to `PinoLogger`

**Type:** refactor
**Scope:** store-api
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-047-A

**Acceptance Criteria:**

**`cache.service.ts`:**

- [ ] `import { Inject, Injectable, Logger } from '@nestjs/common'` is updated: `Logger` is removed from the `@nestjs/common` import.
- [ ] `import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'` is added.
- [ ] `private readonly logger = new Logger(CacheService.name)` is replaced with:
  ```ts
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectPinoLogger(CacheService.name) private readonly logger: PinoLogger,
  ) {}
  ```
- [ ] All existing `this.logger.debug(...)` and `this.logger.error({ err, ... }, ...)` call sites are unchanged in signature (PinoLogger accepts the same object-first form).
- [ ] `npm run build -w apps/store-api` exits 0.
- [ ] `npm run test -w apps/store-api` exits 0.

**`mail.service.ts`:**

- [ ] `import { Injectable, Logger } from '@nestjs/common'` is updated: `Logger` removed.
- [ ] `import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'` is added.
- [ ] `private readonly logger = new Logger(MailService.name)` is replaced with injected `PinoLogger` via `@InjectPinoLogger(MailService.name)`.
- [ ] The existing `this.logger.debug(...)` call is preserved unchanged.
- [ ] `npm run build -w apps/store-api` exits 0.
- [ ] `npm run test -w apps/store-api` exits 0 (existing mail service specs still pass if they mock `Logger`; update mocks to mock `PinoLogger` if needed).

**Files to create/modify:**

- `apps/store-api/src/cache/cache.service.ts` — replace `new Logger(...)` with `@InjectPinoLogger`
- `apps/store-api/src/mail/mail.service.ts` — replace `new Logger(...)` with `@InjectPinoLogger`

---

### TASK-047-G: Verification gate — build, lint, typecheck, unit tests, e2e tests

**Type:** chore
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-047-A through TASK-047-F

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0 with zero new warnings.
- [ ] `npm run typecheck -w apps/store-api` exits 0.
- [ ] `npm run test -w apps/store-api` exits 0 — all unit tests green, including:
  - `pino.config.spec.ts` — redaction paths, censor value, health-route ignore, genReqId, serializer shapes.
  - `logging.interceptor.spec.ts` — success path does NOT log; error path logs with structured fields.
  - All pre-existing service, repository, and filter specs pass without regression.
- [ ] `npm run test:e2e -w apps/store-api` exits 0 — all existing e2e suites pass without regression.
- [ ] `npm run build -w apps/store-client` exits 0 (no frontend changes — verify no accidental breakage).
- [ ] `npm run build -w apps/store-admin` exits 0 (same).
- [ ] Confirmation that no Orval-generated files (`**/shared/api/generated/**`) were modified (`git status` shows no generated-file changes).
- [ ] Manual smoke (optional, run if server is available): `curl -I http://localhost:3001/health` — verify `X-Request-Id` response header is present.

**Files to create/modify:**

- None (this sub-task only runs commands and confirms green state)

---

## Testing Strategy

### Unit tests (Jest, no I/O)

| Spec file                                             | What is tested                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/pino.config.spec.ts`                      | `redact.paths` contains all 9 sensitive paths; `redact.censor` is `'[Redacted]'`; `autoLogging.ignore` suppresses `/health`; `genReqId` reuses `X-Request-Id` header or generates UUID; response header is set; serializers emit exactly the expected key sets |
| `src/common/interceptors/logging.interceptor.spec.ts` | Success path — `logger.info` is NOT called; Error path — `logger.error` IS called with `{ statusCode, duration, method, url }` structured fields                                                                                                               |

### E2E tests (Supertest, real HTTP stack)

No new e2e specs are required for this task. The existing suite implicitly validates that:

- The application boots correctly with the new async logger config.
- Requests succeed (200/201/4xx as expected) — proving logging does not interfere with response flow.
- No regressions from removing the interceptor success-log.

If the CI environment makes it practical, a single assertion may be added to `test/app.e2e-spec.ts`:

- `GET /api/health` response includes an `X-Request-Id` header (proves `genReqId` is wired correctly in the full HTTP stack).

### Manual verification

1. Start the API in development mode (`npm run start:dev -w apps/store-api`).
2. `POST /api/auth/login` with `{ "email": "...", "password": "secret" }`. Inspect pino-pretty output — verify `password` field is absent or shows `[Redacted]`.
3. `curl -v http://localhost:3001/health` — verify `X-Request-Id` header is present in the response.
4. `curl -v http://localhost:3001/health` repeatedly — verify no log lines appear in the terminal (health route suppressed by `autoLogging.ignore`).
5. `POST /api/orders` (authenticated) — verify log output contains `{ event: 'order.created', orderId: '...', userId: '...' }`.

---

## Risks & Mitigations

| Risk                                                                                                                          | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoggerModule.forRootAsync` DI circular dependency (ConfigModule not available when logger is first needed)                   | Low        | Medium | `ConfigModule.forRoot({ isGlobal: true })` is already declared first in `AppModule.imports`. `forRootAsync` with `imports: [ConfigModule]` is the official pattern; no circular dependency expected.                                                                                                                                                    |
| `req.body` redaction may fail if body is not parsed yet when pino-http logs                                                   | Low        | Medium | The `ValidationPipe` and `bodyParser` are applied after middleware. pino-http logs on request-start AND on response-finish. `req.body` is only available on response-finish serialization; redaction paths on `req.body.*` must be applied to the serialized output, not the raw stream. Test with a real HTTP request in the manual verification step. |
| Removing `logger.info` from `LoggingInterceptor` success path changes observable log output format                            | Low        | Low    | autoLogging produces equivalent information. Document the change in a comment. If ops tooling parses the old string format, update dashboards/alerts accordingly.                                                                                                                                                                                       |
| `@InjectPinoLogger(ClassName)` requires that `LoggerModule` has been imported in the consuming module or globally             | Low        | Medium | `LoggerModule.forRootAsync` is registered in `AppModule` without `export` — NestJS makes it globally available. Verified by the fact that `PinoLogger` is already injected in `order.service.ts`, `auth.controller.ts`, and others without per-module re-import.                                                                                        |
| `crypto.randomUUID()` requires Node.js 14.17+; project may use an older Node version                                          | Very Low   | Low    | Node 14.17+ has been GA since 2021. NestJS v10 (used here) itself requires Node 16+. No risk.                                                                                                                                                                                                                                                           |
| Pino `redact` paths use dot-notation; `res.headers["set-cookie"]` uses bracket notation — verify pino supports mixed notation | Low        | Low    | Pino's redact uses `fast-redact` which supports both dot and bracket notation in path arrays. Confirm in TASK-047-B by running the unit test against an actual pino instance.                                                                                                                                                                           |

---

## Rollback

If any sub-task destabilizes the application:

- **TASK-047-A (LoggerModule async migration):** Revert to `LoggerModule.forRoot(...)` with the original static options. One-line change in `app.module.ts`; no data loss.
- **TASK-047-B/C (pino config factory):** Inline the options back into `forRootAsync` factory or revert the `pino.config.ts` import. No data migration needed.
- **TASK-047-D (interceptor):** Revert `logging.interceptor.ts` to re-add the `next:` logger.info call. One line.
- **TASK-047-E (structured logs):** Revert `order.service.ts` and `auth.service.ts` to the previous string-interpolated calls. No functional change — logging is a side-effect only.
- **TASK-047-F (Logger → PinoLogger):** Revert `cache.service.ts` and `mail.service.ts` to `new Logger(ClassName)`. The built-in Logger still routes through Pino at runtime (via `app.useLogger`), so downgrade is transparent.

---

## Notes

- `nestjs-pino` v4.x supports `LoggerModule.forRootAsync` natively. The `useFactory` signature is `(configService: ConfigService) => Params | Promise<Params>`.
- Pino's `redact` option uses `fast-redact` under the hood. Paths are applied to every serialized log object. `req.body.*` paths are only relevant when the body is included in the log object — pino-http includes `req.body` only when `logBody: true` is set (which we do NOT set). If body logging is never enabled, the `req.body.*` redact paths are a no-op defense-in-depth measure that costs nothing.
- `autoLogging.ignore` in `nestjs-pino` v4 accepts `(req: IncomingMessage) => boolean`. The health endpoint is served without the `/api` global prefix (excluded in `main.ts: app.setGlobalPrefix('api', { exclude: ['health'] })`), so the path to match is `/health`, not `/api/health`.
- `pino-http` `customProps` (alternative to embedding fields in `genReqId`) can add top-level fields to every request log. This is an alternative way to attach `requestId` if `genReqId` alone is insufficient — not needed in the current design since pino-http already promotes the return value of `genReqId` to the log as `reqId`.
- The `req.id` field in the `req` serializer references the ID assigned by `genReqId`. Including it ensures the serialized `req` object carries the correlation ID even on log lines that serialize the full `req` object.
- OWASP guidance on logging: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html — specifically "Do not log sensitive data" and "Use structured logging".
