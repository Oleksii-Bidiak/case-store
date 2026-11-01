import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderErrorCode } from '../src/order/order.errors';
import { PrismaService } from '../src/prisma';

/**
 * `OrderMoneyRepository` (TASK-2047 / TASK-951, R2 step A1) against a REAL
 * Postgres: the order-row lock, the ceiling (never more out than in), reversals
 * and the recompute that keeps the four totals and the derived payment status in
 * step with the ledger — with a PAYMENT_STATUS history row on every change, as
 * `applyPaymentOutcome` writes them.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('OrderMoneyRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: OrderMoneyRepository;
  let operatorId: string;
  const orderIds: string[] = [];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, OrderMoneyRepository],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(OrderMoneyRepository);
    await prisma.$connect();

    const operator = await prisma.user.create({
      data: {
        email: `money-repo-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        role: UserRole.MANAGER,
      },
    });
    operatorId = operator.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.orderMoneyEntry.updateMany({
        where: { orderId: { in: orderIds } },
        data: { reversalOfId: null },
      });
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.user.deleteMany({ where: { id: operatorId } });
      await prisma.$disconnect();
    }
  });

  async function createOrder(
    total = 1000,
    status: OrderStatus = OrderStatus.DELIVERED,
  ): Promise<string> {
    const order = await prisma.order.create({
      data: {
        status,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: total,
        total,
        shippingAddress: { city: 'Київ' },
        balanceKop: total * 100,
      },
    });
    orderIds.push(order.id);
    return order.id;
  }

  const receive = (orderId: string, amountKop: number) =>
    repository.transaction(orderId, async (tx) => {
      const entry = await repository.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop,
        actorId: operatorId,
      });
      await repository.recompute(tx, orderId, operatorId);
      return entry;
    });

  const payOut = (orderId: string, amountKop: number) =>
    repository.transaction(orderId, async (tx) => {
      const entry = await repository.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop,
        actorId: operatorId,
        reason: 'Повернення на точці',
      });
      await repository.recompute(tx, orderId, operatorId);
      return entry;
    });

  async function totalsOf(orderId: string) {
    return prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        paidKop: true,
        refundedKop: true,
        returnCreditKop: true,
        balanceKop: true,
        paymentStatus: true,
      },
    });
  }

  async function paymentHistoryOf(orderId: string) {
    return prisma.orderStatusHistory.findMany({
      where: { orderId, changeType: OrderHistoryChangeType.PAYMENT_STATUS },
      orderBy: { changedAt: 'asc' },
      select: { fromPaymentStatus: true, toPaymentStatus: true, changedBy: true },
    });
  }

  describe('lockOrder', () => {
    it('returns the order in kopecks', async () => {
      const orderId = await createOrder(1234.56);

      const locked = await prisma.$transaction((tx) => repository.lockOrder(tx, orderId));

      expect(locked).toMatchObject({
        id: orderId,
        totalKop: 123_456,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PENDING,
      });
    });

    it('404s for an unknown order', async () => {
      await expect(
        prisma.$transaction((tx) => repository.lockOrder(tx, randomUUID())),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('insertEntry + recompute', () => {
    it('a receipt below the total → PARTIALLY_PAID, the rest → PAID, each with a history row', async () => {
      const orderId = await createOrder(1000);

      const first = await receive(orderId, 40_000);
      expect(first).toMatchObject({
        orderId,
        direction: MoneyDirection.IN,
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: 40_000,
        actorId: operatorId,
        legacy: false,
        reversalOfId: null,
      });
      expect(await totalsOf(orderId)).toEqual({
        paidKop: 40_000,
        refundedKop: 0,
        returnCreditKop: 0,
        balanceKop: 60_000,
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
      });

      await receive(orderId, 60_000);
      expect(await totalsOf(orderId)).toMatchObject({
        paidKop: 100_000,
        balanceKop: 0,
        paymentStatus: PaymentStatus.PAID,
      });

      expect(await paymentHistoryOf(orderId)).toEqual([
        {
          fromPaymentStatus: PaymentStatus.PENDING,
          toPaymentStatus: PaymentStatus.PARTIALLY_PAID,
          changedBy: operatorId,
        },
        {
          fromPaymentStatus: PaymentStatus.PARTIALLY_PAID,
          toPaymentStatus: PaymentStatus.PAID,
          changedBy: operatorId,
        },
      ]);
    });

    it('a recompute that changes nothing writes no history row', async () => {
      const orderId = await createOrder(1000);
      await receive(orderId, 100_000);

      await repository.transaction(orderId, (tx) => repository.recompute(tx, orderId, operatorId));

      expect(await paymentHistoryOf(orderId)).toHaveLength(1);
    });

    it('a payout within what came in → PARTIALLY_REFUNDED, the rest → REFUNDED', async () => {
      const orderId = await createOrder(1000);
      await receive(orderId, 100_000);

      await payOut(orderId, 30_000);
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 30_000,
        balanceKop: 30_000,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });

      await payOut(orderId, 70_000);
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 100_000,
        paymentStatus: PaymentStatus.REFUNDED,
      });
    });

    it('refuses a payout above paid − refunded (TASK-951) and writes nothing', async () => {
      const orderId = await createOrder(1000);
      await receive(orderId, 50_000);
      await payOut(orderId, 20_000);

      const refused = payOut(orderId, 30_001);

      await expect(refused).rejects.toBeInstanceOf(ConflictException);
      await expect(refused).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID },
      });
      expect(await prisma.orderMoneyEntry.count({ where: { orderId } })).toBe(2);
      expect(await totalsOf(orderId)).toMatchObject({ paidKop: 50_000, refundedKop: 20_000 });
    });

    it('refuses a non-positive or fractional amount', async () => {
      const orderId = await createOrder(1000);

      await expect(receive(orderId, 0)).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_ENTRY_INVALID },
      });
      await expect(receive(orderId, 10.5)).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_ENTRY_INVALID },
      });
    });

    it('a cancelled order owes nothing: money kept on it is owed back', async () => {
      const orderId = await createOrder(1000, OrderStatus.CANCELLED);
      await receive(orderId, 100_000);

      expect(await totalsOf(orderId)).toMatchObject({ balanceKop: -100_000 });
    });

    it('a failed last attempt reads FAILED while nothing is paid', async () => {
      const orderId = await createOrder(1000);
      await prisma.payment.create({
        data: { orderId, provider: 'liqpay', amount: 1000, status: 'FAILED' },
      });

      await repository.transaction(orderId, (tx) => repository.recompute(tx, orderId, null));

      expect((await totalsOf(orderId)).paymentStatus).toBe(PaymentStatus.FAILED);
      await prisma.payment.deleteMany({ where: { orderId } });
    });
  });

  describe('reverseEntry', () => {
    it('cancels a receipt: same amount, back to PENDING, reason kept', async () => {
      const orderId = await createOrder(1000);
      const receipt = await receive(orderId, 100_000);

      const reversal = await repository.transaction(orderId, async (tx) => {
        const row = await repository.reverseEntry(tx, {
          orderId,
          entryId: receipt.id,
          actorId: operatorId,
          reason: 'Помилково записано',
        });
        await repository.recompute(tx, orderId, operatorId);
        return row;
      });

      expect(reversal).toMatchObject({
        direction: MoneyDirection.IN,
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: 100_000,
        reversalOfId: receipt.id,
        reason: 'Помилково записано',
        actorId: operatorId,
      });
      expect(await totalsOf(orderId)).toMatchObject({
        paidKop: 0,
        balanceKop: 100_000,
        paymentStatus: PaymentStatus.PENDING,
      });
    });

    const reverse = (orderId: string, entryId: string, reason = 'Причина') =>
      repository.transaction(orderId, (tx) =>
        repository.reverseEntry(tx, { orderId, entryId, actorId: operatorId, reason }),
      );

    it('refuses a second reversal, a reversal of a reversal, and a blank reason', async () => {
      const orderId = await createOrder(1000);
      const receipt = await receive(orderId, 10_000);
      const reversal = await reverse(orderId, receipt.id);

      await expect(reverse(orderId, receipt.id)).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_REVERSAL_REFUSED },
      });
      await expect(reverse(orderId, reversal.id)).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_REVERSAL_REFUSED },
      });
      const other = await receive(orderId, 5_000);
      await expect(reverse(orderId, other.id, '   ')).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_ENTRY_INVALID },
      });
    });

    it('refuses a LiqPay entry', async () => {
      const orderId = await createOrder(1000);
      const liqpay = await repository.transaction(orderId, (tx) =>
        repository.insertEntry(tx, {
          orderId,
          kind: MoneyEntryKind.LIQPAY_PAYMENT,
          amountKop: 100_000,
          providerRef: 'success',
        }),
      );

      await expect(reverse(orderId, liqpay.id)).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_REVERSAL_REFUSED },
      });
    });

    it('refuses to reverse a receipt that money already paid back depends on', async () => {
      const orderId = await createOrder(1000);
      const receipt = await receive(orderId, 100_000);
      await payOut(orderId, 10_000);

      await expect(reverse(orderId, receipt.id)).rejects.toMatchObject({
        response: { error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID },
      });
    });

    it('404s for an entry of another order', async () => {
      const orderId = await createOrder(1000);
      const otherOrderId = await createOrder(1000);
      const receipt = await receive(otherOrderId, 10_000);

      await expect(reverse(orderId, receipt.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── TASK-1500 / TASK-2047, R2 step A2: the LiqPay path writes through here ──
  describe('LiqPay entries', () => {
    async function createPayment(orderId: string, amount = 1000): Promise<string> {
      const payment = await prisma.payment.create({
        data: { orderId, provider: 'liqpay', amount, status: 'SUCCEEDED' },
      });
      return payment.id;
    }

    const liqpayIn = (orderId: string, paymentId: string, amountKop = 100_000) =>
      repository.transaction(orderId, async (tx) => {
        const entry = await repository.insertEntry(tx, {
          orderId,
          kind: MoneyEntryKind.LIQPAY_PAYMENT,
          amountKop,
          paymentId,
          providerRef: 'success',
        });
        await repository.recompute(tx, orderId, null);
        return entry;
      });

    const requestRefund = (orderId: string, paymentId: string, amountKop: number) =>
      repository.transaction(orderId, async (tx) => {
        const entry = await repository.insertEntry(tx, {
          orderId,
          kind: MoneyEntryKind.LIQPAY_REFUND,
          amountKop,
          paymentId,
          providerRef: randomUUID(),
          providerState: MoneyProviderState.REQUESTED,
          actorId: operatorId,
        });
        await repository.recompute(tx, orderId, operatorId);
        return entry;
      });

    it('findProviderEntry finds the attempt receipt by its provider ref', async () => {
      const orderId = await createOrder(1000);
      const paymentId = await createPayment(orderId);
      const receipt = await liqpayIn(orderId, paymentId);

      const found = await prisma.$transaction((tx) =>
        repository.findProviderEntry(tx, paymentId, 'success'),
      );
      const missing = await prisma.$transaction((tx) =>
        repository.findProviderEntry(tx, paymentId, 'other'),
      );

      expect(found?.id).toBe(receipt.id);
      expect(missing).toBeNull();
    });

    it('paymentProviderTotals counts REQUESTED refunds and skips voided ones', async () => {
      const orderId = await createOrder(1000);
      const paymentId = await createPayment(orderId);
      await liqpayIn(orderId, paymentId);
      await requestRefund(orderId, paymentId, 30_000);
      const voided = await requestRefund(orderId, paymentId, 20_000);
      await repository.transaction(orderId, (tx) =>
        repository.voidEntry(tx, voided.id, 'LiqPay refused'),
      );

      const totals = await prisma.$transaction((tx) =>
        repository.paymentProviderTotals(tx, paymentId),
      );

      // The REQUESTED 300 counts against the ceiling, but nothing is CONFIRMED yet.
      expect(totals).toEqual({ inKop: 100_000, refundedKop: 30_000, confirmedRefundedKop: 0 });
    });

    it('a REQUESTED refund counts as refunded at once; voiding it gives it back', async () => {
      const orderId = await createOrder(1000);
      const paymentId = await createPayment(orderId);
      await liqpayIn(orderId, paymentId);
      const refund = await requestRefund(orderId, paymentId, 40_000);

      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 40_000,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });

      const voidedNow = await repository.transaction(orderId, async (tx) => {
        const done = await repository.voidEntry(tx, refund.id, 'LiqPay refused');
        await repository.recompute(tx, orderId, null);
        return done;
      });
      const voidedAgain = await repository.transaction(orderId, (tx) =>
        repository.voidEntry(tx, refund.id, 'again'),
      );

      expect(voidedNow).toBe(true);
      expect(voidedAgain).toBe(false);
      const row = await prisma.orderMoneyEntry.findUniqueOrThrow({ where: { id: refund.id } });
      expect(row.voidedAt).not.toBeNull();
      expect(row.voidReason).toBe('LiqPay refused');
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 0,
        paymentStatus: PaymentStatus.PAID,
      });
    });

    it('confirmOldestRequestedRefund confirms the oldest live request, once', async () => {
      const orderId = await createOrder(1000);
      const paymentId = await createPayment(orderId);
      await liqpayIn(orderId, paymentId);
      const first = await requestRefund(orderId, paymentId, 10_000);
      const second = await requestRefund(orderId, paymentId, 20_000);

      const confirm = () =>
        repository.transaction(orderId, (tx) =>
          repository.confirmOldestRequestedRefund(tx, paymentId),
        );

      expect((await confirm())?.id).toBe(first.id);
      expect((await confirm())?.id).toBe(second.id);
      expect(await confirm()).toBeNull();
      const states = await prisma.orderMoneyEntry.findMany({
        where: { id: { in: [first.id, second.id] } },
        select: { providerState: true },
      });
      expect(states.map((s) => s.providerState)).toEqual([
        MoneyProviderState.CONFIRMED,
        MoneyProviderState.CONFIRMED,
      ]);
    });

    it('recompute writes the given note on the history row it adds', async () => {
      const orderId = await createOrder(1000, OrderStatus.CANCELLED);
      const paymentId = await createPayment(orderId);
      await repository.transaction(orderId, async (tx) => {
        await repository.insertEntry(tx, {
          orderId,
          kind: MoneyEntryKind.LIQPAY_PAYMENT,
          amountKop: 100_000,
          paymentId,
          providerRef: 'success',
        });
        await repository.recompute(tx, orderId, null, {
          note: OrderHistoryNote.PAID_AFTER_CANCEL,
        });
      });

      const rows = await prisma.orderStatusHistory.findMany({
        where: { orderId, changeType: OrderHistoryChangeType.PAYMENT_STATUS },
      });
      expect(rows).toEqual([
        expect.objectContaining({
          fromPaymentStatus: PaymentStatus.PENDING,
          toPaymentStatus: PaymentStatus.PAID,
          note: OrderHistoryNote.PAID_AFTER_CANCEL,
        }),
      ]);
    });
  });

  describe('recompute — legacy refund label (LEGACY_MONEY_UNKNOWN)', () => {
    it('keeps PARTIALLY_REFUNDED on a legacy order with no money out', async () => {
      const orderId = await createOrder(1000);
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.PARTIALLY_REFUNDED },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.PAYMENT_STATUS,
          fromPaymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
          toPaymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
          note: OrderHistoryNote.LEGACY_MONEY_UNKNOWN,
        },
      });

      await receive(orderId, 100_000);

      expect((await totalsOf(orderId)).paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(await paymentHistoryOf(orderId)).toHaveLength(1);
    });

    it('relabels it from the ledger once a refund is recorded', async () => {
      const orderId = await createOrder(1000);
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.PARTIALLY_REFUNDED },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.PAYMENT_STATUS,
          fromPaymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
          toPaymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
          note: OrderHistoryNote.LEGACY_MONEY_UNKNOWN,
        },
      });
      await receive(orderId, 100_000);

      await payOut(orderId, 100_000);

      expect((await totalsOf(orderId)).paymentStatus).toBe(PaymentStatus.REFUNDED);
    });
  });
});
