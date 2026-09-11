import { Global, INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule, PrismaService } from '../src/prisma';
import { RedisCacheModule, CacheService, productDetailIdKey } from '../src/cache';
import { ProductModule } from '../src/product';
import { PermissionModule } from '../src/auth/permissions';
import { AuditModule } from '../src/audit';
import { ProductService } from '../src/product/product.service';
import { ProductRepository } from '../src/product/product.repository';
import { RevalidationNotifier } from '../src/publishing';

/**
 * Stand-in for the {@link RevalidationNotifier} that `ProductService`,
 * `ProductImageService` and `CategoryService` take in their constructors since
 * 0718fc9 (storefront purge on catalogue writes).
 *
 * It must be `@Global()` for the same reason `AuditModule`/`PermissionModule`
 * are named in the imports below: a provider declared in the testing ROOT module
 * is invisible to `ProductModule`'s and `CategoryModule`'s own injectors, so
 * only a global export reaches them. TASK-460 — this is the one int-spec built
 * from real `imports:` rather than a hand-listed `providers:` array, which is
 * why it alone broke when that constructor argument appeared.
 *
 * The real `PublishingModule` is deliberately NOT imported: it also constructs
 * `PublishingScheduler`, which injects `SchedulerRegistry` (absent without
 * `ScheduleModule.forRoot()`) and starts a live cron in `onModuleInit` —
 * `setup-int.ts`, unlike `setup-e2e.ts`, does not set `SCHEDULER_ENABLED=false`,
 * so that job would tick against the test database mid-run.
 */
@Global()
@Module({
  providers: [{ provide: RevalidationNotifier, useValue: { revalidate: jest.fn() } }],
  exports: [RevalidationNotifier],
})
class RevalidationStubModule {}

/**
 * Integration tests for the Redis cache layer — run the REAL CacheService and
 * ProductService against a REAL Redis instance and a REAL Postgres test DB
 * (no mocks). These exercise what the unit tests (mocked CacheService) cannot:
 * the actual SCAN-based prefix eviction, node-redis serialization round-trips,
 * and the graceful-degradation fallback when the Redis connection drops.
 * (node-redis, not ioredis: the adapter changed with cache-manager v7 in
 * TASK-304.)
 *
 * Requires BOTH Docker services to be running and migrated:
 *   - store_postgres (DATABASE_URL forced to an isolated *_test DB by setup-int)
 *   - store_redis     (localhost:6379)
 *
 * Run with: `npm run test:int -w apps/store-api`
 *
 * The product order-stock eviction path (OrderRepository) is covered by unit
 * tests in src/order/order.repository.spec.ts and is not duplicated here.
 */
describe('Product cache (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: ProductService;
  let repository: ProductRepository;
  let cache: CacheService;
  let cacheManager: Cache;

  let categoryId: string;
  let productId: string;
  let productSlug: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    // Point the cache layer at the Docker Redis service before the module's
    // registerAsync factory reads ConfigService.
    process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
    process.env.REDIS_PORT = process.env.REDIS_PORT ?? '6379';
    process.env.REDIS_CACHE_TTL_SECONDS = process.env.REDIS_CACHE_TTL_SECONDS ?? '300';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        // CacheService (and friends) inject PinoLogger; the global LoggerModule
        // provides it app-wide, so the testing module must register it too.
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        PrismaModule,
        RedisCacheModule,
        // ProductModule's admin routes carry PermissionGuard (TASK-334), and Nest
        // resolves a @UseGuards() guard from the HOST module's injector. Both of
        // these are @Global() in the running app, but a partial test graph still
        // has to name them once or the guard cannot be constructed and compilation
        // fails — loudly, which is the right failure mode for a security guard.
        AuditModule,
        PermissionModule,
        RevalidationStubModule,
        ProductModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ProductService);
    // Two ProductRepository instances live in the graph (SearchModule provides
    // its own) — moduleRef.get() may return the wrong one, so spy on the exact
    // instance injected into ProductService.
    repository = (service as unknown as { productRepository: ProductRepository }).productRepository;
    cache = moduleRef.get(CacheService);
    cacheManager = moduleRef.get(CACHE_MANAGER);

    const suffix = randomUUID();
    const category = await prisma.category.create({
      data: { name: 'Cache Category', slug: `cache-cat-${suffix}` },
    });
    categoryId = category.id;

    productSlug = `cache-product-${suffix}`;
    const product = await prisma.product.create({
      data: {
        name: 'Cache Test Product',
        slug: productSlug,
        price: '29.99',
        categoryId,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.product.deleteMany({ where: { categoryId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
    }
    // The degradation test deliberately drops the Redis connection, so closing
    // the cache during teardown may reject — that is expected, not a failure.
    try {
      await app?.close();
    } catch {
      /* connection already dropped by the degradation test */
    }
  });

  beforeEach(async () => {
    // Isolate each test from cached entries left by the previous one.
    await cache.delByPrefix('product:');
  });

  it('serves the second identical findAll from cache (repository hit once)', async () => {
    const query = { page: 1, limit: 20, categoryId };
    const spy = jest.spyOn(repository, 'findAll');

    const first = await service.findAll(query);
    const second = await service.findAll(query);

    expect(spy).toHaveBeenCalledTimes(1); // second call was a cache hit
    // The Redis round-trip returns plain JSON (entity classes and Dates become
    // ISO strings). HTTP responses are identical either way — the controller
    // serializes to JSON — so compare the serialized forms.
    expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(first)));
    spy.mockRestore();
  });

  it('evicts the detail-by-id cache key after an update', async () => {
    await service.findById(productId); // populate cache
    expect(await cacheManager.get(productDetailIdKey(productId))).not.toBeNull();

    await service.update(productId, { name: 'Renamed In Cache Test' });

    expect(await cacheManager.get(productDetailIdKey(productId))).toBeFalsy();
  });

  it('degrades gracefully: findAll still resolves after the Redis client drops', async () => {
    // Forcibly drop the underlying node-redis connection. CacheService must
    // swallow the resulting errors and fall through to the database without
    // throwing.
    //
    // TASK-460: this used to read `cacheManager.store.client` — the cache-manager
    // v5 shape. Since TASK-304 the project is on v7, where the stores live in an
    // array, so the path resolved to `undefined`, `disconnect?.()` was a silent
    // no-op and this test passed without ever dropping a connection. Mirror the
    // path CacheService itself uses (`getKeyvStore`/`getScanClient`) so the two
    // cannot drift apart again.
    const client = (
      cacheManager as unknown as {
        stores?: { store?: { client?: { isOpen?: boolean; destroy?: () => void } } }[];
      }
    ).stores?.[0]?.store?.client;

    // Both reads are optional-chained so a further shape change fails loudly
    // HERE rather than crashing the suite with a TypeError — but they ARE
    // asserted, because passing while dropping nothing is the exact defect
    // described above. `isOpen` doubles as the Redis precondition: with no
    // service on REDIS_HOST the client exists but was never connected, and
    // node-redis then throws a bare "The client is closed" from inside
    // `destroy()`, which reads as a mystery instead of as a missing container.
    // `@keyv/redis` is backed by node-redis, whose forcible drop in v5 is
    // `destroy()` (`disconnect()`/`quit()` are the deprecated v4 spellings).
    expect(client?.isOpen).toBe(true);
    expect(typeof client?.destroy).toBe('function');
    client?.destroy?.();

    // `@keyv/redis` reopens the connection on the next command, so the call below
    // either falls through to the DB on a rejected cache op or hits a freshly
    // reconnected client. Both satisfy the contract under test: a Redis that
    // drops underneath a request must never surface as an error to the caller.

    await expect(service.findAll({ page: 1, limit: 20, categoryId })).resolves.toBeDefined();
  });
});
