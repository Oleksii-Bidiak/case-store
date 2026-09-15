import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { AuthService } from '../src/auth/auth.service';
import { UserRepository } from '../src/user/user.repository';
import { StaffRepository } from '../src/staff/staff.repository';
import { PrismaService } from '../src/prisma';

/**
 * Per-person permissions and templates over HTTP (TASK-477, plan 181).
 *
 * ── WHY THIS SUITE DOES NOT USE `permission-repository.mock.ts` ───────────────
 *
 * Thirty-four suites override `PermissionRepository` so the guard can resolve an
 * actor that exists in no database. This one must NOT, because two of the things
 * it has to prove are precisely about that lookup:
 *
 *   - invariant 8 — a key revoked through the API is refused on the target's very
 *     NEXT request, with no cache anywhere in between;
 *   - invariant 5 — editing a template does not move the access of somebody
 *     already working, which is only meaningful if "their access" is read back
 *     out of storage rather than out of a fixture.
 *
 * So the REAL `PermissionRepository`, the REAL `PermissionGrantRepository` and the
 * REAL `PermissionTemplateRepository` all run here, over one in-memory stand-in
 * for the four tables they touch. The guard resolves every caller from that
 * store, exactly as it would from Postgres, which is what makes the sequence
 * "grant → call → revoke → call" mean something.
 *
 * `StaffRepository` is still a double: the staff VIEW (scoped reads, permission
 * counts, last-seen timestamps) is proven in `staff.e2e-spec.ts` and rebuilding
 * its `groupBy` queries in a fake would test the fake.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: 'ADMIN' | 'MANAGER' | 'CUSTOMER';
  isOwner: boolean;
  isActive: boolean;
  originalEmail: string | null;
  deletedAt: Date | null;
  emailVerifiedAt: Date | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const OWNER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const DEPUTY_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const MANAGER_ACTOR_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const CUSTOMER_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const TARGET_MANAGER_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
const TARGET_ADMIN_ID = 'aaaaaaaa-0000-4000-8000-000000000011';
const MISSING_ID = 'aaaaaaaa-0000-4000-8000-000000000099';

describe('Staff permissions & templates (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // ─── The store the real repositories run against ────────────────────────────

  const users = new Map<string, FakeUser>();
  const grants = new Map<string, Set<string>>();
  const templates = new Map<
    string,
    { id: string; name: string; description: string | null; createdAt: Date; updatedAt: Date }
  >();
  let templateItems: { templateId: string; permission: string }[] = [];
  const auditRows: {
    action: string;
    entityType: string | null;
    entityId: string | null;
    summary: string | null;
    actorId: string | null;
    diff: unknown;
  }[] = [];

  let userReads = 0;
  let templateSeq = 0;

  function makeUser(over: Partial<FakeUser> & Pick<FakeUser, 'id' | 'email' | 'role'>): FakeUser {
    return {
      passwordHash: '$argon2id$hash',
      firstName: null,
      lastName: null,
      phone: null,
      isOwner: false,
      isActive: true,
      originalEmail: null,
      deletedAt: null,
      emailVerifiedAt: null,
      lockedUntil: null,
      failedLoginAttempts: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...over,
    };
  }

  function seed(): void {
    users.clear();
    grants.clear();
    templates.clear();
    templateItems = [];
    auditRows.length = 0;
    userReads = 0;
    templateSeq = 0;

    for (const user of [
      makeUser({ id: OWNER_ID, email: 'owner@example.com', role: 'ADMIN', isOwner: true }),
      makeUser({ id: DEPUTY_ID, email: 'deputy@example.com', role: 'ADMIN' }),
      makeUser({ id: MANAGER_ACTOR_ID, email: 'manager@example.com', role: 'MANAGER' }),
      makeUser({ id: CUSTOMER_ID, email: 'shopper@example.com', role: 'CUSTOMER' }),
      makeUser({ id: TARGET_MANAGER_ID, email: 'olena@example.com', role: 'MANAGER' }),
      makeUser({ id: TARGET_ADMIN_ID, email: 'admin2@example.com', role: 'ADMIN' }),
    ]) {
      users.set(user.id, user);
    }

    // A manager holding four REAL permissions, so every refusal below is about
    // the staff keys specifically rather than about holding nothing at all.
    grants.set(
      MANAGER_ACTOR_ID,
      new Set(['products:read', 'products:write', 'customers:read', 'orders:read']),
    );
  }

  const keysOf = (userId: string): string[] => [...(grants.get(userId) ?? [])].sort();

  const templateRecord = (id: string) => {
    const template = templates.get(id);
    if (!template) {
      return null;
    }
    return {
      ...template,
      items: templateItems
        .filter((item) => item.templateId === id)
        .map((item) => ({ permission: item.permission }))
        .sort((a, b) => a.permission.localeCompare(b.permission)),
    };
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    // Every repository under test uses the interactive form, and running the
    // callback against this same object is what makes delete-then-insert behave
    // as one unit here as it does in Postgres.
    $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(prismaServiceMock)),

    user: {
      findFirst: ({ where }: { where: { id: string; isActive?: boolean } }) => {
        userReads += 1;
        const user = users.get(where.id);
        if (!user || !user.isActive || user.deletedAt) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          ...user,
          permissions: keysOf(user.id).map((permission) => ({ permission })),
        });
      },
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },

    userPermission: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(keysOf(where.userId).map((permission) => ({ permission }))),
      deleteMany: ({ where }: { where: { userId: string } }) => {
        const removed = grants.get(where.userId)?.size ?? 0;
        grants.set(where.userId, new Set());
        return Promise.resolve({ count: removed });
      },
      createMany: ({ data }: { data: { userId: string; permission: string }[] }) => {
        for (const row of data) {
          const held = grants.get(row.userId) ?? new Set<string>();
          held.add(row.permission);
          grants.set(row.userId, held);
        }
        return Promise.resolve({ count: data.length });
      },
      groupBy: jest.fn().mockResolvedValue([]),
    },

    permissionTemplate: {
      findMany: () =>
        Promise.resolve(
          [...templates.keys()]
            .map((id) => templateRecord(id))
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      findUnique: ({ where }: { where: { id?: string; name?: string } }) => {
        const id =
          where.id ??
          [...templates.values()].find((template) => template.name === where.name)?.id ??
          '';
        return Promise.resolve(templateRecord(id));
      },
      create: ({
        data,
      }: {
        data: { name: string; description: string | null; items: { create: unknown[] } };
      }) => {
        templateSeq += 1;
        const id = `bbbbbbbb-0000-4000-8000-${String(templateSeq).padStart(12, '0')}`;
        templates.set(id, {
          id,
          name: data.name,
          description: data.description,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        });
        for (const item of data.items.create as { permission: string }[]) {
          templateItems.push({ templateId: id, permission: item.permission });
        }
        return Promise.resolve(templateRecord(id));
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: { name?: string; description?: string | null };
      }) => {
        const current = templates.get(where.id);
        if (!current) {
          return Promise.reject(new Error('not found'));
        }
        templates.set(where.id, {
          ...current,
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.description === undefined ? {} : { description: data.description }),
          updatedAt: new Date('2026-03-02T00:00:00.000Z'),
        });
        return Promise.resolve(templateRecord(where.id));
      },
      delete: ({ where }: { where: { id: string } }) => {
        const removed = templateRecord(where.id);
        templates.delete(where.id);
        templateItems = templateItems.filter((item) => item.templateId !== where.id);
        return Promise.resolve(removed);
      },
    },

    permissionTemplateItem: {
      deleteMany: ({ where }: { where: { templateId: string } }) => {
        const before = templateItems.length;
        templateItems = templateItems.filter((item) => item.templateId !== where.templateId);
        return Promise.resolve({ count: before - templateItems.length });
      },
      createMany: ({ data }: { data: { templateId: string; permission: string }[] }) => {
        templateItems.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },

    auditLog: {
      create: ({ data }: { data: (typeof auditRows)[number] }) => {
        auditRows.push(data);
        return Promise.resolve(data);
      },
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },

    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },

    review: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  // The staff VIEW, over the same store, so `findStaffById` and the writes agree.
  const staffRepositoryMock = {
    findAll: jest.fn().mockResolvedValue({ staff: [], total: 0 }),
    findStaffById: (id: string) => {
      const user = users.get(id);
      if (!user || user.deletedAt || user.role === 'CUSTOMER') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        user,
        permissionCount: keysOf(id).length,
        lastSeenAt: null,
      });
    },
    create: jest.fn(),
    updateRole: jest.fn(),
  };

  const userRepositoryMock = {
    findById: (id: string) => Promise.resolve(users.get(id) ?? null),
    findByEmail: jest.fn().mockResolvedValue(null),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
    softDelete: jest.fn(),
  };

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  };

  const authServiceMock = { setPassword: jest.fn().mockResolvedValue(undefined) };

  function token(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  const auth = (userId: string, role = 'ADMIN') => `Bearer ${token(userId, role)}`;
  const asOwner = () => auth(OWNER_ID);
  const asDeputy = () => auth(DEPUTY_ID);

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
      .overrideProvider(StaffRepository)
      .useValue(staffRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuthService)
      .useValue(authServiceMock)
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

  beforeEach(() => {
    seed();
  });

  // ─── Who may reach this surface at all ──────────────────────────────────────

  describe('the surface itself', () => {
    it('is 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .expect(401);
      await request(app.getHttpServer()).get('/api/admin/permission-templates').expect(401);
    });

    it('is 403 for a MANAGER on the WHOLE surface — staff:* is granted to nobody', async () => {
      // Plan 181, invariant 3. This manager holds four real permissions, so these
      // refusals are about the staff keys specifically — and those keys are
      // `grantable: false`, so no screen can ever tick them for anyone.
      const calls: [string, string, object][] = [
        ['get', `/api/admin/staff/${TARGET_MANAGER_ID}/permissions`, {}],
        ['put', `/api/admin/staff/${TARGET_MANAGER_ID}/permissions`, { permissions: [] }],
        ['get', '/api/admin/permission-templates', {}],
        ['post', '/api/admin/permission-templates', { name: 'Хак', permissions: [] }],
      ];

      for (const [method, url, body] of calls) {
        await request(app.getHttpServer())
          [method as 'get'](url)
          .set('Authorization', auth(MANAGER_ACTOR_ID, 'MANAGER'))
          .send(body)
          .expect(403);
      }

      expect(keysOf(TARGET_MANAGER_ID)).toEqual([]);
      expect(templates.size).toBe(0);
    });

    it('is 403 for a CUSTOMER', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', auth(CUSTOMER_ID, 'CUSTOMER'))
        .expect(403);
    });
  });

  // ─── GET /api/admin/staff/:id/permissions ───────────────────────────────────

  describe('GET /api/admin/staff/:id/permissions', () => {
    it('returns the person’s keys plus a catalogue with nothing ungrantable in it', async () => {
      grants.set(TARGET_MANAGER_ID, new Set(['orders:read', 'blog:write']));

      const response = await request(app.getHttpServer())
        .get(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asDeputy())
        .expect(200);

      expect(response.body.data.permissions).toEqual(['blog:write', 'orders:read']);
      expect(response.body.data.holdsEverythingByLevel).toBe(false);

      const offered = response.body.data.catalogue.map((entry: { key: string }) => entry.key);
      expect(offered).toContain('orders:read');
      expect(offered).not.toContain('staff:read');
      expect(offered).not.toContain('staff:write');
      expect(offered).not.toContain('audit:read');

      const zones = response.body.data.zones.map((zone: { zone: string }) => zone.zone);
      expect(zones).not.toContain('staff');
    });

    it('says an admin holds everything by level, so an empty grid is not read as "nothing"', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/admin/staff/${TARGET_ADMIN_ID}/permissions`)
        .set('Authorization', asOwner())
        .expect(200);

      expect(response.body.data.holdsEverythingByLevel).toBe(true);
      expect(response.body.data.permissions).toEqual([]);
    });

    it('is 404 for a customer id and for a missing one alike', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/staff/${CUSTOMER_ID}/permissions`)
        .set('Authorization', asOwner())
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/admin/staff/${MISSING_ID}/permissions`)
        .set('Authorization', asOwner())
        .expect(404);
    });
  });

  // ─── PUT /api/admin/staff/:id/permissions ───────────────────────────────────

  describe('PUT /api/admin/staff/:id/permissions', () => {
    it('lets a deputy replace a manager’s set, and replaces rather than merges', async () => {
      grants.set(TARGET_MANAGER_ID, new Set(['orders:read', 'blog:write']));

      const response = await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asDeputy())
        .send({ permissions: ['orders:read', 'orders:write'] })
        .expect(200);

      expect(response.body.data.permissions).toEqual(['orders:read', 'orders:write']);
      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read', 'orders:write']);
    });

    it('de-duplicates a key sent twice', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read', 'orders:read'] })
        .expect(200);

      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read']);
    });

    it('accepts an empty set — revoking everything is a legitimate edit', async () => {
      grants.set(TARGET_MANAGER_ID, new Set(['orders:read']));

      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: [] })
        .expect(200);

      expect(keysOf(TARGET_MANAGER_ID)).toEqual([]);
    });

    it('refuses a non-grantable key with 400, names it, and writes nothing', async () => {
      grants.set(TARGET_MANAGER_ID, new Set(['orders:read']));

      const response = await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read', 'staff:write', 'audit:read'] })
        .expect(400);

      expect(response.body.message).toContain('staff:write');
      expect(response.body.message).toContain('audit:read');
      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read']);
    });

    it('refuses an unknown key with 400 and names it', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:teleport'] })
        .expect(400);

      expect(response.body.message).toContain('orders:teleport');
      expect(keysOf(TARGET_MANAGER_ID)).toEqual([]);
    });

    it('refuses a deputy editing ANOTHER ADMIN — invariant 3', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_ADMIN_ID}/permissions`)
        .set('Authorization', asDeputy())
        .send({ permissions: ['orders:read'] })
        .expect(403);

      expect(keysOf(TARGET_ADMIN_ID)).toEqual([]);
    });

    it('refuses ANYBODY editing the OWNER — invariant 2', async () => {
      for (const caller of [asOwner(), asDeputy()]) {
        await request(app.getHttpServer())
          .put(`/api/admin/staff/${OWNER_ID}/permissions`)
          .set('Authorization', caller)
          .send({ permissions: ['orders:read'] })
          .expect(403);
      }

      expect(keysOf(OWNER_ID)).toEqual([]);
    });

    it('lets the OWNER edit a deputy admin — the level rule has no exception', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_ADMIN_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read'] })
        .expect(200);

      expect(keysOf(TARGET_ADMIN_ID)).toEqual(['orders:read']);
    });

    it('writes ONE audit row carrying the real before → after', async () => {
      grants.set(TARGET_MANAGER_ID, new Set(['blog:write', 'orders:read']));

      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asDeputy())
        .send({ permissions: ['orders:read', 'orders:write'] })
        .expect(200);

      // One row, not two: the route records its own entry (with the pre-image the
      // generic AuditInterceptor cannot have) and is marked `@RecordsOwnAudit()`
      // so the interceptor does not add a poorer duplicate.
      const rows = auditRows.filter((row) => row.action === 'staff.updatePermissions');
      expect(rows).toHaveLength(1);
      expect(rows[0].entityType).toBe('staff');
      expect(rows[0].entityId).toBe(TARGET_MANAGER_ID);
      expect(rows[0].actorId).toBe(DEPUTY_ID);
      expect(rows[0].diff).toEqual({
        permissions: {
          from: ['blog:write', 'orders:read'],
          to: ['orders:read', 'orders:write'],
        },
      });
      expect(rows[0].summary).toContain('olena@example.com');
    });

    it('records nothing when the write was refused', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/staff/${OWNER_ID}/permissions`)
        .set('Authorization', asDeputy())
        .send({ permissions: ['orders:read'] })
        .expect(403);

      expect(auditRows).toHaveLength(0);
    });
  });

  // ─── Invariant 8: effective on the very next request ────────────────────────

  describe('a revoked key takes effect on the target’s next request', () => {
    it('is gone the moment it is revoked, with no cache in between', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/staff/${MANAGER_ACTOR_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read', 'orders:write'] })
        .expect(200);

      const before = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', auth(MANAGER_ACTOR_ID, 'MANAGER'))
        .expect(200);
      expect(before.body.data.permissions).toEqual(['orders:read', 'orders:write']);

      await request(app.getHttpServer())
        .put(`/api/admin/staff/${MANAGER_ACTOR_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read'] })
        .expect(200);

      const readsBefore = userReads;
      const after = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', auth(MANAGER_ACTOR_ID, 'MANAGER'))
        .expect(200);

      expect(after.body.data.permissions).toEqual(['orders:read']);
      // The answer came from a fresh read, not from anything remembered.
      expect(userReads).toBeGreaterThan(readsBefore);
    });
  });

  // ─── Templates ──────────────────────────────────────────────────────────────

  function createTemplate(
    body: { name: string; description?: string; permissions: string[] },
    caller = asOwner(),
  ) {
    return request(app.getHttpServer())
      .post('/api/admin/permission-templates')
      .set('Authorization', caller)
      .send(body);
  }

  describe('permission templates', () => {
    it('creates, lists, reads and deletes', async () => {
      const created = await createTemplate({
        name: 'Оператор замовлень',
        description: 'Телефонує, змінює статуси',
        permissions: ['orders:write', 'orders:read'],
      }).expect(201);

      const id = created.body.data.id as string;
      expect(created.body.data.permissions).toEqual(['orders:read', 'orders:write']);

      const list = await request(app.getHttpServer())
        .get('/api/admin/permission-templates')
        .set('Authorization', asDeputy())
        .expect(200);
      expect(list.body.data).toHaveLength(1);

      await request(app.getHttpServer())
        .get(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asDeputy())
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asOwner())
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asOwner())
        .expect(404);
    });

    it('refuses a non-grantable key in a TEMPLATE too — otherwise it is the back door', async () => {
      // The whole argument for `grantable: false` collapses if the key an owner
      // cannot tick on a person can be parked in a template and then applied.
      const response = await createTemplate({
        name: 'Тіньовий адмін',
        permissions: ['orders:read', 'staff:write'],
      }).expect(400);

      expect(response.body.message).toContain('staff:write');
      expect(templates.size).toBe(0);
    });

    it('refuses an unknown key and a duplicate name', async () => {
      await createTemplate({ name: 'Хибний', permissions: ['orders:teleport'] }).expect(400);

      await createTemplate({ name: 'Продавець', permissions: ['orders:read'] }).expect(201);
      await createTemplate({ name: 'Продавець', permissions: ['orders:read'] }).expect(409);
    });

    it('edits name and set, and refuses an ungrantable key on edit', async () => {
      const created = await createTemplate({
        name: 'Контент',
        permissions: ['blog:write'],
      }).expect(201);
      const id = created.body.data.id as string;

      const patched = await request(app.getHttpServer())
        .patch(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asDeputy())
        .send({ name: 'Контент-менеджер', permissions: ['blog:write', 'pages:write'] })
        .expect(200);

      expect(patched.body.data.name).toBe('Контент-менеджер');
      expect(patched.body.data.permissions).toEqual(['blog:write', 'pages:write']);

      await request(app.getHttpServer())
        .patch(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asOwner())
        .send({ permissions: ['audit:read'] })
        .expect(400);
    });

    it('is 404 on an unknown template', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/permission-templates/${MISSING_ID}`)
        .set('Authorization', asOwner())
        .expect(404);
    });
  });

  // ─── Applying: the copy rule end to end ─────────────────────────────────────

  describe('POST /api/admin/permission-templates/:id/apply', () => {
    async function seedTemplate(): Promise<string> {
      const created = await createTemplate({
        name: 'Оператор замовлень',
        permissions: ['orders:read', 'orders:write'],
      }).expect(201);
      return created.body.data.id as string;
    }

    it('copies the template onto the person and reports what it replaced', async () => {
      const id = await seedTemplate();
      grants.set(TARGET_MANAGER_ID, new Set(['blog:write']));

      const response = await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asDeputy())
        .send({ userId: TARGET_MANAGER_ID })
        .expect(200);

      expect(response.body.data.before).toEqual(['blog:write']);
      expect(response.body.data.after).toEqual(['orders:read', 'orders:write']);
      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read', 'orders:write']);
    });

    it('obeys the level rule — a deputy cannot apply one to another admin', async () => {
      const id = await seedTemplate();

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asDeputy())
        .send({ userId: TARGET_ADMIN_ID })
        .expect(403);

      expect(keysOf(TARGET_ADMIN_ID)).toEqual([]);
    });

    it('is 404 for a customer target and for a missing template', async () => {
      const id = await seedTemplate();

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asOwner())
        .send({ userId: CUSTOMER_ID })
        .expect(404);

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${MISSING_ID}/apply`)
        .set('Authorization', asOwner())
        .send({ userId: TARGET_MANAGER_ID })
        .expect(404);
    });

    it('writes one audit row naming the template, the person and the before → after', async () => {
      const id = await seedTemplate();
      grants.set(TARGET_MANAGER_ID, new Set(['blog:write']));

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asOwner())
        .send({ userId: TARGET_MANAGER_ID })
        .expect(200);

      const rows = auditRows.filter((row) => row.action === 'permissionTemplate.apply');
      expect(rows).toHaveLength(1);
      expect(rows[0].entityId).toBe(id);
      expect(rows[0].summary).toContain('Оператор замовлень');
      expect(rows[0].summary).toContain('olena@example.com');
      expect(rows[0].diff).toEqual({
        targetUserId: TARGET_MANAGER_ID,
        permissions: { from: ['blog:write'], to: ['orders:read', 'orders:write'] },
      });
    });

    /**
     * INVARIANT 5, over HTTP, as a sequence rather than as three assertions.
     *
     * This is the case a live `templateId` foreign key would break, and it is the
     * reason the decision was made: the owner who widens a template is thinking
     * about the NEXT hire, and the person already working must not discover a
     * changed job at the start of their shift.
     */
    it('editing a template does not move the access of somebody already set up from it', async () => {
      const id = await seedTemplate();

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asOwner())
        .send({ userId: TARGET_MANAGER_ID })
        .expect(200);
      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read', 'orders:write']);

      await request(app.getHttpServer())
        .patch(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read', 'orders:write', 'payments:read', 'payments:refund'] })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .expect(200);

      expect(after.body.data.permissions).toEqual(['orders:read', 'orders:write']);
    });

    it('somebody granted an extra key beyond the template never drifts back to it', async () => {
      const id = await seedTemplate();

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asOwner())
        .send({ userId: TARGET_MANAGER_ID })
        .expect(200);

      // One extra tick on top of the template — the normal case, and the one a
      // live link has no honest answer for.
      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read', 'orders:write', 'blog:write'] })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read'] })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .expect(200);

      expect(after.body.data.permissions).toEqual(['blog:write', 'orders:read', 'orders:write']);
    });

    it('deleting a template leaves the people set up from it working', async () => {
      const id = await seedTemplate();

      await request(app.getHttpServer())
        .post(`/api/admin/permission-templates/${id}/apply`)
        .set('Authorization', asOwner())
        .send({ userId: TARGET_MANAGER_ID })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/admin/permission-templates/${id}`)
        .set('Authorization', asOwner())
        .expect(204);

      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read', 'orders:write']);
    });

    it('two people from one template hold two independent copies', async () => {
      const id = await seedTemplate();

      for (const userId of [TARGET_MANAGER_ID, MANAGER_ACTOR_ID]) {
        await request(app.getHttpServer())
          .post(`/api/admin/permission-templates/${id}/apply`)
          .set('Authorization', asOwner())
          .send({ userId })
          .expect(200);
      }

      await request(app.getHttpServer())
        .put(`/api/admin/staff/${TARGET_MANAGER_ID}/permissions`)
        .set('Authorization', asOwner())
        .send({ permissions: ['orders:read'] })
        .expect(200);

      expect(keysOf(TARGET_MANAGER_ID)).toEqual(['orders:read']);
      expect(keysOf(MANAGER_ACTOR_ID)).toEqual(['orders:read', 'orders:write']);
    });
  });
});
