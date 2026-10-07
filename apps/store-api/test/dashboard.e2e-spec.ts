import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { DashboardRepository } from '../src/dashboard/dashboard.repository';
import type {
  DashboardSummaryBase,
  NeedsAction,
  RevenueMetrics,
} from '../src/dashboard/dashboard.types';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { UserRole } from '@prisma/client';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the Admin Dashboard module.
 *
 * The clean-architecture boundary — `DashboardRepository` — is mocked, so the
 * raw aggregation SQL is not exercised here (that is validated by the manual
 * smoke test against a running DB). These specs assert the HTTP contract:
 * guard behaviour (401/403/200) and the typed response shape. AuthRepository
 * and PrismaService are mocked so AppModule boots without a database, and
 * ThrottlerGuard is overridden to disable rate limiting.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin Dashboard (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const revenueFixture: RevenueMetrics = {
    totalRevenue: 48230.75,
    revenueLast30Days: 8120.4,
    unrealizedRevenue: 12400.0,
    unrealizedRevenueLast30Days: 3800.0,
    averageOrderValueLast30Days: 812.04,
    revenueByDay: [
      { date: '2026-06-12', value: 1200.5 },
      { date: '2026-06-13', value: 0 },
    ],
  };

  const summaryFixture: DashboardSummaryBase = {
    orders: {
      totalOrders: 312,
      ordersByStatus: [
        { status: 'PENDING', count: 12 },
        { status: 'DELIVERED', count: 200 },
      ],
      ordersByDay: [
        { date: '2026-06-12', value: 4 },
        { date: '2026-06-13', value: 0 },
      ],
    },
    users: {
      totalUsers: 1045,
      newUsersByDay: [
        { date: '2026-06-12', value: 3 },
        { date: '2026-06-13', value: 1 },
      ],
    },
    customers: {
      repeatBuyerRate: 0.24,
      repeatBuyerRateLast90Days: 0.31,
    },
    products: {
      totalProducts: 128,
      activeProducts: 119,
      topProducts: [
        { productId: 'prod-1', name: 'USB-C Cable 2m', totalRevenue: 3420, unitsSold: 12 },
        { productId: 'prod-3', name: 'MagSafe Case', totalRevenue: 2100, unitsSold: 30 },
      ],
    },
    inventory: {
      lowStockProducts: [
        {
          productId: 'prod-2',
          productName: 'Silicone Case',
          stock: 3,
        },
      ],
    },
    operations: {
      averageProcessingHoursLast30Days: 36.5,
    },
  };

  const needsActionFixture: NeedsAction = {
    newOrders: 4,
    pendingReviews: 2,
    unpaidInTransit: 7,
    failedMails: 1,
    // TASK-1090: failed Telegram rows are their own counter, not part of failedMails.
    failedTelegram: 6,
    pendingOver48h: 1,
    // TASK-589. Counted here for the same reason as the other five: the envelope
    // is what the admin widget reads, and a counter the repository computes but
    // the response drops is a tile that is permanently, silently empty.
    ratingAbuse: 2,
    // TASK-601: what the two flagged things ARE, so the card can link to them.
    ratingAbuseSignals: { productIds: ['p-burst'], createdIps: ['203.0.113.42'] },
    // TASK-470: the «Недоступні позиції» aggregate, for the same reason again.
    unavailableItems: 3,
    // TASK-352: «Оплачено після скасування».
    paidAfterCancel: 5,
  };

  const dashboardRepositoryMock = {
    getSummary: jest.fn().mockResolvedValue(summaryFixture),
    getRevenueMetrics: jest.fn().mockResolvedValue(revenueFixture),
    getNeedsAction: jest.fn().mockResolvedValue(needsActionFixture),
  };

  // Held, not inlined: the TASK-684 cases below hand a manager `analytics:read`
  // alone, then both keys, and read the body each time.
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

  function generateAccessToken(userId: string, role: string): string {
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
      .overrideProvider(DashboardRepository)
      .useValue(dashboardRepositoryMock)
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
    dashboardRepositoryMock.getSummary.mockResolvedValue(summaryFixture);
    dashboardRepositoryMock.getRevenueMetrics.mockResolvedValue(revenueFixture);
    permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
    dashboardRepositoryMock.getNeedsAction.mockResolvedValue(needsActionFixture);
  });

  describe('GET /api/admin/dashboard/summary', () => {
    it('should return 401 without an auth token', async () => {
      await request(app.getHttpServer()).get('/api/admin/dashboard/summary').expect(401);
    });

    it('should return 403 for a non-admin (CUSTOMER) token', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with the full summary shape for an admin token', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body;

      // revenue
      expect(typeof body.revenue.totalRevenue).toBe('number');
      expect(typeof body.revenue.revenueLast30Days).toBe('number');
      expect(typeof body.revenue.unrealizedRevenue).toBe('number');
      expect(typeof body.revenue.unrealizedRevenueLast30Days).toBe('number');
      expect(typeof body.revenue.averageOrderValueLast30Days).toBe('number');
      expect(Array.isArray(body.revenue.revenueByDay)).toBe(true);
      expect(body.revenue.revenueByDay[0]).toEqual(
        expect.objectContaining({ date: expect.any(String), value: expect.any(Number) }),
      );

      // customers (TASK-249)
      expect(typeof body.customers.repeatBuyerRate).toBe('number');
      expect(typeof body.customers.repeatBuyerRateLast90Days).toBe('number');

      // orders
      expect(typeof body.orders.totalOrders).toBe('number');
      expect(Array.isArray(body.orders.ordersByStatus)).toBe(true);
      expect(body.orders.ordersByStatus[0]).toEqual(
        expect.objectContaining({ status: expect.any(String), count: expect.any(Number) }),
      );
      expect(Array.isArray(body.orders.ordersByDay)).toBe(true);

      // users
      expect(typeof body.users.totalUsers).toBe('number');
      expect(Array.isArray(body.users.newUsersByDay)).toBe(true);

      // products
      expect(typeof body.products.totalProducts).toBe('number');
      expect(typeof body.products.activeProducts).toBe('number');
      expect(Array.isArray(body.products.topProducts)).toBe(true);
      expect(body.products.topProducts[0]).toEqual(
        expect.objectContaining({
          productId: expect.any(String),
          name: expect.any(String),
          totalRevenue: expect.any(Number),
          unitsSold: expect.any(Number),
        }),
      );

      // inventory
      expect(Array.isArray(body.inventory.lowStockProducts)).toBe(true);
      expect(body.inventory.lowStockProducts[0]).toEqual(
        expect.objectContaining({
          productId: expect.any(String),
          productName: expect.any(String),
          stock: expect.any(Number),
        }),
      );

      // operations (TASK-251)
      expect(typeof body.operations.averageProcessingHoursLast30Days).toBe('number');
    });

    it('should return non-negative numeric metrics and array fields when the store is empty', async () => {
      dashboardRepositoryMock.getRevenueMetrics.mockResolvedValueOnce({
        totalRevenue: 0,
        revenueLast30Days: 0,
        unrealizedRevenue: 0,
        unrealizedRevenueLast30Days: 0,
        averageOrderValueLast30Days: 0,
        revenueByDay: [],
      });
      dashboardRepositoryMock.getSummary.mockResolvedValueOnce({
        orders: { totalOrders: 0, ordersByStatus: [], ordersByDay: [] },
        users: { totalUsers: 0, newUsersByDay: [] },
        customers: { repeatBuyerRate: 0, repeatBuyerRateLast90Days: 0 },
        products: { totalProducts: 0, activeProducts: 0, topProducts: [] },
        inventory: { lowStockProducts: [] },
        operations: { averageProcessingHoursLast30Days: 0 },
      });

      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body;
      expect(body.revenue.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(body.orders.totalOrders).toBeGreaterThanOrEqual(0);
      expect(body.users.totalUsers).toBeGreaterThanOrEqual(0);
      expect(body.products.totalProducts).toBeGreaterThanOrEqual(0);
      expect(body.inventory.lowStockProducts).toEqual([]);
    });

    /**
     * THE GATE OF TASK-684 (plan 188): money is cut by the API, not the browser.
     *
     * The admin panel is a public bundle and the network tab shows whatever the
     * server sent, so "the tile is hidden" proves nothing. What is asserted here
     * is the BODY: for a manager holding `analytics:read` alone, the `revenue`
     * key is absent and no top product carries a sum — checked on the parsed
     * object and, belt and braces, on the raw text, where a money field renamed
     * or nested somewhere new would still show up.
     */
    describe('the revenue split (TASK-684)', () => {
      it('sends a manager with analytics:read alone no revenue at all', async () => {
        permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:read']);
        const token = generateAccessToken('manager-e2e-1', 'MANAGER');

        const response = await request(app.getHttpServer())
          .get('/api/admin/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body).not.toHaveProperty('revenue');
        expect(response.body.products.topProducts).toHaveLength(2);
        for (const product of response.body.products.topProducts) {
          expect(product).not.toHaveProperty('totalRevenue');
          expect(typeof product.unitsSold).toBe('number');
        }
        // Ranked by units, not by the money it no longer carries.
        expect(
          response.body.products.topProducts.map((p: { productId: string }) => p.productId),
        ).toEqual(['prod-3', 'prod-1']);
        for (const moneyKey of ['"revenue"', 'totalRevenue', 'revenueLast30Days', 'revenueByDay']) {
          expect(response.text).not.toContain(moneyKey);
        }
        // The operational dashboard is still all there.
        expect(response.body.orders.totalOrders).toBe(312);
        expect(response.body.operations.averageProcessingHoursLast30Days).toBe(36.5);
        // …and the money was never even computed for them.
        expect(dashboardRepositoryMock.getRevenueMetrics).not.toHaveBeenCalled();
      });

      it('sends a manager holding analytics:revenue too the revenue block and the sums', async () => {
        permissionRepositoryMock.setGrants(UserRole.MANAGER, [
          'analytics:read',
          'analytics:revenue',
        ]);
        const token = generateAccessToken('manager-e2e-1', 'MANAGER');

        const response = await request(app.getHttpServer())
          .get('/api/admin/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(response.body.revenue).toEqual(revenueFixture);
        expect(response.body.products.topProducts[0]).toEqual({
          productId: 'prod-1',
          name: 'USB-C Cable 2m',
          totalRevenue: 3420,
          unitsSold: 12,
        });
      });

      it('still refuses a manager holding analytics:revenue WITHOUT analytics:read', async () => {
        // The money key is a widening of the dashboard, not a door into it.
        permissionRepositoryMock.setGrants(UserRole.MANAGER, ['analytics:revenue']);
        const token = generateAccessToken('manager-e2e-1', 'MANAGER');

        await request(app.getHttpServer())
          .get('/api/admin/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      });
    });
  });

  describe('GET /api/admin/dashboard/needs-action', () => {
    it('should return 401 without an auth token', async () => {
      await request(app.getHttpServer()).get('/api/admin/dashboard/needs-action').expect(401);
    });

    it('should return 403 for a non-admin (CUSTOMER) token', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/admin/dashboard/needs-action')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with every counter wrapped in a data envelope for an admin token', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard/needs-action')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        data: {
          newOrders: 4,
          pendingReviews: 2,
          unpaidInTransit: 7,
          failedMails: 1,
          failedTelegram: 6,
          pendingOver48h: 1,
          ratingAbuse: 2,
          ratingAbuseSignals: { productIds: ['p-burst'], createdIps: ['203.0.113.42'] },
          unavailableItems: 3,
          paidAfterCancel: 5,
        },
      });
      for (const counter of Object.keys(needsActionFixture).filter(
        (key) => key !== 'ratingAbuseSignals',
      )) {
        expect(typeof response.body.data[counter]).toBe('number');
      }
    });

    it('should return zeroed counters when nothing needs action', async () => {
      const quiet: NeedsAction = {
        newOrders: 0,
        pendingReviews: 0,
        unpaidInTransit: 0,
        failedMails: 0,
        failedTelegram: 0,
        pendingOver48h: 0,
        ratingAbuse: 0,
        ratingAbuseSignals: { productIds: [], createdIps: [] },
        unavailableItems: 0,
        paidAfterCancel: 0,
      };
      dashboardRepositoryMock.getNeedsAction.mockResolvedValueOnce(quiet);

      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard/needs-action')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toEqual(quiet);
    });
  });
});
