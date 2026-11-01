import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderStatus,
  PaymentStatus,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  UserRole,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { ReturnRepository } from '../src/order/returns/return.repository';
import { ReturnService } from '../src/order/returns/return.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * The two projections of a return against a REAL Postgres (TASK-1963, TASK-2044,
 * TASK-2045): the repository's includes are only proven by a database that
 * knows the relation names, and "the operator door leaves the order alone" is
 * only proven by reading the order row back.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('Return projections and the operator door (integration)', () => {
  let prisma: PrismaService;
  let service: ReturnService;

  let customerId: string;
  let operatorId: string;
  let categoryId: string;
  let productId: string;
  let orderId: string;
  let orderItemId: string;
  let orderCreatedAt: Date;

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
        OrderMoneyRepository,
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

  /** A delivered, paid order for two units, its customer and an operator. */
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

    const customer = await prisma.user.create({
      data: {
        email: `return-proj-${suffix}@test.local`,
        passwordHash: 'x',
        firstName: 'Іван',
        lastName: 'Покупець',
      },
    });
    customerId = customer.id;

    const operator = await prisma.user.create({
      data: {
        email: `return-proj-op-${suffix}@test.local`,
        passwordHash: 'x',
        firstName: 'Олена',
        role: UserRole.MANAGER,
      },
    });
    operatorId = operator.id;

    const order = await prisma.order.create({
      data: {
        userId: customerId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 200,
        total: 200,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: 2, price: 100 }] },
      },
      include: { items: true },
    });
    orderId = order.id;
    orderItemId = order.items[0].id;
    orderCreatedAt = order.createdAt;
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      // Decision and repair events cascade with their return.
      await prisma.return.deleteMany({ where: { orderId } });
    }
    if (customerId) {
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId: customerId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId: customerId } } });
      await prisma.order.deleteMany({ where: { userId: customerId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (customerId) await prisma.user.deleteMany({ where: { id: customerId } });
    if (operatorId) await prisma.user.deleteMany({ where: { id: operatorId } });
    customerId = operatorId = productId = categoryId = orderId = orderItemId = '';
  });

  const items = () => [{ orderItemId, quantity: 1 }];

  it('the operator door stores OPERATOR and the outcome, and never touches the order', async () => {
    const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    const created = await service.adminCreateReturn(operatorId, orderId, {
      requestedOutcome: ReturnOutcome.REPAIR,
      items: items(),
    });

    const row = await prisma.return.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      channel: ReturnChannel.OPERATOR,
      requestedOutcome: ReturnOutcome.REPAIR,
      createdByUserId: operatorId,
    });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.status).toBe(before.status);
    expect(after.paymentStatus).toBe(before.paymentStatus);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await prisma.orderStatusHistory.count({ where: { orderId } })).toBe(0);
    // The operator sees whose hand it was, by name.
    expect(created.createdBy).toEqual({
      id: operatorId,
      name: 'Олена',
      email: expect.stringContaining('return-proj-op-'),
    });
  });

  it('the customer door stores ACCOUNT', async () => {
    const created = await service.createReturn(customerId, orderId, {
      requestedOutcome: ReturnOutcome.REPLACEMENT,
      items: items(),
    });

    const row = await prisma.return.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.channel).toBe(ReturnChannel.ACCOUNT);
    expect(row.requestedOutcome).toBe(ReturnOutcome.REPLACEMENT);
    expect(created).toMatchObject({ channel: 'ACCOUNT', requestedOutcome: 'REPLACEMENT' });
    expect(created).not.toHaveProperty('createdBy');
  });

  describe('a return with a decision and a repair step', () => {
    let returnId: string;

    beforeEach(async () => {
      const created = await service.createReturn(customerId, orderId, {
        requestedOutcome: ReturnOutcome.REPAIR,
        items: items(),
      });
      returnId = created.id;
      await service.decideReturn(returnId, operatorId, { decision: ReturnDecision.REPAIR });
      await prisma.returnRepairEvent.create({
        data: {
          returnId,
          step: ReturnRepairStep.SENT_TO_SERVICE,
          destination: 'СЦ',
          ttn: '20450000000000',
          note: 'Подряпина до ремонту',
          actorId: operatorId,
        },
      });
    });

    it('the operator card carries authors, history, repair notes and the purchase date', async () => {
      const card = await service.adminGetReturn(returnId);

      const customerActor = {
        id: customerId,
        name: 'Іван Покупець',
        email: expect.stringContaining('return-proj-'),
      };
      const operatorActor = {
        id: operatorId,
        name: 'Олена',
        email: expect.stringContaining('return-proj-op-'),
      };
      expect(card.createdBy).toEqual(customerActor);
      expect(card.decidedBy).toEqual(operatorActor);
      expect(card.orderCreatedAt).toEqual(orderCreatedAt);
      expect(card.decisionHistory).toEqual([
        {
          decision: ReturnDecision.REPAIR,
          reason: null,
          legacy: false,
          createdAt: expect.any(Date),
          actor: operatorActor,
        },
      ]);
      expect(card.repairSteps).toEqual([
        {
          step: ReturnRepairStep.SENT_TO_SERVICE,
          result: null,
          destination: 'СЦ',
          ttn: '20450000000000',
          note: 'Подряпина до ремонту',
          createdAt: expect.any(Date),
          actor: operatorActor,
        },
      ]);
    });

    it('the queue carries the authors but no history', async () => {
      const page = await service.adminGetReturns({ search: returnId.slice(0, 8) });

      const row = page.items.find((item) => item.id === returnId);
      expect(row?.createdBy?.id).toBe(customerId);
      expect(row?.decidedBy?.id).toBe(operatorId);
      expect(row?.orderCreatedAt).toEqual(orderCreatedAt);
      expect(row).not.toHaveProperty('decisionHistory');
    });

    it("the customer's list shows the decision and the repair step, and nothing of staff", async () => {
      const [mine] = await service.getMyReturns(customerId);

      expect(mine).toMatchObject({
        id: returnId,
        requestedOutcome: ReturnOutcome.REPAIR,
        channel: ReturnChannel.ACCOUNT,
        decision: ReturnDecision.REPAIR,
        decisionLegacy: false,
      });
      expect(mine.repairSteps).toEqual([
        {
          step: ReturnRepairStep.SENT_TO_SERVICE,
          result: null,
          destination: 'СЦ',
          ttn: '20450000000000',
          createdAt: expect.any(Date),
        },
      ]);
      const wire = JSON.stringify(mine);
      expect(wire).not.toContain(operatorId);
      expect(wire).not.toContain('Подряпина');
      expect(mine).not.toHaveProperty('decidedById');
      expect(mine).not.toHaveProperty('createdBy');
    });
  });
});
