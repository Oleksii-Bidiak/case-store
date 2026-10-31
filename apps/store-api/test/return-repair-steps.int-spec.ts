import { HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderStatus,
  PaymentStatus,
  RepairResult,
  ReturnDecision,
  ReturnRepairStep,
  ReturnStatus,
  UserRole,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { ReturnRepository } from '../src/order/returns/return.repository';
import { ReturnService } from '../src/order/returns/return.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * Repair steps against a REAL Postgres (TASK-2045).
 *
 * The service checks the order of steps against a read taken outside the write
 * transaction, so two clicks on «Прийнято» both pass it. What stops the second
 * is the unique index on (return_id, step) — a database fact a mocked test can
 * only pretend to have.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('ReturnService.addRepairStep — concurrency and the stored trail (integration)', () => {
  let prisma: PrismaService;
  let service: ReturnService;

  let userId: string;
  let operatorId: string;
  let categoryId: string;
  let productId: string;
  let orderId: string;
  let returnId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        OrderRepository,
        ReturnRepository,
        ReturnService,
        {
          provide: ShopNotifier,
          useValue: { enqueueReturnRequested: jest.fn().mockResolvedValue(0) },
        },
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ReturnService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** A delivered order and a return the operator decided to repair. */
  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);

    const category = await prisma.category.create({
      data: { name: `cat-${suffix}`, slug: `cat-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { name: `prod-${suffix}`, slug: `prod-${suffix}`, price: 100, stock: 5, categoryId },
    });
    productId = product.id;

    const user = await prisma.user.create({
      data: { email: `return-repair-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const operator = await prisma.user.create({
      data: {
        email: `return-repair-op-${suffix}@test.local`,
        passwordHash: 'x',
        role: UserRole.MANAGER,
      },
    });
    operatorId = operator.id;

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 100,
        total: 100,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: 1, price: 100 }] },
      },
      include: { items: true },
    });
    orderId = order.id;

    const repair = await prisma.return.create({
      data: {
        orderId,
        createdByUserId: userId,
        status: ReturnStatus.APPROVED,
        decision: ReturnDecision.REPAIR,
        decidedById: operatorId,
        decidedAt: new Date(),
        resolvedAt: new Date(),
        items: { create: [{ orderItemId: order.items[0].id, quantity: 1 }] },
      },
    });
    returnId = repair.id;
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      // Repair events cascade with their return.
      await prisma.return.deleteMany({ where: { orderId } });
    }
    if (userId) {
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (operatorId) await prisma.user.deleteMany({ where: { id: operatorId } });
    userId = operatorId = productId = categoryId = orderId = returnId = '';
  });

  const accept = () =>
    service.addRepairStep(returnId, operatorId, { step: ReturnRepairStep.ACCEPTED });

  it('lets exactly one of two concurrent identical steps through — the other is a 409', async () => {
    const results = await Promise.allSettled([accept(), accept()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(HttpException);
    expect((rejected[0].reason as HttpException).getStatus()).toBe(409);
    expect((rejected[0].reason as HttpException).getResponse()).toMatchObject({
      error: 'RETURN_REPAIR_STEP_INVALID',
    });
    expect(await prisma.returnRepairEvent.count({ where: { returnId } })).toBe(1);
  });

  it('stores the whole trail in order, with author and details, and leaves the decision alone', async () => {
    await accept();
    await service.addRepairStep(returnId, operatorId, {
      step: ReturnRepairStep.SENT_TO_SERVICE,
      destination: 'СЦ Apple, Київ',
      ttn: '20450000000001',
    });
    const card = await service.addRepairStep(returnId, operatorId, {
      step: ReturnRepairStep.RETURNED_FROM_SERVICE,
      result: RepairResult.UNREPAIRABLE,
      note: 'Плата не підлягає заміні',
    });

    const events = await prisma.returnRepairEvent.findMany({
      where: { returnId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(events.map((e) => e.step)).toEqual([
      ReturnRepairStep.ACCEPTED,
      ReturnRepairStep.SENT_TO_SERVICE,
      ReturnRepairStep.RETURNED_FROM_SERVICE,
    ]);
    expect(events[1]).toMatchObject({ destination: 'СЦ Apple, Київ', ttn: '20450000000001' });
    expect(events[2]).toMatchObject({
      result: RepairResult.UNREPAIRABLE,
      note: 'Плата не підлягає заміні',
      actorId: operatorId,
    });
    expect(card.repairSteps?.map((s) => s.step)).toEqual(events.map((e) => e.step));

    const row = await prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    // UNREPAIRABLE is a fact about the item, not a decision: the operator
    // changes the decision through its own door, with a reason.
    expect(row.decision).toBe(ReturnDecision.REPAIR);
    expect(row.resolvedAt?.getTime()).toBe(events[2].createdAt.getTime());
  });
});
