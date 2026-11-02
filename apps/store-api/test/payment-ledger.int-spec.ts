import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { AddonApplicabilityResolver } from '../src/addon-service';
import { CacheService } from '../src/cache';
import { CartService } from '../src/cart';
import { DeliveryService } from '../src/delivery';
import { DiscountService } from '../src/discount';
import { CustomerNotifier } from '../src/notification/customer-notifier.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { NotificationOutboxService } from '../src/notification-outbox/notification-outbox.service';
import { OrderLookupRepository } from '../src/order/order-lookup.repository';
import { OrderErrorCode } from '../src/order/order.errors';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { OrderService } from '../src/order/order.service';
import { PAYMENT_CLOCK } from '../src/payment/payment.clock';
import { PAYMENT_PROVIDER } from '../src/payment/payment.port';
import { PaymentRepository } from '../src/payment/payment.repository';
import { PaymentService } from '../src/payment/payment.service';
import { PaymentOutcome, type PaymentEventInput } from '../src/payment/payment.types';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';
import { UserRepository } from '../src/user';

/**
 * LiqPay money through the order ledger (TASK-1500 / TASK-2047, R2 step A2) —
 * the REAL PaymentService → OrderService → OrderRepository/OrderMoneyRepository
 * chain against a REAL Postgres. Only the provider and the notifiers are doubles.
 *
 * What only a real database proves: the PaymentEvent and ledger unique indexes
 * that make a repeated callback a no-op, the order-row lock that serialises a
 * webhook with a manual receipt (no deadlock) and two refund requests (one
 * wins), and the CHECK `refunded_kop <= paid_kop` never tripping.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('LiqPay money through the ledger (integration, TASK-1500 / TASK-2047)', () => {
  let prisma: PrismaService;
  let payments: PaymentService;
  let orders: OrderService;
  let money: OrderMoneyRepository;
  let paymentRepository: PaymentRepository;

  const provider = {
    key: 'liqpay',
    isConfigured: () => true,
    refund: jest.fn(),
    fetchStatus: jest.fn(),
    parseCallback: jest.fn(),
    createCheckout: jest.fn(),
  };

  const run = randomUUID().slice(0, 8);
  let operatorId = '';
  const orderIds: string[] = [];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        PaymentRepository,
        PaymentService,
        OrderRepository,
        OrderMoneyRepository,
        OrderService,
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: PAYMENT_CLOCK, useValue: { now: () => new Date() } },
        { provide: CartService, useValue: {} },
        { provide: UserRepository, useValue: { findById: jest.fn().mockResolvedValue(null) } },
        { provide: NotificationOutboxService, useValue: {} },
        { provide: DeliveryService, useValue: {} },
        { provide: DiscountService, useValue: {} },
        { provide: AddonApplicabilityResolver, useValue: {} },
        { provide: OrderLookupRepository, useValue: {} },
        { provide: ShopNotifier, useValue: { enqueueNewOrder: jest.fn().mockResolvedValue(0) } },
        { provide: CustomerNotifier, useValue: {} },
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
          useValue: {
            setContext: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    payments = moduleRef.get(PaymentService);
    orders = moduleRef.get(OrderService);
    money = moduleRef.get(OrderMoneyRepository);
    paymentRepository = moduleRef.get(PaymentRepository);
    await prisma.$connect();

    const operator = await prisma.user.create({
      data: { email: `payment-ledger-${run}@test.local`, passwordHash: 'x' },
    });
    operatorId = operator.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (orderIds.length > 0) {
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (operatorId) await prisma.user.deleteMany({ where: { id: operatorId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    provider.refund.mockReset().mockResolvedValue(undefined);
  });

  async function createOrder(
    status: OrderStatus = OrderStatus.PENDING,
    total = 1000,
  ): Promise<string> {
    const order = await prisma.order.create({
      data: {
        status,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ONLINE,
        subtotal: total,
        total,
        shippingAddress: { city: 'Київ' },
        balanceKop: total * 100,
      },
    });
    orderIds.push(order.id);
    return order.id;
  }

  async function createAttempt(orderId: string, amount = 1000): Promise<string> {
    const payment = await prisma.payment.create({
      data: { orderId, provider: 'liqpay', amount, currency: 'UAH' },
    });
    return payment.id;
  }

  const success = (paymentId: string, amount = '1000.00'): PaymentEventInput => ({
    paymentId,
    providerStatus: 'success',
    providerPaymentId: `lp-${paymentId.slice(0, 8)}`,
    outcome: PaymentOutcome.SUCCEEDED,
    amount,
    currency: 'UAH',
    payload: { status: 'success' },
  });

  const reversed = (paymentId: string, amount: string, dedupeKey: string): PaymentEventInput => ({
    paymentId,
    providerStatus: 'reversed',
    providerPaymentId: `lp-${paymentId.slice(0, 8)}`,
    outcome: PaymentOutcome.REFUNDED,
    amount,
    currency: 'UAH',
    payload: { status: 'reversed', amount },
    dedupeKey,
  });

  /** An order paid in full by one LiqPay attempt, DELIVERED. */
  async function paidOrder(): Promise<{ orderId: string; paymentId: string }> {
    const orderId = await createOrder(OrderStatus.PENDING);
    const paymentId = await createAttempt(orderId);
    await payments.applyEvent(success(paymentId));
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED } });
    return { orderId, paymentId };
  }

  /**
   * The one LiqPay refund door (`PROVIDER_REFUND_PORT`): a REQUESTED entry under
   * the order lock, then the provider. No payout guard — these cases pin the
   * provider path, not the operator's rules.
   */
  const refund = (orderId: string, paymentId: string, amountKop: number) =>
    payments.requestLedgerRefund({
      orderId,
      paymentId,
      amountKop,
      actorId: operatorId,
      returnId: null,
      reason: null,
      guard: async () => undefined,
    });

  const failure = (paymentId: string, dedupeKey: string): PaymentEventInput => ({
    paymentId,
    providerStatus: 'failure',
    providerPaymentId: `lp-${paymentId.slice(0, 8)}`,
    outcome: PaymentOutcome.FAILED,
    amount: '1000.00',
    currency: 'UAH',
    payload: { status: 'failure' },
    dedupeKey,
  });

  const entriesOf = (orderId: string) =>
    prisma.orderMoneyEntry.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });

  const totalsOf = (orderId: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        paymentStatus: true,
        paidKop: true,
        refundedKop: true,
        balanceKop: true,
        paidAt: true,
        reservationExpiresAt: true,
      },
    });

  const paymentHistoryOf = (orderId: string) =>
    prisma.orderStatusHistory.findMany({
      where: { orderId, changeType: OrderHistoryChangeType.PAYMENT_STATUS },
      orderBy: { changedAt: 'asc' },
    });

  describe('success callback', () => {
    it('writes ONE IN entry and ONE history row however often it is delivered', async () => {
      const orderId = await createOrder();
      const paymentId = await createAttempt(orderId);

      const first = await payments.applyEvent(success(paymentId));
      const repeat = await payments.applyEvent(success(paymentId));
      // Past the PaymentEvent index too: the order module itself is idempotent.
      const replanned = await orders.applyPaymentEvent(success(paymentId));

      expect(first.applied).toBe(true);
      expect(repeat.applied).toBe(false);
      expect(replanned.applied).toBe(false);
      expect(await entriesOf(orderId)).toEqual([
        expect.objectContaining({
          direction: MoneyDirection.IN,
          kind: MoneyEntryKind.LIQPAY_PAYMENT,
          amountKop: 100_000,
          paymentId,
          providerRef: 'success',
          actorId: null,
        }),
      ]);
      expect(await paymentHistoryOf(orderId)).toHaveLength(1);
      expect(await totalsOf(orderId)).toMatchObject({
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        paidKop: 100_000,
        balanceKop: 0,
        reservationExpiresAt: null,
      });
      expect((await totalsOf(orderId)).paidAt).not.toBeNull();
    });

    it('two successful attempts are two receipts: overpaid, PAID, owed back', async () => {
      const orderId = await createOrder();
      const firstAttempt = await createAttempt(orderId);
      const secondAttempt = await createAttempt(orderId);

      await payments.applyEvent(success(firstAttempt));
      const second = await payments.applyEvent(success(secondAttempt));

      expect(second.applied).toBe(true);
      expect(await entriesOf(orderId)).toHaveLength(2);
      expect(await totalsOf(orderId)).toMatchObject({
        paymentStatus: PaymentStatus.PAID,
        paidKop: 200_000,
        balanceKop: -100_000,
      });
    });

    it('on a CANCELLED order: the money is recorded, the order stays cancelled (TASK-619)', async () => {
      const orderId = await createOrder(OrderStatus.CANCELLED);
      const paymentId = await createAttempt(orderId);

      await payments.applyEvent(success(paymentId));

      expect(await totalsOf(orderId)).toMatchObject({
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.PAID,
        paidKop: 100_000,
        balanceKop: -100_000,
      });
      expect(await paymentHistoryOf(orderId)).toEqual([
        expect.objectContaining({
          toPaymentStatus: PaymentStatus.PAID,
          note: OrderHistoryNote.PAID_AFTER_CANCEL,
        }),
      ]);
    });

    it('races a manual receipt on the same order 20 times without a deadlock', async () => {
      for (let round = 0; round < 20; round += 1) {
        const orderId = await createOrder();
        const paymentId = await createAttempt(orderId);

        const results = await Promise.allSettled([
          payments.applyEvent(success(paymentId)),
          money.transaction(orderId, async (tx) => {
            await money.insertEntry(tx, {
              orderId,
              kind: MoneyEntryKind.BANK_TRANSFER,
              amountKop: 30_000,
              actorId: operatorId,
            });
            await money.recompute(tx, orderId, operatorId);
          }),
        ]);

        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(await entriesOf(orderId)).toHaveLength(2);
        expect(await totalsOf(orderId)).toMatchObject({
          paymentStatus: PaymentStatus.PAID,
          paidKop: 130_000,
          balanceKop: -30_000,
        });
      }
    });
  });

  describe('refund requested by the shop', () => {
    it('REQUESTED → reversed confirms the oldest request; two partials both land', async () => {
      const { orderId, paymentId } = await paidOrder();

      await refund(orderId, paymentId, 40_000);
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 40_000,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      expect(provider.refund).toHaveBeenLastCalledWith({ paymentId, amount: '400.00' });

      await payments.applyEvent(reversed(paymentId, '400.00', 'refund-a'));
      await refund(orderId, paymentId, 60_000);
      expect(provider.refund).toHaveBeenLastCalledWith({ paymentId, amount: '600.00' });
      await payments.applyEvent(reversed(paymentId, '600.00', 'refund-b'));
      // An exact repeat of the second callback changes nothing.
      const repeat = await payments.applyEvent(reversed(paymentId, '600.00', 'refund-b'));

      expect(repeat.applied).toBe(false);
      const outs = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(outs).toEqual([
        expect.objectContaining({
          kind: MoneyEntryKind.LIQPAY_REFUND,
          amountKop: 40_000,
          providerState: MoneyProviderState.CONFIRMED,
          actorId: operatorId,
        }),
        expect.objectContaining({
          kind: MoneyEntryKind.LIQPAY_REFUND,
          amountKop: 60_000,
          providerState: MoneyProviderState.CONFIRMED,
        }),
      ]);
      expect(outs[0].providerRef).not.toBe(outs[1].providerRef);
      // R2 A4 (TASK-1969): everything paid is back, yet no return covers the
      // lines — the ORDER stays DELIVERED; only the payment reads REFUNDED.
      expect(await totalsOf(orderId)).toMatchObject({
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.REFUNDED,
        paidKop: 100_000,
        refundedKop: 100_000,
      });
      const attempt = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(attempt.status).toBe(PaymentAttemptStatus.REFUNDED);
      const events = await prisma.paymentEvent.count({
        where: { paymentId, providerStatus: 'reversed' },
      });
      expect(events).toBe(2);
    });

    it('the reconcile poll list holds an attempt exactly while its refund is REQUESTED', async () => {
      const { orderId, paymentId } = await paidOrder();
      const later = new Date(Date.now() + 60_000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000);
      const polled = async (requestedBefore = later) =>
        (
          await paymentRepository.findWithRequestedRefunds({
            requestedBefore,
            requestedAfter: weekAgo,
            limit: 500,
          })
        ).map((p) => p.id);

      await refund(orderId, paymentId, 10_000);
      expect(await polled()).toContain(paymentId);
      expect(await polled(weekAgo)).not.toContain(paymentId);

      await payments.applyEvent(reversed(paymentId, '100.00', 'poll-1'));
      expect(await polled()).not.toContain(paymentId);
    });

    it('a REQUESTED refund older than the poll window no longer starves newer ones', async () => {
      // ≥ limit stuck requests used to fill every page, oldest first, forever.
      const stuck: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const { orderId, paymentId } = await paidOrder();
        await refund(orderId, paymentId, 10_000);
        stuck.push(paymentId);
      }
      await prisma.orderMoneyEntry.updateMany({
        where: { paymentId: { in: stuck }, kind: MoneyEntryKind.LIQPAY_REFUND },
        data: { createdAt: new Date(Date.now() - 8 * 24 * 3_600_000) },
      });
      const older = await paidOrder();
      await refund(older.orderId, older.paymentId, 10_000);
      await prisma.orderMoneyEntry.updateMany({
        where: { paymentId: older.paymentId, kind: MoneyEntryKind.LIQPAY_REFUND },
        data: { createdAt: new Date(Date.now() - 3_600_000) },
      });
      const fresh = await paidOrder();
      await refund(fresh.orderId, fresh.paymentId, 10_000);

      const page = await paymentRepository.findWithRequestedRefunds({
        requestedBefore: new Date(Date.now() + 60_000),
        requestedAfter: new Date(Date.now() - 7 * 24 * 3_600_000),
        limit: 1,
      });
      const window = await paymentRepository.findWithRequestedRefunds({
        requestedBefore: new Date(Date.now() + 60_000),
        requestedAfter: new Date(Date.now() - 7 * 24 * 3_600_000),
        limit: 500,
      });

      // Newest request first; outside the window nothing is polled (the
      // operator voids those by hand — the count is surfaced in the log).
      expect(page.map((p) => p.id)).toEqual([fresh.paymentId]);
      const ids = window.map((p) => p.id);
      expect(ids.indexOf(fresh.paymentId)).toBeLessThan(ids.indexOf(older.paymentId));
      for (const id of stuck) expect(ids).not.toContain(id);
      expect(
        await paymentRepository.countRequestedRefundsOlderThan(
          new Date(Date.now() - 7 * 24 * 3_600_000),
        ),
      ).toBeGreaterThanOrEqual(stuck.length);
    });

    it('a refund the provider refuses is voided and counts for nothing', async () => {
      const { orderId, paymentId } = await paidOrder();
      provider.refund.mockRejectedValueOnce(new Error('LiqPay refused'));

      await expect(refund(orderId, paymentId, 25_000)).rejects.toThrow('LiqPay refused');

      const [voided] = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(voided.voidedAt).not.toBeNull();
      expect(voided.voidReason).toContain('LiqPay refused');
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 0,
        paymentStatus: PaymentStatus.PAID,
      });
    });

    it('two simultaneous requests over the ceiling: exactly one wins', async () => {
      const { orderId, paymentId } = await paidOrder();

      const results = await Promise.allSettled([
        refund(orderId, paymentId, 60_000),
        refund(orderId, paymentId, 60_000),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        response: { error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID },
      });
      expect(provider.refund).toHaveBeenCalledTimes(1);
      const outs = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(outs).toHaveLength(1);
      expect((await totalsOf(orderId)).refundedKop).toBe(60_000);
    });
  });

  describe('the attempt status follows CONFIRMED refunds only (R2 review)', () => {
    const attemptStatus = async (paymentId: string) =>
      (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status;

    it('a REQUESTED refund does not make the attempt REFUNDED; voiding it leaves it refundable', async () => {
      const { orderId, paymentId } = await paidOrder();
      await refund(orderId, paymentId, 60_000);
      await refund(orderId, paymentId, 40_000);

      await payments.applyEvent(reversed(paymentId, '600.00', 'part-1'));
      // 60 confirmed + 40 still REQUESTED: the provider has not sent 100.
      expect(await attemptStatus(paymentId)).toBe(PaymentAttemptStatus.SUCCEEDED);

      const second = (await entriesOf(orderId)).find(
        (e) => e.amountKop === 40_000 && e.providerState === MoneyProviderState.REQUESTED,
      );
      await orders.voidProviderRefund(orderId, second!.id, 'LiqPay refused', null);

      expect(await attemptStatus(paymentId)).toBe(PaymentAttemptStatus.SUCCEEDED);
      provider.refund.mockClear();
      await refund(orderId, paymentId, 40_000);
      expect(provider.refund).toHaveBeenLastCalledWith({ paymentId, amount: '400.00' });
    });

    it('a void moves an attempt marked REFUNDED too early back to SUCCEEDED', async () => {
      const { orderId, paymentId } = await paidOrder();
      await refund(orderId, paymentId, 60_000);
      await refund(orderId, paymentId, 40_000);
      await payments.applyEvent(reversed(paymentId, '600.00', 'early-1'));
      // The state the pre-review rule left behind (REQUESTED counted as refunded).
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentAttemptStatus.REFUNDED },
      });
      const second = (await entriesOf(orderId)).find(
        (e) => e.amountKop === 40_000 && e.providerState === MoneyProviderState.REQUESTED,
      );

      await orders.voidProviderRefund(orderId, second!.id, 'LiqPay refused', null);

      expect(await attemptStatus(paymentId)).toBe(PaymentAttemptStatus.SUCCEEDED);
    });

    it('both refunds confirmed: the attempt is REFUNDED', async () => {
      const { orderId, paymentId } = await paidOrder();
      await refund(orderId, paymentId, 60_000);
      await refund(orderId, paymentId, 40_000);

      await payments.applyEvent(reversed(paymentId, '600.00', 'both-1'));
      await payments.applyEvent(reversed(paymentId, '400.00', 'both-2'));

      expect(await attemptStatus(paymentId)).toBe(PaymentAttemptStatus.REFUNDED);
    });
  });

  describe('a reversed amount that differs from the request (TASK-2336 mitigation)', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it('is not confirmed: the request stays REQUESTED and an UNMATCHED note is written', async () => {
      const { orderId, paymentId } = await paidOrder();
      await refund(orderId, paymentId, 40_000);

      await payments.applyEvent(reversed(paymentId, '300.00', 'mismatch-1'));

      const [out] = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(out.providerState).toBe(MoneyProviderState.REQUESTED);
      const notes = (await paymentHistoryOf(orderId)).filter(
        (row) => row.note === OrderHistoryNote.PROVIDER_REFUND_UNMATCHED,
      );
      expect(notes).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'payment.refund.unmatched',
          orderId,
          paymentId,
          providerAmountKop: 30_000,
          requestedAmountKop: 40_000,
        }),
        expect.any(String),
      );
      expect(await totalsOf(orderId)).toMatchObject({ refundedKop: 40_000 });
    });

    it('an equal amount still confirms', async () => {
      const { orderId, paymentId } = await paidOrder();
      await refund(orderId, paymentId, 40_000);

      await payments.applyEvent(reversed(paymentId, '400.00', 'match-1'));

      const [out] = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(out.providerState).toBe(MoneyProviderState.CONFIRMED);
    });
  });

  describe('a late failure of an older attempt (R2 review)', () => {
    it('does not mark the order FAILED while a newer attempt is PENDING', async () => {
      const orderId = await createOrder();
      const older = await createAttempt(orderId);
      await prisma.payment.update({
        where: { id: older },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      await createAttempt(orderId);

      await payments.applyEvent(failure(older, 'late-fail-1'));

      expect((await prisma.payment.findUniqueOrThrow({ where: { id: older } })).status).toBe(
        PaymentAttemptStatus.FAILED,
      );
      expect((await totalsOf(orderId)).paymentStatus).toBe(PaymentStatus.PENDING);
    });

    it('the last attempt failing still marks an unpaid order FAILED, with one history row', async () => {
      const orderId = await createOrder();
      const only = await createAttempt(orderId);

      await payments.applyEvent(failure(only, 'fail-1'));

      expect((await totalsOf(orderId)).paymentStatus).toBe(PaymentStatus.FAILED);
      expect(await paymentHistoryOf(orderId)).toEqual([
        expect.objectContaining({
          fromPaymentStatus: PaymentStatus.PENDING,
          toPaymentStatus: PaymentStatus.FAILED,
          changedBy: null,
        }),
      ]);
    });
  });

  describe('a refund the shop never requested (LiqPay cabinet)', () => {
    it('writes no money, one PROVIDER_REFUND_UNMATCHED note per provider event', async () => {
      const { orderId, paymentId } = await paidOrder();

      await payments.applyEvent(reversed(paymentId, '300.00', 'cabinet-1'));
      await payments.applyEvent(reversed(paymentId, '300.00', 'cabinet-1'));

      expect(
        (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT),
      ).toHaveLength(0);
      const notes = (await paymentHistoryOf(orderId)).filter(
        (row) => row.note === OrderHistoryNote.PROVIDER_REFUND_UNMATCHED,
      );
      expect(notes).toEqual([
        expect.objectContaining({
          fromPaymentStatus: PaymentStatus.PAID,
          toPaymentStatus: PaymentStatus.PAID,
          changedBy: null,
        }),
      ]);
      expect(await totalsOf(orderId)).toMatchObject({
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        refundedKop: 0,
      });
    });
  });
});
