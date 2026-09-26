import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PermissionRepository } from '../src/auth/permissions';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import type { SalesDay, SalesTotals } from '../src/analytics/reports/sales.repository';
import { CatalogueRepository } from '../src/analytics/reports/catalogue.repository';
import { ProductsReportRepository } from '../src/analytics/reports/products-report.repository';
import { RegistrationsRepository } from '../src/analytics/reports/registrations.repository';
import type {
  BrandSalesRow,
  CategorySalesRow,
} from '../src/analytics/reports/catalogue.repository';
import { PrismaService } from '../src/prisma';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the `/analytics` reports API (TASK-686, plan 188).
 *
 * `SalesRepository` is mocked — its SQL is pinned on a real database in
 * `analytics-sales.repository.int-spec.ts`. What is asserted here is the HTTP
 * contract: who may read the sales report (the whole report is money, so it is
 * withheld from anyone without `analytics:revenue` — owner's decision), the
 * response envelope, and that an unanswerable period is a 400 before any query.
 * AuthRepository and PrismaService are mocked so AppModule boots without a
 * database; the throttler is disabled.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin Analytics Reports (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const totals: SalesTotals = { sales: 1000.1, refunds: 300.05, orders: 4 };
  const daily: SalesDay[] = [
    { date: '2026-09-25', sales: 1000.1, refunds: 0, net: 1000.1 },
    { date: '2026-09-26', sales: 0, refunds: 300.05, net: -300.05 },
  ];

  const salesRepositoryMock = {
    getTotals: jest.fn().mockResolvedValue(totals),
    getDaily: jest.fn().mockResolvedValue(daily),
  };

  const categoryRows: CategorySalesRow[] = [
    {
      categoryId: 'cat-cases',
      name: 'Чохли',
      direct: false,
      hasChildren: true,
      units: 7,
      orders: 4,
      revenue: 4200,
    },
  ];
  const brandRows: BrandSalesRow[] = [
    { brandId: 'brand-apple', name: 'Apple', units: 3, orders: 2, revenue: 900 },
    { brandId: null, name: null, units: 5, orders: 5, revenue: 50 },
  ];
  const catalogueRepositoryMock = {
    getCategorySales: jest.fn().mockResolvedValue(categoryRows),
    getBrandSales: jest.fn().mockResolvedValue(brandRows),
    categoryExists: jest.fn().mockResolvedValue(true),
  };

  const leaderRow = { productId: 'prod-1', name: 'Чохол', units: 6, orders: 3, revenue: 1200 };
  const productsRepositoryMock = {
    getLeaders: jest.fn().mockResolvedValue([leaderRow]),
    getSalesOf: jest.fn().mockResolvedValue([]),
    getOutsiders: jest.fn().mockResolvedValue({ total: 0, rows: [] }),
  };

  const registrationsRepositoryMock = {
    getTotals: jest.fn().mockResolvedValue({ registrations: 12, fromGuest: 3 }),
    getDaily: jest.fn().mockResolvedValue([{ date: '2026-09-01', registrations: 2 }]),
  };

  const permissionRepositoryMock = createPermissionRepositoryMock();

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  function tokenFor(userId: string, role: UserRole): string {
    return jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

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
      .overrideProvider(PermissionRepository)
      .useValue(permissionRepositoryMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(SalesRepository)
      .useValue(salesRepositoryMock)
      .overrideProvider(CatalogueRepository)
      .useValue(catalogueRepositoryMock)
      .overrideProvider(ProductsReportRepository)
      .useValue(productsRepositoryMock)
      .overrideProvider(RegistrationsRepository)
      .useValue(registrationsRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

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

  afterEach(() => {
    jest.clearAllMocks();
    salesRepositoryMock.getTotals.mockResolvedValue(totals);
    salesRepositoryMock.getDaily.mockResolvedValue(daily);
    catalogueRepositoryMock.getCategorySales.mockResolvedValue(categoryRows);
    catalogueRepositoryMock.getBrandSales.mockResolvedValue(brandRows);
    catalogueRepositoryMock.categoryExists.mockResolvedValue(true);
    permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
  });

  // The reports cache in memory for the whole suite (REDIS_HOST=''), so each
  // case below asks a period of its own — a cached answer from a previous case
  // must not be what is asserted.
  describe('GET /api/admin/analytics/reports/registrations (TASK-690)', () => {
    const URL = '/api/admin/analytics/reports/registrations';

    it('returns 403 for a manager without analytics:read', async () => {
      await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`)
        .expect(403);
      expect(registrationsRepositoryMock.getTotals).not.toHaveBeenCalled();
    });

    it('answers a reader with the counts, their comparison and the daily series', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read']);

      const response = await request(app.getHttpServer())
        .get(URL)
        .query({ preset: 'this-month' })
        .set('Authorization', `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        registrations: { current: 12, previous: 12, changePct: 0 },
        fromGuest: { current: 3, previous: 3, changePct: 0 },
        daily: [{ date: '2026-09-01', registrations: 2 }],
      });
    });
  });

  describe('GET /api/admin/analytics/reports/products (TASK-688)', () => {
    const URL = '/api/admin/analytics/reports/products';
    const MANAGER = () => `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`;

    it('ranks by units and sends no revenue to a reader', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read']);

      const response = await request(app.getHttpServer())
        .get(URL)
        .query({ preset: '7d', limit: 5 })
        .set('Authorization', MANAGER())
        .expect(200);

      expect(productsRepositoryMock.getLeaders).toHaveBeenCalledWith(expect.anything(), 5, 'units');
      expect(response.body.data.rankedBy).toBe('units');
      expect(response.body.data.leaders[0]).toMatchObject({
        productId: 'prod-1',
        units: { current: 6 },
      });
      expect(response.text).not.toContain('revenue');
    });

    it('ranks by money and shows it to a holder of analytics:revenue', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read', 'analytics:revenue']);

      const response = await request(app.getHttpServer())
        .get(URL)
        .query({ preset: '30d' })
        .set('Authorization', MANAGER())
        .expect(200);

      expect(productsRepositoryMock.getLeaders).toHaveBeenCalledWith(
        expect.anything(),
        10,
        'revenue',
      );
      expect(response.body.data.leaders[0].revenue.current).toBe(1200);
    });

    it.each([['0'], ['51'], ['abc']])('returns 400 for limit=%s', async (limit) => {
      await request(app.getHttpServer())
        .get(URL)
        .query({ limit })
        .set('Authorization', `Bearer ${tokenFor('admin-e2e-1', UserRole.ADMIN)}`)
        .expect(400);
    });
  });

  describe('GET /api/admin/analytics/reports/categories and /brands (TASK-687)', () => {
    const MANAGER = () => `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`;

    it('returns 403 for a manager without analytics:read', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:revenue']);
      await request(app.getHttpServer())
        .get('/api/admin/analytics/reports/categories')
        .set('Authorization', MANAGER())
        .expect(403);
    });

    it('answers a reader without a single revenue key in the body', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read']);

      const categories = await request(app.getHttpServer())
        .get('/api/admin/analytics/reports/categories')
        .query({ preset: '7d' })
        .set('Authorization', MANAGER())
        .expect(200);
      const brands = await request(app.getHttpServer())
        .get('/api/admin/analytics/reports/brands')
        .query({ preset: '7d' })
        .set('Authorization', MANAGER())
        .expect(200);

      expect(categories.body.data.rows[0]).toMatchObject({
        categoryId: 'cat-cases',
        units: { current: 7 },
      });
      expect(categories.body.data.basis).toBe('current-catalogue');
      expect(categories.text).not.toContain('revenue');
      expect(brands.body.data.rows.map((r: { brandId: string | null }) => r.brandId)).toEqual([
        null,
        'brand-apple',
      ]);
      expect(brands.text).not.toContain('revenue');
    });

    it('adds the money for a holder of analytics:revenue', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read', 'analytics:revenue']);

      const categories = await request(app.getHttpServer())
        .get('/api/admin/analytics/reports/categories')
        .query({ preset: '30d' })
        .set('Authorization', MANAGER())
        .expect(200);

      expect(categories.body.data.rows[0].revenue).toEqual({
        current: 4200,
        previous: 4200,
        changePct: 0,
      });
    });

    it('returns 404 when expanding a category that does not exist', async () => {
      catalogueRepositoryMock.categoryExists.mockResolvedValue(false);
      await request(app.getHttpServer())
        .get('/api/admin/analytics/reports/categories')
        .query({ parentId: '0b5e8c4e-4a3f-4f0e-9b1a-2f6d7c8e9a10' })
        .set('Authorization', `Bearer ${tokenFor('admin-e2e-1', UserRole.ADMIN)}`)
        .expect(404);
    });

    it('returns 400 for a parentId that is not a UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/analytics/reports/categories')
        .query({ parentId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${tokenFor('admin-e2e-1', UserRole.ADMIN)}`)
        .expect(400);
    });
  });

  describe('GET /api/admin/analytics/reports/sales', () => {
    const URL = '/api/admin/analytics/reports/sales';

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get(URL).expect(401);
    });

    it('returns 403 for a customer', async () => {
      await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${tokenFor('customer-e2e-1', UserRole.CUSTOMER)}`)
        .expect(403);
    });

    it('withholds the whole report from a manager holding analytics:read alone', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read']);

      await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`)
        .expect(403);

      expect(salesRepositoryMock.getTotals).not.toHaveBeenCalled();
    });

    it('refuses a manager holding analytics:revenue without analytics:read — revenue widens, it is not a door', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:revenue']);

      await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`)
        .expect(403);

      expect(salesRepositoryMock.getTotals).not.toHaveBeenCalled();
    });

    it('answers a manager holding analytics:revenue with the whole report', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read', 'analytics:revenue']);

      const response = await request(app.getHttpServer())
        .get(URL)
        .query({ preset: '7d' })
        .set('Authorization', `Bearer ${tokenFor('manager-e2e-1', UserRole.MANAGER)}`)
        .expect(200);

      const { data } = response.body;
      expect(data.period).toEqual(
        expect.objectContaining({ preset: '7d', days: 7, previousDays: 7 }),
      );
      expect(data.sales).toEqual({ current: 1000.1, previous: 1000.1, changePct: 0 });
      expect(data.refunds).toEqual({ current: 300.05, previous: 300.05, changePct: 0 });
      expect(data.net).toEqual({ current: 700.05, previous: 700.05, changePct: 0 });
      expect(data.orders).toEqual({ current: 4, previous: 4, changePct: 0 });
      expect(data.averageOrderValue).toEqual({ current: 175.01, previous: 175.01, changePct: 0 });
      expect(data.daily).toEqual(daily);
    });

    it('answers the owner without any explicit grant', async () => {
      await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', `Bearer ${tokenFor('admin-e2e-1', UserRole.ADMIN)}`)
        .expect(200);
    });

    it('returns 400 for a custom range whose start is after its end', async () => {
      await request(app.getHttpServer())
        .get(URL)
        .query({ preset: 'custom', from: '2026-09-10', to: '2026-09-01' })
        .set('Authorization', `Bearer ${tokenFor('admin-e2e-1', UserRole.ADMIN)}`)
        .expect(400);

      expect(salesRepositoryMock.getTotals).not.toHaveBeenCalled();
    });

    it('returns 400 for a preset that does not exist', async () => {
      await request(app.getHttpServer())
        .get(URL)
        .query({ preset: '365d' })
        .set('Authorization', `Bearer ${tokenFor('admin-e2e-1', UserRole.ADMIN)}`)
        .expect(400);
    });
  });
});
