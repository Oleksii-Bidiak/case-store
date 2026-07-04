import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule, PrismaService } from '../src/prisma';
import { RedisCacheModule, CacheService, productDetailIdKey } from '../src/cache';
import { ProductModule } from '../src/product';
import { ProductService } from '../src/product/product.service';
import { ProductRepository } from '../src/product/product.repository';

/**
 * Integration tests for the Redis cache layer — run the REAL CacheService and
 * ProductService against a REAL Redis instance and a REAL Postgres test DB
 * (no mocks). These exercise what the unit tests (mocked CacheService) cannot:
 * the actual SCAN-based prefix eviction, ioredis serialization round-trips, and
 * the graceful-degradation fallback when the Redis connection drops.
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
    // Forcibly drop the underlying ioredis connection. CacheService must swallow
    // the resulting errors and fall through to the database without throwing.
    const client = (cacheManager as unknown as { store?: { client?: { disconnect?: () => void } } })
      .store?.client;
    client?.disconnect?.();

    await expect(service.findAll({ page: 1, limit: 20, categoryId })).resolves.toBeDefined();
  });
});
