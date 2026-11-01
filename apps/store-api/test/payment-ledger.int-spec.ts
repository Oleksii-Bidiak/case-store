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
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { OrderService } from '../src/order/order.service';
import { PAYMENT_CLOCK } from '../src/payment/payment.clock';
import { PaymentErrorCode } from '../src/payment/payment.errors';
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

      await payments.refund(paymentId, '400.00', operatorId);
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 40_000,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      expect(provider.refund).toHaveBeenLastCalledWith({ paymentId, amount: '400.00' });

      await payments.applyEvent(reversed(paymentId, '400.00', 'refund-a'));
      await payments.refund(paymentId, undefined, operatorId);
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
      const { paymentId } = await paidOrder();
      const later = new Date(Date.now() + 60_000);
      const polled = async () =>
        (await paymentRepository.findWithRequestedRefundsOlderThan(later, 500)).map((p) => p.id);

      await payments.refund(paymentId, '100.00', operatorId);
      expect(await polled()).toContain(paymentId);
      expect(
        (await paymentRepository.findWithRequestedRefundsOlderThan(new Date(0), 500)).map(
          (p) => p.id,
        ),
      ).not.toContain(paymentId);

      await payments.applyEvent(reversed(paymentId, '100.00', 'poll-1'));
      expect(await polled()).not.toContain(paymentId);
    });

    it('a refund the provider refuses is voided and counts for nothing', async () => {
      const { orderId, paymentId } = await paidOrder();
      provider.refund.mockRejectedValueOnce(new Error('LiqPay refused'));

      await expect(payments.refund(paymentId, '250.00', operatorId)).rejects.toThrow(
        'LiqPay refused',
      );

      const [refund] = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(refund.voidedAt).not.toBeNull();
      expect(refund.voidReason).toContain('LiqPay refused');
      expect(await totalsOf(orderId)).toMatchObject({
        refundedKop: 0,
        paymentStatus: PaymentStatus.PAID,
      });
    });

    it('two simultaneous requests over the ceiling: exactly one wins', async () => {
      const { orderId, paymentId } = await paidOrder();

      const results = await Promise.allSettled([
        payments.refund(paymentId, '600.00', operatorId),
        payments.refund(paymentId, '600.00', operatorId),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        response: { error: PaymentErrorCode.REFUND_EXCEEDS_BALANCE },
      });
      expect(provider.refund).toHaveBeenCalledTimes(1);
      const outs = (await entriesOf(orderId)).filter((e) => e.direction === MoneyDirection.OUT);
      expect(outs).toHaveLength(1);
      expect((await totalsOf(orderId)).refundedKop).toBe(60_000);
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
