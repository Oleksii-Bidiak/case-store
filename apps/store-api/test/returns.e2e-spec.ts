import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ReturnStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { RETURN_SORT_FIELDS } from '../src/order/returns/dto';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the admin returns queue (TASK-340, sorting TASK-354).
 *
 * ── Why this one mocks PRISMA and not the repository ─────────────────────────
 * Every other admin e2e stops at the repository, because the repository is the
 * clean-architecture boundary and mocking it is enough to prove routing, guards
 * and DTO validation. Sorting is the one feature that does not fit that shape:
 * what an operator sees is decided by the `orderBy` the repository builds, and a
 * repository double would assert nothing more than "the string I sent came back".
 *
 * So `PrismaService` is the double here and the real `ReturnService` +
 * `ReturnRepository` run. That covers the whole chain in one assertion —
 * `?sortBy=` → `@IsIn` → service → `buildReturnOrderBy` → the array Prisma is
 * handed — and it is the only level at which the two failures worth catching are
 * visible: a service that quietly drops `sortBy` while forwarding the query, and
 * an allow-listed column that never reaches the ORDER BY.
 *
 * No real database is involved either way.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Admin returns queue (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
    savePasswordResetToken: jest.fn(),
    findPasswordResetToken: jest.fn(),
    markPasswordResetTokenUsed: jest.fn(),
    invalidateActivePasswordResetTokens: jest.fn(),
    updatePasswordHash: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    return: { count: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    // The order-scoped return routes read the order first (review of plan 180).
    order: { findFirst: jest.fn() },
    // The list path uses the ARRAY form of $transaction; awaiting the operations
    // it was handed is what the real client does with that form.
    $transaction: jest.fn(),
  };

  // Named rather than inline so the RBAC block below can drive the MANAGER's
  // grants through `setGrants` and assert what the NEXT request sees.
  const permissionRepositoryMock = createPermissionRepositoryMock();

  const testAdmin = { id: 'admin-e2e-1', role: 'ADMIN' as const };
  const testCustomer = { id: 'customer-e2e-1', role: 'CUSTOMER' as const };
  const testManager = { id: 'manager-e2e-1', role: 'MANAGER' as const };

  const url = '/api/admin/returns';
  const now = new Date('2026-07-10T10:00:00.000Z');

  const makeReturnRow = (overrides: Record<string, unknown> = {}) => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    orderId: '550e8400-e29b-41d4-a716-4466554400ff',
    status: ReturnStatus.REQUESTED,
    reason: 'Не підійшов розмір',
    operatorNotes: null,
    requestedAt: now,
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: null,
    createdAt: now,
    updatedAt: now,
    items: [],
    ...overrides,
  });

  /** The `orderBy` the repository handed Prisma on the most recent list query. */
  const lastOrderBy = (): unknown =>
    (prismaServiceMock.return.findMany.mock.calls.at(-1)?.[0] as { orderBy: unknown }).orderBy;

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

  // `clearAllMocks`, not `resetAllMocks`: the $transaction stub below is an
  // implementation, and a reset would strip it after the first test — every
  // later list query would then resolve `undefined` and 500.
  beforeEach(() => {
    jest.clearAllMocks();
    prismaServiceMock.return.count.mockResolvedValue(0);
    prismaServiceMock.return.findMany.mockResolvedValue([]);
    prismaServiceMock.$transaction.mockImplementation((operations: unknown) =>
      Promise.all(operations as Promise<unknown>[]),
    );
  });

  // ─── Auth guard ───────────────────────────────────────────────────────────────

  describe('GET /api/admin/returns (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get(url).expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ─── Sorting (TASK-354) ───────────────────────────────────────────────────────

  describe('GET /api/admin/returns — sorting', () => {
    const get = (query: Record<string, string | number>) =>
      request(app.getHttpServer())
        .get(url)
        .query(query)
        .set('Authorization', `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`);

    it('orders by newest request first when the caller asks for nothing', async () => {
      // The pre-TASK-354 behaviour. Anyone changing the DTO default has to break
      // this deliberately rather than silently reshuffle every operator's queue.
      await get({}).expect(200);

      expect(lastOrderBy()).toEqual([{ requestedAt: 'desc' }, { id: 'asc' }]);
    });

    it.each(RETURN_SORT_FIELDS)(
      'accepts sortBy=%s and puts that column in the ORDER BY',
      async (field) => {
        await get({ sortBy: field, sortOrder: 'asc' }).expect(200);

        const orderBy = lastOrderBy() as Array<Record<string, unknown>>;
        expect(Object.keys(orderBy[0])).toEqual([field]);
        // The tiebreaker is what makes pagination stable: `status` and
        // `refundedAmount` are massively non-unique, and without a unique last
        // key Postgres may order ties differently per query — a row would show
        // up on two pages and another on none.
        expect(orderBy.at(-1)).toEqual({ id: 'asc' });
      },
    );

    it('pushes unrefunded returns to the bottom in BOTH directions', async () => {
      // Postgres sorts NULLs first on DESC, so "biggest refund first" would
      // otherwise open on a wall of returns with no amount at all.
      await get({ sortBy: 'refundedAmount', sortOrder: 'desc' }).expect(200);
      expect(lastOrderBy()).toEqual([
        { refundedAmount: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ]);

      await get({ sortBy: 'refundedAmount', sortOrder: 'asc' }).expect(200);
      expect(lastOrderBy()).toEqual([
        { refundedAmount: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ]);
    });

    it('sorts the queue by the lifecycle when asked for status, not by the alphabet', () => {
      // `status` orders on the enum's DECLARATION order, which the DTO documents
      // as the lifecycle. That is a property of the enum, not of our code, so it
      // is asserted here — reordering ReturnStatus in schema.prisma would
      // silently turn "sort by status" into a meaningless shuffle, and this is
      // the only place that would notice.
      expect(Object.values(ReturnStatus)).toEqual([
        'REQUESTED',
        'APPROVED',
        'REJECTED',
        'RECEIVED',
        'REFUNDED',
      ]);
    });

    it('rejects an unknown sortBy with 400 rather than 500ing on a Prisma error', async () => {
      // The failure mode this guards: an un-allow-listed column reaches Prisma,
      // Prisma throws on the unknown field, and the operator gets a 500 for what
      // is really a bad request. `operatorNotes` is a real column, so only the
      // allow-list stands between it and the query.
      await get({ sortBy: 'operatorNotes' }).expect(400);

      expect(prismaServiceMock.return.findMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown sortOrder with 400', async () => {
      await get({ sortOrder: 'sideways' }).expect(400);

      expect(prismaServiceMock.return.findMany).not.toHaveBeenCalled();
    });

    it('does not silently fall back to the default on a bad sortBy', async () => {
      // A fallback would leave the header arrow and the rows disagreeing, which
      // is worse than an error: the operator would trust the arrow.
      const response = await get({ sortBy: 'refundedAmount ; DROP TABLE' }).expect(400);

      expect(response.body.message).toBeDefined();
      expect(prismaServiceMock.return.findMany).not.toHaveBeenCalled();
    });

    it('keeps the status filter and pagination working alongside the sort', async () => {
      await get({ status: ReturnStatus.REQUESTED, page: 3, limit: 10, sortBy: 'status' }).expect(
        200,
      );

      expect(prismaServiceMock.return.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ReturnStatus.REQUESTED },
          skip: 20,
          take: 10,
          orderBy: [{ status: 'desc' }, { id: 'asc' }],
        }),
      );
    });

    it('returns the rows in the order the database gave them', async () => {
      // The sort has to be the database's, not a re-sort in the service — a
      // JS re-sort would only ever order the current page, so page 2 would
      // start over from the top.
      const rows = [
        makeReturnRow({ id: '550e8400-e29b-41d4-a716-446655440001' }),
        makeReturnRow({ id: '550e8400-e29b-41d4-a716-446655440002' }),
        makeReturnRow({ id: '550e8400-e29b-41d4-a716-446655440003' }),
      ];
      prismaServiceMock.return.count.mockResolvedValue(3);
      prismaServiceMock.return.findMany.mockResolvedValue(rows);

      const response = await get({ sortBy: 'status', sortOrder: 'asc' }).expect(200);

      expect(response.body.data.map((row: { id: string }) => row.id)).toEqual(
        rows.map((row) => row.id),
      );
      // limit 20, not 10: TASK-423 unified the admin page size across every
      // table, and the returns queue was one of the two that disagreed.
      expect(response.body.meta).toEqual({ total: 3, page: 1, limit: 20, totalPages: 1 });
    });
  });

  // ─── The permission keys, on the SERVER (review of plan 180) ────────────────
  //
  // `returns:read` and `returns:write` are keys this wave introduced, and until
  // now the only thing asserting them was the admin panel's own gate —
  // `returns-permission-gate.test.tsx`, which hides a menu entry. That is the
  // cosmetic half. Nothing proved the API itself refuses a caller without the
  // key, so moving `@RequirePermission('returns:write')` off the handler — after
  // which the class-level `returns:read` governs it, and every manager who can
  // VIEW the queue can open returns for customers — would leave every suite
  // green.
  //
  // "Not 403" rather than 201 on the granted case, on purpose: the order does
  // not exist in this fixture, so 404 is the honest answer past the guard, and
  // the guard is what these cases pin.

  describe('the returns permission keys are enforced by the API, not just the UI', () => {
    const orderId = '550e8400-e29b-41d4-a716-4466554400ff';
    const orderReturnsUrl = `/api/admin/orders/${orderId}/returns`;
    const lineId = '550e8400-e29b-41d4-a716-446655440001';

    const managerToken = () => `Bearer ${generateAccessToken(testManager.id, 'MANAGER')}`;

    /**
     * Set the MANAGER's grants on the repository DOUBLE (TASK-475).
     *
     * This used to go through `PermissionService.setRoleGrants`, because the role
     * matrix was cached in Redis for 60 seconds and that method was what evicted
     * the cache — writing to the double directly left the stale set cached, so
     * the next request was answered from a matrix nobody was looking at.
     *
     * Both halves of that reasoning are gone. There is no role matrix: rights
     * live on the PERSON, and `findActor` returns them together with the actor,
     * so there is nothing to cache and nothing to evict. A set changed here is
     * live on the very next request — which is also invariant 8 of plan 181,
     * asserted for real over in `rbac.e2e-spec.ts`.
     */
    const grantManager = (permissions: string[]) =>
      permissionRepositoryMock.setGrants(UserRole.MANAGER, permissions);

    beforeEach(() => {
      prismaServiceMock.order.findFirst.mockResolvedValue(null);
      grantManager([]);
    });

    afterAll(() => {
      // The double is stateful and shared with the rest of this suite.
      grantManager([]);
    });

    it('refuses the queue to a manager holding no returns key at all', async () => {
      await request(app.getHttpServer()).get(url).set('Authorization', managerToken()).expect(403);
    });

    it('opens the queue once returns:read is granted', async () => {
      grantManager(['returns:read']);

      await request(app.getHttpServer()).get(url).set('Authorization', managerToken()).expect(200);
    });

    it('refuses the per-order return list without returns:read', async () => {
      await request(app.getHttpServer())
        .get(orderReturnsUrl)
        .set('Authorization', managerToken())
        .expect(403);
    });

    it('refuses to OPEN a return for a manager who may only read them', async () => {
      // The whole point of two keys: seeing the queue is not permission to
      // decide that a customer is sending goods back.
      grantManager(['returns:read']);

      await request(app.getHttpServer())
        .post(orderReturnsUrl)
        .set('Authorization', managerToken())
        .send({ items: [{ orderItemId: lineId, quantity: 1 }] })
        .expect(403);
      expect(prismaServiceMock.return.create).not.toHaveBeenCalled();
    });

    it('lets the write through once returns:write is granted', async () => {
      grantManager(['returns:read', 'returns:write']);

      const response = await request(app.getHttpServer())
        .post(orderReturnsUrl)
        .set('Authorization', managerToken())
        .send({ items: [{ orderItemId: lineId, quantity: 1 }] });

      expect(response.status).not.toBe(403);
      expect(response.status).toBe(404);
    });
  });
});
