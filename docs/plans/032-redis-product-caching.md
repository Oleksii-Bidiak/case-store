# Plan 032: Redis Caching for Product Listings

> **Status:** To Do
> **Phase:** Phase 5 — Polish & Production
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-13
> **BACKLOG task:** TASK-044 (subtasks TASK-044-A through TASK-044-J)

---

## Overview

Product listing and detail endpoints are called on every page load and are the
highest-traffic read paths in the API. Currently every request executes one or
two Prisma queries against PostgreSQL. Under sustained traffic (e.g., a flash
sale, a Чорна П'ятниця spike) the database becomes a bottleneck and response
times degrade.

This plan introduces a **cache-aside** Redis layer in front of `ProductService`
read methods. On a cache hit the response is returned in sub-millisecond time
without touching PostgreSQL. On a miss the DB is queried and the result is
stored in Redis with a TTL. When an admin mutates a product (create, update,
activate, deactivate) or an order transaction decrements variant stock, the
affected cache entries are evicted so the next request sees fresh data.

The implementation is **backend-only**. Response shapes are unchanged; no Orval
regeneration is required. The cache layer is built so that a Redis outage never
breaks a request — on any error the service falls through to the database
transparently.

---

## Scope

### In Scope

- Install `@nestjs/cache-manager` and `cache-manager-ioredis-yet` (ioredis
  adapter) as production dependencies in `apps/store-api`.
- Extend `EnvironmentVariables` in `env.validation.ts` with optional Redis env
  vars (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_CACHE_TTL_SECONDS`)
  following the existing `@IsOptional()` pattern so the app still boots when
  Redis is absent.
- Create a global `RedisCacheModule` at `apps/store-api/src/cache/` that
  registers `CacheModule.registerAsync` conditionally and exports a `CacheService`
  wrapper with get / set / del / delByPrefix operations and a deterministic
  `buildKey` utility.
- Integrate cache-aside reads into `ProductService.findAll`, `findBySlug`, and
  `findById`. No business logic moves to the controller; the service boundary is
  the only place that touches the cache.
- Cache invalidation on all product-affecting writes: `ProductService.create`,
  `update`, `deactivate`, `activate`, and the `OrderRepository.createFromCart` /
  `cancelAndRestock` stock mutations.
- Unit tests for `buildKey` (pure function), `CacheService` (mocked store), and
  cache-aside hit/miss/degraded paths in `ProductService` (mocked `CacheService`
  - mocked `ProductRepository`).
- Integration note for testing against a real Redis instance under the existing
  `test:int` harness.
- Observability: structured Pino log lines for cache HIT / MISS / ERROR in
  `CacheService`, consistent with the existing Logger pattern in the codebase.
- Update `AppModule` to import `RedisCacheModule`.
- Update `ProductModule` to import `RedisCacheModule` so `CacheService` is
  injectable in `ProductService`.
- Update `OrderModule` to import `RedisCacheModule` so `CacheService` is
  injectable in `OrderRepository` (for stock-decrement invalidation).

### Out of Scope

- CDN caching / image optimization (separate TASK-044 roadmap item, different
  infrastructure plane).
- Category listing caching (CategoryService is read-mostly but far lower traffic
  than products; defer to a follow-up task if profiling warrants it).
- Dashboard metric caching (DashboardRepository uses raw SQL aggregations that
  are already heavy but called only by admin users).
- Cart or session caching.
- Redis Pub/Sub or BullMQ job queues (future).
- Frontend / Orval changes — response shapes are unchanged.
- Prisma schema changes — no new tables or columns needed.
- HTTP Cache-Control / ETag headers (noted as a low-effort follow-up, out of
  scope for this task).

---

## User Stories

1. As a shopper browsing the product catalogue, I want product list and detail
   pages to load quickly even during high traffic, so that I can find and buy
   products without frustrating waits.
2. As an admin who has just updated a product's price or deactivated a listing,
   I want the change to be visible to shoppers within the TTL window (default
   5 minutes), so that stale data is not served indefinitely.
3. As a developer, I want the API to handle a Redis outage gracefully by falling
   back to the database, so that a cache failure never causes a 5xx error for
   the end user.
4. As an ops engineer, I want every cache hit, miss, and error to be logged at
   the appropriate Pino log level, so that I can measure cache effectiveness
   and diagnose connectivity problems without adding instrumentation later.

---

## Architecture Decision: Caching Library

### Options considered

**Option A — `@nestjs/cache-manager` + `cache-manager-ioredis-yet`**

`@nestjs/cache-manager` (v2.x, for NestJS 10) wraps the `cache-manager` v5
API and integrates with NestJS DI. `cache-manager-ioredis-yet` is the
maintained community store adapter for ioredis under cache-manager v5.
The pair gives us:

- First-class NestJS DI integration (`CacheModule.registerAsync` with
  `ConfigModule` injection).
- No manual connection lifecycle management.
- The underlying `ioredis` client is well-maintained, has TypeScript types,
  and supports Sentinel and Cluster for future growth.
- A thin `CACHE_MANAGER` token that is easy to mock in unit tests.

**Option B — raw `ioredis` client injected as a custom provider**

More control, but requires manual connection management, error handling, and
serialization. Overkill for MVP caching needs.

**Recommendation: Option A.**

A thin injectable `CacheService` wrapper is placed around the `CACHE_MANAGER`
token so the rest of the codebase never imports `cache-manager` types directly.
This wrapper is the only place where `try/catch` degradation logic lives.

---

## Technical Design

### Cache Key Schema

All keys are prefixed with `product:` to namespace them away from any future
Redis usage (sessions, queues, etc.).

| Method       | Key pattern                        | Example                                                                   |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `findAll`    | `product:list:{serialized-params}` | `product:list:p1_l20_cat-abc_active_min10_max100_srch_sortCreatedAt_desc` |
| `findBySlug` | `product:detail:slug:{slug}`       | `product:detail:slug:iphone-15-pro-case`                                  |
| `findById`   | `product:detail:id:{id}`           | `product:detail:id:550e8400-...`                                          |

The `findAll` key is produced by a pure `buildKey(params: FindAllParams): string`
function that sorts param keys deterministically and omits undefined/null values,
so two logically identical queries always produce the same key regardless of
parameter object construction order.

### TTL Strategy

| Key type         | Default TTL   | Env var                   |
| ---------------- | ------------- | ------------------------- |
| All product keys | 300 s (5 min) | `REDIS_CACHE_TTL_SECONDS` |

A single TTL is used for all product keys in the MVP. Fine-grained TTLs
(e.g., shorter for stock-sensitive detail pages) can be added later via
env vars or per-key configuration once profiling data is available.

### Cache-Aside Pattern in ProductService

```
findAll(query):
  key = buildKey(normalized params)
  cached = await cacheService.get(key)
  if cached → return cached          // HIT
  result = await productRepository.findAll(params)
  await cacheService.set(key, result, ttl)
  return result                      // MISS (DB served)
```

Identical logic for `findBySlug` and `findById`.

`CacheService.get` wraps the store call in a `try/catch`. On any error it logs
at `error` level and returns `null`, causing the service to fall through to the
database. `CacheService.set` is also wrapped: a failed write is logged but does
not throw, so the response is always returned.

### Invalidation Strategy

Invalidation is **key eviction** (delete), not write-through. This is simpler
and correct: after any mutation the next read will be a cache miss and the DB
will be queried fresh.

| Trigger                                              | Method called                                                                                                                                     | Keys invalidated                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ProductService.create`                              | `cacheService.delByPrefix('product:list')`                                                                                                        | All list pages (new product may appear in any page) |
| `ProductService.update(id)`                          | `cacheService.delByPrefix('product:list')` + `cacheService.del('product:detail:id:' + id)` + `cacheService.del('product:detail:slug:' + oldSlug)` | Lists + both detail variants                        |
| `ProductService.deactivate(id)`                      | same as `update`                                                                                                                                  | Lists + both detail variants                        |
| `ProductService.activate(id)`                        | same as `update`                                                                                                                                  | Lists + both detail variants                        |
| `OrderRepository.createFromCart` (stock decrement)   | `cacheService.delByPrefix('product:detail:slug')` per affected product slug                                                                       | Detail pages (stock count is visible in variants)   |
| `OrderRepository.cancelAndRestock` (stock increment) | same as `createFromCart`                                                                                                                          | Detail pages                                        |

`delByPrefix` uses Redis `SCAN` + `DEL` (non-blocking) rather than `KEYS`
(blocking) to avoid locking Redis on large keyspaces.

For `ProductService.update`: the slug may have changed. The service must fetch
the product before the update (it already does this for slug-uniqueness checks)
so the old slug is available for eviction before the update write.

### CacheModule Structure

```
apps/store-api/src/cache/
  cache.module.ts          — Global NestJS module; registers CacheModule.registerAsync
  cache.service.ts         — Injectable wrapper: get / set / del / delByPrefix / buildKey
  cache.service.spec.ts    — Unit tests (mocked CACHE_MANAGER token)
  cache-key.util.ts        — Pure buildKey(params) function
  cache-key.util.spec.ts   — Unit tests for key builder
  index.ts                 — Barrel: export { RedisCacheModule, CacheService }
```

`RedisCacheModule` is `@Global()` — same pattern as `MailModule`. One import in
`AppModule` makes `CacheService` available everywhere without each feature module
re-importing it.

### Env Vars Added to `env.validation.ts`

```ts
// ─── Redis / Cache ──────────────────────────────────────────────────────────
// All optional: when REDIS_HOST is absent the cache is disabled and the app
// falls back to direct DB reads on every request (no-op degradation).

@IsOptional()
@IsString()
REDIS_HOST?: string;       // default: 'localhost'

@IsOptional()
@IsInt()
REDIS_PORT?: number;       // default: 6379

@IsOptional()
@IsString()
REDIS_PASSWORD?: string;   // matches docker-compose ${REDIS_PASSWORD:-}

@IsOptional()
@IsInt()
REDIS_CACHE_TTL_SECONDS?: number;  // default: 300
```

When `REDIS_HOST` is not set, `CacheModule.registerAsync` registers an
**in-memory** store (`cache-manager` ships with one). The `CacheService`
wrapper then behaves identically from the consumer's perspective, but without
actual Redis persistence — every restart loses the cache, which is acceptable
for local development without Docker.

### Graceful Degradation

`CacheService` wraps every Redis call:

```ts
async get<T>(key: string): Promise<T | null> {
  try {
    return await this.cacheManager.get<T>(key) ?? null;
  } catch (err) {
    this.logger.error({ err, key }, 'Cache GET error — falling through to DB');
    return null;
  }
}

async set(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await this.cacheManager.set(key, value, ttl);
  } catch (err) {
    this.logger.error({ err, key }, 'Cache SET error — response not cached');
  }
}
```

`ProductService` treats `null` from `get` as a cache miss and queries the DB.
No request ever fails because of a Redis error.

### Observability

Structured Pino log lines are emitted by `CacheService`:

- `debug` level: `Cache HIT { key }` / `Cache MISS { key }`
- `error` level: `Cache GET error { err, key }` / `Cache SET error { err, key }`
  / `Cache DEL error { err, key }`

These are consistent with the project's existing `Logger` usage and are
captured as structured JSON by `nestjs-pino` in production.

### Frontend / Orval Impact

None. The response envelopes for `GET /api/products`, `GET /api/products/:slug`,
and `GET /api/products/admin/:id` are identical before and after this change.
No Orval regeneration is required.

---

## Files to Create / Modify

### New files

| File                                              | Purpose                           |
| ------------------------------------------------- | --------------------------------- |
| `apps/store-api/src/cache/cache-key.util.ts`      | Pure `buildKey(params)` function  |
| `apps/store-api/src/cache/cache-key.util.spec.ts` | Unit tests for key builder        |
| `apps/store-api/src/cache/cache.service.ts`       | Injectable `CacheService` wrapper |
| `apps/store-api/src/cache/cache.service.spec.ts`  | Unit tests for CacheService       |
| `apps/store-api/src/cache/cache.module.ts`        | Global `RedisCacheModule`         |
| `apps/store-api/src/cache/index.ts`               | Barrel export                     |

### Modified files

| File                                                 | Change                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/store-api/package.json`                        | Add `@nestjs/cache-manager`, `cache-manager-ioredis-yet`                                                           |
| `apps/store-api/src/config/env.validation.ts`        | Add Redis env vars                                                                                                 |
| `apps/store-api/src/app.module.ts`                   | Import `RedisCacheModule`                                                                                          |
| `apps/store-api/src/product/product.module.ts`       | Import `RedisCacheModule` (for CacheService DI in ProductService)                                                  |
| `apps/store-api/src/product/product.service.ts`      | Inject `CacheService`; wrap read methods in cache-aside; evict on writes                                           |
| `apps/store-api/src/product/product.service.spec.ts` | Extend with CacheService mock; test hit, miss, degraded, invalidation paths                                        |
| `apps/store-api/src/order/order.module.ts`           | Import `RedisCacheModule`                                                                                          |
| `apps/store-api/src/order/order.repository.ts`       | Inject `CacheService`; evict product detail keys after stock decrements in `createFromCart` and `cancelAndRestock` |
| `apps/store-api/src/order/order.repository.spec.ts`  | Extend with cache eviction assertions after `createFromCart` and `cancelAndRestock`                                |
| `.env.example` (root or `apps/store-api/`)           | Document `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_CACHE_TTL_SECONDS`                                   |

---

## Ordered Subtasks

### TASK-044-A: Install Redis cache dependencies

**Type:** chore
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `@nestjs/cache-manager` and `cache-manager-ioredis-yet` are added to
      `dependencies` in `apps/store-api/package.json`.
- [ ] `npm install` (workspace) completes without errors.
- [ ] `npm run build -w apps/store-api` still passes after install.
- [ ] No other package.json files in the monorepo are modified.

**Files to create/modify:**

- `apps/store-api/package.json` — add two dependencies

---

### TASK-044-B: Extend env.validation.ts with Redis env vars

**Type:** feat
**Scope:** store-api
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-044-A

**Acceptance Criteria:**

- [ ] `EnvironmentVariables` class in `apps/store-api/src/config/env.validation.ts`
      gains four new optional fields: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`,
      `REDIS_CACHE_TTL_SECONDS`.
- [ ] All four are decorated `@IsOptional()` — the app boots without them.
- [ ] `REDIS_PORT` and `REDIS_CACHE_TTL_SECONDS` use `@IsInt()` (consistent with
      `PORT` and `SMTP_PORT` in the same file).
- [ ] The existing comment section style `// ─── Redis / Cache ─────` is used to
      group the new fields.
- [ ] `npm run typecheck -w apps/store-api` passes.
- [ ] `npm run test -w apps/store-api` (existing unit tests) still passes.
- [ ] `.env.example` at the repo root (or `apps/store-api/.env.example` if that is
      where it lives) is updated with the four vars, their defaults, and a brief
      comment matching the `# Mail` block style.

**Files to create/modify:**

- `apps/store-api/src/config/env.validation.ts` — add Redis fields
- `.env.example` (or `apps/store-api/.env.example`) — document new vars

---

### TASK-044-C: Implement cache-key builder utility (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** S (1 h)
**TDD Required:** Yes
**Depends on:** TASK-044-A

**Acceptance Criteria:**

- [ ] `apps/store-api/src/cache/cache-key.util.ts` exports a pure function
      `buildProductListKey(params: FindAllParams): string`.
- [ ] The key always starts with `product:list:`.
- [ ] Params are serialized in a fixed, sorted order so two calls with identical
      params (in any object key order) produce exactly the same string.
- [ ] `undefined` and `null` param values are omitted from the key (not included
      as `"undefined"` or `"null"` literals).
- [ ] `apps/store-api/src/cache/cache-key.util.spec.ts` covers: - Same params, different key construction order → same key. - All params present → correct serialized string. - Only required params (page, limit) → short key without optional segments. - Edge: empty string `search` treated as absent (omitted from key).
- [ ] `npm run test -w apps/store-api` passes with all new specs green.

**Files to create/modify:**

- `apps/store-api/src/cache/cache-key.util.ts` — pure key builder
- `apps/store-api/src/cache/cache-key.util.spec.ts` — TDD unit tests

---

### TASK-044-D: Implement CacheService (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** Yes
**Depends on:** TASK-044-A, TASK-044-B

**Acceptance Criteria:**

- [ ] `apps/store-api/src/cache/cache.service.ts` is `@Injectable()` and exposes: - `get<T>(key: string): Promise<T | null>` — returns `null` on miss or error. - `set(key: string, value: unknown, ttl?: number): Promise<void>` — silently
      swallows errors (logs at error level, never throws). - `del(key: string): Promise<void>` — silently swallows errors. - `delByPrefix(prefix: string): Promise<void>` — uses Redis `SCAN` +
      pipeline `DEL` (non-blocking); silently swallows errors.
- [ ] Every method wraps the underlying `CACHE_MANAGER` call in `try/catch`.
- [ ] `get` emits `debug` log on HIT, `debug` log on MISS, `error` log on exception.
- [ ] `set`, `del`, `delByPrefix` emit `error` log on exception.
- [ ] `apps/store-api/src/cache/cache.service.spec.ts` covers: - `get`: HIT (value returned), MISS (null returned), Redis error (null returned,
      no throw). - `set`: success (no throw), Redis error (no throw, error logged). - `del`: success (no throw), Redis error (no throw). - `delByPrefix`: success (SCAN + DEL called), Redis error (no throw). - Graceful degradation: all methods callable when cacheManager throws.
- [ ] `npm run test -w apps/store-api` passes with all new specs green.

**Files to create/modify:**

- `apps/store-api/src/cache/cache.service.ts` — injectable wrapper
- `apps/store-api/src/cache/cache.service.spec.ts` — TDD unit tests

---

### TASK-044-E: Create RedisCacheModule (global)

**Type:** feat
**Scope:** store-api
**Complexity:** M (2 h)
**TDD Required:** No
**Depends on:** TASK-044-B, TASK-044-D

**Acceptance Criteria:**

- [ ] `apps/store-api/src/cache/cache.module.ts` exports `RedisCacheModule`.
- [ ] Module is decorated `@Global()` — same pattern as `MailModule`.
- [ ] `CacheModule.registerAsync` is used with `inject: [ConfigService]` so Redis
      connection params come from `ConfigService` (never hardcoded).
- [ ] When `REDIS_HOST` is set: the store is configured as ioredis with
      `{ host, port, password }` from config.
- [ ] When `REDIS_HOST` is absent: the in-memory cache-manager store is used
      (no Redis connection attempted, no startup error).
- [ ] `CacheService` is in `providers` and `exports`.
- [ ] `apps/store-api/src/cache/index.ts` barrel exports `RedisCacheModule` and
      `CacheService`.
- [ ] `apps/store-api/src/app.module.ts` imports `RedisCacheModule`.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run typecheck -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/cache/cache.module.ts` — global module
- `apps/store-api/src/cache/index.ts` — barrel
- `apps/store-api/src/app.module.ts` — add `RedisCacheModule` to imports

---

### TASK-044-F: Integrate cache-aside reads into ProductService

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** Yes
**Depends on:** TASK-044-C, TASK-044-D, TASK-044-E

**Acceptance Criteria:**

- [ ] `ProductService` receives `CacheService` via constructor injection.
- [ ] `ProductModule` imports `RedisCacheModule` so `CacheService` resolves.
- [ ] `findAll(query)`: - Builds a cache key via `buildProductListKey(params)`. - Returns cached value immediately on HIT (no DB call). - Queries `productRepository.findAll` on MISS, stores result with TTL, returns it.
- [ ] `findBySlug(slug)`: - Cache key: `product:detail:slug:{slug}`. - Same HIT/MISS/store logic.
- [ ] `findById(id)`: - Cache key: `product:detail:id:{id}`. - Same HIT/MISS/store logic.
- [ ] TTL is read from `ConfigService` (`REDIS_CACHE_TTL_SECONDS`, default 300).
- [ ] `ProductService` does NOT import `CACHE_MANAGER` directly — only `CacheService`.
- [ ] `ProductService` does NOT import `PrismaClient` directly (existing constraint
      maintained).
- [ ] `apps/store-api/src/product/product.service.spec.ts` is extended with a
      `CacheService` mock and covers: - `findAll`: cache HIT (repository never called), cache MISS (repository called,
      result cached), cache error → falls through to DB. - `findBySlug`: same three cases. - `findById`: same three cases.
- [ ] All existing `product.service.spec.ts` tests remain green.
- [ ] `npm run test -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/product/product.service.ts` — inject CacheService, wrap reads
- `apps/store-api/src/product/product.module.ts` — import RedisCacheModule
- `apps/store-api/src/product/product.service.spec.ts` — extend with cache tests

---

### TASK-044-G: Add cache invalidation on product writes

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** Yes
**Depends on:** TASK-044-F

**Acceptance Criteria:**

- [ ] `ProductService.create`: - After successful repository write, calls `cacheService.delByPrefix('product:list')`.
- [ ] `ProductService.update(id, input)`: - Captures the product's current slug **before** calling `productRepository.update`
      (the service already fetches the product for slug-uniqueness validation — reuse
      that result). - After the update, calls: 1. `cacheService.delByPrefix('product:list')` 2. `cacheService.del('product:detail:id:' + id)` 3. `cacheService.del('product:detail:slug:' + oldSlug)` - If the slug changed, also deletes `'product:detail:slug:' + input.slug` (new
      slug may already be cached from a prior request that 404'd or was pre-warmed).
- [ ] `ProductService.deactivate(id)` and `activate(id)`: - Same three evictions as `update` using the product slug fetched before the write.
- [ ] Cache eviction failures are silent (they are already swallowed inside
      `CacheService.del` / `delByPrefix`) — the mutation result is always returned.
- [ ] `product.service.spec.ts` is extended with invalidation assertions: - `create`: `delByPrefix('product:list')` called once. - `update`: `delByPrefix` + both `del` calls verified (slug unchanged case);
      additional `del` for new slug in the slug-changed case. - `deactivate` / `activate`: `delByPrefix` + both `del` calls verified.
- [ ] All existing tests remain green.
- [ ] `npm run test -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/product/product.service.ts` — add evictions after writes
- `apps/store-api/src/product/product.service.spec.ts` — add invalidation tests

---

### TASK-044-H: Add cache invalidation in OrderRepository for stock mutations

**Type:** feat
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** Yes
**Depends on:** TASK-044-E

**Acceptance Criteria:**

- [ ] `OrderRepository` receives `CacheService` via constructor injection.
- [ ] `OrderModule` imports `RedisCacheModule` so `CacheService` resolves.
- [ ] `OrderRepository.createFromCart`: - After the transaction commits successfully, iterates over each affected product
      slug (derivable from `cartItems` passed in) and calls
      `cacheService.del('product:detail:slug:' + slug)` for each. - Also calls `cacheService.delByPrefix('product:list')` once to bust paginated
      listing caches (stock counts are rendered in product cards in some frontends). - Eviction errors are swallowed (CacheService guarantees this).
- [ ] `OrderRepository.cancelAndRestock`: - After the restock transaction commits, performs the same evictions as
      `createFromCart` for the restocked product slugs. - Product slugs must be fetched as part of the transaction or from the order
      items that are already available. If slugs are not in scope, a targeted
      `cacheService.delByPrefix('product:detail:slug')` prefix eviction is acceptable.
- [ ] `apps/store-api/src/order/order.repository.spec.ts` is extended with: - After `createFromCart`: `CacheService.del` called for each product slug in
      cart + `delByPrefix('product:list')` called. - After `cancelAndRestock`: same eviction assertions. - CacheService mock injected alongside existing `PrismaService` mock.
- [ ] All existing `order.repository.spec.ts` tests remain green.
- [ ] `npm run test -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/order/order.repository.ts` — inject CacheService, evict on writes
- `apps/store-api/src/order/order.module.ts` — import RedisCacheModule
- `apps/store-api/src/order/order.repository.spec.ts` — add eviction assertions

---

### TASK-044-I: Integration test under test:int harness (real Redis)

**Type:** test
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** No
**Depends on:** TASK-044-F, TASK-044-G, TASK-044-H

**Acceptance Criteria:**

- [ ] A new integration spec `test/cache.int-spec.ts` (or
      `test/product-cache.int-spec.ts`) is created under the `test:int` harness
      (matches `jest-int.json` config, runs with `--runInBand`).
- [ ] The spec bootstraps a real `NestJS` testing module with: - `RedisCacheModule` configured to connect to `localhost:6379` (the Docker
      Redis service, same as used by existing `test:int` specs). - `ProductModule` (or the relevant service) with real `ProductRepository`
      pointing to the test database.
- [ ] Tests cover: - After `findAll(query)` is called twice with identical params, `productRepository.findAll`
      is invoked only once (second call hits the cache). - After `ProductService.update(id)`, the cache key for `product:detail:id:{id}`
      is absent from Redis. - After `OrderRepository.createFromCart`, the product detail key for the
      affected product is absent from Redis. - Graceful degradation: stopping/disconnecting the Redis client before calling
      `findAll` causes the service to query the DB without throwing.
- [ ] Spec file documents that it requires both Docker services (`store_postgres`,
      `store_redis`) to be running.
- [ ] `npm run test:int -w apps/store-api` passes (assuming Docker services are up).

**Files to create/modify:**

- `test/cache.int-spec.ts` (in `apps/store-api/test/`) — real-Redis integration spec

---

### TASK-044-J: Verification gate (build / lint / typecheck / all tests)

**Type:** chore
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-044-A through TASK-044-I

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-api` passes with zero errors.
- [ ] `npm run lint -w apps/store-api` passes with zero new warnings.
- [ ] `npm run typecheck -w apps/store-api` passes with zero type errors.
- [ ] `npm run test -w apps/store-api` passes (all unit tests green, no regressions
      in product, order, auth, cart, or dashboard suites).
- [ ] `npm run test:e2e -w apps/store-api` passes (existing e2e suite unaffected;
      cache calls are invisible to e2e because the default in-memory store is used
      unless `REDIS_HOST` is set, which it is not in the e2e environment).
- [ ] Store-client and store-admin workspaces build without errors
      (`npm run build -w apps/store-client && npm run build -w apps/store-admin`).
- [ ] Confirmation that no Orval-generated files were modified.

**Files to create/modify:**

- No new files. This task is verification only.

---

## Testing Strategy

### Unit tests (Jest, no I/O)

| Spec file                                    | What is tested                                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache/cache-key.util.spec.ts`               | Pure function — determinism, omission of nulls, fixed ordering                                                                                                                                |
| `cache/cache.service.spec.ts`                | Mocked `CACHE_MANAGER` — HIT/MISS return values, all error paths silently caught                                                                                                              |
| `product/product.service.spec.ts` (extended) | Mocked `CacheService` + mocked `ProductRepository` — cache-aside hit (repo not called), miss (repo called + set called), degraded (get throws → repo called), invalidation calls after writes |
| `order/order.repository.spec.ts` (extended)  | Mocked `CacheService` — `del` and `delByPrefix` called after `createFromCart` and `cancelAndRestock`                                                                                          |

### Integration tests (test:int, requires Docker)

| Spec file                | What is tested                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `test/cache.int-spec.ts` | Real Redis — second identical query hits cache; invalidation deletes correct keys; Redis disconnect → DB fallback (no throw) |

### E2E tests

No new e2e tests are required. Existing e2e tests run without a Redis connection
(`REDIS_HOST` unset → in-memory store). Cache-aside is transparent to HTTP
response shapes, so existing e2e assertions remain valid.

---

## Risks & Mitigations

| Risk                                                                                                                                                                                                       | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cache-manager-ioredis-yet` version incompatibility with `@nestjs/cache-manager` v2                                                                                                                        | Low        | High   | Pin compatible versions; check the adapter's readme for cache-manager v5 compatibility table before installing                                                                                                                             |
| `delByPrefix` with `SCAN` is slow when keyspace is large                                                                                                                                                   | Low        | Medium | `SCAN` with `COUNT 100` is non-blocking; product key namespace is small (bounded by catalog size); acceptable for MVP                                                                                                                      |
| Cache stampede on cold start (many concurrent misses hitting DB)                                                                                                                                           | Low        | Medium | Acceptable at MVP scale. Mitigation if needed: probabilistic early expiry or lock-based single-flight (deferred to a follow-up)                                                                                                            |
| Slug changes invalidate old slug key but the slug may have been cached under both `slug:` and `id:` — if a request arrives between the `update` write and the eviction, stale data could be briefly served | Very Low   | Low    | The eviction happens synchronously after the write in the same service method. The window is sub-millisecond. The TTL of 5 min is the backstop                                                                                             |
| `OrderRepository` injecting `CacheService` couples the data layer to the cache layer                                                                                                                       | Low        | Low    | `CacheService` is a domain-neutral infrastructure service, not a business layer. This is the standard NestJS pattern (cf. `MailService` injected into `OrderService`). Cache calls are wrapped so they never affect repository correctness |
| Developer forgets to add cache eviction for a new product write method                                                                                                                                     | Medium     | Medium | Document the eviction obligation in a comment block at the top of `product.service.ts`. Code review checklist item                                                                                                                         |

---

## Rollback

If Redis caching causes production issues:

1. Set `REDIS_HOST=` (empty string) in the deployment environment — the module
   falls back to in-memory cache automatically on the next restart, effectively
   disabling Redis. No code change is needed.
2. For a zero-downtime rollback: redeploy the previous image tag (which does not
   import `RedisCacheModule`). The Redis container itself is unaffected and can
   remain running.
3. All cache keys are namespaced under `product:` — a `redis-cli FLUSHDB` or a
   targeted `DEL product:*` clears any stale data without affecting other Redis
   namespaces (sessions, queues) that may be introduced by future tasks.
