import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => null),
    },
  };

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
});
