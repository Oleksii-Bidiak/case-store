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
    permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
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
