import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
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
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderMoneyService } from '../src/order/order-money.service';
import { OrderErrorCode } from '../src/order/order.errors';
import { OrderRepository } from '../src/order/order.repository';
import { ReturnRepository } from '../src/order/returns/return.repository';
import { ReturnService } from '../src/order/returns/return.service';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * R2 A3 against a REAL Postgres — the operator's money door with returns
 * (TASK-2046 / TASK-1968 / TASK-951).
 *
 * The full story the audit could not tell (AD-RET-17 «Борг 2 297 ₴» next to
 * «Частково повернуто 100 з 2 397»): a cash-on-delivery order, one of three
 * lines returned under a promo, «до повернення» computed to the kopeck, paid
 * out in two parts, the return REFUNDED while the ORDER stays partially
 * refunded with nothing owed either way — and a reversal that sends the return
 * back and leaves the shop owing the customer. Plus the two races the order
 * lock exists for.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('Order money — payouts on returns (integration, R2 A3)', () => {
  let prisma: PrismaService;
  let money: OrderMoneyService;
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
        // An ADMIN actor passes every key; the repository behind it is unused.
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
    returns = moduleRef.get(ReturnService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /**
   * A delivered cash-on-delivery NP order: 1 000 + 500 + 300 ₴ of goods, a
   * 100 ₴ promo, total 1 700 ₴ — nothing paid yet.
   */
  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `money-cat-${suffix}`, slug: `money-cat-${suffix}` },
    });
    categoryId = category.id;
    const prices = [1000, 500, 300];
    productIds = [];
    for (const [index, price] of prices.entries()) {
      const product = await prisma.product.create({
        data: {
          name: `money-prod-${index}-${suffix}`,
          slug: `money-prod-${index}-${suffix}`,
          price,
          stock: 5,
          categoryId,
        },
      });
      productIds.push(product.id);
    }
    const user = await prisma.user.create({
      data: { email: `money-op-${suffix}@test.local`, passwordHash: 'x', role: UserRole.ADMIN },
    });
    operatorId = user.id;
    operator = {
      id: operatorId,
      email: user.email,
      role: UserRole.ADMIN,
      isOwner: false,
      permissions: new Set(),
    };

    const order = await prisma.order.create({
      data: {
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ON_DELIVERY,
        deliveryMethod: DeliveryMethod.NOVA_POSHTA,
        subtotal: 1800,
        discount: 100,
        shippingCost: 0,
        total: 1700,
        shippingAddress: { city: 'Київ', warehouse: '1' },
      },
    });
    orderId = order.id;
    // One by one, so `(createdAt, id)` — the credit's line order — is the price order.
    lineIds = [];
    for (const [index, price] of prices.entries()) {
      const line = await prisma.orderItem.create({
        data: { orderId, productId: productIds[index], quantity: 1, price },
      });
      lineIds.push(line.id);
    }
  });

  afterEach(async () => {
    if (!prisma || !orderId) return;
    await prisma.orderMoneyEntry.deleteMany({ where: { orderId } });
    await prisma.return.deleteMany({ where: { orderId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: operatorId } });
    orderId = categoryId = operatorId = '';
  });

  const fresh = async () =>
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).updatedAt;

  const orderMoney = () =>
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        paidKop: true,
        refundedKop: true,
        returnCreditKop: true,
        balanceKop: true,
        paymentStatus: true,
      },
    });

  const receiveCod = async () =>
    money.recordReceipt(orderId, operator, {
      kind: MoneyEntryKind.COD_NOVA_POSHTA,
      amountKop: 170_000,
      expectedUpdatedAt: await fresh(),
    });

  /** The middle line (500 ₴) comes back: decided REFUND, goods received. */
  const returnMiddleLine = async () => {
    const opened = await returns.adminCreateReturn(operatorId, orderId, {
      items: [{ orderItemId: lineIds[1], quantity: 1 }],
    });
    await returns.decideReturn(opened.id, operatorId, { decision: ReturnDecision.REFUND });
    await returns.resolveReturn(opened.id, { status: ReturnStatus.RECEIVED });
    return opened.id;
  };

  const payOut = async (returnId: string, amountKop: number, at?: Date) =>
    money.recordPayout(orderId, operator, {
      kind: MoneyEntryKind.CASH_REFUND,
      amountKop,
      returnId,
      reason: 'готівка на точці',
      expectedUpdatedAt: at ?? (await fresh()),
    });

  const returnRow = (returnId: string) =>
    prisma.return.findUniqueOrThrow({ where: { id: returnId } });

  it('COD received → 1 of 3 lines returned under a promo → paid out in two parts → reversed', async () => {
    await receiveCod();
    expect(await orderMoney()).toMatchObject({
      paidKop: 170_000,
      balanceKop: 0,
      paymentStatus: PaymentStatus.PAID,
    });

    const returnId = await returnMiddleLine();
    // 500 ₴ less its share of the 100 ₴ promo, largest remainder: 500 − 27,78.
    expect((await returnRow(returnId)).creditKop).toBe(47_222);
    expect(await orderMoney()).toMatchObject({ returnCreditKop: 47_222, balanceKop: -47_222 });

    // First part: the order is partially refunded, the return still owed.
    await payOut(returnId, 20_000);
    expect(await orderMoney()).toMatchObject({
      refundedKop: 20_000,
      balanceKop: -27_222,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
    });
    expect((await returnRow(returnId)).status).toBe(ReturnStatus.RECEIVED);

    // Second part covers the credit: the return is REFUNDED, the order owes
    // nothing either way — and stays PARTIALLY_REFUNDED (only a part came back).
    const view = await payOut(returnId, 27_222);
    expect((await returnRow(returnId)).status).toBe(ReturnStatus.REFUNDED);
    expect(await orderMoney()).toEqual({
      paidKop: 170_000,
      refundedKop: 47_222,
      returnCreditKop: 47_222,
      balanceKop: 0,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
    });
    expect(view.returns).toEqual([
      expect.objectContaining({ returnId, creditKop: 47_222, paidOutKop: 47_222, owedKop: 0 }),
    ]);

    // A payout recorded by mistake is reversed with a reason: the return goes
    // back to RECEIVED and the shop owes the customer again («Винні покупцю»).
    const first = await prisma.orderMoneyEntry.findFirstOrThrow({
      where: { orderId, returnId, amountKop: 20_000, reversalOfId: null },
    });
    const afterReversal = await money.reverseEntry(orderId, first.id, operator, {
      reason: 'Видали двічі — повернули в касу',
      expectedUpdatedAt: await fresh(),
    });

    expect((await returnRow(returnId)).status).toBe(ReturnStatus.RECEIVED);
    const after = await orderMoney();
    expect(after).toMatchObject({ refundedKop: 27_222, balanceKop: -20_000 });
    expect(after.balanceKop).toBeLessThan(0);
    expect(afterReversal.entries.find((e) => e.id === first.id)?.reversedById).toEqual(
      expect.any(String),
    );
  });

  it('on an unpaid order the goods come back but no money can go out', async () => {
    const returnId = await returnMiddleLine();
    expect((await returnRow(returnId)).status).toBe(ReturnStatus.RECEIVED);

    const caught = await payOut(returnId, 1).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      error: OrderErrorCode.MONEY_NOTHING_PAID,
    });
  });

  it('a REPAIR instead of the refund is refused once money went out on the return', async () => {
    await receiveCod();
    const returnId = await returnMiddleLine();
    await payOut(returnId, 10_000);

    const caught = await returns
      .decideReturn(returnId, operatorId, { decision: ReturnDecision.REPAIR, reason: 'Ремонт' })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      error: 'RETURN_REFUND_RECORDED',
    });
  });

  it('two concurrent payouts on one return over its credit — exactly one lands', async () => {
    await receiveCod();
    const returnId = await returnMiddleLine();
    const at = await fresh();

    const results = await Promise.allSettled([
      payOut(returnId, 30_000, at),
      payOut(returnId, 30_000, at),
    ]);

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    // The loser waited on the order lock, then saw the winner: either its
    // screen is stale or the credit is spent — never a second payout.
    expect([OrderErrorCode.STALE, OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID]).toContain(
      (rejected[0].reason as ConflictException).getResponse()['error' as never],
    );
    const paidOut = await prisma.orderMoneyEntry.aggregate({
      where: { returnId, direction: MoneyDirection.OUT },
      _sum: { amountKop: true },
    });
    expect(paidOut._sum.amountKop).toBe(30_000);
    expect((await orderMoney()).refundedKop).toBe(30_000);
  });

  it('a payout racing a reversal — one wins, totals and the return stay consistent', async () => {
    await receiveCod();
    const returnId = await returnMiddleLine();
    await payOut(returnId, 20_000);
    const first = await prisma.orderMoneyEntry.findFirstOrThrow({
      where: { orderId, returnId, reversalOfId: null },
    });
    const at = await fresh();

    const results = await Promise.allSettled([
      payOut(returnId, 27_222, at),
      money.reverseEntry(orderId, first.id, operator, { reason: 'помилка', expectedUpdatedAt: at }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const ledger = await prisma.orderMoneyEntry.findMany({ where: { orderId } });
    const signed = (direction: MoneyDirection) =>
      ledger
        .filter((e) => e.direction === direction && e.voidedAt === null)
        .reduce((sum, e) => sum + (e.reversalOfId ? -e.amountKop : e.amountKop), 0);
    const totals = await orderMoney();
    expect(totals.paidKop).toBe(signed(MoneyDirection.IN));
    expect(totals.refundedKop).toBe(signed(MoneyDirection.OUT));
    // Payout won → 47 222 out, REFUNDED; reversal won → 0 out, RECEIVED.
    const row = await returnRow(returnId);
    expect(row.status).toBe(
      totals.refundedKop >= 47_222 ? ReturnStatus.REFUNDED : ReturnStatus.RECEIVED,
    );
  });

  it('a lowered credit with a reason recomputes the balance; above the computed value is refused', async () => {
    await receiveCod();
    const returnId = await returnMiddleLine();

    await returns.reduceReturnCredit(returnId, operatorId, {
      creditKop: 40_000,
      reason: 'Без чохла з комплекту',
    });
    expect(await returnRow(returnId)).toMatchObject({
      creditKop: 40_000,
      creditReason: 'Без чохла з комплекту',
    });
    expect(await orderMoney()).toMatchObject({ returnCreditKop: 40_000, balanceKop: -40_000 });

    const caught = await returns
      .reduceReturnCredit(returnId, operatorId, { creditKop: 47_223, reason: 'x' })
      .catch((e: unknown) => e);
    expect((caught as { getResponse(): unknown }).getResponse()).toMatchObject({
      error: 'RETURN_CREDIT_ABOVE_COMPUTED',
    });
  });
});
