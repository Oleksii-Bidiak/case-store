import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryMethod,
  MoneyEntryKind,
  OrderHistoryChangeType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnDecision,
  ReturnStatus,
  UserRole,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { PermissionService, type PermissionActor } from '../src/auth/permissions';
import { CacheService } from '../src/cache';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { OrderEntity } from '../src/order/entities/order.entity';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderMoneyService } from '../src/order/order-money.service';
import { OrderRepository } from '../src/order/order.repository';
import { ReturnRepository } from '../src/order/returns/return.repository';
import { ReturnService } from '../src/order/returns/return.service';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * TASK-1969 / TASK-1970 (R2 A4) against a REAL Postgres — the order's REFUNDED
 * is derived from the ledger, and every status change re-derives the balance.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('Order REFUNDED derived from the money ledger (integration, R2 A4)', () => {
  let prisma: PrismaService;
  let money: OrderMoneyService;
  let moneyRepo: OrderMoneyRepository;
  let orders: OrderRepository;
  let returns: ReturnService;

  let categoryId = '';
  let productIds: string[] = [];
  let operatorId = '';
  let orderId = '';
  let lineIds: string[] = [];
  let operator: PermissionActor;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        OrderMoneyRepository,
        OrderMoneyService,
        OrderRepository,
        ReturnRepository,
        ReturnService,
        { provide: PermissionService, useValue: new PermissionService({} as never) },
        { provide: ShopNotifier, useValue: { enqueueReturnRequested: jest.fn() } },
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    money = moduleRef.get(OrderMoneyService);
    moneyRepo = moduleRef.get(OrderMoneyRepository);
    orders = moduleRef.get(OrderRepository);
    returns = moduleRef.get(ReturnService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /**
   * A cash-on-delivery NP order: 1 000 + 500 + 300 ₴ of goods, a 100 ₴ promo,
   * 70 ₴ shipping — total 1 770 ₴, nothing paid yet. Status per test.
   */
  const createOrder = async (status: OrderStatus) => {
    const order = await prisma.order.create({
      data: {
        status,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ON_DELIVERY,
        deliveryMethod: DeliveryMethod.NOVA_POSHTA,
        subtotal: 1800,
        discount: 100,
        shippingCost: 70,
        total: 1770,
        shippingAddress: { city: 'Київ', warehouse: '1' },
      },
    });
    orderId = order.id;
    lineIds = [];
    for (const [index, price] of [1000, 500, 300].entries()) {
      const line = await prisma.orderItem.create({
        data: { orderId, productId: productIds[index], quantity: 1, price },
      });
      lineIds.push(line.id);
    }
  };

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `refund-cat-${suffix}`, slug: `refund-cat-${suffix}` },
    });
    categoryId = category.id;
    productIds = [];
    for (const [index, price] of [1000, 500, 300].entries()) {
      const product = await prisma.product.create({
        data: {
          name: `refund-prod-${index}-${suffix}`,
          slug: `refund-prod-${index}-${suffix}`,
          price,
          stock: 5,
          categoryId,
        },
      });
      productIds.push(product.id);
    }
    const user = await prisma.user.create({
      data: { email: `refund-op-${suffix}@test.local`, passwordHash: 'x', role: UserRole.ADMIN },
    });
    operatorId = user.id;
    operator = {
      id: operatorId,
      email: user.email,
      role: UserRole.ADMIN,
      isOwner: false,
      permissions: new Set(),
    };
  });

  afterEach(async () => {
    if (!prisma) return;
    if (orderId) {
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId } });
      await prisma.return.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: operatorId } });
    orderId = categoryId = operatorId = '';
  });

  const fresh = async () =>
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).updatedAt;

  const orderRow = () =>
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        paidKop: true,
        refundedKop: true,
        returnCreditKop: true,
        balanceKop: true,
        paymentStatus: true,
      },
    });

  const statusRows = () =>
    prisma.orderStatusHistory.findMany({
      where: { orderId, changeType: OrderHistoryChangeType.STATUS },
      orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
      select: { fromStatus: true, toStatus: true, changedBy: true },
    });

  const receiveCod = async () =>
    money.recordReceipt(orderId, operator, {
      kind: MoneyEntryKind.COD_NOVA_POSHTA,
      amountKop: 177_000,
      expectedUpdatedAt: await fresh(),
    });

  /** Lines come back: decided REFUND, goods received. */
  const returnLines = async (indexes: number[]) => {
    const opened = await returns.adminCreateReturn(operatorId, orderId, {
      items: indexes.map((index) => ({ orderItemId: lineIds[index], quantity: 1 })),
    });
    await returns.decideReturn(opened.id, operatorId, { decision: ReturnDecision.REFUND });
    await returns.resolveReturn(opened.id, { status: ReturnStatus.RECEIVED });
    return opened.id;
  };

  const payOut = async (amountKop: number, returnId?: string) =>
    money.recordPayout(orderId, operator, {
      kind: MoneyEntryKind.CASH_REFUND,
      amountKop,
      ...(returnId ? { returnId } : {}),
      reason: 'готівка на точці',
      expectedUpdatedAt: await fresh(),
    });

  it('DELIVERED → all lines returned → paid out → REFUNDED → a reversal sends it back', async () => {
    await createOrder(OrderStatus.DELIVERED);
    await receiveCod();
    const returnId = await returnLines([0, 1, 2]);
    // Goods less the promo — the 70 ₴ shipping is not credited.
    expect((await orderRow()).returnCreditKop).toBe(170_000);

    await payOut(100_000, returnId);
    expect((await orderRow()).status).toBe(OrderStatus.DELIVERED);

    await payOut(70_000, returnId);
    expect(await orderRow()).toEqual({
      status: OrderStatus.REFUNDED,
      paidKop: 177_000,
      refundedKop: 170_000,
      returnCreditKop: 170_000,
      // The shipping the shop kept is not owed back.
      balanceKop: 0,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
    });
    expect(await statusRows()).toEqual([
      { fromStatus: OrderStatus.DELIVERED, toStatus: OrderStatus.REFUNDED, changedBy: operatorId },
    ]);

    const second = await prisma.orderMoneyEntry.findFirstOrThrow({
      where: { orderId, amountKop: 70_000, reversalOfId: null },
    });
    await money.reverseEntry(orderId, second.id, operator, {
      reason: 'Записали двічі',
      expectedUpdatedAt: await fresh(),
    });

    expect(await orderRow()).toMatchObject({
      status: OrderStatus.DELIVERED,
      refundedKop: 100_000,
      balanceKop: -70_000,
    });
    expect((await prisma.return.findUniqueOrThrow({ where: { id: returnId } })).status).toBe(
      ReturnStatus.RECEIVED,
    );
    expect(await statusRows()).toEqual([
      { fromStatus: OrderStatus.DELIVERED, toStatus: OrderStatus.REFUNDED, changedBy: operatorId },
      { fromStatus: OrderStatus.REFUNDED, toStatus: OrderStatus.DELIVERED, changedBy: operatorId },
    ]);
  });

  it('one line not returned keeps the order DELIVERED, payment PARTIALLY_REFUNDED', async () => {
    await createOrder(OrderStatus.DELIVERED);
    await receiveCod();
    const returnId = await returnLines([0, 1]);
    const { returnCreditKop } = await orderRow();
    await payOut(returnCreditKop, returnId);

    expect(await orderRow()).toMatchObject({
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      balanceKop: 0,
    });
    expect(await statusRows()).toEqual([]);
  });

  it('a legacy REFUNDED order (no returns) is kept by a recompute that undid no payout', async () => {
    await createOrder(OrderStatus.DELIVERED);
    await receiveCod();
    // Set by hand before R2: everything paid back, no return behind it.
    await prisma.orderMoneyEntry.create({
      data: {
        orderId,
        direction: 'OUT',
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 177_000,
        legacy: true,
        occurredAt: new Date(),
      },
    });
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        changeType: OrderHistoryChangeType.STATUS,
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.REFUNDED,
      },
    });

    await moneyRepo.transaction(orderId, (tx) => moneyRepo.recompute(tx, orderId, null));

    expect(await orderRow()).toMatchObject({
      status: OrderStatus.REFUNDED,
      paymentStatus: PaymentStatus.REFUNDED,
      balanceKop: 0,
    });

    // …but a reversal of its payout says the money did not all go back.
    const legacyOut = await prisma.orderMoneyEntry.findFirstOrThrow({
      where: { orderId, legacy: true },
    });
    await money.reverseEntry(orderId, legacyOut.id, operator, {
      reason: 'Гроші не повертали',
      expectedUpdatedAt: await fresh(),
    });
    expect(await orderRow()).toMatchObject({
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
      balanceKop: 0,
    });
  });

  it('cancelling a paid order leaves the shop owing it all; a refund without a return settles it', async () => {
    await createOrder(OrderStatus.CONFIRMED);
    await receiveCod();
    expect((await orderRow()).balanceKop).toBe(0);

    await orders.cancelAndRestock(orderId, operatorId);
    expect(await orderRow()).toMatchObject({
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.PAID,
      // «Винні покупцю 1 770 ₴» — recomputed in the cancel's own transaction.
      balanceKop: -177_000,
    });

    await payOut(177_000);
    expect(await orderRow()).toMatchObject({
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      balanceKop: 0,
    });
    const entity = OrderEntity.fromPrisma((await orders.findById(orderId))!);
    expect(entity.refundedAfterCancel).toBe(true);
    expect(entity.status).toBe(OrderStatus.CANCELLED);
  });

  it('reviving a cancelled, still-paid order brings the debt back to 0', async () => {
    await createOrder(OrderStatus.CONFIRMED);
    await receiveCod();
    await orders.cancelAndRestock(orderId, operatorId);
    expect((await orderRow()).balanceKop).toBe(-177_000);

    await orders.reviveAndReserve(orderId, OrderStatus.CONFIRMED, PaymentStatus.PAID, operatorId);
    expect(await orderRow()).toMatchObject({ status: OrderStatus.CONFIRMED, balanceKop: 0 });
  });

  it('a plain status change re-derives the balance (DELIVERED → CANCELLED of an unpaid order)', async () => {
    await createOrder(OrderStatus.DELIVERED);
    await moneyRepo.transaction(orderId, (tx) => moneyRepo.recompute(tx, orderId, null));
    expect((await orderRow()).balanceKop).toBe(177_000);

    await orders.updateStatus(
      orderId,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      PaymentStatus.PENDING,
      operatorId,
    );
    expect(await orderRow()).toMatchObject({ status: OrderStatus.CANCELLED, balanceKop: 0 });
  });
});
