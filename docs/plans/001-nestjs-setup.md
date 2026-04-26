# Plan: NestJS Project Structure (Clean Architecture)

> **Status:** 🔄 In Progress
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-04-26
> **Last Updated:** 2026-04-26

## Overview

Set up the NestJS backend application (`apps/store-api`) following Clean Architecture principles with layered structure (Controllers → Services → Repositories). This is the foundation for all backend modules.

## Scope

### In Scope
- Scaffold NestJS project in `apps/store-api`
- Configure TypeScript, ESLint, Prettier for the workspace
- Set up Prisma ORM with PostgreSQL connection
- Create Clean Architecture base structure (AppModule, ConfigModule)
- Configure global validation pipe, CORS, Helmet
- Set up Jest + Supertest for unit and e2e testing
- Configure environment variables with `@nestjs/config`
- Set up Pino structured logging

### Out of Scope
- Feature modules (Auth, Product, Category, etc.) — covered by subsequent tasks
- OpenAPI/Swagger configuration — TASK-014
- Database schema design — TASK-006

## Technical Design

### Project Structure

```
apps/store-api/
├── src/
│   ├── main.ts                    — Bootstrap, global config
│   ├── app.module.ts              — Root module
│   ├── common/                    — Shared backend utilities
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/
│   │   │   └── logging.interceptor.ts
│   │   └── pipes/
│   │       └── validation.pipe.ts
│   └── prisma/
│       └── prisma.service.ts      — PrismaClient wrapper
├── test/
│   ├── jest-e2e.json
│   └── app.e2e-spec.ts
├── prisma/
│   └── schema.prisma              — Will be populated in TASK-006
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── package.json
└── .env
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | NestJS core |
| `@nestjs/config` | Environment variable management |
| `@nestjs/jwt` | JWT authentication (prep for TASK-010) |
| `@nestjs/passport`, `passport` | Auth strategy base |
| `@prisma/client` | Database ORM client |
| `class-validator`, `class-transformer` | DTO validation |
| `helmet` | HTTP security headers |
| `@nestjs/throttler` | Rate limiting |
| `pino`, `nestjs-pino`, `pino-http` | Structured JSON logging |
| `prisma` (dev) | CLI for migrations |
| `@nestjs/testing`, `jest`, `supertest` (dev) | Testing |

### Configuration

#### Environment Variables (apps/store-api/.env)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/store_dev
NODE_ENV=development
PORT=3001
JWT_SECRET=
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
```

#### AppModule Registration
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // PrismaModule (custom),
    // ThrottlerModule,
    // Logging via PinoModule,
  ],
})
```

### API Contract

No feature endpoints yet. Health check endpoint:

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| GET | /health | — | `{ status: 'ok', timestamp: string }` |

## Tasks

### TASK-009-A: Scaffold NestJS Project
**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** None

**Acceptance Criteria:**
- [ ] `apps/store-api/` directory exists with proper NestJS structure
- [ ] `npm run build -w apps/store-api` succeeds
- [ ] `npm run start:dev -w apps/store-api` starts the server
- [ ] `GET /health` returns `{ status: 'ok' }`

**Files to create/modify:**
- `apps/store-api/package.json` — workspace dependencies
- `apps/store-api/tsconfig.json` — TypeScript config
- `apps/store-api/tsconfig.build.json` — Build config
- `apps/store-api/nest-cli.json` — NestJS CLI config
- `apps/store-api/src/main.ts` — Application bootstrap
- `apps/store-api/src/app.module.ts` — Root module
- `apps/store-api/src/app.controller.ts` — Health check controller
- `apps/store-api/src/app.service.ts` — Health check service

---

### TASK-009-B: Configure Prisma ORM
**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-009-A

**Acceptance Criteria:**
- [ ] `prisma/schema.prisma` exists with datasource and generator configured
- [ ] `PrismaService` extends `PrismaClient` with lifecycle hooks (onModuleInit, onModuleDestroy)
- [ ] `PrismaModule` provides `PrismaService` globally
- [ ] `npx prisma generate` succeeds
- [ ] Database connection verified (container running)

**Files to create/modify:**
- `apps/store-api/prisma/schema.prisma` — Prisma schema (empty datasource + generator only)
- `apps/store-api/src/prisma/prisma.service.ts` — PrismaClient wrapper
- `apps/store-api/src/prisma/prisma.module.ts` — Prisma module

---

### TASK-009-C: Configure Global Infrastructure (Validation, CORS, Helmet, Logging)
**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-009-A

**Acceptance Criteria:**
- [ ] Global validation pipe configured with `class-validator` + `class-transformer`
- [ ] CORS configured with allowed origins from env
- [ ] Helmet enabled for secure HTTP headers
- [ ] Pino structured logging active (JSON format in production)
- [ ] Request logging interceptor logs method, path, duration
- [ ] Global exception filter returns consistent error envelope

**Files to create/modify:**
- `apps/store-api/src/main.ts` — Add CORS, Helmet, global pipes
- `apps/store-api/src/common/pipes/validation.pipe.ts` — Custom validation pipe (or use built-in)
- `apps/store-api/src/common/filters/http-exception.filter.ts` — Consistent error responses
- `apps/store-api/src/common/interceptors/logging.interceptor.ts` — Request duration logging

---

### TASK-009-D: Set Up Testing Infrastructure
**Type:** test
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-009-A

**Acceptance Criteria:**
- [ ] `jest.config.js` configured for unit tests
- [ ] `test/jest-e2e.json` configured for e2e tests
- [ ] `test/app.e2e-spec.ts` — basic e2e test for health endpoint
- [ ] `npm run test -w apps/store-api` passes
- [ ] `npm run test:e2e -w apps/store-api` passes

**Files to create/modify:**
- `apps/store-api/jest.config.js` — Unit test config
- `apps/store-api/test/jest-e2e.json` — E2E test config
- `apps/store-api/test/app.e2e-spec.ts` — Health endpoint e2e test
- `apps/store-api/test/jest.setup.ts` — Test setup (optional)

---

### TASK-009-E: Configure ESLint + Prettier for Workspace
**Type:** chore
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-009-A

**Acceptance Criteria:**
- [ ] `apps/store-api/.eslintrc.js` extends shared config from `packages/eslint-config`
- [ ] `npm run lint -w apps/store-api` passes with zero errors
- [ ] Prettier formatting works on `.ts` files
- [ ] Husky pre-commit hooks apply to store-api files

**Files to create/modify:**
- `apps/store-api/.eslintrc.js` — ESLint config extending shared
- `packages/eslint-config/index.js` — Verify shared config exists and is correct

## Migration Steps

1. Create `apps/store-api/` directory and `package.json` with dependencies
2. Install dependencies: `npm install -w apps/store-api`
3. Set up TypeScript, NestJS CLI, and Prisma configs
4. Create `src/main.ts`, `src/app.module.ts`, health check controller/service
5. Verify server starts: `npm run start:dev -w apps/store-api`
6. Configure Prisma: init schema, create PrismaService/PrismaModule
7. Add global infrastructure: validation, CORS, Helmet, Pino logging
8. Set up Jest + Supertest, write e2e test for health endpoint
9. Run all tests: `npm run test -w apps/store-api && npm run test:e2e -w apps/store-api`
10. Run lint: `npm run lint -w apps/store-api`

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Port 3001 already in use | Make PORT configurable via env, default to 3001 |
| PostgreSQL container not running | Document `docker compose up -d` prerequisite; add health check retry logic |
| Husky hooks fail on first commit | Ensure ESLint config is correct before first commit; use `--no-verify` only as last resort |
| NestJS CLI not compatible with monorepo | Use `nest generate` from within `apps/store-api/` directory |

## Notes

- TASK-006 (Prisma schema design) will populate the currently empty `schema.prisma`
- TASK-010 (Auth module) will build on top of this foundation
- The health check endpoint is a simple smoke test — not a feature endpoint
- All logging uses Pino in JSON format for production; pretty-print in development
- Error response envelope: `{ error: string, message: string, statusCode: number }`
