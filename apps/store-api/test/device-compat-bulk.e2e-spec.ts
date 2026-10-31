import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { AuditRepository } from '../src/audit/audit.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { CategoryRepository } from '../src/category/category.repository';
import { ProductDeviceCompatRepository } from '../src/product/product-device-compat.repository';
import { DEVICE_HUBS_REVALIDATE_TARGET, RevalidationNotifier } from '../src/publishing';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the device-side bulk compatibility write and the model coverage read
 * (TASK-1955), over real HTTP with the real guard, validation pipe, service and
 * audit interceptor. The compat repository is an in-memory double so that «add
 * twice» and «replace» can be checked against an actual state, not a call log.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const P1 = '550e8400-e29b-41d4-a716-446655440101';
const P2 = '550e8400-e29b-41d4-a716-446655440102';
const GHOST = '550e8400-e29b-41d4-a716-4466554401ff';
const M_15 = '550e8400-e29b-41d4-a716-446655440201';
const M_15_PRO = '550e8400-e29b-41d4-a716-446655440202';
const M_14 = '550e8400-e29b-41d4-a716-446655440203';

const MODELS = [
  {
    id: M_15,
    name: 'iPhone 15',
    slug: 'iphone-15',
    series: 'iPhone 15',
    deviceBrandId: 'b1',
    isActive: true,
    brand: { name: 'Apple' },
  },
  {
    id: M_15_PRO,
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    series: 'iPhone 15',
    deviceBrandId: 'b1',
    isActive: false,
    brand: { name: 'Apple' },
  },
  {
    id: M_14,
    name: 'iPhone 14',
    slug: 'iphone-14',
    series: 'iPhone 14',
    deviceBrandId: 'b1',
    isActive: true,
    brand: { name: 'Apple' },
  },
];

const PRODUCTS = [
  { id: P1, slug: 'case-1', isActive: true },
  { id: P2, slug: 'case-2', isActive: true },
];

describe('Device compatibility — bulk write and coverage (e2e, TASK-1955)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const permissions = createPermissionRepositoryMock();

  /** `${productId}|${modelId}` — the in-memory compat table. */
  const pairs = new Set<string>();
  const key = (p: string, m: string) => `${p}|${m}`;

  const compatRepository = {
    findLiveProducts: jest.fn((ids: string[]) =>
      Promise.resolve(PRODUCTS.filter((p) => ids.includes(p.id))),
    ),
    getModelIdSetsByProductIds: jest.fn((ids: string[]) => {
      const map = new Map<string, Set<string>>();
      for (const pair of pairs) {
        const [p, m] = pair.split('|');
        if (!ids.includes(p)) continue;
        map.set(p, (map.get(p) ?? new Set()).add(m));
      }
      return Promise.resolve(map);
    }),
    addCompat: jest.fn((productIds: string[], modelIds: string[]) => {
      let count = 0;
      for (const p of productIds)
        for (const m of modelIds)
          if (!pairs.has(key(p, m))) {
            pairs.add(key(p, m));
            count += 1;
          }
      return Promise.resolve(count);
    }),
    removeCompat: jest.fn((productIds: string[], modelIds: string[]) => {
      let count = 0;
      for (const p of productIds) for (const m of modelIds) if (pairs.delete(key(p, m))) count += 1;
      return Promise.resolve(count);
    }),
    replaceCompat: jest.fn((productIds: string[], modelIds: string[]) => {
      let removed = 0;
      let added = 0;
      for (const pair of [...pairs]) {
        const [p, m] = pair.split('|');
        if (productIds.includes(p) && !modelIds.includes(m)) {
          pairs.delete(pair);
          removed += 1;
        }
      }
      for (const p of productIds)
        for (const m of modelIds)
          if (!pairs.has(key(p, m))) {
            pairs.add(key(p, m));
            added += 1;
          }
      return Promise.resolve({ added, removed });
    }),
    countByRootCategory: jest.fn(() =>
      Promise.resolve([{ rootCategoryId: 'c-cases', deviceModelId: M_15_PRO, productCount: 4 }]),
    ),
    countModelProducts: jest.fn(() =>
      Promise.resolve({ compatibleProducts: 0, inStockProducts: 0 }),
    ),
    findNameCandidatesWithoutModel: jest.fn(() =>
      Promise.resolve([{ id: P1, name: 'Чохол для iPhone 15', slug: 'case-1' }]),
    ),
    // Read by the product module elsewhere; never on these routes.
    getDeviceCompat: jest.fn(() => Promise.resolve([])),
    getDeviceCompatByProductIds: jest.fn(() => Promise.resolve(new Map())),
    getDeviceModelIdsByProductIds: jest.fn(() => Promise.resolve(new Map())),
  };

  const deviceRepository = {
    findModelsByIds: jest.fn((ids: string[]) =>
      Promise.resolve(MODELS.filter((m) => ids.includes(m.id))),
    ),
    findModelsBySeries: jest.fn((series: string[]) =>
      Promise.resolve(MODELS.filter((m) => series.includes(m.series))),
    ),
    findModelById: jest.fn((id: string) =>
      Promise.resolve(MODELS.find((m) => m.id === id) ?? null),
    ),
  };

  const categoryRepository = {
    findByIds: jest.fn(() =>
      Promise.resolve([
        { id: 'c-cases', name: 'Чохли', slug: 'cases', icon: 'cases', sortOrder: 0 },
      ]),
    ),
  };

  const auditRepository = {
    create: jest.fn(() => Promise.resolve(undefined)),
    findActorSnapshot: jest.fn(() => Promise.resolve(null)),
    findMany: jest.fn(),
  };

  const revalidation = { revalidate: jest.fn(() => Promise.resolve(undefined)) };

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

  const managerAuth = () =>
    `Bearer ${jwtService.sign(
      { sub: 'manager-compat-1', email: 'manager-compat-1@example.com', role: 'MANAGER' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

  const put = (body: object, auth?: string) => {
    const req = request(app.getHttpServer()).put('/api/admin/devices/compat/bulk');
    return (auth ? req.set('Authorization', auth) : req).send(body);
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
      .useValue(permissions)
      .overrideProvider(ProductDeviceCompatRepository)
      .useValue(compatRepository)
      .overrideProvider(DeviceRepository)
      .useValue(deviceRepository)
      .overrideProvider(CategoryRepository)
      .useValue(categoryRepository)
      .overrideProvider(AuditRepository)
      .useValue(auditRepository)
      .overrideProvider(RevalidationNotifier)
      .useValue(revalidation)
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
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pairs.clear();
    permissions.setGrants(UserRole.MANAGER, ['devices:write']);
  });

  describe('PUT /api/admin/devices/compat/bulk', () => {
    const addBody = { productIds: [P1, P2], mode: 'add', deviceModelIds: [M_14] };

    it('401 without a token', async () => {
      await put(addBody).expect(401);
    });

    it('403 with devices:read only — and nothing is written', async () => {
      permissions.setGrants(UserRole.MANAGER, ['devices:read', 'products:write']);
      await put(addBody, managerAuth()).expect(403);
      expect(pairs.size).toBe(0);
      expect(compatRepository.addCompat).not.toHaveBeenCalled();
    });

    it('add links every product; a second identical add changes nothing', async () => {
      const first = await put(addBody, managerAuth()).expect(200);
      expect(first.body).toEqual({ data: { updatedProducts: 2, added: 2, removed: 0 } });

      const second = await put(addBody, managerAuth()).expect(200);
      expect(second.body).toEqual({ data: { updatedProducts: 0, added: 0, removed: 0 } });
      expect(pairs.size).toBe(2);
    });

    it('add by series covers the inactive model too, and purges the device hubs', async () => {
      await put({ productIds: [P1], mode: 'add', series: ['iPhone 15'] }, managerAuth()).expect(
        200,
      );

      expect([...pairs].sort()).toEqual([key(P1, M_15), key(P1, M_15_PRO)].sort());
      expect(revalidation.revalidate).toHaveBeenCalledWith(DEVICE_HUBS_REVALIDATE_TARGET);
    });

    it('remove drops only the named models', async () => {
      pairs.add(key(P1, M_14));
      pairs.add(key(P1, M_15));

      const res = await put(
        { productIds: [P1], mode: 'remove', deviceModelIds: [M_14] },
        managerAuth(),
      ).expect(200);

      expect(res.body.data).toEqual({ updatedProducts: 1, added: 0, removed: 1 });
      expect([...pairs]).toEqual([key(P1, M_15)]);
    });

    it('replace makes the named models the whole set', async () => {
      pairs.add(key(P1, M_14));
      pairs.add(key(P2, M_15));

      const res = await put(
        { productIds: [P1, P2], mode: 'replace', deviceModelIds: [M_15] },
        managerAuth(),
      ).expect(200);

      expect(res.body.data).toEqual({ updatedProducts: 1, added: 1, removed: 1 });
      expect([...pairs].sort()).toEqual([key(P1, M_15), key(P2, M_15)].sort());
    });

    it('400 for an unknown model id, before any write', async () => {
      await put(
        { productIds: [P1], mode: 'add', deviceModelIds: [M_14, GHOST] },
        managerAuth(),
      ).expect(400);
      expect(pairs.size).toBe(0);
    });

    it('400 for an unknown product id, before any write', async () => {
      await put(
        { productIds: [P1, GHOST], mode: 'add', deviceModelIds: [M_14] },
        managerAuth(),
      ).expect(400);
      expect(pairs.size).toBe(0);
    });

    it('400 when no model remains (replace with nothing would wipe the selection)', async () => {
      await put({ productIds: [P1], mode: 'replace', deviceModelIds: [] }, managerAuth()).expect(
        400,
      );
    });

    it('400 for more than 500 products', async () => {
      const productIds = Array.from(
        { length: 501 },
        (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
      );
      await put({ productIds, mode: 'add', deviceModelIds: [M_14] }, managerAuth()).expect(400);
      expect(compatRepository.findLiveProducts).not.toHaveBeenCalled();
    });

    it('400 for an unknown mode', async () => {
      await put({ productIds: [P1], mode: 'merge', deviceModelIds: [M_14] }, managerAuth()).expect(
        400,
      );
    });

    it('writes the action-log row as device.bulkUpdateCompat', async () => {
      await put(addBody, managerAuth()).expect(200);

      // The interceptor records after the response — give the promise a tick.
      await new Promise((resolve) => setImmediate(resolve));
      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'device.bulkUpdateCompat',
          entityType: 'device',
          actorId: 'manager-compat-1',
          summary: 'PUT /api/admin/devices/compat/bulk',
        }),
      );
    });
  });

  describe('GET /api/admin/devices/models/:id/coverage', () => {
    it('opens with devices:read alone', async () => {
      permissions.setGrants(UserRole.MANAGER, ['devices:read']);

      const res = await request(app.getHttpServer())
        .get(`/api/admin/devices/models/${M_15}/coverage`)
        .set('Authorization', managerAuth())
        .expect(200);

      expect(res.body.data.model).toEqual(
        expect.objectContaining({ id: M_15, name: 'iPhone 15', brandName: 'Apple' }),
      );
      // The inactive 15 Pro is not a comparison column.
      expect(res.body.data.siblings).toEqual([]);
      expect(res.body.data.suspects).toEqual([
        { id: P1, name: 'Чохол для iPhone 15', slug: 'case-1' },
      ]);
    });

    it('403 without any devices key', async () => {
      permissions.setGrants(UserRole.MANAGER, ['products:read']);
      await request(app.getHttpServer())
        .get(`/api/admin/devices/models/${M_15}/coverage`)
        .set('Authorization', managerAuth())
        .expect(403);
    });

    it('404 for an unknown model', async () => {
      permissions.setGrants(UserRole.MANAGER, ['devices:read']);
      await request(app.getHttpServer())
        .get(`/api/admin/devices/models/${GHOST}/coverage`)
        .set('Authorization', managerAuth())
        .expect(404);
    });
  });
});
