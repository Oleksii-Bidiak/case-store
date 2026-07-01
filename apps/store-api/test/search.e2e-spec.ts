import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { MeiliClient } from '../src/search';

/**
 * E2E tests for the Search module (TASK-075).
 *
 * The MeiliClient is mocked (mirrors delivery.e2e / NovaPoshtaClient) so NO
 * running engine is needed — the tests exercise the controller → service → DTO
 * validation → Meili/Postgres-fallback pipeline end to end. PrismaService is
 * mocked (no DB); the fallback path reads its product data from the mock.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

/** A Prisma-shaped active product row consumed by PublicProductEntity.fromPrisma. */
function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'iPhone 15 Pro Case',
    slug: 'iphone-15-pro-case',
    description: 'Clear MagSafe case',
    price: 29.99,
    compareAtPrice: null,
    sku: 'IP15-1',
    stock: 25,
    categoryId: 'cat-1',
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Search (e2e)', () => {
  let app: INestApplication;

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    product: {
      findMany: jest.fn(async () => [] as unknown[]),
      count: jest.fn(async () => 0),
    },
    productImage: {
      findMany: jest.fn(async () => [] as unknown[]),
    },
    review: {
      groupBy: jest.fn(async () => [] as unknown[]),
    },
  };

  // Configured + healthy by default; individual tests flip `isConfigured` /
  // `search` to exercise the Meili path vs the Postgres fallback.
  const meiliClientMock = {
    isConfigured: jest.fn(() => true),
    health: jest.fn(async () => true),
    ensureIndex: jest.fn(async () => undefined),
    indexDocuments: jest.fn(async () => undefined),
    deleteDocument: jest.fn(async () => undefined),
    clearDocuments: jest.fn(async () => undefined),
    search: jest.fn(async () => ({ hits: [], estimatedTotalHits: 0 })),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(MeiliClient)
      .useValue(meiliClientMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    meiliClientMock.isConfigured.mockReturnValue(true);
    meiliClientMock.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
    prismaServiceMock.product.findMany.mockResolvedValue([]);
    prismaServiceMock.product.count.mockResolvedValue(0);
    prismaServiceMock.productImage.findMany.mockResolvedValue([]);
    prismaServiceMock.review.groupBy.mockResolvedValue([]);
  });

  describe('GET /api/search — Meili path', () => {
    it('hydrates ranked Meili hit ids into product cards', async () => {
      meiliClientMock.search.mockResolvedValue({
        hits: [{ id: 'product-1' }],
        estimatedTotalHits: 1,
      });
      prismaServiceMock.product.findMany.mockResolvedValue([makeProductRow()]);

      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'айфон' })
        .expect(200);

      expect(meiliClientMock.search).toHaveBeenCalled();
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ id: 'product-1', slug: 'iphone-15-pro-case' });
      // Public entity never leaks raw stock.
      expect(res.body.data[0]).not.toHaveProperty('stock');
      expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 20 });
    });
  });

  describe('GET /api/search — Postgres fallback', () => {
    it('serves Postgres results when Meili is not configured', async () => {
      meiliClientMock.isConfigured.mockReturnValue(false);
      prismaServiceMock.product.findMany.mockResolvedValue([makeProductRow()]);
      prismaServiceMock.product.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'case' })
        .expect(200);

      expect(meiliClientMock.search).not.toHaveBeenCalled();
      expect(prismaServiceMock.product.findMany).toHaveBeenCalled();
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('falls back to Postgres when the engine errors (search → null)', async () => {
      meiliClientMock.isConfigured.mockReturnValue(true);
      meiliClientMock.search.mockResolvedValue(null);
      prismaServiceMock.product.findMany.mockResolvedValue([makeProductRow()]);
      prismaServiceMock.product.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'case' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/search/suggest', () => {
    it('returns lightweight suggestions from the Meili index', async () => {
      meiliClientMock.search.mockResolvedValue({
        hits: [
          {
            id: 'product-1',
            name: 'iPhone 15 Pro Case',
            slug: 'iphone-15-pro-case',
            price: 29.99,
            compareAtPrice: null,
            primaryImageUrl: null,
          },
        ],
        estimatedTotalHits: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/search/suggest')
        .query({ q: 'айф' })
        .expect(200);

      expect(res.body.data).toEqual([
        {
          id: 'product-1',
          name: 'iPhone 15 Pro Case',
          slug: 'iphone-15-pro-case',
          price: '29.99',
          compareAtPrice: null,
          primaryImageUrl: null,
        },
      ]);
    });

    it('rejects a missing q with 400', async () => {
      await request(app.getHttpServer()).get('/api/search/suggest').expect(400);
    });

    it('rejects an empty q with 400 (min length 1)', async () => {
      await request(app.getHttpServer()).get('/api/search/suggest').query({ q: '' }).expect(400);
    });
  });

  describe('POST /api/admin/search/reindex', () => {
    it('requires authentication (401 without a token)', async () => {
      await request(app.getHttpServer()).post('/api/admin/search/reindex').expect(401);
    });
  });
});
