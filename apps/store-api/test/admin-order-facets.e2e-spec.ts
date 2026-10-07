import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the delivery dimension of the admin order list (TASK-648):
 *
 *   GET /api/admin/orders?deliveryMethod=…&pickupPointId=…   — the filters
 *   GET /api/admin/orders/facets                             — per-method counts
 *   GET /api/admin/orders/export                             — «Спосіб доставки» column
 *
 * Unlike `order.e2e-spec.ts`, the REAL `OrderRepository` runs here and only the
 * Prisma client is a double, so what is asserted is the WHERE that would reach
 * Postgres: the filter arms, and the facet's "every filter but its own". That the
 * counts come out right on real rows is `admin-order-facets.int-spec.ts`.
 */
describe('Admin orders — delivery filters, facets and CSV (e2e, TASK-648)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const POINT_ID = '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11';

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    // `findAll` runs `[count, findMany]` as an array transaction.
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    order: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      groupBy: jest.fn(
        async (_args: { by: string[]; where: Record<string, any> }): Promise<unknown[]> => [],
      ),
    },
  };

  const token = (sub: string, role: string) =>
    jwtService.sign({ sub, role }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
  const admin = () => `Bearer ${token('admin-e2e-1', 'ADMIN')}`;

  /** The WHERE of the last call to a delegate. */
  const lastWhere = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0].where;

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
      .useValue(createPermissionRepositoryMock())
      // Rate limiting off by replacing the COUNTER — see order.e2e-spec.ts for why
      // overriding the guard silently does nothing.
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/admin/orders — delivery filters', () => {
    it('filters by a comma-separated list of methods', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .query({ deliveryMethod: 'PICKUP,COURIER' })
        .set('Authorization', admin())
        .expect(200);

      expect(lastWhere(prismaServiceMock.order.count).AND).toContainEqual({
        deliveryMethod: { in: ['PICKUP', 'COURIER'] },
      });
    });

    it('filters by pickup point', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .query({ pickupPointId: POINT_ID })
        .set('Authorization', admin())
        .expect(200);

      expect(lastWhere(prismaServiceMock.order.count).AND).toContainEqual({
        pickupPointId: POINT_ID,
      });
    });

    it.each([
      ['an unknown method', { deliveryMethod: 'PICKUP,UKRPOSHTA' }],
      ['a non-uuid point', { pickupPointId: 'shop-1' }],
    ])('rejects %s with 400', async (_label, query) => {
      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .query(query)
        .set('Authorization', admin())
        .expect(400);

      expect(prismaServiceMock.order.count).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/orders/facets', () => {
    it('answers all four counts, under every filter but deliveryMethod', async () => {
      prismaServiceMock.order.groupBy.mockResolvedValueOnce([
        { deliveryMethod: 'NOVA_POSHTA', _count: { _all: 7 } },
        { deliveryMethod: 'PICKUP', _count: { _all: 3 } },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/admin/orders/facets')
        .query({
          deliveryMethod: 'PICKUP',
          pickupPointId: POINT_ID,
          paymentMethod: 'ON_DELIVERY',
          status: 'PENDING,CONFIRMED',
          // The list's own params pass through and are ignored.
          page: 2,
          limit: 20,
          sortBy: 'total',
        })
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual({
        data: { deliveryMethod: { NOVA_POSHTA: 7, PICKUP: 3, COURIER: 0, OTHER: 0 } },
      });

      const call = prismaServiceMock.order.groupBy.mock.calls[0]![0];
      expect(call.by).toEqual(['deliveryMethod']);
      // Honours the other filters…
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.status).toEqual({ in: ['PENDING', 'CONFIRMED'] });
      expect(call.where.AND).toContainEqual({ paymentMethod: 'ON_DELIVERY' });
      expect(call.where.AND).toContainEqual({ pickupPointId: POINT_ID });
      // …and ignores its own.
      expect(JSON.stringify(call.where)).not.toContain('deliveryMethod');
    });

    it('answers zeros for every method when nothing matches (route is not `:orderId`)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/orders/facets')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body.data.deliveryMethod).toEqual({
        NOVA_POSHTA: 0,
        PICKUP: 0,
        COURIER: 0,
        OTHER: 0,
      });
    });

    it('refuses a customer with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/orders/facets')
        .set('Authorization', `Bearer ${token('customer-e2e-1', 'CUSTOMER')}`)
        .expect(403);
    });

    it('rejects an invalid filter with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/orders/facets')
        .query({ deliveryMethod: 'TELEPORT' })
        .set('Authorization', admin())
        .expect(400);
    });
  });

  describe('GET /api/admin/orders/export — «Спосіб доставки»', () => {
    const exportRow = (id: string, deliveryMethod: string) => ({
      id,
      createdAt: new Date('2026-10-01T10:00:00Z'),
      status: 'PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: 'ON_DELIVERY',
      deliveryMethod,
      paidAt: null,
      subtotal: '100.00',
      discount: '0.00',
      discountCode: null,
      addonsTotal: '0.00',
      shippingCost: '0.00',
      tax: '0.00',
      total: '100.00',
      trackingNumber: null,
      guestEmail: 'g@example.com',
      guestPhone: '380501112233',
      guestName: 'Гість',
      shippingAddress: { city: 'Київ' },
      user: null,
      _count: { items: 1 },
    });

    it('applies the delivery filters and prints the Ukrainian label per row', async () => {
      prismaServiceMock.order.findMany.mockResolvedValueOnce([
        exportRow('aaaaaaaa-0000-4000-8000-000000000001', 'PICKUP'),
        exportRow('bbbbbbbb-0000-4000-8000-000000000002', 'COURIER'),
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/admin/orders/export')
        .query({ deliveryMethod: 'PICKUP,COURIER', pickupPointId: POINT_ID })
        .set('Authorization', admin())
        .expect(200);

      const where = lastWhere(prismaServiceMock.order.findMany);
      expect(where.AND).toContainEqual({ deliveryMethod: { in: ['PICKUP', 'COURIER'] } });
      expect(where.AND).toContainEqual({ pickupPointId: POINT_ID });

      expect(res.text.startsWith('﻿')).toBe(true);
      const [header, ...rows] = res.text.replace(/^﻿/, '').split('\r\n').filter(Boolean);
      const column = header.split(',').indexOf('Спосіб доставки');
      expect(column).toBeGreaterThan(-1);
      expect(rows.map((row) => row.split(',')[column])).toEqual(['Самовивіз', 'Курʼєр']);
    });
  });
});
