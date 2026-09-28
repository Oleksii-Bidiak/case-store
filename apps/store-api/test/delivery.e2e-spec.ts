import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';
import { NovaPoshtaClient } from '../src/delivery';

/**
 * E2E tests for the Delivery (Nova Poshta) module.
 *
 * The NovaPoshtaClient is mocked so no real NP API key or network call is
 * needed — the test exercises the controller → service → DTO validation →
 * caching → mapping pipeline end to end. PrismaService is mocked (no DB).
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('DeliveryController (e2e)', () => {
  let app: INestApplication;

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    // DeliveryService resolves the dispatch origin through DeliveryRepository now
    // (TASK-080-E), so the singleton read has to exist here. null = never
    // configured, which is the state this suite is asserting against: the origin
    // then falls back to NP_SENDER_CITY_REF and finally to the Kyiv default.
    deliverySetting: {
      findUnique: jest.fn(async (): Promise<unknown> => null),
      // Echo the write back as the stored row, the way Prisma would (TASK-643).
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => settingRow(args.create)),
    },
    // TASK-643: the checkout's pickup points.
    pickupPoint: {
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      findFirst: jest.fn(async () => null),
    },
  };

  /** A stored settings row: the schema defaults, overridden per case. */
  function settingRow(over: Record<string, unknown> = {}) {
    return {
      id: '00000000-0000-0000-0000-000000000003',
      senderCityRef: null,
      senderCityName: null,
      senderWarehouseRef: null,
      defaultWeightKg: 0.5,
      npEnabled: true,
      pickupEnabled: false,
      courierEnabled: false,
      otherEnabled: true,
      courierCityName: null,
      courierPrice: new Prisma.Decimal(0),
      courierFreeFrom: null,
      createdAt: new Date('2026-09-26T00:00:00Z'),
      updatedAt: new Date('2026-09-26T00:00:00Z'),
      ...over,
    };
  }

  let jwtService: JwtService;
  const adminToken = () =>
    jwtService.sign(
      { sub: 'admin-e2e-1', role: 'ADMIN' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

  const novaPoshtaClientMock = {
    isConfigured: jest.fn(() => true),
    searchCities: jest.fn(async () => [
      {
        Present: 'м. Київ, Київська обл.',
        MainDescription: 'Київ',
        Area: 'Київська',
        Ref: 'settlement-1',
        DeliveryCity: 'city-ref-1',
        Warehouses: 1234,
      },
    ]),
    searchWarehouses: jest.fn(async () => [
      {
        Ref: 'wh-1',
        Description: 'Відділення №1',
        Number: '1',
        TypeOfWarehouse: 'type-1',
        CityRef: 'city-ref-1',
      },
    ]),
    estimateShipping: jest.fn(async () => ({ cost: 60, etaDays: 2 })),
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
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(NovaPoshtaClient)
      .useValue(novaPoshtaClientMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
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

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/delivery/cities', () => {
    it('returns mapped cities for a valid query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/delivery/cities')
        .query({ q: 'Київ' })
        .expect(200);

      expect(res.body.data).toEqual([
        {
          ref: 'city-ref-1',
          name: 'м. Київ, Київська обл.',
          area: 'Київська',
          warehouses: 1234,
        },
      ]);
    });

    it('rejects a missing query with 400', async () => {
      await request(app.getHttpServer()).get('/api/delivery/cities').expect(400);
    });

    it('rejects a query shorter than 2 characters with 400', async () => {
      await request(app.getHttpServer()).get('/api/delivery/cities').query({ q: 'К' }).expect(400);
    });
  });

  describe('GET /api/delivery/warehouses', () => {
    it('returns mapped warehouses for a city', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/delivery/warehouses')
        .query({ cityRef: 'city-ref-1' })
        .expect(200);

      expect(res.body.data).toEqual([
        {
          ref: 'wh-1',
          description: 'Відділення №1',
          number: '1',
          typeOfWarehouse: 'type-1',
        },
      ]);
    });

    it('rejects a missing cityRef with 400', async () => {
      await request(app.getHttpServer()).get('/api/delivery/warehouses').expect(400);
    });
  });

  describe('GET /api/delivery/estimate', () => {
    it('returns a cost + ETA estimate for a city', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/delivery/estimate')
        .query({ cityRef: 'city-ref-2' })
        .expect(200);

      expect(res.body.data).toEqual({ cost: '60.00', etaDays: 2 });
    });
  });

  // ─── TASK-643: delivery methods ─────────────────────────────────────────────

  describe('GET /api/delivery/methods', () => {
    afterEach(() => {
      prismaServiceMock.deliverySetting.findUnique.mockImplementation(async () => null);
      prismaServiceMock.pickupPoint.findMany.mockImplementation(async () => []);
    });

    it('is public and answers with the schema defaults when nothing was configured', async () => {
      const res = await request(app.getHttpServer()).get('/api/delivery/methods').expect(200);

      expect(res.body.data).toEqual({
        methods: ['NOVA_POSHTA', 'OTHER'],
        courier: { price: '0.00', freeFrom: null, cityName: null },
        pickupPoints: [],
        paymentMatrix: {
          NOVA_POSHTA: ['ON_DELIVERY', 'ONLINE', 'INSTALLMENTS'],
          PICKUP: ['ON_DELIVERY', 'ONLINE', 'INSTALLMENTS'],
          COURIER: ['ON_DELIVERY', 'ONLINE', 'INSTALLMENTS'],
          OTHER: ['ON_DELIVERY'],
        },
      });
    });

    it('lists the enabled set, the courier terms and the active points when configured', async () => {
      const point = {
        id: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11',
        name: 'Магазин на Хрещатику',
        city: 'Київ',
        address: 'вул. Хрещатик, 1',
        phone: '+380441234567',
        workingHours: 'Пн–Пт 10:00–19:00',
        mapUrl: null,
      };
      prismaServiceMock.deliverySetting.findUnique.mockImplementation(async () =>
        settingRow({
          npEnabled: false,
          pickupEnabled: true,
          courierEnabled: true,
          otherEnabled: false,
          courierCityName: 'Київ',
          courierPrice: new Prisma.Decimal('120'),
          courierFreeFrom: new Prisma.Decimal('1500'),
        }),
      );
      prismaServiceMock.pickupPoint.findMany.mockImplementation(async () => [point]);

      const res = await request(app.getHttpServer()).get('/api/delivery/methods').expect(200);

      expect(res.body.data).toMatchObject({
        methods: ['PICKUP', 'COURIER'],
        courier: { price: '120.00', freeFrom: '1500.00', cityName: 'Київ' },
        pickupPoints: [point],
      });
      expect(prismaServiceMock.pickupPoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('PUT /api/admin/delivery-settings (TASK-643 fields)', () => {
    it('accepts the method flags and courier terms and answers with them', async () => {
      const body = {
        npEnabled: true,
        pickupEnabled: true,
        courierEnabled: true,
        otherEnabled: false,
        courierCityName: 'Київ',
        courierPrice: 120.5,
        courierFreeFrom: 1500,
      };

      const res = await request(app.getHttpServer())
        .put('/api/admin/delivery-settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)
        .expect(200);

      expect(prismaServiceMock.deliverySetting.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ update: body }),
      );
      expect(res.body.data).toMatchObject({
        pickupEnabled: true,
        courierEnabled: true,
        otherEnabled: false,
        courierCityName: 'Київ',
        courierPrice: '120.50',
        courierFreeFrom: '1500.00',
      });
    });

    it('accepts null to remove the free-courier threshold', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/admin/delivery-settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ courierFreeFrom: null })
        .expect(200);

      expect(prismaServiceMock.deliverySetting.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ update: { courierFreeFrom: null } }),
      );
      expect(res.body.data.courierFreeFrom).toBeNull();
    });

    it.each([
      ['a negative courier price', { courierPrice: -1 }],
      ['a courier price with three decimals', { courierPrice: 10.555 }],
      ['a courier price over the ceiling', { courierPrice: 100001 }],
      ['a negative threshold', { courierFreeFrom: -5 }],
      // enableImplicitConversion would turn 'yes' into `true` if the DTO let it.
      ['a non-boolean flag', { pickupEnabled: 'yes' }],
      // The columns are NOT NULL: null must be a 400, not a Prisma error.
      ['a null flag', { npEnabled: null }],
      ['a null courier price', { courierPrice: null }],
      ['an over-long courier city', { courierCityName: 'x'.repeat(256) }],
    ])('rejects %s with 400', async (_label, body) => {
      prismaServiceMock.deliverySetting.upsert.mockClear();

      const res = await request(app.getHttpServer())
        .put('/api/admin/delivery-settings')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)
        .expect(400);

      // Refused by the field's own rule — not merely as an unknown property.
      // (This harness installs no global filter, so `message` is the raw array.)
      const message = ([] as string[]).concat(res.body.message).join('; ');
      expect(message).toContain(Object.keys(body)[0]);
      expect(message).not.toMatch(/should not exist/);
      expect(prismaServiceMock.deliverySetting.upsert).not.toHaveBeenCalled();
    });
  });
});
