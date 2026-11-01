import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  Prisma,
  RepairResult,
  ReturnDecision,
  ReturnRepairStep,
  ReturnStatus,
  UserRole,
} from '@prisma/client';
import { createHash } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { RETURN_SORT_FIELDS } from '../src/order/returns/dto';
import { ReturnService } from '../src/order/returns/return.service';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
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
    return: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      // The resolve path (TASK-785): the service's first read, then the
      // repository's reads and write inside its transaction.
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // The row lock on the order the resolve transaction takes (TASK-785).
    $queryRaw: jest.fn(),
    // The order-scoped return routes read the order first (review of plan 180).
    order: {
      findFirst: jest.fn(),
      // R2 A3: the lines and the promo a return's credit is computed from.
      findUniqueOrThrow: jest.fn(),
      // Never called by a return path — asserted (TASK-1963).
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // TASK-628: the audit row written behind an admin create.
    auditLog: { create: jest.fn() },
    // TASK-1965: the shop's Telegram recipients, read inside a guest return's transaction.
    notificationBinding: { findMany: jest.fn() },
    // TASK-1961/2044: the history row every decision writes in its transaction.
    returnDecisionEvent: { create: jest.fn() },
    // TASK-2045: the step row every repair step writes in its transaction.
    returnRepairEvent: { create: jest.fn() },
    // The list path uses the ARRAY form of $transaction; awaiting the operations
    // it was handed is what the real client does with that form.
    $transaction: jest.fn(),
  };

  // Named rather than inline so the RBAC block below can drive the MANAGER's
  // grants through `setGrants` and assert what the NEXT request sees.
  const permissionRepositoryMock = createPermissionRepositoryMock();

  // R2 A3: a REFUND decision and a credit change recompute the order's money
  // and re-derive the return through the ledger repository — the double here
  // (its own suites cover it against Postgres).
  const moneyRepositoryMock = {
    recompute: jest.fn(),
    returnPaidOutKop: jest.fn(),
    syncReturnStatus: jest.fn(),
  };

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
    // TASK-2044: a real row always carries these columns, null until decided.
    decision: null,
    decisionReason: null,
    decidedAt: null,
    decidedById: null,
    decisionLegacy: false,
    requestedOutcome: null,
    channel: 'ACCOUNT',
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
      .overrideProvider(OrderMoneyRepository)
      .useValue(moneyRepositoryMock)
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
    prismaServiceMock.order.findUniqueOrThrow.mockResolvedValue({ discount: '0', items: [] });
    moneyRepositoryMock.recompute.mockResolvedValue({});
    moneyRepositoryMock.returnPaidOutKop.mockResolvedValue(0);
    // Both forms of $transaction: the list path hands it an ARRAY, the resolve
    // path an interactive callback, which runs against the same double.
    prismaServiceMock.$transaction.mockImplementation((operations: unknown) =>
      typeof operations === 'function'
        ? (operations as (tx: typeof prismaServiceMock) => Promise<unknown>)(prismaServiceMock)
        : Promise.all(operations as Promise<unknown>[]),
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

  // ─── Money on a return is a ledger payout now (R2 A3, TASK-2046) ────────────
  //
  // `refundedAmount` and a hand-set REFUNDED are gone from the PATCH: what goes
  // back is a payout on the order (`POST /admin/orders/:orderId/money/out`), and
  // REFUNDED follows from the payouts. What stays here is «до повернення» —
  // computed when the decision becomes REFUND, lowered by `PATCH …/credit`.

  describe('PATCH /api/admin/returns/:returnId — no money on the return (R2 A3)', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';
    const adminToken = () => `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`;

    beforeEach(() => {
      prismaServiceMock.return.findUnique.mockResolvedValue(
        makeReturnRow({ status: ReturnStatus.RECEIVED, decision: ReturnDecision.REFUND }),
      );
    });

    it('400 for the retired refundedAmount field (forbidNonWhitelisted), writing nothing', async () => {
      await request(app.getHttpServer())
        .patch(`${url}/${returnId}`)
        .set('Authorization', adminToken())
        .send({ status: ReturnStatus.RECEIVED, refundedAmount: '499.00' })
        .expect(400);

      expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
    });

    it('400 RETURN_REFUND_DERIVED for a hand-set REFUNDED, writing nothing', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${url}/${returnId}`)
        .set('Authorization', adminToken())
        .send({ status: ReturnStatus.REFUNDED })
        .expect(400);

      expect(response.body.error).toBe('RETURN_REFUND_DERIVED');
      expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/returns/:returnId/credit (R2 A3, TASK-2046)', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';
    const lineId = '550e8400-e29b-41d4-a716-446655440001';
    const credit = (body: Record<string, unknown>, role: 'ADMIN' | 'MANAGER' = 'ADMIN') =>
      request(app.getHttpServer())
        .patch(`${url}/${returnId}/credit`)
        .set(
          'Authorization',
          `Bearer ${generateAccessToken(role === 'ADMIN' ? testAdmin.id : testManager.id, role)}`,
        )
        .send(body);

    /** One of three 499.00 units back, nothing paid out: computed credit 49 900. */
    const refundReturn = makeReturnRow({
      status: ReturnStatus.RECEIVED,
      decision: ReturnDecision.REFUND,
      creditKop: 49_900,
      items: [{ id: 'ri-1', returnId, orderItemId: lineId, quantity: 1, createdAt: now }],
    });

    beforeEach(() => {
      prismaServiceMock.return.findUnique.mockResolvedValue(refundReturn);
      prismaServiceMock.return.findUniqueOrThrow.mockResolvedValue({
        ...refundReturn,
        creditKop: 40_000,
        creditReason: 'Без зарядного блока',
      });
      prismaServiceMock.$queryRaw.mockResolvedValue([{ id: refundReturn.orderId }]);
      prismaServiceMock.order.findUniqueOrThrow.mockResolvedValue({
        discount: '0',
        items: [{ id: lineId, quantity: 3, price: '499.00' }],
      });
      prismaServiceMock.return.findMany.mockResolvedValue([
        { id: returnId, creditKop: 49_900, items: [{ orderItemId: lineId, quantity: 1 }] },
      ]);
      prismaServiceMock.return.updateMany.mockResolvedValue({ count: 1 });
    });

    it('200 — lowers it with the reason, recomputes the order, answers with the card', async () => {
      const response = await credit({ creditKop: 40_000, reason: 'Без зарядного блока' }).expect(
        200,
      );

      expect(prismaServiceMock.return.updateMany).toHaveBeenCalledWith({
        where: { id: returnId, decision: ReturnDecision.REFUND, creditKop: { not: null } },
        data: { creditKop: 40_000, creditReason: 'Без зарядного блока' },
      });
      expect(moneyRepositoryMock.recompute).toHaveBeenCalledWith(
        prismaServiceMock,
        refundReturn.orderId,
        testAdmin.id,
      );
      expect(moneyRepositoryMock.syncReturnStatus).toHaveBeenCalledWith(
        prismaServiceMock,
        returnId,
      );
      expect(response.body.data).toMatchObject({
        creditKop: 40_000,
        creditReason: 'Без зарядного блока',
      });
    });

    it('400 RETURN_CREDIT_ABOVE_COMPUTED — it may only be lowered', async () => {
      const response = await credit({ creditKop: 49_901, reason: 'x' }).expect(400);
      expect(response.body.error).toBe('RETURN_CREDIT_ABOVE_COMPUTED');
      expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
    });

    it('409 RETURN_CREDIT_BELOW_PAID_OUT under what was already paid out', async () => {
      moneyRepositoryMock.returnPaidOutKop.mockResolvedValue(30_000);
      const response = await credit({ creditKop: 29_999, reason: 'x' }).expect(409);
      expect(response.body.error).toBe('RETURN_CREDIT_BELOW_PAID_OUT');
    });

    it('400 without a reason or with a decimal amount', async () => {
      await credit({ creditKop: 40_000 }).expect(400);
      await credit({ creditKop: 40_000, reason: '  ' }).expect(400);
      await credit({ creditKop: 399.5, reason: 'x' }).expect(400);
      expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
    });

    it('409 RETURN_CREDIT_NOT_REFUND on a replacement', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(
        makeReturnRow({ status: ReturnStatus.APPROVED, decision: ReturnDecision.REPLACEMENT }),
      );
      const response = await credit({ creditKop: 1, reason: 'x' }).expect(409);
      expect(response.body.error).toBe('RETURN_CREDIT_NOT_REFUND');
    });

    it('403 for a manager with returns:read only, 200 once returns:write is granted', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['returns:read']);
      await credit({ creditKop: 40_000, reason: 'x' }, 'MANAGER').expect(403);

      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['returns:read', 'returns:write']);
      await credit({ creditKop: 40_000, reason: 'x' }, 'MANAGER').expect(200);
      permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
    });
  });

  // ─── Stable error codes on the wire (TASK-1966) ─────────────────────────────
  //
  // The real service and repository run, so this pins that the `error` code the
  // service puts on the exception survives the global filter into the envelope.

  describe('error codes reach the envelope (TASK-1966)', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';
    const orderId = '550e8400-e29b-41d4-a716-4466554400ff';
    const adminToken = () => `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`;

    it('GET /admin/returns/:id → 404 RETURN_NOT_FOUND', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get(`${url}/${returnId}`)
        .set('Authorization', adminToken())
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'RETURN_NOT_FOUND',
        message: 'Return not found',
      });
    });

    it('PATCH /admin/returns/:id → 409 RETURN_TRANSITION_INVALID, writing nothing', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(makeReturnRow());

      const response = await request(app.getHttpServer())
        .patch(`${url}/${returnId}`)
        .set('Authorization', adminToken())
        .send({ status: ReturnStatus.RECEIVED })
        .expect(409);

      expect(response.body).toMatchObject({
        error: 'RETURN_TRANSITION_INVALID',
        message: 'A return cannot move from REQUESTED to RECEIVED',
      });
      expect(prismaServiceMock.return.update).not.toHaveBeenCalled();
    });

    it('PATCH /admin/returns/:id → 409 RETURN_ALREADY_RESTOCKED', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(
        makeReturnRow({ status: ReturnStatus.APPROVED, restockedAt: now }),
      );

      const response = await request(app.getHttpServer())
        .patch(`${url}/${returnId}`)
        .set('Authorization', adminToken())
        .send({ status: ReturnStatus.RECEIVED, restock: true })
        .expect(409);

      expect(response.body.error).toBe('RETURN_ALREADY_RESTOCKED');
    });

    it('GET /orders/:id/returns → 404 RETURN_ORDER_NOT_FOUND for an order the caller does not own', async () => {
      prismaServiceMock.order.findFirst.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get(`/api/orders/${orderId}/returns`)
        .set('Authorization', `Bearer ${generateAccessToken(testCustomer.id, 'CUSTOMER')}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'RETURN_ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    });
  });

  // ─── Audit key of an operator-opened return (TASK-628) ──────────────────────
  //
  // The path names the ORDER; the row is about the RETURN. It used to be keyed
  // by the order id, so the creation of a return and its resolution
  // (`/admin/returns/:returnId`) were filed under two different ids.

  // ─── GET /api/returns — the customer's own list (TASK-608) ───────────────────
  //
  // The real service + repository run against the Prisma double, so the WHERE
  // that reaches Prisma is the assertion: the route must never answer with rows
  // whose order belongs to someone else.

  describe('GET /api/returns (TASK-608)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/returns').expect(401);
    });

    it("answers with the caller's returns, scoped to orders they own", async () => {
      prismaServiceMock.return.findMany.mockResolvedValue([
        makeReturnRow({ status: ReturnStatus.APPROVED, operatorNotes: 'внутрішнє' }),
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/returns')
        .set('Authorization', `Bearer ${generateAccessToken(testCustomer.id, 'CUSTOMER')}`)
        .expect(200);

      const args = prismaServiceMock.return.findMany.mock.calls.at(-1)?.[0] as {
        where: unknown;
      };
      expect(args.where).toEqual({ order: { userId: testCustomer.id, deletedAt: null } });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        orderId: '550e8400-e29b-41d4-a716-4466554400ff',
        status: 'APPROVED',
      });
      // The customer projection: what the shop wrote about them stays in the shop.
      expect(res.body.data[0]).not.toHaveProperty('operatorNotes');
    });

    it('does not shadow the per-order route it now shares a controller with', async () => {
      const orderId = '550e8400-e29b-41d4-a716-4466554400ff';
      prismaServiceMock.order.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/api/orders/${orderId}/returns`)
        .set('Authorization', `Bearer ${generateAccessToken(testCustomer.id, 'CUSTOMER')}`)
        .expect(404);
    });
  });

  describe('POST /api/admin/orders/:orderId/returns — audit row', () => {
    const orderId = '550e8400-e29b-41d4-a716-4466554400ff';
    const returnId = '550e8400-e29b-41d4-a716-446655440abc';

    it('records entityType return with the id of the RETURN that was opened', async () => {
      const created = jest
        .spyOn(app.get(ReturnService), 'adminCreateReturn')
        .mockResolvedValue({ id: returnId, orderId } as never);

      await request(app.getHttpServer())
        .post(`/api/admin/orders/${orderId}/returns`)
        .set('Authorization', `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`)
        .send({ items: [{ orderItemId: '550e8400-e29b-41d4-a716-446655440001', quantity: 1 }] })
        .expect(201);

      // The interceptor writes the row after the response (fire-and-forget).
      await new Promise((resolve) => setImmediate(resolve));

      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'return.create',
          entityType: 'return',
          entityId: returnId,
        }),
      });
      created.mockRestore();
    });
  });

  // ─── Decisions (TASK-1961, TASK-2044) ───────────────────────────────────────
  //
  // The real service and repository run against the Prisma double, so these pin
  // the whole chain: DTO → service rules → the repository's transaction → the
  // envelope, plus the audit row the interceptor writes behind it.

  describe('POST /api/admin/returns/:returnId/decision', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';
    const adminToken = () => `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`;
    const decide = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(`${url}/${returnId}/decision`)
        .set('Authorization', adminToken())
        .send(body);

    beforeEach(() => {
      prismaServiceMock.return.findUnique.mockResolvedValue(makeReturnRow());
      prismaServiceMock.$queryRaw.mockResolvedValue([{ id: makeReturnRow().orderId }]);
      prismaServiceMock.return.updateMany.mockResolvedValue({ count: 1 });
      prismaServiceMock.returnDecisionEvent.create.mockResolvedValue({});
    });

    it('400 RETURN_DECISION_REASON_REQUIRED for a refusal without a reason, writing nothing', async () => {
      const response = await decide({ decision: ReturnDecision.REJECT }).expect(400);

      expect(response.body.error).toBe('RETURN_DECISION_REASON_REQUIRED');
      expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
      expect(prismaServiceMock.returnDecisionEvent.create).not.toHaveBeenCalled();
    });

    it('treats a blank reason as none — "   " is not a reason the customer can read', async () => {
      const response = await decide({ decision: ReturnDecision.REJECT, reason: '   ' }).expect(400);

      expect(response.body.error).toBe('RETURN_DECISION_REASON_REQUIRED');
    });

    it('400 on a decision outside the enum', async () => {
      await decide({ decision: 'APPROVE' }).expect(400);
      expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
    });

    it('records the decision with its author, reason and an event row', async () => {
      prismaServiceMock.return.findUniqueOrThrow.mockResolvedValue(
        makeReturnRow({
          status: ReturnStatus.REJECTED,
          decision: ReturnDecision.REJECT,
          decisionReason: 'Сліди використання',
          decidedAt: now,
          decidedById: testAdmin.id,
          resolvedAt: now,
        }),
      );

      const response = await decide({
        decision: ReturnDecision.REJECT,
        reason: '  Сліди використання ',
      }).expect(200);

      expect(response.body.data).toMatchObject({
        id: returnId,
        status: 'REJECTED',
        decision: 'REJECT',
        decisionReason: 'Сліди використання',
        decidedById: testAdmin.id,
      });
      expect(prismaServiceMock.return.updateMany).toHaveBeenCalledWith({
        where: { id: returnId, status: ReturnStatus.REQUESTED, decision: null },
        data: expect.objectContaining({
          status: ReturnStatus.REJECTED,
          decision: ReturnDecision.REJECT,
          decisionReason: 'Сліди використання',
          decidedById: testAdmin.id,
        }),
      });
      expect(prismaServiceMock.returnDecisionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          returnId,
          decision: ReturnDecision.REJECT,
          reason: 'Сліди використання',
          actorId: testAdmin.id,
        }),
      });
    });

    it('writes an audit row return.decide keyed by the return', async () => {
      prismaServiceMock.return.findUniqueOrThrow.mockResolvedValue(
        makeReturnRow({ status: ReturnStatus.APPROVED, decision: ReturnDecision.REFUND }),
      );

      await decide({ decision: ReturnDecision.REFUND }).expect(200);
      await new Promise((resolve) => setImmediate(resolve));

      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'return.decide',
          entityType: 'return',
          entityId: returnId,
        }),
      });
    });

    it('refuses a manager who may only read returns', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['returns:read']);
      try {
        await request(app.getHttpServer())
          .post(`${url}/${returnId}/decision`)
          .set('Authorization', `Bearer ${generateAccessToken(testManager.id, 'MANAGER')}`)
          .send({ decision: ReturnDecision.REFUND })
          .expect(403);
        expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
      } finally {
        permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
      }
    });
  });

  describe('POST /api/admin/returns/:returnId/repair-steps (TASK-2045)', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';
    const adminToken = () => `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`;
    const addStep = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(`${url}/${returnId}/repair-steps`)
        .set('Authorization', adminToken())
        .send(body);

    /** A return decided as REPAIR, carrying the given steps. */
    const repairRow = (steps: Array<Record<string, unknown>> = [], overrides = {}) =>
      makeReturnRow({
        status: ReturnStatus.APPROVED,
        decision: ReturnDecision.REPAIR,
        repairEvents: steps,
        ...overrides,
      });

    const stepRow = (step: ReturnRepairStep, extra: Record<string, unknown> = {}) => ({
      id: `repair-${step}`,
      step,
      result: null,
      destination: null,
      ttn: null,
      note: null,
      actorId: testAdmin.id,
      actor: null,
      createdAt: now,
      ...extra,
    });

    beforeEach(() => {
      prismaServiceMock.return.findUnique.mockResolvedValue(repairRow());
      prismaServiceMock.return.updateMany.mockResolvedValue({ count: 1 });
      prismaServiceMock.returnRepairEvent.create.mockResolvedValue({});
      prismaServiceMock.return.findUniqueOrThrow.mockResolvedValue(
        repairRow([stepRow(ReturnRepairStep.ACCEPTED, { note: 'Без пломби' })]),
      );
    });

    it('records the step with its author and answers with the card', async () => {
      const response = await addStep({
        step: ReturnRepairStep.ACCEPTED,
        note: '  Без пломби ',
      }).expect(201);

      expect(response.body.data).toMatchObject({
        id: returnId,
        decision: 'REPAIR',
        repairSteps: [expect.objectContaining({ step: 'ACCEPTED', note: 'Без пломби' })],
      });
      expect(prismaServiceMock.return.updateMany).toHaveBeenCalledWith({
        where: {
          id: returnId,
          decision: ReturnDecision.REPAIR,
          status: { notIn: [ReturnStatus.REJECTED, ReturnStatus.REFUNDED] },
        },
        data: { resolvedAt: expect.any(Date) },
      });
      expect(prismaServiceMock.returnRepairEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          returnId,
          step: ReturnRepairStep.ACCEPTED,
          note: 'Без пломби',
          actorId: testAdmin.id,
        }),
      });
    });

    it('writes an audit row return.addRepairStep keyed by the return', async () => {
      await addStep({ step: ReturnRepairStep.ACCEPTED }).expect(201);
      await new Promise((resolve) => setImmediate(resolve));

      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'return.addRepairStep',
          entityType: 'return',
          entityId: returnId,
        }),
      });
    });

    it('409 RETURN_REPAIR_STEP_INVALID on a return not decided as REPAIR, writing nothing', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(
        repairRow([], { decision: ReturnDecision.REFUND }),
      );

      const response = await addStep({ step: ReturnRepairStep.ACCEPTED }).expect(409);

      expect(response.body.error).toBe('RETURN_REPAIR_STEP_INVALID');
      expect(prismaServiceMock.returnRepairEvent.create).not.toHaveBeenCalled();
    });

    it('409 RETURN_REPAIR_STEP_INVALID for a step out of order', async () => {
      const response = await addStep({ step: ReturnRepairStep.SENT_TO_SERVICE }).expect(409);

      expect(response.body.error).toBe('RETURN_REPAIR_STEP_INVALID');
      expect(prismaServiceMock.returnRepairEvent.create).not.toHaveBeenCalled();
    });

    it('409 RETURN_REPAIR_STEP_INVALID when a double click lands the same step twice', async () => {
      prismaServiceMock.returnRepairEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }),
      );

      const response = await addStep({ step: ReturnRepairStep.ACCEPTED }).expect(409);

      expect(response.body.error).toBe('RETURN_REPAIR_STEP_INVALID');
    });

    it('400 RETURN_REPAIR_RESULT_REQUIRED when the item comes back without an outcome', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(
        repairRow([stepRow(ReturnRepairStep.ACCEPTED), stepRow(ReturnRepairStep.SENT_TO_SERVICE)]),
      );

      const response = await addStep({ step: ReturnRepairStep.RETURNED_FROM_SERVICE }).expect(400);

      expect(response.body.error).toBe('RETURN_REPAIR_RESULT_REQUIRED');
      expect(prismaServiceMock.returnRepairEvent.create).not.toHaveBeenCalled();
    });

    it('400 RETURN_REPAIR_RESULT_NOT_ALLOWED for a result on any other step', async () => {
      const response = await addStep({
        step: ReturnRepairStep.ACCEPTED,
        result: RepairResult.REPAIRED,
      }).expect(400);

      expect(response.body.error).toBe('RETURN_REPAIR_RESULT_NOT_ALLOWED');
    });

    it('400 on a step outside the enum and on an over-long waybill', async () => {
      await addStep({ step: 'IN_REPAIR' }).expect(400);
      await addStep({ step: ReturnRepairStep.ACCEPTED, ttn: '1'.repeat(65) }).expect(400);
      expect(prismaServiceMock.returnRepairEvent.create).not.toHaveBeenCalled();
    });

    it('refuses a manager who may only read returns', async () => {
      permissionRepositoryMock.setGrants(UserRole.MANAGER, ['returns:read']);
      try {
        await request(app.getHttpServer())
          .post(`${url}/${returnId}/repair-steps`)
          .set('Authorization', `Bearer ${generateAccessToken(testManager.id, 'MANAGER')}`)
          .send({ step: ReturnRepairStep.ACCEPTED })
          .expect(403);
        expect(prismaServiceMock.returnRepairEvent.create).not.toHaveBeenCalled();
      } finally {
        permissionRepositoryMock.setGrants(UserRole.MANAGER, []);
      }
    });
  });

  describe('PATCH /api/admin/returns/:returnId — decisions have their own door', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';

    it.each([ReturnStatus.APPROVED, ReturnStatus.REJECTED])(
      '400 RETURN_USE_DECISION_ENDPOINT for status %s, writing nothing',
      async (status) => {
        prismaServiceMock.return.findUnique.mockResolvedValue(makeReturnRow());

        const response = await request(app.getHttpServer())
          .patch(`${url}/${returnId}`)
          .set('Authorization', `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`)
          .send({ status })
          .expect(400);

        expect(response.body.error).toBe('RETURN_USE_DECISION_ENDPOINT');
        expect(prismaServiceMock.return.update).not.toHaveBeenCalled();
      },
    );
  });

  // The notes-only PATCH: since approving and refusing moved to POST /decision,
  // a REQUESTED or REJECTED return has no status step for its notes to ride on.
  describe('PATCH /api/admin/returns/:returnId — notes only', () => {
    const returnId = '550e8400-e29b-41d4-a716-446655440000';
    const patch = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(`${url}/${returnId}`)
        .set('Authorization', `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`)
        .send(body);

    it.each([ReturnStatus.REQUESTED, ReturnStatus.REJECTED, ReturnStatus.REFUNDED])(
      'saves the notes on a %s return without a transition',
      async (status) => {
        prismaServiceMock.return.findUnique.mockResolvedValue(makeReturnRow({ status }));
        prismaServiceMock.return.update.mockResolvedValue(
          makeReturnRow({ status, operatorNotes: 'Дзвонив клієнт' }),
        );

        const response = await patch({ operatorNotes: '  Дзвонив клієнт ' }).expect(200);

        expect(response.body.data).toMatchObject({ status, operatorNotes: 'Дзвонив клієнт' });
        expect(prismaServiceMock.return.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: returnId },
            data: { operatorNotes: 'Дзвонив клієнт' },
          }),
        );
        expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
      },
    );

    it('writes an audit row return.resolve keyed by the return', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(makeReturnRow());
      prismaServiceMock.return.update.mockResolvedValue(makeReturnRow({ operatorNotes: 'x' }));

      await patch({ operatorNotes: 'x' }).expect(200);
      await new Promise((resolve) => setImmediate(resolve));

      expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'return.resolve',
          entityType: 'return',
          entityId: returnId,
        }),
      });
    });

    it('400 RETURN_UPDATE_EMPTY for a body with neither a status nor notes', async () => {
      const response = await patch({}).expect(400);

      expect(response.body.error).toBe('RETURN_UPDATE_EMPTY');
      expect(prismaServiceMock.return.update).not.toHaveBeenCalled();
    });

    it.each([{ restock: true }])(
      '400 RETURN_STATUS_REQUIRED for %o without a status',
      async (body) => {
        const response = await patch({ operatorNotes: 'x', ...body }).expect(400);

        expect(response.body.error).toBe('RETURN_STATUS_REQUIRED');
        expect(prismaServiceMock.return.update).not.toHaveBeenCalled();
        expect(prismaServiceMock.return.updateMany).not.toHaveBeenCalled();
      },
    );
  });

  // ─── Projections (TASK-1963, TASK-2044, TASK-2045) ──────────────────────────
  //
  // The Prisma double hands back a row carrying EVERYTHING — staff accounts,
  // operator notes, repair notes — as if a read had over-fetched. What reaches
  // the wire is then decided by the projection alone, which is the guarantee.

  describe('what the customer and the operator each see', () => {
    const operator = {
      id: 'operator-e2e-9',
      email: 'olena@shop.test',
      firstName: 'Олена',
      lastName: 'Коваль',
    };
    const orderCreatedAt = new Date('2026-06-30T08:00:00.000Z');

    const fullRow = () =>
      makeReturnRow({
        status: ReturnStatus.APPROVED,
        operatorNotes: 'Клієнт сварився',
        createdByUserId: operator.id,
        requestedOutcome: 'REPAIR',
        channel: 'OPERATOR',
        decision: ReturnDecision.REPAIR,
        decisionReason: 'Гарантійний випадок',
        decidedAt: now,
        decidedById: operator.id,
        order: {
          id: '550e8400-e29b-41d4-a716-4466554400ff',
          userId: testCustomer.id,
          guestEmail: null,
          status: 'DELIVERED',
          createdAt: orderCreatedAt,
        },
        createdBy: operator,
        decidedBy: operator,
        decisionEvents: [
          {
            id: 'event-1',
            decision: ReturnDecision.REPAIR,
            reason: 'Гарантійний випадок',
            legacy: false,
            createdAt: now,
            actor: operator,
          },
        ],
        repairEvents: [
          {
            id: 'repair-1',
            step: 'SENT_TO_SERVICE',
            result: null,
            destination: 'СЦ «Ябко»',
            ttn: '20450000000000',
            note: 'Подряпина на корпусі',
            createdAt: now,
            actor: operator,
          },
        ],
      });

    it('GET /api/returns: the decision and repair progress, and not one staff fact', async () => {
      prismaServiceMock.return.findMany.mockResolvedValue([fullRow()]);

      const res = await request(app.getHttpServer())
        .get('/api/returns')
        .set('Authorization', `Bearer ${generateAccessToken(testCustomer.id, 'CUSTOMER')}`)
        .expect(200);

      const [body] = res.body.data;
      expect(body).toMatchObject({
        requestedOutcome: 'REPAIR',
        channel: 'OPERATOR',
        decision: 'REPAIR',
        decisionReason: 'Гарантійний випадок',
        decidedAt: now.toISOString(),
        decisionLegacy: false,
        restockedAt: null,
        repairSteps: [
          {
            step: 'SENT_TO_SERVICE',
            result: null,
            destination: 'СЦ «Ябко»',
            ttn: '20450000000000',
            createdAt: now.toISOString(),
          },
        ],
      });
      for (const key of [
        'operatorNotes',
        'createdByUserId',
        'createdBy',
        'decidedById',
        'decidedBy',
        'decisionHistory',
        'orderCreatedAt',
      ]) {
        expect(body).not.toHaveProperty(key);
      }
      expect(body.repairSteps[0]).not.toHaveProperty('note');
      expect(body.repairSteps[0]).not.toHaveProperty('actor');
      const wire = JSON.stringify(res.body);
      expect(wire).not.toContain(operator.id);
      expect(wire).not.toContain(operator.email);
      expect(wire).not.toContain('Подряпина');
      expect(wire).not.toContain('Клієнт сварився');
    });

    it('GET /api/orders/:id/returns: the same customer projection', async () => {
      prismaServiceMock.order.findFirst.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-4466554400ff',
        userId: testCustomer.id,
        status: 'DELIVERED',
        items: [],
      });
      prismaServiceMock.return.findMany.mockResolvedValue([fullRow()]);

      const res = await request(app.getHttpServer())
        .get('/api/orders/550e8400-e29b-41d4-a716-4466554400ff/returns')
        .set('Authorization', `Bearer ${generateAccessToken(testCustomer.id, 'CUSTOMER')}`)
        .expect(200);

      const wire = JSON.stringify(res.body);
      expect(wire).not.toContain(operator.id);
      expect(wire).not.toContain(operator.email);
      expect(wire).not.toContain('Подряпина');
      expect(res.body.data[0]).not.toHaveProperty('operatorNotes');
    });

    it('GET /api/admin/returns/:id: authors by name, history, repair notes and the purchase date', async () => {
      prismaServiceMock.return.findUnique.mockResolvedValue(fullRow());

      const res = await request(app.getHttpServer())
        .get(`${url}/550e8400-e29b-41d4-a716-446655440000`)
        .set('Authorization', `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`)
        .expect(200);

      const actor = { id: operator.id, name: 'Олена Коваль', email: operator.email };
      expect(res.body.data).toMatchObject({
        operatorNotes: 'Клієнт сварився',
        createdBy: actor,
        decidedBy: actor,
        orderCreatedAt: orderCreatedAt.toISOString(),
        decisionHistory: [
          {
            decision: 'REPAIR',
            reason: 'Гарантійний випадок',
            legacy: false,
            createdAt: now.toISOString(),
            actor,
          },
        ],
        repairSteps: [
          {
            step: 'SENT_TO_SERVICE',
            note: 'Подряпина на корпусі',
            actor,
          },
        ],
      });
    });
  });

  describe('POST — the requested outcome and the door (TASK-1963)', () => {
    const orderId = '550e8400-e29b-41d4-a716-4466554400ff';
    const lineId = '550e8400-e29b-41d4-a716-446655440001';

    it('400 on a requested outcome outside the enum, before anything is read', async () => {
      await request(app.getHttpServer())
        .post(`/api/orders/${orderId}/returns`)
        .set('Authorization', `Bearer ${generateAccessToken(testCustomer.id, 'CUSTOMER')}`)
        .send({ requestedOutcome: 'MONEY_BACK', items: [{ orderItemId: lineId, quantity: 1 }] })
        .expect(400);

      expect(prismaServiceMock.order.findFirst).not.toHaveBeenCalled();
    });

    it('an operator opens it: OPERATOR channel, the outcome stored, the order left alone', async () => {
      prismaServiceMock.order.findFirst.mockResolvedValue({
        id: orderId,
        userId: null,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        items: [{ id: lineId, quantity: 3 }],
      });
      prismaServiceMock.$queryRaw.mockResolvedValue([{ id: orderId }]);
      prismaServiceMock.return.findMany.mockResolvedValue([]);
      prismaServiceMock.return.create.mockResolvedValue(
        makeReturnRow({ requestedOutcome: 'REPLACEMENT', channel: 'OPERATOR' }),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/admin/orders/${orderId}/returns`)
        .set('Authorization', `Bearer ${generateAccessToken(testAdmin.id, 'ADMIN')}`)
        .send({ requestedOutcome: 'REPLACEMENT', items: [{ orderItemId: lineId, quantity: 1 }] })
        .expect(201);

      expect(prismaServiceMock.return.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId,
            requestedOutcome: 'REPLACEMENT',
            channel: 'OPERATOR',
            createdByUserId: testAdmin.id,
          }),
        }),
      );
      expect(res.body.data).toMatchObject({ requestedOutcome: 'REPLACEMENT', channel: 'OPERATOR' });
      expect(prismaServiceMock.order.update).not.toHaveBeenCalled();
      expect(prismaServiceMock.order.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── /api/orders/guest/:token/returns (TASK-1965) ───────────────────────────
  //
  // The guest's door: no session, the token in the path is the credential. The
  // real OrderService resolves it (hash, soft-delete filter, TTL), the real
  // ReturnService + repository run against the Prisma double.

  describe('/api/orders/guest/:token/returns (TASK-1965)', () => {
    const orderId = '550e8400-e29b-41d4-a716-4466554400ff';
    const lineId = '550e8400-e29b-41d4-a716-446655440001';
    const VALID = 'v'.repeat(64);
    const EXPIRED = 'x'.repeat(64);
    const WRONG = 'w'.repeat(64);
    const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');
    const guestUrl = (token: string) => `/api/orders/guest/${token}/returns`;
    const body = { requestedOutcome: 'REFUND', items: [{ orderItemId: lineId, quantity: 1 }] };

    const order = (createdAt: Date) => ({
      id: orderId,
      userId: null,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      createdAt,
      accessTokenIssuedAt: null,
      items: [{ id: lineId, quantity: 3 }],
    });
    const fresh = order(new Date());
    // Older than the 60-day default window, with no re-issue to restart it.
    const stale = order(new Date(Date.now() - 200 * 24 * 60 * 60 * 1000));

    beforeEach(() => {
      prismaServiceMock.order.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string; accessTokenHash?: string } }) => {
          if (where.accessTokenHash === hashOf(VALID)) return fresh;
          if (where.accessTokenHash === hashOf(EXPIRED)) return stale;
          if (where.id === orderId) return fresh;
          return null;
        },
      );
      prismaServiceMock.$queryRaw.mockResolvedValue([{ id: orderId }]);
      prismaServiceMock.return.findMany.mockResolvedValue([]);
      // No shop chat connected: the ping is attempted and skipped.
      prismaServiceMock.notificationBinding.findMany.mockResolvedValue([]);
    });

    it('POST with a valid token: 201, GUEST_LINK, no author, the shop ping attempted', async () => {
      prismaServiceMock.return.create.mockResolvedValue(
        makeReturnRow({
          requestedOutcome: 'REFUND',
          channel: 'GUEST_LINK',
          createdByUserId: null,
          operatorNotes: 'внутрішнє',
        }),
      );

      const res = await request(app.getHttpServer()).post(guestUrl(VALID)).send(body).expect(201);

      expect(prismaServiceMock.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accessTokenHash: hashOf(VALID), deletedAt: null } }),
      );
      expect(prismaServiceMock.return.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId,
            requestedOutcome: 'REFUND',
            channel: 'GUEST_LINK',
            createdByUserId: null,
          }),
        }),
      );
      // The same in-transaction Telegram ping as the customer's own door.
      expect(prismaServiceMock.notificationBinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channel: 'TELEGRAM', audience: 'SHOP' }),
        }),
      );
      expect(res.body.data).toMatchObject({ orderId, channel: 'GUEST_LINK' });
      expect(res.body.data).not.toHaveProperty('operatorNotes');
      expect(res.body.data).not.toHaveProperty('createdByUserId');
    });

    it('GET with a valid token: the customer projection of the order’s returns', async () => {
      prismaServiceMock.return.findMany.mockResolvedValue([
        makeReturnRow({ operatorNotes: 'внутрішнє', createdByUserId: 'operator-e2e-9' }),
      ]);

      const res = await request(app.getHttpServer()).get(guestUrl(VALID)).expect(200);

      const args = prismaServiceMock.return.findMany.mock.calls.at(-1)?.[0] as {
        where: unknown;
      };
      expect(args.where).toEqual({ orderId });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).not.toHaveProperty('operatorNotes');
      expect(JSON.stringify(res.body)).not.toContain('operator-e2e-9');
    });

    it('wrong and expired tokens answer the very same 404 as the guest order read', async () => {
      const wrongPost = await request(app.getHttpServer()).post(guestUrl(WRONG)).send(body);
      const expiredPost = await request(app.getHttpServer()).post(guestUrl(EXPIRED)).send(body);
      const wrongGet = await request(app.getHttpServer()).get(guestUrl(WRONG));
      const expiredGet = await request(app.getHttpServer()).get(guestUrl(EXPIRED));
      const orderRead = await request(app.getHttpServer()).get(`/api/orders/guest/${WRONG}`);

      for (const res of [wrongPost, expiredPost, wrongGet, expiredGet]) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual(orderRead.body);
      }
      expect(orderRead.body).toMatchObject({ statusCode: 404, message: 'Order not found' });
      expect(prismaServiceMock.return.create).not.toHaveBeenCalled();
      expect(prismaServiceMock.return.findMany).not.toHaveBeenCalled();
    });

    it('validates the body before the token is even looked up', async () => {
      await request(app.getHttpServer())
        .post(guestUrl(VALID))
        .send({ items: [{ orderItemId: lineId, quantity: 0 }] })
        .expect(400);

      expect(prismaServiceMock.return.create).not.toHaveBeenCalled();
    });
  });
});
