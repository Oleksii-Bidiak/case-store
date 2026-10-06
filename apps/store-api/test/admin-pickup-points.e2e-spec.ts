import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { HttpExceptionFilter } from '../src/common/filters';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';
import { NovaPoshtaClient } from '../src/delivery';

/**
 * E2E for the admin pickup-point CRUD (TASK-645):
 *
 *   GET    /api/admin/pickup-points          — every point, inactive included
 *   PATCH  /api/admin/pickup-points/reorder  — the complete ordering
 *   POST   /api/admin/pickup-points          — create (appended)
 *   PUT    /api/admin/pickup-points/:id      — partial update
 *   DELETE /api/admin/pickup-points/:id      — hard delete
 *
 * PrismaService is replaced by a small IN-MEMORY `pickupPoint` table (not
 * per-call stubs), so the cross-endpoint promise can be asserted end to end: a
 * point deactivated through the admin route is gone from the public
 * `GET /api/delivery/methods`. What a delete does to an ORDER (FK SetNull, the
 * address snapshot intact) is a database property — it is asserted against real
 * Postgres in `pickup-point-delete.int-spec.ts`; here the order count that warns
 * the operator is.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

interface PointRow {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  workingHours: string | null;
  mapUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  orders: number;
}

const ID_A = '550e8400-e29b-41d4-a716-446655440001';
const ID_B = '550e8400-e29b-41d4-a716-446655440002';
const ID_NEW = '550e8400-e29b-41d4-a716-4466554400ff';
const UNKNOWN = '550e8400-e29b-41d4-a716-446655449999';

/** Project a row through a Prisma `select` (top-level keys + `_count`). */
function project(row: PointRow, select?: Record<string, unknown>): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (key === '_count') out._count = { orders: row.orders };
    else out[key] = row[key as keyof PointRow];
  }
  return out;
}

function sorted(rows: PointRow[]): PointRow[] {
  return [...rows].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

describe('Admin pickup points (e2e, TASK-645)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let table: PointRow[] = [];

  const seed = () => {
    const at = new Date('2026-10-01T00:00:00Z');
    table = [
      {
        id: ID_A,
        name: 'Магазин на Хрещатику',
        city: 'Київ',
        address: 'вул. Хрещатик, 1',
        phone: '+380441234567',
        workingHours: 'Пн–Пт 10:00–19:00',
        mapUrl: null,
        isActive: true,
        sortOrder: 0,
        createdAt: at,
        updatedAt: at,
        orders: 3,
      },
      {
        id: ID_B,
        name: 'Склад',
        city: 'Київ',
        address: 'вул. Складська, 2',
        phone: null,
        workingHours: null,
        mapUrl: null,
        isActive: false,
        sortOrder: 1,
        createdAt: at,
        updatedAt: at,
        orders: 0,
      },
    ];
  };

  const pickupPoint = {
    findMany: jest.fn(
      async (args: { where?: { isActive?: boolean }; select?: Record<string, unknown> } = {}) =>
        sorted(table)
          .filter((r) => args.where?.isActive === undefined || r.isActive === args.where.isActive)
          .map((r) => project(r, args.select)),
    ),
    findFirst: jest.fn(
      async (args: {
        where: { id: string; isActive?: boolean };
        select?: Record<string, unknown>;
      }) => {
        const row = table.find(
          (r) =>
            r.id === args.where.id &&
            (args.where.isActive === undefined || r.isActive === args.where.isActive),
        );
        return row ? project(row, args.select) : null;
      },
    ),
    findUnique: jest.fn(
      async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
        const row = table.find((r) => r.id === args.where.id);
        return row ? project(row, args.select) : null;
      },
    ),
    aggregate: jest.fn(async () => ({
      _max: { sortOrder: table.length ? Math.max(...table.map((r) => r.sortOrder)) : null },
    })),
    create: jest.fn(
      async (args: {
        data: Omit<PointRow, 'id' | 'createdAt' | 'updatedAt' | 'orders'>;
        select?: Record<string, unknown>;
      }) => {
        const now = new Date();
        const row: PointRow = {
          ...args.data,
          id: ID_NEW,
          createdAt: now,
          updatedAt: now,
          orders: 0,
        };
        table.push(row);
        return project(row, args.select);
      },
    ),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<PointRow>;
        select?: Record<string, unknown>;
      }) => {
        const row = table.find((r) => r.id === args.where.id);
        if (!row) throw new Error('P2025');
        Object.assign(row, args.data);
        return project(row, args.select);
      },
    ),
    updateMany: jest.fn(async (args: { where: { id: string }; data: Partial<PointRow> }) => {
      const row = table.find((r) => r.id === args.where.id);
      if (row) Object.assign(row, args.data);
      return { count: row ? 1 : 0 };
    }),
    delete: jest.fn(async (args: { where: { id: string } }) => {
      const row = table.find((r) => r.id === args.where.id);
      table = table.filter((r) => r.id !== args.where.id);
      return row;
    }),
  };

  const txClient = { pickupPoint, $executeRaw: jest.fn() };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient)),
    pickupPoint,
    deliverySetting: {
      // PICKUP switched on, so the public methods list depends on the points alone.
      findUnique: jest.fn(async () => ({
        id: '00000000-0000-0000-0000-000000000003',
        senderCityRef: null,
        senderCityName: null,
        senderWarehouseRef: null,
        defaultWeightKg: 0.5,
        npEnabled: true,
        pickupEnabled: true,
        courierEnabled: false,
        otherEnabled: true,
        courierCityName: null,
        courierPrice: new Prisma.Decimal(0),
        courierFreeFrom: null,
        createdAt: new Date('2026-09-26T00:00:00Z'),
        updatedAt: new Date('2026-09-26T00:00:00Z'),
      })),
    },
  };

  const permissionRepositoryMock = createPermissionRepositoryMock({
    grants: { MANAGER: [] },
  });

  const token = (sub: string, role: 'ADMIN' | 'MANAGER' | 'CUSTOMER') =>
    jwtService.sign({ sub, role }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
  const admin = () => `Bearer ${token('admin-e2e-1', 'ADMIN')}`;

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
      .overrideProvider(NovaPoshtaClient)
      .useValue({ isConfigured: () => true })
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
    // The production filter, so the stable `REORDER_*` codes are asserted on the wire.
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  beforeEach(() => {
    seed();
    permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('permission guard', () => {
    it('refuses an anonymous caller with 401', async () => {
      await request(app.getHttpServer()).get('/api/admin/pickup-points').expect(401);
    });

    it.each([
      ['GET', '/api/admin/pickup-points'],
      ['POST', '/api/admin/pickup-points'],
      ['PATCH', '/api/admin/pickup-points/reorder'],
      ['PUT', `/api/admin/pickup-points/${ID_A}`],
      ['DELETE', `/api/admin/pickup-points/${ID_A}`],
    ])('refuses %s %s with 403 to staff without settings:delivery', async (method, url) => {
      const auth = `Bearer ${token('manager-e2e-1', 'MANAGER')}`;
      const server = request(app.getHttpServer());
      const req =
        method === 'GET'
          ? server.get(url)
          : method === 'POST'
            ? server.post(url)
            : method === 'PATCH'
              ? server.patch(url)
              : method === 'PUT'
                ? server.put(url)
                : server.delete(url);

      await req.set('Authorization', auth).send({}).expect(403);
    });

    it('lets staff holding settings:delivery in', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['settings:delivery']);

      await request(app.getHttpServer())
        .get('/api/admin/pickup-points')
        .set('Authorization', `Bearer ${token('manager-e2e-1', 'MANAGER')}`)
        .expect(200);
    });
  });

  describe('GET /api/admin/pickup-points', () => {
    it('lists every point, inactive included, ordered, with ordersCount', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/pickup-points')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual({
        data: [
          {
            id: ID_A,
            name: 'Магазин на Хрещатику',
            city: 'Київ',
            address: 'вул. Хрещатик, 1',
            phone: '+380441234567',
            workingHours: 'Пн–Пт 10:00–19:00',
            mapUrl: null,
            isActive: true,
            sortOrder: 0,
            ordersCount: 3,
          },
          {
            id: ID_B,
            name: 'Склад',
            city: 'Київ',
            address: 'вул. Складська, 2',
            phone: null,
            workingHours: null,
            mapUrl: null,
            isActive: false,
            sortOrder: 1,
            ordersCount: 0,
          },
        ],
      });
    });
  });

  describe('POST /api/admin/pickup-points', () => {
    it('creates a point appended to the end, trimming and nulling blanks', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/pickup-points')
        .set('Authorization', admin())
        .send({
          name: '  Нова точка ',
          city: 'Львів',
          address: 'пл. Ринок, 1',
          phone: '   ',
          mapUrl: 'https://maps.example/lviv',
        })
        .expect(201);

      expect(res.body.data).toEqual({
        id: ID_NEW,
        name: 'Нова точка',
        city: 'Львів',
        address: 'пл. Ринок, 1',
        phone: null,
        workingHours: null,
        mapUrl: 'https://maps.example/lviv',
        isActive: true,
        sortOrder: 2,
        ordersCount: 0,
      });
    });

    it.each([
      ['a missing name', { city: 'Київ', address: 'a' }, 'name'],
      ['a blank city', { name: 'n', city: '  ', address: 'a' }, 'city'],
      ['a missing address', { name: 'n', city: 'Київ' }, 'address'],
      [
        'a javascript: map link',
        { name: 'n', city: 'c', address: 'a', mapUrl: 'javascript:alert(1)' },
        'mapUrl',
      ],
      [
        'a map link without a scheme',
        { name: 'n', city: 'c', address: 'a', mapUrl: 'maps.example/x' },
        'mapUrl',
      ],
      [
        'a non-boolean isActive',
        { name: 'n', city: 'c', address: 'a', isActive: 'false' },
        'isActive',
      ],
      [
        'an over-long phone',
        { name: 'n', city: 'c', address: 'a', phone: '1'.repeat(51) },
        'phone',
      ],
    ])('rejects %s with 400', async (_label, body, field) => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/pickup-points')
        .set('Authorization', admin())
        .send(body)
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain(field);
      expect(table).toHaveLength(2);
    });

    it('refuses a client-chosen sortOrder (the list is ordered by dragging)', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/pickup-points')
        .set('Authorization', admin())
        .send({ name: 'n', city: 'c', address: 'a', sortOrder: 0 })
        .expect(400);
    });
  });

  describe('PUT /api/admin/pickup-points/:id', () => {
    it('writes only the fields sent and answers with the point', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/admin/pickup-points/${ID_A}`)
        .set('Authorization', admin())
        .send({ workingHours: 'Щодня 9–21', phone: null })
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: ID_A,
        name: 'Магазин на Хрещатику',
        workingHours: 'Щодня 9–21',
        phone: null,
        ordersCount: 3,
      });
    });

    it.each([
      ['a null name', { name: null }],
      ['an empty address', { address: '' }],
      ['a string isActive', { isActive: 'true' }],
      ['an ftp map link', { mapUrl: 'ftp://maps.example/x' }],
    ])('rejects %s with 400', async (_label, body) => {
      await request(app.getHttpServer())
        .put(`/api/admin/pickup-points/${ID_A}`)
        .set('Authorization', admin())
        .send(body)
        .expect(400);
    });

    it('answers 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/pickup-points/${UNKNOWN}`)
        .set('Authorization', admin())
        .send({ name: 'x' })
        .expect(404);
    });

    it('a deactivated point disappears from GET /api/delivery/methods', async () => {
      const before = await request(app.getHttpServer()).get('/api/delivery/methods').expect(200);
      expect(before.body.data.methods).toContain('PICKUP');
      expect(before.body.data.pickupPoints.map((p: { id: string }) => p.id)).toEqual([ID_A]);

      await request(app.getHttpServer())
        .put(`/api/admin/pickup-points/${ID_A}`)
        .set('Authorization', admin())
        .send({ isActive: false })
        .expect(200);

      const after = await request(app.getHttpServer()).get('/api/delivery/methods').expect(200);
      expect(after.body.data.pickupPoints).toEqual([]);
      // No active point left → PICKUP is not offered at all (TASK-643 rule).
      expect(after.body.data.methods).not.toContain('PICKUP');

      // …while the admin list still shows it, switched off.
      const admin_ = await request(app.getHttpServer())
        .get('/api/admin/pickup-points')
        .set('Authorization', admin())
        .expect(200);
      expect(admin_.body.data.find((p: { id: string }) => p.id === ID_A)).toMatchObject({
        isActive: false,
      });
    });
  });

  describe('DELETE /api/admin/pickup-points/:id', () => {
    it('hard-deletes a point and answers with its id', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/admin/pickup-points/${ID_A}`)
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual({ data: { id: ID_A } });
      expect(table.map((r) => r.id)).toEqual([ID_B]);
    });

    it('answers 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .delete(`/api/admin/pickup-points/${UNKNOWN}`)
        .set('Authorization', admin())
        .expect(404);
    });
  });

  describe('PATCH /api/admin/pickup-points/reorder', () => {
    it('is routed to the reorder handler (not `:id`) and returns the refreshed list', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/pickup-points/reorder')
        .set('Authorization', admin())
        .send({ orderedIds: [ID_B, ID_A] })
        .expect(200);

      expect(
        res.body.data.map((p: { id: string; sortOrder: number }) => [p.id, p.sortOrder]),
      ).toEqual([
        [ID_B, 0],
        [ID_A, 1],
      ]);
      expect(res.body.data[1]).toHaveProperty('ordersCount', 3);
    });

    it('answers 409 REORDER_STALE for a partial ordering', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/pickup-points/reorder')
        .set('Authorization', admin())
        .send({ orderedIds: [ID_A] })
        .expect(409);

      expect(res.body.error).toBe('REORDER_STALE');
    });

    it('answers 404 REORDER_NOT_FOUND for an id outside the list', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/pickup-points/reorder')
        .set('Authorization', admin())
        .send({ orderedIds: [ID_A, UNKNOWN] })
        .expect(404);

      expect(res.body.error).toBe('REORDER_NOT_FOUND');
    });

    it('answers 400 REORDER_DUPLICATE_ID for a repeated id', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/pickup-points/reorder')
        .set('Authorization', admin())
        .send({ orderedIds: [ID_A, ID_A] })
        .expect(400);

      expect(res.body.error).toBe('REORDER_DUPLICATE_ID');
    });
  });
});
